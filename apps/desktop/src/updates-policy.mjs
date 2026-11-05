import { URL } from "node:url";
/** Release authority is compiled into the shell, never supplied by a web page. */
export const publisherOrigin = "https://git.subcult.tv";
export const publisherRepository = "/subculture-collective/tadooer";
export const releasePageUrl = `${publisherOrigin}${publisherRepository}/releases`;
export const releaseApiUrl = `${publisherOrigin}/api/v1/repos/subculture-collective/tadooer/releases?limit=50`;
export const maximumArtifactBytes = 1024 * 1024 * 1024;

const parseVersion = (value) => {
  if (typeof value !== "string" || value.length > 100)
    throw new Error("Invalid release version");
  const match =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(
      value,
    );
  if (match === null) throw new Error("Invalid release version");
  const core = match.slice(1, 4).map(Number);
  const prerelease = match[4]?.split(".") ?? [];
  if (
    core.some((n) => !Number.isSafeInteger(n)) ||
    prerelease.some(
      (part) =>
        /^\d+$/.test(part) &&
        (!/^(0|[1-9]\d*)$/.test(part) || !Number.isSafeInteger(Number(part))),
    )
  )
    throw new Error("Invalid release version");
  return { core, prerelease };
};

export const compareVersions = (left, right) => {
  const a = parseVersion(left);
  const b = parseVersion(right);
  for (let i = 0; i < 3; i++)
    if (a.core[i] !== b.core[i]) return a.core[i] > b.core[i] ? 1 : -1;
  if (a.prerelease.length === 0 || b.prerelease.length === 0)
    return a.prerelease.length === b.prerelease.length
      ? 0
      : a.prerelease.length === 0
        ? 1
        : -1;
  for (let i = 0; i < Math.max(a.prerelease.length, b.prerelease.length); i++) {
    const x = a.prerelease[i];
    const y = b.prerelease[i];
    if (x === y) continue;
    if (x === undefined || y === undefined) return x === undefined ? -1 : 1;
    const xn = /^\d+$/.test(x);
    const yn = /^\d+$/.test(y);
    if (xn !== yn) return xn ? -1 : 1;
    return (xn ? Number(x) > Number(y) : x > y) ? 1 : -1;
  }
  return 0;
};

export const updateMetadataName = (platform, arch) =>
  `tadooer-desktop-update-${platform}-${arch}.json`;

export const publisherAssetUrl = (value) => {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return (
      url.origin === publisherOrigin &&
      url.username === "" &&
      url.password === "" &&
      url.search === "" &&
      url.hash === "" &&
      (url.pathname.startsWith(`${publisherRepository}/releases/download/`) ||
        /^\/attachments\/[0-9a-f-]{36}$/i.test(url.pathname))
    );
  } catch {
    return false;
  }
};

export const metadataCandidates = (
  releases,
  { currentVersion, platform, arch },
) => {
  const current = parseVersion(currentVersion);
  if (!Array.isArray(releases) || releases.length > 50)
    throw new Error("Invalid release listing");
  const arches =
    platform === "darwin" && ["arm64", "x64"].includes(arch)
      ? ["universal", arch]
      : platform === "linux" && arch === "x64"
        ? [arch]
        : [];
  const candidates = [];
  for (const release of releases) {
    if (
      release === null ||
      typeof release !== "object" ||
      release.draft !== false ||
      typeof release.tag_name !== "string" ||
      !release.tag_name.startsWith("v") ||
      !Array.isArray(release.assets)
    )
      continue;
    const version = release.tag_name.slice(1);
    try {
      const parsed = parseVersion(version);
      if (
        compareVersions(version, currentVersion) <= 0 ||
        (current.prerelease.length === 0 && parsed.prerelease.length > 0)
      )
        continue;
    } catch {
      continue;
    }
    for (const target of arches) {
      const name = updateMetadataName(platform, target);
      const metadata = release.assets.find(
        (asset) =>
          asset.name === name && publisherAssetUrl(asset.browser_download_url),
      );
      const archiveName = `tadooer-desktop-${version}-${platform}-${target}.${platform === "darwin" ? "zip" : "tar.gz"}`;
      const archive = release.assets.find(
        (asset) =>
          asset.name === archiveName &&
          publisherAssetUrl(asset.browser_download_url),
      );
      if (
        metadata === undefined ||
        archive === undefined ||
        !Number.isSafeInteger(archive.size) ||
        archive.size <= 0 ||
        archive.size > maximumArtifactBytes
      )
        continue;
      candidates.push({
        version,
        platform,
        arch: target,
        metadataUrl: metadata.browser_download_url,
        archive,
      });
      break;
    }
  }
  return candidates.sort((a, b) => compareVersions(b.version, a.version));
};

export const validateUpdateMetadata = (value, candidate) => {
  const bad = () => {
    throw new Error("Release metadata does not match its artifact");
  };
  if (
    value === null ||
    typeof value !== "object" ||
    value.schemaVersion !== 1 ||
    value.version !== candidate.version ||
    value.platform !== candidate.platform ||
    value.arch !== candidate.arch ||
    !["native", "download"].includes(value.installMode)
  )
    return bad();
  if (candidate.platform !== "darwin" && value.installMode === "native")
    return bad();
  if (
    typeof value.buildVersion !== "string" ||
    !/^\d+(?:\.\d+){0,2}$/.test(value.buildVersion)
  )
    return bad();
  const file = value.artifact;
  if (
    file === null ||
    typeof file !== "object" ||
    file.name !== candidate.archive.name ||
    file.url !== candidate.archive.browser_download_url ||
    !publisherAssetUrl(file.url) ||
    file.size !== candidate.archive.size ||
    !/^[0-9a-f]{64}$/.test(file.sha256)
  )
    return bad();
  // The same file is a default-server-format Squirrel feed. Discovery and
  // semantic version comparison happen before the native updater reads it.
  if (
    value.url !== file.url ||
    value.sha256 !== file.sha256 ||
    value.size !== file.size ||
    value.name !== value.version ||
    typeof value.pub_date !== "string" ||
    !Number.isFinite(Date.parse(value.pub_date))
  )
    return bad();
  return value;
};
