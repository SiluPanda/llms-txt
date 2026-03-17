import type { LlmsTxtConfig } from '../types.js';
import { handleRequest } from './handler.js';

export type { LlmsTxtConfig } from '../types.js';

export function llmsTxt(
  config: LlmsTxtConfig,
): (c: any, next: () => Promise<void>) => Promise<Response | void> {
  return async (c, next) => {
    const path = c.req.path ?? new URL(c.req.url).pathname;
    const result = await handleRequest(path, config);

    if (!result) {
      await next();
      return;
    }

    return c.text(result.body, result.status, result.headers);
  };
}

