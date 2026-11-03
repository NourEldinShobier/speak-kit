/** The platform name lumen.css keys its radii on (`data-platform`), from the browser. Extension pages and the in-page UI use it; the desktop app takes it from Electron. */
export const browserPlatform = (nav: { userAgentData?: { platform?: string }; platform?: string } = navigator): "win32" | "darwin" | "linux" => {
  const p = (nav.userAgentData?.platform || nav.platform || "").toLowerCase();
  if (p.startsWith("win")) return "win32";
  return p.startsWith("mac") ? "darwin" : "linux";
};
