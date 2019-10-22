import { make_class, make_channel, run_proc } from './classis.js'
import { join, mkel, shuffle, isProbablyInstalled, hook, hook_chan, switchy, select, animate, main } from './util.js'

const GAME_MODES = [
  // { mode: 'nop', w: 2, h: 2, wrap: false, hide4s: false },
  { mode: 'novice', w: 6, h: 7, wrap: false, hide4s: false },
  { mode: 'normal', w: 8, h: 11, wrap: false, hide4s: false },
  { mode: 'expert', w: 8, h: 15, wrap: false, hide4s: false },
  { mode: 'master', w: 10, h: 17, wrap: true, hide4s: false },
  { mode: 'insane', w: 10, h: 17, wrap: true, hide4s: true }
]

const COLOR_ON = 'rgba(50,250,50,1)'
const COLOR_OFF = 'rgba(150,50,50,1)'

const NUM_SIDES = 4
const OPPOSITES = [ 2, 3, 0, 1 ] // t, r, b, l => b, l, t, r

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

  get_bests (state) {
    return state.bests
  }
}, {
  post: {},
  get_bests: {}
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
      for (let s = 0; s < NUM_SIDES; s++) {
        if (c0.routes[s]) {
          let nn = c0.neighbours[s]
          if (nn != null) {
            let n = array[nn]
            if (n.routes[OPPOSITES[s]]) {
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
    let turns = (cell.turns + 1) % NUM_SIDES
    if ((cell.sym === 2 && turns === 2) || cell.sym === 4) {
      turns = 0
    }
    cell.turns = turns
  },

  shuffle (state) {
    for (let cell of state.array) {
      let n = Math.random()*NUM_SIDES
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

  identify (state, x, y) {
    let cell = state.array[(y * state.w) + x]
    return cell.n
  },

  examine (state, id) {
    let cell = state.array[id]
    return this.public_cell(state, cell)
  },

  pull (state, id) {
    let cell = state.array[id]
    if (cell.pulled) {
      return false
    }
    cell.pulled = true
    state.lit = this.find_lit(state.array)
    return true
  },

  push (state, id) {
    let cell = state.array[id]
    if (!cell.pulled) {
      return false
    }
    this.turn_cell(cell)
    cell.pulled = false
    state.lit = this.find_lit(state.array)
    return true
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
            let turns = (cell.turns === 0 ? 0 : (cell.sym === 2 ? 1 : (NUM_SIDES - cell.turns)))
            yield {
              id: cell.n,
              x: cell.x,
              y: cell.y,
              turn: turns,
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
  identify: {},
  examine: {},
  pull: {},
  push: {},
  rows: {},
  solution: {},
})

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

      let sym = -1

      array[n] = { n, x, y, type, routes, turns, neighbours, sym }
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
      let num_routes = cell.routes.reduce((a, e) => a + (e ? 1 : 0), 0)
      if (num_routes !== 2) {
        continue
      }
      for (let s = 0; s < NUM_SIDES; s++) {
        if (cell.routes[s]) {
          let nn = cell.neighbours[s]
          if (nn !== null) {
            let n = array[nn]
            if (!n.routes[OPPOSITES[s]]) {
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

  for (let cell of array) {
    let num_routes = cell.routes.reduce((a, e) => a + (e ? 1 : 0), 0)
    let sym = 1
    if (num_routes === NUM_SIDES) {
      sym = NUM_SIDES
    } else if (num_routes === 2 && cell.routes.every((e, i) => e === cell.routes[OPPOSITES[i]])) {
      sym = 2
    }
    cell.sym = sym
  }

  state.array = array
  state.src = src
  state.tgts = tgts
  state.lit = Field.static.find_lit(array)

  return Field.new(state)
}

const Animation = make_class('animation', {
  update(state, now) {
    let phase = (now - state.start) / state.length
    if (phase < 1) {
      state.target.phase = phase
      return false
    } else {
      state.target.phase = 1
      return true
    }
  },
}, {
  update: {},
  target: {
    get: 'target',
  },
})

function new_animation (target, length, start) {
  let state = {
    target,
    length,
    start,
  }

  return Animation.new(state)
}

const Animations = make_class('animations', {
  add(state, id, animation) {
    let list = this.get_list(state, id)
    list.push(animation)
  },
  get_list(state, id) {
    let list = state.map.get(id)
    if (!list) {
      list = []
      state.map.set(id, list)
    }
    return list
  },
  tick(state, now) {
    for (let k of state.map.keys()) {
      let list = state.map.get(k)
      let anim = list[0]
      if (!anim) {
        state.map.delete(k)
        continue
      }
      let done = anim.update(now)
      if (done) {
        list.shift()
        state.output.send({
          event: 'done',
          id: k,
          animation: anim,
        })
      }
    }
  },
}, {
  add: {},
  tick: {},
  output: {
    get: 'output',
  }
})

function new_animations () {
  let state = {
    map: new Map(),
    output: make_channel(),
  }

  return Animations.new(state)
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
    ctx.fillStyle = COLOR_ON

    ctx.beginPath()
    ctx.rect(-10, -10, 20, 20)
    ctx.fill()

    ctx.restore()
  },
  draw_pipe (s, ctx, on, routes) {
    if (s.settings.hide4s && !s.game.won && !s.game.cheated) {
      if (routes.reduce((n, e) => n + (e ? 1 : 0), 0) > 2) {
        return
      }
    }

    ctx.save()
    ctx.translate(s.half_cell, s.half_cell)
    if (on) {
      ctx.fillStyle = COLOR_ON
    } else {
      ctx.fillStyle = COLOR_OFF
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
      ctx.fillStyle = COLOR_ON
    } else {
      ctx.fillStyle = COLOR_OFF
    }

    ctx.beginPath()
    ctx.arc(0, 0, 10, 0, Math.PI * 2, true)
    ctx.fill()

    ctx.restore()
  },
  draw_cell (s, ctx, cell, phase, active) {
    ctx.save()

    if (active) {
      ctx.strokeStyle = 'rgba(0,0,0,1)'
      ctx.setLineDash([5, 15])
      ctx.strokeRect(0, 0, s.cell_width, s.cell_width)
    }

    ctx.fillStyle = 'rgba(255,255,255,0.1)'
    ctx.fillRect(1, 1, s.cell_width-2, s.cell_width-2)

    if (phase > 0) {
      ctx.translate(s.half_cell, s.half_cell)
      ctx.rotate((Math.PI / 2) * phase)
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
  draw_cells (s, ctx) {
    ctx.save()
    for (let r of s.game.field.rows()) {
      ctx.save()
      for (let cell of r()) {
        let id = cell.id
        let cell_data = s.game.cell_data[id]
        this.draw_cell(s, ctx, cell, cell_data.phase, this.is_active_cell(s, cell))
        ctx.translate(s.cell_width, 0)
      }
      ctx.restore()
      ctx.translate(0, s.cell_width)
    }
    ctx.restore()
  },
  draw_all (s) {
    let ctx = s.canvas.getContext('2d')
    ctx.clearRect(0, 0, s.canvas_width, s.canvas_height)

    ctx.save()
    if (!s.game.paused) {
      this.draw_border(s, ctx)
      ctx.translate(s.border_width, s.border_width)
      this.draw_cells(s, ctx)
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.3)'
      ctx.fillRect(0, 0, s.canvas_width, s.canvas_height)
    }
    ctx.restore()

    s.click_counter.textContent = s.game.clicks
    if (s.game.cheated) {
      s.time_counter.textContent = '∞'
    } else {
      s.time_counter.textContent = this.seconds_gone(s.game)
    }
  },

  is_active_cell (state, cell) {
    return state.game.active_cell === cell.id
  },

  seconds_gone (game) {
    let t = game.acc_time
    if (!game.paused && !game.won) {
      t += Date.now() - game.time
    }
    return Math.round(t / 1000)
  },

  on_click (state, offsetX, offsetY) {
    // TODO - scaling should happen in controller
    let scale = state.canvas.offsetWidth / state.canvas_width
    let x = Math.floor((offsetX / scale - state.border_width) / state.cell_width)
    let y = Math.floor((offsetY / scale - state.border_width) / state.cell_width)

    let field = state.game.field

    let id = field.identify(x, y)
    let cell_data = state.game.cell_data[id]

    if (field.pull(id)) {
      this.start_spin(state, cell_data)
    } else {
      cell_data.turns++
    }

    if (!this.is_active_cell(state, cell_data)) {
      state.game.active_cell = id
      state.game.clicks++
    }
  },

  start_spin (state, cell_data) {
    let anim = new_animation(cell_data, state.animation_time, Date.now())
    state.animations.add(cell_data.id, anim)
  },

  after_move (state, cell_data) {
    let field = state.game.field

    field.push(cell_data.id)
    cell_data.phase = 0

    if (cell_data.turns > 0) {
      field.pull(cell_data.id)
      cell_data.turns--
      this.start_spin(state, cell_data)
      return false
    }

    return true
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
    let moves = s.game.clicks

    s.output.send({
      event: 'win',
      stats: { time, moves }
    })
  },

  setup (s, settings) {
    s.settings = settings
    s.game = {
      field: new_field(s.settings.w, s.settings.h, s.settings.wrap),
      cell_data: [],
      active_cell: null,
      clicks: 0,
      time: Date.now(),
      acc_time: 0,
      won: false,
      paused: false,
      cheated: false
    }
    for (let r of s.game.field.rows()) {
      for (let cell of r()) {
        s.game.cell_data[cell.id] = {
          id: cell.id,
          phase: 0,
          turns: 0,
        }
      }
    }
    s.game.field.shuffle()
    s.canvas_width = s.settings.w*s.cell_width + s.border_width*2
    s.canvas_height = s.settings.h*s.cell_width + s.border_width*2
    s.canvas.width = s.canvas_width
    s.canvas.height = s.canvas_height
  },

  start (state, settings) {
    this.setup(state, settings)

    let control = make_channel(0)
    hook_chan(state.canvas, 'click', control)
    let input = state.input
    let anima = state.animations.output()
    let frame = state.frame

    run_proc(function* () {
      main:
      while (true) {
        let [chan, msg] = yield [control, input, anima, frame]
        let next = switchy(chan, {
          [control]: () => switchy(msg.tag, {
            click: () => this.on_click(state, msg.x, msg.y)
          }),
          [input]: () => switchy(msg.type, {
            new_game: () => 'new_game',
            pause: () => 'pause',
            solve: () => 'solve',
          }),
          [anima]: () => {
            let cell_data = state.game.cell_data[msg.id]
            this.after_move(state, cell_data)
            if (this.check_win(state.game)) {
              state.game.won = true
              return 'won'
            }
          },
          [frame]: () => 'draw'
        })

        if (next === 'draw') {
          let now = Date.now()
          state.animations.tick(now)
          this.draw_all(state)
          continue main
        }

        if (next === 'new_game') {
          this.setup(state, msg.settings)
          continue main
        }

        if (next === 'pause') {
          this.do_pause(state, msg.pause)
          // draw once in paused mode
          this.draw_all(state)
          while (true) {
            let [chan, msg] = yield [input]
            if (msg.type === 'pause' && msg.pause === false) {
              this.do_pause(state, false)
              continue main
            }
          }
        }

        if (next === 'solve') {
          let r = yield this.do_solve(state)
          // control.drain()
          continue main
        }

        if (next === 'won') {
          // force a draw of completed grid
          this.draw_all(state)
          this.on_win(state)
          while (true) {
            let [chan, msg] = yield [input]
            if (msg.type === 'new_game') {
              this.setup(state, msg.settings)
              // control.drain()
              continue main
            }
          }
        }
      }
    }.bind(this)())
  },

  do_pause (s, p) {
    if (p) {
      if (s.game.paused || s.game.won) {
        return
      }
      s.game.acc_time += (Date.now() - s.game.time)
      s.game.paused = true
      s.output.send({ event: 'pause' })
    } else {
      if (!s.game.paused) {
        return
      }
      s.game.time = Date.now()
      s.game.paused = false
      s.output.send({ event: 'unpause' })
    }
  },

  do_solve (s) {
    s.game.cheated = true

    let anima = s.animations.output()
    let frame = s.frame

    return function* (ctx) {
      for (let r of s.game.field.solution()) {
        for (let cell of r()) {
          if (cell.turn) {
            let cell_data = s.game.cell_data[cell.id]
            cell_data.turns = cell.turn-1
            s.game.field.pull(cell_data.id)
            this.start_spin(s, cell_data)
            while (true) {
              let [chan, msg] = yield [anima, frame]
              let done = switchy(chan, {
                [anima]: () => this.after_move(s, cell_data),
                [frame]: () => {
                  let now = Date.now()
                  s.animations.tick(now)
                  this.draw_all(s)
                }
              })
              if (done) break
            }
          }
        }
      }
      return 'ok'
    }.bind(this)()
  },

  draw (state) {
    state.frame.send({
      type: 'frame',
    })
  },

  new_game (state, settings) {
    state.input.send({
      type: 'new_game',
      settings: settings,
    })
  },

  pause (state, p) {
    state.input.send({
      type: 'pause',
      pause: p,
    })
  },

  solve (state) {
    state.input.send({
      type: 'solve',
    })
  }
}, {
  start: {},
  new_game: {},
  pause: {},
  solve: {},
  draw: {},
  channel: {
    get: 'output'
  },
})

function new_game (element) {
  let s = {
    // config
    border_width: 4,
    cell_width: 50,
    half_cell: 25,
    animation_time: 250,
    // game settings
    settings: null,
    // game state
    game: null,
    output: make_channel(),
    input: make_channel(0),
    frame: make_channel(0),
    settled: make_channel(),
    // for drawing
    animations: new_animations(),
    canvas_width: 100,
    canvas_height: 100
  }

  Game.static.setup_elements(s, element)

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

  on_showhide (state) {
    state.game.pause(state.document.hidden)
  },
  on_focus (state, e) {
    state.game.pause(e.type === 'blur')
  },
  on_new_game_click (state, e) {
    let settings = state.mode_select.options[state.mode_select.selectedIndex].settings
    state.localStorage.setItem('settings', JSON.stringify(settings))
    state.settings = settings
    state.game.new_game(settings)
  },

  on_win (state, e) {
    let win = e.stats
    let bests = state.stats.post(state.settings.mode, {
      time: -win.time,
      moves: -win.moves
    })

    let msg = `you won in ${win.time} seconds using ${win.moves} moves!`
    if (bests.length > 0) {
      msg += `\nthat\'s your best ${join(bests, ' and ')}!`
    }

    alert(msg)
  },

  start (state) {
    let world = make_channel()
    hook_chan(state.document, 'visibilitychange', world)
    hook_chan(state.document, 'focus', world)
    hook_chan(state.document, 'blur', world)

    let control = make_channel(0)
    hook_chan(state.new_game_button, 'click', control, { tag: 'new_game_click' })
    hook_chan(state.solve_button, 'click', control, { tag: 'solve_click' })

    let game_events = state.game.channel()
    let frame = make_channel(0)

    run_proc(function* () {
      main:
      while (true) {
        let [chan, msg] = yield [world, control, game_events, frame]
        let next = switchy(chan, {
          [game_events]: () => switchy(msg.event, {
            'win': () => this.on_win(state, msg),
            'pause': () => 'pause',
          }),
          [world]: () => switchy(msg.tag, {
            visibilitychange: () => this.on_showhide(state),
            focus: () => this.on_focus(state, msg),
            blur: () => this.on_focus(state, msg)
          }),
          [control]: () => switchy(msg.tag, {
            new_game_click: () => this.on_new_game_click(state),
            solve_click: () => 'solve'
          }),
          [frame]: () => state.game.draw(),
        })

        if (next === 'pause') {
          while (true) {
            let [chan, msg] = yield [world, game_events]
            let next = switchy(chan, {
              [game_events]: () => switchy(msg.event, {
                'unpause': 'unpause',
              }),
              [world]: () => switchy(msg.tag, {
                visibilitychange: () => this.on_showhide(state),
                focus: () => this.on_focus(state, msg),
                blur: () => this.on_focus(state, msg)
              }),
            })
            if (next === 'unpause') {
              continue main
            }
          }
        }

        if (next === 'solve') {
          state.game.solve()
          let [chan, msg] = yield [world, game_events, frame]
          switchy(chan, {
            [world]: () => switchy(msg.tag, {
              visibilitychange: () => this.on_showhide(state),
              default: () => {}
            }),
            [game_events]: () => switchy(msg.event, {
              'solved': () => {}
            }),
            [frame]: () => state.game.draw(),
          })
        }
      }
    }.bind(this))

    state.game.start(state.settings)
    animate(this.draw, [frame])
  },

  draw (frame) {
    frame.send({_p:1})
    animate(this.draw, [frame])
  }
}, {
  start: {}
})

function new_controller (element, document, localStorage, game, stats) {
  let s = {
    document,
    localStorage,
    game,
    stats,
    settings: null,
  }

  Controller.static.load(s)
  Controller.static.setup_elements(s, element)

  return Controller.new(s)
}

main(function ({window, document, localStorage}) {
  if (isProbablyInstalled()) {
    document.body.classList.add('standalone')
  }

  let stats = new_stats(localStorage)
  let game = new_game(select(document, '#game'))
  let controller = new_controller(select(document, '#game'), document, localStorage, game, stats)

  controller.start()
})
