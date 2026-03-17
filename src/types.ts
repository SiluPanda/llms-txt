// ── Page types ──────────────────────────────────────────────

/** A page explicitly provided by the user. */
export interface PageConfig {
  /** URL path relative to site root (e.g. '/about'). */
  path: string;
  /** Page title. */
  title: string;
  /** Brief description of the page content. */
  description?: string;
  /** Section this page belongs to (matches SectionConfig.name). */
  section?: string;
  /** Full page content (used in llms-full.txt). */
  content?: string;
}

/** Information extracted from an HTML page. */
export interface PageInfo {
  /** URL path. */
  path: string;
  /** Page title from <title> or <h1>. */
  title: string;
  /** Meta description. */
  description: string;
  /** Main text content (cleaned). */
  content: string;
  /** Section headings found in the page. */
  headings: string[];
  /** JSON-LD structured data found on the page. */
  structuredData?: Record<string, unknown>[];
  /** OpenGraph metadata. */
  og?: {
    title?: string;
    description?: string;
    type?: string;
    image?: string;
  };
}

// ── Section types ───────────────────────────────────────────

/** A named section for grouping pages in the generated output. */
export interface SectionConfig {
  /** Section name (rendered as a ## heading). */
  name: string;
  /** Include pages whose path starts with this prefix. */
  pathPrefix?: string;
  /** Optional description shown below the heading. */
  description?: string;
  /** Explicit list of page paths to include in this section. */
  pages?: string[];
}

// ── Discovery types ─────────────────────────────────────────

/** Options for auto-discovering pages. */
export interface DiscoverOptions {
  /** Directory to scan for HTML files. */
  dir?: string;
  /** Sitemap URL to parse. */
  sitemapUrl?: string;
  /** URL to crawl (follows internal links). */
  crawlUrl?: string;
  /** Max depth for URL crawling (default: 3). */
  maxDepth?: number;
  /** Glob patterns for files to include (default: ['**\/*.html']). */
  include?: string[];
  /** Glob patterns for files to exclude. */
  exclude?: string[];
}

// ── Generation options ──────────────────────────────────────

/** Options that control how llms.txt is generated. */
export interface GenerateOptions {
  /** Generate llms-full.txt with full page content (default: true). */
  full?: boolean;
  /** Custom markdown to insert after the site description. */
  preamble?: string;
  /** Additional sections appended to the output. Key = heading, value = markdown. */
  additionalSections?: Record<string, string>;
  /** Cache TTL in milliseconds (default: 60_000). Set to 0 to disable. */
  cacheTtl?: number;
  /** Custom filter applied to discovered pages. Return false to exclude. */
  filterPages?: (page: PageInfo) => boolean;
}

// ── Main config ─────────────────────────────────────────────

/** Top-level configuration for llms-txt. */
export interface LlmsTxtConfig {
  /** Site metadata. */
  site: {
    /** Site or business name. */
    name: string;
    /** Canonical site URL (e.g. 'https://example.com'). */
    url: string;
    /** Brief site description (1-2 sentences). */
    description: string;
  };
  /** Manually specified pages. */
  pages?: PageConfig[];
  /** Auto-discovery options. */
  discover?: DiscoverOptions;
  /** Sections for organizing pages in the output. */
  sections?: SectionConfig[];
  /** Generation options. */
  options?: GenerateOptions;
}

// ── Output types ────────────────────────────────────────────

/** The generated output. */
export interface LlmsTxtOutput {
  /** Content of llms.txt. */
  llmsTxt: string;
  /** Content of llms-full.txt (omitted when options.full is false). */
  llmsFullTxt?: string;
  /** Pages that were included. */
  pages: PageInfo[];
  /** Generation timestamp. */
  generatedAt: Date;
}

// ── Cache types ─────────────────────────────────────────────

/** Internal cache entry. */
export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}
