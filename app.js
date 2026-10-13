const matches = [
  { id: "madrid-barcelona", home: "Real Madrid", away: "Barcelona", league: "La Liga", daysAhead: 1, time: "18:00" },
  { id: "city-arsenal", home: "Manchester City", away: "Arsenal", league: "Premier League", daysAhead: 2, time: "16:30" },
  { id: "milan-inter", home: "AC Milan", away: "Inter", league: "Serie A", daysAhead: 4, time: "20:45" },
];

const STORE_NAME = "reminders";
const DB_NAME = "mi-cancha";
const DB_VERSION = 1;
const SYNC_TAG = "mi-primer-sync";
const matchList = document.querySelector("#match-list");
const reminderList = document.querySelector("#reminder-list");
const message = document.querySelector("#app-message");
const notificationButton = document.querySelector("#notification-button");
const installButton = document.querySelector("#install-button");
const connectionStatus = document.querySelector("#connection-status");
let deferredInstallPrompt;
let database;

function matchDate(daysAhead) {
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);
  return date;
}

function formatDate(date) {
  return new Intl.DateTimeFormat("es", { weekday: "short", day: "numeric", month: "short" }).format(date);
}

function showMessage(text, isError = false) {
  message.textContent = text;
  message.classList.toggle("error", isError);
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("No se pudo abrir el almacenamiento local."));
  });
}

function getReminders() {
  return new Promise((resolve, reject) => {
    const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("No se pudieron leer los recordatorios."));
  });
}

function saveReminder(reminder) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(reminder);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("No se pudo guardar el recordatorio."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Se canceló el guardado del recordatorio."));
  });
}

function renderMatches(reminders) {
  const savedIds = new Set(reminders.map((reminder) => reminder.matchId));
  matchList.replaceChildren(...matches.map((match) => {
    const date = matchDate(match.daysAhead);
    const card = document.createElement("article");
    card.className = "match-card";

    const meta = document.createElement("div");
    meta.className = "match-meta";
    const league = document.createElement("span");
    league.className = "league-tag";
    league.textContent = match.league;
    const dateLabel = document.createElement("span");
    dateLabel.className = "match-date";
    const calendarIcon = document.createElement("img");
    calendarIcon.src = "./images/calendar.svg";
    calendarIcon.alt = "";
    dateLabel.textContent = formatDate(date);
    dateLabel.prepend(calendarIcon);
    meta.append(league, dateLabel);

    const teams = document.createElement("div");
    teams.className = "teams";
    const home = document.createElement("span");
    home.className = "team";
    home.textContent = match.home;
    const vs = document.createElement("span");
    vs.className = "vs";
    vs.textContent = "VS";
    const away = document.createElement("span");
    away.className = "team";
    away.textContent = match.away;
    teams.append(home, vs, away);

    const bottom = document.createElement("div");
    bottom.className = "match-bottom";
    const time = document.createElement("span");
    time.className = "match-time";
    time.textContent = `${formatDate(date)} · ${match.time}`;
    const button = document.createElement("button");
    button.className = "remind-button";
    button.type = "button";
    const whistleIcon = document.createElement("img");
    whistleIcon.src = "./images/whistle.svg";
    whistleIcon.alt = "";
    button.append(whistleIcon, document.createTextNode(savedIds.has(match.id) ? "Recordatorio guardado" : "Recordarme"));
    button.disabled = savedIds.has(match.id);
    button.addEventListener("click", () => addReminder(match, button));
    bottom.append(time, button);
    card.append(meta, teams, bottom);
    return card;
  }));
}

async function renderReminders() {
  const reminders = await getReminders();
  reminders.sort((left, right) => left.date - right.date);
  renderMatches(reminders);
  reminderList.replaceChildren(...reminders.map((reminder) => {
    const item = document.createElement("li");
    item.className = "reminder-item";
    const match = document.createElement("span");
    match.textContent = `${reminder.home} vs ${reminder.away}`;
    const date = document.createElement("span");
    date.className = "reminder-date";
    date.textContent = `${formatDate(new Date(reminder.date))} · ${reminder.time}`;
    item.append(match, date);
    return item;
  }));
  if (!reminders.length) {
    const empty = document.createElement("li");
    empty.className = "section-caption";
    empty.textContent = "Todavía no guardaste partidos. Elige uno para tenerlo a mano.";
    reminderList.append(empty);
  }
}

