"""
The language model, behind a tiny interface so tests can swap in a fake.
"""
from __future__ import annotations

import os
from typing import Protocol


class Writer(Protocol):
    model: str

    def write(self, system: str, messages: list[dict]) -> str: ...


class ClaudeWriter:
    """Claude through the official Anthropic SDK. Reads ANTHROPIC_API_KEY."""

    def __init__(self, model: str | None = None) -> None:
        from anthropic import Anthropic  # imported here so tests don't need a key

        self.model = model or os.environ.get("AI_MODEL", "claude-haiku-5-5")
        self._client = Anthropic(timeout=30.0, max_retries=2)

    def write(self, system: str, messages: list[dict]) -> str:
        msg = self._client.messages.create(
            model=self.model,
            max_tokens=700,
            system=system,
            messages=messages,
        )
        if msg.stop_reason == "max_tokens":
            raise RuntimeError("The model's reply was cut off (max_tokens).")
        return "".join(b.text for b in msg.content if b.type == "text")


def writer_from_env() -> Writer | None:
    """A real writer when a key is configured, otherwise None (template only)."""
    if not os.environ.get("ANTHROPIC_API_KEY"):
        return None
    return ClaudeWriter()
