import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { CalendarFeedPreviewResponse } from "@suite/contracts";
import {
  FeedRecipientPreview,
  feedVisibilityLabel,
} from "./FeedRecipientPreview.tsx";

const preview = (
  busy: Partial<CalendarFeedPreviewResponse["busy"]> = {},
): CalendarFeedPreviewResponse => ({
  calendarId: "00000000-0000-4000-8000-000000000001",
  full: { events: 12 },
  busy: {
    published: 9,
    omittedCancelled: 2,
    omittedFree: 1,
    unsupported: 0,
    ...busy,
  },
});

describe("FeedRecipientPreview (issue #189)", () => {
  it("says what a busy-only recipient receives and what is removed", () => {
    const html = renderToStaticMarkup(
      <FeedRecipientPreview visibility="busy" preview={preview()} />,
    );
    expect(html).toContain("9 busy intervals");
    expect(html).toContain("Titles, notes, locations, attendees");
    expect(html).toContain("3 cancelled or free events are left out.");
    expect(html).not.toContain('role="alert"');
  });

  it("warns when events cannot be published as busy time", () => {
    const html = renderToStaticMarkup(
      <FeedRecipientPreview
        visibility="busy"
        preview={preview({ unsupported: 1 })}
      />,
    );
    expect(html).toContain("1 event can&#x27;t be published as busy time");
    expect(html).toContain("may see that time as free");
  });

  it("states that a full feed exposes every detail", () => {
    const html = renderToStaticMarkup(
      <FeedRecipientPreview visibility="full" preview={preview()} />,
    );
    expect(html).toContain("all 12 events with every detail");
  });

  it("shows a pending state before the preview loads", () => {
    expect(
      renderToStaticMarkup(
        <FeedRecipientPreview visibility="busy" preview={null} />,
      ),
    ).toContain("Checking what this calendar would publish");
    expect(feedVisibilityLabel("busy")).toBe("Busy only");
    expect(feedVisibilityLabel("full")).toBe("Full details");
  });
});
