
import { mkel, shuffle } from './util.js'

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
      for (let s = 0; s < 4; s++) {
        if (c0.routes[s]) {
          let nn = c0.neighbours[s]
          if (nn != null) {
            let n = array[nn]
            if (n.routes[opposites[s]]) {
              if (!lit.has(nn)) {
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
    const iter = function* () {
      for (let y = 0; y < state.h; y++) {
        yield function*() {
          for (let x = 0; x < state.w; x++) {
            let c = state.array[(y * state.w) + x]
            yield {
              type: c.type,
              on: state.lit.has(c.n),
              routes: c.routes
            }
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

  rotate (state, x, y) {
    let cell = state.array[(y * state.w) + x]
    cell.routes.unshift(cell.routes.pop())
    state.lit = this.find_lit(state.array)
  },

  is_won (state) {
    return state.tgts.every(e => state.lit.has(e.n))
  }
}

const FIELD_API = {
  is_won: {},
  shuffle: {},
  rotate: {},
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
    if (s.wrap) {
      ctx.strokeStyle = 'rgba(0,0,0,.2)'
    } else {
      ctx.strokeStyle = 'rgba(0,0,0,1)'
    }
    ctx.lineWidth = s.border_width
    ctx.rect(s.border_width/2, s.border_width/2, s.canvas_width - s.border_width, s.canvas_height - s.border_width)
    ctx.stroke()
    ctx.restore()
  },
  drawSrc (s, ctx, routes) {
    ctx.save()
    ctx.translate(s.cell_width/2, s.cell_width/2)
    ctx.fillStyle = 'rgba(0,255,0,1)'

    for (let y of routes) {
      if (y) {
        ctx.fillRect(-2, 0, 4, -s.cell_width/2)
      }
      ctx.rotate(Math.PI/2)
    }

    ctx.beginPath()
    // ctx.arc(0, 0, 10, 0, Math.PI * 2, true)
    ctx.rect(-10, -10, 20, 20)
    ctx.fill()

    ctx.restore()
  },
  drawPipe (s, ctx, on, routes) {
    if (s.hide4s) {
      if (routes.every(e => e)) {
        return
      }
    }

    ctx.save()
    ctx.translate(s.cell_width/2, s.cell_width/2)
    if (on) {
      ctx.fillStyle = 'rgba(0,255,0,1)'
    } else {
      ctx.fillStyle = 'rgba(255,0,0,1)'
    }

    for (let y of routes) {
      if (y) {
        ctx.fillRect(-2, 0, 4, -s.cell_width/2)
      }
      ctx.rotate(Math.PI/2)
    }

    ctx.restore()
  },
  drawTgt (s, ctx, on, routes) {
    ctx.save()
    ctx.translate(s.cell_width/2, s.cell_width/2)
    if (on) {
      ctx.fillStyle = 'rgba(0,255,0,1)'
    } else {
      ctx.fillStyle = 'rgba(255,0,0,1)'
    }

    for (let y of routes) {
      if (y) {
        ctx.fillRect(-2, 0, 4, -s.cell_width/2)
      }
      ctx.rotate(Math.PI/2)
    }

    ctx.beginPath()
    ctx.arc(0, 0, 10, 0, Math.PI * 2, true)
    ctx.fill()

    ctx.restore()
  },
  drawCell (s, ctx, cell) {
    ctx.save()
    ctx.fillStyle = 'rgba(255,255,255,0.1)'
    ctx.fillRect(1, 1, s.cell_width-2, s.cell_width-2)
    switch (cell.type) {
      case 'src':
        this.drawSrc(s, ctx, cell.routes)
        break
      case 'tgt':
        this.drawTgt(s, ctx, cell.on, cell.routes)
        break
      case 'pipe':
        this.drawPipe(s, ctx, cell.on, cell.routes)
        break
    }
    ctx.restore()
  },
  drawCells (s, ctx) {
    ctx.save()
    for (let r of s.field.rows()) {
      ctx.save()
      for (let c of r()) {
        this.drawCell(s, ctx, c)
        ctx.translate(s.cell_width, 0)
      }
      ctx.restore()
      ctx.translate(0, s.cell_width)
    }
    ctx.restore()
  },
  draw (s) {
    let ctx = s.canvas.getContext('2d')
    ctx.clearRect(0, 0, s.canvas_width, s.canvas_height)

    ctx.save()
    this.drawBorder(s, ctx)
    ctx.translate(s.border_width, s.border_width)
    this.drawCells(s, ctx)
    ctx.restore()

    s.click_counter.textContent = s.clicks
    s.time_counter.textContent = Math.round((new Date() - s.time) / 1000)

    // window.requestAnimationFrame(() => this.draw(s))
  },

  on_click (s, e) {
    let scale = s.canvas.offsetWidth / s.canvas_width
    let x = Math.floor((e.offsetX / scale - s.border_width) / s.cell_width)
    let y = Math.floor((e.offsetY / scale - s.border_width) / s.cell_width)
    s.field.rotate(x, y)

    let ac = `${x}.${y}`
    if (ac !== s.active_cell) {
      s.active_cell = ac
      s.clicks++
    }

    this.draw(s)

    if (s.field.is_won()) {
      alert('you won!')
    }
  },

  new_game (s) {
    s.field = new_field(s.w, s.h, s.wrap)
    s.field.shuffle()
    s.canvas_width = s.w*s.cell_width + s.border_width*2
    s.canvas_height = s.h*s.cell_width + s.border_width*2
    s.canvas.width = s.canvas_width
    s.canvas.height = s.canvas_height
    s.clicks = 0
    s.time = new Date()
    this.draw(s)
  },

  start (s) {
    let settings = localStorage.getItem('settings')
    if (settings) {
      settings = JSON.parse(settings)
      s.w = settings.w
      s.h = settings.h
      s.wrap = settings.wrap
      s.hide4s = settings.hide4s
    }

    this.new_game(s)
    s.canvas.addEventListener('click', (e) => this.on_click(s, e))
    s.new_game_button.addEventListener('click', (e) => {
      let o = s.mode_select.options[s.mode_select.selectedIndex]

      let settings = { w: o.w, h: o.h, wrap: o.wrap, hide4s: o.hides4s }
      localStorage.setItem('settings', JSON.stringify(settings))

      s.w = o.w
      s.h = o.h
      s.wrap = o.wrap
      s.hide4s = o.hide4s

      this.new_game(s)
    })
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
    element: element,
    w: 6,
    h: 7,
    wrap: false,
    hide4s: false,
    border_width: 4,
    cell_width: 50,
    field: null,
    active_cell: null,
    clicks: 0,
    time: null,
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
  s.mode_select.appendChild(mkel('option', { text: 'normal', w: 10, h: 10, wrap: false, hide4s: false }))
  s.mode_select.appendChild(mkel('option', { text: 'expert', w: 8, h: 11, wrap: false, hide4s: false }))
  s.mode_select.appendChild(mkel('option', { text: 'master', w: 8, h: 15, wrap: true, hide4s: false }))
  s.mode_select.appendChild(mkel('option', { text: 'insane', w: 8, h: 15, wrap: true, hide4s: true }))
  controls.appendChild(s.mode_select)
  controls.appendChild(mkel('span', { text: ' ' }))
  s.new_game_button = mkel('button', { text: 'new game' })
  controls.appendChild(s.new_game_button)
  s.element.appendChild(controls)

  return new_object(s, GAME_FUNCS, GAME_API)
}

document.addEventListener('DOMContentLoaded', e => {
  let game = new_game(document.getElementById('game'))
  game.start()
  // game.log()
  // console.log(game.toJSON())
})
