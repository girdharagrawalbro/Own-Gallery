import React, { useEffect, useState } from 'react';
import ShareMenu, { SharedItem } from 'react-native-share-menu';
import { Asset } from 'react-native-image-picker';
import UploadPreviewModal from '../screens/Gallery/UploadPreviewModal';

const ShareReceiver = () => {
    const [uploadAssets, setUploadAssets] = useState<Asset[]>([]);
    const [modalVisible, setModalVisible] = useState(false);

    const handleShare = (share: SharedItem | null | undefined) => {
        if (!share) return;
        
        const { mimeType, data } = share;
        
        let files: any[] = [];
        if (Array.isArray(data)) {
            files = data; 
        } else if (typeof data === 'string') {
            files = [data]; 
        } else if (data) {
            files = [data]; // object format from some newer share-menu versions
        }

        if (files.length > 0) {
            const assets: Asset[] = files.map(fileItem => {
                // if it's an object, it might have .data and .mimeType inside the array
                const uri = typeof fileItem === 'string' ? fileItem : fileItem.data;
                const type = typeof fileItem === 'string' ? mimeType : fileItem.mimeType;
                
                // Decode URI to handle spaces and special chars, removing any file:// prefix first if we need the pure path, but for FormData uri we usually keep file://
                return {
                    uri: uri,
                    fileName: uri.split('/').pop() || 'shared_file',
                    type: type || 'application/octet-stream',
                };
            });
            setUploadAssets(assets);
            setModalVisible(true);
        }
    };

    useEffect(() => {
        ShareMenu.getInitialShare(handleShare);
        const listener = ShareMenu.addNewShareListener(handleShare);

        return () => {
            listener.remove();
        };
    }, []);

    return (
        <UploadPreviewModal
            visible={modalVisible}
            assets={uploadAssets}
            onClose={() => setModalVisible(false)}
            onUploadComplete={() => {
                setModalVisible(false);
            }}
        />
    );
};

export default ShareReceiver;
