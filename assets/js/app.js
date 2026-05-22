/**
 * Smart Home Rendang — app.js
 * MQTT controller for lighting, gate, temperature, and CCTV
 * Real-time sync: all devices stay in sync via retained MQTT messages
 */

// ─────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────
const CONFIG = {
  broker:   "broker.emqx.io",
  port:     8084,
  useSSL:   true,
  clientId: "WebSHR-" + Math.floor(Math.random() * 1e6),

  topics: {
    suhu:   "proyekiot/sensor/suhu",
    ipcam:  "proyekiot/ipcam",
    gerbang:"proyekiot/gerbang",
    lampu:  "proyekiot/lampu/",  // + room name
  }
};

const ROOMS = ["teras", "tamu", "tidur", "dapur"];

// ─────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────
const state = {
  lampu:     { teras: 0, tamu: 0, tidur: 0, dapur: 0 },
  camIP:     "",
  camOnline: false,
  gateActive: false,
};

// ─────────────────────────────────────────────
// THEME
// ─────────────────────────────────────────────
function initTheme() {
  // Check saved preference, then system preference
  const saved = localStorage.getItem("smh-theme");
  if (saved === "light") {
    document.documentElement.classList.add("light");
  } else if (saved === "dark") {
    document.documentElement.classList.remove("light");
  } else {
    // Use system preference if no saved choice
    if (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) {
      document.documentElement.classList.add("light");
    }
  }
}

function toggleTheme() {
  const isLight = document.documentElement.classList.toggle("light");
  localStorage.setItem("smh-theme", isLight ? "light" : "dark");
  showToast(isLight ? "☀ Light mode" : "● Dark mode");
}

// ─────────────────────────────────────────────
// MQTT
// ─────────────────────────────────────────────
const client = new Paho.MQTT.Client(CONFIG.broker, CONFIG.port, CONFIG.clientId);

client.onConnectionLost = (err) => {
  console.warn("[MQTT] Connection lost:", err.errorMessage);
  setConnStatus("OFFLINE");
  // auto-reconnect after 5s
  setTimeout(mqttConnect, 5000);
};

client.onMessageArrived = (msg) => {
  const { destinationName: topic, payloadString: payload } = msg;

  // ── Temperature ──
  if (topic === CONFIG.topics.suhu) {
    document.getElementById("suhu").innerHTML = `${payload}<small>°C</small>`;
    return;
  }

  // ── Camera IP ──
  if (topic === CONFIG.topics.ipcam) {
    updateCamIP(payload);
    return;
  }

  // ── Gate status (from any device) ──
  if (topic === CONFIG.topics.gerbang) {
    applyGateState(payload.trim());
    return;
  }

  // ── Lamp brightness (from any device) ──
  ROOMS.forEach(room => {
    if (topic === CONFIG.topics.lampu + room) {
      const val = parseInt(payload) || 0;
      state.lampu[room] = val;
      // update slider position without re-publishing
      const slider = document.getElementById(`slider-${room}`);
      if (slider) slider.value = val;
      updateLampCard(room, val);
    }
  });
};

function mqttConnect() {
  setConnStatus("...");
  client.connect({
    useSSL: CONFIG.useSSL,
    timeout: 5,
    onSuccess: () => {
      console.log("[MQTT] Connected");
      setConnStatus("ON");

      // ── Subscribe to all topics ──
      client.subscribe(CONFIG.topics.suhu);
      client.subscribe(CONFIG.topics.ipcam);
      client.subscribe(CONFIG.topics.gerbang);

      // Subscribe to each lamp channel
      ROOMS.forEach(room => {
        client.subscribe(CONFIG.topics.lampu + room);
      });

      // Retained messages will arrive immediately and restore UI state
    },
    onFailure: (err) => {
      console.error("[MQTT] Failed:", err);
      setConnStatus("ERR");
      setTimeout(mqttConnect, 5000);
    }
  });
}

function mqttPublish(topic, payload) {
  if (!client.isConnected()) {
    showToast("⚠ Server disconnected");
    return false;
  }
  const msg = new Paho.MQTT.Message(String(payload));
  msg.destinationName = topic;
  msg.retained = true;   // retained = other devices get state on connect
  client.send(msg);
  return true;
}

