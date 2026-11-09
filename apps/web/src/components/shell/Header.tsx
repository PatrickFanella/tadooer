import type { ReactNode } from "react";
import { ChevronDown, Plus, Play, UserRound } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FocusStrip, type FocusStripProps } from "./FocusStrip.tsx";
import { SyncIndicator, type SyncIndicatorProps } from "./SyncIndicator.tsx";

export interface HeaderProps {
  readonly title: ReactNode;
  readonly focus: FocusStripProps;
  readonly sync: SyncIndicatorProps;
  readonly conflictCount: number;
  readonly commandTrigger: ReactNode;
  readonly ownerName: string;
  readonly onSignOut: () => void;
  readonly formError: string | null;
  readonly onAddTask?: () => void;
  readonly onStartFocus?: (() => void) | undefined;
}

/** The workspace header (issue #194): view title, focus strip, status. */
export const Header = ({
  title,
  focus,
  sync,
  conflictCount,
  commandTrigger,
  ownerName,
  onSignOut,
  formError,
  onAddTask,
  onStartFocus,
}: HeaderProps) => (
  <header className="header">
    <div className="header__row">
      <h1 className="header__title">{title}</h1>
      <FocusStrip {...focus} />
      <div className="header__status">
        {onStartFocus !== undefined && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="rounded-full text-primary"
            onClick={onStartFocus}
            aria-label="Start focus"
            title="Start focus"
          >
            <Play aria-hidden="true" />
          </Button>
        )}
        {onAddTask !== undefined && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="header__add hidden rounded-full text-primary min-[64.001rem]:inline-flex"
            onClick={onAddTask}
            aria-label="Add a task"
            title="Add a task"
          >
            <Plus aria-hidden="true" />
          </Button>
        )}
        {conflictCount > 0 && (
          <Badge variant="destructive" className="header__conflicts">
            {conflictCount} {conflictCount === 1 ? "conflict" : "conflicts"}
          </Badge>
        )}
        <SyncIndicator {...sync} />
        {commandTrigger}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="header__account"
              aria-label={`Account menu for ${ownerName}`}
            >
              <UserRound className="sm:hidden" aria-hidden="true" />
              <span className="hidden sm:inline">{ownerName}</span>
              <ChevronDown className="hidden sm:block" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onSignOut}>Sign out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
    {formError !== null && (
      <Alert variant="destructive" className="message message-error">
        <AlertDescription>{formError}</AlertDescription>
      </Alert>
    )}
  </header>
);
