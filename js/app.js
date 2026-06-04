const STORAGE_KEYS = {
  token: 'ity.mvp.token',
  sessionId: 'ity.mvp.sessionId',
  activeView: 'ity.mvp.activeView',
  authTab: 'ity.mvp.authTab'
};

const state = {
  booting: true,
  loading: false,
  user: null,
  token: localStorage.getItem(STORAGE_KEYS.token) || '',
  sessionId: Number(localStorage.getItem(STORAGE_KEYS.sessionId) || 0) || null,
  activeView: localStorage.getItem(STORAGE_KEYS.activeView) || 'chat',
  authTab: localStorage.getItem(STORAGE_KEYS.authTab) || 'register',
  authMessage: '',
  errorMessage: '',
  noticeMessage: '',
  health: null,
  dashboard: null,
  adminOverview: null,
  chatMessages: [],
  assessment: null,
  draft: '',
  chatBusy: false,
  wellnessPanelOpen: false
};

const app = document.getElementById('app');

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(value) {
  if (!value) return 'Ahora';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Ahora';
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function formatRelative(value) {
  if (!value) return 'Hace un momento';
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.round(diff / 60000));
  if (minutes < 60) return `Hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Hace ${hours} h`;
  const days = Math.round(hours / 24);
  return `Hace ${days} d`;
}

const BURNOUT_KEYWORDS = [
  'agotado',
  'agotada',
  'burnout',
  'cansado',
  'cansada',
  'sobrecarga',
  'presión',
  'estresado',
  'estresada',
  'frustrado',
  'frustrada',
  'insomnio',
  'irritabilidad',
  'desconectar',
  'sin energía',
  'sin motivación',
  'no puedo más',
  'renunciar',
  'irme'
];