// ─────────────────────────────────────────────
// CAMERA
// ─────────────────────────────────────────────
function updateCamIP(ip) {
  if (!ip || ip === state.camIP) return;
  state.camIP = ip;
  const img = document.getElementById("stream-view");
  document.getElementById("ip-display").textContent = ip;
  document.getElementById("cam-msg").textContent = "CONNECTING...";
  img.src = `http://${ip}:81/stream`;
}

function camOnline() {
  state.camOnline = true;
  document.getElementById("stream-view").style.display = "block";
  document.getElementById("offline-overlay").style.display = "none";
  document.getElementById("cam-status").textContent = "ON";
  document.getElementById("cam-status").style.color = "var(--green)";
}

function camOffline() {
  state.camOnline = false;
  document.getElementById("stream-view").style.display = "none";
  document.getElementById("offline-overlay").style.display = "flex";
  document.getElementById("cam-status").textContent = "OFF";
  document.getElementById("cam-status").style.color = "var(--red)";
  document.getElementById("cam-msg").textContent =
    state.camIP ? "CAMERA UNREACHABLE" : "AWAITING SIGNAL";
}

// Live clock in cam footer
function updateClock() {
  const now = new Date();
  document.getElementById("cam-time").textContent =
    now.toTimeString().slice(0, 8);
}

// ─────────────────────────────────────────────
// LIGHTING
// ─────────────────────────────────────────────
function toggleLampu(room) {
  const next = state.lampu[room] > 0 ? 0 : 255;
  // publish only — UI update happens via onMessageArrived
  mqttPublish(CONFIG.topics.lampu + room, next);
}

function geserSlider(room, val) {
  // live visual feedback while dragging (no publish yet)
  updateLampCard(room, parseInt(val));
}

function kirimSlider(room, val) {
  // publish on release — all devices update via subscription
  mqttPublish(CONFIG.topics.lampu + room, parseInt(val));
}

function updateLampCard(room, val) {
  const card   = document.getElementById(`card-${room}`);
  const valEl  = document.getElementById(`val-${room}`);
  const slider = document.getElementById(`slider-${room}`);

  if (val > 0) {
    card.classList.add("active");
    const pct = Math.round((val / 255) * 100);
    slider.style.setProperty("--pct", pct + "%");
  } else {
    card.classList.remove("active");
    slider.style.setProperty("--pct", "0%");
  }
  valEl.textContent = val;
  updateLightCount();
}

function updateLightCount() {
  const on = Object.values(state.lampu).filter(v => v > 0).length;
  document.getElementById("lights-on-count").textContent = `${on} / 4 ON`;
}

// ─────────────────────────────────────────────
// GATE
// ─────────────────────────────────────────────
function gerbang(cmd) {
  if (state.gateActive) return;
  // publish only — UI update happens via onMessageArrived
  mqttPublish(CONFIG.topics.gerbang, cmd);
}

function applyGateState(cmd) {
  const statusEl = document.getElementById("gate-status");
  const btns = document.querySelectorAll(".gate-btn");
  const isOpen = cmd === "BUKA";

  // If another device triggered it, reset gateActive after animation
  if (!state.gateActive) {
    state.gateActive = true;
    btns.forEach(b => b.disabled = true);
    showToast(`Gate ${isOpen ? "opening" : "closing"}...`);

    setTimeout(() => {
      state.gateActive = false;
      btns.forEach(b => b.disabled = false);
      statusEl.textContent = isOpen ? "OPEN" : "CLOSED";
      statusEl.className   = `gate-status mono ${isOpen ? "open" : "closed"}`;
    }, 4000);
  }

  statusEl.textContent = isOpen ? "OPENING..." : "CLOSING...";
  statusEl.className = `gate-status mono ${isOpen ? "opening" : "closing"}`;
}

// ─────────────────────────────────────────────
// UI HELPERS
// ─────────────────────────────────────────────
function setConnStatus(txt) {
  const el = document.getElementById("conn-status");
  el.textContent = txt;
  if (txt === "ON")                            el.style.color = "var(--green)";
  else if (txt === "ERR" || txt === "OFFLINE") el.style.color = "var(--red)";
  else                                         el.style.color = "var(--yellow)";
}

let toastTimer;
function showToast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2800);
}

// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  mqttConnect();
  updateClock();
  setInterval(updateClock, 1000);
});
