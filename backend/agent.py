"""
agent.py

The agent's reasoning loop:

    USER QUERY -> LLM -> TOOL CALL(S) -> TOOL RESULT(S) -> LLM -> FINAL RESPONSE

run_agent() is the entry point used by the API route. It starts a tool-calling
loop (Groq) against the tool registry, which reads the actual dataset on disk.
It logs all steps and writes the trace JSON to traces/ directory on completion.
"""

import os
import re
import json

from backend.llm import call_llm
from backend.prompts import SYSTEM_PROMPT
from backend.tools.registry import TOOL_SCHEMAS, execute_tool

MAX_TOOL_ITERATIONS = 6


def run_agent(appointment_id: str = None, message: str = None) -> dict:
    """Run the clinic operations agent reasoning loop for a query.

    Returns a dict shaped like:
        {"success": bool, "appointment_id": str|None, "final_answer": str|None,
         "trace": [ {"tool": str, "arguments": dict, "result": dict}, ... ],
         "error": str|None}
    """
    trace = []

    # 1. Determine user query input (prefer message for natural language queries)
    user_query = ""
    if message and message.strip():
        user_query = message.strip()
    elif appointment_id and appointment_id.strip():
        user_query = appointment_id.strip()

    if not user_query:
        return {
            "success": False,
            "appointment_id": None,
            "final_answer": None,
            "trace": trace,
            "error": "Please enter a query (e.g. 'Analyze A003' or 'Show history of P003').",
        }

    # 2. Build the message list starting with the system prompt and the user's query
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user_query},
    ]

    try:
        final_answer = None
        for _ in range(MAX_TOOL_ITERATIONS):
            response = call_llm(messages, tools=TOOL_SCHEMAS)
            choice = response.choices[0]
            msg = choice.message
            tool_calls = getattr(msg, "tool_calls", None)

            if not tool_calls:
                final_answer = (msg.content or "").strip()
                break

            # Append assistant message with tool calls to the context
            messages.append({
                "role": "assistant",
                "content": msg.content or "",
                "tool_calls": [
                    {
                        "id": tc.id,
                        "type": "function",
                        "function": {"name": tc.function.name, "arguments": tc.function.arguments},
                    }
                    for tc in tool_calls
                ],
            })

            # Execute tool calls
            for tc in tool_calls:
                try:
                    args = json.loads(tc.function.arguments or "{}")
                except json.JSONDecodeError:
                    args = {}

                result = execute_tool(tc.function.name, args)
                trace.append({"tool": tc.function.name, "arguments": args, "result": result})
                print(f"[TRACE] Tool called: {tc.function.name}\n[TRACE] Arguments: {args}\n[TRACE] Tool result: {result}")

                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": str(result),
                })

        if final_answer is None:
            response_dict = {
                "success": False,
                "appointment_id": None,
                "final_answer": None,
                "trace": trace,
                "error": "The agent could not reach a final response within the allowed reasoning steps. Please try again.",
            }
        else:
            # Try to identify an appointment ID from query or trace
            matched_id = None
            match_appt = re.search(r'\b(A\d{3})\b', user_query, re.IGNORECASE)
            if match_appt:
                matched_id = match_appt.group(1).upper()
            else:
                for step in trace:
                    if step.get("arguments", {}).get("appointment_id"):
                        matched_id = step["arguments"]["appointment_id"].upper()
                        break

            response_dict = {
                "success": True,
                "appointment_id": matched_id,
                "final_answer": final_answer,
                "trace": trace,
                "error": None,
            }

    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"[ERROR] Agent run failed: {e}")
        response_dict = {
            "success": False,
            "appointment_id": None,
            "final_answer": None,
            "trace": trace,
            "error": f"Error running the agent: {str(e)}",
        }

    # Save execution trace to local disk under traces/ directory
    try:
        match_appt = re.search(r'\b(A\d{3})\b', user_query, re.IGNORECASE)
        match_pat = re.search(r'\b(P\d{3})\b', user_query, re.IGNORECASE)
        if match_appt:
            filename = f"{match_appt.group(1).upper()}_trace.json"
        elif match_pat:
            filename = f"{match_pat.group(1).upper()}_trace.json"
        else:
            clean_query = re.sub(r'[^a-zA-Z0-9_]', '_', user_query.lower()[:35])
            filename = f"query_{clean_query}_trace.json"

        root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        traces_dir = os.path.join(root_dir, "traces")
        os.makedirs(traces_dir, exist_ok=True)
        filepath = os.path.join(traces_dir, filename)
        
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(response_dict, f, indent=2)
        print(f"[TRACE] Saved trace to {filepath}")
    except Exception as save_err:
        print(f"[ERROR] Failed to save trace file: {save_err}")

    return response_dict
