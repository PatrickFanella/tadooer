#!/usr/bin/env node
// Create (or reuse) the Gitea release for a tag and upload files to it.
//
//   node deploy/release-assets.mjs <tag> [file ...]
//
// Environment: GITEA_SERVER_URL (for example https://git.subcult.tv),
// GITEA_REPOSITORY (owner/name) and GITEA_TOKEN. An asset with the same name
// is replaced, so a rerun of the release workflow is safe. A tag with a
// pre-release part (v1.2.3-rc.1) becomes a pre-release.
//
// GITEA_ORIGIN_ADDRESS (for example 10.0.0.200) sends the requests over plain
// HTTP to that address on the LAN, with the server's host name, instead of
// through Cloudflare: Cloudflare refuses request bodies over 100 MB, and the
// desktop packages are larger. The workflow token lives only for the job.
import { Buffer } from "node:buffer";
import console from "node:console";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import { basename } from "node:path";
import process from "node:process";
import { URL } from "node:url";

const [tag, ...files] = process.argv.slice(2);
const server = process.env.GITEA_SERVER_URL;
const repository = process.env.GITEA_REPOSITORY;
const token = process.env.GITEA_TOKEN;
const address = process.env.GITEA_ORIGIN_ADDRESS ?? "";
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

const base = new URL(server);
const prefix = `/api/v1/repos/${repository}`;
const target =
  address === ""
    ? {
        transport: base.protocol === "https:" ? https : http,
        host: base.hostname,
        port: base.port === "" ? undefined : Number(base.port),
      }
    : { transport: http, host: address, port: 80 };

/** Bytes of a body part: a Buffer, or a file path streamed from disk. */
const size = async (part) =>
  typeof part === "string" ? (await stat(part)).size : part.length;

/** One API request. 404 and 409 are returned; other errors throw. */
const request = async (method, path, { parts = [], contentType } = {}) => {
  const lengths = await Promise.all(parts.map(size));
  return new Promise((resolve, reject) => {
    const headers = {
      Authorization: `token ${token}`,
      Host: base.host,
      Accept: "application/json",
      "Content-Length": String(lengths.reduce((a, b) => a + b, 0)),
      ...(contentType === undefined ? {} : { "Content-Type": contentType }),
    };
    const req = target.transport.request(
      {
        method,
        host: target.host,
        port: target.port,
        path: `${prefix}${path}`,
        headers,
        servername: base.hostname,
      },
      (response) => {
        const received = [];
        response.on("data", (data) => received.push(data));
        response.on("end", () => {
          const text = Buffer.concat(received).toString("utf8");
          const status = response.statusCode ?? 0;
          if (status >= 400 && status !== 404 && status !== 409)
            reject(
              new Error(
                `${method} ${path}: ${String(status)} ${text.slice(0, 300)}`,
              ),
            );
          else
            resolve({
              status,
              body: text === "" || status >= 400 ? null : JSON.parse(text),
            });
        });
      },
    );
    req.on("error", reject);
    const send = (index) => {
      if (index === parts.length) {
        req.end();
        return;
      }
      const part = parts[index];
      if (typeof part !== "string") {
        req.write(part);
        send(index + 1);
        return;
      }
      const stream = createReadStream(part);
      stream.on("error", reject);
      stream.on("end", () => send(index + 1));
      stream.pipe(req, { end: false });
    };
    send(0);
  });
};

const tagPath = `/releases/tags/${encodeURIComponent(tag)}`;
let response = await request("GET", tagPath);
if (response.status === 404) {
  response = await request("POST", "/releases", {
    contentType: "application/json",
    parts: [
      Buffer.from(
        JSON.stringify({
          tag_name: tag,
          name: tag,
          body: `Tadooer ${tag.slice(1)}. Built and deployed by the release workflow.`,
          prerelease: tag.includes("-"),
        }),
      ),
    ],
  });
  // Two jobs can race to create it; the loser reads the winner's release.
  if (response.status === 404 || response.status === 409)
    response = await request("GET", tagPath);
}
const release = response.body;
if (release === null) throw new Error(`release ${tag} could not be read`);
console.log(`release ${tag}: id ${String(release.id)}`);

for (const file of files) {
  const name = basename(file);
  for (const asset of release.assets ?? [])
    if (asset.name === name)
      await request(
        "DELETE",
        `/releases/${String(release.id)}/assets/${String(asset.id)}`,
      );
  const boundary = `tadooer-${String(Date.now())}`;
  await request(
    "POST",
    `/releases/${String(release.id)}/assets?name=${encodeURIComponent(name)}`,
    {
      contentType: `multipart/form-data; boundary=${boundary}`,
      parts: [
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="attachment"; filename="${name}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
        ),
        file,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ],
    },
  );
  console.log(`uploaded ${name}`);
}
