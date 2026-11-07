"""P2: typed errors carrying an HTTP status and a safe, user-facing detail string."""

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


class AppError(Exception):
    """Base error: `detail` is always safe to return to clients."""

    status_code: int = 500
    default_detail: str = "Internal error"

    def __init__(self, status_code: int | None = None, detail: str | None = None) -> None:
        if status_code is not None:
            self.status_code = status_code
        self.detail = detail if detail is not None else self.default_detail
        super().__init__(self.detail)

    def with_detail(self, detail: str) -> "AppError":
        """Return a copy of this error with a different safe detail (same status)."""
        clone = self.__class__.__new__(self.__class__)
        clone.status_code = self.status_code
        clone.detail = detail
        Exception.__init__(clone, detail)
        return clone


class IngestError(AppError):
    status_code = 422
    default_detail = "Could not read PDF"

    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(status_code, detail)


class NotFoundError(AppError):
    status_code = 404
    default_detail = "Not found"

    def __init__(self, detail: str = "Not found") -> None:
        super().__init__(404, detail)


class NotConfiguredError(AppError):
    status_code = 503
    default_detail = "Lesson generator is not configured"

    def __init__(self) -> None:
        super().__init__(503, self.default_detail)


class LLMTimeoutError(AppError):
    status_code = 504
    default_detail = "Lesson generation timed out. Please try again."

    def __init__(self) -> None:
        super().__init__(504, self.default_detail)


class LLMUpstreamError(AppError):
    status_code = 502
    default_detail = "Lesson generation failed. Please try again."

    def __init__(self, cause: BaseException | None = None) -> None:
        # The cause is intentionally NOT stored in the message (may contain provider text/keys).
        super().__init__(502, self.default_detail)
        self.cause_type = type(cause).__name__ if cause is not None else None


class PlanInvalidError(AppError):
    status_code = 502
    default_detail = "Lesson generation failed. Please try again."

    def __init__(self, reason: str | None = None) -> None:
        super().__init__(502, self.default_detail)
        # Internal-only diagnostic (never returned to clients).
        self.reason = reason


def with_detail(error: AppError, detail: str) -> AppError:
    return error.with_detail(detail)


async def app_error_handler(_request: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


def register_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(AppError, app_error_handler)  # type: ignore[arg-type]
