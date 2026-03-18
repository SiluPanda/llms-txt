/**
 * Edge case tests for the watcher module.
 *
 * Covers:
 * - Async onChange rejection handling (the .catch path)
 * - Watcher recovery after errors
 * - Default debounce value
 */
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { watch } from '../../src/core/watcher.js';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('watcher: async onChange rejection', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'watcher-edge-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('recovers from async onChange rejection and processes next change', async () => {
    let callCount = 0;
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const onChange = vi.fn(async () => {
      callCount++;
      if (callCount === 1) {
        throw new Error('Simulated async failure');
      }
    });

    const watcher = watch({
      dir: tmpDir,
      debounce: 50,
      onChange,
    });

    try {
      // First change triggers the rejection
      await writeFile(path.join(tmpDir, 'first.html'), '<html>1</html>');

      await vi.waitFor(() => {
        expect(onChange).toHaveBeenCalledTimes(1);
      }, { timeout: 3000 });

      // Wait for the rejection to be processed
      await delay(200);

      // Error should have been logged
      expect(consoleError).toHaveBeenCalled();
      const errorCall = consoleError.mock.calls.find((call) =>
        typeof call[0] === 'string' && call[0].includes('Regeneration error'),
      );
      expect(errorCall).toBeDefined();

      // Second change should still be processed (running flag reset)
      await writeFile(path.join(tmpDir, 'second.html'), '<html>2</html>');

      await vi.waitFor(() => {
        expect(onChange).toHaveBeenCalledTimes(2);
      }, { timeout: 3000 });
    } finally {
      watcher.close();
      consoleError.mockRestore();
    }
  });

  it('does not trigger onChange while a previous async call is running', async () => {
    let resolveOnChange: (() => void) | null = null;
    const callCount = { value: 0 };

    const onChange = vi.fn(async () => {
      callCount.value++;
      if (callCount.value === 1) {
        // Block the first call for a while
        await new Promise<void>((resolve) => {
          resolveOnChange = resolve;
        });
      }
    });

    const watcher = watch({
      dir: tmpDir,
      debounce: 50,
      onChange,
    });

    try {
      // First change — starts async processing
      await writeFile(path.join(tmpDir, 'a.html'), '<html>a</html>');

      await vi.waitFor(() => {
        expect(onChange).toHaveBeenCalledTimes(1);
      }, { timeout: 3000 });

      // While first call is running, create another file
      await writeFile(path.join(tmpDir, 'b.html'), '<html>b</html>');
      await delay(200);

      // Second call should be skipped because running=true
      expect(onChange).toHaveBeenCalledTimes(1);

      // Resolve the first call
      resolveOnChange!();
      await delay(100);
    } finally {
      watcher.close();
    }
  });

  it('handles synchronous onChange correctly', async () => {
    let called = false;
    const onChange = vi.fn(() => {
      called = true;
      // Synchronous — no promise returned
    });

    const watcher = watch({
      dir: tmpDir,
      debounce: 50,
      onChange,
    });

    try {
      await writeFile(path.join(tmpDir, 'sync.html'), '<html>sync</html>');

      await vi.waitFor(() => {
        expect(called).toBe(true);
      }, { timeout: 3000 });

      expect(onChange).toHaveBeenCalledTimes(1);
    } finally {
      watcher.close();
    }
  });

  it('uses default debounce of 500ms when not specified', async () => {
    const onChange = vi.fn();

    const watcher = watch({
      dir: tmpDir,
      onChange,
    });

    try {
      await writeFile(path.join(tmpDir, 'test.html'), '<html>test</html>');

      // At 200ms, should not have triggered yet (debounce is 500ms)
      await delay(200);
      expect(onChange).not.toHaveBeenCalled();

      // By 700ms, should have triggered
      await vi.waitFor(() => {
        expect(onChange).toHaveBeenCalled();
      }, { timeout: 3000 });
    } finally {
      watcher.close();
    }
  });
});
