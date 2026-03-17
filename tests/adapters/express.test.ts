import { llmsTxt } from '../../src/adapters/express.js';
import type { LlmsTxtConfig } from '../../src/types.js';

function makeConfig(): LlmsTxtConfig {
  return {
    site: {
      name: 'Express Test',
      url: 'https://express-test.com',
      description: 'An Express test site.',
    },
    pages: [
      { path: '/', title: 'Home', description: 'Home page' },
    ],
    options: { cacheTtl: 0 },
  };
}

interface MockRequest {
  path: string;
  method: string;
}

interface MockResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  status: (code: number) => MockResponse;
  setHeader: (key: string, value: string) => void;
  send: (body: string) => void;
}

function createMockReq(path: string): MockRequest {
  return { path, method: 'GET' };
}

function createMockRes(): MockResponse {
  const res: MockResponse = {
    statusCode: 200,
    headers: {},
    body: '',
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    setHeader(key: string, value: string) {
      res.headers[key] = value;
    },
    send(body: string) {
      res.body = body;
    },
  };
  return res;
}

describe('llmsTxt Express middleware', () => {
  it('calls next() for non-matching paths', async () => {
    const middleware = llmsTxt(makeConfig());
    const req = createMockReq('/');
    const res = createMockRes();
    const next = vi.fn();

    await middleware(req as any, res as any, next);

    expect(next).toHaveBeenCalled();
    expect(res.body).toBe('');
  });

  it('responds with llms.txt for GET /llms.txt', async () => {
    const middleware = llmsTxt(makeConfig());
    const req = createMockReq('/llms.txt');
    const res = createMockRes();
    const next = vi.fn();

    await middleware(req as any, res as any, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('# Express Test');
    expect(res.body).toContain('> An Express test site.');
  });

  it('sets correct status and headers', async () => {
    const middleware = llmsTxt(makeConfig());
    const req = createMockReq('/llms.txt');
    const res = createMockRes();
    const next = vi.fn();

    await middleware(req as any, res as any, next);

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('text/plain; charset=utf-8');
    expect(res.headers['cache-control']).toBe('public, max-age=3600');
  });

  it('responds with llms-full.txt for GET /llms-full.txt', async () => {
    const config = makeConfig();
    config.pages = [
      { path: '/', title: 'Home', description: 'Home page', content: 'Full content here.' },
    ];
    const middleware = llmsTxt(config);
    const req = createMockReq('/llms-full.txt');
    const res = createMockRes();
    const next = vi.fn();

    await middleware(req as any, res as any, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('### Home');
    expect(res.body).toContain('Full content here.');
  });

  it('calls next() for paths like /other/llms.txt', async () => {
    const middleware = llmsTxt(makeConfig());
    const req = createMockReq('/other/llms.txt');
    const res = createMockRes();
    const next = vi.fn();

    await middleware(req as any, res as any, next);

    expect(next).toHaveBeenCalled();
  });
});
