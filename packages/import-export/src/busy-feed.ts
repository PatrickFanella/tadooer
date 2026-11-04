// Busy-only calendar publication (issue #189, ADR 0055).
//
// A busy-only feed tells a recipient when the owner is occupied and nothing
// else. Every output property is rebuilt from a validated value; nothing is
// copied from the source line, so titles, notes, locations, attendees, URLs,
// extension properties, parameters and original UIDs cannot leak through.

import { createHash } from "node:crypto";
import { splitVEventComponents, unfoldIcsLines } from "./ics-lines.ts";

export interface BusyFeedReport {
  /** VEVENT components published, overrides included. */
  readonly published: number;
  /** Events and instances left out because they are cancelled. */
  readonly omittedCancelled: number;
  /** Events and instances left out because they are marked free. */
  readonly omittedFree: number;
  /**
   * Events Tadooer could not publish faithfully: no usable start, an unknown
   * time zone, or recurrence it cannot validate. Recipients see these as
   * free (or, for recurrence, only the first occurrence), so the owner is
   * told about them.
   */
  readonly unsupported: number;
}

export interface BusyFeed {
  readonly ics: string;
  readonly report: BusyFeedReport;
}

interface Property {
  readonly name: string;
  readonly params: ReadonlyMap<string, string>;
  readonly value: string;
}

const parseProperty = (line: string): Property | undefined => {
  let index = 0;
  let quoted = false;
  let nameEnd = -1;
  for (; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') quoted = !quoted;
    else if (!quoted && (character === ";" || character === ":")) {
      if (nameEnd < 0) nameEnd = index;
      if (character === ":") break;
    }
  }
  if (nameEnd < 0 || index >= line.length) return undefined;
  const name = line.slice(0, nameEnd).toUpperCase();
  const params = new Map<string, string>();
  const rawParams = line.slice(nameEnd + 1, index);
  if (line[nameEnd] === ";" && rawParams.length > 0) {
    const parts: string[] = [];
    let current = "";
    let inQuotes = false;
    for (const character of rawParams) {
      if (character === '"') inQuotes = !inQuotes;
      if (character === ";" && !inQuotes) {
        parts.push(current);
        current = "";
      } else current += character;
    }
    parts.push(current);
    for (const part of parts) {
      const equals = part.indexOf("=");
      if (equals > 0)
        params.set(
          part.slice(0, equals).toUpperCase(),
          part.slice(equals + 1).replace(/^"(.*)"$/, "$1"),
        );
    }
  }
  return { name, params, value: line.slice(index + 1) };
};

const dateValue = /^\d{8}$/;
const dateTimeValue = /^\d{8}T\d{6}Z?$/;
const durationValue =
  /^[+-]?P(?:\d+W|(?:\d+D)?(?:T(?:\d+H)?(?:\d+M)?(?:\d+S)?)?)$/;
const rruleKeys = new Set([
  "FREQ",
  "UNTIL",
  "COUNT",
  "INTERVAL",
  "BYSECOND",
  "BYMINUTE",
  "BYHOUR",
  "BYDAY",
  "BYMONTHDAY",
  "BYYEARDAY",
  "BYWEEKNO",
  "BYMONTH",
  "BYSETPOS",
  "WKST",
]);
const rruleFrequencies = new Set([
  "SECONDLY",
  "MINUTELY",
  "HOURLY",
  "DAILY",
  "WEEKLY",
  "MONTHLY",
  "YEARLY",
]);

const knownTimeZone = (tzid: string): boolean => {
  if (!/^[A-Za-z][A-Za-z0-9_+\-/]{0,63}$/.test(tzid)) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tzid });
    return true;
  } catch {
    return false;
  }
};

/** A validated date or date-time with only VALUE and an IANA TZID kept. */
interface Moment {
  readonly kind: "date" | "date-time";
  readonly value: string;
  readonly tzid: string | null;
}

const moment = (property: Property): Moment | "unknown-zone" | undefined => {
  const explicit = property.params.get("VALUE")?.toUpperCase();
  const kind =
    explicit === "DATE" ||
    (explicit === undefined && dateValue.test(property.value))
      ? "date"
      : "date-time";
  if (kind === "date" && !dateValue.test(property.value)) return undefined;
  if (kind === "date-time" && !dateTimeValue.test(property.value))
    return undefined;
  const tzid = property.params.get("TZID") ?? null;
  if (kind === "date" || property.value.endsWith("Z") || tzid === null)
    return { kind, value: property.value, tzid: null };
  return knownTimeZone(tzid)
    ? { kind, value: property.value, tzid }
    : "unknown-zone";
};

const momentLine = (name: string, value: Moment): string =>
  value.kind === "date"
    ? `${name};VALUE=DATE:${value.value}`
    : value.tzid === null
      ? `${name}:${value.value}`
      : `${name};TZID=${value.tzid}:${value.value}`;

