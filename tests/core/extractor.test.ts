import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractPageInfo } from '../../src/core/extractor.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(__dirname, '../fixtures/pages');

function readFixture(name: string): string {
  return readFileSync(path.join(fixturesDir, name), 'utf-8');
}

describe('extractPageInfo', () => {
  describe('title extraction', () => {
    it('extracts title from <title> tag', () => {
      const html = '<html><head><title>My Page Title</title></head><body></body></html>';
      const result = extractPageInfo(html, '/test');
      expect(result.title).toBe('My Page Title');
    });

    it('falls back to <h1> when no <title>', () => {
      const html = '<html><head></head><body><h1>Heading Title</h1></body></html>';
      const result = extractPageInfo(html, '/test');
      expect(result.title).toBe('Heading Title');
    });

    it('returns empty string when neither <title> nor <h1> exist', () => {
      const html = '<html><head></head><body><p>Just a paragraph</p></body></html>';
      const result = extractPageInfo(html, '/test');
      expect(result.title).toBe('');
    });

    it('prefers <title> over <h1>', () => {
      const html = '<html><head><title>Title Tag</title></head><body><h1>H1 Tag</h1></body></html>';
      const result = extractPageInfo(html, '/test');
      expect(result.title).toBe('Title Tag');
    });

    it('trims whitespace from title', () => {
      const html = '<html><head><title>  Spaced Title  </title></head><body></body></html>';
      const result = extractPageInfo(html, '/test');
      expect(result.title).toBe('Spaced Title');
    });
  });

  describe('meta description extraction', () => {
    it('extracts meta description', () => {
      const html = '<html><head><meta name="description" content="A brief description"></head><body></body></html>';
      const result = extractPageInfo(html, '/test');
      expect(result.description).toBe('A brief description');
    });

    it('returns empty string when no meta description', () => {
      const html = '<html><head></head><body></body></html>';
      const result = extractPageInfo(html, '/test');
      expect(result.description).toBe('');
    });

    it('trims whitespace from description', () => {
      const html = '<html><head><meta name="description" content="  Spaced Desc  "></head><body></body></html>';
      const result = extractPageInfo(html, '/test');
      expect(result.description).toBe('Spaced Desc');
    });
  });

  describe('headings extraction', () => {
    it('extracts h2 and h3 headings', () => {
      const html = `
        <html><head></head><body>
          <h2>Section One</h2>
          <p>Content</p>
          <h3>Subsection A</h3>
          <p>More content</p>
          <h2>Section Two</h2>
        </body></html>
      `;
      const result = extractPageInfo(html, '/test');
      expect(result.headings).toEqual(['Section One', 'Subsection A', 'Section Two']);
    });

    it('does not include h1, h4, h5, h6 in headings', () => {
      const html = `
        <html><head></head><body>
          <h1>Main Title</h1>
          <h2>Section</h2>
          <h4>Sub-sub</h4>
          <h5>Deep</h5>
          <h6>Deepest</h6>
        </body></html>
      `;
      const result = extractPageInfo(html, '/test');
      expect(result.headings).toEqual(['Section']);
    });

    it('skips empty headings', () => {
      const html = '<html><head></head><body><h2></h2><h2>Valid</h2><h3>  </h3></body></html>';
      const result = extractPageInfo(html, '/test');
      expect(result.headings).toEqual(['Valid']);
    });
  });

  describe('main content extraction', () => {
    it('extracts content from <main> tag', () => {
      const html = `
        <html><head></head><body>
          <nav>Navigation</nav>
          <main><p>Main content here</p></main>
          <footer>Footer stuff</footer>
        </body></html>
      `;
      const result = extractPageInfo(html, '/test');
      expect(result.content).toContain('Main content here');
      expect(result.content).not.toContain('Navigation');
      expect(result.content).not.toContain('Footer stuff');
    });

    it('falls back to <article> when no <main>', () => {
      const html = `
        <html><head></head><body>
          <nav>Nav</nav>
          <article><p>Article content</p></article>
          <footer>Footer</footer>
        </body></html>
      `;
      const result = extractPageInfo(html, '/test');
      expect(result.content).toContain('Article content');
    });

    it('falls back to <body> when no <main> or <article>', () => {
      const html = `
        <html><head></head><body>
          <p>Body content</p>
        </body></html>
      `;
      const result = extractPageInfo(html, '/test');
      expect(result.content).toContain('Body content');
    });

    it('strips nav, footer, script, and style from content', () => {
      const html = `
        <html><head></head><body>
          <main>
            <nav>Should be removed</nav>
            <header>Header removed</header>
            <p>Keep this</p>
            <aside>Sidebar removed</aside>
            <footer>Footer removed</footer>
            <script>var x = 1;</script>
            <style>.cls { color: red; }</style>
          </main>
        </body></html>
      `;
      const result = extractPageInfo(html, '/test');
      expect(result.content).toContain('Keep this');
      expect(result.content).not.toContain('Should be removed');
      expect(result.content).not.toContain('Header removed');
      expect(result.content).not.toContain('Footer removed');
      expect(result.content).not.toContain('Sidebar removed');
      expect(result.content).not.toContain('var x = 1');
      expect(result.content).not.toContain('color: red');
    });

    it('collapses whitespace in extracted content', () => {
      const html = `
        <html><head></head><body>
          <main>
            <p>Word1    Word2

            Word3</p>
          </main>
        </body></html>
      `;
      const result = extractPageInfo(html, '/test');
      expect(result.content).toBe('Word1 Word2 Word3');
    });
  });

  describe('JSON-LD structured data extraction', () => {
    it('extracts JSON-LD structured data', () => {
      const html = `
        <html><head>
          <script type="application/ld+json">
            {"@type": "Organization", "name": "Test Corp"}
          </script>
        </head><body></body></html>
      `;
      const result = extractPageInfo(html, '/test');
      expect(result.structuredData).toBeDefined();
      expect(result.structuredData).toHaveLength(1);
      expect(result.structuredData![0]['@type']).toBe('Organization');
      expect(result.structuredData![0]['name']).toBe('Test Corp');
    });

    it('extracts multiple JSON-LD blocks', () => {
      const html = `
        <html><head>
          <script type="application/ld+json">{"@type": "Organization", "name": "Org"}</script>
          <script type="application/ld+json">{"@type": "WebSite", "name": "Site"}</script>
        </head><body></body></html>
      `;
      const result = extractPageInfo(html, '/test');
      expect(result.structuredData).toHaveLength(2);
    });

    it('handles JSON-LD arrays', () => {
      const html = `
        <html><head>
          <script type="application/ld+json">
            [{"@type": "Thing", "name": "A"}, {"@type": "Thing", "name": "B"}]
          </script>
        </head><body></body></html>
      `;
      const result = extractPageInfo(html, '/test');
      expect(result.structuredData).toHaveLength(2);
    });

    it('does not include structuredData key when no JSON-LD found', () => {
      const html = '<html><head></head><body></body></html>';
      const result = extractPageInfo(html, '/test');
      expect(result.structuredData).toBeUndefined();
    });

    it('skips malformed JSON-LD gracefully', () => {
      const html = `
        <html><head>
          <script type="application/ld+json">{ this is not valid json }</script>
          <script type="application/ld+json">{"@type": "Valid", "name": "OK"}</script>
        </head><body></body></html>
      `;
      const result = extractPageInfo(html, '/test');
      expect(result.structuredData).toHaveLength(1);
      expect(result.structuredData![0]['@type']).toBe('Valid');
    });
  });

  describe('OpenGraph metadata extraction', () => {
    it('extracts OpenGraph metadata', () => {
      const html = `
        <html><head>
          <meta property="og:title" content="OG Title">
          <meta property="og:description" content="OG Desc">
          <meta property="og:type" content="website">
          <meta property="og:image" content="https://example.com/image.png">
        </head><body></body></html>
      `;
      const result = extractPageInfo(html, '/test');
      expect(result.og).toBeDefined();
      expect(result.og!.title).toBe('OG Title');
      expect(result.og!.description).toBe('OG Desc');
      expect(result.og!.type).toBe('website');
      expect(result.og!.image).toBe('https://example.com/image.png');
    });

    it('extracts partial OpenGraph metadata', () => {
      const html = `
        <html><head>
          <meta property="og:title" content="Just a Title">
        </head><body></body></html>
      `;
      const result = extractPageInfo(html, '/test');
      expect(result.og).toBeDefined();
      expect(result.og!.title).toBe('Just a Title');
      expect(result.og!.description).toBeUndefined();
    });

    it('does not include og key when no OG tags found', () => {
      const html = '<html><head></head><body></body></html>';
      const result = extractPageInfo(html, '/test');
      expect(result.og).toBeUndefined();
    });
  });

  describe('error handling', () => {
    it('handles malformed HTML gracefully', () => {
      const html = '<html><head><title>Broken</title><body><p>Unclosed paragraph<div>Mixed up';
      const result = extractPageInfo(html, '/broken');
      expect(result.path).toBe('/broken');
      expect(result.title).toBe('Broken');
    });

    it('handles empty HTML gracefully', () => {
      const result = extractPageInfo('', '/empty');
      expect(result.path).toBe('/empty');
      expect(result.title).toBe('');
      expect(result.description).toBe('');
      expect(result.content).toBe('');
      expect(result.headings).toEqual([]);
    });

    it('sets path from the url parameter', () => {
      const html = '<html><head><title>Test</title></head><body></body></html>';
      const result = extractPageInfo(html, '/my/custom/path');
      expect(result.path).toBe('/my/custom/path');
    });
  });

  describe('fixture files', () => {
    it('correctly extracts info from homepage fixture', () => {
      const html = readFixture('index.html');
      const result = extractPageInfo(html, '/');

      expect(result.title).toBe('Acme Corp - Building the Future');
      expect(result.description).toBe('Acme Corp is a leading provider of innovative solutions for modern businesses.');
      expect(result.headings).toContain('Our Mission');
      expect(result.headings).toContain('Why Choose Us');
      expect(result.headings).toContain('Our Values');
      expect(result.content).toContain('innovative solutions');
      expect(result.content).not.toContain('analytics loaded');
      expect(result.content).not.toContain('Privacy Policy');

      expect(result.structuredData).toBeDefined();
      expect(result.structuredData![0]['@type']).toBe('Organization');

      expect(result.og).toBeDefined();
      expect(result.og!.title).toBe('Acme Corp - Building the Future');
      expect(result.og!.type).toBe('website');
      expect(result.og!.image).toBe('https://acme.com/og-image.png');
    });

    it('correctly extracts info from product detail fixture with FAQ schema', () => {
      const html = readFixture('products/widget.html');
      const result = extractPageInfo(html, '/products/widget');

      expect(result.title).toBe('SuperWidget 3000 - Acme Corp');
      expect(result.structuredData).toBeDefined();
      expect(result.structuredData![0]['@type']).toBe('FAQPage');
    });
  });
});
