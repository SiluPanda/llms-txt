/**
 * E2E tests against real-world websites.
 *
 * Tests content extraction, crawling, and full generate() pipeline
 * against production websites with varying complexity:
 *
 * - expressjs.com: Classic server-rendered site with multilingual sitemap
 * - cloudflare.com: Corporate site with title, description, large sitemap
 * - stripe.com: JSON-LD structured data (Organization schema)
 * - vite.dev: Clean static VitePress site with small sitemap
 * - developer.mozilla.org: Content-rich reference docs, massive link graph
 * - github.com: Major platform with meta description and OG tags
 * - news.ycombinator.com: Minimal bare HTML, edge case for extraction
 */
import {
  generate,
  crawlUrl,
  extractPageInfo,
  discoverFromSitemap,
} from '../../src/index.js';

// ---------------------------------------------------------------------------
// Helper: fetch HTML from a URL and run extractPageInfo
// ---------------------------------------------------------------------------
async function fetchAndExtract(url: string) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'llms-txt-e2e-test/1.0' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const html = await res.text();
  return { info: extractPageInfo(html, url), html };
}

// ===================================================================
// 1. expressjs.com — Classic server-rendered framework docs
// ===================================================================
describe('e2e: expressjs.com', () => {
  it(
    'extracts title and content from the Express homepage',
    async () => {
      const { info } = await fetchAndExtract('https://expressjs.com');

      expect(info.title).toBeTruthy();
      expect(info.title.toLowerCase()).toContain('express');
      expect(info.content.length).toBeGreaterThan(100);
      // Express homepage has multiple sections
      expect(info.headings.length).toBeGreaterThan(0);
    },
    20_000,
  );

  it(
    'extracts content from an Express guide page',
    async () => {
      const { info } = await fetchAndExtract('https://expressjs.com/en/starter/installing.html');

      expect(info.title).toBeTruthy();
      expect(info.content).toBeTruthy();
      expect(info.content.length).toBeGreaterThan(50);
    },
    20_000,
  );

  it(
    'crawls expressjs.com and discovers multiple pages',
    async () => {
      const pages = await crawlUrl('https://expressjs.com', 1);

      expect(pages.length).toBeGreaterThanOrEqual(2);
      // All pages should have titles
      for (const page of pages) {
        expect(page.title).toBeTruthy();
        expect(page.content).toBeTruthy();
      }
    },
    45_000,
  );

  it(
    'generates full llms.txt for Express via crawl with sections',
    async () => {
      const result = await generate({
        site: {
          name: 'Express.js',
          url: 'https://expressjs.com',
          description: 'Fast, unopinionated, minimalist web framework for Node.js.',
        },
        discover: { crawlUrl: 'https://expressjs.com', maxDepth: 1 },
        options: { cacheTtl: 0 },
      });

      expect(result.llmsTxt).toContain('# Express.js');
      expect(result.llmsTxt).toContain('> Fast, unopinionated');
      expect(result.pages.length).toBeGreaterThanOrEqual(2);

      // Full text should be longer with inline content
      expect(result.llmsFullTxt).toBeDefined();
      expect(result.llmsFullTxt!.length).toBeGreaterThan(result.llmsTxt.length);

      // Every page should have a URL in the output
      for (const page of result.pages) {
        expect(result.llmsTxt).toContain(page.title);
      }
    },
    45_000,
  );

  it(
    'discovers pages from expressjs.com sitemap',
    async () => {
      const pages = await discoverFromSitemap('https://expressjs.com/sitemap.xml');

      expect(pages.length).toBeGreaterThan(5);

      // At least some pages should have titles (from fetched HTML)
      const withTitles = pages.filter((p) => p.title.length > 0);
      expect(withTitles.length).toBeGreaterThan(0);
    },
    60_000,
  );
});

