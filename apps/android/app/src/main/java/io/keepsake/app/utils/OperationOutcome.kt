package io.keepsake.app.utils

/** What to do with a queued server request after the server answered it. */
enum class OperationOutcome {
    /** Applied (or already gone for a delete): remove it from the queue. */
    SUCCESS,
    /** Network or server trouble: keep it and try again later, in order. */
    RETRY_LATER,
    /** The server will never accept this request (deleted item, invalid data): drop it so it cannot block the queue. */
    DROP,
    /** The session is gone or revoked: stop and ask the user to sign in again. */
    SIGN_IN_REQUIRED
}

fun classifyStatus(method: String, status: Int): OperationOutcome = when {
    status in 200..299 -> OperationOutcome.SUCCESS
    method == "DELETE" && status == 404 -> OperationOutcome.SUCCESS
    status == 401 -> OperationOutcome.SIGN_IN_REQUIRED
    status == 408 || status == 425 || status == 429 || status >= 500 -> OperationOutcome.RETRY_LATER
    status in 400..499 -> OperationOutcome.DROP
    else -> OperationOutcome.RETRY_LATER
}
