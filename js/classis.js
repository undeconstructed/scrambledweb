
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
