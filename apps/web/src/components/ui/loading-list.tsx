import * as React from "react";

import { cn } from "@/lib/utils";
import { Skeleton } from "./skeleton.tsx";

type LoadingListProps = React.ComponentProps<"div"> & {
  /**
   * Text for assistive technology. With a label the list is a polite status
   * region; without one it is decorative and must sit inside a labelled
   * region of its own.
   */
  label?: string;
  /** Number of placeholder rows. */
  rows?: number;
};

/**
 * Placeholder rows shown while a list loads, so the layout does not jump
 * when the data arrives. Pulse and entry motion follow the reduced-motion
 * rule in the stylesheet.
 */
function LoadingList({
  className,
  label,
  rows = 3,
  ...props
}: LoadingListProps) {
  return (
    <div
      data-slot="loading-list"
      {...(label === undefined
        ? { "aria-hidden": true }
        : { role: "status", "aria-live": "polite" })}
      className={cn("grid gap-3", className)}
      {...props}
    >
      {label !== undefined && <span className="sr-only">{label}</span>}
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="grid gap-1.5" aria-hidden="true">
          <Skeleton className="h-4 w-[min(60%,18rem)]" />
          <Skeleton className="h-3 w-[min(35%,10rem)]" />
        </div>
      ))}
    </div>
  );
}

export { LoadingList };
export type { LoadingListProps };
