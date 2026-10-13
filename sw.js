const CACHE_NAME = "mi-cancha-v8";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./images/icon.svg",
  "./images/icon-maskable.svg",
  "./images/icon-monochrome.svg",
  "./icono/icon-192.png",
  "./icono/icon-512.png",
  "./icono/icon-maskable-192.png",
  "./icono/icon-maskable-512.png",
  "./icono/icon-72x72.png",
  "./icono/icon-96x96.png",
  "./icono/icon-128x128.png",
  "./icono/icon-144x144.png",
  "./icono/icon-152x152.png",
  "./icono/icon-192x192.png",
  "./icono/icon-384x384.png",
  "./icono/icon-512x512.png",
  "./images/football.svg",
  "./images/trophy.svg",
  "./images/calendar.svg",
  "./images/bell.svg",
  "./images/whistle.svg",
  "./images/boot.svg",
  "./images/stadium.svg",
];
const SYNC_TAG = "mi-primer-sync";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key !== CACHE_NAME)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  if (request.cache === "no-cache" || request.cache === "no-store") {
    event.respondWith(fetch(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put("./index.html", copy)));
          return response;
        })
        .catch(async () => (await caches.match(request)) ?? (await caches.match("./index.html"))),
    );
    return;
  }

  event.respondWith(caches.match(request).then((cached) => cached ?? fetch(request).then((response) => {
    if (response.ok) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)));
    }
    return response;
  })));
});

self.addEventListener("sync", (event) => {
  if (event.tag === SYNC_TAG) event.waitUntil(enviarDatos());
});

async function enviarDatos() {
  const respuesta = await fetch("./datos.json", { cache: "no-store" });
  if (!respuesta.ok) {
    throw new Error(`Falló la sincronización: ${respuesta.status}`);
  }
  await avisarALaPagina("✅ Datos enviados");
}

async function avisarALaPagina(texto) {
  const ventanas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  ventanas.forEach((ventana) => ventana.postMessage(texto));
}

self.addEventListener("push", (event) => {
  let payload = {};
  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload = { body: event.data.text() };
    }
  }
  const title = typeof payload.title === "string" ? payload.title : "Novedades de Mi Cancha";
  const options = {
    body: typeof payload.body === "string" ? payload.body : "Hay novedades para ti.",
    icon: "./images/icon.svg",
    badge: "./images/icon.svg",
    data: { url: typeof payload.url === "string" ? payload.url : "./" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url ?? "./", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existingClient = clients.find((client) => client.url === targetUrl);
      if (existingClient) return existingClient.focus();
      return self.clients.openWindow(targetUrl);
    }),
  );
});
