import { matchesGlob } from '../../src/core/glob.js';

describe('matchesGlob', () => {
  it('matches simple file extensions', () => {
    expect(matchesGlob('file.html', ['*.html'])).toBe(true);
    expect(matchesGlob('file.txt', ['*.html'])).toBe(false);
  });

  it('matches ** recursive pattern', () => {
    expect(matchesGlob('docs/api/guide.html', ['**/*.html'])).toBe(true);
    expect(matchesGlob('guide.html', ['**/*.html'])).toBe(true);
    expect(matchesGlob('deep/nested/path/file.html', ['**/*.html'])).toBe(true);
  });

  it('matches ? single character wildcard', () => {
    expect(matchesGlob('file1.html', ['file?.html'])).toBe(true);
    expect(matchesGlob('file12.html', ['file?.html'])).toBe(false);
    expect(matchesGlob('file.html', ['file?.html'])).toBe(false);
  });

  it('handles literal dots in patterns', () => {
    expect(matchesGlob('file.test.ts', ['*.test.ts'])).toBe(true);
    expect(matchesGlob('filetestts', ['*.test.ts'])).toBe(false);
  });

  it('returns false for empty patterns array', () => {
    expect(matchesGlob('anything.html', [])).toBe(false);
  });

  it('matches any of multiple patterns', () => {
    expect(matchesGlob('file.html', ['*.html', '*.txt'])).toBe(true);
    expect(matchesGlob('file.txt', ['*.html', '*.txt'])).toBe(true);
    expect(matchesGlob('file.css', ['*.html', '*.txt'])).toBe(false);
  });

  it('normalizes backslashes to forward slashes', () => {
    expect(matchesGlob('docs\\guide.html', ['**/*.html'])).toBe(true);
    expect(matchesGlob('docs\\nested\\file.html', ['**/*.html'])).toBe(true);
  });

  it('matches * within directory only', () => {
    // * should NOT match across directory boundaries
    expect(matchesGlob('file.html', ['*.html'])).toBe(true);
    expect(matchesGlob('sub/file.html', ['*.html'])).toBe(false);
  });

  it('matches directory prefix with **/', () => {
    expect(matchesGlob('docs/intro.html', ['docs/**/*.html'])).toBe(true);
    expect(matchesGlob('docs/api/ref.html', ['docs/**/*.html'])).toBe(true);
    expect(matchesGlob('blog/post.html', ['docs/**/*.html'])).toBe(false);
  });

  it('matches ** without trailing slash (matches everything)', () => {
    expect(matchesGlob('anything', ['**'])).toBe(true);
    expect(matchesGlob('deep/nested/path', ['**'])).toBe(true);
  });

  it('matches exact filenames', () => {
    expect(matchesGlob('index.html', ['index.html'])).toBe(true);
    expect(matchesGlob('about.html', ['index.html'])).toBe(false);
  });

  it('handles complex glob patterns', () => {
    expect(matchesGlob('src/components/Button.tsx', ['src/**/*.tsx'])).toBe(true);
    expect(matchesGlob('src/utils/helper.ts', ['src/**/*.tsx'])).toBe(false);
  });
});
