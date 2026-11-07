import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

/** WCAG 2.2 AA rules axe can check. Landmark and heading rules are page-structure rules that do not apply to a 360 px popup or an overlay. */
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/** axe violations as readable strings; `include` limits the scan (an open Shadow DOM host is scanned through its shadow root). */
export async function axeViolations(page: Page, include?: string): Promise<string[]> {
  let b = new AxeBuilder({ page }).withTags(TAGS);
  if (include) b = b.include(include);
  const r = await b.analyze();
  const why = (n: (typeof r.violations)[number]["nodes"][number]) => {
    const d = n.any[0]?.data as { fgColor?: string; bgColor?: string; contrastRatio?: number } | undefined;
    return d?.contrastRatio ? ` [${d.fgColor} on ${d.bgColor} = ${d.contrastRatio}]` : ` [${n.html.slice(0, 140)}]`;
  };
  return r.violations.map(
    (v) =>
      `${v.id} (${v.impact}): ${v.help} -> ${v.nodes
        .slice(0, 3)
        .map((n) => n.target.join(" ") + why(n))
        .join(" | ")}`,
  );
}

/**
 * Layout problems of what is on screen, including open shadow roots: the page scrolls sideways, an element sticks out of its container
 * or the viewport, or text is cut off without an ellipsis. Elements that are invisible, absolutely positioned on purpose
 * (popover anchors), visually hidden (1 px) or pulled out on purpose with a negative margin (hover bleed) are skipped.
 */
export function layoutIssues(page: Page, scope = "body"): Promise<string[]> {
  return page.evaluate((sel) => {
    const issues: string[] = [];
    const de = document.documentElement;
    if (sel === "body" && de.scrollWidth > de.clientWidth + 1) issues.push(`page scrolls horizontally (${de.scrollWidth} > ${de.clientWidth})`);
    const vw = de.clientWidth;
    const name = (el: Element) =>
      `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${typeof el.className === "string" && el.className ? "." + el.className.split(" ")[0] : ""}${el.getAttribute("data-sk") ? `[data-sk=${el.getAttribute("data-sk")}]` : ""}`;
    const roots: ParentNode[] = [];
    const collect = (root: ParentNode) => {
      roots.push(root);
      if (root instanceof Element && root.shadowRoot) collect(root.shadowRoot);
      for (const el of root.querySelectorAll("*")) if (el.shadowRoot) collect(el.shadowRoot);
    };
    const start = document.querySelector(sel);
    if (start) collect(start);
    for (const root of roots)
      for (const el of root.querySelectorAll("*")) {
        if (!(el instanceof HTMLElement)) continue;
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0 || r.width <= 1 || r.height <= 1) continue;
        if (cs.clipPath !== "none" || (cs.clip !== "auto" && cs.position === "absolute")) continue; // visually hidden text
        const where = name(el);
        if (r.right > vw + 1 || r.left < -1) issues.push(`${where} is outside the viewport (${Math.round(r.left)}..${Math.round(r.right)} of ${vw})`);
        const p = el.parentElement;
        if (p && cs.position !== "absolute" && cs.position !== "fixed") {
          const pr = p.getBoundingClientRect();
          const pcs = getComputedStyle(p);
          if (pcs.display !== "contents" && parseFloat(cs.marginRight) >= 0 && r.right > pr.right + 1 && pcs.overflowX === "visible" && pr.width > 0)
            issues.push(`${where} is wider than its container ${name(p)} (${Math.round(r.right - pr.right)} px past the right edge)`);
        }
        const clips = (cs.overflowX === "hidden" || cs.overflowX === "clip") && !(el instanceof HTMLInputElement); // an input scrolls its own text
        if (clips && el.scrollWidth > el.clientWidth + 1 && cs.textOverflow !== "ellipsis") issues.push(`${where} cuts off content (${el.scrollWidth} > ${el.clientWidth}) without an ellipsis`);
        if (clips && cs.textOverflow === "ellipsis" && el.scrollWidth > el.clientWidth + 1 && !el.title && !el.getAttribute("aria-label") && !el.querySelector("[title]"))
          issues.push(`${where} is truncated with an ellipsis and has no title with the full text`);
      }
    return issues;
  }, scope);
}
