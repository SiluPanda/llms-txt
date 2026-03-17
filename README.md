# llms-txt

Auto-generate and serve [`llms.txt`](https://llmstxt.org/) files so AI agents (ChatGPT, Claude, Perplexity, etc.) can discover and understand your site's content.

## What is llms.txt?

`llms.txt` is a standard that lets websites publish a structured, markdown-formatted file at `/llms.txt` describing their content. AI agents use this file to understand what a site offers without crawling every page. `llms-full.txt` is the extended variant that includes full page content inline.

## Features

- **Auto-discovery** — find pages from a local directory, sitemap URL, or live crawl
- **HTML extraction** — pull titles, descriptions, headings, JSON-LD, and OpenGraph metadata from HTML
- **Organized sections** — group pages by path prefix or explicit lists
- **Two output formats** — concise `llms.txt` index and full-content `llms-full.txt`
- **Framework adapters** — drop-in middleware for Express, Fastify, Next.js, and Hono
- **CLI** — generate files from the command line
- **Watch mode** — auto-regenerate on file changes
- **Caching** — built-in TTL cache to avoid regenerating on every request

## Install

```bash
npm install llms-txt
```

Requires Node.js >= 18.

## Quick Start

### Programmatic API

```ts
import { generate, defineConfig } from 'llms-txt';

const config = defineConfig({
  site: {
    name: 'My Docs',
    url: 'https://docs.example.com',
    description: 'Developer documentation for the Example platform.',
  },
  discover: {
    dir: './public',           // scan local HTML files
    // sitemapUrl: 'https://docs.example.com/sitemap.xml',
    // crawlUrl: 'https://docs.example.com',
  },
  sections: [
    { name: 'Guides', pathPrefix: '/guides' },
    { name: 'API Reference', pathPrefix: '/api' },
  ],
});

const output = await generate(config);

console.log(output.llmsTxt);      // llms.txt content
console.log(output.llmsFullTxt);   // llms-full.txt content
console.log(output.pages);        // discovered PageInfo[]
```

### Manual Pages

You can skip discovery entirely and provide pages directly:

```ts
const config = defineConfig({
  site: {
    name: 'My Site',
    url: 'https://example.com',
    description: 'A brief description of the site.',
  },
  pages: [
    { path: '/about', title: 'About Us', description: 'Company overview' },
    { path: '/pricing', title: 'Pricing', description: 'Plans and pricing', section: 'Product' },
  ],
  sections: [
    { name: 'Product', pages: ['/pricing'] },
  ],
});
```

## Framework Integration

### Express

```ts
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

```ts
// app/llms.txt/route.ts
import { serveLlmsTxt } from 'llms-txt/next';

export const GET = serveLlmsTxt({
  site: { name: 'My App', url: 'https://example.com', description: 'My application' },
  pages: [
    { path: '/docs', title: 'Documentation', description: 'API docs' },
  ],
});
```

Or use `createLlmsTxtHandler` for the `{ GET }` export pattern:

```ts
// app/llms.txt/route.ts
import { createLlmsTxtHandler } from 'llms-txt/next';

export const { GET } = createLlmsTxtHandler({
  site: { name: 'My App', url: 'https://example.com', description: 'My application' },
  discover: { dir: './public' },
});
```

### Fastify

```ts
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

```ts
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

# Skip llms-full.txt
npx llms-txt generate --name "My Site" --description "..." --dir ./public --no-full

# Watch mode (requires --dir)
npx llms-txt generate --name "My Site" --description "..." --dir ./public --watch

# Use a config file
npx llms-txt generate --config ./llms-txt.config.ts
```

### CLI Options

| Option | Description |
|---|---|
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

```ts
interface LlmsTxtConfig {
  site: {
    name: string;          // Site name (rendered as # heading)
    url: string;           // Base URL for resolving page paths
    description: string;   // Site description (rendered as > blockquote)
  };
  pages?: PageConfig[];        // Manually specified pages
  discover?: DiscoverOptions;  // Auto-discovery settings
  sections?: SectionConfig[];  // Page grouping rules
  options?: GenerateOptions;   // Generation settings
}
```

### Discovery Options

```ts
interface DiscoverOptions {
  dir?: string;          // Directory to scan for HTML files
  sitemapUrl?: string;   // Sitemap URL to parse
  crawlUrl?: string;     // URL to crawl (follows internal links)
  maxDepth?: number;     // Max crawl depth (default: 3)
  include?: string[];    // Glob patterns to include (default: ['**/*.html'])
  exclude?: string[];    // Glob patterns to exclude
}
```

All three discovery methods can be combined — results are deduplicated by path.

### Sections

Pages can be organized into named sections using path prefixes or explicit page lists:

```ts
const config = defineConfig({
  // ...
  sections: [
    { name: 'Documentation', pathPrefix: '/docs', description: 'Technical guides' },
    { name: 'Blog', pathPrefix: '/blog' },
    { name: 'Legal', pages: ['/terms', '/privacy'] },
  ],
});
```

Pages not matching any section are placed in an "Other" section automatically.

### Generation Options

```ts
interface GenerateOptions {
  full?: boolean;               // Generate llms-full.txt (default: true)
  preamble?: string;            // Custom markdown inserted after site description
  additionalSections?: Record<string, string>;  // Extra sections appended to output
  cacheTtl?: number;            // Cache TTL in ms (default: 60000, 0 to disable)
  filterPages?: (page: PageInfo) => boolean;    // Custom page filter
}
```

### Config File

Create a `llms-txt.config.ts` (or `.js`) file with a default export:

```ts
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

## Output Format

### llms.txt

```markdown
# My Docs

> Developer documentation for the Example platform.

## Guides

- [Getting Started](https://docs.example.com/guides/getting-started): Step-by-step setup guide
- [Authentication](https://docs.example.com/guides/auth): How to authenticate API requests

## API Reference

- [REST API](https://docs.example.com/api/rest): Full REST endpoint reference
```

### llms-full.txt

Same structure with full page content included under each entry:

```markdown
# My Docs

> Developer documentation for the Example platform.

## Guides

### Getting Started
URL: https://docs.example.com/guides/getting-started

Step-by-step setup guide for the Example platform...

---

### Authentication
URL: https://docs.example.com/guides/auth

How to authenticate API requests using API keys or OAuth...
```

## Core API

For advanced use cases, the individual modules are exported:

```ts
import {
  // Discovery
  discoverPages,
  discoverFromDirectory,
  discoverFromSitemap,
  crawlUrl,

  // Extraction
  extractPageInfo,

  // Generation
  generateLlmsTxt,
  generateLlmsFullTxt,

  // Utilities
  Cache,
  watch,
} from 'llms-txt';
```

## License

MIT
