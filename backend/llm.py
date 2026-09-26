"""
llm.py

Thin wrapper around the Groq chat completions API. Keeps the Groq-specific
client code in one place so agent.py just deals in plain messages/tool
schemas.
"""

import os
from dotenv import load_dotenv

load_dotenv()

from groq import Groq

MODEL_NAME = os.environ.get("GROQ_MODEL", "openai/gpt-oss-120b")

_client = None


def get_client() -> Groq:
    """Lazily construct the Groq client using GROQ_API_KEY from the environment."""
    global _client
    if _client is None:
        api_key = os.environ.get("GROQ_API_KEY")
        if not api_key:
            raise RuntimeError(
                "GROQ_API_KEY is not set. Create a .env file with "
                "GROQ_API_KEY=your_key_here (see README.md)."
            )
        _client = Groq(api_key=api_key)
    return _client


def call_llm(messages: list, tools: list = None, tool_choice: str = "auto"):
    """Call the Groq chat completion endpoint and return the raw response.

    A thin, single-purpose wrapper so the rest of the codebase never talks
    to the Groq SDK directly.
    """
    client = get_client()
    kwargs = {
        "model": MODEL_NAME,
        "messages": messages,
        "temperature": 0.2,
    }
    if tools:
        kwargs["tools"] = tools
        kwargs["tool_choice"] = tool_choice

    return client.chat.completions.create(**kwargs)
