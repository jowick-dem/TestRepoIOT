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
  const saved = localStorage.getItem("smh-theme");
  if (saved === "light") {
    document.documentElement.classList.add("light");
  } else if (saved === "dark") {
    document.documentElement.classList.remove("light");
  } else {
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
  setTimeout(mqttConnect, 5000);
};

client.onMessageArrived = (msg) => {
  const { destinationName: topic, payloadString: payload } = msg;

  if (topic === CONFIG.topics.suhu) {
    document.getElementById("suhu").innerHTML = `${payload}<small>°C</small>`;
    return;
  }

  if (topic === CONFIG.topics.ipcam) {
    updateCamIP(payload);
    return;
  }

  if (topic === CONFIG.topics.gerbang) {
    applyGateState(payload.trim());
    return;
  }

  ROOMS.forEach(room => {
    if (topic === CONFIG.topics.lampu + room) {
      const val = parseInt(payload) || 0;
      state.lampu[room] = val;
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

      client.subscribe(CONFIG.topics.suhu);
      client.subscribe(CONFIG.topics.ipcam);
      client.subscribe(CONFIG.topics.gerbang);
      ROOMS.forEach(room => client.subscribe(CONFIG.topics.lampu + room));
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
  msg.retained = true;
  client.send(msg);
  return true;
}

// ─────────────────────────────────────────────
// CAMERA
// ─────────────────────────────────────────────
function updateCamIP(ip) {
  if (!ip || ip === state.camIP) return;
  state.camIP = ip;

  document.getElementById("ip-display").textContent = ip;
  document.getElementById("cam-msg").textContent = "CONNECTING...";

  // ── FIX: stream URL adalah root port 81, BUKAN /stream ──
  // Firmware baru langsung serve MJPEG di http://<ip>:81
  // (bukan http://<ip>:81/stream seperti sebelumnya)
  const img = document.getElementById("stream-view");
  img.src = `http://${ip}:81`;

  // Aktifkan tombol WiFi reset sekarang IP sudah diketahui
  const resetBtn = document.getElementById("btn-wifi-reset");
  if (resetBtn) resetBtn.disabled = false;
}

// Dipanggil oleh onload pada <img id="stream-view">
function camOnline() {
  state.camOnline = true;
  document.getElementById("stream-view").style.display = "block";
  document.getElementById("offline-overlay").style.display = "none";
  document.getElementById("cam-status").textContent = "ON";
  document.getElementById("cam-status").style.color = "var(--green)";
}

// Dipanggil oleh onerror pada <img id="stream-view">
function camOffline() {
  state.camOnline = false;
  document.getElementById("stream-view").style.display = "none";
  document.getElementById("offline-overlay").style.display = "flex";
  document.getElementById("cam-status").textContent = "OFF";
  document.getElementById("cam-status").style.color = "var(--red)";
  document.getElementById("cam-msg").textContent =
    state.camIP ? "CAMERA UNREACHABLE" : "AWAITING SIGNAL";
}

// ── BARU: Reset WiFi ESP32 via endpoint /reset ──
// ESP32 akan hapus konfigurasi WiFi & restart ke mode AP "ESP32CAM-Setup"
function resetWifiESP() {
  if (!state.camIP) {
    showToast("⚠ IP kamera belum diketahui");
    return;
  }
  if (!confirm(`Reset WiFi ESP32 (${state.camIP})?\nESP32 akan restart ke mode Access Point.`)) return;

  fetch(`http://${state.camIP}/reset`)
    .then(() => {
      showToast("✓ Reset terkirim — konek ke 'ESP32CAM-Setup'");
      // Nonaktifkan tombol & tandai kamera offline
      document.getElementById("btn-wifi-reset").disabled = true;
      state.camIP = "";
      camOffline();
    })
    .catch(() => {
      // fetch akan error karena ESP langsung restart — itu normal
      showToast("✓ ESP32 sedang restart...");
      document.getElementById("btn-wifi-reset").disabled = true;
      state.camIP = "";
      camOffline();
    });
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
  mqttPublish(CONFIG.topics.lampu + room, next);
}

function geserSlider(room, val) {
  updateLampCard(room, parseInt(val));
}

function kirimSlider(room, val) {
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
  mqttPublish(CONFIG.topics.gerbang, cmd);
}

function applyGateState(cmd) {
  const statusEl = document.getElementById("gate-status");
  const btns = document.querySelectorAll(".gate-btn");
  const isOpen = cmd === "BUKA";

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
