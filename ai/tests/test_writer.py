"""
Guards the call to the Anthropic SDK without a key or network: every argument
we send must exist in the installed SDK's messages.create signature.
(A newer SDK dropped `temperature`; sending it made every call fail silently
into the template.)
"""
import inspect

from anthropic.resources.messages import Messages

from app.writer import ClaudeWriter


class _Recorder:
    def __init__(self):
        self.kwargs = None

    def create(self, **kwargs):
        self.kwargs = kwargs

        class Block:
            type = "text"
            text = "ok"

        class Msg:
            stop_reason = "end_turn"
            content = [Block()]

        return Msg()


def test_only_sends_arguments_the_sdk_accepts(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "not-used")
    w = ClaudeWriter(model="claude-haiku-5-5")
    rec = _Recorder()
    w._client = type("C", (), {"messages": rec})()
    assert w.write("system", [{"role": "user", "content": "hi"}]) == "ok"
    accepted = set(inspect.signature(Messages.create).parameters)
    assert set(rec.kwargs) <= accepted, set(rec.kwargs) - accepted
