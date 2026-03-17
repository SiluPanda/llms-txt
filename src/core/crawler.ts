import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { DiscoverOptions, PageInfo } from '../types.js';
import { extractPageInfo } from './extractor.js';

const DEFAULT_MAX_DEPTH = 3;
const MAX_CONCURRENCY = 5;

export async function discoverPages(
  options: DiscoverOptions,
  siteUrl: string,
): Promise<PageInfo[]> {
  const results: PageInfo[] = [];

  if (options.dir) {
    const dirPages = await discoverFromDirectory(
      options.dir,
      options.include,
      options.exclude,
    );
    results.push(...dirPages);
  }

  if (options.sitemapUrl) {
    const sitemapPages = await discoverFromSitemap(options.sitemapUrl);
    results.push(...sitemapPages);
  }

  if (options.crawlUrl) {
    const crawledPages = await crawlUrl(options.crawlUrl, options.maxDepth);
    results.push(...crawledPages);
  }

  const seen = new Set<string>();
  const deduped: PageInfo[] = [];
  for (const page of results) {
    const key = normalizePath(page.path, siteUrl);
    if (!seen.has(key)) {
      seen.add(key);
      page.path = key;
      deduped.push(page);
    }
  }

  return deduped;
}

export async function discoverFromDirectory(
  dir: string,
  include?: string[],
  exclude?: string[],
): Promise<PageInfo[]> {
  const patterns = include ?? ['**/*.html'];
  const htmlFiles = await walkDirectory(dir, dir, patterns, exclude ?? []);
  const pages: PageInfo[] = [];

  for (const filePath of htmlFiles) {
    try {
      const html = await readFile(filePath, 'utf-8');
      const relativePath = path.relative(dir, filePath);
      const urlPath = filePathToUrlPath(relativePath);
      const info = extractPageInfo(html, urlPath);
      pages.push(info);
    } catch (err) {
      console.warn(`Failed to process ${filePath}:`, err);
    }
  }

  return pages;
}

export async function discoverFromSitemap(sitemapUrl: string): Promise<PageInfo[]> {
  try {
    const response = await fetch(sitemapUrl);
    if (!response.ok) {
      console.warn(`Failed to fetch sitemap: ${response.status} ${response.statusText}`);
      return [];
    }

    const xml = await response.text();
    const urls = extractUrlsFromSitemap(xml);

    return runWithConcurrency(urls, MAX_CONCURRENCY, async (url) => {
      try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const html = await res.text();
        return extractPageInfo(html, url);
      } catch (err) {
        console.warn(`Failed to fetch ${url}:`, err);
        return null;
      }
    });
  } catch (err) {
    console.warn('Failed to process sitemap:', err);
    return [];
  }
}

export async function crawlUrl(url: string, maxDepth?: number): Promise<PageInfo[]> {
  const depth = maxDepth ?? DEFAULT_MAX_DEPTH;
  const visited = new Set<string>();
  const pages: PageInfo[] = [];
  const baseUrl = new URL(url);

  const queue: Array<{ url: string; depth: number }> = [{ url, depth: 0 }];

  while (queue.length > 0) {
    const batch = queue.splice(0, MAX_CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(async (item) => {
        const normalized = normalizeUrl(item.url);
        if (visited.has(normalized)) return null;
        visited.add(normalized);

        try {
          const res = await fetch(item.url);
          if (!res.ok) return null;

          const contentType = res.headers.get('content-type') || '';
          if (!contentType.includes('text/html')) return null;

          const html = await res.text();
          const info = extractPageInfo(html, item.url);
          pages.push(info);

          if (item.depth < depth) {
            const links = extractInternalLinks(html, baseUrl);
            for (const link of links) {
              if (!visited.has(normalizeUrl(link))) {
                queue.push({ url: link, depth: item.depth + 1 });
              }
            }
          }

          return info;
        } catch (err) {
          console.warn(`Failed to crawl ${item.url}:`, err);
          return null;
        }
      }),
    );

    for (const result of results) {
      if (result.status === 'rejected') {
        console.warn('Crawl error:', result.reason);
      }
    }
  }

  return pages;
}

