
import { mkel, shuffle, isInStandaloneMode } from './util.js'

const OBJECT_META = Symbol('_object')

function serialise (o) {
  if (o === null) {
    return null
  }

  let t = typeof o
  if (t !== 'object' && t !== 'function') {
    return o
  }

  if (o.nodeType > 0) {
    return null
  }

  let j = {}
  if (o[OBJECT_META]) {
    j._type = o[OBJECT_META].type
  }
  if (o.serialise) {
    o = o.serialise()
  }
  for (let f in o) {
    j[f] = serialise(o[f])
  }
  return j
}

function new_object (state, fs, api, type) {
  type = type || '?'
  let o = {}

  let ms = {}
  for (let f in fs) {
    let m = fs[f].bind(ms)
    ms[f] = m
  }

  for (let f in api) {
    // let spec = pub[m]
    let m = fs[f].bind(ms, state)
    o[f] = m
  }

  state[OBJECT_META] = { type }

  if (!o['serialise']) {
    o['serialise'] = function () {
      return state
    }
  }

  o['toJSON'] = function () {
    return JSON.stringify(serialise(this))
  }.bind(o)

  return Object.seal(o)
}

const FIELD_FUNCS = {
  find_lit (array) {
    let queue = array.filter(e => e.type === 'src')
    let lit = new Set(queue.map(e => e.n))

    while (queue.length > 0) {
      let c0 = queue.shift()
      if (c0.pulled) {
        continue
      }
      for (let s = 0; s < 4; s++) {
        if (c0.routes[s]) {
          let nn = c0.neighbours[s]
          if (nn != null) {
            let n = array[nn]
            if (n.routes[opposites[s]]) {
              if (!lit.has(nn) && !n.pulled) {
                lit.add(nn)
                queue.push(n)
              }
            }
          }
        }
      }
    }
    return lit
  },

  rows (state) {
    let self = this
    const iter = function* () {
      for (let y = 0; y < state.h; y++) {
        yield function*() {
          for (let x = 0; x < state.w; x++) {
            let cell = state.array[(y * state.w) + x]
            yield self.public_cell(state, cell)
          }
        }
      }
    }
    return iter()
  },

  shuffle (state) {
    for (let cell of state.array) {
      let n = Math.random()*4
      for (let r = 0; r < n; r++) {
        cell.routes.unshift(cell.routes.pop())
      }
    }
    state.lit = this.find_lit(state.array)
  },

  public_cell (state, cell) {
    return {
      type: cell.type,
      on: state.lit.has(cell.n),
      routes: cell.routes,
      x: cell.x, y: cell.y
    }
  },

  pull (state, x, y) {
    let cell = state.array[(y * state.w) + x]
    cell.pulled = true
    state.lit = this.find_lit(state.array)
    return this.public_cell(state, cell)
  },

  push (state, x, y) {
    let cell = state.array[(y * state.w) + x]
    cell.routes.unshift(cell.routes.pop())
    cell.pulled = false
    state.lit = this.find_lit(state.array)
  },

  is_won (state) {
    return state.tgts.every(e => state.lit.has(e.n))
  }
}

const FIELD_API = {
  is_won: {},
  shuffle: {},
  pull: {},
  push: {},
  rows: {}
}

// t, r, b, l => b, l, t, r
const opposites = [ 2, 3, 0, 1 ]

function new_field (w, h, wrap) {
  let state = { w, h }

  const array = Array(w * h)

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let n = (y * w) + x
      let max = w * h - 1

      let t = y > 0 ? n - w : (wrap ? (w*h) - w + x : null)
      let r = x < (w-1) ? n + 1 : (wrap ? n - w + 1 : null)
      let b = y < (h-1) ? n + w : (wrap ? x : null)
      let l = x > 0 ? n - 1 : (wrap ? n + w - 1 : null)

      let neighbours = [ t, r, b, l ]

      let type = 'pipe'
      let routes = [ t !== null, r !== null, b !== null, l !== null ]

      array[n] = { n, x, y, type, routes, neighbours }
    }
  }

  let src = array[Math.floor(Math.random() * array.length)]
  src.type = 'src'
  let tgts = []

  {
    let changed = true
    while (changed) {
      changed = false
      for (let cell of shuffle(Array.from(array))) {
        let sides = cell.routes.filter(e => e).length
        let can_take = sides - (cell.type === 'src' ? 1 : 2)
        if (can_take < 1) {
          continue
        }
        let order = shuffle([0, 1, 2, 3])
        for (let i of order) {
          if (!cell.routes[i]) {
            continue
          }
          cell.routes[i] = false
          if (FIELD_FUNCS.find_lit(array).size === array.length) {
            changed = true
            if (--can_take > 0)
              continue
            break
          }
          cell.routes[i] = true
        }
      }
    }

    cells: for (let cell of array) {
      if (cell.type !== 'pipe') {
        continue
      }
      if (cell.routes.filter(e => e).length !== 2) {
        continue
      }
      for (let s = 0; s < 4; s++) {
        if (cell.routes[s]) {
          let nn = cell.neighbours[s]
          if (nn !== null) {
            let n = array[nn]
            if (!n.routes[opposites[s]]) {
              cell.type = 'tgt'
              cell.routes[s] = false
              tgts.push(cell)
              continue cells
            }
          }
        }
      }
    }
  }

  state.array = array
  state.src = src
  state.tgts = tgts
  state.lit = FIELD_FUNCS.find_lit(array)

  return new_object(state, FIELD_FUNCS, FIELD_API)
}

