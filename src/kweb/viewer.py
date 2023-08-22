from pathlib import Path

from fastapi import Depends, FastAPI
from fastapi.staticfiles import StaticFiles
from starlette.routing import WebSocketRoute

from . import config
from .api.viewer import router
from .layout_server import LayoutViewServerEndpoint


def get_app(fileslocation: Path | str) -> FastAPI:
    # config.settings.fileslocation = Path(fileslocation)
    def settings() -> config.Config:
        return config.Config(fileslocation=fileslocation)

    staticfiles = StaticFiles(directory=Path(__file__).parent / "static")

    app = FastAPI(routes=[WebSocketRoute("/ws", endpoint=LayoutViewServerEndpoint)])
    # insert the settings as the first dependency
    router.dependencies.insert(0, Depends(settings))
    app.include_router(router)
    app.mount("/static", staticfiles, name="kweb_static")

    return app
