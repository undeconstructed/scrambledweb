// https://github.com/mdn/pwa-examples/blob/master/a2hs/sw.js

self.addEventListener('install', function(e) {
 e.waitUntil(
   caches.open('1').then(function(cache) {
     return cache.addAll([
       'index.html',
       'index.js',
       'icon.png',
       'css/normalize.css',
       'css/main.css',
       'js/main.js',
       'js/util.js'
     ]);
   })
 );
});

self.addEventListener('fetch', function(e) {
  // console.log(e.request.url);
  e.respondWith(
    caches.match(e.request).then(function(response) {
      return response || fetch(e.request);
    })
  );
});
