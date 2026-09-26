"""
registry.py

Central tool registry. Every tool the LLM is allowed to call is declared
here exactly once, alongside the real Python function that implements it.
The agent loop uses this registry to (a) advertise tool schemas to the LLM
and (b) actually execute a tool call the LLM asks for. There is no tool
definition here that does not map to real, working code.
"""

from backend.tools.appointment_tools import get_appointment_details
from backend.tools.patient_tools import get_patient_history
from backend.tools.schedule_tools import get_schedule_context

# ---------------------------------------------------------------------------
# OpenAI/Groq-style tool schemas advertised to the LLM.
# ---------------------------------------------------------------------------
TOOL_SCHEMAS = [
    {
        "type": "function",
        "function": {
            "name": "get_appointment_details",
            "description": (
                "Look up a single appointment's details (patient, doctor, date, "
                "time, type, status, duration, notes) from the clinic dataset "
                "using its appointment_id. Call this first."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "appointment_id": {
                        "type": "string",
                        "description": "The appointment ID, e.g. 'A003'.",
                    }
                },
                "required": ["appointment_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_patient_history",
            "description": (
                "Look up a patient's attendance history (no_show_count, "
                "reschedule_count, last_confirmed_date) from the clinic dataset "
                "using their patient_id. Call this after get_appointment_details "
                "once you know the patient_id."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "patient_id": {
                        "type": "string",
                        "description": "The patient ID, e.g. 'P003'.",
                    }
                },
                "required": ["patient_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_schedule_context",
            "description": (
                "Look up the doctor's full schedule on the appointment's date: "
                "total appointments, how many are confirmed/unconfirmed/pending, "
                "and total scheduled minutes. Use this as supporting context when "
                "it would meaningfully inform the risk assessment, not on every "
                "single case."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "doctor": {
                        "type": "string",
                        "description": "The doctor's name exactly as it appears in the dataset, e.g. 'Dr. Suresh'.",
                    },
                    "appointment_date": {
                        "type": "string",
                        "description": "The appointment date in YYYY-MM-DD format, e.g. '2026-08-24'.",
                    },
                },
                "required": ["doctor", "appointment_date"],
            },
        },
    },
]

# ---------------------------------------------------------------------------
# Name -> real callable. Kept in lockstep with TOOL_SCHEMAS above.
# ---------------------------------------------------------------------------
TOOL_FUNCTIONS = {
    "get_appointment_details": get_appointment_details,
    "get_patient_history": get_patient_history,
    "get_schedule_context": get_schedule_context,
}


def execute_tool(tool_name: str, arguments: dict) -> dict:
    """Execute a real tool by name with the given arguments dict.

    Returns a structured error (not an exception) if the tool name is
    unknown, so the agent loop can hand a clean error back to the LLM
    instead of crashing.
    """
    func = TOOL_FUNCTIONS.get(tool_name)
    if func is None:
        return {"success": False, "error": f"Unknown tool requested: '{tool_name}'."}

    try:
        return func(**arguments)
    except TypeError as e:
        return {"success": False, "error": f"Invalid arguments for tool '{tool_name}': {e}"}
    except Exception as e:
        return {"success": False, "error": f"Tool '{tool_name}' failed: {e}"}
