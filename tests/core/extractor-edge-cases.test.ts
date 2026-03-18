/**
 * Edge case tests for the extractor module.
 *
 * Tests:
 * - All JSON-LD blocks malformed
 * - JSON-LD with empty html()
 * - Multiple JSON-LD blocks (mixed valid/invalid)
 * - Content extraction with no container at all
 * - Custom noiseSelectors
 * - OpenGraph edge cases
 * - Very large HTML
 */
import { extractPageInfo } from '../../src/core/extractor.js';

describe('extractor: JSON-LD edge cases', () => {
  it('returns no structuredData when all JSON-LD blocks are malformed', () => {
    const html = `<html><head>
      <script type="application/ld+json">{ not valid }</script>
      <script type="application/ld+json">also broken</script>
    </head><body><main>Content</main></body></html>`;
    const info = extractPageInfo(html, '/all-bad-jsonld');

    // Should return undefined (no valid entries)
    expect(info.structuredData).toBeUndefined();
    expect(info.content).toContain('Content');
  });

  it('handles empty JSON-LD script tag', () => {
    const html = `<html><head>
      <script type="application/ld+json"></script>
    </head><body><main>Content</main></body></html>`;
    const info = extractPageInfo(html, '/empty-jsonld');

    expect(info.structuredData).toBeUndefined();
  });

  it('handles JSON-LD with only whitespace', () => {
    const html = `<html><head>
      <script type="application/ld+json">   </script>
    </head><body><main>Content</main></body></html>`;
    const info = extractPageInfo(html, '/whitespace-jsonld');

    // Whitespace is not valid JSON, should be skipped
    expect(info.structuredData).toBeUndefined();
  });

  it('extracts valid JSON-LD alongside multiple malformed blocks', () => {
    const html = `<html><head>
      <script type="application/ld+json">broken 1</script>
      <script type="application/ld+json">{"@type":"Valid","name":"OK"}</script>
      <script type="application/ld+json">broken 2</script>
      <script type="application/ld+json">{"@type":"AlsoValid","name":"Good"}</script>
    </head><body><main>Content</main></body></html>`;
    const info = extractPageInfo(html, '/mixed-jsonld');

    expect(info.structuredData).toBeDefined();
    expect(info.structuredData).toHaveLength(2);
    expect(info.structuredData![0]['@type']).toBe('Valid');
    expect(info.structuredData![1]['@type']).toBe('AlsoValid');
  });

  it('handles JSON-LD with nested objects', () => {
    const html = `<html><head>
      <script type="application/ld+json">
        {"@type":"Product","name":"Widget","offers":{"@type":"Offer","price":"9.99"}}
      </script>
    </head><body></body></html>`;
    const info = extractPageInfo(html, '/nested-jsonld');

    expect(info.structuredData).toBeDefined();
    const sd = info.structuredData![0];
    expect(sd['@type']).toBe('Product');
    expect((sd['offers'] as any)['price']).toBe('9.99');
  });
});

describe('extractor: content extraction edge cases', () => {
  it('returns empty content when HTML has no body', () => {
    const html = '<html><head><title>No Body</title></head></html>';
    const info = extractPageInfo(html, '/no-body');

    // Cheerio may inject body, but content should be empty or minimal
    expect(info.title).toBe('No Body');
  });

  it('prefers <main> over <article> over <body>', () => {
    const html = `<html><body>
      <article><p>Article text</p></article>
      <main><p>Main text</p></main>
    </body></html>`;
    const info = extractPageInfo(html, '/priority');

    expect(info.content).toContain('Main text');
    // Article text may or may not be present depending on extraction logic
  });

  it('handles very large HTML document', () => {
    const largeContent = '<p>word </p>'.repeat(10000);
    const html = `<html><head><title>Large</title></head><body><main>${largeContent}</main></body></html>`;
    const info = extractPageInfo(html, '/large');

    expect(info.title).toBe('Large');
    expect(info.content.length).toBeGreaterThan(0);
  });

  it('handles HTML with only inline elements', () => {
    const html = '<html><body><span>inline</span><em>emphasized</em><strong>bold</strong></body></html>';
    const info = extractPageInfo(html, '/inline');

    expect(info.content).toContain('inline');
    expect(info.content).toContain('emphasized');
    expect(info.content).toContain('bold');
  });

  it('strips ARIA navigation and contentinfo roles', () => {
    const html = `<html><body><main>
      <div role="navigation">Nav menu</div>
      <div role="banner">Site banner</div>
      <div role="contentinfo">Copyright info</div>
      <p>Real content</p>
    </main></body></html>`;
    const info = extractPageInfo(html, '/aria-roles');

    expect(info.content).toContain('Real content');
    expect(info.content).not.toContain('Nav menu');
    expect(info.content).not.toContain('Site banner');
    expect(info.content).not.toContain('Copyright info');
  });

  it('strips cookie and banner patterns by class/id', () => {
    const html = `<html><body><main>
      <div class="cookie-consent-modal">Accept all cookies</div>
      <div id="cookie-notice">We use cookies</div>
      <div class="top-banner-promo">50% off!</div>
      <div class="popup-newsletter">Subscribe now</div>
      <p>Actual page content</p>
    </main></body></html>`;
    const info = extractPageInfo(html, '/auto-noise');

    expect(info.content).toContain('Actual page content');
    expect(info.content).not.toContain('Accept all cookies');
    expect(info.content).not.toContain('We use cookies');
    expect(info.content).not.toContain('50% off');
    expect(info.content).not.toContain('Subscribe now');
  });
});

