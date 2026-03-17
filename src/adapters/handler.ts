import type { LlmsTxtConfig, LlmsTxtOutput, PageInfo } from '../types.js';
import { Cache } from '../core/cache.js';
import { discoverPages } from '../core/crawler.js';
import { generateLlmsTxt, generateLlmsFullTxt } from '../core/generator.js';
import { watch, type Watcher } from '../core/watcher.js';

export interface HandlerResult {
  status: number;
  headers: Record<string, string>;
  body: string;
}

let cache: Cache<LlmsTxtOutput> | undefined;

function getCache(ttl: number): Cache<LlmsTxtOutput> {
  if (!cache) {
    cache = new Cache<LlmsTxtOutput>(ttl);
  }
  return cache;
}

async function resolveOutput(config: LlmsTxtConfig): Promise<LlmsTxtOutput> {
  const ttl = config.options?.cacheTtl ?? 60_000;
  const store = getCache(ttl);
  const cacheKey = 'llms-txt-output';

  const cached = store.get(cacheKey);
  if (cached) return cached;

  const pages = await resolvePages(config);
  const llmsTxt = generateLlmsTxt(config, pages);
  const generateFull = config.options?.full !== false;
  const llmsFullTxt = generateFull ? generateLlmsFullTxt(config, pages) : undefined;

  const output: LlmsTxtOutput = {
    llmsTxt,
    llmsFullTxt,
    pages,
    generatedAt: new Date(),
  };

  if (ttl > 0) {
    store.set(cacheKey, output);
  }

  return output;
}

async function resolvePages(config: LlmsTxtConfig): Promise<PageInfo[]> {
  const pages: PageInfo[] = [];

  if (config.pages) {
    for (const page of config.pages) {
      pages.push({
        path: page.path,
        title: page.title,
        description: page.description ?? '',
        content: page.content ?? '',
        headings: [],
      });
    }
  }

  if (config.discover) {
    const discovered = await discoverPages(config.discover, config.site.url);
    pages.push(...discovered);
  }

  return pages;
}

export async function handleRequest(
  path: string,
  config: LlmsTxtConfig,
): Promise<HandlerResult | null> {
  if (path !== '/llms.txt' && path !== '/llms-full.txt') {
    return null;
  }

  try {
    const output = await resolveOutput(config);

    if (path === '/llms.txt') {
      return {
        status: 200,
        headers: {
          'content-type': 'text/plain; charset=utf-8',
          'cache-control': 'public, max-age=3600',
        },
        body: output.llmsTxt,
      };
    }

    if (path === '/llms-full.txt') {
      if (!output.llmsFullTxt) {
        return null;
      }
      return {
        status: 200,
        headers: {
          'content-type': 'text/plain; charset=utf-8',
          'cache-control': 'public, max-age=3600',
        },
        body: output.llmsFullTxt,
      };
    }

    return null;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return {
      status: 500,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
      body: `Error generating llms.txt: ${message}`,
    };
  }
}

export function startWatching(
  config: LlmsTxtConfig,
  onRegenerate?: () => void,
): Watcher | null {
  const dir = config.discover?.dir;
  if (!dir) return null;

  return watch({
    dir,
    include: config.discover?.include ?? ['**/*.html'],
    exclude: config.discover?.exclude,
    onChange: () => {
      if (cache) {
        cache.invalidate();
      }
      onRegenerate?.();
    },
  });
}
