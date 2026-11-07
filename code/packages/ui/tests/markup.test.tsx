import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vite-plus/test";
import { Button, Checkbox, IconButton, Select, Toggle } from "../src/index";

const html = (n: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(n);

describe("Button", () => {
  test("loading swaps the leading icon for a spinning loader-2 and marks aria-busy", () => {
    const m = html(
      <Button iconLeft="share" loading>
        Share
      </Button>,
    );
    expect(m).toContain('aria-busy="true"');
    expect(m).toContain("lm-icon--loader-2");
    expect(m).toContain("lm-spin");
    expect(m).not.toContain("lm-icon--share");
  });

  test("loading without an icon adds the spinner before the label", () => {
    expect(
      html(
        <Button variant="danger" loading>
          Delete
        </Button>,
      ),
    ).toMatch(/<svg[^>]*loader-2[^>]*>.*<\/svg>Delete/);
  });

  test("defaults to type=button", () => {
    expect(html(<Button>x</Button>)).toContain('type="button"');
  });
});

describe("IconButton", () => {
  test("is named by aria-label and uses 12px icons at 24", () => {
    const m = html(<IconButton name="dots" label="More" size={24} />);
    expect(m).toContain('aria-label="More"');
    expect(m).toContain("lm-btn--xs");
    expect(m).toContain("--s:12");
  });
});

describe("Toggle", () => {
  test("is a switch button reflecting checked", () => {
    const on = html(<Toggle checked aria-label="Highlight" />);
    expect(on).toContain('role="switch"');
    expect(on).toContain('aria-checked="true"');
    expect(html(<Toggle aria-label="x" />)).toContain('aria-checked="false"');
  });
});

describe("Checkbox / Select", () => {
  test("checkbox renders a native input with both marks", () => {
    const m = html(<Checkbox label="Skip" />);
    expect(m).toContain('type="checkbox"');
    expect(m).toContain("lm-icon--check");
    expect(m).toContain("lm-icon--minus");
  });
  test("select (Radix) exposes a combobox trigger named by the label and shows the current option", () => {
    const opts = [
      { value: "a", label: "A" },
      { value: "b", label: "B" },
    ];
    const closed = html(<Select label="L" options={opts} defaultValue="b" />);
    expect(closed).toContain('role="combobox"');
    expect(closed).toContain('aria-label="L"');
    expect(closed).toContain('aria-expanded="false"');
    expect(closed).toMatch(/lm-select__value.*?>B</);
    expect(closed).toContain("lm-icon--chevron-down");
  });
});