const GAME_FUNCS = {
  drawBorder (s, ctx) {
    ctx.save()
    if (s.settings.wrap) {
      ctx.strokeStyle = 'rgba(0,0,0,.2)'
    } else {
      ctx.strokeStyle = 'rgba(0,0,0,1)'
    }
    ctx.lineWidth = s.border_width
    ctx.beginPath()
    ctx.rect(s.border_width/2, s.border_width/2, s.canvas_width - s.border_width, s.canvas_height - s.border_width)
    ctx.stroke()
    ctx.restore()
  },
  drawSrc (s, ctx, routes) {
    ctx.save()
    ctx.translate(s.half_cell, s.half_cell)
    ctx.fillStyle = 'rgba(0,255,0,1)'

    ctx.beginPath()
    ctx.rect(-10, -10, 20, 20)
    ctx.fill()

    ctx.restore()
  },
  drawPipe (s, ctx, on, routes) {
    if (s.settings.hide4s) {
      if (routes.reduce((n, e) => n + (e ? 1 : 0), 0) > 2) {
        return
      }
    }

    ctx.save()
    ctx.translate(s.half_cell, s.half_cell)
    if (on) {
      ctx.fillStyle = 'rgba(0,255,0,1)'
    } else {
      ctx.fillStyle = 'rgba(255,0,0,1)'
    }

    for (let y of routes) {
      if (y) {
        ctx.fillRect(-2, 0, 4, -s.half_cell)
      }
      ctx.rotate(Math.PI/2)
    }

    ctx.restore()
  },
  drawTgt (s, ctx, on, routes) {
    ctx.save()
    ctx.translate(s.half_cell, s.half_cell)
    if (on) {
      ctx.fillStyle = 'rgba(0,255,0,1)'
    } else {
      ctx.fillStyle = 'rgba(255,0,0,1)'
    }

    ctx.beginPath()
    ctx.arc(0, 0, 10, 0, Math.PI * 2, true)
    ctx.fill()

    ctx.restore()
  },
  drawCell (s, ctx, cell, active, now) {
    ctx.save()

    if (active) {
      ctx.strokeStyle = 'rgba(0,0,0,1)'
      ctx.setLineDash([5, 15])
      ctx.strokeRect(0, 0, s.cell_width, s.cell_width)
    }

    ctx.fillStyle = 'rgba(255,255,255,0.1)'
    ctx.fillRect(1, 1, s.cell_width-2, s.cell_width-2)

    if (active) {
      if (s.animate > now) {
        let phase = (s.animation_time - (s.animate - now)) / s.animation_time
        ctx.translate(s.half_cell, s.half_cell)
        ctx.rotate((Math.PI / 2) * phase)
        ctx.translate(-s.half_cell, -s.half_cell)
      }
    }

    switch (cell.type) {
      case 'src':
        this.drawPipe(s, ctx, cell.on, cell.routes)
        this.drawSrc(s, ctx)
        break
      case 'tgt':
        this.drawPipe(s, ctx, cell.on, cell.routes)
        this.drawTgt(s, ctx, cell.on)
        break
      case 'pipe':
        this.drawPipe(s, ctx, cell.on, cell.routes)
        break
    }

    ctx.restore()
  },
  drawCells (s, ctx, now) {
    ctx.save()
    for (let r of s.field.rows()) {
      ctx.save()
      for (let cell of r()) {
        this.drawCell(s, ctx, cell, this.is_active_cell(s, cell), now)
        ctx.translate(s.cell_width, 0)
      }
      ctx.restore()
      ctx.translate(0, s.cell_width)
    }
    ctx.restore()
  },
  draw (s, force, now) {
    now = Date.now()
    if (s.animate > now || force) {
      let ctx = s.canvas.getContext('2d')
      ctx.clearRect(0, 0, s.canvas_width, s.canvas_height)

      ctx.save()
      this.drawBorder(s, ctx)
      ctx.translate(s.border_width, s.border_width)
      this.drawCells(s, ctx, now)
      ctx.restore()
    }

    s.click_counter.textContent = s.clicks
    s.time_counter.textContent = Math.round((Date.now() - s.time) / 1000)

    window.requestAnimationFrame((t) => this.draw(s, true, t))
  },

  is_active_cell (state, cell) {
    let ac = state.active_cell
    return ac && ac.x === cell.x && ac.y === cell.y
  },

  on_click (s, e) {
    if (s.animate > Date.now()) {
      return
    }

    let scale = s.canvas.offsetWidth / s.canvas_width
    let x = Math.floor((e.offsetX / scale - s.border_width) / s.cell_width)
    let y = Math.floor((e.offsetY / scale - s.border_width) / s.cell_width)

    let cell = s.field.pull(x, y)
    if (!this.is_active_cell(s, cell)) {
      s.active_cell = cell
      s.clicks++
    }

    setTimeout(() => {
      s.field.push(x, y)

      if (s.field.is_won()) {
        alert('you won!')
      }
    }, s.animation_time)
    s.animate = Date.now() + s.animation_time
  },

  new_game (s) {
    s.field = new_field(s.settings.w, s.settings.h, s.settings.wrap)
    s.field.shuffle()
    s.canvas_width = s.settings.w*s.cell_width + s.border_width*2
    s.canvas_height = s.settings.h*s.cell_width + s.border_width*2
    s.canvas.width = s.canvas_width
    s.canvas.height = s.canvas_height

    s.clicks = 0
    s.active_cell = null
    s.time = Date.now()
  },

  start (s) {
    let settings = localStorage.getItem('settings')
    if (settings) {
      settings = JSON.parse(settings)
      s.settings = settings

      for (let o of s.mode_select.options) {
        if (settings.w === o.w && settings.h === o.h && settings.wrap === o.wrap && settings.hide4s === o.hide4s) {
          s.mode_select.value = o.value
          break
        }
      }
    }

    this.new_game(s)
    s.canvas.addEventListener('click', (e) => this.on_click(s, e))
    s.new_game_button.addEventListener('click', (e) => {
      let o = s.mode_select.options[s.mode_select.selectedIndex]

      let settings = { w: o.w, h: o.h, wrap: o.wrap, hide4s: o.hide4s }
      localStorage.setItem('settings', JSON.stringify(settings))
      s.settings = settings

      this.new_game(s)
    })

    this.draw(s, true)
  },

  log (s) {
    for (let r of s.field.rows()) {
      for (let c of r()) {
        console.log(c)
      }
    }
  }
}

