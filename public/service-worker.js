// Service Worker for CINEMASTER PWA
const CACHE_NAME = 'cinemaster-v1.17.5';

// Only cache essential files that we know exist
const ESSENTIAL_CACHE = [
  '/',
  '/index.html',
  '/manifest.json'
];

// Install event - cache only essential files
self.addEventListener('install', (event) => {
  console.log('✅ [Service Worker] Installing', CACHE_NAME, '...');
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
  console.log('✅ [Service Worker] Activating', CACHE_NAME, '...');
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

  // Network First with Cache Fallback for static assets (so fresh CSS/JS always wins)
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (!response || response.status !== 200 || response.type === 'error') {
          return response;
        }

        // Don't cache video files (too large)
        if (url.pathname.includes('.mp4') || url.pathname.includes('.webm')) {
          return response;
        }

        // Cache static assets (JS, CSS, images, fonts)
        if (
          url.pathname.startsWith('/static/') ||
          url.pathname.startsWith('/assets/') ||
          url.pathname.match(/\.(js|css|png|jpg|jpeg|webp|svg|woff|woff2|ico)$/)
        ) {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
        }

        return response;
      })
      .catch((error) => {
        console.error('❌ [Service Worker] Fetch failed, trying cache:', url.pathname, error);
        return caches.match(request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
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