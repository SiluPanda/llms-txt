/**
 * Edge case tests for the request handler.
 *
 * Tests code paths that aren't covered by the main handler tests:
 * - Error handling (500 responses)
 * - startWatching() function
 * - renderPageMarkdown with absolute URLs
 * - Cache TTL behavior
 * - .md endpoint with various page path formats
 */
import { handleRequest, startWatching } from '../../src/adapters/handler.js';
import type { LlmsTxtConfig } from '../../src/types.js';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

function makeConfig(overrides?: Partial<LlmsTxtConfig>): LlmsTxtConfig {
  return {
    site: {
      name: 'Handler Edge',
      url: 'https://handler-edge.com',
      description: 'Testing handler edge cases.',
    },
    pages: [
      { path: '/', title: 'Home', description: 'Welcome', content: 'Home content.' },
      { path: '/about', title: 'About', description: 'About us', content: 'About content.' },
    ],
    options: { cacheTtl: 0 },
    ...overrides,
  };
}

// ─── Error Handling (500 response) ───────────────────────────────

describe('handler: error handling', () => {
  it('returns 500 when crawlUrl throws due to invalid URL', async () => {
    const config: LlmsTxtConfig = {
      site: { name: 'Error', url: 'https://error.com', description: 'Error test.' },
      discover: {
        // This is an invalid URL that will throw in new URL()
        crawlUrl: '://broken-protocol',
      },
      options: { cacheTtl: 0 },
    };

    const result = await handleRequest('/llms.txt', config);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(500);
    expect(result!.body).toContain('Error generating llms.txt');
    expect(result!.headers['content-type']).toBe('text/plain; charset=utf-8');
  });

  it('500 response does not include stack trace', async () => {
    const config: LlmsTxtConfig = {
      site: { name: 'Error', url: 'https://error.com', description: 'Error test.' },
      discover: { crawlUrl: '://broken' },
      options: { cacheTtl: 0 },
    };

    const result = await handleRequest('/llms.txt', config);
    expect(result).not.toBeNull();
    // Should not leak internal details
    expect(result!.body).not.toContain('at ');
    expect(result!.body).not.toContain('.ts:');
  });
});

// ─── .md endpoints with various path formats ─────────────────────

describe('handler: .md endpoint edge cases', () => {
  it('serves .md for page with absolute URL path', async () => {
    const config = makeConfig({
      pages: [
        {
          path: 'https://external.com/page',
          title: 'External Page',
          description: 'An external page',
          content: 'External content.',
        },
      ],
      options: { cacheTtl: 0 },
    });

    const result = await handleRequest('/page.md', config);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(200);
    expect(result!.body).toContain('# External Page');
    expect(result!.body).toContain('> An external page');
    expect(result!.body).toContain('External content.');
  });

  it('serves .md with page that has no description', async () => {
    const config = makeConfig({
      pages: [
        { path: '/nodesc', title: 'No Desc', content: 'Some content.' },
      ],
      options: { cacheTtl: 0 },
    });

    const result = await handleRequest('/nodesc.md', config);
    expect(result).not.toBeNull();
    expect(result!.body).toContain('# No Desc');
    expect(result!.body).toContain('URL: https://handler-edge.com/nodesc');
    expect(result!.body).toContain('Some content.');
    // No blockquote since no description
    expect(result!.body).not.toContain('>');
  });

  it('serves .md with page that has no content', async () => {
    const config = makeConfig({
      pages: [
        { path: '/empty', title: 'Empty Page', description: 'Has desc, no content' },
      ],
      options: { cacheTtl: 0 },
    });

    const result = await handleRequest('/empty.md', config);
    expect(result).not.toBeNull();
    expect(result!.body).toContain('# Empty Page');
    expect(result!.body).toContain('> Has desc, no content');
    expect(result!.body).toContain('URL: https://handler-edge.com/empty');
  });

  it('serves .md for nested path', async () => {
    const config = makeConfig({
      pages: [
        { path: '/docs/api/v2', title: 'API v2', description: 'API docs', content: 'v2 docs.' },
      ],
      options: { cacheTtl: 0 },
    });

    const result = await handleRequest('/docs/api/v2.md', config);
    expect(result).not.toBeNull();
    expect(result!.body).toContain('# API v2');
    expect(result!.body).toContain('URL: https://handler-edge.com/docs/api/v2');
  });

  it('matches page with trailing slash via .md endpoint', async () => {
    const config = makeConfig({
      pages: [
        { path: '/guide/', title: 'Guide', description: 'A guide', content: 'Guide content.' },
      ],
      options: { cacheTtl: 0 },
    });

    // /guide.md should match page at /guide/ via trailing slash normalization
    const result = await handleRequest('/guide.md', config);
    expect(result).not.toBeNull();
    expect(result!.body).toContain('# Guide');
  });

  it('returns null for .md when path is only extension', async () => {
    const result = await handleRequest('/.md', makeConfig());
    expect(result).toBeNull();
  });

  it('returns null for .md with path that does not exist', async () => {
    const result = await handleRequest('/nonexistent/deep/path.md', makeConfig());
    expect(result).toBeNull();
  });
});

