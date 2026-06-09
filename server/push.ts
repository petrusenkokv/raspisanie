import webpush from "web-push";

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || "";
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || "";
const vapidEmail = process.env.VAPID_EMAIL || "mailto:admin@gym.local";

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(vapidEmail, vapidPublicKey, vapidPrivateKey);
}

export { webpush, vapidPublicKey };

export type PushSubscriptionData = {
  userId: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

export type PushPayload = {
  title: string;
  body: string;
  icon?: string;
  tag?: string;
  url?: string;
};

export async function sendPushToUser(
  subscriptions: PushSubscriptionData[],
  payload: PushPayload,
): Promise<void> {
  if (!vapidPublicKey || !vapidPrivateKey) return;
  if (subscriptions.length === 0) return;

  const payloadStr = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: payload.icon ?? "/icon-192.svg",
    tag: payload.tag,
    url: payload.url ?? "/",
  });
  await Promise.allSettled(
    subscriptions.map((sub) =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: sub.keys },
        payloadStr
      )
    )
  );
}
