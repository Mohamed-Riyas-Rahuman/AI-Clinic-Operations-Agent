"""
dataset.py

Single source of truth for reading the clinic appointment dataset from disk.
All tools go through this module so there is exactly one place that touches
the CSV file. Nothing here is hardcoded per-appointment; every tool call
re-reads (or reuses a cached read of) the actual dataset on disk.
"""

import csv
import os
import threading

_DATA_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "appointments.csv")

_lock = threading.Lock()
_cache = None
_cache_mtime = None


def _load_rows():
    """Read appointments.csv from disk and return a list of dict rows.

    Re-reads the file if it has changed on disk since the last read, so the
    dataset can be edited without restarting the server. Values are returned
    as strings straight from the CSV (empty string for blank cells).
    """
    global _cache, _cache_mtime

    if not os.path.exists(_DATA_PATH):
        raise FileNotFoundError(f"Dataset not found at {_DATA_PATH}")

    mtime = os.path.getmtime(_DATA_PATH)

    with _lock:
        if _cache is not None and _cache_mtime == mtime:
            return _cache

        rows = []
        with open(_DATA_PATH, newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                clean = {k: (v.strip() if isinstance(v, str) else v) for k, v in row.items()}
                rows.append(clean)

        _cache = rows
        _cache_mtime = mtime
        return rows


def get_all_appointments():
    """Return every appointment record in the dataset (list of dicts)."""
    return _load_rows()


def get_appointment_by_id(appointment_id: str):
    """Return the single appointment dict matching appointment_id, or None."""
    appointment_id = (appointment_id or "").strip().upper()
    for row in _load_rows():
        if row.get("appointment_id", "").strip().upper() == appointment_id:
            return row
    return None


def get_appointments_by_patient(patient_id: str):
    """Return every appointment row belonging to a given patient_id."""
    patient_id = (patient_id or "").strip().upper()
    return [r for r in _load_rows() if r.get("patient_id", "").strip().upper() == patient_id]


def _normalize_date(d: str) -> str:
    if not d:
        return ""
    d = d.strip().replace("/", "-")
    parts = d.split("-")
    if len(parts) == 3:
        if len(parts[0]) == 4:  # YYYY-MM-DD -> DD-MM-YYYY
            return f"{parts[2].zfill(2)}-{parts[1].zfill(2)}-{parts[0]}"
        elif len(parts[2]) == 4:  # DD-MM-YYYY
            return f"{parts[0].zfill(2)}-{parts[1].zfill(2)}-{parts[2]}"
    return d


def get_appointments_by_doctor_date(doctor: str, appointment_date: str):
    """Return every appointment row for a given doctor on a given date."""
    doctor = (doctor or "").strip().lower()
    target_date = _normalize_date(appointment_date)
    return [
        r for r in _load_rows()
        if r.get("doctor", "").strip().lower() == doctor
        and _normalize_date(r.get("appointment_date", "")) == target_date
    ]
