#!/usr/bin/env node

import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import path from 'node:path';
import { Command } from 'commander';
import type { LlmsTxtConfig, PageInfo } from '../types.js';
import { discoverPages } from '../core/crawler.js';
import { generateLlmsTxt, generateLlmsFullTxt, generateLlmsSmallTxt, estimateTokens } from '../core/generator.js';
import { validateLlmsTxt } from '../core/validator.js';
import { watch } from '../core/watcher.js';

const CONFIG_FILENAMES = [
  'llms-txt.config.ts',
  'llms-txt.config.js',
  'llms-txt.config.mjs',
  'llms-txt.config.cjs',
];

async function discoverConfig(): Promise<string | null> {
  for (const name of CONFIG_FILENAMES) {
    const fullPath = path.resolve(name);
    try {
      await access(fullPath);
      return fullPath;
    } catch {
      // file doesn't exist, try next
    }
  }
  return null;
}

async function loadConfig(configPath: string): Promise<LlmsTxtConfig> {
  const imported = await import(configPath);
  return imported.default ?? imported;
}

const program = new Command();

program
  .name('llms-txt')
  .description('Generate llms.txt files for AI agent discoverability')
  .version('0.1.0');

program
  .command('generate')
  .description('Generate llms.txt, llms-full.txt, and llms-small.txt')
  .option('-u, --url <url>', 'Site URL (used as base and for crawling)')
  .option('-d, --dir <dir>', 'Scan directory for HTML files')
  .option('-s, --sitemap <url>', 'Parse sitemap URL')
  .option('-n, --name <name>', 'Site name')
  .option('--description <text>', 'Site description')
  .option('-o, --output <dir>', 'Output directory', '.')
  .option('-c, --config <file>', 'Path to config file (JS/TS that default-exports LlmsTxtConfig)')
  .option('--no-full', 'Skip generating llms-full.txt')
  .option('--no-small', 'Skip generating llms-small.txt')
  .option('--check', 'Exit non-zero if output files would change (for CI)')
  .option('--dry-run', 'Preview output without writing files')
  .option('-w, --watch', 'Watch source directory for changes and regenerate')
  .action(async (opts) => {
    try {
      let config: LlmsTxtConfig;

      if (opts.config) {
        config = await loadConfig(path.resolve(opts.config));
      } else {
        // Auto-discover config file
        const discovered = await discoverConfig();
        if (discovered) {
          console.log(`Using config: ${discovered}`);
          config = await loadConfig(discovered);
        } else {
          if (!opts.name) {
            console.error('Error: --name is required (unless a config file is found)');
            process.exit(1);
          }
          if (!opts.description) {
            console.error('Error: --description is required (unless a config file is found)');
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
              small: opts.small,
            },
          };
        }
      }

      const outputDir = path.resolve(opts.output);
      const usingConfigFile = !!(opts.config || (await discoverConfig()));
      // CLI flags --no-full / --no-small override config file settings
      const generateFull = usingConfigFile
        ? (opts.full === false ? false : config.options?.full !== false)
        : opts.full;
      const generateSmall = usingConfigFile
        ? (opts.small === false ? false : config.options?.small !== false)
        : opts.small;

      async function runGenerate(): Promise<void> {
        const discovered = config.discover
          ? await discoverPages(config.discover, config.site.url)
          : [];

        const allPages: PageInfo[] = [];
        const seenPaths = new Set<string>();
        const maxContentLength = config.options?.maxContentLength;

        for (const p of config.pages ?? []) {
          if (seenPaths.has(p.path)) continue;
          seenPaths.add(p.path);
          allPages.push({
            path: p.path,
            title: p.title,
            description: p.description ?? '',
            content: applyContentLimit(p.content ?? '', maxContentLength),
            headings: [] as string[],
          });
        }

        for (const page of discovered) {
          if (!seenPaths.has(page.path)) {
            seenPaths.add(page.path);
            page.content = applyContentLimit(page.content, maxContentLength);
            allPages.push(page);
          }
        }

        const llmsTxt = generateLlmsTxt(config, allPages);
        const llmsFullTxt = generateFull ? generateLlmsFullTxt(config, allPages) : undefined;
        const llmsSmallTxt = generateSmall ? generateLlmsSmallTxt(config, allPages) : undefined;

        // --dry-run: print to stdout without writing
        if (opts.dryRun) {
          console.log('=== llms.txt ===');
          console.log(llmsTxt);
          if (llmsFullTxt) {
            console.log('=== llms-full.txt ===');
            console.log(llmsFullTxt);
          }
          if (llmsSmallTxt) {
            console.log('=== llms-small.txt ===');
            console.log(llmsSmallTxt);
          }
          console.log(`Token estimates: llms.txt=${estimateTokens(llmsTxt)}${llmsFullTxt ? `, llms-full.txt=${estimateTokens(llmsFullTxt)}` : ''}${llmsSmallTxt ? `, llms-small.txt=${estimateTokens(llmsSmallTxt)}` : ''}`);
          return;
        }

        // --check: compare with existing files, exit 1 if different
        if (opts.check) {
          let changed = false;
          const files: Array<{ name: string; content: string }> = [
            { name: 'llms.txt', content: llmsTxt },
          ];
          if (llmsFullTxt) files.push({ name: 'llms-full.txt', content: llmsFullTxt });
          if (llmsSmallTxt) files.push({ name: 'llms-small.txt', content: llmsSmallTxt });

          for (const file of files) {
            const filePath = path.join(outputDir, file.name);
            try {
              const existing = await readFile(filePath, 'utf-8');
              if (existing !== file.content) {
                console.log(`${file.name}: would change`);
                changed = true;
              } else {
                console.log(`${file.name}: up to date`);
              }
            } catch {
              console.log(`${file.name}: would be created`);
              changed = true;
            }
          }

          if (changed) {
            console.error('Check failed: output files are not up to date');
            process.exit(1);
          }
          console.log('All files up to date.');
          return;
        }

        // Normal write
        await mkdir(outputDir, { recursive: true });

        const llmsTxtPath = path.join(outputDir, 'llms.txt');
        await writeFile(llmsTxtPath, llmsTxt, 'utf-8');
        console.log(`Written: ${llmsTxtPath} (~${estimateTokens(llmsTxt)} tokens)`);

        if (llmsFullTxt) {
          const fullPath = path.join(outputDir, 'llms-full.txt');
          await writeFile(fullPath, llmsFullTxt, 'utf-8');
          console.log(`Written: ${fullPath} (~${estimateTokens(llmsFullTxt)} tokens)`);
        }

        if (llmsSmallTxt) {
          const smallPath = path.join(outputDir, 'llms-small.txt');
          await writeFile(smallPath, llmsSmallTxt, 'utf-8');
          console.log(`Written: ${smallPath} (~${estimateTokens(llmsSmallTxt)} tokens)`);
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

program
  .command('validate')
  .description('Validate an llms.txt file against the spec')
  .argument('[file]', 'Path to llms.txt file', 'llms.txt')
  .action(async (file: string) => {
    try {
      const filePath = path.resolve(file);
      const content = await readFile(filePath, 'utf-8');
      const issues = validateLlmsTxt(content);

      if (issues.length === 0) {
        console.log(`${filePath}: valid`);
        return;
      }

      const errors = issues.filter((i) => i.level === 'error');
      const warnings = issues.filter((i) => i.level === 'warning');

      for (const issue of issues) {
        const prefix = issue.level === 'error' ? 'ERROR' : 'WARN';
        const location = issue.line ? `:${issue.line}` : '';
        console.log(`${prefix} ${filePath}${location}: ${issue.message}`);
      }

      console.log(`\n${errors.length} error(s), ${warnings.length} warning(s)`);

      if (errors.length > 0) {
        process.exit(1);
      }
    } catch (err) {
      console.error('Error:', err instanceof Error ? err.message : err);
      process.exit(1);
    }
  });

function applyContentLimit(content: string, maxLength: number | undefined): string {
  if (!maxLength || content.length <= maxLength) return content;
  return content.slice(0, maxLength) + '...';
}

program.parse();
