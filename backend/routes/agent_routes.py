"""
agent_routes.py

FastAPI router exposing the agent over HTTP.
"""

import json
import os
from pathlib import Path

from fastapi import APIRouter, HTTPException

from backend.agent import run_agent
from backend.schemas import ChatRequest, ChatResponse
from backend.dataset import get_all_appointments

router = APIRouter()

TRACES_DIR = Path(__file__).parent.parent.parent / "traces"


@router.post("/api/chat", response_model=ChatResponse)
def chat(request: ChatRequest):
    result = run_agent(appointment_id=request.appointment_id, message=request.message)
    return ChatResponse(**result)


@router.get("/api/appointments")
def appointments():
    """Return all appointment records for the dashboard."""
    return {"appointments": get_all_appointments()}


@router.get("/api/traces")
def list_traces():
    """Return a list of all saved trace files with metadata."""
    if not TRACES_DIR.exists():
        return {"traces": []}
    files = []
    for f in sorted(TRACES_DIR.glob("*.json"), key=lambda x: x.stat().st_mtime, reverse=True):
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            files.append({
                "filename": f.name,
                "id": f.stem,
                "size_bytes": f.stat().st_size,
                "modified": f.stat().st_mtime,
                "success": data.get("success", False),
                "appointment_id": data.get("appointment_id"),
                "tool_count": len(data.get("trace", [])),
                "has_risk": "Risk Level:" in (data.get("final_answer") or ""),
                "final_answer_preview": (data.get("final_answer") or "")[:120].replace("\n", " "),
            })
        except Exception:
            pass
    return {"traces": files}


@router.get("/api/traces/{trace_id}")
def get_trace(trace_id: str):
    """Return the full content of a specific trace file."""
    # sanitise: only allow safe filename chars
    safe_name = trace_id.replace("/", "").replace("\\", "").replace("..", "")
    path = TRACES_DIR / f"{safe_name}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Trace not found")
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/health")
def health():
    return {"status": "ok"}
