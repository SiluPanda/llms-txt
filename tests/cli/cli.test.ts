/**
 * CLI tests via subprocess execution.
 *
 * Tests the CLI binary by spawning it as a child process,
 * which correctly tests process.exit(), stdout/stderr, and flag handling.
 */
import { execFile } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);

// Use tsx to run the TS CLI directly
const CLI_PATH = path.resolve(__dirname, '../../src/cli/index.ts');

function runCli(args: string[]): Promise<{ stdout: string; stderr: string }> {
  return exec('npx', ['tsx', CLI_PATH, ...args], {
    cwd: path.resolve(__dirname, '../..'),
    timeout: 30_000,
  });
}

function runCliExpectFail(args: string[]): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve) => {
    const child = execFile('npx', ['tsx', CLI_PATH, ...args], {
      cwd: path.resolve(__dirname, '../..'),
      timeout: 30_000,
    }, (error, stdout, stderr) => {
      resolve({
        stdout: stdout || '',
        stderr: stderr || '',
        code: error?.code ? Number(error.code) : (error ? 1 : 0),
      });
    });
  });
}

// ─── generate command ────────────────────────────────────────────

describe('CLI: generate command', () => {
  let tmpDir: string;
  let fixturesDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), 'llms-txt-cli-'));
    fixturesDir = path.resolve(__dirname, '../e2e/fixtures');
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('generates llms.txt files from directory', async () => {
    const { stdout } = await runCli([
      'generate',
      '--name', 'CLI Test',
      '--description', 'Testing the CLI.',
      '--dir', fixturesDir,
      '--output', tmpDir,
    ]);

    expect(stdout).toContain('Written:');
    expect(stdout).toContain('llms.txt');

    const llmsTxt = await readFile(path.join(tmpDir, 'llms.txt'), 'utf-8');
    expect(llmsTxt).toContain('# CLI Test');
    expect(llmsTxt).toContain('> Testing the CLI.');

    const fullTxt = await readFile(path.join(tmpDir, 'llms-full.txt'), 'utf-8');
    expect(fullTxt).toContain('# CLI Test');

    const smallTxt = await readFile(path.join(tmpDir, 'llms-small.txt'), 'utf-8');
    expect(smallTxt).toContain('# CLI Test');
  }, 15_000);

  it('--dry-run prints output without writing files', async () => {
    const { stdout } = await runCli([
      'generate',
      '--name', 'Dry Run Test',
      '--description', 'Testing dry run.',
      '--dir', fixturesDir,
      '--output', tmpDir,
      '--dry-run',
    ]);

    expect(stdout).toContain('=== llms.txt ===');
    expect(stdout).toContain('# Dry Run Test');
    expect(stdout).toContain('=== llms-full.txt ===');
    expect(stdout).toContain('=== llms-small.txt ===');
    expect(stdout).toContain('Token estimates:');

    // No files should have been written
    await expect(readFile(path.join(tmpDir, 'llms.txt'), 'utf-8')).rejects.toThrow();
  }, 15_000);

  it('--no-full skips llms-full.txt generation', async () => {
    const { stdout } = await runCli([
      'generate',
      '--name', 'No Full',
      '--description', 'No full output.',
      '--dir', fixturesDir,
      '--output', tmpDir,
      '--no-full',
    ]);

    expect(stdout).toContain('llms.txt');
    expect(stdout).toContain('llms-small.txt');

    // llms-full.txt should not exist
    await expect(readFile(path.join(tmpDir, 'llms-full.txt'), 'utf-8')).rejects.toThrow();
    // Others should exist
    const llmsTxt = await readFile(path.join(tmpDir, 'llms.txt'), 'utf-8');
    expect(llmsTxt).toContain('# No Full');
  }, 15_000);

  it('--no-small skips llms-small.txt generation', async () => {
    const { stdout } = await runCli([
      'generate',
      '--name', 'No Small',
      '--description', 'No small output.',
      '--dir', fixturesDir,
      '--output', tmpDir,
      '--no-small',
    ]);

    await expect(readFile(path.join(tmpDir, 'llms-small.txt'), 'utf-8')).rejects.toThrow();
    const llmsTxt = await readFile(path.join(tmpDir, 'llms.txt'), 'utf-8');
    expect(llmsTxt).toContain('# No Small');
  }, 15_000);

  it('--check exits 0 when files are up to date', async () => {
    // First, generate the files
    await runCli([
      'generate',
      '--name', 'Check Test',
      '--description', 'Testing check.',
      '--dir', fixturesDir,
      '--output', tmpDir,
    ]);

    // Then run with --check — should exit 0
    const { stdout } = await runCli([
      'generate',
      '--name', 'Check Test',
      '--description', 'Testing check.',
      '--dir', fixturesDir,
      '--output', tmpDir,
      '--check',
    ]);

    expect(stdout).toContain('up to date');
  }, 30_000);

  it('--check exits 1 when files would change', async () => {
    // Write a dummy llms.txt that differs from what would be generated
    await writeFile(path.join(tmpDir, 'llms.txt'), 'old content');

    const result = await runCliExpectFail([
      'generate',
      '--name', 'Check Fail',
      '--description', 'Testing check failure.',
      '--dir', fixturesDir,
      '--output', tmpDir,
      '--check',
    ]);

    expect(result.stdout).toContain('would change');
    expect(result.code).not.toBe(0);
  }, 15_000);

  it('reports token estimates in dry-run output', async () => {
    const { stdout } = await runCli([
      'generate',
      '--name', 'Token Test',
      '--description', 'Testing tokens.',
      '--dir', fixturesDir,
      '--dry-run',
    ]);

    expect(stdout).toContain('Token estimates:');
    expect(stdout).toMatch(/llms\.txt=\d+/);
    expect(stdout).toMatch(/llms-full\.txt=\d+/);
    expect(stdout).toMatch(/llms-small\.txt=\d+/);
  }, 15_000);

  it('creates output directory if it does not exist', async () => {
    const nested = path.join(tmpDir, 'nested', 'output', 'dir');

    await runCli([
      'generate',
      '--name', 'Nested Dir',
      '--description', 'Testing nested directory creation.',
      '--dir', fixturesDir,
      '--output', nested,
    ]);

    const llmsTxt = await readFile(path.join(nested, 'llms.txt'), 'utf-8');
    expect(llmsTxt).toContain('# Nested Dir');
  }, 15_000);
});

