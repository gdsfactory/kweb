
ws_url = ws_url.replace("http://","ws://").replace("https://", "wss://");

let url = ws_url + '/ws?' + params.toString();

let canvas = document.getElementById("layout_canvas");
let context = canvas.getContext("2d");

let message = document.getElementById("message");

let socket = new WebSocket(url);
socket.binaryType = "blob";
let initialized = false;

const categoryList = document.getElementById("rdbCategoryOptions");
const cellList = document.getElementById("rdbCellOptions");
cellList.selectedIndex = -1;
categoryList.selectedIndex = -1;

const rdbCategory = document.getElementById("rdbCategory");
const rdbCell = document.getElementById("rdbCell");

const rdbItems = document.getElementById("rdbItems");

const layerSearchInput = document.getElementById("layerSearchInput");
const layerClearSearch = document.getElementById("layerClearSearch");
const layerShowAllButton = document.getElementById("layerShowAll");
const layerHideAllButton = document.getElementById("layerHideAll");
const layerPresetSelect = document.getElementById("layerPresetSelect");
const layerSavePresetButton = document.getElementById("layerSavePreset");
const layerDeletePresetButton = document.getElementById("layerDeletePreset");
const layerSwitchToggle = document.getElementById("layerEmptySwitch");

const measurementOverlay = document.getElementById("measurement-overlay");
const measurementSummary = document.getElementById("measurement-summary");
const measurementList = document.getElementById("measurement-list");
const measurementExportButton = document.getElementById("measurement-export");
const noteSummary = document.getElementById("note-summary");
const noteList = document.getElementById("note-list");

const layerPresetsStorageKey = "kweb-layer-presets";
let layerTree = [];
let layerFilterTerm = "";
let layerPresets = loadLayerPresets();
let suppressPresetChangeEvent = false;
let measurementData = [];
let noteData = [];
let lastPointer = { x: null, y: null };

if (layerSwitchToggle) {
  layerSwitchToggle.addEventListener("change", () => renderLayerTable());
}

if (layerSearchInput) {
  layerSearchInput.addEventListener("input", (event) => {
    layerFilterTerm = event.target.value || "";
    applyLayerFilter();
  });
}

if (layerClearSearch) {
  layerClearSearch.addEventListener("click", () => {
    if (layerSearchInput) {
      layerSearchInput.value = "";
    }
    layerFilterTerm = "";
    applyLayerFilter();
  });
}

if (layerShowAllButton) {
  layerShowAllButton.addEventListener("click", () => {
    setAllLayersVisibility(true);
  });
}

if (layerHideAllButton) {
  layerHideAllButton.addEventListener("click", () => {
    setAllLayersVisibility(false);
  });
}

if (layerPresetSelect) {
  layerPresetSelect.addEventListener("change", (event) => {
    if (suppressPresetChangeEvent) {
      return;
    }
    const name = event.target.value;
    if (name) {
      applyLayerPreset(name);
    }
  });
}

if (layerSavePresetButton) {
  layerSavePresetButton.addEventListener("click", () => {
    const presetName = prompt("Preset name", "");
    if (!presetName) {
      return;
    }
    const trimmed = presetName.trim();
    if (!trimmed) {
      return;
    }
    layerPresets[trimmed] = collectLayerVisibilities(layerTree);
    persistLayerPresets();
    refreshLayerPresetOptions(trimmed);
  });
}

if (layerDeletePresetButton) {
  layerDeletePresetButton.addEventListener("click", () => {
    const name = layerPresetSelect ? layerPresetSelect.value : "";
    if (!name) {
      return;
    }
    if (confirm(`Delete preset "${name}"?`)) {
      delete layerPresets[name];
      persistLayerPresets();
      refreshLayerPresetOptions();
    }
  });
}

refreshLayerPresetOptions();

