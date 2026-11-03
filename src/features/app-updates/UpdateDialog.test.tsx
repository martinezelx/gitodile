import React, { useState } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LanguageProvider } from "../../i18n";
import type { AppUpdatesController, AppUpdatesSnapshot } from "./controller";
import { checksOnOpen, finishedDownloadOutOfSight, updateNeedsAttention } from "./domain";
import { updateMenuLabel } from "./translations";
import { AppUpdateRestartDialog, AppUpdateSettingsControl, type SettingsReleaseEntry } from "./UpdateDialog";

const candidate = {
  candidateId: "candidate", version: "0.3.1",
  target: "windows-x86_64" as const, publishedAt: null,
  notes: "Plain <b>text</b>\nhttps://example.invalid/image.png", highlights: [], expectedBytes: null,
};

const installed = { version: "0.3.0" };
const releases: SettingsReleaseEntry[] = [
  { version: "0.3.0", date: "2026-10-01", highlights: [{ id: "work", icon: "list-checks", en: "One Work screen.", es: "Una sola pantalla, Trabajo." }] },
  { version: "0.2.12", date: "2026-09-15", highlights: [{ id: "license", icon: "shield-check", en: "Now free software.", es: "Ahora software libre." }] },
];

function controller(): AppUpdatesController {
  return {
    subscribe: vi.fn(() => () => undefined),
    getSnapshot: vi.fn(), initialize: vi.fn(), setAutomaticEnabled: vi.fn(),
    check: vi.fn(), download: vi.fn(), cancel: vi.fn(), install: vi.fn(), openManualDownload: vi.fn(), dispose: vi.fn(),
  };
}

function snapshotOf(state: AppUpdatesSnapshot["state"]): AppUpdatesSnapshot {
  return { state, startupConfirmation: { kind: "none" }, automaticEnabled: false };
}

function renderRow(
  state: AppUpdatesSnapshot["state"],
  { appController = controller(), setEnabled = vi.fn(), revealWhatsNew = false }: {
    appController?: AppUpdatesController; setEnabled?: (enabled: boolean) => void; revealWhatsNew?: boolean;
  } = {},
) {
  return render(
    <LanguageProvider>
      <button type="button">Elsewhere</button>
      <AppUpdateSettingsControl snapshot={snapshotOf(state)} controller={appController} installed={installed}
        name="GitOdile" enabled={false} setEnabled={setEnabled} releases={releases} revealWhatsNew={revealWhatsNew} />
    </LanguageProvider>,
  );
}

function withSpanish(run: () => Promise<void> | void) {
  return async () => {
    localStorage.setItem("gitodile-language", "es");
    try {
      await run();
    } finally {
      localStorage.removeItem("gitodile-language");
    }
  };
}

afterEach(cleanup);

describe("where an update is reached", () => {
  it.each([
    ["idle", { kind: "idle" }, true, false, "Check for updates"],
    ["current", { kind: "current", checkedAt: "2026-10-01T10:00:00Z" }, true, false, "Check for updates"],
    ["a failed check", { kind: "failed", error: { code: "offline", stage: "check", retryable: true } }, true, false, "Check for updates"],
    ["a development build", { kind: "unavailable", error: { code: "not_configured", stage: "check", retryable: false } }, false, false, "Check for updates"],
    ["checking", { kind: "checking", operationId: "op", source: "manual" }, false, false, "Check for updates"],
    ["available", { kind: "available", candidate }, false, true, "Update to 0.3.1…"],
    ["downloading", { kind: "downloading", candidate, transfer: { length: "unknown", receivedBytes: 1 } }, false, false, "Downloading 0.3.1…"],
    ["ready", { kind: "ready", candidate }, false, true, "Install 0.3.1…"],
    ["blocked", { kind: "blocked", candidate, error: { code: "install_blocked", stage: "admission", retryable: true } }, false, true, "Install 0.3.1…"],
    ["installing", { kind: "installing", candidateId: "candidate" }, false, false, "Check for updates"],
  ] as const)("from %s, checks on open only when nothing is offered and names the next step", (_label, state, checks, attention, label) => {
    const updateState = state as AppUpdatesSnapshot["state"];
    expect(checksOnOpen(updateState)).toBe(checks);
    expect(updateNeedsAttention(updateState)).toBe(attention);
    expect(updateMenuLabel(updateState, "en")).toBe(label);
  });

  it.each([
    ["a download that finished with Settings closed", "downloading", false, "0.3.1"],
    ["a verification that finished with Settings closed", "verifying", false, "0.3.1"],
    ["a download watched in Settings", "downloading", true, null],
    ["a ready download read at launch", "idle", false, null],
    ["Settings closing over a ready download", "ready", false, null],
  ] as const)("decides whether to announce %s", (_label, previous, isWatching, version) => {
    expect(finishedDownloadOutOfSight(previous, { kind: "ready", candidate }, isWatching)).toBe(version);
  });
});

