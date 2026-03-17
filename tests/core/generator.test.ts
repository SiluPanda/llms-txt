import { generateLlmsTxt, generateLlmsFullTxt } from '../../src/core/generator.js';
import type { LlmsTxtConfig, PageInfo } from '../../src/types.js';

function makeConfig(overrides?: Partial<LlmsTxtConfig>): LlmsTxtConfig {
  return {
    site: {
      name: 'Acme Corp',
      url: 'https://acme.com',
      description: 'Acme Corp builds innovative solutions.',
    },
    ...overrides,
  };
}

function makePage(overrides?: Partial<PageInfo>): PageInfo {
  return {
    path: '/test',
    title: 'Test Page',
    description: 'A test page',
    content: 'Test page content.',
    headings: [],
    ...overrides,
  };
}

describe('generateLlmsTxt', () => {
  it('generates correct format with site name and description', () => {
    const config = makeConfig();
    const pages = [makePage({ path: '/', title: 'Home', description: 'Welcome home' })];
    const result = generateLlmsTxt(config, pages);

    expect(result).toContain('# Acme Corp');
    expect(result).toContain('> Acme Corp builds innovative solutions.');
    expect(result).toContain('- [Home](https://acme.com): Welcome home');
  });

  it('creates single "Pages" section when no sections defined', () => {
    const config = makeConfig();
    const pages = [
      makePage({ path: '/about', title: 'About' }),
      makePage({ path: '/contact', title: 'Contact' }),
    ];
    const result = generateLlmsTxt(config, pages);

    expect(result).toContain('## Pages');
    expect(result).toContain('- [About](https://acme.com/about)');
    expect(result).toContain('- [Contact](https://acme.com/contact)');
  });

  it('organizes pages into sections by pathPrefix', () => {
    // Sections are processed in order; more specific prefixes should come first
    // to avoid a broad prefix like '/' consuming everything.
    const config = makeConfig({
      sections: [
        { name: 'Products', pathPrefix: '/products' },
        { name: 'Main', pathPrefix: '/' },
      ],
    });
    const pages = [
      makePage({ path: '/', title: 'Home' }),
      makePage({ path: '/about', title: 'About' }),
      makePage({ path: '/products', title: 'Products' }),
      makePage({ path: '/products/widget', title: 'Widget' }),
    ];
    const result = generateLlmsTxt(config, pages);

    expect(result).toContain('## Products');
    expect(result).toContain('## Main');

    // Products section should contain product pages
    const productsSectionIdx = result.indexOf('## Products');
    const mainSectionIdx = result.indexOf('## Main');
    const productsSection = result.slice(productsSectionIdx, mainSectionIdx);
    expect(productsSection).toContain('- [Products](https://acme.com/products)');
    expect(productsSection).toContain('- [Widget](https://acme.com/products/widget)');

    // Main section should contain the remaining pages
    const mainSection = result.slice(mainSectionIdx);
    expect(mainSection).toContain('- [Home](https://acme.com)');
    expect(mainSection).toContain('- [About](https://acme.com/about)');
    // Product pages should NOT be in Main since they were already assigned
    expect(mainSection).not.toContain('Widget');
  });

  it('organizes pages into sections by explicit page lists', () => {
    const config = makeConfig({
      sections: [
        { name: 'Key Pages', pages: ['/about', '/contact'] },
      ],
    });
    const pages = [
      makePage({ path: '/', title: 'Home' }),
      makePage({ path: '/about', title: 'About' }),
      makePage({ path: '/contact', title: 'Contact' }),
    ];
    const result = generateLlmsTxt(config, pages);

    expect(result).toContain('## Key Pages');
    // Home should end up in "Other" since it's not in the explicit list
    expect(result).toContain('## Other');

    const keyPagesIdx = result.indexOf('## Key Pages');
    const otherIdx = result.indexOf('## Other');
    const keyPagesSection = result.slice(keyPagesIdx, otherIdx);
    expect(keyPagesSection).toContain('- [About]');
    expect(keyPagesSection).toContain('- [Contact]');
    expect(keyPagesSection).not.toContain('- [Home]');
  });

  it('puts unmatched pages in "Other" section', () => {
    const config = makeConfig({
      sections: [
        { name: 'Blog', pathPrefix: '/blog' },
      ],
    });
    const pages = [
      makePage({ path: '/blog/post-1', title: 'Post 1' }),
      makePage({ path: '/about', title: 'About' }),
    ];
    const result = generateLlmsTxt(config, pages);

    expect(result).toContain('## Blog');
    expect(result).toContain('## Other');

    const otherIdx = result.indexOf('## Other');
    const otherSection = result.slice(otherIdx);
    expect(otherSection).toContain('- [About]');
  });

  it('does not create "Other" section if all pages are matched', () => {
    const config = makeConfig({
      sections: [
        { name: 'All', pathPrefix: '/' },
      ],
    });
    const pages = [
      makePage({ path: '/about', title: 'About' }),
      makePage({ path: '/contact', title: 'Contact' }),
    ];
    const result = generateLlmsTxt(config, pages);

    expect(result).not.toContain('## Other');
  });

  it('applies filterPages option', () => {
    const config = makeConfig({
      options: {
        filterPages: (page) => page.path !== '/secret',
      },
    });
    const pages = [
      makePage({ path: '/public', title: 'Public' }),
      makePage({ path: '/secret', title: 'Secret' }),
    ];
    const result = generateLlmsTxt(config, pages);

    expect(result).toContain('- [Public]');
    expect(result).not.toContain('Secret');
  });

  it('includes preamble after description', () => {
    const config = makeConfig({
      options: {
        preamble: 'This file provides information for LLMs about our site.',
      },
    });
    const pages = [makePage()];
    const result = generateLlmsTxt(config, pages);

    const descIdx = result.indexOf('> Acme Corp builds innovative solutions.');
    const preambleIdx = result.indexOf('This file provides information for LLMs about our site.');
    const sectionIdx = result.indexOf('## Pages');

    expect(preambleIdx).toBeGreaterThan(descIdx);
    expect(preambleIdx).toBeLessThan(sectionIdx);
  });

  it('includes additionalSections at the end', () => {
    const config = makeConfig({
      options: {
        additionalSections: {
          'API Reference': 'See our API docs at https://api.acme.com',
          'Contact': 'Email us at hello@acme.com',
        },
      },
    });
    const pages = [makePage()];
    const result = generateLlmsTxt(config, pages);

    expect(result).toContain('## API Reference');
    expect(result).toContain('See our API docs at https://api.acme.com');
    expect(result).toContain('## Contact');
    expect(result).toContain('Email us at hello@acme.com');

    // Additional sections should come after the main page sections
    const pagesIdx = result.indexOf('## Pages');
    const apiIdx = result.indexOf('## API Reference');
    expect(apiIdx).toBeGreaterThan(pagesIdx);
  });

  it('normalizes URLs by removing trailing slashes', () => {
    const config = makeConfig({
      site: { name: 'Test', url: 'https://example.com/', description: 'Test' },
    });
    const pages = [
      makePage({ path: '/about/', title: 'About' }),
    ];
    const result = generateLlmsTxt(config, pages);

    expect(result).toContain('https://example.com/about)');
    expect(result).not.toContain('https://example.com/about/)');
  });

  it('resolves relative paths to full URLs', () => {
    const config = makeConfig();
    const pages = [
      makePage({ path: '/docs/guide', title: 'Guide' }),
      makePage({ path: 'no-leading-slash', title: 'No Slash' }),
    ];
    const result = generateLlmsTxt(config, pages);

    expect(result).toContain('https://acme.com/docs/guide');
    expect(result).toContain('https://acme.com/no-leading-slash');
  });

  it('preserves absolute URLs as-is', () => {
    const config = makeConfig();
    const pages = [
      makePage({ path: 'https://external.com/page', title: 'External' }),
    ];
    const result = generateLlmsTxt(config, pages);

    expect(result).toContain('https://external.com/page');
  });

  it('includes section description when provided', () => {
    const config = makeConfig({
      sections: [
        { name: 'Docs', pathPrefix: '/docs', description: 'Technical documentation and guides.' },
      ],
    });
    const pages = [
      makePage({ path: '/docs/intro', title: 'Intro' }),
    ];
    const result = generateLlmsTxt(config, pages);

    expect(result).toContain('## Docs');
    expect(result).toContain('Technical documentation and guides.');
  });

  it('omits description suffix when page has no description', () => {
    const config = makeConfig();
    const pages = [
      makePage({ path: '/nodesc', title: 'No Desc', description: '' }),
    ];
    const result = generateLlmsTxt(config, pages);

    expect(result).toContain('- [No Desc](https://acme.com/nodesc)');
    expect(result).not.toContain('- [No Desc](https://acme.com/nodesc):');
  });

  it('ends output with a newline', () => {
    const config = makeConfig();
    const pages = [makePage()];
    const result = generateLlmsTxt(config, pages);
    expect(result.endsWith('\n')).toBe(true);
  });
});

