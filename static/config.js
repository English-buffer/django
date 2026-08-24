/**
 * 后端连接配置。
 * 默认连接当前页面同源的 Django HTTP 与 WebSocket 服务。
 */
const websocketProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";

window.APP_CONFIG = {
  mockMode: false,
  apiBase: `${window.location.origin}/api`,
  websocketUrl: `${websocketProtocol}//${window.location.host}/ws/video`,
  frameRequestIntervalMs: 100,
  websocketRequestsFrames: true,
  reconnectDelayMs: 2000,

  endpoints: {
    mapList: "/maps",
    mapImage: (mapName) => `/maps/${encodeURIComponent(mapName)}/image`,
    mappingStart: "/mapping/start",
    mapSave: "/maps/save",
    navigationStart: "/navigation/start"
  },

  // ROS 栅格地图通常以左下角为世界坐标原点，而浏览器图像以左上角为原点。
  invertYForWorldCoordinate: true,

  // 后端未返回地图元数据时采用这些默认值。
  defaultMapMeta: {
    resolution: 0.05,
    originX: 0,
    originY: 0
  }
};
