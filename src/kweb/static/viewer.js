
ws_url = ws_url.replace("http://","ws://");
ws_url = ws_url.replace("https://","wss://");

let url;
if (cell) {
  url = ws_url + '/ws?' + "file=" + file + "&layer_props=" + layer_props + "&cell=" + cell;
} else {
  url = ws_url + '/ws?' + "file=" + file + "&layer_props=" + layer_props;
}

let canvas = document.getElementById("layout_canvas");
let context = canvas.getContext("2d");

let message = document.getElementById("message");

let socket = new WebSocket(url);
socket.binaryType = "blob";
let initialized = false;

async function initializeWebSocket() {
  await new Promise((resolve) => {
    //  Installs a handler called when the connection is established
    socket.onopen = function(evt) {
      let ev = { msg: "initialize", width: canvas.width, height: canvas.height };
      socket.send(JSON.stringify(ev));
      resolve(); // Resolve the promise when the WebSocket is ready
    };
  });

  // Call resizeCanvas the first time
  resizeCanvas();
}

//  Installs a handler for the messages delivered by the web socket
socket.onmessage = function(evt) {

  let data = evt.data;
  if (typeof(data) === "string") {

    js = JSON.parse(data);
    if (js.msg == "initialized") {
      initialized = true;
    } else if (js.msg == "loaded") {
      showLayers(js.layers);
      showMenu(js.modes, js.annotations);
      showCells(js.hierarchy, js.ci)
    } else if (js.msg == "layer-u") {
      updateLayerImages(js.layers)
    }
  } else if (initialized) {

    //  incoming blob messages are paint events
    createImageBitmap(data).then(function(image) {
      context.drawImage(image, 0, 0)
    });

  }

};

socket.onclose = evt => console.log(`Closed ${evt.code}`);

function mouseEventToJSON(canvas, type, evt) {

  let rect = canvas.getBoundingClientRect();
  let x = evt.clientX - rect.left;
  let y = evt.clientY - rect.top;
  let keys = 0;
  if (evt.shiftKey) {
    keys += 1;
  }
  if (evt.ctrlKey) {
    keys += 2;
  }
  if (evt.altKey) {
    keys += 4;
  }
  return { msg: type, x: x, y: y, b: evt.buttons, k: keys };

}

function sendMouseEvent(canvas, type, evt) {

  if (socket.readyState == WebSocket.OPEN /*OPEN*/) {
    let ev = mouseEventToJSON(canvas, type, evt);
    socket.send(JSON.stringify(ev));
  }

}

function sendWheelEvent(canvas, type, evt) {

  if (socket.readyState == WebSocket.OPEN /*OPEN*/) {
    let ev = mouseEventToJSON(canvas, type, evt);
    ev.dx = evt.deltaX;
    ev.dy = evt.deltaY;
    ev.dm = evt.deltaMode;
    socket.send(JSON.stringify(ev));
  }

}

function sendKeyEvent(canvas, type, evt) {
  if (socket.readyState == WebSocket.OPEN) {
    socket.send(JSON.stringify({ msg: type, k: evt.keyCode }));
  }
}

let lastCanvasWidth = 0;
let lastCanvasHeight = 0;

function resizeCanvas() {
  let view = document.getElementById('layout-view');
  let w = canvas.clientWidth;
  let h = canvas.clientHeight;

  view.height = view.parentElement.clientHeight;

  if (lastCanvasWidth !== w || lastCanvasHeight !== h) {
    lastCanvasWidth = w;
    lastCanvasHeight = h;

    canvas.width = w;
    canvas.height = h;

    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ msg: "resize", width: w, height: h }));
    }
    else if (socket.readyState === WebSocket.CONNECTING){
    }
    else {
      console.error(socket.readyState)
    }

  }
}

initializeWebSocket();

setInterval(resizeCanvas, 10); // Call resizeCanvas every 10ms


window.addEventListener("resize", function() {
  if (initialized) {
    resizeCanvas();
  }
});

