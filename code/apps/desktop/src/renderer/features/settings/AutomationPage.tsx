import { useCallback, useEffect, useState } from "react";
import { Banner, Button, OptInCard, SettingRow, SettingsSection, StatusPill, Toggle } from "@speakkit/ui";
import { ERROR_CODES } from "../../../shared/control/contract";
import type { AutomationInfo, CommandLineAction } from "../../../shared/control/info";
import type { AppState } from "../../../shared/ipc";
import { useT } from "../../i18n";
import { api, Page } from "../../ui";
import { COMMAND_ROWS, commandLineView, DEEP_LINKS, ERROR_ROWS, EXIT_ROWS, MCP_CONFIG, SKILL_COMMAND, skillView, toolRows, TRY_COMMAND } from "./automation";
import { change } from "../../change";

/** A Copy button that says Copied for a moment; a clipboard that refuses leaves the label alone. */
function CopyButton({ text, label, caption }: { text: string; label: string; caption?: string }) {
  const { t } = useT();
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
      {done ? t("automation.copied") : (caption ?? t("automation.copy"))}
    </Button>
  );
}

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
  const { t } = useT();
  return (
    <>
      <div className="sk-pad" data-testid="automation-commands">
        <b>{t("automation.referenceWhat")}</b>
        <ul className="sk-exit">
          {COMMAND_ROWS.map((r) => (
            <li key={r.usage}>
              {code(r.usage)} <span>{r.text}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="sk-pad" data-testid="automation-exit-codes">
        <b>{t("automation.referenceJson")}</b>
        <p>{t("automation.referenceJsonHint")}</p>
        <ul className="sk-exit">
          {EXIT_ROWS.map((r) => (
            <li key={r.code}>
              {code(String(r.code))} <span>{r.text}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="sk-pad" data-testid="automation-errors">
        <b>{t("automation.referenceErrors")}</b>
        <p>{t("automation.referenceErrorsHint")}</p>
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
  const { t } = useT();
  const v = skillView(info.skill);
  return (
    <SettingRow
      label={
        <span className="sk-row-actions">
          {t("automation.skill")} <StatusPill tone={v.pill.tone}>{v.pill.text}</StatusPill>
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
          <CopyButton text={SKILL_COMMAND} label={t("automation.copySkill")} caption={t("automation.copyInstall")} />
        </div>
      }
    />
  );
}

/** What went wrong, with the command to do it by hand when there is one, and a way to try again. */
export function FailedBanner({ message, manual, onRetry }: { message: string; manual: string | null; onRetry(): void }) {
  const { t } = useT();
  return (
    <Banner
      tone="error"
      title={t("automation.failed")}
      action={
        <span className="sk-row-actions">
          {manual && <CopyButton text={manual} label={t("automation.copyCommand")} caption={t("automation.copyCommandCaption")} />}
          <Button onClick={onRetry}>{t("automation.tryAgain")}</Button>
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
  const { t } = useT();
  const installed = info?.commandLine.kind === "installed" || info?.commandLine.kind === "needs-path";
  const manual = info && !installed ? info.manualInstall : null;
  return (
    <SettingsSection title={t("automation.cli")}>
      {failed && <FailedBanner message={failed} manual={manual} onRetry={() => info && onAction(info.commandLine.kind === "installed" ? "remove" : "install")} />}
      {info && <CommandLineRow info={info} version={s.version} busy={false} onAction={onAction} />}
      <SettingRow
        label={t("automation.tryIt")}
        description={t("automation.tryItHint")}
        control={
          <div className="sk-row-actions">
            {code(TRY_COMMAND)}
            <CopyButton text={TRY_COMMAND} label={t("automation.copyCommand")} />
            <Button disabled={!installed} onClick={onTerminal}>
              {t("automation.testTerminal")}
            </Button>
          </div>
        }
      />
      {info && <SkillRow info={info} onInstall={onSkill} />}
      <Reference />
      <SettingRow
        label={t("automation.discovery")}
        description={t("automation.discoveryHint")}
        control={
          <div className="sk-row-actions">
            {code(info?.discoveryFile ?? "control.json")}
            <Button onClick={() => void api.openPath("data")}>{t("automation.showFile")}</Button>
            <Button onClick={onReset}>{t("automation.resetToken")}</Button>
          </div>
        }
      />
    </SettingsSection>
  );
}

function McpSection({ s }: { s: AppState }) {
  const { t } = useT();
  const on = s.config.controlServer;
  return (
    <SettingsSection title={t("automation.mcp")}>
      <SettingRow
        label={
          <span className="sk-row-actions">
            {t("automation.letAi")} <StatusPill tone={on ? "green" : "neutral"}>{on ? t("automation.on") : t("automation.off")}</StatusPill>
          </span>
        }
        description={t("automation.onlyHere")}
        control={<Toggle aria-label={t("automation.letAi")} checked={on} onChange={(v) => void change({ controlServer: v })} />}
      />
      {toolRows(s.config.mcpTools).map((tool) => (
        <SettingRow
          key={tool.name}
          label={code(tool.name)}
          description={`${tool.description}${tool.private ? ` ${t("automation.offUntil")}` : ""}`}
          control={<Toggle aria-label={tool.title} checked={tool.on} disabled={!on} onChange={(v) => void change({ mcpTools: { ...s.config.mcpTools, [tool.name]: v } })} />}
        />
      ))}
      <div className="sk-pad">
        <b>{t("automation.addToAi")}</b>
        <p>{t("automation.addToAiHint")}</p>
        <pre className="sk-code sk-code--block" aria-label={t("automation.mcpBlock")}>
          {MCP_CONFIG}
        </pre>
        <CopyButton text={MCP_CONFIG} label={t("automation.copyMcp")} />
      </div>
    </SettingsSection>
  );
}

function Links() {
  const { t } = useT();
  return (
    <SettingsSection title={t("automation.links")} description={t("automation.linksHint")}>
      {DEEP_LINKS.map((l) => (
        <SettingRow key={l.url} label={l.url} description={l.text} control={<CopyButton text={l.url} label={t("automation.copyLink", { url: l.url })} />} />
      ))}
    </SettingsSection>
  );
}

/** Settings > Automation: the command-line tool, the MCP server with a switch for each tool, and the deep links. */
export function AutomationPage({ s }: { s: AppState }) {
  const { t } = useT();
  const { load, read, run, failed } = useInfo();
  const info = load.phase === "ready" ? load.info : null;
  return (
    <Page title={t("automation.title")} lead={t("automation.lead")}>
      {!s.config.controlServer && (
        <OptInCard icon="terminal" title={t("automation.serverOff")} enableLabel={t("automation.startServer")} onEnable={() => void change({ controlServer: true })}>
          {t("automation.serverOffBody")}
        </OptInCard>
      )}
      {load.phase === "error" && (
        <Banner tone="error" title={t("automation.readFailed")} action={<Button onClick={read}>{t("automation.tryAgain")}</Button>}>
          {t("automation.readFailedBody")}
        </Banner>
      )}
      {load.phase === "loading" && (
        <p role="status" className="sk-pad">
          {t("automation.loading")}
        </p>
      )}
      <CommandLineSection
        s={s}
        info={info}
        failed={failed}
        onSkill={() => void run(() => api.installAgentSkill(), t("automation.skillFailed"))}
        onTerminal={() => void run(() => api.testInTerminal(), t("automation.terminalFailed"))}
        onAction={(a) => void run(() => api.commandLine(a), t("automation.cliFailed"))}
        onReset={() => void run(() => api.resetControlToken(), t("automation.tokenFailed"))}
      />
      <McpSection s={s} />
      <Links />
    </Page>
  );
}
