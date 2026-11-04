import UIKit

/// What the window shows (ADR 0049): the bundled setup page, or the
/// configured server in `SuiteViewController`. The two never share a web
/// view, so the Suite page never receives Capacitor's bridge.
final class ShellCoordinator {
    static let shared = ShellCoordinator()

    private let store = ShellStore()
    private weak var window: UIWindow?
    private var suite: SuiteViewController?
    /// A deep link that arrived before the server view existed.
    private var pendingTarget: String?

    private(set) var origin: String?
    /// The setup page was opened on purpose (first start, "Change server").
    /// Otherwise it is showing because the server did not load.
    private(set) var setupRequested = false

    /// The page shows "Connected" before the server replaces it.
    private let connectDelay: TimeInterval = 0.4

    func start(in window: UIWindow) {
        self.window = window
        origin = store.read()
        if origin == nil { showSetup(requested: true) } else { showServer() }
        window.makeKeyAndVisible()
    }

    func showSetup(requested: Bool) {
        setupRequested = requested
        suite = nil
        window?.rootViewController = SetupViewController()
    }

    func configure(origin: String, allowPrivateLanHttp: Bool) {
        store.write(origin: origin, allowPrivateLanHttp: allowPrivateLanHttp)
        self.origin = origin
        setupRequested = false
        DispatchQueue.main.asyncAfter(deadline: .now() + connectDelay) { self.showServer() }
    }

    /// "Cancel" or "Try again" on the setup page.
    func returnToServer() {
        guard origin != nil else { return }
        setupRequested = false
        showServer()
    }

    /// The server did not load: the setup page says so and offers "Try again".
    func serverFailed() {
        showSetup(requested: false)
    }

    /// `tadooer://open/<path>`, checked by the policy before anything loads.
    func open(deepLink url: URL) {
        guard let target = ShellPolicy.deepLinkTarget(url.absoluteString, origin: origin) else { return }
        if let suite { suite.load(target) } else { pendingTarget = target }
    }

    private func showServer() {
        guard let origin else { return showSetup(requested: true) }
        let controller = SuiteViewController(origin: origin)
        suite = controller
        window?.rootViewController = controller
        controller.load(pendingTarget ?? origin + "/")
        pendingTarget = nil
    }
}
