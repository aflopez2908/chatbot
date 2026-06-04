/* =====================================================
   ui.js
   Funciones de interfaz: renderizado de mensajes,
   botones, gauge, barras de dimensión y progreso.
   ===================================================== */

/* =====================================================
   GAUGE DE SENTIMIENTO
   ===================================================== */
function updateGauge() {
  const score = computeGlobalScore();
  S.sentimentScore = score;
  if (score === null) return;

  const { label, cls } = scoreToLabel(score);
  const colorMap = {
    green: 'var(--text-success)',
    amber: 'var(--text-warning)',
    red:   'var(--text-danger)',
    '':    'var(--text-primary)'
  };

  document.getElementById('g-score').textContent  = score;
  document.getElementById('g-score').style.color  = colorMap[cls] || colorMap[''];
  document.getElementById('g-label').textContent  = label;
  document.getElementById('g-thumb').style.left   = `calc(${score}% - 6px)`;
}

/* =====================================================
   BARRAS DE DIMENSIÓN
   ===================================================== */
function updateDimBar(dim, pct) {
  const fill = document.getElementById('d-'  + dim);
  const val  = document.getElementById('dv-' + dim);
  if (fill) fill.style.width   = pct + '%';
  if (val)  val.textContent    = pct + '%';
}

/* =====================================================
   BARRA DE PROGRESO
   ===================================================== */
function updateProgress() {
  const n   = Object.keys(S.scores).length;
  const pct = Math.round((n / TOTAL_Q) * 100);
  document.getElementById('prog-fill').style.width  = pct + '%';
  document.getElementById('prog-label').textContent = `${n} / ${TOTAL_Q}`;
}

/* =====================================================
   SEÑALES DE ALERTA
   ===================================================== */
function renderFlags() {
  document.getElementById('flags-list').innerHTML = S.flags.map(f =>
    `<div class="flag-row">
      <div class="flag-dot ${f.level}"></div>
      <span class="flag-text">${f.text}</span>
    </div>`
  ).join('');
}

/* =====================================================
   MENSAJES EN EL CHAT
   ===================================================== */

/**
 * Agrega un mensaje al chat.
 * @param {string} role  - 'bot' | 'user'
 * @param {string} html  - contenido HTML del mensaje
 * @returns {HTMLElement} - el div del mensaje creado
 */
function appendMsg(role, html) {
  const msgs = document.getElementById('messages');
  const div  = document.createElement('div');
  div.className = 'msg ' + role;

  const av  = document.createElement('div');
  av.className   = 'msg-av';
  av.textContent = role === 'bot' ? 'IA' : 'Tú';

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.innerHTML = html;

  div.appendChild(av);
  div.appendChild(bubble);
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
  return div;
}

/**
 * Muestra animación de escritura y luego ejecuta el callback.
 */
function showTyping(cb, delay) {
  const msgs = document.getElementById('messages');
  const div  = document.createElement('div');
  div.className = 'msg bot';
  div.innerHTML  = '<div class="msg-av">IA</div><div class="bubble"><div class="typing"><span></span><span></span><span></span></div></div>';
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
  setTimeout(() => { div.remove(); cb(); }, delay || 800);
}

/* =====================================================
   BOTONES DE OPCIONES (options)
   ===================================================== */
