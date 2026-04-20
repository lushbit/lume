import dns from "node:dns/promises";
import net from "node:net";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import { NextResponse } from "next/server";
import sanitizeHtml from "sanitize-html";

type ExtractRequest = {
  url?: string;
};

type GuardResult = {
  ok: boolean;
  code?: string;
  message?: string;
};

const BLOCKED_DOMAIN_KEYWORDS = [
  "amazon.",
  "ebay.",
  "facebook.",
  "twitter.",
  "x.com",
  "instagram.",
  "tiktok.",
  "pinterest.",
  "linkedin.",
  "reddit.",
];

const ALLOWED_OG_TYPES = new Set(["article", "blog", "website"]);
const TRANSACTIONAL_PATTERNS = [
  /add to cart/i,
  /\bbuy now\b/i,
  /\bcart\b/i,
  /\bqty\b/i,
  /\bquantity\b/i,
  /\bprice\s*[:$]/i,
  /\bspecifications?\b/i,
  /\breviews?\b/i,
];
const POSITIVE_LD_TYPES = new Set(["article", "newsarticle", "blogposting", "techarticle", "reportagearticle"]);
const NEGATIVE_LD_TYPES = new Set(["product", "offer", "offers", "recipe"]);
const ECOMMERCE_HINTS = [
  "[data-testid*='add-to-cart']",
  "[class*='add-to-cart']",
  "[class*='product-price']",
  "[id*='add-to-cart']",
  "button[name='add']",
  "form[action*='cart']",
];
const MAX_REDIRECTS = 5;
const MAX_HTML_BYTES = 3_000_000;
const UPSTREAM_TIMEOUT_MS = 10_000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 20;
const SECURITY_EVENT_WINDOW_MS = 10 * 60_000;
const SECURITY_EVENT_ALERT_THRESHOLD = 8;
const SECURITY_EVENT_ALERT_COOLDOWN_MS = 5 * 60_000;
const UPSTREAM_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml",
};
const SECURITY_ALERT_WEBHOOK_URL = process.env.SECURITY_ALERT_WEBHOOK_URL?.trim();

const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();
const securityEventBuckets = new Map<string, { count: number; windowStart: number; lastAlertAt: number }>();

function isRedirectStatus(status: number) {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function getClientKey(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }
  const realIp = request.headers.get("x-real-ip")?.trim();
  return realIp || "unknown-client";
}

function checkRateLimit(clientKey: string) {
  const now = Date.now();
  for (const [key, bucket] of rateLimitBuckets) {
    if (bucket.resetAt <= now) {
      rateLimitBuckets.delete(key);
    }
  }

  const current = rateLimitBuckets.get(clientKey);
  if (!current) {
    rateLimitBuckets.set(clientKey, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    });
    return {
      allowed: true,
      remaining: RATE_LIMIT_MAX_REQUESTS - 1,
      retryAfterSec: Math.ceil(RATE_LIMIT_WINDOW_MS / 1000),
    };
  }

  if (current.count >= RATE_LIMIT_MAX_REQUESTS) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSec: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }

  current.count += 1;
  return {
    allowed: true,
    remaining: Math.max(0, RATE_LIMIT_MAX_REQUESTS - current.count),
    retryAfterSec: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
  };
}

function recordSecurityEvent(clientKey: string, category: "blocked" | "failed", context: string) {
  const now = Date.now();
  const bucketKey = `${clientKey}:${category}`;
  let bucket = securityEventBuckets.get(bucketKey);
  if (!bucket || now - bucket.windowStart > SECURITY_EVENT_WINDOW_MS) {
    bucket = { count: 0, windowStart: now, lastAlertAt: 0 };
    securityEventBuckets.set(bucketKey, bucket);
  }

  bucket.count += 1;
  if (bucket.count >= SECURITY_EVENT_ALERT_THRESHOLD && now - bucket.lastAlertAt > SECURITY_EVENT_ALERT_COOLDOWN_MS) {
    bucket.lastAlertAt = now;
    const payload = {
      event: "lume-security-alert",
      category,
      clientKey,
      count: bucket.count,
      windowMs: SECURITY_EVENT_WINDOW_MS,
      context,
      timestamp: new Date(now).toISOString(),
    };
    console.warn("[lume-security-alert]", payload);

    if (SECURITY_ALERT_WEBHOOK_URL) {
      void fetch(SECURITY_ALERT_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).catch(() => {
        console.error("[lume-security-alert-webhook-failed]", {
          category,
          clientKey,
          context,
        });
      });
    }

    return;
  }

  if (bucket.count >= SECURITY_EVENT_ALERT_THRESHOLD) {
    console.info("[lume-security-alert-suppressed]", {
      category,
      clientKey,
      count: bucket.count,
      windowMs: SECURITY_EVENT_WINDOW_MS,
      context,
    });
  }
}

