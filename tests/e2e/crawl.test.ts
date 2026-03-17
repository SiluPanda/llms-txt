/**
 * E2E tests for real website crawling and content extraction.
 *
 * These tests hit actual websites over the network. They use generous timeouts
 * and flexible assertions since external content can change.
 */
import { generate, crawlUrl, extractPageInfo, discoverFromDirectory } from '../../src/index.js';
import path from 'node:path';

const FIXTURES_DIR = path.resolve(__dirname, 'fixtures');

describe('e2e: local directory discovery', () => {
  it('discovers all HTML pages from fixture directory', async () => {
    const result = await generate({
      site: {
        name: 'Acme Corp',
        url: 'https://acme.example.com',
        description: 'Build better software.',
      },
      discover: { dir: FIXTURES_DIR },
      options: { cacheTtl: 0 },
    });

    expect(result.pages.length).toBe(6);
    expect(result.llmsTxt).toContain('# Acme Corp');
    expect(result.llmsTxt).toContain('> Build better software.');

    const paths = result.pages.map((p) => p.path).sort();
    expect(paths).toEqual([
      '/',
      '/about',
      '/blog/getting-started',
      '/blog/hello-world',
      '/docs/api-reference',
      '/docs/installation',
    ]);
  });

  it('extracts titles and descriptions correctly from fixtures', async () => {
    const result = await generate({
      site: {
        name: 'Acme Corp',
        url: 'https://acme.example.com',
        description: 'Build better software.',
      },
      discover: { dir: FIXTURES_DIR },
      options: { cacheTtl: 0 },
    });

    const home = result.pages.find((p) => p.path === '/');
    expect(home).toBeDefined();
    expect(home!.title).toBe('Acme Corp - Build Better Software');
    expect(home!.description).toBe(
      'Acme Corp helps teams build better software with modern tools and practices.',
    );
    expect(home!.headings).toContain('Our Mission');
    expect(home!.headings).toContain('Why Acme?');

    const apiRef = result.pages.find((p) => p.path === '/docs/api-reference');
    expect(apiRef).toBeDefined();
    expect(apiRef!.title).toBe('API Reference - Acme Docs');
    expect(apiRef!.description).toBe(
      "Complete API reference for Acme's developer tools and SDK.",
    );
  });

  it('extracts structured data and OpenGraph from home page', async () => {
    const result = await generate({
      site: {
        name: 'Acme Corp',
        url: 'https://acme.example.com',
        description: 'Build better software.',
      },
      discover: { dir: FIXTURES_DIR },
      options: { cacheTtl: 0 },
    });

    const home = result.pages.find((p) => p.path === '/');
    expect(home!.structuredData).toBeDefined();
    expect(home!.structuredData!.length).toBeGreaterThan(0);
    expect(home!.structuredData![0]['@type']).toBe('Organization');

    expect(home!.og).toBeDefined();
    expect(home!.og!.title).toBe('Acme Corp');
    expect(home!.og!.type).toBe('website');
  });

  it('organizes pages into sections by pathPrefix', async () => {
    const result = await generate({
      site: {
        name: 'Acme Corp',
        url: 'https://acme.example.com',
        description: 'Build better software.',
      },
      discover: { dir: FIXTURES_DIR },
      sections: [
        { name: 'Documentation', pathPrefix: '/docs', description: 'Technical documentation' },
        { name: 'Blog', pathPrefix: '/blog', description: 'Latest posts' },
        { name: 'Main', pathPrefix: '/', description: 'Core pages' },
      ],
      options: { cacheTtl: 0 },
    });

    expect(result.llmsTxt).toContain('## Documentation');
    expect(result.llmsTxt).toContain('## Blog');
    expect(result.llmsTxt).toContain('## Main');

    // Docs section should have API reference and installation links
    const docsSection = result.llmsTxt.split('## Documentation')[1].split('## Blog')[0];
    expect(docsSection).toContain('API Reference');
    expect(docsSection).toContain('Installation Guide');

    // Blog section should have blog posts
    const blogSection = result.llmsTxt.split('## Blog')[1].split('## Main')[0];
    expect(blogSection).toContain('Hello World');
    expect(blogSection).toContain('Getting Started');
  });

  it('generates llms-full.txt with inline content', async () => {
    const result = await generate({
      site: {
        name: 'Acme Corp',
        url: 'https://acme.example.com',
        description: 'Build better software.',
      },
      discover: { dir: FIXTURES_DIR },
      options: { cacheTtl: 0, full: true },
    });

    expect(result.llmsFullTxt).toBeDefined();
    expect(result.llmsFullTxt).toContain('# Acme Corp');
    // Full text should have inline content from pages
    expect(result.llmsFullTxt).toContain('### Acme Corp - Build Better Software');
    expect(result.llmsFullTxt).toContain('Empowering developers worldwide');
    expect(result.llmsFullTxt).toContain('### API Reference - Acme Docs');
    expect(result.llmsFullTxt).toContain('plugin system allows extending Acme');
  });

  it('respects filterPages option', async () => {
    const result = await generate({
      site: {
        name: 'Acme Corp',
        url: 'https://acme.example.com',
        description: 'Build better software.',
      },
      discover: { dir: FIXTURES_DIR },
      options: {
        cacheTtl: 0,
        filterPages: (page) => page.path.startsWith('/docs'),
      },
    });

    expect(result.llmsTxt).toContain('API Reference');
    expect(result.llmsTxt).toContain('Installation Guide');
    expect(result.llmsTxt).not.toContain('Hello World');
    expect(result.llmsTxt).not.toContain('About Us');
  });

  it('generates correct URLs in output', async () => {
    const result = await generate({
      site: {
        name: 'Acme Corp',
        url: 'https://acme.example.com',
        description: 'Build better software.',
      },
      discover: { dir: FIXTURES_DIR },
      options: { cacheTtl: 0 },
    });

    expect(result.llmsTxt).toContain('https://acme.example.com/docs/api-reference');
    expect(result.llmsTxt).toContain('https://acme.example.com/blog/hello-world');
    expect(result.llmsTxt).toContain('https://acme.example.com/about');
    // Home should link to the root without trailing slash
    expect(result.llmsTxt).toMatch(/https:\/\/acme\.example\.com(?:\/?\))/);
  });
});

