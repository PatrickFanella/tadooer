import Foundation

/// Authority rules of the iOS shell (ADR 0049), for the places where no
/// JavaScript runs: reading the stored server on start, the navigation guard,
/// deep links and the system-browser exception for Google OAuth.
///
/// A line-for-line reading of `ShellPolicy.java`, itself a stricter reading of
/// `apps/desktop/src/policy.mjs`. `apps/mobile/src/native-policy.test.mjs`
/// compiles this file with `swiftc` and runs it, the Java class and the
/// JavaScript over the same inputs. Lengths are counted in UTF-16 code units,
/// as in Java. No UIKit import: the file builds on its own.
enum ShellPolicy {
    static let deepLinkPrefix = "tadooer://open"
    static let https = "https"
    static let loopbackHttp = "loopback-http"
    static let privateLanHttp = "private-lan-http"

    /// Capacitor serves the bundled setup page from this host name.
    static let reservedHost = "localhost"

    private static let maximumUrlLength = 2048
    private static let maximumPathLength = 1024
    private static let maximumOAuthLength = 4096
    private static let oauthPrefix = "https://accounts.google.com/o/oauth2/v2/auth?"

    /// The transport of a canonical origin, or nil when it is not accepted.
    static func classifyOrigin(_ origin: String?, allowPrivateLanHttp: Bool) -> String? {
        guard let origin, origin.utf16.count <= maximumUrlLength else { return nil }
        let secure: Bool
        let rest: Substring
        if origin.hasPrefix("https://") {
            secure = true
            rest = origin.dropFirst(8)
        } else if origin.hasPrefix("http://") {
            secure = false
            rest = origin.dropFirst(7)
        } else {
            return nil
        }
        var host: String
        var port: String?
        if rest.hasPrefix("[") {
            guard let close = rest.firstIndex(of: "]") else { return nil }
            host = String(rest[...close])
            let after = rest[rest.index(after: close)...]
            if !after.isEmpty {
                guard after.hasPrefix(":") else { return nil }
                port = String(after.dropFirst())
            }
        } else if let colon = rest.firstIndex(of: ":") {
            host = String(rest[..<colon])
            port = String(rest[rest.index(after: colon)...])
        } else {
            host = String(rest)
        }
        if let port, !canonicalPort(port, secure: secure) { return nil }
        let loopbackV6 = host == "[::1]"
        let v4 = loopbackV6 ? nil : ipv4(host)
        if !loopbackV6 && v4 == nil && !hostName(host) { return nil }
        if host == reservedHost { return nil }
        if secure { return https }
        if loopbackV6 || host == "127.0.0.1" { return loopbackHttp }
        guard let v4, privateLan(v4) else { return nil }
        return allowPrivateLanHttp ? privateLanHttp : nil
    }

    /// The host of an origin that `classifyOrigin` accepted.
    static func originHost(_ origin: String) -> String {
        guard let marker = origin.range(of: "://") else { return origin }
        let rest = origin[marker.upperBound...]
        if rest.hasPrefix("["), let close = rest.firstIndex(of: "]") {
            return String(rest[...close])
        }
        if let colon = rest.firstIndex(of: ":") { return String(rest[..<colon]) }
        return String(rest)
    }

    /// True when `url` is on `origin`: the origin followed by a path, a query,
    /// a fragment or nothing.
    static func sameOrigin(_ url: String?, _ origin: String?) -> Bool {
        guard let url, let origin, !origin.isEmpty, url.hasPrefix(origin) else { return false }
        let next = url.dropFirst(origin.count).first
        return next == nil || next == "/" || next == "?" || next == "#"
    }

    /// `tadooer://open/<path>` to an absolute URL on the configured origin, or nil.
    static func deepLinkTarget(_ raw: String?, origin: String?) -> String? {
        guard let raw, let origin, raw.utf16.count <= maximumUrlLength,
              raw.utf16.count >= deepLinkPrefix.utf16.count else { return nil }
        guard raw.prefix(7).lowercased() == "tadooer", raw.dropFirst(7).hasPrefix("://open") else { return nil }
        var rest = String(raw.dropFirst(deepLinkPrefix.count))
        for character in rest where !linkCharacter(character) { return nil }
        if let first = rest.first, !"/?#".contains(first) { return nil }
        var fragment = ""
        if let hash = rest.firstIndex(of: "#") {
            fragment = String(rest[rest.index(after: hash)...])
            rest = String(rest[..<hash])
        }
        var query = ""
        if let question = rest.firstIndex(of: "?") {
            query = String(rest[rest.index(after: question)...])
            rest = String(rest[..<question])
        }
        let path = rest.isEmpty ? "/" : rest
        let relative = path + (query.isEmpty ? "" : "?" + query) + (fragment.isEmpty ? "" : "#" + fragment)
        if relative.utf16.count > maximumPathLength { return nil }
        if path.hasPrefix("//") { return nil }
        let lowered = path.lowercased()
        if lowered == "/api" || lowered.hasPrefix("/api/") { return nil }
        if lowered.contains("%2f") || lowered.contains("%5c") || lowered.contains("%2e") { return nil }
        for segment in path.components(separatedBy: "/") where segment == "." || segment == ".." {
            return nil
        }
        return origin + relative
    }

