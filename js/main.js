
import { mkel, shuffle } from './util.js'

function new_object (fs, ms) {
  if (!ms) {
    ms = fs
    fs = null
  }

  let o = {}
  for (let m in ms) {
    o[m] = ms[m].bind(fs)
  }

  return Object.seal(o)
}

// t, r, b, l => b, l, t, r
const opposites = [ 2, 3, 0, 1 ]

function new_field (w, h) {
  let array = Array(w * h)

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

  const find_lit = () => {
    let queue = array.filter(e => e.type === 'src')
    let lit = new Set(queue.map(e => e.n))

    while (queue.length > 0) {
      let c0 = queue.shift()
      for (let s = 0; s < 4; s++) {
        if (c0.routes[s]) {
          let nn = c0.neighbours[s]
          // console.log(c0.n, c0.routes, s, nn)
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
  }

  {
    {
      let src = array[Math.floor(Math.random() * array.length)]
      src.type = 'src'
    }

    let num_tgts = 10

    {
      let num_joints = 0
      for (let cell of array) {
        let n = cell.routes.filter(e => e).length
        if (cell.type === 'pipe') {
          num_joints += n-2
        } else if (cell.type === 'src') {
          num_joints += n
        }
      }

      let changed = true
      while (num_joints > num_tgts && changed) {
        changed = false
        for (let cell of shuffle(Array.from(array))) {
          if (cell.type === 'tgt') {
            continue
          }
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
            if (find_lit().size === w*h) {
              num_joints--
              changed = true
              break
            }
            cell.routes[i] = true
          }
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
              continue cells
            }
          }
        }
      }
    }
  }

  for (let cell of array) {
    let n = Math.random()*4
    for (let r = 0; r < n; r++) {
      cell.routes.unshift(cell.routes.pop())
    }
  }

  let s = {
    lit: find_lit()
  }

  return new_object({
    rotate: (x, y) => {
      let cell = array[(y * w) + x]
      cell.routes.unshift(cell.routes.pop())
      s.lit = find_lit()
    },
    rows: function* () {
      for (let y = 0; y < h; y++) {
        yield function*() {
          for (let x = 0; x < w; x++) {
            let c = array[(y * w) + x]
            yield {
              type: c.type,
              on: s.lit.has(c.n),
              routes: c.routes
            }
          }
        }
      }
    }
  })
}

function new_game (element, opts) {
  let w = 6
  let h = 7

  let border_width = 4

  let cell_width = 50

  let canvas_width = w*cell_width + border_width*2
  let canvas_height = h*cell_width + border_width*2

  let field = new_field(w, h)

  let canvas = mkel('canvas', { width: canvas_width, height: canvas_height })
  element.appendChild(canvas)

  const drawBorder = (ctx) => {
    ctx.save()
    ctx.strokeStyle = 'rgba(0,0,0,1)'
    ctx.lineWidth = border_width
    ctx.rect(border_width/2, border_width/2, canvas_width - border_width, canvas_height - border_width)
    ctx.stroke()
    ctx.restore()
  }
  const drawSrc = (ctx, routes) => {
    ctx.save()
    ctx.translate(cell_width/2, cell_width/2)
    ctx.fillStyle = 'rgba(0,0,0,1)'

    for (let y of routes) {
      if (y) {
        ctx.fillRect(-2, 0, 4, -cell_width/2)
      }
      ctx.rotate(Math.PI/2)
    }

    ctx.beginPath()
    ctx.arc(0, 0, 10, 0, Math.PI * 2, true)
    ctx.fill()

    ctx.restore()
  }
  const drawPipe = (ctx, on, routes) => {
    ctx.save()
    ctx.translate(cell_width/2, cell_width/2)
    ctx.fillStyle = 'rgba(0,0,0,1)'

    for (let y of routes) {
      if (y) {
        ctx.fillRect(-2, 0, 4, -cell_width/2)
      }
      ctx.rotate(Math.PI/2)
    }

    ctx.restore()
  }
  const drawTgt = (ctx, on, routes) => {
    ctx.save()
    ctx.translate(cell_width/2, cell_width/2)
    ctx.fillStyle = 'rgba(255,255,255,1)'

    for (let y of routes) {
      if (y) {
        ctx.fillRect(-2, 0, 4, -cell_width/2)
      }
      ctx.rotate(Math.PI/2)
    }

    ctx.beginPath()
    ctx.arc(0, 0, 10, 0, Math.PI * 2, true)
    ctx.fill()

    ctx.restore()
  }
  const drawCell = (ctx, cell) => {
    ctx.save()
    if (cell.on) {
      ctx.fillStyle = 'rgba(0,255,0,1)'
    } else {
      ctx.fillStyle = 'rgba(255,0,0,1)'
    }
    ctx.fillRect(1, 1, cell_width-2, cell_width-2)
    switch (cell.type) {
      case 'src':
        drawSrc(ctx, cell.routes)
        break
      case 'tgt':
        drawTgt(ctx, cell.on, cell.routes)
        break
      case 'pipe':
        drawPipe(ctx, cell.on, cell.routes)
        break
    }
    ctx.restore()
  }
  const drawCells = (ctx) => {
    ctx.save()
    for (let r of field.rows()) {
      ctx.save()
      for (let c of r()) {
        drawCell(ctx, c)
        ctx.translate(cell_width, 0)
      }
      ctx.restore()
      ctx.translate(0, cell_width)
    }
    ctx.restore()
  }
  const draw = () => {
    let ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas_width, canvas_height)

    ctx.save()
    drawBorder(ctx)
    ctx.translate(border_width, border_width)
    drawCells(ctx)
    ctx.restore()

    // window.requestAnimationFrame(draw)
  }

  const on_click = (e) => {
    let x = Math.floor((e.offsetX - border_width) / cell_width)
    let y = Math.floor((e.offsetY - border_width) / cell_width)
    field.rotate(x, y)
    draw()
  }

  return new_object({
    start: () => {
      draw()
      canvas.addEventListener('click', on_click)
    },
    log: () => {
      for (let r of field.rows()) {
        for (let c of r()) {
          console.log(c)
        }
      }
    }
  })
}

document.addEventListener('DOMContentLoaded', e => {
  let game = new_game(document.getElementById('game'))
  game.start()
  // game.log()
})
