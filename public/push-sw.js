/* Service worker powiadomień push panelu operatora (Finance You).
 * Rejestrowany z src/hooks/use-push-notifications.ts. Zakres "/" — plik musi
 * być serwowany z katalogu głównego (public/push-sw.js).
 * Ładunek: JSON { title, body, url, tag, event, timestamp } —
 * patrz src/lib/operator-push.server.ts. */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: "Finance You", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Finance You";
  const options = {
    body: data.body || "",
    tag: data.tag || undefined,
    renotify: Boolean(data.tag),
    data: { url: data.url || "/operator" },
  };
  if (data.icon) {
    options.icon = data.icon;
    options.badge = data.icon;
  }
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/operator";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // Preferuj już otwartą kartę panelu — nawiguj i wyostrz;
      // przy braku uprawnień do nawigacji otwórz nowe okno.
      for (const client of clientList) {
        if ("focus" in client && "navigate" in client) {
          return client
            .navigate(url)
            .then((c) => (c && c.focus ? c.focus() : undefined))
            .catch(() => self.clients.openWindow(url));
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
