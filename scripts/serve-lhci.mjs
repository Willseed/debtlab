import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const port = Number.parseInt(process.env['PORT'] ?? '4200', 10);
const host = process.env['HOST'] ?? '127.0.0.1';
const distRoot = path.resolve('apps/web/dist/web/browser');
const sourceRoot = existsSync(path.join(distRoot, 'index.html'))
  ? distRoot
  : path.join(distRoot, 'zh-TW');

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.txt', 'text/plain; charset=utf-8'],
]);

const server = createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url ?? '/', `http://${host}:${port}`);
    const locale = requestUrl.pathname.startsWith('/en-US/') ? 'en-US' : '';
    const root = locale ? path.join(distRoot, locale) : sourceRoot;
    const relativePath = locale
      ? requestUrl.pathname.slice('/en-US/'.length)
      : requestUrl.pathname.slice(1);
    const normalizedPath = path.normalize(decodeURIComponent(relativePath || 'index.html'));
    const hasExtension = path.extname(normalizedPath) !== '';
    const candidatePath = path.resolve(root, hasExtension ? normalizedPath : 'index.html');

    if (!candidatePath.startsWith(root)) {
      response.writeHead(403);
      response.end('Forbidden');
      return;
    }

    const file = await readFile(candidatePath);
    const contentType = contentTypes.get(path.extname(candidatePath)) ?? 'application/octet-stream';
    const acceptsGzip = request.headers['accept-encoding']?.includes('gzip') ?? false;
    const shouldGzip = acceptsGzip && /^(application|text)\//u.test(contentType);
    const body = shouldGzip ? gzipSync(file) : file;
    const headers = {
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Length': body.byteLength,
      'Content-Type': contentType,
      Vary: 'Accept-Encoding',
    };

    if (shouldGzip) {
      headers['Content-Encoding'] = 'gzip';
    }

    response.writeHead(200, headers);
    response.end(body);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
});

server.listen(port, host, () => {
  console.log(`Local: http://${host}:${port}/`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => {
      process.exit(0);
    });
  });
}
