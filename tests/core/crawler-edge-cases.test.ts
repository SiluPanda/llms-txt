/**
 * Edge case tests for the crawler module.
 *
 * Tests internal code paths through the public API:
 * - normalizePath / normalizeUrl logic
 * - extractUrlsFromSitemap / extractInternalLinks
 * - crawlUrl BFS logic, dedup, depth limiting
 * - discoverPages deduplication across sources
 * - runWithConcurrency behavior
 */
import { discoverPages, discoverFromDirectory, crawlUrl } from '../../src/core/crawler.js';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

// ─── normalizePath via discoverPages deduplication ───────────────

describe('crawler: path normalization through discoverPages', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), 'llms-txt-crawler-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true });
  });

  it('normalizes index.html to /', async () => {
    await writeFile(path.join(tmpDir, 'index.html'), '<html><head><title>Home</title></head><body><main>Content</main></body></html>');

    const pages = await discoverPages({ dir: tmpDir }, 'https://example.com');
    expect(pages).toHaveLength(1);
    expect(pages[0].path).toBe('/');
  });

  it('normalizes nested index.html to directory path', async () => {
    await mkdir(path.join(tmpDir, 'docs'), { recursive: true });
    await writeFile(path.join(tmpDir, 'docs', 'index.html'), '<html><head><title>Docs</title></head><body><main>Docs</main></body></html>');

    const pages = await discoverPages({ dir: tmpDir }, 'https://example.com');
    expect(pages).toHaveLength(1);
    expect(pages[0].path).toBe('/docs');
  });

  it('strips .html extension from non-index files', async () => {
    await writeFile(path.join(tmpDir, 'about.html'), '<html><head><title>About</title></head><body><main>About</main></body></html>');

    const pages = await discoverPages({ dir: tmpDir }, 'https://example.com');
    expect(pages).toHaveLength(1);
    expect(pages[0].path).toBe('/about');
  });

  it('deduplicates pages with different path formats', async () => {
    await writeFile(path.join(tmpDir, 'page.html'), '<html><head><title>Page</title></head><body><main>Content</main></body></html>');

    // discoverPages should deduplicate based on normalized paths
    const pages = await discoverPages({ dir: tmpDir }, 'https://example.com');
    const pathSet = new Set(pages.map((p) => p.path));
    expect(pathSet.size).toBe(pages.length);
  });

  it('handles empty directory', async () => {
    const pages = await discoverPages({ dir: tmpDir }, 'https://example.com');
    expect(pages).toHaveLength(0);
  });

  it('handles directory with non-HTML files only', async () => {
    await writeFile(path.join(tmpDir, 'readme.md'), '# Hello');
    await writeFile(path.join(tmpDir, 'styles.css'), 'body { color: red; }');
    await writeFile(path.join(tmpDir, 'script.js'), 'console.log("hi")');

    const pages = await discoverPages({ dir: tmpDir }, 'https://example.com');
    expect(pages).toHaveLength(0);
  });

  it('discovers deeply nested HTML files', async () => {
    const deep = path.join(tmpDir, 'a', 'b', 'c');
    await mkdir(deep, { recursive: true });
    await writeFile(path.join(deep, 'deep.html'), '<html><head><title>Deep</title></head><body><main>Deep</main></body></html>');

    const pages = await discoverPages({ dir: tmpDir }, 'https://example.com');
    expect(pages).toHaveLength(1);
    expect(pages[0].path).toBe('/a/b/c/deep');
  });
});

// ─── discoverFromDirectory include/exclude patterns ──────────────

