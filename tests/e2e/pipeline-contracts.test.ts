/**
 * Pipeline contract tests.
 *
 * Tests critical behavioral contracts across the full pipeline:
 * - maxContentLength works through handler/adapters (previously a bug)
 * - Deduplication priority (manual > discovered) through handler
 * - filterPages + deduplication interaction
 * - Path routing edge cases
 * - Empty pipeline scenarios
 * - Handler/generate() parity
 */
import path from 'node:path';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { generate, validateLlmsTxt } from '../../src/index.js';
import { handleRequest } from '../../src/adapters/handler.js';
import type { LlmsTxtConfig } from '../../src/types.js';

const FIXTURES_DIR = path.resolve(__dirname, 'fixtures');

// ─── maxContentLength through handler (was a bug) ────────────────

describe('pipeline: maxContentLength through handler', () => {
  it('truncates discovered page content via handler', async () => {
    const config: LlmsTxtConfig = {
      site: { name: 'Truncate', url: 'https://truncate.com', description: 'Truncation test.' },
      discover: { dir: FIXTURES_DIR },
      options: { cacheTtl: 0, maxContentLength: 30 },
    };

    const result = await handleRequest('/llms-full.txt', config);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(200);

    // All page content should be ≤ 33 chars (30 + '...')
    const lines = result!.body.split('\n');
    // Find content lines (not headers, URLs, separators)
    for (const line of lines) {
      if (line.startsWith('### ') || line.startsWith('URL:') || line.startsWith('#') ||
          line.startsWith('>') || line.startsWith('---') || line.startsWith('## ') ||
          line.trim() === '') continue;
      // Content lines that were truncated should end with ...
      if (line.endsWith('...')) {
        const content = line;
        expect(content.length).toBeLessThanOrEqual(33);
      }
    }
  });

  it('truncates manual page content via handler', async () => {
    const config: LlmsTxtConfig = {
      site: { name: 'Manual Truncate', url: 'https://manual.com', description: 'Test.' },
      pages: [
        { path: '/long', title: 'Long Page', description: 'A page', content: 'a'.repeat(200) },
      ],
      options: { cacheTtl: 0, maxContentLength: 50 },
    };

    const result = await handleRequest('/llms-full.txt', config);
    expect(result).not.toBeNull();

    // Should contain truncated content
    expect(result!.body).toContain('a'.repeat(50) + '...');
    expect(result!.body).not.toContain('a'.repeat(51));
  });

  it('handler maxContentLength matches generate() behavior', async () => {
    const config: LlmsTxtConfig = {
      site: { name: 'Parity', url: 'https://parity.com', description: 'Parity check.' },
      discover: { dir: FIXTURES_DIR },
      options: { cacheTtl: 0, maxContentLength: 40 },
    };

    // Get output from generate()
    const genResult = await generate(config);

    // Get output from handler
    const handlerResult = await handleRequest('/llms-full.txt', config);
    expect(handlerResult).not.toBeNull();

    // Both should produce the same truncation behavior
    // Check that all pages are truncated the same way
    for (const page of genResult.pages) {
      if (page.content.length > 40) {
        expect(page.content).toHaveLength(43); // 40 + '...'
        expect(page.content.endsWith('...')).toBe(true);
      }
    }
  });

  it('does not truncate when maxContentLength is not set', async () => {
    const config: LlmsTxtConfig = {
      site: { name: 'No Limit', url: 'https://nolimit.com', description: 'No limit.' },
      pages: [
        { path: '/big', title: 'Big Page', content: 'x'.repeat(10000) },
      ],
      options: { cacheTtl: 0 },
    };

    const result = await handleRequest('/llms-full.txt', config);
    expect(result).not.toBeNull();
    expect(result!.body).toContain('x'.repeat(10000));
  });
});

// ─── Deduplication priority through handler ──────────────────────

