import { llmsTxt } from '../../src/adapters/hono.js';
import type { LlmsTxtConfig } from '../../src/types.js';

function makeConfig(): LlmsTxtConfig {
  return {
    site: {
      name: 'Hono Test',
      url: 'https://hono-test.com',
      description: 'A Hono test site.',
    },
    pages: [
      { path: '/', title: 'Home', description: 'Home page' },
    ],
    options: { cacheTtl: 0 },
  };
}

function createMockContext(path: string) {
  let responseBody: string | undefined;
  let responseStatus: number | undefined;
  let responseHeaders: Record<string, string> = {};
  return {
    req: { path, url: `http://localhost${path}` },
    text(body: string, status: number, headers?: Record<string, string>) {
      responseBody = body;
      responseStatus = status;
      if (headers) responseHeaders = headers;
      return new Response(body, { status, headers });
    },
    getResponse: () => ({ body: responseBody, status: responseStatus, headers: responseHeaders }),
  };
}

describe('llmsTxt Hono middleware', () => {
  it('calls next() for non-matching paths', async () => {
    const middleware = llmsTxt(makeConfig());
    const c = createMockContext('/');
    const next = vi.fn().mockResolvedValue(undefined);

    await middleware(c, next);

    expect(next).toHaveBeenCalled();
  });

  it('returns llms.txt content for /llms.txt path', async () => {
    const middleware = llmsTxt(makeConfig());
    const c = createMockContext('/llms.txt');
    const next = vi.fn().mockResolvedValue(undefined);

    const result = await middleware(c, next);

    expect(next).not.toHaveBeenCalled();
    expect(result).toBeInstanceOf(Response);

    const response = c.getResponse();
    expect(response.status).toBe(200);
    expect(response.body).toContain('# Hono Test');
    expect(response.body).toContain('> A Hono test site.');
  });

  it('sets correct headers', async () => {
    const middleware = llmsTxt(makeConfig());
    const c = createMockContext('/llms.txt');
    const next = vi.fn().mockResolvedValue(undefined);

    await middleware(c, next);

    const response = c.getResponse();
    expect(response.headers['content-type']).toBe('text/plain; charset=utf-8');
    expect(response.headers['cache-control']).toBe('public, max-age=3600');
  });

  it('returns llms-full.txt content for /llms-full.txt path', async () => {
    const config = makeConfig();
    config.pages = [
      { path: '/', title: 'Home', description: 'Home page', content: 'Full content here.' },
    ];
    const middleware = llmsTxt(config);
    const c = createMockContext('/llms-full.txt');
    const next = vi.fn().mockResolvedValue(undefined);

    const result = await middleware(c, next);

    expect(next).not.toHaveBeenCalled();
    expect(result).toBeInstanceOf(Response);

    const response = c.getResponse();
    expect(response.status).toBe(200);
    expect(response.body).toContain('### Home');
    expect(response.body).toContain('Full content here.');
  });

  it('calls next() for paths like /other/llms.txt', async () => {
    const middleware = llmsTxt(makeConfig());
    const c = createMockContext('/other/llms.txt');
    const next = vi.fn().mockResolvedValue(undefined);

    await middleware(c, next);

    expect(next).toHaveBeenCalled();
  });
});
