#!/usr/bin/env python3

import asyncio
import base64
import json
from collections.abc import Callable
from pathlib import Path
from typing import Any, TypeAlias

# NOTE: import db to enable stream format readers
import klayout.db as db
import klayout.lay as lay
from fastapi import WebSocket
from starlette.endpoints import WebSocketEndpoint

port = 8765
host = "localhost"

CellDict: TypeAlias = "dict[str, int | str | list[CellDict]]"


class LayoutViewServerEndpoint(WebSocketEndpoint):
    editable: bool = False

    def __init_subclass__(cls, editable: bool = False, **kwargs: Any):
        super().__init_subclass__(**kwargs)
        cls.editable = editable

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)

        _params = self.scope["query_string"].decode("utf-8")
        _params_splitted = _params.split("&")
        params = {}
        for _param in _params_splitted:
            key, value = _param.split("=")
            params[key] = value

        self.url = params["file"]
        self.layer_props = params.get("layer_props", None)
        self.initial_cell: str | None = None
        if "cell" in params:
            self.initial_cell = params["cell"]

    async def on_connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        await self.connection(websocket)

    async def on_receive(self, websocket: WebSocket, data: str) -> None:
        await self.reader(websocket, data)

    async def on_disconnect(self, websocket: WebSocket, close_code: int) -> None:
        pass

    async def send_image(self, websocket: WebSocket, data: bytes) -> None:
        await websocket.send_bytes(data)

    def image_updated(self, websocket: WebSocket) -> None:
        pixel_buffer = self.layout_view.get_screenshot_pixels()
        asyncio.create_task(self.send_image(websocket, pixel_buffer.to_png_data()))

    def mode_dump(self) -> list[str]:
        return self.layout_view.mode_names()

    def annotation_dump(self) -> list[str]:
        return [d[1] for d in self.layout_view.annotation_templates()]

    def current_cell(self) -> db.Cell:
        cv = self.layout_view.active_cellview()
        ci = cv.cell_index
        return cv.layout().cell(ci)

    def set_current_cell(self, ci: int | str) -> None:
        cell = self.layout_view.active_cellview().layout().cell(ci)
        self.layout_view.active_cellview().cell = cell
        self.layout_view.max_hier()

    def layer_dump(
        self,
        iter: lay.LayerPropertiesIterator | None = None,
        end_iter: lay.LayerPropertiesIterator | None = None,
    ) -> list[dict[str, object]]:
        if iter is None:
            iter = self.layout_view.begin_layers()
        js = []
        # for layer in self.layout_view.each_layer():
        if end_iter:
            while not iter.at_end() and iter != end_iter:
                layer = iter.current()
                if layer.has_children():
                    children = self.layer_dump(
                        iter=iter.dup().down_first_child(),
                        end_iter=iter.dup().down_last_child(),
                    )
                    js.append(
                        {
                            "dp": layer.eff_dither_pattern(),
                            "ls": layer.eff_line_style(),
                            "c": layer.eff_fill_color(),
                            "fc": layer.eff_frame_color(),
                            "m": layer.marked,
                            "s": layer.source,
                            "t": layer.transparent,
                            "va": layer.valid,
                            "v": layer.visible,
                            "w": layer.width,
                            "x": layer.xfill,
                            "name": layer.name,
                            "id": layer.id(),
                            "img": base64.b64encode(
                                self.layout_view.icon_for_layer(
                                    iter, 50, 25, 1
                                ).to_png_data()
                            ).decode("ASCII"),
                            "children": children,
                            "empty": all(c["empty"] for c in children),
                        }
                    )
                    iter.next_sibling(1)
                else:
                    js.append(
                        {
                            "dp": layer.eff_dither_pattern(),
                            "ls": layer.eff_line_style(),
                            "c": layer.eff_fill_color(),
                            "fc": layer.eff_frame_color(),
                            "m": layer.marked,
                            "s": layer.source,
                            "t": layer.transparent,
                            "va": layer.valid,
                            "v": layer.visible,
                            "w": layer.width,
                            "x": layer.xfill,
                            "name": layer.name,
                            "id": layer.id(),
                            "img": base64.b64encode(
                                self.layout_view.icon_for_layer(
                                    iter, 50, 25, 1
                                ).to_png_data()
                            ).decode("ASCII"),
                            "empty": self.current_cell()
                            .bbox_per_layer(layer.layer_index())
                            .empty(),
                        }
                    )
                    iter.next_sibling(1)
        else:
            while not iter.at_end():
                layer = iter.current()
                if layer.has_children():
                    children = self.layer_dump(
                        iter=iter.dup().down_first_child(),
                        end_iter=iter.dup().down_last_child(),
                    )
                    js.append(
                        {
                            "dp": layer.eff_dither_pattern(),
                            "ls": layer.eff_line_style(),
                            "c": layer.eff_fill_color(),
                            "fc": layer.eff_frame_color(),
                            "m": layer.marked,
                            "s": layer.source,
                            "t": layer.transparent,
                            "va": layer.valid,
                            "v": layer.visible,
                            "w": layer.width,
                            "x": layer.xfill,
                            "name": layer.name,
                            "id": layer.id(),
                            "img": base64.b64encode(
                                self.layout_view.icon_for_layer(
                                    iter, 50, 25, 1
                                ).to_png_data()
                            ).decode("ASCII"),
                            "children": children,
                            "empty": all(c["empty"] for c in children),
                        }
                    )
                    iter.next_sibling(1)
                else:
                    js.append(
                        {
                            "dp": layer.eff_dither_pattern(),
                            "ls": layer.eff_line_style(),
                            "c": layer.eff_fill_color(),
                            "fc": layer.eff_frame_color(),
                            "m": layer.marked,
                            "s": layer.source,
                            "t": layer.transparent,
                            "va": layer.valid,
                            "v": layer.visible,
                            "w": layer.width,
                            "x": layer.xfill,
                            "name": layer.name,
                            "id": layer.id(),
                            "img": base64.b64encode(
                                self.layout_view.icon_for_layer(
                                    iter, 50, 25, 1
                                ).to_png_data()
                            ).decode("ASCII"),
                            "empty": self.current_cell()
                            .bbox_per_layer(layer.layer_index())
                            .empty(),
                        }
                    )
                    iter.next_sibling(1)

        return js

    def hierarchy_dump(self) -> list[CellDict]:
        layout = self.layout_view.active_cellview().layout()
        top_cells = layout.top_cells()

        def get_children(cell: db.Cell) -> list[CellDict]:
            if not cell.child_cells():
                return []
            children: list[CellDict] = []
            iter = cell.each_child_cell()
            for child_idx in iter:
                child = layout.cell(child_idx)
                children.append(
                    {
                        "name": child.name,
                        "id": child.cell_index(),
                        "children": get_children(child),
                    }
                )
            return children

        return [
            {
                "name": top_cell.name,
                "id": top_cell.cell_index(),
                "children": get_children(top_cell),
            }
            for top_cell in top_cells
        ]

    async def send_hierarchy(self, websocket: WebSocket) -> None:
        await websocket.send_text(
            json.dumps(
                {
                    "msg": "hierarchy",
                    "hierarchy": self.hierarchy_dump(),
                    "ci": self.current_cell().cell_index(),
                }
            )
        )

    async def connection(self, websocket: WebSocket, path: str | None = None) -> None:
        self.layout_view = lay.LayoutView(self.editable)
        self.layout_view.load_layout(self.url)
        if Path(self.layer_props).is_file():
            self.layout_view.load_layer_props(self.layer_props)
        if self.initial_cell:
            self.set_current_cell(self.initial_cell)
            self.layout_view.zoom_fit()
        self.layout_view.max_hier()

        await websocket.send_text(
            json.dumps(
                {
                    "msg": "loaded",
                    "modes": self.mode_dump(),
                    "annotations": self.annotation_dump(),
                    "layers": self.layer_dump(),
                    "hierarchy": self.hierarchy_dump(),
                    "ci": self.current_cell().cell_index(),
                }
            )
        )

        asyncio.create_task(self.timer(websocket))

    async def timer(self, websocket: WebSocket) -> None:
        def update() -> None:
            self.image_updated(websocket)

        self.layout_view.on_image_updated_event = update  # type: ignore[assignment]
        while True:
            self.layout_view.timer()  # type: ignore[attr-defined]
            await asyncio.sleep(0.01)

    def buttons_from_js(self, js: dict[str, int]) -> int:
        buttons = 0
        k = js["k"]
        b = js["b"]
        if (k & 1) != 0:
            buttons |= lay.ButtonState.ShiftKey
        if (k & 2) != 0:
            buttons |= lay.ButtonState.ControlKey
        if (k & 4) != 0:
            buttons |= lay.ButtonState.AltKey
        if (b & 1) != 0:
            buttons |= lay.ButtonState.LeftButton
        if (b & 2) != 0:
            buttons |= lay.ButtonState.RightButton
        if (b & 4) != 0:
            buttons |= lay.ButtonState.MidButton
        return buttons

    def wheel_event(
        self, function: Callable[[int, bool, db.Point, int], None], js: dict[str, int]
    ) -> None:
        delta = 0
        dx = js["dx"]
        dy = js["dy"]
        if dx != 0:
            delta = -dx
            horizontal = True
        elif dy != 0:
            delta = -dy
            horizontal = False
        if delta != 0:
            function(
                delta, horizontal, db.Point(js["x"], js["y"]), self.buttons_from_js(js)
            )

    def mouse_event(
        self, function: Callable[[db.DPoint, int], None], js: dict[str, int]
    ) -> None:
        function(db.DPoint(js["x"], js["y"]), self.buttons_from_js(js))

    def key_event(self, js: dict[str, int]) -> None:
        match js["k"]:
            case 27:
                mode = self.layout_view.mode_name()
                self.layout_view.switch_mode("select")
                self.layout_view.switch_mode(mode)

    async def reader(self, websocket: WebSocket, data: str) -> None:
        js = json.loads(data)
        msg = js["msg"]
        match msg:
            case "quit":
                return
            case "resize":
                self.layout_view.resize(js["width"], js["height"])
            case "clear-annotations":
                self.layout_view.clear_annotations()
            case "select-ruler":
                ruler = js["value"]
                self.layout_view.set_config("current-ruler-template", str(ruler))
            case "select-mode":
                mode = js["value"]
                self.layout_view.switch_mode(mode)
            case "layer-v-all":
                vis = js["value"]
                for layer in self.layout_view.each_layer():
                    layer.visible = vis
            case "layer-v":
                id = js["id"]
                vis = js["value"]
                iter = self.layout_view.begin_layers()
                end = False
                while not (iter.at_end() or end):
                    layer = iter.current()
                    if layer.id() == id:
                        layer.visible = vis
                        nit = iter.dup()
                        nit.next_sibling(1)
                        await websocket.send_text(
                            json.dumps(
                                {
                                    "msg": "layer-u",
                                    "layers": self.layer_dump(iter.dup(), end_iter=nit),
                                }
                            )
                        )
                        end = True
                    iter.next()

            case "initialize":
                self.layout_view.resize(js["width"], js["height"])
                await websocket.send_text(json.dumps({"msg": "initialized"}))
            case "mode_select":
                self.layout_view.switch_mode(js["mode"])
            case "mouse_move":
                self.mouse_event(
                    self.layout_view.send_mouse_move_event, js  # type: ignore[arg-type]
                )
            case "mouse_pressed":
                self.mouse_event(
                    self.layout_view.send_mouse_press_event,
                    js,  # type: ignore[arg-type]
                )
            case "mouse_released":
                self.mouse_event(
                    self.layout_view.send_mouse_release_event,
                    js,  # type: ignore[arg-type]
                )
            case "mouse_enter":
                self.layout_view.send_enter_event()
            case "mouse_leave":
                self.layout_view.send_leave_event()
            case "mouse_dblclick":
                self.mouse_event(
                    self.layout_view.send_mouse_double_clicked_event,
                    js,
                )
            case "wheel":
                self.wheel_event(
                    self.layout_view.send_wheel_event, js  # type: ignore[arg-type]
                )
            case "keydown":
                self.key_event(js)
            case "ci-s":
                self.set_current_cell(js["ci"])
                self.layout_view.zoom_fit()
            case "cell-s":
                self.set_current_cell(js["cell"])
                self.layout_view.zoom_fit()
            case "zoom-f":
                self.layout_view.zoom_fit()


class EditableLayoutViewServerEndpoint(LayoutViewServerEndpoint, editable=True):
    pass
