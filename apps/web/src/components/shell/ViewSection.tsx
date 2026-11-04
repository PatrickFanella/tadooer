import * as React from "react";

import { cn } from "@/lib/utils";

// Issue #196: a page section inside the workspace shell. It replaces the
// bordered `Card` stacks on the routes outside Today, Inbox and Tasks: the
// section sits on the page background with a heading row and a divider, and
// only the rows and panels inside it keep their own surface.

function ViewSection({ className, ...props }: React.ComponentProps<"section">) {
  return (
    <section
      data-slot="view-section"
      className={cn(
        "flex flex-col gap-3 border-b border-line pb-5 last:border-b-0",
        className,
      )}
      {...props}
    />
  );
}

function ViewSectionHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="view-section-header"
      className={cn("grid gap-2", className)}
      {...props}
    />
  );
}

function ViewSectionBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="view-section-body"
      className={cn("grid gap-3", className)}
      {...props}
    />
  );
}

export { ViewSection, ViewSectionHeader, ViewSectionBody };
