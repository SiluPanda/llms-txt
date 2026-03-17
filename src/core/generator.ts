import type { LlmsTxtConfig, PageInfo, SectionConfig } from '../types.js';

export function generateLlmsTxt(config: LlmsTxtConfig, pages: PageInfo[]): string {
  const siteUrl = stripTrailingSlash(config.site.url);
  const filtered = applyFilter(config, pages);
  const sections = organizeSections(config, filtered);
  const lines: string[] = [];

  lines.push(`# ${config.site.name}`);
  lines.push('');
  lines.push(`> ${config.site.description}`);
  lines.push('');

  if (config.options?.preamble) {
    lines.push(config.options.preamble);
    lines.push('');
  }

  for (const section of sections) {
    lines.push(`## ${section.name}`);
    if (section.description) {
      lines.push(section.description);
    }
    lines.push('');
    for (const page of section.pages) {
      const fullUrl = resolveUrl(siteUrl, page.path);
      const desc = page.description ? `: ${page.description}` : '';
      lines.push(`- [${page.title}](${fullUrl})${desc}`);
    }
    lines.push('');
  }

  if (config.options?.additionalSections) {
    for (const [heading, content] of Object.entries(config.options.additionalSections)) {
      lines.push(`## ${heading}`);
      lines.push('');
      lines.push(content);
      lines.push('');
    }
  }

  return lines.join('\n').trimEnd() + '\n';
}

export function generateLlmsFullTxt(config: LlmsTxtConfig, pages: PageInfo[]): string {
  const siteUrl = stripTrailingSlash(config.site.url);
  const filtered = applyFilter(config, pages);
  const sections = organizeSections(config, filtered);
  const lines: string[] = [];

  lines.push(`# ${config.site.name}`);
  lines.push('');
  lines.push(`> ${config.site.description}`);
  lines.push('');

  if (config.options?.preamble) {
    lines.push(config.options.preamble);
    lines.push('');
  }

  for (const section of sections) {
    lines.push(`## ${section.name}`);
    if (section.description) {
      lines.push(section.description);
    }
    lines.push('');

    for (let i = 0; i < section.pages.length; i++) {
      const page = section.pages[i];
      const fullUrl = resolveUrl(siteUrl, page.path);

      lines.push(`### ${page.title}`);
      lines.push(`URL: ${fullUrl}`);
      lines.push('');
      if (page.content) {
        lines.push(page.content);
      }
      lines.push('');
      if (i < section.pages.length - 1) {
        lines.push('---');
        lines.push('');
      }
    }
  }

  if (config.options?.additionalSections) {
    for (const [heading, content] of Object.entries(config.options.additionalSections)) {
      lines.push(`## ${heading}`);
      lines.push('');
      lines.push(content);
      lines.push('');
    }
  }

  return lines.join('\n').trimEnd() + '\n';
}

interface ResolvedSection {
  name: string;
  description?: string;
  pages: PageInfo[];
}

function organizeSections(config: LlmsTxtConfig, pages: PageInfo[]): ResolvedSection[] {
  if (!config.sections || config.sections.length === 0) {
    return [{ name: 'Pages', pages }];
  }

  const assigned = new Set<string>();
  const sections: ResolvedSection[] = [];

  for (const sectionDef of config.sections) {
    const matched = matchPagesForSection(sectionDef, pages, assigned);
    for (const page of matched) {
      assigned.add(page.path);
    }
    sections.push({
      name: sectionDef.name,
      description: sectionDef.description,
      pages: matched,
    });
  }

  const remaining = pages.filter((p) => !assigned.has(p.path));
  if (remaining.length > 0) {
    sections.push({ name: 'Other', pages: remaining });
  }

  return sections;
}

function matchPagesForSection(
  section: SectionConfig,
  pages: PageInfo[],
  alreadyAssigned: Set<string>,
): PageInfo[] {
  const matched: PageInfo[] = [];

  for (const page of pages) {
    if (alreadyAssigned.has(page.path)) continue;

    if (section.pages && section.pages.includes(page.path)) {
      matched.push(page);
      continue;
    }

    if (section.pathPrefix) {
      const normalizedPath = stripTrailingSlash(page.path) || '/';
      const normalizedPrefix = stripTrailingSlash(section.pathPrefix) || '/';
      if (normalizedPath.startsWith(normalizedPrefix)) {
        matched.push(page);
      }
    }
  }

  return matched;
}

function applyFilter(config: LlmsTxtConfig, pages: PageInfo[]): PageInfo[] {
  if (!config.options?.filterPages) return pages;
  return pages.filter(config.options.filterPages);
}

function resolveUrl(siteUrl: string, path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return stripTrailingSlash(path);
  }
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return stripTrailingSlash(`${siteUrl}${normalizedPath}`);
}

function stripTrailingSlash(url: string): string {
  return url.length > 1 && url.endsWith('/') ? url.slice(0, -1) : url;
}
