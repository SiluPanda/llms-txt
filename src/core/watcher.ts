import { watch as fsWatch, type FSWatcher } from 'node:fs';

export interface WatcherOptions {
  dir: string;
  debounce?: number;
  include?: string[];
  exclude?: string[];
  onChange: () => void | Promise<void>;
}

export interface Watcher {
  close(): void;
}

export function watch(options: WatcherOptions): Watcher {
  const {
    dir,
    debounce: debounceMs = 500,
    include = ['**/*.html'],
    exclude = [],
    onChange,
  } = options;

  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false;

  const fsWatcher: FSWatcher = fsWatch(dir, { recursive: true }, (_event, filename) => {
    if (!filename) return;

    const normalized = filename.replace(/\\/g, '/');

    if (!matchesPatterns(normalized, include)) return;
    if (exclude.length > 0 && matchesPatterns(normalized, exclude)) return;

    if (timer) clearTimeout(timer);

    timer = setTimeout(() => {
      if (running) return;
      running = true;
      console.log(`[llms-txt] Change detected: ${filename}`);
      const result = onChange();
      if (result && typeof result.then === 'function') {
        result.then(() => {
          running = false;
        }).catch((err: unknown) => {
          console.error('[llms-txt] Regeneration error:', err);
          running = false;
        });
      } else {
        running = false;
      }
    }, debounceMs);
  });

  return {
    close() {
      if (timer) clearTimeout(timer);
      fsWatcher.close();
    },
  };
}

function matchesPatterns(filePath: string, patterns: string[]): boolean {
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
