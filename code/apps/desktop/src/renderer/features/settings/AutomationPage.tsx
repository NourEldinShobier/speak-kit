import { useCallback, useEffect, useState } from "react";
import { Banner, Button, OptInCard, SettingRow, SettingsSection, StatusPill, Toggle } from "@speakkit/ui";
import { ERROR_CODES } from "../../../shared/control/contract";
import type { AutomationInfo, CommandLineAction } from "../../../shared/control/info";
import type { AppState } from "../../../shared/ipc";
import { api, Page } from "../../ui";
import { CopyButton } from "../../CopyButton";
import { COMMAND_ROWS, commandLineView, DEEP_LINKS, ERROR_ROWS, EXIT_ROWS, MCP_CONFIG, SKILL_COMMAND, skillView, toolRows, TRY_COMMAND } from "./automation";

const code = (text: string) => <code className="sk-code">{text}</code>;

type Load = { phase: "loading" } | { phase: "error" } | { phase: "ready"; info: AutomationInfo };

/** The facts the page reads from the app, with a way to ask again and to run an action that returns the new facts. */
function useInfo() {
  const [load, setLoad] = useState<Load>({ phase: "loading" });
  const [failed, setFailed] = useState<string | null>(null);
  const read = useCallback(() => {
    setLoad({ phase: "loading" });
    api.automationInfo().then(
      (info) => setLoad({ phase: "ready", info }),
      () => setLoad({ phase: "error" }),
    );
  }, []);
  useEffect(read, [read]);
  const run = async (what: () => Promise<AutomationInfo | void>, message: string) => {
    setFailed(null);
    try {
      const next = await what();
      if (next) setLoad({ phase: "ready", info: next });
    } catch {
      setFailed(message);
    }
  };
  return { load, read, run, failed };
}

function CommandLineRow({ info, version, busy, onAction }: { info: AutomationInfo; version: string; busy: boolean; onAction(a: CommandLineAction): void }) {
  const v = commandLineView(info.commandLine, version);
  return (
    <SettingRow
      label={
        <span className="sk-row-actions">
          speakkit <StatusPill tone={v.pill.tone}>{v.pill.text}</StatusPill>
        </span>
      }
      description={v.text}
      control={
        v.action ? (
          <Button variant={v.action.do === "install" ? "primary" : "secondary"} disabled={busy} onClick={() => onAction(v.action!.do)}>
            {v.action.label}
          </Button>
        ) : null
      }
    />
  );
}

