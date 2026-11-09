import { useEffect, useState, type ReactNode } from "react";
import { CalendarDays, ListTodo, Menu, Plus, Sun } from "lucide-react";
import { Button } from "../ui/button.tsx";
import { Sheet, SheetContent, SheetTitle } from "../ui/sheet.tsx";
import { pathForLocation } from "../../app/routes.ts";
import { Header, type HeaderProps } from "./Header.tsx";
import { Sidebar, type SidebarProps } from "./Sidebar.tsx";

export interface WorkspaceShellProps {
  readonly sidebar: SidebarProps;
  readonly header: HeaderProps;
  /** The detail panel for the selected task; null closes the column. */
  readonly detail: ReactNode | null;
  /** True while a bulk bar replaces the add bar (issue #194). */
  readonly bulk?: boolean | undefined;
  readonly children: ReactNode;
}

/**
 * Shared workspace frame. Below 64rem navigation moves to the bottom bar
 * and drawer; `App` renders the selected task in a sheet.
 */
export const WorkspaceShell = ({
  sidebar,
  header,
  detail,
  bulk = false,
  children,
}: WorkspaceShellProps) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [capturePending, setCapturePending] = useState(false);
  const capture = () => {
    sidebar.onNavigate({ route: "inbox" });
    setCapturePending(true);
  };
  useEffect(() => {
    if (!capturePending) return;
    const input = document.querySelector<HTMLInputElement>(
      '.main .add-task-bar input[name="title"]',
    );
    if (input === null) return;
    input.scrollIntoView({ block: "center" });
    input.focus();
    setCapturePending(false);
  }, [capturePending, sidebar.location]);

  const mobileViews = [
    { route: "today", label: "Today", icon: Sun },
    { route: "planner", label: "Planner", icon: CalendarDays },
    { route: "tasks", label: "Tasks", icon: ListTodo },
  ] as const;

  return (
    <div
      className="workspace workspace-frame"
      data-collapsed={sidebar.collapsed ? "true" : "false"}
      data-detail={detail === null ? "closed" : "open"}
    >
      <Sidebar {...sidebar} />
      <Header {...header} onAddTask={capture} />
      <main
        id="workspace-main"
        className="main workspace-content flex min-w-0 flex-col gap-section"
        data-bulk={bulk ? "true" : "false"}
      >
        {children}
      </main>
      {detail !== null && <div className="detail-column">{detail}</div>}
      <nav className="mobile-nav" aria-label="Quick navigation">
        {mobileViews.map(({ route, label, icon: Icon }) => (
          <a
            key={route}
            href={pathForLocation({ route })}
            aria-current={sidebar.location.route === route ? "page" : undefined}
            className="flex flex-1 flex-col items-center justify-center gap-1 text-xs text-muted-foreground no-underline aria-[current=page]:text-primary"
            onClick={(event) => {
              event.preventDefault();
              sidebar.onNavigate({ route });
            }}
          >
            <Icon className="size-5" aria-hidden="true" />
            {label}
          </a>
        ))}
        <Button
          className="rounded-full"
          size="icon-lg"
          onClick={capture}
          aria-label="Add a task"
        >
          <Plus aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="icon-lg"
          onClick={() => setMenuOpen(true)}
          aria-label="Open navigation"
        >
          <Menu aria-hidden="true" />
        </Button>
      </nav>
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent
          side="left"
          className="mobile-menu p-0"
          aria-describedby={undefined}
        >
          <SheetTitle className="sr-only">Workspace navigation</SheetTitle>
          <Sidebar
            {...sidebar}
            collapsed={false}
            onToggleCollapsed={() => setMenuOpen(false)}
            onNavigate={(location) => {
              sidebar.onNavigate(location);
              setMenuOpen(false);
            }}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
};
