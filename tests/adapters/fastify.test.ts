import { llmsTxtPlugin } from '../../src/adapters/fastify.js';
import type { LlmsTxtConfig } from '../../src/types.js';

function makeConfig(): LlmsTxtConfig {
  return {
    site: {
      name: 'Fastify Test',
      url: 'https://fastify-test.com',
      description: 'A Fastify test site.',
    },
    pages: [
      { path: '/', title: 'Home', description: 'Home page' },
    ],
    options: { cacheTtl: 0 },
  };
}

function createMockReply() {
  const reply: any = {
    statusCode: 200,
    responseHeaders: {} as Record<string, string>,
    body: '',
    status(code: number) {
      reply.statusCode = code;
      return reply;
    },
    headers(h: Record<string, string>) {
      Object.assign(reply.responseHeaders, h);
      return reply;
    },
    send(body: string) {
      reply.body = body;
      return reply;
    },
  };
  return reply;
}

function createMockFastify() {
  const routes: Record<string, Function> = {};
  return {
    routes,
    get(path: string, handler: Function) {
      routes[path] = handler;
    },
  };
}

describe('llmsTxtPlugin Fastify plugin', () => {
  it('registers GET /llms.txt and GET /llms-full.txt routes', () => {
    const plugin = llmsTxtPlugin(makeConfig());
    const fastify = createMockFastify();
    const done = vi.fn();

    plugin(fastify, {}, done);

    expect(fastify.routes['/llms.txt']).toBeDefined();
    expect(fastify.routes['/llms-full.txt']).toBeDefined();
  });

  it('calls done() after registration', () => {
    const plugin = llmsTxtPlugin(makeConfig());
    const fastify = createMockFastify();
    const done = vi.fn();

    plugin(fastify, {}, done);

    expect(done).toHaveBeenCalledOnce();
  });

  it('responds with llms.txt content for /llms.txt route', async () => {
    const plugin = llmsTxtPlugin(makeConfig());
    const fastify = createMockFastify();
    const done = vi.fn();

    plugin(fastify, {}, done);

    const reply = createMockReply();
    await fastify.routes['/llms.txt']({}, reply);

    expect(reply.statusCode).toBe(200);
    expect(reply.body).toContain('# Fastify Test');
    expect(reply.body).toContain('> A Fastify test site.');
    expect(reply.responseHeaders['content-type']).toBe('text/plain; charset=utf-8');
    expect(reply.responseHeaders['cache-control']).toBe('public, max-age=3600');
  });

  it('responds with llms-full.txt content for /llms-full.txt route', async () => {
    const config = makeConfig();
    config.pages = [
      { path: '/', title: 'Home', description: 'Home page', content: 'Full content here.' },
    ];
    const plugin = llmsTxtPlugin(config);
    const fastify = createMockFastify();
    const done = vi.fn();

    plugin(fastify, {}, done);

    const reply = createMockReply();
    await fastify.routes['/llms-full.txt']({}, reply);

    expect(reply.statusCode).toBe(200);
    expect(reply.body).toContain('### Home');
    expect(reply.body).toContain('Full content here.');
  });

  it('sets correct headers on response', async () => {
    const plugin = llmsTxtPlugin(makeConfig());
    const fastify = createMockFastify();
    const done = vi.fn();

    plugin(fastify, {}, done);

    const reply = createMockReply();
    await fastify.routes['/llms.txt']({}, reply);

    expect(reply.responseHeaders['content-type']).toBe('text/plain; charset=utf-8');
    expect(reply.responseHeaders['cache-control']).toBe('public, max-age=3600');
  });
});
