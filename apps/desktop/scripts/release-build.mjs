import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  compareVersions,
  publisherOrigin,
  publisherRepository,
} from "../src/updates-policy.mjs";
import { signingRequested } from "./mac-sign.mjs";

export const desktopBuild = (manifest, environment) => {
  const version = environment.SUITE_DESKTOP_VERSION ?? manifest.version;
  compareVersions(version, version);
  const releaseBuild = environment.SUITE_DESKTOP_VERSION !== undefined;
  const buildVersion = releaseBuild
    ? environment.SUITE_DESKTOP_BUILD
    : version.split(/[+-]/, 1)[0];
  if (
    typeof buildVersion !== "string" ||
    !/^\d+(?:\.\d+){0,2}$/.test(buildVersion) ||
    buildVersion.length > 24
  )
    throw new Error("A desktop release needs a numeric SUITE_DESKTOP_BUILD");
  return { version, buildVersion, releaseBuild };
};

export const macShortVersion = (version) => {
  compareVersions(version, version);
  return version.split(/[+-]/, 1)[0];
};

/** Called on the copied application directory before ASAR and code signing. */
export const stageDesktopBuild = async (
  applicationPath,
  build,
  platform,
  arch,
  environment,
) => {
  const path = join(applicationPath, "package.json");
  const manifest = JSON.parse(await readFile(path, "utf8"));
  await writeFile(
    path,
    `${JSON.stringify({ ...manifest, version: build.version }, null, 2)}\n`,
  );
  const stamp = {
    schemaVersion: 1,
    ...build,
    platform,
    arch,
    installMode:
      platform === "darwin" && signingRequested(environment)
        ? "native"
        : "download",
  };
  await writeFile(
    join(dirname(applicationPath), "tadooer-release.json"),
    `${JSON.stringify(stamp, null, 2)}\n`,
  );
};

export const stampingHook =
  (build, platform, arch, environment) =>
  async ({ buildPath }) => {
    await stageDesktopBuild(buildPath, build, platform, arch, environment);
  };

/** The same marker is both client metadata and a native Squirrel server response. */
export const makeUpdateMetadata = (build, archive, publishedAt) => {
  if (
    !build.releaseBuild ||
    build.schemaVersion !== 1 ||
    !["native", "download"].includes(build.installMode)
  )
    throw new Error("Only a stamped release build can publish update metadata");
  const extension = build.platform === "darwin" ? "zip" : "tar.gz";
  const expected = `tadooer-desktop-${build.version}-${build.platform}-${build.arch}.${extension}`;
  if (
    archive.name !== expected ||
    !Number.isSafeInteger(archive.size) ||
    archive.size <= 0 ||
    !/^[0-9a-f]{64}$/.test(archive.sha256)
  )
    throw new Error("The update archive does not match the packaged release");
  const url = `${publisherOrigin}${publisherRepository}/releases/download/v${build.version}/${archive.name}`;
  return {
    ...build,
    artifact: { ...archive, url },
    version: build.version,
    url,
    size: archive.size,
    sha256: archive.sha256,
    name: build.version,
    notes: `Tadooer ${build.version}`,
    pub_date: publishedAt.toISOString(),
  };
};