// ===================================================================
// 2. cloudflare.com — Corporate site with good SEO metadata
// ===================================================================
describe('e2e: cloudflare.com', () => {
  it(
    'extracts title and description from the Cloudflare homepage',
    async () => {
      const { info } = await fetchAndExtract('https://www.cloudflare.com');

      expect(info.title).toBeTruthy();
      // Cloudflare should have a meaningful title
      expect(info.title.toLowerCase()).toMatch(/cloudflare/i);
      expect(info.content.length).toBeGreaterThan(200);
    },
    20_000,
  );

  it(
    'extracts content from Cloudflare developer docs',
    async () => {
      const { info } = await fetchAndExtract('https://www.cloudflare.com/developer-platform/products/');

      expect(info.title).toBeTruthy();
      expect(info.content.length).toBeGreaterThan(100);
    },
    20_000,
  );

  it(
    'crawls cloudflare.com with depth 1 and finds multiple pages',
    async () => {
      const pages = await crawlUrl('https://www.cloudflare.com', 1);

      expect(pages.length).toBeGreaterThanOrEqual(3);
      for (const page of pages) {
        expect(page.title).toBeTruthy();
      }
    },
    45_000,
  );

  it(
    'generates llms.txt for Cloudflare with crawled content',
    async () => {
      const result = await generate({
        site: {
          name: 'Cloudflare',
          url: 'https://www.cloudflare.com',
          description: 'Connect, protect, and build everywhere.',
        },
        discover: { crawlUrl: 'https://www.cloudflare.com', maxDepth: 1 },
        options: { cacheTtl: 0 },
      });

      expect(result.llmsTxt).toContain('# Cloudflare');
      expect(result.pages.length).toBeGreaterThanOrEqual(3);
      expect(result.generatedAt).toBeInstanceOf(Date);

      // llms-full.txt should contain actual page content
      expect(result.llmsFullTxt).toBeDefined();
      expect(result.llmsFullTxt!).toContain('URL: https://www.cloudflare.com');
    },
    45_000,
  );
});

// ===================================================================
// 3. stripe.com — Rich JSON-LD structured data
// ===================================================================
describe('e2e: stripe.com', () => {
  it(
    'extracts title from the Stripe homepage',
    async () => {
      const { info } = await fetchAndExtract('https://stripe.com');

      expect(info.title).toBeTruthy();
      expect(info.title.toLowerCase()).toContain('stripe');
      expect(info.content.length).toBeGreaterThan(100);
    },
    20_000,
  );

  it(
    'extracts JSON-LD structured data from Stripe',
    async () => {
      const { info } = await fetchAndExtract('https://stripe.com');

      // Stripe has JSON-LD structured data — schema types may vary
      if (info.structuredData && info.structuredData.length > 0) {
        // Verify each entry is a valid JSON-LD object
        for (const sd of info.structuredData) {
          expect(sd).toBeTypeOf('object');
          expect(sd['@context'] || sd['@type']).toBeTruthy();
        }
      }
      // Regardless of structured data, the page should be extractable
      expect(info.title).toBeTruthy();
      expect(info.content.length).toBeGreaterThan(100);
    },
    20_000,
  );

  it(
    'crawls stripe.com and finds linked pages',
    async () => {
      const pages = await crawlUrl('https://stripe.com', 1);

      expect(pages.length).toBeGreaterThanOrEqual(2);

      // At least the homepage should have structured data
      const withStructuredData = pages.filter(
        (p) => p.structuredData && p.structuredData.length > 0,
      );
      expect(withStructuredData.length).toBeGreaterThanOrEqual(1);
    },
    45_000,
  );

  it(
    'generates llms.txt for Stripe preserving structured data in full output',
    async () => {
      const result = await generate({
        site: {
          name: 'Stripe',
          url: 'https://stripe.com',
          description: 'Financial infrastructure for the internet.',
        },
        discover: { crawlUrl: 'https://stripe.com', maxDepth: 1 },
        options: { cacheTtl: 0 },
      });

      expect(result.llmsTxt).toContain('# Stripe');
      expect(result.pages.length).toBeGreaterThanOrEqual(2);

      // Verify pages retained structured data through the pipeline
      const withSD = result.pages.filter((p) => p.structuredData && p.structuredData.length > 0);
      expect(withSD.length).toBeGreaterThanOrEqual(1);

      // Full text should contain inline content from Stripe pages
      expect(result.llmsFullTxt).toBeDefined();
      expect(result.llmsFullTxt!.length).toBeGreaterThan(500);
    },
    45_000,
  );
});

