package io.keepsake.app

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.Menu
import android.view.MenuItem
import android.view.View
import android.webkit.*
import android.widget.FrameLayout
import android.widget.ProgressBar
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import java.net.URLEncoder

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var progressBar: ProgressBar
    private lateinit var swipeRefreshLayout: SwipeRefreshLayout

    companion object {
        const val PREFS_NAME = "keepsake_prefs"
        const val KEY_SERVER_URL = "server_url"
        const val DEFAULT_SERVER_URL = "http://10.0.2.2:3000"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Root container
        val root = FrameLayout(this).apply {
            setBackgroundColor(0xFF0C0C0E.toInt())
        }

        webView = WebView(this)
        progressBar = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            max = 100
            visibility = View.GONE
        }

        // Pull-to-refresh wrapper
        swipeRefreshLayout = SwipeRefreshLayout(this).apply {
            setColorSchemeColors(0xFF38BDF8.toInt())
            setProgressBackgroundColorSchemeColor(0xFF18181B.toInt())
            setOnRefreshListener {
                webView.reload()
            }
            addView(webView, FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT)
        }

        root.addView(swipeRefreshLayout, FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT)
        root.addView(progressBar, FrameLayout.LayoutParams.MATCH_PARENT, 8)
        setContentView(root)

        setupWebView()
        handleBackNavigation()
        processIntent(intent)
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        intent?.let { processIntent(it) }
    }

    private fun processIntent(intent: Intent) {
        val serverUrl = getServerUrl()
        val reloadBookmarks = intent.getBooleanExtra("reload_bookmarks", false)

        if (reloadBookmarks) {
            if (webView.url == null) {
                webView.loadUrl(serverUrl)
            } else {
                // Instantly notify webapp store to sync and display the newly imported bookmark
                webView.evaluateJavascript(
                    """
                    (function() {
                        window.postMessage({ type: 'KEEPSAKE_SYNC_TRIGGER' }, '*');
                        window.dispatchEvent(new Event('focus'));
                    })();
                    """.trimIndent(),
                    null
                )
                // Brief refresh indicator feedback
                swipeRefreshLayout.isRefreshing = true
                webView.postDelayed({
                    swipeRefreshLayout.isRefreshing = false
                }, 1000)
            }
            return
        }

        val sharedUrl = intent.getStringExtra("shared_url")
        val sharedTitle = intent.getStringExtra("shared_title") ?: ""

        if (!sharedUrl.isNullOrEmpty()) {
            val encodedUrl = URLEncoder.encode(sharedUrl, "UTF-8")
            val encodedTitle = URLEncoder.encode(sharedTitle, "UTF-8")
            val targetUrl = "$serverUrl/?url=$encodedUrl&title=$encodedTitle"
            webView.loadUrl(targetUrl)
        } else if (webView.url == null) {
            webView.loadUrl(serverUrl)
        }
    }

    private fun getServerUrl(): String {
        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        return prefs.getString(KEY_SERVER_URL, DEFAULT_SERVER_URL) ?: DEFAULT_SERVER_URL
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        val settings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.allowFileAccess = true
        settings.cacheMode = WebSettings.LOAD_DEFAULT
        settings.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
        settings.useWideViewPort = true
        settings.loadWithOverviewMode = true
        settings.setSupportZoom(false)

        // CRITICAL FOR GOOGLE OAUTH:
        // Google blocks OAuth logins from WebViews containing the '; wv' or 'Version/4.0' string.
        // Stripping these tokens ensures Google recognizes this as standard mobile Chrome and permits the OAuth login.
        val defaultUa = settings.userAgentString
        val cleanUa = defaultUa
            .replace("; wv", "")
            .replace("Version/4.0 ", "")
        settings.userAgentString = cleanUa

        // Enable cookies and third-party cookies for OAuth session persistence
        val cookieManager = CookieManager.getInstance()
        cookieManager.setAcceptCookie(true)
        cookieManager.setAcceptThirdPartyCookies(webView, true)

        webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                if (newProgress < 100) {
                    progressBar.visibility = View.VISIBLE
                    progressBar.progress = newProgress
                } else {
                    progressBar.visibility = View.GONE
                    swipeRefreshLayout.isRefreshing = false
                }
            }
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                val url = request?.url?.toString() ?: return false
                val currentServer = getServerUrl()

                // Keep internal app navigation and Google OAuth within the app
                val isInternal = url.startsWith(currentServer) ||
                        url.contains("accounts.google.com") ||
                        url.contains("google.com/o/oauth2") ||
                        url.contains("googleapis.com")

                if (isInternal) {
                    return false
                }

                // If clicking an external bookmark link, open in default external browser
                return try {
                    val browserIntent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
                    startActivity(browserIntent)
                    true
                } catch (e: Exception) {
                    false
                }
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                swipeRefreshLayout.isRefreshing = false
            }

            override fun onReceivedError(view: WebView?, request: WebResourceRequest?, error: WebResourceError?) {
                if (request?.isForMainFrame == true) {
                    swipeRefreshLayout.isRefreshing = false
                    showServerConfigDialog()
                }
            }
        }
    }

    override fun onCreateOptionsMenu(menu: Menu?): Boolean {
        menu?.add(0, 1, 0, "Server Settings")
        return true
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        if (item.itemId == 1) {
            showServerConfigDialog()
            return true
        }
        return super.onOptionsItemSelected(item)
    }

    fun showServerConfigDialog() {
        val current = getServerUrl()
        val input = android.widget.EditText(this).apply {
            setText(current)
            hint = "http://10.0.2.2:3000"
        }

        AlertDialog.Builder(this)
            .setTitle("Keepsake Server URL")
            .setMessage("Configure your Keepsake server address:")
            .setView(input)
            .setPositiveButton("Connect") { _, _ ->
                val newUrl = input.text.toString().trim().removeSuffix("/")
                if (newUrl.isNotEmpty()) {
                    getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                        .edit()
                        .putString(KEY_SERVER_URL, newUrl)
                        .apply()
                    webView.loadUrl(newUrl)
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun handleBackNavigation() {
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) {
                    webView.goBack()
                } else {
                    isEnabled = false
                    onBackPressedDispatcher.onBackPressed()
                }
            }
        })
    }
}
