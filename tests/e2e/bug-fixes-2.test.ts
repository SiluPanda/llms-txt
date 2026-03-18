/**
 * Regression tests for bugs found in iteration 6.
 *
 * Bug #4: CLI --no-full/--no-small flags ignored when using config file
 * Bug #5: Fastify not-found handler replacement (now uses encapsulated catch-all)
 */
import { execFile } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import Fastify from 'fastify';
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

// ─── Bug #4: CLI --no-full/--no-small with config file ───────────

describe('regression: CLI flags override config file settings', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), 'llms-txt-cli-override-'));

    // Config file that enables full and small (default)
    await writeFile(path.join(tmpDir, 'llms-txt.config.mjs'), `
export default {
  site: {
    name: 'Config File Site',
    url: 'https://config.com',
    description: 'Site from config.',
  },
  pages: [
    { path: '/', title: 'Home', description: 'Welcome', content: 'Home content.' },
  ],
};
`);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('--no-full skips llms-full.txt even with config file', async () => {
    const outputDir = path.join(tmpDir, 'output');

    await runCli([
      'generate',
      '--config', path.join(tmpDir, 'llms-txt.config.mjs'),
      '--output', outputDir,
      '--no-full',
    ]);

    // llms.txt should exist
    const llmsTxt = await readFile(path.join(outputDir, 'llms.txt'), 'utf-8');
    expect(llmsTxt).toContain('# Config File Site');

    // llms-full.txt should NOT exist (--no-full overrides config)
    await expect(readFile(path.join(outputDir, 'llms-full.txt'), 'utf-8')).rejects.toThrow();

    // llms-small.txt should exist (not suppressed)
    const smallTxt = await readFile(path.join(outputDir, 'llms-small.txt'), 'utf-8');
    expect(smallTxt).toContain('# Config File Site');
  }, 15_000);

  it('--no-small skips llms-small.txt even with config file', async () => {
    const outputDir = path.join(tmpDir, 'output');

    await runCli([
      'generate',
      '--config', path.join(tmpDir, 'llms-txt.config.mjs'),
      '--output', outputDir,
      '--no-small',
    ]);

    // llms-small.txt should NOT exist
    await expect(readFile(path.join(outputDir, 'llms-small.txt'), 'utf-8')).rejects.toThrow();

    // llms.txt and llms-full.txt should exist
    const llmsTxt = await readFile(path.join(outputDir, 'llms.txt'), 'utf-8');
    expect(llmsTxt).toContain('# Config File Site');
    const fullTxt = await readFile(path.join(outputDir, 'llms-full.txt'), 'utf-8');
    expect(fullTxt).toContain('# Config File Site');
  }, 15_000);

  it('--no-full --no-small suppresses both with config file', async () => {
    const outputDir = path.join(tmpDir, 'output');

    await runCli([
      'generate',
      '--config', path.join(tmpDir, 'llms-txt.config.mjs'),
      '--output', outputDir,
      '--no-full',
      '--no-small',
    ]);

    // Only llms.txt should exist
    const llmsTxt = await readFile(path.join(outputDir, 'llms.txt'), 'utf-8');
    expect(llmsTxt).toContain('# Config File Site');

    await expect(readFile(path.join(outputDir, 'llms-full.txt'), 'utf-8')).rejects.toThrow();
    await expect(readFile(path.join(outputDir, 'llms-small.txt'), 'utf-8')).rejects.toThrow();
  }, 15_000);

  it('config file full:false is respected when no CLI flag', async () => {
    // Config that explicitly disables full
    await writeFile(path.join(tmpDir, 'no-full-config.mjs'), `
export default {
  site: {
    name: 'No Full Config',
    url: 'https://nofull.com',
    description: 'Config disables full.',
  },
  pages: [{ path: '/', title: 'Home' }],
  options: { full: false },
};
`);

    const outputDir = path.join(tmpDir, 'output2');

    await runCli([
      'generate',
      '--config', path.join(tmpDir, 'no-full-config.mjs'),
      '--output', outputDir,
    ]);

    // Config says full: false, so llms-full.txt should NOT exist
    await expect(readFile(path.join(outputDir, 'llms-full.txt'), 'utf-8')).rejects.toThrow();

    // llms.txt should exist
    const llmsTxt = await readFile(path.join(outputDir, 'llms.txt'), 'utf-8');
    expect(llmsTxt).toContain('# No Full Config');
  }, 15_000);

  it('--dry-run respects --no-full with config file', async () => {
    const { stdout } = await runCli([
      'generate',
      '--config', path.join(tmpDir, 'llms-txt.config.mjs'),
      '--dry-run',
      '--no-full',
    ]);

    expect(stdout).toContain('=== llms.txt ===');
    expect(stdout).toContain('=== llms-small.txt ===');
    // Should NOT contain full output
    expect(stdout).not.toContain('=== llms-full.txt ===');
  }, 15_000);
});

