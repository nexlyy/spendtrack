import UIKit
import WebKit

// SpendTrack для iOS — автономно, без сервера. Веб-приложение лежит в бандле
// (папка web), данные — в IndexedDB прямо на устройстве. Грузим не через file://,
// а через свою схему stapp://: у страницы стабильный origin, и IndexedDB надёжно
// переживает перезапуски. Мост saveFile отдаёт резервную копию/CSV в системный
// лист «Поделиться» (Files, iCloud Drive, почта).
final class ViewController: UIViewController, WKScriptMessageHandler,
                            WKURLSchemeHandler, WKNavigationDelegate {

    private var webView: WKWebView!
    private static let bgColor = UIColor(red: 14/255, green: 16/255, blue: 22/255, alpha: 1)

    // Корень веб-бандла: <App>/web. Всё отдаём относительно него — так вложенные
    // пути (web/icons/favicon.svg) находятся надёжно, в отличие от
    // url(forResource:withExtension:), который подкаталоги в имени не разбирает.
    private lazy var webRoot: URL = Bundle.main.resourceURL!
        .appendingPathComponent("web", isDirectory: true).standardizedFileURL

    override func loadView() {
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(self, forURLScheme: "stapp")
        config.userContentController.add(self, name: "saveFile")
        config.websiteDataStore = .default()   // постоянное хранилище → IndexedDB не теряется между запусками

        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.scrollView.bounces = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never  // отступы под чёлку задаёт CSS (safe-area-inset)
        webView.allowsBackForwardNavigationGestures = false
        webView.isOpaque = true
        webView.backgroundColor = Self.bgColor
        webView.scrollView.backgroundColor = Self.bgColor
        view = webView
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        loadApp()
    }

    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }

    private func loadApp() {
        guard let url = URL(string: "stapp://app/index.html") else { return }
        webView.load(URLRequest(url: url))
    }

    // MARK: - Схема stapp:// → файлы из бандла (папка web)
    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url else { return }
        var rel = url.path
        if rel.isEmpty || rel == "/" { rel = "/index.html" }

        let fileURL = webRoot.appendingPathComponent(rel).standardizedFileURL
        // не даём выйти за пределы web/ (напр. ../../) — даже локально бережёмся
        guard fileURL.path.hasPrefix(webRoot.path),
              let data = try? Data(contentsOf: fileURL) else {
            let resp = HTTPURLResponse(url: url, statusCode: 404, httpVersion: "HTTP/1.1", headerFields: nil)!
            task.didReceive(resp)
            task.didFinish()
            return
        }
        let resp = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1",
            headerFields: ["Content-Type": mime(for: fileURL.pathExtension),
                           "Cache-Control": "no-cache"])!
        task.didReceive(resp)
        task.didReceive(data)
        task.didFinish()
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}

    private func mime(for ext: String) -> String {
        switch ext.lowercased() {
        case "html":                return "text/html; charset=utf-8"
        case "js", "mjs":           return "application/javascript; charset=utf-8"
        case "css":                 return "text/css; charset=utf-8"
        case "json", "webmanifest": return "application/json; charset=utf-8"
        case "svg":                 return "image/svg+xml"
        case "png":                 return "image/png"
        case "woff2":               return "font/woff2"
        default:                    return "application/octet-stream"
        }
    }

    // MARK: - Восстановление после падения веб-процесса (обычно нехватка памяти
    // после сворачивания). Без этого экран остаётся белым навсегда.
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        loadApp()
    }

    // MARK: - Мост сохранения файла (резервная копия / CSV) → «Поделиться»
    func userContentController(_ uc: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "saveFile",
              let body = message.body as? [String: Any],
              let rawName = body["filename"] as? String,
              let b64 = body["base64"] as? String,
              let data = Data(base64Encoded: b64) else { return }

        // только имя файла, без каталогов — чтобы запись не ушла из temp
        let filename = (rawName as NSString).lastPathComponent
        guard !filename.isEmpty else { return }

        let tmp = FileManager.default.temporaryDirectory.appendingPathComponent(filename)
        do { try data.write(to: tmp, options: .atomic) } catch { return }

        let sheet = UIActivityViewController(activityItems: [tmp], applicationActivities: nil)
        sheet.popoverPresentationController?.sourceView = view
        sheet.popoverPresentationController?.sourceRect = CGRect(
            x: view.bounds.midX, y: view.bounds.midY, width: 0, height: 0)
        present(sheet, animated: true)
    }
}
