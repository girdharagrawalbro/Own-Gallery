import base64
import os
import threading
import shutil
from pathlib import Path

from azure.storage.blob import BlobBlock, BlobServiceClient

_client_lock = threading.Lock()
_service_clients = {}

def block_id(index):
    # Block ids must be base64 and all the same length within a blob.
    return base64.b64encode(f"{index:08d}".encode()).decode()

class BlobStorageService:

    def __init__(self):
        self.account_name = os.getenv("AZURE_STORAGE_ACCOUNT_NAME")
        account_key = os.getenv("AZURE_STORAGE_ACCOUNT_KEY")
        self.container_name = os.getenv(
            "AZURE_STORAGE_CONTAINER",
            "temp-uploads",
        )

        if not self.account_name or not account_key:
            self.local_dir = Path(os.getenv("LOCAL_STORAGE_DIR", "media_uploads")) / self.container_name
            self.local_dir.mkdir(parents=True, exist_ok=True)
            return

        connection_string = (
            "DefaultEndpointsProtocol=https;"
            f"AccountName={self.account_name};"
            f"AccountKey={account_key};"
            "EndpointSuffix=core.windows.net"
        )

        with _client_lock:
            key = (connection_string, os.getpid())
            if key not in _service_clients:
                _service_clients[key] = BlobServiceClient.from_connection_string(connection_string)
            self.client = _service_clients[key]

        self.container = self.client.get_container_client(self.container_name)

    def _get_local_path(self, blob_name):
        return self.local_dir / os.path.basename(blob_name)

    def upload_file(self, file_path, blob_name):
        if not self.account_name:
            dest = self._get_local_path(blob_name)
            shutil.copy2(file_path, dest)
            return blob_name
        with open(file_path, "rb") as file:
            self.upload_stream(file, blob_name, os.path.getsize(file_path))
        return blob_name

    def upload_stream(self, stream, blob_name, length):
        if not self.account_name:
            dest = self._get_local_path(blob_name)
            with open(dest, "wb") as f:
                f.write(stream.read(length))
            return blob_name
        blob = self.container.get_blob_client(blob_name)
        blob.upload_blob(stream, length=length, overwrite=True, max_concurrency=4)
        return blob_name

    def download_file(self, blob_name, destination):
        if not self.account_name:
            shutil.copy2(self._get_local_path(blob_name), destination)
            return destination
        blob = self.container.get_blob_client(blob_name)
        with open(destination, "wb") as file:
            blob.download_blob(max_concurrency=4).readinto(file)
        return destination

    def size(self, blob_name):
        if not self.account_name:
            return os.path.getsize(self._get_local_path(blob_name))
        return self.container.get_blob_client(blob_name).get_blob_properties().size

    def iter_range(self, blob_name, start, end):
        if not self.account_name:
            with open(self._get_local_path(blob_name), "rb") as f:
                f.seek(start)
                yield f.read(end - start + 1)
            return
        blob = self.container.get_blob_client(blob_name)
        downloader = blob.download_blob(offset=start, length=end - start + 1)
        yield from downloader.chunks()

    def read_head(self, blob_name, length=8192):
        if not self.account_name:
            with open(self._get_local_path(blob_name), "rb") as f:
                return f.read(length)
        blob = self.container.get_blob_client(blob_name)
        return blob.download_blob(offset=0, length=length).readall()

    def stage_block(self, blob_name, index, data):
        if not self.account_name:
            chunk_dir = self.local_dir / "chunks" / os.path.basename(blob_name)
            chunk_dir.mkdir(parents=True, exist_ok=True)
            with open(chunk_dir / f"{index:08d}.part", "wb") as f:
                f.write(data)
            return
        blob = self.container.get_blob_client(blob_name)
        blob.stage_block(block_id(index), data, length=len(data))

    def commit_blocks(self, blob_name, count):
        if not self.account_name:
            chunk_dir = self.local_dir / "chunks" / os.path.basename(blob_name)
            dest = self._get_local_path(blob_name)
            with open(dest, "wb") as out_f:
                for i in range(count):
                    part_path = chunk_dir / f"{i:08d}.part"
                    with open(part_path, "rb") as in_f:
                        shutil.copyfileobj(in_f, out_f)
            shutil.rmtree(chunk_dir, ignore_errors=True)
            return
        blob = self.container.get_blob_client(blob_name)
        blob.commit_block_list([BlobBlock(block_id=block_id(i)) for i in range(count)])

    def delete_file(self, blob_name):
        if not self.account_name:
            try:
                os.remove(self._get_local_path(blob_name))
            except FileNotFoundError:
                pass
            return
        blob = self.container.get_blob_client(blob_name)
        blob.delete_blob(delete_snapshots="include")
