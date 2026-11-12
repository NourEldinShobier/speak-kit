import { useState } from "react";
import { Banner, Button, SettingRow, SettingsSection, StatusPill, Toggle } from "@speakkit/ui";
import type { AppState } from "../../../shared/ipc";
import { api, Page } from "../../ui";
import { DEEP_LINKS, discoveryPath, EXIT_ROWS, MCP_CONFIG, TRY_COMMAND } from "./automation";

/** A Copy button that says Copied for a moment; a clipboard that refuses leaves the label alone. */
function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      iconLeft={done ? "check" : "copy"}
      aria-label={label}
      onClick={async () => {
        try {
          await api.copy(text);
        } catch {
          return;
        }
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? "Copied" : "Copy"}
    </Button>
  );
}

const code = (text: string) => <code className="sk-code">{text}</code>;

function ServerSection({ on }: { on: boolean }) {
  return (
    <SettingsSection title="Local server">
      <SettingRow
        label="Local server"
        description="Only this computer can connect. Scripts and AI apps reach Speak Kit through it."
        control={
          <div className="sk-row-actions">
            <StatusPill tone={on ? "green" : "neutral"}>{on ? "Running" : "Off"}</StatusPill>
            <Toggle aria-label="Local server" checked={on} onChange={(v) => void api.patchConfig({ controlServer: v })} />
          </div>
        }
      />
    </SettingsSection>
  );
}

function CommandLineSection({ platform }: { platform: string }) {
  return (
    <SettingsSection title="Command-line tool">
      <SettingRow
        label="Try it"
        description="Prints what Speak Kit is doing right now."
        control={
          <div className="sk-row-actions">
            {code(TRY_COMMAND)}
            <CopyButton text={TRY_COMMAND} label="Copy the command" />
          </div>
        }
      />
      <div className="sk-pad">
        <b>JSON output and exit codes</b>
        <p>Add --json to any command for output a script can read. The exit code says what happened.</p>
        <ul className="sk-exit">
          {EXIT_ROWS.map((r) => (
            <li key={r.code}>
              {code(String(r.code))} <span>{r.text}</span>
            </li>
          ))}
        </ul>
      </div>
      <SettingRow
        label="Discovery file"
        description="Scripts find the local server here. It holds a port and a private token, so keep it out of shared folders."
        control={
          <div className="sk-row-actions">
            {code(discoveryPath(platform))}
            <Button onClick={() => void api.openPath("data")}>Open folder</Button>
          </div>
        }
      />
    </SettingsSection>
  );
}

function McpAndLinks() {
  return (
    <>
      <SettingsSection title="MCP server" description="Add it to your AI app. It reads text aloud and searches your dictation history. It never returns audio.">
        <div className="sk-pad">
          <pre className="sk-code sk-code--block" aria-label="MCP settings block">
            {MCP_CONFIG}
          </pre>
          <CopyButton text={MCP_CONFIG} label="Copy the MCP block" />
        </div>
      </SettingsSection>
      <SettingsSection title="Deep links" description="Links only open a page in Speak Kit. They never start a reading or change a setting.">
        {DEEP_LINKS.map((l) => (
          <SettingRow key={l.url} label={l.url} description={l.text} control={<CopyButton text={l.url} label={`Copy ${l.url}`} />} />
        ))}
      </SettingsSection>
    </>
  );
}

/** Settings > Automation: the local server, the command-line tool, the MCP block for AI apps and the deep links. */
export function AutomationPage({ s }: { s: AppState }) {
  const on = s.config.controlServer;
  return (
    <Page title="Automation" lead="Let scripts and AI apps use Speak Kit on this computer. Nothing here leaves your computer.">
      {!on && (
        <Banner
          tone="warning"
          title="The local server is not running"
          action={
            <Button variant="primary" onClick={() => void api.patchConfig({ controlServer: true })}>
              Start server
            </Button>
          }
        >
          The command-line tool and the MCP server need it. Speak Kit itself works without it.
        </Banner>
      )}
      <ServerSection on={on} />
      <CommandLineSection platform={s.platform} />
      <McpAndLinks />
    </Page>
  );
}
