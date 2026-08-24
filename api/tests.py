from pathlib import Path
from tempfile import TemporaryDirectory

from django.contrib.staticfiles import finders
from django.test import TestCase, override_settings


class MapApiTests(TestCase):
    def setUp(self):
        self.temporary_directory = TemporaryDirectory()
        self.map_folder = Path(self.temporary_directory.name)
        self.settings_override = override_settings(MAP_FOLDER=self.map_folder)
        self.settings_override.enable()

    def tearDown(self):
        self.settings_override.disable()
        self.temporary_directory.cleanup()

    def test_map_list_returns_unique_sorted_supported_maps(self):
        (self.map_folder / "z-map.pgm").write_bytes(b"P5\n1 1\n255\n\x00")
        (self.map_folder / "a-map.png").write_bytes(b"png")
        (self.map_folder / "a-map.pgm").write_bytes(b"P5\n1 1\n255\n\x00")
        (self.map_folder / "ignored.txt").write_text("ignored", encoding="utf-8")

        response = self.client.get("/api/maps")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"maps": ["a-map", "z-map"]})

    def test_map_list_creates_missing_folder(self):
        missing_folder = self.map_folder / "new-folder"

        with override_settings(MAP_FOLDER=missing_folder):
            response = self.client.get("/api/maps")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"maps": []})
        self.assertTrue(missing_folder.is_dir())

    def test_map_image_returns_pgm_and_metadata_headers(self):
        pgm_content = b"P5\n1 1\n255\n\x00"
        (self.map_folder / "map1.pgm").write_bytes(pgm_content)

        response = self.client.get("/api/maps/map1/image")

        self.assertEqual(response.status_code, 200)
        response_content = b"".join(response.streaming_content)
        response.close()
        self.assertEqual(response_content, pgm_content)
        self.assertEqual(response["Content-Type"], "image/x-portable-graymap")
        self.assertEqual(response["X-Map-Resolution"], "0.05")
        self.assertEqual(response["X-Map-Origin-X"], "0.0")
        self.assertEqual(response["X-Map-Origin-Y"], "0.0")

    def test_missing_map_image_returns_404(self):
        response = self.client.get("/api/maps/missing/image")

        self.assertEqual(response.status_code, 404)

    def test_map_image_rejects_windows_path_separator(self):
        response = self.client.get("/api/maps/..%5Csecret/image")

        self.assertEqual(response.status_code, 400)


class FrontendIntegrationTests(TestCase):
    def test_index_uses_namespaced_static_assets(self):
        response = self.client.get("/")

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "/static/smart_vehicle_frontend/styles.css")
        self.assertContains(response, "/static/smart_vehicle_frontend/config.js")
        self.assertContains(response, "/static/smart_vehicle_frontend/app.js")

    def test_served_configuration_disables_mock_mode_and_uses_page_origin(self):
        config_path = Path(finders.find("smart_vehicle_frontend/config.js"))
        app_path = Path(finders.find("smart_vehicle_frontend/app.js"))

        config_source = config_path.read_text(encoding="utf-8")
        app_source = app_path.read_text(encoding="utf-8")
        self.assertIn("mockMode: false", config_source)
        self.assertIn("window.location.origin", config_source)
        self.assertIn("mockMode: false", app_source)
        self.assertIn("window.location.origin", app_source)