async function fetchWithTimeout(url: URL): Promise<{ response: Response | null; timedOut: boolean }> {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const response = await fetch(url.toString(), {
      headers: UPSTREAM_HEADERS,
      cache: "no-store",
      redirect: "manual",
      signal: controller.signal,
    });
    return { response, timedOut: false };
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      return { response: null, timedOut: true };
    }
    throw error;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

function isPrivateIpv4(ip: string) {
  const parts = ip.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
    return false;
  }
  const [a, b] = parts;
  return (
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

function isLocalHost(hostname: string) {
  const host = hostname.toLowerCase();
  return (
    host === "localhost" ||
    host.endsWith(".local") ||
    host.endsWith(".localhost") ||
    host.endsWith(".internal")
  );
}

function isBlockedDomain(hostname: string) {
  const host = hostname.toLowerCase();
  return BLOCKED_DOMAIN_KEYWORDS.some((entry) => host.includes(entry));
}

function normalizeUrl(rawUrl: string): URL | null {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "https:") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function linkToTextRatio(document: Document, textLength: number) {
  if (textLength <= 0) {
    return 1;
  }
  const linkText = Array.from(document.querySelectorAll("a"))
    .map((anchor) => anchor.textContent?.trim() ?? "")
    .join(" ");
  return linkText.length / textLength;
}

function countWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function paragraphSignals(document: Document) {
  const paragraphs = Array.from(document.querySelectorAll("p"));
  let longParagraphCount = 0;
  let paragraphTextLength = 0;
  for (const paragraph of paragraphs) {
    const text = paragraph.textContent?.trim() ?? "";
    paragraphTextLength += text.length;
    if (countWords(text) > 20) {
      longParagraphCount += 1;
    }
  }
  return {
    totalParagraphs: paragraphs.length,
    longParagraphCount,
    paragraphTextLength,
  };
}

function transactionalKeywordMatch(text: string) {
  for (const pattern of TRANSACTIONAL_PATTERNS) {
    const match = text.match(pattern);
    if (match?.[0]) {
      return match[0];
    }
  }
  return null;
}

function collectJsonLdTypes(input: unknown, collector: Set<string>) {
  if (!input || typeof input !== "object") {
    return;
  }
  if (Array.isArray(input)) {
    for (const item of input) {
      collectJsonLdTypes(item, collector);
    }
    return;
  }

  const record = input as Record<string, unknown>;
  const typeValue = record["@type"];
  if (typeof typeValue === "string") {
    collector.add(typeValue.toLowerCase());
  } else if (Array.isArray(typeValue)) {
    for (const entry of typeValue) {
      if (typeof entry === "string") {
        collector.add(entry.toLowerCase());
      }
    }
  }

  for (const value of Object.values(record)) {
    collectJsonLdTypes(value, collector);
  }
}

function extractJsonLdTypes(document: Document) {
  const scripts = Array.from(document.querySelectorAll("script[type='application/ld+json']"));
  const types = new Set<string>();

  for (const script of scripts) {
    const raw = script.textContent?.trim();
    if (!raw) {
      continue;
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      collectJsonLdTypes(parsed, types);
    } catch {
      // Ignore malformed JSON-LD blocks.
    }
  }

  return types;
}

function urlHasArticlePattern(url: URL) {
  const path = url.pathname.toLowerCase();
  return (
    /\/\d{4}\/\d{1,2}(\/\d{1,2})?\//.test(path) ||
    /\/(news|article|articles|blog|story|stories|politics|opinion)\//.test(path) ||
    /\/p\/[a-z0-9-]+/.test(path)
  );
}

function articleConfidenceScore(params: {
  url: URL;
  ogType: string;
  jsonLdTypes: Set<string>;
  bodyText: string;
  articleText: string;
  articleDoc: Document;
  hasByline: boolean;
}) {
  const { url, ogType, jsonLdTypes, bodyText, articleText, articleDoc, hasByline } = params;
  let score = 0;
  const reasons: string[] = [];

  const hasPositiveLd = [...jsonLdTypes].some((type) => POSITIVE_LD_TYPES.has(type));
  const hasNegativeLd = [...jsonLdTypes].some((type) => NEGATIVE_LD_TYPES.has(type));
  if (hasPositiveLd) {
    score += 4;
    reasons.push("structured data marks this as an article/blog");
  }
  if (hasNegativeLd) {
    score -= 6;
    reasons.push("structured data marks this as product/offer content");
  }

  if (ogType === "article" || ogType === "blog") {
    score += 2;
    reasons.push(`og:type=${ogType}`);
  }
  if (urlHasArticlePattern(url)) {
    score += 1;
    reasons.push("URL structure looks editorial");
  }

  const articleParagraphs = paragraphSignals(articleDoc);
  if (articleParagraphs.longParagraphCount >= 3) {
    score += 2;
    reasons.push("contains multiple long paragraphs");
  } else if (articleParagraphs.longParagraphCount >= 2) {
    score += 1;
  }

  const textLength = articleText.length;
  if (textLength >= 1200) {
    score += 3;
    reasons.push("high readable text volume");
  } else if (textLength >= 700) {
    score += 2;
  } else if (textLength >= 450) {
    score += 1;
  } else if (textLength < 300) {
    score -= 3;
    reasons.push("very low readable text volume");
  }

  const articleLinkDensity = linkToTextRatio(articleDoc, textLength);
  if (articleLinkDensity > 1.2) {
    score -= 4;
    reasons.push("very high link density");
  } else if (articleLinkDensity > 0.85) {
    score -= 2;
  }

  if (hasByline) {
    score += 1;
  }

  const articleHeading = articleDoc.querySelector("h1,h2");
  if (!articleHeading && articleParagraphs.totalParagraphs < 3) {
    score -= 1;
  }

  const transactionalMatch = transactionalKeywordMatch(bodyText);
  if (transactionalMatch) {
    score -= 4;
    reasons.push(`transactional phrase detected ("${transactionalMatch}")`);
  }

  return { score, reasons, hasNegativeLd, articleLinkDensity, transactionalMatch };
}

async function validateHost(url: URL): Promise<GuardResult> {
  const hostname = url.hostname.toLowerCase();

  if (isLocalHost(hostname) || isBlockedDomain(hostname)) {
    if (isBlockedDomain(hostname)) {
      return {
        ok: false,
        code: "blocked_domain_category",
        message:
          "This domain appears to be transactional or social-media focused, not long-form article content.",
      };
    }
    return {
      ok: false,
      code: "blocked_local_host",
      message: "This URL points to a local/internal host, which is not allowed for security reasons.",
    };
  }

  const ipType = net.isIP(hostname);
  if (ipType === 4 && isPrivateIpv4(hostname)) {
    return {
      ok: false,
      code: "blocked_private_ip",
      message: "This URL resolves to a private network IP, which is blocked by Lume.",
    };
  }
  if (ipType === 6 && (hostname === "::1" || hostname.startsWith("fe80:") || hostname.startsWith("fc") || hostname.startsWith("fd"))) {
    return {
      ok: false,
      code: "blocked_private_ip",
      message: "This URL resolves to a local/private IPv6 address, which is blocked by Lume.",
    };
  }

  if (ipType > 0) {
    return { ok: true };
  }

  try {
    const records = await dns.lookup(hostname, { all: true });
    for (const record of records) {
      if (record.family === 4 && isPrivateIpv4(record.address)) {
        return {
          ok: false,
          code: "blocked_private_resolution",
          message:
            "This domain resolves to a private/internal address, so it is blocked to prevent SSRF attacks.",
        };
      }
      if (
        record.family === 6 &&
        (record.address === "::1" ||
          record.address.startsWith("fe80:") ||
          record.address.startsWith("fc") ||
          record.address.startsWith("fd"))
      ) {
        return {
          ok: false,
          code: "blocked_private_resolution",
          message:
            "This domain resolves to a local/private IPv6 address, so it is blocked to prevent SSRF attacks.",
        };
      }
    }
  } catch {
    return {
      ok: false,
      code: "dns_resolution_failed",
      message: "We could not resolve this domain via DNS.",
    };
  }

  return { ok: true };
}

function sanitizeArticleHtml(input: string) {
  return sanitizeHtml(input, {
    allowedTags: [
      "p",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "blockquote",
      "ul",
      "ol",
      "li",
      "pre",
      "code",
      "a",
      "strong",
      "em",
      "b",
      "i",
      "hr",
      "img",
      "figure",
      "figcaption",
    ],
    allowedAttributes: {
      a: ["href", "target", "rel"],
      img: ["src", "alt", "title", "width", "height", "loading"],
      "*": [],
    },
    allowedSchemes: ["http", "https", "mailto"],
    disallowedTagsMode: "discard",
  });
}

export async function POST(request: Request) {
  try {
    const clientKey = getClientKey(request);
    const rateLimit = checkRateLimit(clientKey);
    if (!rateLimit.allowed) {
      recordSecurityEvent(clientKey, "blocked", "rate_limit_exceeded");
      return NextResponse.json(
        {
          error: "rate_limit_exceeded",
          message: "Too many extraction requests in a short time. Please wait and try again.",
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateLimit.retryAfterSec),
          },
        },
      );
    }

    let body: ExtractRequest;
    try {
      body = (await request.json()) as ExtractRequest;
    } catch {
      return NextResponse.json(
        { error: "invalid_request_body", message: "Request body must be valid JSON." },
        { status: 400 },
      );
    }
    if (!body.url) {
      return NextResponse.json({ error: "URL is required." }, { status: 400 });
    }

    const url = normalizeUrl(body.url);
    if (!url) {
      return NextResponse.json(
        { error: "invalid_url", message: "Please provide a valid HTTPS URL." },
        { status: 400 },
      );
    }
    if (url.username || url.password) {
      recordSecurityEvent(clientKey, "blocked", "embedded_credentials");
      return NextResponse.json(
        { error: "credentials_not_allowed", message: "URLs with embedded credentials are not allowed." },
        { status: 400 },
      );
    }

    let currentUrl = new URL(url.toString());
    let upstream: Response | null = null;
    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
      const guardResult = await validateHost(currentUrl);
      if (!guardResult.ok) {
        recordSecurityEvent(clientKey, "blocked", `host_guard:${guardResult.code ?? "unknown"}`);
        return NextResponse.json(
          { error: guardResult.code, message: guardResult.message },
          { status: 400 },
        );
      }

      try {
        const fetchResult = await fetchWithTimeout(currentUrl);
        if (fetchResult.timedOut) {
          recordSecurityEvent(clientKey, "failed", "upstream_timeout");
          return NextResponse.json(
            {
              error: "upstream_timeout",
              message: "The website took too long to respond. Please try a different link.",
            },
            { status: 504 },
          );
        }
        upstream = fetchResult.response;
        if (!upstream) {
          recordSecurityEvent(clientKey, "failed", "upstream_fetch_failed_null_response");
          return NextResponse.json(
            {
              error: "upstream_fetch_failed",
              message:
                "We could not connect to this website. It may be blocking requests, temporarily offline, or unreachable.",
            },
            { status: 502 },
          );
        }
      } catch {
        recordSecurityEvent(clientKey, "failed", "upstream_fetch_failed");
        return NextResponse.json(
          {
            error: "upstream_fetch_failed",
            message:
              "We could not connect to this website. It may be blocking requests, temporarily offline, or unreachable.",
          },
          { status: 502 },
        );
      }

      if (isRedirectStatus(upstream.status)) {
        const location = upstream.headers.get("location");
        if (!location) {
          recordSecurityEvent(clientKey, "failed", "invalid_redirect");
          return NextResponse.json(
            {
              error: "invalid_redirect",
              message: "The website returned a redirect without a valid destination.",
            },
            { status: 502 },
          );
        }
        const redirectedTo = new URL(location, currentUrl);
        if (redirectedTo.protocol !== "https:") {
          recordSecurityEvent(clientKey, "blocked", "redirected_to_insecure_protocol");
          return NextResponse.json(
            {
              error: "redirected_to_insecure_protocol",
              message: "This link redirected to a non-HTTPS destination, which is blocked by Lume.",
            },
            { status: 400 },
          );
        }
        if (redirectedTo.username || redirectedTo.password) {
          recordSecurityEvent(clientKey, "blocked", "redirect_with_credentials");
          return NextResponse.json(
            {
              error: "credentials_not_allowed",
              message: "Redirect destinations with embedded credentials are not allowed.",
            },
            { status: 400 },
          );
        }
        if (redirectCount === MAX_REDIRECTS) {
          recordSecurityEvent(clientKey, "failed", "too_many_redirects");
          return NextResponse.json(
            {
              error: "too_many_redirects",
              message: "This link redirected too many times.",
            },
            { status: 422 },
          );
        }
        currentUrl = redirectedTo;
        continue;
      }

      break;
    }

    if (!upstream) {
      return NextResponse.json(
        {
          error: "processing_failed",
          message: "We could not process this link right now. Please try another article URL.",
        },
        { status: 500 },
      );
    }

    if (!upstream.ok) {
      recordSecurityEvent(clientKey, "failed", `upstream_http_${upstream.status}`);
      const upstreamStatus = upstream.status;
      return NextResponse.json(
        {
          error: "upstream_http_error",
          message: `The website returned HTTP ${upstreamStatus} when we tried to fetch it. This link may be blocked, unavailable, or protected by anti-bot rules.`,
        },
        { status: 502 },
      );
    }

    const contentType = (upstream.headers.get("content-type") ?? "").toLowerCase();
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
      recordSecurityEvent(clientKey, "blocked", `unsupported_content_type:${contentType || "unknown"}`);
      return NextResponse.json(
        {
          error: "unsupported_content_type",
          message: `This URL returned "${contentType || "unknown"}" instead of an HTML article page.`,
        },
        { status: 422 },
      );
    }

    const declaredLength = Number(upstream.headers.get("content-length") ?? "0");
    if (Number.isFinite(declaredLength) && declaredLength > MAX_HTML_BYTES) {
      recordSecurityEvent(clientKey, "blocked", "content_too_large_declared");
      return NextResponse.json(
        {
          error: "content_too_large",
          message: "This page is too large to process safely.",
        },
        { status: 422 },
      );
    }

    const html = await upstream.text();
    if (Buffer.byteLength(html, "utf8") > MAX_HTML_BYTES) {
      recordSecurityEvent(clientKey, "blocked", "content_too_large_actual");
      return NextResponse.json(
        {
          error: "content_too_large",
          message: "This page is too large to process safely.",
        },
        { status: 422 },
      );
    }

    const dom = new JSDOM(html, { url: currentUrl.toString() });
    const doc = dom.window.document;

    const ogType = (doc.querySelector("meta[property='og:type']")?.getAttribute("content") ?? "").toLowerCase().trim();
    if (ogType && ogType !== "website" && !ALLOWED_OG_TYPES.has(ogType)) {
      return NextResponse.json(
        {
          error: "unsupported_og_type",
          message: `This page declares og:type="${ogType}", which usually is not a readable long-form article page.`,
        },
        { status: 422 },
      );
    }

    const bodyText = doc.body?.textContent?.replace(/\s+/g, " ").trim() ?? "";
    const jsonLdTypes = extractJsonLdTypes(doc);

    const transactionalMatch = transactionalKeywordMatch(bodyText);
    const hasEcommerceUi = ECOMMERCE_HINTS.some((selector) => Boolean(doc.querySelector(selector)));
    if (transactionalMatch && hasEcommerceUi) {
      return NextResponse.json(
        {
          error: "transactional_page",
          message: `This page appears transactional (matched phrase: "${transactionalMatch}") rather than editorial content.`,
        },
        { status: 422 },
      );
    }

    const reader = new Readability(doc);
    const article = reader.parse();

    if (!article?.content || !article.textContent) {
      return NextResponse.json(
        { error: "no_readable_content", message: "We could not extract readable article content from this URL." },
        { status: 422 },
      );
    }

    const textLength = article.textContent.trim().length;
    const articleDom = new JSDOM(article.content);
    const articleDoc = articleDom.window.document;
    const confidence = articleConfidenceScore({
      url: currentUrl,
      ogType,
      jsonLdTypes,
      bodyText,
      articleText: article.textContent.trim(),
      articleDoc,
      hasByline: Boolean(article.byline?.trim()),
    });

    if (textLength < 350) {
      return NextResponse.json(
        {
          error: "low_content_density",
          message: `This page has too little readable text (${textLength} characters).`,
        },
        { status: 422 },
      );
    }

    if (confidence.hasNegativeLd && (confidence.transactionalMatch || hasEcommerceUi)) {
      return NextResponse.json(
        {
          error: "transactional_page",
          message: "This page appears to be product/offer content rather than a readable article.",
        },
        { status: 422 },
      );
    }

    if (confidence.score < 2) {
      return NextResponse.json(
        {
          error: "non_article_structure",
          message:
            confidence.reasons.length > 0
              ? `This page did not pass our readability checks: ${confidence.reasons.join("; ")}.`
              : "This page does not look like a readable article.",
        },
        { status: 422 },
      );
    }

    const cleanContent = sanitizeArticleHtml(article.content);

    return NextResponse.json({
      title: article.title ?? "Untitled",
      byline: article.byline ?? "",
      content: cleanContent,
      text: article.textContent,
      sourceUrl: currentUrl.toString(),
    });
  } catch (error) {
    const clientKey = getClientKey(request);
    recordSecurityEvent(clientKey, "failed", "processing_failed_uncaught");
    console.error("[lume-extract-uncaught]", {
      clientKey,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      { error: "processing_failed", message: "We could not process this link right now. Please try another article URL." },
      { status: 500 },
    );
  }
}
