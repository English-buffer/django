
#运行命令  python manage.py runserver
#运行命令（非127.0.0.1地址） python manage.py runserver 0.0.0.0:8000

from django.http import HttpResponse, JsonResponse, FileResponse
from django.views.decorators.csrf import csrf_exempt
from django.shortcuts import render
import os
import json

# 模拟本地地图存放路径，你改成自己PGM地图文件夹
MAP_FOLDER = "C:/Users/zmt/Desktop/car/api/templates/map"
@csrf_exempt
# 返回前端页面
def index_view(request):
    return render(request, "smart_vehicle_frontend/index.html")

# GET /api/maps 返回地图列表
def api_map_list(request):
    print("start\n")
    if not os.path.exists(MAP_FOLDER):
        os.makedirs(MAP_FOLDER)
        return JsonResponse({"maps":[]})
    map_names = []
    print("路径存在")
    for f in os.listdir(MAP_FOLDER):
        if f.endswith(".pgm") or f.endswith(".png"):
            name,_ = os.path.splitext(f)
            map_names.append(name)
    return JsonResponse({"maps": map_names})


def api_map_image(request, map_name):
    """GET /api/maps/{map_name}/image"""
    # 查找pgm或者png地图文件
    pgm_path = os.path.join(MAP_FOLDER, f"{map_name}.pgm")
    png_path = os.path.join(MAP_FOLDER, f"{map_name}.png")
    file_path = None
    content_type = None
    if os.path.exists(pgm_path):
        file_path = pgm_path
        content_type = "image/x-portable-graymap"
    elif os.path.exists(png_path):
        file_path = png_path
        content_type = "image/png"
    if not file_path:
        return HttpResponse("map not found", status=404)

    resp = FileResponse(open(file_path, "rb"), content_type=content_type)
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
