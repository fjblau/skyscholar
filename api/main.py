from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import os

from database.connection import connect_db, disconnect_db
from api.routers import flights, health, stations, telemetry, exports, payloads, admin

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass


@asynccontextmanager
async def lifespan(app: FastAPI):
    if not connect_db():
        raise RuntimeError("Failed to connect to ArangoDB. ArangoDB is required.")
    yield
    disconnect_db()


app = FastAPI(title="SkyScholar API", lifespan=lifespan)

CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(flights.router)
app.include_router(stations.router)
app.include_router(telemetry.router)
app.include_router(exports.router)
app.include_router(payloads.router)
app.include_router(admin.router)
