export { extractPageInfo } from './core/extractor.js';
export { generateLlmsTxt, generateLlmsFullTxt } from './core/generator.js';
export { discoverPages, discoverFromDirectory, discoverFromSitemap, crawlUrl } from './core/crawler.js';
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
} from './types.js';

import type { LlmsTxtConfig, LlmsTxtOutput, PageInfo } from './types.js';
import { discoverPages } from './core/crawler.js';
import { generateLlmsTxt, generateLlmsFullTxt } from './core/generator.js';

export async function generate(config: LlmsTxtConfig): Promise<LlmsTxtOutput> {
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

  const llmsTxt = generateLlmsTxt(config, pages);
  const generateFull = config.options?.full !== false;
  const llmsFullTxt = generateFull ? generateLlmsFullTxt(config, pages) : undefined;

  return {
    llmsTxt,
    llmsFullTxt,
    pages,
    generatedAt: new Date(),
  };
}

export function defineConfig(config: LlmsTxtConfig): LlmsTxtConfig {
  return config;
}
