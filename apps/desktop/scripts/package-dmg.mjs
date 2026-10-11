#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import console from "node:console";
import { existsSync } from "node:fs";
import { mkdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import {
  artifactFileName,
  checksumLine,
  manifestDesktopArtifact,
  outputDirectory,
  packagedDirectoryName,
  readPackage,
  sha256File,
} from "./artifact.mjs";
import { macArchitecturesFor } from "./mac.mjs";

/**
 * Makes the macOS disk image of a packaged bundle: a compressed, read-only
 * image whose volume holds `<product>.app` and a link to `/Applications`,
 * so that the usual drag to install works. `hdiutil` exists only on macOS,
 * so this runs on the Mac after `package-mac.mjs`.
 *
 * Writes `tadooer-desktop-<version>-darwin-<arch>.dmg` and its `.sha256`
 * file beside the zip, and verifies the image's own checksum before it
 * reports. The image is not signed or notarised; see
 * docs/operations/desktop.md.
 *
 * Usage: package-dmg.mjs [arch]   (default: universal)
 */

if (process.platform !== "darwin")
  throw new Error("A disk image can only be made on macOS (hdiutil)");

const arch = process.argv[2] ?? "universal";
if (!macArchitecturesFor("darwin").includes(arch))
  throw new Error(`Unsupported macOS architecture: ${arch}`);

const manifest = await readPackage();
const { productName, version } = manifest;
const bundle = `${productName}.app`;
const bundlePath = join(
  outputDirectory,
  packagedDirectoryName(productName, "darwin", arch),
  bundle,
);
if (!existsSync(bundlePath))
  throw new Error(`Application bundle is missing: ${bundlePath}`);

const imageName = artifactFileName(version, "darwin", arch, "dmg");
const imagePath = join(outputDirectory, imageName);
const staging = join(outputDirectory, `dmg-${arch}`);

const run = (command, args) => {
  const result = spawnSync(command, args, {
    stdio: ["ignore", "inherit", "inherit"],
  });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed`);
};

// The volume's contents: the bundle, copied with its links and metadata,
// and the Applications link.
await rm(staging, { recursive: true, force: true });
await mkdir(staging, { recursive: true });
run("ditto", [bundlePath, join(staging, bundle)]);
await symlink("/Applications", join(staging, "Applications"));

try {
  await rm(imagePath, { force: true });
  run("hdiutil", [
    "create",
    "-volname",
    productName,
    "-srcfolder",
    staging,
    "-fs",
    "HFS+",
    "-format",
    "UDZO",
    "-imagekey",
    "zlib-level=9",
    "-quiet",
    imagePath,
  ]);
  run("hdiutil", ["verify", "-quiet", imagePath]);
} finally {
  await rm(staging, { recursive: true, force: true });
}

const sha256 = await sha256File(imagePath);
await writeFile(`${imagePath}.sha256`, `${checksumLine(sha256, imageName)}\n`);
console.log(
  JSON.stringify({
    artifact: imageName,
    sha256,
    bytes: (await stat(imagePath)).size,
    desktopArtifact: manifestDesktopArtifact(imageName, sha256),
  }),
);
