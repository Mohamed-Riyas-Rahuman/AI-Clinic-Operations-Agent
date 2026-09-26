# StratAI — CareFirst Clinic Operations Agent

An AI-powered clinic operations agent built for **CareFirst Clinic** to help front-desk coordinators assess appointment no-show risk and retrieve appointment, patient, and doctor schedule information through natural-language queries.

**Author:** Mohamed Riyas

---

## 1. Project Overview

The AI Clinic Operations Agent combines an LLM-powered reasoning loop with real Python tools and a clinic appointment dataset. It supports two categories of operations:

### No-Show Risk Assessment

The agent analyzes appointment information and returns:

- Risk Level
- Confidence
- Key Evidence
- Escalation recommendation
- Recommended action

**Risk levels:** `LOW` · `MODERATE` · `HIGH` · `INSUFFICIENT`

### Clinic Operations Queries

The agent can also answer:

- Appointment details
- Patient history
- Doctor schedules
- Appointments for a doctor on a specific date
- Combined queries
- Clarification requests when information is missing

---

## 2. Key Features

**Natural-Language Queries**
The system accepts normal questions instead of requiring only appointment IDs, e.g.:
- *"Analyze A003"*
- *"Show the history of P003"*
- *"Give me the details of A005"*
- *"What appointments does Dr. Suresh have on 2026-08-24?"*
- *"Analyze A003 and show me Dr. Suresh's appointments on 2026-08-24"*

**Real Tool Calling**
The LLM does not receive the entire dataset and generate an answer directly. Instead:

```
User Query
   │
   ▼
LLM → Select Required Tool
   │
   ▼
Python Tool → appointments.csv
   │
   ▼
Tool Result → LLM Reasoning
   │
   ▼
Additional Tool Call (if required)
   │
   ▼
Final Response
```

The LLM determines which tools are required based on user intent.

**Decision Trace**
Every tool execution can be viewed via **Decision Trace → Show Trace**, which displays:
- Tool name
- Tool arguments
- Tool result
- Execution sequence
- Final response

Execution traces are also saved under `traces/` (e.g. `traces/A003_trace.json`).

---

## 3. Architecture

```
┌──────────────────────────┐
│         Browser          │
│       HTML/CSS/JS        │
└────────────┬──────────────┘
             │ POST /api/chat
             ▼
┌──────────────────────────┐
│         FastAPI          │
│          main.py         │
└────────────┬──────────────┘
             ▼
┌──────────────────────────┐
│        Agent Loop        │
│    backend/agent.py      │
└────────────┬──────────────┘
             ▼
┌──────────────────────────┐
│         Groq LLM         │
│       Tool Calling       │
└────────────┬──────────────┘
             │
      ┌──────┼──────┐
      ▼      ▼      ▼
Appointment Patient Schedule
   Tool      Tool     Tool
      │      │      │
      └──────┼──────┘
             ▼
┌──────────────────────────┐
│     appointments.csv     │
│        25 records        │
└──────────────────────────┘
```

---

## 4. Technology Stack

| Component | Technology |
|---|---|
| Programming Language | Python |
| Backend | FastAPI |
| Server | Uvicorn |
| LLM Provider | Groq API |
| LLM Model | `openai/gpt-oss-20b` |
| LLM Client | Groq Python SDK |
| Data | CSV |
| Frontend | HTML, CSS, JavaScript |
| Environment Variables | python-dotenv |
| Tool Calling | Groq Tool Calling |
| Trace Storage | JSON |

*No frontend framework or build system is required.*

---

## 5. Project Structure

```
StratAI_NoShow_Agent/
│
├── backend/
│   ├── agent.py
│   ├── dataset.py
│   ├── prompts.py
│   │
│   ├── routes/
│   │   └── agent_routes.py
│   │
│   └── tools/
│       ├── appointment_tools.py
│       ├── patient_tools.py
│       ├── schedule_tools.py
│       └── registry.py
│
├── data/
│   └── appointments.csv
│
├── frontend/
│   ├── index.html
│   ├── app.js
│   └── style.css
│
├── traces/
│   └── *.json
│
├── main.py
├── requirements.txt
├── .env.example
├── .gitignore
└── README.md
```

