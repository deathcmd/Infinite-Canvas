"""The documented pip install must provide the app's realtime transport."""

import importlib.util

from uvicorn.config import Config

from main import app


def test_documented_runtime_supports_websockets():
    assert importlib.util.find_spec("websockets") or importlib.util.find_spec("wsproto"), (
        "Install requirements.txt, including uvicorn[standard], for realtime updates"
    )
    config = Config(app)
    config.load()
    assert config.ws_protocol_class is not None
