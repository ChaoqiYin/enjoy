import Cocoa
import WebKit

final class ScrollbarCheck: NSObject, WKNavigationDelegate {
    private let app = NSApplication.shared
    private var webView: WKWebView!
    private var window: NSWindow!
    private var attempts = 0

    func run() {
        guard CommandLine.arguments.count > 1,
              let url = URL(string: CommandLine.arguments[1]) else {
            print("Usage: swift scripts/check-scrollbar.swift <acceptance-url> [-AppleShowScrollBars Always|WhenScrolling]")
            exit(2)
        }
        app.setActivationPolicy(.accessory)
        webView = WKWebView(frame: NSRect(x: 0, y: 0, width: 1200, height: 800))
        webView.navigationDelegate = self
        window = NSWindow(contentRect: webView.frame, styleMask: [.titled], backing: .buffered, defer: false)
        window.contentView = webView
        webView.load(URLRequest(url: url))
        DispatchQueue.main.asyncAfter(deadline: .now() + 20) { exit(2) }
        app.run()
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        check()
    }

    private func check() {
        attempts += 1
        let script = """
        (() => {
          const viewport = document.querySelector('.scroll-viewport');
          const content = viewport?.querySelector('.relative');
          if (!viewport || !content || !content.querySelector('article')) return null;
          const style = getComputedStyle(viewport);
          const gutter = viewport.offsetWidth - viewport.clientWidth;
          const padding = parseFloat(style.paddingInlineEnd);
          const reserved = gutter + padding;
          const result = {
            supported: CSS.supports('scrollbar-gutter', 'stable'),
            gutter, padding, reserved,
            contentWidth: content.getBoundingClientRect().width,
            viewportWidth: viewport.getBoundingClientRect().width,
            rootOverflow: document.documentElement.scrollHeight > innerHeight,
            passed: Math.abs(reserved - 20) < 1 && style.scrollbarGutter === 'stable'
          };
          return result;
        })()
        """
        webView.evaluateJavaScript(script) { result, error in
            if let result = result as? [String: Any] {
                let data = try! JSONSerialization.data(withJSONObject: result, options: [.sortedKeys])
                print(String(data: data, encoding: .utf8)!)
                exit(result["passed"] as? Bool == true ? 0 : 1)
            }
            if self.attempts >= 60 {
                print(error?.localizedDescription ?? "Video viewport did not render")
                exit(2)
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { self.check() }
        }
    }
}

let check = ScrollbarCheck()
check.run()