const SUPPORT_KEYWORDS = [
  'bien',
  'ok',
  'gracias',
  'claro',
  'apoyo',
  'tranquilo',
  'organizado',
  'estable',
  'satisfecho',
  'satisfecha'
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function scoreLabel(score) {
  if (score >= 80) return { label: 'Muy alto', tone: 'good' };
  if (score >= 65) return { label: 'Alto', tone: 'good' };
  if (score >= 45) return { label: 'Medio', tone: 'warn' };
  if (score >= 25) return { label: 'Bajo', tone: 'danger' };
  return { label: 'Crítico', tone: 'danger' };
}

const DIAGNOSTIC_TOTAL = 12;

const DIAGNOSTIC_FLOW = [
  {
    id: 0,
    bot: 'Hola, soy el asistente de bienestar de ITY.DIGITAL. Esta conversación es completamente anónima y confidencial. Voy a hacerte algunas preguntas sobre tu experiencia en la empresa. Solo tomará unos minutos. ¿Empezamos?',
    type: 'options',
    options: ['Sí, empecemos', '¿Qué pasa con mis datos?'],
    nextMap: {
      'Sí, empecemos': 'ctx1',
      '¿Qué pasa con mis datos?': 'privacy'
    }
  },
  {
    id: 'privacy',
    bot: 'Tus respuestas se procesan de forma agregada y anónima. Ningún dato individual es visible para tu jefe directo ni para tu equipo. RRHH solo recibe reportes estadísticos y alertas sin nombre. ¿Continuamos?',
    type: 'options',
    options: ['Entendido, continuemos'],
    nextMap: { 'Entendido, continuemos': 'ctx1' }
  },
  {
    id: 'ctx1',
    bot: 'Para contextualizar mejor tu experiencia: ¿cuánto tiempo llevas trabajando en ITY.DIGITAL?',
    type: 'options',
    key: 'antiguedad',
    options: ['Menos de 6 meses', '6 meses a 1 año', '1 a 3 años', 'Más de 3 años'],
    nextMap: {
      'Menos de 6 meses': 'ctx2',
      '6 meses a 1 año': 'ctx2',
      '1 a 3 años': 'ctx2',
      'Más de 3 años': 'ctx2'
    }
  },
  {
    id: 'ctx2',
    bot: '¿En qué área o departamento trabajas actualmente?',
    type: 'options',
    key: 'departamento',
    options: ['Desarrollo / Tecnología', 'Marketing / Ventas', 'Operaciones / Soporte', 'Recursos Humanos', 'Otro'],
    nextMap: {
      'Desarrollo / Tecnología': 'q1',
      'Marketing / Ventas': 'q1',
      'Operaciones / Soporte': 'q1',
      'Recursos Humanos': 'q1',
      Otro: 'q1'
    }
  },
  {
    id: 'q1',
    bot: 'En una escala del 1 al 5, ¿qué tan satisfecho estás con tu trabajo en general?\n\n1 = Muy insatisfecho · 5 = Muy satisfecho',
    type: 'scale',
    key: 'satisfaccion',
    dim: 'sat',
    weight: 1.5,
    next: 'q2'
  },
  {
    id: 'q2',
    bot: '¿Cómo describirías tu nivel de estrés laboral en las últimas dos semanas?',
    type: 'likert',
    key: 'estres',
    dim: 'str',
    weight: 1.3,
    options: [
      { label: 'Sin estrés', score: 5 },
      { label: 'Leve', score: 4 },
      { label: 'Moderado', score: 3 },
      { label: 'Alto', score: 2 },
      { label: 'Muy alto / agotamiento', score: 1 }
    ],
    next: 'q3'
  },
  {
    id: 'q3',
    bot: '¿Cómo percibes tu carga de trabajo actual?',
    type: 'likert',
    key: 'carga_laboral',
    dim: 'wl',
    weight: 1.2,
    options: [
      { label: 'Demasiado ligera', score: 3 },
      { label: 'Adecuada', score: 5 },
      { label: 'Un poco excesiva', score: 3 },
      { label: 'Excesiva', score: 2 },
      { label: 'Insostenible', score: 1 }
    ],
    next: 'q4'
  },
  {
    id: 'q4',
    bot: '¿Qué tan bien sientes que tu jefe directo reconoce tu trabajo y te apoya?\n\n1 = Muy mal · 5 = Excelente',
    type: 'scale',
    key: 'liderazgo',
    dim: 'lid',
    weight: 1.4,
    next: 'q5'
  },
  {
    id: 'q5',
    bot: '¿Cómo describirías el ambiente de trabajo y la relación con tus compañeros?',
    type: 'likert',
    key: 'equipo',
    dim: 'tea',
    weight: 1.0,
    options: [
      { label: 'Muy positivo, colaborativo', score: 5 },
      { label: 'Bueno en general', score: 4 },
      { label: 'Neutral / indiferente', score: 3 },
      { label: 'Hay tensiones frecuentes', score: 2 },
      { label: 'Muy negativo o tóxico', score: 1 }
    ],
    next: 'q6'
  },
  {
    id: 'q6',
    bot: '¿Sientes que en ITY.DIGITAL tienes oportunidades reales de crecer o aprender cosas nuevas?\n\n1 = Ninguna · 5 = Muchas',
    type: 'scale',
    key: 'crecimiento',
    dim: 'cre',
    weight: 1.2,
    next: 'q7'
  },
  {
    id: 'q7',
    bot: '¿Consideras que tu salario y beneficios son justos para las responsabilidades que tienes?',
    type: 'likert',
    key: 'remuneracion',
    dim: 'rem',
    weight: 1.1,
    options: [
      { label: 'Sí, totalmente justo', score: 5 },
      { label: 'Más o menos justo', score: 4 },
      { label: 'Podría ser mejor', score: 3 },
      { label: 'No es justo', score: 2 },
      { label: 'Muy por debajo del mercado', score: 1 }
    ],
    next: 'q8'
  },
  {
    id: 'q8',
    bot: '¿Logras mantener un buen equilibrio entre tu vida personal y tu trabajo?\n\n1 = No, para nada · 5 = Sí, muy bien',
    type: 'scale',
    key: 'balance_vida',
    dim: 'bal',
    weight: 1.1,
    next: 'q9'
  },
  {
    id: 'q9',
    bot: 'Durante las últimas semanas, ¿has sentido alguno de estos síntomas? Selecciona todos los que apliquen y confirma.',
    type: 'multiselect',
    key: 'burnout_signals',
    options: [
      'Dificultad para concentrarme',
      'Sensación de no poder desconectarme',
      'Irritabilidad frecuente',
      'Insomnio o mal descanso',
      'Falta de motivación o energía',
      'Ninguno de los anteriores'
    ],
    next: 'q10'
  },
  {
    id: 'q10',
    bot: '¿Sientes que la empresa comunica de forma clara sus objetivos, cambios y decisiones que te afectan?',
    type: 'likert',
    key: 'comunicacion',
    options: [
      { label: 'Sí, siempre de forma clara', score: 5 },
      { label: 'Generalmente sí', score: 4 },
      { label: 'A veces sí, a veces no', score: 3 },
      { label: 'Rara vez', score: 2 },
      { label: 'No, hay mucha falta de comunicación', score: 1 }
    ],
    next: 'q11'
  },
  {
    id: 'q11',
    bot: '¿Has pensado en buscar trabajo en otra empresa en los próximos 6 meses?',
    type: 'likert',
    key: 'intencion_salida',
    weight: 2.0,
    options: [
      { label: 'No, estoy cómodo aquí', score: 5 },
      { label: 'Lo he pensado vagamente', score: 3 },
      { label: 'Sí, lo estoy considerando', score: 2 },
      { label: 'Sí, activamente lo estoy buscando', score: 1 }
    ],
    next: 'q12'
  },
  {
    id: 'q12',
    bot: 'Última pregunta. ¿Hay algo más que quieras comentar a RRHH de forma anónima? Puedes escribir libremente o saltar esta pregunta.',
    type: 'text_or_skip',
    key: 'feedback_libre',
    next: 'results'
  },
  { id: 'results', bot: null, type: 'results' }
];

function createDiagnosticState() {
  return {
    currentStep: 0,
    responses: {},
    scores: {},
    dims: {},
    sentimentScore: null,
    burnoutFlags: [],
    alerts: [],
    flags: [],
    history: [],
    completed: false,
    _handlers: [],
    _awaitingFree: null,
    _multiSelected: [],
    results: null
  };
}

function getDiagnosticStep(stepId) {
  return DIAGNOSTIC_FLOW.find(item => item.id === stepId) || null;
}

function renderWellnessPill() {
  const diag = state.assessment;
  const score = diag?.sentimentScore;
  const riskPct = diag?.riskPct ?? diagnosticComputeRotationRisk();
  const burnoutCount = (diag?.burnoutFlags || []).length;
  if (score === null || score === undefined) {
    return '<span class="status-pill subtle" title="El diagnóstico se actualiza con cada mensaje">Bienestar: esperando primera señal</span>';
  }
  const label = diagnosticScoreToLabel(score);
  const toneMap = { good: 'good', warn: 'warn', danger: 'danger', '': 'subtle' };
  const tone = toneMap[label.cls] || 'subtle';
  const riskTag = riskPct >= 65 ? 'high' : riskPct >= 35 ? 'med' : 'low';
  const riskText = riskTag === 'high' ? 'alto' : riskTag === 'med' ? 'medio' : 'bajo';
  return `
    <span class="status-pill ${tone}" title="Última actualización: ${formatRelative(diag.lastSignal?.at)}">
      Bienestar ${score}% · Riesgo ${riskText}${burnoutCount ? ` · ${burnoutCount} alerta${burnoutCount === 1 ? '' : 's'}` : ''}
    </span>
  `;
}

function renderWellnessPanel() {
  const diag = state.assessment;
  if (!diag) return '<div class="empty-state">Sin diagnóstico activo.</div>';
  const score = diag.sentimentScore;
  const riskPct = diag.riskPct ?? diagnosticComputeRotationRisk();
  const flags = (diag.flags && diag.flags.length) ? diag.flags : (() => { diagnosticDetectFlags(); return diag.flags; })();
  const burnoutCount = (diag.burnoutFlags || []).length;
  const mood = diag.derived?.mood || diag.responses?.chat_mood || null;
  const source = diag.lastSignal?.source || null;
  const tags = diag.responses?.chat_tags ? diag.responses.chat_tags.split(', ') : [];

  const dimLabels = {
    sat: 'Satisfacción', str: 'Estrés', lid: 'Liderazgo',
    cre: 'Crecimiento', tea: 'Compañeros', rem: 'Remuneración',
    wl: 'Carga lab.', bal: 'Balance'
  };

  const dimsHtml = Object.keys(dimLabels).length
    ? Object.entries(dimLabels).map(([key, name]) => {
        const val = diag.dims[key];
        const pct = val === undefined ? null : val;
        return `
          <div class="wellness-dim-row">
            <span>${name}</span>
            <div class="wellness-dim-bar"><span style="width:${pct ?? 0}%"></span></div>
            <strong>${pct === null ? '—' : pct + '%'}</strong>
          </div>
        `;
      }).join('')
    : '<div class="empty-state">Sin dimensiones medidas todavía.</div>';

  const flagsHtml = (flags || []).map(f => `
    <div class="wellness-flag">
      <span class="wellness-dot ${f.tone || 'neutral'}"></span>
      <span>${escapeHtml(f.text)}</span>
    </div>
  `).join('') || '<div class="empty-state">Sin señales de alerta.</div>';

  const history = (diag.history || []).slice(0, 5).map(item => `
    <div class="wellness-history-item">
      <strong>${item.label.label} · ${item.score === null ? '—' : item.score + '%'}</strong>
      <span>${formatRelative(item.at)}</span>
    </div>
  `).join('') || '<div class="empty-state">Sin historial todavía.</div>';

  const sourceLabel = source === 'ai' ? 'IA Ollama' : source === 'keywords' ? 'Análisis local' : source === 'history' ? 'Historial' : '—';

  return `
    <div class="wellness-panel">
      <header class="wellness-head">
        <p class="eyebrow">DIAGNÓSTICO EN VIVO</p>
        <h3>Tu estado de bienestar</h3>
        <span class="chip subtle">Fuente: ${sourceLabel}</span>
      </header>

      <div class="wellness-summary">
        <article>
          <span>Sentimiento</span>
          <strong>${score === null || score === undefined ? '—' : score + '%'}</strong>
        </article>
        <article>
          <span>Riesgo rotación</span>
          <strong>${riskPct}%</strong>
        </article>
        <article>
          <span>Señales</span>
          <strong>${burnoutCount}</strong>
        </article>
        <article>
          <span>Mood</span>
          <strong>${mood || '—'}</strong>
        </article>
      </div>

      <h4 class="wellness-section-title">Dimensiones</h4>
      <div class="wellness-dims">${dimsHtml}</div>

      <h4 class="wellness-section-title">Señales detectadas</h4>
      <div class="wellness-flags">${flagsHtml}</div>

      ${tags.length ? `
        <h4 class="wellness-section-title">Tags recientes</h4>
        <div class="wellness-tags">
          ${tags.map(t => `<span class="wellness-tag">${escapeHtml(t)}</span>`).join('')}
        </div>
      ` : ''}

      <h4 class="wellness-section-title">Última evolución</h4>
      <div class="wellness-history">${history}</div>

      <p class="micro-copy">El modelo Qwen clasifica cada mensaje del chat y se combina con un fallback léxico local. También podés completar el <strong>Diagnóstico guiado</strong> (vista 03); ambos flujos alimentan este mismo estado.</p>
      <button class="ghost-btn" id="resetAssessmentBtn" type="button">Reiniciar diagnóstico</button>
    </div>
  `;
}

function diagnosticScoreToPercent(raw, max) {
  return Math.round((raw / max) * 100);
}

function diagnosticScoreToLabel(score) {
  if (score === null) return { label: 'Esperando...', cls: '' };
  if (score >= 80) return { label: 'Muy positivo', cls: 'good' };
  if (score >= 65) return { label: 'Positivo', cls: 'good' };
  if (score >= 50) return { label: 'Neutral-positivo', cls: 'warn' };
  if (score >= 35) return { label: 'Neutral-negativo', cls: 'warn' };
  if (score >= 20) return { label: 'Negativo', cls: 'danger' };
  return { label: 'Crítico', cls: 'danger' };
}

function diagnosticAnalyzeFreeText(text) {
  const negative = ['mal', 'difícil', 'agotado', 'presión', 'renunciar', 'cansado', 'injusto', 'triste', 'preocupado', 'burnout', 'sobrecarga', 'estresado', 'abandono', 'salir', 'irme', 'frustr', 'odio', 'horrible', 'terrible'];
  const positive = ['bien', 'contento', 'feliz', 'cómodo', 'motivado', 'gracias', 'aprecio', 'bueno', 'excelente', 'satisfecho'];
  const lv = text.toLowerCase();
  const negHits = negative.filter(word => lv.includes(word)).length;
  const posHits = positive.filter(word => lv.includes(word)).length;
  return negHits > posHits ? clamp(3 - negHits, 1, 5) : clamp(3 + posHits, 1, 5);
}

function diagnosticCaptureSnapshot() {
  const diag = state.assessment;
  const score = diagnosticComputeGlobalScore();
  const snapshot = {
    stepId: diag.currentStep,
    stepLabel: String(getDiagnosticStep(diag.currentStep)?.bot || 'Resultado final').slice(0, 240),
    at: new Date().toISOString(),
    score,
    label: diagnosticScoreToLabel(score),
    burnoutCount: diag.burnoutFlags.filter(item => item !== 'Ninguno de los anteriores').length,
    flags: [...diag.flags],
    dims: { ...diag.dims }
  };
  diag.history.unshift(snapshot);
  diag.history = diag.history.slice(0, 8);
  void persistDiagnosticSnapshot(snapshot).catch(() => {});
}

async function persistDiagnosticSnapshot(snapshot) {
  if (!state.token || !state.sessionId || !state.user || !snapshot) return;
  const result = state.assessment?.results || null;
  await api('/api/diagnostics', {
    method: 'POST',
    body: JSON.stringify({
      sessionId: state.sessionId,
      stepId: String(snapshot.stepId ?? 'unknown'),
      stepLabel: String(snapshot.stepLabel || 'Diagnóstico'),
      score: snapshot.score,
      burnoutRisk: result?.riskPct ?? null,
      burnoutCount: snapshot.burnoutCount,
      criticalDim: result?.critical || diagnosticCriticalDim(),
      flowLabel: snapshot.label?.label || 'Esperando...',
      flowTone: snapshot.label?.cls || '',
      flags: snapshot.flags,
      dims: snapshot.dims,
      responses: state.assessment.responses,
      createdAt: snapshot.at
    })
  });
}

function diagnosticRecordScore(key, dim, raw, max, weight) {
  const diag = state.assessment;
  const pct = diagnosticScoreToPercent(raw, max);
  diag.scores[key] = { raw, pct, weight: weight || 1 };
  if (dim) diag.dims[dim] = pct;
  diag.sentimentScore = diagnosticComputeGlobalScore();
}

function diagnosticComputeGlobalScore() {
  const diag = state.assessment;
  const keys = Object.keys(diag.scores);
  if (!keys.length) return null;
  let weightedSum = 0;
  let weightSum = 0;
  keys.forEach(key => {
    const { pct, weight } = diag.scores[key];
    weightedSum += pct * weight;
    weightSum += weight;
  });
  const burnoutPenalty = diag.burnoutFlags.filter(item => item !== 'Ninguno de los anteriores').length * 4;
  return clamp(Math.round((weightedSum / weightSum) - burnoutPenalty), 0, 100);
}

function diagnosticComputeRotationRisk() {
  const sc = state.assessment.scores;
  let score = 0;
  if (sc.satisfaccion) score += (100 - sc.satisfaccion.pct) * 0.20;
  if (sc.estres) score += (100 - sc.estres.pct) * 0.15;
  if (sc.liderazgo) score += (100 - sc.liderazgo.pct) * 0.15;
  if (sc.intencion_salida) score += (100 - sc.intencion_salida.pct) * 0.25;
  if (sc.remuneracion) score += (100 - sc.remuneracion.pct) * 0.10;
  if (sc.crecimiento) score += (100 - sc.crecimiento.pct) * 0.10;
  if (sc.balance_vida) score += (100 - sc.balance_vida.pct) * 0.05;
  score += state.assessment.burnoutFlags.filter(item => item !== 'Ninguno de los anteriores').length * 5;
  return clamp(Math.round(score), 0, 100);
}

function diagnosticCriticalDim() {
  const map = { sat: 'Satisfacción', str: 'Estrés', lid: 'Liderazgo', cre: 'Crecimiento', tea: 'Compañeros', rem: 'Remuneración', wl: 'Carga lab.', bal: 'Balance' };
  let minDim = null;
  let minVal = 101;
  Object.entries(state.assessment.dims).forEach(([key, value]) => {
    if (value < minVal) {
      minVal = value;
      minDim = key;
    }
  });
  return minDim ? `${map[minDim]} (${minVal}%)` : '—';
}

function diagnosticDetectFlags() {
  const flags = [];
  const sc = state.assessment.scores;
  const r = state.assessment.responses;

  if (sc.satisfaccion && sc.satisfaccion.pct <= 40) flags.push({ tone: 'danger', text: 'Satisfacción baja' });
  if (sc.estres && sc.estres.raw <= 2) flags.push({ tone: 'danger', text: 'Estrés severo' });
  if (sc.liderazgo && sc.liderazgo.pct <= 40) flags.push({ tone: 'danger', text: 'Liderazgo deficiente' });
  if (sc.intencion_salida && sc.intencion_salida.raw <= 2) flags.push({ tone: 'danger', text: 'Alta intención de salida' });
  if (sc.carga_laboral && sc.carga_laboral.raw <= 2) flags.push({ tone: 'warn', text: 'Carga laboral excesiva' });
  if (sc.remuneracion && sc.remuneracion.raw <= 2) flags.push({ tone: 'warn', text: 'Insatisfacción salarial' });
  if (sc.balance_vida && sc.balance_vida.pct <= 40) flags.push({ tone: 'warn', text: 'Desequilibrio vida-trabajo' });
  if (sc.crecimiento && sc.crecimiento.pct <= 40) flags.push({ tone: 'warn', text: 'Falta de oportunidades' });
  if (sc.equipo && sc.equipo.raw <= 2) flags.push({ tone: 'warn', text: 'Ambiente laboral tenso' });

  const burnoutCount = state.assessment.burnoutFlags.filter(item => item !== 'Ninguno de los anteriores').length;
  if (burnoutCount >= 3) flags.push({ tone: 'danger', text: `Burnout probable (${burnoutCount} síntomas)` });
  else if (burnoutCount >= 1) flags.push({ tone: 'warn', text: `${burnoutCount} síntoma(s) de burnout` });

  if (r.antiguedad === 'Menos de 6 meses' && sc.satisfaccion && sc.satisfaccion.pct <= 50) {
    flags.push({ tone: 'warn', text: 'Riesgo en etapa de inducción' });
  }

  if (!flags.length) flags.push({ tone: 'good', text: 'Sin señales de alerta' });
  state.assessment.flags = flags;
}

function diagnosticComputeResultMessage() {
  diagnosticDetectFlags();
  const riskPct = diagnosticComputeRotationRisk();
  const score = state.assessment.sentimentScore || 0;
  const burnoutCount = state.assessment.burnoutFlags.filter(item => item !== 'Ninguno de los anteriores').length;
  const isBurnout = burnoutCount >= 3;
  let riskTag = 'low';
  let msg = '';

  if (riskPct >= 65) {
    riskTag = 'high';
    msg = `He detectado múltiples indicadores de riesgo. Tu bienestar es importante y RRHH recibirá una alerta para ofrecerte apoyo. Tu identidad permanece protegida. Riesgo de rotación: ${riskPct}%.`;
  } else if (riskPct >= 35) {
    riskTag = 'med';
    msg = `Tus respuestas muestran algunas áreas de mejora. Hemos registrado tu feedback para acciones preventivas. Riesgo de rotación: ${riskPct}%.`;
  } else {
    riskTag = 'low';
    msg = `Tus respuestas indican un buen nivel de bienestar. Riesgo de rotación: ${riskPct}%.`;
  }

  if (isBurnout) {
    msg += ` Se detectaron ${burnoutCount} síntomas de burnout.`;
  }

  state.assessment.results = {
    riskPct,
    riskTag,
    score,
    isBurnout,
    burnoutCount,
    critical: diagnosticCriticalDim(),
    message: msg
  };

  state.assessment.completed = true;

  diagnosticCaptureSnapshot();
}

function resetDiagnostic() {
  state.assessment = createDiagnosticState();
}

const SIGNAL_DIM_MAP = {
  satisfaccion: { dim: 'sat', weight: 1.5 },
  estres: { dim: 'str', weight: 1.3 },
  carga: { dim: 'wl', weight: 1.2 },
  liderazgo: { dim: 'lid', weight: 1.4 },
  equipo: { dim: 'tea', weight: 1.0 },
  crecimiento: { dim: 'cre', weight: 1.2 },
  remuneracion: { dim: 'rem', weight: 1.1 },
  balance: { dim: 'bal', weight: 1.1 },
  intencion_salida: { dim: null, weight: 2.0 },
  comunicacion: { dim: null, weight: 1.0 }
};

const BURNOUT_BAND_FLAGS = {
  ninguno: [],
  leve: ['Dificultad para concentrarme'],
  moderado: ['Dificultad para concentrarme', 'Sensación de no poder desconectarme', 'Irritabilidad frecuente'],
  severo: ['Dificultad para concentrarme', 'Sensación de no poder desconectarme', 'Irritabilidad frecuente', 'Insomnio o mal descanso', 'Falta de motivación o energía']
};

const RISK_FROM_BAND = { bajo: 'low', medio: 'med', alto: 'high' };

function applySignalToAssessment(signal, { record = true } = {}) {
  if (!signal || typeof signal !== 'object') return false;
  const diag = state.assessment;
  let applied = false;

  Object.entries(SIGNAL_DIM_MAP).forEach(([key, meta]) => {
    const raw = Number(signal[key]);
    if (Number.isInteger(raw) && raw >= 1 && raw <= 5) {
      diag.responses[`chat_${key}`] = raw;
      diagnosticRecordScore(`chat_${key}`, meta.dim, raw, 5, meta.weight);
      applied = true;
    }
  });

  if (signal.burnout && BURNOUT_BAND_FLAGS[signal.burnout]) {
    const set = new Set(diag.burnoutFlags);
    BURNOUT_BAND_FLAGS[signal.burnout].forEach(flag => set.add(flag));
    diag.burnoutFlags = Array.from(set);
    applied = true;
  }

  if (signal.mood) {
    diag.responses['chat_mood'] = signal.mood;
  }

  if (Array.isArray(signal.tags) && signal.tags.length) {
    diag.responses['chat_tags'] = signal.tags.slice(0, 8).join(', ');
  }

  if (applied) {
    diagnosticDetectFlags();
    diag.sentimentScore = diagnosticComputeGlobalScore();
    const riskPct = diagnosticComputeRotationRisk();
    diag.riskPct = riskPct;
    diag.derived = {
      riskPct,
      burnoutCount: diag.burnoutFlags.length,
      mood: signal.mood || diag.responses.chat_mood || null,
      riskBand: signal.riesgo || null
    };
    diag.lastSignal = {
      at: new Date().toISOString(),
      source: 'ai',
      signal
    };
    if (record) {
      persistDiagnosticFromSignal(signal, riskPct);
    }
  }
  return applied;
}

async function persistDiagnosticFromSignal(signal, riskPct) {
  if (!state.token || !state.sessionId || !state.user) return;
  try {
    const score = state.assessment.sentimentScore;
    const label = diagnosticScoreToLabel(score);
    const burnoutCount = state.assessment.burnoutFlags.length;
    const flags = (state.assessment.flags || []).map(f => ({ level: f.tone, text: f.text }));
    await api('/api/diagnostics', {
      method: 'POST',
      body: JSON.stringify({
        sessionId: state.sessionId,
        stepId: 'chat_signal',
        stepLabel: 'Chat con IA',
        score,
        burnoutRisk: riskPct,
        burnoutCount,
        criticalDim: diagnosticCriticalDim(),
        flowLabel: label.label,
        flowTone: label.cls,
        flags,
        dims: { ...state.assessment.dims },
        responses: state.assessment.responses,
        createdAt: new Date().toISOString()
      })
    });
  } catch (_error) {
    // Ignorar errores de persistencia para no romper el chat.
  }
}

function applyKeywordFallbackToAssessment(userMessage) {
  if (!userMessage) return false;
  const lv = String(userMessage).toLowerCase();
  const burnoutHits = BURNOUT_KEYWORDS.filter(k => lv.includes(k));
  const supportHits = SUPPORT_KEYWORDS.filter(k => lv.includes(k));
  const distressHits = ['no puedo', 'me preocupa', 'me siento mal', 'ya no doy', 'no doy más', 'estoy mal', 'sin energía']
    .filter(p => lv.includes(p));

  const estres = clamp(5 - burnoutHits.length * 2 - distressHits.length, 1, 5);
  const satisfaccion = clamp(3 + supportHits.length - burnoutHits.length, 1, 5);
  const balance = clamp(4 - burnoutHits.length, 1, 5);
  const carga = clamp(5 - Math.max(burnoutHits.length, distressHits.length), 1, 5);
  const intencion_salida = clamp(5 - distressHits.length - burnoutHits.length, 1, 5);
  const burnout = burnoutHits.length >= 3 ? 'severo' : burnoutHits.length >= 1 ? 'leve' : 'ninguno';
  const mood = burnoutHits.length > supportHits.length ? 'negativo' : (supportHits.length > 0 ? 'positivo' : 'neutro');

  const signal = {
    estres,
    satisfaccion,
    balance,
    carga,
    intencion_salida,
    burnout,
    mood,
    tags: [...new Set([...burnoutHits, ...distressHits, ...supportHits])].slice(0, 8)
  };

  const applied = applySignalToAssessment(signal, { record: true });
  if (applied && state.assessment.lastSignal) {
    state.assessment.lastSignal.source = 'keywords';
    state.assessment.lastSignal.signal = signal;
  }
  return applied;
}

function rebuildAssessmentFromMessages(messages) {
  resetDiagnostic();
  if (!Array.isArray(messages) || !messages.length) return;
  messages.forEach(message => {
    if (message.role !== 'assistant' || !message.signal_json) return;
    try {
      const sig = JSON.parse(message.signal_json);
      applySignalToAssessment(sig, { record: false });
    } catch (_error) {
      // señal malformada, ignorar
    }
  });
  if (state.assessment.sentimentScore !== null) {
    state.assessment.lastSignal = state.assessment.lastSignal || {
      at: new Date().toISOString(),
      source: 'history',
      signal: null
    };
  }
}

function diagnosticAdvance(stepId) {
  state.assessment.currentStep = stepId;
  diagnosticCaptureSnapshot();
  render();
}

function diagnosticRegisterHandler(fn) {
  state.assessment._handlers.push(fn);
  return state.assessment._handlers.length - 1;
}

function renderDiagnosticTimeline() {
  const diag = state.assessment;
  if (!diag.history.length) {
    return '<div class="empty-state">La evolución aparecerá después de la primera respuesta.</div>';
  }

  return `<div class="timeline-stack">${diag.history.map(item => `
    <article class="timeline-item">
      <div class="timeline-top">
        <strong>${item.label.label} · ${item.score === null ? '—' : item.score + '%'}</strong>
        <span>${formatRelative(item.at)}</span>
      </div>
      <div class="timeline-bar"><span style="width:${item.score ?? 0}%"></span></div>
      <div class="timeline-note">Burnout: ${item.burnoutCount} · Crítica: ${escapeHtml(item.flags[0]?.text || 'Sin señales')}</div>
    </article>
  `).join('')}</div>`;
}

function renderDiagnosticProgress() {
  const answered = Object.keys(state.assessment.responses).length;
  const pct = Math.round((answered / DIAGNOSTIC_TOTAL) * 100);
  return `
    <div class="diag-progress">
      <div class="diag-progress-top">
        <span>${answered} / ${DIAGNOSTIC_TOTAL} preguntas</span>
        <strong>${pct}%</strong>
      </div>
      <div class="diag-progress-bar"><span style="width:${pct}%"></span></div>
    </div>
  `;
}

function renderDiagnosticStep() {
  const diag = state.assessment;
  const step = DIAGNOSTIC_FLOW.find(item => item.id === diag.currentStep);
  if (!step) return '<div class="empty-state">No hay diagnóstico activo.</div>';

  if (step.type === 'results') {
    diagnosticComputeResultMessage();
    const result = diag.results;
    return `
      <div class="diag-result">
        <div class="diag-result-head">
          <p class="eyebrow">RESULTADO FINAL</p>
          <h2>Estado emocional y riesgo</h2>
        </div>
        <div class="diag-result-summary">
          <article>
            <span>Sentimiento global</span>
            <strong>${result.score}%</strong>
          </article>
          <article>
            <span>Riesgo rotación</span>
            <strong>${result.riskPct}%</strong>
          </article>
          <article>
            <span>Burnout</span>
            <strong>${result.isBurnout ? 'Sí' : 'No'}</strong>
          </article>
          <article>
            <span>Dimensión crítica</span>
            <strong>${escapeHtml(result.critical)}</strong>
          </article>
        </div>
        <p class="diag-result-copy">${escapeHtml(result.message)}</p>
        <button class="primary-btn" type="button" id="restartDiagnosticBtn">Reiniciar diagnóstico</button>
      </div>
    `;
  }

  if (step.type === 'text_or_skip') {
    diag._awaitingFree = step;
    return `
      <div class="diag-step">
        <p class="eyebrow">PASO ${Math.min(DIAGNOSTIC_TOTAL, Object.keys(diag.responses).length + 1)}</p>
        <h2>${escapeHtml(step.bot)}</h2>
        <div class="diag-actions">
          <textarea id="diagFreeInput" rows="4" placeholder="Escribe tu comentario o salta esta pregunta..."></textarea>
          <div class="diag-action-row">
            <button class="primary-btn" type="button" id="diagFreeSend">Enviar respuesta</button>
            <button class="ghost-btn" type="button" id="diagFreeSkip">Saltar esta pregunta</button>
          </div>
        </div>
      </div>
    `;
  }

  return `
    <div class="diag-step">
      <p class="eyebrow">PASO ${Math.min(DIAGNOSTIC_TOTAL, Object.keys(diag.responses).length + 1)}</p>
      <h2>${escapeHtml(step.bot)}</h2>
      <div class="diag-options">
        ${(step.type === 'options' ? step.options : []).map(option => `
          <button class="diag-option" type="button" data-diag-option="${escapeHtml(option)}">${escapeHtml(option)}</button>
        `).join('')}
      </div>
      ${step.type === 'scale' ? `
        <div class="diag-scale">
          ${[1, 2, 3, 4, 5].map(value => `<button class="diag-scale-btn" type="button" data-diag-scale="${value}">${value}</button>`).join('')}
        </div>
      ` : ''}
      ${step.type === 'likert' ? `
        <div class="diag-likert">
          ${step.options.map((option, index) => `<button class="diag-likert-btn" type="button" data-diag-likert="${index}">${escapeHtml(option.label)}</button>`).join('')}
        </div>
      ` : ''}
      ${step.type === 'multiselect' ? `
        <div class="diag-multi" data-diag-multi-group>
          ${step.options.map(option => `<button class="diag-multi-btn ${diag._multiSelected.includes(option) ? 'active' : ''}" type="button" data-diag-multi="${escapeHtml(option)}">${escapeHtml(option)}</button>`).join('')}
          <button class="primary-btn diag-multi-confirm" type="button" id="diagMultiConfirm">Confirmar selección</button>
        </div>
      ` : ''}
      ${renderDiagnosticProgress()}
    </div>
  `;
}

function renderDiagnosticView() {
  if (!state.assessment) resetDiagnostic();

  const diag = state.assessment;
  const currentStep = DIAGNOSTIC_FLOW.find(item => item.id === diag.currentStep);
  const isResults = currentStep?.type === 'results' || diag.completed;

  return `
    <section class="panel diagnostic-panel fade-in">
      <div class="panel-head">
        <div>
          <p class="eyebrow">VISTA DIAGNÓSTICO</p>
          <h2>Flujo original de bienestar</h2>
        </div>
        <div class="panel-actions">
          <span class="chip ${isResults ? 'success' : ''}">${isResults ? 'Completado' : 'En progreso'}</span>
          <button class="ghost-btn" type="button" id="resetDiagnosticBtn">Reiniciar</button>
        </div>
      </div>

      <p class="panel-copy">Esta vista recupera el flujo original de preguntas, puntuación por dimensiones, burnout y evolución del estado a medida que respondes.</p>

      <div class="diagnostic-layout">
        <div class="diagnostic-main">
          ${renderDiagnosticStep()}
        </div>
        <div class="diagnostic-side">
          <section class="mini-panel">
            <h3 class="section-label">Dimensiones</h3>
            <div class="diag-dim-list">
              ${[
                ['sat', 'Satisfacción'],
                ['str', 'Estrés'],
                ['lid', 'Liderazgo'],
                ['cre', 'Crecimiento'],
                ['tea', 'Compañeros'],
                ['rem', 'Remuneración'],
                ['wl', 'Carga laboral'],
                ['bal', 'Balance']
              ].map(([dim, label]) => {
                const value = diag.dims[dim] || 0;
                return `
                  <div class="diag-dim-row">
                    <div class="diag-dim-top"><span>${label}</span><strong>${diag.dims[dim] ? `${value}%` : '—'}</strong></div>
                    <div class="diag-dim-bar"><span style="width:${value}%"></span></div>
                  </div>
                `;
              }).join('')}
            </div>
          </section>

          <section class="mini-panel">
            <h3 class="section-label">Evolución del estado</h3>
            ${renderDiagnosticTimeline()}
          </section>
        </div>
      </div>
    </section>
  `;
}

function getConversationInsights(messages = []) {
  const userMessages = messages.filter(message => message.role === 'user').map(message => message.content || '');
  const assistantMessages = messages.filter(message => message.role === 'assistant').map(message => message.content || '');
  const allUserText = userMessages.join(' ').toLowerCase();
  const assistantText = assistantMessages.join(' ').toLowerCase();
  const questionMarks = (allUserText.match(/\?/g) || []).length;
  const userTurns = userMessages.length;
  const assistantTurns = assistantMessages.length;
  const totalTurns = messages.length;
  const avgUserLength = userMessages.length
    ? userMessages.reduce((sum, text) => sum + text.length, 0) / userMessages.length
    : 0;

  const burnoutHits = BURNOUT_KEYWORDS.reduce((sum, keyword) => sum + (allUserText.includes(keyword) ? 1 : 0), 0);
  const supportHits = SUPPORT_KEYWORDS.reduce((sum, keyword) => sum + (allUserText.includes(keyword) ? 1 : 0), 0);
  const distressPhrases = ['no puedo', 'me preocupa', 'me siento mal', 'ya no doy', 'no doy más', 'estoy mal'];
  const distressHits = distressPhrases.reduce((sum, phrase) => sum + (allUserText.includes(phrase) ? 1 : 0), 0);

  let flowScore = 0;
  if (totalTurns) {
    const balance = 1 - Math.min(1, Math.abs(userTurns - assistantTurns) / Math.max(1, totalTurns));
    const phrasing = Math.min(18, Math.round(avgUserLength / 18));
    flowScore = 30 + userTurns * 7 + assistantTurns * 4 + questionMarks * 4 + balance * 18 + phrasing;
    if (totalTurns < 4) flowScore -= 10;
    if (burnoutHits > 0) flowScore -= burnoutHits * 4;
  }
  flowScore = clamp(Math.round(flowScore), 0, 100);

  let burnoutRisk = 0;
  if (totalTurns) {
    burnoutRisk = 100
      - burnoutHits * 18
      - distressHits * 15
      + supportHits * 4
      - Math.max(0, 2 - userTurns) * 4;
  }
  burnoutRisk = clamp(Math.round(burnoutRisk), 0, 100);

  const flow = scoreLabel(flowScore);
  const burnout = scoreLabel(burnoutRisk);
  const flags = [];

  if (!totalTurns) {
    flags.push({ tone: 'neutral', text: 'Sin señales todavía' });
  } else {
    if (burnoutHits >= 3) {
      flags.push({ tone: 'danger', text: `Burnout probable (${burnoutHits} señales)` });
    } else if (burnoutHits >= 1) {
      flags.push({ tone: 'warn', text: `${burnoutHits} señal(es) de agotamiento` });
    }

    if (distressHits >= 1) {
      flags.push({ tone: 'danger', text: 'Lenguaje de malestar detectado' });
    }

    if (questionMarks >= 2) {
      flags.push({ tone: 'good', text: 'Conversación exploratoria activa' });
    }

    if (assistantTurns < userTurns && totalTurns >= 2) {
      flags.push({ tone: 'warn', text: 'El bot debería recuperar más contexto' });
    }

    if (flags.length === 0) {
      flags.push({ tone: 'good', text: 'Flujo estable' });
    }
  }

  return {
    flowScore,
    flowLabel: flow.label,
    flowTone: flow.tone,
    burnoutRisk,
    burnoutLabel: burnout.label,
    burnoutTone: burnout.tone,
    flags,
    userTurns,
    assistantTurns,
    totalTurns
  };
}

async function api(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  }

  const response = await fetch(path, {
    ...options,
    headers
  });

  if (!response.ok) {
    let payload = {};
    try {
      payload = await response.json();
    } catch (_error) {
      payload = {};
    }
    const error = new Error(payload.error || `http_${response.status}`);
    error.status = response.status;
    error.code = payload.error || `http_${response.status}`;
    throw error;
  }

  return response.json();
}