function showOptions(options, hIdx) {
  const msgs = document.getElementById('messages');
  const div  = document.createElement('div');
  div.className = 'msg bot';

  const av = document.createElement('div');
  av.className   = 'msg-av';
  av.style.opacity = '0';
  av.textContent = 'IA';

  const row = document.createElement('div');
  row.className = 'opts-row';

  options.forEach(o => {
    const btn = document.createElement('button');
    btn.className   = 'opt-btn';
    btn.textContent = o;
    btn.addEventListener('click', () => {
      div.remove();
      appendMsg('user', o);
      showTyping(() => S._handlers[hIdx](o));
    });
    row.appendChild(btn);
  });

  div.appendChild(av);
  div.appendChild(row);
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

/* =====================================================
   ESCALA 1–5 (scale)
   ===================================================== */
function showScale(hIdx) {
  const msgs = document.getElementById('messages');
  const div  = document.createElement('div');
  div.className = 'msg bot';

  const av = document.createElement('div');
  av.className     = 'msg-av';
  av.style.opacity = '0';
  av.textContent   = 'IA';

  const wrap   = document.createElement('div');
  wrap.className = 'scale-wrap';

  const labels = document.createElement('div');
  labels.className = 'scale-labels';
  labels.innerHTML = '<span>Muy malo</span><span>Excelente</span>';

  const row = document.createElement('div');
  row.className = 'scale-row';

  [1, 2, 3, 4, 5].forEach(n => {
    const btn = document.createElement('button');
    btn.className   = 'scale-btn';
    btn.textContent = n;
    btn.addEventListener('click', () => {
      div.remove();
      appendMsg('user', '★'.repeat(n) + ` (${n}/5)`);
      showTyping(() => S._handlers[hIdx](n));
    });
    row.appendChild(btn);
  });

  wrap.appendChild(labels);
  wrap.appendChild(row);
  div.appendChild(av);
  div.appendChild(wrap);
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

/* =====================================================
   LIKERT (likert)
   ===================================================== */
function showLikert(options, hIdx) {
  const msgs = document.getElementById('messages');
  const div  = document.createElement('div');
  div.className = 'msg bot';

  const av = document.createElement('div');
  av.className     = 'msg-av';
  av.style.opacity = '0';
  av.textContent   = 'IA';

  const row = document.createElement('div');
  row.className = 'likert-row';

  options.forEach((o, i) => {
    const btn = document.createElement('button');
    btn.className   = 'likert-btn';
    btn.textContent = o.label;
    btn.addEventListener('click', () => {
      div.remove();
      appendMsg('user', o.label);
      showTyping(() => S._handlers[hIdx](i));
    });
    row.appendChild(btn);
  });

  div.appendChild(av);
  div.appendChild(row);
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

/* =====================================================
   SELECCIÓN MÚLTIPLE (multiselect)
   ===================================================== */
function showMultiSelect(options, hIdx) {
  const msgs = document.getElementById('messages');
  const div  = document.createElement('div');
  div.className = 'msg bot';
  S._multiSelected = [];

  const av = document.createElement('div');
  av.className     = 'msg-av';
  av.style.opacity = '0';
  av.textContent   = 'IA';

  const container = document.createElement('div');
  const optsRow   = document.createElement('div');
  optsRow.className = 'opts-row';

  options.forEach(o => {
    const btn = document.createElement('button');
    btn.className   = 'opt-btn';
    btn.textContent = o;

    btn.addEventListener('click', () => {
      if (o === 'Ninguno de los anteriores') {
        // Deseleccionar todo y seleccionar solo "Ninguno"
        S._multiSelected = ['Ninguno de los anteriores'];
        optsRow.querySelectorAll('.opt-btn').forEach(b => {
          b.style.background = '';
          b.style.color = '';
        });
        btn.style.background = 'var(--bg-info)';
        btn.style.color      = 'var(--text-info)';
        return;
      }

      // Si "Ninguno" estaba seleccionado, limpiarlo
      const noneIdx = S._multiSelected.indexOf('Ninguno de los anteriores');
      if (noneIdx > -1) {
        S._multiSelected.splice(noneIdx, 1);
        optsRow.querySelectorAll('.opt-btn').forEach(b => {
          if (b.textContent === 'Ninguno de los anteriores') {
            b.style.background = '';
            b.style.color = '';
          }
        });
      }

      // Toggle del ítem actual
      const idx = S._multiSelected.indexOf(o);
      if (idx > -1) {
        S._multiSelected.splice(idx, 1);
        btn.style.background = '';
        btn.style.color      = '';
      } else {
        S._multiSelected.push(o);
        btn.style.background = 'var(--bg-info)';
        btn.style.color      = 'var(--text-info)';
      }
    });

    optsRow.appendChild(btn);
  });

  // Botón confirmar
  const confirmWrap = document.createElement('div');
  confirmWrap.style.marginTop = '8px';

  const confirmBtn = document.createElement('button');
  confirmBtn.className   = 'send-btn';
  confirmBtn.style.cssText = 'font-size:12px;padding:5px 12px';
  confirmBtn.textContent = 'Confirmar selección';

  confirmBtn.addEventListener('click', () => {
    const vals = S._multiSelected.length
      ? [...S._multiSelected]
      : ['Ninguno de los anteriores'];
    div.remove();
    appendMsg('user', vals.join(', '));
    showTyping(() => S._handlers[hIdx](vals));
  });

  confirmWrap.appendChild(confirmBtn);
  container.appendChild(optsRow);
  container.appendChild(confirmWrap);
  div.appendChild(av);
  div.appendChild(container);
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

/* =====================================================
   TEXTO LIBRE (text_or_skip)
   ===================================================== */

/**
 * Muestra el botón "Saltar esta pregunta" para el paso actual.
 */
function showSkipButton() {
  const msgs    = document.getElementById('messages');
  const skipDiv = document.createElement('div');
  skipDiv.className = 'msg bot';

  const av = document.createElement('div');
  av.className     = 'msg-av';
  av.style.opacity = '0';
  av.textContent   = 'IA';

  const row = document.createElement('div');
  row.className = 'opts-row';

  const skipBtn = document.createElement('button');
  skipBtn.className   = 'opt-btn';
  skipBtn.textContent = 'Saltar esta pregunta';
  skipBtn.addEventListener('click', skipFree);

  row.appendChild(skipBtn);
  skipDiv.appendChild(av);
  skipDiv.appendChild(row);
  msgs.appendChild(skipDiv);
  msgs.scrollTop = msgs.scrollHeight;
}

/**
 * Salta la pregunta de texto libre y avanza al siguiente paso.
 */
function skipFree() {
  document.querySelectorAll('.msg.bot').forEach(msg => {
    const btn = msg.querySelector('.opt-btn');
    if (btn && btn.textContent === 'Saltar esta pregunta') msg.remove();
  });
  appendMsg('user', '(Sin comentarios adicionales)');
  const next = S._awaitingFree.next;
  S._awaitingFree = null;
  showTyping(() => processStep(next));
}

/**
 * Envía el texto libre escrito por el usuario.
 */
function sendMsg() {
  const inp = document.getElementById('userInput');
  const val = inp.value.trim();
  if (!val || !S._awaitingFree) return;
  inp.value = '';

  document.querySelectorAll('.msg.bot').forEach(msg => {
    const btn = msg.querySelector('.opt-btn');
    if (btn && btn.textContent === 'Saltar esta pregunta') msg.remove();
  });

  appendMsg('user', val);

  const freeScore = analyzeFreeText(val);
  S.responses['feedback_libre'] = val;
  recordScore('feedback_libre', null, freeScore, 5, 0.5);

  const next = S._awaitingFree.next;
  S._awaitingFree = null;
  showTyping(() => processStep(next));
}

// Enviar con Enter
document.getElementById('userInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') sendMsg();
});
