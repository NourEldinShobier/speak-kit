import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vite-plus/test";
import { Button, Checkbox, Icon, IconButton, Select, StatusPill, Toggle } from "../src/index";

const html = (n: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(n);

describe("Icon", () => {
  test("is a display:block 24 viewBox svg sized by --s (stroke is derived in CSS, never inline)", () => {
    expect(html(<Icon name="check" size={14} />)).toBe(
      '<svg class="lm-icon lm-icon--check" style="--s:14" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12l5 5l10 -10"/></svg>',
    );
  });
});

describe("Button", () => {
  test("variant and size classes", () => {
    expect(html(<Button variant="primary">Send</Button>)).toContain('class="lm-btn lm-btn--primary"');
    expect(html(<Button size="sm">x</Button>)).toContain("lm-btn--sm");
    expect(html(<Button size="lg">x</Button>)).toContain("lm-btn--lg");
  });

  test("disabled sets the attribute (CSS gives opacity 0.4)", () => {
    expect(html(<Button disabled>x</Button>)).toContain("disabled");
  });

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
  test("is named by aria-label and uses 14px icons at 24", () => {
    const m = html(<IconButton name="dots" label="More" size={24} />);
    expect(m).toContain('aria-label="More"');
    expect(m).toContain("lm-btn--xs");
    expect(m).toContain("--s:14");
  });
});

describe("Toggle", () => {
  test("is a switch button reflecting checked", () => {
    const on = html(<Toggle checked aria-label="Highlight" />);
    expect(on).toContain('role="switch"');
    expect(on).toContain('aria-checked="true"');
    expect(html(<Toggle aria-label="x" />)).toContain('aria-checked="false"');
  });
  test("board geometry and disabled", () => {
    const m = html(<Toggle board disabled aria-label="x" />);
    expect(m).toContain("lm-toggle--board");
    expect(m).toContain("disabled");
  });
});

describe("Checkbox / StatusPill / Select", () => {
  test("checkbox renders a native input with both marks", () => {
    const m = html(<Checkbox label="Skip" />);
    expect(m).toContain('type="checkbox"');
    expect(m).toContain("lm-icon--check");
    expect(m).toContain("lm-icon--minus");
  });
  test("status pill tone class and spinner for loader-2", () => {
    expect(
      html(
        <StatusPill tone="blue" icon="loader-2">
          Indexing
        </StatusPill>,
      ),
    ).toMatch(/lm-pill lm-pill--blue.*lm-spin/);
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
