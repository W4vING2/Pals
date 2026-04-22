"use client";

import { getSupabaseBrowserClient } from "@/lib/supabase";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
const ANDROID_PUSH_CHANNEL_ID = "pals_messages";

type PushSubscriptionInsert = {
  user_id: string;
  endpoint: string;
  keys_p256dh: string;
  keys_auth: string;
  platform: string;
};

// ── Helpers ─────────────────────────────────────────────────

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function isCapacitorNative(): boolean {
  return typeof window !== "undefined" && !!(window as any).Capacitor?.isNativePlatform?.();
}

function isCapacitorAndroid(): boolean {
  return typeof window !== "undefined" && (window as any).Capacitor?.getPlatform?.() === "android";
}

async function savePushSubscription(subscription: PushSubscriptionInsert): Promise<boolean> {
  const supabase = getSupabaseBrowserClient();

  const { data: existing, error: selectError } = await supabase
    .from("push_subscriptions")
    .select("id")
    .eq("user_id", subscription.user_id)
    .eq("endpoint", subscription.endpoint)
    .maybeSingle();

  if (selectError) {
    console.error("Push: failed to check subscription:", selectError);
    return false;
  }

  if (existing) return true;

  const { error } = await supabase.from("push_subscriptions").insert(subscription);

  if (error) {
    if (error.code === "23505") return true;
    console.error("Push: failed to save subscription:", error);
    return false;
  }

  return true;
}

async function saveCapacitorToken(userId: string, fcmToken: string): Promise<boolean> {
  return savePushSubscription({
    user_id: userId,
    endpoint: `fcm:${fcmToken}`,
    keys_p256dh: "fcm",
    keys_auth: "fcm",
    platform: "android",
  });
}

async function ensureAndroidPushChannel(
  PushNotifications: typeof import("@capacitor/push-notifications").PushNotifications
): Promise<void> {
  if (!isCapacitorAndroid()) return;

  try {
    await PushNotifications.createChannel({
      id: ANDROID_PUSH_CHANNEL_ID,
      name: "Messages",
      description: "New chat messages",
      importance: 4,
      visibility: 1,
      lights: true,
      lightColor: "#a855f7",
      vibration: true,
    });
  } catch (err) {
    // Channel creation is Android-only and idempotent; registration can still continue.
    console.warn("Push: failed to create Android notification channel:", err);
  }
}

// ── Public API ──────────────────────────────────────────────

export async function isPushSupported(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  // Native Capacitor app
  if (isCapacitorNative()) return true;
  // Web browser
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export async function isSubscribedToPush(): Promise<boolean> {
  try {
    if (isCapacitorNative()) {
      // Check if we have a stored FCM token
      const supabase = getSupabaseBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return false;
      const { data } = await supabase
        .from("push_subscriptions")
        .select("id")
        .eq("user_id", session.user.id)
        .eq("platform", "android")
        .limit(1);
      return (data?.length ?? 0) > 0;
    }
    // Web
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) return false;
    const subscription = await registration.pushManager.getSubscription();
    return !!subscription;
  } catch {
    return false;
  }
}

export async function subscribeToPush(userId: string): Promise<boolean> {
  if (isCapacitorNative()) {
    return registerCapacitorPush(userId, { requestPermission: true });
  }
  return subscribeWeb(userId);
}

export async function unsubscribeFromPush(userId: string): Promise<boolean> {
  if (isCapacitorNative()) {
    return unsubscribeCapacitor(userId);
  }
  return unsubscribeWeb(userId);
}

// ── Capacitor (FCM) ─────────────────────────────────────────

export async function registerCapacitorPush(
  userId: string,
  options: { requestPermission?: boolean } = {}
): Promise<boolean> {
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");

    let permResult = await PushNotifications.checkPermissions();
    if (options.requestPermission || permResult.receive === "prompt") {
      permResult = await PushNotifications.requestPermissions();
    }
    if (permResult.receive !== "granted") return false;

    await ensureAndroidPushChannel(PushNotifications);

    // Wait for FCM token
    return new Promise<boolean>((resolve) => {
      let settled = false;
      let cleanup: (() => void) | undefined;
      const settle = (value: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        cleanup?.();
        resolve(value);
      };

      const timeout = setTimeout(() => settle(false), 10000);

      Promise.all([
        PushNotifications.addListener("registration", async (token) => {
          settle(await saveCapacitorToken(userId, token.value));
        }),
        PushNotifications.addListener("registrationError", (error) => {
          console.error("Push: native registration error:", error);
          settle(false);
        }),
      ]).then(([registrationHandle, errorHandle]) => {
        cleanup = () => {
          registrationHandle.remove();
          errorHandle.remove();
        };
        if (settled) cleanup();
      });

      PushNotifications.register().catch((err) => {
        console.error("Push: native register failed:", err);
        settle(false);
      });
    });
  } catch (err) {
    console.error("Capacitor push subscribe failed:", err);
    return false;
  }
}

async function unsubscribeCapacitor(userId: string): Promise<boolean> {
  try {
    const supabase = getSupabaseBrowserClient();
    await supabase
      .from("push_subscriptions")
      .delete()
      .eq("user_id", userId)
      .eq("platform", "android");
    return true;
  } catch (err) {
    console.error("Capacitor push unsubscribe failed:", err);
    return false;
  }
}

// ── Web Push ────────────────────────────────────────────────

async function subscribeWeb(userId: string): Promise<boolean> {
  try {
    if (!VAPID_PUBLIC_KEY) {
      console.error("Push: VAPID_PUBLIC_KEY is not set");
      return false;
    }

    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      console.warn("Push: permission denied by user");
      return false;
    }

    if (!("serviceWorker" in navigator)) {
      console.error("Push: serviceWorker not supported");
      return false;
    }

    // Get existing registration by scope (default scope is "/") or register fresh
    let registration = await navigator.serviceWorker.getRegistration("/");
    if (!registration) {
      registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    }
    await navigator.serviceWorker.ready;

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      });
    }

    const sub = subscription.toJSON();
    if (!sub.endpoint || !sub.keys) {
      console.error("Push: subscription missing endpoint or keys");
      return false;
    }

    return savePushSubscription({
      user_id: userId,
      endpoint: sub.endpoint,
      keys_p256dh: sub.keys.p256dh ?? "",
      keys_auth: sub.keys.auth ?? "",
      platform: "web",
    });
  } catch (err) {
    console.error("Web push subscribe failed:", err);
    return false;
  }
}

async function unsubscribeWeb(userId: string): Promise<boolean> {
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration) {
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const endpoint = subscription.endpoint;
        await subscription.unsubscribe();
        const supabase = getSupabaseBrowserClient();
        await supabase
          .from("push_subscriptions")
          .delete()
          .eq("user_id", userId)
          .eq("endpoint", endpoint);
      }
    }
    return true;
  } catch (err) {
    console.error("Web push unsubscribe failed:", err);
    return false;
  }
}
