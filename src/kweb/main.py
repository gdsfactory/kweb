from glob import glob
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.routing import WebSocketRoute
from starlette.templating import _TemplateResponse

from kweb import __version__ as version
from kweb.server import LayoutViewServerEndpoint

module_path = Path(__file__).parent.absolute()
home_path = Path.home() / ".gdsfactory" / "extra"
home_path.mkdir(exist_ok=True, parents=True)

app = FastAPI(routes=[WebSocketRoute("/gds/ws", endpoint=LayoutViewServerEndpoint)])
app.mount("/static", StaticFiles(directory=module_path / "static"), name="static")

templates = Jinja2Templates(directory=module_path / "templates")


@app.get("/")
async def root(request: Request) -> _TemplateResponse:
    files_root = Path(__file__).parent / "gds_files"
    paths_list = glob(str(files_root / "*.gds"))
    files_list = sorted(Path(gdsfile).name for gdsfile in paths_list)
    files_metadata = [
        {"name": file_name, "url": f"gds/{file_name}"} for file_name in files_list
    ]
    return templates.TemplateResponse(
        "file_browser.html",
        {
            "request": request,
            "message": "Welcome to kweb visualizer",
            "files_root": files_root,
            "files_metadata": files_metadata,
        },
    )


@app.get("/gds", response_class=HTMLResponse)
async def gds_view(
    request: Request, gds_file: str, layer_props: str = str(home_path)
) -> _TemplateResponse:
    url = str(
        request.url.scheme
        + "://"
        + (request.url.hostname or "localhost")
        + ":"
        + str(request.url.port)
        + "/gds"
    )
    return templates.TemplateResponse(
        "client.html",
        {
            "request": request,
            "url": url,
            "gds_file": gds_file,
            "layer_props": layer_props,
        },
    )


@app.get("/gds/{gds_name}.gds")
async def gds_view_static_redirect(gds_name: str):
    return RedirectResponse(f"/gds/{gds_name}")


@app.get("/gds/{gds_name}", response_class=HTMLResponse)
async def gds_view_static(
    request: Request, gds_name: str, layer_props: str = str(home_path)
) -> _TemplateResponse:
    gds_file = (Path(__file__).parent / f"gds_files/{gds_name}").with_suffix(".gds")

    url = str(
        request.url.scheme
        + "://"
        + (request.url.hostname or "localhost")
        + ":"
        + str(request.url.port)
        + "/gds"
    )

    return templates.TemplateResponse(
        "client.html",
        {
            "request": request,
            "url": url,
            "gds_file": gds_file,
            "layer_props": layer_props,
        },
    )


@app.get("/status")
async def status() -> dict[str, Any]:
    return {"server": "kweb", "version": version}