function setLocalAuth(token, user, sessionId) {
  state.token = token || '';
  state.user = user || null;
  state.sessionId = sessionId || null;

  if (token) {
    localStorage.setItem(STORAGE_KEYS.token, token);
  } else {
    localStorage.removeItem(STORAGE_KEYS.token);
  }

  if (sessionId) {
    localStorage.setItem(STORAGE_KEYS.sessionId, String(sessionId));
  } else {
    localStorage.removeItem(STORAGE_KEYS.sessionId);
  }
}

function clearAuth() {
  state.user = null;
  state.sessionId = null;
  state.token = '';
  state.dashboard = null;
  state.adminOverview = null;
  state.chatMessages = [];
  resetDiagnostic();
  state.chatBusy = false;
  localStorage.removeItem(STORAGE_KEYS.token);
  localStorage.removeItem(STORAGE_KEYS.sessionId);
}

function setView(view) {
  state.activeView = view;
  localStorage.setItem(STORAGE_KEYS.activeView, view);
  state.errorMessage = '';
  state.noticeMessage = '';
  if (view === 'admin' && canOpenAdmin()) {
    void refreshAdminOverview();
  }
  render();
}

async function refreshAdminOverview() {
  try {
    state.adminOverview = await api('/api/admin/overview');
  } catch (_error) {
    state.adminOverview = null;
  }
}

