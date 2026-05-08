/**
 * Smart Home Rendang — app.js
 * MQTT controller for lighting, gate, temperature, and CCTV
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

// ─────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────
const state = {
  lampu:   { teras: 0, tamu: 0, tidur: 0, dapur: 0 },
  camIP:   "",
  camOnline: false,
  gateActive: false,
};

// ─────────────────────────────────────────────
// MQTT
// ─────────────────────────────────────────────
const client = new Paho.MQTT.Client(CONFIG.broker, CONFIG.port, CONFIG.clientId);

client.onConnectionLost = (err) => {
  console.warn("[MQTT] Connection lost:", err.errorMessage);
  setConnStatus("OFFLINE");
};

client.onMessageArrived = (msg) => {
  const { destinationName: topic, payloadString: payload } = msg;

  if (topic === CONFIG.topics.suhu) {
    document.getElementById("suhu").innerHTML = `${payload}<small>°C</small>`;
  }
  if (topic === CONFIG.topics.ipcam) {
    updateCamIP(payload);
  }
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
    },
    onFailure: (err) => {
      console.error("[MQTT] Failed:", err);
      setConnStatus("ERR");
      setTimeout(mqttConnect, 5000); // retry
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
  const current = state.lampu[room];
  const next = current > 0 ? 0 : 255;
  const slider = document.getElementById(`slider-${room}`);
  slider.value = next;
  state.lampu[room] = next;
  updateLampCard(room, next);
  mqttPublish(CONFIG.topics.lampu + room, next);
}

function geserSlider(room, val) {
  updateLampCard(room, parseInt(val));
}

function kirimSlider(room, val) {
  const v = parseInt(val);
  state.lampu[room] = v;
  updateLampCard(room, v);
  mqttPublish(CONFIG.topics.lampu + room, v);
}

function updateLampCard(room, val) {
  const card = document.getElementById(`card-${room}`);
  const valEl = document.getElementById(`val-${room}`);
  const slider = document.getElementById(`slider-${room}`);

  if (val > 0) {
    card.classList.add("active");
    // Update slider gradient fill
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

  const statusEl = document.getElementById("gate-status");
  const btns = document.querySelectorAll(".gate-btn");
  const isOpen = cmd === "BUKA";

  state.gateActive = true;
  btns.forEach(b => b.disabled = true);

  statusEl.textContent = isOpen ? "OPENING..." : "CLOSING...";
  statusEl.className = `gate-status mono ${isOpen ? "opening" : "closing"}`;

  const sent = mqttPublish(CONFIG.topics.gerbang, cmd);
  if (!sent) {
    reset();
    return;
  }
  showToast(`Gate ${isOpen ? "opening" : "closing"}...`);

  setTimeout(() => {
    statusEl.textContent = isOpen ? "OPEN" : "CLOSED";
    statusEl.className   = `gate-status mono ${isOpen ? "open" : "closed"}`;
    state.gateActive = false;
    btns.forEach(b => b.disabled = false);
  }, 4000);

  function reset() {
    statusEl.textContent = "STANDBY";
    statusEl.className = "gate-status mono";
    state.gateActive = false;
    btns.forEach(b => b.disabled = false);
  }
}

// ─────────────────────────────────────────────
// UI HELPERS
// ─────────────────────────────────────────────
function setConnStatus(txt) {
  const el = document.getElementById("conn-status");
  el.textContent = txt;
  if (txt === "ON") el.style.color = "var(--green)";
  else if (txt === "ERR" || txt === "OFFLINE") el.style.color = "var(--red)";
  else el.style.color = "var(--yellow)";
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
  mqttConnect();
  updateClock();
  setInterval(updateClock, 1000);
});
