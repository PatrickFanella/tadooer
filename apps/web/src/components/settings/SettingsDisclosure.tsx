import type { ReactNode } from "react";

/** Native disclosure keeps form controls mounted and preserves their drafts. */
export function SettingsDisclosure({
  title,
  children,
  defaultOpen = false,
}: {
  readonly title: string;
  readonly children: ReactNode;
  readonly defaultOpen?: boolean;
}) {
  return (
    <details className="settings-disclosure" open={defaultOpen}>
      <summary>{title}</summary>
      <div className="settings-disclosure__body">{children}</div>
    </details>
  );
}
