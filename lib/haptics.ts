/**
 * Haptic feedback utility.
 * Uses Capacitor Haptics on native platforms, navigator.vibrate() as fallback on web.
 */

function isCapacitorNative(): boolean {
  return typeof window !== "undefined" && !!(window as any).Capacitor?.isNativePlatform?.();
}

export type HapticStyle = "light" | "medium" | "heavy" | "success" | "warning" | "error";

export async function haptic(style: HapticStyle = "light"): Promise<void> {
  if (isCapacitorNative()) {
    try {
      // Dynamic import — @capacitor/haptics may not be installed in all envs
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cap = await (Function('m', 'return import(m)')("@capacitor/haptics")) as any;
      const { Haptics, ImpactStyle, NotificationType } = cap;
      switch (style) {
        case "light":   await Haptics.impact({ style: ImpactStyle.Light }); break;
        case "medium":  await Haptics.impact({ style: ImpactStyle.Medium }); break;
        case "heavy":   await Haptics.impact({ style: ImpactStyle.Heavy }); break;
        case "success": await Haptics.notification({ type: NotificationType.Success }); break;
        case "warning": await Haptics.notification({ type: NotificationType.Warning }); break;
        case "error":   await Haptics.notification({ type: NotificationType.Error }); break;
      }
      return;
    } catch {
      // Haptics plugin not installed — fall through to web vibrate
    }
  }
  webVibrate(style);
}

function webVibrate(style: HapticStyle) {
  if (typeof navigator === "undefined" || !navigator.vibrate) return;
  switch (style) {
    case "light":
      navigator.vibrate(10);
      break;
    case "medium":
      navigator.vibrate(20);
      break;
    case "heavy":
      navigator.vibrate(40);
      break;
    case "success":
      navigator.vibrate([10, 50, 10]);
      break;
    case "warning":
      navigator.vibrate([20, 30, 20]);
      break;
    case "error":
      navigator.vibrate([30, 20, 30, 20, 30]);
      break;
  }
}
