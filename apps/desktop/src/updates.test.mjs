/* global Response */
import { Buffer } from "node:buffer";
import { EventEmitter } from "node:events";
import { createHash } from "node:crypto";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createDesktopUpdater,
  downloadVerifiedUpdate,
  fetchPublisherJson,
} from "./updates.mjs";
import { releaseApiUrl, updateMetadataName } from "./updates-policy.mjs";

const origin = "https://git.subcult.tv/subculture-collective/tadooer";
const version = "0.15.0-rc.12";
const url = (name) => `${origin}/releases/download/v${version}/${name}`;
const archiveName = `tadooer-desktop-${version}-darwin-universal.zip`;
const metadataName = updateMetadataName("darwin", "universal");
const manifest = {
  schemaVersion: 1,
  version,
  buildVersion: "172",
  platform: "darwin",
  arch: "universal",
  installMode: "native",
  artifact: {
    name: archiveName,
    url: url(archiveName),
    size: 4,
    sha256: "a".repeat(64),
  },
  url: url(archiveName),
  size: 4,
  sha256: "a".repeat(64),
  name: version,
  pub_date: "2026-11-04T12:00:00Z",
};
const listing = [
  {
    tag_name: `v${version}`,
    draft: false,
    prerelease: true,
    assets: [
      { name: archiveName, size: 4, browser_download_url: url(archiveName) },
      {
        name: metadataName,
        size: 100,
        browser_download_url: url(metadataName),
      },
    ],
  },
];
const contexts = [];
const directories = [];
afterEach(async () => {
  for (const updater of contexts.splice(0)) updater.dispose();
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});
const harness = (changes = {}) => {
  const native = new EventEmitter();
  native.setFeedURL = vi.fn();
  native.checkForUpdates = vi.fn();
  native.quitAndInstall = vi.fn();
  const dialog = { showMessageBox: vi.fn(async () => ({ response: 0 })) };
  const fetchImplementation = vi.fn(
    async (address) =>
      new Response(
        JSON.stringify(address === releaseApiUrl ? listing : manifest),
      ),
  );
  const beforeInstall = vi.fn();
  const updater = createDesktopUpdater({
    enabled: true,
    current: { version: "0.15.0-rc.11", installMode: "native" },
    platform: "darwin",
    arch: "arm64",
    native,
    dialog,
    fetchImplementation,
    beforeInstall,
    openReleasePage: vi.fn(),
    revealDownload: vi.fn(),
    downloadsDirectory: tmpdir(),
    onChange: vi.fn(),
    ...changes,
  });
  contexts.push(updater);
  return { updater, native, dialog, fetchImplementation, beforeInstall };
};

