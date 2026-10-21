package io.keepsake.app

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.webkit.*
import android.widget.FrameLayout
import android.widget.ProgressBar
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import java.net.URLEncoder

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var progressBar: ProgressBar

    companion object {
        const val PREFS_NAME = "keepsake_prefs"
        const val KEY_SERVER_URL = "server_url"
        const val DEFAULT_SERVER_URL = "http://10.0.2.2:3000" // Default for Android emulator to host machine
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Setup container layout programmatically
        val root = FrameLayout(this)
        root.setBackgroundColor(0xFF0C0C0E.toInt())

        webView = WebView(this)
        progressBar = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            max = 100
            visibility = View.GONE
        }

        root.addView(webView, FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT)
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
        val sharedUrl = intent.getStringExtra("shared_url")
        val sharedTitle = intent.getStringExtra("shared_title") ?: ""

        val serverUrl = getServerUrl()

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

        // Custom User Agent to identify as Keepsake Android App
        settings.userAgentString = "${settings.userAgentString} KeepsakeAndroidApp/1.0"

        webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                if (newProgress < 100) {
                    progressBar.visibility = View.VISIBLE
                    progressBar.progress = newProgress
                } else {
                    progressBar.visibility = View.GONE
                }
            }
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                val url = request?.url?.toString() ?: return false

                // Internal app navigation
                val currentServer = getServerUrl()
                if (url.startsWith(currentServer) || url.startsWith("https://accounts.google.com")) {
                    return false
                }

                // If user clicks a bookmark to read original site, open in default external browser
                return try {
                    val browserIntent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
                    startActivity(browserIntent)
                    true
                } catch (e: Exception) {
                    false
                }
            }

            override fun onReceivedError(view: WebView?, request: WebResourceRequest?, error: WebResourceError?) {
                if (request?.isForMainFrame == true) {
                    // Show friendly server configuration dialog if connection fails
                    showServerConfigDialog()
                }
            }
        }
    }

    private fun showServerConfigDialog() {
        val current = getServerUrl()
        val input = android.widget.EditText(this).apply {
            setText(current)
            hint = "http://your-ubuntu-server-ip:3000"
        }

        AlertDialog.Builder(this)
            .setTitle("Keepsake Server URL")
            .setMessage("Could not connect to $current.\nPlease enter your Keepsake server address:")
            .setView(input)
            .setPositiveButton("Connect") { _, _ ->
                val newUrl = input.text.toString().trim()
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
