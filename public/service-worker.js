// Service Worker for Movie Chain PWA
const CACHE_NAME = 'moviechain-v1.3.0';

// Only cache essential files that we know exist
const ESSENTIAL_CACHE = [
  '/',
  '/index.html',
  '/manifest.json'
];

// Install event - cache only essential files
self.addEventListener('install', (event) => {
  console.log('✅ [Service Worker] Installing v1.3.0...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('✅ [Service Worker] Caching essential files');
        return cache.addAll(ESSENTIAL_CACHE).catch((error) => {
          console.error('❌ [Service Worker] Essential cache failed:', error);
        });
      })
  );
  self.skipWaiting();
});

// Activate event - clean old caches and take control immediately
self.addEventListener('activate', (event) => {
  console.log('✅ [Service Worker] Activating v1.3.0...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('🗑️ [Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('✅ [Service Worker] Now controlling all pages');
      return self.clients.claim();
    })
  );
});

// Fetch event - Network First for HTML, Cache First for static assets
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip cross-origin requests (Firebase, APIs, etc.)
  if (url.origin !== self.location.origin) {
    return;
  }

  // Network First strategy for HTML documents
  if (request.destination === 'document' || url.pathname === '/' || url.pathname.endsWith('.html')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache the new version
          if (response && response.status === 200) {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseToCache);
            });
          }
          return response;
        })
        .catch(() => {
          // Fallback to cache if offline
          return caches.match(request).then((cachedResponse) => {
            return cachedResponse || caches.match('/index.html');
          });
        })
    );
    return;
  }

  // Cache First with Network Fallback for static assets
  event.respondWith(
    caches.match(request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          console.log('📦 [Service Worker] Serving from cache:', url.pathname);
          return cachedResponse;
        }

        // Not in cache - fetch from network
        return fetch(request).then((response) => {
          // Check if valid response
          if (!response || response.status !== 200 || response.type === 'error') {
            return response;
          }

          // Don't cache video files (too large)
          if (url.pathname.includes('.mp4') || url.pathname.includes('.webm')) {
            console.log('🎥 [Service Worker] Not caching video:', url.pathname);
            return response;
          }

          // Cache static assets (JS, CSS, images, fonts)
          if (
            url.pathname.startsWith('/static/') ||
            url.pathname.startsWith('/assets/') ||
            url.pathname.match(/\.(js|css|png|jpg|jpeg|webp|svg|woff|woff2|ico)$/)
          ) {
            console.log('💾 [Service Worker] Caching asset:', url.pathname);
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseToCache);
            });
          }

          return response;
        }).catch((error) => {
          console.error('❌ [Service Worker] Fetch failed:', url.pathname, error);
          // Fallback for offline
          if (request.destination === 'document') {
            return caches.match('/index.html');
          }
          throw error;
        });
      })
  );
});

// Handle messages from the app
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('⏭️ [Service Worker] Skipping waiting...');
    self.skipWaiting();
  }
});