//  Updates the Menu
function showMenu(modes, annotations) {

  let modeElement = document.getElementById("modes");
  modeElement.childNodes = new Array();

  let modeRow = document.createElement("div");
  modeRow.className = "btn-group flex-wrap";
  modeRow.setAttribute("role", "group");
  modeRow.role = "group";
  modeRow.aria_label = "Layout Mode Selection"
  modeRow.id = "mode-row";
  modeRow.childNodes = new Array();
  modeElement.appendChild(modeRow);

  modes.forEach(function(m, i) {


    let inner = document.createElement("input");
    inner.value = m;
    inner.type = "radio";
    inner.className = "btn-check";
    inner.id = "btnradio" + m;
    inner.setAttribute("name", "radiomode");
    if (i==0) {
      inner.setAttribute("checked", "");
    }
    inner.onclick = function() {
      socket.send(JSON.stringify({ msg: "select-mode", value: m }));
    };
    let innerlabel = document.createElement("label");
    innerlabel.textContent = m;
    innerlabel.className = "btn btn-outline-primary";
    innerlabel.setAttribute("for", "btnradio" + m);

    modeRow.appendChild(inner);
    modeRow.appendChild(innerlabel);

  });

  let menuElement = document.getElementById("menu");

  let clearRulers = document.createElement("button");
  clearRulers.textContent = "Clear Rulers";
  clearRulers.className = "col-auto btn btn-primary mx-2";
  clearRulers.setAttribute("type", "button");
  clearRulers.onclick = function() {
    socket.send(JSON.stringify({ msg: "clear-annotations" }));
  };
  menuElement.appendChild(clearRulers);
  let zoomFit= document.createElement("button");
  zoomFit.textContent = "Zoom Fit";
  zoomFit.className = "col-auto btn btn-primary mx-2";
  zoomFit.setAttribute("type", "button");
  zoomFit.onclick = function() {
    socket.send(JSON.stringify({ msg: "zoom-f" }));
  };
  menuElement.appendChild(zoomFit);

  let index = 0;

  annotations.forEach(function(a) {

    let option = document.createElement("option");
    option.value = index;
    option.text = a;

    rulersSelect.appendChild(option);

    index += 1;

  });
}

function selectCell(cell_index) {
  socket.send(JSON.stringify(
    {
      "msg": "ci-s",
      "ci": cell_index,
      "zoom-fit": true,
    }
  ))
}

function selectCellByName(cell_name) {
  let currentURL = new URL(window.location.href);
  currentURL.searchParams.set("cell", cell_name)
  window.history.replaceState({}, '', currentURL.toString())
  socket.send(JSON.stringify(
    {
      "msg": "cell-s",
      "cell": cell_name,
      "zoom-fit": true,
    }
  ))
}

//  Updates the layer list
function showCells(cells, current_index) {

  let layerElement = document.getElementById("cells-tab-pane");
  layerElement.replaceChildren();
  appendCells(layerElement, cells, current_index)

}

  //  create table rows for each layer
