import { Buffer } from "node:buffer";
import { URL } from "node:url";
/* global AbortSignal */
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  clearInterval,
  clearTimeout,
  setInterval,
  setTimeout,
} from "node:timers";
import {
  compareVersions,
  maximumArtifactBytes,
  metadataCandidates,
  publisherAssetUrl,
  releaseApiUrl,
  releasePageUrl,
  validateUpdateMetadata,
} from "./updates-policy.mjs";

const publisherResponse = async (
  address,
  {
    fetchImplementation = globalThis.fetch,
    signal = AbortSignal.timeout(30_000),
  } = {},
) => {
  let url = address;
  for (let redirects = 0; redirects <= 3; redirects++) {
    if (url !== releaseApiUrl && !publisherAssetUrl(url))
      throw new Error("Untrusted update address");
    const response = await fetchImplementation(url, {
      credentials: "omit",
      redirect: "manual",
      signal,
      headers: { "User-Agent": "Tadooer-Desktop-Updater" },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (location === null) throw new Error("Invalid update redirect");
      url = new URL(location, url).href;
      await response.body?.cancel();
      continue;
    }
    if (!response.ok || response.body === null)
      throw new Error("Update publisher unavailable");
    return response;
  }
  throw new Error("Too many update redirects");
};

export const fetchPublisherJson = async (
  url,
  { maximumBytes = 2 * 1024 * 1024, ...options } = {},
) => {
  const response = await publisherResponse(url, options);
  const parts = [];
  let size = 0;
  for await (const part of response.body) {
    size += part.byteLength;
    if (size > maximumBytes)
      throw new Error("Update metadata exceeds its limit");
    parts.push(Buffer.from(part));
  }
  return JSON.parse(Buffer.concat(parts).toString("utf8"));
};

/** Portable Linux archives are verified and revealed, never executed or extracted. */
export const downloadVerifiedUpdate = async (
  artifact,
  downloadsDirectory,
  { fetchImplementation = globalThis.fetch, onProgress = () => {} } = {},
) => {
  if (
    !/^[\w.+-]+\.tar\.gz$/.test(artifact.name) ||
    !Number.isSafeInteger(artifact.size) ||
    artifact.size <= 0 ||
    artifact.size > maximumArtifactBytes ||
    !/^[0-9a-f]{64}$/.test(artifact.sha256)
  )
    throw new Error("Invalid update archive");
  const directory = await mkdtemp(join(downloadsDirectory, ".tadooer-update-"));
  try {
    const response = await publisherResponse(artifact.url, {
      fetchImplementation,
      signal: AbortSignal.timeout(15 * 60_000),
    });
    const hash = createHash("sha256");
    let size = 0;
    const measure = new Transform({
      transform(chunk, _encoding, callback) {
        size += chunk.length;
        if (size > artifact.size)
          return callback(new Error("Update exceeds its declared size"));
        hash.update(chunk);
        onProgress(Math.floor((size * 100) / artifact.size));
        callback(null, chunk);
      },
    });
    const path = join(directory, artifact.name);
    await pipeline(
      Readable.fromWeb(response.body),
      measure,
      createWriteStream(path, { flags: "wx", mode: 0o600 }),
    );
    if (size !== artifact.size || hash.digest("hex") !== artifact.sha256)
      throw new Error("Update checksum or size does not match");
    return path;
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
};

/** Main-process only. No page-provided origin, token, file path or command. */
export const createDesktopUpdater = ({
  enabled,
  current,
  platform,
  arch,
  native,
  dialog,
  fetchImplementation = globalThis.fetch,
  downloadsDirectory,
  revealDownload,
  openReleasePage,
  beforeInstall,
  onChange = () => {},
}) => {
  try {
    compareVersions(current?.version, current?.version);
  } catch {
    enabled = false;
  }
  let phase = "idle";
  let percent;
  let disposed = false;
  let pending;
  let firstTimer;
  let periodicTimer;
  let notifiedVersion;
  let nativeManual = false;
  const state = () => ({
    phase,
    enabled: enabled && ["idle", "ready"].includes(phase),
    label:
      phase === "ready"
        ? "Restart to update…"
        : phase === "checking"
          ? "Checking for updates…"
          : phase === "downloading"
            ? `Downloading update${percent === undefined ? "…" : `… ${String(percent)}%`}`
            : "Check for updates…",
  });
  const change = (next) => {
    phase = next;
    percent = undefined;
    if (!disposed) onChange(state());
  };
  const message = (options) =>
    dialog.showMessageBox({ title: "Tadooer updates", ...options });
  const failed = async (manual, downloading = false) => {
    change("idle");
    if (manual && !disposed)
      await message({
        type: "error",
        message: downloading
          ? "The update could not be downloaded or verified."
          : "Could not check for updates.",
        detail: "Try again later. Your installed app has not changed.",
        buttons: ["OK"],
      });
  };
  const install = async () => {
    if (disposed || phase !== "ready") return;
    const result = await message({
      type: "info",
      message: "Tadooer is ready to update.",
      detail:
        "Restart now to install the update, or continue and install on the next launch.",
      buttons: ["Restart and update", "Later"],
      defaultId: 0,
      cancelId: 1,
    });
    if (result.response !== 0 || disposed || phase !== "ready") return;
    change("installing");
    // Electron closes windows before app.quit: close-to-tray must already be off.
    beforeInstall();
    native.quitAndInstall();
  };
  const downloaded = () => {
    if (disposed || phase !== "downloading") return;
    change("ready");
    void install().catch(() => failed(true, true));
  };
  const nativeError = () => {
    if (!disposed && phase === "downloading") void failed(true, true);
  };
  const nativeUnavailable = () => {
    if (disposed || phase !== "downloading") return;
    change("idle");
    if (nativeManual)
      void message({
        type: "info",
        message: "This release is not ready for automatic installation.",
        detail: "Try again later.",
        buttons: ["OK"],
      });
  };
  native.on("update-downloaded", downloaded);
  native.on("error", nativeError);
  native.on("update-not-available", nativeUnavailable);

  const run = async (manual) => {
    change("checking");
    try {
      const listing = await fetchPublisherJson(releaseApiUrl, {
        fetchImplementation,
      });
      const candidates = metadataCandidates(listing, {
        currentVersion: current.version,
        platform,
        arch,
      });
      if (candidates.length === 0) {
        change("idle");
        if (manual)
          await message({
            type: "info",
            message: "No newer compatible desktop release is available.",
            detail: `Installed desktop: ${current.version}`,
            buttons: ["OK"],
          });
        return;
      }
      const candidate = candidates[0];
      const metadata = validateUpdateMetadata(
        await fetchPublisherJson(candidate.metadataUrl, {
          fetchImplementation,
          maximumBytes: 64 * 1024,
        }),
        candidate,
      );
      if (!manual && notifiedVersion === metadata.version) {
        change("idle");
        return;
      }
      notifiedVersion = metadata.version;
      const automatic =
        platform === "darwin" &&
        current.installMode === "native" &&
        metadata.installMode === "native";
      const browserInstall = platform === "darwin" && !automatic;
      const result = await message({
        type: "info",
        message: `Tadooer ${metadata.version} is available.`,
        detail: browserInstall
          ? "This build needs a manual installation. Download the release and replace the app."
          : automatic
            ? "Download the update now. You can restart when it is ready."
            : "Download and verify the archive, then extract it to replace the portable app. Settings and sign-in are kept separately.",
        buttons: [
          browserInstall ? "Open release page" : "Download update",
          "Later",
        ],
        defaultId: 0,
        cancelId: 1,
      });
      if (result.response !== 0 || disposed) {
        change("idle");
        return;
      }
      if (browserInstall) {
        await openReleasePage(releasePageUrl);
        change("idle");
        return;
      }
      change("downloading");
      if (automatic) {
        nativeManual = true;
        // A per-release default-format Squirrel feed. The main process has
        // already checked SemVer and artifact coherence; Squirrel verifies signing.
        native.setFeedURL({
          url: candidate.metadataUrl,
          headers: { "User-Agent": "Tadooer-Desktop-Updater" },
        });
        native.checkForUpdates();
      } else {
        const path = await downloadVerifiedUpdate(
          metadata.artifact,
          downloadsDirectory,
          {
            fetchImplementation,
            onProgress: (value) => {
              if (value !== percent) {
                percent = value;
                if (!disposed) onChange(state());
              }
            },
          },
        );
        change("idle");
        if (!disposed) {
          revealDownload(path);
          await message({
            type: "info",
            message: "Update downloaded and verified.",
            detail:
              "Extract the archive and replace the portable app after quitting Tadooer. Your settings and sign-in remain in place.",
            buttons: ["OK"],
          });
        }
      }
    } catch {
      await failed(manual || phase === "downloading", phase === "downloading");
    }
  };
  const check = (manual = true) => {
    if (!enabled || disposed || ["downloading", "installing"].includes(phase))
      return Promise.resolve();
    if (phase === "ready") return install();
    if (pending !== undefined) return pending;
    pending = run(manual).finally(() => {
      pending = undefined;
    });
    return pending;
  };
  return {
    state,
    check,
    start() {
      if (!enabled || disposed || firstTimer !== undefined) return;
      firstTimer = setTimeout(() => void check(false), 30_000);
      periodicTimer = setInterval(() => void check(false), 6 * 60 * 60_000);
      firstTimer.unref();
      periodicTimer.unref();
    },
    dispose() {
      disposed = true;
      clearTimeout(firstTimer);
      clearInterval(periodicTimer);
      native.removeListener("update-downloaded", downloaded);
      native.removeListener("error", nativeError);
      native.removeListener("update-not-available", nativeUnavailable);
    },
  };
};
