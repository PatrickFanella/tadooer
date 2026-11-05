import { describe, expect, it } from "vitest";
import {
  compareVersions,
  metadataCandidates,
  releaseApiUrl,
  updateMetadataName,
  validateUpdateMetadata,
} from "./updates-policy.mjs";

const base = "https://git.subcult.tv/subculture-collective/tadooer";
const version = "0.15.0-rc.12";
const asset = (name, size = 100) => ({
  name,
  size,
  browser_download_url: `${base}/releases/download/v${version}/${name}`,
});
const archive = asset(`tadooer-desktop-${version}-darwin-universal.zip`, 200);
const metadata = asset(updateMetadataName("darwin", "universal"));
const release = () => ({
  tag_name: `v${version}`,
  draft: false,
  prerelease: true,
  html_url: `${base}/releases/tag/v${version}`,
  assets: [archive, metadata],
});
const manifest = () => ({
  schemaVersion: 1,
  version,
  buildVersion: "172",
  platform: "darwin",
  arch: "universal",
  installMode: "native",
  artifact: {
    name: archive.name,
    url: archive.browser_download_url,
    size: 200,
    sha256: "a".repeat(64),
  },
  name: version,
  pub_date: "2026-11-04T12:00:00Z",
  url: archive.browser_download_url,
  size: 200,
  sha256: "a".repeat(64),
});

const candidate = () =>
  metadataCandidates([release()], {
    currentVersion: "0.15.0-rc.11",
    platform: "darwin",
    arch: "arm64",
  })[0];

describe("desktop release trust and version policy", () => {
  it("orders numeric prerelease components and stable versions correctly", () => {
    expect(compareVersions("0.15.0-rc.12", "0.15.0-rc.9")).toBe(1);
    expect(compareVersions("0.15.0", "0.15.0-rc.12")).toBe(1);
    expect(compareVersions("0.15.0+build.2", "0.15.0+build.1")).toBe(0);
    expect(compareVersions("1.0.0-alpha", "1.0.0-alpha.1")).toBe(-1);
    expect(() => compareVersions("01.2.3", "1.2.3")).toThrow();
    expect(() => compareVersions("1.2.3-01", "1.2.3")).toThrow();
  });

  it("uses a fixed publisher API independent of the app server", () => {
    expect(releaseApiUrl).toBe(
      "https://git.subcult.tv/api/v1/repos/subculture-collective/tadooer/releases?limit=50",
    );
  });

  it("selects a universal Mac release only when the metadata marker is published", () => {
    const result = candidate();
    expect(result.version).toBe(version);
    expect(result.arch).toBe("universal");
    expect(
      metadataCandidates([{ ...release(), assets: [archive] }], {
        currentVersion: "0.15.0-rc.11",
        platform: "darwin",
        arch: "arm64",
      }),
    ).toEqual([]);
  });

  it("does not downgrade, accept drafts, or move stable installs onto prereleases", () => {
    for (const currentVersion of [version, "0.16.0-rc.1", "0.14.0"])
      expect(
        metadataCandidates([release()], {
          currentVersion,
          platform: "darwin",
          arch: "arm64",
        }),
      ).toEqual([]);
    expect(
      metadataCandidates([{ ...release(), draft: true }], {
        currentVersion: "0.15.0-rc.11",
        platform: "darwin",
        arch: "arm64",
      }),
    ).toEqual([]);
  });

  it("refuses credential-bearing and off-origin metadata addresses", () => {
    for (const url of [
      "http://git.subcult.tv/file",
      "https://evil.example/file",
      "https://owner:password@git.subcult.tv/file",
      "https://git.subcult.tv/not-a-release",
    ])
      expect(
        metadataCandidates(
          [
            {
              ...release(),
              assets: [archive, { ...metadata, browser_download_url: url }],
            },
          ],
          { currentVersion: "0.15.0-rc.11", platform: "darwin", arch: "arm64" },
        ),
      ).toEqual([]);
  });

  it("requires the manifest, archive and native feed to describe the same release", () => {
    expect(
      validateUpdateMetadata(manifest(), candidate()).artifact.sha256,
    ).toBe("a".repeat(64));
    for (const changed of [
      { version: "0.15.0-rc.13" },
      { arch: "x64" },
      { installMode: "anything" },
      { artifact: { ...manifest().artifact, size: 201 } },
      {
        artifact: {
          ...manifest().artifact,
          url: "https://evil.example/payload.zip",
        },
      },
      { artifact: { ...manifest().artifact, sha256: "bad" } },
      { size: 201 },
    ])
      expect(() =>
        validateUpdateMetadata({ ...manifest(), ...changed }, candidate()),
      ).toThrow();
    const bad = manifest();
    bad.url = "https://evil.example/payload.zip";
    expect(() => validateUpdateMetadata(bad, candidate())).toThrow();
  });
});
