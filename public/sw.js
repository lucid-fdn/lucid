// Service Worker for Push Notifications
// Handles push events and notification clicks

self.addEventListener('push', (event) => {
  console.log('[ServiceWorker] Push received');
  
  if (!event.data) {
    console.log('[ServiceWorker] Push event but no data');
    return;
  }

  try {
    const data = event.data.json();
    
    const options = {
      body: data.body,
      icon: data.icon || '/lucid.png',
      badge: data.badge || '/lucid.png',
      data: data.data || {},
      actions: [
        { action: 'open', title: 'View' },
        { action: 'close', title: 'Close' },
      ],
      tag: data.tag || 'notification',
      requireInteraction: false,
    };

    event.waitUntil(
      self.registration.showNotification(data.title, options)
    );
  } catch (error) {
    console.error('[ServiceWorker] Error showing notification:', error);
  }
});

self.addEventListener('notificationclick', (event) => {
  console.log('[ServiceWorker] Notification clicked');
  event.notification.close();

  if (event.action === 'close') {
    return;
  }

  // Handle 'open' action or notification body click
  const url = event.notification.data?.url || '/';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Check if there's already a window open
        for (const client of clientList) {
          if (client.url === url && 'focus' in client) {
            return client.focus();
          }
        }
        // Open new window if none found
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
  );
});

self.addEventListener('install', (event) => {
  console.log('[ServiceWorker] Installing...');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[ServiceWorker] Activating...');
  event.waitUntil(self.clients.claim());
});