if (measurementExportButton) {
  measurementExportButton.addEventListener("click", exportMeasurementsAsCsv);
}

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
socket.onmessage = async function(evt) {

  let data = evt.data;
  if (typeof(data) === "string") {

    js = JSON.parse(data);
    if (js.msg == "initialized") {
      initialized = true;
    } else if (js.msg == "loaded") {
      showLayers(js.layers);
      showMenu(js.modes, js.annotations);
      showCells(js.hierarchy, js.ci)
    } else if (js.msg == "reloaded") {
      console.log(js.hierarchy)
      console.log(js.ci)
      showLayers(js.layers);
      showCells(js.hierarchy, js.ci)
    } else if (js.msg == "layer-u") {
      updateLayerImages(js.layers);
    } else if (js.msg == "metainfo") {
      updateMetaInfo(js.metainfo);
    } else if (js.msg == "rdbinfo") {
      updateRdbTab(js.rdbinfo);      
    } else if (js.msg == "error") {
      alert(js.details);
    } else if (js.msg == "rdb-items") {
      await updateRdbItems(js.items);
    } else if (js.msg == "measurement-update") {
      updateAnnotationsOverlay(js.measurements, js.notes);
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
  lastPointer.x = x;
  lastPointer.y = y;
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
  menuElement.replaceChildren();

  let clearRulers = document.createElement("button");
  clearRulers.id = "clearRulers";
  clearRulers.textContent = "Clear Rulers";
  clearRulers.className = "col-auto btn btn-primary mx-2";
  clearRulers.setAttribute("type", "button");
  clearRulers.onclick = function() {
    socket.send(JSON.stringify({ msg: "clear-annotations" }));
  };
  menuElement.appendChild(clearRulers);
  let addNote = document.createElement("button");
  addNote.id = "addNote";
  addNote.textContent = "Add Note";
  addNote.className = "col-auto btn btn-primary mx-2";
  addNote.setAttribute("type", "button");
  addNote.onclick = openAnnotationDialog;
  menuElement.appendChild(addNote);
  let zoomFit= document.createElement("button");
  zoomFit.id = "zoomFit";
  zoomFit.textContent = "Zoom Fit";
  zoomFit.className = "col-auto btn btn-primary mx-2";
  zoomFit.setAttribute("type", "button");
  zoomFit.onclick = function() {
    socket.send(JSON.stringify({ msg: "zoom-f" }));
  };
  menuElement.appendChild(zoomFit);
  let reload = document.createElement("button");
  reload.id = "reload";
  reload.textContent = "Reload";
  reload.className = "col-auto btn btn-primary mx-2";
  reload.setAttribute("type", "button");
  reload.onclick = function() {
    socket.send(JSON.stringify({ msg: "reload" }));
  };
  menuElement.appendChild(reload);
  

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
  layerTree = layers;
  renderLayerTable();
}

function renderLayerTable() {
  const layerElement = document.getElementById("layers-tab-pane");
  const layerButtons = document.getElementById("layer-buttons");
  if (!layerElement || !layerButtons) {
    return;
  }

  let layerTable = document.getElementById("table-layer");
  if (!layerTable) {
    layerTable = document.createElement("div");
  layerTable.id = "table-layer";
  layerTable.className = "container-fluid text-left px-0 pb-2";
  }

  if (layerTable.parentElement !== layerElement) {
  layerElement.replaceChildren(layerButtons, layerTable);
  }

    layerTable.replaceChildren();

  if (!Array.isArray(layerTree) || layerTree.length === 0) {
    applyLayerFilter();
    return;
  }

  const includeEmptyLayers = !(layerSwitchToggle && layerSwitchToggle.checked);
  appendLayers(layerTable, layerTree, includeEmptyLayers, true);
  applyLayerFilter();
}

function applyLayerFilter() {
  const term = (layerFilterTerm || "").trim().toLowerCase();
  const rootAccordions = document.querySelectorAll("#table-layer .accordion[data-layer-id]");
  if (!rootAccordions.length) {
    return;
  }
  rootAccordions.forEach((accordion) => {
    filterLayerElement(accordion, term);
  });
}

function filterLayerElement(element, term) {
  if (!element || !element.dataset) {
    return false;
  }
  const layerName = (element.dataset.layerName || "").toLowerCase();
  const layerSource = (element.dataset.layerSource || "").toLowerCase();
  const matchesSelf = !term || layerName.includes(term) || layerSource.includes(term);

  const body = element.querySelector(":scope > .accordion-item > .accordion-collapse > .accordion-body");
  let childMatches = false;
  if (body) {
    const childAccordions = body.querySelectorAll(":scope > .accordion[data-layer-id]");
    childMatches = Array.from(childAccordions).map((child) => filterLayerElement(child, term)).some(Boolean);
  }

  const shouldShow = matchesSelf || childMatches;
  element.classList.toggle("layer-filter-hidden", !shouldShow);
  const parentRow = element.parentElement;
  if (parentRow && parentRow.classList && parentRow.classList.contains("row")) {
    parentRow.classList.toggle("layer-filter-hidden", !shouldShow);
  }
  return shouldShow;
}

function setAllLayersVisibility(visible) {
  if (!Array.isArray(layerTree) || !layerTree.length) {
    return;
  }
  setVisibilityRecursively(layerTree, visible);
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ msg: "layer-v-all", value: visible }));
  }
  renderLayerTable();
}