/** What the tool can do, how it ends and which errors it names: the reference a script author reads. */
function Reference() {
  return (
    <>
      <div className="sk-pad" data-testid="automation-commands">
        <b>What it can do</b>
        <ul className="sk-exit">
          {COMMAND_ROWS.map((r) => (
            <li key={r.usage}>
              {code(r.usage)} <span>{r.text}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="sk-pad" data-testid="automation-exit-codes">
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
      <div className="sk-pad" data-testid="automation-errors">
        <b>Error codes</b>
        <p>With --json a failure names its code. These are all of them.</p>
        <ul className="sk-exit">
          {ERROR_CODES.map((c) => (
            <li key={c}>
              {code(c)} <span>{ERROR_ROWS[c]}</span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

function SkillRow({ info, onInstall }: { info: AutomationInfo; onInstall(): void }) {
  const v = skillView(info.skill);
  return (
    <SettingRow
      label={
        <span className="sk-row-actions">
          Agent skill <StatusPill tone={v.pill.tone}>{v.pill.text}</StatusPill>
        </span>
      }
      description={v.text}
      control={
        <div className="sk-row-actions">
          {v.action && (
            <Button variant="primary" onClick={onInstall}>
              {v.action.label}
            </Button>
          )}
          <CopyButton text={SKILL_COMMAND} label="Copy the skill install command" caption="Copy install" />
        </div>
      }
    />
  );
}

/** What went wrong, with the command to do it by hand when there is one, and a way to try again. */
export function FailedBanner({ message, manual, onRetry }: { message: string; manual: string | null; onRetry(): void }) {
  return (
    <Banner
      tone="error"
      title="That did not work"
      action={
        <span className="sk-row-actions">
          {manual && <CopyButton text={manual} label="Copy the command" caption="Copy command" />}
          <Button onClick={onRetry}>Try again</Button>
        </span>
      }
    >
      {message}
    </Banner>
  );
}

interface SectionProps {
  s: AppState;
  info: AutomationInfo | null;
  failed: string | null;
  onAction(a: CommandLineAction): void;
  onReset(): void;
  onSkill(): void;
  onTerminal(): void;
}

function CommandLineSection({ s, info, onAction, onReset, onSkill, onTerminal, failed }: SectionProps) {
  const installed = info?.commandLine.kind === "installed" || info?.commandLine.kind === "needs-path";
  const manual = info && !installed ? info.manualInstall : null;
  return (
    <SettingsSection title="Command-line tool">
      {failed && <FailedBanner message={failed} manual={manual} onRetry={() => info && onAction(info.commandLine.kind === "installed" ? "remove" : "install")} />}
      {info && <CommandLineRow info={info} version={s.version} busy={false} onAction={onAction} />}
      <SettingRow
        label="Try it"
        description="Prints what Speak Kit is doing right now."
        control={
          <div className="sk-row-actions">
            {code(TRY_COMMAND)}
            <CopyButton text={TRY_COMMAND} label="Copy the command" />
            <Button disabled={!installed} onClick={onTerminal}>
              Test in terminal
            </Button>
          </div>
        }
      />
      {info && <SkillRow info={info} onInstall={onSkill} />}
      <Reference />
      <SettingRow
        label="Discovery file"
        description="Scripts find the local server here. It holds a port and a private token, so keep it out of shared folders."
        control={
          <div className="sk-row-actions">
            {code(info?.discoveryFile ?? "control.json")}
            <Button onClick={() => void api.openPath("data")}>Show file</Button>
            <Button onClick={onReset}>Reset token</Button>
          </div>
        }
      />
    </SettingsSection>
  );
}

function McpSection({ s }: { s: AppState }) {
  const on = s.config.controlServer;
  return (
    <SettingsSection title="MCP server">
      <SettingRow
        label={
          <span className="sk-row-actions">
            Let AI apps use Speak Kit <StatusPill tone={on ? "green" : "neutral"}>{on ? "Running" : "Off"}</StatusPill>
          </span>
        }
        description="Only this computer can connect."
        control={<Toggle aria-label="Let AI apps use Speak Kit" checked={on} onChange={(v) => void api.patchConfig({ controlServer: v })} />}
      />
      {toolRows(s.config.mcpTools).map((t) => (
        <SettingRow
          key={t.name}
          label={code(t.name)}
          description={`${t.description}${t.private ? " Off until you turn it on." : ""}`}
          control={<Toggle aria-label={t.title} checked={t.on} disabled={!on} onChange={(v) => void api.patchConfig({ mcpTools: { ...s.config.mcpTools, [t.name]: v } })} />}
        />
      ))}
      <div className="sk-pad">
        <b>Add it to your AI app</b>
        <p>Paste this into the MCP settings of the app. It finds the token on its own, so none is written here.</p>
        <pre className="sk-code sk-code--block" aria-label="MCP settings block">
          {MCP_CONFIG}
        </pre>
        <CopyButton text={MCP_CONFIG} label="Copy the MCP block" />
      </div>
    </SettingsSection>
  );
}

function Links() {
  return (
    <SettingsSection title="Deep links" description="Links only open a page in Speak Kit. They never start a reading or change a setting.">
      {DEEP_LINKS.map((l) => (
        <SettingRow key={l.url} label={l.url} description={l.text} control={<CopyButton text={l.url} label={`Copy ${l.url}`} />} />
      ))}
    </SettingsSection>
  );
}

/** Settings > Automation: the command-line tool, the MCP server with a switch for each tool, and the deep links. */
export function AutomationPage({ s }: { s: AppState }) {
  const { load, read, run, failed } = useInfo();
  const info = load.phase === "ready" ? load.info : null;
  return (
    <Page title="Automation" lead="Let scripts and AI apps use Speak Kit on this computer. Nothing here leaves your computer.">
      {!s.config.controlServer && (
        <OptInCard icon="terminal" title="The local server is off" enableLabel="Start server" onEnable={() => void api.patchConfig({ controlServer: true })}>
          The command-line tool and the MCP server need it. It only answers on this computer. Speak Kit itself works without it.
        </OptInCard>
      )}
      {load.phase === "error" && (
        <Banner tone="error" title="Could not read the command-line tool" action={<Button onClick={read}>Try again</Button>}>
          Speak Kit did not answer. The rest of this page still works.
        </Banner>
      )}
      {load.phase === "loading" && (
        <p role="status" className="sk-pad">
          Loading…
        </p>
      )}
      <CommandLineSection
        s={s}
        info={info}
        failed={failed}
        onSkill={() => void run(() => api.installAgentSkill(), "The skill file could not be written. Check that your home folder can be written to.")}
        onTerminal={() => void run(() => api.testInTerminal(), "No terminal could be opened. Open one yourself and run the command.")}
        onAction={(a) => void run(() => api.commandLine(a), "The command-line tool could not be changed. Close other terminals and try again.")}
        onReset={() => void run(() => api.resetControlToken(), "The token could not be reset.")}
      />
      <McpSection s={s} />
      <Links />
    </Page>
  );
}
