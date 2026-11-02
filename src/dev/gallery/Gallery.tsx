import { useEffect, useState } from "react";
import {
  AlertTriangle, Bell, Check, CheckCircle2, CircleAlert, CloudUpload, FolderOpen, FolderSearch, GitBranch,
  GitCommitHorizontal, Info, Save, ShieldCheck, Star, Trash2, X,
} from "lucide-react";
import { THEME_IDS, type ThemeId } from "../../shared/theme";
import {
  Dialog, DialogBanner, DialogFacts, LoadingBar, LoadingPlaceholder, RefreshIconButton, SearchBox,
  TextPlaceholder, ToastProvider, useToast,
} from "../../shared/ui";
import { ToggleSwitch } from "../../shared/ui/toggleSwitch";
import { StatusBarSpecimen } from "./StatusBarSpecimen";

import { DiffResultView } from "../../features/changes/DiffResultView";
import type { FileDiff } from "../../features/changes/domain";
import { en } from "../../i18n/en";

const DIFF_SPECIMEN: FileDiff = {
  kind: "text", path: "example.ts", originalPath: null, change: "changed", truncated: false,
  hunks: [{ header: "@@ -1,5 +1,6 @@", oldStart: 1, oldLines: 5, newStart: 1, newLines: 6, lines: [
    { kind: "context", content: "export function saveVersion() {", oldLineNumber: 1, newLineNumber: 1 },
    { kind: "deletion", content: "\tconst offset = -1;  ", oldLineNumber: 2, newLineNumber: null },
    { kind: "deletion", content: "", oldLineNumber: 3, newLineNumber: null },
    { kind: "addition", content: "  const offset = +1;", oldLineNumber: null, newLineNumber: 2 },
    { kind: "addition", content: "", oldLineNumber: null, newLineNumber: 3 },
    { kind: "addition", content: '  const message = "Save the versions on this branch, keeping unsaved work available and asking before publishing anything to the shared project.";', oldLineNumber: null, newLineNumber: 4 },
    { kind: "context", content: "  return offset;", oldLineNumber: 4, newLineNumber: 5 },
    { kind: "context", content: "}", oldLineNumber: 5, newLineNumber: 6 },
  ] }],
};

function DiffMarks(): React.JSX.Element {
  const [target, setTarget] = useState({ index: 0, token: 0 });
  return <Section id="diffs" title="Diff marks" lead="The real Changes and History renderer beside its Markdown equivalent.">
    <div className="gallery__row"><button className="secondary-button" type="button" onClick={() => setTarget(previous => ({ index: 0, token: previous.token + 1 }))}>Jump to change</button></div>
    <Specimen title="Unified text"><div className="gallery__diff"><DiffResultView diff={DIFF_SPECIMEN} hunkTarget={target} viewMode="unified" t={en} /></div></Specimen>
    <Specimen title="Split text"><div className="gallery__diff"><DiffResultView diff={DIFF_SPECIMEN} hunkTarget={target} viewMode="split" t={en} /></div></Specimen>
    <Specimen title="Rendered Markdown"><div className="markdown-preview__document"><p className="markdown-preview__removed">The old explanation.</p><p className="markdown-preview__added">The new explanation, with a solid bar and the same soft tint.</p></div></Specimen>
  </Section>;
}

const SECTIONS = [
  ["tokens", "Tokens"],
  ["diffs", "Diff marks"],
  ["controls", "Controls"],
  ["strip", "Status bar"],
  ["lists", "Rows and menus"],
  ["states", "Empty, loading, error"],
  ["dialogs", "Dialogs"],
  ["notices", "Notices and toasts"],
] as const;

const readTheme = (): ThemeId => {
  const requested = new URLSearchParams(window.location.search).get("theme");
  return (THEME_IDS as readonly string[]).includes(requested ?? "") ? (requested as ThemeId) : "gitodile-light";
};

