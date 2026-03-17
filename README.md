# llms-txt

**Make your website discoverable by AI agents in minutes.**

Every AI agent — ChatGPT, Claude, Perplexity, Copilot — needs to understand what your site offers. Instead of letting them blindly crawl, guess, or hallucinate, `llms-txt` auto-generates a structured [`llms.txt`](https://llmstxt.org/) manifest that tells agents exactly what's on your site, organized and ready to consume.

Point it at your HTML files, a sitemap, or a live URL. It discovers your pages, extracts titles, descriptions, headings, JSON-LD, and OpenGraph metadata, organizes everything into sections, and serves the result as drop-in middleware for **Express**, **Fastify**, **Next.js**, or **Hono**.

## Features

- 🔍 **Auto-Discovery** — Scan a local directory, parse a sitemap, or crawl a live site. Combine all three — results are deduplicated automatically.
- 🧠 **Smart Extraction** — Pulls titles, descriptions, headings, JSON-LD structured data, and OpenGraph metadata from raw HTML using Cheerio.
- 📑 **Organized Sections** — Group pages by path prefix (`/docs`, `/blog`) or explicit page lists. Unmatched pages go to "Other" automatically.
- 📄 **Two Output Formats** — Concise `llms.txt` index with links + descriptions, and `llms-full.txt` with full page content inline.
- 🔌 **Framework Adapters** — Drop-in middleware for Express, Fastify, Next.js (App Router), and Hono. Two lines of code.
- ⚡ **Built-in Caching** — TTL-based in-memory cache so you're not regenerating on every request.
- 👁️ **Watch Mode** — Auto-regenerate when your source files change.
- 🖥️ **CLI** — Generate files from the command line, from a config file, or in watch mode.
- 🇹 **Type-Safe** — 100% TypeScript with full type exports.

## Installation

```bash
npm install llms-txt
```

Requires Node.js >= 18.

## Quick Start

### Generate from a local directory

```typescript
import { generate } from 'llms-txt';

const output = await generate({
  site: {
    name: 'My Docs',
    url: 'https://docs.example.com',
    description: 'Developer documentation for the Example platform.',
  },
  discover: { dir: './public' },
  sections: [
    { name: 'Guides', pathPrefix: '/guides' },
    { name: 'API Reference', pathPrefix: '/api' },
  ],
});

console.log(output.llmsTxt);     // llms.txt content
console.log(output.llmsFullTxt); // llms-full.txt content
console.log(output.pages);       // PageInfo[] with extracted metadata
```

### Generate from a live website

```typescript
const output = await generate({
  site: {
    name: 'Express.js',
    url: 'https://expressjs.com',
    description: 'Fast, unopinionated, minimalist web framework for Node.js.',
  },
  discover: {
    crawlUrl: 'https://expressjs.com',  // follows internal links
    maxDepth: 2,
  },
  sections: [
    { name: 'Getting Started', pathPrefix: '/en/starter' },
    { name: 'Guide', pathPrefix: '/en/guide' },
    { name: 'API', pathPrefix: '/en/api' },
  ],
});
```

### Generate from a sitemap

```typescript
const output = await generate({
  site: {
    name: 'Vite',
    url: 'https://vite.dev',
    description: 'Next generation frontend tooling.',
  },
  discover: { sitemapUrl: 'https://vite.dev/sitemap.xml' },
  sections: [
    { name: 'Guide', pathPrefix: '/guide' },
    { name: 'Config', pathPrefix: '/config' },
  ],
});
```

### Manual pages (no discovery)

```typescript
const output = await generate({
  site: {
    name: 'My Site',
    url: 'https://example.com',
    description: 'A brief description of the site.',
  },
  pages: [
    { path: '/', title: 'Home', description: 'Welcome to our site' },
    { path: '/about', title: 'About Us', description: 'Company overview' },
    { path: '/pricing', title: 'Pricing', description: 'Plans and pricing' },
  ],
  sections: [
    { name: 'Product', pages: ['/pricing'] },
  ],
});
```

## Output Preview

### llms.txt

```markdown
# My Docs

> Developer documentation for the Example platform.

## Guides

- [Getting Started](https://docs.example.com/guides/getting-started): Step-by-step setup guide
- [Authentication](https://docs.example.com/guides/auth): How to authenticate API requests

## API Reference

- [REST API](https://docs.example.com/api/rest): Full REST endpoint reference
- [Webhooks](https://docs.example.com/api/webhooks): Receive real-time event notifications
```

### llms-full.txt

Same structure with full page content included under each entry:

```markdown
# My Docs

> Developer documentation for the Example platform.

## Guides

### Getting Started
URL: https://docs.example.com/guides/getting-started

Step-by-step setup guide for the Example platform. Install the SDK,
configure your API key, and make your first request in under 5 minutes...

---

### Authentication
URL: https://docs.example.com/guides/auth

How to authenticate API requests using API keys or OAuth tokens...
```

## Framework Integration

### Express

```typescript
import express from 'express';
import { llmsTxt } from 'llms-txt/express';

const app = express();

app.use(llmsTxt({
  site: { name: 'My App', url: 'https://example.com', description: 'My application' },
  discover: { dir: './public' },
}));

// Serves /llms.txt and /llms-full.txt automatically
app.listen(3000);
```

### Next.js (App Router)

```typescript
// app/llms.txt/route.ts
import { serveLlmsTxt } from 'llms-txt/next';

export const GET = serveLlmsTxt({
  site: { name: 'My App', url: 'https://example.com', description: 'My application' },
  pages: [
    { path: '/docs', title: 'Documentation', description: 'API docs' },
  ],
});
```

Or use the `{ GET }` export pattern:

```typescript
// app/llms.txt/route.ts
import { createLlmsTxtHandler } from 'llms-txt/next';

export const { GET } = createLlmsTxtHandler({
  site: { name: 'My App', url: 'https://example.com', description: 'My application' },
  discover: { dir: './public' },
});
```

### Fastify

```typescript
import Fastify from 'fastify';
import { llmsTxtPlugin } from 'llms-txt/fastify';

const app = Fastify();

app.register(llmsTxtPlugin({
  site: { name: 'My App', url: 'https://example.com', description: 'My application' },
  discover: { dir: './public' },
}));

app.listen({ port: 3000 });
```

### Hono

```typescript
import { Hono } from 'hono';
import { llmsTxt } from 'llms-txt/hono';

const app = new Hono();

app.use('*', llmsTxt({
  site: { name: 'My App', url: 'https://example.com', description: 'My application' },
  discover: { dir: './public' },
}));

export default app;
```

## CLI

```bash
# From a local directory
npx llms-txt generate \
  --name "My Docs" \
  --description "Developer documentation" \
  --dir ./public \
  --output ./dist

# From a sitemap
npx llms-txt generate \
  --name "My Site" \
  --description "Main website" \
  --sitemap https://example.com/sitemap.xml \
  --output ./dist

# Crawl a live site
npx llms-txt generate \
  --name "My Site" \
  --description "Main website" \
  --url https://example.com \
  --output ./dist

# Watch mode (auto-regenerate on file changes)
npx llms-txt generate --name "My Site" --description "..." --dir ./public --watch

# From a config file
npx llms-txt generate --config ./llms-txt.config.ts
```

### CLI Options

| Option | Description |
|--------|-------------|
| `-u, --url <url>` | Site URL (used as base URL and for crawling) |
| `-d, --dir <dir>` | Directory to scan for HTML files |
| `-s, --sitemap <url>` | Sitemap URL to parse |
| `-n, --name <name>` | Site name (required unless using `--config`) |
| `--description <text>` | Site description (required unless using `--config`) |
| `-o, --output <dir>` | Output directory (default: `.`) |
| `-c, --config <file>` | Config file path (JS/TS with default export) |
| `--no-full` | Skip generating `llms-full.txt` |
| `-w, --watch` | Watch source directory and regenerate on changes |

## Configuration

### `LlmsTxtConfig`

```typescript
interface LlmsTxtConfig {
  site: {
    name: string;          // Site name — rendered as the # heading
    url: string;           // Base URL for resolving page paths
    description: string;   // Site description — rendered as > blockquote
  };
  pages?: PageConfig[];        // Manually specified pages
  discover?: DiscoverOptions;  // Auto-discovery settings
  sections?: SectionConfig[];  // Page grouping rules
  options?: GenerateOptions;   // Generation settings
}
```

### Discovery Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `dir` | `string` | — | Directory to scan for HTML files. |
| `sitemapUrl` | `string` | — | Sitemap URL to fetch and parse for page URLs. |
| `crawlUrl` | `string` | — | URL to crawl by following internal links. |
| `maxDepth` | `number` | `3` | Maximum crawl depth (link hops from start URL). |
| `include` | `string[]` | `['**/*.html']` | Glob patterns to include when scanning a directory. |
| `exclude` | `string[]` | `[]` | Glob patterns to exclude. |

All three discovery methods can be combined — results are deduplicated by normalized path.

### Sections

Pages can be organized into named sections using path prefixes or explicit page lists:

```typescript
const config = defineConfig({
  // ...
  sections: [
    { name: 'Documentation', pathPrefix: '/docs', description: 'Technical guides' },
    { name: 'Blog', pathPrefix: '/blog' },
    { name: 'Legal', pages: ['/terms', '/privacy'] },
  ],
});
```

First match wins — a page is assigned to the first section whose `pathPrefix` matches or whose `pages` list includes it. Unmatched pages are placed in an "Other" section automatically.

### Generation Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `full` | `boolean` | `true` | Generate `llms-full.txt` alongside `llms.txt`. |
| `preamble` | `string` | — | Custom markdown inserted after the site description. |
| `additionalSections` | `Record<string, string>` | — | Extra sections appended to the end of the output. |
| `cacheTtl` | `number` | `60000` | Cache TTL in milliseconds. Set to `0` to disable caching. |
| `filterPages` | `(page: PageInfo) => boolean` | — | Custom filter — return `false` to exclude a page from output. |

### Config File

Create a `llms-txt.config.ts` (or `.js`) with a default export:

```typescript
// llms-txt.config.ts
import { defineConfig } from 'llms-txt';

export default defineConfig({
  site: {
    name: 'My Docs',
    url: 'https://docs.example.com',
    description: 'Developer documentation for the Example platform.',
  },
  discover: {
    dir: './public',
    include: ['**/*.html'],
    exclude: ['**/drafts/**'],
  },
  sections: [
    { name: 'Guides', pathPrefix: '/guides' },
    { name: 'API Reference', pathPrefix: '/api' },
  ],
  options: {
    preamble: 'This documentation covers the Example REST API and client SDKs.',
    cacheTtl: 300_000,
    filterPages: (page) => !page.path.includes('/internal/'),
  },
});
```

## Return Values

### `generate()` → `LlmsTxtOutput`

```typescript
{
  llmsTxt: string;           // The generated llms.txt content
  llmsFullTxt?: string;      // The generated llms-full.txt content (when full: true)
  pages: PageInfo[];         // All resolved pages with extracted metadata
  generatedAt: Date;         // Timestamp of generation
}
```

### `PageInfo` (extracted from HTML)

```typescript
{
  path: string;              // URL path (e.g., "/docs/getting-started")
  title: string;             // From <title> or <h1>
  description: string;       // From <meta name="description">
  content: string;           // Main text content (from <main>, <article>, or <body>)
  headings: string[];        // All h2/h3 heading text
  structuredData?: Record<string, unknown>[];  // JSON-LD data
  og?: {                     // OpenGraph metadata
    title?: string;
    description?: string;
    type?: string;
    image?: string;
  };
}
```

## Core API

For advanced use cases, all internal modules are exported:

```typescript
import {
  // High-level
  generate,                  // Full pipeline: discover → extract → generate
  defineConfig,              // Type-safe config helper

  // Discovery
  discoverPages,             // Run all discovery methods and deduplicate
  discoverFromDirectory,     // Scan local HTML files
  discoverFromSitemap,       // Fetch and parse a sitemap
  crawlUrl,                  // Crawl a URL following internal links

  // Extraction
  extractPageInfo,           // Parse HTML → PageInfo with cheerio

  // Generation
  generateLlmsTxt,          // PageInfo[] → llms.txt string
  generateLlmsFullTxt,      // PageInfo[] → llms-full.txt string

  // Utilities
  Cache,                     // TTL-based in-memory cache
  watch,                     // File system watcher for auto-regeneration
} from 'llms-txt';
```

## License

MIT