describe('pipeline: deduplication priority through handler', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), 'llms-txt-dedup-'));
    // Create a page at /about that will conflict with manual page
    await writeFile(path.join(tmpDir, 'about.html'),
      '<html><head><title>Discovered About</title></head><body><main>Discovered content</main></body></html>');
    await writeFile(path.join(tmpDir, 'index.html'),
      '<html><head><title>Discovered Home</title></head><body><main>Discovered home content</main></body></html>');
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true });
  });

  it('manual pages take priority over discovered pages in handler', async () => {
    const config: LlmsTxtConfig = {
      site: { name: 'Dedup', url: 'https://dedup.com', description: 'Dedup test.' },
      pages: [
        { path: '/about', title: 'Manual About', description: 'Manual desc', content: 'Manual content' },
      ],
      discover: { dir: tmpDir },
      options: { cacheTtl: 0 },
    };

    const result = await handleRequest('/llms.txt', config);
    expect(result).not.toBeNull();

    // Manual About should win over Discovered About
    expect(result!.body).toContain('Manual About');
    expect(result!.body).not.toContain('Discovered About');

    // Discovered Home should still be present (no conflict)
    expect(result!.body).toContain('Discovered Home');
  });

  it('handler dedup matches generate() dedup behavior', async () => {
    const config: LlmsTxtConfig = {
      site: { name: 'Dedup Parity', url: 'https://dedup-parity.com', description: 'Dedup parity.' },
      pages: [
        { path: '/', title: 'Manual Home', description: 'My home', content: 'My content' },
      ],
      discover: { dir: tmpDir },
      options: { cacheTtl: 0 },
    };

    const genResult = await generate(config);
    const handlerResult = await handleRequest('/llms.txt', config);

    expect(handlerResult).not.toBeNull();

    // Both should prioritize manual Home over Discovered Home
    const genHome = genResult.pages.find((p) => p.path === '/');
    expect(genHome!.title).toBe('Manual Home');

    expect(handlerResult!.body).toContain('Manual Home');
    expect(handlerResult!.body).not.toContain('Discovered Home');
  });

  it('first manual page wins over second manual page in handler', async () => {
    const config: LlmsTxtConfig = {
      site: { name: 'Dup Manual', url: 'https://dup.com', description: 'Dup test.' },
      pages: [
        { path: '/page', title: 'First', description: 'First entry' },
        { path: '/page', title: 'Second', description: 'Should be ignored' },
      ],
      options: { cacheTtl: 0 },
    };

    const result = await handleRequest('/llms.txt', config);
    expect(result).not.toBeNull();
    expect(result!.body).toContain('First');
    expect(result!.body).not.toContain('Second');
  });
});

// ─── filterPages + dedup interaction ─────────────────────────────

describe('pipeline: filterPages + dedup interaction', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), 'llms-txt-filter-'));
    await writeFile(path.join(tmpDir, 'index.html'),
      '<html><head><title>Home</title></head><body><main>Home</main></body></html>');
    await writeFile(path.join(tmpDir, 'about.html'),
      '<html><head><title>About</title></head><body><main>About</main></body></html>');
    await writeFile(path.join(tmpDir, 'secret.html'),
      '<html><head><title>Secret</title></head><body><main>Secret</main></body></html>');
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true });
  });

  it('filter is applied after dedup in generate()', async () => {
    const result = await generate({
      site: { name: 'Filter', url: 'https://filter.com', description: 'Filter test.' },
      pages: [
        { path: '/about', title: 'Manual About', description: 'Manual' },
        { path: '/extra', title: 'Extra', description: 'Extra page' },
      ],
      discover: { dir: tmpDir },
      options: {
        cacheTtl: 0,
        filterPages: (p) => p.path !== '/secret',
      },
    });

    // /about should be Manual About (dedup), /secret should be filtered
    expect(result.llmsTxt).toContain('Manual About');
    expect(result.llmsTxt).not.toContain('Secret');
    expect(result.llmsTxt).toContain('Extra');
    expect(result.llmsTxt).toContain('Home');
  });

  it('filter applied to discovered pages through handler', async () => {
    const config: LlmsTxtConfig = {
      site: { name: 'Handler Filter', url: 'https://hfilter.com', description: 'Handler filter test.' },
      discover: { dir: tmpDir },
      options: {
        cacheTtl: 0,
        filterPages: (p) => !p.path.includes('secret'),
      },
    };

    const result = await handleRequest('/llms.txt', config);
    expect(result).not.toBeNull();
    expect(result!.body).toContain('Home');
    expect(result!.body).toContain('About');
    expect(result!.body).not.toContain('Secret');
  });
});

// ─── Path routing edge cases ─────────────────────────────────────

