import { describe, expect, it } from "vitest";
import { labelsOf, MAX_LABEL_CHARS, MAX_LABELS, MAX_TEXT_CHARS, type UiNode } from "./labels";

const n = (role: string, name: string | undefined, depth = 1, secure?: boolean): UiNode => ({ role, name, depth, ...(secure && { secure }) });

describe("agent context labels", () => {
  it("lists the labels of controls in reading order, with the role", () => {
    expect(labelsOf([n("ControlType.Window", "Invoice - Notepad", 0), n("ControlType.Button", "Save"), n("ControlType.MenuItem", "File")])).toBe(
      "window: Invoice - Notepad\nbutton: Save\nmenuitem: File",
    );
  });

  it("reads macOS role names too", () => {
    expect(labelsOf([n("AXButton", "Send"), n("AXPopUpButton", "Format"), n("AXLink", "Docs")])).toBe("button: Send\npopupbutton: Format\nlink: Docs");
  });

  it("never reads text, documents, list items or tree items, which hold the content the person is working on", () => {
    expect(
      labelsOf([
        n("ControlType.Text", "Dear Anna, the password is hunter2"),
        n("ControlType.Document", "Quarterly numbers"),
        n("ControlType.ListItem", "Re: salary"),
        n("ControlType.TreeItem", "secret.txt"),
      ]),
    ).toBe("");
  });

  it("skips a password field and everything inside it, then goes on at the same level", () => {
    const tree = [n("ControlType.Edit", "Password", 2, true), n("ControlType.Button", "Show password", 3), n("ControlType.Text", "x", 3), n("ControlType.Button", "Sign in", 2)];
    expect(labelsOf(tree)).toBe("button: Sign in");
  });

  it("treats a macOS secure text field as a password field without a flag", () => {
    expect(labelsOf([n("AXSecureTextField", "Password", 2), n("AXButton", "inside", 3), n("AXButton", "Log in", 2)])).toBe("button: Log in");
  });

  it("drops empty and whitespace names and collapses whitespace", () => {
    expect(labelsOf([n("ControlType.Button", undefined), n("ControlType.Button", "   "), n("ControlType.Button", "Save \n as")])).toBe("button: Save as");
  });

  it("lists a repeated label once", () => {
    expect(labelsOf([n("ControlType.Button", "OK"), n("ControlType.Button", "OK"), n("ControlType.Hyperlink", "OK")])).toBe("button: OK\nhyperlink: OK");
  });

  it("cuts a long label to 80 characters", () => {
    const [line] = labelsOf([n("ControlType.Button", "x".repeat(200))]).split("\n");
    expect(line).toBe(`button: ${"x".repeat(MAX_LABEL_CHARS - 1)}…`);
  });

  it("stops at 120 labels and 2000 characters", () => {
    const many = Array.from({ length: 300 }, (_, i) => n("ControlType.Button", `b${i}`));
    expect(labelsOf(many).split("\n")).toHaveLength(MAX_LABELS);
    const long = Array.from({ length: 120 }, (_, i) => n("ControlType.Button", `${String(i).padStart(3, "0")}${"y".repeat(70)}`));
    expect(labelsOf(long).length).toBe(MAX_TEXT_CHARS);
  });

  it("accepts every label role on either system, and only at the start of the role name", () => {
    const roles = ["Window", "Button", "MenuItem", "TabItem", "CheckBox", "RadioButton", "ComboBox", "Hyperlink", "Edit", "Slider", "ToolBar", "Menu"];
    for (const role of roles) expect(labelsOf([n(`ControlType.${role}`, "x")])).toBe(`${role.toLowerCase()}: x`);
    for (const role of ["PopUpButton", "Link", "TextField", "Button", "Menu", "MenuItem", "CheckBox", "RadioButton", "ComboBox", "Slider", "Window", "ToolBar"])
      expect(labelsOf([n(`AX${role}`, "x")])).toBe(`${role.toLowerCase()}: x`);
    // a prefix that is not at the start is not stripped, so these roles are not label roles
    expect(labelsOf([n("XControlType.Button", "x"), n("AXAXButton", "y"), n("XAXButton", "z")])).toBe("");
  });

  it("keeps a label of exactly 80 characters whole", () => {
    expect(labelsOf([n("ControlType.Button", "y".repeat(MAX_LABEL_CHARS))])).toBe(`button: ${"y".repeat(MAX_LABEL_CHARS)}`);
  });

  it("goes on after a skipped password field only at a shallower or equal level", () => {
    expect(labelsOf([n("ControlType.Edit", "Password", 1, true), n("ControlType.Button", "inside", 2), n("ControlType.Button", "same level", 1)])).toBe("button: same level");
  });

  it("is empty for no controls", () => {
    expect(labelsOf([])).toBe("");
  });
});
