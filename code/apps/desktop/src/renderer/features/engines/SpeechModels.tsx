import { useEffect, useState } from "react";
import { Banner, Button, EmptyState, Icon, Modal, Segmented, Select, SettingRow, Skeleton, TextInput, Toggle } from "@speakkit/ui";
import type { FoundView, ModelCard, SpeechModelsView, SwitchRuleView } from "../../../shared/speech-models/contract";
import { models } from "./api";
import { ModelCardView } from "./ModelCards";
import { deleteConfirm, deviceLine, DEFAULT_FILTER, hardwareLine, hiddenLine, IDLE_LABELS, languageName, recommendationText, SORT_OPTIONS, sizeText, visibleModels, type Filter } from "./speech-text";
import { useSpeechModels } from "./useSpeechModels";
import "./speech-models.css";

const IDLE_OPTIONS = [5, 15, 30, 60, 0].map((m) => ({ value: String(m), label: IDLE_LABELS[m]! }));
const DEVICE_OPTIONS = [
  { value: "auto", label: "Automatic" },
  { value: "gpu", label: "Graphics card" },
  { value: "cpu", label: "CPU" },
];

/** Runs one action against the bridge; the page then follows the view the main process pushes. */
function useRunner(set: (v: SpeechModelsView) => void) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const run = (f: () => Promise<unknown>) => {
    setBusy(true);
    setMessage(null);
    f()
      .then((r) => {
        if (r && typeof r === "object") {
          const o = r as { models?: unknown; ok?: boolean; message?: string };
          if (Array.isArray(o.models)) set(r as SpeechModelsView);
          else if (o.ok === false && o.message) setMessage(o.message);
        }
      })
      .catch((e: unknown) => setMessage(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']*': (Error: )?/, "") : String(e)))
      .finally(() => setBusy(false));
  };
  return { busy, message, run, clear: () => setMessage(null) };
}

function Notices({ v, run, found }: { v: SpeechModelsView; run: (f: () => Promise<unknown>) => void; found: FoundView[] }) {
  const rec = recommendationText(v);
  return (
    <>
      {!v.dictationSupported && (
        <Banner tone="info" title="Dictation is not available on this computer yet">
          You can still manage speech models here.
        </Banner>
      )}
      {v.floor && (
        <Banner tone="warning" title="This computer is limited" role="status">
          {v.floor.message}
        </Banner>
      )}
      {found.length > 0 && (
        <Banner
          tone="info"
          icon="search"
          title={`${found.map((f) => f.name).join(" and ")} found on this computer`}
          action={<Button onClick={() => run(() => models.adoptFound(found.map((f) => f.id)))}>Use {found.length === 1 ? "it" : "them"}</Button>}
        >
          No download needed. Speak Kit copies the file into its own folder and leaves yours where it is.
        </Banner>
      )}
      {v.newer && (
        <Banner tone="info" icon="sparkles" title={`${v.newer.name} is out`} action={<Button onClick={() => run(() => models.dismissNewer(v.newer!.id))}>Dismiss</Button>}>
          It replaces a model you have. Speak Kit never switches or downloads by itself.
        </Banner>
      )}
      {rec && !v.floor && (
        <Banner tone="info" icon="sparkles" title={rec.title} action={<Button onClick={() => run(() => models.download(rec.model))}>Get {v.names[rec.model]}</Button>}>
          {rec.body}
        </Banner>
      )}
    </>
  );
}

function Filters({ v, filter, set }: { v: SpeechModelsView; filter: Filter; set(f: Filter): void }) {
  const codes = [...new Set(v.models.flatMap((m) => m.languages))].filter((c) => c !== "auto");
  return (
    <div className="sk-model-filters">
      <Segmented
        label="Show models"
        value={filter.downloadedOnly ? "downloaded" : "all"}
        onChange={(id) => set({ ...filter, downloadedOnly: id === "downloaded" })}
        items={[
          { id: "all", label: "All models" },
          { id: "downloaded", label: "Downloaded" },
        ]}
      />
      <Select label="Language" size="sm" value={filter.language} onChange={(language) => set({ ...filter, language })} options={[{ value: "all", label: "All languages" }, ...codes.map((c) => ({ value: c, label: languageName(c) }))]} />
      <Select label="Sort" size="sm" value={filter.sort} onChange={(sort) => set({ ...filter, sort: sort as Filter["sort"] })} options={SORT_OPTIONS} />
    </div>
  );
}

