import type { Dispatch } from "react";
import { Banner, Button, DropdownMenu, DropdownMenuItem, TextInput } from "@speakkit/ui";
import type { TFn } from "../../../shared/i18n";
import { useT } from "../../i18n";
import { span } from "./model";
import type { LibraryAction, LibraryView } from "./page-model";

function AddMenu({ dispatch, pickFiles }: { dispatch: Dispatch<LibraryAction>; pickFiles(): void }) {
  const { t } = useT();
  return (
    <DropdownMenu
      trigger={
        <Button variant="primary" iconLeft="plus">
          {t("lib.add")}
        </Button>
      }
    >
      <DropdownMenuItem icon="file-import" onSelect={pickFiles}>
        {t("lib.chooseFiles")}
      </DropdownMenuItem>
      <DropdownMenuItem icon="clipboard" onSelect={() => dispatch({ type: "dialog", dialog: { kind: "paste" } })}>
        {t("lib.pasteText")}
      </DropdownMenuItem>
      <DropdownMenuItem icon="link" onSelect={() => dispatch({ type: "dialog", dialog: { kind: "url" } })}>
        {t("lib.fromUrl")}
      </DropdownMenuItem>
    </DropdownMenu>
  );
}

function summary(loaded: boolean, view: LibraryView, t: TFn): string {
  if (!loaded) return " ";
  const count = t("lib.readings", { n: view.all.length });
  return view.all.length ? t("lib.summary", { count, span: span(view.totalMs, t) }) : count;
}

interface HeadProps {
  loaded: boolean;
  view: LibraryView;
  query: string;
  dispatch: Dispatch<LibraryAction>;
  pickFiles(): void;
}

export function LibraryHead({ loaded, view, query, dispatch, pickFiles }: HeadProps) {
  const { t } = useT();
  return (
    <header className="lib-head">
      <div>
        <h1>{t("lib.title")}</h1>
        <p>{summary(loaded, view, t)}</p>
      </div>
      <div className="lib-head__actions">
        <TextInput
          icon="search"
          size="md"
          aria-label={t("lib.search")}
          placeholder={t("lib.search")}
          value={query}
          onChange={(e) => dispatch({ type: "query", query: e.target.value })}
          className="lib-search"
        />
        <AddMenu dispatch={dispatch} pickFiles={pickFiles} />
      </div>
    </header>
  );
}

/** The warning banner for files that could not be added. */
export function ProblemsBanner({ problems, dispatch }: { problems: string[]; dispatch: Dispatch<LibraryAction> }) {
  const { t } = useT();
  if (problems.length === 0) return null;
  return (
    <Banner
      tone="warning"
      title={t("lib.problemsTitle")}
      action={
        <Button size="sm" variant="ghost" onClick={() => dispatch({ type: "problems", problems: [] })}>
          {t("lib.dismiss")}
        </Button>
      }
    >
      {problems.map((p) => (
        <div key={p}>{p}</div>
      ))}
    </Banner>
  );
}
