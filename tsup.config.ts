import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    express: 'src/adapters/express.ts',
    next: 'src/adapters/nextjs.ts',
    fastify: 'src/adapters/fastify.ts',
    hono: 'src/adapters/hono.ts',
    cli: 'src/cli/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: true,
  treeshake: true,
  target: 'node18',
  outDir: 'dist',
  external: ['express', 'fastify', 'hono'],
});
