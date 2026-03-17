#!/usr/bin/env node

import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { Command } from 'commander';
import type { LlmsTxtConfig, PageInfo } from '../types.js';
import { discoverPages } from '../core/crawler.js';
import { generateLlmsTxt, generateLlmsFullTxt } from '../core/generator.js';
import { watch } from '../core/watcher.js';

const program = new Command();

program
  .name('llms-txt')
  .description('Generate llms.txt files for AI agent discoverability')
  .version('0.1.0');

program
  .command('generate')
  .description('Generate llms.txt and llms-full.txt')
  .option('-u, --url <url>', 'Site URL (used as base and for crawling)')
  .option('-d, --dir <dir>', 'Scan directory for HTML files')
  .option('-s, --sitemap <url>', 'Parse sitemap URL')
  .option('-n, --name <name>', 'Site name')
  .option('--description <text>', 'Site description')
  .option('-o, --output <dir>', 'Output directory', '.')
  .option('-c, --config <file>', 'Path to config file (JS/TS that default-exports LlmsTxtConfig)')
  .option('--no-full', 'Skip generating llms-full.txt')
  .option('-w, --watch', 'Watch source directory for changes and regenerate')
  .action(async (opts) => {
    try {
      let config: LlmsTxtConfig;

      if (opts.config) {
        const configPath = path.resolve(opts.config);
        const imported = await import(configPath);
        config = imported.default ?? imported;
      } else {
        if (!opts.name) {
          console.error('Error: --name is required (unless --config is provided)');
          process.exit(1);
        }
        if (!opts.description) {
          console.error('Error: --description is required (unless --config is provided)');
          process.exit(1);
        }
        if (!opts.url && !opts.dir && !opts.sitemap) {
          console.error('Error: at least one of --url, --dir, or --sitemap is required');
          process.exit(1);
        }

        config = {
          site: {
            name: opts.name,
            url: opts.url ?? '',
            description: opts.description,
          },
          discover: {
            ...(opts.dir ? { dir: opts.dir } : {}),
            ...(opts.sitemap ? { sitemapUrl: opts.sitemap } : {}),
            ...(opts.url ? { crawlUrl: opts.url } : {}),
          },
          options: {
            full: opts.full,
          },
        };
      }

      const outputDir = path.resolve(opts.output);
      const generateFull = opts.config ? config.options?.full !== false : opts.full;

      async function runGenerate(): Promise<void> {
        const pages = config.discover
          ? await discoverPages(config.discover, config.site.url)
          : [];

        const allPages: PageInfo[] = [
          ...(config.pages ?? []).map((p) => ({
            path: p.path,
            title: p.title,
            description: p.description ?? '',
            content: p.content ?? '',
            headings: [] as string[],
          })),
          ...pages,
        ];

        const llmsTxt = generateLlmsTxt(config, allPages);
        await mkdir(outputDir, { recursive: true });

        const llmsTxtPath = path.join(outputDir, 'llms.txt');
        await writeFile(llmsTxtPath, llmsTxt, 'utf-8');
        console.log(`Written: ${llmsTxtPath}`);

        if (generateFull) {
          const llmsFullTxt = generateLlmsFullTxt(config, allPages);
          const fullPath = path.join(outputDir, 'llms-full.txt');
          await writeFile(fullPath, llmsFullTxt, 'utf-8');
          console.log(`Written: ${fullPath}`);
        }
      }

      await runGenerate();

      if (opts.watch) {
        const watchDir = config.discover?.dir;
        if (!watchDir) {
          console.error('Error: --watch requires a source directory (--dir or config.discover.dir)');
          process.exit(1);
        }

        console.log(`Watching ${path.resolve(watchDir)} for changes...`);

        const watcher = watch({
          dir: watchDir,
          include: config.discover?.include ?? ['**/*.html'],
          exclude: config.discover?.exclude,
          onChange: async () => {
            try {
              console.log('Regenerating...');
              await runGenerate();
              console.log('Done.');
            } catch (err) {
              console.error('Regeneration error:', err instanceof Error ? err.message : err);
            }
          },
        });

        process.on('SIGINT', () => {
          console.log('\nStopping watcher...');
          watcher.close();
          process.exit(0);
        });

        // Keep the process alive
        await new Promise(() => {});
      }
    } catch (err) {
      console.error('Error:', err instanceof Error ? err.message : err);
      process.exit(1);
    }
  });

program.parse();