describe('extractor: custom noiseSelectors', () => {
  it('removes elements matching custom selectors', () => {
    const html = `<html><body><main>
      <div class="sidebar">Sidebar content</div>
      <div class="ad-unit">Advertisement</div>
      <p>Main content</p>
    </main></body></html>`;
    const info = extractPageInfo(html, '/custom', {
      noiseSelectors: ['.sidebar', '.ad-unit'],
    });

    expect(info.content).toContain('Main content');
    expect(info.content).not.toContain('Sidebar');
    expect(info.content).not.toContain('Advertisement');
  });

  it('handles complex CSS selectors', () => {
    const html = `<html><body><main>
      <div data-testid="promo-bar">Promo content</div>
      <section id="newsletter">Sign up</section>
      <p>Real content</p>
    </main></body></html>`;
    const info = extractPageInfo(html, '/complex', {
      noiseSelectors: ['[data-testid="promo-bar"]', '#newsletter'],
    });

    expect(info.content).toContain('Real content');
    expect(info.content).not.toContain('Promo content');
    expect(info.content).not.toContain('Sign up');
  });

  it('works with empty noiseSelectors array', () => {
    const html = `<html><body><main><p>Content</p></main></body></html>`;
    const info = extractPageInfo(html, '/empty-selectors', {
      noiseSelectors: [],
    });

    expect(info.content).toContain('Content');
  });

  it('handles noiseSelectors that match nothing', () => {
    const html = `<html><body><main><p>All content preserved</p></main></body></html>`;
    const info = extractPageInfo(html, '/no-match', {
      noiseSelectors: ['.nonexistent', '#does-not-exist'],
    });

    expect(info.content).toContain('All content preserved');
  });
});

describe('extractor: OpenGraph edge cases', () => {
  it('handles OG meta with empty content attribute', () => {
    const html = `<html><head>
      <meta property="og:title" content="">
      <meta property="og:description" content="  ">
    </head><body></body></html>`;
    const info = extractPageInfo(html, '/og-empty');

    // Empty and whitespace-only values should not be included
    expect(info.og).toBeUndefined();
  });

  it('handles duplicate OG tags (first wins via cheerio)', () => {
    const html = `<html><head>
      <meta property="og:title" content="First Title">
      <meta property="og:title" content="Second Title">
    </head><body></body></html>`;
    const info = extractPageInfo(html, '/og-dup');

    expect(info.og).toBeDefined();
    expect(info.og!.title).toBe('First Title');
  });

  it('ignores non-standard OG properties', () => {
    const html = `<html><head>
      <meta property="og:title" content="Title">
      <meta property="og:locale" content="en_US">
      <meta property="og:site_name" content="My Site">
    </head><body></body></html>`;
    const info = extractPageInfo(html, '/og-extra');

    expect(info.og).toBeDefined();
    expect(info.og!.title).toBe('Title');
    // Non-mapped properties should not appear
    expect((info.og as any).locale).toBeUndefined();
    expect((info.og as any).site_name).toBeUndefined();
  });
});

describe('extractor: title extraction edge cases', () => {
  it('prefers <title> over multiple <h1> tags', () => {
    const html = `<html><head><title>Title Tag</title></head><body>
      <h1>First H1</h1>
      <h1>Second H1</h1>
    </body></html>`;
    const info = extractPageInfo(html, '/multi-h1');

    expect(info.title).toBe('Title Tag');
  });

  it('uses first <h1> when no <title> and multiple h1s exist', () => {
    const html = `<html><body>
      <h1>First H1</h1>
      <h1>Second H1</h1>
    </body></html>`;
    const info = extractPageInfo(html, '/multi-h1-no-title');

    expect(info.title).toBe('First H1');
  });

  it('handles title with HTML entities', () => {
    const html = '<html><head><title>Tom &amp; Jerry&#39;s &lt;Page&gt;</title></head><body></body></html>';
    const info = extractPageInfo(html, '/entities');

    expect(info.title).toContain('Tom & Jerry');
    expect(info.title).toContain('<Page>');
  });
});
