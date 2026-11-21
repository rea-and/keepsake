package io.keepsake.app.utils

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

class PkceTest {
    @Test fun challengeMatchesTheRfc7636Example() {
        assertEquals("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM", Pkce.challengeFor("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"))
    }

    @Test fun verifiersAreRandomAndTheServersExpectedLength() {
        val first = Pkce.newVerifier()
        assertEquals(43, first.length)
        assertNotEquals(first, Pkce.newVerifier())
        assertEquals(43, Pkce.challengeFor(first).length)
    }
}
