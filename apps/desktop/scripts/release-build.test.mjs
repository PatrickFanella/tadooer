import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  desktopBuild,
  makeUpdateMetadata,
  stampingHook,
} from "./release-build.mjs";
import {
  metadataCandidates,
  validateUpdateMetadata,
} from "../src/updates-policy.mjs";

const environment = {
  SUITE_DESKTOP_VERSION: "0.15.0-rc.12",
  SUITE_DESKTOP_BUILD: "172",
  SUITE_MAC_SIGN: "development",
};

describe("desktop release build identity", () => {
  it("uses the tag and monotonic build number without modifying the source manifest", () => {
    const source = { version: "0.1.0" };
    expect(desktopBuild(source, environment)).toEqual({
      version: "0.15.0-rc.12",
      buildVersion: "172",
      releaseBuild: true,
    });
    expect(source).toEqual({ version: "0.1.0" });
    expect(desktopBuild(source, {})).toEqual({
      version: "0.1.0",
      buildVersion: "0.1.0",
      releaseBuild: false,
    });
    expect(() =>
      desktopBuild(source, { SUITE_DESKTOP_VERSION: "0.15.0-rc.12" }),
    ).toThrow();
    expect(() =>
      desktopBuild(source, {
        ...environment,
        SUITE_DESKTOP_BUILD: "172; command",
      }),
    ).toThrow();
  });
  it("stamps the copied app and a resource record before signing", async () => {
    const root = await mkdtemp(join(tmpdir(), "tadooer-stage-test-"));
    const app = join(root, "Resources", "app");
    try {
      await mkdir(app, { recursive: true });
      await writeFile(
        join(app, "package.json"),
        JSON.stringify({ name: "@suite/desktop", version: "0.1.0" }),
      );
      await stampingHook(
        desktopBuild({ version: "0.1.0" }, environment),
        "darwin",
        "universal",
        environment,
      )({
        buildPath: app,
        electronVersion: "43.3.0",
        platform: "darwin",
        arch: "arm64",
      });
      expect(
        JSON.parse(await readFile(join(app, "package.json"), "utf8")).version,
      ).toBe("0.15.0-rc.12");
      const stamp = JSON.parse(
        await readFile(join(root, "Resources", "tadooer-release.json"), "utf8"),
      );
      expect(stamp).toMatchObject({
        releaseBuild: true,
        version: "0.15.0-rc.12",
        buildVersion: "172",
        platform: "darwin",
        arch: "universal",
        installMode: "native",
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it("emits coherent native feed metadata for the exact release archive", () => {
    const build = {
      ...desktopBuild({ version: "0.1.0" }, environment),
      schemaVersion: 1,
      platform: "darwin",
      arch: "universal",
      installMode: "native",
    };
    const archive = {
      name: "tadooer-desktop-0.15.0-rc.12-darwin-universal.zip",
      size: 200,
      sha256: "a".repeat(64),
    };
    const metadata = makeUpdateMetadata(
      build,
      archive,
      new Date("2026-11-04T12:00:00Z"),
    );
    const release = {
      tag_name: "v0.15.0-rc.12",
      draft: false,
      assets: [
        {
          name: archive.name,
          size: archive.size,
          browser_download_url: metadata.artifact.url,
        },
        {
          name: "tadooer-desktop-update-darwin-universal.json",
          size: 100,
          browser_download_url:
            "https://git.subcult.tv/attachments/11111111-1111-4111-8111-111111111111",
        },
      ],
    };
    const candidate = metadataCandidates([release], {
      currentVersion: "0.15.0-rc.11",
      platform: "darwin",
      arch: "arm64",
    })[0];
    expect(validateUpdateMetadata(metadata, candidate)).toEqual(metadata);
    expect(metadata.url).toBe(metadata.artifact.url);
    expect(() =>
      makeUpdateMetadata(
        { ...build, releaseBuild: false },
        archive,
        new Date(),
      ),
    ).toThrow();
    expect(() =>
      makeUpdateMetadata(
        build,
        { ...archive, name: "another.zip" },
        new Date(),
      ),
    ).toThrow();
  });
});
