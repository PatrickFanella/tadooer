import type { ReactNode } from "react";
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
 * The desktop frame (issue #194): sidebar, header, main column and the
 * detail column. Below 64rem the stylesheet stacks the sidebar as a row and
 * hides the detail column; `App` then renders the panel in a sheet.
 */
export const WorkspaceShell = ({
  sidebar,
  header,
  detail,
  bulk = false,
  children,
}: WorkspaceShellProps) => (
  <div
    className="workspace"
    data-collapsed={sidebar.collapsed ? "true" : "false"}
    data-detail={detail === null ? "closed" : "open"}
  >
    <Sidebar {...sidebar} />
    <Header {...header} />
    <main className="main" data-bulk={bulk ? "true" : "false"}>
      {children}
    </main>
    {detail !== null && <div className="detail-column">{detail}</div>}
  </div>
);
