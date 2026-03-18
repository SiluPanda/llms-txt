/**
 * Regression tests for bugs found during hardening.
 *
 * Bug #1: Validator regex /g flag caused alternating false positives
 * Bug #2: CLI didn't apply maxContentLength
 * Bug #3: Fastify adapter missing .md endpoint support
 */
import { execFile } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import Fastify from 'fastify';
import { validateLlmsTxt } from '../../src/core/validator.js';
import { llmsTxtPlugin } from '../../src/adapters/fastify.js';
import type { LlmsTxtConfig } from '../../src/types.js';

const exec = promisify(execFile);
const CLI_PATH = path.resolve(__dirname, '../../src/cli/index.ts');
const FIXTURES_DIR = path.resolve(__dirname, 'fixtures');

function runCli(args: string[]): Promise<{ stdout: string; stderr: string }> {
  return exec('npx', ['tsx', CLI_PATH, ...args], {
    cwd: path.resolve(__dirname, '../..'),
    timeout: 30_000,
  });
}

// ─── Bug #1: Validator regex state with consecutive links ────────

describe('regression: validator regex /g flag (consecutive valid links)', () => {
  it('does not flag valid links as malformed on alternating lines', () => {
    const content = [
      '# My Site',
      '',
      '> Description of the site.',
      '',
      '## Pages',
      '',
      '- [Page A](https://example.com/a): First page',
      '- [Page B](https://example.com/b): Second page',
      '- [Page C](https://example.com/c): Third page',
      '- [Page D](https://example.com/d): Fourth page',
      '- [Page E](https://example.com/e): Fifth page',
      '- [Page F](https://example.com/f): Sixth page',
    ].join('\n');

    const issues = validateLlmsTxt(content);
    const malformed = issues.filter((i) => i.message.includes('Malformed'));

    // Before fix: every other line would be flagged as malformed due to /g lastIndex
    expect(malformed).toHaveLength(0);
  });

  it('still correctly detects malformed links among valid ones', () => {
    const content = [
      '# My Site',
      '',
      '> Description.',
      '',
      '## Pages',
      '',
      '- [Valid](https://example.com/a): OK',
      '- [Broken link with no parens',
      '- [Also Valid](https://example.com/b): OK',
    ].join('\n');

    const issues = validateLlmsTxt(content);
    const malformed = issues.filter((i) => i.message.includes('Malformed'));

    expect(malformed).toHaveLength(1);
    expect(malformed[0].line).toBe(8); // The broken one
  });

  it('validates many consecutive links without false positives', () => {
    const links = Array.from({ length: 20 }, (_, i) =>
      `- [Page ${i + 1}](https://example.com/page-${i + 1}): Description ${i + 1}`,
    );

    const content = [
      '# Large Site',
      '',
      '> A site with many pages.',
      '',
      '## Pages',
      '',
      ...links,
    ].join('\n');

    const issues = validateLlmsTxt(content);
    const errors = issues.filter((i) => i.level === 'error');

    expect(errors).toHaveLength(0);
  });

  it('validates generated output with many pages has no false positives', () => {
    // Simulate what generate() produces with 10 pages
    const pages = Array.from({ length: 10 }, (_, i) =>
      `- [Page ${i}](https://example.com/page-${i}): Description for page ${i}`,
    );

    const content = [
      '# Test Site',
      '',
      '> A test site with many pages.',
      '',
      '## Documentation',
      '',
      ...pages.slice(0, 5),
      '',
      '## Blog',
      '',
      ...pages.slice(5),
      '',
    ].join('\n');

    const issues = validateLlmsTxt(content);
    const malformed = issues.filter((i) => i.message.includes('Malformed'));
    expect(malformed).toHaveLength(0);
  });
});

// ─── Bug #2: CLI maxContentLength ────────────────────────────────

describe('regression: CLI maxContentLength', () => {
  let tmpDir: string;
  let contentDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), 'llms-txt-cli-maxcontent-'));
    contentDir = await mkdtemp(path.join(tmpdir(), 'llms-txt-cli-content-'));

    // Create a config file that sets maxContentLength
    await writeFile(path.join(tmpDir, 'llms-txt.config.mjs'), `
export default {
  site: {
    name: 'CLI MaxContent Test',
    url: 'https://cli-test.com',
    description: 'Testing maxContentLength in CLI.',
  },
  discover: { dir: '${contentDir.replace(/\\/g, '\\\\')}' },
  options: {
    maxContentLength: 30,
  },
};
`);

    // Create HTML with long content
    await writeFile(path.join(contentDir, 'index.html'),
      `<html><head><title>Long Page</title></head><body><main>${'x'.repeat(200)}</main></body></html>`);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
    await rm(contentDir, { recursive: true, force: true });
  });

  it('CLI respects maxContentLength in dry-run output', async () => {
    const { stdout } = await runCli([
      'generate',
      '--config', path.join(tmpDir, 'llms-txt.config.mjs'),
      '--dry-run',
    ]);

    // Should see truncated content (30 chars + '...')
    expect(stdout).toContain('=== llms-full.txt ===');
    // Should NOT contain 200 x's in a row
    expect(stdout).not.toContain('x'.repeat(31));
    // Should contain truncated version
    expect(stdout).toContain('x'.repeat(30) + '...');
  }, 15_000);

  it('CLI writes truncated content to files', async () => {
    const outputDir = path.join(tmpDir, 'output');

    await runCli([
      'generate',
      '--config', path.join(tmpDir, 'llms-txt.config.mjs'),
      '--output', outputDir,
    ]);

    const fullTxt = await readFile(path.join(outputDir, 'llms-full.txt'), 'utf-8');
    expect(fullTxt).toContain('x'.repeat(30) + '...');
    expect(fullTxt).not.toContain('x'.repeat(31));
  }, 15_000);
});

