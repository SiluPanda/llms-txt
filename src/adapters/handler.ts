import { createHash } from 'node:crypto';
import type { LlmsTxtConfig, LlmsTxtOutput, PageInfo } from '../types.js';
import { Cache } from '../core/cache.js';
import { discoverPages } from '../core/crawler.js';
import { generateLlmsTxt, generateLlmsFullTxt, generateLlmsSmallTxt } from '../core/generator.js';
import { watch, type Watcher } from '../core/watcher.js';

export interface HandlerResult {
  status: number;
  headers: Record<string, string>;
  body: string;
}

const cacheMap = new WeakMap<LlmsTxtConfig, Cache<LlmsTxtOutput>>();

function getCache(config: LlmsTxtConfig): Cache<LlmsTxtOutput> {
  let cache = cacheMap.get(config);
  if (!cache) {
    const ttl = config.options?.cacheTtl ?? 60_000;
    cache = new Cache<LlmsTxtOutput>(ttl);
    cacheMap.set(config, cache);
  }
  return cache;
}

async function resolveOutput(config: LlmsTxtConfig): Promise<LlmsTxtOutput> {
  const ttl = config.options?.cacheTtl ?? 60_000;
  const store = getCache(config);
  const cacheKey = 'llms-txt-output';

  const cached = store.get(cacheKey);
  if (cached) return cached;

  const pages = await resolvePages(config);
  const llmsTxt = generateLlmsTxt(config, pages);
  const generateFull = config.options?.full !== false;
  const generateSmall = config.options?.small !== false;
  const llmsFullTxt = generateFull ? generateLlmsFullTxt(config, pages) : undefined;
  const llmsSmallTxt = generateSmall ? generateLlmsSmallTxt(config, pages) : undefined;

  const output: LlmsTxtOutput = {
    llmsTxt,
    llmsFullTxt,
    llmsSmallTxt,
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
  const seenPaths = new Set<string>();
  const maxContentLength = config.options?.maxContentLength;

  if (config.pages) {
    for (const page of config.pages) {
      if (seenPaths.has(page.path)) continue;
      seenPaths.add(page.path);
      pages.push({
        path: page.path,
        title: page.title,
        description: page.description ?? '',
        content: applyContentLimit(page.content ?? '', maxContentLength),
        headings: [],
      });
    }
  }

  if (config.discover) {
    const extractOpts = config.options?.noiseSelectors
      ? { noiseSelectors: config.options.noiseSelectors }
      : undefined;
    const discovered = await discoverPages(config.discover, config.site.url, extractOpts);
    for (const page of discovered) {
      if (!seenPaths.has(page.path)) {
        seenPaths.add(page.path);
        page.content = applyContentLimit(page.content, maxContentLength);
        pages.push(page);
      }
    }
  }

  return pages;
}

function applyContentLimit(content: string, maxLength: number | undefined): string {
  if (!maxLength || content.length <= maxLength) return content;
  return content.slice(0, maxLength) + '...';
}

function makeEtag(body: string): string {
  return `"${createHash('md5').update(body).digest('hex')}"`;
}

function makeResponse(body: string, generatedAt: Date): HandlerResult {
  return {
    status: 200,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=3600',
      'etag': makeEtag(body),
      'last-modified': generatedAt.toUTCString(),
    },
    body,
  };
}

function renderPageMarkdown(page: PageInfo, siteUrl: string): string {
  const url = page.path.startsWith('http') ? page.path : `${siteUrl}${page.path.startsWith('/') ? '' : '/'}${page.path}`;
  const lines: string[] = [];
  lines.push(`# ${page.title}`);
  if (page.description) {
    lines.push('');
    lines.push(`> ${page.description}`);
  }
  lines.push('');
  lines.push(`URL: ${url}`);
  lines.push('');
  if (page.content) {
    lines.push(page.content);
    lines.push('');
  }
  return lines.join('\n');
}

export async function handleRequest(
  path: string,
  config: LlmsTxtConfig,
): Promise<HandlerResult | null> {
  const isLlmsRoute = path === '/llms.txt' || path === '/llms-full.txt' || path === '/llms-small.txt';
  const isMdRoute = path.endsWith('.md') && path !== '/.md';

  if (!isLlmsRoute && !isMdRoute) {
    return null;
  }

  try {
    const output = await resolveOutput(config);

    if (path === '/llms.txt') {
      return makeResponse(output.llmsTxt, output.generatedAt);
    }

    if (path === '/llms-full.txt') {
      if (!output.llmsFullTxt) return null;
      return makeResponse(output.llmsFullTxt, output.generatedAt);
    }

    if (path === '/llms-small.txt') {
      if (!output.llmsSmallTxt) return null;
      return makeResponse(output.llmsSmallTxt, output.generatedAt);
    }

    // Per-page .md endpoint: /docs/getting-started.md → find page at /docs/getting-started
    if (isMdRoute) {
      const pagePath = path.slice(0, -3); // strip .md
      const siteUrl = config.site.url.replace(/\/$/, '');
      const page = output.pages.find((p) => {
        const normalized = p.path.startsWith('http')
          ? new URL(p.path).pathname
          : p.path;
        return normalized === pagePath || normalized === `${pagePath}/`;
      });
      if (!page) return null;

      const body = renderPageMarkdown(page, siteUrl);
      return {
        status: 200,
        headers: {
          'content-type': 'text/markdown; charset=utf-8',
          'cache-control': 'public, max-age=3600',
          'etag': makeEtag(body),
          'last-modified': output.generatedAt.toUTCString(),
        },
        body,
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
      const cache = cacheMap.get(config);
      if (cache) {
        cache.invalidate();
      }
      onRegenerate?.();
    },
  });
}
