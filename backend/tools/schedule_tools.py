"""
schedule_tools.py

TOOL 3: get_schedule_context(doctor, appointment_date)

Reads the dataset dynamically to describe a doctor's full schedule on a
given date: how many appointments, how many are confirmed / unconfirmed /
pending, and total scheduled minutes. This is supporting context, not the
primary risk signal.
"""

from backend.dataset import get_appointments_by_doctor_date


def get_schedule_context(doctor: str, appointment_date: str) -> dict:
    """Return schedule context for a doctor on a date from the real dataset.

    Returns:
        {"success": True, "doctor": ..., "appointment_date": ...,
         "total_appointments": int, "confirmed_appointments": int,
         "unconfirmed_appointments": int, "pending_appointments": int,
         "total_scheduled_minutes": int, "appointments": [ ... ]}
        or
        {"success": False, "error": "..."}
    """
    if not doctor or not appointment_date:
        return {
            "success": False,
            "error": "Both doctor and appointment_date are required for schedule context.",
        }

    rows = get_appointments_by_doctor_date(doctor, appointment_date)
    if not rows:
        return {
            "success": False,
            "error": f"No schedule found for {doctor} on {appointment_date} in the clinic dataset.",
        }

    confirmed = sum(1 for r in rows if r["status"].strip().lower() == "confirmed")
    unconfirmed = sum(1 for r in rows if r["status"].strip().lower() == "unconfirmed")
    pending = sum(1 for r in rows if r["status"].strip().lower() == "pending")
    total_minutes = sum(int(r["consultation_duration_mins"]) for r in rows if r["consultation_duration_mins"])

    appointments = sorted(
        [
            {
                "appointment_id": r["appointment_id"],
                "patient_name": r["patient_name"],
                "time_slot": r["time_slot"],
                "status": r["status"],
                "duration": int(r["consultation_duration_mins"]) if r["consultation_duration_mins"] else None,
            }
            for r in rows
        ],
        key=lambda a: a["time_slot"],
    )

    return {
        "success": True,
        "doctor": doctor,
        "appointment_date": appointment_date,
        "total_appointments": len(rows),
        "confirmed_appointments": confirmed,
        "unconfirmed_appointments": unconfirmed,
        "pending_appointments": pending,
        "total_scheduled_minutes": total_minutes,
        "appointments": appointments,
    }
