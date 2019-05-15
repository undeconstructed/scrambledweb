
import { mkel, shuffle } from './util.js'

function new_object (state, fs, api) {
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

function new_field (w, h) {
  let state = { w, h }

  const array = Array(w * h)

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let n = (y * w) + x
      let max = w * h - 1

      let t = y > 0 ? n - w : null
      let r = x < (w-1) ? n + 1 : null
      let b = y < (h-1) ? n + w : null
      let l = x > 0 ? n - 1 : null

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
        if (cell.type === 'src' && cell.routes.filter(e => e).length === 1) {
          continue
        }
        if (cell.type === 'pipe' && cell.routes.filter(e => e).length === 2) {
          continue
        }
        for (let i = 0; i < 4; i++) {
          if (!cell.routes[i]) {
            continue
          }
          cell.routes[i] = false
          if (FIELD_FUNCS.find_lit(array).size === w*h) {
            changed = true
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
    if (s.field.is_won()) {
      ctx.strokeStyle = 'rgba(0,255,0,1)'
    } else {
      ctx.strokeStyle = 'rgba(255,0,0,1)'
    }
    ctx.lineWidth = s.border_width
    ctx.rect(s.border_width/2, s.border_width/2, s.canvas_width - s.border_width, s.canvas_height - s.border_width)
    ctx.stroke()
    ctx.restore()
  },
  drawSrc (s, ctx, routes) {
    ctx.save()
    ctx.translate(s.cell_width/2, s.cell_width/2)
    ctx.fillStyle = 'rgba(0,0,0,1)'

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
  drawPipe (s, ctx, on, routes) {
    ctx.save()
    ctx.translate(s.cell_width/2, s.cell_width/2)
    ctx.fillStyle = 'rgba(0,0,0,1)'

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
    ctx.fillStyle = 'rgba(255,255,255,1)'

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
    if (cell.on) {
      ctx.fillStyle = 'rgba(0,255,0,1)'
    } else {
      ctx.fillStyle = 'rgba(255,0,0,1)'
    }
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
    // window.requestAnimationFrame(draw)
  },

  on_click (s, e) {
    let x = Math.floor((e.offsetX - s.border_width) / s.cell_width)
    let y = Math.floor((e.offsetY - s.border_width) / s.cell_width)
    s.field.rotate(x, y)

    let ac = `${x}.${y}`
    if (ac !== s.active_cell) {
      s.active_cell = ac
      s.clicks++
    }

    this.draw(s)
  },

  new_game (s) {
    s.field = new_field(s.w, s.h)
    s.field.shuffle()
    s.clicks = 0
    this.draw(s)
  },

  start (s) {
    this.new_game(s)
    s.canvas.addEventListener('click', (e) => this.on_click(s, e))
    s.new_game_button.addEventListener('click', (e) => this.new_game(s))
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
    border_width: 4,
    cell_width: 50,
    field: null,
    active_cell: null,
    clicks: 0,
  }

  s.canvas_width = s.w*s.cell_width + s.border_width*2
  s.canvas_height = s.h*s.cell_width + s.border_width*2

  s.canvas = mkel('canvas', { width: s.canvas_width, height: s.canvas_height })
  s.element.appendChild(s.canvas)
  let controls = mkel('div')
  s.new_game_button = mkel('button', { text: 'new game' })
  s.click_counter = mkel('span', { text: '0' })
  controls.appendChild(s.new_game_button)
  controls.appendChild(mkel('span', { text: 'moves: ' }))
  controls.appendChild(s.click_counter)
  s.element.appendChild(controls)

  return new_object(s, GAME_FUNCS, GAME_API)
}

document.addEventListener('DOMContentLoaded', e => {
  let game = new_game(document.getElementById('game'))
  game.start()
  // game.log()
})
