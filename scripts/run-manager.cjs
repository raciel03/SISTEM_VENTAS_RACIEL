const fs = require('fs');
const path = require('path');
const http = require('http');
const net = require('net');
const { spawn } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const logsDir = path.join(projectRoot, 'logs');
const auditLogPath = path.join(logsDir, 'audit.jsonl');
const processLogPath = path.join(logsDir, 'process.log');

function ts() {
  return new Date().toISOString();
}

function writeLineSafe(file, line) {
  try {
    fs.appendFileSync(file, line + '\n');
  } catch (e) {
    // ignore
  }
}

function audit(event) {
  const entry = { ts: ts(), ...event };
  writeLineSafe(auditLogPath, JSON.stringify(entry));
  return entry;
}

function ensureDir(p) {
  if (!fs.existsSync(p)) {
    fs.mkdirSync(p, { recursive: true });
  }
}

async function findAvailablePort(start) {
  let port = start;
  while (port < start + 100) {
    /* eslint-disable no-await-in-loop */
    const ok = await new Promise((resolve) => {
      const srv = net.createServer();
      srv.unref();
      srv.on('error', () => resolve(false));
      srv.listen(port, '0.0.0.0', () => {
        srv.close(() => resolve(true));
      });
    });
    if (ok) return port;
    port += 1;
  }
  throw new Error(`No hay puertos disponibles cerca de ${start}`);
}

function runCmd(name, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(name, args, { shell: true, ...options });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => {
      const s = d.toString();
      stdout += s;
      writeLineSafe(processLogPath, `[${ts()}] STDOUT ${s.trimEnd()}`);
    });
    child.stderr.on('data', (d) => {
      const s = d.toString();
      stderr += s;
      writeLineSafe(processLogPath, `[${ts()}] STDERR ${s.trimEnd()}`);
    });
    child.on('error', (err) => {
      audit({ step: 'process_error', error: err.message });
      reject(err);
    });
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ code, stdout, stderr });
      } else {
        const err = new Error(`${name} ${args.join(' ')} exited with ${code}`);
        err.code = code;
        err.stdout = stdout;
        err.stderr = stderr;
        reject(err);
      }
    });
  });
}

function waitForHttp(url, timeoutMs = 20000, intervalMs = 1000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(url, (res) => {
        const ok = res.statusCode && res.statusCode >= 200 && res.statusCode < 400;
        res.resume();
        if (ok) resolve(true);
        else if (Date.now() - start > timeoutMs) reject(new Error(`Timeout esperando ${url}`));
        else setTimeout(attempt, intervalMs);
      });
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) reject(new Error(`Timeout esperando ${url}`));
        else setTimeout(attempt, intervalMs);
      });
    };
    attempt();
  });
}

