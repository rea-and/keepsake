package io.keepsake.app.utils

import java.net.URL
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ApiAuthTest {
    @Test fun tokenOnlyGoesToTheConfiguredServerApi() {
        assertTrue(isServerApiUrl("https://keepsake.example/base", URL("https://keepsake.example/base/api/bookmarks")))
        assertFalse(isServerApiUrl("https://keepsake.example/base", URL("https://other.example/base/api/bookmarks")))
        assertFalse(isServerApiUrl("https://keepsake.example/base", URL("http://keepsake.example/base/api/bookmarks")))
        assertFalse(isServerApiUrl("https://keepsake.example/base", URL("https://keepsake.example/other/api/bookmarks")))
        assertFalse(isServerApiUrl("invalid", URL("https://keepsake.example/api/bookmarks")))
    }
}
