import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { watch } from '../../src/core/watcher.js';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('watch', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'watcher-test-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('triggers onChange when an HTML file is created', async () => {
    const onChange = vi.fn();

    const watcher = watch({
      dir: tmpDir,
      debounce: 50,
      onChange,
    });

    try {
      await writeFile(path.join(tmpDir, 'page.html'), '<html></html>');

      await vi.waitFor(() => {
        expect(onChange).toHaveBeenCalledTimes(1);
      }, { timeout: 3000 });
    } finally {
      watcher.close();
    }
  });

  it('triggers onChange when an HTML file is modified', async () => {
    const filePath = path.join(tmpDir, 'existing.html');
    await writeFile(filePath, '<html>old</html>');

    const onChange = vi.fn();

    const watcher = watch({
      dir: tmpDir,
      debounce: 50,
      onChange,
    });

    try {
      await delay(100);
      await writeFile(filePath, '<html>new</html>');

      await vi.waitFor(() => {
        expect(onChange).toHaveBeenCalledTimes(1);
      }, { timeout: 3000 });
    } finally {
      watcher.close();
    }
  });

  it('debounces rapid changes into a single onChange call', async () => {
    const onChange = vi.fn();

    const watcher = watch({
      dir: tmpDir,
      debounce: 200,
      onChange,
    });

    try {
      await writeFile(path.join(tmpDir, 'a.html'), '<html>a</html>');
      await delay(20);
      await writeFile(path.join(tmpDir, 'b.html'), '<html>b</html>');
      await delay(20);
      await writeFile(path.join(tmpDir, 'c.html'), '<html>c</html>');

      await delay(500);

      expect(onChange).toHaveBeenCalledTimes(1);
    } finally {
      watcher.close();
    }
  });

  it('does not trigger for non-HTML files', async () => {
    const onChange = vi.fn();

    const watcher = watch({
      dir: tmpDir,
      debounce: 50,
      onChange,
    });

    try {
      await writeFile(path.join(tmpDir, 'style.css'), 'body {}');
      await writeFile(path.join(tmpDir, 'script.js'), 'console.log()');
      await writeFile(path.join(tmpDir, 'data.json'), '{}');

      await delay(300);

      expect(onChange).not.toHaveBeenCalled();
    } finally {
      watcher.close();
    }
  });

  it('close() stops watching', async () => {
    const onChange = vi.fn();

    const watcher = watch({
      dir: tmpDir,
      debounce: 50,
      onChange,
    });

    watcher.close();

    await writeFile(path.join(tmpDir, 'page.html'), '<html></html>');
    await delay(300);

    expect(onChange).not.toHaveBeenCalled();
  });

  it('respects custom include patterns', async () => {
    const onChange = vi.fn();

    const watcher = watch({
      dir: tmpDir,
      debounce: 50,
      include: ['**/*.md'],
      onChange,
    });

    try {
      await writeFile(path.join(tmpDir, 'page.html'), '<html></html>');
      await delay(300);
      expect(onChange).not.toHaveBeenCalled();

      await writeFile(path.join(tmpDir, 'readme.md'), '# Hello');
      await vi.waitFor(() => {
        expect(onChange).toHaveBeenCalledTimes(1);
      }, { timeout: 3000 });
    } finally {
      watcher.close();
    }
  });

  it('respects exclude patterns', async () => {
    const subDir = path.join(tmpDir, 'vendor');
    await mkdir(subDir, { recursive: true });

    const onChange = vi.fn();

    const watcher = watch({
      dir: tmpDir,
      debounce: 50,
      include: ['**/*.html'],
      exclude: ['vendor/**/*.html'],
      onChange,
    });

    try {
      await writeFile(path.join(subDir, 'lib.html'), '<html></html>');
      await delay(300);
      expect(onChange).not.toHaveBeenCalled();

      await writeFile(path.join(tmpDir, 'index.html'), '<html></html>');
      await vi.waitFor(() => {
        expect(onChange).toHaveBeenCalledTimes(1);
      }, { timeout: 3000 });
    } finally {
      watcher.close();
    }
  });
});
