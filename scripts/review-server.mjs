import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const video = process.argv[2] && path.resolve(process.argv[2]);
const fps = Number(process.argv[3] ?? 24);
const port = Number(process.env.REVIEW_PORT ?? 4173);

if (!video || !fs.existsSync(video) || !fs.statSync(video).isFile() || !Number.isFinite(fps) || fps <= 0) {
  console.error('Usage: node scripts/review-server.mjs <video.mp4> [fps]');
  process.exit(1);
}
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid REVIEW_PORT');

const feedbackFile = `${video}.feedback.json`;
const routes = new Map([
  ['/review.js', [path.join(root, 'apps/demo/review.js'), 'text/javascript; charset=utf-8']],
  ['/annotator.js', [path.join(root, 'packages/embed/dist/web-media-annotator.bundle.umd.js'), 'text/javascript; charset=utf-8']],
  ['/annotator.css', [path.join(root, 'apps/demo/review-annotator.css'), 'text/css; charset=utf-8']],
]);

function respond(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

function serveFile(req, res, file, type) {
  if (!fs.existsSync(file)) return respond(res, 404, `Missing ${path.basename(file)}. Run the bundle build first.`);
  const size = fs.statSync(file).size;
  const match = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range ?? '');
  if (match) {
    const start = Number(match[1]);
    const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
    if (start >= size || end < start) {
      res.writeHead(416, { 'Content-Range': `bytes */${size}` });
      return res.end();
    }
    res.writeHead(206, { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
    return fs.createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Length': size });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/api/feedback' && req.method === 'GET') {
    let existing = {};
    if (fs.existsSync(feedbackFile)) {
      try { existing = JSON.parse(fs.readFileSync(feedbackFile, 'utf8')); }
      catch { return respond(res, 500, 'Existing feedback file is invalid JSON'); }
    }
    return respond(res, 200, JSON.stringify({ video: path.basename(video), fps, notes: [], annotations: [], ...existing }), 'application/json');
  }
  if (pathname === '/api/feedback' && req.method === 'PUT') {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 10_000_000) req.destroy();
    });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        if (data.version !== 1 || data.video !== path.basename(video) || !Array.isArray(data.notes) || !Array.isArray(data.annotations)) {
          return respond(res, 400, 'Invalid feedback');
        }
        const temp = `${feedbackFile}.tmp`;
        fs.writeFileSync(temp, JSON.stringify(data, null, 2));
        fs.renameSync(temp, feedbackFile);
        respond(res, 200, '{"saved":true}', 'application/json');
      } catch (error) { respond(res, 400, error.message); }
    });
    return;
  }
  if (req.method !== 'GET') return respond(res, 405, 'Method not allowed');
  if (pathname === '/') {
    const html = fs.readFileSync(path.join(root, 'apps/demo/review.html'), 'utf8').replace('__FPS__', String(fps));
    return respond(res, 200, html, 'text/html; charset=utf-8');
  }
  if (pathname === '/video') return serveFile(req, res, video, 'video/mp4');
  const route = routes.get(pathname);
  if (route) return serveFile(req, res, ...route);
  respond(res, 404, 'Not found');
});

server.listen(port, '127.0.0.1', () => console.log(`Review ${path.basename(video)} at http://127.0.0.1:${port}/`));
