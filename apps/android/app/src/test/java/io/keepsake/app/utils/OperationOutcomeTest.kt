package io.keepsake.app.utils

import org.junit.Assert.assertEquals
import org.junit.Test

class OperationOutcomeTest {
    @Test fun successfulAndAlreadyDeletedRequestsLeaveTheQueue() {
        assertEquals(OperationOutcome.SUCCESS, classifyStatus("PUT", 200))
        assertEquals(OperationOutcome.SUCCESS, classifyStatus("POST", 201))
        assertEquals(OperationOutcome.SUCCESS, classifyStatus("DELETE", 404))
    }

    @Test fun permanentFailuresAreDroppedInsteadOfBlockingTheQueue() {
        assertEquals(OperationOutcome.DROP, classifyStatus("PUT", 404))
        assertEquals(OperationOutcome.DROP, classifyStatus("PUT", 400))
        assertEquals(OperationOutcome.DROP, classifyStatus("POST", 409))
        assertEquals(OperationOutcome.DROP, classifyStatus("PUT", 422))
    }

    @Test fun temporaryFailuresAreRetriedInOrder() {
        assertEquals(OperationOutcome.RETRY_LATER, classifyStatus("PUT", 500))
        assertEquals(OperationOutcome.RETRY_LATER, classifyStatus("PUT", 502))
        assertEquals(OperationOutcome.RETRY_LATER, classifyStatus("PUT", 429))
        assertEquals(OperationOutcome.RETRY_LATER, classifyStatus("PUT", 408))
    }

    @Test fun anExpiredSessionAsksForSignIn() {
        assertEquals(OperationOutcome.SIGN_IN_REQUIRED, classifyStatus("PUT", 401))
        assertEquals(OperationOutcome.SIGN_IN_REQUIRED, classifyStatus("GET", 401))
    }
}
