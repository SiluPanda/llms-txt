/**
 * Edge case tests for the generator module.
 *
 * Tests internal helper behaviors through the public API:
 * - stripTrailingSlash edge cases
 * - escapeMarkdownLinkTitle/Url edge cases
 * - resolveUrl edge cases
 * - matchPagesForSection edge cases
 * - organizeSections edge cases
 * - Empty/minimal inputs
 */
import { generateLlmsTxt, generateLlmsFullTxt, generateLlmsSmallTxt, estimateTokens } from '../../src/core/generator.js';
import type { LlmsTxtConfig, PageInfo } from '../../src/types.js';

function makeConfig(overrides?: Partial<LlmsTxtConfig>): LlmsTxtConfig {
  return {
    site: {
      name: 'Test Site',
      url: 'https://test.com',
      description: 'Test site description.',
    },
    ...overrides,
  };
}

function makePage(overrides?: Partial<PageInfo>): PageInfo {
  return {
    path: '/test',
    title: 'Test Page',
    description: 'Test description',
    content: 'Test content.',
    headings: [],
    ...overrides,
  };
}

// ─── URL resolution edge cases ───────────────────────────────────

describe('generator: URL resolution', () => {
  it('resolves root path to site URL without trailing slash', () => {
    const config = makeConfig({
      site: { name: 'Test', url: 'https://test.com/', description: 'Test.' },
    });
    const pages = [makePage({ path: '/', title: 'Home' })];
    const result = generateLlmsTxt(config, pages);

    expect(result).toContain('(https://test.com)');
    expect(result).not.toContain('(https://test.com/)');
  });

  it('resolves paths when site URL has trailing slash', () => {
    const config = makeConfig({
      site: { name: 'Test', url: 'https://test.com/', description: 'Test.' },
    });
    const pages = [makePage({ path: '/about', title: 'About' })];
    const result = generateLlmsTxt(config, pages);

    expect(result).toContain('https://test.com/about');
  });

  it('handles path without leading slash', () => {
    const config = makeConfig();
    const pages = [makePage({ path: 'docs/guide', title: 'Guide' })];
    const result = generateLlmsTxt(config, pages);

    expect(result).toContain('https://test.com/docs/guide');
  });

  it('preserves absolute HTTP URLs', () => {
    const config = makeConfig();
    const pages = [makePage({ path: 'http://external.com/page', title: 'External' })];
    const result = generateLlmsTxt(config, pages);

    expect(result).toContain('http://external.com/page');
    expect(result).not.toContain('https://test.com');
  });

  it('preserves absolute HTTPS URLs', () => {
    const config = makeConfig();
    const pages = [makePage({ path: 'https://cdn.example.com/doc', title: 'CDN Doc' })];
    const result = generateLlmsTxt(config, pages);

    expect(result).toContain('https://cdn.example.com/doc');
  });

  it('strips trailing slashes from page paths in URLs', () => {
    const config = makeConfig();
    const pages = [makePage({ path: '/docs/guide/', title: 'Guide' })];
    const result = generateLlmsTxt(config, pages);

    expect(result).toContain('https://test.com/docs/guide)');
    expect(result).not.toContain('https://test.com/docs/guide/)');
  });
});

// ─── Markdown escaping edge cases ────────────────────────────────

describe('generator: markdown escaping', () => {
  it('escapes multiple brackets in title', () => {
    const config = makeConfig();
    const pages = [makePage({ path: '/api', title: '[v1] [Deprecated] API' })];
    const result = generateLlmsTxt(config, pages);

    expect(result).toContain('\\[v1\\] \\[Deprecated\\] API');
  });

  it('escapes brackets and newlines together in title', () => {
    const config = makeConfig();
    const pages = [makePage({ path: '/api', title: '[New]\nAPI Docs' })];
    const result = generateLlmsTxt(config, pages);

    expect(result).toContain('\\[New\\] API Docs');
  });

  it('escapes multiple closing parentheses in URL', () => {
    const config = makeConfig();
    const pages = [makePage({ path: 'https://wiki.com/Page_(v1)_(draft)', title: 'Wiki' })];
    const result = generateLlmsTxt(config, pages);

    expect(result).toContain('Page_(v1%29_(draft%29');
  });

  it('handles description with newlines', () => {
    const config = makeConfig();
    const pages = [makePage({ path: '/multi', title: 'Multi', description: 'Line 1\nLine 2\nLine 3' })];
    const result = generateLlmsTxt(config, pages);

    expect(result).toContain(': Line 1 Line 2 Line 3');
    expect(result).not.toContain('\nLine 2');
  });

  it('handles empty title', () => {
    const config = makeConfig();
    const pages = [makePage({ path: '/empty', title: '', description: 'Has desc' })];
    const result = generateLlmsTxt(config, pages);

    expect(result).toContain('- [](https://test.com/empty): Has desc');
  });

  it('handles title with only special characters', () => {
    const config = makeConfig();
    const pages = [makePage({ path: '/special', title: '[]()\\' })];
    const result = generateLlmsTxt(config, pages);

    // Should not break markdown link syntax
    expect(result).toContain('\\[\\]');
  });
});

