import { useCallback, useEffect, useState } from "react";
import { AUTOMATION_ERROR_CODES, AUTOMATION_ERROR_TEXT } from "@speakkit/protocol";
import { Banner, Button, EmptyState, Icon, SettingRow, SettingsSection, Skeleton, StatusPill, Toggle } from "@speakkit/ui";
import { automationView, capabilityChips, COMMANDS, type AutomationInfo, type AutomationCliAction } from "../../../shared/automation";
import type { AppState } from "../../../shared/ipc";
import { api, cleanError, Page } from "../../ui";

/** A command or text in a well, with the button that copies it. The label says Copied for a moment. */
function CopyBox({ text, label = "Copy", name }: { text: string; label?: string; name: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="sk-pad sk-codeline">
      <pre className="sk-code" tabIndex={0} aria-label={name}>
        {text}
      </pre>
      <Button
        iconLeft="copy"
        aria-label={`${label}: ${name}`}
        onClick={async () => {
          await api.copy(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? "Copied" : label}
      </Button>
    </div>
  );
}

/** The info from main, loaded when the page opens and whenever the server starts or restarts; actions replace it with the answer. */
function useAutomation(s: AppState) {
  const [info, setInfo] = useState<AutomationInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(() => {
    setLoadError(null);
    api.automationInfo().then(setInfo, (e) => setLoadError(cleanError(e)));
  }, []);
  useEffect(load, [load, s.port]);
  const run = async (key: string, call: () => Promise<AutomationInfo>) => {
    setBusy(key);
    setError(null);
    try {
      setInfo(await call());
    } catch (e) {
      setError(cleanError(e));
    } finally {
      setBusy(null);
    }
  };
  return { info, loadError, error, busy, load, run };
}

type Busy = string | null;

function TerminalRows({ terminal, busy, act }: { terminal: ReturnType<typeof automationView>["cli"]["terminal"]; busy: Busy; act: (kind: AutomationCliAction) => void }) {
  if (!terminal) return null;
  if (terminal.working) {
    return (
      <SettingRow
        className="lm-row--control"
        label="Terminal output"
        description="Prints in the window you ran it from. No extra window opens and nothing flashes."
        data-testid="automation-terminal"
        control={
          <div className="sk-row-actions">
            <StatusPill tone="green">Working</StatusPill>
            <Button loading={busy === "test"} disabled={busy !== null} onClick={() => act("test")}>
              Test in terminal
            </Button>
          </div>
        }
      />
    );
  }
  return (
    <SettingRow
      className="lm-row--control"
      label="Terminal output is off"
      description={<span className="sk-problem">{terminal.problem}</span>}
      data-testid="automation-terminal"
      control={
        <Button variant="primary" loading={busy === "install"} disabled={busy !== null} onClick={() => act("install")}>
          Repair
        </Button>
      }
    />
  );
}

function CliSection({ info, busy, run, platform }: { info: AutomationInfo; busy: string | null; run: (key: string, call: () => Promise<AutomationInfo>) => void; platform: string }) {
  const v = automationView(info).cli;
  const act = (kind: AutomationCliAction) => run(kind, () => api.automationCli(kind));
  return (
    <SettingsSection title="Command-line tool" description="The speakkit command reads text aloud and answers questions about Speak Kit from a terminal or a script.">
      <SettingRow
        className="lm-row--control"
        label={
          <span className="sk-inline">
            speakkit <StatusPill tone={v.pill.tone === "amber" ? "orange" : v.pill.tone}>{v.pill.label}</StatusPill>
          </span>
        }
        description={v.line}
        data-testid="automation-cli"
        control={
          v.action && (
            <Button variant={v.action.primary ? "primary" : "secondary"} loading={busy === v.action.kind} disabled={busy !== null} onClick={() => act(v.action!.kind)}>
              {v.action.label}
            </Button>
          )
        }
      />
      <TerminalRows terminal={v.terminal} busy={busy} act={act} />
      {info.cli?.needsNewTerminal && (
        <SettingRow
          label="Open a new terminal"
          description={platform === "darwin" ? "Terminals that are already open keep their old PATH." : "Terminals and apps that are already open keep their old PATH."}
        />
      )}
    </SettingsSection>
  );
}

function Capabilities() {
  return (
    <SettingsSection title="What this version can do" description="Scripts and the browser extension read this list instead of guessing from the version number.">
      <div className="sk-pad sk-chips" data-testid="automation-capabilities">
        {capabilityChips().map((c) =>
          c.parked ? (
            <span key={c.name} className="sk-chip sk-chip--parked">
              {c.name} · parked
            </span>
          ) : (
            <span key={c.name} className="sk-chip">
              <Icon name="check" size={14} />
              {c.name}
            </span>
          ),
        )}
      </div>
      <CopyBox text={COMMANDS.capabilities} name="the capabilities command" />
    </SettingsSection>
  );
}

function ErrorCodes() {
  return (
    <SettingsSection title="Error codes" description="Every error says what went wrong in a short code, so a script can react to it.">
      <div role="table" aria-label="Error codes" data-testid="automation-errors">
        {AUTOMATION_ERROR_CODES.map((code) => (
          <div role="row" key={code} className="sk-errrow">
            <code role="cell" className="sk-errrow__code">
              {code}
            </code>
            <span role="cell">{AUTOMATION_ERROR_TEXT[code]}</span>
          </div>
        ))}
      </div>
    </SettingsSection>
  );
}

function SkillSection({ info, busy, run }: { info: AutomationInfo; busy: string | null; run: (key: string, call: () => Promise<AutomationInfo>) => void }) {
  const v = automationView(info).skill;
  return (
    <SettingsSection title="Agent skill" description="A short guide that teaches an AI agent the speakkit commands.">
      <SettingRow
        className="lm-row--control"
        label={v.title}
        description={v.line}
        data-testid="automation-skill"
        control={
          <div className="sk-row-actions">
            {v.pill && <StatusPill tone={v.pill.tone === "amber" ? "orange" : v.pill.tone}>{v.pill.label}</StatusPill>}
            <Button variant={v.action.primary ? "primary" : "secondary"} loading={busy === "skill"} disabled={busy !== null} onClick={() => run("skill", () => api.automationSkill())}>
              {v.action.label}
            </Button>
          </div>
        }
      />
      <CopyBox text={COMMANDS.installSkill} label="Copy install command" name="the skill install command" />
    </SettingsSection>
  );
}

function Reference() {
  return (
    <>
      <SettingsSection title="Print without speaking" description="For scripts: see how a text would be split into sentences. Nothing is spoken or queued.">
        <CopyBox text={COMMANDS.print} name="the print command" />
      </SettingsSection>
      <SettingsSection title="Speak a file" description="Turns a text file into audio with the same export as the app.">
        <CopyBox text={COMMANDS.speakFile} name="the speak a file command" />
        <SettingRow label="File size" description="Files up to 64 MiB are read. A bigger file stops before anything is spoken." control={<StatusPill>64 MiB</StatusPill>} />
      </SettingsSection>
      <SettingsSection title="Read-only commands" description="status, queue, voices and capabilities only look; they change nothing and never start a reading.">
        <SettingRow
          label="Status, queue and voices"
          description="Need Speak Kit to be running. capabilities also answers while it is closed."
          control={<StatusPill tone="green">Read only</StatusPill>}
        />
      </SettingsSection>
    </>
  );
}

function Limits({ view }: { view: ReturnType<typeof automationView> }) {
  return (
    <SettingsSection title="Local server limits" description="Other apps on this computer reach Speak Kit through a private local server. Limits keep it from being overloaded.">
      <div data-testid="automation-limits" data-offline={view.limitsOffline}>
        {view.limits.map((l) => (
          <SettingRow key={l.label} label={l.label} description={l.description} control={<StatusPill>{l.value}</StatusPill>} />
        ))}
      </div>
    </SettingsSection>
  );
}

function LiveTranscription() {
  return (
    <SettingsSection title="Live transcription" description="Parked: needs live transcription, which can lose the first sentence. Apps get the full text after you finish.">
      <SettingRow
        label={
          <span className="sk-inline">
            Send live text to other apps <StatusPill>Parked</StatusPill>
          </span>
        }
        description="Only finished sentences, never half words. Local apps with your token only."
        control={<Toggle aria-label="Send live text to other apps" checked={false} disabled />}
      />
    </SettingsSection>
  );
}

export function AutomationPage({ s }: { s: AppState }) {
  const { info, loadError, error, busy, load, run } = useAutomation(s);
  const view = info && automationView(info);
  return (
    <Page title="Automation" lead="Let scripts and AI apps use Speak Kit on this computer. Nothing here leaves your computer.">
      {!s.port && (
        <Banner tone="warning" title="The local server is not running">
          Commands cannot reach Speak Kit until it starts. The limits below are the built-in ones.
        </Banner>
      )}
      {error && (
        <Banner tone="error" title="That did not work">
          {error}
        </Banner>
      )}
      {loadError && (
        <EmptyState icon="alert-circle" title="Could not read the automation settings" primary={{ label: "Try again", onClick: load }}>
          {loadError}
        </EmptyState>
      )}
      {!info && !loadError && <Skeleton lines={[420, 360, 300, 380]} shimmer />}
      {info && view && (
        <>
          <CliSection info={info} busy={busy} run={run} platform={s.platform} />
          <Capabilities />
          <SettingsSection title="Connect an AI app" description="Add this to the MCP settings of an AI app so it can read aloud with Speak Kit. It runs on this computer and needs no account.">
            <CopyBox text={info.mcpConfig} label="Copy MCP config" name="the MCP configuration" />
          </SettingsSection>
          <Reference />
          <ErrorCodes />
          <Limits view={view} />
          <LiveTranscription />
          <SkillSection info={info} busy={busy} run={run} />
        </>
      )}
    </Page>
  );
}
