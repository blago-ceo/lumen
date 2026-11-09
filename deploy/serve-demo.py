# Локальный просмотр демо-сборки так же, как на GitHub Pages: http://localhost:5190/lumen/
import http.server, functools, os, shutil, tempfile
root = tempfile.mkdtemp()
dist = os.path.join(os.path.dirname(__file__), '..', 'data', 'demo-dist')
shutil.copytree(dist, os.path.join(root, 'lumen'))
http.server.ThreadingHTTPServer(('127.0.0.1', 5190), functools.partial(http.server.SimpleHTTPRequestHandler, directory=root)).serve_forever()