function startAuditServer(auditPort) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === '/audit') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      try {
        if (fs.existsSync(auditLogPath)) {
          const lines = fs.readFileSync(auditLogPath, 'utf-8')
            .split('\n')
            .filter(Boolean)
            .map((l) => {
              try { return JSON.parse(l); } catch { return null; }
            })
            .filter(Boolean);
          res.end(JSON.stringify({ ok: true, items: lines }));
        } else {
          res.end(JSON.stringify({ ok: true, items: [] }));
        }
      } catch (e) {
        res.statusCode = 500;
        res.end(JSON.stringify({ ok: false, error: String(e) }));
      }
      return;
    }
    if (url.pathname === '/health') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ ok: true, now: ts() }));
      return;
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    const page = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Auditoría de Ejecución</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
body { font-family: system-ui, Arial, sans-serif; margin: 24px; }
table { border-collapse: collapse; width: 100%; }
th, td { border: 1px solid #ddd; padding: 8px; font-size: 12px; vertical-align: top; }
th { background: #f4f4f4; }
code { white-space: pre-wrap; word-break: break-word; }
.ok { color: #056300; }
.err { color: #9b0000; }
</style></head>
<body>
  <h1>Auditoría de Ejecución</h1>
  <p>Historial completo de decisiones y acciones.</p>
  <div id="links"></div>
  <table id="log"><thead><tr>
    <th>Timestamp</th><th>Paso</th><th>Detalle</th><th>Resultado</th>
  </tr></thead><tbody></tbody></table>
<script>
async function loadLinks() {
  try {
    const r = await fetch('/app-url');
    if (r.ok) {
      const j = await r.json();
      if (j && j.url) {
        const linkBox = document.getElementById('links');
        linkBox.innerHTML = '<p><a href=\"' + j.url + '\" target=\"_blank\">Abrir aplicación</a></p>';
      }
    }
  } catch {}
}
async function load() {
  const res = await fetch('/audit');
  const data = await res.json();
  const tbody = document.querySelector('#log tbody');
  tbody.innerHTML = '';
  for (const it of data.items) {
    const tr = document.createElement('tr');
    const det = JSON.stringify(it.details || {}, null, 2);
    tr.innerHTML = '<td>' + it.ts + '</td>'
      + '<td>' + (it.step || '') + '</td>'
      + '<td><code>' + det.replace(/[&<>]/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[s])) + '</code></td>'
      + '<td class=\"' + ((it.ok===false||it.error)?'err':'ok') + '\">' + (it.ok===false?'FAIL':'OK') + (it.error?(': '+it.error):'') + '</td>';
    tbody.appendChild(tr);
  }
}
setInterval(load, 2000);
loadLinks();
load();
</script>
</body></html>`;
    res.end(page);
  });
  server.listen(auditPort, '0.0.0.0', () => {
    audit({ step: 'audit_server_started', details: { port: auditPort }, ok: true });
    console.log(`[RUN-MANAGER] Audit UI: http://localhost:${auditPort}/`);
  });
}

