import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("performance", Path(__file__).resolve().parents[1] / "aws/web-performance.py")
performance = importlib.util.module_from_spec(spec)
spec.loader.exec_module(performance)
SOURCE = "server {\n listen 443 ssl default_server;\n server_name studybridge.ink;\n location / { proxy_buffering off; proxy_pass http://127.0.0.1:3000; }\n}\n"


class PerformanceInstaller(unittest.TestCase):
    def test_only_tls_listeners_change(self):
        source = SOURCE + "server {\n listen 80;\n server_name www.studybridge.ink;\n}\n"
        result = performance.enable_http2(source)
        self.assertEqual(result, source.replace("listen 443 ssl default_server;", "listen 443 ssl default_server http2;"))
        self.assertEqual(performance.enable_http2(result), result)
        self.assertIn("listen [::]:443 ssl http2;", performance.enable_http2("listen [::]:443 ssl;"))

    def test_apply_and_idempotence(self):
        with tempfile.TemporaryDirectory() as directory:
            site = Path(directory) / "studybridge-domain"
            site.write_text(SOURCE)
            calls = []
            def run(args, **kwargs): calls.append(args)
            performance.apply([site], directory, run)
            self.assertIn("http2;", site.read_text())
            self.assertEqual(calls, [["nginx", "-t"], ["nginx", "-t"], ["systemctl", "reload", "nginx"]])
            copies = list(Path(directory).glob("studybridge-http2-*/studybridge-domain"))
            self.assertEqual(copies[0].read_text(), SOURCE)
            calls.clear()
            performance.apply([site], directory, run)
            self.assertEqual(calls, [["nginx", "-t"]])

    def test_validation_and_reload_failure_restore_all_hosts(self):
        for failure in (2, 3):
            with self.subTest(failure=failure), tempfile.TemporaryDirectory() as directory:
                sites = [Path(directory) / name for name in ("studybridge-domain", "studybridge-ip")]
                for site in sites: site.write_text(SOURCE)
                calls = []
                def run(args, **kwargs):
                    calls.append(args)
                    if len(calls) == failure: raise subprocess.CalledProcessError(1, args)
                with self.assertRaises(subprocess.CalledProcessError):
                    performance.apply(sites, directory, run)
                for site in sites: self.assertEqual(site.read_text(), SOURCE)
                self.assertEqual(calls[-2:], [["nginx", "-t"], ["systemctl", "reload", "nginx"]])

    def test_other_hosts_refused_before_any_write(self):
        with tempfile.TemporaryDirectory() as directory:
            site = Path(directory) / "studybridge-domain"
            source = SOURCE.replace("studybridge.ink", "other.example")
            site.write_text(source)
            with self.assertRaises(RuntimeError): performance.apply([site], directory, lambda *a, **kw: None)
            self.assertEqual(site.read_text(), source)


if __name__ == "__main__": unittest.main()
