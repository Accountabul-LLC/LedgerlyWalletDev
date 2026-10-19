import select, socket, socketserver, urllib.parse

class Bridge(socketserver.BaseRequestHandler):
    def handle(self):
        header = b''
        while b'\r\n\r\n' not in header:
            piece = self.request.recv(65536)
            if not piece or len(header) > 65536:
                return
            header += piece
        line, rest = header.split(b'\r\n', 1)
        parts = line.decode('ascii').split(' ')
        url = urllib.parse.urlsplit(parts[1])
        # Only the already-authorized workspace Metro service uses this local
        # route. Every external destination stays behind the session sidecar.
        local = url.scheme == 'http' and url.hostname == '127.0.0.1' and url.port == 8083
        destination = ('127.0.0.1', 8083) if local else ('proxy', 8080)
        if local:
            path = url.path or '/'
            if url.query:
                path += '?' + url.query
            header = f'{parts[0]} {path} {parts[2]}\r\n'.encode() + rest
        with socket.create_connection(destination, timeout=30) as remote:
            remote.sendall(header)
            sockets = [self.request, remote]
            while True:
                ready, _, _ = select.select(sockets, [], [], 60)
                if not ready:
                    return
                for current in ready:
                    data = current.recv(65536)
                    if not data:
                        return
                    (remote if current is self.request else self.request).sendall(data)

class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True

with Server(('127.0.0.1', 8788), Bridge) as server:
    server.serve_forever()
