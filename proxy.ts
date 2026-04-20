// In-memory rate limiting — works per serverless instance. For production use Upstash Redis.
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

const LIMITS: Record<string, { max: number; windowMs: number }> = {
  api: { max: 30, windowMs: 60_000 },
  auth: { max: 10, windowMs: 60_000 },
};

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  let limitKey: "api" | "auth" | null = null;
  if (pathname.startsWith("/api/")) limitKey = "api";
  else if (pathname.startsWith("/auth")) limitKey = "auth";

  if (!limitKey) return NextResponse.next();

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";

  const clientKey = `${limitKey}:${ip}`;
  const now = Date.now();
  const limit = LIMITS[limitKey];

  let entry = rateLimitMap.get(clientKey);
  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + limit.windowMs };
    rateLimitMap.set(clientKey, entry);
  }

  entry.count += 1;
  const remaining = Math.max(0, limit.max - entry.count);

  if (entry.count > limit.max) {
    return NextResponse.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: { "X-RateLimit-Remaining": "0" },
      }
    );
  }

  const response = NextResponse.next();
  response.headers.set("X-RateLimit-Remaining", String(remaining));
  return response;
}

export const config = {
  matcher: ["/api/:path*", "/auth"],
};
