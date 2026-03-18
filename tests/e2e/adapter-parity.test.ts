/**
 * Adapter parity tests.
 *
 * Verifies that all framework adapters (Express, Fastify, Hono, Next.js)
 * produce equivalent output for the same configuration. Also tests features
 * like /llms-small.txt, per-page .md endpoints, and edge cases.
 */
import express from 'express';
import http from 'node:http';
import Fastify from 'fastify';
import { Hono } from 'hono';
import path from 'node:path';
import { llmsTxt as expressLlmsTxt } from '../../src/adapters/express.js';
import { llmsTxtPlugin } from '../../src/adapters/fastify.js';
import { llmsTxt as honoLlmsTxt } from '../../src/adapters/hono.js';
import { serveLlmsTxt, createLlmsTxtHandler } from '../../src/adapters/nextjs.js';
import type { LlmsTxtConfig } from '../../src/types.js';

const FIXTURES_DIR = path.resolve(__dirname, 'fixtures');

const sharedConfig: LlmsTxtConfig = {
  site: {
    name: 'Parity Test',
    url: 'https://parity.example.com',
    description: 'Testing adapter parity.',
  },
  pages: [
    { path: '/', title: 'Home', description: 'Welcome page', content: 'Home page content here.' },
    { path: '/about', title: 'About', description: 'About us', content: 'About page content here.' },
    { path: '/docs/guide', title: 'Guide', description: 'Getting started guide', content: 'Step 1, Step 2, Step 3.' },
  ],
  sections: [
    { name: 'Documentation', pathPrefix: '/docs' },
    { name: 'Main', pathPrefix: '/' },
  ],
  options: {
    cacheTtl: 0,
    preamble: 'This is a preamble for AI agents.',
    additionalSections: {
      'Contact': 'Email us at support@parity.example.com',
    },
  },
};

// ─── Express Server Helper ───────────────────────────────────────

let expressServer: http.Server;
let expressBaseUrl: string;

