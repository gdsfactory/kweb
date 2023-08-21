import os
from pathlib import Path
from typing import Any
from glob import glob
import pathlib

from fastapi import APIRouter, FastAPI, Request
from fastapi.exceptions import HTTPException
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.routing import WebSocketRoute
from starlette.templating import _TemplateResponse

from kweb import __version__ as version
from kweb.server import LayoutViewServerEndpoint

module_path = Path(__file__).parent.absolute()


# edafiles = os.getenv("KWEB_FILESLOCATION"))
router = APIRouter()
templates = Jinja2Templates(directory=module_path / "templates")

edafiles: Path | None = None


@router.get("/", response_class=HTMLResponse)
async def gds_list(request: Request):
    """List all saved GDS files."""
    files_root = pathlib.Path(os.getenv("KWEB_FILESLOCATION"))
    paths_list = glob(str(files_root / "*.gds"))
    files_list = sorted(Path(gdsfile).stem for gdsfile in paths_list)
    files_metadata = [
        {"name": file_name, "url": f"gds/{file_name}"} for file_name in files_list
    ]
    return templates.TemplateResponse(
        "file_browser.html.j2",
        {
            "request": request,
            "message": f"GDS files in {str(files_root)!r}",
            "files_root": files_root,
            "files_metadata": files_metadata,
        },
    )


def get_app(files_location: str | Path | None = None) -> FastAPI:
    if files_location is None:
        envedafiles = os.getenv("KWEB_FILESLOCATION")
        if envedafiles is None:
            raise RuntimeError(
                "A files location must be set, either via "
                "kweb.main.get_app(path) as a string or Path object. "
                'Alternatively the env variable "KWEB_FILESLOCATION"'
                " can be set with the path"
            )
        files_location = Path(envedafiles)

    global edafiles
    edafiles = Path(files_location)

    app = FastAPI(routes=[WebSocketRoute("/gds/ws", endpoint=LayoutViewServerEndpoint)])
    app.mount(
        "/static", StaticFiles(directory=module_path / "static"), name="kweb_static"
    )
    app.include_router(router)

    return app


@router.get("/gds/{gds_name:path}", response_class=HTMLResponse)
async def gds_view_static(
    request: Request,
    gds_name: str,
    layer_props: str | None = None,
    cell: str | None = None,
) -> _TemplateResponse:
    gds_file = (edafiles / f"{gds_name}").with_suffix(  # type: ignore[misc, operator]
        ".gds"
    )

    exists = (
        gds_file.exists()
        and gds_file.is_file()
        and gds_file.stat().st_mode  # type: ignore[misc, operator]
    )

    if not exists:
        raise HTTPException(
            status_code=404,
            detail=f'No gds found with name "{gds_name}".'
            " It doesn't exist or is not accessible",
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


@router.get("/status")
async def status() -> dict[str, Any]:
    return {"server": "kweb", "version": version}


app = get_app()

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app)