/** A date list (RDATE/EXDATE) rebuilt from validated values. */
const momentList = (
  property: Property,
):
  | { kind: "date" | "date-time"; values: string[]; tzid: string | null }
  | undefined => {
  const values = property.value.split(",");
  const first = moment({ ...property, value: values[0] ?? "" });
  if (first === undefined || first === "unknown-zone") return undefined;
  for (const value of values) {
    const checked = moment({ ...property, value });
    if (checked === undefined || checked === "unknown-zone") return undefined;
    if (checked.kind !== first.kind) return undefined;
  }
  return { kind: first.kind, values, tzid: first.tzid };
};

const listLine = (
  name: string,
  list: {
    kind: "date" | "date-time";
    values: readonly string[];
    tzid: string | null;
  },
): string =>
  list.kind === "date"
    ? `${name};VALUE=DATE:${list.values.join(",")}`
    : list.tzid === null
      ? `${name}:${list.values.join(",")}`
      : `${name};TZID=${list.tzid}:${list.values.join(",")}`;

const validRrule = (value: string): boolean => {
  const parts = value.split(";");
  let frequency = false;
  for (const part of parts) {
    const [key, item, ...rest] = part.split("=");
    if (key === undefined || item === undefined || rest.length > 0)
      return false;
    if (!rruleKeys.has(key) || !/^[A-Z0-9,+-]+$/.test(item)) return false;
    if (key === "FREQ") {
      if (!rruleFrequencies.has(item)) return false;
      frequency = true;
    }
    if (key === "UNTIL" && !dateValue.test(item) && !dateTimeValue.test(item))
      return false;
  }
  return frequency;
};

interface ParsedEvent {
  readonly uid: string;
  readonly recurrenceId: Moment | undefined;
  readonly cancelled: boolean;
  readonly free: boolean;
  /** Rebuilt lines between DTSTART and the end of the time properties. */
  readonly timeLines: readonly string[];
  readonly unsupported: boolean;
  readonly omitted: boolean;
}

const parseEvent = (lines: readonly string[]): ParsedEvent => {
  const properties: Property[] = [];
  let depth = 0;
  for (const line of lines.slice(1, -1)) {
    if (line.startsWith("BEGIN:")) depth += 1;
    else if (line.startsWith("END:")) depth -= 1;
    else if (depth === 0) {
      const property = parseProperty(line);
      if (property !== undefined) properties.push(property);
    }
  }
  const first = (name: string) => properties.find((item) => item.name === name);
  const all = (name: string) => properties.filter((item) => item.name === name);
  const uid = first("UID")?.value ?? "";
  const status = first("STATUS")?.value.toUpperCase();
  const transparency = first("TRANSP")?.value.toUpperCase();
  const recurrenceProperty = first("RECURRENCE-ID");
  const recurrence =
    recurrenceProperty === undefined ? undefined : moment(recurrenceProperty);
  const base = {
    uid,
    recurrenceId:
      recurrence === undefined || recurrence === "unknown-zone"
        ? undefined
        : recurrence,
    cancelled: status === "CANCELLED",
    free: transparency === "TRANSPARENT",
  };
  const startProperty = first("DTSTART");
  const start = startProperty === undefined ? undefined : moment(startProperty);
  if (
    start === undefined ||
    start === "unknown-zone" ||
    recurrence === "unknown-zone" ||
    (recurrenceProperty !== undefined &&
      (recurrence === undefined || recurrenceProperty.params.has("RANGE")))
  )
    return { ...base, timeLines: [], unsupported: true, omitted: true };
  const timeLines = [momentLine("DTSTART", start)];
  let unsupported = false;
  const endProperty = first("DTEND");
  const durationProperty = first("DURATION");
  if (endProperty !== undefined) {
    const end = moment(endProperty);
    if (end === undefined || end === "unknown-zone" || end.kind !== start.kind)
      return { ...base, timeLines: [], unsupported: true, omitted: true };
    timeLines.push(momentLine("DTEND", end));
  } else if (durationProperty !== undefined) {
    if (!durationValue.test(durationProperty.value))
      return { ...base, timeLines: [], unsupported: true, omitted: true };
    timeLines.push(`DURATION:${durationProperty.value}`);
  }
  if (base.recurrenceId === undefined) {
    for (const rule of all("RRULE")) {
      if (validRrule(rule.value)) timeLines.push(`RRULE:${rule.value}`);
      else unsupported = true;
    }
    for (const rdate of all("RDATE")) {
      const list =
        rdate.params.get("VALUE")?.toUpperCase() === "PERIOD"
          ? undefined
          : momentList(rdate);
      if (list === undefined) unsupported = true;
      else timeLines.push(listLine("RDATE", list));
    }
    for (const exdate of all("EXDATE")) {
      const list = momentList(exdate);
      if (list === undefined) unsupported = true;
      else timeLines.push(listLine("EXDATE", list));
    }
    if (first("EXRULE") !== undefined) unsupported = true;
  }
  return { ...base, timeLines, unsupported, omitted: false };
};

