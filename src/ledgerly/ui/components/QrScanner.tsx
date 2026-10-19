import { useEffect, useRef, useState } from 'react';
import { Decoder, Detector, binarize, grayscale } from '@nuintun/qrcode';
import { isValidAddress } from '@ledgerly/core/shared';
import { Button, Callout } from './primitives';

export interface ScannedPayment {
  readonly address: string;
  readonly destinationTag?: string;
  readonly amount?: string;
}

/**
 * Accepts either a bare classic/X address or an `xrpl:`/`ripple:` payment URI.
 * Anything that is not a real address is rejected so a stray code cannot drop a
 * bogus recipient into the form.
 */
export function parseScannedAddress(raw: string): ScannedPayment | null {
  const text = raw.trim();
  if (!text) return null;

  if (isValidAddress(text)) return { address: text };

  const match = /^(?:xrpl|ripple|xrp):\/{0,2}([^?\s]+)(\?.*)?$/i.exec(text);
  if (!match) return null;

  const address = decodeURIComponent(match[1] ?? '');
  if (!isValidAddress(address)) return null;

  const params = new URLSearchParams((match[2] ?? '').replace(/^\?/, ''));
  const tag = params.get('dt') ?? params.get('destinationTag') ?? params.get('tag');
  const amount = params.get('amount') ?? params.get('value');

  return {
    address,
    ...(tag && /^[0-9]+$/.test(tag) ? { destinationTag: tag } : {}),
    ...(amount && /^[0-9.]+$/.test(amount) ? { amount } : {}),
  };
}

/**
 * Camera QR reader. Frames are pulled off a hidden canvas and decoded in the
 * page: nothing is uploaded anywhere, and the camera track is stopped the
 * moment the scanner closes.
 */
export function QrScanner({
  onResult,
  onCancel,
}: {
  onResult: (result: ScannedPayment) => void;
  onCancel: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  // Nothing touches the camera until the person asks for it.
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    if (!allowed) return;
    let stream: MediaStream | null = null;
    let frame = 0;
    let stopped = false;

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const decoder = new Decoder();
    const detector = new Detector();

    const scan = () => {
      if (stopped) return;
      frame = requestAnimationFrame(scan);
      const video = videoRef.current;
      if (!video || !context || video.readyState < 2) return;

      const width = Math.min(video.videoWidth, 640);
      if (width === 0) return;
      const height = Math.round((video.videoHeight / video.videoWidth) * width);
      canvas.width = width;
      canvas.height = height;
      context.drawImage(video, 0, 0, width, height);

      try {
        const image = context.getImageData(0, 0, width, height);
        const matrix = binarize(grayscale(image), width, height);
        const candidates = detector.detect(matrix);
        let step = candidates.next();
        while (!step.done) {
          try {
            const parsed = parseScannedAddress(decoder.decode(step.value.matrix).content);
            if (parsed) {
              stopped = true;
              onResult(parsed);
              return;
            }
          } catch {
            /* one unreadable candidate, keep looking */
          }
          step = candidates.next(true);
        }
      } catch {
        /* a dropped frame is not worth reporting */
      }
    };

    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: 'environment' } })
      .then((granted) => {
        if (stopped) {
          granted.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = granted;
        const video = videoRef.current;
        if (video) {
          video.srcObject = granted;
          void video.play().catch(() => undefined);
        }
        frame = requestAnimationFrame(scan);
      })
      .catch(() => {
        setError(
          'The camera is not available. Check that this site has camera permission, or paste the address instead.',
        );
      });

    if (!navigator.mediaDevices) {
      setError('This browser cannot open the camera here. Paste the address instead.');
    }

    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [allowed, onResult]);

  return (
    <div className="qr-scanner">
      {error ? <Callout tone="caution">{error}</Callout> : null}

      {!error && !allowed ? (
        <>
          <p className="inline-note">
            Ledgerly needs your camera to read the code. The picture is read on this device only,
            nothing is uploaded, and the camera stops the moment you close the scanner.
          </p>
          <Button variant="accent" block onClick={() => setAllowed(true)}>
            Allow camera and scan
          </Button>
        </>
      ) : null}

      {!error && allowed ? (
        <>
          <div className="qr-scanner-frame">
            <video ref={videoRef} playsInline muted aria-label="Camera preview" />
            <span className="qr-scanner-reticle" />
          </div>
          <p className="inline-note">Hold the recipient's QR code inside the frame.</p>
        </>
      ) : null}

      <Button variant="secondary" block onClick={onCancel}>
        {allowed ? 'Cancel scan' : 'Back'}
      </Button>
    </div>
  );
}
