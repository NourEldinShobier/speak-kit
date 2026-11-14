import { definePack } from "../pack";

/** The installed-programs suggestions beside a program field. */
export const APPS = definePack({
  "apps.loading": "Looking for installed apps...",
  "apps.unavailable": "The installed apps could not be listed here. Type the program name instead.",
  "apps.noneFor": "No installed app matches “{query}”. You can still add the name you typed. Store apps may not be listed: type their name.",
  "apps.none": "No installed apps found. Apps from the Microsoft Store are not listed: type their name.",
  "apps.group": "Installed apps",
  "apps.use": "Use {name}",
});
