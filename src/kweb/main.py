from pathlib import Path

from fastapi import FastAPI, Request
from starlette.endpoints import WebSocketEndpoint
from starlette.routing import WebSocketRoute
from starlette.requests import Request as StRequest
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from kweb.server import LayoutViewServerEndpoint

module_path = Path(__file__).parent.absolute()
home_path = Path.home() / ".gdsfactory" / "extra"
home_path.mkdir(exist_ok=True, parents=True)

app = FastAPI(routes=[WebSocketRoute("/gds/ws", endpoint=LayoutViewServerEndpoint)])
app.mount("/static", StaticFiles(directory=module_path / "static"), name="static")

# gdsfiles = StaticFiles(directory=home_path)
# app.mount("/gds_files", gdsfiles, name="gds_files")
templates = Jinja2Templates(directory=module_path / "templates")


@app.get("/")
async def root():
    return {
        "message": "Welcome to kweb visualizer: \n go to http://127.0.0.1:8000/gds/wg"
    }


@app.get("/gds", response_class=HTMLResponse)
async def gds_view(request: Request, gds_file: str, layer_props: str = home_path):
    return templates.TemplateResponse(
        "client.html",
        {
            "request": request,
            "url": str(
                request.url.scheme
                + "://"
                + request.url.hostname
                + ":"
                + str(request.url.port)
                + request.url.path,
            ),
            "gds_file": gds_file,
            "layer_props": layer_props,
        },
    )
