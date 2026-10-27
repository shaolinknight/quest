/* Quest Board — offline support.
   Keeps a copy of the app so it opens with no signal. When you're online it
   always tries the network first, so a new version on Netlify shows up on the
   next launch; the saved copy is only used when the network is slow or gone.
   Google Sheet requests are never touched here; the app's own sync handles those. */
var CACHE = 'quest-board-3.8';
var PAGE = './';

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll([PAGE]); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('quest-board-') === 0 && k !== CACHE; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function timeout(ms) { return new Promise(function (_, rej) { setTimeout(function () { rej(new Error('slow')); }, ms); }); }

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);

  /* the app page: network first (3s), fall back to the saved copy */
  if (req.mode === 'navigate' || (url.origin === location.origin && (url.pathname.endsWith('/') || url.pathname.endsWith('index.html')))) {
    e.respondWith(
      Promise.race([fetch(req), timeout(3000)]).then(function (res) {
        if (res && res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(PAGE, copy); }); }
        return res;
      }).catch(function () {
        return caches.match(PAGE).then(function (hit) { return hit || fetch(req); });
      })
    );
    return;
  }

  /* fonts: they never change, so the saved copy wins */
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.match(req).then(function (hit) {
      return hit || fetch(req).then(function (res) {
        var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); return res;
      });
    }));
  }
  /* everything else (the Google Sheet connector) goes straight to the network */
});
