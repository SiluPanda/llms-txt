/**
 * E2E tests for the Fastify adapter.
 *
 * Starts a real Fastify HTTP server, registers the llms-txt plugin
 * with local fixture HTML files, and makes actual HTTP requests.
 */
import Fastify from 'fastify';
import path from 'node:path';
import { llmsTxtPlugin } from '../../src/adapters/fastify.js';
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

let fastify: ReturnType<typeof Fastify>;
let baseUrl: string;

async function startServer(config: LlmsTxtConfig): Promise<void> {
  fastify = Fastify();
  fastify.register(llmsTxtPlugin(config));
  fastify.get('/', async () => 'OK');

  const address = await fastify.listen({ port: 0, host: '127.0.0.1' });
  baseUrl = address;
}

async function stopServer(): Promise<void> {
  if (fastify) {
    await fastify.close();
  }
}

describe('e2e: Fastify adapter', () => {
  afterEach(async () => {
    await stopServer();
  });

  it('serves /llms.txt with correct status, headers, and content', async () => {
    await startServer(makeConfig());

    const res = await fetch(`${baseUrl}/llms.txt`);

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
    await startServer(makeConfig());

    const res = await fetch(`${baseUrl}/llms-full.txt`);

    expect(res.status).toBe(200);

    const body = await res.text();
    expect(body).toContain('# Acme Corp');
    expect(body).toContain('### API Reference - Acme Docs');
    expect(body).toContain('plugin system allows extending Acme');
    expect(body).toContain('URL: https://acme.example.com/docs/api-reference');
    expect(body).toContain('Empowering developers worldwide');
  });

  it('serves other routes normally', async () => {
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
    expect(fullRes.status).toBe(404);
  });

  it('generates correct section organization', async () => {
    await startServer(makeConfig());

    const res = await fetch(`${baseUrl}/llms.txt`);
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
    await startServer({
      site: {
        name: 'Fastify Manual',
        url: 'https://fastify-manual.example.com',
        description: 'A manually configured Fastify site.',
      },
      pages: [
        { path: '/guides', title: 'Guides', description: 'How-to guides', content: 'Step by step instructions.' },
      ],
      options: { cacheTtl: 0 },
    });

    const res = await fetch(`${baseUrl}/llms.txt`);
    const body = await res.text();
    expect(body).toContain('# Fastify Manual');
    expect(body).toContain('[Guides](https://fastify-manual.example.com/guides)');

    const fullRes = await fetch(`${baseUrl}/llms-full.txt`);
    const fullBody = await fullRes.text();
    expect(fullBody).toContain('Step by step instructions.');
  });
});
