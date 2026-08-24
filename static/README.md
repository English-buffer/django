# 智能车上位机前端

这是根据界面效果图编写的纯前端实现，使用原生 **HTML + CSS + JavaScript**，无需安装前端框架即可运行。

## 已实现功能

- 左侧从后端获取 PGM 地图名称列表并进行选择。
- 中间加载所选地图，支持：
  - P2 / P5 两种 PGM 文件解析；
  - PNG、JPEG、WebP 和 Base64 图像；
  - 单击添加导航点；
  - 获取百分比相对坐标；
  - 滚轮缩放、拖动、选择、撤销、清空和复位；
  - **初始状态不显示任何默认标点**。
- 右侧通过 WebSocket 获取摄像头帧，可按 100 ms 周期请求一帧。
- “建图开始”“保存地图”“启动导航”三个按钮向后端发送 POST 请求。
- 默认包含模拟模式，未连接后端也可直接查看和操作界面。

## 运行方式

不要直接双击 `index.html`。建议在项目目录启动一个静态服务器：

```bash
cd smart_vehicle_frontend
python -m http.server 8080
```

浏览器打开：

```text
http://127.0.0.1:8080
```

## 接入真实后端

编辑 `config.js`：

```js
window.APP_CONFIG = {
  mockMode: false,
  apiBase: "http://127.0.0.1:5000/api",
  websocketUrl: "ws://127.0.0.1:5000/ws/video",
  frameRequestIntervalMs: 100
};
```

### 1. 地图列表接口

```http
GET /api/maps
```

支持以下返回格式之一：

```json
["name1", "name2", "name3"]
```

或：

```json
{
  "maps": [
    {
      "name": "name1",
      "image_url": "/api/maps/name1/image",
      "resolution": 0.05,
      "origin": [0, 0]
    }
  ]
}
```

### 2. 地图图像接口

```http
GET /api/maps/{mapName}/image
```

可直接返回：

- `image/x-portable-graymap`：P2/P5 PGM；
- `image/png`；
- `image/jpeg`；
- JSON，例如：

```json
{
  "image": "base64图像数据",
  "mime_type": "image/png",
  "resolution": 0.05,
  "origin": [0, 0]
}
```

也可以通过响应头返回地图元数据：

```text
X-Map-Resolution: 0.05
X-Map-Origin-X: 0
X-Map-Origin-Y: 0
```

### 3. 视频 WebSocket

默认地址：

```text
ws://127.0.0.1:5000/ws/video
```

连接建立后，前端每 100 ms 发送：

```json
{
  "type": "frame_request",
  "timestamp": 1720000000000
}
```

后端可返回：

- JPEG/PNG 二进制帧；
- Base64 Data URL；
- JSON：

```json
{
  "image": "base64图像数据",
  "mime_type": "image/jpeg",
  "width": 1280,
  "height": 720
}
```

后端若主动以 10 FPS 推送，不需要前端请求帧，可在 `config.js` 中设置：

```js
websocketRequestsFrames: false
```

### 4. 功能按钮接口

```http
POST /api/mapping/start
POST /api/maps/save
POST /api/navigation/start
Content-Type: application/json
```

启动导航时提交的核心数据示例：

```json
{
  "map_name": "name1",
  "goal": {
    "relative_x": 0.501,
    "relative_y": 0.5,
    "percentage_x": 50.1,
    "percentage_y": 50,
    "pixel_x": 533.06,
    "pixel_y": 420,
    "map_x_m": 26.653,
    "map_y_m": 21
  },
  "waypoints": []
}
```

浏览器坐标以左上角为原点，`relative_y` 向下增大。默认计算 ROS 世界坐标时会把 Y 轴翻转；可在 `config.js` 中修改 `invertYForWorldCoordinate`。

## 文件结构

```text
smart_vehicle_frontend/
├── index.html
├── styles.css
├── config.js
├── app.js
├── README.md
└── assets/
    ├── demo-camera.jpg
    └── demo-map.png
```