async function requestBackgroundSync() {
  const registration = await navigator.serviceWorker.ready;
  if (!("sync" in registration)) {
    showMessage("Tu navegador no soporta Background Sync (usa Chrome o Edge). El partido sí quedó guardado en este dispositivo.");
    return;
  }
  await registration.sync.register(SYNC_TAG);
  showMessage("Pedido registrado. El navegador avisará al service worker cuando haya conexión.");
}

async function addReminder(match, button) {
  button.disabled = true;
  try {
    const date = matchDate(match.daysAhead);
    await saveReminder({
      id: match.id,
      matchId: match.id,
      home: match.home,
      away: match.away,
      date: date.getTime(),
      time: match.time,
    });
    await renderReminders();
  } catch (error) {
    console.error("No se pudo guardar el partido.", error);
    button.disabled = false;
    showMessage("No se pudo guardar el recordatorio. Revisa el almacenamiento de tu navegador.", true);
    return;
  }

  try {
    await requestBackgroundSync();
  } catch (error) {
    console.warn("El partido se guardó, pero no se pudo registrar Background Sync.", error);
    showMessage("Partido guardado, pero Background Sync no está disponible en este navegador.");
  }
}

function updateConnectionStatus() {
  const online = navigator.onLine;
  connectionStatus.textContent = online ? "En línea" : "Sin conexión · disponible offline";
  connectionStatus.classList.toggle("offline", !online);
}

async function activateNotifications() {
  if (!("Notification" in window)) {
    showMessage("Este navegador no permite mostrar notificaciones.", true);
    return;
  }
  const permission = await Notification.requestPermission();
  if (permission === "granted") {
    notificationButton.textContent = "Notificaciones activadas";
    notificationButton.disabled = true;
    showMessage("¡Listo! Las notificaciones están activadas en este dispositivo.");
    if ("serviceWorker" in navigator) {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification("¡Bienvenido a Mi Cancha!", {
        body: "Las notificaciones están activas. No te pierdas el próximo partido.",
        icon: "./images/icon.svg",
        badge: "./images/icon.svg",
        tag: "mi-cancha-welcome",
      });
    }
  } else {
    showMessage("No se concedió permiso para las notificaciones. Puedes cambiarlo en los ajustes del navegador.", true);
  }
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    showMessage("Este navegador no permite instalar la app ni usar el modo sin conexión.", true);
    return;
  }
  try {
    await navigator.serviceWorker.register("./sw.js");
  } catch (error) {
    console.error("No se pudo iniciar el service worker.", error);
    showMessage("No se pudo activar el modo sin conexión. Abre la app desde HTTPS o localhost.", true);
  }
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (typeof event.data === "string") {
      showMessage(event.data);
    }
  });
}

installButton.addEventListener("click", async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = undefined;
  installButton.hidden = true;
});

notificationButton.addEventListener("click", activateNotifications);
window.addEventListener("online", updateConnectionStatus);
window.addEventListener("offline", updateConnectionStatus);
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  installButton.hidden = false;
});
window.addEventListener("appinstalled", () => {
  installButton.hidden = true;
  showMessage("Mi Cancha quedó instalada. ¡A disfrutar el partido!");
});

if ("Notification" in window && Notification.permission === "granted") {
  notificationButton.textContent = "Notificaciones activadas";
  notificationButton.disabled = true;
}

async function startApp() {
  updateConnectionStatus();
  try {
    database = await openDatabase();
    await renderReminders();
  } catch (error) {
    console.error("No se pudo iniciar el almacenamiento local.", error);
    showMessage("No se pudo abrir el almacenamiento local. Comprueba la configuración del navegador.", true);
  }
  await registerServiceWorker();
}

startApp();
