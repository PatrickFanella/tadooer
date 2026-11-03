import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
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
}: HeaderProps) => (
  <header className="header">
    <div className="header__row">
      <h1 className="header__title">{title}</h1>
      <FocusStrip {...focus} />
      <div className="header__status">
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
              {ownerName}
              <ChevronDown aria-hidden="true" />
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
