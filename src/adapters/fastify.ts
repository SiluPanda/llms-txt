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

    done();
  };
}

