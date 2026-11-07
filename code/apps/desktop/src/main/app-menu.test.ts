import { describe, expect, it } from "vite-plus/test";
import { appMenuTemplate } from "./app-menu";

describe("appMenuTemplate", () => {
  it("has the app, Edit and Window menus on macOS", () => {
    expect(appMenuTemplate("darwin")).toEqual([{ role: "appMenu" }, { role: "editMenu" }, { role: "windowMenu" }]);
  });
  it("has no menu bar elsewhere", () => {
    expect(appMenuTemplate("win32")).toBeNull();
    expect(appMenuTemplate("linux")).toBeNull();
  });
});
