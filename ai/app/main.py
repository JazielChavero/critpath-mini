"""
AI summary service.  uvicorn app.main:app --port 8001
Only the Node API should call it: it listens on localhost and, when
AI_SERVICE_TOKEN is set, requires that token in the x-service-token header.
"""
from __future__ import annotations

import os

from fastapi import Depends, FastAPI, Header, HTTPException

from .models import SummaryRequest, SummaryResponse
from .summarize import summarize
from .writer import Writer, writer_from_env


def create_app(writer: Writer | None = None, use_env_writer: bool = True) -> FastAPI:
    app = FastAPI(title="CritPath Mini AI", docs_url=None, redoc_url=None)
    active = writer if writer is not None else (writer_from_env() if use_env_writer else None)
    token = os.environ.get("AI_SERVICE_TOKEN")

    def check_token(x_service_token: str | None = Header(default=None)) -> None:
        if token and x_service_token != token:
            raise HTTPException(status_code=401, detail="Invalid service token.")

    @app.get("/health")
    def health() -> dict:
        return {"ok": True, "model": active.model if active else None}

    @app.post("/summaries", response_model=SummaryResponse, dependencies=[Depends(check_token)])
    def create_summary(req: SummaryRequest) -> SummaryResponse:
        return summarize(req.project, req.lang, active)

    return app


app = create_app()
