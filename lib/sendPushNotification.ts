import { getSupabaseBrowserClient } from "@/lib/supabase";

/**
 * Fire-and-forget push notification sender.
 * Calls the /api/push route to send a notification to a specific user.
 * Passes the current user's auth token in the Authorization header.
 */
export function sendPushNotification(params: {
  userId: string;
  conversationId: string;
  title: string;
  message?: string;
  url?: string;
  tag?: string;
}) {
  // Get session async, then fire-and-forget
  const supabase = getSupabaseBrowserClient();
  supabase.auth.getSession().then(({ data: { session } }) => {
    if (!session?.access_token) return;
    fetch("/api/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(params),
    }).catch(() => {
      // Silently ignore push send failures
    });
  });
}
