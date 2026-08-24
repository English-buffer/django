/**
 * 后端连接配置。
 * 开发预览时保持 mockMode: true；接入真实后端时改为 false。
 */
window.APP_CONFIG = {
  mockMode: true,
  apiBase: "http://127.0.0.1:5000/api",
  websocketUrl: "ws://127.0.0.1:5000/ws/video",
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