describe('generateLlmsFullTxt', () => {
  it('includes full page content', () => {
    const config = makeConfig();
    const pages = [
      makePage({ path: '/about', title: 'About', content: 'Full about page content here.' }),
    ];
    const result = generateLlmsFullTxt(config, pages);

    expect(result).toContain('### About');
    expect(result).toContain('URL: https://acme.com/about');
    expect(result).toContain('Full about page content here.');
  });

  it('uses --- separators between pages within a section', () => {
    const config = makeConfig();
    const pages = [
      makePage({ path: '/page-1', title: 'Page 1', content: 'Content 1' }),
      makePage({ path: '/page-2', title: 'Page 2', content: 'Content 2' }),
    ];
    const result = generateLlmsFullTxt(config, pages);

    expect(result).toContain('---');
    // The separator should be between the two pages
    const page1Idx = result.indexOf('### Page 1');
    const separatorIdx = result.indexOf('---');
    const page2Idx = result.indexOf('### Page 2');
    expect(separatorIdx).toBeGreaterThan(page1Idx);
    expect(separatorIdx).toBeLessThan(page2Idx);
  });

  it('does not add separator after the last page in a section', () => {
    const config = makeConfig();
    const pages = [
      makePage({ path: '/only', title: 'Only Page', content: 'Solo content' }),
    ];
    const result = generateLlmsFullTxt(config, pages);

    expect(result).not.toContain('---');
  });

  it('includes site name and description', () => {
    const config = makeConfig();
    const pages = [makePage()];
    const result = generateLlmsFullTxt(config, pages);

    expect(result).toContain('# Acme Corp');
    expect(result).toContain('> Acme Corp builds innovative solutions.');
  });

  it('includes preamble when provided', () => {
    const config = makeConfig({
      options: { preamble: 'Full content follows.' },
    });
    const pages = [makePage()];
    const result = generateLlmsFullTxt(config, pages);

    expect(result).toContain('Full content follows.');
  });

  it('includes additionalSections', () => {
    const config = makeConfig({
      options: {
        additionalSections: { 'Extra': 'Extra content here.' },
      },
    });
    const pages = [makePage()];
    const result = generateLlmsFullTxt(config, pages);

    expect(result).toContain('## Extra');
    expect(result).toContain('Extra content here.');
  });

  it('applies filterPages option', () => {
    const config = makeConfig({
      options: {
        filterPages: (page) => page.path !== '/hidden',
      },
    });
    const pages = [
      makePage({ path: '/visible', title: 'Visible', content: 'Yes' }),
      makePage({ path: '/hidden', title: 'Hidden', content: 'No' }),
    ];
    const result = generateLlmsFullTxt(config, pages);

    expect(result).toContain('### Visible');
    expect(result).not.toContain('### Hidden');
  });

  it('ends output with a newline', () => {
    const config = makeConfig();
    const pages = [makePage()];
    const result = generateLlmsFullTxt(config, pages);
    expect(result.endsWith('\n')).toBe(true);
  });
});
