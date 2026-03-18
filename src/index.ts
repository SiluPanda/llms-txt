export { extractPageInfo } from './core/extractor.js';
export { generateLlmsTxt, generateLlmsFullTxt, generateLlmsSmallTxt, estimateTokens } from './core/generator.js';
export { discoverPages, discoverFromDirectory, discoverFromSitemap, crawlUrl } from './core/crawler.js';
export { validateLlmsTxt } from './core/validator.js';
export { Cache } from './core/cache.js';
export { watch } from './core/watcher.js';
export type { WatcherOptions, Watcher } from './core/watcher.js';

export type {
  LlmsTxtConfig,
  PageConfig,
  PageInfo,
  SectionConfig,
  DiscoverOptions,
  GenerateOptions,
  LlmsTxtOutput,
  ValidationIssue,
} from './types.js';

import type { LlmsTxtConfig, LlmsTxtOutput, PageInfo } from './types.js';
import { discoverPages } from './core/crawler.js';
import { generateLlmsTxt, generateLlmsFullTxt, generateLlmsSmallTxt, estimateTokens } from './core/generator.js';

export async function generate(config: LlmsTxtConfig): Promise<LlmsTxtOutput> {
  const pages: PageInfo[] = [];
  const seenPaths = new Set<string>();

  if (config.pages) {
    for (const page of config.pages) {
      if (seenPaths.has(page.path)) continue;
      seenPaths.add(page.path);
      pages.push({
        path: page.path,
        title: page.title,
        description: page.description ?? '',
        content: applyContentLimit(page.content ?? '', config.options?.maxContentLength),
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
        page.content = applyContentLimit(page.content, config.options?.maxContentLength);
        pages.push(page);
      }
    }
  }

  const llmsTxt = generateLlmsTxt(config, pages);
  const generateFull = config.options?.full !== false;
  const generateSmall = config.options?.small !== false;
  const llmsFullTxt = generateFull ? generateLlmsFullTxt(config, pages) : undefined;
  const llmsSmallTxt = generateSmall ? generateLlmsSmallTxt(config, pages) : undefined;

  const tokenCounts: NonNullable<LlmsTxtOutput['tokenCounts']> = {
    llmsTxt: estimateTokens(llmsTxt),
  };
  if (llmsFullTxt) tokenCounts.llmsFullTxt = estimateTokens(llmsFullTxt);
  if (llmsSmallTxt) tokenCounts.llmsSmallTxt = estimateTokens(llmsSmallTxt);

  return {
    llmsTxt,
    llmsFullTxt,
    llmsSmallTxt,
    pages,
    generatedAt: new Date(),
    tokenCounts,
  };
}

function applyContentLimit(content: string, maxLength: number | undefined): string {
  if (!maxLength || content.length <= maxLength) return content;
  return content.slice(0, maxLength) + '...';
}

export function defineConfig(config: LlmsTxtConfig): LlmsTxtConfig {
  return config;
}