function setVisibilityRecursively(layers, visible) {
  layers.forEach((layer) => {
    layer.v = visible;
    updateLayerVisibilityClassById(layer.id, visible);
    if (Array.isArray(layer.children) && layer.children.length > 0) {
      setVisibilityRecursively(layer.children, visible);
    }
  });
}

function updateLayerVisibilityClassById(layerId, visible) {
  const element = document.getElementById("layergroup-" + layerId);
  if (element) {
    element.classList.toggle("layer-hidden", !visible);
  }
}

function updateLayerVisibilityInTree(layers, layerId, visible) {
  if (!Array.isArray(layers)) {
    return false;
  }
  for (const layer of layers) {
    if (layer.id === layerId) {
      layer.v = visible;
      updateLayerVisibilityClassById(layerId, visible);
      return true;
    }
    if (Array.isArray(layer.children) && updateLayerVisibilityInTree(layer.children, layerId, visible)) {
      return true;
    }
  }
  return false;
}

function collectLayerVisibilities(layers, result = {}) {
  if (!Array.isArray(layers)) {
    return result;
  }
  layers.forEach((layer) => {
    result[layer.id] = Boolean(layer.v);
    if (Array.isArray(layer.children) && layer.children.length > 0) {
      collectLayerVisibilities(layer.children, result);
    }
  });
  return result;
}

function loadLayerPresets() {
  try {
    const raw = window.localStorage.getItem(layerPresetsStorageKey);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return parsed;
    }
  } catch (err) {
    console.warn("Error loading layer presets", err);
  }
  return {};
}

function persistLayerPresets() {
  try {
    window.localStorage.setItem(layerPresetsStorageKey, JSON.stringify(layerPresets));
  } catch (err) {
    console.warn("Error saving layer presets", err);
  }
}

function refreshLayerPresetOptions(selectedName = "") {
  if (!layerPresetSelect) {
    return;
  }
  suppressPresetChangeEvent = true;
  layerPresetSelect.replaceChildren();
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Select preset";
  layerPresetSelect.appendChild(placeholder);
  Object.keys(layerPresets)
    .sort((a, b) => a.localeCompare(b))
    .forEach((name) => {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      layerPresetSelect.appendChild(option);
    });
  if (selectedName && layerPresets[selectedName]) {
    layerPresetSelect.value = selectedName;
  } else {
    layerPresetSelect.value = "";
  }
  suppressPresetChangeEvent = false;
}

function applyLayerPreset(name) {
  const preset = layerPresets[name];
  if (!preset) {
    return;
  }
  const current = collectLayerVisibilities(layerTree);
  Object.entries(preset).forEach(([id, desired]) => {
    const numericId = Number(id);
    if (current[id] !== desired) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ msg: "layer-v", id: numericId, value: desired }));
      }
      updateLayerVisibilityInTree(layerTree, numericId, desired);
    }
  });
  renderLayerTable();
}

function updateAnnotationsOverlay(measurements, notes) {
  measurementData = Array.isArray(measurements) ? measurements : [];
  noteData = Array.isArray(notes) ? notes : [];
  renderAnnotationsOverlay();
}