// ─── generate command error handling ─────────────────────────────

describe('CLI: generate error handling', () => {
  it('requires --name when no config file', async () => {
    const result = await runCliExpectFail([
      'generate',
      '--description', 'Missing name.',
      '--dir', '/tmp',
    ]);

    expect(result.stderr).toContain('--name is required');
    expect(result.code).not.toBe(0);
  }, 15_000);

  it('requires --description when no config file', async () => {
    const result = await runCliExpectFail([
      'generate',
      '--name', 'Test',
      '--dir', '/tmp',
    ]);

    expect(result.stderr).toContain('--description is required');
    expect(result.code).not.toBe(0);
  }, 15_000);

  it('requires at least one discovery option', async () => {
    const result = await runCliExpectFail([
      'generate',
      '--name', 'Test',
      '--description', 'Test.',
    ]);

    expect(result.stderr).toContain('--url, --dir, or --sitemap');
    expect(result.code).not.toBe(0);
  }, 15_000);
});

// ─── validate command ────────────────────────────────────────────

describe('CLI: validate command', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), 'llms-txt-validate-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('reports valid for a correct llms.txt file', async () => {
    const filePath = path.join(tmpDir, 'llms.txt');
    await writeFile(filePath, [
      '# My Site',
      '',
      '> Description.',
      '',
      '## Pages',
      '',
      '- [Home](https://example.com): Welcome',
    ].join('\n'));

    const { stdout } = await runCli(['validate', filePath]);
    expect(stdout).toContain('valid');
  }, 15_000);

  it('reports errors and exits 1 for file with errors', async () => {
    const filePath = path.join(tmpDir, 'llms.txt');
    await writeFile(filePath, '  \n  \n  ');

    const result = await runCliExpectFail(['validate', filePath]);
    expect(result.stdout).toContain('ERROR');
    expect(result.code).not.toBe(0);
  }, 15_000);

  it('reports warnings for file with warnings only', async () => {
    const filePath = path.join(tmpDir, 'llms.txt');
    await writeFile(filePath, [
      '# My Site',
      '',
      '## Pages', // No blockquote
      '',
      '- [Home](https://example.com)',
    ].join('\n'));

    const { stdout } = await runCli(['validate', filePath]);
    expect(stdout).toContain('WARN');
    // Should exit 0 (warnings don't cause failure)
  }, 15_000);

  it('reports error for nonexistent file', async () => {
    const result = await runCliExpectFail(['validate', path.join(tmpDir, 'nonexistent.txt')]);
    expect(result.stderr).toContain('Error');
    expect(result.code).not.toBe(0);
  }, 15_000);
});