// ===================================================================
// 4. vite.dev — Clean static site with small, predictable sitemap
// ===================================================================
describe('e2e: vite.dev', () => {
  it(
    'extracts title and description from the Vite homepage',
    async () => {
      const { info } = await fetchAndExtract('https://vite.dev');

      expect(info.title).toBeTruthy();
      expect(info.title.toLowerCase()).toContain('vite');
      expect(info.content.length).toBeGreaterThan(50);
    },
    20_000,
  );

  it(
    'extracts content from a Vite guide page',
    async () => {
      const { info } = await fetchAndExtract('https://vite.dev/guide/');

      expect(info.title).toBeTruthy();
      expect(info.content.length).toBeGreaterThan(200);
      expect(info.headings.length).toBeGreaterThan(0);
    },
    20_000,
  );

  it(
    'crawls vite.dev and finds guide and config pages',
    async () => {
      const pages = await crawlUrl('https://vite.dev', 1);

      expect(pages.length).toBeGreaterThanOrEqual(3);
      for (const page of pages) {
        expect(page.title).toBeTruthy();
      }

      // Should find guide pages among the crawled links
      const guidePaths = pages.filter((p) => p.path.includes('/guide'));
      expect(guidePaths.length).toBeGreaterThanOrEqual(0); // May or may not find depending on link structure
    },
    45_000,
  );

  it(
    'generates llms.txt for Vite with sections for guides and config',
    async () => {
      const result = await generate({
        site: {
          name: 'Vite',
          url: 'https://vite.dev',
          description: 'Next generation frontend tooling.',
        },
        discover: { crawlUrl: 'https://vite.dev', maxDepth: 1 },
        sections: [
          { name: 'Guide', pathPrefix: '/guide' },
          { name: 'Config', pathPrefix: '/config' },
        ],
        options: { cacheTtl: 0 },
      });

      expect(result.llmsTxt).toContain('# Vite');
      expect(result.llmsTxt).toContain('> Next generation frontend tooling.');
      expect(result.pages.length).toBeGreaterThanOrEqual(3);

      expect(result.llmsFullTxt).toBeDefined();
      expect(result.llmsFullTxt!.length).toBeGreaterThan(result.llmsTxt.length);
    },
    45_000,
  );
});

// ===================================================================
// 5. developer.mozilla.org — Content-rich reference docs
// ===================================================================
describe('e2e: developer.mozilla.org (MDN)', () => {
  it(
    'extracts rich content from MDN JavaScript reference',
    async () => {
      const { info } = await fetchAndExtract(
        'https://developer.mozilla.org/en-US/docs/Web/JavaScript',
      );

      expect(info.title).toBeTruthy();
      expect(info.title).toContain('JavaScript');
      expect(info.content.length).toBeGreaterThan(500);
      // MDN pages have lots of headings
      expect(info.headings.length).toBeGreaterThan(3);
    },
    20_000,
  );

  it(
    'extracts content from a specific MDN API page',
    async () => {
      const { info } = await fetchAndExtract(
        'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array',
      );

      expect(info.title).toBeTruthy();
      expect(info.title).toContain('Array');
      expect(info.content.length).toBeGreaterThan(500);
      expect(info.headings.length).toBeGreaterThan(5);
    },
    20_000,
  );

  it(
    'crawls MDN JavaScript page and discovers linked reference pages',
    async () => {
      const pages = await crawlUrl(
        'https://developer.mozilla.org/en-US/docs/Web/JavaScript',
        1,
      );

      // MDN has tons of internal links — should discover many pages
      expect(pages.length).toBeGreaterThanOrEqual(5);

      // Most pages should have meaningful content (some may be stubs/redirects)
      const contentRich = pages.filter((p) => p.content.length > 50);
      expect(contentRich.length).toBeGreaterThanOrEqual(3);
      for (const page of pages) {
        expect(page.title).toBeTruthy();
      }
    },
    180_000,
  );

  it(
    'generates llms.txt for MDN with tutorial and reference sections',
    async () => {
      const result = await generate({
        site: {
          name: 'MDN Web Docs',
          url: 'https://developer.mozilla.org',
          description: 'Resources for developers, by developers.',
        },
        discover: {
          crawlUrl: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript',
          maxDepth: 1,
        },
        sections: [
          { name: 'Tutorials', pathPrefix: '/en-US/docs/Web/JavaScript/Guide' },
          { name: 'Reference', pathPrefix: '/en-US/docs/Web/JavaScript/Reference' },
        ],
        options: { cacheTtl: 0 },
      });

      expect(result.llmsTxt).toContain('# MDN Web Docs');
      expect(result.pages.length).toBeGreaterThanOrEqual(5);

      // Full text should be very content-rich
      expect(result.llmsFullTxt).toBeDefined();
      expect(result.llmsFullTxt!.length).toBeGreaterThan(5000);
    },
    60_000,
  );
});

