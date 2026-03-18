# CLAUDE.md — llms-txt Project Instructions

## Project Overview

`llms-txt` is a TypeScript library that auto-generates and serves `llms.txt` files for AI agent discoverability. It converts HTML pages (from local directories, sitemaps, or live crawling) into structured Markdown documentation following the llms.txt spec.

## Quick Reference

```bash
npm test            # Run all tests (vitest)
npm run test:watch  # Watch mode
npm run build       # Build with tsup (ESM + CJS)
npm run typecheck   # TypeScript strict check
```

## Architecture

```
src/
├── index.ts              # Public API: generate(), defineConfig(), re-exports
├── types.ts              # All TypeScript interfaces
├── core/
│   ├── crawler.ts        # Page discovery (directory, sitemap, URL crawling)
│   ├── extractor.ts      # HTML → PageInfo (Cheerio-based)
│   ├── generator.ts      # PageInfo[] → llms.txt / llms-full.txt / llms-small.txt
│   ├── validator.ts      # llms.txt spec validation
│   ├── cache.ts          # Generic TTL cache
│   ├── watcher.ts        # File system watcher with debouncing
│   └── glob.ts           # Glob pattern matching
├── adapters/
│   ├── handler.ts        # Framework-agnostic request handler (routing, caching, ETags)
│   ├── express.ts        # Express middleware
│   ├── nextjs.ts         # Next.js App Router handler
│   ├── fastify.ts        # Fastify plugin
│   └── hono.ts           # Hono middleware
└── cli/
    └── index.ts          # CLI: generate, validate commands
```

## Key Patterns

- **Three output formats**: `llms.txt` (links + descriptions), `llms-full.txt` (full content), `llms-small.txt` (titles only)
- **Section organization**: Pages grouped by `pathPrefix` or explicit `pages[]` lists; unmatched go to "Other"
- **Page deduplication**: First occurrence wins, by normalized path
- **Token estimation**: `Math.ceil(text.length / 4)`
- **Cache**: WeakMap per config object, TTL-based (default 60s)
- **Per-page `.md` endpoints**: `/path.md` serves individual page markdown

## Testing

- **Framework**: Vitest with globals enabled
- **Test location**: `tests/` mirrors `src/` structure
- **Fixtures**: `tests/fixtures/pages/` (unit), `tests/e2e/fixtures/` (e2e)
- **E2E tests**: Real HTTP servers (Express, Fastify) and live website crawling
- **Network tests**: Use generous timeouts (20-180s); may be flaky on slow connections

### Test conventions

- Config builders: `makeConfig(overrides?)` helper functions
- Mock objects for adapter tests (req/res/context)
- `vi.waitFor()` for async file system events
- Timeout as 3rd arg: `it('...', async () => {...}, 30_000)`

## Code Style

- ESM throughout (`import`/`export`)
- Strict TypeScript (no unused locals/params)
- No semicolons in some files — match the existing file's style
- Cheerio for HTML parsing (not jsdom)
- Node `fetch` for HTTP (no axios/node-fetch)

## Dependencies

- **Runtime**: `cheerio` (HTML parsing), `commander` (CLI)
- **Peer** (optional): `express`, `fastify`, `hono`
- **Build**: `tsup` (ESM + CJS + DTS), `typescript`, `vitest`

## Common Gotchas

- `handler.ts` caches per config reference via WeakMap — different config objects get separate caches
- Crawler uses BFS with 5 concurrent requests max
- `normalizePath()` strips trailing slashes and converts full URLs to pathname
- Generator escapes `[]` in titles and `)` in URLs for markdown safety
- Fastify plugin only registers `/llms.txt` and `/llms-full.txt` routes (no `/llms-small.txt`)
