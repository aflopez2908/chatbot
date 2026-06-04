/* =====================================================
   engine.js
   Motor de análisis: scoring ponderado, sentimiento,
   riesgo de rotación, detección de burnout y alertas.
   ===================================================== */

/* ── Estado global de la sesión ── */
const S = {
  responses:      {},   // respuestas del empleado
  scores:         {},   // { key: { raw, pct, weight } }
  dims:           {},   // { dimId: pct }
  sentimentScore: null, // 0–100
  burnoutFlags:   [],   // síntomas seleccionados
  sessions:       0,
  riskCount:      0,
  burnoutCount:   0,
  totalSatSum:    0,
  satSessions:    0,
  alerts:         [],
  flags:          [],
  questionsAnswered: 0,
  _handlers:      [],   // callbacks de pasos del flujo
  _awaitingFree:  null, // paso en espera de texto libre
  _multiSelected: []    // selecciones multiselect activas
};

/* =====================================================
   SCORING
   ===================================================== */

/**
 * Convierte un valor raw (1–5) a porcentaje (0–100).
 */
function scoreToPercent(raw, max) {
  return Math.round((raw / max) * 100);
}

/**
 * Registra el score de una variable y actualiza el gauge.
 * @param {string} key   - clave de la variable
 * @param {string} dim   - id de dimensión para la barra (null si no aplica)
 * @param {number} raw   - valor bruto (ej. 1–5)
 * @param {number} max   - valor máximo posible
 * @param {number} weight - peso en la media ponderada
 */
function recordScore(key, dim, raw, max, weight) {
  const pct = scoreToPercent(raw, max);
  S.scores[key] = { raw, pct, weight: weight || 1.0 };
  if (dim) {
    S.dims[dim] = pct;
    updateDimBar(dim, pct);
  }
  updateGauge();
  updateProgress();
}

/* =====================================================
   SCORE DE SENTIMIENTO GLOBAL
   Media ponderada de todos los scores registrados,
   con penalización por síntomas de burnout.
   ===================================================== */
