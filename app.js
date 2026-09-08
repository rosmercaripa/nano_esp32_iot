/* ==========================================================================
   LÓGICA JAVASCRIPT: MQTT (FLESPI WSS) + CANVAS + CONTROL DE LED BIDIRECCIONAL
   ========================================================================== */

// --- CONFIGURACIÓN POR DEFECTO Y PERSISTENCIA (localStorage) ---
const STORAGE_KEYS = {
  TOKEN: 'flespi_mqtt_token',
  TOPIC_TELEMETRY: 'flespi_mqtt_topic_telemetry',
  TOPIC_COMMAND: 'flespi_mqtt_topic_command',
  LED_COLOR: 'flespi_led_color'
};

const DEFAULT_CONFIG = {
  host: 'wss://mqtt.flespi.io:443',
  telemetryTopic: 'devices/nano_esp32/telemetry',
  commandTopic: 'devices/nano_esp32/cmd',
  ledColor: '#10b981'
};

let config = {
  token: localStorage.getItem(STORAGE_KEYS.TOKEN) || '',
  telemetryTopic: localStorage.getItem(STORAGE_KEYS.TOPIC_TELEMETRY) || DEFAULT_CONFIG.telemetryTopic,
  commandTopic: localStorage.getItem(STORAGE_KEYS.TOPIC_COMMAND) || DEFAULT_CONFIG.commandTopic,
  ledColor: localStorage.getItem(STORAGE_KEYS.LED_COLOR) || DEFAULT_CONFIG.ledColor
};

// --- ELEMENTOS DEL DOM ---
const elStatusBadge   = document.getElementById('status-badge');
const elStatusText    = document.getElementById('status-text');
const elAlertBanner   = document.getElementById('alert-banner');

const elTempVal       = document.getElementById('temp-val');
const elVoltVal       = document.getElementById('volt-val');
const elRawVal        = document.getElementById('raw-val');
const elTempBar       = document.getElementById('temp-bar');
const elVoltBar       = document.getElementById('volt-bar');

const elVirtualLed    = document.getElementById('virtual-led');
const elLedStateText  = document.getElementById('led-state-text');
const elBtnToggleLed  = document.getElementById('btn-toggle-led');
const elLedSyncTime   = document.getElementById('led-sync-time');

const elStatPackets   = document.getElementById('stat-packets');
const elStatMinTemp   = document.getElementById('stat-min-temp');
const elStatMaxTemp   = document.getElementById('stat-max-temp');
const elStatLastTime  = document.getElementById('stat-last-time');
const elStatUptime    = document.getElementById('stat-uptime');

// Modal
const elSettingsModal = document.getElementById('settings-modal');
const elBtnOpenSettings = document.getElementById('btn-open-settings');
const elBtnCloseSettings = document.getElementById('btn-close-settings');
const elFormSettings  = document.getElementById('form-settings');
const elInputToken    = document.getElementById('input-token');
const elInputTopicTel = document.getElementById('input-topic-tel');
const elInputTopicCmd = document.getElementById('input-topic-cmd');

// --- VARIABLES DE ESTADO LOCAL ---
let mqttClient = null;
let currentLedState = false;
let packetCount = 0;
let minTemp = null;
let maxTemp = null;

// --- CONFIGURACIÓN DE GRÁFICA EN CANVAS ---
const canvas = document.getElementById('tempChart');
const ctx = canvas.getContext('2d');
const MAX_CHART_POINTS = 45;
const chartHistory = [];

function resizeCanvas() {
  if (!canvas) return;
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width - 48;
  canvas.height = 200;
  drawChart();
}
window.addEventListener('resize', resizeCanvas);

