import UIKit
import WebKit

/// The configured server in a plain web view (ADR 0049). Capacitor is not
/// involved: the page gets no plugin, no native HTTP and no cookie interface.
/// It gets only `page-bridge.js`, the script the Android shell injects, wired
/// to one WebKit message handler.
final class SuiteViewController: UIViewController, WKNavigationDelegate, WKUIDelegate {
    let origin: String
    private var webView: WKWebView!
    private var loaded = false
    /// Main-frame pages on another origin in a row (see `didCommit`).
    private var foreignPages = 0
    private let foreignPageLimit = 3

    init(origin: String) {
        self.origin = origin
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    override func loadView() {
        let content = WKUserContentController()
        if let script = Self.pageBridge(for: origin) {
            content.addUserScript(
                WKUserScript(source: script, injectionTime: .atDocumentStart, forMainFrameOnly: true, in: .page)
            )
        }
        content.add(MessageHandler(owner: self), contentWorld: .page, name: "tadooerShellNative")
        let configuration = WKWebViewConfiguration()
        configuration.userContentController = content
        configuration.websiteDataStore = .default()
        configuration.allowsInlineMediaPlayback = true
        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        // The web app pads with env(safe-area-inset-*) under viewport-fit=cover.
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.isOpaque = false
        webView.backgroundColor = UIColor(red: 0x11 / 255, green: 0x11 / 255, blue: 0x1B / 255, alpha: 1)
        view = webView
    }

    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }

    /// Loads an absolute URL on the configured origin; anything else is ignored.
    func load(_ target: String) {
        loadViewIfNeeded()
        guard ShellPolicy.sameOrigin(target, origin), let url = URL(string: target) else { return }
        webView.load(URLRequest(url: url))
    }

    /// The shared page bridge, behind a stand-in for Android's message channel
    /// that exists only in the top frame of the configured origin.
    private static func pageBridge(for origin: String) -> String? {
        guard let path = Bundle.main.path(forResource: "page-bridge", ofType: "js", inDirectory: "public"),
              let bridge = try? String(contentsOfFile: path, encoding: .utf8),
              let quoted = try? String(data: JSONSerialization.data(withJSONObject: [origin]), encoding: .utf8)
        else { return nil }
        return """
        (() => {
          if (window.top !== window || location.origin !== \(quoted)[0]) return;
          const handler = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.tadooerShellNative;
          if (!handler) return;
          const channel = { postMessage: (message) => handler.postMessage(String(message)), onmessage: null };
          Object.defineProperty(window, "tadooerShellNative", { value: channel, configurable: true });
        })();
        \(bridge)
        """
    }

    // MARK: Navigation

    func webView(
        _ webView: WKWebView,
        decidePolicyFor action: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        let url = action.request.url?.absoluteString
        if ShellPolicy.sameOrigin(url, origin) {
            decisionHandler(.allow)
        } else if action.targetFrame?.isMainFrame == false, url == "about:blank" || url == "about:srcdoc" {
            // An empty frame the page builds itself.
            decisionHandler(.allow)
        } else {
            decisionHandler(.cancel)
            handOff(url)
        }
    }

    /// `target="_blank"` and `window.open`: the configured origin loads here,
    /// Google's consent page opens in Safari, the rest does nothing.
    func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for action: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        let url = action.request.url?.absoluteString
        if ShellPolicy.sameOrigin(url, origin), let target = url { load(target) } else { handOff(url) }
        return nil
    }

    private func handOff(_ url: String?) {
        guard ShellPolicy.allowedExternalOAuth(url), let url, let link = URL(string: url) else { return }
        UIApplication.shared.open(link)
    }

    /// A second check: a document that committed on another origin anyway is
    /// left at once, and after three in a row the setup page opens.
    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        if ShellPolicy.sameOrigin(webView.url?.absoluteString, origin) {
            foreignPages = 0
            return
        }
        webView.stopLoading()
        foreignPages += 1
        if foreignPages >= foreignPageLimit {
            ShellCoordinator.shared.serverFailed()
        } else {
            load(origin + "/")
        }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        loaded = true
    }

    /// The server did not answer when the app opened it.
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        let code = (error as NSError).code
        if code == NSURLErrorCancelled || code == 102 /* WebKitErrorFrameLoadInterruptedByPolicyChange */ { return }
        if !loaded { ShellCoordinator.shared.serverFailed() }
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        webView.reload()
    }

    // MARK: Page messages

    fileprivate func received(_ message: WKScriptMessage) {
        // Only the top frame of the configured origin may speak, and only
        // the string "ready". A phone has nothing else to receive (ADR 0049).
        guard message.frameInfo.isMainFrame,
              Self.originString(message.frameInfo.securityOrigin) == origin,
              message.body as? String == "ready" else { return }
    }

    private static func originString(_ origin: WKSecurityOrigin) -> String {
        let host = origin.host.contains(":") ? "[\(origin.host)]" : origin.host
        let standard = origin.protocol == "https" ? 443 : 80
        let port = origin.port == 0 || origin.port == standard ? "" : ":\(origin.port)"
        return "\(origin.protocol)://\(host)\(port)"
    }
}

/// Holds the view controller weakly: WebKit retains its message handlers.
private final class MessageHandler: NSObject, WKScriptMessageHandler {
    weak var owner: SuiteViewController?
    init(owner: SuiteViewController) { self.owner = owner }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        owner?.received(message)
    }
}