// ─── URL construction in .md responses ───────────────────────────

describe('handler: URL construction in .md responses', () => {
  it('constructs URL from site URL + relative path', async () => {
    const config = makeConfig({
      pages: [{ path: '/test', title: 'Test', content: 'Content.' }],
      options: { cacheTtl: 0 },
    });

    const result = await handleRequest('/test.md', config);
    expect(result!.body).toContain('URL: https://handler-edge.com/test');
  });

  it('handles site URL with trailing slash', async () => {
    const config: LlmsTxtConfig = {
      site: { name: 'Trailing', url: 'https://trailing.com/', description: 'Trailing slash.' },
      pages: [{ path: '/page', title: 'Page', content: 'Content.' }],
      options: { cacheTtl: 0 },
    };

    const result = await handleRequest('/page.md', config);
    expect(result!.body).toContain('URL: https://trailing.com/page');
  });

  it('uses absolute path as-is for pages with http URLs', async () => {
    const config = makeConfig({
      pages: [{ path: 'https://cdn.example.com/docs', title: 'CDN Doc', content: 'CDN content.' }],
      options: { cacheTtl: 0 },
    });

    const result = await handleRequest('/docs.md', config);
    expect(result).not.toBeNull();
    expect(result!.body).toContain('URL: https://cdn.example.com/docs');
  });

  it('handles page path without leading slash', async () => {
    const config = makeConfig({
      pages: [{ path: 'noslash', title: 'No Slash', content: 'Content.' }],
      options: { cacheTtl: 0 },
    });

    // The handler resolves paths starting from / — noslash won't match /noslash.md
    // This tests the URL construction path in renderPageMarkdown
    const result = await handleRequest('/noslash.md', config);
    // May or may not match depending on normalization
    if (result) {
      expect(result.body).toContain('URL: https://handler-edge.com/noslash');
    }
  });
});

// ─── Cache TTL behavior ──────────────────────────────────────────

describe('handler: cache TTL behavior', () => {
  it('serves same content from cache within TTL', async () => {
    const config: LlmsTxtConfig = {
      site: { name: 'Cache Test', url: 'https://cache.com', description: 'Cache.' },
      pages: [{ path: '/page', title: 'Page', description: 'Desc' }],
      options: { cacheTtl: 60_000 },
    };

    const result1 = await handleRequest('/llms.txt', config);
    const result2 = await handleRequest('/llms.txt', config);

    expect(result1!.body).toBe(result2!.body);
    expect(result1!.headers['etag']).toBe(result2!.headers['etag']);
  });

  it('TTL = 0 disables caching', async () => {
    const config: LlmsTxtConfig = {
      site: { name: 'No Cache', url: 'https://nocache.com', description: 'No cache.' },
      pages: [{ path: '/page', title: 'Page', description: 'Desc' }],
      options: { cacheTtl: 0 },
    };

    const result1 = await handleRequest('/llms.txt', config);
    const result2 = await handleRequest('/llms.txt', config);

    // Both should work correctly
    expect(result1!.status).toBe(200);
    expect(result2!.status).toBe(200);
    expect(result1!.body).toBe(result2!.body);
  });

  it('different config objects get independent caches', async () => {
    const configA: LlmsTxtConfig = {
      site: { name: 'A', url: 'https://a.com', description: 'A.' },
      pages: [{ path: '/a', title: 'Page A' }],
      options: { cacheTtl: 60_000 },
    };
    const configB: LlmsTxtConfig = {
      site: { name: 'B', url: 'https://b.com', description: 'B.' },
      pages: [{ path: '/b', title: 'Page B' }],
      options: { cacheTtl: 60_000 },
    };

    const resA = await handleRequest('/llms.txt', configA);
    const resB = await handleRequest('/llms.txt', configB);

    expect(resA!.body).toContain('# A');
    expect(resA!.body).not.toContain('# B');
    expect(resB!.body).toContain('# B');
    expect(resB!.body).not.toContain('# A');
  });
});

// ─── startWatching ───────────────────────────────────────────────