// ─── Section organization edge cases ─────────────────────────────

describe('generator: section organization', () => {
  it('empty pages array with sections produces empty sections', () => {
    const config = makeConfig({
      sections: [{ name: 'Docs', pathPrefix: '/docs' }],
    });
    const result = generateLlmsTxt(config, []);

    expect(result).toContain('## Docs');
    // No page links under the section
    expect(result).not.toContain('- [');
  });

  it('section with description but no matching pages', () => {
    const config = makeConfig({
      sections: [
        { name: 'Empty Section', pathPrefix: '/nonexistent', description: 'This section has no pages.' },
      ],
    });
    const pages = [makePage({ path: '/about', title: 'About' })];
    const result = generateLlmsTxt(config, pages);

    expect(result).toContain('## Empty Section');
    expect(result).toContain('This section has no pages.');
    expect(result).toContain('## Other');
    expect(result).toContain('[About]');
  });

  it('page assigned by explicit list takes priority over pathPrefix', () => {
    const config = makeConfig({
      sections: [
        { name: 'Featured', pages: ['/docs/guide'] },
        { name: 'Docs', pathPrefix: '/docs' },
      ],
    });
    const pages = [
      makePage({ path: '/docs/guide', title: 'Guide' }),
      makePage({ path: '/docs/api', title: 'API' }),
    ];
    const result = generateLlmsTxt(config, pages);

    // Guide should be in Featured (explicit match), not Docs
    const featuredIdx = result.indexOf('## Featured');
    const docsIdx = result.indexOf('## Docs');
    const featuredSection = result.slice(featuredIdx, docsIdx);
    const docsSection = result.slice(docsIdx);

    expect(featuredSection).toContain('[Guide]');
    expect(featuredSection).not.toContain('[API]');
    expect(docsSection).toContain('[API]');
    expect(docsSection).not.toContain('[Guide]');
  });

  it('page cannot be assigned to multiple sections', () => {
    const config = makeConfig({
      sections: [
        { name: 'Section A', pathPrefix: '/' },
        { name: 'Section B', pathPrefix: '/' },
      ],
    });
    const pages = [makePage({ path: '/page', title: 'Page' })];
    const result = generateLlmsTxt(config, pages);

    // Page should be in Section A (first match wins), not B
    const sectionAIdx = result.indexOf('## Section A');
    const sectionBIdx = result.indexOf('## Section B');
    const sectionA = result.slice(sectionAIdx, sectionBIdx);
    const sectionB = result.slice(sectionBIdx);

    expect(sectionA).toContain('[Page]');
    expect(sectionB).not.toContain('[Page]');
  });

  it('root pathPrefix "/" matches all paths', () => {
    const config = makeConfig({
      sections: [{ name: 'All', pathPrefix: '/' }],
    });
    const pages = [
      makePage({ path: '/', title: 'Home' }),
      makePage({ path: '/about', title: 'About' }),
      makePage({ path: '/docs/guide', title: 'Guide' }),
    ];
    const result = generateLlmsTxt(config, pages);

    expect(result).toContain('## All');
    expect(result).not.toContain('## Other');
    expect(result).toContain('[Home]');
    expect(result).toContain('[About]');
    expect(result).toContain('[Guide]');
  });

  it('no sections config creates "Pages" default section', () => {
    const config = makeConfig();
    const pages = [makePage({ path: '/a', title: 'A' }), makePage({ path: '/b', title: 'B' })];
    const result = generateLlmsTxt(config, pages);

    expect(result).toContain('## Pages');
    expect(result).not.toContain('## Other');
  });

  it('empty sections array creates "Pages" default section', () => {
    const config = makeConfig({ sections: [] });
    const pages = [makePage({ path: '/a', title: 'A' })];
    const result = generateLlmsTxt(config, pages);

    expect(result).toContain('## Pages');
  });
});

// ─── Full output edge cases ──────────────────────────────────────