async function main() {
  ensureDir(logsDir);
  audit({ step: 'start', details: { projectRoot } , ok: true });

  // Detectar contexto
  const pkgPath = path.join(projectRoot, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    audit({ step: 'detect_context', ok: false, error: 'package.json no encontrado' });
    process.exit(1);
  }
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  audit({ step: 'detect_context', details: { name: pkg.name, hasDev: !!(pkg.scripts && pkg.scripts.dev), hasPreview: !!(pkg.scripts && pkg.scripts.preview) }, ok: true });

  // Identificar permisos mínimos
  const required = { fsWrite: true, network: true };
  audit({ step: 'identify_permissions', details: required, ok: true });

  // Adquirir permisos (comprobaciones)
  try {
    ensureDir(logsDir);
    fs.writeFileSync(path.join(logsDir, '.perm_check'), ts());
    audit({ step: 'acquire_permissions', details: { fsWrite: 'ok' }, ok: true });
  } catch (e) {
    audit({ step: 'acquire_permissions', ok: false, error: `FS no escribible: ${e.message}` });
    process.exit(1);
  }

  const appPort = await findAvailablePort(8080);
  const auditPort = await findAvailablePort(8090);
  audit({ step: 'ports_selected', details: { appPort, auditPort }, ok: true });

  // Levantar servidor de auditoría
  startAuditServer(auditPort);

  // Decidir modo: usar preview (entorno aislado) y construir si falta dist
  const distPath = path.join(projectRoot, 'dist');
  if (!fs.existsSync(distPath)) {
    audit({ step: 'build_required', details: { distMissing: true }, ok: true });
    try {
      await runCmd('npm', ['run', 'build'], { cwd: projectRoot });
      audit({ step: 'build_completed', ok: true });
    } catch (e) {
      audit({ step: 'build_failed', ok: false, error: e.message });
      process.exit(1);
    }
  } else {
    audit({ step: 'build_skipped', details: { distExists: true }, ok: true });
  }

  // Lanzar preview; si falla o finaliza, servidor estático propio
  let child;
  let staticServer = null;
  async function startStaticServer(port) {
    const distDir = path.join(projectRoot, 'dist');
    const mime = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.ico': 'image/x-icon',
      '.map': 'application/json; charset=utf-8',
      '.txt': 'text/plain; charset=utf-8',
      '.woff': 'font/woff',
      '.woff2': 'font/woff2',
    };
    staticServer = http.createServer((req, res) => {
      const url = new URL(req.url, `http://${req.headers.host}`);
      let reqPath = decodeURIComponent(url.pathname);
      if (reqPath.endsWith('/')) reqPath += 'index.html';
      const filePath = path.join(distDir, reqPath);
      fs.stat(filePath, (err, st) => {
        let finalPath = filePath;
        if (err || !st.isFile()) {
          finalPath = path.join(distDir, 'index.html');
        }
        fs.readFile(finalPath, (e2, buf) => {
          if (e2) {
            res.statusCode = 404;
            res.end('Not found');
            return;
          }
          const ext = path.extname(finalPath).toLowerCase();
          res.setHeader('Content-Type', mime[ext] || 'application/octet-stream');
          res.end(buf);
        });
      });
    });
    await new Promise((resolve) => staticServer.listen(port, '0.0.0.0', resolve));
    audit({ step: 'static_server_started', details: { port }, ok: true });
    console.log(`[RUN-MANAGER] Static App: http://localhost:${port}/`);
  }

  let previewStarted = false;
  try {
    child = spawn('npm', ['run', 'preview', '--', '--port', String(appPort), '--strictPort'], { cwd: projectRoot, shell: true, env: { ...process.env } });
    child.stdout.on('data', (d) => writeLineSafe(processLogPath, `[${ts()}] PREVIEW ${d.toString().trimEnd()}`));
    child.stderr.on('data', (d) => writeLineSafe(processLogPath, `[${ts()}] PREVIEW-ERR ${d.toString().trimEnd()}`));
    audit({ step: 'preview_started', details: { port: appPort }, ok: true });
    previewStarted = true;
    console.log(`[RUN-MANAGER] App: http://localhost:${appPort}/`);
  } catch (e) {
    audit({ step: 'preview_start_failed', ok: false, error: e.message });
  }

  // Validaciones post-ejecución
  try {
    await waitForHttp(`http://localhost:${appPort}/`, 25000, 1200);
    audit({ step: 'post_validation', details: { url: `http://localhost:${appPort}/` }, ok: true });
  } catch (e) {
    audit({ step: 'post_validation', ok: false, error: e.message });
  }

  // Endpoint de URL de la app
  const uiNotifier = http.createServer((req, res) => {
    if (req.url === '/app-url') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ url: `http://localhost:${appPort}/` }));
      return;
    }
    res.statusCode = 404;
    res.end('Not found');
  });
  uiNotifier.listen(0, '127.0.0.1', () => {
    const addr = uiNotifier.address();
    audit({ step: 'notifier_started', details: { port: addr.port }, ok: true });
  });

  // Si preview termina, fallback a servidor estático
  if (child) {
    child.on('close', async (code) => {
      audit({ step: 'preview_exited', details: { code }, ok: code === 0 });
      if (!staticServer) {
        try {
          await startStaticServer(appPort);
          try {
            await waitForHttp(`http://localhost:${appPort}/`, 20000, 1200);
            audit({ step: 'post_validation_fallback', details: { url: `http://localhost:${appPort}/` }, ok: true });
          } catch (e) {
            audit({ step: 'post_validation_fallback', ok: false, error: e.message });
          }
        } catch (e) {
          audit({ step: 'static_server_failed', ok: false, error: e.message });
          process.exit(code || 1);
        }
      }
    });
  } else if (!previewStarted) {
    try {
      await startStaticServer(appPort);
    } catch (e) {
      audit({ step: 'static_server_failed', ok: false, error: e.message });
      process.exit(1);
    }
  }
}

main().catch((e) => {
  audit({ step: 'fatal', ok: false, error: e.message });
  process.exit(1);
});