describe("Settings › Updates", () => {
  it("does not act on mount and renders an offered release's notes only as text", () => {
    const appController = controller();
    const notes = "First paragraph, joined.\n\n- one item\n- another item\n\n<b>Last</b> paragraph.";
    const { container } = renderRow({ kind: "available", candidate: { ...candidate, notes } }, { appController });
    const rendered = container.querySelector(".app-update-notes");
    expect(rendered?.textContent).toBe(notes);
    expect(rendered?.querySelector("b")).toBeNull();
    expect(screen.getByText("New version")).toBeInTheDocument();
    expect(appController.check).not.toHaveBeenCalled();
    expect(appController.download).not.toHaveBeenCalled();
  });

  it("shows the feed's highlights in the reader's language instead of the notes", withSpanish(() => {
    const highlights = [
      { id: "faster", icon: "circle-fading-arrow-up", en: "Faster updates.", es: "Actualizaciones más rápidas." },
      { id: "future", icon: "rocket", en: "A glyph this build does not know.", es: "Un glifo que esta build no conoce." },
    ];
    const { container } = renderRow({ kind: "available", candidate: { ...candidate, highlights } });
    const release = container.querySelector(".whatsnew-release") as HTMLElement;
    expect(within(release).getByRole("heading", { name: "0.3.1" })).toBeInTheDocument();
    const list = within(release).getByRole("list");
    expect(within(list).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Actualizaciones más rápidas.",
      "Un glifo que esta build no conoce.",
    ]);
    // An unknown icon name still draws a glyph rather than an empty slot.
    expect(list.querySelectorAll(".release-highlights__icon svg")).toHaveLength(2);
    expect(container.querySelector(".app-update-notes")).toBeNull();
  }));

  it("downloads from the row, naming the size", async () => {
    const user = userEvent.setup();
    const appController = controller();
    const { container } = renderRow({ kind: "available", candidate: { ...candidate, expectedBytes: 39_845_888 } }, { appController });
    // The chip names the version; no second line says it again.
    expect(container.querySelector(".tool-row__head")).toHaveTextContent("0.3.1 available");
    expect(container.querySelector(".tool-row .status-line")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Download (38 MB)" }));
    expect(appController.download).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows a download's progress in the row, honest about an unknown length, and cancels it there", async () => {
    const user = userEvent.setup();
    const appController = controller();
    const { unmount } = renderRow({ kind: "downloading", candidate, transfer: { length: "unknown", receivedBytes: 2_097_152 } }, { appController });
    expect(screen.getByRole("progressbar")).not.toHaveAttribute("aria-valuenow");
    expect(screen.getByText("2 MB downloaded")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Downloading" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(appController.cancel).toHaveBeenCalledOnce();
    unmount();

    renderRow({ kind: "downloading", candidate, transfer: { length: "known", receivedBytes: 1_048_576, totalBytes: 4_194_304 } });
    expect(screen.getByRole("progressbar", { name: "1 MB of 4 MB" })).toHaveAttribute("aria-valuenow", "25");
  });

  it("offers Cancel for a check only once native has named it", () => {
    const { unmount } = renderRow({ kind: "checking", operationId: "", source: "manual" });
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
    unmount();
    renderRow({ kind: "checking", operationId: "op", source: "manual" });
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("names verification in visible text", () => {
    renderRow({ kind: "verifying", candidate, receivedBytes: 1_048_576 });
    expect(screen.getByRole("progressbar", { name: "Verifying the download…" })).toBeInTheDocument();
    expect(screen.getByText("Verifying the download…", { selector: "span" })).toBeVisible();
  });

  it("states what installing does beside the one button that installs", async () => {
    const user = userEvent.setup();
    const appController = controller();
    renderRow({ kind: "ready", candidate }, { appController });
    expect(screen.getByText(/closes and reopens on the new version/)).toBeInTheDocument();
    expect(screen.getByText(/project files aren't touched/)).toBeInTheDocument();
    expect(appController.install).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Install and restart" }));
    expect(appController.install).toHaveBeenCalledOnce();
  });

  it("names the unfinished edit that blocks an install, in the reader's language, and retries there", withSpanish(async () => {
    const user = userEvent.setup();
    const appController = controller();
    const error = { code: "install_blocked" as const, stage: "admission" as const, retryable: true, blocker: "Ajustes" };
    renderRow({ kind: "blocked", candidate, error }, { appController });
    expect(screen.getByText("«Ajustes» tiene cambios sin guardar. Guárdalos o descártalos y reinténtalo.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Descarga manual" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(appController.install).toHaveBeenCalledOnce();
  }));

  it("explains an unnamed block without pointing at a list that is not there", withSpanish(() => {
    const error = { code: "install_blocked" as const, stage: "admission" as const, retryable: true, safeDetail: "Explicit install consent is required." };
    const { container } = renderRow({ kind: "blocked", candidate, error });
    const status = container.querySelector(".status-line") as HTMLElement;
    expect(status).toHaveTextContent("Hay algo en curso que impide instalar la actualización.");
    expect(status.textContent).not.toMatch(/indicado|Explicit/);
  }));

  it("leaves a block a retry cannot clear to its cause and the manual download", () => {
    const error = { code: "automatic_update_not_enabled" as const, stage: "check" as const, retryable: false };
    renderRow({ kind: "blocked", candidate, error });
    expect(screen.getByText("This build can't update itself. Use the manual download.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Manual download" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Download|Try again/ })).toBeNull();
  });

  it("offers the manual download in the row only where its sentence recommends it", async () => {
    const user = userEvent.setup();
    const appController = controller();
    const offline = { code: "offline" as const, stage: "check" as const, retryable: true };
    const { unmount } = renderRow({ kind: "failed", error: offline }, { appController });
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(appController.check).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "Manual download" })).toBeNull();
    unmount();

    const handoff = { code: "install_handoff_failed" as const, stage: "install" as const, retryable: true };
    renderRow({ kind: "failed", error: handoff });
    expect(screen.getByRole("button", { name: "Manual download" })).toBeInTheDocument();
  });

  it("says when it was last up to date, and checks again from there", async () => {
    const user = userEvent.setup();
    const appController = controller();
    renderRow({ kind: "current", checkedAt: new Date(Date.now() - 5 * 60_000).toISOString() }, { appController });
    expect(screen.getByText("Up to date")).toBeInTheDocument();
    expect(screen.getByText("Checked 5 min. ago")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Check again" }));
    expect(appController.check).toHaveBeenCalledOnce();
  });

  it.each(["downloading", "verifying", "installing"] as const)("offers no primary and starts nothing while %s runs", async (kind) => {
    const appController = controller();
    const state: AppUpdatesSnapshot["state"] = kind === "downloading"
      ? { kind, candidate, transfer: { length: "unknown", receivedBytes: 100 } }
      : kind === "verifying" ? { kind, candidate, receivedBytes: 100 }
        : { kind, candidateId: candidate.candidateId };
    const { container } = renderRow(state, { appController });
    expect(container.querySelector(".tool-row .primary-button")).toBeNull();
    expect(appController.download).not.toHaveBeenCalled();
    expect(appController.install).not.toHaveBeenCalled();
    expect(appController.check).not.toHaveBeenCalled();
  });

  it("says why updates are unavailable once, with the specific cause instead of the generic sentence", () => {
    const error = { code: "internal" as const, stage: "check" as const, retryable: false, safeDetail: "Updates aren't set up for this build." };
    renderRow({ kind: "unavailable", error });
    expect(screen.getByText("Updates aren't set up for this build.")).toBeInTheDocument();
    expect(screen.queryByText("Not available for this installation")).toBeNull();
    expect(screen.queryByText(/couldn't be completed/)).toBeNull();
  });

  it("never shows the native side's English detail to a Spanish reader", withSpanish(() => {
    const error = { code: "post_install_unconfirmed" as const, stage: "check" as const, retryable: false, safeDetail: "The running version did not confirm the attempted update." };
    renderRow({ kind: "unavailable", error });
    expect(screen.queryByText(/did not confirm/)).toBeNull();
    expect(screen.getByText(/No se encontró la nueva versión/)).toBeInTheDocument();
  }));

  it("shows a development build as calm, not as a warning, with nothing to check", () => {
    const error = { code: "not_configured" as const, stage: "check" as const, retryable: false };
    renderRow({ kind: "unavailable", error });
    expect(screen.getByText("Development build")).toBeInTheDocument();
    expect(screen.queryByText("Not available")).toBeNull();
    expect(screen.getByText("Development builds don't update themselves.").closest(".status-line")).toHaveClass("status-line--neutral");
    expect(screen.queryByRole("button", { name: "Check for updates" })).toBeNull();
  });

  it.each([
    ["idle", { kind: "idle" }, null, null],
    ["checking", { kind: "checking", operationId: "op", source: "manual" }, "hop", null],
    ["verifying", { kind: "verifying", candidate, receivedBytes: 100 }, "hop", null],
    ["installing", { kind: "installing", candidateId: candidate.candidateId }, "hop", null],
    ["a download of unknown size", { kind: "downloading", candidate, transfer: { length: "unknown", receivedBytes: 100 } }, "hop", null],
    ["a download of known size", { kind: "downloading", candidate, transfer: { length: "known", receivedBytes: 1_048_576, totalBytes: 4_194_304 } }, null, "25"],
  ] as const)("draws the row's whole mascot for %s", (_label, state, motion, progress) => {
    const { container } = renderRow(state as AppUpdatesSnapshot["state"]);
    const mascot = container.querySelector(".tool-row__tile .gitodile-mascot");
    expect(mascot).toHaveClass("gitodile-mascot--body");
    if (motion) expect(mascot).toHaveClass(`gitodile-mascot--${motion}`);
    else expect(mascot).not.toHaveClass("gitodile-mascot--hop");
    if (progress) expect(mascot).toHaveAttribute("data-progress", progress);
    else expect(mascot).not.toHaveAttribute("data-progress");
  });

  it("enables background checks only from the disclosed switch", async () => {
    const user = userEvent.setup();
    const appController = controller();
    const setEnabled = vi.fn();
    const { container } = renderRow({ kind: "idle" }, { appController, setEnabled });
    expect(screen.getByText(/Nothing from your projects is sent/)).toBeInTheDocument();
    // The switch sits in the row's own group, ahead of What's new.
    const switchControl = screen.getByRole("switch", { name: "Check for updates automatically" });
    expect(switchControl.closest(".settings-group")).toBe(container.querySelector(".tool-row")?.closest(".settings-group"));
    expect(appController.check).not.toHaveBeenCalled();
    await user.click(screen.getByRole("switch", { name: "Check for updates automatically" }));
    expect(setEnabled).toHaveBeenCalledWith(true);
    await user.click(screen.getByRole("button", { name: "Check for updates" }));
    expect(appController.check).toHaveBeenCalledOnce();
  });

  it("keeps the manual download in the row, once", async () => {
    const user = userEvent.setup();
    const appController = controller();
    const { unmount } = renderRow({ kind: "current", checkedAt: "2026-10-01T10:00:00Z" }, { appController });
    await user.click(screen.getByRole("button", { name: "Download manually from GitHub" }));
    expect(appController.openManualDownload).toHaveBeenCalledOnce();
    unmount();

    // Where the cause recommends it, the labelled button replaces the link.
    renderRow({ kind: "failed", error: { code: "install_handoff_failed", stage: "install", retryable: true } });
    expect(screen.getByRole("button", { name: "Manual download" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Download manually from GitHub" })).toBeNull();
  });

  it("leads What's new with the offered release, lists earlier versions, and opens there on request", async () => {
    const user = userEvent.setup();
    const offered = { ...candidate, highlights: [{ id: "new", icon: "sparkles", en: "The new thing.", es: "Lo nuevo." }] };
    renderRow({ kind: "available", candidate: offered }, { revealWhatsNew: true });
    const whatsNew = screen.getByRole("region", { name: "What's new" });
    expect(whatsNew).toHaveFocus();
    expect(within(whatsNew).getByRole("heading", { name: "0.3.1" })).toBeInTheDocument();
    expect(within(whatsNew).getByText("The new thing.")).toBeInTheDocument();
    // The running build is listed as an earlier version and marked as such.
    expect(within(whatsNew).getByText("Your version")).toBeInTheDocument();
    await user.click(within(whatsNew).getByRole("button", { name: /0\.2\.12/ }));
    expect(within(whatsNew).getByText("Now free software.")).toBeInTheDocument();
  });
});

describe("restart on the wrong version", () => {
  function Harness({ expectedVersion, appController, onCheckAgain }: {
    expectedVersion: string; appController: AppUpdatesController; onCheckAgain: () => void;
  }) {
    const [open, setOpen] = useState(true);
    const error = { code: "post_install_unconfirmed" as const, stage: "startup" as const, retryable: false };
    return <LanguageProvider><AppUpdateRestartDialog isOpen={open} setOpen={setOpen}
      confirmation={{ kind: "unconfirmed", expectedVersion, error }} controller={appController}
      installed={installed} onCheckAgain={onCheckAgain} /></LanguageProvider>;
  }

  it("says so once and offers both ways forward, checking in Settings", async () => {
    const user = userEvent.setup();
    const appController = controller();
    const onCheckAgain = vi.fn();
    render(<Harness expectedVersion="0.3.1" appController={appController} onCheckAgain={onCheckAgain} />);
    const dialog = screen.getByRole("dialog", { name: "The update didn't finish" });
    expect(within(dialog).getByRole("status")).toHaveTextContent("The app restarted, but not on version 0.3.1. Check again or use the manual download.");
    await user.click(within(dialog).getByRole("button", { name: "Manual download" }));
    expect(appController.openManualDownload).toHaveBeenCalledOnce();
    await user.click(within(dialog).getByRole("button", { name: "Check again" }));
    expect(onCheckAgain).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("does not print a bare version when the handoff record named none", () => {
    render(<Harness expectedVersion="" appController={controller()} onCheckAgain={vi.fn()} />);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("the new version couldn't be confirmed");
    expect(status.textContent).not.toMatch(/\bv\./);
  });
});
