/**
 * E2E tests for the Hono adapter.
 *
 * Uses Hono's built-in app.request() to make requests without
 * needing a separate HTTP server, which exercises the full middleware pipeline.
 */
import { Hono } from 'hono';
import path from 'node:path';
import { llmsTxt } from '../../src/adapters/hono.js';
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

function createApp(config: LlmsTxtConfig): Hono {
  const app = new Hono();
  app.use('*', llmsTxt(config));
  app.get('/', (c) => c.text('OK'));
  return app;
}

describe('e2e: Hono adapter', () => {
  it('serves /llms.txt with correct status and content', async () => {
    const app = createApp(makeConfig());

    const res = await app.request('/llms.txt');

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/plain');

    const body = await res.text();
    expect(body).toContain('# Acme Corp');
    expect(body).toContain('> Build better software with Acme.');
    expect(body).toContain('## Documentation');
    expect(body).toContain('## Blog');
    expect(body).toContain('API Reference');
    expect(body).toContain('Hello World');
    expect(body).toContain('https://acme.example.com/docs/api-reference');
  });

  it('serves /llms-full.txt with inline page content', async () => {
    const app = createApp(makeConfig());

    const res = await app.request('/llms-full.txt');

    expect(res.status).toBe(200);

    const body = await res.text();
    expect(body).toContain('# Acme Corp');
    expect(body).toContain('### API Reference - Acme Docs');
    expect(body).toContain('plugin system allows extending Acme');
    expect(body).toContain('URL: https://acme.example.com/docs/api-reference');
    expect(body).toContain('Empowering developers worldwide');
  });

  it('passes through non-matching requests', async () => {
    const app = createApp(makeConfig());

    const res = await app.request('/');
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toBe('OK');
  });

  it('returns 404 for /llms-full.txt when full generation is disabled', async () => {
    const app = createApp(makeConfig({ options: { cacheTtl: 0, full: false } }));

    const llmsRes = await app.request('/llms.txt');
    expect(llmsRes.status).toBe(200);

    const fullRes = await app.request('/llms-full.txt');
    expect(fullRes.status).toBe(404);
  });

  it('generates correct section organization', async () => {
    const app = createApp(makeConfig());

    const res = await app.request('/llms.txt');
    const body = await res.text();

    const docsIdx = body.indexOf('## Documentation');
    const blogIdx = body.indexOf('## Blog');
    expect(docsIdx).toBeGreaterThan(-1);
    expect(blogIdx).toBeGreaterThan(docsIdx);

    const docsSection = body.slice(docsIdx, blogIdx);
    expect(docsSection).toContain('API Reference');
    expect(docsSection).toContain('Installation Guide');
    expect(docsSection).not.toContain('Hello World');
  });

  it('serves with manual pages', async () => {
    const app = createApp({
      site: {
        name: 'Hono Manual',
        url: 'https://hono-manual.example.com',
        description: 'A manually configured Hono site.',
      },
      pages: [
        { path: '/tutorials', title: 'Tutorials', description: 'Learn step by step', content: 'Follow along with our tutorials.' },
      ],
      options: { cacheTtl: 0 },
    });

    const res = await app.request('/llms.txt');
    const body = await res.text();
    expect(body).toContain('# Hono Manual');
    expect(body).toContain('[Tutorials](https://hono-manual.example.com/tutorials)');

    const fullRes = await app.request('/llms-full.txt');
    const fullBody = await fullRes.text();
    expect(fullBody).toContain('Follow along with our tutorials.');
  });

  it('includes preamble and additional sections', async () => {
    const app = createApp(
      makeConfig({
        options: {
          cacheTtl: 0,
          preamble: 'This file is auto-generated for AI agents.',
          additionalSections: {
            'API Endpoints': 'POST /api/v1/generate\nGET /api/v1/status',
          },
        },
      }),
    );

    const res = await app.request('/llms.txt');
    const body = await res.text();

    expect(body).toContain('This file is auto-generated for AI agents.');
    expect(body).toContain('## API Endpoints');
    expect(body).toContain('POST /api/v1/generate');
  });
});
