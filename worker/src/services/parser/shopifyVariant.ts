import { filenameStem } from './meta';

export type VariantMatch = 'match' | 'mismatch' | 'none';

export type ShopifyVariant = {
  // Option label of the requested variant, e.g. "Slate" or "Black / M".
  title: string;
  classify: (url: string) => VariantMatch;
};

type VariantJson = {
  id: number | string;
  title?: unknown;
  public_title?: unknown;
  featured_image?: { src?: unknown } | null;
  featured_media?: { preview_image?: { src?: unknown } } | null;
};

const JSON_SCRIPT =
  /<script\b[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi;

// Resolves Shopify's `?variant=<id>` against the variants array themes embed
// as `<script type="application/json">` (Dawn's variant picker, or the
// `variants` field of a `{{ product | json }}` blob). The server render
// ignores the query — og:image and the gallery order still reflect the
// default variant — so this JSON is the only static evidence of which
// colorway the user picked.
//
// Images are classified by filename stem: the requested variant's
// `featured_image` is a match, other variants' featured images are
// mismatches. When the featured filenames differ only by a middle token
// (`merrittlowdresser{walnut,black,white}2`), any image sharing the common
// prefix plus a variant's token is attributed to that variant too, which
// catches the non-featured shots of each colorway.
export function resolveShopifyVariant(
  html: string,
  pageUrl: string,
): ShopifyVariant | null {
  let variantId: string | null;
  try {
    variantId = new URL(pageUrl).searchParams.get('variant');
  } catch {
    return null;
  }
  if (!variantId || !/^\d+$/.test(variantId)) {
    return null;
  }

  const variants = findVariantList(html, variantId);
  const requested = variants?.find((v) => String(v.id) === variantId);
  if (!variants || !requested) {
    return null;
  }
  const title = labelOf(requested);
  if (!title) {
    return null;
  }

  const stemOf = (v: VariantJson) => {
    const src = featuredSrc(v);
    return src ? filenameStem(src, pageUrl) : null;
  };
  const requestedStem = stemOf(requested);
  const otherStems = new Set<string>();
  for (const v of variants) {
    const stem = stemOf(v);
    if (stem && stem !== requestedStem) {
      otherStems.add(stem);
    }
  }
  const tokens = requestedStem
    ? distinguishingTokens(requestedStem, [...otherStems])
    : null;

  const classify = (url: string): VariantMatch => {
    const stem = filenameStem(url, pageUrl);
    if (!stem) {
      return 'none';
    }
    if (stem === requestedStem) {
      return 'match';
    }
    if (otherStems.has(stem)) {
      return 'mismatch';
    }
    if (tokens) {
      if (stem.startsWith(tokens.prefix + tokens.requested)) {
        return 'match';
      }
      if (tokens.others.some((t) => stem.startsWith(tokens.prefix + t))) {
        return 'mismatch';
      }
    }
    return 'none';
  };

  return { title, classify };
}

function findVariantList(
  html: string,
  variantId: string,
): VariantJson[] | null {
  for (const m of html.matchAll(JSON_SCRIPT)) {
    let data: unknown;
    try {
      data = JSON.parse(m[1]);
    } catch {
      continue;
    }
    const found = walk(data, variantId);
    if (found) {
      return found;
    }
  }
  return null;
}

function walk(node: unknown, variantId: string): VariantJson[] | null {
  if (Array.isArray(node)) {
    const variants = node.filter(isVariant);
    if (variants.some((v) => String(v.id) === variantId)) {
      return variants;
    }
    for (const child of node) {
      const found = walk(child, variantId);
      if (found) {
        return found;
      }
    }
  } else if (node && typeof node === 'object') {
    for (const child of Object.values(node)) {
      const found = walk(child, variantId);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

function isVariant(v: unknown): v is VariantJson {
  if (!v || typeof v !== 'object') {
    return false;
  }
  const id = (v as VariantJson).id;
  return (
    (typeof id === 'number' || typeof id === 'string') &&
    labelOf(v as VariantJson) !== null
  );
}

function labelOf(v: VariantJson): string | null {
  const label = v.public_title ?? v.title;
  return typeof label === 'string' && label.trim() ? label.trim() : null;
}

function featuredSrc(v: VariantJson): string | null {
  const src = v.featured_image?.src ?? v.featured_media?.preview_image?.src;
  return typeof src === 'string' && src ? src : null;
}

// Strips the prefix and suffix shared by every featured stem; what's left is
// each variant's distinguishing token. Bails unless the prefix is long enough
// to anchor on and no token is empty or a prefix of another — otherwise a
// startsWith test would attribute images to the wrong variant.
function distinguishingTokens(
  requested: string,
  others: string[],
): { prefix: string; requested: string; others: string[] } | null {
  if (others.length === 0) {
    return null;
  }
  const all = [requested, ...others];
  const minLen = Math.min(...all.map((s) => s.length));
  let prefixLen = 0;
  while (
    prefixLen < minLen &&
    all.every((s) => s[prefixLen] === requested[prefixLen])
  ) {
    prefixLen++;
  }
  let suffixLen = 0;
  while (
    suffixLen < minLen - prefixLen &&
    all.every(
      (s) =>
        s[s.length - 1 - suffixLen] ===
        requested[requested.length - 1 - suffixLen],
    )
  ) {
    suffixLen++;
  }
  if (prefixLen < 3) {
    return null;
  }
  const token = (s: string) => s.slice(prefixLen, s.length - suffixLen);
  const tokens = all.map(token);
  const ambiguous = tokens.some(
    (t, i) => !t || tokens.some((u, j) => i !== j && u.startsWith(t)),
  );
  if (ambiguous) {
    return null;
  }
  return {
    prefix: requested.slice(0, prefixLen),
    requested: tokens[0],
    others: tokens.slice(1),
  };
}
