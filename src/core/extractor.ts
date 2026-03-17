import * as cheerio from 'cheerio';
import type { PageInfo } from '../types.js';

export function extractPageInfo(html: string, url: string): PageInfo {
  try {
    const $ = cheerio.load(html);

    const title = $('title').first().text().trim() || $('h1').first().text().trim() || '';
    const description =
      $('meta[name="description"]').attr('content')?.trim() || '';

    const headings: string[] = [];
    $('h2, h3').each((_, el) => {
      const text = $(el).text().trim();
      if (text) headings.push(text);
    });

    const content = extractMainContent($);

    const structuredData = extractJsonLd($);

    const og = extractOpenGraph($);

    return {
      path: url,
      title,
      description,
      content,
      headings,
      ...(structuredData.length > 0 ? { structuredData } : {}),
      ...(Object.keys(og).length > 0 ? { og } : {}),
    };
  } catch {
    return {
      path: url,
      title: '',
      description: '',
      content: '',
      headings: [],
    };
  }
}

function extractMainContent($: cheerio.CheerioAPI): string {
  const clone = cheerio.load($.html() || '');

  let container = clone('main');
  if (container.length === 0) container = clone('article');
  if (container.length === 0) container = clone('body');
  if (container.length === 0) return '';

  container.find('script, style, nav, header, footer, aside').remove();

  const text = container.text();
  return text.replace(/\s+/g, ' ').trim();
}

function extractJsonLd($: cheerio.CheerioAPI): Record<string, unknown>[] {
  const results: Record<string, unknown>[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const raw = $(el).html();
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (Array.isArray(parsed)) {
        results.push(...(parsed as Record<string, unknown>[]));
      } else {
        results.push(parsed);
      }
    } catch {
      // skip malformed JSON-LD
    }
  });
  return results;
}

function extractOpenGraph($: cheerio.CheerioAPI): NonNullable<PageInfo['og']> {
  const og: NonNullable<PageInfo['og']> = {};
  const mapping: Record<string, keyof NonNullable<PageInfo['og']>> = {
    'og:title': 'title',
    'og:description': 'description',
    'og:type': 'type',
    'og:image': 'image',
  };

  for (const [property, key] of Object.entries(mapping)) {
    const value = $(`meta[property="${property}"]`).attr('content')?.trim();
    if (value) {
      og[key] = value;
    }
  }

  return og;
}