---

## 6. Dataset

The application uses `data/appointments.csv`, containing 25 appointment records with the following fields:

`appointment_id`, `patient_name`, `patient_id`, `doctor`, `appointment_date`, `time_slot`, `appointment_type`, `status`, `no_show_count`, `reschedule_count`, `last_confirmed_date`, `consultation_duration_mins`, `notes`

The CSV is the single source of truth for all operational information used by the agent.

---

## 7. Agent Tools

The system contains three real Python tools.

### 7.1 `get_appointment_details`
**Input:** `appointment_id` (e.g. `A003`)
Retrieves the complete appointment record.

### 7.2 `get_patient_history`
**Input:** `patient_id` (e.g. `P003`)
Retrieves patient attendance history, including no-show count, reschedule count, and last confirmed date.

### 7.3 `get_schedule_context`
**Input:** `doctor`, `appointment_date` (e.g. Dr. Suresh, `2026-08-24`)
Retrieves the doctor's appointments for that date, including appointment ID, patient name, time, status, appointment type, duration, status counts, and total scheduled minutes.

---

## 8. Supported Queries

| Type | Example |
|---|---|
| Risk Analysis | `Analyze A003` |
| Appointment Details | `Give me the details of A005` |
| Patient History | `Show the history of P003` |
| Doctor Schedule | `What appointments does Dr. Suresh have on 2026-08-24?` |
| Combined Query | `Analyze A003 and show me Dr. Suresh's appointments on 2026-08-24` |
| Clarification | `Show me the schedule for Dr. Suresh` *(agent will ask for the missing date rather than inventing one)* |

---

## 9. Risk Assessment

The risk assessment weighs multiple signals together rather than applying a single deterministic rule.

**Positive signals:** confirmed status, recent confirmation, low historical no-show count, low reschedule count, reliable attendance notes

**Negative signals:** multiple previous no-shows, multiple reschedules, unconfirmed/pending status, old confirmation date, notes describing repeated missed appointments

**Conflicting signals:** e.g. 5 previous no-shows *combined with* a confirmation made today — the agent reasons about both historical risk and current confirmation together.

### Risk Levels

| Level | Meaning |
|---|---|
| `LOW` | Evidence indicates relatively low concern |
| `MODERATE` | Meaningful concern due to mixed or moderate signals |
| `HIGH` | Multiple strong risk signals indicate substantial concern |
| `INSUFFICIENT` | Available information is insufficient for a reliable assessment |

Responses can also include Confidence, Escalation, Key Evidence, and Recommended Action. **The final operational decision remains with clinic staff.**

---

## 10. Important Test Cases

| Case | Profile | Expected Direction |
|---|---|---|
| **A001** | 0 no-shows, 0 reschedules, confirmed, recently confirmed | `LOW` |
| **A003** | 3 no-shows, 1 reschedule, confirmed today | `MODERATE` |
| **A005** | 5 no-shows, 3 reschedules, unconfirmed, old confirmation, negative notes | `HIGH`, Escalation: Yes |
| **A021** | New patient, 0 no-shows, 0 reschedules, pending, no confirmation date | `INSUFFICIENT`, Confidence: Low, Escalation: Yes |
| **A022** | 5 no-shows, 0 reschedules, confirmed today | `MODERATE` |

---

## 11. Installation

### Prerequisites
- Python 3.10+
- Internet connection
- Groq API key

### Step 1 — Open the Project
```bash
cd Phase_3_Agent/StratAI_NoShow_Agent
```

### Step 2 — Create a Virtual Environment

**Windows**
```bash
python -m venv venv
venv\Scripts\activate
```

**macOS / Linux**
```bash
python3 -m venv venv
source venv/bin/activate
```

### Step 3 — Install Dependencies
```bash
pip install -r requirements.txt
```

---

## 12. Configure the API Key

Create a `.env` file in the project root:

