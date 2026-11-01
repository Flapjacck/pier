/**
 * Time formatting utilities used across pages.
 * formatRelativeTime: human-readable relative time (e.g. "2 hours ago")
 * formatAbsoluteDate: ISO 8601 representation for accessibility
 */

/**
 * Format an ISO 8601 timestamp as a human-readable relative time (e.g. "2 hours ago").
 * Handles future dates and invalid inputs gracefully.
 */
export function formatRelativeTime(isoString: string): string {
  const now = new Date();
  const date = new Date(isoString);

  // Handle invalid dates
  if (Number.isNaN(date.getTime())) {
    return "unknown";
  }

  const secs = Math.floor((now.getTime() - date.getTime()) / 1000);

  // Future dates
  if (secs < 0) {
    const absSecs = Math.abs(secs);
    if (absSecs < 60) return "in a moment";
    const mins = Math.floor(absSecs / 60);
    if (mins < 60) return `in ${mins} minute${mins === 1 ? "" : "s"}`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `in ${hours} hour${hours === 1 ? "" : "s"}`;
    const days = Math.floor(hours / 24);
    return `in ${days} day${days === 1 ? "" : "s"}`;
  }

  // Past dates
  if (secs < 60) return "now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/**
 * Format an ISO 8601 timestamp as an absolute ISO date (for <time dateTime> titles).
 */
export function formatAbsoluteDate(isoString: string): string {
  try {
    return new Date(isoString).toISOString();
  } catch {
    return isoString;
  }
}
