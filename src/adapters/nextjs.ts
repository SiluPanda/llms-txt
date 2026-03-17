import type { LlmsTxtConfig } from '../types.js';
import { handleRequest } from './handler.js';

export type { LlmsTxtConfig } from '../types.js';

export function createLlmsTxtHandler(config: LlmsTxtConfig): {
  GET: (request: Request) => Promise<Response>;
} {
  return {
    GET: serveLlmsTxt(config),
  };
}

export function serveLlmsTxt(config: LlmsTxtConfig): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const result = await handleRequest(url.pathname, config);

    if (!result) {
      return new Response('Not Found', { status: 404 });
    }

    return new Response(result.body, {
      status: result.status,
      headers: result.headers,
    });
  };
}