function Specimen({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="gallery__specimen">
      <h3>{title}</h3>
      {children}
    </div>
  );
}

function Section({ id, title, lead, children }: { id: string; title: string; lead: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <section className="gallery__section" id={id}>
      <h2>{title}</h2>
      <p>{lead}</p>
      <div className="gallery__grid">{children}</div>
    </section>
  );
}

function Tokens(): React.JSX.Element {
  const surfaces = ["--surface-app", "--surface-panel", "--surface-card", "--surface-raised", "--surface-control", "--surface-code"];
  const inks = ["--text-primary-color", "--text-secondary-color", "--accent-primary", "--status-success", "--status-warning", "--status-danger", "--tone-local", "--tone-remote"];
  const tints = ["hover", "selected", "fill", "fill-hover", "halo", "halo-focus", "edge"];
  const type = ["hero", "display", "title", "subtitle", "lead", "body", "label", "caption", "micro"];
  return (
    <Section id="tokens" title="Tokens" lead="The values every surface is built from (DESIGN.md § Design tokens).">
      <Specimen title="Surfaces">
        <div className="gallery__row">
          {surfaces.map((token) => (
            <span className="gallery__swatch" key={token}><span style={{ background: `var(${token})` }} />{token.slice(2)}</span>
          ))}
        </div>
      </Specimen>
      <Specimen title="Ink, accent and status">
        <div className="gallery__row">
          {inks.map((token) => (
            <span className="gallery__swatch" key={token}><span style={{ background: `var(${token})` }} />{token.slice(2)}</span>
          ))}
        </div>
      </Specimen>
      <Specimen title="Tints of the accent and of a warning">
        <div className="gallery__scale">
          {tints.map((tint) => (
            <div key={tint} style={{ display: "contents" }}>
              <code>--tint-{tint}</code>
              <div className="gallery__row" style={{ flexWrap: "nowrap" }}>
                <span className="gallery__tint" style={{ flex: 1, background: `color-mix(in srgb, var(--accent-primary) var(--tint-${tint}), transparent)` }} />
                <span className="gallery__tint" style={{ flex: 1, background: `color-mix(in srgb, var(--status-warning) var(--tint-${tint}), transparent)` }} />
              </div>
            </div>
          ))}
        </div>
      </Specimen>
      <Specimen title="Type scale">
        <div className="gallery__scale">
          {type.map((step) => (
            <div key={step} style={{ display: "contents" }}>
              <code>--text-{step}</code>
              <span style={{ fontSize: `var(--text-${step})`, lineHeight: "var(--leading-tight)" }}>Save a version</span>
            </div>
          ))}
        </div>
      </Specimen>
      <Specimen title="Spacing">
        <div className="gallery__scale">
          {[1, 2, 3, 4, 5, 6].map((step) => (
            <div key={step} style={{ display: "contents" }}>
              <code>--space-{step}</code>
              <span className="gallery__space" style={{ width: `var(--space-${step})` }} />
            </div>
          ))}
        </div>
      </Specimen>
      <Specimen title="Icon roles">
        <div className="gallery__row">
          {["badge", "meta", "row", "control", "nav", "tile"].map((role) => (
            <span key={role} className="gallery__swatch" style={{ width: 72 }}>
              <span className="gallery__icon-box" style={{ height: 40 }}>
                <GitBranch style={{ width: `var(--icon-${role})`, height: `var(--icon-${role})` }} />
              </span>
              {role}
            </span>
          ))}
        </div>
      </Specimen>
    </Section>
  );
}

