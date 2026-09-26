"""
schemas.py

Pydantic request/response models for the /api/chat endpoint.
"""

from typing import Any, Dict, List, Optional

from pydantic import BaseModel


class ChatRequest(BaseModel):
    # Preferred: a dedicated appointment_id field, sent by the current UI.
    appointment_id: Optional[str] = None
    # Kept for backward compatibility with the original schema, e.g.
    # {"message": "Analyze the no-show risk for appointment A003."}
    message: Optional[str] = None


class TraceStep(BaseModel):
    tool: str
    arguments: Dict[str, Any]
    result: Dict[str, Any]


class ChatResponse(BaseModel):
    success: bool
    appointment_id: Optional[str] = None
    final_answer: Optional[str] = None
    trace: List[TraceStep] = []
    error: Optional[str] = None
