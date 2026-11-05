import { spawnSync } from "node:child_process";

export const signingVariables = Object.freeze({
  request: "SUITE_MAC_SIGN",
  /** `Developer ID Application: <name> (<team id>)`, as in the keychain. */
  identity: "SUITE_MAC_SIGN_IDENTITY",
  teamId: "APPLE_TEAM_ID",
  /** App Store Connect API key: the `.p8` path, its key ID and issuer. */
  apiKey: Object.freeze([
    "APPLE_API_KEY",
    "APPLE_API_KEY_ID",
    "APPLE_API_ISSUER",
  ]),
  /** The alternative: an Apple ID with an app-specific password. */
  appleId: Object.freeze(["APPLE_ID", "APPLE_APP_SPECIFIC_PASSWORD"]),
});

const present = (environment, name) =>
  typeof environment[name] === "string" && environment[name] !== "";

export const signingRequested = (environment) => {
  const value = environment[signingVariables.request];
  return typeof value === "string" && !["", "0", "false", "no"].includes(value);
};

/**
 * Names of the variables a signed, notarised build would still need. The
 * notarisation credential is either the complete API key set or the complete
 * Apple ID set; when neither is complete, the API key names are reported.
 */
export const missingSigningVariables = (environment) => {
  const required =
    environment.SUITE_MAC_SIGN === "development"
      ? [signingVariables.identity]
      : [signingVariables.identity, signingVariables.teamId];
  const missing = required.filter((name) => !present(environment, name));
  const complete = (names) => names.every((name) => present(environment, name));
  if (
    environment.SUITE_MAC_SIGN !== "development" &&
    !complete(signingVariables.apiKey) &&
    !complete(signingVariables.appleId)
  )
    missing.push(
      ...signingVariables.apiKey.filter((name) => !present(environment, name)),
    );
  return missing;
};

/** Fail before packaging if the requested signing mode cannot run. */
export const signingPreflight = (environment, hostPlatform) => {
  if (!signingRequested(environment)) return;
  const missing = missingSigningVariables(environment);
  if (missing.length > 0)
    throw new Error(
      `SUITE_MAC_SIGN is set, but these variables are missing: ${missing.join(", ")}. Unset it to build the unsigned package.`,
    );
  if (hostPlatform !== "darwin")
    throw new Error("SUITE_MAC_SIGN is set, but signing needs macOS");
};

/** Sign the finished bundle, after every resource has been copied. */
export const afterPackage = async (
  bundle,
  environment,
  hostPlatform,
  dependencies = {},
) => {
  signingPreflight(environment, hostPlatform);
  if (!signingRequested(environment)) return { signed: false };
  const development = environment.SUITE_MAC_SIGN === "development";
  const sign = dependencies.sign ?? (await import("@electron/osx-sign")).sign;
  const { macSignOptionsForFile } = await import("./mac.mjs");
  await sign({
    app: bundle.appPath,
    identity: environment.SUITE_MAC_SIGN_IDENTITY,
    platform: "darwin",
    type: development ? "development" : "distribution",
    preAutoEntitlements: false,
    preEmbedProvisioningProfile: false,
    optionsForFile: (file) => ({
      ...macSignOptionsForFile(file, bundle),
      ...(development ? { timestamp: "none" } : {}),
    }),
  });
  if (!development) {
    const notarize =
      dependencies.notarize ?? (await import("@electron/notarize")).notarize;
    const credentials = signingVariables.apiKey.every((name) =>
      present(environment, name),
    )
      ? {
          appleApiKey: environment.APPLE_API_KEY,
          appleApiKeyId: environment.APPLE_API_KEY_ID,
          appleApiIssuer: environment.APPLE_API_ISSUER,
        }
      : {
          appleId: environment.APPLE_ID,
          appleIdPassword: environment.APPLE_APP_SPECIFIC_PASSWORD,
          teamId: environment.APPLE_TEAM_ID,
        };
    await notarize({ appPath: bundle.appPath, ...credentials });
  }
  const run = dependencies.run ?? spawnSync;
  const verified = run(
    "codesign",
    ["--verify", "--deep", "--strict", "--verbose=2", bundle.appPath],
    { stdio: ["ignore", "inherit", "inherit"] },
  );
  if (verified.error) throw verified.error;
  if (verified.status !== 0)
    throw new Error("The signed application does not verify");
  return { signed: true, notarized: !development };
};

/**
 * The signature a Mac gives an unsigned bundle: `codesign --sign -`, an ad
 * hoc signature that names no one. Gatekeeper still treats the app as from
 * an unidentified developer, but the bundle is then consistent: the linker's
 * per-binary signatures alone make `codesign --verify` and `spctl` report
 * "code has no resources but signature indicates they must be present".
 * Runs only on macOS, and never for a build that asked for a real
 * signature; those two cases are decided by the caller.
 *
 * `run` exists for the tests; it defaults to `codesign` itself.
 */
export const adHocSign = (appPath, run = spawnSync) => {
  const sign = run("codesign", ["--force", "--deep", "--sign", "-", appPath], {
    stdio: ["ignore", "inherit", "inherit"],
  });
  if (sign.error !== undefined) throw sign.error;
  if (sign.status !== 0) throw new Error(`codesign failed for ${appPath}`);
  const verify = run(
    "codesign",
    ["--verify", "--deep", "--strict", "--verbose=2", appPath],
    { stdio: ["ignore", "inherit", "inherit"] },
  );
  if (verify.error !== undefined) throw verify.error;
  if (verify.status !== 0)
    throw new Error(`The ad hoc signature of ${appPath} does not verify`);
  return { signed: true, identity: "adhoc" };
};
