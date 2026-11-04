import { describe, expect, it } from "vitest";
import { serializeBusyCalendarFeed } from "./busy-feed.ts";

const now = new Date("2026-11-03T12:00:00.000Z");
const salt = "feed-salt-one";
const ics = (...lines: string[]) =>
  ["BEGIN:VCALENDAR", "VERSION:2.0", ...lines, "END:VCALENDAR", ""].join(
    "\r\n",
  );
const events = (output: string) =>
  output
    .split("BEGIN:VEVENT\r\n")
    .slice(1)
    .map((block) => block.split("\r\nEND:VEVENT")[0]?.split("\r\n") ?? []);

describe("busy-only publication (issue #189)", () => {
  it("never emits a secret placed in any raw field", () => {
    const raw = ics(
      "X-WR-CALNAME:SECRET-CALNAME",
      "BEGIN:VTIMEZONE",
      "TZID:America/Chicago",
      "TZURL:https://SECRET-TZURL.test/",
      "X-SECRET:SECRET-TZ-EXTENSION",
      "BEGIN:STANDARD",
      "DTSTART:20261101T020000",
      "TZOFFSETFROM:-0500",
      "TZOFFSETTO:-0600",
      "TZNAME:SECRET-TZNAME",
      "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
      "END:STANDARD",
      "BEGIN:DAYLIGHT",
      "DTSTART:20260308T020000",
      "TZOFFSETFROM:-0600",
      "TZOFFSETTO:-0500",
      "TZNAME:SECRET-TZNAME",
      "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
      "END:DAYLIGHT",
      "END:VTIMEZONE",
      "BEGIN:VEVENT",
      "UID:SECRET-UID-1",
      "DTSTAMP:20260101T000000Z",
      "DTSTART;TZID=America/Chicago;X-PARAM=SECRET-PARAM:20261102T090000",
      "DTEND;TZID=America/Chicago:20261102T100000",
      "RRULE:FREQ=WEEKLY;COUNT=3",
      "SUMMARY;LANGUAGE=SECRET-LANG:SECRET-SUMMARY",
      "DESCRIPTION:SECRET-DESCRIPTION",
      'LOCATION;ALTREP="https://SECRET-ALTREP.test":SECRET-LOCATION',
      "ORGANIZER;CN=SECRET-ORGANIZER-CN:mailto:secret-organizer@example.test",
      "ATTENDEE;CN=SECRET-ATTENDEE-CN:mailto:secret-attendee@example.test",
      "URL:https://SECRET-URL.test/",
      "CATEGORIES:SECRET-CATEGORY",
      "COMMENT:SECRET-COMMENT",
      "CONTACT:SECRET-CONTACT",
      "RELATED-TO:SECRET-RELATED",
      "RESOURCES:SECRET-RESOURCE",
      "ATTACH:https://SECRET-ATTACH.test/",
      "GEO:1.0;2.0",
      "CLASS:SECRET-CLASS",
      "CREATED:20260101T000000Z",
      "LAST-MODIFIED:20260102T000000Z",
      "SEQUENCE:7",
      "X-GOOGLE-CONFERENCE:SECRET-CONFERENCE",
      "X-APPLE-STRUCTURED-LOCATION;X-TITLE=SECRET-XTITLE:geo:1,2",
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      "DESCRIPTION:SECRET-ALARM",
      "TRIGGER:-PT10M",
      "END:VALARM",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:SECRET-UID-1",
      "RECURRENCE-ID;TZID=America/Chicago:20261109T090000",
      "DTSTART;TZID=America/Chicago:20261109T110000",
      "DTEND;TZID=America/Chicago:20261109T120000",
      "SUMMARY:SECRET-OVERRIDE-SUMMARY",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:SECRET-UID-2",
      "DTSTART;TZID=SECRET-TZID:20261103T090000",
      "DTEND;TZID=SECRET-TZID:20261103T100000",
      "SUMMARY:SECRET-UNKNOWN-ZONE",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:SECRET-UID-3",
      "DTSTART:20261104T150000Z",
      "DTEND:20261104T160000Z",
      "RRULE:FREQ=DAILY;X-SECRET=SECRET-RRULE",
      "END:VEVENT",
    );
    const feed = serializeBusyCalendarFeed([raw], { identitySalt: salt, now });
    expect(feed.ics).not.toMatch(/secret/i);
    expect(feed.report).toEqual({
      published: 3,
      omittedCancelled: 0,
      omittedFree: 0,
      unsupported: 2,
    });
    const [override, master, invalidRule] = events(feed.ics);
    expect(master).toEqual([
      expect.stringMatching(/^UID:[0-9a-f]{32}@busy\.tadooer$/),
      "DTSTAMP:20261103T120000Z",
      "DTSTART;TZID=America/Chicago:20261102T090000",
      "DTEND;TZID=America/Chicago:20261102T100000",
      "RRULE:FREQ=WEEKLY;COUNT=3",
      "SUMMARY:Busy",
      "TRANSP:OPAQUE",
    ]);
    expect(override).toContain(
      "RECURRENCE-ID;TZID=America/Chicago:20261109T090000",
    );
    expect(override?.[0]).toBe(master?.[0]);
    // An invalid rule keeps the first occurrence and is reported.
    expect(invalidRule).toContain("DTSTART:20261104T150000Z");
    expect(invalidRule?.some((line) => line.startsWith("RRULE"))).toBe(false);
    // The time zone is kept with offsets and rules only.
    expect(feed.ics).toContain(
      "BEGIN:VTIMEZONE\r\nTZID:America/Chicago\r\nBEGIN:STANDARD\r\nDTSTART:20261101T020000\r\nTZOFFSETFROM:-0500\r\nTZOFFSETTO:-0600\r\nRRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU\r\nEND:STANDARD",
    );
  });

  it("drops cancelled and free events and excludes cancelled or free instances", () => {
    const raw = ics(
      "BEGIN:VEVENT",
      "UID:series",
      "DTSTART:20261102T150000Z",
      "DURATION:PT30M",
      "RRULE:FREQ=DAILY;COUNT=5",
      "EXDATE:20261103T150000Z",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:series",
      "RECURRENCE-ID:20261104T150000Z",
      "DTSTART:20261104T150000Z",
      "DURATION:PT30M",
      "STATUS:CANCELLED",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:series",
      "RECURRENCE-ID:20261105T150000Z",
      "DTSTART:20261105T150000Z",
      "DURATION:PT30M",
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:cancelled",
      "DTSTART:20261102T170000Z",
      "DTEND:20261102T180000Z",
      "STATUS:CANCELLED",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:free",
      "DTSTART:20261102T190000Z",
      "DTEND:20261102T200000Z",
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    );
    const feed = serializeBusyCalendarFeed([raw], { identitySalt: salt, now });
    expect(feed.report).toEqual({
      published: 1,
      omittedCancelled: 2,
      omittedFree: 2,
      unsupported: 0,
    });
    expect(events(feed.ics)[0]).toEqual([
      expect.stringMatching(/^UID:/),
      "DTSTAMP:20261103T120000Z",
      "DTSTART:20261102T150000Z",
      "DURATION:PT30M",
      "RRULE:FREQ=DAILY;COUNT=5",
      "EXDATE:20261103T150000Z",
      "EXDATE:20261104T150000Z",
      "EXDATE:20261105T150000Z",
      "SUMMARY:Busy",
      "TRANSP:OPAQUE",
    ]);
  });

  it("keeps all-day dates, overlapping intervals and orphan instances", () => {
    const feed = serializeBusyCalendarFeed(
      [
        ics(
          "BEGIN:VEVENT",
          "UID:all-day",
          "DTSTART;VALUE=DATE:20261108",
          "DTEND;VALUE=DATE:20261110",
          "END:VEVENT",
        ),
        ics(
          "BEGIN:VEVENT",
          "UID:overlap",
          "DTSTART:20261108T100000Z",
          "DTEND:20261108T110000Z",
          "END:VEVENT",
        ),
        ics(
          "BEGIN:VEVENT",
          "UID:invitation",
          "RECURRENCE-ID:20261112T100000Z",
          "DTSTART:20261112T100000Z",
          "DTEND:20261112T103000Z",
          "END:VEVENT",
        ),
      ],
      { identitySalt: salt, now },
    );
    const [allDay, overlap, orphan] = events(feed.ics);
    expect(allDay).toContain("DTSTART;VALUE=DATE:20261108");
    expect(allDay).toContain("DTEND;VALUE=DATE:20261110");
    expect(overlap).toContain("DTSTART:20261108T100000Z");
    expect(orphan).toContain("DTSTART:20261112T100000Z");
    expect(orphan?.some((line) => line.startsWith("RECURRENCE-ID"))).toBe(
      false,
    );
    expect(feed.report.published).toBe(3);
  });

  it("reports events it cannot publish faithfully", () => {
    const feed = serializeBusyCalendarFeed(
      [
        ics("BEGIN:VEVENT", "UID:no-start", "SUMMARY:x", "END:VEVENT"),
        ics(
          "BEGIN:VEVENT",
          "UID:exrule",
          "DTSTART:20261102T100000Z",
          "DTEND:20261102T110000Z",
          "EXRULE:FREQ=WEEKLY",
          "END:VEVENT",
        ),
        ics(
          "BEGIN:VEVENT",
          "UID:period",
          "DTSTART:20261102T100000Z",
          "DTEND:20261102T110000Z",
          "RDATE;VALUE=PERIOD:20261103T100000Z/PT1H",
          "END:VEVENT",
        ),
        ics(
          "BEGIN:VEVENT",
          "UID:range",
          "RECURRENCE-ID;RANGE=THISANDFUTURE:20261105T100000Z",
          "DTSTART:20261105T120000Z",
          "DTEND:20261105T130000Z",
          "END:VEVENT",
        ),
      ],
      { identitySalt: salt, now },
    );
    expect(feed.report).toEqual({
      published: 2,
      omittedCancelled: 0,
      omittedFree: 0,
      unsupported: 4,
    });
  });

  it("gives each feed stable identities that do not reveal or link source UIDs", () => {
    const raw = ics(
      "BEGIN:VEVENT",
      "UID:meeting-42@example.test",
      "DTSTART:20261102T100000Z",
      "DTEND:20261102T110000Z",
      "END:VEVENT",
    );
    const uid = (identitySalt: string) =>
      events(
        serializeBusyCalendarFeed([raw], { identitySalt, now }).ics,
      )[0]?.[0];
    expect(uid(salt)).toBe(uid(salt));
    expect(uid(salt)).not.toBe(uid("feed-salt-two"));
    expect(uid(salt)).not.toContain("meeting-42");
  });
});