function ImportDialog({ open, onClose, run }: { open: boolean; onClose(): void; run(f: () => Promise<unknown>): void }) {
  const [kind, setKind] = useState<"multilingual" | "english">("multilingual");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const choose = async () => {
    setWorking(true);
    setError(null);
    try {
      const r = await models.importFile(kind, name);
      if ("cancelled" in r) return;
      if (!r.ok) return setError(r.message);
      run(() => models.view());
      setName("");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setWorking(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Import a model file"
      width={480}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={working} onClick={() => void choose()}>
            Choose file
          </Button>
        </>
      }
    >
      <div className="sk-import">
        <p>Speak Kit checks the file's header, copies it into its own folder and identifies it by its fingerprint. Whisper model files (.bin) work. Nothing is copied if the check fails.</p>
        <label className="sk-import__field">
          <span>Name</span>
          <TextInput aria-label="Model name" placeholder="Shown in the list" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        </label>
        <Segmented
          label="Languages"
          value={kind}
          onChange={(k) => setKind(k as typeof kind)}
          items={[
            { id: "multilingual", label: "Many languages" },
            { id: "english", label: "English only" },
          ]}
        />
        <p className="sk-import__note">Licence: check the licence of the model before you use it. Speak Kit cannot tell it from the file.</p>
        {error && (
          <p className="sk-import__error" role="alert">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}

function RuleEditor({ v, run }: { v: SpeechModelsView; run: (f: () => Promise<unknown>) => void }) {
  const installed = v.models.filter((m) => m.installed);
  const [rules, setRules] = useState<SwitchRuleView[]>(v.autoSwitch.rules);
  const save = (enabled: boolean, next: SwitchRuleView[]) => {
    setRules(next);
    run(() => models.setAutoSwitch({ enabled, rules: next }));
  };
  const update = (id: string, patch: Partial<SwitchRuleView>) => setRules((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const options = installed.map((m) => ({ value: m.id, label: m.name }));
  return (
    <>
      <SettingRow
        label="Switch model automatically"
        description="Off by default. Only downloaded models are used, and never during a recording."
        control={<Toggle aria-label="Switch model automatically" checked={v.autoSwitch.enabled} onChange={(on) => save(on, rules)} />}
      />
      {v.autoSwitch.enabled && (
        <div className="sk-rules" role="group" aria-label="Automatic switching rules">
          <p className="sk-rules__note">Speak Kit waits 300 ms after the keyboard layout or the app changes before it switches.</p>
          {rules.map((r) => (
            <div key={r.id} className="sk-rule">
              <TextInput aria-label="Keyboard layout" placeholder="Layout, e.g. de" maxLength={16} value={r.layout ?? ""} onChange={(e) => update(r.id, { layout: e.target.value })} onBlur={() => save(true, rules)} />
              <TextInput aria-label="App" placeholder="App, e.g. slack" maxLength={80} value={r.app ?? ""} onChange={(e) => update(r.id, { app: e.target.value })} onBlur={() => save(true, rules)} />
              <Select label="Model" size="sm" value={r.model} options={options.length ? options : [{ value: r.model, label: v.names[r.model] ?? r.model }]} onChange={(model) => save(true, rules.map((x) => (x.id === r.id ? { ...x, model } : x)))} />
              <Button aria-label="Remove rule" onClick={() => save(true, rules.filter((x) => x.id !== r.id))}>
                <Icon name="trash" size={14} />
              </Button>
              {v.autoSwitch.skippedRuleIds.includes(r.id) && <p className="sk-rule__skip">Skipped: {v.names[r.model] ?? r.model} is not downloaded.</p>}
            </div>
          ))}
          <Button
            disabled={installed.length === 0 || rules.length >= 20}
            onClick={() => save(true, [...rules, { id: `r${Date.now().toString(36)}`, layout: "", model: installed[0]!.id }].map((r) => ({ ...r })))}
          >
            Add rule
          </Button>
          {v.platform !== "win32" && <p className="sk-rules__note">Keyboard layout rules need Windows. Rules by app name work where Speak Kit can tell which app is in front.</p>}
        </div>
      )}
    </>
  );
}

function Performance({ v, run }: { v: SpeechModelsView; run: (f: () => Promise<unknown>) => void }) {
  const [open, setOpen] = useState(v.device.movedToCpuByMemory || v.device.failed.length > 0);
  const failed = v.device.failed;
  return (
    <section className="sk-engines-section" aria-labelledby="perf-h">
      <h2 id="perf-h">Performance</h2>
      <div className="lm-card">
        <SettingRow
          className="lm-row--control"
          label="Unload speech model when idle"
          description={v.idleMinutes === 0 ? "The model stays in memory. Dictation starts at once." : "Frees about 1.1 GB of memory. The first dictation after an unload takes longer."}
          control={<Select label="Unload speech model when idle" value={String(v.idleMinutes)} onChange={(m) => run(() => models.setIdleMinutes(Number(m)))} options={IDLE_OPTIONS} />}
        />
        <SettingRow
          label="Release memory when the window closes"
          description="The window and the graphics card memory are released at once. The tray keeps running."
          control={<Toggle aria-label="Release memory when the window closes" checked={v.releaseOnClose} onChange={(on) => run(() => models.setReleaseOnClose(on))} />}
        />
        <button type="button" className="lm-row sk-advanced" aria-expanded={open} onClick={() => setOpen(!open)}>
          <span className="lm-row__text">
            <span className="lm-row__label">Advanced</span>
            <span className="lm-row__desc">Graphics card or CPU, and devices Speak Kit stopped using.</span>
          </span>
          <Icon name={open ? "chevron-down" : "chevron-right"} size={16} />
        </button>
        {open && (
          <>
            <SettingRow
              className="lm-row--control"
              label="Run speech on"
              description={hardwareLine(v)}
              control={<Select label="Run speech on" value={v.device.choice} onChange={(c) => run(() => models.setDevice(c as never))} options={DEVICE_OPTIONS} />}
            />
            <SettingRow label="In use now" description={deviceLine(v)} />
            {v.device.cpuWarning && (
              <p className="sk-row-note" role="status">
                On the CPU speech can be many times slower than on the graphics card.
              </p>
            )}
            {(v.device.movedToCpuByMemory || failed.length > 0) && (
              <SettingRow
                className="lm-row--control"
                label={failed.length > 0 ? "Graphics card stopped" : "Graphics card out of memory"}
                description={failed.length > 0 ? failed.map((f) => `${f.name}, driver ${f.driver}: ${f.reason}`).join(" ") : "Speech runs on the CPU for now."}
                control={<Button onClick={() => run(() => models.retryGraphicsCard())}>Try the graphics card again</Button>}
              />
            )}
            <RuleEditor v={v} run={run} />
          </>
        )}
      </div>
    </section>
  );
}

function DiskSpace({ v, run, onDelete }: { v: SpeechModelsView; run: (f: () => Promise<unknown>) => void; onDelete(c: ModelCard): void }) {
  const have = v.models.filter((m) => m.diskBytes > 0 && !m.fileMissing);
  return (
    <section className="sk-engines-section" aria-labelledby="disk-h">
      <div className="sk-engines-section__head">
        <h2 id="disk-h">Disk space</h2>
        <span>{sizeText(v.disk.total)} used by models</span>
      </div>
      <div className="lm-card">
        {have.length === 0 ? (
          <SettingRow label="No models on disk" description="Downloaded models appear here." />
        ) : (
          have.map((m) => (
            <SettingRow
              key={m.id}
              className="lm-row--control"
              label={m.name}
              description={`Speech model, ${sizeText(m.diskBytes)}.`}
              control={
                <Button variant="danger" aria-label={`Delete ${m.name}`} onClick={() => onDelete(m)}>
                  Delete
                </Button>
              }
            />
          ))
        )}
      </div>
      <p className="sk-engines-section__foot">
        Models are stored in {v.disk.folder}.{" "}
        <button type="button" className="sk-link" onClick={() => run(() => models.openModelsFolder())}>
          Show folder
        </button>
      </p>
    </section>
  );
}

function LanguageTable({ v }: { v: SpeechModelsView }) {
  const alsoText = (row: SpeechModelsView["table"][number]) =>
    row.alsoWorks.length > 0 ? row.alsoWorks.map((id) => v.names[id] ?? id).join(", ") : row.language === "auto" ? "No other model detects the language" : `No other model speaks ${languageName(row.language)}`;
  return (
    <section className="sk-engines-section" aria-labelledby="table-h">
      <h2 id="table-h">Best model for each language</h2>
      <p className="sk-engines-section__lead">Speak Kit picks from this table when you choose a dictation language.</p>
      <div className="lm-card sk-table-wrap">
        <table className="sk-table">
          <thead>
            <tr>
              <th scope="col">Language</th>
              <th scope="col">Recommended</th>
              <th scope="col">Also works</th>
            </tr>
          </thead>
          <tbody>
            {v.table.map((r) => (
              <tr key={r.language}>
                <th scope="row">{languageName(r.language)}</th>
                <td>{v.names[r.recommended] ?? r.recommended}</td>
                <td>{alsoText(r)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Speech models: the model cards, the language table, performance and disk space. */
export function SpeechModelsSection() {
  const { view: v, failed, set } = useSpeechModels();
  const { busy, message, run, clear } = useRunner(set);
  const [filter, setFilter] = useState<Filter>(DEFAULT_FILTER);
  const [deleting, setDeleting] = useState<ModelCard | null>(null);
  const [importing, setImporting] = useState(false);
  const [found, setFound] = useState<FoundView[]>([]);
  const missing = !!v && v.models.some((m) => !m.installed && m.origin === "builtin");
  useEffect(() => {
    if (missing) void models.scanDisk().then(setFound, () => setFound([]));
  }, [missing]);

  if (!v)
    return (
      <section className="sk-engines-section" aria-label="Speech models">
        <h2>Speech models</h2>
        {failed ? (
          <Banner tone="error" title="Speech models could not be listed" action={<Button onClick={() => run(() => models.view().then(set))}>Try again</Button>}>
            Speak Kit could not read its list of models. Nothing was changed.
          </Banner>
        ) : (
          <div className="sk-model-grid" aria-busy="true">
            <Skeleton lines={[240, 180, 220, 160]} />
            <Skeleton lines={[240, 180, 220, 160]} />
          </div>
        )}
      </section>
    );

  const { shown, hidden } = visibleModels(v.models, filter);
  const onUse = (c: ModelCard) => run(() => models.use(c.id));
  const advice = (a: string) => (a === "open-proxy-settings" ? run(() => models.openProxySettings()) : run(() => models.openModelsFolder()));
  const confirm = deleting ? deleteConfirm(deleting, v) : null;
  const empty = v.noModel && !v.models.some((m) => m.transfer);

  return (
    <>
      <section className="sk-engines-section" aria-labelledby="models-h">
        <div className="sk-engines-section__head">
          <h2 id="models-h">Speech models</h2>
          <Filters v={v} filter={filter} set={setFilter} />
        </div>
        <Notices v={v} run={run} found={found} />
        {message && (
          <Banner tone="error" title="That did not work" action={<Button onClick={clear}>Dismiss</Button>}>
            {message}
          </Banner>
        )}
        {v.switching && (
          <Banner tone="info" role="status" title={`Checking ${v.names[v.switching] ?? v.switching} before switching`} action={<Button onClick={() => run(() => models.cancelSwitch())}>Cancel the switch</Button>}>
            The model in use stays in use until the new one is loaded.
          </Banner>
        )}
        {v.recording && (
          <Banner tone="info" role="status" title="Recording">
            Finish the recording first to switch models.
          </Banner>
        )}
        {empty && !v.skippedModel && (
          <EmptyState icon="microphone" title="No speech model" primary={{ label: "Download a model", onClick: () => run(() => models.download(v.table[0] ? (v.recommendation?.model ?? v.models[0]!.id) : v.models[0]!.id)) }} secondary={{ label: "Not now", onClick: () => run(() => models.continueWithoutModel()) }}>
            Dictation stays off. Reading aloud and voice chat keep working.
          </EmptyState>
        )}
        {empty && v.skippedModel && (
          <Banner tone="warning" title="Dictation is off until a model is downloaded">
            Pick a model below when you want to dictate.
          </Banner>
        )}
        <div className="sk-model-grid">
          {shown.map((c) => (
            <ModelCardView key={c.id} card={c} busy={busy || !!v.switching} run={run} onDelete={setDeleting} onUse={onUse} onFailureAdvice={advice} />
          ))}
        </div>
        {shown.length === 0 && <p className="sk-engines-section__foot">No model matches this filter.</p>}
        {filter.downloadedOnly && hidden > 0 && <p className="sk-engines-section__foot">{hiddenLine(hidden)}</p>}
        <div className="sk-engines-section__actions">
          <Button iconLeft="upload" onClick={() => setImporting(true)}>
            Import a model file
          </Button>
        </div>
      </section>
      <LanguageTable v={v} />
      <Performance v={v} run={run} />
      <DiskSpace v={v} run={run} onDelete={setDeleting} />
      <ImportDialog open={importing} onClose={() => setImporting(false)} run={run} />
      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={confirm?.title ?? ""}
        width={440}
        footer={
          <>
            <Button data-autofocus onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                const id = deleting!.id;
                setDeleting(null);
                run(() => models.remove(id).then(() => models.view()));
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="sk-modal-text" style={{ margin: 0 }}>
          {confirm?.body}
        </p>
      </Modal>
    </>
  );
}