function setAuthTab(tab) {
  state.authTab = tab;
  localStorage.setItem(STORAGE_KEYS.authTab, tab);
  state.authMessage = '';
  state.errorMessage = '';
  render();
}

function roleLabel(role) {
  return role === 'admin' ? 'Administrador' : 'Usuario';
}

function activeSessionLabel() {
  if (!state.user) return 'Acceso requerido';
  if (state.sessionId && state.dashboard?.sessions?.length) {
    const active = state.dashboard.sessions.find(session => Number(session.id) === Number(state.sessionId));
    if (active) return active.label;
  }
  return 'Nueva conversación';
}

function canOpenAdmin() {
  return state.user?.role === 'admin';
}

function renderBanner() {
  const message = state.errorMessage || state.noticeMessage;
  if (!message) return '';
  const type = state.errorMessage ? 'error' : 'notice';
  return `<div class="banner ${type}">${escapeHtml(message)}</div>`;
}

function renderStatusChip() {
  if (!state.health) {
    return '<span class="status-pill subtle">Conectando...</span>';
  }

  const dbState = state.health.dbPath ? 'SQLite activo' : 'SQLite local';
  const ollamaState = state.health.ollamaBaseUrl ? `Ollama ${escapeHtml(state.health.ollamaModel || '')}` : 'Ollama';

  return `
    <div class="status-stack">
      <span class="status-pill good">${dbState}</span>
      <span class="status-pill subtle">${ollamaState}</span>
    </div>
  `;
}

