import * as React from "react";

import { cn } from "@/lib/utils";

type ViewIntroProps = React.ComponentProps<"div"> & {
  /** One line on what the view is for. */
  description?: React.ReactNode;
  /** Right-aligned actions; stacks under the text below 640px. */
  actions?: React.ReactNode;
};

/**
 * Issue #196: the top of a view inside the workspace shell. The shell header
 * already carries the view's `h1`, so this holds only the description and
 * the view's actions.
 */
function ViewIntro({
  className,
  description,
  actions,
  children,
  ...props
}: ViewIntroProps) {
  return (
    <div
      data-slot="view-intro"
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
      {...props}
    >
      {(description !== undefined || children !== undefined) && (
        <div className="grid min-w-0 gap-1">
          {description !== undefined && (
            <p className="text-sm text-subtext">{description}</p>
          )}
          {children}
        </div>
      )}
      {actions !== undefined && (
        <div
          data-slot="view-intro-actions"
          className="flex shrink-0 flex-wrap items-center gap-2 sm:ml-auto sm:justify-end"
        >
          {actions}
        </div>
      )}
    </div>
  );
}

export { ViewIntro };
export type { ViewIntroProps };
