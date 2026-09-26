"""
main.py

FastAPI application entrypoint. Serves the CareFirst Clinic web UI at "/"
and mounts the agent API. Loads GROQ_API_KEY from .env via python-dotenv.
"""

import os

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from backend.routes.agent_routes import router as agent_router

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")
TRACES_DIR = os.path.join(BASE_DIR, "traces")

app = FastAPI(title="StratAI No-Show Prevention Agent")

# Mount agent and operational routes
app.include_router(agent_router)

# Serve app.js / style.css / embedded traces under /static/*
app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")

# Mount raw traces files under /traces/*
if os.path.exists(TRACES_DIR):
    app.mount("/traces", StaticFiles(directory=TRACES_DIR), name="traces")


@app.get("/")
def serve_index():
    return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))
