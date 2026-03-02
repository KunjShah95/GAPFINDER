// ============================================================================
// GapMiner Service Worker
// Enhanced PWA with offline support, caching, and background sync
// ============================================================================

/// <reference lib="webworker" />

declare const self: ServiceWorkerGlobalScope;

const CACHE_NAME = 'gapminer-v1';
const STATIC_CACHE = 'gapminer-static-v1';
const DYNAMIC_CACHE = 'gapminer-dynamic-v1';
const OFFLINE_URL = '/offline.html';

const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/offline.html',
    '/favicon.ico',
];

// ============================================================================
// Install Event - Cache static assets
// ============================================================================

self.addEventListener('install', (event: ExtendableEvent) => {
    console.log('[SW] Installing...');
    
    event.waitUntil(
        Promise.all([
            // Cache static assets
            caches.open(STATIC_CACHE).then((cache) => {
                console.log('[SW] Caching static assets');
                return cache.addAll(STATIC_ASSETS);
            }),
            // Skip waiting to activate immediately
            self.skipWaiting()
        ])
    );
});

// ============================================================================
// Activate Event - Clean up old caches
// ============================================================================

self.addEventListener('activate', (event: ExtendableEvent) => {
    console.log('[SW] Activating...');
    
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((name) => name !== STATIC_CACHE && name !== DYNAMIC_CACHE)
                    .map((name) => {
                        console.log('[SW] Deleting old cache:', name);
                        return caches.delete(name);
                    })
            );
        }).then(() => {
            return self.clients.claim();
        })
    );
});

// ============================================================================
// Fetch Event - Network-first with cache fallback
// ============================================================================

self.addEventListener('fetch', (event: FetchEvent) => {
    const { request } = event;
    const url = new URL(request.url);

    // Skip non-GET requests
    if (request.method !== 'GET') {
        return;
    }

    // Skip Chrome extensions
    if (url.protocol === 'chrome-extension:') {
        return;
    }

    // For navigation requests (HTML pages), use network-first
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    // Cache successful responses
                    const responseClone = response.clone();
                    caches.open(DYNAMIC_CACHE).then((cache) => {
                        cache.put(request, responseClone);
                    });
                    return response;
                })
                .catch(() => {
                    // Try cache first
                    return caches.match(request).then((cachedResponse) => {
                        if (cachedResponse) {
                            return cachedResponse;
                        }
                        // Fallback to offline page
                        return caches.match(OFFLINE_URL).then((offlineResponse) => {
                            return offlineResponse || new Response('Offline', { status: 503 });
                        });
                    });
                })
        );
        return;
    }

    // For API requests, use network-first with cache fallback
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    // Cache GET API responses
                    if (response.ok) {
                        const responseClone = response.clone();
                        caches.open(DYNAMIC_CACHE).then((cache) => {
                            cache.put(request, responseClone);
                        });
                    }
                    return response;
                })
                .catch(() => {
                    return caches.match(request).then((cachedResponse) => {
                        return cachedResponse || new Response('Network error', { status: 503 });
                    });
                })
        );
        return;
    }

    // For static assets (JS, CSS, images), use cache-first
    if (
        request.destination === 'script' ||
        request.destination === 'style' ||
        request.destination === 'image' ||
        request.destination === 'font'
    ) {
        event.respondWith(
            caches.match(request).then((cachedResponse) => {
                if (cachedResponse) {
                    // Return cached response and update cache in background
                    fetch(request).then((response) => {
                        if (response.ok) {
                            caches.open(STATIC_CACHE).then((cache) => {
                                cache.put(request, response);
                            });
                        }
                    });
                    return cachedResponse;
                }
                
                // Not in cache, fetch and cache
                return fetch(request).then((response) => {
                    if (response.ok) {
                        const responseClone = response.clone();
                        caches.open(STATIC_CACHE).then((cache) => {
                            cache.put(request, responseClone);
                        });
                    }
                    return response;
                });
            }).catch(() => {
                return new Response('Asset not found', { status: 404 });
            })
        );
        return;
    }

    // Default: network-first
    event.respondWith(
        fetch(request).catch(() => 
            caches.match(request).then((cachedResponse) => {
                return cachedResponse || new Response('Not found', { status: 404 });
            })
        )
    );
});

// ============================================================================
// Background Sync - For offline actions
// ============================================================================

self.addEventListener('sync', (event: any) => {
    console.log('[SW] Background sync:', event.tag);

    if (event.tag === 'sync-gaps') {
        event.waitUntil(syncQueuedGaps());
    }

    if (event.tag === 'sync-papers') {
        event.waitUntil(syncQueuedPapers());
    }
});

async function syncQueuedGaps() {
    console.log('[SW] Syncing queued gaps...');
    // In production, read from IndexedDB and sync with server
}

async function syncQueuedPapers() {
    console.log('[SW] Syncing queued papers...');
    // In production, read from IndexedDB and sync with server
}

// ============================================================================
// Push Notifications
// ============================================================================

self.addEventListener('push', (event: PushEvent) => {
    console.log('[SW] Push notification received');
    
    const data = event.data?.json() || {};
    
    const options: any = {
        body: data.body || 'New notification from GapMiner',
        icon: '/logo192.png',
        badge: '/logo192.png',
        data: {
            url: data.url || '/',
            dateOfArrival: Date.now(),
        },
        actions: [
            { action: 'view', title: 'View' },
            { action: 'dismiss', title: 'Dismiss' },
        ],
    };

    event.waitUntil(
        self.registration.showNotification(data.title || 'GapMiner', options)
    );
});

// ============================================================================
// Notification Click
// ============================================================================

self.addEventListener('notificationclick', (event: NotificationEvent) => {
    console.log('[SW] Notification clicked');
    
    event.notification.close();

    if (event.action === 'view' || !event.action) {
        const url = event.notification.data?.url || '/';
        
        event.waitUntil(
            self.clients.matchAll({ type: 'window', includeUncontrolled: true })
                .then((clientList) => {
                    // Focus existing window if open
                    for (const client of clientList) {
                        if (client.url === url && 'focus' in client) {
                            return client.focus();
                        }
                    }
                    // Open new window
                    if (self.clients.openWindow) {
                        return self.clients.openWindow(url);
                    }
                })
        );
    }
});

// ============================================================================
// Message Handler - For communication with main app
// ============================================================================

self.addEventListener('message', (event: ExtendableMessageEvent) => {
    console.log('[SW] Message received:', event.data);

    if (event.data?.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }

    if (event.data?.type === 'GET_VERSION') {
        event.ports[0].postMessage({ version: CACHE_NAME });
    }
});

export { };