function Controls(): React.JSX.Element {
  const [query, setQuery] = useState("main");
  const [checked, setChecked] = useState(true);
  const [on, setOn] = useState(true);
  const [choice, setChoice] = useState<"save" | "branch">("save");
  const [segment, setSegment] = useState("15");
  return (
    <Section id="controls" title="Controls" lead="Buttons, fields and choices at the house size (DESIGN.md § Size and § Shape).">
      <Specimen title="Buttons">
        <div className="gallery__row">
          <button type="button" className="primary-button"><Save aria-hidden="true" />Save version</button>
          <button type="button" className="secondary-button">Cancel</button>
          <button type="button" className="danger-button"><Trash2 aria-hidden="true" />Discard</button>
          <button type="button" className="ghost-button">Not now</button>
        </div>
        <div className="gallery__row">
          <button type="button" className="primary-button primary-button--sm">Publish</button>
          <button type="button" className="primary-button" disabled>Disabled</button>
          <button type="button" className="secondary-button" disabled>Disabled</button>
        </div>
      </Specimen>
      <Specimen title="Icon buttons by where they sit">
        <div className="gallery__row">
          {([["chip", "--icon-button-chip"], ["inline", "--icon-button-inline"], ["attached", "--icon-button-attached"], ["row", "--control-height-sm"], ["chrome", "--icon-button-chrome"]] as const).map(([name, token]) => (
            <span key={name} className="gallery__swatch" style={{ width: 64 }}>
              <span className="gallery__icon-box" style={{ width: `var(${token})`, height: `var(${token})` }}><X style={{ width: "var(--icon-row)", height: "var(--icon-row)" }} /></span>
              {name}
            </span>
          ))}
        </div>
        <RefreshIconButton label="Refresh" busyLabel="Refreshing" busy={false} onClick={() => undefined} />
      </Specimen>
      <Specimen title="Control heights">
        <div className="gallery__scale">
          {(["xs", "compact", "sm", "md"] as const).map((tier) => (
            <div key={tier} style={{ display: "contents" }}>
              <code>--control-height-{tier}</code>
              <span className="gallery__icon-box" style={{ height: `var(--control-height-${tier})`, borderRadius: "var(--radius-pill)" }}>Save version</span>
            </div>
          ))}
        </div>
      </Specimen>
      <Specimen title="Fields">
        <SearchBox value={query} placeholder="Find a branch" ariaLabel="Find a branch" clearLabel="Clear" onChange={setQuery} />
        <label className="text-field">Branch name<input defaultValue="feature/login" /></label>
        <label className="text-field">Disabled<input defaultValue="main" disabled /></label>
      </Specimen>
      <Specimen title="Checkbox, switch and segments">
        <label className="app-dialog__check">
          <input className="app-checkbox" type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} />
          Switch to it now
        </label>
        <ToggleSwitch label="Keep project screens up to date" checked={on} onChange={setOn} />
        <div className="segmented-control" role="radiogroup" aria-label="Interval">
          {["Never", "15", "30"].map((value) => (
            <button key={value} type="button" role="radio" aria-checked={segment === value}
              className={`segmented-control__option${segment === value ? " segmented-control__option--active" : ""}`}
              onClick={() => setSegment(value)}>{value}</button>
          ))}
        </div>
      </Specimen>
      <Specimen title="Choice list">
        <div className="choice-list" role="radiogroup" aria-label="Before switching">
          {([["save", "Save them first", "A version keeps them on this branch."], ["branch", "Take them along", "They move to the new branch."]] as const).map(([value, label, note]) => (
            <button key={value} type="button" role="radio" aria-checked={choice === value}
              className={`choice-list__option${choice === value ? " choice-list__option--active" : ""}`}
              onClick={() => setChoice(value)}>
              <span className="choice-list__label">{label}</span>
              <span className="choice-list__description">{note}</span>
            </button>
          ))}
        </div>
      </Specimen>
      <Specimen title="Chips">
        <div className="filter-chips">
          <span className="filter-chip"><span className="filter-chip__label">Author: Ana</span>
            <button type="button" className="filter-chip__remove" aria-label="Remove"><X aria-hidden="true" /></button></span>
          <span className="filter-chip filter-chip--quiet"><span className="filter-chip__label">Last 30 days</span></span>
        </div>
        <div className="gallery__row">
          <span className="timeline-chip timeline-chip--local">Only on this computer</span>
          <span className="timeline-chip timeline-chip--published">Published</span>
        </div>
      </Specimen>
    </Section>
  );
}

