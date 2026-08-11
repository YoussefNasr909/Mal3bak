import webPush from "web-push";

import { env } from "../config/env.js";

const hasWebPushConfig = Boolean(
  env.WEB_PUSH_VAPID_PUBLIC_KEY &&
  env.WEB_PUSH_VAPID_PRIVATE_KEY &&
  env.WEB_PUSH_CONTACT_EMAIL,
);

if (hasWebPushConfig) {
  webPush.setVapidDetails(
    `mailto:${env.WEB_PUSH_CONTACT_EMAIL}`,
    env.WEB_PUSH_VAPID_PUBLIC_KEY,
    env.WEB_PUSH_VAPID_PRIVATE_KEY,
  );
}

export function isWebPushConfigured() {
  return hasWebPushConfig;
}

export function getWebPushPublicKey() {
  return hasWebPushConfig ? env.WEB_PUSH_VAPID_PUBLIC_KEY : null;
}

export async function sendWebPushNotification(subscription, payload) {
  if (!hasWebPushConfig) {
    const error = new Error("Web push is not configured");
    error.code = "WEB_PUSH_NOT_CONFIGURED";
    throw error;
  }

  return webPush.sendNotification(
    {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.p256dhKey,
        auth: subscription.authKey,
      },
    },
    JSON.stringify(payload),
  );
}
