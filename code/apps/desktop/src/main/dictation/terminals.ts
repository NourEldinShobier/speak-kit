/**
 * Programs where Ctrl+C is not "copy" but an interrupt that stops the running command: console hosts and terminal emulators, by executable name
 * without ".exe" (Windows) or bundle id (macOS), lower case. Nothing sends that key into them.
 */
export const TERMINALS: ReadonlySet<string> = new Set([
  "cmd",
  "powershell",
  "pwsh",
  "windowsterminal",
  "wt",
  "conhost",
  "openconsole",
  "mintty",
  "wezterm-gui",
  "alacritty",
  "kitty",
  "ghostty",
  "hyper",
  "tabby",
  "warp",
  "conemu",
  "conemu64",
  "bash",
  "wsl",
  "wslhost",
  "putty",
  "terminal",
  "iterm2",
  "com.apple.terminal",
  "com.googlecode.iterm2",
  "dev.warp.warp-stable",
  "net.kovidgoyal.kitty",
  "org.alacritty",
  "com.mitchellh.ghostty",
  "com.github.wez.wezterm",
  "co.zeit.hyper",
  "org.tabby",
]);

/** Whether the program named is a terminal (a missing name is not told, so it counts as one: the key is never sent into a program that cannot be named). */
export const isTerminal = (exe: string | null | undefined): boolean => !exe || TERMINALS.has(exe.toLowerCase().replace(/\.exe$/, ""));
