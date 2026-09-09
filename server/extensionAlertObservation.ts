export const EXTENSION_ALERT_FRESHNESS_DAYS = 7;
export const EXTENSION_ALERT_FRESHNESS_MS = EXTENSION_ALERT_FRESHNESS_DAYS * 24 * 60 * 60 * 1000;

export function isFreshExtensionAlertObservation(observedAt: Date | null | undefined, now = new Date()) {
  return Boolean(observedAt && observedAt.getTime() >= now.getTime() - EXTENSION_ALERT_FRESHNESS_MS);
}
