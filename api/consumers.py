import json
import cv2
from channels.generic.websocket import AsyncWebsocketConsumer

class VideoStreamConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        await self.accept()
        self.cap = cv2.VideoCapture(0)

    async def disconnect(self, close_code):
        if hasattr(self, "cap") and self.cap.isOpened():
            self.cap.release()

    async def receive(self, text_data=None, bytes_data=None):
        if text_data:
            payload = json.loads(text_data)
            if payload.get("type") == "frame_request":
                ret, frame = self.cap.read()
                if ret:
                    success, buffer = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY),70])
                    if success:
                        jpeg_bytes = buffer.tobytes()
                        await self.send(bytes_data=jpeg_bytes)
