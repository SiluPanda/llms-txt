import type { LlmsTxtConfig } from '../types.js';
import type { RequestHandler } from 'express';
import { handleRequest } from './handler.js';

export type { LlmsTxtConfig } from '../types.js';

export function llmsTxt(config: LlmsTxtConfig): RequestHandler {
  return async (req, res, next) => {
    const result = await handleRequest(req.path, config);

    if (!result) {
      next();
      return;
    }

    res.status(result.status);
    for (const [key, value] of Object.entries(result.headers)) {
      res.setHeader(key, value);
    }
    res.send(result.body);
  };
}
