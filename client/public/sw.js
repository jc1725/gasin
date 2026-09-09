self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));

self.addEventListener("push", event => {
  const payload = event.data ? event.data.json() : {};
  event.waitUntil(self.registration.showNotification(payload.title || "가신 가격 알림", {
    body: payload.body || "관심 상품의 가격을 확인해 주세요.",
    icon: payload.icon || "/manus-storage/gasyn-text-shortcut-icon-preview_1bf92205.png",
    badge: "/manus-storage/gasyn-text-shortcut-icon-preview_1bf92205.png",
    tag: payload.tag || "gasyn-price-alert",
    data: { url: payload.url || "/favorites" },
  }));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/favorites";
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find(client => client.url.startsWith(self.location.origin));
    if (existing) return existing.focus().then(() => existing.navigate(targetUrl));
    return self.clients.openWindow(targetUrl);
  })());
});
