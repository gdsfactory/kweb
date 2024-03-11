from pathlib import Path

from fastapi import Depends, FastAPI
from fastapi.staticfiles import StaticFiles
from starlette.routing import WebSocketRoute

from . import config
from .api.viewer import router

# from .layout_server import EditableLayoutViewServerEndpoint
from .layout_server import LayoutViewServerEndpoint


def get_app(fileslocation: Path | str, editable: bool = False) -> FastAPI:
    # config.settings.fileslocation = Path(fileslocation)
    _settings = config.Config(fileslocation=fileslocation, editable=editable)

    def settings() -> config.Config:
        return _settings

    staticfiles = StaticFiles(directory=Path(__file__).parent / "static")

    class BrowserLayoutViewServerEndpoint(
        LayoutViewServerEndpoint,
        root=_settings.fileslocation,
        editable=editable,
        add_missing_layers=_settings.add_missing_layers,
        meta_splitter=_settings.meta_splitter,
    ):
        pass

    app = FastAPI(
        routes=[WebSocketRoute("/ws", endpoint=BrowserLayoutViewServerEndpoint)]
    )

    # insert the settings as the first dependency
    router.dependencies.insert(0, Depends(settings))
    app.include_router(router)
    app.mount("/static", staticfiles, name="kweb_static")

    return app