describe('generator: full output edge cases', () => {
  it('pages with empty content produce no content block', () => {
    const config = makeConfig();
    const pages = [makePage({ path: '/empty', title: 'Empty', content: '' })];
    const result = generateLlmsFullTxt(config, pages);

    expect(result).toContain('### Empty');
    expect(result).toContain('URL: https://test.com/empty');
    // Should not have a content block — just the URL line
  });

  it('separator between pages in same section, not after last', () => {
    const config = makeConfig();
    const pages = [
      makePage({ path: '/a', title: 'A', content: 'Content A' }),
      makePage({ path: '/b', title: 'B', content: 'Content B' }),
      makePage({ path: '/c', title: 'C', content: 'Content C' }),
    ];
    const result = generateLlmsFullTxt(config, pages);

    // Count separators — should be 2 (between A-B and B-C)
    const separatorCount = (result.match(/^---$/gm) || []).length;
    expect(separatorCount).toBe(2);
  });

  it('sanitizes newlines in full output titles', () => {
    const config = makeConfig();
    const pages = [makePage({ path: '/multi', title: 'Multi\nLine', content: 'Content' })];
    const result = generateLlmsFullTxt(config, pages);

    expect(result).toContain('### Multi Line');
    expect(result).not.toContain('### Multi\nLine');
  });

  it('full output includes preamble and additional sections', () => {
    const config = makeConfig({
      options: {
        preamble: 'Full preamble here.',
        additionalSections: { 'Notes': 'Extra notes.' },
      },
    });
    const pages = [makePage()];
    const result = generateLlmsFullTxt(config, pages);

    expect(result).toContain('Full preamble here.');
    expect(result).toContain('## Notes');
    expect(result).toContain('Extra notes.');
  });
});

// ─── Small output edge cases ─────────────────────────────────────

describe('generator: small output edge cases', () => {
  it('no descriptions in small output', () => {
    const config = makeConfig();
    const pages = [
      makePage({ path: '/a', title: 'A', description: 'Description A' }),
      makePage({ path: '/b', title: 'B', description: 'Description B' }),
    ];
    const result = generateLlmsSmallTxt(config, pages);

    expect(result).not.toContain('Description A');
    expect(result).not.toContain('Description B');
    // Descriptions are appended as ": Description" — verify they're absent
    expect(result).not.toContain('): Description');
    expect(result).toContain('[A]');
    expect(result).toContain('[B]');
  });

  it('no blockquote in small output', () => {
    const config = makeConfig();
    const pages = [makePage()];
    const result = generateLlmsSmallTxt(config, pages);

    expect(result).not.toContain('> Test site description.');
  });

  it('no preamble in small output', () => {
    const config = makeConfig({ options: { preamble: 'Some preamble.' } });
    const pages = [makePage()];
    const result = generateLlmsSmallTxt(config, pages);

    expect(result).not.toContain('Some preamble.');
  });

  it('no additional sections in small output', () => {
    const config = makeConfig({
      options: { additionalSections: { 'Extra': 'Extra stuff.' } },
    });
    const pages = [makePage()];
    const result = generateLlmsSmallTxt(config, pages);

    expect(result).not.toContain('## Extra');
    expect(result).not.toContain('Extra stuff.');
  });
});

// ─── filterPages edge cases ──────────────────────────────────────

describe('generator: filterPages', () => {
  it('filter removes all pages', () => {
    const config = makeConfig({
      options: { filterPages: () => false },
    });
    const pages = [makePage({ path: '/a', title: 'A' }), makePage({ path: '/b', title: 'B' })];
    const result = generateLlmsTxt(config, pages);

    expect(result).not.toContain('[A]');
    expect(result).not.toContain('[B]');
  });

  it('filter keeps all pages', () => {
    const config = makeConfig({
      options: { filterPages: () => true },
    });
    const pages = [makePage({ path: '/a', title: 'A' }), makePage({ path: '/b', title: 'B' })];
    const result = generateLlmsTxt(config, pages);

    expect(result).toContain('[A]');
    expect(result).toContain('[B]');
  });

  it('filter applies to all output formats', () => {
    const config = makeConfig({
      options: { filterPages: (p) => p.path === '/keep' },
    });
    const pages = [
      makePage({ path: '/keep', title: 'Keep', content: 'Keep me' }),
      makePage({ path: '/drop', title: 'Drop', content: 'Drop me' }),
    ];

    const llmsTxt = generateLlmsTxt(config, pages);
    const fullTxt = generateLlmsFullTxt(config, pages);
    const smallTxt = generateLlmsSmallTxt(config, pages);

    for (const output of [llmsTxt, fullTxt, smallTxt]) {
      expect(output).toContain('Keep');
      expect(output).not.toContain('Drop');
    }
  });
});

// ─── estimateTokens edge cases ───────────────────────────────────

describe('generator: estimateTokens edge cases', () => {
  it('single character', () => {
    expect(estimateTokens('a')).toBe(1);
  });

  it('exactly 4 characters', () => {
    expect(estimateTokens('abcd')).toBe(1);
  });

  it('5 characters rounds up', () => {
    expect(estimateTokens('abcde')).toBe(2);
  });

  it('Unicode characters counted by length', () => {
    const emoji = '😀😀😀😀'; // Each emoji is 2 chars
    expect(estimateTokens(emoji)).toBe(Math.ceil(emoji.length / 4));
  });

  it('whitespace counted in tokens', () => {
    expect(estimateTokens('    ')).toBe(1);
    expect(estimateTokens('     ')).toBe(2);
  });
});
