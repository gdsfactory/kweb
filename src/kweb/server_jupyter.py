import asyncio

import uvicorn

from kweb.main import app

jupyter_server = None


def _run():
    config = uvicorn.Config(app)
    jupyter_server = uvicorn.Server(config)
    loop = asyncio.get_event_loop()
    loop.create_task(jupyter_server.serve())


def _server_is_running() -> bool:
    return False if jupyter_server is None else jupyter_server.started


def start():
    if not _server_is_running():
        _run()
