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
