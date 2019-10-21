# scrambled web

This is two things:

* A clone of an Android game called Scrambled Net, which is not updated anymore
and doesn't scale well to my screen size.

* An experiment in writing JavaScript in a way that is not surprising. There's
a tiny custom class system, with the very least magic possible, all state is
explicitly captured and passed, there's a public API on objects, etc.


## classis.js

JavaScript has continuations, yet doesn't let you use them without `function*` and `yield`. This package implements Go style things in JavaScript. Maybe now I can write async code with normal looking flow, and none of that callback or callback-but-called-promises stuff.

* Simplified classes, with explicit state.
* Channels

```JavaScript
const Thing = make_class('thing', {
  internal_thing (args) {
  },
  operation1 (state, arg1) {
    state.ch.send(arg1)
  },
  start (state, chan0) {
    this.internal_thing(state.val)
    let chan1 = state.ch
    run_proc(function* (ctx) {
      while (true) {
        let (chan, msg) = yield [chan0, chan1]
        switchy(chan, {
          [chan0]: () => foo,
          [chan1]: () => bar,
        })
        yield this.sub()
      }
    })
  },
  sub () {
    return function* () {
      // blah
    }
  },
}, {
  start: {},
  val: { get: 'val' },
  operation1: {},
  op: { async: 'ch' },
})

function new_thing (arg) {
  let state = {
    val: arg,
    ch: make_chan(),
  }

  return Thing.new(state)
}

let t = new_thing(1)
let ch = make_chan()
t.start(ch)
ch.send('test')
t.operation1('arg')
```