function renderAnnotationsOverlay() {
  if (!measurementOverlay || !measurementList || !measurementSummary) {
    return;
  }

  measurementList.replaceChildren();
  if (noteList) {
    noteList.replaceChildren();
  }

  const hasMeasurements = measurementData.length > 0;
  const hasNotes = noteData.length > 0;

  if (!hasMeasurements && !hasNotes) {
    measurementOverlay.classList.add("d-none");
    measurementSummary.textContent = "No active measurements";
    if (noteSummary) {
      noteSummary.textContent = "No notes";
    }
    if (measurementExportButton) {
      measurementExportButton.disabled = true;
    }
    return;
  }

  measurementOverlay.classList.remove("d-none");
  if (measurementExportButton) {
    measurementExportButton.disabled = !hasMeasurements;
  }

  if (hasMeasurements) {
    measurementSummary.textContent =
      measurementData.length === 1
        ? "1 active measurement"
        : `${measurementData.length} active measurements`;
  } else {
    measurementSummary.textContent = "No active measurements";
  }

  measurementData.forEach((measurement, index) => {
    const row = document.createElement("div");
    row.className = "measurement-row d-flex justify-content-between align-items-center gap-2";

    const label = document.createElement("span");
    label.className = "measurement-label text-truncate";
    const labelText =
      measurement.label && measurement.label.trim().length > 0
        ? measurement.label
        : `Ruler ${index + 1}`;
    label.textContent = labelText;

    const values = document.createElement("span");
    values.className = "measurement-values text-end text-nowrap";
    const lengthText = formatMicrons(measurement.length);
    const dxText = formatMicrons(measurement.dx);
    const dyText = formatMicrons(measurement.dy);
    const angleText = formatAngle(measurement.angle);
    values.textContent = `L=${lengthText}µm Δx=${dxText}µm Δy=${dyText}µm θ=${angleText}°`;

    row.appendChild(label);
    row.appendChild(values);
    measurementList.appendChild(row);
  });

  if (noteSummary) {
    noteSummary.textContent = hasNotes
      ? noteData.length === 1
        ? "1 note"
        : `${noteData.length} notes`
      : "No notes";
  }

  if (noteList && hasNotes) {
    noteData.forEach((note, index) => {
      const row = document.createElement("div");
      row.className = "note-row d-flex justify-content-between align-items-center gap-2";

      const label = document.createElement("span");
      label.className = "note-label text-truncate";
      const labelText =
        note.text && note.text.trim().length > 0 ? note.text : `Note ${index + 1}`;
      label.textContent = labelText;

      const coords = document.createElement("span");
      coords.className = "note-values text-end text-nowrap";
      const xText = formatMicrons(note.position?.x);
      const yText = formatMicrons(note.position?.y);
      coords.textContent = `(${xText}µm, ${yText}µm)`;

      row.appendChild(label);
      row.appendChild(coords);
      noteList.appendChild(row);
    });
  }
}

function formatMicrons(value) {
  if (!Number.isFinite(value)) {
    return "-";
  }
  const abs = Math.abs(value);
  let decimals = 3;
  if (abs >= 1000) {
    decimals = 0;
  } else if (abs >= 100) {
    decimals = 1;
  } else if (abs >= 10) {
    decimals = 2;
  }
  return value.toFixed(decimals);
}

function formatAngle(value) {
  if (!Number.isFinite(value)) {
    return "-";
  }
  return value.toFixed(1);
}

function exportMeasurementsAsCsv() {
  if (!measurementData.length) {
    return;
  }
  const header = [
    "id",
    "label",
    "length_um",
    "dx_um",
    "dy_um",
    "angle_deg",
    "p1_x_um",
    "p1_y_um",
    "p2_x_um",
    "p2_y_um",
  ];
  const rows = measurementData.map((measurement) => {
    const cells = [
      measurement.id,
      `"${((measurement.label || "") + "").replace(/"/g, '""')}"`,
      csvNumber(measurement.length),
      csvNumber(measurement.dx),
      csvNumber(measurement.dy),
      csvNumber(measurement.angle),
      csvNumber(measurement.p1?.x),
      csvNumber(measurement.p1?.y),
      csvNumber(measurement.p2?.x),
      csvNumber(measurement.p2?.y),
    ];
    return cells.join(",");
  });
  const csvContent = [header.join(","), ...rows].join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "kweb_measurements.csv";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function csvNumber(value) {
  if (!Number.isFinite(value)) {
    return "";
  }
  return value.toFixed(6);
}

const messages = {
  en: {
    annotationPrompt: "Note (the last cursor position will be used)",
  },
  es: {
    annotationPrompt: "Nota (se usará la última posición del cursor)",
  },
};

function getUserLanguage() {
  return navigator.language?.slice(0, 2) || "en";
}

function getMessage(key) {
  const lang = getUserLanguage();
  if (messages[lang]?.[key]) {
    return messages[lang][key];
  }
  if (messages.en?.[key]) {
    return messages.en[key];
  }
  return "";
}

function getPointerCoordinates() {
  let { x, y } = lastPointer;
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    x = canvas ? canvas.clientWidth / 2 : 0;
    y = canvas ? canvas.clientHeight / 2 : 0;
  }
  return { x, y };
}

