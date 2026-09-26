"""
patient_tools.py

TOOL 2: get_patient_history(patient_id)

Looks up a patient's historical attendance behavior from the dataset:
no-show count, reschedule count, and last confirmed date. These figures
come from the patient's row(s) in appointments.csv — nothing is invented.
"""

from backend.dataset import get_appointments_by_patient


def get_patient_history(patient_id: str) -> dict:
    """Return attendance history for a patient from the real dataset.

    Returns:
        {"success": True, "patient_id": ..., "patient_name": ...,
         "no_show_count": int, "reschedule_count": int,
         "last_confirmed_date": str}
        or
        {"success": False, "error": "..."}
    """
    if not patient_id or not isinstance(patient_id, str):
        return {"success": False, "error": "No patient_id was provided."}

    rows = get_appointments_by_patient(patient_id)
    if not rows:
        return {
            "success": False,
            "error": f"No patient history found for patient_id '{patient_id}'.",
        }

    # The dataset has one row per appointment; for this dataset each patient
    # currently has exactly one row, but this stays correct even if a
    # patient later has multiple appointment rows by using their most
    # recent-looking record (last one in the file) for the summary fields
    # that describe the patient rather than one specific visit.
    row = rows[-1]

    return {
        "success": True,
        "patient_id": row["patient_id"],
        "patient_name": row["patient_name"],
        "no_show_count": int(row["no_show_count"]) if row["no_show_count"] != "" else 0,
        "reschedule_count": int(row["reschedule_count"]) if row["reschedule_count"] != "" else 0,
        "last_confirmed_date": row.get("last_confirmed_date", "") or "",
    }
