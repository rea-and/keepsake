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

    @Test fun tokenOnlyTravelsOverHttpsOrToPrivateNetworks() {
        assertTrue(isTokenSafeTransport(URL("https://keepsake.example/api/sync")))
        assertTrue(isTokenSafeTransport(URL("http://192.168.1.100:3000/api/sync")))
        assertTrue(isTokenSafeTransport(URL("http://10.0.2.2:3000/api/sync")))
        assertTrue(isTokenSafeTransport(URL("http://172.20.0.5/api/sync")))
        assertTrue(isTokenSafeTransport(URL("http://100.101.102.103/api/sync")))
        assertTrue(isTokenSafeTransport(URL("http://localhost:3000/api/sync")))
        assertTrue(isTokenSafeTransport(URL("http://nas.local:3000/api/sync")))
        assertFalse(isTokenSafeTransport(URL("http://keepsake.example/api/sync")))
        assertFalse(isTokenSafeTransport(URL("http://172.32.0.5/api/sync")))
        assertFalse(isTokenSafeTransport(URL("http://8.8.8.8/api/sync")))
        assertFalse(isTokenSafeTransport(URL("ftp://192.168.1.1/api/sync")))
    }
}