function openAnnotationDialog() {
  if (!canvas || !socket || socket.readyState !== WebSocket.OPEN) {
    return;
  }
  const text = prompt(getMessage("annotationPrompt"), "");
  if (text === null) {
    return;
  }
  const trimmed = text.trim();
  if (!trimmed) {
    return;
  }
  const pointer = getPointerCoordinates();
  socket.send(
    JSON.stringify({
      msg: "add-annotation",
      x: pointer.x,
      y: pointer.y,
      text: trimmed,
    })
  );
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
        accordion.dataset.layerId = l.id;
        accordion.dataset.layerName = (l.name || "").toLowerCase();
        accordion.dataset.layerSource = (l.s || "").toLowerCase();
        if (!l.v) {
          accordion.classList.add("layer-hidden");
        }


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
        accordion.dataset.layerId = l.id;
        accordion.dataset.layerName = (l.name || "").toLowerCase();
        accordion.dataset.layerSource = (l.s || "").toLowerCase();
        if (!l.v) {
          accordion.classList.add("layer-hidden");
        }
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
    if (layer_image) {
    layer_image.src = "data:image/png;base64," + l.img;
    }
    updateLayerVisibilityInTree(layerTree, l.id, l.v);

    if ("children" in l) {
      updateLayerImages(l.children);
    }
  });
}

async function updateMetaInfo(metainfo) {
  const metaInfoPane = document.getElementById("metainfo-tab-pane");
  const metaInfoButton = document.getElementById("metainfo-tab");
  metaInfoPane.replaceChildren();
  let metaRow = document.createElement("div");
  metaRow.className = "row mx-0";
  metaInfoPane.appendChild(metaRow);

  let hideMeta = true;

  let entry = {index: 0};

  for (const [key,value] of Object.entries(metainfo)) {
    metaRow.appendChild( await addAccordion(entry, key,value));
    hideMeta = false;
  }

  metaInfoButton.hidden = hideMeta;
  
}

async function addAccordion(entry, jsonKey, jsonValue) {
  let accordion = document.createElement("div");
  let i = entry.index;

  if (addpaddings){
    accordion.className = "accordion accordion-flush px-2";
  } else {
    accordion.className = "accordion accordion-flush ps-2 pe-0";
  }
  accordion.id = "metaGroup" + i;

  let accordion_item = document.createElement("div");
  accordion_item.className = "accordion-item";
  accordion.appendChild(accordion_item);

  let accordion_header = document.createElement("div");
  accordion_header.className = "accordion-header d-flex flex-row";
  accordion_item.appendChild(accordion_header);


  let accordion_collapse = document.createElement("div")
  accordion_collapse.className = "accordion-collapse show";
  accordion_collapse.setAttribute("data-bs-parent", "#" + accordion.id);
  accordion_collapse.id = "collapseGroupMeta" + i;
  accordion_item.appendChild(accordion_collapse);

  let accordion_body = document.createElement("div");
  accordion_body.className = "accordion-body p-0";
  accordion_collapse.appendChild(accordion_body);

  entry.index += 1;

  if (typeof jsonValue === 'object') {
    let accordion_header_button = document.createElement("button");
    accordion_header_button.className = "accordion-button p-0 w-auto border-bottom";
    accordion_header_button.setAttribute("type", "button");
    accordion_header_button.setAttribute("data-bs-toggle", "collapse");
    accordion_header_button.setAttribute("data-bs-target", "#collapseGroupMeta" + i);
    accordion_header_button.setAttribute("aria-expanded", "true");
    accordion_header_button.setAttribute("aria-controls", "collapseGroupMeta" + i);
    accordion_header_button.textContent = jsonKey

    accordion_header.appendChild(accordion_header_button);
    for (const [key, value] of Object.entries(jsonValue)) {
      accordion_body.appendChild(await addAccordion(entry,key,value));
    }
  } else {
    accordion_body.textContent = `${jsonKey}: ${jsonValue}`;
  }

  return accordion;

}

