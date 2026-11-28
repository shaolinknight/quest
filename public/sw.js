/* Quest Board — offline support.
   Keeps a copy of the app so it opens with no signal. When you're online it
   always tries the network first, so a new version shows up on the next
   launch; the saved copy is only used when the network is slow or gone.
   Cloud sync requests (Supabase) are never touched here; the app handles those.
   It also shows the evening reminders, which arrive even when the app is closed. */
var CACHE = 'quest-board-5.3';
var PAGE = './';
var EXTRAS = ['manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    /* the icons are nice to have offline, but never let a missing one block the app */
    EXTRAS.forEach(function (f) { c.add(f).catch(function () {}); });
    return c.addAll([PAGE]);
  }).then(function () { return self.skipWaiting(); }));
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

  /* the install icons and manifest: saved copy first, network to refresh */
  if (url.origin === location.origin && EXTRAS.some(function (f) { return url.pathname.endsWith('/' + f); })) {
    e.respondWith(caches.match(req).then(function (hit) {
      var net = fetch(req).then(function (res) { if (res && res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); } return res; }).catch(function () { return hit; });
      return hit || net;
    }));
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
  /* everything else (cloud sync with Supabase) goes straight to the network */
});

/* evening reminders from Supabase */
self.addEventListener('push', function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Quest Board', {
    body: d.body || '', icon: 'icon-192.png', badge: 'icon-192.png',
    tag: d.tag || 'quest-board', data: { url: d.url || './' }
  }));
});
/* tapping it opens Quest Board (or brings it forward if it's already open) */
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) { if ('focus' in list[i]) return list[i].focus(); }
    return self.clients.openWindow ? self.clients.openWindow(url) : null;
  }));
});