function Strip(): React.JSX.Element {
  return (
    <Section id="strip" title="Status bar" lead="The strip at three window widths: the project and branch names must stay readable.">
      {[1280, 1100, 960].map((width) => (
        <div key={width} style={{ gridColumn: "1 / -1", overflowX: "auto" }}>
          <span className="gallery__caption">{width}px window</span>
          <StatusBarSpecimen windowWidth={width} />
        </div>
      ))}
    </Section>
  );
}

function Lists(): React.JSX.Element {
  return (
    <Section id="lists" title="Rows and menus" lead="What floats, and the rows inside it (DESIGN.md § Dialogs, popovers and menus).">
      <Specimen title="Menu">
        <div className="app-menu gallery__float" role="menu" aria-label="Project">
          <button type="button" role="menuitem" className="app-menu__item"><FolderOpen aria-hidden="true" />Open project…</button>
          <button type="button" role="menuitem" className="app-menu__item app-menu__item--selected"><Check aria-hidden="true" />Selected row</button>
          <div className="app-menu__divider" role="separator" />
          <button type="button" role="menuitem" className="app-menu__item" disabled><Star aria-hidden="true" />Disabled row</button>
        </div>
      </Specimen>
      <Specimen title="Empty line in a panel and in a menu">
        <div className="gallery__list"><p className="empty-line">No files match this filter</p></div>
        <div className="app-menu gallery__float"><p className="empty-line empty-line--menu">No branches match</p></div>
      </Specimen>
    </Section>
  );
}

function States(): React.JSX.Element {
  return (
    <Section id="states" title="Empty, loading, error" lead="One block and one line for every screen (DESIGN.md § Core screens).">
      <Specimen title="Empty">
        <div className="empty-state">
          <div className="empty-state__icon" aria-hidden="true"><GitCommitHorizontal /></div>
          <h2>No versions yet</h2>
          <p>Save a version and it will appear here.</p>
          <div className="empty-state__actions"><button type="button" className="primary-button">Save version</button></div>
        </div>
      </Specimen>
      <Specimen title="Success">
        <div className="empty-state empty-state--success">
          <div className="empty-state__icon" aria-hidden="true"><CheckCircle2 /></div>
          <h2>Everything is saved</h2>
          <p>Nothing has changed since your last version.</p>
        </div>
      </Specimen>
      <Specimen title="Error">
        <div className="empty-state empty-state--error" role="alert">
          <div className="empty-state__icon" aria-hidden="true"><CircleAlert /></div>
          <h2>This view ran into a problem</h2>
          <p>Your project was not touched.</p>
          <div className="empty-state__actions"><button type="button" className="secondary-button">Try again</button></div>
        </div>
      </Specimen>
      <Specimen title="Compact, inside something that floats">
        <div className="app-menu gallery__float" style={{ maxWidth: 360 }}>
          <div className="empty-state empty-state--compact">
            <span className="empty-state__icon"><FolderSearch aria-hidden="true" /></span>
            <p>Find the projects this account can reach.</p>
            <button type="button" className="secondary-button">Find projects</button>
          </div>
        </div>
      </Specimen>
      <Specimen title="Loading: the shape of what is coming">
        <LoadingPlaceholder label="Loading versions">
          <div style={{ display: "grid", gap: "var(--space-3)" }}>
            <TextPlaceholder width="60%" /><TextPlaceholder width="85%" /><TextPlaceholder width="40%" />
          </div>
        </LoadingPlaceholder>
      </Specimen>
      <Specimen title="Loading: shape unknown">
        <LoadingBar label="Checking the remote" showLabel />
      </Specimen>
    </Section>
  );
}

