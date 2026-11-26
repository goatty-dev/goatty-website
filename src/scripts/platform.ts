export const REPO_URL = "https://github.com/goatty-dev/goatty";
export const RELEASES_URL = `${REPO_URL}/releases`;
export const LATEST_RELEASE_URL = `${RELEASES_URL}/latest`;

export type Platform = "windows" | "linux" | "mac" | "other";

/** Best-effort guess at the visitor's desktop OS, for picking defaults only. */
export function detectPlatform(): Platform {
  const ua = navigator.userAgent.toLowerCase();
  if (/android|iphone|ipad|ipod/.test(ua)) return "other";
  if (ua.includes("windows")) return "windows";
  if (ua.includes("mac os x") || ua.includes("macintosh")) return "mac";
  if (/linux|x11|cros/.test(ua)) return "linux";
  return "other";
}
