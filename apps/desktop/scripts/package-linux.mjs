#!/usr/bin/env node
import { packager } from "@electron/packager";
import process from "node:process";
import { desktopDirectory, outputDirectory, readPackage } from "./artifact.mjs";
import { packageIgnore } from "./mac.mjs";
import { stampingHook } from "./release-build.mjs";

const build = await readPackage();
await packager({
  dir: desktopDirectory,
  out: outputDirectory,
  name: build.productName,
  platform: "linux",
  arch: "x64",
  overwrite: true,
  prune: false,
  appVersion: build.version,
  buildVersion: build.buildVersion,
  ignore: [...packageIgnore],
  afterCopy: [stampingHook(build, "linux", "x64", process.env)],
});
