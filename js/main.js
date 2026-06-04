/* =====================================================
   main.js
   Procesador del flujo conversacional y control
   de sesiones (inicio y reset).
   ===================================================== */

/* =====================================================
   PROCESADOR DE PASOS
   ===================================================== */

/**
 * Ejecuta el paso con el id indicado del flujo.
 * @param {string|number} stepId
 */
function processStep(stepId) {
  const step = flow.find(s => s.id === stepId);
  if (!step) return;

  /* ── Resultado final ── */
  if (step.type === 'results') {
    const msg = getResultMsg();
    appendMsg('bot', msg);

    // Botón "Nueva sesión"
    setTimeout(() => {
      const resetDiv = appendMsg('bot', '¿Quieres simular otra sesión?');
      const row = document.createElement('div');
      row.className  = 'opts-row';
      row.style.marginTop = '6px';
      const btn = document.createElement('button');
      btn.className   = 'opt-btn';
      btn.textContent = 'Nueva sesión ↺';
      btn.addEventListener('click', resetChat);
      row.appendChild(btn);
      resetDiv.querySelector('.bubble').appendChild(row);
    }, 500);
    return;
  }

  /* ── Renderizar mensaje del bot ── */
  appendMsg('bot', step.bot.replace(/\n/g, '<br>'));

  /* ── Opciones de botón (options) ── */
  if (step.type === 'options') {
    const hIdx = registerH((val) => {
      if (step.key) S.responses[step.key] = val;
      processStep(step.nextMap ? step.nextMap[val] : step.next);
    });
    setTimeout(() => showOptions(step.options, hIdx), 80);

  /* ── Escala 1–5 (scale) ── */
  } else if (step.type === 'scale') {
    const hIdx = registerH((val) => {
      S.responses[step.key] = val;
      recordScore(step.key, step.dim, val, 5, step.weight);
      processStep(step.next);
    });
    setTimeout(() => showScale(hIdx), 80);

  /* ── Likert (likert) ── */
  } else if (step.type === 'likert') {
    const hIdx = registerH((idx) => {
      const opt = step.options[idx];
      S.responses[step.key] = opt.label;
      recordScore(step.key, step.dim, opt.score, 5, step.weight);
      processStep(step.next);
    });
    setTimeout(() => showLikert(step.options, hIdx), 80);

  /* ── Selección múltiple (multiselect) ── */
  } else if (step.type === 'multiselect') {
    const hIdx = registerH((vals) => {
      S.responses[step.key] = vals;
      S.burnoutFlags = vals;
      // Score inverso: más síntomas = peor score
      const realSymptoms = vals.filter(v => v !== 'Ninguno de los anteriores').length;
      const burnoutScore = Math.max(0, 5 - realSymptoms);
      recordScore(step.key, null, burnoutScore, 5, 1.5);
      detectFlags();
      processStep(step.next);
    });
    setTimeout(() => showMultiSelect(step.options, hIdx), 80);

  /* ── Texto libre con opción de saltar (text_or_skip) ── */
  } else if (step.type === 'text_or_skip') {
    S._awaitingFree = step;
    setTimeout(() => showSkipButton(), 80);
  }
}

/* =====================================================
   RESET DE SESIÓN
   ===================================================== */
function resetChat() {
  // Limpiar estado de análisis
  S.responses      = {};
  S.scores         = {};
  S.dims           = {};
  S.sentimentScore = null;
  S.burnoutFlags   = [];
  S.flags          = [];
  S._handlers      = [];
  S._awaitingFree  = null;
  S._multiSelected = [];
  S.questionsAnswered = 0;

  // Incrementar contador de sesiones
  S.sessions++;
  document.getElementById('m-sessions').textContent = S.sessions;

  // Limpiar UI del chat
  document.getElementById('messages').innerHTML  = '';
  document.getElementById('userInput').value     = '';

  // Resetear gauge
  document.getElementById('g-score').textContent  = '—';
  document.getElementById('g-score').style.color  = '';
  document.getElementById('g-label').textContent  = 'Esperando respuestas...';
  document.getElementById('g-thumb').style.left   = 'calc(50% - 6px)';

  // Resetear progreso
  document.getElementById('prog-fill').style.width  = '0%';
  document.getElementById('prog-label').textContent = '0 / ' + TOTAL_Q;

  // Resetear barras de dimensión
  ['sat','str','lid','cre','tea','rem','wl','bal'].forEach(d => {
    const fill = document.getElementById('d-'  + d);
    const val  = document.getElementById('dv-' + d);
    if (fill) fill.style.width  = '0%';
    if (val)  val.textContent   = '—';
  });

  // Resetear señales
  document.getElementById('flags-list').innerHTML =
    '<div class="empty-msg">Sin señales aún.</div>';

  // Iniciar nueva sesión
  showTyping(() => processStep(0), 300);
}

/* =====================================================
   INICIO DE LA APLICACIÓN
   ===================================================== */
S.sessions = 1;
document.getElementById('m-sessions').textContent = 1;
showTyping(() => processStep(0), 400);
