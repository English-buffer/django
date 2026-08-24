from django.urls import path
from . import views

urlpatterns = [
    path("maps", views.api_map_list, name="map_list"),
    path("maps/<str:map_name>/image", views.api_map_image, name="map_image"),
    path("mapping/start", views.api_mapping_start, name="mapping_start"),
    path("maps/save", views.api_map_save, name="map_save"),
    path("navigation/start", views.api_navigation_start, name="navigation_start"),
]