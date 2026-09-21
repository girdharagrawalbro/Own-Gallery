import { CameraRoll } from '@react-native-camera-roll/camera-roll';
// Just writing down the types
type PhotoIdentifier = {
  node: {
    type: string;
    group_name: string;
    image: {
      filename: string | null;
      filepath: string | null;
      extension: string | null;
      uri: string;
      height: number;
      width: number;
      fileSize: number | null;
      playableDuration: number;
    };
    timestamp: number;
    location: any;
  };
};