async function updateRdbTab(rdbinfo) {
  const rdbButton = document.getElementById("rdb-tab");
  rdbButton.hidden = false;

  categoryList.replaceChildren();
  cellList.replaceChildren();

  for (const [category,id] of Object.entries(rdbinfo.categories)) {
    opt = document.createElement("option")
    opt.value = id
    opt.textContent = category
    categoryList.appendChild(opt)
  }
  for (const [cell,id] of Object.entries(rdbinfo.cells)) {
    opt = document.createElement("option")
    opt.value = id
    opt.textContent = cell
    cellList.appendChild(opt)
  }
}

function categoryFocus(event) {
  categoryList.hidden=false;
}
function categoryFocusOut(event) {
  if (event.relatedTarget != categoryList) {
    categoryList.hidden=true;
}}
function cellFocus(event) {
  cellList.hidden=false;
}
function cellFocusOut(event) {
  if (event.relatedTarget != cellList) {
    cellList.hidden=true;
}}

async function filterCategories(input) {
  let value = input.value;
  if (value === ""){
    categoryList.options.selectedIndex=-1;
    for (let i = 0; i < categoryList.options.length; i++) {
      let option = categoryList.options[i];
      option.hidden = false;
    }
  } else {
    let regex = new RegExp(input.value, 'i')
    let selected = false;
    for (let i = 0; i < categoryList.options.length; i++) {
      let option = categoryList.options[i];
      if (regex.test(option.text)) {
        option.hidden = false;
        if (option.text === input.value) {
          selected = true;
          categoryList.options.selectedIndex = i;
        }
      } else {
        option.hidden=true;
      }
      if (!selected) {
        categoryList.options.selectedIndex=-1;
      }
    }
  }
}
async function selectCategory(event) {
  let index = event.target.selectedIndex;
  if (index >= 0) {
    let option = event.target.options[index];
    rdbCategory.value = option.text;
  }
  await sendRdbCategoryAndCell();
}
async function filterCells(input) {
  let value = input.value;
  if (value === ""){
    cellList.options.selectedIndex=-1;
    for (let i = 0; i < cellList.options.length; i++) {
      let option = cellList.options[i];
      option.hidden = false;
    }
  } else {
    let regex = new RegExp(input.value, 'i')
    let selected = false;
    for (let i = 0; i < cellList.options.length; i++) {
      let option = cellList.options[i];
      if (regex.test(option.text)) {
        option.hidden = false;
        if (option.text === input.value) {
          selected = true;
          cellList.options.selectedIndex = i;
        }
      } else {
        option.hidden=true;
      }
      if (!selected) {
        cellList.options.selectedIndex=-1;
      }
    }
  }
}
async function selectCell(event) {
  let index = event.target.selectedIndex;
  if (index >= 0) {
    let option = event.target.options[index];
    rdbCell.value = option.text;
  }
  await sendRdbCategoryAndCell();
}

async function updateRdbItems(items) {
  rdbItems.replaceChildren();

  for (const [id, tags] of Object.entries(items)) {
    let option = document.createElement("option");
    option.value = id;
    option.text = tags;
    rdbItems.appendChild(option)
  }
}

async function requestItemDrawings() {
  let json = {"msg": "rdb-selected", "items": {}}
  for (let i = 0; i < rdbItems.options.length; i++) {
    json.items[i] = rdbItems.options[i].selected;
  }
  socket.send(JSON.stringify(json));
}

async function sendRdbCategoryAndCell() {
  let categoryIndex = categoryList.selectedIndex;
  let cellIndex = cellList.selectedIndex;
  let category_id = null;
  let cell_id = null;
  if (cellIndex != -1) {
     cell_id = +cellList.options[cellIndex].value;
  }
  if (categoryIndex != -1) {
     category_id = +categoryList.options[categoryIndex].value;
  }
  socket.send(JSON.stringify({"msg": "rdb-records", "category_id": category_id, "cell_id": cell_id}))
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
