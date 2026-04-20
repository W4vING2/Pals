import { NextRequest, NextResponse } from "next/server";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export const runtime = "nodejs";

export interface LinkPreviewData {
  title: string | null;
  description: string | null;
  image: string | null;
  url: string;
  siteName: string | null;
}

const MAX_HTML_BYTES = 100_000;
const MAX_REDIRECTS = 4;

function isPrivateIPv4Address(ip: string): boolean {
  const parts = ip.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return true;
  const [a, b] = parts;

  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;

  return false;
}

function isPrivateIPv6Address(ip: string): boolean {
  const normalized = ip.toLowerCase();

  if (normalized === "::1" || normalized === "::") return true;
  if (/^fe[89ab]/.test(normalized)) return true; // fe80::/10 (link-local)
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true; // fc00::/7 (ULA)

  // IPv4-mapped IPv6, e.g. ::ffff:127.0.0.1
  if (normalized.startsWith("::ffff:")) {
    const mappedV4 = normalized.slice("::ffff:".length);
    if (isIP(mappedV4) === 4) return isPrivateIPv4Address(mappedV4);
  }

  return false;
}

function isPrivateAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isPrivateIPv4Address(address);
  if (family === 6) return isPrivateIPv6Address(address);
  return true;
}

function isBlockedHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  if (!normalized) return true;
  if (normalized === "localhost" || normalized.endsWith(".localhost")) return true;
  if (normalized.endsWith(".local")) return true;
  return false;
}

async function resolvesToPrivateAddress(hostname: string): Promise<boolean> {
  if (isBlockedHostname(hostname)) return true;

  const literalFamily = isIP(hostname);
  if (literalFamily > 0) return isPrivateAddress(hostname);

  try {
    const records = await lookup(hostname, { all: true, verbatim: true });
    if (records.length === 0) return true;
    return records.some((record) => isPrivateAddress(record.address));
  } catch {
    // DNS failure -> treat as unsafe for server-side fetching
    return true;
  }
}

async function isSafeHttpTarget(url: URL): Promise<boolean> {
  if (!["http:", "https:"].includes(url.protocol)) return false;
  if (url.username || url.password) return false;
  if (await resolvesToPrivateAddress(url.hostname)) return false;
  return true;
}

async function fetchHtmlWithRedirectGuards(
  initialUrl: string,
  signal: AbortSignal
): Promise<{ html: string; finalUrl: string } | null> {
  let currentUrl = new URL(initialUrl);

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount++) {
    if (!(await isSafeHttpTarget(currentUrl))) return null;

    const res = await fetch(currentUrl.href, {
      signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; PalsBot/1.0)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "manual",
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) return null;
      currentUrl = new URL(location, currentUrl.href);
      continue;
    }

    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) return null;

    const reader = res.body?.getReader();
    if (!reader) return null;

    const chunks: Uint8Array[] = [];
    let totalBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      chunks.push(value);
      totalBytes += value.byteLength;
      if (totalBytes >= MAX_HTML_BYTES) {
        await reader.cancel();
        break;
      }
    }

    const combined = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.byteLength;
    }

    return {
      html: new TextDecoder().decode(combined),
      finalUrl: currentUrl.href,
    };
  }

  return null;
}

function extractMeta(html: string, url: string): LinkPreviewData {
  const getMeta = (property: string): string | null => {
    // og: property
    const ogMatch = html.match(
      new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`, "i")
    ) ?? html.match(
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["']`, "i")
    );
    return ogMatch?.[1] ?? null;
  };

  const getMetaName = (name: string): string | null => {
    const match = html.match(
      new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']+)["']`, "i")
    ) ?? html.match(
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${name}["']`, "i")
    );
    return match?.[1] ?? null;
  };

  const titleTagMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const titleTag = titleTagMatch?.[1]?.trim() ?? null;

  const title = getMeta("og:title") ?? titleTag;
  const description = getMeta("og:description") ?? getMetaName("description");
  const image = getMeta("og:image");
  const siteName = getMeta("og:site_name");

  // Resolve relative image URLs
  let resolvedImage = image;
  if (image && !image.startsWith("http")) {
    try {
      resolvedImage = new URL(image, url).href;
    } catch {
      resolvedImage = null;
    }
  }

  return { title, description, image: resolvedImage, url, siteName };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const rawUrl = searchParams.get("url");

  const nullResult = (u: string): NextResponse =>
    NextResponse.json(
      { title: null, description: null, image: null, url: u, siteName: null } satisfies LinkPreviewData,
      { headers: { "Cache-Control": "public, max-age=3600" } }
    );

  if (!rawUrl) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  let targetUrl: string;
  try {
    const parsed = new URL(rawUrl);
    if (!(await isSafeHttpTarget(parsed))) throw new Error("unsafe target");
    targetUrl = parsed.href;
  } catch {
    return nullResult(rawUrl);
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const result = await fetchHtmlWithRedirectGuards(targetUrl, controller.signal);
      if (!result) return nullResult(targetUrl);
      const data = extractMeta(result.html, result.finalUrl);
      return NextResponse.json(data, {
        headers: { "Cache-Control": "public, max-age=3600" },
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return nullResult(targetUrl);
  }
}
