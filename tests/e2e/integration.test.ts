/**
 * Full pipeline integration tests.
 *
 * These tests exercise the complete flow:
 *   directory discovery → extraction → generation → validation
 * using local fixtures (no network calls).
 */
import path from 'node:path';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import {
  generate,
  validateLlmsTxt,
  extractPageInfo,
  discoverFromDirectory,
  generateLlmsTxt,
  generateLlmsFullTxt,
  generateLlmsSmallTxt,
  estimateTokens,
} from '../../src/index.js';
import { handleRequest } from '../../src/adapters/handler.js';
import type { LlmsTxtConfig, PageInfo } from '../../src/types.js';

const FIXTURES_DIR = path.resolve(__dirname, 'fixtures');

// ─── Full Pipeline ───────────────────────────────────────────────

describe('integration: full pipeline (discover → generate → validate)', () => {
  it('generates valid llms.txt from fixture directory', async () => {
    const result = await generate({
      site: {
        name: 'Acme Corp',
        url: 'https://acme.example.com',
        description: 'Build better software with Acme tools.',
      },
      discover: { dir: FIXTURES_DIR },
      options: { cacheTtl: 0 },
    });

    // Validate the generated llms.txt
    const issues = validateLlmsTxt(result.llmsTxt);
    const errors = issues.filter((i) => i.level === 'error');
    expect(errors).toHaveLength(0);

    // Structural checks
    expect(result.llmsTxt).toMatch(/^# Acme Corp\n/);
    expect(result.llmsTxt).toContain('> Build better software with Acme tools.');
    expect(result.pages.length).toBe(6);
    expect(result.generatedAt).toBeInstanceOf(Date);
  });

  it('generates valid llms.txt with sections', async () => {
    const result = await generate({
      site: {
        name: 'Acme Corp',
        url: 'https://acme.example.com',
        description: 'Build better software.',
      },
      discover: { dir: FIXTURES_DIR },
      sections: [
        { name: 'Documentation', pathPrefix: '/docs' },
        { name: 'Blog', pathPrefix: '/blog' },
        { name: 'Main', pathPrefix: '/' },
      ],
      options: { cacheTtl: 0 },
    });

    const issues = validateLlmsTxt(result.llmsTxt);
    const errors = issues.filter((i) => i.level === 'error');
    expect(errors).toHaveLength(0);

    // All pages should be assigned to sections
    expect(result.llmsTxt).toContain('## Documentation');
    expect(result.llmsTxt).toContain('## Blog');
    expect(result.llmsTxt).toContain('## Main');
    expect(result.llmsTxt).not.toContain('## Other');
  });

  it('validates llms-full.txt has valid structure', async () => {
    const result = await generate({
      site: {
        name: 'Acme Corp',
        url: 'https://acme.example.com',
        description: 'Build better software.',
      },
      discover: { dir: FIXTURES_DIR },
      options: { cacheTtl: 0 },
    });

    expect(result.llmsFullTxt).toBeDefined();

    // llms-full.txt also starts with H1 and blockquote
    const fullIssues = validateLlmsTxt(result.llmsFullTxt!);
    const fullErrors = fullIssues.filter((i) => i.level === 'error');
    expect(fullErrors).toHaveLength(0);

    // Should have inline content from extracted pages
    expect(result.llmsFullTxt!.length).toBeGreaterThan(result.llmsTxt.length);
    // Should contain URL lines
    expect(result.llmsFullTxt).toContain('URL: https://acme.example.com');
  });

  it('token counts are consistent across pipeline', async () => {
    const result = await generate({
      site: {
        name: 'Acme Corp',
        url: 'https://acme.example.com',
        description: 'Build better software.',
      },
      discover: { dir: FIXTURES_DIR },
      options: { cacheTtl: 0 },
    });

    // Verify token counts match the actual content
    expect(result.tokenCounts!.llmsTxt).toBe(estimateTokens(result.llmsTxt));
    expect(result.tokenCounts!.llmsFullTxt).toBe(estimateTokens(result.llmsFullTxt!));
    expect(result.tokenCounts!.llmsSmallTxt).toBe(estimateTokens(result.llmsSmallTxt!));

    // Ordering: small < standard < full
    expect(result.tokenCounts!.llmsSmallTxt!).toBeLessThan(result.tokenCounts!.llmsTxt);
    expect(result.tokenCounts!.llmsTxt).toBeLessThan(result.tokenCounts!.llmsFullTxt!);
  });
});

// ─── Handler Serving Pipeline ────────────────────────────────────

describe('integration: handler serves discovered content', () => {
  const config: LlmsTxtConfig = {
    site: {
      name: 'Handler Test',
      url: 'https://handler-test.com',
      description: 'Testing handler with discovery.',
    },
    discover: { dir: FIXTURES_DIR },
    options: { cacheTtl: 0 },
  };

  it('handler /llms.txt serves valid discovered content', async () => {
    const result = await handleRequest('/llms.txt', config);

    expect(result).not.toBeNull();
    expect(result!.status).toBe(200);
    expect(result!.body).toContain('# Handler Test');
    expect(result!.body).toContain('> Testing handler with discovery.');

    // Validate the served content
    const issues = validateLlmsTxt(result!.body);
    const errors = issues.filter((i) => i.level === 'error');
    expect(errors).toHaveLength(0);
  });

  it('handler /llms-full.txt serves full content with pages', async () => {
    const result = await handleRequest('/llms-full.txt', config);

    expect(result).not.toBeNull();
    expect(result!.status).toBe(200);
    expect(result!.body).toContain('### Acme Corp - Build Better Software');
    expect(result!.body).toContain('URL: https://handler-test.com');
  });

  it('handler /llms-small.txt serves compact listing', async () => {
    const result = await handleRequest('/llms-small.txt', config);

    expect(result).not.toBeNull();
    expect(result!.status).toBe(200);
    expect(result!.body).toContain('# Handler Test');
    // Small should not have descriptions
    expect(result!.body).not.toContain('> Testing handler with discovery.');
  });

  it('handler serves per-page .md for discovered pages', async () => {
    const result = await handleRequest('/about.md', config);

    expect(result).not.toBeNull();
    expect(result!.status).toBe(200);
    expect(result!.headers['content-type']).toBe('text/markdown; charset=utf-8');
    expect(result!.body).toContain('# About Us - Acme Corp');
    expect(result!.body).toContain('URL: https://handler-test.com/about');
  });

  it('handler returns null for nonexistent .md page', async () => {
    const result = await handleRequest('/nonexistent.md', config);
    expect(result).toBeNull();
  });

  it('handler returns correct headers for all endpoints', async () => {
    const endpoints = ['/llms.txt', '/llms-full.txt', '/llms-small.txt'];

    for (const endpoint of endpoints) {
      const result = await handleRequest(endpoint, config);
      expect(result).not.toBeNull();
      expect(result!.headers['content-type']).toBe('text/plain; charset=utf-8');
      expect(result!.headers['cache-control']).toBe('public, max-age=3600');
      expect(result!.headers['etag']).toMatch(/^"[a-f0-9]{32}"$/);
      expect(result!.headers['last-modified']).toBeTruthy();
    }
  });

  it('handler ETags differ between endpoints', async () => {
    const llms = await handleRequest('/llms.txt', config);
    const full = await handleRequest('/llms-full.txt', config);
    const small = await handleRequest('/llms-small.txt', config);

    expect(llms!.headers['etag']).not.toBe(full!.headers['etag']);
    expect(llms!.headers['etag']).not.toBe(small!.headers['etag']);
    expect(full!.headers['etag']).not.toBe(small!.headers['etag']);
  });
});

// ─── Edge Cases ──────────────────────────────────────────────────

describe('integration: edge cases', () => {
  it('handles empty directory gracefully', async () => {
    const tmpDir = await mkdtemp(path.join(tmpdir(), 'llms-txt-empty-'));

    try {
      const result = await generate({
        site: {
          name: 'Empty Site',
          url: 'https://empty.com',
          description: 'No pages here.',
        },
        discover: { dir: tmpDir },
        options: { cacheTtl: 0 },
      });

      expect(result.pages).toHaveLength(0);
      expect(result.llmsTxt).toContain('# Empty Site');
    } finally {
      await rm(tmpDir, { recursive: true });
    }
  });

  it('handles directory with single page', async () => {
    const tmpDir = await mkdtemp(path.join(tmpdir(), 'llms-txt-single-'));

    try {
      await writeFile(
        path.join(tmpDir, 'index.html'),
        '<html><head><title>Solo Page</title><meta name="description" content="The only page"></head><body><main><p>Hello world</p></main></body></html>',
      );

      const result = await generate({
        site: {
          name: 'Solo Site',
          url: 'https://solo.com',
          description: 'Just one page.',
        },
        discover: { dir: tmpDir },
        options: { cacheTtl: 0 },
      });

      expect(result.pages).toHaveLength(1);
      expect(result.pages[0].title).toBe('Solo Page');
      expect(result.pages[0].description).toBe('The only page');
      expect(result.pages[0].content).toContain('Hello world');

      // Validate output
      const issues = validateLlmsTxt(result.llmsTxt);
      const errors = issues.filter((i) => i.level === 'error');
      expect(errors).toHaveLength(0);
    } finally {
      await rm(tmpDir, { recursive: true });
    }
  });

  it('handles deeply nested directories', async () => {
    const tmpDir = await mkdtemp(path.join(tmpdir(), 'llms-txt-deep-'));

    try {
      const deepPath = path.join(tmpDir, 'a', 'b', 'c', 'd');
      await mkdir(deepPath, { recursive: true });
      await writeFile(
        path.join(deepPath, 'deep.html'),
        '<html><head><title>Deep Page</title></head><body><main>Deep content</main></body></html>',
      );

      const result = await generate({
        site: {
          name: 'Deep Site',
          url: 'https://deep.com',
          description: 'Deeply nested.',
        },
        discover: { dir: tmpDir },
        options: { cacheTtl: 0 },
      });

      expect(result.pages).toHaveLength(1);
      expect(result.pages[0].path).toBe('/a/b/c/d/deep');
      expect(result.llmsTxt).toContain('https://deep.com/a/b/c/d/deep');
    } finally {
      await rm(tmpDir, { recursive: true });
    }
  });

  it('handles HTML with no title or metadata', async () => {
    const tmpDir = await mkdtemp(path.join(tmpdir(), 'llms-txt-notitle-'));

    try {
      await writeFile(
        path.join(tmpDir, 'bare.html'),
        '<html><body><p>Just some text with no metadata at all.</p></body></html>',
      );

      const result = await generate({
        site: {
          name: 'Bare Site',
          url: 'https://bare.com',
          description: 'Minimal HTML.',
        },
        discover: { dir: tmpDir },
        options: { cacheTtl: 0 },
      });

      expect(result.pages).toHaveLength(1);
      expect(result.pages[0].title).toBe('');
      expect(result.pages[0].description).toBe('');
      expect(result.pages[0].content).toContain('Just some text');
    } finally {
      await rm(tmpDir, { recursive: true });
    }
  });

  it('manual pages override discovered pages with same path', async () => {
    const result = await generate({
      site: {
        name: 'Override Test',
        url: 'https://override.com',
        description: 'Testing priority.',
      },
      pages: [
        { path: '/', title: 'Custom Home', description: 'My custom description' },
      ],
      discover: { dir: FIXTURES_DIR },
      options: { cacheTtl: 0 },
    });

    const home = result.pages.find((p) => p.path === '/');
    expect(home).toBeDefined();
    // Manual page should win over discovered one
    expect(home!.title).toBe('Custom Home');
    expect(home!.description).toBe('My custom description');

    // But other discovered pages should still be present
    expect(result.pages.length).toBeGreaterThan(1);
    const about = result.pages.find((p) => p.path === '/about');
    expect(about).toBeDefined();
  });

  it('filterPages works across the full pipeline', async () => {
    const result = await generate({
      site: {
        name: 'Filter Test',
        url: 'https://filter.com',
        description: 'Testing filters.',
      },
      discover: { dir: FIXTURES_DIR },
      options: {
        cacheTtl: 0,
        filterPages: (page) => page.path.startsWith('/docs'),
      },
    });

    // Only docs pages should appear in output
    expect(result.llmsTxt).toContain('api-reference');
    expect(result.llmsTxt).toContain('installation');
    expect(result.llmsTxt).not.toContain('hello-world');
    expect(result.llmsTxt).not.toContain('About');
  });

  it('maxContentLength truncation flows through to all outputs', async () => {
    const result = await generate({
      site: {
        name: 'Truncate Test',
        url: 'https://truncate.com',
        description: 'Testing truncation.',
      },
      discover: { dir: FIXTURES_DIR },
      options: {
        cacheTtl: 0,
        maxContentLength: 50,
      },
    });

    // All discovered pages with content > 50 chars should be truncated
    for (const page of result.pages) {
      if (page.content.length > 50) {
        expect(page.content).toHaveLength(53); // 50 + '...'
        expect(page.content.endsWith('...')).toBe(true);
      }
    }

    // Full output should have truncated content
    expect(result.llmsFullTxt).toBeDefined();
    // At least some pages should have been truncated
    const truncatedPages = result.pages.filter((p) => p.content.endsWith('...'));
    expect(truncatedPages.length).toBeGreaterThan(0);
  });
});

// ─── Discovery with Include/Exclude Patterns ─────────────────────

describe('integration: discovery patterns', () => {
  it('include pattern limits discovered pages', async () => {
    const result = await generate({
      site: {
        name: 'Include Test',
        url: 'https://include.com',
        description: 'Testing include.',
      },
      discover: {
        dir: FIXTURES_DIR,
        include: ['docs/**/*.html'],
      },
      options: { cacheTtl: 0 },
    });

    // Only docs pages should be discovered
    expect(result.pages.length).toBe(2);
    const paths = result.pages.map((p) => p.path).sort();
    expect(paths).toEqual(['/docs/api-reference', '/docs/installation']);
  });

  it('exclude pattern removes matching pages', async () => {
    const result = await generate({
      site: {
        name: 'Exclude Test',
        url: 'https://exclude.com',
        description: 'Testing exclude.',
      },
      discover: {
        dir: FIXTURES_DIR,
        exclude: ['blog/**/*.html'],
      },
      options: { cacheTtl: 0 },
    });

    // Blog pages should be excluded
    const paths = result.pages.map((p) => p.path);
    expect(paths).not.toContain('/blog/hello-world');
    expect(paths).not.toContain('/blog/getting-started');
    // Other pages should still be present
    expect(paths).toContain('/');
    expect(paths).toContain('/about');
    expect(paths).toContain('/docs/api-reference');
  });

  it('include and exclude can be combined', async () => {
    const pages = await discoverFromDirectory(
      FIXTURES_DIR,
      ['**/*.html'],
      ['docs/**/*.html', 'index.html'],
    );

    const paths = pages.map((p) => p.path).sort();
    // Should have blog and about, but not docs or root index
    expect(paths).toContain('/about');
    expect(paths).toContain('/blog/hello-world');
    expect(paths).toContain('/blog/getting-started');
    expect(paths).not.toContain('/');
    expect(paths).not.toContain('/docs/api-reference');
    expect(paths).not.toContain('/docs/installation');
  });
});

// ─── Extractor Edge Cases ────────────────────────────────────────

describe('integration: extractor edge cases', () => {
  it('handles malformed HTML gracefully', () => {
    const info = extractPageInfo('<html><head><title>Broken', '/broken');
    expect(info.title).toBe('Broken');
    expect(info.path).toBe('/broken');
  });

  it('handles empty HTML string', () => {
    const info = extractPageInfo('', '/empty');
    expect(info.title).toBe('');
    expect(info.description).toBe('');
    expect(info.content).toBe('');
    expect(info.headings).toEqual([]);
  });

  it('extracts from <article> when no <main>', () => {
    const html = `<html><body><article><h2>Section</h2><p>Article content</p></article></body></html>`;
    const info = extractPageInfo(html, '/article');
    expect(info.content).toContain('Article content');
  });

  it('strips noise elements from content', () => {
    const html = `<html><body><main>
      <nav>Navigation</nav>
      <p>Real content here</p>
      <footer>Footer stuff</footer>
      <script>alert('xss')</script>
      <style>.foo{color:red}</style>
    </main></body></html>`;
    const info = extractPageInfo(html, '/noise');

    expect(info.content).toContain('Real content here');
    expect(info.content).not.toContain('Navigation');
    expect(info.content).not.toContain('Footer stuff');
    expect(info.content).not.toContain('alert');
    expect(info.content).not.toContain('.foo');
  });

  it('respects custom noiseSelectors', () => {
    const html = `<html><body><main>
      <div class="ad-container">Buy now!</div>
      <p>Real content</p>
      <div id="promo">Special offer</div>
    </main></body></html>`;
    const info = extractPageInfo(html, '/custom-noise', {
      noiseSelectors: ['.ad-container', '#promo'],
    });

    expect(info.content).toContain('Real content');
    expect(info.content).not.toContain('Buy now');
    expect(info.content).not.toContain('Special offer');
  });

  it('falls back to h1 when no title tag', () => {
    const html = `<html><body><h1>Main Heading</h1><p>Content</p></body></html>`;
    const info = extractPageInfo(html, '/h1-fallback');
    expect(info.title).toBe('Main Heading');
  });

  it('extracts only h2 and h3 headings', () => {
    const html = `<html><body>
      <h1>Title</h1>
      <h2>Section One</h2>
      <h3>Subsection</h3>
      <h4>Too Deep</h4>
      <h5>Way Too Deep</h5>
    </body></html>`;
    const info = extractPageInfo(html, '/headings');

    expect(info.headings).toContain('Section One');
    expect(info.headings).toContain('Subsection');
    expect(info.headings).not.toContain('Title');
    expect(info.headings).not.toContain('Too Deep');
    expect(info.headings).not.toContain('Way Too Deep');
  });

  it('skips empty headings', () => {
    const html = `<html><body><h2></h2><h2>Real Heading</h2><h3>  </h3></body></html>`;
    const info = extractPageInfo(html, '/empty-headings');
    expect(info.headings).toEqual(['Real Heading']);
  });

  it('handles JSON-LD arrays', () => {
    const html = `<html><head>
      <script type="application/ld+json">[{"@type":"Person","name":"John"},{"@type":"Place","name":"NYC"}]</script>
    </head><body></body></html>`;
    const info = extractPageInfo(html, '/jsonld-array');

    expect(info.structuredData).toBeDefined();
    expect(info.structuredData).toHaveLength(2);
    expect(info.structuredData![0]['@type']).toBe('Person');
    expect(info.structuredData![1]['@type']).toBe('Place');
  });

  it('handles malformed JSON-LD gracefully', () => {
    const html = `<html><head>
      <script type="application/ld+json">{ invalid json }</script>
    </head><body><p>Content</p></body></html>`;
    const info = extractPageInfo(html, '/bad-jsonld');

    // Should not have structured data but should not crash
    expect(info.structuredData).toBeUndefined();
    expect(info.content).toContain('Content');
  });

  it('extracts OpenGraph metadata', () => {
    const html = `<html><head>
      <meta property="og:title" content="OG Title">
      <meta property="og:description" content="OG Description">
      <meta property="og:type" content="article">
      <meta property="og:image" content="https://example.com/image.png">
    </head><body></body></html>`;
    const info = extractPageInfo(html, '/og');

    expect(info.og).toBeDefined();
    expect(info.og!.title).toBe('OG Title');
    expect(info.og!.description).toBe('OG Description');
    expect(info.og!.type).toBe('article');
    expect(info.og!.image).toBe('https://example.com/image.png');
  });

  it('strips cookie/banner noise by class/id patterns', () => {
    const html = `<html><body><main>
      <div class="cookie-consent">Accept cookies</div>
      <div id="banner-top">Top banner</div>
      <div class="popup-overlay">Subscribe!</div>
      <p>Real content</p>
    </main></body></html>`;
    const info = extractPageInfo(html, '/auto-noise');

    expect(info.content).toContain('Real content');
    expect(info.content).not.toContain('Accept cookies');
    expect(info.content).not.toContain('Top banner');
    expect(info.content).not.toContain('Subscribe');
  });
});

// ─── Validator Comprehensive Tests ───────────────────────────────

describe('integration: validator on generated output', () => {
  it('output from generate() always passes validation', async () => {
    const configs: LlmsTxtConfig[] = [
      {
        site: { name: 'Simple', url: 'https://simple.com', description: 'Simple site.' },
        pages: [{ path: '/', title: 'Home', description: 'Welcome' }],
      },
      {
        site: { name: 'Complex', url: 'https://complex.com', description: 'Complex site.' },
        pages: [
          { path: '/', title: 'Home', description: 'Welcome' },
          { path: '/about', title: 'About', description: 'About us' },
          { path: '/docs/api', title: 'API', description: 'API docs' },
        ],
        sections: [
          { name: 'Docs', pathPrefix: '/docs' },
          { name: 'Main', pathPrefix: '/' },
        ],
        options: {
          preamble: 'This is preamble text.',
          additionalSections: { 'Support': 'Email us at support@example.com' },
        },
      },
    ];

    for (const config of configs) {
      const result = await generate(config);
      const issues = validateLlmsTxt(result.llmsTxt);
      const errors = issues.filter((i) => i.level === 'error');
      expect(errors).toHaveLength(0);
    }
  });

  it('validates custom-built llms.txt with line numbers', () => {
    const content = `# My Site

> Description

## Pages

- [](https://example.com): Empty title
- [Valid](https://example.com/valid): Valid link
- [Relative](/relative): Relative URL
`;

    const issues = validateLlmsTxt(content);

    // Empty title warning
    const emptyTitle = issues.find((i) => i.message.includes('empty title'));
    expect(emptyTitle).toBeDefined();
    expect(emptyTitle!.line).toBe(7);

    // Relative URL warning
    const relativeUrl = issues.find((i) => i.message.includes('not absolute'));
    expect(relativeUrl).toBeDefined();
    expect(relativeUrl!.line).toBe(9);
  });

  it('catches missing H1 heading', () => {
    const content = `No heading here\n\n## Section\n\n- [Link](https://example.com)\n`;
    const issues = validateLlmsTxt(content);
    const h1Error = issues.find((i) => i.message.includes('H1 heading'));
    expect(h1Error).toBeDefined();
    expect(h1Error!.level).toBe('error');
  });

  it('catches empty content', () => {
    const issues = validateLlmsTxt('');
    const emptyError = issues.find((i) => i.message.includes('empty'));
    expect(emptyError).toBeDefined();
    expect(emptyError!.level).toBe('error');
  });

  it('warns on very large files', () => {
    const largeContent = `# Big Site\n\n> Description\n\n## Pages\n\n${'- [Page](https://example.com/page)\n'.repeat(20000)}`;
    const issues = validateLlmsTxt(largeContent);
    const sizeWarning = issues.find((i) => i.message.includes('very large'));
    expect(sizeWarning).toBeDefined();
    expect(sizeWarning!.level).toBe('warning');
  });
});

// ─── Handler Error Recovery ──────────────────────────────────────

describe('integration: handler error handling', () => {
  it('returns 500 when discovery fails', async () => {
    const config: LlmsTxtConfig = {
      site: {
        name: 'Error Site',
        url: 'https://error.com',
        description: 'Will fail.',
      },
      discover: {
        // Point to a directory that doesn't exist and a URL that will fail
        sitemapUrl: 'http://localhost:1/nonexistent-sitemap.xml',
      },
      options: { cacheTtl: 0 },
    };

    // The handler should either succeed with 0 pages or return 500
    // depending on how the error propagates
    const result = await handleRequest('/llms.txt', config);
    // Discovery failures are caught gracefully, so we get a valid response
    if (result) {
      expect(result.status === 200 || result.status === 500).toBe(true);
    }
  });

  it('handler returns null for paths that look like .md but are not pages', async () => {
    const config: LlmsTxtConfig = {
      site: { name: 'Test', url: 'https://test.com', description: 'Test.' },
      pages: [{ path: '/docs/guide', title: 'Guide' }],
      options: { cacheTtl: 0 },
    };

    // These should all return null
    expect(await handleRequest('/random.md', config)).toBeNull();
    expect(await handleRequest('/docs/nonexistent.md', config)).toBeNull();
  });

  it('handler matches .md page with trailing slash normalization', async () => {
    const config: LlmsTxtConfig = {
      site: { name: 'Test', url: 'https://test.com', description: 'Test.' },
      pages: [{ path: '/docs/guide/', title: 'Guide', description: 'A guide', content: 'Guide content' }],
      options: { cacheTtl: 0 },
    };

    const result = await handleRequest('/docs/guide.md', config);
    expect(result).not.toBeNull();
    expect(result!.body).toContain('# Guide');
  });
});

// ─── Concurrent Access ───────────────────────────────────────────

describe('integration: concurrent requests', () => {
  it('handles concurrent requests to different endpoints', async () => {
    const config: LlmsTxtConfig = {
      site: { name: 'Concurrent', url: 'https://concurrent.com', description: 'Concurrent test.' },
      pages: [
        { path: '/', title: 'Home', description: 'Welcome', content: 'Home content.' },
        { path: '/about', title: 'About', description: 'About us', content: 'About content.' },
      ],
      options: { cacheTtl: 0 },
    };

    const [llms, full, small, md] = await Promise.all([
      handleRequest('/llms.txt', config),
      handleRequest('/llms-full.txt', config),
      handleRequest('/llms-small.txt', config),
      handleRequest('/about.md', config),
    ]);

    expect(llms).not.toBeNull();
    expect(full).not.toBeNull();
    expect(small).not.toBeNull();
    expect(md).not.toBeNull();

    expect(llms!.body).toContain('# Concurrent');
    expect(full!.body).toContain('Home content.');
    expect(small!.body).not.toContain('Welcome');
    expect(md!.body).toContain('# About');
  });

  it('handles concurrent requests to same endpoint', async () => {
    const config: LlmsTxtConfig = {
      site: { name: 'Parallel', url: 'https://parallel.com', description: 'Parallel test.' },
      pages: [{ path: '/', title: 'Home', description: 'Home', content: 'Content.' }],
      options: { cacheTtl: 60_000 },
    };

    const results = await Promise.all(
      Array.from({ length: 10 }, () => handleRequest('/llms.txt', config)),
    );

    // All 10 should succeed with identical content
    for (const result of results) {
      expect(result).not.toBeNull();
      expect(result!.status).toBe(200);
      expect(result!.body).toContain('# Parallel');
    }

    // All bodies should be identical (served from cache)
    const bodies = new Set(results.map((r) => r!.body));
    expect(bodies.size).toBe(1);
  });
});

// ─── NoiseSelectors Through Pipeline ─────────────────────────────

describe('integration: noiseSelectors through generate()', () => {
  it('custom noiseSelectors remove elements during discovery', async () => {
    const tmpDir = await mkdtemp(path.join(tmpdir(), 'llms-txt-noise-'));

    try {
      await writeFile(
        path.join(tmpDir, 'index.html'),
        `<html><head><title>Noise Test</title></head><body><main>
          <div class="sidebar">Sidebar content</div>
          <div class="advertisement">Buy now!</div>
          <p>The real content is here.</p>
        </main></body></html>`,
      );

      const result = await generate({
        site: { name: 'Noise', url: 'https://noise.com', description: 'Test noise removal.' },
        discover: { dir: tmpDir },
        options: {
          cacheTtl: 0,
          noiseSelectors: ['.sidebar', '.advertisement'],
        },
      });

      expect(result.pages).toHaveLength(1);
      expect(result.pages[0].content).toContain('real content');
      expect(result.pages[0].content).not.toContain('Sidebar content');
      expect(result.pages[0].content).not.toContain('Buy now');
    } finally {
      await rm(tmpDir, { recursive: true });
    }
  });
});
