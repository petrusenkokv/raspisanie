import { sendPushToUser } from "./push";
import { storage } from "./storage-instance";

/** Send Web Push to all devices of a user (sound via OS when app is closed). */
export async function pushNotifyUser(
  userId: string,
  title: string,
  body: string,
  options?: { tag?: string; url?: string },
): Promise<void> {
  try {
    const subs = await storage.getPushSubscriptionsByUser(userId);
    if (subs.length === 0) return;
    await sendPushToUser(subs, {
      title,
      body,
      icon: "/icon-192.svg",
      tag: options?.tag,
      url: options?.url ?? "/",
    });
  } catch {
    /* non-fatal */
  }
}
