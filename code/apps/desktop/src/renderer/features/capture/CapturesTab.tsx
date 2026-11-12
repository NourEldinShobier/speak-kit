import { useCallback, useEffect, useState } from "react";
import { Banner, Button, EmptyState, Icon, Kbd, Modal, Skeleton, TextInput } from "@speakkit/ui";
import type { CaptureDetail, CaptureItem, CaptureStatus } from "../../../shared/capture/contract";
import { groupByDay } from "../../../shared/capture/days";
import { hotkeyLabels } from "../../../shared/dictation/keys";
import { itemChip, itemSubtitle, listFooter, unavailable } from "./format";
import { capture } from "./api";
import { DetailView } from "./DetailView";

function Notices({ s }: { s: CaptureStatus }) {
  return (
    <>
      {s.notice ? (
        <Banner
          tone={s.notice.tone}
          title={s.notice.title}
          action={
            <>
              <Button onClick={() => void capture.noticeAction(s.notice!.action)}>{s.notice.actionLabel}</Button>
              {s.notice.action !== "ok" ? (
                <Button aria-label="Dismiss notice" onClick={() => void capture.dismissNotice()}>
                  Dismiss
                </Button>
              ) : null}
            </>
          }
        >
          {s.notice.body}
        </Banner>
      ) : null}
      {s.recovery ? (
        <Banner tone="info" title="Captures recovered after Speak Kit closed unexpectedly" action={<Button onClick={() => void capture.dismissRecovery()}>OK</Button>}>
          {s.recovery.finished} finished and kept{s.recovery.removed ? `, ${s.recovery.removed} removed because nothing was saved` : ""}.
        </Banner>
      ) : null}
      {!s.enabled && s.supported ? (
        <Banner tone="info" title="Capture is off" action={<Button onClick={() => void capture.setEnabled(true)}>Turn on</Button>}>
          Turn it on to use the capture key in any app.
        </Banner>
      ) : null}
    </>
  );
}

function Row({ item, onOpen }: { item: CaptureItem; onOpen: () => void }) {
  const chip = itemChip(item);
  return (
    <div className="lm-row cap-row" data-testid="capture-row" data-row={item.id}>
      <div className="cap-row__thumb" aria-hidden="true">
        {item.thumb ? <img src={item.thumb} alt="" /> : <Icon name="scan" size={16} />}
      </div>
      <div className="cap-row__text">
        <span className="cap-row__title">{item.title}</span>
        <span className="cap-row__meta">{itemSubtitle(item)}</span>
      </div>
      <span className={`cap-chip cap-chip--${chip.tone}`}>{chip.label}</span>
      <Button aria-label={`Copy picture of ${item.title}`} disabled={item.finishing} onClick={() => void capture.copy(item.id, "picture")}>
        Copy
      </Button>
      <Button aria-label={`Open ${item.title}`} onClick={onOpen}>
        Open
      </Button>
    </div>
  );
}

function TakeButton({ s }: { s: CaptureStatus }) {
  const off = !s.enabled || !s.supported || s.phase !== "idle";
  return (
    <Button variant="primary" disabled={off} onClick={() => void capture.start()}>
      Take a capture
      <Kbd>{hotkeyLabels(s.settings.hotkey, s.platform)[0] ?? "F9"}</Kbd>
    </Button>
  );
}

function Empty({ s, search }: { s: CaptureStatus; search: string }) {
  if (search) return <EmptyState icon="search" title="No captures match">{`Nothing matches "${search}". Search looks at titles and what you said.`}</EmptyState>;
  return (
    <div className="lm-card">
      <EmptyState icon="scan" title="No captures yet">
        Press <Kbd>{hotkeyLabels(s.settings.hotkey, s.platform).join(" ")}</Kbd> in any app, choose a window, an area or a screen, and talk. Captures stay on this computer.
      </EmptyState>
    </div>
  );
}

