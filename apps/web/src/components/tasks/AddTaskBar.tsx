import { useState, type Ref, type SyntheticEvent } from "react";
import { ClipboardPaste, Plus, SlidersHorizontal } from "lucide-react";
import { Button } from "../ui/button.tsx";
import { Checkbox } from "../ui/checkbox.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog.tsx";
import { Input } from "../ui/input.tsx";
import { useApplicationPreferences } from "../../application-preferences.tsx";
import { CapturePasteSection } from "./CapturePasteSection.tsx";

const markersKey = "tadooer.capture:markers";

/** Markers default on (issue #184); the owner's choice is kept per browser. */
export const readMarkersPreference = (): boolean => {
  try {
    return localStorage.getItem(markersKey) !== "off";
  } catch {
    return true;
  }
};

const writeMarkersPreference = (on: boolean) => {
  try {
    localStorage.setItem(markersKey, on ? "on" : "off");
  } catch {
    /* private mode or storage disabled: the choice simply forgets */
  }
};

export interface AddTaskBarProps {
  readonly busy: boolean;
  readonly online: boolean;
  /** ADR 0031: the paste preview is online-only and needs a session token. */
  readonly csrfToken: string | undefined;
  readonly onSubmit: (
    event: SyntheticEvent<HTMLFormElement, SubmitEvent>,
  ) => Promise<void>;
  readonly onTasksCreated?: (() => void) | undefined;
  readonly inputRef?: Ref<HTMLInputElement> | undefined;
}

/**
 * One line to add a task (issue #194), pinned to the top of a list. The
 * form keeps the field names the `App` capture handler reads; markers are
 * sent as `structured` only while online and switched on.
 */
export const AddTaskBar = ({
  busy,
  online,
  csrfToken,
  onSubmit,
  onTasksCreated,
  inputRef,
}: AddTaskBarProps) => {
  const { defaultEstimateMinutes } =
    useApplicationPreferences().snapshot.preferences;
  const [more, setMore] = useState(false);
  const [markers, setMarkers] = useState(readMarkersPreference);
  const [pasteOpen, setPasteOpen] = useState(false);
  const markersState = !online ? "offline" : markers ? "on" : "off";

  return (
    <>
      <form
        className="add-task-bar"
        aria-label="Add a task"
        data-markers={markersState}
        data-more={more ? "true" : "false"}
        onSubmit={(event) => {
          const form = event.currentTarget;
          const input = form.elements.namedItem("title");
          void onSubmit(event).then(() => {
            if (!form.isConnected) return;
            form.reset();
            if (input instanceof HTMLInputElement) input.focus();
          });
        }}
      >
        <div className="add-task-bar__row flex min-h-capture items-center gap-2 rounded-md border border-input bg-card px-2">
          <Plus className="add-task-bar__icon" aria-hidden="true" />
          <Input
            ref={inputRef}
            className="add-task-bar__input h-full border-0 bg-transparent shadow-none focus-visible:ring-0"
            name="title"
            autoComplete="off"
            required
            placeholder="Add new task…"
            title="Try +Project #tag 30m @tomorrow 09:00"
            aria-label="New task"
          />
          {markersState === "on" && (
            <input type="hidden" name="structured" value="on" />
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={more ? "Fewer options" : "More options"}
            aria-expanded={more}
            aria-controls="add-task-bar-more"
            title={more ? "Fewer options" : "More options"}
            onClick={() => setMore((open) => !open)}
          >
            <SlidersHorizontal />
          </Button>
          <Button
            type="submit"
            variant="ghost"
            size="icon"
            className="rounded-full text-primary"
            disabled={busy}
            aria-label={busy ? "Adding…" : "Add"}
          >
            <Plus aria-hidden="true" />
          </Button>
        </div>
        {markersState === "offline" && (
          <p className="add-task-bar__hint">
            Offline: plain capture. Markers apply when the server is back.
          </p>
        )}
        {more && (
          <div className="add-task-bar__more" id="add-task-bar-more">
            <label className="field">
              <span>Notes</span>
              <Input name="notes" autoComplete="off" />
            </label>
            <label className="field add-task-bar__estimate">
              <span>Estimate</span>
              <Input
                name="estimateMinutes"
                type="number"
                min="1"
                max="720"
                key={defaultEstimateMinutes ?? "none"}
                defaultValue={defaultEstimateMinutes ?? ""}
              />
            </label>
            <label className="capture-option">
              <Checkbox name="createTags" />
              Create unknown #tags
            </label>
            <label className="capture-option">
              <Checkbox
                checked={markers}
                disabled={!online}
                onCheckedChange={(checked) => {
                  const on = checked === true;
                  setMarkers(on);
                  writeMarkersPreference(on);
                }}
              />
              {markers ? "Markers on" : "Markers off"}
            </label>
            {csrfToken !== undefined && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={!online}
                onClick={() => setPasteOpen(true)}
              >
                <ClipboardPaste aria-hidden="true" />
                Paste a list
              </Button>
            )}
          </div>
        )}
      </form>
      {csrfToken !== undefined && (
        <Dialog open={pasteOpen} onOpenChange={setPasteOpen}>
          <DialogContent className="add-task-bar__paste">
            <DialogHeader>
              <DialogTitle>Paste a list</DialogTitle>
              <DialogDescription>
                A Markdown list or an email becomes one task per line, after a
                preview.
              </DialogDescription>
            </DialogHeader>
            <CapturePasteSection
              csrfToken={csrfToken}
              busy={busy}
              onTasksCreated={() => {
                setPasteOpen(false);
                onTasksCreated?.();
              }}
            />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
};