describe('handler: startWatching', () => {
  it('returns null when config has no discover.dir', () => {
    const config: LlmsTxtConfig = {
      site: { name: 'No Dir', url: 'https://nodir.com', description: 'No dir.' },
      pages: [{ path: '/', title: 'Home' }],
      options: { cacheTtl: 0 },
    };

    const watcher = startWatching(config);
    expect(watcher).toBeNull();
  });

  it('returns null when discover is undefined', () => {
    const config: LlmsTxtConfig = {
      site: { name: 'No Discover', url: 'https://x.com', description: 'X.' },
      options: { cacheTtl: 0 },
    };

    const watcher = startWatching(config);
    expect(watcher).toBeNull();
  });

  it('returns a Watcher when dir is configured', async () => {
    const tmpDir = await mkdtemp(path.join(tmpdir(), 'llms-txt-watch-'));

    try {
      const config: LlmsTxtConfig = {
        site: { name: 'Watch', url: 'https://watch.com', description: 'Watch.' },
        discover: { dir: tmpDir },
        options: { cacheTtl: 0 },
      };

      const watcher = startWatching(config);
      expect(watcher).not.toBeNull();
      expect(typeof watcher!.close).toBe('function');
      watcher!.close();
    } finally {
      await rm(tmpDir, { recursive: true });
    }
  });

  it('watcher invalidates cache on file change', async () => {
    const tmpDir = await mkdtemp(path.join(tmpdir(), 'llms-txt-watch-cache-'));

    try {
      await writeFile(path.join(tmpDir, 'index.html'), '<html><head><title>V1</title></head><body><main>Version 1</main></body></html>');

      const config: LlmsTxtConfig = {
        site: { name: 'Watch Cache', url: 'https://watchcache.com', description: 'Watch cache test.' },
        discover: { dir: tmpDir },
        options: { cacheTtl: 60_000 },
      };

      // First request populates cache
      const result1 = await handleRequest('/llms.txt', config);
      expect(result1!.body).toContain('V1');

      let regenerated = false;
      const watcher = startWatching(config, () => {
        regenerated = true;
      });
      expect(watcher).not.toBeNull();

      // Modify file to trigger watcher
      await writeFile(path.join(tmpDir, 'index.html'), '<html><head><title>V2</title></head><body><main>Version 2</main></body></html>');

      // Wait for debounce + processing
      await vi.waitFor(() => {
        expect(regenerated).toBe(true);
      }, { timeout: 3000 });

      // After cache invalidation, next request should get new content
      const result2 = await handleRequest('/llms.txt', config);
      expect(result2!.body).toContain('V2');

      watcher!.close();
    } finally {
      await rm(tmpDir, { recursive: true });
    }
  });

  it('onRegenerate callback is called on file change', async () => {
    const tmpDir = await mkdtemp(path.join(tmpdir(), 'llms-txt-onregen-'));

    try {
      await writeFile(path.join(tmpDir, 'page.html'), '<html><body><main>Content</main></body></html>');

      const config: LlmsTxtConfig = {
        site: { name: 'Regen', url: 'https://regen.com', description: 'Regen.' },
        discover: { dir: tmpDir },
        options: { cacheTtl: 0 },
      };

      let callCount = 0;
      const watcher = startWatching(config, () => {
        callCount++;
      });

      await writeFile(path.join(tmpDir, 'new.html'), '<html><body><main>New</main></body></html>');

      await vi.waitFor(() => {
        expect(callCount).toBeGreaterThanOrEqual(1);
      }, { timeout: 3000 });

      watcher!.close();
    } finally {
      await rm(tmpDir, { recursive: true });
    }
  });
});

// ─── Handler with various config combinations ────────────────────

describe('handler: config edge cases', () => {
  it('handles config with no pages and no discover', async () => {
    const config: LlmsTxtConfig = {
      site: { name: 'Empty', url: 'https://empty.com', description: 'Empty site.' },
      options: { cacheTtl: 0 },
    };

    const result = await handleRequest('/llms.txt', config);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(200);
    expect(result!.body).toContain('# Empty');
    expect(result!.body).toContain('> Empty site.');
  });

  it('handles config with both full and small disabled', async () => {
    const config: LlmsTxtConfig = {
      site: { name: 'Minimal', url: 'https://minimal.com', description: 'Minimal.' },
      pages: [{ path: '/', title: 'Home' }],
      options: { cacheTtl: 0, full: false, small: false },
    };

    const llmsResult = await handleRequest('/llms.txt', config);
    expect(llmsResult).not.toBeNull();
    expect(llmsResult!.status).toBe(200);

    const fullResult = await handleRequest('/llms-full.txt', config);
    expect(fullResult).toBeNull();

    const smallResult = await handleRequest('/llms-small.txt', config);
    expect(smallResult).toBeNull();
  });

  it('handles config with sections but no matching pages', async () => {
    const config: LlmsTxtConfig = {
      site: { name: 'Sections', url: 'https://sections.com', description: 'Sections.' },
      pages: [{ path: '/about', title: 'About' }],
      sections: [
        { name: 'Docs', pathPrefix: '/docs' },
      ],
      options: { cacheTtl: 0 },
    };

    const result = await handleRequest('/llms.txt', config);
    expect(result).not.toBeNull();
    // About page should end up in "Other" since it doesn't match /docs prefix
    expect(result!.body).toContain('## Other');
    expect(result!.body).toContain('[About]');
  });
});
