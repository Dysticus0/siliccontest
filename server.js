// Servidor local del simulacro: sirve la web (carpeta public/) y guarda el
// historial de exámenes como archivos JSON en la carpeta historial/.
// Uso: node server.js   (o npm start)  ->  http://localhost:3000

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const HIST_DIR = path.join(__dirname, 'historial');

fs.mkdirSync(HIST_DIR, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': MIME['.json'] });
  res.end(JSON.stringify(data));
}

// Solo ids generados por la app (letras, números y guiones): evita path traversal.
function safeId(id) {
  return /^[a-zA-Z0-9-]{1,80}$/.test(id) ? id : null;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 5 * 1024 * 1024) {
        reject(new Error('Body demasiado grande'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function listarExamenes() {
  return fs
    .readdirSync(HIST_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      try {
        const ex = JSON.parse(fs.readFileSync(path.join(HIST_DIR, f), 'utf8'));
        const { preguntas, ...resumen } = ex;
        return resumen;
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
}

async function handleApi(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean); // ['api', 'examenes', id?]

  if (parts[1] === 'estado') return sendJson(res, 200, { ok: true });
  if (parts[1] !== 'examenes') return sendJson(res, 404, { error: 'No encontrado' });

  const id = parts[2] ? safeId(parts[2]) : null;
  if (parts[2] && !id) return sendJson(res, 400, { error: 'Id inválido' });

  if (req.method === 'GET' && !id) return sendJson(res, 200, listarExamenes());

  if (req.method === 'GET' && id) {
    const file = path.join(HIST_DIR, id + '.json');
    if (!fs.existsSync(file)) return sendJson(res, 404, { error: 'No encontrado' });
    return sendJson(res, 200, JSON.parse(fs.readFileSync(file, 'utf8')));
  }

  if (req.method === 'POST' && !id) {
    const ex = JSON.parse(await readBody(req));
    const exId = safeId(String(ex.id || ''));
    if (!exId) return sendJson(res, 400, { error: 'Id inválido' });
    fs.writeFileSync(path.join(HIST_DIR, exId + '.json'), JSON.stringify(ex, null, 2), 'utf8');
    return sendJson(res, 201, { ok: true, id: exId });
  }

  if (req.method === 'DELETE' && id) {
    const file = path.join(HIST_DIR, id + '.json');
    if (fs.existsSync(file)) fs.unlinkSync(file);
    return sendJson(res, 200, { ok: true });
  }

  return sendJson(res, 405, { error: 'Método no permitido' });
}

function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Prohibido');
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('No encontrado');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    return serveStatic(req, res, url);
  } catch (e) {
    console.error(e);
    sendJson(res, 500, { error: 'Error interno' });
  }
});

server.listen(PORT, () => {
  console.log(`Simulacro de examen corriendo en http://localhost:${PORT}`);
  console.log(`Historial guardado en: ${HIST_DIR}`);
});
