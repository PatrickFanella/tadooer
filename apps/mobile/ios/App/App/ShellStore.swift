import Foundation

/// The shell's only stored state (ADR 0049): the configured origin and the
/// owner's consent to plaintext HTTP for a private address, in the app's own
/// defaults domain. A stored origin is classified again on every read, so a
/// damaged value leads to the setup page.
struct ShellStore {
    private let defaults = UserDefaults(suiteName: "tadooer-shell") ?? .standard
    private let originKey = "serverOrigin"
    private let consentKey = "allowPrivateLanHttp"

    func read() -> String? {
        guard let origin = defaults.string(forKey: originKey) else { return nil }
        let consent = defaults.bool(forKey: consentKey)
        return ShellPolicy.classifyOrigin(origin, allowPrivateLanHttp: consent) == nil ? nil : origin
    }

    func write(origin: String, allowPrivateLanHttp: Bool) {
        defaults.set(origin, forKey: originKey)
        defaults.set(allowPrivateLanHttp, forKey: consentKey)
    }
}
