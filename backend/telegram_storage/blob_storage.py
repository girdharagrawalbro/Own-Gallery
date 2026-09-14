import base64
import os
import threading

from azure.storage.blob import BlobBlock, BlobServiceClient

_client_lock = threading.Lock()
_service_clients = {}


def block_id(index):
    # Block ids must be base64 and all the same length within a blob.
    return base64.b64encode(f"{index:08d}".encode()).decode()


class BlobStorageService:

    def __init__(self):
        account_name = os.getenv("AZURE_STORAGE_ACCOUNT_NAME")
        account_key = os.getenv("AZURE_STORAGE_ACCOUNT_KEY")
        container_name = os.getenv(
            "AZURE_STORAGE_CONTAINER",
            "temp-uploads",
        )

        if not account_name or not account_key:
            raise ValueError("Azure Storage credentials are not configured")

        connection_string = (
            "DefaultEndpointsProtocol=https;"
            f"AccountName={account_name};"
            f"AccountKey={account_key};"
            "EndpointSuffix=core.windows.net"
        )

        # Reuse the client (and its connection pool) across requests.
        with _client_lock:
            key = (connection_string, os.getpid())
            if key not in _service_clients:
                _service_clients[key] = BlobServiceClient.from_connection_string(connection_string)
            self.client = _service_clients[key]

        self.container = self.client.get_container_client(container_name)

    def upload_file(self, file_path, blob_name):
        with open(file_path, "rb") as file:
            self.upload_stream(file, blob_name, os.path.getsize(file_path))
        return blob_name

    def upload_stream(self, stream, blob_name, length):
        blob = self.container.get_blob_client(blob_name)
        blob.upload_blob(stream, length=length, overwrite=True, max_concurrency=4)
        return blob_name

    def download_file(self, blob_name, destination):
        """Stream a blob to disk without holding it in memory."""
        blob = self.container.get_blob_client(blob_name)
        with open(destination, "wb") as file:
            blob.download_blob(max_concurrency=4).readinto(file)
        return destination

    def size(self, blob_name):
        return self.container.get_blob_client(blob_name).get_blob_properties().size

    def iter_range(self, blob_name, start, end):
        blob = self.container.get_blob_client(blob_name)
        downloader = blob.download_blob(offset=start, length=end - start + 1)
        yield from downloader.chunks()

    def read_head(self, blob_name, length=8192):
        blob = self.container.get_blob_client(blob_name)
        return blob.download_blob(offset=0, length=length).readall()

    def stage_block(self, blob_name, index, data):
        blob = self.container.get_blob_client(blob_name)
        blob.stage_block(block_id(index), data, length=len(data))

    def commit_blocks(self, blob_name, count):
        blob = self.container.get_blob_client(blob_name)
        blob.commit_block_list([BlobBlock(block_id=block_id(i)) for i in range(count)])

    def delete_file(self, blob_name):
        blob = self.container.get_blob_client(blob_name)
        blob.delete_blob(delete_snapshots="include")
