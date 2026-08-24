# 智能车 Django 服务

## 本地运行

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python manage.py migrate
python manage.py runserver 127.0.0.1:8000
```

浏览器访问 <http://127.0.0.1:8000/>。地图列表接口为
<http://127.0.0.1:8000/api/maps>。

前端默认使用当前页面的主机与端口访问 Django，不再使用模拟地图。默认地图目录是
`api/templates/map`；如需使用其他目录，可在启动服务前设置 `MAP_FOLDER` 环境变量。