// ─── Bug #3: Fastify .md endpoint support ────────────────────────

describe('regression: Fastify .md endpoint support', () => {
  let fastify: ReturnType<typeof Fastify>;
  let baseUrl: string;

  const config: LlmsTxtConfig = {
    site: {
      name: 'Fastify MD Test',
      url: 'https://fastify-md.com',
      description: 'Testing .md endpoints in Fastify.',
    },
    pages: [
      { path: '/', title: 'Home', description: 'Welcome', content: 'Home content.' },
      { path: '/about', title: 'About', description: 'About us', content: 'About content.' },
      { path: '/docs/guide', title: 'Guide', description: 'Getting started', content: 'Guide content.' },
    ],
    options: { cacheTtl: 0 },
  };

  beforeEach(async () => {
    fastify = Fastify();
    fastify.register(llmsTxtPlugin(config));
    fastify.get('/', async () => 'OK');
    const address = await fastify.listen({ port: 0, host: '127.0.0.1' });
    baseUrl = address;
  });

  afterEach(async () => {
    await fastify.close();
  });

  it('serves /about.md for a known page', async () => {
    const res = await fetch(`${baseUrl}/about.md`);
    expect(res.status).toBe(200);

    const body = await res.text();
    expect(body).toContain('# About');
    expect(body).toContain('> About us');
    expect(body).toContain('URL: https://fastify-md.com/about');
    expect(body).toContain('About content.');
  });

  it('serves /docs/guide.md for a nested page', async () => {
    const res = await fetch(`${baseUrl}/docs/guide.md`);
    expect(res.status).toBe(200);

    const body = await res.text();
    expect(body).toContain('# Guide');
    expect(body).toContain('Guide content.');
  });

  it('returns 404 for unknown .md page', async () => {
    const res = await fetch(`${baseUrl}/nonexistent.md`);
    expect(res.status).toBe(404);
  });

  it('returns text/markdown content type for .md pages', async () => {
    const res = await fetch(`${baseUrl}/about.md`);
    expect(res.headers.get('content-type')).toContain('text/markdown');
  });

  it('returns ETag and cache headers for .md pages', async () => {
    const res = await fetch(`${baseUrl}/about.md`);
    expect(res.headers.get('etag')).toMatch(/^"[a-f0-9]{32}"$/);
    expect(res.headers.get('cache-control')).toBe('public, max-age=3600');
  });

  it('still serves /llms.txt, /llms-full.txt, /llms-small.txt', async () => {
    const llms = await fetch(`${baseUrl}/llms.txt`);
    expect(llms.status).toBe(200);
    expect(await llms.text()).toContain('# Fastify MD Test');

    const full = await fetch(`${baseUrl}/llms-full.txt`);
    expect(full.status).toBe(200);

    const small = await fetch(`${baseUrl}/llms-small.txt`);
    expect(small.status).toBe(200);
  });
});

// ─── Fastify .md with discovered pages ───────────────────────────

describe('regression: Fastify .md with discovered pages', () => {
  let fastify: ReturnType<typeof Fastify>;
  let baseUrl: string;

  beforeEach(async () => {
    const config: LlmsTxtConfig = {
      site: {
        name: 'Fastify Discover',
        url: 'https://fastify-discover.com',
        description: 'Testing .md with discovery.',
      },
      discover: { dir: FIXTURES_DIR },
      options: { cacheTtl: 0 },
    };

    fastify = Fastify();
    fastify.register(llmsTxtPlugin(config));
    const address = await fastify.listen({ port: 0, host: '127.0.0.1' });
    baseUrl = address;
  });

  afterEach(async () => {
    await fastify.close();
  });

  it('serves .md for discovered pages', async () => {
    const res = await fetch(`${baseUrl}/about.md`);
    expect(res.status).toBe(200);

    const body = await res.text();
    expect(body).toContain('About');
    expect(body).toContain('URL: https://fastify-discover.com/about');
  });

  it('serves .md for nested discovered pages', async () => {
    const res = await fetch(`${baseUrl}/docs/api-reference.md`);
    expect(res.status).toBe(200);

    const body = await res.text();
    expect(body).toContain('API Reference');
  });
});