function renderViewCards() {
  const cards = [
    {
      key: 'chat',
      eyebrow: 'VISTA 01',
      title: 'Chatbot privado',
      text: 'Conversación con Ollama que también clasifica tu estado de bienestar en tiempo real.',
      access: true
    },
    {
      key: 'me',
      eyebrow: 'VISTA 02',
      title: 'Panel personal',
      text: 'Consulta tu historial, tus sesiones y el estado de tus conversaciones.',
      access: true
    },
    {
      key: 'diagnostic',
      eyebrow: 'VISTA 03',
      title: 'Diagnóstico guiado',
      text: 'Flujo de 12 pasos con scoring, dimensiones y riesgo de rotación.',
      access: true
    },
    {
      key: 'admin',
      eyebrow: 'VISTA 04',
      title: 'Panel administrativo',
      text: 'Usuarios registrados, mensajes recientes, sesiones y salud operativa.',
      access: canOpenAdmin()
    }
  ];

  return cards.map(card => `
    <button class="view-card ${state.activeView === card.key ? 'active' : ''} ${card.access ? '' : 'locked'}" data-switch-view="${card.key}" ${card.access ? '' : 'disabled'}>
      <span class="view-card-eyebrow">${card.eyebrow}</span>
      <strong>${card.title}</strong>
      <span>${card.text}</span>
      <span class="view-card-action">${card.access ? 'Abrir vista' : 'Bloqueado'}</span>
    </button>
  `).join('');
}

function renderAuthPanel() {
  const registerActive = state.authTab === 'register';
  const adminActive = state.authTab === 'admin';

  return `
    <section class="panel auth-panel fade-in">
      <div class="panel-head">
        <div>
          <p class="eyebrow">Acceso obligatorio</p>
          <h2>Regístrate para entrar al chatbot</h2>
        </div>
        <span class="chip lock">Sin modo anónimo</span>
      </div>
      <p class="panel-copy">El usuario debe registrarse antes de escribir. El backend guarda usuarios, sesiones y mensajes en SQLite y usa Ollama para responder.</p>

      <div class="auth-tabs">
        <button class="tab ${registerActive ? 'active' : ''}" data-auth-tab="register">Registro usuario</button>
        <button class="tab ${adminActive ? 'active' : ''}" data-auth-tab="admin">Acceso admin</button>
      </div>

      ${registerActive ? `
        <form id="registerForm" class="form-grid">
          <label class="field"><span>Nombre completo</span><input name="name" type="text" placeholder="Ana Perez" required maxlength="80" /></label>
          <label class="field"><span>Correo electrónico</span><input name="email" type="email" placeholder="ana@empresa.com" required maxlength="120" /></label>
          <label class="field"><span>Empresa</span><input name="company" type="text" placeholder="ITY.DIGITAL" required maxlength="80" /></label>
          <label class="field"><span>Departamento</span><input name="department" type="text" placeholder="Operaciones / Desarrollo" required maxlength="80" /></label>
          <label class="field field-wide check"><input name="consent" type="checkbox" required /><span>Acepto que mis mensajes se almacenen en SQLite para análisis y seguimiento interno.</span></label>
          <button class="primary-btn" type="submit" ${state.loading ? 'disabled' : ''}>Crear acceso</button>
        </form>
      ` : `
        <form id="adminForm" class="form-grid compact">
          <label class="field field-wide"><span>Código administrativo</span><input name="code" type="password" placeholder="ity-admin-mvp" required maxlength="80" /></label>
          <button class="primary-btn" type="submit" ${state.loading ? 'disabled' : ''}>Entrar al panel</button>
          <p class="micro-copy">Usa el código definido en el backend para entrar como administrador.</p>
        </form>
      `}

      ${state.authMessage ? `<div class="inline-note success">${escapeHtml(state.authMessage)}</div>` : ''}
      ${renderBanner()}
    </section>
  `;
}

function renderChatView() {
  const messages = state.chatMessages.length
    ? state.chatMessages.map(message => `
      <article class="message ${message.role}">
        <div class="avatar">${message.role === 'assistant' ? 'IA' : 'Tú'}</div>
        <div class="bubble">
          <div class="bubble-meta">${message.role === 'assistant' ? 'Ollama' : state.user?.name || 'Usuario'} · ${formatDate(message.created_at)}</div>
          <div class="bubble-body">${escapeHtml(message.content).replace(/\n/g, '<br>')}</div>
        </div>
      </article>
    `).join('')
    : `<div class="empty-state">Aún no hay mensajes en esta sesión. Empieza la conversación para dejar trazabilidad en SQLite.</div>`;

  return `
    <section class="panel chat-panel fade-in">
      <div class="panel-head">
        <div>
          <p class="eyebrow">VISTA CHAT</p>
          <h2>Conversación asistida por Ollama</h2>
        </div>
        <div class="panel-actions">
          <span class="chip">${escapeHtml(activeSessionLabel())}</span>
          ${renderWellnessPill()}
          <button class="ghost-btn" id="toggleWellnessPanelBtn" type="button">${state.wellnessPanelOpen ? 'Ocultar diagnóstico' : 'Ver diagnóstico'}</button>
          <button class="ghost-btn" id="newConversationBtn" type="button">Nueva conversación</button>
        </div>
      </div>

      <div class="chat-layout ${state.wellnessPanelOpen ? 'with-side' : ''}">
        <div class="chat-main">
          <div class="chat-stream" id="chatStream">
            ${messages}
            ${state.chatBusy ? `
              <article class="message assistant typing-row">
                <div class="avatar">IA</div>
                <div class="bubble typing-bubble"><span></span><span></span><span></span></div>
              </article>
            ` : ''}
          </div>

          <div class="quick-actions">
            <button class="quick-chip" data-quick-message="Muéstrame las vistas disponibles del sistema.">Vistas disponibles</button>
            <button class="quick-chip" data-quick-message="Resume el estado de mis sesiones y mensajes.">Resumen personal</button>
            <button class="quick-chip" data-quick-message="Explícame cómo funciona el panel administrativo.">Cómo funciona admin</button>
          </div>

          <form id="chatForm" class="composer">
            <textarea id="chatInput" name="message" rows="3" placeholder="Escribe aquí..." maxlength="4000" ${state.chatBusy ? 'disabled' : ''}></textarea>
            <div class="composer-actions">
              <span class="composer-hint">Todo mensaje queda ligado a tu usuario registrado.</span>
              <button class="primary-btn" type="submit" ${state.chatBusy ? 'disabled' : ''}>Enviar</button>
            </div>
          </form>
        </div>
        ${state.wellnessPanelOpen ? `<aside class="chat-side" id="wellnessSidePanel">${renderWellnessPanel()}</aside>` : ''}
      </div>
    </section>
  `;
}

