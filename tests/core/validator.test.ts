import { validateLlmsTxt } from '../../src/core/validator.js';

function makeValidLlmsTxt(): string {
  return [
    '# My Site',
    '',
    '> A description of my site.',
    '',
    '## Pages',
    '',
    '- [Home](https://example.com): The home page',
    '- [About](https://example.com/about): About us',
    '',
  ].join('\n');
}

describe('validateLlmsTxt', () => {
  it('returns no issues for a valid llms.txt', () => {
    const issues = validateLlmsTxt(makeValidLlmsTxt());
    expect(issues).toEqual([]);
  });

  it('reports error when H1 heading is missing', () => {
    const content = [
      '> Some description.',
      '',
      '## Pages',
      '',
      '- [Home](https://example.com): Welcome',
    ].join('\n');
    const issues = validateLlmsTxt(content);

    const h1Error = issues.find((i) => i.message.includes('Missing required H1 heading'));
    expect(h1Error).toBeDefined();
    expect(h1Error!.level).toBe('error');
  });

  it('warns when H1 heading is not the first line', () => {
    const content = [
      '',
      '# My Site',
      '',
      '> A description.',
      '',
      '## Pages',
      '',
      '- [Home](https://example.com): Welcome',
    ].join('\n');
    const issues = validateLlmsTxt(content);

    const h1Warn = issues.find((i) => i.message.includes('H1 heading should be the first line'));
    expect(h1Warn).toBeDefined();
    expect(h1Warn!.level).toBe('warning');
    expect(h1Warn!.line).toBe(2);
  });

  it('warns when blockquote description is missing after H1', () => {
    const content = [
      '# My Site',
      '',
      '## Pages',
      '',
      '- [Home](https://example.com): Welcome',
    ].join('\n');
    const issues = validateLlmsTxt(content);

    const blockquoteWarn = issues.find((i) => i.message.includes('Missing blockquote description'));
    expect(blockquoteWarn).toBeDefined();
    expect(blockquoteWarn!.level).toBe('warning');
  });

  it('does not warn about blockquote when it is present', () => {
    const issues = validateLlmsTxt(makeValidLlmsTxt());
    const blockquoteWarn = issues.find((i) => i.message.includes('blockquote'));
    expect(blockquoteWarn).toBeUndefined();
  });

  it('warns when no section headings are found', () => {
    const content = [
      '# My Site',
      '',
      '> A description.',
      '',
      '- [Home](https://example.com): Welcome',
    ].join('\n');
    const issues = validateLlmsTxt(content);

    const sectionWarn = issues.find((i) => i.message.includes('No section headings'));
    expect(sectionWarn).toBeDefined();
    expect(sectionWarn!.level).toBe('warning');
  });

  it('does not warn about sections when ## headings exist', () => {
    const issues = validateLlmsTxt(makeValidLlmsTxt());
    const sectionWarn = issues.find((i) => i.message.includes('section headings'));
    expect(sectionWarn).toBeUndefined();
  });

  it('reports error for empty link URL', () => {
    const content = [
      '# My Site',
      '',
      '> Description.',
      '',
      '## Pages',
      '',
      '- [Home](): Welcome',
    ].join('\n');
    const issues = validateLlmsTxt(content);

    const urlError = issues.find((i) => i.message.includes('empty URL'));
    expect(urlError).toBeDefined();
    expect(urlError!.level).toBe('error');
  });

  it('warns for empty link title', () => {
    const content = [
      '# My Site',
      '',
      '> Description.',
      '',
      '## Pages',
      '',
      '- [](https://example.com): Welcome',
    ].join('\n');
    const issues = validateLlmsTxt(content);

    const titleWarn = issues.find((i) => i.message.includes('empty title'));
    expect(titleWarn).toBeDefined();
    expect(titleWarn!.level).toBe('warning');
  });

  it('warns for non-absolute link URLs', () => {
    const content = [
      '# My Site',
      '',
      '> Description.',
      '',
      '## Pages',
      '',
      '- [About](/about): About page',
    ].join('\n');
    const issues = validateLlmsTxt(content);

    const relativeWarn = issues.find((i) => i.message.includes('not absolute'));
    expect(relativeWarn).toBeDefined();
    expect(relativeWarn!.level).toBe('warning');
    expect(relativeWarn!.message).toContain('/about');
  });

  it('does not warn for absolute http:// URLs', () => {
    const content = [
      '# My Site',
      '',
      '> Description.',
      '',
      '## Pages',
      '',
      '- [Home](http://example.com): Welcome',
    ].join('\n');
    const issues = validateLlmsTxt(content);

    const relativeWarn = issues.find((i) => i.message.includes('not absolute'));
    expect(relativeWarn).toBeUndefined();
  });

  it('warns when no page links are found', () => {
    const content = [
      '# My Site',
      '',
      '> Description.',
      '',
      '## Pages',
      '',
      'No links here.',
    ].join('\n');
    const issues = validateLlmsTxt(content);

    const noLinksWarn = issues.find((i) => i.message.includes('No page links found'));
    expect(noLinksWarn).toBeDefined();
    expect(noLinksWarn!.level).toBe('warning');
  });

  it('reports error when file is empty', () => {
    const issues = validateLlmsTxt('');

    const emptyError = issues.find((i) => i.message === 'File is empty');
    expect(emptyError).toBeDefined();
    expect(emptyError!.level).toBe('error');
  });

  it('reports error for whitespace-only content', () => {
    const issues = validateLlmsTxt('   \n\n  \t  ');

    const emptyError = issues.find((i) => i.message === 'File is empty');
    expect(emptyError).toBeDefined();
    expect(emptyError!.level).toBe('error');
  });

  it('warns when file exceeds 400k characters', () => {
    const longContent = [
      '# My Site',
      '',
      '> Description.',
      '',
      '## Pages',
      '',
      '- [Home](https://example.com): Welcome',
      '',
      'x'.repeat(400_001),
    ].join('\n');
    const issues = validateLlmsTxt(longContent);

    const sizeWarn = issues.find((i) => i.message.includes('very large'));
    expect(sizeWarn).toBeDefined();
    expect(sizeWarn!.level).toBe('warning');
    expect(sizeWarn!.message).toContain('tokens');
  });

  it('does not warn about size for files under 400k characters', () => {
    const issues = validateLlmsTxt(makeValidLlmsTxt());
    const sizeWarn = issues.find((i) => i.message.includes('very large'));
    expect(sizeWarn).toBeUndefined();
  });

  it('includes line numbers for link issues', () => {
    const content = [
      '# My Site',
      '',
      '> Description.',
      '',
      '## Pages',
      '',
      '- [](https://example.com): Empty title',
    ].join('\n');
    const issues = validateLlmsTxt(content);

    const titleWarn = issues.find((i) => i.message.includes('empty title'));
    expect(titleWarn).toBeDefined();
    expect(titleWarn!.line).toBe(7);
  });

  it('validates multiple links and reports issues for each', () => {
    const content = [
      '# My Site',
      '',
      '> Description.',
      '',
      '## Pages',
      '',
      '- [Good Link](https://example.com): OK',
      '- [](https://example.com/empty-title): Empty title',
      '- [Empty URL](): Missing URL',
    ].join('\n');
    const issues = validateLlmsTxt(content);

    const titleWarn = issues.find((i) => i.message.includes('empty title'));
    expect(titleWarn).toBeDefined();
    expect(titleWarn!.line).toBe(8);

    const urlError = issues.find((i) => i.message.includes('empty URL'));
    expect(urlError).toBeDefined();
    expect(urlError!.line).toBe(9);
  });

  it('accepts blockquote on line immediately after H1 (no blank line)', () => {
    const content = [
      '# My Site',
      '> Description right after H1.',
      '',
      '## Pages',
      '',
      '- [Home](https://example.com): Welcome',
    ].join('\n');
    const issues = validateLlmsTxt(content);

    const blockquoteWarn = issues.find((i) => i.message.includes('blockquote'));
    expect(blockquoteWarn).toBeUndefined();
  });
});
