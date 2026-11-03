import { useState } from "react";
import type { Project } from "@suite/contracts";
import { Button } from "../ui/button.tsx";
import { NativeSelect } from "../ui/native-select.tsx";

export interface BulkBarProps {
  readonly count: number;
  readonly projects: readonly Project[];
  readonly busy: boolean;
  readonly online: boolean;
  readonly onComplete: () => void;
  readonly onArchive: () => void;
  readonly onDelete: () => void;
  readonly onMoveToProject: (projectId: string | null) => void;
  readonly onClear: () => void;
}

/** Replaces the add bar while two or more rows are selected (issue #194). */
export const BulkBar = ({
  count,
  projects,
  busy,
  online,
  onComplete,
  onArchive,
  onDelete,
  onMoveToProject,
  onClear,
}: BulkBarProps) => {
  const [projectId, setProjectId] = useState("");
  return (
    <div className="bulk-bar" role="toolbar" aria-label="Selected tasks">
      <span className="bulk-bar__count">{count} selected</span>
      <Button type="button" size="sm" disabled={busy} onClick={onComplete}>
        Complete
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={busy || !online}
        title={online ? undefined : "Reconnect to archive."}
        onClick={onArchive}
      >
        Archive
      </Button>
      <Button
        type="button"
        size="sm"
        variant="destructive"
        disabled={busy}
        onClick={onDelete}
      >
        Delete
      </Button>
      <label className="bulk-bar__move">
        <span className="sr-only">Move to project</span>
        <NativeSelect
          value={projectId}
          disabled={busy}
          onChange={(event) => setProjectId(event.currentTarget.value)}
        >
          <option value="">Move to project…</option>
          <option value="none">No project</option>
          {projects
            .filter((project) => project.archivedAt === null)
            .map((project) => (
              <option key={project.id} value={project.id}>
                {project.title}
              </option>
            ))}
        </NativeSelect>
      </label>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={busy || projectId === ""}
        onClick={() => {
          onMoveToProject(projectId === "none" ? null : projectId);
          setProjectId("");
        }}
      >
        Move
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={onClear}>
        Clear
      </Button>
    </div>
  );
};