function renderPersonalView() {
  const sessions = state.dashboard?.sessions || [];
  const latestMessages = state.dashboard?.latestMessages || [];
  const summary = state.dashboard?.summary || { users: 0, sessions: 0, messages: 0 };

  return `
    <section class="panel data-panel fade-in">
      <div class="panel-head">
        <div>
          <p class="eyebrow">VISTA PERSONAL</p>
          <h2>Tu actividad y sesiones</h2>
        </div>
        <span class="chip">${summary.sessions} sesiones totales</span>
      </div>

      <div class="metric-grid">
        <article class="metric-card">
          <span>Usuarios registrados</span>
          <strong>${summary.users}</strong>
        </article>
        <article class="metric-card">
          <span>Conversaciones</span>
          <strong>${summary.sessions}</strong>
        </article>
        <article class="metric-card">
          <span>Mensajes guardados</span>
          <strong>${summary.messages}</strong>
        </article>
        <article class="metric-card">
          <span>Estado de acceso</span>
          <strong>${roleLabel(state.user?.role || 'user')}</strong>
        </article>
      </div>

      <div class="split-grid">
        <div>
          <h3 class="section-label">Sesiones recientes</h3>
          <div class="stack-list">
            ${sessions.length ? sessions.map(session => `
              <button class="session-item ${Number(session.id) === Number(state.sessionId) ? 'active' : ''}" data-session-id="${session.id}">
                <div>
                  <strong>${escapeHtml(session.label)}</strong>
                  <span>${escapeHtml(formatRelative(session.updated_at))}</span>
                </div>
                <span class="session-pill">${session.id}</span>
              </button>
            `).join('') : '<div class="empty-state">Todavía no hay sesiones registradas.</div>'}
          </div>
        </div>

        <div>
          <h3 class="section-label">Mensajes recientes</h3>
          <div class="stack-list messages-mini">
            ${latestMessages.length ? latestMessages.map(message => `
              <article class="mini-row">
                <div>
                  <strong>${message.role === 'assistant' ? 'IA' : 'Tú'}</strong>
                  <span>${escapeHtml(message.content).slice(0, 120)}</span>
                </div>
                <time>${escapeHtml(formatRelative(message.created_at))}</time>
              </article>
            `).join('') : '<div class="empty-state">Aún no hay mensajes para mostrar.</div>'}
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderAdminView() {
  if (!canOpenAdmin()) {
    return `
      <section class="panel locked-panel fade-in">
        <p class="eyebrow">VISTA ADMIN</p>
        <h2>Panel restringido</h2>
        <p class="panel-copy">Esta vista solo está disponible para la cuenta de administración. Usa el acceso admin en la pantalla de registro.</p>
      </section>
    `;
  }

  const summary = state.adminOverview?.summary || { users: 0, sessions: 0, messages: 0 };
  const users = state.adminOverview?.users || [];
  const sessions = state.adminOverview?.sessions || [];
  const recentMessages = state.adminOverview?.recentMessages || [];
  const recentDiagnostics = state.adminOverview?.recentDiagnostics || [];

  return `
    <section class="panel admin-panel fade-in">
      <div class="panel-head">
        <div>
          <p class="eyebrow">VISTA ADMIN</p>
          <h2>Panel administrativo</h2>
        </div>
        <span class="chip success">SQLite + Ollama</span>
      </div>

      <div class="metric-grid">
        <article class="metric-card">
          <span>Usuarios</span>
          <strong>${summary.users}</strong>
        </article>
        <article class="metric-card">
          <span>Sesiones</span>
          <strong>${summary.sessions}</strong>
        </article>
        <article class="metric-card">
          <span>Mensajes</span>
          <strong>${summary.messages}</strong>
        </article>
        <article class="metric-card">
          <span>Rol activo</span>
          <strong>${roleLabel(state.user?.role || 'admin')}</strong>
        </article>
      </div>

      <div class="table-card">
        <div class="table-head">
          <h3 class="section-label">Usuarios registrados</h3>
          <span class="table-note">${users.length} filas</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Correo</th>
                <th>Departamento</th>
                <th>Empresa</th>
                <th>Sesiones</th>
                <th>Mensajes</th>
                <th>Último acceso</th>
              </tr>
            </thead>
            <tbody>
              ${users.length ? users.map(user => `
                <tr>
                  <td>${escapeHtml(user.name)}</td>
                  <td>${escapeHtml(user.email)}</td>
                  <td>${escapeHtml(user.department)}</td>
                  <td>${escapeHtml(user.company)}</td>
                  <td>${Number(user.sessions_count || 0)}</td>
                  <td>${Number(user.messages_count || 0)}</td>
                  <td>${escapeHtml(formatRelative(user.last_seen_at))}</td>
                </tr>
              `).join('') : '<tr><td colspan="7" class="table-empty">No hay usuarios registrados.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>

      <div class="two-up">
        <div class="table-card">
          <div class="table-head">
            <h3 class="section-label">Sesiones activas</h3>
            <span class="table-note">Últimas 20</span>
          </div>
          <div class="stack-list admin-stack">
            ${sessions.length ? sessions.map(session => `
              <article class="mini-row admin-session">
                <div>
                  <strong>${escapeHtml(session.label)}</strong>
                  <span>${escapeHtml(session.user_name)} · ${escapeHtml(session.user_email)}</span>
                </div>
                <div class="session-meta">
                  <span>${session.messages_count || 0} mensajes</span>
                  <span>${escapeHtml(formatRelative(session.updated_at))}</span>
                </div>
              </article>
            `).join('') : '<div class="empty-state">No hay sesiones todavía.</div>'}
          </div>
        </div>

        <div class="table-card">
          <div class="table-head">
            <h3 class="section-label">Mensajes recientes</h3>
            <span class="table-note">Últimos 40</span>
          </div>
          <div class="stack-list admin-stack messages-mini">
            ${recentMessages.length ? recentMessages.map(message => `
              <article class="mini-row message-log">
                <div>
                  <strong>${message.role === 'assistant' ? 'IA' : 'Usuario'}</strong>
                  <span>${escapeHtml(message.content).slice(0, 160)}</span>
                </div>
                <time>${escapeHtml(formatRelative(message.created_at))}</time>
              </article>
            `).join('') : '<div class="empty-state">Aún no hay mensajes.</div>'}
          </div>
        </div>
      </div>

      <div class="table-card">
        <div class="table-head">
          <h3 class="section-label">Diagnósticos recientes</h3>
          <span class="table-note">Últimos 40 snapshots</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Sesión</th>
                <th>Paso</th>
                <th>Sentimiento</th>
                <th>Burnout</th>
                <th>Crítica</th>
                <th>Flags</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              ${recentDiagnostics.length ? recentDiagnostics.map(item => `
                <tr>
                  <td>${escapeHtml(item.user_name)}<br><span class="table-subtle">${escapeHtml(item.user_email)}</span></td>
                  <td>${escapeHtml(item.session_label)}</td>
                  <td>${escapeHtml(item.step_label)}</td>
                  <td><span class="tag ${item.flow_tone === 'good' ? 'pos' : item.flow_tone === 'warn' ? 'amb' : 'neg'}">${item.score ?? '—'}%</span></td>
                  <td>${item.burnout_risk ?? '—'}%</td>
                  <td>${escapeHtml(item.critical_dim || '—')}</td>
                  <td>${escapeHtml((JSON.parse(item.flags_json || '[]') || []).map(flag => flag.text).join(' · ') || '—')}</td>
                  <td>${escapeHtml(formatRelative(item.created_at))}</td>
                </tr>
              `).join('') : '<tr><td colspan="8" class="table-empty">No hay diagnósticos registrados.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  `;
}

function renderSidebar() {
  const sessionCount = state.dashboard?.summary?.sessions || state.adminOverview?.summary?.sessions || state.dashboard?.sessions?.length || 0;
  const messageCount = state.dashboard?.summary?.messages || state.adminOverview?.summary?.messages || 0;
  const userCount = state.dashboard?.summary?.users || state.adminOverview?.summary?.users || 0;
  const insights = getConversationInsights(state.chatMessages);
  const diag = state.assessment || createDiagnosticState();

  return `
    <aside class="rail">
      <section class="panel rail-card rail-highlight fade-in">
        <div class="panel-head slim">
          <div>
            <p class="eyebrow">ANÁLISIS VIVO</p>
            <h2>Flujo y burnout</h2>
          </div>
          <span class="chip ${insights.flowTone === 'good' ? 'success' : insights.flowTone === 'warn' ? '' : 'lock'}">${insights.totalTurns ? `${insights.flowScore}% flujo` : 'Esperando chat'}</span>
        </div>

        <div class="analysis-grid">
          <article class="analysis-card">
            <div class="analysis-head">
              <span>Fluidez de conversación</span>
              <strong>${insights.flowScore}%</strong>
            </div>
            <div class="analysis-bar">
              <div class="analysis-fill flow ${insights.flowTone}" style="width:${insights.flowScore}%"></div>
            </div>
            <p>${insights.totalTurns ? insights.flowLabel : 'Se activa con el primer intercambio.'}</p>
          </article>

          <article class="analysis-card">
            <div class="analysis-head">
              <span>Riesgo de burnout</span>
              <strong>${insights.burnoutRisk}%</strong>
            </div>
            <div class="analysis-bar">
              <div class="analysis-fill burnout ${insights.burnoutTone}" style="width:${insights.burnoutRisk}%"></div>
            </div>
            <p>${insights.totalTurns ? insights.burnoutLabel : 'Sin conversación no hay señal.'}</p>
          </article>
        </div>

        <div class="flag-stack">
          ${insights.flags.map(flag => `<span class="flag-chip ${flag.tone}">${escapeHtml(flag.text)}</span>`).join('')}
        </div>

        <div class="analysis-meta">
          <span>${insights.userTurns} turnos del usuario</span>
          <span>${insights.assistantTurns} respuestas del bot</span>
        </div>
      </section>

      <section class="panel rail-card fade-in">
        <div class="panel-head slim">
          <div>
            <p class="eyebrow">DIMENSIONES</p>
            <h2>Estado del diagnóstico</h2>
          </div>
          <span class="chip ${Object.keys(diag.scores).length ? 'success' : ''}">${Object.keys(diag.scores).length ? 'Activo' : 'Pendiente'}</span>
        </div>
        <div class="rail-dim-list">
          ${[
            ['sat', 'Satisfacción'],
            ['str', 'Estrés'],
            ['lid', 'Liderazgo'],
            ['cre', 'Crecimiento'],
            ['tea', 'Compañeros'],
            ['rem', 'Remuneración'],
            ['wl', 'Carga'],
            ['bal', 'Balance']
          ].map(([dim, label]) => {
            const value = diag.dims[dim] || 0;
            return `
              <div class="rail-dim-row">
                <div class="rail-dim-top"><span>${label}</span><strong>${value ? `${value}%` : '—'}</strong></div>
                <div class="rail-dim-bar"><span style="width:${value}%"></span></div>
              </div>
            `;
          }).join('')}
        </div>
      </section>

      <section class="panel rail-card fade-in">
        <div class="panel-head slim">
          <div>
            <p class="eyebrow">IDENTIDAD</p>
            <h2>${state.user ? escapeHtml(state.user.name) : 'Acceso cerrado'}</h2>
          </div>
          <span class="chip">${state.user ? roleLabel(state.user.role) : 'Invitado'}</span>
        </div>
        <p class="panel-copy">${state.user ? `Usuario registrado con correo ${escapeHtml(state.user.email)}.` : 'El chatbot exige registro previo para operar.'}</p>
      </section>

      <section class="panel rail-card fade-in">
        <div class="panel-head slim">
          <div>
            <p class="eyebrow">SALUD DEL SISTEMA</p>
            <h2>Conexiones</h2>
          </div>
        </div>
        <div class="stack-list">
          <article class="mini-row">
            <div>
              <strong>SQLite</strong>
              <span>${state.health?.dbPath ? 'Base local disponible' : 'No verificado'}</span>
            </div>
            <span class="status-pill good">Activo</span>
          </article>
          <article class="mini-row">
            <div>
              <strong>Ollama</strong>
              <span>${escapeHtml(state.health?.ollamaBaseUrl || 'http://localhost:11434')}</span>
            </div>
            <span class="status-pill subtle">${escapeHtml(state.health?.ollamaModel || 'llama3.2:1b')}</span>
          </article>
        </div>
      </section>

      <section class="panel rail-card fade-in">
        <div class="panel-head slim">
          <div>
            <p class="eyebrow">RESUMEN</p>
            <h2>Actividad</h2>
          </div>
        </div>
        <div class="metric-stack">
          <article class="metric-card compact"><span>Usuarios</span><strong>${userCount}</strong></article>
          <article class="metric-card compact"><span>Sesiones</span><strong>${sessionCount}</strong></article>
          <article class="metric-card compact"><span>Mensajes</span><strong>${messageCount}</strong></article>
        </div>
      </section>

      <section class="panel rail-card fade-in">
        <div class="panel-head slim">
          <div>
            <p class="eyebrow">REGLA CLAVE</p>
            <h2>Sin anonimato</h2>
          </div>
        </div>
        <div class="rule-list">
          <div>1. El usuario se registra antes de escribir.</div>
          <div>2. Cada chat queda ligado a una sesión SQLite.</div>
          <div>3. El panel admin consolida usuarios y mensajes.</div>
          <div>4. Ollama responde desde el backend local.</div>
        </div>
      </section>
    </aside>
  `;
}

function renderWorkspace() {
  if (!state.user) {
    return `
      <section class="workspace-grid single">
        <div class="hero-panel fade-in">
          <p class="eyebrow">MVP ROBUSTO</p>
          <h1>Chatbot de bienestar con acceso controlado, panel admin y persistencia local.</h1>
          <p class="hero-copy">La interfaz muestra las vistas disponibles, pero el chat no se desbloquea sin registro. Las conversaciones se guardan en SQLite y las respuestas se sirven desde Ollama en Docker.</p>
          <div class="hero-points">
            <span class="chip">Registro obligatorio</span>
            <span class="chip">SQLite local</span>
            <span class="chip">Ollama Docker</span>
            <span class="chip">Panel administrativo</span>
          </div>
        </div>
        ${renderAuthPanel()}
      </section>
    `;
  }

  const view = state.activeView === 'admin' && !canOpenAdmin() ? 'chat' : state.activeView;

  let primary = '';
  if (view === 'chat') primary = renderChatView();
  if (view === 'me') primary = renderPersonalView();
  if (view === 'diagnostic') primary = renderDiagnosticView();
  if (view === 'admin') primary = renderAdminView();

  return `
    <section class="workspace-grid">
      <div class="primary-column">
        ${renderAuthPanel().replace('panel auth-panel fade-in', 'panel auth-panel gate hidden')}
        ${primary}
      </div>
      ${renderSidebar()}
    </section>
  `;
}

function render() {
  app.innerHTML = `
    <div class="page-shell">
      <header class="topbar">
        <div class="brand-block">
          <div class="brand-mark">ITY</div>
          <div>
            <p class="eyebrow">ITY.DIGITAL</p>
            <h1>Chatbot de bienestar laboral</h1>
            <p class="brand-copy">Sesiones privadas, panel administrativo y trazabilidad en SQLite.</p>
          </div>
        </div>
        <div class="topbar-meta">
          ${renderStatusChip()}
          ${state.user ? `<button id="logoutBtn" class="ghost-btn" type="button">Cerrar sesión</button>` : ''}
        </div>
      </header>

      <section class="hero-panel intro-panel fade-in">
        <div class="intro-copy">
          <p class="eyebrow">VISTAS DISPONIBLES</p>
          <h2>Un MVP serio para registro, conversación asistida y supervisión administrativa.</h2>
          <p class="hero-copy">La vista pública presenta el chatbot, la vista personal muestra sesiones y la vista admin permite auditar usuarios, mensajes y actividad operativa. Todo con una interfaz cuidada y lista para escalar.</p>
        </div>
        <div class="hero-actions">
          <span class="chip outline">Panel privado</span>
          <span class="chip outline">Mensajes persistidos</span>
          <span class="chip outline">Modelo configurable</span>
        </div>
      </section>

      <section class="view-grid fade-in">
        ${renderViewCards()}
      </section>

      ${state.booting ? `<div class="panel loading-panel fade-in"><div class="loading-line"></div><div class="loading-line short"></div></div>` : ''}

      ${renderBanner()}

      ${renderWorkspace()}
    </div>
  `;

  bindEvents();
  requestAnimationFrame(() => {
    const stream = document.getElementById('chatStream');
    if (stream) stream.scrollTop = stream.scrollHeight;
  });
}

function bindEvents() {
  document.querySelectorAll('[data-switch-view]').forEach(button => {
    button.addEventListener('click', () => {
      const view = button.getAttribute('data-switch-view');
      if (view === 'admin' && !canOpenAdmin()) {
        state.errorMessage = 'La vista administrativa requiere acceso admin.';
        render();
        return;
      }
      setView(view);
    });
  });

  document.querySelectorAll('[data-auth-tab]').forEach(button => {
    button.addEventListener('click', () => setAuthTab(button.getAttribute('data-auth-tab')));
  });

  const registerForm = document.getElementById('registerForm');
  if (registerForm) {
    registerForm.addEventListener('submit', handleRegister);
  }

  const adminForm = document.getElementById('adminForm');
  if (adminForm) {
    adminForm.addEventListener('submit', handleAdminLogin);
  }

  const chatForm = document.getElementById('chatForm');
  if (chatForm) {
    chatForm.addEventListener('submit', handleChatSend);
  }

  const chatInput = document.getElementById('chatInput');
  if (chatInput) {
    chatInput.addEventListener('input', event => {
      state.draft = event.target.value;
    });
  }

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', handleLogout);
  }

  const newConversationBtn = document.getElementById('newConversationBtn');
  if (newConversationBtn) {
    newConversationBtn.addEventListener('click', startNewConversation);
  }

  const toggleWellnessPanelBtn = document.getElementById('toggleWellnessPanelBtn');
  if (toggleWellnessPanelBtn) {
    toggleWellnessPanelBtn.addEventListener('click', () => {
      state.wellnessPanelOpen = !state.wellnessPanelOpen;
      render();
    });
  }

  const resetAssessmentBtn = document.getElementById('resetAssessmentBtn');
  if (resetAssessmentBtn) {
    resetAssessmentBtn.addEventListener('click', () => {
      resetDiagnostic();
      state.noticeMessage = 'Diagnóstico reiniciado. La próxima conversación empezará de cero.';
      render();
    });
  }

  document.querySelectorAll('[data-quick-message]').forEach(button => {
    button.addEventListener('click', () => {
      const input = document.getElementById('chatInput');
      if (!input) return;
      input.value = button.getAttribute('data-quick-message') || '';
      state.draft = input.value;
      input.focus();
    });
  });

  document.querySelectorAll('[data-session-id]').forEach(button => {
    button.addEventListener('click', async () => {
      const sessionId = Number(button.getAttribute('data-session-id'));
      if (!sessionId) return;
      await openSession(sessionId);
    });
  });

  document.querySelectorAll('[data-diag-option]').forEach(button => {
    button.addEventListener('click', () => handleDiagnosticOption(button.getAttribute('data-diag-option')));
  });

  document.querySelectorAll('[data-diag-scale]').forEach(button => {
    button.addEventListener('click', () => handleDiagnosticScale(Number(button.getAttribute('data-diag-scale'))));
  });

  document.querySelectorAll('[data-diag-likert]').forEach(button => {
    button.addEventListener('click', () => handleDiagnosticLikert(Number(button.getAttribute('data-diag-likert'))));
  });

  document.querySelectorAll('[data-diag-multi]').forEach(button => {
    button.addEventListener('click', () => handleDiagnosticMulti(button.getAttribute('data-diag-multi')));
  });

  const diagFreeSend = document.getElementById('diagFreeSend');
  if (diagFreeSend) diagFreeSend.addEventListener('click', handleDiagnosticFreeSend);

  const diagFreeSkip = document.getElementById('diagFreeSkip');
  if (diagFreeSkip) diagFreeSkip.addEventListener('click', handleDiagnosticFreeSkip);

  const diagMultiConfirm = document.getElementById('diagMultiConfirm');
  if (diagMultiConfirm) diagMultiConfirm.addEventListener('click', handleDiagnosticMultiConfirm);

  const resetDiagnosticBtn = document.getElementById('resetDiagnosticBtn');
  if (resetDiagnosticBtn) resetDiagnosticBtn.addEventListener('click', () => {
    resetDiagnostic();
    render();
  });

  const restartDiagnosticBtn = document.getElementById('restartDiagnosticBtn');
  if (restartDiagnosticBtn) restartDiagnosticBtn.addEventListener('click', () => {
    resetDiagnostic();
    render();
  });
}

function getDiagnosticStep(stepId) {
  return DIAGNOSTIC_FLOW.find(item => item.id === stepId);
}

function diagnosticGoTo(nextStep) {
  state.assessment.currentStep = nextStep;
  if (nextStep === 'results') {
    state.assessment.completed = true;
  }
  diagnosticCaptureSnapshot();
  render();
}

function handleDiagnosticOption(value) {
  const step = getDiagnosticStep(state.assessment.currentStep);
  if (!step) return;
  if (step.key) state.assessment.responses[step.key] = value;
  diagnosticGoTo(step.nextMap?.[value] || step.next);
}

function handleDiagnosticScale(value) {
  const step = getDiagnosticStep(state.assessment.currentStep);
  if (!step) return;
  state.assessment.responses[step.key] = value;
  diagnosticRecordScore(step.key, step.dim, value, 5, step.weight);
  diagnosticGoTo(step.next);
}

function handleDiagnosticLikert(index) {
  const step = getDiagnosticStep(state.assessment.currentStep);
  if (!step) return;
  const option = step.options[index];
  state.assessment.responses[step.key] = option.label;
  diagnosticRecordScore(step.key, step.dim, option.score, 5, step.weight);
  diagnosticGoTo(step.next);
}

function handleDiagnosticMulti(value) {
  const selected = state.assessment._multiSelected;
  if (value === 'Ninguno de los anteriores') {
    state.assessment._multiSelected = ['Ninguno de los anteriores'];
    render();
    return;
  }

  const noneIndex = selected.indexOf('Ninguno de los anteriores');
  if (noneIndex > -1) selected.splice(noneIndex, 1);

  const index = selected.indexOf(value);
  if (index > -1) selected.splice(index, 1);
  else selected.push(value);

  render();
}

function handleDiagnosticMultiConfirm() {
  const step = getDiagnosticStep(state.assessment.currentStep);
  if (!step) return;
  const values = state.assessment._multiSelected.length ? [...state.assessment._multiSelected] : ['Ninguno de los anteriores'];
  state.assessment.responses[step.key] = values;
  state.assessment.burnoutFlags = values;
  const realSymptoms = values.filter(value => value !== 'Ninguno de los anteriores').length;
  const burnoutScore = clamp(5 - realSymptoms, 0, 5);
  diagnosticRecordScore(step.key, null, burnoutScore, 5, 1.5);
  diagnosticDetectFlags();
  diagnosticGoTo(step.next);
}

function handleDiagnosticFreeSend() {
  const input = document.getElementById('diagFreeInput');
  if (!input) return;
  const value = input.value.trim();
  if (!value) return;
  const step = state.assessment._awaitingFree;
  if (!step) return;
  state.assessment.responses[step.key] = value;
  const freeScore = diagnosticAnalyzeFreeText(value);
  diagnosticRecordScore(step.key, null, freeScore, 5, 0.5);
  diagnosticGoTo(step.next);
}

function handleDiagnosticFreeSkip() {
  const step = state.assessment._awaitingFree;
  if (!step) return;
  state.assessment.responses[step.key] = '(Sin comentarios adicionales)';
  diagnosticGoTo(step.next);
}

async function handleRegister(event) {
  event.preventDefault();
  if (state.loading) return;

  const form = new FormData(event.currentTarget);
  const payload = {
    name: String(form.get('name') || '').trim(),
    email: String(form.get('email') || '').trim(),
    company: String(form.get('company') || '').trim(),
    department: String(form.get('department') || '').trim()
  };

  state.loading = true;
  state.errorMessage = '';
  state.noticeMessage = '';
  render();

  try {
    const result = await api('/api/register', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    setLocalAuth(result.token, result.user, result.session?.id || null);
    state.authMessage = result.welcome || 'Registro completado.';
    state.activeView = 'chat';
    localStorage.setItem(STORAGE_KEYS.activeView, 'chat');
    await hydratePrivateData();
    if (state.sessionId) {
      await loadSession(state.sessionId);
    }
    state.noticeMessage = 'Usuario registrado. El chat ya está desbloqueado.';
    state.authMessage = '';
  } catch (error) {
    state.errorMessage = mapError(error);
  } finally {
    state.loading = false;
    render();
  }
}

async function handleAdminLogin(event) {
  event.preventDefault();
  if (state.loading) return;

  const form = new FormData(event.currentTarget);
  const code = String(form.get('code') || '').trim();

  state.loading = true;
  state.errorMessage = '';
  render();

  try {
    const result = await api('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ code })
    });

    setLocalAuth(result.token, result.user, null);
    state.activeView = 'admin';
    localStorage.setItem(STORAGE_KEYS.activeView, 'admin');
    await hydratePrivateData();
    state.noticeMessage = 'Sesión administrativa iniciada.';
  } catch (error) {
    state.errorMessage = mapError(error);
  } finally {
    state.loading = false;
    render();
  }
}

async function handleChatSend(event) {
  event.preventDefault();
  if (state.chatBusy || !state.user) return;

  const input = document.getElementById('chatInput');
  const message = String(input?.value || state.draft || '').trim();
  if (!message) return;

  state.chatBusy = true;
  state.errorMessage = '';
  render();

  try {
    const result = await api('/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        message,
        sessionId: state.sessionId
      })
    });

    if (result.sessionId) {
      state.sessionId = result.sessionId;
      localStorage.setItem(STORAGE_KEYS.sessionId, String(result.sessionId));
    }

    if (input) {
      input.value = '';
    }
    state.draft = '';

    if (result.signal) {
      applySignalToAssessment(result.signal);
    } else {
      applyKeywordFallbackToAssessment(message);
    }

    await hydratePrivateData();
    await loadSession(state.sessionId);
    state.noticeMessage = 'Mensaje guardado en SQLite y clasificado.';
  } catch (error) {
    state.errorMessage = mapError(error);
  } finally {
    state.chatBusy = false;
    render();
  }
}

