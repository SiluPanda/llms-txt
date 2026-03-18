export function matchesGlob(filePath: string, patterns: string[]): boolean {
  if (patterns.length === 0) return false;
  const normalized = filePath.replace(/\\/g, '/');
  return patterns.some((pattern) => globToRegex(pattern).test(normalized));
}

function globToRegex(glob: string): RegExp {
  let regex = '';
  let i = 0;

  while (i < glob.length) {
    const char = glob[i];

    if (char === '*' && glob[i + 1] === '*') {
      if (glob[i + 2] === '/') {
        regex += '(?:.+/)?';
        i += 3;
      } else {
        regex += '.*';
        i += 2;
      }
    } else if (char === '*') {
      regex += '[^/]*';
      i++;
    } else if (char === '?') {
      regex += '[^/]';
      i++;
    } else if (char === '.') {
      regex += '\\.';
      i++;
    } else {
      regex += char;
      i++;
    }
  }

  return new RegExp(`^${regex}$`);
}
