# Оставляем JavaScript-интерфейсы WebView (на будущее).
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
