package io.keepsake.app

import android.app.Application
import android.content.pm.ApplicationInfo
import android.webkit.WebView

class KeepsakeApp : Application() {
    override fun onCreate() {
        super.onCreate()
        // WebView debugging only in debuggable (development) builds
        val debuggable = (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0
        WebView.setWebContentsDebuggingEnabled(debuggable)
    }
}
