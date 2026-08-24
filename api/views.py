import json
from pathlib import Path

from django.conf import settings
from django.http import FileResponse, HttpResponse, JsonResponse
from django.shortcuts import render
from django.views.decorators.csrf import csrf_exempt


# 返回前端页面
@csrf_exempt
def index_view(request):
    return render(request, "smart_vehicle_frontend/index.html")

# GET /api/maps 返回地图列表
def api_map_list(request):
    map_folder = Path(settings.MAP_FOLDER)
    map_folder.mkdir(parents=True, exist_ok=True)
    map_names = sorted({
        file_path.stem
        for file_path in map_folder.iterdir()
        if file_path.is_file() and file_path.suffix in {".pgm", ".png"}
    })
    return JsonResponse({"maps": map_names})


def api_map_image(request, map_name):
    """GET /api/maps/{map_name}/image"""
    if map_name in {".", ".."} or "/" in map_name or "\\" in map_name:
        return HttpResponse("invalid map name", status=400)

    # 查找pgm或者png地图文件
    map_folder = Path(settings.MAP_FOLDER)
    pgm_path = map_folder / f"{map_name}.pgm"
    png_path = map_folder / f"{map_name}.png"
    file_path = None
    content_type = None
    if pgm_path.is_file():
        file_path = pgm_path
        content_type = "image/x-portable-graymap"
    elif png_path.is_file():
        file_path = png_path
        content_type = "image/png"
    if not file_path:
        return HttpResponse("map not found", status=404)

    resp = FileResponse(file_path.open("rb"), content_type=content_type)
    # 设置前端需要读取的自定义头！非常关键！
    resp["X-Map-Resolution"] = "0.05"
    resp["X-Map-Origin-X"] = "0.0"
    resp["X-Map-Origin-Y"] = "0.0"
    return resp


@csrf_exempt
def api_mapping_start(request):
    """POST /api/mapping/start 开始建图"""
    if request.method != "POST":
        return JsonResponse({"error":"need post"}, status=400)
    body = json.loads(request.body)
    print("收到建图指令", body)
    # 这里写你调用ROS/底层启动建图逻辑
    return JsonResponse({"message":"建图已启动"})


@csrf_exempt
def api_map_save(request):
    """POST /api/maps/save"""
    if request.method != "POST":
        return JsonResponse({"error":"need post"}, status=400)
    body = json.loads(request.body)
    print("保存地图请求，收到标记点：", body.get("markers"))
    # 这里调用底层保存地图逻辑
    return JsonResponse({"message":"地图保存成功"})


@csrf_exempt
def api_navigation_start(request):
    """POST /api/navigation/start"""
    if request.method != "POST":
        return JsonResponse({"error":"need post"}, status=400)
    body = json.loads(request.body)
    print("启动导航，目标点goal：", body.get("goal"), "路径点waypoints:", body.get("waypoints"))
    # 调用ROS导航逻辑
    return JsonResponse({"message":"导航已启动"})