describe('e2e: real website crawling', () => {
  it(
    'crawls example.com and extracts page info',
    async () => {
      const pages = await crawlUrl('https://example.com', 1);

      expect(pages.length).toBeGreaterThanOrEqual(1);

      const home = pages[0];
      expect(home.title).toBeTruthy();
      expect(home.path).toContain('example.com');
      expect(home.content).toBeTruthy();
    },
    30_000,
  );

  it(
    'generates llms.txt for example.com via crawl discovery',
    async () => {
      const result = await generate({
        site: {
          name: 'Example Domain',
          url: 'https://example.com',
          description: 'An example website for testing.',
        },
        discover: { crawlUrl: 'https://example.com', maxDepth: 1 },
        options: { cacheTtl: 0 },
      });

      expect(result.llmsTxt).toContain('# Example Domain');
      expect(result.llmsTxt).toContain('> An example website for testing.');
      expect(result.pages.length).toBeGreaterThanOrEqual(1);
      expect(result.generatedAt).toBeInstanceOf(Date);
    },
    30_000,
  );

  it(
    'crawls jsonplaceholder.typicode.com and finds pages',
    async () => {
      const pages = await crawlUrl('https://jsonplaceholder.typicode.com', 1);

      expect(pages.length).toBeGreaterThanOrEqual(1);
      const home = pages[0];
      expect(home.title).toBeTruthy();
      expect(home.content.length).toBeGreaterThan(50);
    },
    30_000,
  );

  it(
    'generates full llms.txt output for jsonplaceholder via generate()',
    async () => {
      const result = await generate({
        site: {
          name: 'JSONPlaceholder',
          url: 'https://jsonplaceholder.typicode.com',
          description: 'Free fake API for testing and prototyping.',
        },
        discover: {
          crawlUrl: 'https://jsonplaceholder.typicode.com',
          maxDepth: 1,
        },
        options: { cacheTtl: 0 },
      });

      expect(result.llmsTxt).toContain('# JSONPlaceholder');
      expect(result.pages.length).toBeGreaterThanOrEqual(1);

      // Full text should have inline content
      expect(result.llmsFullTxt).toBeDefined();
      expect(result.llmsFullTxt!.length).toBeGreaterThan(result.llmsTxt.length);
    },
    30_000,
  );
});

describe('e2e: extractPageInfo on fetched HTML', () => {
  it(
    'extracts page info from a live fetch of example.com',
    async () => {
      const res = await fetch('https://example.com');
      const html = await res.text();
      const info = extractPageInfo(html, 'https://example.com');

      expect(info.title).toContain('Example Domain');
      expect(info.content).toBeTruthy();
      expect(info.path).toBe('https://example.com');
    },
    15_000,
  );

  it(
    'extracts page info from httpbin.org',
    async () => {
      const res = await fetch('https://httpbin.org');
      const html = await res.text();
      const info = extractPageInfo(html, 'https://httpbin.org');

      expect(info.title).toBeTruthy();
      expect(info.content).toBeTruthy();
      expect(info.path).toBe('https://httpbin.org');
    },
    15_000,
  );
});