function List({ s, items, total, search, onOpen }: { s: CaptureStatus; items: CaptureItem[]; total: number; search: string; onOpen: (id: string) => void }) {
  if (!items.length) return <Empty s={s} search={search} />;
  return (
    <>
      {groupByDay(items, Date.now()).map((g) => (
        <section key={g.label} aria-label={g.label}>
          <h2 className="cap-day">{g.label}</h2>
          <div className="lm-card cap-card">
            {g.items.map((i) => (
              <Row key={i.id} item={i} onOpen={() => onOpen(i.id)} />
            ))}
          </div>
        </section>
      ))}
      <p className="cap-footer">{listFooter(total, s.settings.retentionDays, s.platform)}</p>
    </>
  );
}

function DeleteDialog({ item, onClose, onConfirm, platform }: { item: CaptureDetail | CaptureItem | null; onClose: () => void; onConfirm: () => void; platform: string }) {
  const bin = platform === "darwin" ? "Trash" : "Recycle Bin";
  return (
    <Modal
      open={!!item}
      onClose={onClose}
      title="Delete this capture?"
      width={420}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button className="cap-danger" onClick={onConfirm}>
            Move to {bin}
          </Button>
        </>
      }
    >
      {item ? `"${item.title}" and its pictures move to the ${bin}. You can restore it from there.` : null}
    </Modal>
  );
}

function useCaptureList(search: string, s: CaptureStatus) {
  const [data, setData] = useState<{ items: CaptureItem[]; total: number } | null>(null);
  const [error, setError] = useState(false);
  const load = useCallback(() => {
    setError(false);
    capture.list(search).then(setData, () => setError(true));
  }, [search]);
  // Reload when the search changes and when the main process says the list changed (count or phase).
  useEffect(load, [load, s.count, s.phase]);
  return { data, error, load };
}

function Content({ s, search, onOpen, list }: { s: CaptureStatus; search: string; onOpen: (id: string) => void; list: ReturnType<typeof useCaptureList> }) {
  if (list.error)
    return (
      <Banner tone="error" title="Captures could not be loaded" action={<Button onClick={list.load}>Try again</Button>}>
        The list of captures could not be read. Your captures are still on this computer.
      </Banner>
    );
  if (!list.data)
    return (
      <div className="lm-card" aria-busy="true" aria-label="Loading captures">
        <Skeleton />
      </div>
    );
  return <List s={s} items={list.data.items} total={list.data.total} search={search} onOpen={onOpen} />;
}

/** The list of captures: search, days, rows with Copy and Open, and the opened capture. Loading, error, empty and no-match each have their own state. */
export function CapturesTab({ s }: { s: CaptureStatus }) {
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [doomed, setDoomed] = useState<CaptureItem | CaptureDetail | null>(null);
  const list = useCaptureList(search, s);
  const block = unavailable(s);
  const remove = async () => {
    if (!doomed) return;
    await capture.remove(doomed.id);
    setDoomed(null);
    setOpenId(null);
    list.load();
  };
  const dialog = <DeleteDialog item={doomed} onClose={() => setDoomed(null)} onConfirm={() => void remove()} platform={s.platform} />;
  if (openId)
    return (
      <>
        <DetailView id={openId} platform={s.platform} onBack={() => setOpenId(null)} onDelete={setDoomed} />
        {dialog}
      </>
    );
  return (
    <div className="cap-tab" data-testid="captures-tab">
      <Notices s={s} />
      {block ? (
        <Banner tone="warning" title="Capture is not ready">
          {block}
        </Banner>
      ) : null}
      <div className="cap-bar">
        <TextInput aria-label="Search captures" placeholder="Search captures" icon="search" value={search} onChange={(e) => setSearch(e.target.value)} />
        <TakeButton s={s} />
      </div>
      <Content s={s} search={search} onOpen={setOpenId} list={list} />
      {dialog}
    </div>
  );
}
