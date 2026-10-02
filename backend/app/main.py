"""InvoiceGuard FastAPI Application Factory."""

import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.app.api.v1.health import router as health_router
from backend.app.config import settings
from backend.app.core.db import init_db
from backend.app.logging import logger, request_id_ctx
from backend.app.schemas.contracts import ErrorDetails, ErrorResponse


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: ensure tables created and directories ready
    logger.info("Initializing database schema...")
    init_db()
    settings.upload_path.mkdir(parents=True, exist_ok=True)
    logger.info(f"InvoiceGuard started successfully in {settings.ENVIRONMENT} mode.")
    yield
    logger.info("InvoiceGuard shutting down...")


def create_app() -> FastAPI:
    # Ensure database tables exist
    init_db()

    app = FastAPI(
        title="InvoiceGuard API",
        description="Explainable Multimodal Invoice Anomaly & Fraud-Risk Detection API",
        version="0.1.0",
        lifespan=lifespan,
    )

    # 1. CORS Middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # 2. Request ID & Structured Logging Middleware
    @app.middleware("http")
    async def request_middleware(request: Request, call_next):
        req_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        token = request_id_ctx.set(req_id)
        start_time = time.perf_counter()

        logger.info(f"--> {request.method} {request.url.path}")
        try:
            response = await call_next(request)
            process_time = (time.perf_counter() - start_time) * 1000
            response.headers["X-Request-ID"] = req_id
            response.headers["X-Process-Time-Ms"] = f"{process_time:.2f}"
            logger.info(
                f"<-- {request.method} {request.url.path} status={response.status_code} duration={process_time:.2f}ms"
            )
            return response
        except Exception as exc:
            process_time = (time.perf_counter() - start_time) * 1000
            logger.exception(
                f"Unhandled exception during {request.method} {request.url.path} after {process_time:.2f}ms: {exc}"
            )
            return JSONResponse(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                content=ErrorResponse(
                    error=ErrorDetails(
                        code="INTERNAL_SERVER_ERROR",
                        message="An unexpected server error occurred.",
                        details=str(exc) if settings.DEBUG else None,
                    )
                ).model_dump(),
                headers={"X-Request-ID": req_id},
            )
        finally:
            request_id_ctx.reset(token)

    # 3. Uniform Error Handlers
    from starlette.exceptions import HTTPException as StarletteHTTPException

    @app.exception_handler(StarletteHTTPException)
    async def starlette_http_exception_handler(request: Request, exc: StarletteHTTPException):
        detail = exc.detail
        if isinstance(detail, dict) and "code" in detail and "message" in detail:
            error_details = ErrorDetails(
                code=detail["code"],
                message=detail["message"],
                details=detail.get("details"),
            )
        else:
            code = "NOT_FOUND" if exc.status_code == 404 else "HTTP_ERROR"
            error_details = ErrorDetails(
                code=code,
                message=str(detail),
                details=None,
            )
        return JSONResponse(
            status_code=exc.status_code,
            content=ErrorResponse(error=error_details).model_dump(),
        )

    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException):
        detail = exc.detail
        if isinstance(detail, dict) and "code" in detail and "message" in detail:
            error_details = ErrorDetails(
                code=detail["code"],
                message=detail["message"],
                details=detail.get("details"),
            )
        else:
            error_details = ErrorDetails(
                code="HTTP_ERROR",
                message=str(detail),
                details=None,
            )
        return JSONResponse(
            status_code=exc.status_code,
            content=ErrorResponse(error=error_details).model_dump(),
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content=ErrorResponse(
                error=ErrorDetails(
                    code="VALIDATION_ERROR",
                    message="Request validation failed.",
                    details=exc.errors(),
                )
            ).model_dump(),
        )

    # 4. Include Routers
    app.include_router(health_router, prefix=settings.API_V1_STR)
    from backend.app.api.v1.invoices import router as invoices_router
    app.include_router(invoices_router, prefix=settings.API_V1_STR)

    return app


app = create_app()
