import { CopyButton } from "../../CopyButton";
import { useAppState } from "../../ui";
import { pageScriptTag } from "./page-script";

/** The tag to put in the page being built, with a button that copies it. The token stays out of the text on screen; the copy has it. */
export function PageScript({ port, token }: { port: number; token: string }) {
  const tag = pageScriptTag(port, token);
  if (!tag) return <p role="status">The local server is not running, so there is no script yet. Check Diagnostics.</p>;
  return (
    <div className="exp-card__script">
      <p>Put this in the page you are building, before its own scripts:</p>
      <code className="sk-code">{pageScriptTag(port, "TOKEN")}</code>
      <CopyButton text={tag} label="Copy the script tag with your token" caption="Copy script tag" />
    </div>
  );
}

/** What the page-context card shows once it is on. */
export function PageScriptFromApp() {
  const s = useAppState();
  return s ? <PageScript port={s.port} token={s.token} /> : null;
}
