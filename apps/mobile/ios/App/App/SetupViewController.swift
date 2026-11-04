import Capacitor
import UIKit

/// The bundled setup page (ADR 0049) and the only view with Capacitor's
/// bridge. It registers the shell plugin the page calls.
final class SetupViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(TadooerShellPlugin())
    }
}