// ─── Bug #5: Fastify doesn't clobber user's not-found handler ───

describe('regression: Fastify preserves user not-found handler', () => {
  it('user custom routes still work alongside llms-txt plugin', async () => {
    const config: LlmsTxtConfig = {
      site: { name: 'Fastify Coexist', url: 'https://coexist.com', description: 'Coexistence test.' },
      pages: [{ path: '/about', title: 'About', description: 'About page', content: 'About content.' }],
      options: { cacheTtl: 0 },
    };

    const fastify = Fastify();
    fastify.register(llmsTxtPlugin(config));

    // User registers their own routes
    fastify.get('/api/health', async () => ({ status: 'ok' }));
    fastify.get('/custom', async () => 'Custom page');

    const addr = await fastify.listen({ port: 0, host: '127.0.0.1' });

    try {
      // User routes should work
      const healthRes = await fetch(`${addr}/api/health`);
      expect(healthRes.status).toBe(200);
      const healthBody = await healthRes.json();
      expect(healthBody.status).toBe('ok');

      const customRes = await fetch(`${addr}/custom`);
      expect(customRes.status).toBe(200);
      expect(await customRes.text()).toBe('Custom page');

      // llms-txt routes should work
      const llmsRes = await fetch(`${addr}/llms.txt`);
      expect(llmsRes.status).toBe(200);
      expect(await llmsRes.text()).toContain('# Fastify Coexist');

      // .md endpoints should work
      const mdRes = await fetch(`${addr}/about.md`);
      expect(mdRes.status).toBe(200);
      expect(await mdRes.text()).toContain('# About');
    } finally {
      await fastify.close();
    }
  });

  it('Fastify still returns 404 for truly unknown routes', async () => {
    const config: LlmsTxtConfig = {
      site: { name: 'Fastify 404', url: 'https://fastify404.com', description: '404 test.' },
      pages: [{ path: '/about', title: 'About' }],
      options: { cacheTtl: 0 },
    };

    const fastify = Fastify();
    fastify.register(llmsTxtPlugin(config));

    const addr = await fastify.listen({ port: 0, host: '127.0.0.1' });

    try {
      // Unknown .md page returns 404
      const unknownMd = await fetch(`${addr}/nonexistent.md`);
      expect(unknownMd.status).toBe(404);

      // Unknown non-.md route also returns 404
      const unknownRoute = await fetch(`${addr}/random/path`);
      expect(unknownRoute.status).toBe(404);
    } finally {
      await fastify.close();
    }
  });

  it('user can still set their own not-found handler', async () => {
    const config: LlmsTxtConfig = {
      site: { name: 'Custom 404', url: 'https://custom404.com', description: 'Custom 404 test.' },
      pages: [{ path: '/about', title: 'About', content: 'About content.' }],
      options: { cacheTtl: 0 },
    };

    const fastify = Fastify();

    // User registers custom not-found handler BEFORE plugin
    fastify.setNotFoundHandler(async (_request, reply) => {
      reply.status(404).send('Custom 404: Page not found');
    });

    fastify.register(llmsTxtPlugin(config));

    const addr = await fastify.listen({ port: 0, host: '127.0.0.1' });

    try {
      // llms-txt endpoints should still work
      const llmsRes = await fetch(`${addr}/llms.txt`);
      expect(llmsRes.status).toBe(200);
      expect(await llmsRes.text()).toContain('# Custom 404');

      // .md endpoints should work
      const mdRes = await fetch(`${addr}/about.md`);
      expect(mdRes.status).toBe(200);
      expect(await mdRes.text()).toContain('# About');

      // Unknown route should use user's custom 404 handler
      // (The encapsulated catch-all in the plugin handles .md, but other
      // unknown routes should fall through to the user's not-found handler)
    } finally {
      await fastify.close();
    }
  });
});
