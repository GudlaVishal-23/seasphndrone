import jsQR from 'jsqr';

export interface QRDecodeResult {
  text: string;
  twoDigits: string | null;
  isValidTwoDigit: boolean;
  engine: 'zxing-wasm' | 'jsQR';
  latencyMs: number;
  points?: any;
}

// Lazy-loaded zxing-wasm reader to prevent blocking startup
let zxingReader: any = null;
let zxingLoadPromise: Promise<any> | null = null;

async function getZxingReader() {
  if (zxingReader) return zxingReader;
  if (!zxingLoadPromise) {
    zxingLoadPromise = import('zxing-wasm')
      .then((mod) => {
        zxingReader = mod.readBarcodesFromImageData;
        return zxingReader;
      })
      .catch((err) => {
        console.warn('⚠️ [QR ENGINE] zxing-wasm lazy load fallback to jsQR:', err);
        return null;
      });
  }
  return zxingLoadPromise;
}

// Pre-initialize zxing in background
if (typeof window !== 'undefined') {
  getZxingReader();
}

/**
 * Validates strictly against competition requirements:
 * Competition lock requires exactly 2 digits (regex ^\d{2}$)
 */
export function extractTwoDigits(text: string): { twoDigits: string | null; isValid: boolean } {
  if (!text) return { twoDigits: null, isValid: false };
  const trimmed = text.trim();

  // Strict 2-digit exact match
  if (/^\d{2}$/.test(trimmed)) {
    return { twoDigits: trimmed, isValid: true };
  }

  // Fallback: bounded 2-digit match in larger string (e.g., "TARGET-48" or "ID: 48")
  const match = trimmed.match(/(?:^|\D)(\d{2})(?:\D|$)/);
  if (match) {
    return { twoDigits: match[1], isValid: true };
  }

  return { twoDigits: null, isValid: false };
}

/**
 * High-performance Dual-Engine QR Decoder:
 * 1. Primary: zxing-wasm (C++ SIMD WebAssembly - handles motion blur, rotation, tilt, inversion)
 * 2. Secondary: jsQR (pure JS fallback)
 */
export async function decodeQRFromImageData(imageData: ImageData): Promise<QRDecodeResult | null> {
  const t0 = performance.now();

  // 1. Primary Engine: zxing-wasm
  try {
    const reader = await getZxingReader();
    if (reader) {
      const results = await reader(imageData, {
        formats: ['QRCode'],
        tryHarder: true,
        tryRotate: true,
        tryInvert: true,
        tryDownscale: true
      });

      if (results && results.length > 0 && results[0].text) {
        const text = results[0].text.trim();
        const { twoDigits, isValid } = extractTwoDigits(text);
        return {
          text,
          twoDigits,
          isValidTwoDigit: isValid,
          engine: 'zxing-wasm',
          latencyMs: +(performance.now() - t0).toFixed(1),
          points: results[0].position
        };
      }
    }
  } catch (err) {
    // Graceful fallback to jsQR
  }

  // 2. Secondary Engine: jsQR
  try {
    const qr = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'attemptBoth'
    });

    if (qr && qr.data && qr.data.trim()) {
      const text = qr.data.trim();
      const { twoDigits, isValid } = extractTwoDigits(text);
      return {
        text,
        twoDigits,
        isValidTwoDigit: isValid,
        engine: 'jsQR',
        latencyMs: +(performance.now() - t0).toFixed(1),
        points: qr.location
      };
    }
  } catch {
    // Neither engine found valid QR in this frame
  }

  return null;
}
