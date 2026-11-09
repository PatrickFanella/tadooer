import type { SyntheticEvent } from "react";

/** Reveal before focusing controls skipped by a closed disclosure's rendering. */
export function revealSettingsTarget(target: HTMLElement): () => void {
  const opened: HTMLDetailsElement[] = [];
  let parent = target.parentElement;
  while (parent !== null) {
    if (parent instanceof HTMLDetailsElement && !parent.open) {
      parent.open = true;
      opened.push(parent);
    }
    parent = parent.parentElement;
  }
  const control = target.matches("input, select, textarea, button")
    ? target
    : target instanceof HTMLLabelElement &&
        target.control instanceof HTMLElement
      ? target.control
      : target.querySelector<HTMLElement>("input, select, textarea, button");
  let cancelled = false;
  const frame = requestAnimationFrame(() => {
    target.getBoundingClientRect();
    const animations = opened.flatMap((details) =>
      details.getAnimations({ subtree: true }),
    );
    void Promise.all(
      animations.map((animation) => animation.finished.catch(() => undefined)),
    ).then(() => {
      if (cancelled || !target.isConnected) return;
      const focusTarget =
        control === null || control.matches(":disabled") ? target : control;
      if (focusTarget === target && control !== target) target.tabIndex = -1;
      focusTarget.focus({ preventScroll: true });
      target.scrollIntoView({ block: "center", behavior: "instant" });
    });
  });
  return () => {
    cancelled = true;
    cancelAnimationFrame(frame);
  };
}

/** Retain native constraints, with a visible error and focus after expansion. */
export function revealInvalidSetting(
  event: SyntheticEvent<HTMLFormElement>,
): string {
  event.preventDefault();
  const first = event.currentTarget.querySelector<
    HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
  >("input:invalid, select:invalid, textarea:invalid");
  if (first === null) return "Check the highlighted setting.";
  if (first === event.target) revealSettingsTarget(first);
  return first.validationMessage;
}
