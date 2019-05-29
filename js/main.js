
import { make_class } from './classis.js'
import { join, mkel, shuffle, isProbablyInstalled, hook, select, defer, animate, main } from './util.js'

const GAME_MODES = [
  // { mode: 'nop', w: 2, h: 2, wrap: false, hide4s: false },
  { mode: 'novice', w: 6, h: 7, wrap: false, hide4s: false },
  { mode: 'normal', w: 8, h: 11, wrap: false, hide4s: false },
  { mode: 'expert', w: 8, h: 15, wrap: false, hide4s: false },
  { mode: 'master', w: 10, h: 17, wrap: true, hide4s: false },
  { mode: 'insane', w: 10, h: 17, wrap: true, hide4s: true }
]

const Stats = make_class('stats', {
  load (state) {
    let fromStore = state.localStorage.getItem('stats')
    if (fromStore) {
      state.bests = JSON.parse(fromStore)
    }
  },

  post (state, mode, obj) {
    let res = []

    let best = state.bests[mode] || {}
    for (let s in obj) {
      if (best[s] === undefined || obj[s] > best[s]) {
        best[s] = obj[s]
        res.push(s)
      }
    }
    state.bests[mode] = best
    state.localStorage.setItem('stats', JSON.stringify(state.bests))

    return res
  },

  getBests (state) {
    return state.bests
  }
}, {
  post: {},
  getBests: {}
})

function new_stats (localStorage) {
  let state = {
    localStorage: localStorage,
    bests: {}
  }

  Stats.static.load(state)

  return Stats.new(state)
}

const Field = make_class('field', {
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

  turn_cell (cell) {
    cell.routes.unshift(cell.routes.pop())
    cell.turns = (cell.turns + 1) % 4
  },

  shuffle (state) {
    for (let cell of state.array) {
      let n = Math.random()*4
      for (let r = 0; r < n; r++) {
        this.turn_cell(cell)
      }
    }
    state.lit = this.find_lit(state.array)
  },

  public_cell (state, cell) {
    return {
      id: cell.n,
      type: cell.type,
      on: state.lit.has(cell.n),
      routes: cell.routes,
      x: cell.x,
      y: cell.y
    }
  },

  examine (state, x, y) {
    let cell = state.array[(y * state.w) + x]
    return this.public_cell(state, cell)
  },

  pull (state, x, y) {
    let cell = state.array[(y * state.w) + x]
    if (cell.pulled) {
      return null
    }
    cell.pulled = true
    state.lit = this.find_lit(state.array)
    return this.public_cell(state, cell)
  },

  push (state, x, y) {
    let cell = state.array[(y * state.w) + x]
    this.turn_cell(cell)
    cell.pulled = false
    state.lit = this.find_lit(state.array)
  },

  is_won (state) {
    return state.tgts.every(e => state.lit.has(e.n))
  },

  solution (state) {
    let self = this
    const iter = function* () {
      for (let y = 0; y < state.h; y++) {
        yield function*() {
          for (let x = 0; x < state.w; x++) {
            let cell = state.array[(y * state.w) + x]
            yield {
              id: cell.n,
              x: cell.x,
              y: cell.y,
              turn: (!cell.turns ? 0 : 4 - cell.turns)
            }
          }
        }
      }
    }
    return iter()
  }
}, {
  is_won: {},
  shuffle: {},
  examine: {},
  pull: {},
  push: {},
  rows: {},
  solution: {},
})

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
      let turns = 0
      let routes = [ t !== null, r !== null, b !== null, l !== null ]

      array[n] = { n, x, y, type, routes, turns, neighbours }
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
          if (Field.static.find_lit(array).size === array.length) {
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
  state.lit = Field.static.find_lit(array)

  return Field.new(state)
}

