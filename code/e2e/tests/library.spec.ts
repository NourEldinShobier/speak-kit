import { test, expect } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fixtureBytes, fixturePath, importBytes, importText, openLibrary, serveArticle } from "../support/desktop-library";

// Real Electron app, fake engine. Needs the desktop build (`pnpm run e2e --full` builds it).
test.describe("desktop library @slow", () => {
  test("empty library offers one primary action, pasting text adds a row and a toast", async () => {
    const d = await openLibrary();
    try {
      await expect(d.page.getByRole("heading", { name: "Nothing to read yet" })).toBeVisible();
      await expect(d.page.getByRole("button", { name: "Choose file" })).toBeVisible();
      await d.page.getByRole("button", { name: "Paste text", exact: true }).click();
      const dialog = d.page.getByRole("dialog", { name: "Add pasted text" });
      await dialog.getByRole("textbox", { name: "Text" }).fill("Weekly update from the team.\n\nAll systems are green.");
      await expect(dialog.getByTestId("paste-count")).toHaveText(/^9 words/);
      await dialog.getByRole("button", { name: "Add", exact: true }).click();
      await expect(d.page.getByTestId("doc-row")).toHaveCount(1);
      await expect(d.page.getByTestId("doc-row")).toContainText("Weekly update from the team.");
      await expect(d.page.getByRole("status").filter({ hasText: "Added" })).toBeVisible();
      await expect(d.page.getByText("1 reading")).toBeVisible();
      // the New badge is a small pill, not a bar across the status column
      const badge = d.page.getByTestId("doc-row").getByText("New", { exact: true });
      expect((await badge.boundingBox())!.width).toBeLessThan(60);
    } finally {
      await d.cleanup();
    }
  });

  test("files from the dialog and from a drop, with format badges, and an unsupported file explains itself", async () => {
    const d = await openLibrary();
    try {
      await d.app.evaluate(
        ({ dialog }, files) => {
          dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: files })) as typeof dialog.showOpenDialog;
        },
        [fixturePath("notes.md"), fixturePath("sample.docx"), fixturePath("sample.epub")],
      );
      await d.page.getByRole("button", { name: "Add", exact: true }).click();
      await d.page.getByRole("menuitem", { name: "Choose files" }).click();
      await expect(d.page.getByTestId("doc-row")).toHaveCount(3);
      await expect(d.page.getByTestId("doc-row").filter({ hasText: "Meeting notes" })).toContainText("notes.md");

      // A dropped PDF: the overlay shows while dragging and the file is added on drop.
      const pdf = fixtureBytes("sample.pdf");
      await d.page.evaluate(() => {
        const dt = new DataTransfer();
        dt.items.add(new File(["x"], "x.txt"));
        document.querySelector("[data-testid=library]")!.dispatchEvent(new DragEvent("dragenter", { dataTransfer: dt, bubbles: true }));
      });
      await expect(d.page.getByTestId("drop-overlay")).toBeVisible();
      await d.page.evaluate((bytes) => {
        const dt = new DataTransfer();
        dt.items.add(new File([new Uint8Array(bytes)], "Report.pdf", { type: "application/pdf" }));
        dt.items.add(new File(["x"], "movie.mp4"));
        document.querySelector("[data-testid=library]")!.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }));
      }, pdf);
      await expect(d.page.getByTestId("drop-overlay")).toBeHidden();
      await expect(d.page.getByTestId("doc-row").filter({ hasText: "Report" })).toContainText("PDF");
      await expect(d.page.getByTestId("doc-row").filter({ hasText: "Report" })).toContainText("3 pages");
      const banner = d.page
        .getByRole("status")
        .filter({ hasText: "could not be added" })
        .or(d.page.getByRole("alert").filter({ hasText: "could not be added" }));
      await expect(banner).toContainText("movie.mp4");
      await expect(banner).toContainText("Supported: TXT, MD, HTML, PDF, DOCX, EPUB");
    } finally {
      await d.cleanup();
    }
  });

  test("a web address is fetched and the article added; a failure offers Paste text instead", async () => {
    const web = await serveArticle();
    const d = await openLibrary();
    try {
      await d.page.getByRole("button", { name: "Add", exact: true }).click();
      await d.page.getByRole("menuitem", { name: "From a web address" }).click();
      const dialog = d.page.getByRole("dialog", { name: "Add from a web address" });
      await dialog.getByRole("textbox", { name: "Web address" }).fill(web.url);
      await dialog.getByRole("button", { name: "Add", exact: true }).click();
      await expect(d.page.getByTestId("doc-row")).toContainText("The quiet return of local-first software");

      await d.page.getByRole("button", { name: "Add", exact: true }).click();
      await d.page.getByRole("menuitem", { name: "From a web address" }).click();
      await d.page.getByRole("textbox", { name: "Web address" }).fill("http://127.0.0.1:1/nothing");
      await d.page.getByRole("dialog").getByRole("button", { name: "Add", exact: true }).click();
      await expect(d.page.getByText("That page could not be added")).toBeVisible();
      await d.page.getByRole("button", { name: "Details" }).click();
      await expect(d.page.getByTestId("url-details")).toContainText("Could not reach");
      await d.page.getByRole("button", { name: "Paste text instead" }).click();
      await expect(d.page.getByRole("dialog", { name: "Add pasted text" })).toBeVisible();
    } finally {
      web.close();
      await d.cleanup();
    }
  });

  test("search highlights matches in title and text, shows a count, and an empty result can be cleared", async () => {
    const d = await openLibrary();
    try {
      await importText(d, "Local voices are fast and private.", "Notes A");
      await importText(d, "Nothing about the topic.", "Voices journal");
      await importText(d, "Weather is mild today.", "Weather");
      await d.page.getByRole("link", { name: "Home" }).click();
      await d.page.getByRole("link", { name: "Library" }).click();
      await expect(d.page.getByTestId("doc-row")).toHaveCount(3);
      await d.page.getByRole("textbox", { name: "Search title, source or text" }).fill("voices");
      await expect(d.page.getByTestId("doc-row")).toHaveCount(2);
      await expect(d.page.getByRole("status").filter({ hasText: "2 results" })).toBeVisible();
      await expect(d.page.locator("mark.lib-mark").first()).toHaveText(/voices/i);
      await d.page.getByRole("textbox", { name: "Search title, source or text" }).fill("zebra");
      await expect(d.page.getByRole("heading", { name: 'No readings match "zebra"' })).toBeVisible();
      await d.page.getByRole("button", { name: "Clear search" }).click();
      await expect(d.page.getByTestId("doc-row")).toHaveCount(3);
    } finally {
      await d.cleanup();
    }
  });

  test("row menu: rename, mark finished, filters and sort, delete with confirmation and Undo; the library survives a restart", async () => {
    const userData = mkdtempSync(path.join(tmpdir(), "speakkit-lib-e2e-"));
    const d = await openLibrary({ userData });
    try {
      await importText(d, "Alpha text here.", "Alpha");
      await importText(d, "Beta text here.", "Beta");
      await d.page.getByRole("link", { name: "Home" }).click();
      await d.page.getByRole("link", { name: "Library" }).click();
      const row = (name: string) => d.page.getByTestId("doc-row").filter({ hasText: name });

      await d.page.getByRole("button", { name: "More for Alpha" }).click();
      await d.page.getByRole("menuitem", { name: "Rename" }).click();
      await d.page.getByRole("textbox", { name: "Title" }).fill("Alpha renamed");
      await d.page.getByRole("button", { name: "Save" }).click();
      await expect(row("Alpha renamed")).toBeVisible();

      await d.page.getByRole("button", { name: "More for Beta" }).click();
      await d.page.getByRole("menuitem", { name: "Mark as finished" }).click();
      await expect(row("Beta")).toContainText("Finished");
      await d.page.getByRole("button", { name: "Unfinished" }).click();
      await expect(d.page.getByTestId("doc-row")).toHaveCount(1);
      await d.page.getByRole("button", { name: "All", exact: true }).click();

      await d.page.getByRole("combobox", { name: "Sort" }).click();
      await d.page.getByRole("option", { name: "Sort: Title" }).click();
      await expect(d.page.getByTestId("doc-row").first()).toContainText("Alpha renamed");

      await d.page.getByRole("button", { name: "More for Beta" }).click();
      await d.page.getByRole("menuitem", { name: "Delete" }).click();
      const confirm = d.page.getByRole("dialog", { name: /Delete "Beta"/ });
      await expect(confirm).toContainText("only copy");
      await expect(confirm.getByRole("button", { name: "Cancel" })).toBeFocused();
      await confirm.getByRole("button", { name: "Delete" }).click();
      await expect(d.page.getByTestId("doc-row")).toHaveCount(1);
      await d.page.getByRole("button", { name: "Undo" }).click();
      await expect(d.page.getByTestId("doc-row")).toHaveCount(2);

      await d.page.getByRole("button", { name: "More for Beta" }).click();
      await d.page.getByRole("menuitem", { name: "Delete" }).click();
      await d.page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
      await expect(d.page.getByTestId("doc-row")).toHaveCount(1);
    } finally {
      await d.cleanup();
    }
    const again = await openLibrary({ userData });
    try {
      await expect(again.page.getByTestId("doc-row")).toHaveCount(1);
      await expect(again.page.getByTestId("doc-row")).toContainText("Alpha renamed");
    } finally {
      await again.cleanup();
      rmSync(userData, { recursive: true, force: true });
    }
  });

  test("a scanned PDF (flagged for text recognition)", async () => {
    const d = await openLibrary();
    try {
      const r = await importBytes(d, "scan.pdf", fixtureBytes("scanned.pdf"));
      expect(r).toMatchObject({ ok: true, doc: { needsOcr: true, pages: 2 } });
    } finally {
      await d.cleanup();
    }
  });

  test("PDF text keeps paragraphs and headings in the reader's outline", async () => {
    const d = await openLibrary();
    try {
      const r = (await importBytes(d, "Report.pdf", fixtureBytes("sample.pdf"))) as { ok: true; doc: { id: string } };
      const doc = await d.page.evaluate((id) => window.speakkitLibrary.get(id), r.doc.id);
      expect(doc?.blocks.map((b) => b.text)).toEqual([
        "Local First Software",
        "For a decade the default answer to every software question was the cloud. Notes and documents lived on someone else’s server.",
        "The appeal is simple. When the work happens on your own machine it keeps working on a plane.",
        "Second page paragraph one stays on its own page.",
        "Third page text.",
      ]);
    } finally {
      await d.cleanup();
    }
  });
});
