import pathlib
import tempfile
from glob import glob
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.routing import WebSocketRoute
from starlette.templating import _TemplateResponse

from kweb import __version__ as version
from kweb.server import LayoutViewServerEndpoint

import os

# module_path = Path(os.getenv("KWEB_EDAFILES", Path(__file__).parent.resolve()))
module_path = Path(__file__).parent.absolute()
home_path = Path.home() / ".gdsfactory" / "extra"
home_path.mkdir(exist_ok=True, parents=True)

local_gds_files = module_path / "gds_files"
edafiles = Path(os.getenv("KWEB_FILESLOCATION", local_gds_files))

app = FastAPI(routes=[WebSocketRoute("/gds/ws", endpoint=LayoutViewServerEndpoint)])
app.mount("/static", StaticFiles(directory=module_path / "static"), name="kweb_static")
templates = Jinja2Templates(directory=module_path / "templates")


@app.get("/")
async def root(request: Request) -> _TemplateResponse:
    return templates.TemplateResponse(
        "file_browser.html",
        {
            "request": request,
            "message": "Welcome to kweb visualizer",
        },
    )


@app.get("/gds/{gds_name:path}", response_class=HTMLResponse)
async def gds_view_static(
    request: Request,
    gds_name: str,
    layer_props: str | None = None,
    cell: str | None = None,
) -> _TemplateResponse:
    gds_file = (edafiles / f"{gds_name}").with_suffix(".gds")

    exists = gds_file.exists() and gds_file.is_file() and gds_file.stat().st_mode

    if not exists:
        raise HTTPException(
            status_code=404,
            detail=f'No gds found with name "{gds_name}". It doesn\'t exist or is not accessible',
        )

    root_path = request.scope["root_path"]

    match request.url.scheme:
        case "https":
            ws_scheme = "wss://"
        case "http":
            ws_scheme = "ws://"
        case other:
            raise HTTPException(status_code=406, detail=f"Unknown scheme {other}")

    url = (
        ws_scheme
        + (request.url.hostname or "localhost")
        + ":"
        + str(request.url.port)
        + root_path
        + "/gds"
    )

    template_params = {
        "request": request,
        "url": url,
        "gds_file": gds_file,
        "layer_props": layer_props,
    }

    if cell is not None:
        template_params["cell"] = cell

    return templates.TemplateResponse(
        "client.html",
        template_params,
    )


@app.get("/status")
async def status() -> dict[str, Any]:
    return {"server": "kweb", "version": version}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app)
