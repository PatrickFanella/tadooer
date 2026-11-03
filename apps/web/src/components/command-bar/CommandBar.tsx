import { useEffect, useRef, useState } from "react";
import { CommandIcon } from "lucide-react";
import type { Project, Tag } from "@suite/contracts";
import {
  workspaceRoutes,
  routeLabel,
  type Location,
  type WorkspaceRoute,
} from "@/app/routes";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { useApplicationPreferences } from "@/application-preferences";
import { formatBinding, shortcutActionFor } from "@/shortcuts";

interface CommandBarProps {
  readonly onNavigate: (target: WorkspaceRoute | Location) => void;
  /** Issue #194: project and tag contexts, listed like the sidebar. */
  readonly projects?: readonly Project[] | undefined;
  readonly tags?: readonly Tag[] | undefined;
  readonly onSyncNow: () => void;
  readonly syncAvailable: boolean;
  readonly onShowShortcuts?: (() => void) | undefined;
}

export const CommandBar = ({
  onNavigate,
  projects = [],
  tags = [],
  onSyncNow,
  syncAvailable,
  onShowShortcuts,
}: CommandBarProps) => {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  // ADR 0030: the binding is owner-editable; Ctrl+K by default.
  const overrides = useApplicationPreferences().snapshot.preferences.shortcuts;
  const binding = Object.hasOwn(overrides, "command_bar.open")
    ? (overrides["command_bar.open"] ?? null)
    : "Ctrl+K";

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (shortcutActionFor(event, overrides) === "command_bar.open") {
        event.preventDefault();
        if (!open) {
          returnFocusRef.current =
            document.activeElement instanceof HTMLElement
              ? document.activeElement
              : null;
        }
        setOpen((current) => !current);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, overrides]);

  const navigate = (target: WorkspaceRoute | Location): void => {
    onNavigate(target);
    setOpen(false);
  };
  const visibleProjects = projects.filter(
    (project) => project.archivedAt === null && !project.hiddenFromMenu,
  );
  const visibleTags = tags.filter((tag) => tag.archivedAt === null);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        type="button"
        ref={triggerRef}
        onClick={() => {
          returnFocusRef.current = triggerRef.current;
          setOpen(true);
        }}
        aria-label="Open command bar"
      >
        <CommandIcon aria-hidden="true" />
        Command
        {binding !== null && (
          <CommandShortcut>{formatBinding(binding)}</CommandShortcut>
        )}
      </Button>
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const previous = returnFocusRef.current;
          (previous?.isConnected && previous !== document.body
            ? previous
            : triggerRef.current
          )?.focus();
        }}
      >
        <CommandInput placeholder="Search commands" />
        <CommandList>
          <CommandEmpty>No matching command.</CommandEmpty>
          <CommandGroup heading="Navigate">
            {workspaceRoutes.map((route) => (
              <CommandItem
                key={route}
                value={`navigate ${route}`}
                onSelect={() => navigate(route)}
              >
                {routeLabel(route)}
              </CommandItem>
            ))}
          </CommandGroup>
          {visibleProjects.length > 0 && (
            <CommandGroup heading="Projects">
              {visibleProjects.map((project) => (
                <CommandItem
                  key={project.id}
                  value={`project ${project.title}`}
                  onSelect={() =>
                    navigate({ route: "project", id: project.id })
                  }
                >
                  {project.title}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {visibleTags.length > 0 && (
            <CommandGroup heading="Tags">
              {visibleTags.map((tag) => (
                <CommandItem
                  key={tag.id}
                  value={`tag ${tag.displayName}`}
                  onSelect={() => navigate({ route: "tag", id: tag.id })}
                >
                  #{tag.displayName}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          <CommandGroup heading="Actions">
            <CommandItem
              value="sync now"
              disabled={!syncAvailable}
              onSelect={() => {
                onSyncNow();
                setOpen(false);
              }}
            >
              Sync now
            </CommandItem>
            {onShowShortcuts !== undefined && (
              <CommandItem
                value="keyboard shortcuts"
                onSelect={() => {
                  onShowShortcuts();
                  setOpen(false);
                }}
              >
                Keyboard shortcuts
              </CommandItem>
            )}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
};
