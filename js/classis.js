
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
      let a = function () {
        let chan = state[def['async']]
        chan.send(arguments)
      }
      a[ASYNC] = true
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
    cap: cap === undefined ? 10000 : cap,
    array: [],
    hook: null
  }

  return {
    send: (msg) => send(state, msg),
    hook: (func, args) => hook(state, func, args),
    toString: () => id
  }
}

export function run_proc (gen, self) {
  let ctx = {
    on: function (chans) {
      let yon = chans
      let cb = function (e, chan) {
        if (!yon) {
          return
        }
        yon = null
        proc.next([chan, e])
      }
      for (let chan of chans) {
        chan.hook(cb, [chan])
      }
    }
  }

  if (self) {
    gen = gen.bind(self)
  }

  let proc = gen(ctx)
  proc.next()
}
