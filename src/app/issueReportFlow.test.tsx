import { act, cleanup, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { LanguageProvider } from "../i18n";
import { TitlebarMenu } from "./TitlebarMenu";
import { IssueReportDialog } from "./IssueReportDialog";
import { useIssueReport } from "./useIssueReport";
import type { IssueReportPort } from "./issueReportAdapter";

afterEach(() => { cleanup(); localStorage.clear(); });

const REPORT = "Environment\n-----------\nGitOdile test\nSystem: Windows 11 (x86_64)\n\nSession activity\n----------------\nStarted: 2026-09-04T14:23:05Z\nDuration: under 1 sec\nEvents: 1 retained of 2 (1 older events omitted)\n\n+00:00.012  command  read-only  open_repository  ok";

function makePort(overrides: Partial<IssueReportPort> = {}): IssueReportPort {
  return {
    render: vi.fn().mockResolvedValue(REPORT),
    open: vi.fn().mockResolvedValue(undefined),
    copy: vi.fn().mockResolvedValue(undefined),
    save: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

function ReportHarness({ port }: { port: IssueReportPort }) {
  const report = useIssueReport("2.50.0", port);
  return <>
    <TitlebarMenu onOpenHome={vi.fn()} onOpenAbout={vi.fn()} onOpenChangelog={vi.fn()} onOpenProject={vi.fn()}
      onCreateProject={vi.fn()} onCloneProject={vi.fn()} onCloseProject={vi.fn()}
      onOpenSettings={vi.fn()} onOpenShortcuts={vi.fn()} hasProject={false}
      isOpeningProject={false} canReloadWindow isReportingIssue={report.isOpening}
      onReportIssue={() => void report.report()} />
    <IssueReportDialog report={report} />
  </>;
}

async function openReview(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByRole("button", { name: "More actions" }));
  await user.click(screen.getByRole("menuitem", { name: "Report an issue" }));
  await screen.findByRole("dialog", { name: "Report an issue" });
}

it("copies exactly the reviewed report, opens GitHub and guides the paste", async () => {
  const user = userEvent.setup();
  const port = makePort();
  render(<LanguageProvider><ReportHarness port={port} /></LanguageProvider>);

  await openReview(user);
  expect(port.open).not.toHaveBeenCalled();
  // The reviewer sees the published bytes themselves, not a rendering of them.
  const contents = screen.getByRole("region", { name: "Report contents" });
  expect(contents.tagName).toBe("PRE");
  expect(contents.textContent).toBe(REPORT);
  expect(contents.querySelector("textarea")).toBeNull();

  await user.click(screen.getByRole("button", { name: "Save report…" }));
  expect(port.save).toHaveBeenCalledWith(REPORT);
  expect(screen.getByRole("status")).toHaveTextContent("Report saved.");

  await user.type(screen.getByRole("textbox", { name: "Title (optional)" }), "Publish fails");
  await user.click(screen.getByRole("button", { name: "Copy and open GitHub" }));
  expect(port.copy).toHaveBeenCalledWith(REPORT);
  expect(vi.mocked(port.copy).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(port.open).mock.invocationCallOrder[0]);
  const opened = new URL(vi.mocked(port.open).mock.calls[0][0]);
  expect(opened.searchParams.get("title")).toBe("[Bug]: Publish fails");
  // The address seeds the required field with the versions and asks for the
  // paste there; the activity itself travels on the clipboard.
  expect(opened.searchParams.get("diagnostics"))
    .toBe("GitOdile test\nSystem: Windows 11 (x86_64)\n\nSession activity: paste the report GitOdile copied below this line.");

  const finish = await screen.findByRole("dialog", { name: "Finish on GitHub" });
  expect(finish).toHaveTextContent("Report copied");
  await user.click(screen.getByRole("button", { name: "Copy again" }));
  expect(port.copy).toHaveBeenCalledTimes(2);
  expect(screen.getByRole("status")).toHaveTextContent("Report copied.");
  await user.click(screen.getByRole("button", { name: "Done" }));
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("leaves the activity out of what is shown, saved and sent, and copies nothing", async () => {
  const user = userEvent.setup();
  const port = makePort();
  render(<LanguageProvider><ReportHarness port={port} /></LanguageProvider>);
  await openReview(user);

  await user.click(screen.getByRole("checkbox", { name: "Include what GitOdile did this session" }));
  const environmentOnly = "Environment\n-----------\nGitOdile test\nSystem: Windows 11 (x86_64)";
  expect(screen.getByRole("region", { name: "Report contents" }).textContent).toBe(environmentOnly);
  await user.click(screen.getByRole("button", { name: "Save report…" }));
  expect(port.save).toHaveBeenCalledWith(environmentOnly);

  await user.click(screen.getByRole("button", { name: "Open GitHub" }));
  expect(port.copy).not.toHaveBeenCalled();
  expect(new URL(vi.mocked(port.open).mock.calls[0][0]).searchParams.get("diagnostics"))
    .toBe("GitOdile test\nSystem: Windows 11 (x86_64)");
  // Nothing is left to paste, so nothing is left to guide.
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("still opens the form when the copy fails and says so in the finish step", async () => {
  const user = userEvent.setup();
  const port = makePort({ copy: vi.fn().mockRejectedValue(new Error("clipboard denied")) });
  render(<LanguageProvider><ReportHarness port={port} /></LanguageProvider>);
  await openReview(user);

  await user.click(screen.getByRole("button", { name: "Copy and open GitHub" }));
  expect(port.open).toHaveBeenCalledOnce();
  const finish = await screen.findByRole("dialog", { name: "Finish on GitHub" });
  expect(finish).toHaveTextContent("The report wasn't copied");
  await user.click(screen.getByRole("button", { name: "Save report…" }));
  expect(port.save).toHaveBeenCalledWith(REPORT);
});

it("leads the review header with the same mark as the menu's Report an issue", async () => {
  const user = userEvent.setup();
  render(<LanguageProvider><ReportHarness port={makePort()} /></LanguageProvider>);

  await openReview(user);
  const dialog = screen.getByRole("dialog", { name: "Report an issue" });
  const glyph = dialog.querySelector(".app-dialog__glyph");
  expect(glyph).toHaveClass("app-dialog__glyph--app");
  expect(glyph?.querySelector("svg")).toBeInTheDocument();
});

it("keeps browser failure, retry and manual-link recovery in the same dialog", async () => {
  const user = userEvent.setup();
  const port = makePort({
    open: vi.fn().mockRejectedValueOnce(new Error("no browser")).mockResolvedValue(undefined),
  });
  render(<LanguageProvider><ReportHarness port={port} /></LanguageProvider>);
  const trigger = screen.getByRole("button", { name: "More actions" });
  await openReview(user);
  await user.click(screen.getByRole("button", { name: "Copy and open GitHub" }));

  expect(await screen.findByRole("alertdialog")).toHaveAccessibleName("The browser didn't open");
  const attemptedUrl = vi.mocked(port.open).mock.calls[0][0];
  await user.click(screen.getByRole("button", { name: "Copy link" }));
  expect(port.copy).toHaveBeenLastCalledWith(attemptedUrl);
  expect(screen.getByRole("status")).toHaveTextContent("Link copied.");
  const input = screen.getByRole("textbox", { name: "Report link" }) as HTMLInputElement;
  await user.click(input);
  expect(input.selectionEnd! - input.selectionStart!).toBe(input.value.length);
  await user.click(screen.getByRole("button", { name: "Try again" }));
  expect(port.open).toHaveBeenNthCalledWith(2, attemptedUrl);
  expect(screen.queryByRole("alertdialog")).toBeNull();
  // Copy link replaced the report on the clipboard, so the retry puts the
  // report back before the finish step says it is there.
  expect(port.copy).toHaveBeenLastCalledWith(REPORT);
  expect(await screen.findByRole("dialog", { name: "Finish on GitHub" })).toHaveTextContent("Report copied");
  // The new step lands on its own primary rather than leaving focus behind.
  await waitFor(() => expect(screen.getByRole("button", { name: "Done" })).toHaveFocus());
  await user.click(screen.getByRole("button", { name: "Done" }));
  await waitFor(() => expect(trigger).toHaveFocus());
});

it("falls back to a reviewable environment report when session rendering is unavailable", async () => {
  const user = userEvent.setup();
  const port = makePort({ render: vi.fn().mockRejectedValue(new Error("no native bridge")) });
  render(<LanguageProvider><ReportHarness port={port} /></LanguageProvider>);
  await openReview(user);
  expect(screen.getByRole("region", { name: "Report contents" }))
    .toHaveTextContent("Session activity was unavailable.");
  expect(port.open).not.toHaveBeenCalled();
});

it("coalesces repeated preparation and ignores a late result after dismissal", async () => {
  let resolveRender!: (report: string) => void;
  const port = makePort({ render: vi.fn(() => new Promise<string>((resolve) => { resolveRender = resolve; })) });
  const { result } = renderHook(() => useIssueReport(null, port), { wrapper: LanguageProvider });
  let pending!: Promise<void>;
  act(() => { pending = result.current.report(); void result.current.report(); });
  expect(port.render).toHaveBeenCalledTimes(1);
  act(() => result.current.dismiss());
  await act(async () => { resolveRender(REPORT); await pending; });
  expect(result.current.phase).toBe("closed");
  expect(result.current.reportText).toBeNull();
});

it("does not reintroduce clipboard state after dismissal", async () => {
  let resolveCopy!: () => void;
  const port = makePort({ copy: vi.fn(() => new Promise<void>((resolve) => { resolveCopy = resolve; })) });
  const { result } = renderHook(() => useIssueReport(null, port), { wrapper: LanguageProvider });
  await act(() => result.current.report());
  let pending!: Promise<void>;
  act(() => { pending = result.current.copyReport(); });
  act(() => result.current.dismiss());
  await act(async () => { resolveCopy(); await pending; });
  await waitFor(() => expect(result.current.copyReportState).toBe("idle"));
});