function appendCells(parentelement, cells, current_index, addpadding=false) {

  let lastelement = null;

  cells.forEach(function(c, i) {

    let cellRow = document.createElement("div");
    cellRow.className = "row mx-0";
    parentelement.appendChild(cellRow);
    if (c.children.length > 0) {

      let accordion = document.createElement("div");

      if (addpaddings){
        accordion.className = "accordion accordion-flush px-2";
      } else {
        accordion.className = "accordion accordion-flush ps-2 pe-0";
      }
      accordion.id = "cellgroup-" + c.id;


      cellRow.appendChild(accordion);

      accordion_item = document.createElement("div");
      accordion_item.className = "accordion-item";
      accordion.appendChild(accordion_item);

      accordion_header = document.createElement("div");
      accordion_header.className = "accordion-header d-flex flex-row";
      accordion_item.appendChild(accordion_header);

      accordion_header_button = document.createElement("button");
      accordion_header_button.className = "accordion-button p-0 w-auto border-bottom";
      accordion_header_button.setAttribute("type", "button");
      accordion_header_button.setAttribute("data-bs-toggle", "collapse");
      accordion_header_button.setAttribute("data-bs-target", "#collapseGroup" + c.id);
      accordion_header_button.setAttribute("aria-expanded", "true");
      accordion_header_button.setAttribute("aria-controls", "collapseGroup" + c.id);
      let cell_name_button = document.createElement("input");
      cell_name_button.className = "btn-check";
      cell_name_button.setAttribute("type", "radio");
      cell_name_button.setAttribute("name", "option-base");
      cell_name_button.id = "cell-" + c.id;
      cell_name_button.setAttribute("autocomplete", "off");
      if (c.id == current_index) {
        cell_name_button.setAttribute("checked", "")
      }
      cell_name_button.addEventListener("change", function(){
        selectCellByName(c.name);
      });
      let cell_name = document.createElement("label");
      cell_name.innerHTML = c.name;
      cell_name.className = "btn btn-dark w-100 text-start p-0";
      cell_name.setAttribute("for", "cell-" + c.id);
      accordion_row = document.createElement("div");
      accordion_row.className = "mx-0 border-bottom flex-grow-1";
      accordion_row.appendChild(cell_name_button);
      accordion_row.appendChild(cell_name);
      accordion_header.appendChild(accordion_row);

      accordion_header.appendChild(accordion_header_button);

      accordion_collapse = document.createElement("div")
      accordion_collapse.className = "accordion-collapse show";
      accordion_collapse.setAttribute("data-bs-parent", "#" + accordion.id);
      accordion_collapse.id = "collapseGroup" + c.id;
      accordion_item.appendChild(accordion_collapse);

      accordion_body = document.createElement("div");
      accordion_body.className = "accordion-body p-0";
      accordion_collapse.appendChild(accordion_body);

      appendCells(accordion_body, c.children, current_index, true);
      lastelement = accordion;

    } else {
      let cell_name_button = document.createElement("input");
      cell_name_button.className = "btn-check";
      cell_name_button.setAttribute("type", "radio");
      cell_name_button.setAttribute("name", "option-base");
      cell_name_button.id = "cell-" + c.id;
      cell_name_button.setAttribute("autocomplete", "off");
      cell_name_button.addEventListener("change", function(){
        selectCellByName(c.name);
      });
      if (c.id == current_index) {
        cell_name_button.setAttribute("checked", "")
      }
      let cell_name = document.createElement("label");
      cell_name.innerHTML = c.name;
      cell_name.className = "btn btn-dark text-start p-0";
      cell_name.setAttribute("for", "cell-" + c.id);
      accordion_row = document.createElement("div");
      accordion_row = document.createElement("row");
      accordion_row.className = "row mx-0";
      accordion_row.appendChild(cell_name_button);
      accordion_row.appendChild(cell_name);

      let accordion = document.createElement("div");
      if (addpaddings) {
        accordion.className = "accordion accordion-flush ps-2 pe-0";
      } else {
        accordion.className = "accordion accordion-flush px-0";
      }
      accordion.id = "cellgroup-" + c.id;
      cellRow.appendChild(accordion);

      accordion_item = document.createElement("div");
      accordion_item.className = "accordion-item";
      accordion.appendChild(accordion_item);

      accordion_header = document.createElement("div");
      accordion_header.className = "accordion-header";
      accordion_item.appendChild(accordion_header)
      accordion_header.appendChild(accordion_row);

      lastelement = accordion
    }

  });

  if (addpaddings && lastelement) {
     lastelement.classList.add("pb-2");
  }
}
//  Updates the layer list
function showLayers(layers) {

  let layerElement = document.getElementById("layers-tab-pane");
  let layerButtons = document.getElementById("layer-buttons");

  let layerSwitch = document.getElementById("layerEmptySwitch");

  let layerTable = document.getElementById("table-layer") || document.createElement("div");
  layerTable.id = "table-layer";
  layerTable.className = "container-fluid text-left px-0 pb-2";
  layerElement.replaceChildren(layerButtons, layerTable);

  appendLayers(layerTable, layers, addempty=!layerSwitch.checked, addpaddings=true);
  layerSwitch.addEventListener("change", function() {
    layerTable.replaceChildren();
    appendLayers(layerTable, layers, addempty=!this.checked, addpaddings=true);
  });

}
  //  create table rows for each layer