async function startExpress(config: LlmsTxtConfig): Promise<void> {
  const app = express();
  app.use(expressLlmsTxt(config));
  app.get('/', (_req, res) => res.send('OK'));

  return new Promise((resolve) => {
    expressServer = app.listen(0, () => {
      const addr = expressServer.address() as { port: number };
      expressBaseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });
}

async function stopExpress(): Promise<void> {
  return new Promise((resolve) => {
    if (expressServer) expressServer.close(() => resolve());
    else resolve();
  });
}

// ─── Fastify Server Helper ───────────────────────────────────────

let fastifyInstance: ReturnType<typeof Fastify>;
let fastifyBaseUrl: string;

async function startFastify(config: LlmsTxtConfig): Promise<void> {
  fastifyInstance = Fastify();
  fastifyInstance.register(llmsTxtPlugin(config));
  fastifyInstance.get('/', async () => 'OK');
  const address = await fastifyInstance.listen({ port: 0, host: '127.0.0.1' });
  fastifyBaseUrl = address;
}

async function stopFastify(): Promise<void> {
  if (fastifyInstance) await fastifyInstance.close();
}

// ─── llms-small.txt across all adapters ──────────────────────────

describe('adapter parity: /llms-small.txt', () => {
  afterEach(async () => {
    await stopExpress().catch(() => {});
    await stopFastify().catch(() => {});
  });

  it('Express serves /llms-small.txt', async () => {
    await startExpress(sharedConfig);
    const res = await fetch(`${expressBaseUrl}/llms-small.txt`);
    expect(res.status).toBe(200);
    const body = await res.text();

    expect(body).toContain('# Parity Test');
    expect(body).toContain('[Home]');
    expect(body).toContain('[Guide]');
    // Small should NOT have descriptions
    expect(body).not.toContain('Welcome page');
    expect(body).not.toContain('> Testing adapter parity.');
  });

  it('Express returns 404 for /llms-small.txt when disabled', async () => {
    await startExpress({ ...sharedConfig, options: { ...sharedConfig.options, small: false } });
    const res = await fetch(`${expressBaseUrl}/llms-small.txt`);
    expect(res.status).toBe(404);
  });

  it('Fastify serves /llms-small.txt', async () => {
    await startFastify(sharedConfig);
    const res = await fetch(`${fastifyBaseUrl}/llms-small.txt`);
    expect(res.status).toBe(200);
    const body = await res.text();

    expect(body).toContain('# Parity Test');
    expect(body).toContain('[Home]');
    expect(body).not.toContain('Welcome page');
    expect(body).not.toContain('> Testing adapter parity.');
  });

  it('Fastify returns 404 for /llms-small.txt when disabled', async () => {
    await startFastify({ ...sharedConfig, options: { ...sharedConfig.options, small: false } });
    const res = await fetch(`${fastifyBaseUrl}/llms-small.txt`);
    expect(res.status).toBe(404);
  });

  it('Hono serves /llms-small.txt', async () => {
    const app = new Hono();
    app.use('*', honoLlmsTxt(sharedConfig));
    app.get('/', (c) => c.text('OK'));

    const res = await app.request('/llms-small.txt');
    expect(res.status).toBe(200);
    const body = await res.text();

    expect(body).toContain('# Parity Test');
    expect(body).toContain('[Home]');
    expect(body).not.toContain('Welcome page');
  });

  it('Next.js serves /llms-small.txt', async () => {
    const handler = serveLlmsTxt(sharedConfig);
    const res = await handler(new Request('https://parity.example.com/llms-small.txt'));
    expect(res.status).toBe(200);
    const body = await res.text();

    expect(body).toContain('# Parity Test');
    expect(body).toContain('[Home]');
    expect(body).not.toContain('Welcome page');
  });
});

// ─── Per-page .md endpoints ──────────────────────────────────────

describe('adapter parity: per-page .md endpoints', () => {
  afterEach(async () => {
    await stopExpress().catch(() => {});
  });

  it('Express serves /about.md for a known page', async () => {
    await startExpress(sharedConfig);
    const res = await fetch(`${expressBaseUrl}/about.md`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/markdown');

    const body = await res.text();
    expect(body).toContain('# About');
    expect(body).toContain('> About us');
    expect(body).toContain('URL: https://parity.example.com/about');
    expect(body).toContain('About page content here.');
  });

  it('Express returns 404 for unknown .md page', async () => {
    await startExpress(sharedConfig);
    const res = await fetch(`${expressBaseUrl}/nonexistent.md`);
    expect(res.status).toBe(404);
  });

  it('Hono serves /docs/guide.md for nested page', async () => {
    const app = new Hono();
    app.use('*', honoLlmsTxt(sharedConfig));

    const res = await app.request('/docs/guide.md');
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('# Guide');
    expect(body).toContain('Step 1, Step 2, Step 3.');
  });

  it('Next.js serves /about.md', async () => {
    const handler = serveLlmsTxt(sharedConfig);
    const res = await handler(new Request('https://parity.example.com/about.md'));
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('# About');
    expect(body).toContain('About page content here.');
  });

  it('Next.js returns 404 for unknown .md page', async () => {
    const handler = serveLlmsTxt(sharedConfig);
    const res = await handler(new Request('https://parity.example.com/nope.md'));
    expect(res.status).toBe(404);
  });
});

// ─── Content parity across adapters ──────────────────────────────

describe('adapter parity: all adapters produce same llms.txt content', () => {
  afterEach(async () => {
    await stopExpress().catch(() => {});
    await stopFastify().catch(() => {});
  });

  it('Express, Fastify, Hono, and Next.js produce identical /llms.txt body', async () => {
    // Start Express and Fastify servers
    await startExpress(sharedConfig);
    await startFastify(sharedConfig);

    // Create Hono app
    const honoApp = new Hono();
    honoApp.use('*', honoLlmsTxt(sharedConfig));

    // Create Next.js handler
    const nextHandler = serveLlmsTxt(sharedConfig);

    // Fetch from all adapters
    const [expressRes, fastifyRes, honoRes, nextRes] = await Promise.all([
      fetch(`${expressBaseUrl}/llms.txt`).then((r) => r.text()),
      fetch(`${fastifyBaseUrl}/llms.txt`).then((r) => r.text()),
      honoApp.request('/llms.txt').then((r) => r.text()),
      nextHandler(new Request('https://parity.example.com/llms.txt')).then((r) => r.text()),
    ]);

    // All should be identical
    expect(expressRes).toBe(fastifyRes);
    expect(fastifyRes).toBe(honoRes);
    expect(honoRes).toBe(nextRes);

    // Verify it's actually valid content
    expect(expressRes).toContain('# Parity Test');
    expect(expressRes).toContain('## Documentation');
    expect(expressRes).toContain('## Main');
    expect(expressRes).toContain('This is a preamble for AI agents.');
    expect(expressRes).toContain('## Contact');
  });

  it('all adapters include ETag headers on /llms.txt', async () => {
    await startExpress(sharedConfig);

    const honoApp = new Hono();
    honoApp.use('*', honoLlmsTxt(sharedConfig));

    const nextHandler = serveLlmsTxt(sharedConfig);

    const expressRes = await fetch(`${expressBaseUrl}/llms.txt`);
    const honoRes = await honoApp.request('/llms.txt');
    const nextRes = await nextHandler(new Request('https://parity.example.com/llms.txt'));

    // All should have ETag headers
    expect(expressRes.headers.get('etag')).toMatch(/^"[a-f0-9]{32}"$/);
    expect(honoRes.headers.get('etag')).toMatch(/^"[a-f0-9]{32}"$/);
    expect(nextRes.headers.get('etag')).toMatch(/^"[a-f0-9]{32}"$/);

    // All ETags should be the same (same content → same hash)
    expect(expressRes.headers.get('etag')).toBe(honoRes.headers.get('etag'));
    expect(honoRes.headers.get('etag')).toBe(nextRes.headers.get('etag'));
  });
});

// ─── Adapter edge cases ──────────────────────────────────────────

describe('adapter parity: edge cases', () => {
  afterEach(async () => {
    await stopExpress().catch(() => {});
    await stopFastify().catch(() => {});
  });

  it('adapters handle config with no pages gracefully', async () => {
    const emptyConfig: LlmsTxtConfig = {
      site: {
        name: 'Empty',
        url: 'https://empty.com',
        description: 'No pages.',
      },
      pages: [],
      options: { cacheTtl: 0 },
    };

    // Test each adapter handles empty pages
    const honoApp = new Hono();
    honoApp.use('*', honoLlmsTxt(emptyConfig));
    const honoRes = await honoApp.request('/llms.txt');
    expect(honoRes.status).toBe(200);
    const body = await honoRes.text();
    expect(body).toContain('# Empty');

    const nextHandler = serveLlmsTxt(emptyConfig);
    const nextRes = await nextHandler(new Request('https://empty.com/llms.txt'));
    expect(nextRes.status).toBe(200);
  });

  it('adapters handle both full and small disabled', async () => {
    const config: LlmsTxtConfig = {
      site: { name: 'Minimal', url: 'https://minimal.com', description: 'Minimal.' },
      pages: [{ path: '/', title: 'Home' }],
      options: { cacheTtl: 0, full: false, small: false },
    };

    const honoApp = new Hono();
    honoApp.use('*', honoLlmsTxt(config));

    // /llms.txt should still work
    const llmsRes = await honoApp.request('/llms.txt');
    expect(llmsRes.status).toBe(200);

    // Both full and small should be 404
    const fullRes = await honoApp.request('/llms-full.txt');
    expect(fullRes.status).toBe(404);

    const smallRes = await honoApp.request('/llms-small.txt');
    expect(smallRes.status).toBe(404);
  });

  it('Express middleware passes non-matching requests to next handler', async () => {
    await startExpress(sharedConfig);

    // /robots.txt should fall through to 404
    const res = await fetch(`${expressBaseUrl}/robots.txt`);
    expect(res.status).toBe(404);

    // Regular path should reach the next handler
    const rootRes = await fetch(`${expressBaseUrl}/`);
    expect(rootRes.status).toBe(200);
    expect(await rootRes.text()).toBe('OK');
  });

  it('Fastify registers routes that respond correctly', async () => {
    await startFastify(sharedConfig);

    const llmsRes = await fetch(`${fastifyBaseUrl}/llms.txt`);
    expect(llmsRes.status).toBe(200);

    const fullRes = await fetch(`${fastifyBaseUrl}/llms-full.txt`);
    expect(fullRes.status).toBe(200);

    const smallRes = await fetch(`${fastifyBaseUrl}/llms-small.txt`);
    expect(smallRes.status).toBe(200);
  });

  it('Hono middleware chain works correctly', async () => {
    const app = new Hono();
    app.use('*', honoLlmsTxt(sharedConfig));
    app.get('/custom', (c) => c.text('Custom page'));

    const customRes = await app.request('/custom');
    expect(customRes.status).toBe(200);
    expect(await customRes.text()).toBe('Custom page');

    const llmsRes = await app.request('/llms.txt');
    expect(llmsRes.status).toBe(200);
    expect(await llmsRes.text()).toContain('# Parity Test');
  });

  it('Next.js createLlmsTxtHandler returns working GET export', async () => {
    const { GET } = createLlmsTxtHandler(sharedConfig);

    const res = await GET(new Request('https://parity.example.com/llms.txt'));
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('# Parity Test');
    expect(body).toContain('This is a preamble for AI agents.');
  });
});

// ─── Adapter with discovery (fixture dir) ────────────────────────

describe('adapter parity: discovery from fixtures', () => {
  afterEach(async () => {
    await stopExpress().catch(() => {});
    await stopFastify().catch(() => {});
  });

  const discoveryConfig: LlmsTxtConfig = {
    site: {
      name: 'Discovery Test',
      url: 'https://discovery.example.com',
      description: 'Testing discovery through adapters.',
    },
    discover: { dir: FIXTURES_DIR },
    sections: [
      { name: 'Documentation', pathPrefix: '/docs' },
      { name: 'Blog', pathPrefix: '/blog' },
      { name: 'Main', pathPrefix: '/' },
    ],
    options: { cacheTtl: 0 },
  };

  it('Express discovers and serves fixture pages', async () => {
    await startExpress(discoveryConfig);

    const res = await fetch(`${expressBaseUrl}/llms.txt`);
    const body = await res.text();

    expect(body).toContain('## Documentation');
    expect(body).toContain('API Reference');
    expect(body).toContain('Installation Guide');
    expect(body).toContain('## Blog');
    expect(body).toContain('Hello World');
    expect(body).toContain('Getting Started');
  });

  it('Hono discovers and serves fixture pages', async () => {
    const app = new Hono();
    app.use('*', honoLlmsTxt(discoveryConfig));

    const res = await app.request('/llms.txt');
    const body = await res.text();

    expect(body).toContain('## Documentation');
    expect(body).toContain('API Reference');
    expect(body).toContain('## Blog');
    expect(body).toContain('Hello World');
  });

  it('all adapters discover the same pages from fixture dir', async () => {
    await startExpress(discoveryConfig);
    await startFastify(discoveryConfig);

    const honoApp = new Hono();
    honoApp.use('*', honoLlmsTxt(discoveryConfig));

    const nextHandler = serveLlmsTxt(discoveryConfig);

    const [expressBody, fastifyBody, honoBody, nextBody] = await Promise.all([
      fetch(`${expressBaseUrl}/llms.txt`).then((r) => r.text()),
      fetch(`${fastifyBaseUrl}/llms.txt`).then((r) => r.text()),
      honoApp.request('/llms.txt').then((r) => r.text()),
      nextHandler(new Request('https://discovery.example.com/llms.txt')).then((r) => r.text()),
    ]);

    // All bodies should be identical
    expect(expressBody).toBe(fastifyBody);
    expect(fastifyBody).toBe(honoBody);
    expect(honoBody).toBe(nextBody);
  });
});
