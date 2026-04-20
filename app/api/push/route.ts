import { NextRequest, NextResponse } from "next/server";
// @ts-expect-error -- no types for web-push
import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";
import { GoogleAuth } from "google-auth-library";
import path from "path";
import type { Database } from "@/lib/supabase";

export const runtime = "nodejs";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? "";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails("mailto:noreply@pals-app.com", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

// ── FCM v1 API ──────────────────────────────────────────────

const FCM_PROJECT_ID = "pals-560da";
const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";

let cachedAuth: GoogleAuth | null = null;

type PushRequestBody = {
  userId?: unknown;
  title?: unknown;
  message?: unknown;
  url?: unknown;
  tag?: unknown;
  conversationId?: unknown;
};

function getGoogleAuth(): GoogleAuth {
  if (cachedAuth) return cachedAuth;

  // Try env variable first (Vercel), then file (local)
  const credentialsJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (credentialsJson) {
    try {
      const credentials = JSON.parse(credentialsJson);
      cachedAuth = new GoogleAuth({ credentials, scopes: [FCM_SCOPE] });
      return cachedAuth;
    } catch { /* fall through to file */ }
  }

  cachedAuth = new GoogleAuth({
    keyFile: path.join(process.cwd(), "firebase-service-account.json"),
    scopes: [FCM_SCOPE],
  });
  return cachedAuth;
}

function sanitizeNotificationUrl(input: unknown): string {
  if (typeof input !== "string") return "/messages";
  if (!input.startsWith("/")) return "/messages";
  if (input.startsWith("//")) return "/messages";
  return input;
}

async function canCallerNotifyTarget(
  supabase: ReturnType<typeof createClient<Database>>,
  conversationId: string,
  callerId: string,
  targetId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("conversation_participants")
    .select("user_id")
    .eq("conversation_id", conversationId)
    .in("user_id", [callerId, targetId]);

  if (error) return false;
  const members = new Set((data ?? []).map((row) => row.user_id));
  return members.has(callerId) && members.has(targetId);
}

async function sendFCMv1(token: string, title: string, body: string, url: string): Promise<boolean> {
  try {
    const auth = getGoogleAuth();
    const client = await auth.getClient();
    const accessTokenRes = await client.getAccessToken();
    const accessToken = accessTokenRes?.token;
    if (!accessToken) return false;

    const res = await fetch(
      `https://fcm.googleapis.com/v1/projects/${FCM_PROJECT_ID}/messages:send`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          message: {
            token,
            notification: { title, body },
            android: {
              priority: "high",
              notification: {
                sound: "default",
                channel_id: "pals_messages",
              },
            },
            data: { title, body, url },
          },
        }),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      console.error("FCM v1 error:", res.status, err);
      // Token expired / unregistered
      if (res.status === 404 || err.includes("UNREGISTERED")) return false;
    }
    return res.ok;
  } catch (err) {
    console.error("FCM v1 send error:", err);
    return false;
  }
}

// ── POST /api/push ──────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      return NextResponse.json({ error: "Push service is not configured" }, { status: 500 });
    }

    // Verify the request comes from an authenticated user via Bearer token
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Use service-role client for DB access, but verify the caller's token first
    const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: { user: callerUser } } = await supabase.auth.getUser(token);
    if (!callerUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as PushRequestBody;
    const userId = typeof body.userId === "string" ? body.userId : "";
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const message = typeof body.message === "string" ? body.message : "";
    const tag = typeof body.tag === "string" ? body.tag : "pals-notification";
    const conversationId = typeof body.conversationId === "string" ? body.conversationId : "";
    const safeUrl = sanitizeNotificationUrl(body.url);

    if (!userId || !title || !conversationId) {
      return NextResponse.json(
        { error: "userId, title and conversationId are required" },
        { status: 400 }
      );
    }

    if (userId === callerUser.id) {
      return NextResponse.json({ sent: 0 });
    }

    if (title.length > 120 || message.length > 500 || tag.length > 100) {
      return NextResponse.json({ error: "Notification payload is too large" }, { status: 400 });
    }

    const allowed = await canCallerNotifyTarget(
      supabase,
      conversationId,
      callerUser.id,
      userId
    );
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: subscriptions, error } = await supabase
      .from("push_subscriptions")
      .select("*")
      .eq("user_id", userId);

    if (error || !subscriptions?.length) {
      return NextResponse.json({ sent: 0 });
    }

    const payload = JSON.stringify({
      title,
      body: message ?? "",
      url: safeUrl,
      tag,
      icon: "/icon-192.png",
    });

    let sent = 0;
    const staleEndpoints: string[] = [];

    await Promise.allSettled(
      subscriptions.map(async (sub) => {
        try {
          // FCM for Android (Capacitor)
          if (sub.endpoint.startsWith("fcm:")) {
            const fcmToken = sub.endpoint.replace("fcm:", "");
            const ok = await sendFCMv1(fcmToken, title, message ?? "", safeUrl);
            if (ok) sent++;
            else staleEndpoints.push(sub.endpoint);
            return;
          }

          // Web Push for browsers
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.keys_p256dh, auth: sub.keys_auth },
            },
            payload
          );
          sent++;
        } catch (err: unknown) {
          const statusCode = (err as { statusCode?: number })?.statusCode;
          if (statusCode === 410 || statusCode === 404) {
            staleEndpoints.push(sub.endpoint);
          }
          console.error("Push send error:", err);
        }
      })
    );

    if (staleEndpoints.length > 0) {
      await supabase
        .from("push_subscriptions")
        .delete()
        .eq("user_id", userId)
        .in("endpoint", staleEndpoints);
    }

    return NextResponse.json({ sent });
  } catch (err) {
    console.error("Push API error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
