import { watch as fsWatch, type FSWatcher } from 'node:fs';
import { matchesGlob } from './glob.js';

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

    if (!matchesGlob(normalized, include)) return;
    if (exclude.length > 0 && matchesGlob(normalized, exclude)) return;

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