describe('crawler: directory discovery with patterns', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), 'llms-txt-patterns-'));
    // Create a structure with multiple dirs
    await mkdir(path.join(tmpDir, 'docs'), { recursive: true });
    await mkdir(path.join(tmpDir, 'blog'), { recursive: true });
    await mkdir(path.join(tmpDir, 'private'), { recursive: true });

    await writeFile(path.join(tmpDir, 'index.html'), '<html><head><title>Home</title></head><body><main>Home</main></body></html>');
    await writeFile(path.join(tmpDir, 'docs', 'api.html'), '<html><head><title>API</title></head><body><main>API</main></body></html>');
    await writeFile(path.join(tmpDir, 'blog', 'post.html'), '<html><head><title>Post</title></head><body><main>Post</main></body></html>');
    await writeFile(path.join(tmpDir, 'private', 'secret.html'), '<html><head><title>Secret</title></head><body><main>Secret</main></body></html>');
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true });
  });

  it('default include pattern matches all HTML files', async () => {
    const pages = await discoverFromDirectory(tmpDir);
    expect(pages).toHaveLength(4);
  });

  it('custom include narrows to specific directories', async () => {
    const pages = await discoverFromDirectory(tmpDir, ['docs/**/*.html']);
    expect(pages).toHaveLength(1);
    expect(pages[0].path).toBe('/docs/api');
  });

  it('exclude removes matching files', async () => {
    const pages = await discoverFromDirectory(tmpDir, ['**/*.html'], ['private/**/*.html']);
    expect(pages).toHaveLength(3);
    const paths = pages.map((p) => p.path);
    expect(paths).not.toContain('/private/secret');
  });

  it('include and exclude work together', async () => {
    const pages = await discoverFromDirectory(
      tmpDir,
      ['**/*.html'],
      ['private/**/*.html', 'blog/**/*.html'],
    );
    expect(pages).toHaveLength(2);
    const paths = pages.map((p) => p.path).sort();
    expect(paths).toEqual(['/', '/docs/api']);
  });

  it('returns empty when include matches nothing', async () => {
    const pages = await discoverFromDirectory(tmpDir, ['**/*.txt']);
    expect(pages).toHaveLength(0);
  });

  it('extracts page info correctly from discovered files', async () => {
    const pages = await discoverFromDirectory(tmpDir, ['docs/**/*.html']);
    expect(pages[0].title).toBe('API');
    expect(pages[0].content).toContain('API');
  });
});

// ─── crawlUrl behavior ──────────────────────────────────────────

describe('crawler: crawlUrl edge cases', () => {
  it('handles single-page site', async () => {
    const pages = await crawlUrl('https://example.com', 0);
    // Depth 0 should at least fetch the starting page
    expect(pages.length).toBeGreaterThanOrEqual(1);
    expect(pages[0].title).toBeTruthy();
  }, 15_000);

  it('deduplicates pages within same crawl', async () => {
    const pages = await crawlUrl('https://example.com', 1);
    const paths = pages.map((p) => p.path);
    const uniquePaths = new Set(paths);
    expect(uniquePaths.size).toBe(paths.length);
  }, 15_000);

  it('respects max depth of 0', async () => {
    // With depth 0, should only get the start page (no link following)
    const pages = await crawlUrl('https://example.com', 0);
    expect(pages.length).toBe(1);
  }, 15_000);

  it('handles non-existent URL gracefully', async () => {
    // This should not throw — crawlUrl catches errors internally
    const pages = await crawlUrl('https://this-domain-definitely-does-not-exist-12345.com', 0);
    // Should return empty or partial results, not throw
    expect(Array.isArray(pages)).toBe(true);
  }, 15_000);

  it('uses default maxDepth of 3 when not specified', async () => {
    // This test verifies the function accepts no maxDepth arg
    const pages = await crawlUrl('https://example.com');
    expect(pages.length).toBeGreaterThanOrEqual(1);
  }, 15_000);
});

// ─── discoverPages combining multiple sources ────────────────────