```
AI_NoShow_Agent/
├── .env
├── main.py
├── requirements.txt
└── ...
```

Add your key:

```
GROQ_API_KEY=your_actual_groq_api_key
```

> **Important:** That file is only a template (`GROQ_API_KEY=your_key_here`). Keep the real `.env` private and out of version control.

---

## 13. Run the Application

From the project root:

```bash
uvicorn main:app --reload
```

You should see:

```
Uvicorn running on http://127.0.0.1:8000
Application startup complete.
```

---

## 14. Open the Web Application

Open **http://127.0.0.1:8000/** in your browser.

Do not manually open `frontend/index.html` — FastAPI serves the frontend automatically.

---

## 15. Example Inputs

**Risk Assessment**
```
Analyze A001
Analyze A003
Analyze A005
Analyze A021
Analyze A022
```

**Patient History**
```
Show the history of P003
Show the history of P005
```

**Appointment Details**
```
Give me the details of A003
Give me the details of A005
```

**Doctor Schedule**
```
What appointments does Dr. Suresh have on 2026-08-24?
What appointments does Dr. Priya have on 2026-08-27?
```

**Combined Query**
```
Analyze A003 and show me Dr. Suresh's appointments on 2026-08-24
```

**Failure / Clarification**
```
A999
Show me the schedule for Dr. Suresh
Show me the patient history
```

---

## 16. Decision Trace

After receiving a response, select **Show Trace** to see the actual tools used during execution, for example:

```
Tool: get_appointment_details
Arguments: appointment_id = A003
Result: <returned record>

Tool: get_patient_history
Arguments: patient_id = P003
Result: <returned record>
```

This provides full visibility into the agent's execution process.

---

## 17. Saved Execution Traces

Execution traces are automatically saved under `traces/`, e.g.:

```
traces/
├── A001_trace.json
├── A003_trace.json
├── A005_trace.json
├── A021_trace.json
└── ...
```

These files provide a permanent record of actual agent execution.

---

## 18. Error Handling

| Situation | Behavior |
|---|---|
| Empty query | Requests a valid query |
| Invalid input | Provides a clear response |
| Appointment not found | Reports that the appointment does not exist |
| Missing doctor date | Requests the date |
| Missing patient ID | Requests the patient ID |
| Insufficient information | Returns `INSUFFICIENT` rather than guessing |
| LLM / API failure | Displays a user-friendly error |

The agent never fabricates information that is unavailable in the dataset.

---

## 19. Human-in-the-Loop

The system is an assistant for clinic staff. It does **not**:

- Automatically cancel appointments
- Automatically double-book patients
- Send real SMS messages or emails
- Make medical decisions
- Diagnose patients
- Guarantee patient attendance
- Replace human judgment

The final operational decision always remains with the clinic coordinator.

---

## 20. Scope

The project focuses on:

- No-show risk reasoning
- Appointment information retrieval
- Patient history retrieval
- Doctor schedule retrieval
- Natural-language interaction
- LLM tool calling
- Conflict handling
- Missing-data handling
- Execution traces
- Plain-language operational responses

It is intentionally **not** a complete hospital or clinic management system.

---

## 21. AI Assistance Disclosure

AI assistance was used during development for brainstorming, prompt refinement, code assistance, debugging, documentation, and testing guidance. The final implementation and behavior were reviewed and validated by the author.

---

## 22. Quick Start

```bash
cd Phase_3_Agent/StratAI_NoShow_Agent
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

Create `.env`:
```
GROQ_API_KEY=your_actual_groq_api_key
```

Run:
```bash
uvicorn main:app --reload
```

Open **http://127.0.0.1:8000/**, try `Analyze A003`, then click **Show Trace**.

You can also test:
```
What appointments does Dr. Suresh have on 2026-08-24?
Show the history of P003
```

---

## 23. Author

**Mohamed Riyas Rahuman M**
M.Sc. Data Science with Business Analysis
AI / Machine Learning Candidate

**Project:** AI — CareFirst Clinic Operations Agent
