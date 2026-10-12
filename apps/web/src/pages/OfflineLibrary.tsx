import { useEffect, useState, type ReactNode } from "react";
import {
  readonlyFeedKinds,
  readonlyFeedSnapshotSchema,
  type ReadonlyFeedKind,
  type ReadonlyFeedSnapshot,
} from "@suite/contracts";
import { LocalStore } from "../local-store.ts";

const labels: Partial<Record<ReadonlyFeedKind, string>> = {
  section: "Sections",
  task_view: "Saved task views",
  menu_folder: "Menu folders",
  application_preferences: "Application preferences",
  planning_preferences: "Planning preferences",
  notification_preferences: "Notification preferences",
  capture_preferences: "Capture preferences",
  task_links: "Links and attachments",
  recurring_series: "Recurring tasks",
};
const hidden = new Set([
  "id",
  "taskId",
  "ownerId",
  "createdAt",
  "updatedAt",
  "revision",
  "connectionId",
  "position",
  "sourcePath",
]);
const label = (key: string) =>
  ({
    taskIds: "Tasks",
    itemIds: "Items",
    projectId: "Project",
    tagIds: "Tags",
    parentId: "Parent",
    contextId: "Context",
  })[key] ?? key.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ");
const display = (
  value: unknown,
  names: ReadonlyMap<string, string>,
): ReactNode => {
  if (value === null) return "None";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value))
    return names.get(value) ?? "Unavailable item";
  if (typeof value === "string" && /^https?:\/\//.test(value))
    return (
      <a href={value} target="_blank" rel="noreferrer">
        {value}
      </a>
    );
  if (typeof value === "string" || typeof value === "number")
    return String(value);
  if (Array.isArray(value))
    return value.length === 0 ? (
      "None"
    ) : (
      <ul>
        {value.map((item, index) => (
          <li key={index}>{display(item, names)}</li>
        ))}
      </ul>
    );
  if (typeof value === "object")
    return (
      <dl>
        {Object.entries(value)
          .filter(([key]) => !hidden.has(key))
          .map(([key, item]) => (
            <div key={key}>
              <dt>{label(key)}</dt>
              <dd>{display(item, names)}</dd>
            </div>
          ))}
      </dl>
    );
  return "Unavailable";
};
/** Cold-start reads of the remaining feed families; every mutation stays online. */
export const OfflineLibrary = () => {
  const [names, setNames] = useState<ReadonlyMap<string, string>>(new Map());
  const [records, setRecords] = useState<ReadonlyFeedSnapshot[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void new LocalStore()
      .loadCachedEntities()
      .then(async (items) => {
        const store = new LocalStore();
        const [tasks, projects, tags] = await Promise.all([
          store.loadCachedTasks(),
          store.loadCachedProjects(),
          store.loadCachedTags(),
        ]);
        if (active)
          setNames(
            new Map([
              ...tasks.map(({ task }) => [task.id, task.title] as const),
              ...projects.map((p) => [p.id, p.title] as const),
              ...tags.map((t) => [t.id, t.displayName] as const),
              ...items.flatMap((item) =>
                typeof item.value === "object" &&
                item.value !== null &&
                "title" in item.value &&
                typeof item.value.title === "string"
                  ? [[item.id, item.value.title] as const]
                  : [],
              ),
            ]),
          );
        if (active)
          setRecords(
            items.flatMap((item) => {
              if (
                !readonlyFeedKinds.includes(item.entityKind as ReadonlyFeedKind)
              )
                return [];
              const parsed = readonlyFeedSnapshotSchema.safeParse({
                entityKind: item.entityKind,
                value: item.value,
              });
              return parsed.success ? [parsed.data] : [];
            }),
          );
      })
      .catch(() => {
        if (active) setError("Saved workspace could not be opened.");
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <section aria-label="Saved workspace">
      <h1>Saved workspace</h1>
      <p>These records are read-only offline. Connect to change them.</p>
      {error && <p role="alert">{error}</p>}
      {Object.entries(labels).map(([kind, title]) => (
        <section key={kind}>
          <h2>{title}</h2>
          {records
            .filter((r) => r.entityKind === kind)
            .map((record) => (
              <article key={record.value.id}>
                {display(record.value, names)}
              </article>
            ))}
        </section>
      ))}
    </section>
  );
};
