/**
 * Edge case tests for the validator module.
 *
 * Tests:
 * - Malformed markdown link detection
 * - Complex content patterns
 * - Multiple issue combinations
 * - Line number accuracy
 */
import { validateLlmsTxt } from '../../src/core/validator.js';

describe('validator: malformed link detection', () => {
  it('detects unclosed brackets in links', () => {
    const content = [
      '# My Site',
      '',
      '> Description.',
      '',
      '## Pages',
      '',
      '- [Unclosed bracket with no parens',
    ].join('\n');
    const issues = validateLlmsTxt(content);

    const malformed = issues.find((i) => i.message.includes('Malformed'));
    expect(malformed).toBeDefined();
    expect(malformed!.level).toBe('error');
    expect(malformed!.line).toBe(7);
  });

  it('detects link with bracket but no parentheses', () => {
    const content = [
      '# My Site',
      '',
      '> Description.',
      '',
      '## Pages',
      '',
      '- [Link text] missing parens',
    ].join('\n');
    const issues = validateLlmsTxt(content);

    const malformed = issues.find((i) => i.message.includes('Malformed'));
    expect(malformed).toBeDefined();
    expect(malformed!.level).toBe('error');
  });

  it('does not flag valid links as malformed', () => {
    const content = [
      '# My Site',
      '',
      '> Description.',
      '',
      '## Pages',
      '',
      '- [Valid](https://example.com): A valid link',
      '- [Also Valid](https://example.com/page)',
    ].join('\n');
    const issues = validateLlmsTxt(content);

    const malformed = issues.find((i) => i.message.includes('Malformed'));
    expect(malformed).toBeUndefined();
  });

  it('does not flag non-link list items', () => {
    const content = [
      '# My Site',
      '',
      '> Description.',
      '',
      '## Pages',
      '',
      '- [Valid](https://example.com): A link',
      '- This is just a plain list item',
    ].join('\n');
    const issues = validateLlmsTxt(content);

    const malformed = issues.find((i) => i.message.includes('Malformed'));
    expect(malformed).toBeUndefined();
  });
});

describe('validator: multiple issues in one file', () => {
  it('reports all issues found', () => {
    const content = [
      '', // H1 not on first line
      '# Site',
      '',
      '## Pages', // No blockquote after H1
      '',
      '- [](https://example.com): Empty title',
      '- [Good](): Empty URL',
      '- [Relative](/path): Relative URL',
    ].join('\n');
    const issues = validateLlmsTxt(content);

    // Should have H1 position warning
    expect(issues.find((i) => i.message.includes('first line'))).toBeDefined();
    // Should have missing blockquote warning
    expect(issues.find((i) => i.message.includes('blockquote'))).toBeDefined();
    // Should have empty title warning
    expect(issues.find((i) => i.message.includes('empty title'))).toBeDefined();
    // Should have empty URL error
    expect(issues.find((i) => i.message.includes('empty URL'))).toBeDefined();
    // Should have non-absolute URL warning
    expect(issues.find((i) => i.message.includes('not absolute'))).toBeDefined();

    expect(issues.length).toBeGreaterThanOrEqual(5);
  });

  it('returns correct line numbers for each issue', () => {
    const content = [
      '# My Site',
      '',
      '> Description.',
      '',
      '## Pages',
      '',
      '- [Good](https://example.com)',
      '- [](https://example.com/empty): Empty title on line 8',
      '- [No URL](): Empty URL on line 9',
    ].join('\n');
    const issues = validateLlmsTxt(content);

    const emptyTitle = issues.find((i) => i.message.includes('empty title'));
    expect(emptyTitle!.line).toBe(8);

    const emptyUrl = issues.find((i) => i.message.includes('empty URL'));
    expect(emptyUrl!.line).toBe(9);
  });
});

