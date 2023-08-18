
ws_url = ws_url.replace("http://","ws://");
ws_url = ws_url.replace("https://","wss://");
let url = ws_url + '/ws?' + "gds_file=" + gds_file + "&layer_props=" + layer_props;
console.log(url);
console.log(layer_props);

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

    //  For debugging:
    //  message.textContent = data;

    //  incoming messages are JSON objects
    console.log(data)
    js = JSON.parse(data);
    if (js.msg == "initialized") {
      initialized = true;
    } else if (js.msg == "loaded") {
      showLayers(js.layers);
      showMenu(js.modes, js.annotations);
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
    console.log(type)
    console.log(evt.keyCode)
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

    let layers = document.getElementById("layers");
    layers.style.height = h + "px";
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
  modeRow.className = "btn-group";
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
  clearRulers.className = "btn btn-primary";
  clearRulers.setAttribute("type", "button");
  clearRulers.onclick = function() {
    socket.send(JSON.stringify({ msg: "clear-annotations" }));
  };
  menuElement.appendChild(clearRulers);

  let index = 0;

  annotations.forEach(function(a) {

    let option = document.createElement("option");
    option.value = index;
    option.text = a;

    rulersSelect.appendChild(option);

    index += 1;

  });
}

//  Updates the layer list
function showLayers(layers) {

  let layerElement = document.getElementById("layers");
  layerElement.childNodes = new Array();

  let layerTable = document.createElement("table");
  layerTable.className = "layer-table";
  layerElement.appendChild(layerTable)

  let cell;
  let inner;
  let s;
  let visibilityCheckboxes = [];

  let layerRow = document.createElement("tr");
  layerRow.className = "layer-row-header";

  //  create a top level entry for resetting/setting all visible flags

  cell = document.createElement("td");
  cell.className = "layer-visible-cell";

  inner = document.createElement("input");
  inner.type = "checkbox";
  inner.checked = true;
  inner.onclick = function() {
    let checked = this.checked;
    visibilityCheckboxes.forEach(function(cb) {
      cb.checked = checked;
    });
    socket.send(JSON.stringify({ msg: "layer-v-all", value: checked }));
  };
  cell.appendChild(inner);

  layerRow.appendChild(cell);
  layerTable.appendChild(layerRow);

  //  create table rows for each layer

  layers.forEach(function(l) {

    let layerRow = document.createElement("tr");
    layerRow.className = "layer-row";

    cell = document.createElement("td");
    cell.className = "layer-visible-cell";

    inner = document.createElement("input");
    visibilityCheckboxes.push(inner);
    inner.type = "checkbox";
    inner.checked = l.v;
    inner.onclick = function() {
      socket.send(JSON.stringify({ msg: "layer-v", id: l.id, value: this.checked }));
    };
    cell.appendChild(inner);

    layerRow.appendChild(cell);

    cell = document.createElement("td");
    cell.className = "layer-color-cell";
    s = "border-style: solid; border-width: " + (l.w < 0 ? 1 : l.w) + "px; border-color: #" + (l.fc & 0xffffff).toString(16) + ";";
    cell.style = s;
    layerRow.appendChild(cell);

    inner = document.createElement("div");
    s = "width: 2rem; height: 1em;";
    s += "margin: 1px;";
    s += "background: #" + (l.c & 0xffffff).toString(16) + ";";
    inner.style = s;
    cell.appendChild(inner);

    cell = document.createElement("td");
    cell.className = "layer-name-cell";
    cell.textContent = (l.name != 0 ? l.name : l.s);
    layerRow.appendChild(cell);

    layerTable.appendChild(layerRow);

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
    console.log("Escape pressed!")
    sendKeyEvent(canvas, "keydown", evt);
  }
});