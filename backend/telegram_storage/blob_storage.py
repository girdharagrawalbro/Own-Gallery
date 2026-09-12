import os

from azure.storage.blob import BlobServiceClient


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

        self.client = BlobServiceClient.from_connection_string(
            connection_string
        )

        self.container = self.client.get_container_client(container_name)

    def upload_file(self, file_path, blob_name):
        blob = self.container.get_blob_client(blob_name)

        with open(file_path, "rb") as file:
            blob.upload_blob(file, overwrite=True)

        return blob_name

    def download_file(self, blob_name, destination):
        blob = self.container.get_blob_client(blob_name)

        with open(destination, "wb") as file:
            file.write(blob.download_blob().readall())

        return destination

    def delete_file(self, blob_name):
        blob = self.container.get_blob_client(blob_name)
        blob.delete_blob(delete_snapshots="include")
