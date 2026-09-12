declare module 'react-native-share-menu' {
  export interface SharedItem {
    mimeType: string;
    data: string;
    extraData: any;
  }

  const ShareMenu: {
    getInitialShare: (callback: (item: SharedItem | null) => void) => void;
    addNewShareListener: (callback: (item: SharedItem) => void) => { remove: () => void };
  };

  export default ShareMenu;
}
