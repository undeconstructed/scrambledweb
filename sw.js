const VERSION = '0.3r2'

self.addEventListener('install', function (e) {
  // console.log('sw install', VERSION)
  e.waitUntil(
    caches.open(VERSION).then(function (cache) {
      return cache.addAll([
        'index.html',
        'index.js',
        'icon.png',
        'css/normalize.css',
        'css/main.css',
        'js/classis.js',
        'js/main.js',
        'js/util.js',
      ])
    })
  )
})

self.addEventListener('activate', function (e) {
  // console.log('sw activate', VERSION)
  e.waitUntil(
    caches.keys().then(function (keys) {
      let ps = []
      for (let key of keys) {
        if (key !== VERSION) {
          // console.log('sw deleting cache', key)
          ps.push(caches.delete(key))
        }
      }
      return Promise.all(ps)
    })
  )
})

self.addEventListener('fetch', function (e) {
  // console.log('sw fetch', VERSION, e.request)
  e.respondWith(
    caches.match(e.request).then(function (response) {
      return response || fetch(e.request)
    })
  )
})
