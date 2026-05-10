import { NextResponse } from "next/server";

const API_KEY = process.env.ELEVENLABS_API_KEY;
const AGENT_ID = process.env.ELEVENLABS_AGENT_ID;

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;
const buckets = new Map<string, { count: number; resetAt: number }>();

function rateLimit(ip: string): boolean {
  const now = Date.now();
  const bucket = buckets.get(ip);
  if (!bucket || now > bucket.resetAt) {
    buckets.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (bucket.count >= RATE_LIMIT_MAX) return false;
  bucket.count += 1;
  return true;
}

export async function GET(req: Request) {
  if (!API_KEY || !AGENT_ID) {
    return NextResponse.json(
      { error: "voice_unavailable", detail: "ELEVENLABS_API_KEY or ELEVENLABS_AGENT_ID missing" },
      { status: 503 }
    );
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";
  if (!rateLimit(ip)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const url = `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(
    AGENT_ID
  )}`;
  const r = await fetch(url, { headers: { "xi-api-key": API_KEY } });
  if (!r.ok) {
    const detail = await r.text().catch(() => "");
    return NextResponse.json(
      { error: "elevenlabs_error", status: r.status, detail },
      { status: 502 }
    );
  }
  const { signed_url } = (await r.json()) as { signed_url: string };
  return NextResponse.json({ signedUrl: signed_url });
}
