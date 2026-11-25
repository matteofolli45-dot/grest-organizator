self.addEventListener('push', event => {
    let payload = {};
    try {
        payload = event.data ? event.data.json() : {};
    } catch (error) {
        console.error('Payload della notifica non valido:', error);
    }

    const title = payload.title || 'Grest Organizator';
    const options = {
        body: payload.body || 'Ci sono nuovi aggiornamenti.',
        icon: './icons/grest-icon.svg',
        badge: './icons/grest-icon.svg',
        data: { url: payload.url || './index.html' }
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
    event.notification.close();
    const requestedUrl = new URL(event.notification.data?.url || './index.html', self.registration.scope);
    const scopeUrl = new URL(self.registration.scope);
    const targetUrl = requestedUrl.origin === scopeUrl.origin &&
        requestedUrl.pathname.startsWith(scopeUrl.pathname)
        ? requestedUrl.href
        : new URL('./index.html', scopeUrl).href;

    event.waitUntil((async () => {
        const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const client of windows) {
            if (client.url.startsWith(scopeUrl.origin + scopeUrl.pathname) && 'focus' in client) {
                await client.navigate(targetUrl);
                return client.focus();
            }
        }
        return self.clients.openWindow(targetUrl);
    })());
});