async function handleLogout() {
  clearAuth();
  state.activeView = 'chat';
  state.authTab = 'register';
  localStorage.setItem(STORAGE_KEYS.activeView, 'chat');
  localStorage.setItem(STORAGE_KEYS.authTab, 'register');
  state.noticeMessage = 'Sesión cerrada.';
  render();
}

async function startNewConversation() {
  state.sessionId = null;
  state.chatMessages = [];
  localStorage.removeItem(STORAGE_KEYS.sessionId);
  state.noticeMessage = 'La próxima conversación creará una nueva sesión.';
  render();
}

async function openSession(sessionId) {
  state.sessionId = sessionId;
  localStorage.setItem(STORAGE_KEYS.sessionId, String(sessionId));
  state.activeView = 'chat';
  localStorage.setItem(STORAGE_KEYS.activeView, 'chat');
  await loadSession(sessionId);
  render();
}

async function hydratePrivateData() {
  if (!state.user) return;

  if (state.user.role === 'admin') {
    await refreshAdminOverview();
    state.dashboard = null;
  } else {
    state.dashboard = await api('/api/dashboard');
    state.adminOverview = null;
  }
}

async function loadSession(sessionId) {
  if (!sessionId) {
    state.chatMessages = [];
    return;
  }

  try {
    const response = await api(`/api/conversations/${sessionId}/messages`);
    state.chatMessages = response.messages || [];
    rebuildAssessmentFromMessages(state.chatMessages);
  } catch (error) {
    state.errorMessage = mapError(error);
    state.chatMessages = [];
  }
}

