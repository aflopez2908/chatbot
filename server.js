const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const cors = require('cors');
const initSqlJs = require('sql.js');

const app = express();
const port = Number(process.env.PORT || 3000);
const adminCode = process.env.ADMIN_CODE || 'ity-admin-mvp';
const ollamaBaseUrl = (process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/$/, '');
const ollamaModel = process.env.OLLAMA_MODEL || 'llama3.2:1b';
const dataDir = path.join(__dirname, 'data');
const dbPath = path.join(dataDir, 'chatbot.sqlite');
const publicDir = __dirname;

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(publicDir));

function nowIso() {
  return new Date().toISOString();
}

function createSessionLabel(name) {
  const stamp = new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date());
  return `${name} · ${stamp}`;
}

function createAuthToken() {
  return crypto.randomBytes(32).toString('hex');
}

function cleanText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

function mapErrorCode(code, fallback = 'No fue posible completar la acción.') {
  return fallback;
}

async function main() {
  const wasmPath = path.dirname(require.resolve('sql.js/dist/sql-wasm.wasm'));
  const SQL = await initSqlJs({
    locateFile: fileName => path.join(wasmPath, fileName)
  });

  const db = fs.existsSync(dbPath)
    ? new SQL.Database(fs.readFileSync(dbPath))
    : new SQL.Database();

  function persistDb() {
    const data = db.export();
    fs.writeFileSync(dbPath, Buffer.from(data));
  }

  function run(sql, params = []) {
    const statement = db.prepare(sql);
    try {
      statement.bind(params);
      while (statement.step()) {
        // Intentionally empty: step through to apply mutations.
      }
    } finally {
      statement.free();
    }
    persistDb();
  }

  function all(sql, params = []) {
    const statement = db.prepare(sql);
    const rows = [];
    try {
      statement.bind(params);
      while (statement.step()) {
        rows.push(statement.getAsObject());
      }
    } finally {
      statement.free();
    }
    return rows;
  }

  function get(sql, params = []) {
    return all(sql, params)[0] || null;
  }

  function insert(sql, params = []) {
    run(sql, params);
    const row = get('SELECT last_insert_rowid() AS id');
    return row ? Number(row.id) : null;
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      department TEXT NOT NULL,
      company TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      created_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tokens (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      role TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      label TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS diagnostic_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      step_id TEXT NOT NULL,
      step_label TEXT NOT NULL,
      score INTEGER,
      burnout_risk INTEGER,
      burnout_count INTEGER,
      critical_dim TEXT,
      flow_label TEXT,
      flow_tone TEXT,
      flags_json TEXT NOT NULL,
      dims_json TEXT NOT NULL,
      responses_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
  persistDb();

  try {
    run('ALTER TABLE messages ADD COLUMN signal_json TEXT');
    persistDb();
  } catch (_error) {
    // La columna ya existe en bases de datos existentes.
  }
  persistDb();

  function count(tableName) {
    return get(`SELECT COUNT(*) AS total FROM ${tableName}`)?.total || 0;
  }

  function getUserByEmail(email) {
    return get('SELECT * FROM users WHERE email = ?', [email]);
  }

  function getUserById(id) {
    return get('SELECT * FROM users WHERE id = ?', [id]);
  }

  function getToken(tokenValue) {
    return get('SELECT * FROM tokens WHERE token = ? AND expires_at > ?', [tokenValue, nowIso()]);
  }

  function getSessionById(sessionId) {
    return get('SELECT * FROM sessions WHERE id = ?', [sessionId]);
  }

  function updateUserSeen(timestamp, userId) {
    run('UPDATE users SET last_seen_at = ? WHERE id = ?', [timestamp, userId]);
  }

  function createUserRecord(payload) {
    insert(
      `INSERT INTO users (name, email, department, company, role, created_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [payload.name, payload.email, payload.department, payload.company, payload.role, payload.created_at, payload.last_seen_at]
    );
    return getUserByEmail(payload.email)?.id || null;
  }

  function createTokenRecord(tokenValue, userId, role, createdAt, expiresAt) {
    run(
      'INSERT INTO tokens (token, user_id, role, created_at, expires_at) VALUES (?, ?, ?, ?, ?)',
      [tokenValue, userId, role, createdAt, expiresAt]
    );
  }

  function createSessionRecord(userId, label, createdAt, updatedAt) {
    insert(
      'INSERT INTO sessions (user_id, label, created_at, updated_at) VALUES (?, ?, ?, ?)',
      [userId, label, createdAt, updatedAt]
    );
    return get('SELECT id FROM sessions WHERE user_id = ? AND label = ? ORDER BY id DESC LIMIT 1', [userId, label])?.id || null;
  }

  function updateSessionTimestamp(sessionId, timestamp) {
    run('UPDATE sessions SET updated_at = ? WHERE id = ?', [timestamp, sessionId]);
  }

  function insertMessageRecord(sessionId, role, content, createdAt, signalJson = null) {
    return insert(
      'INSERT INTO messages (session_id, role, content, created_at, signal_json) VALUES (?, ?, ?, ?, ?)',
      [sessionId, role, content, createdAt, signalJson]
    );
  }

  function insertDiagnosticSnapshot(payload) {
    return insert(
      `INSERT INTO diagnostic_snapshots (
        session_id, user_id, step_id, step_label, score, burnout_risk, burnout_count,
        critical_dim, flow_label, flow_tone, flags_json, dims_json, responses_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` ,
      [
        payload.sessionId,
        payload.userId,
        payload.stepId,
        payload.stepLabel,
        payload.score,
        payload.burnoutRisk,
        payload.burnoutCount,
        payload.criticalDim,
        payload.flowLabel,
        payload.flowTone,
        payload.flagsJson,
        payload.dimsJson,
        payload.responsesJson,
        payload.createdAt
      ]
    );
  }

  function recentMessagesForSession(sessionId, limit = 10) {
    return all(
      `SELECT role, content, created_at, signal_json
       FROM messages
       WHERE session_id = ?
       ORDER BY id DESC
       LIMIT ?`,
      [sessionId, limit]
    );
  }

  function listAdminUsers() {
    return all(`
      SELECT
        u.id, u.name, u.email, u.department, u.company, u.role,
        u.created_at, u.last_seen_at,
        COUNT(DISTINCT s.id) AS sessions_count,
        COUNT(m.id) AS messages_count,
        MAX(m.created_at) AS last_message_at
      FROM users u
      LEFT JOIN sessions s ON s.user_id = u.id
      LEFT JOIN messages m ON m.session_id = s.id
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `);
  }

  function listAdminSessions(limit = 20) {
    return all(`
      SELECT
        s.id, s.user_id, s.label, s.created_at, s.updated_at,
        u.name AS user_name, u.email AS user_email, u.department AS user_department,
        COUNT(m.id) AS messages_count,
        MAX(m.created_at) AS last_message_at
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      LEFT JOIN messages m ON m.session_id = s.id
      GROUP BY s.id
      ORDER BY s.updated_at DESC
      LIMIT ?
    `, [limit]);
  }

  function listRecentMessages(limit = 40) {
    return all(`
      SELECT
        m.id, m.session_id, m.role, m.content, m.created_at,
        u.name AS user_name, u.email AS user_email,
        s.label AS session_label
      FROM messages m
      JOIN sessions s ON s.id = m.session_id
      JOIN users u ON u.id = s.user_id
      ORDER BY m.id DESC
      LIMIT ?
    `, [limit]);
  }

  function listRecentDiagnostics(limit = 40) {
    return all(`
      SELECT
        d.id, d.session_id, d.user_id, d.step_id, d.step_label, d.score, d.burnout_risk,
        d.burnout_count, d.critical_dim, d.flow_label, d.flow_tone, d.flags_json,
        d.dims_json, d.responses_json, d.created_at,
        u.name AS user_name, u.email AS user_email,
        s.label AS session_label
      FROM diagnostic_snapshots d
      JOIN users u ON u.id = d.user_id
      JOIN sessions s ON s.id = d.session_id
      ORDER BY d.id DESC
      LIMIT ?
    `, [limit]);
  }

  function requireAuth(allowedRoles = []) {
    return (req, res, next) => {
      const header = req.headers.authorization || '';
      const tokenValue = header.startsWith('Bearer ') ? header.slice(7) : null;

      if (!tokenValue) {
        return res.status(401).json({ error: 'authentication_required' });
      }

      const tokenRecord = getToken(tokenValue);
      if (!tokenRecord) {
        return res.status(401).json({ error: 'invalid_session' });
      }

      if (allowedRoles.length && !allowedRoles.includes(tokenRecord.role)) {
        return res.status(403).json({ error: 'forbidden' });
      }

      const user = getUserById(tokenRecord.user_id);
      if (!user) {
        return res.status(401).json({ error: 'invalid_user' });
      }

      req.auth = { user, token: tokenRecord };
      next();
    };
  }

  const SIGNAL_OPEN = '<<<SIGNAL>>>';
  const SIGNAL_CLOSE = '<<<END>>>';

  function extractSignal(rawText) {
    const text = String(rawText || '');
    const openIdx = text.indexOf(SIGNAL_OPEN);
    if (openIdx === -1) return { reply: text, signal: null };
    const closeIdx = text.indexOf(SIGNAL_CLOSE, openIdx + SIGNAL_OPEN.length);
    if (closeIdx === -1) return { reply: text, signal: null };

    const visible = (text.slice(0, openIdx) + text.slice(closeIdx + SIGNAL_CLOSE.length)).trim();
    const jsonPart = text.slice(openIdx + SIGNAL_OPEN.length, closeIdx).trim();

    let signal = null;
    try {
      const parsed = JSON.parse(jsonPart);
      if (parsed && typeof parsed === 'object') {
        signal = sanitizeSignal(parsed);
      }
    } catch (_error) {
      signal = null;
    }

    return { reply: visible || text.trim(), signal };
  }

  function sanitizeSignal(value) {
    const clamp = (n, min, max) => Math.max(min, Math.min(max, Math.round(n)));
    const asInt = (raw, min, max) => {
      const n = Number(raw);
      if (!Number.isFinite(n)) return null;
      return clamp(n, min, max);
    };
    const allowed = { burnout: ['ninguno', 'leve', 'moderado', 'severo'], mood: ['positivo', 'neutro', 'negativo'], riesgo: ['bajo', 'medio', 'alto'] };
    const pickEnum = (raw, list) => {
      const v = String(raw || '').toLowerCase().trim();
      return list.includes(v) ? v : null;
    };
    const out = {
      satisfaccion: asInt(value.satisfaccion ?? value.satisfaction, 1, 5),
      estres: asInt(value.estres ?? value.stress, 1, 5),
      carga: asInt(value.carga ?? value.workload, 1, 5),
      liderazgo: asInt(value.liderazgo ?? value.leadership, 1, 5),
      equipo: asInt(value.equipo ?? value.team, 1, 5),
      crecimiento: asInt(value.crecimiento ?? value.growth, 1, 5),
      remuneracion: asInt(value.remuneracion ?? value.pay, 1, 5),
      balance: asInt(value.balance ?? value.worklife, 1, 5),
      intencion_salida: asInt(value.intencion_salida ?? value.intention, 1, 5),
      comunicacion: asInt(value.comunicacion ?? value.communication, 1, 5),
      burnout: pickEnum(value.burnout, allowed.burnout),
      mood: pickEnum(value.mood ?? value.animo, allowed.mood),
      riesgo: pickEnum(value.riesgo ?? value.risk, allowed.riesgo),
      tags: Array.isArray(value.tags) ? value.tags.slice(0, 8).map(tag => String(tag).slice(0, 40)) : []
    };
    return out;
  }

  async function askOllama(messages) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 18000);

    try {
      const response = await fetch(`${ollamaBaseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model: ollamaModel,
          stream: false,
          messages,
          options: {
            temperature: 0.4,
            top_p: 0.9
          }
        })
      });

      if (!response.ok) {
        throw new Error(`ollama_${response.status}`);
      }

      const data = await response.json();
      const raw = cleanText(data?.message?.content || data?.response || '', 4000);
      if (!raw) {
        throw new Error('ollama_empty_response');
      }

      return extractSignal(raw);
    } finally {
      clearTimeout(timeout);
    }
  }

  async function askOllamaForSignal(userMessage, assistantReply) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const schemaHint = '{"satisfaccion":1-5,"estres":1-5,"carga":1-5,"liderazgo":1-5,"equipo":1-5,"crecimiento":1-5,"remuneracion":1-5,"balance":1-5,"intencion_salida":1-5,"comunicacion":1-5,"burnout":"ninguno|leve|moderado|severo","mood":"positivo|neutro|negativo","riesgo":"bajo|medio|alto","tags":["max8"]}';
    const prompt = [
      'Eres un clasificador de bienestar laboral. Recibirás el último mensaje del usuario y la respuesta del asistente.',
      'Devuelve EXCLUSIVAMENTE un objeto JSON válido (sin texto antes ni después, sin markdown, sin explicaciones) con este esquema exacto:',
      schemaHint,
      'Convención de escalas (1=peor, 5=mejor, en todos los campos numéricos):',
      '- satisfaccion: 1=muy insatisfecho, 5=muy satisfecho',
      '- estres: 1=muy estresado/agotado, 5=sin estrés (recuerda: 1 es el lado malo)',
      '- carga: 1=insostenible/excesiva, 5=adecuada/ligera',
      '- liderazgo: 1=muy mal apoyo del jefe, 5=excelente apoyo',
      '- equipo: 1=ambiente muy negativo, 5=muy positivo',
      '- crecimiento: 1=sin oportunidades, 5=muchas oportunidades',
      '- remuneracion: 1=muy injusto, 5=totalmente justo',
      '- balance: 1=sin equilibrio vida-trabajo, 5=equilibrio perfecto',
      '- intencion_salida: 1=quiere renunciar, 5=está cómodo y no piensa irse',
      '- comunicacion: 1=muy opaca, 5=muy clara',
      'En "tags" incluye hasta 8 palabras clave en ESPAÑOL (ej: "insomnio", "liderazgo", "salida").',
      '',
      'Ejemplo de salida válida para un mensaje muy negativo ("estoy agotado, no duermo, quiero renunciar"):',
      '{"satisfaccion":1,"estres":1,"carga":1,"liderazgo":2,"equipo":2,"crecimiento":2,"remuneracion":2,"balance":1,"intencion_salida":1,"comunicacion":2,"burnout":"severo","mood":"negativo","riesgo":"alto","tags":["insomnio","renuncia"]}',
      '',
      'Ejemplo de salida válida para un mensaje positivo ("estoy bien, motivado, el equipo funciona"):',
      '{"satisfaccion":5,"estres":5,"carga":4,"liderazgo":4,"equipo":5,"crecimiento":4,"remuneracion":4,"balance":4,"intencion_salida":5,"comunicacion":4,"burnout":"ninguno","mood":"positivo","riesgo":"bajo","tags":["motivado","equipo"]}',
      '',
      'Último mensaje del usuario:',
      userMessage.slice(0, 1500),
      '',
      'Respuesta del asistente:',
      assistantReply.slice(0, 1500)
    ].join('\n');

    try {
      const response = await fetch(`${ollamaBaseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model: ollamaModel,
          stream: false,
          messages: [{ role: 'user', content: prompt }],
          options: { temperature: 0.1, top_p: 0.9 }
        })
      });
      if (!response.ok) return null;
      const data = await response.json();
      const raw = cleanText(data?.message?.content || data?.response || '', 2000);
      if (!raw) return null;
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) return null;
      const parsed = JSON.parse(match[0]);
      return sanitizeSignal(parsed);
    } catch (_error) {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  function fallbackReply(userMessage, user) {
    const name = user?.name || 'usuario';
    return [
      `He recibido tu mensaje, ${name}.`,
      'No pude contactar a Ollama en este momento, así que te respondo en modo local.',
      `Tu mensaje fue: “${userMessage.slice(0, 180)}”.`,
      'Cuando el contenedor esté disponible, el mismo flujo usará el modelo configurado.'
    ].join(' ');
  }

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, time: nowIso(), dbPath, ollamaBaseUrl, ollamaModel });
  });

  app.post('/api/register', (req, res) => {
    const name = cleanText(req.body.name, 80);
    const email = cleanText(req.body.email, 120).toLowerCase();
    const department = cleanText(req.body.department, 80);
    const company = cleanText(req.body.company, 80);

    if (!name || !email || !department || !company) {
      return res.status(400).json({ error: 'missing_required_fields' });
    }

    const existing = getUserByEmail(email);
    const timestamp = nowIso();
    let user;

    if (existing) {
      updateUserSeen(timestamp, existing.id);
      user = getUserById(existing.id);
    } else {
      const userId = createUserRecord({
        name,
        email,
        department,
        company,
        role: 'user',
        created_at: timestamp,
        last_seen_at: timestamp
      });
      user = getUserById(userId);
    }

    const tokenValue = createAuthToken();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();
    createTokenRecord(tokenValue, user.id, user.role, timestamp, expiresAt);

    const sessionId = createSessionRecord(user.id, createSessionLabel(user.name), timestamp, timestamp);
    const session = getSessionById(sessionId);

    res.json({
      token: tokenValue,
      user,
      session,
      welcome: 'Registro completado. Ya puedes usar el chatbot.'
    });
  });

  app.post('/api/admin/login', (req, res) => {
    const code = cleanText(req.body.code, 80);
    if (!code || code !== adminCode) {
      return res.status(401).json({ error: 'invalid_code' });
    }

    const timestamp = nowIso();
    const email = 'admin@local';
    let user = getUserByEmail(email);

    if (!user) {
      const userId = createUserRecord({
        name: 'Administrador',
        email,
        department: 'Administración',
        company: 'ITY.DIGITAL',
        role: 'admin',
        created_at: timestamp,
        last_seen_at: timestamp
      });
      user = getUserById(userId);
    } else {
      updateUserSeen(timestamp, user.id);
    }

    const tokenValue = createAuthToken();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();
    createTokenRecord(tokenValue, user.id, 'admin', timestamp, expiresAt);

    res.json({ token: tokenValue, user });
  });

  app.get('/api/me', requireAuth(), (req, res) => {
    res.json({ user: req.auth.user });
  });

  app.get('/api/dashboard', requireAuth(), (req, res) => {
    const user = req.auth.user;
    const sessions = all(`
      SELECT id, label, created_at, updated_at
      FROM sessions
      WHERE user_id = ?
      ORDER BY updated_at DESC
    `, [user.id]);

    const latestMessages = all(`
      SELECT m.id, m.role, m.content, m.created_at, s.id AS session_id, s.label AS session_label
      FROM messages m
      JOIN sessions s ON s.id = m.session_id
      WHERE s.user_id = ?
      ORDER BY m.id DESC
      LIMIT 12
    `, [user.id]);

    res.json({
      user,
      summary: {
        users: count('users'),
        sessions: count('sessions'),
        messages: count('messages')
      },
      sessions,
      latestMessages
    });
  });

  app.post('/api/sessions', requireAuth(), (req, res) => {
    const label = cleanText(req.body.label, 120) || createSessionLabel(req.auth.user.name);
    const timestamp = nowIso();
    const sessionId = createSessionRecord(req.auth.user.id, label, timestamp, timestamp);
    const session = getSessionById(sessionId);

    res.status(201).json({ session });
  });

  app.get('/api/admin/overview', requireAuth(['admin']), (_req, res) => {
    res.json({
      summary: {
        users: count('users'),
        sessions: count('sessions'),
        messages: count('messages')
      },
      users: listAdminUsers(),
      sessions: listAdminSessions(20),
      recentMessages: listRecentMessages(40),
      recentDiagnostics: listRecentDiagnostics(40)
    });
  });

  app.post('/api/diagnostics', requireAuth(), (req, res) => {
    const sessionId = Number(req.body.sessionId);
    const stepId = cleanText(req.body.stepId, 80);
    const stepLabel = cleanText(req.body.stepLabel, 240);
    const createdAt = cleanText(req.body.createdAt, 40) || nowIso();

    if (!Number.isInteger(sessionId) || !stepId || !stepLabel) {
      return res.status(400).json({ error: 'missing_required_fields' });
    }

    const session = getSessionById(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'session_not_found' });
    }

    if (session.user_id !== req.auth.user.id && req.auth.user.role !== 'admin') {
      return res.status(403).json({ error: 'forbidden' });
    }

    const payload = {
      sessionId,
      userId: session.user_id,
      stepId,
      stepLabel,
      score: Number.isFinite(Number(req.body.score)) ? Number(req.body.score) : null,
      burnoutRisk: Number.isFinite(Number(req.body.burnoutRisk)) ? Number(req.body.burnoutRisk) : null,
      burnoutCount: Number.isFinite(Number(req.body.burnoutCount)) ? Number(req.body.burnoutCount) : 0,
      criticalDim: cleanText(req.body.criticalDim, 120),
      flowLabel: cleanText(req.body.flowLabel, 80),
      flowTone: cleanText(req.body.flowTone, 20),
      flagsJson: JSON.stringify(req.body.flags || []),
      dimsJson: JSON.stringify(req.body.dims || {}),
      responsesJson: JSON.stringify(req.body.responses || {}),
      createdAt
    };

    insertDiagnosticSnapshot(payload);
    updateSessionTimestamp(sessionId, createdAt);
    res.status(201).json({ ok: true });
  });

  app.get('/api/conversations/:sessionId/messages', requireAuth(), (req, res) => {
    const sessionId = Number(req.params.sessionId);
    if (!Number.isInteger(sessionId)) {
      return res.status(400).json({ error: 'invalid_session_id' });
    }

    const session = getSessionById(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'session_not_found' });
    }

    if (req.auth.user.role !== 'admin' && session.user_id !== req.auth.user.id) {
      return res.status(403).json({ error: 'forbidden' });
    }

    const messages = all(`
      SELECT role, content, created_at, signal_json
      FROM messages
      WHERE session_id = ?
      ORDER BY id ASC
    `, [sessionId]);

    res.json({ session, messages });
  });

  app.post('/api/chat', requireAuth(), async (req, res) => {
    const userMessage = cleanText(req.body.message, 4000);
    let sessionId = Number(req.body.sessionId);

    if (!userMessage) {
      return res.status(400).json({ error: 'message_required' });
    }

    if (!Number.isInteger(sessionId)) {
      sessionId = createSessionRecord(req.auth.user.id, createSessionLabel(req.auth.user.name), nowIso(), nowIso());
    }

    const session = getSessionById(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'session_not_found' });
    }

    if (session.user_id !== req.auth.user.id && req.auth.user.role !== 'admin') {
      return res.status(403).json({ error: 'forbidden' });
    }

    const timestamp = nowIso();
    insertMessageRecord(sessionId, 'user', userMessage, timestamp);
    updateSessionTimestamp(sessionId, timestamp);

    const history = recentMessagesForSession(sessionId, 10).reverse().map(row => ({
      role: row.role,
      content: row.content
    }));

    const systemPrompt = {
      role: 'system',
      content: [
        'Eres el asistente de ITY.DIGITAL.',
        'Respondes en español con tono claro, profesional y cálido.',
        'Si el usuario pide ayuda sobre la plataforma, explica pasos concretos.',
        'Si el usuario comparte señales de riesgo emocional o burnout, ofrece apoyo y recomienda contactar a RRHH o a un responsable de bienestar.',
        'No inventes datos de la empresa y evita respuestas largas innecesarias.'
      ].join('\n')
    };

    let assistantMessage = '';
    let signal = null;
    try {
      const ollamaResult = await askOllama([systemPrompt, ...history]);
      assistantMessage = ollamaResult.reply;
    } catch (_error) {
      assistantMessage = fallbackReply(userMessage, req.auth.user);
    }

    if (assistantMessage && !assistantMessage.startsWith('He recibido tu mensaje')) {
      signal = await askOllamaForSignal(userMessage, assistantMessage);
    }

    const signalJson = signal ? JSON.stringify(signal) : null;
    insertMessageRecord(sessionId, 'assistant', assistantMessage, nowIso(), signalJson);
    updateSessionTimestamp(sessionId, nowIso());

    res.json({
      sessionId,
      reply: assistantMessage,
      userMessage,
      assistantRole: 'assistant',
      signal
    });
  });

  app.use((_req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  app.listen(port, () => {
    console.log(`Chatbot ITY MVP running on http://localhost:${port}`);
    console.log(`SQLite DB: ${dbPath}`);
    console.log(`Ollama: ${ollamaBaseUrl} / model: ${ollamaModel}`);
  });
}

main().catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
