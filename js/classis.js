
const OBJECT_META = Symbol('_object')

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
    let a = ms[m].bind(ms, state)
    o[m] = a
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

const Channel = make_class('channel', {
  send (state, msg) {
    if (state.hook) {
      this.run_hook(state, msg)
      return true
    }
    if (state.array.length < state.cap) {
      state.array.push(msg)
      return true
    }
    return false
  },
  recv () {
    return state.array.unshift()
  },
  hook (state, func, args) {
    state.hook = {
      func, args
    }
    let e = state.array.unshift()
    if (e) {
      this.run_hook(state, e)
    }
  },
  run_hook (state, e) {
    let hook = state.hook
    setTimeout(function () {
      hook.func(e, ...hook.args)
    }, 0)
    state.hook = null
  }
}, {
  send: {},
  recv: {},
  hook: {}
})

export function make_channel (cap) {
  cap = cap === undefined ? 10000 : cap
  let array = []
  return Channel.new({
    cap,
    array
  })
}

export function run_proc (gen) {
  let ctx = {
    on: function (chans) {
      let yon = chans
      let cb = function (e, chan) {
        if (yon !== null) {
          proc.next([chan, e])
          yon = null
        }
      }
      for (let chan of chans) {
        chan.hook(cb, [chan])
      }
    }
  }

  let proc = gen(ctx)
}
