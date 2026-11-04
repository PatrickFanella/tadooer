---
status: accepted
---

# Busy-only calendar feeds

Issue #189, following ADR 0014. Decided 2026-11-03.

A read-only feed (ADR 0014) publishes the stored events of one calendar as
they are. Sharing that address shares titles, notes, locations, attendees and
provider identifiers. A busy-only feed lets the owner share when they are
occupied and nothing else, through the same capability, revocation and
GET/HEAD-only access.

## Visibility is fixed at creation

Each capability has a `visibility` of `full` or `busy`, chosen when it is
created. There is no way to change it afterwards: to switch, the owner creates
a new feed and revokes the old one. An address already handed out therefore
never shows more than it did when it was shared. Migration
`0058_calendar_feed_visibility` marks every existing feed `full`, which is what
those feeds already served. The create request defaults to `full`, so older
clients keep their behavior. The web form defaults to busy-only.

## What a busy-only feed contains

The busy feed reads the same rows as the full feed: the calendar's event
projection plus applied imports. Each VEVENT is rebuilt from validated values;
no source line is copied. The output keeps:

- `DTSTART`, and `DTEND` or `DURATION`, as a date, a UTC date-time, a floating
  date-time or a date-time with an IANA `TZID`;
- `RRULE` (standard parts only), `RDATE` and `EXDATE` on a series, and
  `RECURRENCE-ID` on a moved instance;
- `VTIMEZONE` components for IANA zones, reduced to `TZID`, offsets,
  `DTSTART`, `RRULE` and `RDATE`.

Every event gets `SUMMARY:Busy`, `TRANSP:OPAQUE` and a `DTSTAMP` of the
request time. `UID` is replaced by `sha256(salt, uid)`. The salt is a random
per-feed secret stored with the capability, so identities stay stable for one
feed, do not reveal the source UID, and cannot be matched across two feeds.
Everything else is dropped: titles, descriptions, locations, attendees,
organizers, URLs, attachments, categories, alarms, sequence and modification
times, every `X-` property, and every parameter apart from `VALUE` and `TZID`.

## Semantics

- A cancelled or transparent (free) event is left out. A cancelled or free
  instance of a series becomes an `EXDATE` on the series.
- Recurrence is published as rules, not expanded, so the recipient's client
  applies DST through the IANA zone exactly as it would for the source event.
- All-day events keep their date values; a missing `DTEND` means one day, as in
  RFC 5545.
- Overlapping events stay separate VEVENTs. Busy time is their union in any
  client; Tadooer does not merge them.
- A moved instance whose series is not published is emitted as a standalone
  event.

## Unsupported input is reported, not hidden

Some events cannot be published faithfully: no usable `DTSTART`, a `TZID` that
is not an IANA zone, a `RECURRENCE-ID` with `RANGE`, an `EXRULE`, a `PERIOD`
`RDATE`, or a rule with non-standard parts. An event without a usable start or
zone is left out; an event with an unusable rule is published as its first
occurrence. Both count as `unsupported`. The owner-only
`GET /api/calendars/{id}/feed-preview` returns the full event count and the
busy counts (published, cancelled, free, unsupported), and the feed form warns
when the unsupported count is above zero.

## Task blocks

A task time block is a calendar event written through the existing path.
`completeCalendarWrite` updates the projection when a block is created or
moved, and releasing a block deletes its projection, so the next fetch of
either feed reflects the change. No second task-to-calendar path exists.

## Not included

Team scheduling, booking, free/busy queries (`VFREEBUSY`), CalDAV publishing,
and changing an existing feed's visibility. Real Google and Baikal provider
qualification stays with #50.
