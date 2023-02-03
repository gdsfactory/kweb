from pathlib import Path

from fastapi import FastAPI, Request, WebSocket
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from kweb.server import LayoutViewServer

module_path = Path(__file__).parent.absolute()
home_path = Path.home() / ".gdsfactory" / "extra"

app = FastAPI()
app.mount("/static", StaticFiles(directory=module_path / "static"), name="static")

gdsfiles = StaticFiles(directory=home_path)
app.mount("/gds_files", gdsfiles, name="gds_files")
templates = Jinja2Templates(directory=module_path / "templates")


@app.get("/")
async def root():
    return {
        "message": "Welcome to kweb visualizer: \n go to http://127.0.0.1:8000/gds/wg"
    }


@app.get("/gds/{id}", response_class=HTMLResponse)
async def gds_view(request: Request, id: str):
    return templates.TemplateResponse(
        "client.html", {"request": request, "id": id.strip(".gds")}
    )


@app.websocket("/gds/{id}/ws")
async def gds_ws(websocket: WebSocket, id: str):
    await websocket.accept()
    # print(id)
    if gdsfiles is not None:
        # print(f"{id.replace('.gds','')}")
        lvs = LayoutViewServer(
            str(Path(gdsfiles.directory) / f"{id.replace('.gds','')}.gds")
        )
        while True:
            await lvs.connection(websocket)
