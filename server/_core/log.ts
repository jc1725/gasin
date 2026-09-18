export type LogRoute = "scheduler" | "external_cron" | "collector_extension" | "admin_manual";

export type LogFields = Record<string, unknown>;

function writeLine(
  level: "info" | "warn" | "error",
  event: string,
  route: LogRoute,
  fields: LogFields,
  target: (line: string) => void
) {
  const line = JSON.stringify({
    level,
    event,
    route,
    ts: new Date().toISOString(),
    ...fields,
  });
  target(line);
}

export function logInfo(event: string, route: LogRoute, fields: LogFields = {}) {
  writeLine("info", event, route, fields, console.log);
}

export function logWarn(event: string, route: LogRoute, fields: LogFields = {}) {
  writeLine("warn", event, route, fields, console.warn);
}

/**
 * error 인스턴스는 message/name만 뽑아 담는다 — 순환 참조가 있는 커스텀 error
 * 객체를 그대로 fields에 섞으면 JSON.stringify가 던질 수 있어서다.
 */
export function logError(event: string, route: LogRoute, error: unknown, fields: LogFields = {}) {
  const errorFields = error instanceof Error
    ? { errorMessage: error.message, errorName: error.name }
    : { errorMessage: String(error) };
  writeLine("error", event, route, { ...fields, ...errorFields }, console.error);
}
