import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverFromDirectory } from '../../src/core/crawler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(__dirname, '../fixtures/pages');

describe('discoverFromDirectory', () => {
  it('discovers HTML files in a directory', async () => {
    const pages = await discoverFromDirectory(fixturesDir);

    expect(pages.length).toBeGreaterThanOrEqual(4);
    const paths = pages.map((p) => p.path);
    expect(paths).toContain('/');
    expect(paths).toContain('/about');
    expect(paths).toContain('/products');
    expect(paths).toContain('/products/widget');
  });

  it('derives correct URL paths from file paths', async () => {
    const pages = await discoverFromDirectory(fixturesDir);
    const pathMap = new Map(pages.map((p) => [p.path, p]));

    // index.html -> /
    expect(pathMap.has('/')).toBe(true);

    // about.html -> /about
    expect(pathMap.has('/about')).toBe(true);

    // products/index.html -> /products
    expect(pathMap.has('/products')).toBe(true);

    // products/widget.html -> /products/widget
    expect(pathMap.has('/products/widget')).toBe(true);
  });

  it('extracts page info from discovered files', async () => {
    const pages = await discoverFromDirectory(fixturesDir);
    const homePage = pages.find((p) => p.path === '/');

    expect(homePage).toBeDefined();
    expect(homePage!.title).toBe('Acme Corp - Building the Future');
    expect(homePage!.description).toContain('Acme Corp');
    expect(homePage!.content).toBeTruthy();
    expect(homePage!.headings.length).toBeGreaterThan(0);
  });

  it('handles nested directories', async () => {
    const pages = await discoverFromDirectory(fixturesDir);
    const nestedPaths = pages.filter((p) => p.path.startsWith('/products'));

    expect(nestedPaths.length).toBe(2);
  });

  it('respects include patterns', async () => {
    // Only include files directly in the root (not in subdirectories)
    const pages = await discoverFromDirectory(fixturesDir, ['*.html']);

    const paths = pages.map((p) => p.path);
    expect(paths).toContain('/');
    expect(paths).toContain('/about');
    expect(paths).not.toContain('/products');
    expect(paths).not.toContain('/products/widget');
  });

  it('respects exclude patterns', async () => {
    const pages = await discoverFromDirectory(fixturesDir, undefined, ['**/products/**']);

    const paths = pages.map((p) => p.path);
    expect(paths).toContain('/');
    expect(paths).toContain('/about');
    expect(paths).not.toContain('/products');
    expect(paths).not.toContain('/products/widget');
  });

  it('returns empty array for non-existent directory', async () => {
    const pages = await discoverFromDirectory('/non/existent/dir');
    expect(pages).toEqual([]);
  });
});
