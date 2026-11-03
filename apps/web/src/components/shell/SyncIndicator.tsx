import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  liveSyncStatusDescription,
  liveSyncStatusLabel,
  type LiveSyncStatus,
} from "@/live-sync/status";

export interface SyncIndicatorProps {
  readonly syncStatus: "online" | "offline" | "syncing" | undefined;
  /** ADR 0045 live sync state; omitted where live sync is not running. */
  readonly liveStatus: LiveSyncStatus | undefined;
  readonly baikalConnected: boolean;
}

export type SyncTone = "success" | "warning" | "danger" | "neutral";

/**
 * One dot for three states (issue #194): the worst of task sync, live
 * updates and the calendar connection. Red is reserved for an offline task
 * sync, since queued edits then wait; orange covers everything that
 * recovers on its own.
 */
export const syncTone = ({
  syncStatus,
  liveStatus,
  baikalConnected,
}: SyncIndicatorProps): SyncTone => {
  if (syncStatus === undefined) return "neutral";
  if (syncStatus === "offline") return "danger";
  if (
    syncStatus === "syncing" ||
    liveStatus === "reconnecting" ||
    liveStatus === "offline" ||
    !baikalConnected
  )
    return "warning";
  return "success";
};

const toneLabel: Readonly<Record<SyncTone, string>> = {
  success: "Everything is in sync",
  warning: "Sync needs a moment",
  danger: "Sync is offline",
  neutral: "Sync is not running",
};

export const SyncIndicator = (props: SyncIndicatorProps) => {
  const tone = syncTone(props);
  // The state is text in a status region, not colour alone.
  const summary = [
    `Task sync: ${props.syncStatus ?? "offline"}.`,
    ...(props.liveStatus === undefined
      ? []
      : [
          `Live updates: ${liveSyncStatusLabel(props.liveStatus)}.`,
          liveSyncStatusDescription(props.liveStatus),
        ]),
    props.baikalConnected ? "Baikal verified." : "Baikal disconnected.",
  ].join(" ");
  return (
    <Popover>
      <span className="sr-only" role="status">
        {summary}
      </span>
      <PopoverTrigger
        type="button"
        className="sync-dot-trigger"
        aria-label={`Sync status: ${toneLabel[tone]}`}
        title={toneLabel[tone]}
      >
        <span className="sync-dot" data-tone={tone} aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent className="sync-popover" aria-label="Sync details">
        <dl className="sync-popover__list">
          <div>
            <dt>Task sync</dt>
            <dd>{props.syncStatus ?? "offline"}</dd>
          </div>
          {props.liveStatus !== undefined && (
            <div title={liveSyncStatusDescription(props.liveStatus)}>
              <dt>Live updates</dt>
              <dd>{liveSyncStatusLabel(props.liveStatus)}</dd>
            </div>
          )}
          <div>
            <dt>Baikal</dt>
            <dd>{props.baikalConnected ? "verified" : "disconnected"}</dd>
          </div>
        </dl>
      </PopoverContent>
    </Popover>
  );
};
