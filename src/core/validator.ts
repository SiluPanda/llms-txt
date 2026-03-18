import type { ValidationIssue } from '../types.js';

/**
 * Validate an llms.txt file against the spec.
 * Returns an array of issues (empty = valid).
 */
export function validateLlmsTxt(content: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const lines = content.split('\n');

  // Check for H1 heading
  const h1Line = lines.findIndex((line) => /^# \S/.test(line));
  if (h1Line === -1) {
    issues.push({
      level: 'error',
      message: 'Missing required H1 heading (# Site Name)',
    });
  } else if (h1Line !== 0) {
    issues.push({
      level: 'warning',
      message: 'H1 heading should be the first line',
      line: h1Line + 1,
    });
  }

  // Check for blockquote description after H1
  if (h1Line !== -1) {
    const nextNonEmpty = lines.findIndex((line, i) => i > h1Line && line.trim() !== '');
    if (nextNonEmpty === -1 || !lines[nextNonEmpty].startsWith('> ')) {
      issues.push({
        level: 'warning',
        message: 'Missing blockquote description after H1 heading (> Site description)',
      });
    }
  }

  // Check for at least one section heading (##)
  const hasSection = lines.some((line) => /^## \S/.test(line));
  if (!hasSection) {
    issues.push({
      level: 'warning',
      message: 'No section headings (##) found — consider organizing content into sections',
    });
  }

  // Check markdown link syntax
  const linkPattern = /\[([^\]]*)\]\(([^)]*)\)/;
  let hasLinks = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check for malformed links: unmatched brackets or parens
    if (line.startsWith('- ')) {
      const linkContent = line.slice(2);
      if (linkContent.includes('[') && !linkPattern.test(linkContent)) {
        // Could be a malformed link — do a second check
        if (!linkContent.match(/\[[^\]]*\]\([^)]*\)/)) {
          issues.push({
            level: 'error',
            message: `Malformed markdown link syntax`,
            line: i + 1,
          });
        }
      }

      // Check for links with content
      const match = linkContent.match(/\[([^\]]*)\]\(([^)]*)\)/);
      if (match) {
        hasLinks = true;
        const [, title, url] = match;
        if (!title.trim()) {
          issues.push({
            level: 'warning',
            message: 'Link has empty title',
            line: i + 1,
          });
        }
        if (!url.trim()) {
          issues.push({
            level: 'error',
            message: 'Link has empty URL',
            line: i + 1,
          });
        }
        if (url.trim() && !url.startsWith('http://') && !url.startsWith('https://')) {
          issues.push({
            level: 'warning',
            message: `Link URL is not absolute: ${url.trim()}`,
            line: i + 1,
          });
        }
      }
    }
  }

  if (!hasLinks) {
    issues.push({
      level: 'warning',
      message: 'No page links found — the file should list pages with markdown links',
    });
  }

  // Check file isn't empty
  const trimmed = content.trim();
  if (!trimmed) {
    issues.push({
      level: 'error',
      message: 'File is empty',
    });
  }

  // Check for excessively large files (warn at ~100k tokens ≈ 400k chars)
  if (trimmed.length > 400_000) {
    const approxTokens = Math.ceil(trimmed.length / 4);
    issues.push({
      level: 'warning',
      message: `File is very large (~${approxTokens.toLocaleString()} tokens) and may exceed LLM context windows`,
    });
  }

  return issues;
}