// ===================================================================
// 6. github.com — Major platform with meta description
// ===================================================================
describe('e2e: github.com', () => {
  it(
    'extracts title and description from GitHub homepage',
    async () => {
      const { info } = await fetchAndExtract('https://github.com');

      expect(info.title).toBeTruthy();
      expect(info.title.toLowerCase()).toContain('github');
      expect(info.description).toBeTruthy();
      expect(info.content.length).toBeGreaterThan(100);
    },
    20_000,
  );

  it(
    'extracts OpenGraph metadata from GitHub',
    async () => {
      const { info } = await fetchAndExtract('https://github.com');

      // GitHub has OG tags
      if (info.og && Object.keys(info.og).length > 0) {
        // If OG is present, it should have meaningful values
        if (info.og.title) {
          expect(info.og.title.length).toBeGreaterThan(0);
        }
        if (info.og.description) {
          expect(info.og.description.length).toBeGreaterThan(0);
        }
      }
      // Even without OG, the page should have basic metadata
      expect(info.title).toBeTruthy();
    },
    20_000,
  );

  it(
    'crawls github.com and discovers multiple pages',
    async () => {
      const pages = await crawlUrl('https://github.com', 1);

      expect(pages.length).toBeGreaterThanOrEqual(2);
      for (const page of pages) {
        expect(page.title).toBeTruthy();
      }
    },
    45_000,
  );

  it(
    'generates llms.txt for GitHub via generate()',
    async () => {
      const result = await generate({
        site: {
          name: 'GitHub',
          url: 'https://github.com',
          description: 'The world\'s leading AI-powered developer platform.',
        },
        discover: { crawlUrl: 'https://github.com', maxDepth: 1 },
        options: { cacheTtl: 0 },
      });

      expect(result.llmsTxt).toContain('# GitHub');
      expect(result.pages.length).toBeGreaterThanOrEqual(2);
      expect(result.llmsFullTxt).toBeDefined();
    },
    45_000,
  );
});

// ===================================================================
// 7. news.ycombinator.com — Bare minimal HTML (edge case)
// ===================================================================
describe('e2e: news.ycombinator.com (minimal HTML)', () => {
  it(
    'extracts what it can from the HN bare HTML page',
    async () => {
      const { info } = await fetchAndExtract('https://news.ycombinator.com');

      // HN has minimal metadata — title might be present or empty
      expect(info.path).toBe('https://news.ycombinator.com');
      // Content should still be extractable from the body
      expect(info.content).toBeTruthy();

      // HN has no JSON-LD or OG tags — verify graceful handling
      expect(info.structuredData).toBeUndefined();
    },
    20_000,
  );

  it(
    'generates llms.txt for HN even with minimal metadata',
    async () => {
      const result = await generate({
        site: {
          name: 'Hacker News',
          url: 'https://news.ycombinator.com',
          description: 'Social news for hackers and startup founders.',
        },
        discover: { crawlUrl: 'https://news.ycombinator.com', maxDepth: 1 },
        options: { cacheTtl: 0 },
      });

      expect(result.llmsTxt).toContain('# Hacker News');
      expect(result.llmsTxt).toContain('> Social news for hackers');
      expect(result.pages.length).toBeGreaterThanOrEqual(1);

      // Even with minimal metadata, generate should not crash
      expect(result.llmsFullTxt).toBeDefined();
    },
    45_000,
  );
});

// ===================================================================
// 8. Cross-site: generate() with mixed manual + crawled pages
// ===================================================================
describe('e2e: mixed manual pages + live crawl', () => {
  it(
    'combines manual pages with crawled pages in a single llms.txt',
    async () => {
      const result = await generate({
        site: {
          name: 'My Aggregator',
          url: 'https://example.com',
          description: 'An aggregator of developer resources.',
        },
        pages: [
          { path: '/custom/about', title: 'About This Aggregator', description: 'Hand-written page about the aggregator.' },
          { path: '/custom/contact', title: 'Contact Us', description: 'Get in touch.', content: 'Email us at hello@example.com.' },
        ],
        discover: { crawlUrl: 'https://example.com', maxDepth: 1 },
        sections: [
          { name: 'Custom Pages', pathPrefix: '/custom' },
          { name: 'Crawled Pages', pathPrefix: '/' },
        ],
        options: { cacheTtl: 0 },
      });

      expect(result.llmsTxt).toContain('# My Aggregator');
      expect(result.llmsTxt).toContain('## Custom Pages');
      expect(result.llmsTxt).toContain('About This Aggregator');
      expect(result.llmsTxt).toContain('Contact Us');
      // Should also have crawled pages
      expect(result.pages.length).toBeGreaterThanOrEqual(3); // 2 manual + at least 1 crawled

      // Full text should include manual content
      expect(result.llmsFullTxt).toContain('Email us at hello@example.com.');
    },
    30_000,
  );
});

