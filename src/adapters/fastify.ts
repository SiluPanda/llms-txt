import type { LlmsTxtConfig } from '../types.js';
import { handleRequest } from './handler.js';

export type { LlmsTxtConfig } from '../types.js';

export function llmsTxtPlugin(
  config: LlmsTxtConfig,
): (fastify: any, opts: any, done: (err?: Error) => void) => void {
  return (fastify, _opts, done) => {
    fastify.get('/llms.txt', async (_request: any, reply: any) => {
      const result = await handleRequest('/llms.txt', config);
      if (!result) {
        reply.status(404).send('Not Found');
        return;
      }
      reply.status(result.status).headers(result.headers).send(result.body);
    });

    fastify.get('/llms-full.txt', async (_request: any, reply: any) => {
      const result = await handleRequest('/llms-full.txt', config);
      if (!result) {
        reply.status(404).send('Not Found');
        return;
      }
      reply.status(result.status).headers(result.headers).send(result.body);
    });

    fastify.get('/llms-small.txt', async (_request: any, reply: any) => {
      const result = await handleRequest('/llms-small.txt', config);
      if (!result) {
        reply.status(404).send('Not Found');
        return;
      }
      reply.status(result.status).headers(result.headers).send(result.body);
    });

    // Handle per-page .md endpoints via preHandler hook on a catch-all route.
    // We use a separate encapsulated context to avoid clobbering the user's routes.
    fastify.register(async (scope: any) => {
      scope.get('/*', async (request: any, reply: any) => {
        const url = request.url as string;
        if (url.endsWith('.md') && url !== '/.md') {
          const result = await handleRequest(url, config);
          if (result) {
            reply.status(result.status).headers(result.headers).send(result.body);
            return;
          }
        }
        reply.status(404).send('Not Found');
      });
    });

    done();
  };
}

