import logging

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)


class SummarizationError(Exception):
    """Raised when a summarization provider fails or returns invalid output."""

    pass


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(SummarizationError)
    async def summarization_error_handler(
        request: Request, exc: SummarizationError
    ) -> JSONResponse:
        # Provider failures are logged server-side; client receives a generic 502.
        logger.error(
            "Summarization provider error on %s %s: %s",
            request.method,
            request.url.path,
            exc,
        )
        return JSONResponse(
            status_code=502,
            content={
                "error": {
                    "code": "provider_error",
                    "message": "Summarization provider failed.",
                }
            },
        )

    @app.exception_handler(Exception)
    async def unexpected_error_handler(
        request: Request, exc: Exception
    ) -> JSONResponse:
        # Detailed exceptions stay in server logs; clients receive no internals.
        logger.exception("Unhandled error while processing %s %s", request.method, request.url.path)
        return JSONResponse(
            status_code=500,
            content={
                "error": {
                    "code": "internal_server_error",
                    "message": "An unexpected error occurred.",
                }
            },
        )
