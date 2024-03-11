from pathlib import Path

from fastapi import Depends, FastAPI
from fastapi.staticfiles import StaticFiles
from pydantic import ValidationError

from . import config
from .api.browser import router as browser_router
from .api.viewer import router as viewer_router
from .layout_server import LayoutViewServerEndpoint


def get_app(fileslocation: Path | str | None = None, editable: bool = False) -> FastAPI:
    if fileslocation is None:
        try:
            _settings = config.Config()
        except ValidationError:
            raise ValueError(
                "To start the Kweb please set the environment "
                "variable KWEB_FILESLOCATION to a path in your filesystem."
                " Alternatively, you can set the filepath in the get_app function."
            )

    else:
        _settings = config.Config(fileslocation=fileslocation, editable=editable)

    def settings() -> config.Config:
        return _settings

    staticfiles = StaticFiles(directory=Path(__file__).parent / "static")

    # app = FastAPI(routes=[WebSocketRoute("/ws", endpoint=LayoutViewServerEndpoint)])

    app = FastAPI()
    viewer_router.dependencies.insert(0, Depends(settings))
    browser_router.dependencies.insert(0, Depends(settings))

    _settings = settings()

    class BrowserLayoutViewServerEndpoint(
        LayoutViewServerEndpoint,
        root=_settings.fileslocation,
        editable=editable,
        add_missing_layers=_settings.add_missing_layers,
        meta_splitter=_settings.meta_splitter,
    ):
        pass

    app.add_websocket_route("/ws", BrowserLayoutViewServerEndpoint)
    viewer_router.dependencies.insert(0, Depends(settings))
    app.include_router(viewer_router)
    app.include_router(browser_router)
    app.mount("/static", staticfiles, name="kweb_static")

    return app
