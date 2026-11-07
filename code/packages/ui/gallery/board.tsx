import { useState } from "react";
import {
  Avatar,
  Badge,
  Banner,
  Button,
  Checkbox,
  Chip,
  Citation,
  Composer,
  Dialog,
  EmptyState,
  Favicon,
  IconButton,
  Kbd,
  ListRow,
  LoadingLabel,
  Menu,
  MenuGroupLabel,
  MenuItem,
  MenuSeparator,
  Modal,
  NavItem,
  NavSection,
  Popover,
  PopoverSurface,
  ProgressBar,
  Radio,
  Segmented,
  Select,
  SettingRow,
  SettingsSection,
  SidebarNav,
  Skeleton,
  Slider,
  SourceCard,
  Spinner,
  StatusPill,
  Stepper,
  Tabs,
  TextInput,
  Toast,
  Toggle,
  ToggleButton,
  Tooltip,
  TooltipSurface,
  StreamingCaret,
} from "../src/index";
import { ButtonStates, Cell, FORCED, Group, MENU, OVERLAY, RING, STATES } from "./layout";

export function Board() {
  const [tab, setTab] = useState("answer");
  const [seg, setSeg] = useState("search");
  const [seg2, setSeg2] = useState("comfortable");
  const [typed, setTyped] = useState("");
  const [modal, setModal] = useState(false);
  const langOptions = [
    { value: "en", label: "English" },
    { value: "de", label: "Deutsch" },
  ];
  const accessOptions = [
    { value: "view", label: "Can view" },
    { value: "edit", label: "Can edit" },
  ];
  const selectOptions = [
    { value: "default", label: "Default" },
    { value: "compact", label: "Compact" },
    { value: "wide", label: "Wide" },
  ];
  return (
    <>
      <ButtonStates name="primary" variant="primary" label="Send" icon="arrow-narrow-up" />
      <ButtonStates name="secondary" variant="secondary" label="Share" icon="share" />
      <ButtonStates name="ghost" variant="ghost" label="Rewrite" icon="refresh" />
      <ButtonStates name="danger" variant="danger" label="Delete" />

      <Group title="Icon button (32 · 28 · 24) and round 36">
        {STATES.map((s) => (
          <Cell key={s} id={`icon-button-${s}`} bleed={s === "focus" ? RING : undefined}>
            <IconButton name="dots" label="More" {...FORCED[s]} />
          </Cell>
        ))}
        <Cell id="icon-button-28">
          <IconButton name="dots" label="More" size={28} />
        </Cell>
        <Cell id="icon-button-24">
          <IconButton name="dots" label="More" size={24} />
        </Cell>
        <Cell id="icon-button-round-36">
          <IconButton name="plus" label="Add" round />
        </Cell>
      </Group>

      <Group title="Toggle button">
        <Cell id="toggle-button-off">
          <ToggleButton pressed={false} iconLeft="layout-sidebar-right">
            Sources
          </ToggleButton>
        </Cell>
        <Cell id="toggle-button-hover">
          <ToggleButton pressed={false} iconLeft="layout-sidebar-right" className="is-hover">
            Sources
          </ToggleButton>
        </Cell>
        <Cell id="toggle-button-on">
          <ToggleButton pressed iconLeft="layout-sidebar-right">
            Sources
          </ToggleButton>
        </Cell>
        <Cell id="toggle-button-on-focus" bleed={RING}>
          <ToggleButton pressed iconLeft="layout-sidebar-right" className="is-focus">
            Sources
          </ToggleButton>
        </Cell>
      </Group>

      <Group title="Text input">
        <Cell id="text-input-rest">
          <TextInput icon="mail" placeholder="you@example.com" style={{ width: 240 }} />
        </Cell>
        <Cell id="text-input-hover">
          <TextInput icon="mail" placeholder="you@example.com" frameClassName="is-hover" style={{ width: 240 }} />
        </Cell>
        <Cell id="text-input-focus">
          <TextInput icon="mail" placeholder="you@example.com" frameClassName="is-focus" style={{ width: 240 }} />
        </Cell>
        <Cell id="text-input-filled">
          <TextInput icon="mail" defaultValue="nour@example.com" style={{ width: 240 }} />
        </Cell>
        <Cell id="text-input-error">
          <TextInput icon="mail" defaultValue="nour@" error="Enter a full email address" style={{ width: 240 }} />
        </Cell>
        <Cell id="text-input-disabled">
          <TextInput icon="mail" placeholder="you@example.com" disabled style={{ width: 240 }} />
        </Cell>
      </Group>

      <Group title="Toggle 32x20 · checkbox · radio">
        <Cell id="toggle-off">
          <Toggle board aria-label="Off" />
        </Cell>
        <Cell id="toggle-on">
          <Toggle board defaultChecked aria-label="On" />
        </Cell>
        <Cell id="toggle-disabled-on">
          <Toggle board defaultChecked disabled aria-label="Disabled on" />
        </Cell>
        <Cell id="pattern-settings-page-toggle-off">
          <Toggle aria-label="Off" />
        </Cell>
        <Cell id="pattern-settings-page-toggle-on">
          <Toggle defaultChecked aria-label="On" />
        </Cell>
        <Cell id="toggle-screen-focus" bleed={RING}>
          <Toggle defaultChecked className="is-focus" aria-label="Focus" />
        </Cell>
        <Cell id="checkbox-off">
          <Checkbox aria-label="Off" />
        </Cell>
        <Cell id="checkbox-on">
          <Checkbox defaultChecked aria-label="On" />
        </Cell>
        <Cell id="checkbox-mixed">
          <Checkbox indeterminate aria-label="Mixed" />
        </Cell>
        <Cell id="checkbox-label">
          <Checkbox label="Skip code blocks" defaultChecked />
        </Cell>
        <Cell id="radio-off">
          <Radio name={"r1"} aria-label="Off" />
        </Cell>
        <Cell id="radio-on">
          <Radio name={"r2"} defaultChecked aria-label="On" />
        </Cell>
        <Cell id="radio-disabled-on">
          <Radio name={"r3"} defaultChecked disabled aria-label="Disabled on" />
        </Cell>
        <Cell id="radio-label">
          <Radio name={"r4"} defaultChecked label="Neural voice" />
        </Cell>
      </Group>

      <Group title="Citation pill">
        <Cell id="citation-pill-rest">
          <Citation label="neep.org" count="+1" />
        </Cell>
        <Cell id="citation-pill-hover">
          <Citation label="neep.org" count="+1" className="is-hover" />
        </Cell>
        <Cell id="citation-pill-active">
          <Citation label="neep.org" active />
        </Cell>
        <Cell id="citation-pill-focus" bleed={RING}>
          <Citation label="neep.org" className="is-focus" />
        </Cell>
        <Cell id="citation-pill-file-quote">
          <Citation label="Quote p.2" file />
        </Cell>
        <Cell id="citation-pill-removed">
          <Citation label="neep.org" removed />
        </Cell>
      </Group>

      <Group title="Status pill">
        <Cell id="status-pill-indexed">
          <StatusPill tone="green" icon="check">
            Indexed
          </StatusPill>
        </Cell>
        <Cell id="status-pill-indexing">
          <StatusPill tone="blue" icon="loader-2">
            Indexing · 60%
          </StatusPill>
        </Cell>
        <Cell id="status-pill-needs-setup">
          <StatusPill tone="orange" icon="alert-triangle">
            Needs setup
          </StatusPill>
        </Cell>
        <Cell id="status-pill-failed">
          <StatusPill tone="red" icon="alert-circle">
            Failed
          </StatusPill>
        </Cell>
        <Cell id="status-pill-incognito">
          <StatusPill tone="purple" icon="eye-off">
            Incognito
          </StatusPill>
        </Cell>
        <Cell id="status-pill-neutral">
          <StatusPill>Neutral</StatusPill>
        </Cell>
        <Cell id="pattern-badge-counter-chip-badge">
          <Badge>1</Badge>
        </Cell>
        <Cell id="pattern-badge-counter-chip-chip">
          <Chip icon="search">bitwarden security audit 2025</Chip>
        </Cell>
      </Group>

      <Group title="Source card">
        <Cell id="source-card-rest">
          <SourceCard title="Cold-climate air-source heat pump field performance" domain="nrel.gov" index={2} />
        </Cell>
        <Cell id="source-card-hover">
          <SourceCard title="Cold-climate air-source heat pump field performance" domain="nrel.gov" index={2} className="is-hover" />
        </Cell>
        <Cell id="source-card-cited-now">
          <SourceCard title="Cold-climate air-source heat pump field performance" domain="nrel.gov" index={2} cited />
        </Cell>
        <Cell id="source-card-excluded">
          <SourceCard title="Cold-climate air-source heat pump field performance" domain="nrel.gov" index={2} excluded />
        </Cell>
      </Group>

      <Group title="Composer">
        <Cell id="composer-rest">
          <Composer />
        </Cell>
        <Cell id="composer-focus">
          <Composer className="is-focus" />
        </Cell>
        <Cell id="composer-typing">
          <Composer className="is-focus" value="Is a heat pump worth it?" onChange={() => {}} />
        </Cell>
        <Cell id="composer-streaming">
          <Composer streaming />
        </Cell>
        <Cell id="composer-disabled">
          <Composer disabled />
        </Cell>
        <Cell id="composer-live">
          <Composer value={typed} onChange={setTyped} />
        </Cell>
      </Group>

      <Group title="Menu item">
        {(
          [
            ["rest", {}],
            ["hover", { className: "is-hover" }],
            ["selected", { selected: true, className: "is-hover" }],
            ["destructive", { destructive: true, icon: "trash" as const }],
            ["with-shortcut", { shortcut: "F2" }],
            ["disabled", { disabled: true }],
          ] as const
        ).map(([s, p]) => (
          <Cell key={s} id={`menu-item-${s}`}>
            <Menu style={{ width: 220 }}>
              <MenuItem icon="pencil" {...p}>
                {s === "destructive" ? "Delete" : "Rename"}
              </MenuItem>
            </Menu>
          </Cell>
        ))}
      </Group>

      <Group title="Tabs and segmented">
        <Cell id="tabs-underline-default">
          <Tabs
            label="Answer views"
            value={tab}
            onChange={setTab}
            items={[
              { id: "answer", label: "Answer" },
              { id: "sources", label: "Sources · 14" },
              { id: "images", label: "Images" },
            ]}
          />
        </Cell>
        <Cell id="segmented-pill-default">
          <Segmented
            variant="pill"
            label="Mode"
            value={seg}
            onChange={setSeg}
            items={[
              { id: "search", label: "Search", icon: "search" },
              { id: "research", label: "Research", icon: "list-search" },
              { id: "deep", label: "Deep research", icon: "telescope" },
            ]}
          />
        </Cell>
        <Cell id="segmented-settings-default">
          <Segmented
            label="Density"
            value={seg2}
            onChange={setSeg2}
            items={[
              { id: "comfortable", label: "Comfortable" },
              { id: "compact", label: "Compact" },
            ]}
          />
        </Cell>
      </Group>

      <Group title="Toast · tooltip">
        <Cell id="toast-neutral" bleed={OVERLAY}>
          <Toast>Link copied as Markdown</Toast>
        </Cell>
        <Cell id="toast-with-action" bleed={OVERLAY}>
          <Toast icon="trash" action={{ label: "Undo" }}>
            2 threads moved to Trash
          </Toast>
        </Cell>
        <Cell id="toast-success" bleed={OVERLAY}>
          <Toast tone="success" action={{ label: "Download" }}>
            Export ready
          </Toast>
        </Cell>
        <Cell id="toast-error" bleed={OVERLAY}>
          <Toast tone="error" action={{ label: "Retry" }}>
            Couldn’t save memory
          </Toast>
        </Cell>
        <Cell id="tooltip-default">
          <TooltipSurface text="Open sources" shortcut="Ctrl J" />
        </Cell>
        <Cell id="tooltip-live">
          <Tooltip text="Open sources" shortcut="Ctrl J">
            <IconButton name="layout-sidebar-right" label="Sources" />
          </Tooltip>
        </Cell>
      </Group>

      <Group title="Loading">
        <Cell id="loading-skeleton-answer">
          <Skeleton />
        </Cell>
        <Cell id="loading-skeleton-shimmer">
          <Skeleton shimmer />
        </Cell>
        <Cell id="loading-spinner-label">
          <LoadingLabel>Reading 14 sources</LoadingLabel>
        </Cell>
        <Cell id="loading-progress-bar">
          <ProgressBar value={58.3333} label="Indexing" />
        </Cell>
        <Cell id="loading-progress-indeterminate">
          <ProgressBar label="Working" />
        </Cell>
        <Cell id="loading-streaming-caret">
          <span style={{ font: "400 15px/18px Inter, system-ui" }}>
            so bills usu
            <StreamingCaret />
          </span>
        </Cell>
        <Cell id="spinner">
          <Spinner size={20} />
        </Cell>
        <Cell id="slider">
          <Slider defaultValue={40} aria-label="Speed" />
        </Cell>
      </Group>

      <Group title="Avatar · keyboard key · favicon">
        <Cell id="avatar-sizes-32-28-22">
          <span className="g-inline" style={{ gap: 10 }}>
            <Avatar name="N" size={32} tone="purple" />
            <Avatar name="S" size={28} tone="blue" />
            <Avatar name="L" size={22} tone="orange" />
          </span>
        </Cell>
        <Cell id="keyboard-key-default">
          <span className="lm-kbds">
            <Kbd>Ctrl</Kbd>
            <Kbd>Shift</Kbd>
            <Kbd>P</Kbd>
          </span>
        </Cell>
        <Cell id="favicon-sizes-14-16-24">
          <span className="g-inline" style={{ gap: 8 }}>
            <Favicon name="N" size={14} tone="green" />
            <Favicon name="E" size={16} tone="blue" />
            <Favicon name="r" size={24} tone="red" />
          </span>
        </Cell>
      </Group>

      <Group title="Select · menu · context menu">
        <Cell id="pattern-select-dropdown-select">
          <Select label="Language" options={langOptions} defaultValue="en" />
        </Cell>
        <Cell id="pattern-select-dropdown-select-small">
          <Select label="Access" size="sm" options={accessOptions} defaultValue="edit" />
        </Cell>
        <Cell id="select-open" bleed={OVERLAY}>
          <div style={{ width: 200, height: 160 }}>
            {/* Radix Select is modal while open, so the gallery shows its menu surface statically. */}
            <Menu overlay style={{ width: 200 }}>
              {selectOptions.map((o) => (
                <MenuItem key={o.value} selected={o.value === "light"} className={o.value === "light" ? "is-hover" : undefined}>
                  {o.label}
                </MenuItem>
              ))}
            </Menu>
          </div>
        </Cell>
        <Cell id="pattern-select-dropdown-menu" bleed={OVERLAY}>
          <Menu overlay style={{ width: 200 }}>
            <MenuItem icon="eye" selected className="is-hover">
              Can view
            </MenuItem>
            <MenuItem icon="pencil">Can edit</MenuItem>
            <MenuSeparator />
            <MenuItem icon="user-off" destructive>
              Remove from Space
            </MenuItem>
          </Menu>
        </Cell>
        <Cell id="menu-context" bleed={MENU}>
          <Menu large style={{ width: 240 }}>
            <MenuGroupLabel>Voice</MenuGroupLabel>
            <MenuItem icon="player-play" shortcut="Alt+S">
              Read aloud
            </MenuItem>
            <MenuItem icon="copy" shortcut="Ctrl+C">
              Copy text
            </MenuItem>
            <MenuSeparator />
            <MenuItem icon="settings">Settings</MenuItem>
            <MenuItem icon="trash" destructive>
              Delete
            </MenuItem>
          </Menu>
        </Cell>
      </Group>

      <Group title="Popover · dialog · banner">
        <Cell id="pattern-popover-publish-popover" bleed={OVERLAY}>
          <PopoverSurface title="Publish page" style={{ width: 320 }}>
            <TextInput size="sm" defaultValue="lumen.app/p/ heat-pumps-cold" aria-label="Link" />
            {["Allow search engines", "Show sources panel", "Let readers ask follow-ups"].map((t, i) => (
              <div key={t} className="g-switchrow">
                <span>{t}</span>
                <Toggle board defaultChecked={i > 0} aria-label={t} />
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <Button variant="primary">Publish</Button>
            </div>
          </PopoverSurface>
        </Cell>
        <Cell id="popover-live">
          <div style={{ height: 40 }}>
            <Popover title="Voice" trigger={(p) => <Button {...p}>Voice</Button>}>
              Pick a voice.
            </Popover>
          </div>
        </Cell>
        <Cell id="pattern-modal-dialog-confirm" bleed={OVERLAY}>
          <Dialog
            title="Delete forever?"
            onClose={() => {}}
            footer={
              <>
                <Button variant="ghost" size="lg">
                  Cancel
                </Button>
                <Button variant="danger" size="lg">
                  Delete forever
                </Button>
              </>
            }
          >
            “Which rebates can we combine in 2026?” and its 11 sources, notes and shared link will be removed. This can’t be undone.
          </Dialog>
        </Cell>
        <Cell id="modal-live">
          <Button onClick={() => setModal(true)}>Open modal</Button>
          <Modal
            open={modal}
            onClose={() => setModal(false)}
            title="Rename thread"
            footer={
              <>
                <Button data-autofocus onClick={() => setModal(false)}>
                  Cancel
                </Button>
                <Button variant="primary" size="lg" onClick={() => setModal(false)}>
                  Save
                </Button>
              </>
            }
          >
            <TextInput defaultValue="Heat pumps" aria-label="Name" />
          </Modal>
        </Cell>
        <Cell id="pattern-banner-warning">
          <div style={{ width: 720 }}>
            <Banner
              tone="warning"
              action={
                <span className="lm-banner__actions">
                  <Button variant="ghost" size="sm">
                    Undo
                  </Button>
                  <Button variant="primary" size="sm" iconLeft="refresh">
                    Regenerate without it
                  </Button>
                </span>
              }
            >
              1 source removed. Parts of this answer relied on it.
            </Banner>
          </div>
        </Cell>
        <Cell id="pattern-banner-limit-error">
          <div style={{ width: 720 }}>
            <Banner
              tone="error"
              icon="wallet"
              title="Monthly limit reached · $30.00 of $30"
              action={
                <span className="lm-banner__actions">
                  <Button size="sm">Use local model</Button>
                  <Button variant="primary" size="sm">
                    Raise limit
                  </Button>
                </span>
              }
            >
              Resets Oct 1. Local models still work.
            </Banner>
          </div>
        </Cell>
        <Cell id="pattern-banner-import-info">
          <div style={{ width: 820 }}>
            <Banner icon="file-import" action={<Button size="sm">Review and import</Button>}>
              Found 5 servers in Claude Desktop and VS Code configs on this computer.
            </Banner>
          </div>
        </Cell>
      </Group>

      <Group title="Settings · sidebar · list row · empty state · stepper">
        <Cell id="settings-section">
          <div style={{ width: 640 }}>
            <SettingsSection title="Reading" description="How SpeakKit reads pages aloud.">
              <SettingRow label="Highlight words" description="Follow the spoken word on the page." control={<Toggle defaultChecked aria-label="Highlight words" />} />
              <SettingRow label="Theme" description="Match the system or force one." control={<Select label="Theme" options={selectOptions} />} />
              <SettingRow
                label="Density"
                control={
                  <Segmented
                    label="Density"
                    value={seg2}
                    onChange={setSeg2}
                    items={[
                      { id: "comfortable", label: "Comfortable" },
                      { id: "compact", label: "Compact" },
                    ]}
                  />
                }
              />
            </SettingsSection>
          </div>
        </Cell>
        <Cell id="sidebar-nav">
          <SidebarNav label="Settings">
            <NavItem href="#a" icon="settings" selected>
              General
            </NavItem>
            <NavItem href="#b" icon="volume">
              Voices
            </NavItem>
            <NavItem href="#c" icon="keyboard" badge="2">
              Shortcuts
            </NavItem>
            <NavSection action={<span>View all</span>}>Recent</NavSection>
            <NavItem href="#d" className="is-hover lm-nav__item--thread">
              Reading list
            </NavItem>
          </SidebarNav>
        </Cell>
        <Cell id="pattern-list-row-thread-row">
          <div style={{ width: 760 }}>
            <ListRow
              icon="list-search"
              title="Is a heat pump worth it in a cold climate?"
              preview="Yes, for most homes. Current cold-climate models keep producing useful heat well below freezing..."
              meta="Today"
            />
          </div>
        </Cell>
        <Cell id="empty-state">
          <div style={{ width: 680 }}>
            <EmptyState icon="file-text" title="Nothing in your library yet" primary={{ label: "Read a page" }} secondary={{ label: "Import" }}>
              Pages you read aloud show up here so you can pick up where you left off.
            </EmptyState>
          </div>
        </Cell>
        <Cell id="stepper-web">
          <Stepper steps={["Account", "Voice", "Done"]} current={1} />
        </Cell>
      </Group>
    </>
  );
}
