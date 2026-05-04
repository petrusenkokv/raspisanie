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

export async function sendPushToUser(
  subscriptions: PushSubscriptionData[],
  payload: { title: string; body: string; icon?: string }
): Promise<void> {
  if (!vapidPublicKey || !vapidPrivateKey) return;

  const payloadStr = JSON.stringify(payload);
  await Promise.allSettled(
    subscriptions.map((sub) =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: sub.keys },
        payloadStr
      )
    )
  );
}
