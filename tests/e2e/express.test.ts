/**
 * E2E tests for the Express adapter.
 *
 * Starts a real Express HTTP server, configures the llms-txt middleware
 * with local fixture HTML files, and makes actual HTTP requests.
 */
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { llmsTxt } from '../../src/adapters/express.js';
import type { LlmsTxtConfig } from '../../src/types.js';

const FIXTURES_DIR = path.resolve(__dirname, 'fixtures');

function makeConfig(overrides?: Partial<LlmsTxtConfig>): LlmsTxtConfig {
  return {
    site: {
      name: 'Acme Corp',
      url: 'https://acme.example.com',
      description: 'Build better software with Acme.',
    },
    discover: { dir: FIXTURES_DIR },
    sections: [
      { name: 'Documentation', pathPrefix: '/docs' },
      { name: 'Blog', pathPrefix: '/blog' },
      { name: 'Main', pathPrefix: '/' },
    ],
    options: { cacheTtl: 0 },
    ...overrides,
  };
}

let server: http.Server;
let baseUrl: string;

async function startServer(config: LlmsTxtConfig): Promise<void> {
  const app = express();
  app.use(llmsTxt(config));
  app.get('/', (_req, res) => res.send('OK'));

  return new Promise((resolve) => {
    server = app.listen(0, () => {
      const addr = server.address() as { port: number };
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });
}

async function stopServer(): Promise<void> {
  return new Promise((resolve) => {
    if (server) {
      server.close(() => resolve());
    } else {
      resolve();
    }
  });
}

describe('e2e: Express adapter', () => {
  afterEach(async () => {
    await stopServer();
  });

  it('serves /llms.txt with correct status, headers, and content', async () => {
    await startServer(makeConfig());

    const res = await fetch(`${baseUrl}/llms.txt`);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(res.headers.get('cache-control')).toBe('public, max-age=3600');

    const body = await res.text();
    expect(body).toContain('# Acme Corp');
    expect(body).toContain('> Build better software with Acme.');
    expect(body).toContain('## Documentation');
    expect(body).toContain('## Blog');
    expect(body).toContain('API Reference');
    expect(body).toContain('Installation Guide');
    expect(body).toContain('Hello World');
    expect(body).toContain('https://acme.example.com/docs/api-reference');
  });

  it('serves /llms-full.txt with inline page content', async () => {
    await startServer(makeConfig());

    const res = await fetch(`${baseUrl}/llms-full.txt`);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8');

    const body = await res.text();
    expect(body).toContain('# Acme Corp');
    // Full text should include page content inline
    expect(body).toContain('### Acme Corp - Build Better Software');
    expect(body).toContain('Empowering developers worldwide');
    expect(body).toContain('### API Reference - Acme Docs');
    expect(body).toContain('plugin system allows extending Acme');
    expect(body).toContain('URL: https://acme.example.com/docs/api-reference');
  });

  it('passes through non-llms.txt requests', async () => {
    await startServer(makeConfig());

    const res = await fetch(`${baseUrl}/`);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toBe('OK');
  });

  it('returns 404 for /llms-full.txt when full generation is disabled', async () => {
    await startServer(makeConfig({ options: { cacheTtl: 0, full: false } }));

    const llmsRes = await fetch(`${baseUrl}/llms.txt`);
    expect(llmsRes.status).toBe(200);

    const fullRes = await fetch(`${baseUrl}/llms-full.txt`);
    // Should fall through to express default 404
    expect(fullRes.status).toBe(404);
  });

  it('serves pages with correct section organization', async () => {
    await startServer(makeConfig());

    const res = await fetch(`${baseUrl}/llms.txt`);
    const body = await res.text();

    // Documentation section should appear before Blog section
    const docsIdx = body.indexOf('## Documentation');
    const blogIdx = body.indexOf('## Blog');
    const mainIdx = body.indexOf('## Main');

    expect(docsIdx).toBeGreaterThan(-1);
    expect(blogIdx).toBeGreaterThan(docsIdx);
    expect(mainIdx).toBeGreaterThan(blogIdx);

    // Verify docs section contains only doc pages
    const docsSection = body.slice(docsIdx, blogIdx);
    expect(docsSection).toContain('API Reference');
    expect(docsSection).toContain('Installation Guide');
    expect(docsSection).not.toContain('Hello World');
  });

  it('serves with manual pages (no discovery)', async () => {
    await startServer({
      site: {
        name: 'Manual Site',
        url: 'https://manual.example.com',
        description: 'A manually configured site.',
      },
      pages: [
        { path: '/', title: 'Home', description: 'Welcome page' },
        { path: '/pricing', title: 'Pricing', description: 'Our plans', content: 'Free and Pro tiers available.' },
      ],
      options: { cacheTtl: 0 },
    });

    const res = await fetch(`${baseUrl}/llms.txt`);
    const body = await res.text();

    expect(body).toContain('# Manual Site');
    expect(body).toContain('[Home](https://manual.example.com)');
    expect(body).toContain('[Pricing](https://manual.example.com/pricing)');
    expect(body).toContain(': Our plans');

    const fullRes = await fetch(`${baseUrl}/llms-full.txt`);
    const fullBody = await fullRes.text();
    expect(fullBody).toContain('Free and Pro tiers available.');
  });
});