function mapError(error) {
  const code = error?.code || error?.message || 'unknown_error';
  const map = {
    missing_required_fields: 'Completa todos los campos requeridos.',
    invalid_code: 'El código administrativo no es válido.',
    authentication_required: 'Debes registrarte o iniciar sesión primero.',
    invalid_session: 'La sesión guardada ya no es válida.',
    forbidden: 'No tienes permisos para abrir esa vista.',
    session_not_found: 'La conversación solicitada no existe.',
    message_required: 'Escribe un mensaje antes de enviarlo.',
    http_500: 'El servidor respondió con un error interno.',
    http_404: 'No se encontró el recurso solicitado.'
  };
  return map[code] || 'No fue posible completar la acción.';
}

async function bootstrap() {
  try {
    state.health = await api('/api/health', { headers: {} });
  } catch (_error) {
    state.health = null;
  }

  if (state.token) {
    try {
      const response = await api('/api/me', { headers: {} });
      state.user = response.user;
      await hydratePrivateData();
      if (state.sessionId) {
        await loadSession(state.sessionId);
      } else if (state.dashboard?.sessions?.length) {
        state.sessionId = Number(state.dashboard.sessions[0].id);
        localStorage.setItem(STORAGE_KEYS.sessionId, String(state.sessionId));
        await loadSession(state.sessionId);
      }
    } catch (_error) {
      clearAuth();
    }
  }

  state.booting = false;
  render();
}

document.addEventListener('DOMContentLoaded', bootstrap);
