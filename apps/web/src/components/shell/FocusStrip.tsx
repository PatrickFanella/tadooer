import { useEffect, useState } from "react";
import { Pause, Play, Square } from "lucide-react";
import type { ActiveSession } from "@suite/contracts";
import { Button } from "@/components/ui/button";
import type {
  FocusPanelCommand,
  FocusPanelTimerProps,
} from "../../focus-panel.tsx";
import { formatCountdown, localCountdown } from "../../focus-timer.ts";

export interface FocusStripProps {
  readonly session: ActiveSession | null;
  /** Title of the session's task, or null when it is not in the cache. */
  readonly taskTitle: string | null;
  readonly clientId: string | null;
  readonly busy: boolean;
  readonly online: boolean;
  readonly timer: FocusPanelTimerProps | undefined;
  readonly onCommand: (command: FocusPanelCommand) => void;
}

const terminal = (session: ActiveSession | null): boolean =>
  session === null ||
  session.state === "completed" ||
  session.state === "expired";

/**
 * The running focus session in the header (issue #194): title, countdown
 * and the controls `FocusPanel` offered, on one line. The idle, reminder
 * and takeover dialogs stay where `App` renders them.
 */
export const FocusStrip = ({
  session,
  taskTitle,
  clientId,
  busy,
  online,
  timer,
  onCommand,
}: FocusStripProps) => {
  const running = session?.state === "running";
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const handle = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(handle);
  }, [running, timer?.receivedAt]);

  if (session === null || terminal(session))
    return (
      <div className="focus-strip" data-state="idle">
        <span className="focus-strip__idle">No session</span>
      </div>
    );

  const owner = session.controllerClientId === clientId;
  const disabled = busy || !online;
  const command = (name: Exclude<FocusPanelCommand["command"], "start">) =>
    onCommand({
      command: name,
      sessionId: session.id,
      expectedRevision: session.revision,
    });
  const countdown =
    timer?.timer == null
      ? null
      : localCountdown(timer.timer, timer.receivedAt, now);
  const phase = session.phase === "focus" ? "Focus" : "Break";

  return (
    <div
      className="focus-strip"
      data-state={session.state}
      data-phase={session.phase}
      aria-live="polite"
      title={
        owner
          ? `${phase} session on “${taskTitle ?? "a task"}”`
          : "Another device controls this session."
      }
    >
      <span className="focus-strip__phase">{phase}</span>
      <span className="focus-strip__title">{taskTitle ?? "Task"}</span>
      {countdown === null ? null : (
        <time className="focus-strip__time">
          {formatCountdown(countdown.remainingMs ?? countdown.elapsedMs)}
        </time>
      )}
      <span className="focus-strip__controls">
        {owner ? (
          <>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={disabled}
              aria-label={session.state === "running" ? "Pause" : "Resume"}
              title={session.state === "running" ? "Pause" : "Resume"}
              onClick={() =>
                command(session.state === "running" ? "pause" : "resume")
              }
            >
              {session.state === "running" ? <Pause /> : <Play />}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={() =>
                command(session.phase === "focus" ? "start_break" : "end_break")
              }
            >
              {session.phase === "focus" ? "Break" : "End break"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={disabled}
              aria-label="Complete focus session"
              title="Complete focus session"
              onClick={() => command("complete")}
            >
              <Square />
            </Button>
          </>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() => command("takeover")}
          >
            Take over
          </Button>
        )}
      </span>
    </div>
  );
};