async function walkDirectory(
  root: string,
  current: string,
  include: string[],
  exclude: string[],
): Promise<string[]> {
  const results: string[] = [];

  try {
    const entries = await readdir(current, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      const relativePath = path.relative(root, fullPath);

      if (entry.isDirectory()) {
        const children = await walkDirectory(root, fullPath, include, exclude);
        results.push(...children);
      } else if (entry.isFile()) {
        if (matchesGlob(relativePath, include) && !matchesGlob(relativePath, exclude)) {
          results.push(fullPath);
        }
      }
    }
  } catch (err) {
    console.warn(`Failed to read directory ${current}:`, err);
  }

  return results;
}

function matchesGlob(filePath: string, patterns: string[]): boolean {
  if (patterns.length === 0) return false;
  const normalized = filePath.replace(/\\/g, '/');
  return patterns.some((pattern) => globToRegex(pattern).test(normalized));
}

function globToRegex(glob: string): RegExp {
  let regex = '';
  let i = 0;

  while (i < glob.length) {
    const char = glob[i];

    if (char === '*' && glob[i + 1] === '*') {
      if (glob[i + 2] === '/') {
        regex += '(?:.+/)?';
        i += 3;
      } else {
        regex += '.*';
        i += 2;
      }
    } else if (char === '*') {
      regex += '[^/]*';
      i++;
    } else if (char === '?') {
      regex += '[^/]';
      i++;
    } else if (char === '.') {
      regex += '\\.';
      i++;
    } else {
      regex += char;
      i++;
    }
  }

  return new RegExp(`^${regex}$`);
}

function filePathToUrlPath(relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, '/');
  let urlPath = '/' + normalized;

  if (urlPath.endsWith('/index.html')) {
    urlPath = urlPath.slice(0, -'/index.html'.length) || '/';
  } else if (urlPath.endsWith('.html')) {
    urlPath = urlPath.slice(0, -'.html'.length);
  }

  return urlPath;
}

function extractUrlsFromSitemap(xml: string): string[] {
  const urls: string[] = [];
  const locRegex = /<loc>\s*(.*?)\s*<\/loc>/gi;
  let match: RegExpExecArray | null;

  while ((match = locRegex.exec(xml)) !== null) {
    const url = match[1].trim();
    if (url) urls.push(url);
  }

  return urls;
}

function extractInternalLinks(html: string, baseUrl: URL): string[] {
  const links: string[] = [];
  const hrefRegex = /href=["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;

  while ((match = hrefRegex.exec(html)) !== null) {
    try {
      const resolved = new URL(match[1], baseUrl.origin);
      if (resolved.hostname === baseUrl.hostname && resolved.protocol === baseUrl.protocol) {
        resolved.hash = '';
        links.push(resolved.href);
      }
    } catch {
      // skip invalid URLs
    }
  }

  return links;
}

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    let normalized = parsed.href;
    if (normalized.endsWith('/') && normalized.length > parsed.origin.length + 1) {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  } catch {
    return url;
  }
}

function normalizePath(pagePath: string, _siteUrl: string): string {
  try {
    if (pagePath.startsWith('http://') || pagePath.startsWith('https://')) {
      const parsed = new URL(pagePath);
      return parsed.pathname === '/' ? '/' : parsed.pathname.replace(/\/$/, '');
    }
  } catch {
    // fall through
  }
  if (!pagePath.startsWith('/')) return `/${pagePath}`;
  return pagePath === '/' ? '/' : pagePath.replace(/\/$/, '');
}

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R | null>,
): Promise<Exclude<R, null>[]> {
  const results: Exclude<R, null>[] = [];
  let index = 0;

  async function worker(): Promise<void> {
    while (index < items.length) {
      const currentIndex = index++;
      const result = await fn(items[currentIndex]);
      if (result !== null) {
        results.push(result as Exclude<R, null>);
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);

  return results;
}
