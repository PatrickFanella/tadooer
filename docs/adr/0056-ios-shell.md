---
status: accepted
---

# The iPhone app keeps Capacitor out of the Suite's web view

Issue #153, following ADR 0049. Decided 2026-11-04, when the owner asked for
an iOS version of the Android app.

## Context

ADR 0049 shows the Suite in Capacitor's own WebView on Android, and keeps
Capacitor's bridge away from it with origin rules the platform enforces:
`addWebMessageListener` and `addDocumentStartJavaScript` take an allowed-origin
list, and the Suite origin is not in Capacitor's.

iOS has no equivalent. Capacitor's WKWebView registers its message handler
and injects its bridge script for every page the view shows, whatever the
origin. Loading the Suite in that view would hand the page Capacitor's plugin
bridge, which ADR 0015 and ADR 0049 rule out.

## Decision

The iOS app uses two web views and never shows the Suite in Capacitor's.

- **Setup**: `SetupViewController`, a `CAPBridgeViewController`, shows the
  same bundled setup page as Android and registers `TadooerShellPlugin` with
  the same four calls (`state`, `cleartextPermitted`, `setServer`,
  `cancel`). The page checks the server through Capacitor's native HTTP
  client, as on Android. A call from anything but the bundled page
  (`capacitor://localhost`) is refused. The page's content security policy names
  `capacitor://localhost` beside `'self'`: WebKit's `'self'` does not match
  Capacitor's custom scheme, so without it the page's own stylesheets and
  scripts are blocked and the screen stays blank.
- **The Suite**: `SuiteViewController`, a plain `WKWebView` in the default
  website data store, with no Capacitor at all. It gets one user script,
  `page-bridge.js` from the bundle, behind a stand-in for Android's message
  channel that exists only in the top frame of the configured origin. One
  message handler, `tadooerShellNative`, accepts only the string `ready`, and
  only from the main frame of the configured origin.
- `ShellCoordinator` puts one or the other in the window: the setup page on
  first start, from the "Change server" Home Screen action, and when the
  server does not load (with "Try again"); otherwise the Suite.

The authority rules are `ShellPolicy.swift`, a line-for-line reading of
`ShellPolicy.java`: the stored origin, the navigation guard (same origin
only; Google's authorization-code consent page opens in Safari; everything
else does nothing; a document that commits on another origin is left, and
after three in a row the setup page opens), and `tadooer://open/...` links.
`apps/mobile/src/native-policy.test.mjs` runs the Java class, the Swift file
and the JavaScript over the same inputs; the Swift suite runs where `swiftc`
exists, which includes the release workflow's iOS job.

Plaintext HTTP follows App Transport Security: `NSAllowsLocalNetworking`
permits local addresses, the setup page still asks for consent, and
`cleartextPermitted` answers for loopback and the private ranges the policy
accepts. Unlike Android, no rebuild is needed for a new private address.

## Not built on iOS

- The share target. iOS needs a Share Extension, a second target with its own
  sandbox; the page bridge already accepts a share message if one is added.
- Native notifications. Reminders reach the phone through the ntfy app, as
  ADR 0049 recommends for Android.

## Distribution

The owner has an Apple Development certificate on Soyuz and no distribution
setup. The release workflow publishes an unsigned iPhone build
(`tadooer-ios-<version>-unsigned.ipa`), which Xcode, a sideloading tool with
an Apple ID, or a later paid-account workflow signs for a device. Without a
paid Apple Developer account, a personally signed install expires after seven
days. TestFlight and the App Store (#153) need that account.
