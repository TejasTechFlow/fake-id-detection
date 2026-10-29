"""CyberShield AI backend. Run: uvicorn app.main:app --reload --port 8000 (from the backend folder)."""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.core.config import settings
from app.core.errors import register_handlers
from app.database.db import init_db


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(title="CyberShield AI - Fake ID Detection API", version=settings.app_version, lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_methods=["GET", "POST", "DELETE"],
                   allow_headers=["Content-Type", "X-Admin-Token"])
register_handlers(app)
app.include_router(router)
