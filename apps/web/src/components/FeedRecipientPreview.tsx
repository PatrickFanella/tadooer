import type {
  CalendarFeedPreviewResponse,
  CalendarFeedVisibility,
} from "@suite/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";

const count = (value: number, one: string, many: string) =>
  `${String(value)} ${value === 1 ? one : many}`;

/**
 * Issue #189: tells the owner what a feed recipient will receive before the
 * feed exists, and warns when busy-only output cannot cover every event.
 */
export const FeedRecipientPreview = ({
  visibility,
  preview,
}: {
  readonly visibility: CalendarFeedVisibility;
  readonly preview: CalendarFeedPreviewResponse | null;
}) => {
  if (preview === null)
    return (
      <p className="hint" role="status">
        Checking what this calendar would publish…
      </p>
    );
  if (visibility === "full")
    return (
      <p className="hint" role="status">
        Recipients see all {count(preview.full.events, "event", "events")} with
        every detail, including titles, notes, locations and attendees.
      </p>
    );
  const omitted = preview.busy.omittedCancelled + preview.busy.omittedFree;
  return (
    <div className="grid gap-2" role="status">
      <p className="hint">
        Recipients see{" "}
        {count(preview.busy.published, "busy interval", "busy intervals")}{" "}
        labelled “Busy”, with start and end times and repeat rules. Titles,
        notes, locations, attendees, links and event IDs are removed.
        {omitted > 0 &&
          ` ${count(omitted, "cancelled or free event is", "cancelled or free events are")} left out.`}
      </p>
      {preview.busy.unsupported > 0 && (
        <Alert variant="warning">
          <AlertDescription>
            {count(preview.busy.unsupported, "event", "events")} can't be
            published as busy time: no usable start, a time zone Tadooer doesn't
            recognize, or a repeat rule it can't check. Recipients may see that
            time as free.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
};

export const feedVisibilityLabel = (visibility: CalendarFeedVisibility) =>
  visibility === "busy" ? "Busy only" : "Full details";
