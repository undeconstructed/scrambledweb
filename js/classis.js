
const OBJECT_META = Symbol('_object')
const ASYNC = Symbol('async')

const assert = console.assert

export function make_class (name, fs, api) {
  let ms = {}
  for (let f in fs) {
    let m = fs[f].bind(ms)
    ms[f] = m
  }
  ms = Object.seal(ms)

  return Object.seal({
    static: ms,
    new (state) {
      return new_object(state, ms, api, name)
    }
  })
}

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

function new_object (state, ms, api, type) {
  let o = {}

  for (let m in api) {
    let def = api[m]
    if (def['async']) {
      let inner = ms[m].bind(ms, state)
      let chan_name = def['async']
      let a = function () {
        let chan = state[chan_name]
        chan.send(arguments)
      }
      a[ASYNC] = true
      o[m] = a
    } else if (def['get']) {
      let field = def['get']
      let a = function () {
        return state[field]
      }
      o[m] = a
    } else {
      let a = ms[m].bind(ms, state)
      o[m] = a
    }
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

function send (state, msg) {
  if (state.hook) {
    run_hook(state, msg)
    return true
  }
  if (state.array.length < state.cap) {
    state.array.push(msg)
    return true
  }
  return false
}

function hook (state, func, args) {
  state.hook = {
    func, args
  }
  let msg = state.array.shift()
  if (msg) {
    run_hook(state, msg)
  }
}

function unhook (state, func, args) {
  state.hook = null
}

function run_hook (state, msg) {
  let hook = state.hook
  state.hook = null
  setTimeout(function () {
    hook.func(msg, ...hook.args)
  }, 0)
}

let chan_count = 0

export function make_channel (cap) {
  let id = 'chan_' + chan_count++

  let state = {
    id: id,
    cap: cap === undefined ? 10000 : cap,
    array: [],
    hook: null
  }

  return {
    send: (msg) => send(state, msg),
    hook: (func, args) => hook(state, func, args),
    unhook: (func, args) => unhook(state, func, args),
    empty: () => {
      let out = state.array
      state.array = []
      return out
    },
    toString: () => id,
  }
}

function process_proc_yield (proc, y) {
  if (y.done) {
    proc.stack.shift()
    if (proc.stack.length === 0) {
      return
    }

    iterate_proc(proc, y.value)
  } else if (Array.isArray(y.value)) {
    let chans = y.value
    let fired = false

    let cb = function (msg, chan) {
      if (fired) {
        return
      }
      fired = false

      for (let chan of chans) {
        chan.unhook(cb, [chan])
      }

      iterate_proc(proc, [chan, msg])
    }

    for (let chan of chans) {
      chan.hook(cb, [chan])
    }
  } else if (y.value.next) {
    let gen = y.value
    proc.stack.unshift(gen)

    iterate_proc(proc, null)
  } else {
    console.log(y)
  }
}

function iterate_proc(proc, value) {
  setTimeout(function () {
    let y = null
    try {
      y = proc.stack[0].next(value)
    } catch (e) {
      console.log('proc error', e, proc)
      throw e
    }
    process_proc_yield(proc, y)
  }, 0)
}

export function run_proc (gen) {
  let proc = {
    stack: [ gen ],
  }

  iterate_proc(proc, null)
}