describe('validator: edge case content patterns', () => {
  it('handles H1 with special characters', () => {
    const content = [
      '# My Site [v2.0]',
      '',
      '> Description.',
      '',
      '## Pages',
      '',
      '- [Home](https://example.com)',
    ].join('\n');
    const issues = validateLlmsTxt(content);

    // H1 with brackets should still be recognized
    const h1Error = issues.find((i) => i.message.includes('Missing required H1'));
    expect(h1Error).toBeUndefined();
  });

  it('handles multiple section headings', () => {
    const content = [
      '# My Site',
      '',
      '> Description.',
      '',
      '## Docs',
      '',
      '- [API](https://example.com/api): API docs',
      '',
      '## Blog',
      '',
      '- [Post](https://example.com/post): A post',
      '',
      '## Other',
      '',
      '- [About](https://example.com/about): About',
    ].join('\n');
    const issues = validateLlmsTxt(content);

    const errors = issues.filter((i) => i.level === 'error');
    expect(errors).toHaveLength(0);
  });

  it('handles content with only H1 and nothing else', () => {
    const content = '# Lonely Site\n';
    const issues = validateLlmsTxt(content);

    // Should have: missing blockquote, no sections, no links
    expect(issues.find((i) => i.message.includes('blockquote'))).toBeDefined();
    expect(issues.find((i) => i.message.includes('section'))).toBeDefined();
    expect(issues.find((i) => i.message.includes('No page links'))).toBeDefined();
  });

  it('handles blockquote immediately after H1 without blank line', () => {
    const content = [
      '# My Site',
      '> Tight blockquote.',
      '',
      '## Pages',
      '',
      '- [Home](https://example.com)',
    ].join('\n');
    const issues = validateLlmsTxt(content);

    const blockquoteWarn = issues.find((i) => i.message.includes('blockquote'));
    expect(blockquoteWarn).toBeUndefined();
  });

  it('does not count links outside of list items', () => {
    const content = [
      '# My Site',
      '',
      '> Description with [a link](https://example.com).',
      '',
      '## Pages',
      '',
      'See [documentation](https://docs.example.com) for more.',
    ].join('\n');
    const issues = validateLlmsTxt(content);

    // Links in blockquote and text should not be counted as page links
    const noLinks = issues.find((i) => i.message.includes('No page links'));
    expect(noLinks).toBeDefined();
  });

  it('handles Windows-style line endings', () => {
    const content = '# My Site\r\n\r\n> Desc.\r\n\r\n## Pages\r\n\r\n- [Home](https://example.com)\r\n';
    const issues = validateLlmsTxt(content);

    // May have issues due to \r but should not crash
    expect(Array.isArray(issues)).toBe(true);
  });

  it('handles file with only whitespace and newlines', () => {
    const issues = validateLlmsTxt('\n\n  \n  \n');
    const emptyError = issues.find((i) => i.message.includes('empty'));
    expect(emptyError).toBeDefined();
  });

  it('accepts http:// URLs as absolute', () => {
    const content = [
      '# My Site',
      '',
      '> Description.',
      '',
      '## Pages',
      '',
      '- [HTTP Page](http://example.com): Plain HTTP',
    ].join('\n');
    const issues = validateLlmsTxt(content);

    const relativeWarn = issues.find((i) => i.message.includes('not absolute'));
    expect(relativeWarn).toBeUndefined();
  });

  it('warns for protocol-relative URLs', () => {
    const content = [
      '# My Site',
      '',
      '> Description.',
      '',
      '## Pages',
      '',
      '- [Page](//example.com/path): Protocol-relative',
    ].join('\n');
    const issues = validateLlmsTxt(content);

    const relativeWarn = issues.find((i) => i.message.includes('not absolute'));
    expect(relativeWarn).toBeDefined();
  });
});

describe('validator: generated output validation', () => {
  it('output from llms.txt format is always valid', () => {
    // Simulate what the generator produces
    const content = [
      '# Test Site',
      '',
      '> A test site for validation.',
      '',
      '## Documentation',
      'Technical docs for developers.',
      '',
      '- [API Reference](https://test.com/docs/api): Complete API docs',
      '- [Installation](https://test.com/docs/install): How to install',
      '',
      '## Blog',
      '',
      '- [Hello World](https://test.com/blog/hello): First post',
      '',
      '## Additional',
      '',
      'Contact us at support@test.com',
      '',
    ].join('\n');

    const issues = validateLlmsTxt(content);
    const errors = issues.filter((i) => i.level === 'error');
    expect(errors).toHaveLength(0);
  });
});
