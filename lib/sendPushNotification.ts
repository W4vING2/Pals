/**
 * Fire-and-forget push notification sender.
 * Calls the /api/push route to send a notification to a specific user.
 */
export function sendPushNotification(params: {
  userId: string;
  title: string;
  message?: string;
  url?: string;
  tag?: string;
}) {
  // Fire and forget — don't await, don't block UI
  fetch("/api/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  }).catch(() => {
    // Silently ignore push send failures
  });
}
