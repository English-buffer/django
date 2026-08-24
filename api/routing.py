from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
    # ? 代表前面的/可选；同时匹配 ws/video 和 ws/video/
    re_path(r"ws/video/?$", consumers.VideoStreamConsumer.as_asgi()),
]