/** VTIMEZONE components rebuilt from validated offsets and rules only. */
const timeZoneComponents = (
  lines: readonly string[],
): Map<string, string[]> => {
  const zones = new Map<string, string[]>();
  let current: string[] | undefined;
  let tzid: string | undefined;
  for (const line of lines) {
    if (line === "BEGIN:VTIMEZONE") {
      current = [line];
      tzid = undefined;
      continue;
    }
    if (current === undefined) continue;
    if (line === "END:VTIMEZONE") {
      current.push(line);
      if (tzid !== undefined && knownTimeZone(tzid) && !zones.has(tzid))
        zones.set(tzid, current);
      current = undefined;
      continue;
    }
    if (/^(BEGIN|END):(STANDARD|DAYLIGHT)$/.test(line)) {
      current.push(line);
      continue;
    }
    const property = parseProperty(line);
    if (property === undefined) continue;
    if (property.name === "TZID") {
      tzid = property.value;
      current.push(`TZID:${property.value}`);
    } else if (
      (property.name === "TZOFFSETFROM" || property.name === "TZOFFSETTO") &&
      /^[+-]\d{4}(\d{2})?$/.test(property.value)
    )
      current.push(`${property.name}:${property.value}`);
    else if (property.name === "DTSTART" && dateTimeValue.test(property.value))
      current.push(`DTSTART:${property.value}`);
    else if (property.name === "RRULE" && validRrule(property.value))
      current.push(`RRULE:${property.value}`);
    else if (
      property.name === "RDATE" &&
      property.value.split(",").every((value) => dateTimeValue.test(value))
    )
      current.push(`RDATE:${property.value}`);
  }
  return zones;
};

const stamp = (now: Date): string =>
  `${now.toISOString().replaceAll(/[-:]/g, "").slice(0, 15)}Z`;

/**
 * Serializes busy-only VEVENTs from raw calendar resources. `identitySalt` is
 * a per-feed secret: output UIDs are stable for one feed and unlinkable to the
 * source UID or to another feed's output.
 */
export const serializeBusyCalendarFeed = (
  rawResources: readonly string[],
  options: { readonly identitySalt: string; readonly now: Date },
): BusyFeed => {
  const identity = (uid: string) =>
    `${createHash("sha256")
      .update(options.identitySalt)
      .update("\0")
      .update(uid)
      .digest("hex")
      .slice(0, 32)}@busy.tadooer`;
  const dtstamp = `DTSTAMP:${stamp(options.now)}`;
  const zones = new Map<string, string[]>();
  const events: string[][] = [];
  const emittedMasters = new Set<string>();
  let omittedCancelled = 0;
  let omittedFree = 0;
  let unsupported = 0;
  for (const raw of rawResources) {
    const lines = unfoldIcsLines(raw);
    if (lines === undefined) {
      unsupported += 1;
      continue;
    }
    for (const [tzid, component] of timeZoneComponents(lines))
      if (!zones.has(tzid)) zones.set(tzid, component);
    const parsed = splitVEventComponents(lines).components.map(parseEvent);
    const masters = parsed.filter((event) => event.recurrenceId === undefined);
    const overrides = parsed.filter(
      (event) => event.recurrenceId !== undefined,
    );
    const exclusions = new Map<string, string[]>();
    for (const override of overrides) {
      const hasMaster = masters.some(
        (master) =>
          master.uid === override.uid &&
          !master.cancelled &&
          !master.free &&
          !master.omitted,
      );
      if (override.cancelled || override.free) {
        if (override.cancelled) omittedCancelled += 1;
        else omittedFree += 1;
        const recurrenceId = override.recurrenceId;
        if (hasMaster && recurrenceId !== undefined)
          exclusions.set(override.uid, [
            ...(exclusions.get(override.uid) ?? []),
            momentLine("EXDATE", recurrenceId),
          ]);
        continue;
      }
      if (override.omitted) {
        unsupported += 1;
        continue;
      }
      const recurrenceId = override.recurrenceId;
      if (recurrenceId === undefined) continue;
      events.push(
        hasMaster
          ? [
              `UID:${identity(override.uid)}`,
              momentLine("RECURRENCE-ID", recurrenceId),
              ...override.timeLines,
            ]
          : [
              `UID:${identity(`${override.uid}\0${recurrenceId.value}`)}`,
              ...override.timeLines,
            ],
      );
    }
    for (const master of masters) {
      if (master.cancelled) {
        omittedCancelled += 1;
        continue;
      }
      if (master.free) {
        omittedFree += 1;
        continue;
      }
      if (master.unsupported) unsupported += 1;
      if (master.omitted || emittedMasters.has(master.uid)) continue;
      emittedMasters.add(master.uid);
      events.push([
        `UID:${identity(master.uid)}`,
        ...master.timeLines,
        ...(exclusions.get(master.uid) ?? []),
      ]);
    }
  }
  const body = events.map((event) => [
    "BEGIN:VEVENT",
    event[0] ?? "",
    dtstamp,
    ...event.slice(1),
    "SUMMARY:Busy",
    "TRANSP:OPAQUE",
    "END:VEVENT",
  ]);
  return {
    ics: [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Tadooer//Busy-only publication v1//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "X-WR-CALNAME:Busy",
      ...[...zones.values()].flat(),
      ...body.flat(),
      "END:VCALENDAR",
      "",
    ].join("\r\n"),
    report: {
      published: events.length,
      omittedCancelled,
      omittedFree,
      unsupported,
    },
  };
};