const Game = make_class('game', {
  setup_elements (s, parent) {
    s.canvas = mkel('canvas', {})
    parent.appendChild(s.canvas)

    let status = mkel('div', { classes: ['status'] })
    s.click_counter = mkel('span', { text: '0' })
    status.appendChild(mkel('span', { text: ' moves: ' }))
    status.appendChild(s.click_counter)
    s.time_counter = mkel('span', { text: '0' })
    status.appendChild(mkel('span', { text: ' time: ' }))
    status.appendChild(s.time_counter)
    parent.appendChild(status)
  },

  setup_events (s) {
    hook(s.canvas, 'click', {}, this.on_click, [s])
  },

  draw_border (s, ctx) {
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
  draw_src (s, ctx, routes) {
    ctx.save()
    ctx.translate(s.half_cell, s.half_cell)
    ctx.fillStyle = 'rgba(0,255,0,1)'

    ctx.beginPath()
    ctx.rect(-10, -10, 20, 20)
    ctx.fill()

    ctx.restore()
  },
  draw_pipe (s, ctx, on, routes) {
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

    ctx.beginPath()
    ctx.arc(0, 0, 2, 0, Math.PI * 2, true)
    ctx.fill()
    for (let y of routes) {
      if (y) {
        ctx.fillRect(-2, 0, 4, -s.half_cell)
      }
      ctx.rotate(Math.PI/2)
    }

    ctx.restore()
  },
  draw_tgt (s, ctx, on, routes) {
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
  draw_cell (s, ctx, cell, moving, active, now) {
    ctx.save()

    if (active) {
      ctx.strokeStyle = 'rgba(0,0,0,1)'
      ctx.setLineDash([5, 15])
      ctx.strokeRect(0, 0, s.cell_width, s.cell_width)
    }

    ctx.fillStyle = 'rgba(255,255,255,0.1)'
    ctx.fillRect(1, 1, s.cell_width-2, s.cell_width-2)

    if (moving) {
      ctx.translate(s.half_cell, s.half_cell)
      ctx.rotate((Math.PI / 2) * moving.phase)
      ctx.translate(-s.half_cell, -s.half_cell)
    }

    switch (cell.type) {
      case 'src':
        this.draw_pipe(s, ctx, cell.on, cell.routes)
        this.draw_src(s, ctx)
        break
      case 'tgt':
        this.draw_pipe(s, ctx, cell.on, cell.routes)
        this.draw_tgt(s, ctx, cell.on)
        break
      case 'pipe':
        this.draw_pipe(s, ctx, cell.on, cell.routes)
        break
    }

    ctx.restore()
  },
  draw_cells (s, ctx, now) {
    ctx.save()
    for (let r of s.game.field.rows()) {
      ctx.save()
      for (let cell of r()) {
        let moving = s.movings.get(cell.id)
        this.draw_cell(s, ctx, cell, moving, this.is_active_cell(s, cell), now)
        ctx.translate(s.cell_width, 0)
      }
      ctx.restore()
      ctx.translate(0, s.cell_width)
    }
    ctx.restore()
  },
  draw (s) {
    let now = Date.now()

    if (s.force_draw || s.movings.size > 0) {
      s.force_draw = false

      for (let k of s.movings.keys()) {
        let m = s.movings.get(k)
        m.phase = (now - m.start) / s.animation_time
        if (m.phase > 1) {
          s.movings.delete(k)
          if (m.cell) {
            this.after_animate(s, m)
          }
        }
      }

      let ctx = s.canvas.getContext('2d')
      ctx.clearRect(0, 0, s.canvas_width, s.canvas_height)

      ctx.save()
      if (!s.game.paused) {
        this.draw_border(s, ctx)
        ctx.translate(s.border_width, s.border_width)
        this.draw_cells(s, ctx, now)
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.3)'
        ctx.fillRect(0, 0, s.canvas_width, s.canvas_height)
      }
      ctx.restore()
    }

    s.click_counter.textContent = s.game.clicks
    s.time_counter.textContent = this.seconds_gone(s.game)

    animate(this.draw, [s])
  },

  is_active_cell (state, cell) {
    let ac = state.game.active_cell
    return ac && ac.id === cell.id
  },

  seconds_gone (game) {
    let t = game.acc_time
    if (!game.paused && !game.cheated && !game.won) {
      t += Date.now() - game.time
    }
    return Math.round(t / 1000)
  },

  on_click (e, s) {
    let scale = s.canvas.offsetWidth / s.canvas_width
    let x = Math.floor((e.offsetX / scale - s.border_width) / s.cell_width)
    let y = Math.floor((e.offsetY / scale - s.border_width) / s.cell_width)

    let cell = s.game.field.pull(x, y)
    if (cell) {
      this.start_spin(s, cell, 1)
    } else {
      cell = s.game.field.examine(x, y)
      s.movings.get(cell.id).times++
    }

    if (!this.is_active_cell(s, cell)) {
      s.game.active_cell = cell
      s.game.clicks++
    }
  },

  start_spin (s, cell, times) {
    s.movings.set(cell.id, {
      start: Date.now(),
      cell: cell,
      times: times
    })
  },

  after_animate (s, m) {
    let {cell, times} = m
    s.game.field.push(cell.x, cell.y)

    if (this.check_win(s.game)) {
      s.game.won = true
      defer(0, this.on_win, [s])
    }

    if (times > 1) {
      s.game.field.pull(cell.x, cell.y)
      this.start_spin(s, cell, times-1)
    }
  },

  check_win (game) {
    if (game.cheated || game.won) {
      return false
    }
    if (game.field.is_won()) {
      return true
    }
    return false
  },

  on_win (s) {
    s.game.acc_time = (Date.now() - s.game.time)

    let time = Math.round(s.game.acc_time / 1000)
    let clicks = s.game.clicks

    let bests = s.stats.post(s.settings.mode, {
      time: -time,
      moves: -clicks
    })

    let msg = `you won in ${time} seconds using ${clicks} moves!`
    if (bests.length > 0) {
      msg += `\nthat\'s your best ${join(bests, ' and ')}!`
    }

    defer(0, alert, [msg])
  },

  new_game (s, settings) {
    s.settings = settings
    s.game = {
      field: new_field(s.settings.w, s.settings.h, s.settings.wrap),
      active_cell: null,
      clicks: 0,
      time: Date.now(),
      acc_time: 0,
      won: false,
      paused: false,
      cheated: false
    }
    s.game.field.shuffle()
    s.canvas_width = s.settings.w*s.cell_width + s.border_width*2
    s.canvas_height = s.settings.h*s.cell_width + s.border_width*2
    s.canvas.width = s.canvas_width
    s.canvas.height = s.canvas_height
    s.movings = new Map()
    s.force_draw = true
  },

  start (s, settings) {
    this.new_game(s, settings)
    animate(this.draw, [s])
  },

  pause (s, p) {
    if (p) {
      if (s.game.paused || s.game.won || s.game.cheated) {
        return
      }
      s.game.acc_time += (Date.now() - s.game.time)
      s.game.paused = true
    } else {
      if (!s.game.paused) {
        return
      }
      s.game.time = Date.now()
      s.game.paused = false
    }
    s.force_draw = true
  },

  solve (s) {
    s.game.cheated = true
    for (let r of s.game.field.solution()) {
      for (let cell of r()) {
        if (cell.turn) {
          this.start_spin(s, cell, cell.turn)
        }
      }
    }
  }
}, {
  start: {},
  new_game: {},
  pause: {},
  solve: {}
})

function new_game (element, stats) {
  let s = {
    // from environment
    stats: stats,
    // config
    border_width: 4,
    cell_width: 50,
    half_cell: 25,
    animation_time: 250,
    // game settings
    settings: null,
    // game state
    game: null,
    // for drawing
    movings: new Map(),
    canvas_width: 100,
    canvas_height: 100
  }

  Game.static.setup_elements(s, element)
  Game.static.setup_events(s)

  return Game.new(s)
}

const Controller = make_class('controller', {
  load (state) {
    let settings = localStorage.getItem('settings')
    if (settings) {
      settings = JSON.parse(settings)
    } else {
      settings = GAME_MODES[0]
    }
    state.settings = settings
  },

  setup_elements (s, parent) {
    let controls = mkel('div', { classes: ['controls'] })
    s.mode_select = mkel('select')
    controls.appendChild(s.mode_select)
    controls.appendChild(mkel('span', { text: ' ' }))
    s.new_game_button = mkel('button', { text: 'new game' })
    controls.appendChild(s.new_game_button)
    controls.appendChild(mkel('span', { text: ' | ' }))
    s.solve_button = mkel('button', { text: 'solve' })
    controls.appendChild(s.solve_button)
    // s.help_button = mkel('a', { text: '?' })
    // controls.appendChild(s.help_button)
    parent.appendChild(controls)

    for (let settings of GAME_MODES) {
      let o = mkel('option', { text: settings.mode, settings: settings })
      s.mode_select.appendChild(o)
    }

    s.mode_select.value = s.settings.mode
    if (!s.mode_select.value) {
      let o = mkel('option', { text: 'custom', settings: s.settings })
      s.mode_select.appendChild(o)
      s.mode_select.value = 'custom'
    }
  },

  setup_events (s) {
    // hook(s.document, 'visibilitychange', {}, this.on_showhide, [s])
    hook(s.document, 'focus', {}, this.on_focus, [s])
    hook(s.document, 'blur', {}, this.on_focus, [s])
    hook(s.new_game_button, 'click', {}, this.on_new_game_click, [s])
    hook(s.solve_button, 'click', {}, this.on_solve_click, [s])
  },

  on_showhide (e, s) {
    s.game.pause(s.document.hidden)
  },
  on_focus (e, s) {
    s.game.pause(e.type === 'blur')
  },
  on_new_game_click (e, s) {
    let settings = s.mode_select.options[s.mode_select.selectedIndex].settings
    s.localStorage.setItem('settings', JSON.stringify(settings))
    s.settings = settings
    s.game.new_game(settings)
  },
  on_solve_click (e, s) {
    s.game.solve()
  },

  start (state) {
    state.game.start(state.settings)
  }
}, {
  start: {}
})

function new_controller (element, document, localStorage, game, stats) {
  let s = {
    document,
    localStorage,
    game,
    stats
  }

  Controller.static.load(s)
  Controller.static.setup_elements(s, element)
  Controller.static.setup_events(s)

  return Controller.new(s)
}

main(function ({window, document, localStorage}) {
  if (isProbablyInstalled()) {
    document.body.classList.add('standalone')
  }

  let stats = new_stats(localStorage)
  let game = new_game(select(document, '#game'), stats)
  let controller = new_controller(select(document, '#game'), document, localStorage, game, stats)

  controller.start()
})