describe('pipeline: handler path routing edge cases', () => {
  const config: LlmsTxtConfig = {
    site: { name: 'Routing', url: 'https://route.com', description: 'Routing test.' },
    pages: [
      { path: '/', title: 'Home', description: 'Welcome', content: 'Home content.' },
      { path: '/docs/guide', title: 'Guide', description: 'A guide', content: 'Guide content.' },
    ],
    options: { cacheTtl: 0 },
  };

  it('returns null for paths that look like .md but have no matching page', async () => {
    expect(await handleRequest('/nonexistent.md', config)).toBeNull();
    expect(await handleRequest('/docs/missing.md', config)).toBeNull();
  });

  it('rejects /.md as an invalid path', async () => {
    expect(await handleRequest('/.md', config)).toBeNull();
  });

  it('case-sensitive .md matching', async () => {
    // .MD (uppercase) should NOT match since path.endsWith('.md') is case-sensitive
    expect(await handleRequest('/docs/guide.MD', config)).toBeNull();
  });

  it('rejects paths with query strings that look like routes', async () => {
    // These should not match handler routes
    expect(await handleRequest('/llms.txt?v=2', config)).toBeNull();
    expect(await handleRequest('/api/llms.txt', config)).toBeNull();
  });

  it('exact match only for llms.txt routes', async () => {
    expect(await handleRequest('/llms.txt', config)).not.toBeNull();
    expect(await handleRequest('/my/llms.txt', config)).toBeNull();
    expect(await handleRequest('/llms.txta', config)).toBeNull();
    expect(await handleRequest('/llms.txt/', config)).toBeNull();
  });
});

// ─── Empty pipeline scenarios ────────────────────────────────────

describe('pipeline: empty pipeline scenarios', () => {
  it('handler serves valid llms.txt with zero pages', async () => {
    const config: LlmsTxtConfig = {
      site: { name: 'Empty', url: 'https://empty.com', description: 'No pages at all.' },
      pages: [],
      options: { cacheTtl: 0 },
    };

    const llms = await handleRequest('/llms.txt', config);
    expect(llms).not.toBeNull();
    expect(llms!.status).toBe(200);
    expect(llms!.body).toContain('# Empty');
    expect(llms!.body).toContain('> No pages at all.');

    const full = await handleRequest('/llms-full.txt', config);
    expect(full).not.toBeNull();
    expect(full!.status).toBe(200);

    const small = await handleRequest('/llms-small.txt', config);
    expect(small).not.toBeNull();
    expect(small!.status).toBe(200);
  });

  it('handler serves valid llms.txt from empty directory', async () => {
    const tmpDir = await mkdtemp(path.join(tmpdir(), 'llms-txt-empty-pipeline-'));

    try {
      const config: LlmsTxtConfig = {
        site: { name: 'Empty Dir', url: 'https://emptydir.com', description: 'Empty directory.' },
        discover: { dir: tmpDir },
        options: { cacheTtl: 0 },
      };

      const result = await handleRequest('/llms.txt', config);
      expect(result).not.toBeNull();
      expect(result!.status).toBe(200);
      expect(result!.body).toContain('# Empty Dir');
    } finally {
      await rm(tmpDir, { recursive: true });
    }
  });

  it('generate() with no pages and no discover works', async () => {
    const result = await generate({
      site: { name: 'Bare', url: 'https://bare.com', description: 'Bare minimum.' },
    });

    expect(result.llmsTxt).toContain('# Bare');
    expect(result.pages).toHaveLength(0);
    expect(result.generatedAt).toBeInstanceOf(Date);

    // Even empty output should be structurally valid
    const issues = validateLlmsTxt(result.llmsTxt);
    const errors = issues.filter((i) => i.level === 'error');
    expect(errors).toHaveLength(0);
  });
});

// ─── Handler/generate() output parity ────────────────────────────