function Dialogs(): React.JSX.Element {
  return (
    <Section id="dialogs" title="Dialogs" lead="One shell, three sizes, the glyph in the tone of what it handles (DESIGN.md § Dialogs).">
      <div className="gallery__stage" style={{ gridColumn: "1 / -1" }}>
        <Dialog size="s" title="Delete this branch?" titleId="gallery-delete" icon={<Trash2 />} tone="danger" onClose={() => undefined}>
          <p className="app-dialog__text">“feature/login” goes away from this computer.</p>
          <DialogFacts facts={[
            { icon: <GitBranch />, text: "Its versions stay in the project's history." },
            { icon: <ShieldCheck />, text: "A copy is kept, so you can undo it.", safe: true },
          ]} />
          <details className="app-dialog__details">
            <summary>Technical details</summary>
            <pre>Reference: refs/heads/feature/login</pre>
          </details>
          <div className="dialog-actions">
            <button type="button" className="secondary-button">Cancel</button>
            <button type="button" className="danger-button"><Trash2 aria-hidden="true" />Delete branch</button>
          </div>
        </Dialog>
      </div>
      <div className="gallery__stage" style={{ gridColumn: "1 / -1" }}>
        <Dialog size="m" title="Publish changes" titleId="gallery-publish" subtitle="Send your saved versions to GitHub." icon={<CloudUpload />} tone="local" onClose={() => undefined}>
          <DialogBanner tone="warning" icon={<AlertTriangle />}>Two versions on the remote are not here yet.</DialogBanner>
          <DialogBanner tone="info" icon={<Info />}>Only you will see them until you share the branch.</DialogBanner>
          <div className="dialog-actions">
            <button type="button" className="secondary-button">Cancel</button>
            <button type="button" className="primary-button"><CloudUpload aria-hidden="true" />Publish changes</button>
          </div>
        </Dialog>
      </div>
    </Section>
  );
}

function Notices(): React.JSX.Element {
  const showToast = useToast();
  return (
    <Section id="notices" title="Notices and toasts" lead="Conditions inside a dialog, and results with no next step.">
      <Specimen title="Banners">
        <DialogBanner tone="danger" icon={<CircleAlert />} role="alert">Couldn't read the branches. Try again.</DialogBanner>
        <DialogBanner tone="warning" icon={<AlertTriangle />}>Line endings will change in 3 files.</DialogBanner>
        <DialogBanner tone="info" icon={<Info />}>Hooks run before every save.</DialogBanner>
      </Specimen>
      <Specimen title="Toast">
        <div className="gallery__row">
          <button type="button" className="secondary-button" onClick={() => showToast({ message: "Branch switched", icon: <GitBranch /> })}>Show a toast</button>
          <button type="button" className="secondary-button" onClick={() => showToast({ message: "Changes discarded", icon: <Trash2 />, action: { label: "Undo", onAction: () => undefined } })}>With an action</button>
        </div>
        <span className="gallery__caption"><Bell aria-hidden="true" style={{ width: "var(--icon-meta)", height: "var(--icon-meta)" }} /> Toasts appear above the window's foot.</span>
      </Specimen>
    </Section>
  );
}

export function Gallery(): React.JSX.Element {
  const [theme, setTheme] = useState<ThemeId>(readTheme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    const url = new URL(window.location.href);
    url.searchParams.set("theme", theme);
    window.history.replaceState(null, "", url);
  }, [theme]);
  return (
    <ToastProvider>
      <main className="gallery">
        <header className="gallery__bar">
          <h1>Style gallery</h1>
          <nav className="gallery__nav" aria-label="Sections">
            {SECTIONS.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}
          </nav>
          <select aria-label="Theme" value={theme} onChange={(event) => setTheme(event.target.value as ThemeId)}>
            {THEME_IDS.map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
        </header>
        <DiffMarks />
        <Tokens />
        <Controls />
        <Strip />
        <Lists />
        <States />
        <Dialogs />
        <Notices />
      </main>
    </ToastProvider>
  );
}
