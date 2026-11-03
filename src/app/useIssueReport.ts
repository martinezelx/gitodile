import { useCallback, useEffect, useRef, useState } from "react";
import { useLanguage } from "../i18n";
import { buildIssueReportUrl, reportWithoutActivity, useIssueReportEnvironment } from "./issueReport";
import { issueReportPort, type IssueReportPort } from "./issueReportAdapter";

type FlowPhase = "closed" | "preparing" | "review" | "opening" | "finish" | "failed";
type ActionState = "idle" | "working" | "done" | "failed";

/** The shell owns the review and browser launch; repository state is never
 * read here. Rust supplies a bounded snapshot of session activity. */
export function useIssueReport(gitVersion: string | null, port: IssueReportPort = issueReportPort) {
  const { environment, language } = useIssueReportEnvironment(gitVersion);
  const { t } = useLanguage();
  const [phase, setPhase] = useState<FlowPhase>("closed");
  const [reportText, setReportText] = useState<string | null>(null);
  const [includeActivity, setIncludeActivity] = useState(true);
  const [title, setTitle] = useState("");
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [copyReportState, setCopyReportState] = useState<ActionState>("idle");
  const [saveState, setSaveState] = useState<ActionState>("idle");
  const [copyLinkState, setCopyLinkState] = useState<ActionState>("idle");
  // The finish step's own copy, told apart from the one made on the way out.
  const [recopied, setRecopied] = useState(false);
  const generation = useRef(0);
  const busy = useRef(false);

  // What the reader sees is what is copied, saved and pasted: leaving the
  // activity out changes the text itself, not a flag sent alongside it.
  const shownReport = reportText === null ? null : includeActivity ? reportText : reportWithoutActivity(reportText);

  const dismiss = useCallback(() => {
    generation.current++;
    busy.current = false;
    setPhase("closed");
    setReportText(null);
    setIncludeActivity(true);
    setTitle("");
    setFailedUrl(null);
    setCopyReportState("idle");
    setSaveState("idle");
    setCopyLinkState("idle");
    setRecopied(false);
  }, []);
  useEffect(() => () => { generation.current++; }, []);

  const report = async (): Promise<void> => {
    if (busy.current || phase !== "closed") return;
    busy.current = true;
    const attempt = ++generation.current;
    setPhase("preparing");
    try {
      const rendered = await port.render(environment);
      if (attempt === generation.current) {
        setReportText(rendered);
        setPhase("review");
      }
    } catch {
      // Keep issue reporting usable in a plain Vite browser and if the native
      // diagnostic command itself fails. Every byte still remains reviewable.
      if (attempt === generation.current) {
        setReportText(`Environment\n-----------\n${environment}\n\nSession activity\n----------------\nSession activity was unavailable.`);
        setPhase("review");
      }
    } finally {
      if (attempt === generation.current) busy.current = false;
    }
  };

  /** With nothing on the clipboard there is nothing left to paste, so the
   * flow ends when the form opens instead of guiding a paste. */
  const open = async (target: string, attempt: number, pasteFollows: boolean): Promise<void> => {
    try {
      await port.open(target);
      if (attempt === generation.current) {
        if (pasteFollows) setPhase("finish");
        else dismiss();
      }
    } catch {
      if (attempt === generation.current) {
        setFailedUrl(target);
        setPhase("failed");
      }
    } finally {
      if (attempt === generation.current) busy.current = false;
    }
  };

  /** Copy first, so the report is waiting when the form appears. A failed copy
   * still opens the form: the finish step says so and offers it again. The
   * versions alone already travel in the address, so without the activity
   * there is nothing to copy. */
  const copyThenOpen = async (target: string, attempt: number): Promise<void> => {
    if (includeActivity && shownReport !== null) {
      setCopyReportState("working");
      try {
        await port.copy(shownReport);
        if (attempt === generation.current) setCopyReportState("done");
      } catch {
        if (attempt === generation.current) setCopyReportState("failed");
      }
      if (attempt !== generation.current) return;
    }
    await open(target, attempt, includeActivity);
  };

  const continueToGitHub = async (): Promise<void> => {
    if (busy.current || shownReport === null) return;
    busy.current = true;
    const attempt = ++generation.current;
    const target = buildIssueReportUrl(shownReport, language, {
      title,
      pasteReminder: includeActivity ? t.issueReportPasteReminder : undefined,
    });
    setPhase("opening");
    setSaveState("idle");
    await copyThenOpen(target, attempt);
  };

  /** The failure screen's own "Copy link" replaces the report on the
   * clipboard, so a retry copies the report again rather than letting the
   * finish step claim a copy that is no longer there. */
  const retry = async (): Promise<void> => {
    if (busy.current || failedUrl === null) return;
    busy.current = true;
    const attempt = ++generation.current;
    setPhase("opening");
    setCopyLinkState("idle");
    await copyThenOpen(failedUrl, attempt);
  };

  const runReportAction = async (
    action: (value: string) => Promise<unknown>,
    setState: (state: ActionState) => void,
  ): Promise<void> => {
    if (shownReport === null) return;
    const attempt = generation.current;
    setState("working");
    try {
      const outcome = await action(shownReport);
      if (attempt === generation.current) setState(outcome === false ? "idle" : "done");
    } catch {
      if (attempt === generation.current) setState("failed");
    }
  };

  const copyLink = async (): Promise<void> => {
    if (failedUrl === null || copyLinkState === "working" || busy.current) return;
    const attempt = generation.current;
    setCopyLinkState("working");
    try {
      await port.copy(failedUrl);
      if (attempt === generation.current) setCopyLinkState("done");
    } catch {
      if (attempt === generation.current) setCopyLinkState("failed");
    }
  };

  return {
    phase,
    isOpen: phase !== "closed",
    isOpening: phase === "preparing" || phase === "opening",
    reportText: shownReport,
    includeActivity,
    title,
    failedUrl,
    copyReportState,
    saveState,
    copyLinkState,
    recopied,
    dismiss,
    report,
    continueToGitHub,
    retry,
    setIncludeActivity: (include: boolean) => {
      setSaveState("idle");
      setIncludeActivity(include);
    },
    setTitle,
    copyReport: () => {
      setRecopied(true);
      return runReportAction(port.copy, setCopyReportState);
    },
    saveReport: () => runReportAction(port.save, setSaveState),
    copyLink,
  };
}

export type IssueReportState = ReturnType<typeof useIssueReport>;
