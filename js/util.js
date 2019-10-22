
export function join (a, s, f) {
  f = f || (e => e.toString())
  s = (s === null ? ',' : s)
  let size = a.length || a.size
  if (size == 0) {
    return ''
  } else if (size == 1) {
    let i = a[Symbol.iterator]()
    return f(i.next().value)
  } else {
    let i = a[Symbol.iterator]()
    let out = f(i.next().value)
    for (let e = i.next(); !e.done; e = i.next()) {
      let n = f(e.value)
      if (n !== null) {
        out += s + f(e.value)
      }
    }
    return out
  }
}

export function mkel(tag, opts) {
  opts = opts || {}
  let e = document.createElement(tag)
  for (let opt in opts) {
    switch (opt) {
      case 'classes':
        e.classList.add(...opts.classes)
        break
      case 'text':
        e.textContent = opts.text
        break
      default:
        e[opt] = opts[opt]
    }
  }
  return e
}

// https://stackoverflow.com/a/6274398
export function shuffle (array) {
    let counter = array.length;

    // While there are elements in the array
    while (counter > 0) {
        // Pick a random index
        let index = Math.floor(Math.random() * counter);

        // Decrease counter by 1
        counter--;

        // And swap the last element with it
        let temp = array[counter];
        array[counter] = array[index];
        array[index] = temp;
    }

    return array;
}

// https://stackoverflow.com/a/52695341
export function isInStandaloneMode () {
  return window.matchMedia('(display-mode: standalone)').matches || (window.navigator.standalone)
}
export function isInFullscreenMode () {
  return window.matchMedia('(display-mode: fullscreen)').matches || (window.navigator.fullscreen)
}
export function isProbablyInstalled () {
  return isInFullscreenMode() || isInStandaloneMode()
}

export function defer (delay, func, args) {
  return setTimeout(function () {
    return func(...args)
  })
}

export function hook (src, event, options, func, args) {
  return src.addEventListener(event, function (e) {
    return func(e, ...args)
  }, options)
}

export function hook_chan (source, event, chan, options) {
  options = options || {}
  options.tag = options.tag || event

  return hook(source, event, options, function (xe) {
    let e = {
      tag: options.tag,
      type: xe.type
    }

    switch (xe.type) {
    case 'click':
      e.x = xe.offsetX
      e.y = xe.offsetY
      break
    }

    chan.send(e)
  }, [])
}

export function switchy (arg, opts) {
  let o = opts[arg]
  if (!o) {
    o = opts['default']
  }
  if (!o) {
    throw new Error('switchy: unhandled ' + arg)
  }
  return o()
}

export function animate (func, args) {
  window.requestAnimationFrame(function() {
    func(...args)
  })
}

export function select (parent, selector) {
  return parent.querySelector(selector)
}

export function main (func) {
  document.addEventListener('DOMContentLoaded', function() {
    func({
      window,
      document,
      localStorage
    })
  })
}
