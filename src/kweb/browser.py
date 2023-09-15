from pathlib import Path

from fastapi import Depends, FastAPI
from fastapi.staticfiles import StaticFiles
from pydantic import ValidationError

from . import config
from .api.browser import router as browser_router
from .api.viewer import router as viewer_router
from .layout_server import (
    EditableLayoutViewServerEndpoint,
    LayoutViewServerEndpoint,
)


def get_app(fileslocation: Path | str | None = None, editable: bool = False) -> FastAPI:
    if fileslocation is None:

        def settings() -> config.Config:
            try:
                return config.Config()
            except ValidationError:
                raise ValueError(
                    "To start the Kweb please set the environment "
                    "variable KWEB_FILESLOCATION to a path in your filesystem."
                    " Alternatively, you can set the filepath in the get_app function."
                )

    else:

        def settings() -> config.Config:
            return config.Config(fileslocation=fileslocation)

    staticfiles = StaticFiles(directory=Path(__file__).parent / "static")

    # app = FastAPI(routes=[WebSocketRoute("/ws", endpoint=LayoutViewServerEndpoint)])

    app = FastAPI()
    viewer_router.dependencies.insert(0, Depends(settings))
    browser_router.dependencies.insert(0, Depends(settings))

    if editable:
        app.add_websocket_route("/ws", EditableLayoutViewServerEndpoint)
    else:
        app.add_websocket_route("/ws", LayoutViewServerEndpoint)
    viewer_router.dependencies.insert(0, Depends(settings))
    app.include_router(viewer_router)
    app.include_router(browser_router)
    app.mount("/static", staticfiles, name="kweb_static")

    return app
