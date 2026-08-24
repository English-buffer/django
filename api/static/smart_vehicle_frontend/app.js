(() => {
  "use strict";

  const websocketProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const DEFAULT_CONFIG = {
    mockMode: false,
    apiBase: `${window.location.origin}/api`,
    websocketUrl: `${websocketProtocol}//${window.location.host}/ws/video`,
    frameRequestIntervalMs: 100,
    websocketRequestsFrames: true,
    reconnectDelayMs: 2000,
    endpoints: {
      mapList: "/maps",
      mapImage: (name) => `/maps/${encodeURIComponent(name)}/image`,
      mappingStart: "/mapping/start",
      mapSave: "/maps/save",
      navigationStart: "/navigation/start"
    },
    invertYForWorldCoordinate: true,
    defaultMapMeta: {
      resolution: 0.05,
      originX: 0,
      originY: 0
    }
  };

  const userConfig = window.APP_CONFIG || {};
  const CONFIG = {
    ...DEFAULT_CONFIG,
    ...userConfig,
    endpoints: { ...DEFAULT_CONFIG.endpoints, ...(userConfig.endpoints || {}) },
    defaultMapMeta: { ...DEFAULT_CONFIG.defaultMapMeta, ...(userConfig.defaultMapMeta || {}) }
  };

  const elements = {
    mapList: document.querySelector("#mapList"),
    mapCanvas: document.querySelector("#mapCanvas"),
    mapCanvasWrap: document.querySelector("#mapCanvasWrap"),
    mapLoading: document.querySelector("#mapLoading"),
    mapHint: document.querySelector("#mapHint"),
    currentMapName: document.querySelector("#currentMapName"),
    relativeX: document.querySelector("#relativeX"),
    relativeY: document.querySelector("#relativeY"),
    zoomValue: document.querySelector("#zoomValue"),
    resolutionValue: document.querySelector("#resolutionValue"),
    connectionText: document.querySelector("#connectionText"),
    systemClock: document.querySelector("#systemClock"),
    videoFrame: document.querySelector("#videoFrame"),
    videoFps: document.querySelector("#videoFps"),
    videoResolution: document.querySelector("#videoResolution"),
    wsStatusText: document.querySelector("#wsStatusText"),
    frameIntervalText: document.querySelector("#frameIntervalText"),
    clearMarkersButton: document.querySelector("#clearMarkersButton"),
    undoMarkerButton: document.querySelector("#undoMarkerButton"),
    fitMapButton: document.querySelector("#fitMapButton"),
    toastContainer: document.querySelector("#toastContainer")
  };

  const appState = {
    maps: [],
    currentMap: null,
    videoSocket: null,
    videoRequestTimer: null,
    reconnectTimer: null,
    lastVideoObjectUrl: null,
    frameTimes: []
  };

  const mapViewer = createMapViewer(elements.mapCanvas, {
    onCoordinateChange: updateCoordinateDisplay,
    onZoomChange: (zoom) => {
      elements.zoomValue.textContent = `${Math.round(zoom * 100)}%`;
    },
    onMarkersChange: (markers) => {
      if (markers.length > 0) {
        elements.mapHint.classList.add("is-hidden");
      }
    }
  });

  init();

  async function init() {
    startClock();
    bindToolbar();
    bindActionButtons();
    elements.frameIntervalText.textContent = `${CONFIG.frameRequestIntervalMs} ms`;

    await loadMapList();

    if (CONFIG.mockMode) {
      setConnectionStatus(true, "模拟连接");
      elements.wsStatusText.textContent = "模拟连接";
      elements.videoFrame.src = "/static/smart_vehicle_frontend/assets/demo-camera.jpg";
    } else {
      connectVideoWebSocket();
    }
  }

  function startClock() {
    const update = () => {
      const now = new Date();
      elements.systemClock.textContent = now.toLocaleTimeString("zh-CN", {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      });
    };
    update();
    window.setInterval(update, 1000);
  }

  async function loadMapList() {
    elements.mapList.innerHTML = '<div class="map-list-empty">正在读取地图列表…</div>';

    try {
      let maps;
      if (CONFIG.mockMode) {
        maps = ["name1", "name2", "name3", "name4"].map((name) => ({
          name,
          imageUrl: "/static/smart_vehicle_frontend/assets/demo-map.png",
          resolution: 0.05,
          originX: 0,
          originY: 0
        }));
      } else {
        const response = await fetch(apiUrl(CONFIG.endpoints.mapList), {
          headers: { Accept: "application/json" }
        });
        if (!response.ok) {
          throw new Error(`地图列表请求失败：HTTP ${response.status}`);
        }
        const payload = await response.json();
        maps = normalizeMapList(payload);
      }

      if (!maps.length) {
        elements.mapList.innerHTML = '<div class="map-list-empty">后端未返回地图<br />请先完成建图并保存</div>';
        return;
      }

      appState.maps = maps;
      renderMapList(maps);
      await selectMap(maps[0]);
    } catch (error) {
      console.error(error);
      elements.mapList.innerHTML = '<div class="map-list-empty">地图列表加载失败<br />请检查后端地址与跨域配置</div>';
      showToast(error.message || "地图列表加载失败", "error");
    }
  }

  function normalizeMapList(payload) {
    const rawList = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.maps)
        ? payload.maps
        : Array.isArray(payload?.data)
          ? payload.data
          : [];

    return rawList
      .map((item) => {
        if (typeof item === "string") {
          return { name: item };
        }
        return {
          name: item.name ?? item.map_name ?? item.filename ?? item.id,
          imageUrl: item.image_url ?? item.imageUrl ?? item.url,
          resolution: numberOrUndefined(item.resolution),
          originX: numberOrUndefined(item.origin_x ?? item.originX ?? item.origin?.[0]),
          originY: numberOrUndefined(item.origin_y ?? item.originY ?? item.origin?.[1])
        };
      })
      .filter((item) => typeof item.name === "string" && item.name.trim());
  }

  function renderMapList(maps) {
    elements.mapList.innerHTML = "";

    maps.forEach((map, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "map-list-item";
      button.dataset.mapName = map.name;
      button.setAttribute("role", "option");
      button.setAttribute("aria-selected", "false");
      button.innerHTML = `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 2.8h8l4 4V21H6z" />
          <path d="M14 2.8V7h4M9 12h6M9 15.5h6" />
          <circle cx="10" cy="8.5" r="1.3" />
        </svg>
        <span>${escapeHtml(map.name)}</span>
      `;
      button.addEventListener("click", () => selectMap(map));
      elements.mapList.appendChild(button);

      if (index === 0) {
        button.classList.add("is-active");
        button.setAttribute("aria-selected", "true");
      }
    });
  }

  async function selectMap(map) {
    if (!map) return;

    appState.currentMap = map;
    document.querySelectorAll(".map-list-item").forEach((item) => {
      const active = item.dataset.mapName === map.name;
      item.classList.toggle("is-active", active);
      item.setAttribute("aria-selected", active ? "true" : "false");
    });

    elements.currentMapName.textContent = map.name;
    setMapLoading(true);

    try {
      const loaded = CONFIG.mockMode
        ? await loadImageElement(map.imageUrl || "/static/smart_vehicle_frontend/assets/demo-map.png")
        : await requestMapSource(map);

      const meta = {
        resolution: numberOrDefault(loaded.meta?.resolution ?? map.resolution, CONFIG.defaultMapMeta.resolution),
        originX: numberOrDefault(loaded.meta?.originX ?? map.originX, CONFIG.defaultMapMeta.originX),
        originY: numberOrDefault(loaded.meta?.originY ?? map.originY, CONFIG.defaultMapMeta.originY)
      };

      mapViewer.setMapSource(loaded.source || loaded, meta);
      elements.resolutionValue.textContent = `${formatNumber(meta.resolution, 3)} m/pix`;
      updateCoordinateDisplay(null);
    } catch (error) {
      console.error(error);
      showToast(error.message || `地图 ${map.name} 加载失败`, "error");
    } finally {
      setMapLoading(false);
    }
  }

  async function requestMapSource(map) {
    const endpoint = typeof CONFIG.endpoints.mapImage === "function"
      ? CONFIG.endpoints.mapImage(map.name)
      : CONFIG.endpoints.mapImage;
    const url = map.imageUrl ? resolveUrl(map.imageUrl) : apiUrl(endpoint);

    const response = await fetch(url, {
      headers: {
        Accept: "image/png,image/jpeg,image/webp,image/x-portable-graymap,application/json,application/octet-stream"
      }
    });

    if (!response.ok) {
      throw new Error(`地图图像请求失败：HTTP ${response.status}`);
    }

    const metaFromHeaders = {
      resolution: numberOrUndefined(response.headers.get("X-Map-Resolution")),
      originX: numberOrUndefined(response.headers.get("X-Map-Origin-X")),
      originY: numberOrUndefined(response.headers.get("X-Map-Origin-Y"))
    };

    const contentType = (response.headers.get("content-type") || "").toLowerCase();

    if (contentType.includes("application/json")) {
      const payload = await response.json();
      const source = await sourceFromJsonPayload(payload);
      return {
        source,
        meta: {
          resolution: numberOrUndefined(payload.resolution) ?? metaFromHeaders.resolution,
          originX: numberOrUndefined(payload.origin_x ?? payload.originX ?? payload.origin?.[0]) ?? metaFromHeaders.originX,
          originY: numberOrUndefined(payload.origin_y ?? payload.originY ?? payload.origin?.[1]) ?? metaFromHeaders.originY
        }
      };
    }

    const buffer = await response.arrayBuffer();
    const filename = response.headers.get("content-disposition") || map.name;
    const looksLikePgm = contentType.includes("portable-graymap") || contentType.includes("image/pgm") || /\.pgm\b/i.test(filename) || isPgmBuffer(buffer);

    if (looksLikePgm) {
      return { source: parsePgm(buffer), meta: metaFromHeaders };
    }

    const blob = new Blob([buffer], { type: contentType || "image/png" });
    return { source: await blobToImage(blob), meta: metaFromHeaders };
  }

  async function sourceFromJsonPayload(payload) {
    const candidate = payload.image ?? payload.data ?? payload.base64 ?? payload.image_base64 ?? payload.image_url ?? payload.url;
    if (typeof candidate !== "string" || !candidate) {
      throw new Error("地图 JSON 中缺少 image、base64 或 image_url 字段");
    }

    if (candidate.startsWith("data:")) {
      return loadImageElement(candidate);
    }

    if (/^https?:\/\//i.test(candidate) || candidate.startsWith("/")) {
      return loadImageElement(resolveUrl(candidate));
    }

    const mime = payload.mime_type || payload.content_type || "image/png";
    return loadImageElement(`data:${mime};base64,${candidate}`);
  }

  function bindToolbar() {
    document.querySelectorAll("[data-tool]").forEach((button) => {
      button.addEventListener("click", () => {
        document.querySelectorAll("[data-tool]").forEach((item) => item.classList.remove("is-active"));
        button.classList.add("is-active");
        mapViewer.setTool(button.dataset.tool);

        elements.mapCanvasWrap.classList.toggle("is-panning", button.dataset.tool === "pan");
        elements.mapCanvasWrap.classList.toggle("is-selecting", button.dataset.tool === "select");
      });
    });

    elements.clearMarkersButton.addEventListener("click", () => {
      mapViewer.clearMarkers();
      updateCoordinateDisplay(null);
      elements.mapHint.classList.remove("is-hidden");
      showToast("已清除全部导航点", "success");
    });

    elements.undoMarkerButton.addEventListener("click", () => {
      const marker = mapViewer.undoMarker();
      updateCoordinateDisplay(marker || null);
      if (mapViewer.getMarkers().length === 0) {
        elements.mapHint.classList.remove("is-hidden");
      }
    });

    elements.fitMapButton.addEventListener("click", () => {
      mapViewer.resetView();
      showToast("地图视图已复位", "success");
    });
  }

  function bindActionButtons() {
    document.querySelectorAll("[data-action]").forEach((button) => {
      button.addEventListener("click", async () => {
        const action = button.dataset.action;
        button.disabled = true;

        try {
          if (action === "mapping") {
            await sendBackendAction(CONFIG.endpoints.mappingStart, {
              command: "start_mapping",
              timestamp: new Date().toISOString()
            }, "建图指令已发送");
          }

          if (action === "save") {
            await sendBackendAction(CONFIG.endpoints.mapSave, {
              map_name: appState.currentMap?.name || null,
              markers: buildMarkerPayload(),
              timestamp: new Date().toISOString()
            }, "保存地图指令已发送");
          }

          if (action === "navigate") {
            const markers = mapViewer.getMarkers();
            if (!markers.length) {
              throw new Error("请先在地图上标记一个导航目标点");
            }

            await sendBackendAction(CONFIG.endpoints.navigationStart, {
              map_name: appState.currentMap?.name || null,
              goal: markerToPayload(markers[markers.length - 1]),
              waypoints: buildMarkerPayload(),
              timestamp: new Date().toISOString()
            }, "导航指令已发送");
          }
        } catch (error) {
          console.error(error);
          showToast(error.message || "请求发送失败", "error");
        } finally {
          button.disabled = false;
        }
      });
    });
  }

  async function sendBackendAction(endpoint, payload, successMessage) {
    if (CONFIG.mockMode) {
      await delay(420);
      console.info("[Mock API]", endpoint, payload);
      showToast(`${successMessage}（模拟模式）`, "success");
      return { ok: true };
    }

    const response = await fetch(apiUrl(endpoint), {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const message = await safeReadError(response);
      throw new Error(message || `后端请求失败：HTTP ${response.status}`);
    }

    const result = await safeReadJson(response);
    showToast(result?.message || successMessage, "success");
    return result;
  }

  function buildMarkerPayload() {
    return mapViewer.getMarkers().map(markerToPayload);
  }

  function markerToPayload(marker) {
    const meta = mapViewer.getMapMeta();
    const sourceSize = mapViewer.getSourceSize();
    const pixelX = marker.x * sourceSize.width;
    const pixelY = marker.y * sourceSize.height;
    const worldX = meta.originX + pixelX * meta.resolution;
    const worldY = CONFIG.invertYForWorldCoordinate
      ? meta.originY + (sourceSize.height - pixelY) * meta.resolution
      : meta.originY + pixelY * meta.resolution;

    return {
      id: marker.id,
      relative_x: round(marker.x, 6),
      relative_y: round(marker.y, 6),
      percentage_x: round(marker.x * 100, 2),
      percentage_y: round(marker.y * 100, 2),
      pixel_x: round(pixelX, 2),
      pixel_y: round(pixelY, 2),
      map_x_m: round(worldX, 4),
      map_y_m: round(worldY, 4)
    };
  }

  function updateCoordinateDisplay(marker) {
    if (!marker) {
      elements.relativeX.textContent = "--";
      elements.relativeY.textContent = "--";
      return;
    }

    elements.relativeX.textContent = `${(marker.x * 100).toFixed(1)}%`;
    elements.relativeY.textContent = `${(marker.y * 100).toFixed(1)}%`;
  }

  function connectVideoWebSocket() {
    cleanupVideoSocket(false);
    elements.wsStatusText.textContent = "正在连接";
    setConnectionStatus(false, "连接中");

    let socket;
    try {
      socket = new WebSocket(CONFIG.websocketUrl);
    } catch (error) {
      scheduleReconnect();
      showToast(`WebSocket 创建失败：${error.message}`, "error");
      return;
    }

    appState.videoSocket = socket;
    socket.binaryType = "arraybuffer";

    socket.addEventListener("open", () => {
      setConnectionStatus(true, "已连接");
      elements.wsStatusText.textContent = "已连接";
      showToast("视频 WebSocket 已连接", "success");

      if (CONFIG.websocketRequestsFrames) {
        requestVideoFrame();
        appState.videoRequestTimer = window.setInterval(requestVideoFrame, CONFIG.frameRequestIntervalMs);
      }
    });

    socket.addEventListener("message", async (event) => {
      try {
        await renderVideoMessage(event.data);
        recordFrameTime();
      } catch (error) {
        console.error("视频帧解析失败", error);
      }
    });

    socket.addEventListener("close", () => {
      setConnectionStatus(false, "已断开");
      elements.wsStatusText.textContent = "已断开";
      cleanupVideoSocket(false);
      scheduleReconnect();
    });

    socket.addEventListener("error", () => {
      setConnectionStatus(false, "连接异常");
      elements.wsStatusText.textContent = "连接异常";
    });
  }

  function requestVideoFrame() {
    const socket = appState.videoSocket;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type: "frame_request", timestamp: Date.now() }));
  }

  async function renderVideoMessage(data) {
    if (data instanceof ArrayBuffer) {
      displayVideoBlob(new Blob([data], { type: "image/jpeg" }));
      return;
    }

    if (data instanceof Blob) {
      displayVideoBlob(data);
      return;
    }

    if (typeof data !== "string") return;

    if (data.startsWith("data:image/")) {
      elements.videoFrame.src = data;
      return;
    }

    let payload;
    try {
      payload = JSON.parse(data);
    } catch {
      return;
    }

    const image = payload.image ?? payload.frame ?? payload.data ?? payload.base64;
    if (typeof image !== "string") return;

    if (payload.width && payload.height) {
      elements.videoResolution.textContent = `${payload.width} × ${payload.height}`;
    }

    elements.videoFrame.src = image.startsWith("data:image/")
      ? image
      : `data:${payload.mime_type || "image/jpeg"};base64,${image}`;
  }

  function displayVideoBlob(blob) {
    if (appState.lastVideoObjectUrl) {
      URL.revokeObjectURL(appState.lastVideoObjectUrl);
    }
    appState.lastVideoObjectUrl = URL.createObjectURL(blob);
    elements.videoFrame.src = appState.lastVideoObjectUrl;
  }

  function recordFrameTime() {
    const now = performance.now();
    appState.frameTimes.push(now);
    appState.frameTimes = appState.frameTimes.filter((time) => now - time <= 1000);
    elements.videoFps.textContent = `${appState.frameTimes.length.toFixed(1)} FPS`;
  }

  function cleanupVideoSocket(closeSocket = true) {
    if (appState.videoRequestTimer) {
      clearInterval(appState.videoRequestTimer);
      appState.videoRequestTimer = null;
    }

    if (closeSocket && appState.videoSocket) {
      appState.videoSocket.close();
    }
    appState.videoSocket = null;
  }

  function scheduleReconnect() {
    if (CONFIG.mockMode || appState.reconnectTimer) return;
    appState.reconnectTimer = window.setTimeout(() => {
      appState.reconnectTimer = null;
      connectVideoWebSocket();
    }, CONFIG.reconnectDelayMs);
  }

  function setConnectionStatus(online, text) {
    elements.connectionText.textContent = text;
    elements.connectionText.classList.toggle("is-online", online);
  }

  function setMapLoading(loading) {
    elements.mapLoading.classList.toggle("is-hidden", !loading);
  }

  function apiUrl(endpoint) {
    if (/^https?:\/\//i.test(endpoint)) return endpoint;
    return `${CONFIG.apiBase.replace(/\/$/, "")}/${String(endpoint).replace(/^\//, "")}`;
  }

  function resolveUrl(url) {
    if (/^(https?:|data:|blob:)/i.test(url)) return url;
    if (url.startsWith("/")) {
      const api = new URL(CONFIG.apiBase);
      return `${api.origin}${url}`;
    }
    return apiUrl(url);
  }

  function showToast(message, type = "info") {
    const toast = document.createElement("div");
    toast.className = `toast is-${type}`;
    toast.innerHTML = `<span class="toast-dot"></span><div class="toast-message">${escapeHtml(String(message))}</div>`;
    elements.toastContainer.appendChild(toast);

    window.setTimeout(() => {
      toast.classList.add("is-leaving");
      window.setTimeout(() => toast.remove(), 190);
    }, 2600);
  }

  function createMapViewer(canvas, callbacks = {}) {
    const ctx = canvas.getContext("2d", { alpha: false });
    const state = {
      source: null,
      sourceWidth: 1,
      sourceHeight: 1,
      meta: { ...CONFIG.defaultMapMeta },
      markers: [],
      nextMarkerId: 1,
      selectedMarkerId: null,
      tool: "point",
      zoom: 1,
      panX: 0,
      panY: 0,
      dragging: false,
      dragStartX: 0,
      dragStartY: 0,
      panStartX: 0,
      panStartY: 0,
      dpr: Math.max(1, Math.min(window.devicePixelRatio || 1, 2)),
      cssWidth: 1,
      cssHeight: 1
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas.parentElement);

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("dblclick", (event) => {
      event.preventDefault();
      resetView();
    });

    resize();

    return {
      setMapSource,
      setTool,
      clearMarkers,
      undoMarker,
      resetView,
      getMarkers: () => state.markers.map((marker) => ({ ...marker })),
      getMapMeta: () => ({ ...state.meta }),
      getSourceSize: () => ({ width: state.sourceWidth, height: state.sourceHeight })
    };

    function setMapSource(source, meta = {}) {
      state.source = source;
      state.sourceWidth = Number(source.naturalWidth || source.videoWidth || source.width || 1);
      state.sourceHeight = Number(source.naturalHeight || source.videoHeight || source.height || 1);
      state.meta = { ...CONFIG.defaultMapMeta, ...meta };
      state.markers = [];
      state.nextMarkerId = 1;
      state.selectedMarkerId = null;
      resetView();
      callbacks.onMarkersChange?.([]);
      callbacks.onCoordinateChange?.(null);
    }

    function setTool(tool) {
      state.tool = tool;
      state.dragging = false;
    }

    function clearMarkers() {
      state.markers = [];
      state.selectedMarkerId = null;
      draw();
      callbacks.onMarkersChange?.([]);
    }

    function undoMarker() {
      if (!state.markers.length) return null;
      state.markers.pop();
      const marker = state.markers[state.markers.length - 1] || null;
      state.selectedMarkerId = marker?.id ?? null;
      draw();
      callbacks.onMarkersChange?.(state.markers.map((item) => ({ ...item })));
      callbacks.onCoordinateChange?.(marker ? { ...marker } : null);
      return marker ? { ...marker } : null;
    }

    function resetView() {
      state.zoom = 1;
      state.panX = 0;
      state.panY = 0;
      callbacks.onZoomChange?.(state.zoom);
      draw();
    }

    function resize() {
      const rect = canvas.parentElement.getBoundingClientRect();
      state.cssWidth = Math.max(1, Math.floor(rect.width));
      state.cssHeight = Math.max(1, Math.floor(rect.height));
      canvas.width = Math.floor(state.cssWidth * state.dpr);
      canvas.height = Math.floor(state.cssHeight * state.dpr);
      canvas.style.width = `${state.cssWidth}px`;
      canvas.style.height = `${state.cssHeight}px`;
      draw();
    }

    function draw() {
      const w = state.cssWidth;
      const h = state.cssHeight;
      ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const background = ctx.createLinearGradient(0, 0, 0, h);
      background.addColorStop(0, "#031126");
      background.addColorStop(1, "#010b1b");
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, w, h);
      drawGrid(w, h);

      if (!state.source) {
        drawEmptyState(w, h);
        return;
      }

      const rect = getMapRect();
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.shadowColor = "rgba(0, 167, 255, 0.26)";
      ctx.shadowBlur = 13;
      ctx.drawImage(state.source, rect.x, rect.y, rect.width, rect.height);
      ctx.restore();

      ctx.save();
      ctx.strokeStyle = "rgba(0, 194, 255, 0.18)";
      ctx.lineWidth = 1;
      ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
      ctx.restore();

      state.markers.forEach((marker, index) => drawMarker(marker, index, rect));
    }

    function drawGrid(w, h) {
      const minor = 32;
      const major = minor * 4;
      const offsetX = modulo(state.panX, minor);
      const offsetY = modulo(state.panY, minor);

      ctx.save();
      ctx.lineWidth = 1;
      for (let x = offsetX; x < w; x += minor) {
        const isMajor = Math.abs(modulo(x - offsetX, major)) < 0.5;
        ctx.strokeStyle = isMajor ? "rgba(0, 99, 184, 0.22)" : "rgba(0, 104, 196, 0.10)";
        ctx.beginPath();
        ctx.moveTo(Math.round(x) + 0.5, 0);
        ctx.lineTo(Math.round(x) + 0.5, h);
        ctx.stroke();
      }
      for (let y = offsetY; y < h; y += minor) {
        const isMajor = Math.abs(modulo(y - offsetY, major)) < 0.5;
        ctx.strokeStyle = isMajor ? "rgba(0, 99, 184, 0.22)" : "rgba(0, 104, 196, 0.10)";
        ctx.beginPath();
        ctx.moveTo(0, Math.round(y) + 0.5);
        ctx.lineTo(w, Math.round(y) + 0.5);
        ctx.stroke();
      }
      ctx.restore();
    }

    function drawEmptyState(w, h) {
      ctx.save();
      ctx.fillStyle = "rgba(126, 183, 214, 0.65)";
      ctx.font = "15px Microsoft YaHei, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("请选择导航地图", w / 2, h / 2);
      ctx.restore();
    }

    function drawMarker(marker, index, rect) {
      const x = rect.x + marker.x * rect.width;
      const y = rect.y + marker.y * rect.height;
      const selected = marker.id === state.selectedMarkerId;

      ctx.save();
      ctx.translate(x, y);
      ctx.shadowColor = selected ? "rgba(255, 255, 255, 0.9)" : "rgba(0, 226, 255, 0.9)";
      ctx.shadowBlur = selected ? 16 : 12;

      ctx.strokeStyle = selected ? "#ffffff" : "#00e2ff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 15, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = "rgba(0, 226, 255, 0.42)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, 25, 0, Math.PI * 2);
      ctx.stroke();

      const gradient = ctx.createRadialGradient(-2, -2, 1, 0, 0, 10);
      gradient.addColorStop(0, "#ffffff");
      gradient.addColorStop(0.32, "#56efff");
      gradient.addColorStop(1, "#007fff");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(0, 0, 8, 0, Math.PI * 2);
      ctx.fill();

      ctx.shadowBlur = 4;
      ctx.font = "700 12px Microsoft YaHei, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#02101f";
      ctx.fillText(String(index + 1), 0, 0.5);
      ctx.restore();
    }

    function getMapRect() {
      const paddingX = 44;
      const paddingY = 40;
      const availableW = Math.max(1, state.cssWidth - paddingX * 2);
      const availableH = Math.max(1, state.cssHeight - paddingY * 2);
      const fitScale = Math.min(availableW / state.sourceWidth, availableH / state.sourceHeight);
      const width = state.sourceWidth * fitScale * state.zoom;
      const height = state.sourceHeight * fitScale * state.zoom;
      return {
        x: (state.cssWidth - width) / 2 + state.panX,
        y: (state.cssHeight - height) / 2 + state.panY,
        width,
        height
      };
    }

    function onPointerDown(event) {
      if (!state.source) return;
      const point = eventPoint(event);

      if (state.tool === "pan") {
        state.dragging = true;
        state.dragStartX = point.x;
        state.dragStartY = point.y;
        state.panStartX = state.panX;
        state.panStartY = state.panY;
        canvas.setPointerCapture(event.pointerId);
        return;
      }

      if (state.tool === "select") {
        const marker = findNearestMarker(point.x, point.y);
        state.selectedMarkerId = marker?.id ?? null;
        draw();
        callbacks.onCoordinateChange?.(marker ? { ...marker } : null);
        return;
      }

      if (state.tool === "point") {
        const relative = screenToRelative(point.x, point.y);
        if (!relative) return;

        const marker = {
          id: state.nextMarkerId++,
          x: clamp(relative.x, 0, 1),
          y: clamp(relative.y, 0, 1)
        };
        state.markers.push(marker);
        state.selectedMarkerId = marker.id;
        draw();
        callbacks.onCoordinateChange?.({ ...marker });
        callbacks.onMarkersChange?.(state.markers.map((item) => ({ ...item })));
      }
    }

    function onPointerMove(event) {
      if (!state.dragging || state.tool !== "pan") return;
      const point = eventPoint(event);
      state.panX = state.panStartX + (point.x - state.dragStartX);
      state.panY = state.panStartY + (point.y - state.dragStartY);
      draw();
    }

    function onPointerUp(event) {
      if (state.dragging) {
        state.dragging = false;
        if (canvas.hasPointerCapture(event.pointerId)) {
          canvas.releasePointerCapture(event.pointerId);
        }
      }
    }

    function onWheel(event) {
      if (!state.source) return;
      event.preventDefault();

      const point = eventPoint(event);
      const rectBefore = getMapRect();
      const relative = {
        x: (point.x - rectBefore.x) / rectBefore.width,
        y: (point.y - rectBefore.y) / rectBefore.height
      };

      const factor = Math.exp(-event.deltaY * 0.0012);
      const previousZoom = state.zoom;
      state.zoom = clamp(state.zoom * factor, 0.35, 6);

      if (Math.abs(state.zoom - previousZoom) < 0.0001) return;

      const rectAfter = getMapRect();
      const targetX = rectAfter.x + relative.x * rectAfter.width;
      const targetY = rectAfter.y + relative.y * rectAfter.height;
      state.panX += point.x - targetX;
      state.panY += point.y - targetY;

      callbacks.onZoomChange?.(state.zoom);
      draw();
    }

    function findNearestMarker(screenX, screenY) {
      const rect = getMapRect();
      let nearest = null;
      let nearestDistance = 24;

      state.markers.forEach((marker) => {
        const markerX = rect.x + marker.x * rect.width;
        const markerY = rect.y + marker.y * rect.height;
        const distance = Math.hypot(screenX - markerX, screenY - markerY);
        if (distance < nearestDistance) {
          nearest = marker;
          nearestDistance = distance;
        }
      });
      return nearest;
    }

    function screenToRelative(screenX, screenY) {
      const rect = getMapRect();
      const x = (screenX - rect.x) / rect.width;
      const y = (screenY - rect.y) / rect.height;
      if (x < 0 || x > 1 || y < 0 || y > 1) return null;
      return { x, y };
    }

    function eventPoint(event) {
      const rect = canvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }
  }

  function isPgmBuffer(buffer) {
    const bytes = new Uint8Array(buffer, 0, Math.min(2, buffer.byteLength));
    return bytes.length >= 2 && bytes[0] === 0x50 && (bytes[1] === 0x32 || bytes[1] === 0x35);
  }

  function parsePgm(buffer) {
    const bytes = new Uint8Array(buffer);
    let position = 0;

    const isWhitespace = (value) => value === 9 || value === 10 || value === 13 || value === 32;

    function skipWhitespaceAndComments() {
      while (position < bytes.length) {
        while (position < bytes.length && isWhitespace(bytes[position])) position += 1;
        if (bytes[position] === 35) {
          while (position < bytes.length && bytes[position] !== 10 && bytes[position] !== 13) position += 1;
          continue;
        }
        break;
      }
    }

    function readToken() {
      skipWhitespaceAndComments();
      const start = position;
      while (position < bytes.length && !isWhitespace(bytes[position]) && bytes[position] !== 35) position += 1;
      if (start === position) throw new Error("PGM 文件头格式无效");
      return new TextDecoder("ascii").decode(bytes.subarray(start, position));
    }

    const magic = readToken();
    if (magic !== "P2" && magic !== "P5") {
      throw new Error(`不支持的 PGM 类型：${magic}`);
    }

    const width = Number(readToken());
    const height = Number(readToken());
    const maxValue = Number(readToken());
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || !maxValue) {
      throw new Error("PGM 尺寸或最大灰度值无效");
    }

    const rgba = new Uint8ClampedArray(width * height * 4);
    const pixelCount = width * height;

    if (magic === "P2") {
      for (let i = 0; i < pixelCount; i += 1) {
        const value = Number(readToken());
        writeGrayPixel(rgba, i, Math.round((value / maxValue) * 255));
      }
    } else {
      // P5 在 maxValue 后必须至少有一个空白分隔符。这里只消费分隔符，
      // 不继续跳过任意空白，避免把值为 9/10/13/32 的首个像素误当成文件头。
      if (position >= bytes.length || !isWhitespace(bytes[position])) {
        throw new Error("PGM 文件头与二进制像素数据之间缺少分隔符");
      }
      if (bytes[position] === 13 && bytes[position + 1] === 10) {
        position += 2;
      } else {
        position += 1;
      }
      const bytesPerSample = maxValue < 256 ? 1 : 2;
      const required = pixelCount * bytesPerSample;
      if (position + required > bytes.length) {
        throw new Error("PGM 像素数据不完整");
      }

      for (let i = 0; i < pixelCount; i += 1) {
        let value;
        if (bytesPerSample === 1) {
          value = bytes[position++];
        } else {
          value = (bytes[position] << 8) | bytes[position + 1];
          position += 2;
        }
        writeGrayPixel(rgba, i, Math.round((value / maxValue) * 255));
      }
    }

    const offscreen = document.createElement("canvas");
    offscreen.width = width;
    offscreen.height = height;
    const offscreenContext = offscreen.getContext("2d");
    offscreenContext.putImageData(new ImageData(rgba, width, height), 0, 0);
    return offscreen;
  }

  function writeGrayPixel(rgba, index, gray) {
    const offset = index * 4;
    rgba[offset] = gray;
    rgba[offset + 1] = gray;
    rgba[offset + 2] = gray;
    rgba[offset + 3] = 255;
  }

  function blobToImage(blob) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("地图图像解码失败"));
      };
      image.src = url;
    });
  }

  function loadImageElement(url) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.decoding = "async";
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`图像加载失败：${url}`));
      image.src = url;
    });
  }

  async function safeReadJson(response) {
    const text = await response.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return { message: text };
    }
  }

  async function safeReadError(response) {
    const result = await safeReadJson(response);
    return result?.message ?? result?.error ?? null;
  }

  function numberOrUndefined(value) {
    if (value === null || value === undefined || value === "") return undefined;
    const number = Number(value);
    return Number.isFinite(number) ? number : undefined;
  }

  function numberOrDefault(value, fallback) {
    const number = numberOrUndefined(value);
    return number === undefined ? fallback : number;
  }

  function formatNumber(value, maxDecimals = 3) {
    return Number(value).toLocaleString("zh-CN", { maximumFractionDigits: maxDecimals });
  }

  function round(value, decimals = 2) {
    const factor = 10 ** decimals;
    return Math.round((value + Number.EPSILON) * factor) / factor;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function modulo(value, divisor) {
    return ((value % divisor) + divisor) % divisor;
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
})();
