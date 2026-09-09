import webpush from "web-push";
import { ENV } from "./_core/env";

export type WebPushConfiguration = {
  publicKey: string;
  privateKey: string;
  subject: string;
};

export function getWebPushConfiguration(): WebPushConfiguration {
  const { webPushVapidPublicKey: publicKey, webPushVapidPrivateKey: privateKey, webPushVapidSubject: subject } = ENV;
  if (!publicKey || !privateKey || !subject) throw new Error("Web Push VAPID configuration is incomplete");

  // web-push validates VAPID key format and the contact URI before a subscription is accepted.
  webpush.setVapidDetails(subject, publicKey, privateKey);
  return { publicKey, privateKey, subject };
}
