import { useMemo } from 'react';
import { Byte, Encoder } from '@nuintun/qrcode';

/**
 * Renders the QR as inline SVG built from the encoder's bit matrix.
 *
 * SVG rather than a raster data URL: it stays sharp at any size, and it avoids
 * relaxing the extension's `img-src` policy to permit `data:` URLs.
 */
export function QrCode({ value, size = 168 }: { value: string; size?: number }) {
  const { path, modules } = useMemo(() => buildPath(value), [value]);

  return (
    <svg
      className="qr"
      style={{ width: size, height: size }}
      viewBox={`0 0 ${modules} ${modules}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label="QR code for this address"
    >
      <rect width={modules} height={modules} fill="#fff" />
      <path d={path} fill="#171a18" />
    </svg>
  );
}

function buildPath(value: string): { path: string; modules: number } {
  // Level M tolerates roughly 15% damage, which is ample for an on-screen code.
  const encoded = new Encoder({ level: 'M' }).encode(new Byte(value));
  const modules = encoded.size;

  const segments: string[] = [];
  for (let y = 0; y < modules; y += 1) {
    let runStart: number | null = null;
    for (let x = 0; x <= modules; x += 1) {
      const filled = x < modules && encoded.get(x, y) === 1;
      if (filled && runStart === null) {
        runStart = x;
      } else if (!filled && runStart !== null) {
        segments.push(`M${runStart} ${y}h${x - runStart}v1h-${x - runStart}z`);
        runStart = null;
      }
    }
  }

  return { path: segments.join(''), modules };
}
