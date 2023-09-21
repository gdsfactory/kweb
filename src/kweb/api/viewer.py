from pathlib import Path

from fastapi import APIRouter, Request
from fastapi.exceptions import HTTPException
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from starlette.templating import _TemplateResponse

# from . import __version__ as version

router = APIRouter()
templates = Jinja2Templates(
    directory=(Path(__file__).parent.parent / "templates").resolve()
)


@router.get("/gds/{gds_name:path}", response_class=HTMLResponse)
async def gds_view_static(
    request: Request,
    gds_name: str,
    layer_props: str | None = None,
    cell: str | None = None,
) -> _TemplateResponse:
    settings = router.dependencies[0].dependency()  # type: ignore[misc]
    gds_file = (settings.fileslocation / f"{gds_name}").with_suffix(".gds")

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

    return await show_file(request, gds_file, layer_props, cell)


@router.get("/file/{file_name:path}", response_class=HTMLResponse)
async def file_view_static(
    request: Request,
    file_name: str,
    layer_props: str | None = None,
    cell: str | None = None,
) -> _TemplateResponse:
    settings = router.dependencies[0].dependency()  # type: ignore[misc]
    file = settings.fileslocation / f"{file_name}"

    exists = (
        file.exists()
        and file.is_file()
        and file.stat().st_mode  # type: ignore[misc, operator]
    )

    if not exists:
        raise HTTPException(
            status_code=404,
            detail=f'No file found with name "{file_name}".'
            " It doesn't exist or is not accessible",
        )

    return await show_file(request, file, layer_props, cell)


async def show_file(
    request: Request,
    file: Path,
    layer_props: str | None = None,
    cell: str | None = None,
) -> _TemplateResponse:
    root_path = request.scope["root_path"]

    match request.url.scheme:
        case "https":
            ws_scheme = "wss://"
        case "http":
            ws_scheme = "ws://"
        case other:
            raise HTTPException(status_code=406, detail=f"Unknown scheme {other}")

    if request.url.port is not None:
        url = (
            ws_scheme
            + (request.url.hostname or "localhost")
            + ":"
            + str(request.url.port)
            + root_path
        )
    else:
        url = ws_scheme + (request.url.hostname or "localhost")

    template_params = {
        "request": request,
        "url": url,
        "file": file,
        "layer_props": layer_props,
    }

    if cell is not None:
        template_params["cell"] = cell

    return templates.TemplateResponse(
        "viewer.html",
        template_params,
    )


# @router.get("/status")
# async def status() -> dict[str, Any]:
#     return {"server": "kweb", "version": version}
