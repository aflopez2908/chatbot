/* =====================================================
   flow.js
   Define el flujo conversacional completo:
   todas las preguntas, tipos, opciones y navegación.
   ===================================================== */

const TOTAL_Q = 12;

const flow = [

  /* ── Bienvenida ── */
  {
    id: 0,
    bot: "Hola, soy el asistente de bienestar de ITY.DIGITAL. Esta conversación es completamente anónima y confidencial. Voy a hacerte algunas preguntas sobre tu experiencia en la empresa. Solo tomará unos minutos. ¿Empezamos?",
    type: "options",
    options: ["Sí, empecemos", "¿Qué pasa con mis datos?"],
    nextMap: {
      "Sí, empecemos":          "ctx1",
      "¿Qué pasa con mis datos?": "privacy"
    }
  },

  /* ── Privacidad ── */
  {
    id: "privacy",
    bot: "Tus respuestas se procesan de forma agregada y anónima. Ningún dato individual es visible para tu jefe directo ni para tu equipo. RRHH solo recibe reportes estadísticos y alertas sin nombre. ¿Continuamos?",
    type: "options",
    options: ["Entendido, continuemos"],
    nextMap: { "Entendido, continuemos": "ctx1" }
  },

  /* ── Bloque 1: Contexto ── */
  {
    id: "ctx1",
    bot: "Para contextualizar mejor tu experiencia: ¿cuánto tiempo llevas trabajando en ITY.DIGITAL?",
    type: "options",
    key: "antiguedad",
    options: ["Menos de 6 meses", "6 meses a 1 año", "1 a 3 años", "Más de 3 años"],
    nextMap: {
      "Menos de 6 meses": "ctx2",
      "6 meses a 1 año":  "ctx2",
      "1 a 3 años":       "ctx2",
      "Más de 3 años":    "ctx2"
    }
  },
  {
    id: "ctx2",
    bot: "¿En qué área o departamento trabajas actualmente?",
    type: "options",
    key: "departamento",
    options: ["Desarrollo / Tecnología", "Marketing / Ventas", "Operaciones / Soporte", "Recursos Humanos", "Otro"],
    nextMap: {
      "Desarrollo / Tecnología": "q1",
      "Marketing / Ventas":      "q1",
      "Operaciones / Soporte":   "q1",
      "Recursos Humanos":        "q1",
      "Otro":                    "q1"
    }
  },

  /* ── Variable 1: Satisfacción general ── */
  {
    id: "q1",
    bot: "En una escala del 1 al 5, ¿qué tan satisfecho estás con tu trabajo en general?\n\n1 = Muy insatisfecho · 5 = Muy satisfecho",
    type: "scale",
    key: "satisfaccion",
    dim: "sat",
    weight: 1.5,
    next: "q2"
  },

  /* ── Variable 2: Estrés ── */
  {
    id: "q2",
    bot: "¿Cómo describirías tu nivel de estrés laboral en las últimas dos semanas?",
    type: "likert",
    key: "estres",
    dim: "str",
    weight: 1.3,
    options: [
      { label: "Sin estrés",               score: 5 },
      { label: "Leve",                     score: 4 },
      { label: "Moderado",                 score: 3 },
      { label: "Alto",                     score: 2 },
      { label: "Muy alto / agotamiento",   score: 1 }
    ],
    next: "q3"
  },

  /* ── Variable 3: Carga laboral ── */
  {
    id: "q3",
    bot: "¿Cómo percibes tu carga de trabajo actual?",
    type: "likert",
    key: "carga_laboral",
    dim: "wl",
    weight: 1.2,
    options: [
      { label: "Demasiado ligera", score: 3 },
      { label: "Adecuada",         score: 5 },
      { label: "Un poco excesiva", score: 3 },
      { label: "Excesiva",         score: 2 },
      { label: "Insostenible",     score: 1 }
    ],
    next: "q4"
  },

  /* ── Variable 4: Liderazgo ── */
  {
    id: "q4",
    bot: "¿Qué tan bien sientes que tu jefe directo reconoce tu trabajo y te apoya?\n\n1 = Muy mal · 5 = Excelente",
    type: "scale",
    key: "liderazgo",
    dim: "lid",
    weight: 1.4,
    next: "q5"
  },

  /* ── Variable 5: Relación con el equipo ── */
  {
    id: "q5",
    bot: "¿Cómo describirías el ambiente de trabajo y la relación con tus compañeros?",
    type: "likert",
    key: "equipo",
    dim: "tea",
    weight: 1.0,
    options: [
      { label: "Muy positivo, colaborativo",  score: 5 },
      { label: "Bueno en general",            score: 4 },
      { label: "Neutral / indiferente",       score: 3 },
      { label: "Hay tensiones frecuentes",    score: 2 },
      { label: "Muy negativo o tóxico",       score: 1 }
    ],
    next: "q6"
  },

  /* ── Variable 6: Crecimiento profesional ── */
  {
    id: "q6",
    bot: "¿Sientes que en ITY.DIGITAL tienes oportunidades reales de crecer o aprender cosas nuevas?\n\n1 = Ninguna · 5 = Muchas",
    type: "scale",
    key: "crecimiento",
    dim: "cre",
    weight: 1.2,
    next: "q7"
  },

  /* ── Variable 7: Remuneración ── */
  {
    id: "q7",
    bot: "¿Consideras que tu salario y beneficios son justos para las responsabilidades que tienes?",
    type: "likert",
    key: "remuneracion",
    dim: "rem",
    weight: 1.1,
    options: [
      { label: "Sí, totalmente justo",          score: 5 },
      { label: "Más o menos justo",             score: 4 },
      { label: "Podría ser mejor",              score: 3 },
      { label: "No es justo",                   score: 2 },
      { label: "Muy por debajo del mercado",    score: 1 }
    ],
    next: "q8"
  },

  /* ── Variable 8: Balance vida/trabajo ── */
  {
    id: "q8",
    bot: "¿Logras mantener un buen equilibrio entre tu vida personal y tu trabajo?\n\n1 = No, para nada · 5 = Sí, muy bien",
    type: "scale",
    key: "balance_vida",
    dim: "bal",
    weight: 1.1,
    next: "q9"
  },

  /* ── Variable 9: Señales de burnout (multiselect) ── */
  {
    id: "q9",
    bot: "Durante las últimas semanas, ¿has sentido alguno de estos síntomas? Selecciona todos los que apliquen y confirma.",
    type: "multiselect",
    key: "burnout_signals",
    options: [
      "Dificultad para concentrarme",
      "Sensación de no poder desconectarme",
      "Irritabilidad frecuente",
      "Insomnio o mal descanso",
      "Falta de motivación o energía",
      "Ninguno de los anteriores"
    ],
    next: "q10"
  },

  /* ── Variable 10: Comunicación interna ── */
  {
    id: "q10",
    bot: "¿Sientes que la empresa comunica de forma clara sus objetivos, cambios y decisiones que te afectan?",
    type: "likert",
    key: "comunicacion",
    options: [
      { label: "Sí, siempre de forma clara",          score: 5 },
      { label: "Generalmente sí",                     score: 4 },
      { label: "A veces sí, a veces no",              score: 3 },
      { label: "Rara vez",                            score: 2 },
      { label: "No, hay mucha falta de comunicación", score: 1 }
    ],
    next: "q11"
  },

  /* ── Variable 11: Intención de salida ── */
  {
    id: "q11",
    bot: "¿Has pensado en buscar trabajo en otra empresa en los próximos 6 meses?",
    type: "likert",
    key: "intencion_salida",
    weight: 2.0,
    options: [
      { label: "No, estoy cómodo aquí",                  score: 5 },
      { label: "Lo he pensado vagamente",                score: 3 },
      { label: "Sí, lo estoy considerando",             score: 2 },
      { label: "Sí, activamente lo estoy buscando",     score: 1 }
    ],
    next: "q12"
  },

  /* ── Variable 12: Feedback libre ── */
  {
    id: "q12",
    bot: "Última pregunta. ¿Hay algo más que quieras comentar a RRHH de forma anónima? Puedes escribir libremente o saltar esta pregunta.",
    type: "text_or_skip",
    key: "feedback_libre",
    next: "results"
  },

  /* ── Resultado final ── */
  {
    id: "results",
    bot: null,
    type: "results"
  }

];
