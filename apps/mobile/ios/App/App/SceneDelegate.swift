import UIKit

/// Starts the shell (ADR 0049) and routes what the system hands the app:
/// `tadooer://open/...` links and the "Change server" Home Screen action.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    static let changeServerAction = "tv.subcult.tadooer.CHANGE_SERVER"

    var window: UIWindow?

    func scene(
        _ scene: UIScene,
        willConnectTo session: UISceneSession,
        options connectionOptions: UIScene.ConnectionOptions
    ) {
        guard let windowScene = scene as? UIWindowScene else { return }
        let window = UIWindow(windowScene: windowScene)
        self.window = window
        ShellCoordinator.shared.start(in: window)
        if connectionOptions.shortcutItem?.type == Self.changeServerAction {
            ShellCoordinator.shared.showSetup(requested: true)
        }
        for context in connectionOptions.urlContexts { ShellCoordinator.shared.open(deepLink: context.url) }
    }

    func scene(_ scene: UIScene, openURLContexts contexts: Set<UIOpenURLContext>) {
        for context in contexts { ShellCoordinator.shared.open(deepLink: context.url) }
    }

    func windowScene(
        _ windowScene: UIWindowScene,
        performActionFor shortcutItem: UIApplicationShortcutItem,
        completionHandler: @escaping (Bool) -> Void
    ) {
        let handled = shortcutItem.type == Self.changeServerAction
        if handled { ShellCoordinator.shared.showSetup(requested: true) }
        completionHandler(handled)
    }
}