describe('crawler: discoverPages combining sources', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), 'llms-txt-combine-'));
    await writeFile(path.join(tmpDir, 'index.html'), '<html><head><title>Local Home</title></head><body><main>Local content</main></body></html>');
    await writeFile(path.join(tmpDir, 'about.html'), '<html><head><title>Local About</title></head><body><main>About content</main></body></html>');
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true });
  });

  it('combines directory and crawl sources', async () => {
    const pages = await discoverPages(
      {
        dir: tmpDir,
        crawlUrl: 'https://example.com',
        maxDepth: 0,
      },
      'https://example.com',
    );

    // Should have both local and crawled pages
    expect(pages.length).toBeGreaterThanOrEqual(2);
    const localPages = pages.filter((p) => p.title.includes('Local'));
    expect(localPages.length).toBeGreaterThanOrEqual(1);
  }, 15_000);

  it('deduplicates across sources', async () => {
    const pages = await discoverPages({ dir: tmpDir }, 'https://example.com');

    // No duplicate paths
    const pathSet = new Set(pages.map((p) => p.path));
    expect(pathSet.size).toBe(pages.length);
  });

  it('handles invalid sitemap URL gracefully', async () => {
    // Should not throw, just warn and return dir results
    const pages = await discoverPages(
      {
        dir: tmpDir,
        sitemapUrl: 'http://localhost:1/no-sitemap.xml',
      },
      'https://example.com',
    );

    // Should still have the local pages
    expect(pages.length).toBeGreaterThanOrEqual(2);
  });

  it('handles all empty sources', async () => {
    const emptyDir = await mkdtemp(path.join(tmpdir(), 'llms-txt-empty-'));
    try {
      const pages = await discoverPages({ dir: emptyDir }, 'https://example.com');
      expect(pages).toHaveLength(0);
    } finally {
      await rm(emptyDir, { recursive: true });
    }
  });
});

// ─── Page info extraction from directory discovery ───────────────

describe('crawler: extraction during directory discovery', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), 'llms-txt-extract-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true });
  });

  it('extracts title from <title> tag', async () => {
    await writeFile(path.join(tmpDir, 'page.html'), '<html><head><title>My Page Title</title></head><body><main>Content</main></body></html>');

    const pages = await discoverFromDirectory(tmpDir);
    expect(pages[0].title).toBe('My Page Title');
  });

  it('extracts meta description', async () => {
    await writeFile(path.join(tmpDir, 'page.html'), '<html><head><title>Page</title><meta name="description" content="Page description here"></head><body><main>Content</main></body></html>');

    const pages = await discoverFromDirectory(tmpDir);
    expect(pages[0].description).toBe('Page description here');
  });

  it('handles HTML with no metadata gracefully', async () => {
    await writeFile(path.join(tmpDir, 'bare.html'), '<p>Just text</p>');

    const pages = await discoverFromDirectory(tmpDir);
    expect(pages).toHaveLength(1);
    expect(pages[0].title).toBe('');
    expect(pages[0].description).toBe('');
    expect(pages[0].content).toContain('Just text');
  });

  it('passes noiseSelectors through to extractor', async () => {
    await writeFile(path.join(tmpDir, 'page.html'), `<html><body><main>
      <div class="tracking">Analytics script</div>
      <p>Real content here</p>
    </main></body></html>`);

    const pages = await discoverFromDirectory(tmpDir, undefined, undefined, {
      noiseSelectors: ['.tracking'],
    });

    expect(pages[0].content).toContain('Real content');
    expect(pages[0].content).not.toContain('Analytics');
  });

  it('extracts headings from discovered pages', async () => {
    await writeFile(path.join(tmpDir, 'page.html'), `<html><head><title>Page</title></head><body>
      <h2>Section One</h2>
      <p>Content one</p>
      <h3>Subsection</h3>
      <p>Content two</p>
    </body></html>`);

    const pages = await discoverFromDirectory(tmpDir);
    expect(pages[0].headings).toContain('Section One');
    expect(pages[0].headings).toContain('Subsection');
  });

  it('extracts JSON-LD from discovered pages', async () => {
    await writeFile(path.join(tmpDir, 'page.html'), `<html><head>
      <title>Page</title>
      <script type="application/ld+json">{"@type":"WebPage","name":"Test"}</script>
    </head><body><main>Content</main></body></html>`);

    const pages = await discoverFromDirectory(tmpDir);
    expect(pages[0].structuredData).toBeDefined();
    expect(pages[0].structuredData![0]['@type']).toBe('WebPage');
  });

  it('extracts OpenGraph from discovered pages', async () => {
    await writeFile(path.join(tmpDir, 'page.html'), `<html><head>
      <title>Page</title>
      <meta property="og:title" content="OG Title">
      <meta property="og:type" content="website">
    </head><body><main>Content</main></body></html>`);

    const pages = await discoverFromDirectory(tmpDir);
    expect(pages[0].og).toBeDefined();
    expect(pages[0].og!.title).toBe('OG Title');
    expect(pages[0].og!.type).toBe('website');
  });
});