describe("native desktop update flow", () => {
  it("requires download consent and uses only the validated publisher feed", async () => {
    const h = harness();
    await h.updater.check();
    expect(h.dialog.showMessageBox).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining(version),
        buttons: ["Download update", "Later"],
      }),
    );
    expect(h.native.setFeedURL).toHaveBeenCalledWith({
      url: url(metadataName),
      headers: { "User-Agent": "Tadooer-Desktop-Updater" },
    });
    expect(h.native.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(h.updater.state().phase).toBe("downloading");
  });
  it("leaves the app running when download or restart is declined", async () => {
    const h = harness();
    h.dialog.showMessageBox.mockResolvedValue({ response: 1 });
    await h.updater.check();
    expect(h.native.checkForUpdates).not.toHaveBeenCalled();
    expect(h.native.quitAndInstall).not.toHaveBeenCalled();
  });
  it("prepares the close-to-tray guard before invoking native installation", async () => {
    const order = [];
    const h = harness({ beforeInstall: () => order.push("prepare") });
    h.native.quitAndInstall.mockImplementation(() => order.push("install"));
    await h.updater.check();
    h.native.emit("update-downloaded");
    await vi.waitFor(() => expect(order).toEqual(["prepare", "install"]));
  });
  it("keeps a downloaded update available when restart is postponed", async () => {
    const h = harness();
    await h.updater.check();
    h.dialog.showMessageBox.mockResolvedValue({ response: 1 });
    h.native.emit("update-downloaded");
    await vi.waitFor(() => expect(h.updater.state().phase).toBe("ready"));
    expect(h.native.quitAndInstall).not.toHaveBeenCalled();
    expect(h.updater.state().label).toBe("Restart to update…");
  });
  it("coalesces concurrent checks and does not check again during a download", async () => {
    let finish;
    const gate = new Promise((resolve) => {
      finish = resolve;
    });
    const h = harness({
      fetchImplementation: vi.fn(async (address) => {
        await gate;
        return new Response(
          JSON.stringify(address === releaseApiUrl ? listing : manifest),
        );
      }),
    });
    const a = h.updater.check();
    const b = h.updater.check();
    finish();
    await Promise.all([a, b]);
    await h.updater.check();
    expect(h.native.checkForUpdates).toHaveBeenCalledTimes(1);
  });
  it("does not enable native installation from an ad-hoc build", async () => {
    const openReleasePage = vi.fn();
    const h = harness({
      current: { version: "0.15.0-rc.11", installMode: "download" },
      openReleasePage,
    });
    await h.updater.check();
    expect(h.native.checkForUpdates).not.toHaveBeenCalled();
    expect(openReleasePage).toHaveBeenCalledOnce();
  });
  it("does not issue network requests in unpackaged or self-check runs", async () => {
    const h = harness({ enabled: false });
    h.updater.start();
    await h.updater.check();
    expect(h.fetchImplementation).not.toHaveBeenCalled();
    expect(h.native.checkForUpdates).not.toHaveBeenCalled();
  });
  it("handles native failures without leaking response details into dialogs", async () => {
    const h = harness();
    await h.updater.check();
    h.native.emit("error", new Error("private response details"));
    await vi.waitFor(() => expect(h.updater.state().phase).toBe("idle"));
    expect(JSON.stringify(h.dialog.showMessageBox.mock.calls)).not.toContain(
      "private response details",
    );
  });
});

describe("publisher downloads", () => {
  it("rejects an off-origin redirect instead of forwarding the request", async () => {
    const fetchImplementation = vi.fn(
      async () =>
        new Response(null, {
          status: 302,
          headers: { Location: "https://evil.example/file" },
        }),
    );
    await expect(
      fetchPublisherJson(releaseApiUrl, { fetchImplementation }),
    ).rejects.toThrow();
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
    expect(fetchImplementation.mock.calls[0][1]).toMatchObject({
      credentials: "omit",
      redirect: "manual",
    });
  });
  it("bounds JSON response bodies", async () => {
    await expect(
      fetchPublisherJson(releaseApiUrl, {
        maximumBytes: 4,
        fetchImplementation: async () => new Response("12345"),
      }),
    ).rejects.toThrow();
  });
  it("verifies the exact archive before revealing it, and removes failed downloads", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tadooer-download-test-"));
    directories.push(dir);
    const bytes = Buffer.from("test");
    const artifact = {
      name: `tadooer-desktop-${version}-linux-x64.tar.gz`,
      url: url(`tadooer-desktop-${version}-linux-x64.tar.gz`),
      size: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
    const path = await downloadVerifiedUpdate(artifact, dir, {
      fetchImplementation: async () => new Response(bytes),
    });
    expect(await readFile(path)).toEqual(bytes);
    const before = await readdir(dir);
    await expect(
      downloadVerifiedUpdate({ ...artifact, sha256: "0".repeat(64) }, dir, {
        fetchImplementation: async () => new Response(bytes),
      }),
    ).rejects.toThrow();
    expect(await readdir(dir)).toEqual(before);
    await expect(
      downloadVerifiedUpdate(artifact, dir, {
        fetchImplementation: async () => new Response("oversized"),
      }),
    ).rejects.toThrow();
    expect(await readdir(dir)).toEqual(before);
  });
});