function appendLayers(parentelement, layers, addempty=false, addpaddings = false) {

  let lastelement = null;

  layers.forEach(function(l, i) {

    if (addempty || !l.empty) {

      let layerRow = document.createElement("div");
      layerRow.className = "row mx-0";
      parentelement.appendChild(layerRow);
      if ("children" in l) {

        let accordion = document.createElement("div");

        if (addpaddings){
          accordion.className = "accordion accordion-flush px-2";
        } else {
          accordion.className = "accordion accordion-flush ps-2 pe-0";
        }
        accordion.id = "layergroup-" + l.id;


        layerRow.appendChild(accordion);

        accordion_item = document.createElement("div");
        accordion_item.className = "accordion-item";
        accordion.appendChild(accordion_item);

        accordion_header = document.createElement("div");
        accordion_header.className = "accordion-header d-flex flex-row";
        accordion_item.appendChild(accordion_header);

        accordion_header_button = document.createElement("button");
        accordion_header_button.className = "accordion-button p-0 flex-grow-1";
        accordion_header_button.setAttribute("type", "button");
        accordion_header_button.setAttribute("data-bs-toggle", "collapse");
        accordion_header_button.setAttribute("data-bs-target", "#collapseGroup" + l.id);
        accordion_header_button.setAttribute("aria-expanded", "true");
        accordion_header_button.setAttribute("aria-controls", "collapseGroup" + l.id);
        let img_cont = document.createElement("div");
        img_cont.className = "col-auto p-0";
        let layer_image = document.createElement("img");
        layer_image.src = "data:image/png;base64," + l.img;
        layer_image.style = "max-width: 100%;";
        layer_image.id  = "layer-img-" + l.id;
        layer_image.className = "layer-img";

        function click_layer_img() {
          l.v = !l.v;
          let ev = { msg: "layer-v", id: l.id, value: l.v};
          socket.send(JSON.stringify(ev));
        }

        layer_image.addEventListener("click", click_layer_img);

        img_cont.appendChild(layer_image);
        let layer_name = document.createElement("div");
        layer_name.innerHTML = l.name;
        layer_name.className = "col";
        let layer_source = document.createElement("div");
        layer_source.innerHTML = l.s;
        layer_source.className = "col-auto";
        accordion_row = document.createElement("div");
        accordion_row.className = "row mx-0";
        accordion_header.insertBefore(img_cont, accordion_header.firstChild);
        accordion_row.appendChild(layer_name);
        accordion_row.appendChild(layer_source);
        accordion_header_button.appendChild(accordion_row);

        accordion_header.appendChild(accordion_header_button);

        accordion_collapse = document.createElement("div")
        accordion_collapse.className = "accordion-collapse show";
        accordion_collapse.setAttribute("data-bs-parent", "#" + accordion.id);
        accordion_collapse.id = "collapseGroup" + l.id;
        accordion_item.appendChild(accordion_collapse);

        accordion_body = document.createElement("div");
        accordion_body.className = "accordion-body p-0";
        accordion_collapse.appendChild(accordion_body);

        appendLayers(accordion_body, l.children, addempty=addempty);
        lastelement = accordion;

      } else {
        let img_cont = document.createElement("div");
        img_cont.className = "col-auto p-0";
        let layer_image = document.createElement("img");
        layer_image.src = "data:image/png;base64," + l.img;
        layer_image.style = "max-width: 100%;";
        layer_image.id  = "layer-img-" + l.id;
        layer_image.className = "layer-img";
        function click_layer_img() {
          l.v = !l.v;
          let ev = { msg: "layer-v", id: l.id, value: l.v};
          socket.send(JSON.stringify(ev));
        }

        layer_image.addEventListener("click", click_layer_img);
        img_cont.appendChild(layer_image);
        let layer_name = document.createElement("div");
        layer_name.innerHTML = l.name;
        layer_name.className = "col";
        let layer_source = document.createElement("div");
        layer_source.innerHTML = l.s;
        layer_source.className = "col-auto pe-0";
        accordion_row = document.createElement("row");
        accordion_row.className = "row mx-0";
        accordion_row.appendChild(img_cont);
        accordion_row.appendChild(layer_name);
        accordion_row.appendChild(layer_source);

        let accordion = document.createElement("div");
        if (addpaddings) {
          accordion.className = "accordion accordion-flush px-2";
        } else {
          accordion.className = "accordion accordion-flush ps-2 pe-0";
        }
        accordion.id = "layergroup-" + l.id;
        layerRow.appendChild(accordion);

        accordion_item = document.createElement("div");
        accordion_item.className = "accordion-item";
        accordion.appendChild(accordion_item);

        accordion_header = document.createElement("div");
        accordion_header.className = "accordion-header";
        accordion_item.appendChild(accordion_header)
        accordion_header.appendChild(accordion_row);

        lastelement = accordion
      }
    }

  });

  if (addpaddings && lastelement) {
     lastelement.classList.add("pb-2");
  }
}

function updateLayerImages(layers) {
  layers.forEach(function(l) {
    let layer_image = document.getElementById("layer-img-"+l.id);
    layer_image.src = "data:image/png;base64," + l.img;

    if ("children" in l) {
      updateLayerImages(l.children);
    }
  });
}


//  Prevents the context menu to show up over the canvas area
canvas.addEventListener('contextmenu', function(evt) {
  evt.preventDefault();
});

canvas.addEventListener('mousemove', function (evt) {
  sendMouseEvent(canvas, "mouse_move", evt);
  evt.preventDefault();
}, false);

canvas.addEventListener('click', function (evt) {
  sendMouseEvent(canvas, "mouse_click", evt);
  evt.preventDefault();
}, false);

canvas.addEventListener('dblclick', function (evt) {
  sendMouseEvent(canvas, "mouse_dblclick", evt);
  evt.preventDefault();
}, false);

canvas.addEventListener('mousedown', function (evt) {
  sendMouseEvent(canvas, "mouse_pressed", evt);
  evt.preventDefault();
}, false);

canvas.addEventListener('mouseup', function (evt) {
  sendMouseEvent(canvas, "mouse_released", evt);
  evt.preventDefault();
}, false);

canvas.addEventListener('mouseenter', function (evt) {
  sendMouseEvent(canvas, "mouse_enter", evt);
  evt.preventDefault();
}, false);

canvas.addEventListener('mouseout', function (evt) {
  sendMouseEvent(canvas, "mouse_leave", evt);
  evt.preventDefault();
}, false);

canvas.addEventListener('wheel', function (evt) {
  sendWheelEvent(canvas, "wheel", evt);
  evt.preventDefault();
}, false);

window.addEventListener("keydown", function(evt) {
  // Check if the pressed key is the "Escape" key
  if (evt.key === "Escape" || evt.keyCode === 27) {
    evt.preventDefault();
    sendKeyEvent(canvas, "keydown", evt);
  }
});
