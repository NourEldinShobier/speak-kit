import type { Dispatch } from "react";
import { Banner, Button, DropdownMenu, DropdownMenuItem, TextInput } from "@speakkit/ui";
import { plural } from "@speakkit/protocol";
import { span } from "./model";
import type { LibraryAction, LibraryView } from "./page-model";

function AddMenu({ dispatch, pickFiles, importClipboard }: { dispatch: Dispatch<LibraryAction>; pickFiles(): void; importClipboard(): void }) {
  return (
    <DropdownMenu
      trigger={
        <Button variant="primary" iconLeft="plus">
          Add
        </Button>
      }
    >
      <DropdownMenuItem icon="file-import" onSelect={pickFiles}>
        Choose files
      </DropdownMenuItem>
      <DropdownMenuItem icon="clipboard" onSelect={() => dispatch({ type: "dialog", dialog: { kind: "paste" } })}>
        Paste text
      </DropdownMenuItem>
      <DropdownMenuItem icon="link" onSelect={() => dispatch({ type: "dialog", dialog: { kind: "url" } })}>
        From a web address
      </DropdownMenuItem>
      <DropdownMenuItem icon="copy" onSelect={importClipboard}>
        From the clipboard
      </DropdownMenuItem>
    </DropdownMenu>
  );
}

function summary(loaded: boolean, view: LibraryView): string {
  if (!loaded) return " ";
  return `${plural(view.all.length, "reading", "readings")}${view.all.length ? ` · ${span(view.totalMs)} of audio` : ""}`;
}

interface HeadProps {
  loaded: boolean;
  view: LibraryView;
  query: string;
  dispatch: Dispatch<LibraryAction>;
  pickFiles(): void;
  importClipboard(): void;
}

export function LibraryHead({ loaded, view, query, dispatch, pickFiles, importClipboard }: HeadProps) {
  return (
    <header className="lib-head">
      <div>
        <h1>Library</h1>
        <p>{summary(loaded, view)}</p>
      </div>
      <div className="lib-head__actions">
        <TextInput
          icon="search"
          size="md"
          aria-label="Search title, source or text"
          placeholder="Search title, source or text"
          value={query}
          onChange={(e) => dispatch({ type: "query", query: e.target.value })}
          className="lib-search"
        />
        <AddMenu dispatch={dispatch} pickFiles={pickFiles} importClipboard={importClipboard} />
      </div>
    </header>
  );
}

/** The warning banner for files that could not be added. */
export function ProblemsBanner({ problems, dispatch }: { problems: string[]; dispatch: Dispatch<LibraryAction> }) {
  if (problems.length === 0) return null;
  return (
    <Banner
      tone="warning"
      title="Some files could not be added"
      action={
        <Button size="sm" variant="ghost" onClick={() => dispatch({ type: "problems", problems: [] })}>
          Dismiss
        </Button>
      }
    >
      {problems.map((p) => (
        <div key={p}>{p}</div>
      ))}
    </Banner>
  );
}
