import type { ApiRequestError } from "@suite/contracts";

export type SessionFailure = "expired" | "csrf";
const listeners = new Set<(failure: SessionFailure) => void>();

export const subscribeSessionFailure = (
  listener: (failure: SessionFailure) => void,
): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

// Requests retain their originating subscribers. A replaced session unsubscribes
// before a late response arrives, so its failure cannot reach the new generation.
export const captureSessionFailureReporter = (): ((
  error: ApiRequestError,
) => void) => {
  const originatingListeners = [...listeners];
  return (error) => reportSessionFailure(error, originatingListeners);
};

const reportSessionFailure = (
  error: ApiRequestError,
  originatingListeners: readonly ((failure: SessionFailure) => void)[],
): void => {
  const failure =
    (error.status === 401 || error.status === 403) &&
    error.code === "AUTH_REQUIRED"
      ? "expired"
      : error.status === 403 &&
          (error.code === "CSRF_INVALID" || error.code === "CSRF_REQUIRED")
        ? "csrf"
        : null;
  if (failure !== null)
    for (const listener of originatingListeners)
      if (listeners.has(listener)) listener(failure);
};
