# Chatbot ITY — Bienestar Laboral

MVP de chatbot con panel admin, SQLite local y conexión a un modelo LLM servido por [Ollama](https://ollama.com/).

La app es un servidor **Node.js / Express** (`server.js`) que sirve el frontend estático (`index.html`, `css/`, `js/`) y expone una API REST. Las respuestas del chat las genera un modelo corriendo dentro de un contenedor de **Ollama** levantado con `docker-compose`.

---

## 1. Requisitos

- **Node.js** 18 o superior (probado con 18/20/22).
- **npm** (incluido con Node).
- **Docker Desktop** con `docker compose` (v2).
- Al menos **2 GB de RAM libres** para el modelo `qwen2.5:1.5b`.
- Puerto **3000** libre (frontend + API).
- Puerto **11434** libre (Ollama).

---

## 2. Clonar el repositorio

```bash
git clone <URL_DEL_REPO> chatbot_ITY
cd chatbot_ITY
```

---

## 3. Levantar Ollama (modelo LLM)

El `docker-compose.yml` define dos servicios:

- `ollama`: el servidor del modelo, expone el puerto `11434`.
- `ollama-model-puller`: un contenedor auxiliar que descarga el modelo `qwen2.5:1.5b` la primera vez y termina.

```bash
docker compose up -d
```

Verificá que el contenedor quedó activo y el modelo ya descargado:

```bash
docker ps
docker exec ollama_service ollama list
```

La salida debe incluir `qwen2.5:1.5b`. Si no aparece (por ejemplo, si el puller se interrumpió), forzá la descarga:

```bash
docker exec ollama_service ollama pull qwen2.5:1.5b
```

> **Probar Ollama directo** (opcional):
> ```bash
> curl http://localhost:11434/api/tags
> ```

---

## 4. Instalar dependencias de la app

```bash
npm install
```

---

## 5. Configurar variables de entorno

Crear un archivo `.env` en la raíz a partir del ejemplo:

**Windows (PowerShell):**
```powershell
Copy-Item .env.example .env
```

**Linux / macOS:**
```bash
cp .env.example .env
```

Contenido por defecto:

```env
PORT=3000
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5:1.5b
```

| Variable | Para qué sirve | Default |
|---|---|---|
| `PORT` | Puerto HTTP de la app Node | `3000` |
| `OLLAMA_BASE_URL` | URL del servidor Ollama | `http://localhost:11434` |
| `OLLAMA_MODEL` | Nombre exacto del modelo dentro de Ollama | `qwen2.5:1.5b` |

> Si más adelante movés Node a otro host o a Docker, cambiá `OLLAMA_BASE_URL` por la IP/URL correspondiente (por ejemplo, `http://ollama:11434` si Node corre dentro de la misma red de `docker-compose`).

---

## 6. Arrancar la aplicación

```bash
npm start
```

Salida esperada:

```
Chatbot ITY MVP running on http://localhost:3000
SQLite DB: <ruta>/data/chatbot.sqlite
Ollama: http://localhost:11434 / model: qwen2.5:1.5b
```

---

## 7. Probar que todo funciona

### a) Health check
```bash
curl http://localhost:3000/api/health
```
Debe responder `ok:true` y mostrar la URL y modelo configurados.

### b) Chat desde el navegador
Abrí `http://localhost:3000` y:
1. Registrate con nombre, email, departamento y empresa.
2. Empezá a chatear. La primera respuesta puede tardar unos segundos (el modelo se carga en memoria en Ollama); las siguientes son casi instantáneas.

### c) Panel admin
El código de admin está en `.env` o en el código (`ADMIN_CODE`, default `ity-admin-mvp`). Desde la UI ingresalo en la pantalla de login admin para ver usuarios, sesiones, mensajes y diagnósticos.

---

## 8. Estructura del proyecto

```
chatbot_ITY/
├── docker-compose.yml      # Ollama + puller del modelo
├── server.js               # API Express + SQLite (sql.js)
├── package.json
├── .env.example            # Plantilla de variables de entorno
├── .gitignore
├── index.html              # Frontend (SPA)
├── css/                    # Estilos
├── js/                     # Lógica del frontend (app.js, engine.js, flow.js, ...)
├── data/                   # SQLite local (chatbot.sqlite) — regenerable
└── original/               # Material de referencia del MVP original
```

---

## 9. Apagar / reiniciar

**Frenar la app Node:** `Ctrl + C` en la terminal donde corre `npm start`.

**Frenar Ollama:**
```bash
docker compose down           # detiene los contenedores
docker compose down -v        # además borra el volumen con los modelos descargados
```

**Reiniciar todo desde cero:**
```bash
docker compose down -v
docker compose up -d
docker exec ollama_service ollama pull qwen2.5:1.5b
npm install
npm start
```

---

## 10. Problemas frecuentes

### "No fue posible contactar a Ollama" / respuestas genéricas
La app usa un *fallback* local cuando Ollama no responde. Si ves siempre la misma respuesta fija, revisá:
- `docker ps` → el contenedor `ollama_service` debe estar `Up`.
- `docker exec ollama_service ollama list` → debe listar `qwen2.5:1.5b`.
- El `.env` debe tener `OLLAMA_MODEL` exactamente igual al nombre listado (case-sensitive).

### Puerto 11434 ocupado
Otro proceso o contenedor está usando el puerto. En Windows:
```powershell
netstat -ano | findstr :11434
```
Matalo o cambiá `"11434:11434"` en `docker-compose.yml`.

### `npm install` falla por permisos
En Linux/macOS evitá `sudo`. Si usás NVM o una instalación por usuario, no deberías tener este problema.

### Cambiar de modelo
1. Editá `docker-compose.yml` línea 24 y reemplazá `qwen2.5:1.5b` por el modelo deseado.
2. Editá `.env` y actualizá `OLLAMA_MODEL` con el mismo nombre.
3. Reconstruí los contenedores:
   ```bash
   docker compose up -d --force-recreate
   ```

---

## 11. Licencia y notas

Proyecto MVP interno de **ITY.DIGITAL**. Usar con fines demostrativos / de bienestar laboral.

---

## 12. Cómo se clasifica al usuario

El sistema combina **dos flujos** que alimentan un único `state.assessment` (sentimiento, dimensiones, riesgo de rotación, señales de burnout, mood):

### a) Chat libre con Ollama (vista 01)
- Cada mensaje del usuario se envía a `/api/chat` (`server.js:599`).
- El servidor hace **dos llamadas** a Ollama:
  1. La respuesta conversacional visible.
  2. Una segunda llamada al mismo modelo pidiéndole únicamente un **objeto JSON** con la clasificación (`server.js:382`). La escala va de 1 (peor) a 5 (mejor) en todos los campos, con un ejemplo few-shot para que el modelo de 1.5B no confunda la dirección.
- Si el modelo no emite JSON válido, se aplica un **fallback léxico** en el frontend (palabras clave de burnout / bienestar) para que el diagnóstico siempre se actualice.
- La señal persistida se guarda en `messages.signal_json` y se devuelve en la respuesta JSON al frontend.
- El frontend (`js/app.js`) la mergea con `applySignalToAssessment()`, recalcula el score con las mismas fórmulas del flujo guiado y persiste un snapshot en `diagnostic_snapshots` con `step_id = 'chat_signal'`.

### b) Diagnóstico guiado de 12 pasos (vista 03)
- Sigue funcionando como antes, con preguntas `options`, `scale` (1-5), `likert`, `multiselect` y `text_or_skip`.
- Cada respuesta se procesa con `diagnosticRecordScore` y actualiza el mismo `state.assessment`.

### Estado compartido
- Ambos flujos escriben en `state.assessment` (en memoria).
- La **pill de bienestar** en el header del chat muestra en vivo: `Bienestar X% · Riesgo Y · N alertas`.
- El **panel lateral de diagnóstico** (botón "Ver diagnóstico" en el chat) muestra dimensiones, flags, mood, tags y últimos snapshots.
- Al **cargar una sesión existente** (`loadSession`), se reprocesan todas las señales históricas para reconstruir el estado.

### Tablas relevantes
- `messages(id, session_id, role, content, created_at, signal_json)` — `signal_json` se agregó con `ALTER TABLE` seguro al iniciar.
- `diagnostic_snapshots(id, session_id, user_id, step_id, step_label, score, burnout_risk, burnout_count, critical_dim, flow_label, flow_tone, flags_json, dims_json, responses_json, created_at)`.

### Variables de entorno adicionales
No hay nuevas; el clasificador reutiliza `OLLAMA_BASE_URL` y `OLLAMA_MODEL`. Si querés desactivar la segunda llamada, comentá el bloque `askOllamaForSignal` en `server.js:411` y el chat seguirá funcionando solo con la respuesta visible (y el fallback léxico).
