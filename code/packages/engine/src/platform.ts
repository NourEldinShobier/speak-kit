/** The one place that branches on the operating system; engine code imports this instead of reading `process.platform`. */
export const isWindows = process.platform === "win32";
