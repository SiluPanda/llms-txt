# AGENTS.md — AI Agent Guidelines for llms-txt

## For All Agents

- Run `npm test` after any code change — all 250+ tests must pass
- Run `npm run typecheck` before committing
- Match existing code style exactly (imports, naming, indentation)
- This is an ESM-first TypeScript project targeting Node 18+
- Never add dependencies without explicit approval

## For Testing Agents

- Test files live in `tests/` mirroring `src/` structure
- Use Vitest globals (`describe`, `it`, `expect` — no imports needed)
- Follow existing patterns: `makeConfig()` helpers, mock req/res builders
- E2E tests that hit the network need timeouts: `it('...', fn, 30_000)`
- Network-dependent tests should be resilient to slow responses and rate limiting
- Fixture HTML files go in `tests/fixtures/` or `tests/e2e/fixtures/`
- Test both happy path and edge cases (empty input, malformed HTML, missing fields)

## For Implementation Agents

- Core logic in `src/core/`, adapters in `src/adapters/`
- All public API exported from `src/index.ts`
- Adapters delegate to `src/adapters/handler.ts` — don't put logic in framework adapters
- Types in `src/types.ts` — keep interfaces focused and documented
- New features need tests before merging

## For Code Review Agents

- Check for markdown injection in generated output (user-controlled titles/descriptions)
- Verify deduplication logic when adding new discovery methods
- Ensure cache invalidation covers new code paths
- Watch for missing `await` on async operations in adapters

## Module Dependency Graph

```
index.ts → core/* (crawler, extractor, generator, validator, cache, watcher)
adapters/handler.ts → core/* (crawler, generator, cache, watcher)
adapters/{express,nextjs,fastify,hono}.ts → adapters/handler.ts
cli/index.ts → core/* (crawler, generator, validator, watcher)
core/crawler.ts → core/extractor.ts, core/glob.ts
core/watcher.ts → core/glob.ts
```
