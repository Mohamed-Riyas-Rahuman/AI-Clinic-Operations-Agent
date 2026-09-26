"""
appointment_tools.py

TOOL 1: get_appointment_details(appointment_id)

Looks up a single appointment record from the clinic dataset. This is the
entry point tool the agent calls first, using the appointment_id the
front-desk coordinator typed into the UI.
"""

import re

from backend.dataset import get_appointment_by_id

APPOINTMENT_ID_PATTERN = re.compile(r"^A\d{3}$", re.IGNORECASE)


def is_valid_appointment_id_format(appointment_id: str) -> bool:
    """Syntactic check only (e.g. 'A003'). Does not check the dataset."""
    if not appointment_id or not isinstance(appointment_id, str):
        return False
    return bool(APPOINTMENT_ID_PATTERN.match(appointment_id.strip()))


def get_appointment_details(appointment_id: str) -> dict:
    """Return details for one appointment from the real dataset.

    Returns:
        {"success": True, ...appointment fields...}
        or
        {"success": False, "error": "..."}
    """
    if not is_valid_appointment_id_format(appointment_id):
        return {
            "success": False,
            "error": f"'{appointment_id}' is not a valid appointment ID format (expected e.g. A001).",
        }

    row = get_appointment_by_id(appointment_id)
    if row is None:
        return {
            "success": False,
            "error": f"Appointment {appointment_id.strip().upper()} was not found in the clinic dataset.",
        }

    return {
        "success": True,
        "appointment_id": row["appointment_id"],
        "patient_name": row["patient_name"],
        "patient_id": row["patient_id"],
        "doctor": row["doctor"],
        "appointment_date": row["appointment_date"],
        "time_slot": row["time_slot"],
        "appointment_type": row["appointment_type"],
        "status": row["status"],
        "consultation_duration_mins": int(row["consultation_duration_mins"]) if row["consultation_duration_mins"] else None,
        "notes": row.get("notes", ""),
    }