// --- DIBUJAR GRÁFICA EN TIEMPO REAL ---
function drawChart() {
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  const padLeft = 32;
  const padBottom = 24;
  const padTop = 15;
  const padRight = 15;

  ctx.clearRect(0, 0, w, h);

  // Líneas horizontales de referencia (0, 25, 50, 75, 100 °C)
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 1;
  ctx.fillStyle = '#64748b';
  ctx.font = '10px system-ui, sans-serif';

  for (let t = 0; t <= 100; t += 25) {
    const y = h - padBottom - (t / 100) * (h - padBottom - padTop);
    ctx.beginPath();
    ctx.moveTo(padLeft, y);
    ctx.lineTo(w - padRight, y);
    ctx.stroke();
    ctx.fillText(t + '°C', 2, y + 3);
  }

  if (chartHistory.length < 2) return;

  const chartWidth = w - padLeft - padRight;
  const chartHeight = h - padBottom - padTop;
  const step = chartWidth / (MAX_CHART_POINTS - 1);

  // Trazo principal de la temperatura
  ctx.beginPath();
  ctx.strokeStyle = '#f97316';
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  chartHistory.forEach((val, i) => {
    const x = padLeft + i * step;
    const clamped = Math.max(0, Math.min(100, val));
    const y = h - padBottom - (clamped / 100) * chartHeight;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Relleno sombreado con gradiente
  const lastIndex = chartHistory.length - 1;
  const lastX = padLeft + lastIndex * step;
  const firstX = padLeft;

  ctx.lineTo(lastX, h - padBottom);
  ctx.lineTo(firstX, h - padBottom);
  ctx.closePath();

  const gradient = ctx.createLinearGradient(0, padTop, 0, h - padBottom);
  gradient.addColorStop(0, 'rgba(249, 115, 22, 0.35)');
  gradient.addColorStop(1, 'rgba(249, 115, 22, 0.0)');
  ctx.fillStyle = gradient;
  ctx.fill();

  // Punto resaltado en el valor más reciente
  const curVal = chartHistory[chartHistory.length - 1];
  const curY = h - padBottom - (Math.max(0, Math.min(100, curVal)) / 100) * chartHeight;
  ctx.beginPath();
  ctx.arc(lastX, curY, 4, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.strokeStyle = '#f97316';
  ctx.lineWidth = 2;
  ctx.stroke();
}

// --- ACTUALIZACIÓN DE ESTADO DEL LED EN LA INTERFAZ ---
function applyLedVisualState(isOn) {
  currentLedState = isOn;
  if (isOn) {
    elVirtualLed.classList.add('active');
    elLedStateText.textContent = 'ENCENDIDO';
    elLedStateText.classList.add('active');
    elBtnToggleLed.classList.add('active');
    elBtnToggleLed.innerHTML = `
      <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2a1 1 0 0 1 1 1v10a1 1 0 1 1-2 0V3a1 1 0 0 1 1-1zM6.34 5.34a1 1 0 0 1 1.41 0 1 1 0 0 1 0 1.42A8 8 0 1 0 16.24 6.76a1 1 0 1 1 1.42-1.42A10 10 0 1 1 6.34 5.34z"/></svg>
      Apagar LED
    `;
  } else {
    elVirtualLed.classList.remove('active');
    elLedStateText.textContent = 'APAGADO';
    elLedStateText.classList.remove('active');
    elBtnToggleLed.classList.remove('active');
    elBtnToggleLed.innerHTML = `
      <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2a1 1 0 0 1 1 1v10a1 1 0 1 1-2 0V3a1 1 0 0 1 1-1zM6.34 5.34a1 1 0 0 1 1.41 0 1 1 0 0 1 0 1.42A8 8 0 1 0 16.24 6.76a1 1 0 1 1 1.42-1.42A10 10 0 1 1 6.34 5.34z"/></svg>
      Encender LED
    `;
  }

  const now = new Date();
  const timeStr = now.toLocaleTimeString();
  elLedSyncTime.textContent = `Sincronizado: ${timeStr}`;
}

// --- PERSONALIZACIÓN DEL COLOR DEL LED VIRTUAL ---
function setLedColor(hex) {
  config.ledColor = hex;
  localStorage.setItem(STORAGE_KEYS.LED_COLOR, hex);
  document.documentElement.style.setProperty('--led-on-bg', hex);
  document.documentElement.style.setProperty('--led-on-glow', hex + '99');

  document.querySelectorAll('.color-dot').forEach(dot => {
    if (dot.getAttribute('data-color') === hex) {
      dot.classList.add('selected');
    } else {
      dot.classList.remove('selected');
    }
  });
}

// --- ENVÍO DE COMANDOS MQTT DESDE EL DASHBOARD (TOGGLE LED) ---
function sendToggleLedCommand() {
  if (!mqttClient || !mqttClient.connected) {
    alert('No estás conectado a Flespi. Configura tu token antes de enviar comandos.');
    return;
  }

  const targetState = !currentLedState;
  const payload = JSON.stringify({
    cmd: "toggle_led",
    led: targetState,
    source: "github_pages",
    timestamp: Date.now()
  });

  mqttClient.publish(config.commandTopic, payload, { qos: 0 }, (err) => {
    if (err) {
      console.error('[MQTT Comandos] Error al publicar:', err);
      alert('Error al enviar el comando MQTT al Arduino.');
    } else {
      console.log(`[MQTT Comandos] Comando enviado a ${config.commandTopic}: ${payload}`);
      // Optimistic UI update (se confirmará con el reporte del Arduino)
      applyLedVisualState(targetState);
    }
  });
}

// --- CONEXIÓN AL BROKER FLESPI (WSS) ---
function connectMQTT() {
  if (!config.token) {
    elStatusBadge.className = 'status-badge';
    elStatusText.textContent = 'Token pendiente';
    if (elAlertBanner) elAlertBanner.style.display = 'flex';
    return;
  }

  if (elAlertBanner) elAlertBanner.style.display = 'none';

  elStatusBadge.className = 'status-badge connecting';
  elStatusText.textContent = 'Conectando a Flespi...';

  if (mqttClient) {
    try { mqttClient.end(true); } catch(e) {}
  }

  // Generar Client ID aleatorio para la sesión web
  const clientId = 'gh-pages-' + Math.random().toString(16).substring(2, 10);

  // Asegurar formato de usuario en Flespi ("FlespiToken XXXXXXXXX...")
  let username = config.token.trim();
  if (!username.startsWith('FlespiToken ') && username.length > 20) {
    username = 'FlespiToken ' + username;
  }

  const options = {
    clientId: clientId,
    username: username,
    password: '',
    clean: true,
    keepalive: 30,
    reconnectPeriod: 4000,
    connectTimeout: 8000
  };

  console.log(`[MQTT] Conectando a ${DEFAULT_CONFIG.host} con Client ID: ${clientId}...`);

  try {
    mqttClient = mqtt.connect(DEFAULT_CONFIG.host, options);

    mqttClient.on('connect', () => {
      console.log('[MQTT] ¡Conectado con éxito a Flespi!');
      elStatusBadge.className = 'status-badge connected';
      elStatusText.textContent = 'En línea (Flespi)';

      // Suscribirse al topic de telemetría del Arduino
      mqttClient.subscribe(config.telemetryTopic, { qos: 0 }, (err) => {
        if (err) {
          console.error(`[MQTT] Error al suscribirse a ${config.telemetryTopic}:`, err);
        } else {
          console.log(`[MQTT] Suscrito exitosamente a: ${config.telemetryTopic}`);
        }
      });
    });

    mqttClient.on('reconnect', () => {
      console.log('[MQTT] Reconectando...');
      elStatusBadge.className = 'status-badge connecting';
      elStatusText.textContent = 'Reconectando...';
    });

    mqttClient.on('close', () => {
      console.log('[MQTT] Conexión cerrada.');
      elStatusBadge.className = 'status-badge';
      elStatusText.textContent = 'Desconectado';
    });

    mqttClient.on('error', (err) => {
      console.error('[MQTT] Error:', err);
      elStatusBadge.className = 'status-badge';
      elStatusText.textContent = 'Error de Token/Red';
    });

    // Recepción de paquetes de datos
    mqttClient.on('message', (topic, payload) => {
      try {
        const msgStr = payload.toString();
        const data = JSON.parse(msgStr);

        handleTelemetryData(data);
      } catch (e) {
        console.warn('[MQTT] Mensaje recibido no es JSON válido:', e);
      }
    });

  } catch (err) {
    console.error('[MQTT] Fallo al inicializar cliente MQTT:', err);
    elStatusBadge.className = 'status-badge';
    elStatusText.textContent = 'Error WSS';
  }
}

// --- PROCESAMIENTO DE TELEMETRÍA DEL ARDUINO ---
function handleTelemetryData(data) {
  packetCount++;
  elStatPackets.textContent = packetCount;

  // 1. Temperatura
  if (typeof data.temp !== 'undefined') {
    const temp = parseFloat(data.temp);
    elTempVal.textContent = temp.toFixed(1);

    const tempPct = Math.min(100, Math.max(0, (temp / 100) * 100));
    elTempBar.style.width = tempPct + '%';

    // Mínimo y Máximo
    if (minTemp === null || temp < minTemp) minTemp = temp;
    if (maxTemp === null || temp > maxTemp) maxTemp = temp;
    elStatMinTemp.textContent = minTemp.toFixed(1) + ' °C';
    elStatMaxTemp.textContent = maxTemp.toFixed(1) + ' °C';

    // Historial para el Canvas
    chartHistory.push(temp);
    if (chartHistory.length > MAX_CHART_POINTS) {
      chartHistory.shift();
    }
    drawChart();
  }

  // 2. Voltaje
  if (typeof data.volts !== 'undefined') {
    const volts = parseFloat(data.volts);
    elVoltVal.textContent = volts.toFixed(2);

    const voltPct = Math.min(100, Math.max(0, (volts / 3.0) * 100));
    elVoltBar.style.width = voltPct + '%';
  }

  // 3. Lectura Cruda
  if (typeof data.raw !== 'undefined') {
    elRawVal.textContent = data.raw;
  }

  // 4. Estado de LED reportado por el Arduino
  if (typeof data.led !== 'undefined') {
    applyLedVisualState(Boolean(data.led));
  }

  // 5. Uptime del Arduino
  if (typeof data.uptime !== 'undefined') {
    const upSec = parseInt(data.uptime);
    const m = Math.floor(upSec / 60);
    const s = upSec % 60;
    elStatUptime.textContent = `${m}m ${s}s`;
  }

  // 6. Última hora de actualización
  const now = new Date();
  elStatLastTime.textContent = now.toLocaleTimeString();
}

// --- GESTIÓN DEL MODAL DE CONFIGURACIÓN ---
function openSettings() {
  elInputToken.value = config.token;
  elInputTopicTel.value = config.telemetryTopic;
  elInputTopicCmd.value = config.commandTopic;
  elSettingsModal.classList.add('open');
}

function closeSettings() {
  elSettingsModal.classList.remove('open');
}

elBtnOpenSettings.addEventListener('click', openSettings);
elBtnCloseSettings.addEventListener('click', closeSettings);

elFormSettings.addEventListener('submit', (e) => {
  e.preventDefault();
  config.token = elInputToken.value.trim();
  config.telemetryTopic = elInputTopicTel.value.trim() || DEFAULT_CONFIG.telemetryTopic;
  config.commandTopic = elInputTopicCmd.value.trim() || DEFAULT_CONFIG.commandTopic;

  localStorage.setItem(STORAGE_KEYS.TOKEN, config.token);
  localStorage.setItem(STORAGE_KEYS.TOPIC_TELEMETRY, config.telemetryTopic);
  localStorage.setItem(STORAGE_KEYS.TOPIC_COMMAND, config.commandTopic);

  closeSettings();
  connectMQTT();
});

// Cerrar modal al hacer clic en el fondo exterior
elSettingsModal.addEventListener('click', (e) => {
  if (e.target === elSettingsModal) closeSettings();
});

// Botón de alternar LED
elBtnToggleLed.addEventListener('click', sendToggleLedCommand);

// Selector de colores para el LED
document.querySelectorAll('.color-dot').forEach(dot => {
  dot.addEventListener('click', () => {
    const color = dot.getAttribute('data-color');
    setLedColor(color);
  });
});

// --- INICIALIZACIÓN ---
window.addEventListener('load', () => {
  resizeCanvas();
  setLedColor(config.ledColor);

  // Comprobar parámetros URL opcionales (ej: ?token=xxx)
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has('token')) {
    config.token = urlParams.get('token');
    localStorage.setItem(STORAGE_KEYS.TOKEN, config.token);
  }

  connectMQTT();
});
