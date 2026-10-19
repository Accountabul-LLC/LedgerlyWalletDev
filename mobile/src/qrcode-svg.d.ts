declare module 'react-native-qrcode-svg' {
  import type { ComponentType } from 'react';
  const QRCode: ComponentType<{
    value: string;
    size?: number;
    backgroundColor?: string;
    color?: string;
  }>;
  export default QRCode;
}
