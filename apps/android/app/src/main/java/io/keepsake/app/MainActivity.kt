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
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.browser.customtabs.CustomTabsIntent
import io.keepsake.app.databinding.ActivityMainBinding
import java.net.URLEncoder

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding

    companion object {
        const val PREFS_NAME = "keepsake_prefs"
        const val KEY_SERVER_URL = "server_url"
        const val KEY_AUTH_SESSION = "auth_session"
        const val DEFAULT_SERVER_URL = "http://10.0.2.2:3000" // Standard loopback for Android emulator/devices to host
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setupUI()
        setupWebView()
        handleBackNavigation()
        processIntent(intent)
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        setIntent(intent)
        intent?.let { processIntent(it) }
    }

    override fun onResume() {
        super.onResume()
        // If returning from Custom Tabs without finishing auth, restore button state
        if (binding.loginContainer.visibility == View.VISIBLE) {
            binding.pbGoogleSignIn.visibility = View.GONE
            binding.googleButtonContent.visibility = View.VISIBLE
            binding.btnGoogleSignIn.isEnabled = true
        }
    }

    private fun setupUI() {
        binding.etServerUrl.setText(getServerUrl())

        binding.btnGoogleSignIn.setOnClickListener {
            startGoogleSignIn()
        }

        binding.btnHeaderSettings.setOnClickListener {
            showServerConfigDialog()
        }

        binding.swipeRefreshLayout.setColorSchemeColors(0xFF38BDF8.toInt())
        binding.swipeRefreshLayout.setProgressBackgroundColorSchemeColor(0xFF18181B.toInt())
        binding.swipeRefreshLayout.setOnRefreshListener {
            binding.webView.reload()
        }
    }

    private fun processIntent(intent: Intent) {
        val serverUrl = getServerUrl()

        // 1. Check for Custom Scheme Deep Linking (keepsake://auth?session=...)
        val data = intent.data
        if (data != null && data.scheme == "keepsake") {
            val sessionJson = data.getQueryParameter("session")
            if (!sessionJson.isNullOrEmpty()) {
                getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                    .edit()
                    .putString(KEY_AUTH_SESSION, sessionJson)
                    .apply()

                Toast.makeText(this, "Signed in successfully!", Toast.LENGTH_SHORT).show()
                showWebView()
                injectSessionAndLoad(sessionJson)
                return
            }
        }

        // 2. Check if user is authenticated
        val storedSession = getStoredSession()
        if (storedSession.isNullOrEmpty()) {
            showLoginView()
            return
        }

        // User is authenticated
        showWebView()

        // 3. Handle shared link or bookmark reload intents
        val reloadBookmarks = intent.getBooleanExtra("reload_bookmarks", false)
        if (reloadBookmarks) {
            if (binding.webView.url == null) {
                binding.webView.loadUrl(serverUrl)
            } else {
                // Instantly notify webapp store to sync and display the newly imported bookmark
                binding.webView.evaluateJavascript(
                    """
                    (function() {
                        window.postMessage({ type: 'KEEPSAKE_SYNC_TRIGGER' }, '*');
                        window.dispatchEvent(new Event('focus'));
                    })();
                    """.trimIndent(),
                    null
                )
                binding.swipeRefreshLayout.isRefreshing = true
                binding.webView.postDelayed({
                    binding.swipeRefreshLayout.isRefreshing = false
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
            binding.webView.loadUrl(targetUrl)
        } else if (binding.webView.url == null) {
            binding.webView.loadUrl(serverUrl)
        }
    }

    private fun startGoogleSignIn() {
        val inputUrl = binding.etServerUrl.text.toString().trim().removeSuffix("/")
        if (inputUrl.isEmpty()) {
            binding.tvLoginStatus.text = "Please enter your Keepsake server URL"
            binding.tvLoginStatus.visibility = View.VISIBLE
            return
        }

        // Save configured server URL
        getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_SERVER_URL, inputUrl)
            .apply()

        binding.tvLoginStatus.visibility = View.GONE
        binding.googleButtonContent.visibility = View.GONE
        binding.pbGoogleSignIn.visibility = View.VISIBLE
        binding.btnGoogleSignIn.isEnabled = false

        val authUrl = "$inputUrl/api/auth/google/url?state=android"

        try {
            val customTabsIntent = CustomTabsIntent.Builder()
                .setShowTitle(true)
                .build()
            customTabsIntent.launchUrl(this, Uri.parse(authUrl))
        } catch (e: Exception) {
            // Fallback to standard external browser intent
            try {
                val browserIntent = Intent(Intent.ACTION_VIEW, Uri.parse(authUrl))
                startActivity(browserIntent)
            } catch (err: Exception) {
                binding.pbGoogleSignIn.visibility = View.GONE
                binding.googleButtonContent.visibility = View.VISIBLE
                binding.btnGoogleSignIn.isEnabled = true
                binding.tvLoginStatus.text = "Failed to launch browser: ${err.localizedMessage}"
                binding.tvLoginStatus.visibility = View.VISIBLE
            }
        }
    }

    private fun showLoginView() {
        binding.swipeRefreshLayout.visibility = View.GONE
        binding.loginContainer.visibility = View.VISIBLE
        binding.pbGoogleSignIn.visibility = View.GONE
        binding.googleButtonContent.visibility = View.VISIBLE
        binding.tvLoginStatus.visibility = View.GONE
        binding.btnGoogleSignIn.isEnabled = true
        binding.etServerUrl.setText(getServerUrl())
    }

    private fun showWebView() {
        binding.loginContainer.visibility = View.GONE
        binding.swipeRefreshLayout.visibility = View.VISIBLE
    }

    private fun getStoredSession(): String? {
        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        return prefs.getString(KEY_AUTH_SESSION, null)
    }

    private fun getServerUrl(): String {
        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        return prefs.getString(KEY_SERVER_URL, DEFAULT_SERVER_URL) ?: DEFAULT_SERVER_URL
    }

    private fun injectSessionAndLoad(sessionJson: String?) {
        val serverUrl = getServerUrl()
        if (binding.webView.url != null && binding.webView.url!!.startsWith(serverUrl)) {
            val escaped = sessionJson?.replace("\\", "\\\\")?.replace("'", "\\'")?.replace("\n", "") ?: ""
            binding.webView.evaluateJavascript(
                """
                (function() {
                    try {
                        localStorage.setItem('keepsake_auth_session', '$escaped');
                        window.location.reload();
                    } catch(e) {}
                })();
                """.trimIndent(),
                null
            )
        } else {
            binding.webView.loadUrl(serverUrl)
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        val settings = binding.webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.allowFileAccess = false
        settings.allowContentAccess = false
        settings.cacheMode = WebSettings.LOAD_DEFAULT
        settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        settings.useWideViewPort = true
        settings.loadWithOverviewMode = true
        settings.setSupportZoom(false)

        // Clean user agent for standard mobile view
        val defaultUa = settings.userAgentString
        val cleanUa = defaultUa
            .replace("; wv", "")
            .replace("Version/4.0 ", "")
        settings.userAgentString = cleanUa

        val cookieManager = CookieManager.getInstance()
        cookieManager.setAcceptCookie(true)
        cookieManager.setAcceptThirdPartyCookies(binding.webView, true)

        // Bridge to capture user sign-out from web app
        binding.webView.addJavascriptInterface(KeepsakeWebAppInterface(), "KeepsakeAndroid")

        binding.webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                if (newProgress < 100) {
                    binding.progressBar.visibility = View.VISIBLE
                    binding.progressBar.progress = newProgress
                } else {
                    binding.progressBar.visibility = View.GONE
                    binding.swipeRefreshLayout.isRefreshing = false
                }
            }
        }

        binding.webView.webViewClient = object : WebViewClient() {
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
                binding.swipeRefreshLayout.isRefreshing = false

                // Synchronize native auth session into WebView's localStorage
                val session = getStoredSession()
                if (!session.isNullOrEmpty()) {
                    val escaped = session.replace("\\", "\\\\").replace("'", "\\'").replace("\n", "")
                    view?.evaluateJavascript(
                        """
                        (function() {
                            try {
                                if (!localStorage.getItem('keepsake_auth_session')) {
                                    localStorage.setItem('keepsake_auth_session', '$escaped');
                                    window.location.reload();
                                }
                            } catch(e) {}
                        })();
                        """.trimIndent(),
                        null
                    )
                }
            }

            override fun onReceivedError(view: WebView?, request: WebResourceRequest?, error: WebResourceError?) {
                if (request?.isForMainFrame == true) {
                    binding.swipeRefreshLayout.isRefreshing = false
                    showServerConfigDialog()
                }
            }
        }
    }

    inner class KeepsakeWebAppInterface {
        @JavascriptInterface
        fun onLogout() {
            runOnUiThread {
                getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                    .edit()
                    .remove(KEY_AUTH_SESSION)
                    .apply()
                showLoginView()
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
            hint = "https://keepsake.example.com or http://10.0.2.2:3000"
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
                    binding.etServerUrl.setText(newUrl)
                    if (binding.swipeRefreshLayout.visibility == View.VISIBLE) {
                        binding.webView.loadUrl(newUrl)
                    }
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun handleBackNavigation() {
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (binding.swipeRefreshLayout.visibility == View.VISIBLE && binding.webView.canGoBack()) {
                    binding.webView.goBack()
                } else {
                    isEnabled = false
                    onBackPressedDispatcher.onBackPressed()
                }
            }
        })
    }
}
