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
});
