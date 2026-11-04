#!/usr/bin/env node
// Create (or reuse) the Gitea release for a tag and upload files to it.
//
//   node deploy/release-assets.mjs <tag> [file ...]
//
// Environment: GITEA_SERVER_URL (for example https://git.subcult.tv),
// GITEA_REPOSITORY (owner/name) and GITEA_TOKEN. An asset with the same name
// is replaced, so a rerun of the release workflow is safe. A tag with a
// pre-release part (v1.2.3-rc.1) becomes a pre-release.
/* global fetch, FormData */
import console from "node:console";
import { openAsBlob } from "node:fs";
import { basename } from "node:path";
import process from "node:process";

const [tag, ...files] = process.argv.slice(2);
const server = process.env.GITEA_SERVER_URL;
const repository = process.env.GITEA_REPOSITORY;
const token = process.env.GITEA_TOKEN;
if (
  tag === undefined ||
  !/^v\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/.test(tag) ||
  !server ||
  !repository ||
  !token
)
  throw new Error(
    "Usage: release-assets.mjs <vX.Y.Z[-pre]> [file ...] with GITEA_SERVER_URL, GITEA_REPOSITORY and GITEA_TOKEN set",
  );

const api = `${server.replace(/\/$/, "")}/api/v1/repos/${repository}`;
const call = async (path, init = {}) => {
  const response = await fetch(`${api}${path}`, {
    ...init,
    headers: { Authorization: `token ${token}`, ...(init.headers ?? {}) },
  });
  if (!response.ok && response.status !== 404 && response.status !== 409)
    throw new Error(
      `${init.method ?? "GET"} ${path}: ${String(response.status)} ${await response.text()}`,
    );
  return response;
};

let response = await call(`/releases/tags/${encodeURIComponent(tag)}`);
if (response.status === 404) {
  response = await call("/releases", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tag_name: tag,
      name: tag,
      body: `Tadooer ${tag.slice(1)}. Built and deployed by the release workflow.`,
      prerelease: tag.includes("-"),
    }),
  });
  // Two jobs can race to create it; the loser reads the winner's release.
  if (response.status === 404 || response.status === 409)
    response = await call(`/releases/tags/${encodeURIComponent(tag)}`);
}
const release = await response.json();
console.log(`release ${tag}: id ${String(release.id)}`);

for (const file of files) {
  const name = basename(file);
  for (const asset of release.assets ?? [])
    if (asset.name === name)
      await call(`/releases/${String(release.id)}/assets/${String(asset.id)}`, {
        method: "DELETE",
      });
  const form = new FormData();
  form.append("attachment", await openAsBlob(file), name);
  await call(
    `/releases/${String(release.id)}/assets?name=${encodeURIComponent(name)}`,
    { method: "POST", body: form },
  );
  console.log(`uploaded ${name}`);
}
