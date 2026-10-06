export const DAILY_REQUEST_LIMIT = 500;
export const DAILY_TOKEN_LIMIT = 200000;
export const RESERVED_TOKENS_PER_REQUEST = 5000;

export function currentUsageDay(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return value("year") + "-" + value("month") + "-" + value("day");
}
