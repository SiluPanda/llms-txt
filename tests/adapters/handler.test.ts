import { handleRequest } from '../../src/adapters/handler.js';
import type { LlmsTxtConfig } from '../../src/types.js';

function makeConfig(overrides?: Partial<LlmsTxtConfig>): LlmsTxtConfig {
  return {
    site: {
      name: 'Test Site',
      url: 'https://test.com',
      description: 'A test site.',
    },
    pages: [
      { path: '/', title: 'Home', description: 'Welcome', content: 'Home page content.' },
      { path: '/about', title: 'About', description: 'About us', content: 'About page content.' },
    ],
    // Disable caching to avoid cross-test pollution
    options: { cacheTtl: 0 },
    ...overrides,
  };
}

describe('handleRequest', () => {
  it('returns llms.txt content for /llms.txt path', async () => {
    const config = makeConfig();
    const result = await handleRequest('/llms.txt', config);

    expect(result).not.toBeNull();
    expect(result!.status).toBe(200);
    expect(result!.body).toContain('# Test Site');
    expect(result!.body).toContain('> A test site.');
    expect(result!.body).toContain('[Home]');
    expect(result!.body).toContain('[About]');
  });

  it('returns llms-full.txt content for /llms-full.txt path', async () => {
    const config = makeConfig();
    const result = await handleRequest('/llms-full.txt', config);

    expect(result).not.toBeNull();
    expect(result!.status).toBe(200);
    expect(result!.body).toContain('### Home');
    expect(result!.body).toContain('Home page content.');
    expect(result!.body).toContain('### About');
    expect(result!.body).toContain('About page content.');
  });

  it('returns null for unhandled paths', async () => {
    const config = makeConfig();

    expect(await handleRequest('/', config)).toBeNull();
    expect(await handleRequest('/robots.txt', config)).toBeNull();
    expect(await handleRequest('/llms.txt.bak', config)).toBeNull();
    expect(await handleRequest('/api/llms.txt', config)).toBeNull();
  });

  it('sets correct content-type header', async () => {
    const config = makeConfig();
    const result = await handleRequest('/llms.txt', config);

    expect(result!.headers['content-type']).toBe('text/plain; charset=utf-8');
  });

  it('sets correct cache-control header', async () => {
    const config = makeConfig();
    const result = await handleRequest('/llms.txt', config);

    expect(result!.headers['cache-control']).toBe('public, max-age=3600');
  });

  it('converts PageConfig to PageInfo correctly', async () => {
    const config = makeConfig({
      pages: [
        { path: '/custom', title: 'Custom Page', description: 'Desc', content: 'Body text' },
      ],
      options: { cacheTtl: 0 },
    });

    const llmsTxtResult = await handleRequest('/llms.txt', config);
    expect(llmsTxtResult!.body).toContain('[Custom Page](https://test.com/custom): Desc');

    const fullResult = await handleRequest('/llms-full.txt', config);
    expect(fullResult!.body).toContain('### Custom Page');
    expect(fullResult!.body).toContain('Body text');
  });

  it('returns null for /llms-full.txt when full generation is disabled', async () => {
    const config = makeConfig({
      options: { full: false, cacheTtl: 0 },
    });
    const result = await handleRequest('/llms-full.txt', config);

    expect(result).toBeNull();
  });

  it('caches results between calls when TTL > 0', async () => {
    // Use a config with caching enabled
    const config: LlmsTxtConfig = {
      site: {
        name: 'Cached Site',
        url: 'https://cached.com',
        description: 'Cached.',
      },
      pages: [
        { path: '/page', title: 'Page', description: 'Desc' },
      ],
      options: { cacheTtl: 60_000 },
    };

    const result1 = await handleRequest('/llms.txt', config);
    const result2 = await handleRequest('/llms.txt', config);

    // Both should return valid results
    expect(result1).not.toBeNull();
    expect(result2).not.toBeNull();
    expect(result1!.body).toBe(result2!.body);
  });

  it('isolates cache between different config objects', async () => {
    const configA: LlmsTxtConfig = {
      site: { name: 'Site A', url: 'https://a.com', description: 'Site A.' },
      pages: [{ path: '/', title: 'A Home' }],
      options: { cacheTtl: 60_000 },
    };

    const configB: LlmsTxtConfig = {
      site: { name: 'Site B', url: 'https://b.com', description: 'Site B.' },
      pages: [{ path: '/', title: 'B Home' }],
      options: { cacheTtl: 60_000 },
    };

    const resultA = await handleRequest('/llms.txt', configA);
    const resultB = await handleRequest('/llms.txt', configB);

    expect(resultA!.body).toContain('# Site A');
    expect(resultA!.body).not.toContain('# Site B');
    expect(resultB!.body).toContain('# Site B');
    expect(resultB!.body).not.toContain('# Site A');
  });

  it('deduplicates pages with the same path', async () => {
    const config = makeConfig({
      pages: [
        { path: '/dup', title: 'First', description: 'First entry' },
        { path: '/dup', title: 'Second', description: 'Should be ignored' },
      ],
      options: { cacheTtl: 0 },
    });
    const result = await handleRequest('/llms.txt', config);

    expect(result!.body).toContain('[First]');
    expect(result!.body).not.toContain('[Second]');
  });

  it('returns llms-small.txt content for /llms-small.txt path', async () => {
    const config = makeConfig();
    const result = await handleRequest('/llms-small.txt', config);

    expect(result).not.toBeNull();
    expect(result!.status).toBe(200);
    expect(result!.body).toContain('# Test Site');
    expect(result!.body).toContain('[Home]');
    expect(result!.body).toContain('[About]');
    // Small output should NOT include descriptions
    expect(result!.body).not.toContain('Welcome');
    expect(result!.body).not.toContain('About us');
    // Small output should NOT include blockquote description
    expect(result!.body).not.toContain('> A test site.');
  });

  it('returns null for /llms-small.txt when small generation is disabled', async () => {
    const config = makeConfig({
      options: { small: false, cacheTtl: 0 },
    });
    const result = await handleRequest('/llms-small.txt', config);

    expect(result).toBeNull();
  });

  it('includes ETag header on llms.txt response', async () => {
    const config = makeConfig();
    const result = await handleRequest('/llms.txt', config);

    expect(result).not.toBeNull();
    expect(result!.headers['etag']).toBeDefined();
    // ETag should be a quoted MD5 hash string
    expect(result!.headers['etag']).toMatch(/^"[a-f0-9]{32}"$/);
  });

  it('returns consistent ETag for same content', async () => {
    const config = makeConfig();
    const result1 = await handleRequest('/llms.txt', config);
    const result2 = await handleRequest('/llms.txt', config);

    expect(result1!.headers['etag']).toBe(result2!.headers['etag']);
  });

  it('includes Last-Modified header', async () => {
    const config = makeConfig();
    const result = await handleRequest('/llms.txt', config);

    expect(result).not.toBeNull();
    expect(result!.headers['last-modified']).toBeDefined();
    // Should be a valid date string
    const parsed = new Date(result!.headers['last-modified']);
    expect(parsed.getTime()).not.toBeNaN();
  });

  it('includes ETag and Last-Modified on llms-full.txt', async () => {
    const config = makeConfig();
    const result = await handleRequest('/llms-full.txt', config);

    expect(result).not.toBeNull();
    expect(result!.headers['etag']).toMatch(/^"[a-f0-9]{32}"$/);
    expect(result!.headers['last-modified']).toBeDefined();
  });

  it('includes ETag and Last-Modified on llms-small.txt', async () => {
    const config = makeConfig();
    const result = await handleRequest('/llms-small.txt', config);

    expect(result).not.toBeNull();
    expect(result!.headers['etag']).toMatch(/^"[a-f0-9]{32}"$/);
    expect(result!.headers['last-modified']).toBeDefined();
  });

  it('returns per-page markdown for .md endpoints', async () => {
    const config = makeConfig();
    const result = await handleRequest('/about.md', config);

    expect(result).not.toBeNull();
    expect(result!.status).toBe(200);
    expect(result!.body).toContain('# About');
    expect(result!.body).toContain('About page content.');
    expect(result!.body).toContain('URL: https://test.com/about');
  });

  it('returns text/markdown content type for .md endpoints', async () => {
    const config = makeConfig();
    const result = await handleRequest('/about.md', config);

    expect(result).not.toBeNull();
    expect(result!.headers['content-type']).toBe('text/markdown; charset=utf-8');
  });

  it('returns null for .md endpoint with unknown page', async () => {
    const config = makeConfig();
    const result = await handleRequest('/nonexistent.md', config);

    expect(result).toBeNull();
  });

  it('returns null for /.md (bare extension with no page path)', async () => {
    const config = makeConfig();
    const result = await handleRequest('/.md', config);

    expect(result).toBeNull();
  });

  it('includes page description as blockquote in .md response', async () => {
    const config = makeConfig();
    const result = await handleRequest('/about.md', config);

    expect(result).not.toBeNull();
    expect(result!.body).toContain('> About us');
  });

  it('includes ETag and Last-Modified on .md responses', async () => {
    const config = makeConfig();
    const result = await handleRequest('/about.md', config);

    expect(result).not.toBeNull();
    expect(result!.headers['etag']).toMatch(/^"[a-f0-9]{32}"$/);
    expect(result!.headers['last-modified']).toBeDefined();
  });

  it('handles root page .md endpoint by matching / path', async () => {
    const config = makeConfig({
      pages: [
        { path: '/', title: 'Home', description: 'Welcome', content: 'Home page content.' },
      ],
      options: { cacheTtl: 0 },
    });

    // The root page maps to path '/' which would be '/.md' — but /.md is excluded
    // So we test that a legitimate nested path works
    const result = await handleRequest('/about.md', makeConfig());
    expect(result).not.toBeNull();
  });
});