function computeGlobalScore() {
  const keys = Object.keys(S.scores);
  if (!keys.length) return null;

  let weightedSum = 0;
  let weightSum   = 0;

  keys.forEach(k => {
    const { pct, weight } = S.scores[k];
    weightedSum += pct * weight;
    weightSum   += weight;
  });

  // Penalización: cada síntoma de burnout resta 4 puntos
  const burnoutPenalty = S.burnoutFlags
    .filter(f => f !== 'Ninguno de los anteriores').length * 4;

  const raw = (weightedSum / weightSum) - burnoutPenalty;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

/**
 * Convierte score numérico a etiqueta y clase de color.
 */
function scoreToLabel(s) {
  if (s === null)  return { label: 'Esperando...', cls: '' };
  if (s >= 80)     return { label: 'Muy positivo',    cls: 'green' };
  if (s >= 65)     return { label: 'Positivo',        cls: 'green' };
  if (s >= 50)     return { label: 'Neutral-positivo',cls: 'amber' };
  if (s >= 35)     return { label: 'Neutral-negativo',cls: 'amber' };
  if (s >= 20)     return { label: 'Negativo',        cls: 'red'   };
  return                  { label: 'Crítico',         cls: 'red'   };
}

/* =====================================================
   RIESGO DE ROTACIÓN
   Fórmula ponderada basada en variables predictoras.
   Pesos tomados de literatura RRHH / dataset 2019.
   ===================================================== */
function computeRotationRisk() {
  const sc = S.scores;
  let score = 0;

  if (sc.satisfaccion)     score += (100 - sc.satisfaccion.pct)     * 0.20;
  if (sc.estres)           score += (100 - sc.estres.pct)           * 0.15;
  if (sc.liderazgo)        score += (100 - sc.liderazgo.pct)        * 0.15;
  if (sc.intencion_salida) score += (100 - sc.intencion_salida.pct) * 0.25;
  if (sc.remuneracion)     score += (100 - sc.remuneracion.pct)     * 0.10;
  if (sc.crecimiento)      score += (100 - sc.crecimiento.pct)      * 0.10;
  if (sc.balance_vida)     score += (100 - sc.balance_vida.pct)     * 0.05;

  // Bonus de riesgo por síntomas de burnout
  const burnoutCount = S.burnoutFlags
    .filter(f => f !== 'Ninguno de los anteriores').length;
  score += burnoutCount * 5;

  return Math.min(100, Math.round(score));
}

/* =====================================================
   DETECCIÓN DE SEÑALES
   ===================================================== */
function detectFlags() {
  const flags = [];
  const sc = S.scores;
  const r  = S.responses;

  if (sc.satisfaccion    && sc.satisfaccion.pct <= 40)
    flags.push({ level: 'red',   text: 'Satisfacción baja' });
  if (sc.estres          && sc.estres.raw <= 2)
    flags.push({ level: 'red',   text: 'Estrés severo' });
  if (sc.liderazgo       && sc.liderazgo.pct <= 40)
    flags.push({ level: 'red',   text: 'Liderazgo deficiente' });
  if (sc.intencion_salida && sc.intencion_salida.raw <= 2)
    flags.push({ level: 'red',   text: 'Alta intención de salida' });
  if (sc.carga_laboral   && sc.carga_laboral.raw <= 2)
    flags.push({ level: 'amber', text: 'Carga laboral excesiva' });
  if (sc.remuneracion    && sc.remuneracion.raw <= 2)
    flags.push({ level: 'amber', text: 'Insatisfacción salarial' });
  if (sc.balance_vida    && sc.balance_vida.pct <= 40)
    flags.push({ level: 'amber', text: 'Desequilibrio vida-trabajo' });
  if (sc.crecimiento     && sc.crecimiento.pct <= 40)
    flags.push({ level: 'amber', text: 'Falta de oportunidades' });
  if (sc.equipo          && sc.equipo.raw <= 2)
    flags.push({ level: 'amber', text: 'Ambiente laboral tenso' });

  const burnoutCount = S.burnoutFlags
    .filter(f => f !== 'Ninguno de los anteriores').length;
  if (burnoutCount >= 3)
    flags.push({ level: 'red',   text: `Burnout probable (${burnoutCount} síntomas)` });
  else if (burnoutCount >= 1)
    flags.push({ level: 'amber', text: `${burnoutCount} síntoma(s) de burnout` });

  if (r.antiguedad === 'Menos de 6 meses' && sc.satisfaccion && sc.satisfaccion.pct <= 50)
    flags.push({ level: 'amber', text: 'Riesgo en etapa de inducción' });

  if (!flags.length)
    flags.push({ level: 'green', text: 'Sin señales de alerta' });

  S.flags = flags;
  renderFlags();
}

/**
 * Retorna la dimensión con menor puntaje (la más crítica).
 */
function criticalDim() {
  const map = {
    sat: 'Satisfacción', str: 'Estrés',    lid: 'Liderazgo',
    cre: 'Crecimiento',  tea: 'Compañeros', rem: 'Remuneración',
    wl:  'Carga lab.',   bal: 'Balance'
  };
  let minDim = null, minVal = 101;
  Object.entries(S.dims).forEach(([k, v]) => {
    if (v < minVal) { minVal = v; minDim = k; }
  });
  return minDim ? `${map[minDim]} (${minVal}%)` : '—';
}

/* =====================================================
   ANÁLISIS DE FEEDBACK LIBRE (léxico)
   ===================================================== */
const NEG_WORDS = [
  'mal','difícil','agotado','presión','renunciar','cansado',
  'injusto','triste','preocupado','burnout','sobrecarga',
  'estresado','abandono','salir','irme','frustr','odio',
  'horrible','terrible'
];
const POS_WORDS = [
  'bien','contento','feliz','cómodo','motivado','gracias',
  'aprecio','bueno','excelente','satisfecho'
];

function analyzeFreeText(text) {
  const lv = text.toLowerCase();
  const negHits = NEG_WORDS.filter(w => lv.includes(w)).length;
  const posHits = POS_WORDS.filter(w => lv.includes(w)).length;
  return negHits > posHits
    ? Math.max(1, 3 - negHits)
    : Math.min(5, 3 + posHits);
}

/* =====================================================
   RESULTADO FINAL
   ===================================================== */
function getResultMsg() {
  detectFlags();
  const riskPct = computeRotationRisk();
  const score   = S.sentimentScore || 0;
  const r       = S.responses;

  const burnoutCount = S.burnoutFlags
    .filter(f => f !== 'Ninguno de los anteriores').length;
  const isBurnout = burnoutCount >= 3;

  let alertLevel, riskTag, msg;

  if (riskPct >= 65) {
    riskTag = 'high'; alertLevel = 'red';
    msg = `He detectado múltiples indicadores de riesgo. Tu bienestar es importante y RRHH recibirá una alerta para ofrecerte apoyo. Tu identidad permanece protegida. <strong>Riesgo de rotación: ${riskPct}%</strong> 🔴`;
    S.riskCount++;
    document.getElementById('m-risk').textContent = S.riskCount;
    addAlert('red', `Alerta alta — riesgo ${riskPct}%`, `Sesión #${S.sessions} · ${new Date().toLocaleTimeString()}`);
  } else if (riskPct >= 35) {
    riskTag = 'med'; alertLevel = 'amber';
    msg = `Tus respuestas muestran algunas áreas de mejora. Hemos registrado tu feedback para acciones preventivas. <strong>Riesgo de rotación: ${riskPct}%</strong> 🟡`;
    addAlert('amber', `Seguimiento recomendado — ${riskPct}%`, `Sesión #${S.sessions} · ${new Date().toLocaleTimeString()}`);
  } else {
    riskTag = 'low'; alertLevel = 'green';
    msg = `¡Qué bueno! Tus respuestas indican un buen nivel de bienestar. <strong>Riesgo de rotación: ${riskPct}%</strong> 🟢`;
    addAlert('green', `Empleado estable — ${riskPct}%`, `Sesión #${S.sessions} · ${new Date().toLocaleTimeString()}`);
  }

  if (isBurnout) {
    S.burnoutCount++;
    document.getElementById('m-burnout').textContent = S.burnoutCount;
    msg += `<br><br>⚠️ Se detectaron <strong>${burnoutCount} síntomas de burnout</strong>. Se recomienda una conversación de apoyo con RRHH.`;
  }

  // Actualizar métrica de satisfacción
  const satVal = r.satisfaccion || '—';
  const satEl  = document.getElementById('m-sat');
  satEl.textContent = typeof satVal === 'number' ? satVal + '/5' : satVal;
  satEl.className = 'metric-val ' + (satVal >= 4 ? 'green' : satVal === 3 ? 'amber' : 'red');

  logSession(riskPct, riskTag, isBurnout, score);
  return msg;
}

/* =====================================================
   ALERTAS
   ===================================================== */
function addAlert(level, text, sub) {
  S.alerts.unshift({ level, text, sub });
  const list = document.getElementById('alerts-list');
  list.innerHTML = S.alerts.slice(0, 5).map(a =>
    `<div class="alert-item">
      <div class="alert-dot ${a.level}"></div>
      <div>
        <div class="alert-text">${a.text}</div>
        <div class="alert-sub">${a.sub}</div>
      </div>
    </div>`
  ).join('');
}

/* =====================================================
   REGISTRO DE SESIONES
   ===================================================== */
function logSession(riskPct, riskTag, isBurnout, score) {
  const body = document.getElementById('log-body');
  const emptyRow = body.querySelector('td[colspan]');
  if (emptyRow) body.innerHTML = '';

  const r  = S.scores;
  const re = S.responses;
  const { label: sLabel } = scoreToLabel(score);
  const sentTag = score >= 65 ? 'pos' : score >= 35 ? 'amb' : 'neg';

  const riskLabels = { high: 'Alto', med: 'Medio', low: 'Bajo' };

  const row = document.createElement('tr');
  row.innerHTML = `
    <td>${S.sessions}</td>
    <td>${re.antiguedad     || '—'}</td>
    <td>${re.departamento   || '—'}</td>
    <td>${re.satisfaccion   ? re.satisfaccion + '/5' : '—'}</td>
    <td>${r.estres          ? r.estres.raw + '/5'    : '—'}</td>
    <td>${r.liderazgo       ? r.liderazgo.raw + '/5' : '—'}</td>
    <td>${r.crecimiento     ? r.crecimiento.raw + '/5': '—'}</td>
    <td>${r.equipo          ? r.equipo.raw + '/5'    : '—'}</td>
    <td>${r.remuneracion    ? r.remuneracion.raw + '/5': '—'}</td>
    <td>${r.carga_laboral   ? r.carga_laboral.raw + '/5': '—'}</td>
    <td>${r.balance_vida    ? r.balance_vida.raw + '/5': '—'}</td>
    <td>${re.intencion_salida || '—'}</td>
    <td><span class="tag ${sentTag}">${score} — ${sLabel}</span></td>
    <td>${criticalDim()}</td>
    <td>${isBurnout ? '<span class="tag burnout">Sí</span>' : 'No'}</td>
    <td><span class="tag ${riskTag}">${riskLabels[riskTag]} (${riskPct}%)</span></td>
    <td>${new Date().toLocaleTimeString()}</td>
  `;
  body.appendChild(row);
}

/* =====================================================
   REGISTRO DE HANDLER
   ===================================================== */
function registerH(fn) {
  S._handlers.push(fn);
  return S._handlers.length - 1;
}