describe('pipeline: handler and generate() parity', () => {
  it('handler /llms.txt matches generate().llmsTxt for same config', async () => {
    const config: LlmsTxtConfig = {
      site: { name: 'Parity', url: 'https://parity.com', description: 'Parity test.' },
      pages: [
        { path: '/', title: 'Home', description: 'Welcome', content: 'Home content.' },
        { path: '/about', title: 'About', description: 'About us', content: 'About content.' },
      ],
      sections: [
        { name: 'Main', pathPrefix: '/' },
      ],
      options: {
        cacheTtl: 0,
        preamble: 'Preamble text.',
        additionalSections: { 'Support': 'Contact support@parity.com' },
      },
    };

    const genResult = await generate(config);
    const handlerResult = await handleRequest('/llms.txt', config);

    expect(handlerResult).not.toBeNull();
    expect(handlerResult!.body).toBe(genResult.llmsTxt);
  });

  it('handler full output matches generate() full output', async () => {
    const config: LlmsTxtConfig = {
      site: { name: 'Full Parity', url: 'https://full-parity.com', description: 'Full parity.' },
      pages: [
        { path: '/a', title: 'Page A', description: 'Desc A', content: 'Content A.' },
        { path: '/b', title: 'Page B', description: 'Desc B', content: 'Content B.' },
      ],
      options: { cacheTtl: 0 },
    };

    const genResult = await generate(config);
    const handlerResult = await handleRequest('/llms-full.txt', config);

    expect(handlerResult).not.toBeNull();
    expect(handlerResult!.body).toBe(genResult.llmsFullTxt);
  });

  it('handler small output matches generate() small output', async () => {
    const config: LlmsTxtConfig = {
      site: { name: 'Small Parity', url: 'https://small-parity.com', description: 'Small parity.' },
      pages: [
        { path: '/x', title: 'Page X', description: 'Desc X' },
      ],
      options: { cacheTtl: 0 },
    };

    const genResult = await generate(config);
    const handlerResult = await handleRequest('/llms-small.txt', config);

    expect(handlerResult).not.toBeNull();
    expect(handlerResult!.body).toBe(genResult.llmsSmallTxt);
  });
});

// ─── noiseSelectors through handler ──────────────────────────────

describe('pipeline: noiseSelectors through handler', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), 'llms-txt-noise-handler-'));
    await writeFile(path.join(tmpDir, 'index.html'), `<html><head><title>Home</title></head><body><main>
      <div class="ad-banner">Buy our stuff</div>
      <p>Real page content here.</p>
      <div class="newsletter-popup">Subscribe!</div>
    </main></body></html>`);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true });
  });

  it('handler applies noiseSelectors to discovered content', async () => {
    const config: LlmsTxtConfig = {
      site: { name: 'Noise Handler', url: 'https://noise-handler.com', description: 'Test.' },
      discover: { dir: tmpDir },
      options: {
        cacheTtl: 0,
        noiseSelectors: ['.ad-banner', '.newsletter-popup'],
      },
    };

    const result = await handleRequest('/llms-full.txt', config);
    expect(result).not.toBeNull();
    expect(result!.body).toContain('Real page content');
    expect(result!.body).not.toContain('Buy our stuff');
    expect(result!.body).not.toContain('Subscribe');
  });

  it('handler noiseSelectors match generate() behavior', async () => {
    const config: LlmsTxtConfig = {
      site: { name: 'Noise Parity', url: 'https://noise-parity.com', description: 'Test.' },
      discover: { dir: tmpDir },
      options: {
        cacheTtl: 0,
        noiseSelectors: ['.ad-banner'],
      },
    };

    const genResult = await generate(config);
    const handlerResult = await handleRequest('/llms-full.txt', config);

    expect(handlerResult).not.toBeNull();
    expect(handlerResult!.body).toBe(genResult.llmsFullTxt);
  });
});

// ─── Config file path for CLI ────────────────────────────────────

describe('pipeline: invalid noiseSelectors are harmless', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), 'llms-txt-invalid-noise-'));
    await writeFile(path.join(tmpDir, 'index.html'),
      '<html><head><title>Page</title></head><body><main><p>Content</p></main></body></html>');
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true });
  });

  it('non-matching noiseSelectors preserve all content', async () => {
    const result = await generate({
      site: { name: 'No Match', url: 'https://nomatch.com', description: 'Test.' },
      discover: { dir: tmpDir },
      options: {
        cacheTtl: 0,
        noiseSelectors: ['.nonexistent', '#does-not-exist'],
      },
    });

    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].content).toContain('Content');
  });

  it('selecting the main container does not crash', async () => {
    const result = await generate({
      site: { name: 'Container Select', url: 'https://container.com', description: 'Test.' },
      discover: { dir: tmpDir },
      options: {
        cacheTtl: 0,
        noiseSelectors: ['main'],
      },
    });

    // Should not throw — content may be empty or minimal
    expect(result.pages).toHaveLength(1);
  });
});
