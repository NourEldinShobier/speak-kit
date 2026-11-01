/** "ok": content scripts can run. "file": file:// page, needs the "Allow access to file URLs" switch. "unreadable": the browser never lets extensions in. */
type UrlClass = "ok" | "file" | "unreadable";

export function classifyUrl(url: string | undefined): UrlClass {
  if (!url) return "unreadable";
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return "unreadable";
  }
  if (u.protocol !== "http:" && u.protocol !== "https:" && u.protocol !== "file:") return "unreadable";
  if (/\.pdf$/i.test(u.pathname)) return "unreadable"; // Chrome's PDF viewer is not a normal page
  if (u.protocol === "file:") return "file";
  const host = u.hostname.toLowerCase();
  if (host === "chromewebstore.google.com") return "unreadable";
  if (host === "chrome.google.com" && u.pathname.startsWith("/webstore")) return "unreadable";
  if (host === "microsoftedge.microsoft.com" && u.pathname.startsWith("/addons")) return "unreadable";
  return "ok";
}