    /// The one address the shell hands to the system browser: Google's OAuth
    /// consent page with an authorization-code request.
    static func allowedExternalOAuth(_ url: String?) -> Bool {
        guard let url, url.utf16.count <= maximumOAuthLength, url.hasPrefix(oauthPrefix) else { return false }
        var query = String(url.dropFirst(oauthPrefix.count))
        if let hash = query.firstIndex(of: "#") { query = String(query[..<hash]) }
        var responseType: String?
        var clientId: String?
        var redirectUri: String?
        var state: String?
        for pair in query.components(separatedBy: "&") where !pair.isEmpty {
            let parts = pair.split(separator: "=", maxSplits: 1, omittingEmptySubsequences: false)
            guard let name = decode(String(parts[0])),
                  let value = parts.count > 1 ? decode(String(parts[1])) : "" else { return false }
            // The first value of a repeated name counts, as in URLSearchParams.get.
            if name == "response_type" && responseType == nil { responseType = value }
            else if name == "client_id" && clientId == nil { clientId = value }
            else if name == "redirect_uri" && redirectUri == nil { redirectUri = value }
            else if name == "state" && state == nil { state = value }
        }
        return responseType == "code"
            && (clientId?.utf16.count ?? 0) > 4
            && !(redirectUri ?? "").isEmpty
            && (state?.utf16.count ?? 0) >= 32
    }

    /// Form decoding as java.net.URLDecoder does it; nil on a malformed escape.
    private static func decode(_ text: String) -> String? {
        text.replacingOccurrences(of: "+", with: " ").removingPercentEncoding
    }

    private static func linkCharacter(_ character: Character) -> Bool {
        guard character.isASCII, let scalar = character.unicodeScalars.first else { return false }
        if ("a"..."z").contains(scalar) || ("A"..."Z").contains(scalar) || ("0"..."9").contains(scalar) {
            return true
        }
        return "-._~!$&()*+,;=:@/%?#".unicodeScalars.contains(scalar)
    }

    private static func canonicalPort(_ port: String, secure: Bool) -> Bool {
        guard !port.isEmpty, port.utf16.count <= 5, port.first != "0",
              port.unicodeScalars.allSatisfy({ ("0"..."9").contains($0) }),
              let value = Int(port) else { return false }
        return value <= 65535 && value != (secure ? 443 : 80)
    }

    /// Four canonical decimal parts, or nil.
    private static func ipv4(_ host: String) -> [Int]? {
        let parts = host.components(separatedBy: ".")
        guard parts.count == 4 else { return nil }
        var values: [Int] = []
        for part in parts {
            guard !part.isEmpty, part.utf16.count <= 3, !(part.utf16.count > 1 && part.first == "0"),
                  part.unicodeScalars.allSatisfy({ ("0"..."9").contains($0) }),
                  let value = Int(part), value <= 255 else { return nil }
            values.append(value)
        }
        return values
    }

    private static func privateLan(_ v4: [Int]) -> Bool {
        v4[0] == 10
            || (v4[0] == 172 && v4[1] >= 16 && v4[1] <= 31)
            || (v4[0] == 192 && v4[1] == 168)
            || (v4[0] == 100 && v4[1] >= 64 && v4[1] <= 127)
    }

    /// A lower-case DNS name whose last label does not start with a digit.
    private static func hostName(_ host: String) -> Bool {
        guard !host.isEmpty, host.utf16.count <= 253 else { return false }
        let labels = host.components(separatedBy: ".")
        for label in labels {
            guard !label.isEmpty, label.utf16.count <= 63,
                  label.first != "-", label.last != "-" else { return false }
            for scalar in label.unicodeScalars {
                let letter = ("a"..."z").contains(scalar)
                let digit = ("0"..."9").contains(scalar)
                if !letter && !digit && scalar != "-" { return false }
            }
        }
        guard let first = labels.last?.unicodeScalars.first else { return false }
        return !("0"..."9").contains(first)
    }
}
