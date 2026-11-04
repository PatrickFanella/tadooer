import Capacitor
import Foundation

/// The setup page's native calls (ADR 0049), the iOS form of
/// `TadooerShellPlugin.java`. Capacitor's bridge exists only in the setup
/// view, whose web view shows nothing but the bundled page; the Suite is
/// shown in a separate web view with no bridge (`SuiteViewController`).
@objc(TadooerShellPlugin)
public class TadooerShellPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TadooerShellPlugin"
    public let jsName = "TadooerShell"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "state", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cleartextPermitted", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setServer", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancel", returnType: CAPPluginReturnPromise),
    ]

    /// Calls come only from the bundled page, served on Capacitor's scheme.
    private func fromSetupPage() -> Bool {
        guard let url = bridge?.webView?.url else { return false }
        return url.scheme == "capacitor" && url.host == "localhost"
    }

    @objc func state(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.fromSetupPage() else { return call.reject("Forbidden") }
            let shell = ShellCoordinator.shared
            call.resolve([
                "currentOrigin": shell.origin ?? NSNull(),
                // The setup page is open although a server is stored and
                // nobody asked to change it: the server did not load.
                "unreachable": shell.origin != nil && !shell.setupRequested,
                "webViewSupported": true,
            ])
        }
    }

    /// App Transport Security allows plaintext only to local addresses
    /// (`NSAllowsLocalNetworking`): loopback and the private ranges the
    /// policy accepts.
    static func cleartextPermitted(host: String) -> Bool {
        ShellPolicy.classifyOrigin("http://\(host)", allowPrivateLanHttp: true) != nil
    }

    @objc func cleartextPermitted(_ call: CAPPluginCall) {
        let host = call.getString("host") ?? ""
        call.resolve(["permitted": !host.isEmpty && Self.cleartextPermitted(host: host)])
    }

    @objc func setServer(_ call: CAPPluginCall) {
        let requested = call.getString("origin")
        let allowPrivateLanHttp = call.getBool("allowPrivateLanHttp") ?? false
        DispatchQueue.main.async {
            guard self.fromSetupPage() else { return call.reject("Forbidden") }
            guard let origin = requested,
                  let transport = ShellPolicy.classifyOrigin(origin, allowPrivateLanHttp: allowPrivateLanHttp)
            else { return call.reject("The address was refused", "refused") }
            if transport != ShellPolicy.https,
               !Self.cleartextPermitted(host: ShellPolicy.originHost(origin)) {
                return call.reject("Plaintext HTTP is not allowed for this address", "cleartext-build")
            }
            ShellCoordinator.shared.configure(
                origin: origin,
                allowPrivateLanHttp: transport == ShellPolicy.privateLanHttp
            )
            call.resolve()
        }
    }

    @objc func cancel(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.fromSetupPage() else { return call.reject("Forbidden") }
            ShellCoordinator.shared.returnToServer()
            call.resolve()
        }
    }
}
