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
          // The grid the cards sit in, reached from a card rather than from a
          // wrapper class: the `.relative` height box belonged to the virtual
          // grid, and that grid is gone (ADR 0017). Waiting for a card is what
          // stands in for waiting for the list to render.
          const card = viewport?.querySelector('article');
          if (!viewport || !card || !card.parentElement) return null;
          const content = card.parentElement;
          const style = getComputedStyle(viewport);
          const gutter = viewport.offsetWidth - viewport.clientWidth;
          const padding = parseFloat(style.paddingInlineEnd);
          // The padding is the gap between the last column and the scrollbar,
          // and it is the whole of that gap: `clientWidth` is already net of the
          // scrollbar, so nothing is measured across it and nothing is taken off
          // this value for its sake. `gutter + padding`, which this asserted
          // before, held at 20 while the cards sat 5px from a 15px scrollbar —
          // and the glow thrown 10px past them then became scrollable overflow,
          // which `noSideScroll` is here to catch.
          const result = {
            supported: CSS.supports('scrollbar-gutter', 'stable'),
            gutter, padding,
            contentWidth: content.getBoundingClientRect().width,
            viewportWidth: viewport.getBoundingClientRect().width,
            rootOverflow: document.documentElement.scrollHeight > innerHeight,
            noSideScroll: viewport.scrollWidth <= viewport.clientWidth,
            passed: Math.abs(padding - 20) < 1 &&
              style.scrollbarGutter === 'stable' &&
              viewport.scrollWidth <= viewport.clientWidth
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
