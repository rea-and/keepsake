package io.keepsake.app

import android.content.Context
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import io.keepsake.app.data.KeepsakeRepository
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID

@RunWith(AndroidJUnit4::class)
class AuthenticatedSyncTest {
    @Test fun androidCaptureAndSyncRequireTheConfiguredToken() = runBlocking {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val args = InstrumentationRegistry.getArguments()
        val server = requireNotNull(args.getString("serverUrl"))
        val token = requireNotNull(args.getString("apiToken"))
        val context = instrumentation.targetContext
        val prefs = context.getSharedPreferences(MainActivity.PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit().putString(MainActivity.KEY_SERVER_URL, server).putString(MainActivity.KEY_API_TOKEN, token).commit()

        val noToken = URL("$server/api/bookmarks").openConnection() as HttpURLConnection
        noToken.connectTimeout = 5000
        noToken.readTimeout = 5000
        assertEquals(401, noToken.responseCode)
        noToken.disconnect()

        val repository = KeepsakeRepository(context)
        assertTrue(repository.syncWithServer(server))
        val url = "https://example.com/android-" + UUID.randomUUID()
        assertTrue(repository.createBookmark(url, "Android test", "note from Android", null, listOf("android-test"), false, false, "https://example.com/cover.png", "example.com", server))
        assertTrue(repository.syncWithServer(server))
        val saved = repository.bookmarks.first { it.url == url }
        assertEquals("note from Android", saved.note)
        repository.toggleDone(saved.id, server)
        assertTrue(repository.syncWithServer(server))
        assertTrue(repository.bookmarks.first { it.id == saved.id }.isDone)
    }
}
