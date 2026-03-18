# llms-txt — Market Gaps & Opportunities

> Analysis date: 2026-03-17
> Based on competitive research across the llms.txt ecosystem, npm registry, GitHub, and developer discussions.

---

## Current Strengths (vs. Competitors)

Before identifying gaps, it's worth noting what this library already does well relative to the fragmented market:

- **Multi-framework from one package** — Express, Next.js, Fastify, Hono via sub-path exports. Every competitor targets a single framework.
- **CLI + programmatic API in one package** — most tools offer one or the other, not both.
- **Runtime crawling + serving** — crawl at startup and serve via middleware (vs. build-time-only generation).
- **File watching** — automatic regeneration on content changes (rare feature in this space).
- **No AI dependency** — uses Cheerio for HTML parsing instead of requiring an LLM API key (unlike Firecrawl's gpt-4o-mini approach).

---

## Gap 1: Missing Output Format — `llms-small.txt`

**What:** The community convention includes three tiers of output:
- `llms.txt` — concise index (supported)
- `llms-full.txt` — complete content (supported)
- `llms-small.txt` — ultra-compact version with just page titles/URLs, no descriptions (not supported)

**Who has it:** `@4hse/astro-llms-txt`, `astro-llms-generator`, Astro's own docs site (`docs.astro.build/llms-small.txt`).

**Why it matters:** LLMs with smaller context windows (or tool-use scenarios where context is tight) benefit from the smallest possible file. It's also useful as a "table of contents" that an AI agent can scan before deciding which pages to fetch in full.

**Effort:** Low — the generator already has the data; just needs a third output mode that strips descriptions.

---

## Gap 2: Per-Page Markdown Endpoints

**What:** The `.md` suffix convention — appending `.md` to any URL returns a Markdown version of that page. For example, `/docs/getting-started.md` serves the Markdown content of `/docs/getting-started`.

**Who has it:** `@turbodocx/next-plugin-llms` (generates `.html.md` files for every page), Mintlify (serves `.md` endpoints natively).

**Why it matters:** This is arguably more useful than `llms-full.txt` for AI agents. Instead of downloading the entire site's content, an agent can fetch individual pages on demand. This is the pattern that AI coding assistants (Cursor, Windsurf, Claude) actually use in practice.

**Effort:** Medium — requires middleware changes to intercept `.md` requests and extract/serve individual page content.

---

## Gap 3: Missing Framework Integrations

**What:** Several popular frameworks have no adapter:

| Framework | Competitor Coverage | Gap Severity |
|-----------|-------------------|--------------|
| **Astro** | 3+ dedicated packages (`@4hse/astro-llms-txt`, `@waldheimdev/astro-ai-llms-txt`, `astro-llms-generator`) | High — Astro is a documentation-heavy framework where llms.txt is most valuable |
| **Docusaurus** | 2 dedicated packages (`docusaurus-plugin-llms-txt`, `@signalwire/docusaurus-plugin-llms-txt`) | High — docs sites are the primary use case |
| **VitePress** | `vitepress-plugin-llms` (used by Vite, Vue.js, Vitest, Rolldown) | Medium |
| **Nuxt** | No dedicated package exists | Medium — opportunity to be first |
| **SvelteKit** | No dedicated package exists | Medium — opportunity to be first |
| **Remix** | No dedicated package exists | Low-Medium |
| **WordPress** | Yoast SEO, Rank Math, AIOSEO all have built-in support | Low — hard to compete with SEO plugins |

**Why it matters:** The library's core differentiator is multi-framework support from one package. Each missing framework is a missed opportunity to consolidate the fragmented ecosystem.

**Effort:** Low per adapter (the handler pattern is already abstracted), but Astro/Docusaurus/VitePress require build-time integration patterns rather than runtime middleware.

---

## Gap 4: Static/Build-Time Generation Mode

**What:** Most documentation frameworks (Astro, Docusaurus, VitePress, Hugo) generate static sites at build time. The current library is oriented toward runtime serving via middleware, which doesn't work for static deployments (Netlify, Vercel static, GitHub Pages, Cloudflare Pages).

**Who has it:** Every Astro/Docusaurus/VitePress plugin generates files at build time.

**Why it matters:** Documentation sites — the primary use case for llms.txt — are overwhelmingly statically generated. A library that only works at runtime misses the majority of the addressable market.

**Effort:** Medium — the CLI `generate` command partially covers this, but a proper build-time integration would hook into each framework's build pipeline (e.g., Astro integration, Vite plugin).

---

## Gap 5: Validation and Linting

**What:** No tool in the ecosystem offers robust validation of llms.txt files against the spec. Common issues include:
- Missing required H1 heading
- Malformed link syntax
- Broken URLs
- Files exceeding practical context window limits
- Content that doesn't match the live site

**Who has it:** `hillms.com` offers basic online validation but no programmatic/CLI tool exists.

**Why it matters:** As adoption grows, developers need tooling to verify their llms.txt is well-formed. This is an uncontested niche — no npm package offers validation. A `llms-txt validate` CLI command would be unique in the ecosystem.

**Effort:** Medium — requires defining validation rules and implementing a checker.

---

## Gap 6: Content Quality Optimization

**What:** Several features that improve the quality of generated content are missing:

1. **Noise removal** — Strip navigation, footers, sidebars, cookie banners, ads from extracted content. The current extractor targets `<main>` / `<article>` / `<body>` but doesn't actively remove noise elements.
2. **Content length limits** — No way to cap the size of `llms-full.txt` (which can exceed LLM context windows for large sites).
3. **Page prioritization** — No way to mark pages as high/low priority or to order them by importance.
4. **Frontmatter extraction** — Many doc sites use YAML frontmatter in their source files. Extracting this metadata (title, description, category, order) would produce better structured output.
5. **Token counting** — Report approximate token count of generated files so users know if they'll fit in various LLM context windows.

**Why it matters:** The #1 criticism of llms.txt is that most implementations are low quality — just a sitemap converted to Markdown. Better content extraction and curation directly addresses this.

**Effort:** Medium-High across all items.

---

## Gap 7: HTTP Caching Headers (ETag / Last-Modified)

**What:** The handler returns `text/plain` responses but doesn't set `ETag`, `Last-Modified`, or `Cache-Control` headers for proper HTTP caching.

**Who has it:** Standard practice for any static content serving.

**Why it matters:** AI crawlers (when they do check llms.txt) and CDNs benefit from proper cache headers. It also reduces server load for runtime-served files.

**Effort:** Low — add headers based on content hash and generation timestamp.

---

## Gap 8: Programmatic Config File Discovery

**What:** The CLI supports `--config` to load a config file, but there's no automatic discovery of config files (`llms-txt.config.ts`, `llms-txt.config.js`, `llms-txt.config.mjs`) in the project root — a pattern established by Vite, Tailwind, ESLint, and most modern JS tools.

**Effort:** Low.

---

## Gap 9: Incremental / Differential Updates

**What:** Every regeneration re-crawls and re-extracts all pages from scratch. For large sites, this is slow and wasteful.

**Who needs it:** Sites with hundreds or thousands of pages where only a few change at a time.

**Why it matters:** The watch mode triggers a full regeneration on any file change. Incremental updates (only re-extract changed pages, merge with cached results) would make watch mode practical for large sites.

**Effort:** High — requires content hashing and diffing logic.

---

## Gap 10: Testing / CI Integration

**What:** No guidance or tooling for verifying llms.txt in CI pipelines. Features that would help:
- A `--check` flag that exits non-zero if llms.txt would change (like `prettier --check`)
- A `--dry-run` flag that previews output without writing files
- GitHub Action or pre-commit hook for automated validation

**Who has it:** Nobody — this is completely uncontested.

**Effort:** Low-Medium.

---

## Gap 11: JavaScript-Rendered Page Support

**What:** The crawler uses basic `fetch()` which can't execute JavaScript. Sites built with React, Vue, Angular (client-side rendered) will return empty or minimal HTML.

**Who has it:** Firecrawl (uses headless browsers), Crawl4AI (async browser-based crawling).

**Why it matters:** Many modern web apps rely on client-side rendering. Without JS execution, the crawler misses content on these sites.

**Effort:** High — would require integrating Puppeteer/Playwright as an optional dependency.

---

## Gap 12: MCP Server Integration

**What:** The Model Context Protocol (MCP) is becoming the standard for AI tool integration. An MCP server that serves llms.txt content would allow AI agents to discover and consume site documentation programmatically.

**Who has it:** `llms-txt-generator` includes an MCP server mode.

**Why it matters:** MCP is the actual mechanism by which AI agents discover tools and content. An llms.txt MCP server bridges the gap between "file on a server" and "content an AI agent can actively consume."

**Effort:** Medium.

---

## Priority Ranking

| Priority | Gap | Impact | Effort | Rationale |
|----------|-----|--------|--------|-----------|
| **P0** | Gap 1: `llms-small.txt` | Medium | Low | Quick win, spec compliance |
| **P0** | Gap 7: HTTP caching headers | Medium | Low | Table stakes for production use |
| **P0** | Gap 8: Config file discovery | Low | Low | Developer experience quick win |
| **P1** | Gap 2: Per-page `.md` endpoints | High | Medium | What AI agents actually use in practice |
| **P1** | Gap 4: Static/build-time generation | High | Medium | Unlocks the largest market segment (static doc sites) |
| **P1** | Gap 5: Validation/linting | Medium | Medium | Uncontested niche, high differentiation |
| **P1** | Gap 6: Content quality | High | Medium-High | Addresses #1 criticism of the ecosystem |
| **P2** | Gap 3: More framework adapters | High | Medium | Astro and Docusaurus are highest priority |
| **P2** | Gap 10: CI integration | Medium | Low-Medium | DevOps-friendly, uncontested |
| **P2** | Gap 12: MCP server | Medium | Medium | Forward-looking, aligns with AI agent trends |
| **P3** | Gap 9: Incremental updates | Medium | High | Only matters at scale |
| **P3** | Gap 11: JS-rendered pages | Medium | High | Optional dependency complexity |

---

## Market Context & Risks

**The elephant in the room:** As of March 2026, no major LLM provider (OpenAI, Anthropic, Google) has announced official support for reading llms.txt files. Server log analyses show that LLM crawlers don't request these files. Google has compared llms.txt to the (now-ignored) keywords meta tag.

**However:**
- Adoption is growing (BuiltWith tracks ~844K sites)
- The standard is backed by Jeremy Howard (fast.ai) and has community momentum
- Mintlify + Anthropic collaborated on the `llms-full.txt` convention
- If even one major LLM provider starts checking for llms.txt, demand will spike
- The ecosystem has no dominant library — the market is wide open

**Strategic recommendation:** Focus on developer experience and content quality (Gaps 1, 2, 5, 6, 7, 8) rather than chasing more framework integrations. The library that produces the *best* llms.txt files and is the *easiest* to set up will win when/if the market takes off.
