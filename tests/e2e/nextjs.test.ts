/**
 * E2E tests for the Next.js adapter.
 *
 * Tests the serveLlmsTxt and createLlmsTxtHandler functions directly
 * using the Web API Request/Response (which Next.js route handlers use).
 */
import path from 'node:path';
import { serveLlmsTxt, createLlmsTxtHandler } from '../../src/adapters/nextjs.js';
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

describe('e2e: Next.js adapter - serveLlmsTxt', () => {
  it('serves /llms.txt with correct response', async () => {
    const handler = serveLlmsTxt(makeConfig());
    const request = new Request('https://acme.example.com/llms.txt');

    const res = await handler(request);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(res.headers.get('cache-control')).toBe('public, max-age=3600');

    const body = await res.text();
    expect(body).toContain('# Acme Corp');
    expect(body).toContain('> Build better software with Acme.');
    expect(body).toContain('## Documentation');
    expect(body).toContain('## Blog');
    expect(body).toContain('API Reference');
    expect(body).toContain('Hello World');
    expect(body).toContain('https://acme.example.com/docs/api-reference');
  });

  it('serves /llms-full.txt with inline content', async () => {
    const handler = serveLlmsTxt(makeConfig());
    const request = new Request('https://acme.example.com/llms-full.txt');

    const res = await handler(request);

    expect(res.status).toBe(200);

    const body = await res.text();
    expect(body).toContain('# Acme Corp');
    expect(body).toContain('### API Reference - Acme Docs');
    expect(body).toContain('plugin system allows extending Acme');
    expect(body).toContain('Empowering developers worldwide');
  });

  it('returns 404 for non-matching paths', async () => {
    const handler = serveLlmsTxt(makeConfig());
    const request = new Request('https://acme.example.com/about');

    const res = await handler(request);
    expect(res.status).toBe(404);
  });

  it('returns 404 for /llms-full.txt when full is disabled', async () => {
    const handler = serveLlmsTxt(makeConfig({ options: { cacheTtl: 0, full: false } }));

    const llmsRes = await handler(new Request('https://acme.example.com/llms.txt'));
    expect(llmsRes.status).toBe(200);

    const fullRes = await handler(new Request('https://acme.example.com/llms-full.txt'));
    expect(fullRes.status).toBe(404);
  });

  it('generates correct section organization', async () => {
    const handler = serveLlmsTxt(makeConfig());
    const res = await handler(new Request('https://acme.example.com/llms.txt'));
    const body = await res.text();

    const docsIdx = body.indexOf('## Documentation');
    const blogIdx = body.indexOf('## Blog');
    expect(docsIdx).toBeGreaterThan(-1);
    expect(blogIdx).toBeGreaterThan(docsIdx);

    const docsSection = body.slice(docsIdx, blogIdx);
    expect(docsSection).toContain('API Reference');
    expect(docsSection).not.toContain('Hello World');
  });
});

describe('e2e: Next.js adapter - createLlmsTxtHandler', () => {
  it('exports a GET handler that works correctly', async () => {
    const { GET } = createLlmsTxtHandler(makeConfig());

    const res = await GET(new Request('https://acme.example.com/llms.txt'));

    expect(res.status).toBe(200);

    const body = await res.text();
    expect(body).toContain('# Acme Corp');
    expect(body).toContain('## Documentation');
    expect(body).toContain('API Reference');
  });

  it('GET handler returns 404 for non-matching paths', async () => {
    const { GET } = createLlmsTxtHandler(makeConfig());

    const res = await GET(new Request('https://acme.example.com/'));
    expect(res.status).toBe(404);
  });

  it('serves manual pages via GET handler', async () => {
    const { GET } = createLlmsTxtHandler({
      site: {
        name: 'Next Manual',
        url: 'https://next-manual.example.com',
        description: 'A manually configured Next.js site.',
      },
      pages: [
        { path: '/changelog', title: 'Changelog', description: 'Release notes', content: 'v2.0 released with breaking changes.' },
      ],
      options: { cacheTtl: 0 },
    });

    const res = await GET(new Request('https://next-manual.example.com/llms.txt'));
    const body = await res.text();
    expect(body).toContain('# Next Manual');
    expect(body).toContain('[Changelog](https://next-manual.example.com/changelog)');

    const fullRes = await GET(new Request('https://next-manual.example.com/llms-full.txt'));
    const fullBody = await fullRes.text();
    expect(fullBody).toContain('v2.0 released with breaking changes.');
  });
});
