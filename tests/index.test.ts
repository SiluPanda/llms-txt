import { generate, defineConfig } from '../src/index.js';
import type { LlmsTxtConfig } from '../src/types.js';

function makeConfig(overrides?: Partial<LlmsTxtConfig>): LlmsTxtConfig {
  return {
    site: {
      name: 'Index Test',
      url: 'https://index-test.com',
      description: 'Testing the main generate function.',
    },
    pages: [
      { path: '/', title: 'Home', description: 'Welcome home', content: 'Home content.' },
      { path: '/about', title: 'About', description: 'About us', content: 'About content.' },
    ],
    ...overrides,
  };
}

describe('generate', () => {
  it('returns LlmsTxtOutput with llmsTxt string', async () => {
    const config = makeConfig();
    const output = await generate(config);

    expect(output.llmsTxt).toBeDefined();
    expect(typeof output.llmsTxt).toBe('string');
    expect(output.llmsTxt).toContain('# Index Test');
    expect(output.llmsTxt).toContain('> Testing the main generate function.');
    expect(output.llmsTxt).toContain('[Home]');
    expect(output.llmsTxt).toContain('[About]');
  });

  it('includes llmsFullTxt by default', async () => {
    const config = makeConfig();
    const output = await generate(config);

    expect(output.llmsFullTxt).toBeDefined();
    expect(typeof output.llmsFullTxt).toBe('string');
    expect(output.llmsFullTxt).toContain('### Home');
    expect(output.llmsFullTxt).toContain('Home content.');
    expect(output.llmsFullTxt).toContain('### About');
    expect(output.llmsFullTxt).toContain('About content.');
  });

  it('omits llmsFullTxt when full option is false', async () => {
    const config = makeConfig({
      options: { full: false },
    });
    const output = await generate(config);

    expect(output.llmsTxt).toBeDefined();
    expect(output.llmsFullTxt).toBeUndefined();
  });

  it('returns pages array', async () => {
    const config = makeConfig();
    const output = await generate(config);

    expect(output.pages).toHaveLength(2);
    expect(output.pages[0].path).toBe('/');
    expect(output.pages[0].title).toBe('Home');
    expect(output.pages[1].path).toBe('/about');
    expect(output.pages[1].title).toBe('About');
  });

  it('returns generatedAt timestamp', async () => {
    const before = new Date();
    const config = makeConfig();
    const output = await generate(config);
    const after = new Date();

    expect(output.generatedAt).toBeInstanceOf(Date);
    expect(output.generatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(output.generatedAt.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it('converts PageConfig description and content defaults', async () => {
    const config = makeConfig({
      pages: [
        { path: '/minimal', title: 'Minimal' },
      ],
    });
    const output = await generate(config);

    expect(output.pages[0].description).toBe('');
    expect(output.pages[0].content).toBe('');
    expect(output.pages[0].headings).toEqual([]);
  });

  it('respects sections configuration', async () => {
    const config = makeConfig({
      sections: [
        { name: 'Main', pages: ['/'] },
        { name: 'Info', pages: ['/about'] },
      ],
    });
    const output = await generate(config);

    expect(output.llmsTxt).toContain('## Main');
    expect(output.llmsTxt).toContain('## Info');
    expect(output.llmsTxt).not.toContain('## Other');
  });

  it('works with no pages', async () => {
    const config = makeConfig({ pages: [] });
    const output = await generate(config);

    expect(output.llmsTxt).toContain('# Index Test');
    expect(output.pages).toHaveLength(0);
  });

  it('deduplicates pages with the same path (manual pages take priority)', async () => {
    const config = makeConfig({
      pages: [
        { path: '/about', title: 'Manual About', description: 'Manual description', content: 'Manual content.' },
        { path: '/faq', title: 'FAQ', description: 'FAQ page' },
        { path: '/about', title: 'Duplicate About', description: 'Should be ignored' },
      ],
    });
    const output = await generate(config);

    const aboutCount = output.pages.filter((p) => p.path === '/about').length;
    expect(aboutCount).toBe(1);
    expect(output.pages.find((p) => p.path === '/about')?.title).toBe('Manual About');
    expect(output.pages).toHaveLength(2);
  });
});

describe('defineConfig', () => {
  it('returns the same config object', () => {
    const config: LlmsTxtConfig = {
      site: {
        name: 'My Site',
        url: 'https://mysite.com',
        description: 'My site description.',
      },
      pages: [{ path: '/', title: 'Home' }],
    };

    const result = defineConfig(config);
    expect(result).toBe(config);
  });

  it('preserves all config properties', () => {
    const config: LlmsTxtConfig = {
      site: {
        name: 'Full Config',
        url: 'https://full.com',
        description: 'Full config test.',
      },
      pages: [{ path: '/', title: 'Home', description: 'Home page' }],
      sections: [{ name: 'Main', pathPrefix: '/' }],
      options: {
        full: true,
        preamble: 'Preamble text',
        cacheTtl: 30_000,
      },
    };

    const result = defineConfig(config);
    expect(result.site.name).toBe('Full Config');
    expect(result.pages).toHaveLength(1);
    expect(result.sections).toHaveLength(1);
    expect(result.options?.preamble).toBe('Preamble text');
    expect(result.options?.cacheTtl).toBe(30_000);
  });
});

describe('generate — llmsSmallTxt', () => {
  it('includes llmsSmallTxt by default', async () => {
    const config = makeConfig();
    const output = await generate(config);

    expect(output.llmsSmallTxt).toBeDefined();
    expect(typeof output.llmsSmallTxt).toBe('string');
    expect(output.llmsSmallTxt).toContain('# Index Test');
    expect(output.llmsSmallTxt).toContain('[Home]');
    expect(output.llmsSmallTxt).toContain('[About]');
  });

  it('omits descriptions in llmsSmallTxt', async () => {
    const config = makeConfig();
    const output = await generate(config);

    expect(output.llmsSmallTxt).not.toContain('Welcome home');
    expect(output.llmsSmallTxt).not.toContain('About us');
  });

  it('omits llmsSmallTxt when small option is false', async () => {
    const config = makeConfig({
      options: { small: false },
    });
    const output = await generate(config);

    expect(output.llmsTxt).toBeDefined();
    expect(output.llmsSmallTxt).toBeUndefined();
  });

  it('includes llmsSmallTxt when small option is explicitly true', async () => {
    const config = makeConfig({
      options: { small: true },
    });
    const output = await generate(config);

    expect(output.llmsSmallTxt).toBeDefined();
  });
});

describe('generate — tokenCounts', () => {
  it('returns tokenCounts for all generated outputs', async () => {
    const config = makeConfig();
    const output = await generate(config);

    expect(output.tokenCounts).toBeDefined();
    expect(output.tokenCounts!.llmsTxt).toBeGreaterThan(0);
    expect(output.tokenCounts!.llmsFullTxt).toBeGreaterThan(0);
    expect(output.tokenCounts!.llmsSmallTxt).toBeGreaterThan(0);
  });

  it('token counts match estimateTokens formula (ceil(length / 4))', async () => {
    const config = makeConfig();
    const output = await generate(config);

    expect(output.tokenCounts!.llmsTxt).toBe(Math.ceil(output.llmsTxt.length / 4));
    expect(output.tokenCounts!.llmsFullTxt).toBe(Math.ceil(output.llmsFullTxt!.length / 4));
    expect(output.tokenCounts!.llmsSmallTxt).toBe(Math.ceil(output.llmsSmallTxt!.length / 4));
  });

  it('omits llmsFullTxt token count when full is disabled', async () => {
    const config = makeConfig({
      options: { full: false },
    });
    const output = await generate(config);

    expect(output.tokenCounts).toBeDefined();
    expect(output.tokenCounts!.llmsTxt).toBeGreaterThan(0);
    expect(output.tokenCounts!.llmsFullTxt).toBeUndefined();
  });

  it('omits llmsSmallTxt token count when small is disabled', async () => {
    const config = makeConfig({
      options: { small: false },
    });
    const output = await generate(config);

    expect(output.tokenCounts).toBeDefined();
    expect(output.tokenCounts!.llmsTxt).toBeGreaterThan(0);
    expect(output.tokenCounts!.llmsSmallTxt).toBeUndefined();
  });

  it('llmsSmallTxt token count is smaller than llmsTxt', async () => {
    const config = makeConfig();
    const output = await generate(config);

    expect(output.tokenCounts!.llmsSmallTxt).toBeLessThan(output.tokenCounts!.llmsTxt);
  });
});

describe('generate — maxContentLength', () => {
  it('truncates long content with ellipsis', async () => {
    const config = makeConfig({
      pages: [
        { path: '/long', title: 'Long Page', description: 'Has long content', content: 'a'.repeat(500) },
      ],
      options: { maxContentLength: 100 },
    });
    const output = await generate(config);

    const page = output.pages.find((p) => p.path === '/long');
    expect(page).toBeDefined();
    expect(page!.content).toHaveLength(103); // 100 chars + '...'
    expect(page!.content.endsWith('...')).toBe(true);
  });

  it('does not truncate content shorter than limit', async () => {
    const config = makeConfig({
      pages: [
        { path: '/short', title: 'Short Page', description: 'Short content', content: 'Hello world' },
      ],
      options: { maxContentLength: 100 },
    });
    const output = await generate(config);

    const page = output.pages.find((p) => p.path === '/short');
    expect(page).toBeDefined();
    expect(page!.content).toBe('Hello world');
  });

  it('does not truncate when maxContentLength is not set', async () => {
    const longContent = 'a'.repeat(10000);
    const config = makeConfig({
      pages: [
        { path: '/long', title: 'Long Page', content: longContent },
      ],
    });
    const output = await generate(config);

    const page = output.pages.find((p) => p.path === '/long');
    expect(page!.content).toBe(longContent);
  });

  it('does not truncate content exactly at the limit', async () => {
    const config = makeConfig({
      pages: [
        { path: '/exact', title: 'Exact Page', content: 'a'.repeat(50) },
      ],
      options: { maxContentLength: 50 },
    });
    const output = await generate(config);

    const page = output.pages.find((p) => p.path === '/exact');
    expect(page!.content).toBe('a'.repeat(50));
    expect(page!.content).not.toContain('...');
  });

  it('truncated content appears in llmsFullTxt output', async () => {
    const config = makeConfig({
      pages: [
        { path: '/truncated', title: 'Truncated', content: 'b'.repeat(200) },
      ],
      options: { maxContentLength: 50 },
    });
    const output = await generate(config);

    expect(output.llmsFullTxt).toContain('b'.repeat(50) + '...');
    expect(output.llmsFullTxt).not.toContain('b'.repeat(51));
  });
});