const GAME_API = {
  start: {},
  log: {}
}

function new_game (element, opts) {
  let s = {
    // from environment
    element: element,
    // config
    border_width: 4,
    cell_width: 50,
    half_cell: 25,
    animation_time: 250,
    // game settings
    settings: {
      w: 6,
      h: 7,
      wrap: false,
      hide4s: false
    },
    // game state
    field: null,
    active_cell: null,
    clicks: 0,
    time: null,
    // for drawing
    animate: 0,
    canvas_width: 100,
    canvas_height: 100
  }

  s.canvas = mkel('canvas', {})
  s.element.appendChild(s.canvas)

  let status = mkel('div', { classes: ['status'] })
  s.click_counter = mkel('span', { text: '0' })
  status.appendChild(mkel('span', { text: ' moves: ' }))
  status.appendChild(s.click_counter)
  s.time_counter = mkel('span', { text: '0' })
  status.appendChild(mkel('span', { text: ' time: ' }))
  status.appendChild(s.time_counter)
  s.element.appendChild(status)

  let controls = mkel('div', { classes: ['controls'] })
  s.mode_select = mkel('select')
  s.mode_select.appendChild(mkel('option', { text: 'novice', w: 6, h: 7, wrap: false, hide4s: false }))
  s.mode_select.appendChild(mkel('option', { text: 'normal', w: 8, h: 11, wrap: false, hide4s: false }))
  s.mode_select.appendChild(mkel('option', { text: 'expert', w: 8, h: 15, wrap: false, hide4s: false }))
  s.mode_select.appendChild(mkel('option', { text: 'master', w: 10, h: 17, wrap: true, hide4s: false }))
  s.mode_select.appendChild(mkel('option', { text: 'insane', w: 10, h: 17, wrap: true, hide4s: true }))
  controls.appendChild(s.mode_select)
  controls.appendChild(mkel('span', { text: ' ' }))
  s.new_game_button = mkel('button', { text: 'new game' })
  controls.appendChild(s.new_game_button)
  s.element.appendChild(controls)

  return new_object(s, GAME_FUNCS, GAME_API)
}

document.addEventListener('DOMContentLoaded', e => {
  if (isInStandaloneMode()) {
    document.body.classList.add('standalone')
  }
  let game = new_game(document.getElementById('game'))
  game.start()
  // console.log(game.toJSON())
})