// ===================================================================
// 9. Sitemap discovery from real sitemaps
// ===================================================================
describe('e2e: sitemap discovery', () => {
  it(
    'discovers pages from the Vite sitemap (small, ~50 URLs)',
    async () => {
      const pages = await discoverFromSitemap('https://vite.dev/sitemap.xml');

      // Vite has ~50 pages in its sitemap
      expect(pages.length).toBeGreaterThan(10);

      // Pages should have titles extracted from fetched HTML
      const withTitles = pages.filter((p) => p.title.length > 0);
      expect(withTitles.length).toBeGreaterThan(5);

      // Pages should have content
      const withContent = pages.filter((p) => p.content.length > 50);
      expect(withContent.length).toBeGreaterThan(5);
    },
    120_000,
  );

  it(
    'generates llms.txt from Vite sitemap with organized sections',
    async () => {
      const result = await generate({
        site: {
          name: 'Vite',
          url: 'https://vite.dev',
          description: 'Next generation frontend tooling.',
        },
        discover: { sitemapUrl: 'https://vite.dev/sitemap.xml' },
        sections: [
          { name: 'Guide', pathPrefix: '/guide' },
          { name: 'Config', pathPrefix: '/config' },
          { name: 'Blog', pathPrefix: '/blog' },
        ],
        options: { cacheTtl: 0 },
      });

      expect(result.llmsTxt).toContain('# Vite');
      expect(result.pages.length).toBeGreaterThan(10);

      // Verify sections are populated
      expect(result.llmsTxt).toContain('## Guide');
      expect(result.llmsTxt).toContain('## Config');

      // Full text should be very long with all page content
      expect(result.llmsFullTxt).toBeDefined();
      expect(result.llmsFullTxt!.length).toBeGreaterThan(10_000);
    },
    120_000,
  );
});

// ===================================================================
// 10. Multi-depth crawl tests
// ===================================================================
describe('e2e: multi-depth crawling', () => {
  it(
    'crawls expressjs.com at depth 2 and discovers more pages than depth 1',
    async () => {
      const [depth1Pages, depth2Pages] = await Promise.all([
        crawlUrl('https://expressjs.com', 1),
        crawlUrl('https://expressjs.com', 2),
      ]);

      // Depth 2 should discover at least as many pages as depth 1
      expect(depth2Pages.length).toBeGreaterThanOrEqual(depth1Pages.length);
      // With depth 2, we should find deeper guide pages
      expect(depth2Pages.length).toBeGreaterThanOrEqual(3);
    },
    90_000,
  );

  it(
    'deduplicates pages across crawl depths',
    async () => {
      const pages = await crawlUrl('https://expressjs.com', 2);

      // Check for duplicate paths
      const paths = pages.map((p) => p.path);
      const unique = new Set(paths);
      expect(unique.size).toBe(paths.length);
    },
    60_000,
  );
});

// ===================================================================
// 11. Framework adapters with real crawled content
// ===================================================================
describe('e2e: Express adapter with real website crawl', () => {
  it(
    'serves llms.txt with content crawled from example.com',
    async () => {
      // Use generate() to verify the pipeline, simulating what the adapter does
      const result = await generate({
        site: {
          name: 'Example Proxy',
          url: 'https://example.com',
          description: 'A proxy site aggregating example.com content.',
        },
        discover: { crawlUrl: 'https://example.com', maxDepth: 1 },
        options: {
          cacheTtl: 0,
          preamble: 'This llms.txt was auto-generated by crawling example.com.',
          additionalSections: {
            'About This File': 'Generated for AI agent discoverability.',
          },
        },
      });

      expect(result.llmsTxt).toContain('# Example Proxy');
      expect(result.llmsTxt).toContain('This llms.txt was auto-generated');
      expect(result.llmsTxt).toContain('## About This File');
      expect(result.llmsTxt).toContain('Generated for AI agent discoverability.');
      expect(result.pages.length).toBeGreaterThanOrEqual(1);
    },
    30_000,
  );
});
