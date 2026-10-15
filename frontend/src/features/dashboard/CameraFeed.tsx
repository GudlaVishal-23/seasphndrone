import React, { useState, useEffect, useRef } from 'react';
import {
  ChevronDown,
  Camera,
  Video,
  Scan,
  Maximize,
  Smartphone,
  Settings,
  Wifi,
  WifiOff,
  RefreshCw,
  X,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ZoomIn,
  ZoomOut,
  Sliders,
  Target,
  Lock,
  Unlock,
  Play,
  Pause,
} from 'lucide-react';
import jsQR from 'jsqr';
import { decodeQRFromImageData, extractTwoDigits } from '../../services/qrDecoderService';
import { Card } from '../../ui/Card';
import { visionService } from '../../services/visionService';
import { audioService } from '../../services/audioService';
import { ipCameraService } from '../../services/ipCameraService';
import { boxDetectionService } from '../../services/boxDetectionService';
import { TargetBoxDetection } from '../../types/mission';
import { DashboardTelemetryData, useDashboardTelemetry } from '../../hooks/useDashboardTelemetry';

interface CameraFeedProps {
  className?: string;
  telemetry?: DashboardTelemetryData;
}

const getCardinal = (heading: number): string => {
  const norm = ((heading % 360) + 360) % 360;
  if (norm >= 337.5 || norm < 22.5) return 'N';
  if (norm >= 22.5 && norm < 67.5) return 'NE';
  if (norm >= 67.5 && norm < 112.5) return 'E';
  if (norm >= 112.5 && norm < 157.5) return 'SE';
  if (norm >= 157.5 && norm < 202.5) return 'S';
  if (norm >= 202.5 && norm < 247.5) return 'SW';
  if (norm >= 247.5 && norm < 292.5) return 'W';
  return 'NW';
};

export const CameraFeed: React.FC<CameraFeedProps> = ({ className = '', telemetry: propTelemetry }) => {
  const hookTelemetry = useDashboardTelemetry();
  const telemetry = propTelemetry || hookTelemetry;

  const [resolution, setResolution] = useState('1080P');
  const [fps, setFps] = useState('30 FPS');
  const [showResMenu, setShowResMenu] = useState(false);
  const [showFpsMenu, setShowFpsMenu] = useState(false);
  const [isScanning, setIsScanning] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [detectedQr, setDetectedQr] = useState<string | null>(null);

  // Samsung Galaxy S24 IP Camera State
  const [isIpCamActive, setIsIpCamActive] = useState<boolean>(() => {
    const stored = localStorage.getItem('sae_s24_ip_cam_enabled');
    return stored === null ? true : stored === 'true';
  });
  const [ipCamAddress, setIpCamAddress] = useState<string>(() => {
    const stored = localStorage.getItem('sae_s24_ip_cam_address');
    if (stored && stored.includes(':8080') && stored !== '192.168.43.1:8080') return stored;
    return '192.168.11.208:8080';
  });
  const [ipCamMode, setIpCamMode] = useState<'mjpeg' | 'snapshot'>(() => {
    return (localStorage.getItem('sae_s24_ip_cam_mode') as 'mjpeg' | 'snapshot') || 'mjpeg';
  });
  const [ipCamStatus, setIpCamStatus] = useState<'connected' | 'connecting' | 'error' | 'idle'>(() => {
    const stored = localStorage.getItem('sae_s24_ip_cam_enabled');
    return stored === 'false' ? 'idle' : 'connecting';
  });
  const [showIpCamConfig, setShowIpCamConfig] = useState<boolean>(false);
  const [tempIpCamAddress, setTempIpCamAddress] = useState<string>(ipCamAddress);
  const [streamReloadKey, setStreamReloadKey] = useState<number>(0);
  const [useCors, setUseCors] = useState<boolean>(true);

  // --- FULLY AUTONOMOUS QR AUTO-ZOOM ENGINE (Auto-Zoom In on QR Seen, Auto-Zoom Out on Done/Lost) ---
  // ZERO MANUAL CLICKS NEEDED TO ZOOM IN OR ZOOM OUT!
  // Triggered STRICTLY by actual QR code detection (never zooms on plain floors/walls/grass/tables).
  const [zoom, setZoom] = useState<number>(1.0);
  const [autoZoomState, setAutoZoomState] = useState<'IDLE_SEARCHING' | 'AUTO_ZOOMING_IN' | 'QR_DECODED_HOLDING' | 'AUTO_ZOOMING_OUT'>('IDLE_SEARCHING');
  const [verifiedDigits, setVerifiedDigits] = useState<string | null>(null);

  const consecutiveDecodesRef = useRef<number>(0);
  const candidateCodeRef = useRef<string | null>(null);
  const lastSeenQrTimeRef = useRef<number>(0);

  const ipCamImgRef = useRef<HTMLImageElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastPtzDispatchRef = useRef<number>(0);

  // Helper to get phone base URL for testing in browser tab & PTZ zoom
  const getPhoneBaseUrl = (address: string) => {
    let clean = address.trim();
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      clean = `http://${clean}`;
    }
    return clean.replace(/\/+$/, '');
  };

  // Helper to format proper phone stream URL
  const getStreamUrl = (address: string, mode: 'mjpeg' | 'snapshot') => {
    let clean = address.trim();
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      clean = `http://${clean}`;
    }
    clean = clean.replace(/\/+$/, '');
    if (mode === 'mjpeg') {
      if (clean.endsWith('/video') || clean.endsWith('/mjpegfeed') || clean.endsWith('/videofeed')) {
        return clean;
      }
      return `${clean}/video`;
    } else {
      if (clean.endsWith('/shot.jpg') || clean.endsWith('/photo.jpg')) {
        return `${clean}?t=${Date.now()}`;
      }
      return `${clean}/shot.jpg?t=${Date.now()}`;
    }
  };

  // Toggle Samsung S24 IP Camera ON/OFF
  const handleToggleIpCam = () => {
    const nextState = !isIpCamActive;
    setIsIpCamActive(nextState);
    localStorage.setItem('sae_s24_ip_cam_enabled', String(nextState));
    audioService.playBeep(nextState ? 980 : 500, 80);
    if (nextState) {
      setIpCamStatus('connecting');
      setUseCors(true);
      setStreamReloadKey((k) => k + 1);
    } else {
      setIpCamStatus('idle');
    }
  };

  // Save IP Cam config
  const handleSaveIpCamConfig = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = tempIpCamAddress.trim();
    setIpCamAddress(clean);
    localStorage.setItem('sae_s24_ip_cam_address', clean);
    localStorage.setItem('sae_s24_ip_cam_mode', ipCamMode);
    setShowIpCamConfig(false);
    audioService.playBeep(880, 80);
    if (isIpCamActive) {
      setIpCamStatus('connecting');
      setUseCors(true);
      setStreamReloadKey((k) => k + 1);
    }
  };

  // Reset back to wide-angle 1.0x search (if ever needed manually)
  const handleResetToWide = () => {
    setAutoZoomState('IDLE_SEARCHING');
    setDetectedQr(null);
    setVerifiedDigits(null);
    setZoom(1.0);
    consecutiveDecodesRef.current = 0;
    candidateCodeRef.current = null;
    lastSeenQrTimeRef.current = 0;
    ipCameraService.unlockZoom();
    ipCameraService.setZoom(1.0);
    const baseUrl = getPhoneBaseUrl(ipCamAddress);
    ipCameraService.sendPtzZoom(baseUrl, 1.0, true);
    audioService.playBeep(980, 50);
  };

  // Auto-refresh snapshot mode frames continuously
  useEffect(() => {
    if (!isIpCamActive || ipCamMode !== 'snapshot' || ipCamStatus === 'error') return;
    const interval = setInterval(() => {
      setStreamReloadKey((k) => k + 1);
    }, 250);
    return () => clearInterval(interval);
  }, [isIpCamActive, ipCamMode, ipCamStatus]);

  // QR detections subscriber from vision service
  useEffect(() => {
    const unsubQr = visionService.subscribeQR((qr) => {
      if (qr?.code) {
        setDetectedQr(qr.code);
        setVerifiedDigits(qr.code);
        setAutoZoomState('QR_DECODED_HOLDING');
      }
    });
    return () => {
      unsubQr();
    };
  }, []);

  // --- FULLY AUTONOMOUS QR AUTO-ZOOM CONTROLLER ---
  // 1. Stays at 1.0x wide-angle searching for QR codes.
  // 2. When ANY QR is seen -> automatically zooms in smoothly (1.0x -> 3.8x) onto the QR.
  // 3. Decodes the QR digits -> holds for 3s to confirm -> automatically zooms back out to 1.0x.
  // 4. If QR leaves camera view -> automatically zooms back out to 1.0x wide-angle.
  // NO MANUAL CLICKS NEEDED FOR ZOOM-IN OR ZOOM-OUT!
  useEffect(() => {
    if (!isIpCamActive || ipCamStatus !== 'connected') return;

    // A. AUTO_ZOOMING_IN: Smoothly step zoom up to 3.8x
    if (autoZoomState === 'AUTO_ZOOMING_IN') {
      const zoomInTimer = setInterval(() => {
        // If QR has disappeared from view for > 1.8 seconds, auto zoom back out
        if (lastSeenQrTimeRef.current > 0 && Date.now() - lastSeenQrTimeRef.current > 1800) {
          setAutoZoomState('AUTO_ZOOMING_OUT');
          return;
        }

        setZoom((prevZoom) => {
          if (prevZoom >= 3.8) return 3.8;
          const nextZoom = +(prevZoom + 0.16).toFixed(2);

          const now = Date.now();
          if (now - lastPtzDispatchRef.current > 200) {
            lastPtzDispatchRef.current = now;
            const baseUrl = getPhoneBaseUrl(ipCamAddress);
            ipCameraService.sendPtzZoom(baseUrl, nextZoom, nextZoom >= 2.0);
          }

          return Math.min(3.8, nextZoom);
        });
      }, 50);

      return () => clearInterval(zoomInTimer);
    }

    // B. QR_DECODED_HOLDING: Hold zoomed image for 3 seconds then auto zoom out
    if (autoZoomState === 'QR_DECODED_HOLDING') {
      const holdTimer = setTimeout(() => {
        setAutoZoomState('AUTO_ZOOMING_OUT');
      }, 3000);

      return () => clearTimeout(holdTimer);
    }

    // C. AUTO_ZOOMING_OUT or IDLE_SEARCHING with elevated zoom: Smoothly step down to 1.0x
    if (autoZoomState === 'AUTO_ZOOMING_OUT' || (autoZoomState === 'IDLE_SEARCHING' && zoom > 1.05)) {
      const zoomOutTimer = setInterval(() => {
        setZoom((prevZoom) => {
          if (prevZoom <= 1.08) {
            clearInterval(zoomOutTimer);
            setAutoZoomState('IDLE_SEARCHING');
            const baseUrl = getPhoneBaseUrl(ipCamAddress);
            ipCameraService.sendPtzZoom(baseUrl, 1.0, true);
            return 1.0;
          }
          const nextZoom = +(prevZoom - 0.18).toFixed(2);

          const now = Date.now();
          if (now - lastPtzDispatchRef.current > 200) {
            lastPtzDispatchRef.current = now;
            const baseUrl = getPhoneBaseUrl(ipCamAddress);
            ipCameraService.sendPtzZoom(baseUrl, nextZoom, false);
          }

          return Math.max(1.0, nextZoom);
        });
      }, 40);

      return () => clearInterval(zoomOutTimer);
    }
  }, [isIpCamActive, autoZoomState, zoom, ipCamStatus, ipCamAddress]);

  // --- MULTI-SCALE ACCURATE QR CODE DETECTOR ---
  useEffect(() => {
    if (!isScanning || !isIpCamActive || ipCamStatus !== 'connected') return;

    // Multi-scale offscreen canvases (never drawn with tainted images)
    const fullCanvas = document.createElement('canvas');
    const fullCtx = fullCanvas.getContext('2d', { willReadFrequently: true });

    const zoomCanvas = document.createElement('canvas');
    const zoomCtx = zoomCanvas.getContext('2d', { willReadFrequently: true });

    let isProcessing = false;

    // Helper: Adaptive Contrast Enhancement for outdoor sunlight/shadows
    const enhanceContrast = (imgData: ImageData) => {
      const d = imgData.data;
      for (let i = 0; i < d.length; i += 4) {
        const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        const enhanced = gray > 125 ? Math.min(255, gray * 1.3) : Math.max(0, gray * 0.7);
        d[i] = enhanced;
        d[i + 1] = enhanced;
        d[i + 2] = enhanced;
      }
    };

    const runMultiScaleScan = async () => {
      if (isProcessing) return;
      isProcessing = true;

      try {
        const img = ipCamImgRef.current;
        if (!img || !fullCtx || !zoomCtx) {
          isProcessing = false;
          return;
        }

        // 1. Determine clean, untainted frame source
        let sourceImage: CanvasImageSource | null = null;
        let natW = 0;
        let natH = 0;

        // Check if direct img is readable using isolated scratch canvas
        let directReadable = false;
        try {
          if (img.complete && img.naturalWidth > 0) {
            const probeCanvas = document.createElement('canvas');
            probeCanvas.width = 2;
            probeCanvas.height = 2;
            const probeCtx = probeCanvas.getContext('2d');
            if (probeCtx) {
              probeCtx.drawImage(img, 0, 0, 2, 2);
              probeCtx.getImageData(0, 0, 1, 1);
              directReadable = true;
            }
          }
        } catch {
          directReadable = false;
        }

        if (directReadable && img.naturalWidth > 0) {
          sourceImage = img;
          natW = img.naturalWidth;
          natH = img.naturalHeight;
        } else {
          // Fetch untainted, full optical clarity snapshot frame via same-origin proxy
          try {
            const baseUrl = getPhoneBaseUrl(ipCamAddress);
            const proxyUrl = `/api/ipcam/proxy?url=${encodeURIComponent(`${baseUrl}/shot.jpg`)}&_t=${Date.now()}`;
            const response = await fetch(proxyUrl, { cache: 'no-store' });
            if (response.ok) {
              const blob = await response.blob();
              if (blob.size > 200) {
                const bmp = await createImageBitmap(blob);
                sourceImage = bmp;
                natW = bmp.width;
                natH = bmp.height;
              }
            }
          } catch {
            sourceImage = null;
          }
        }

        if (!sourceImage || natW === 0 || natH === 0) {
          isProcessing = false;
          return;
        }

        // --- MULTI-SCALE ACCURATE QR SCANNER ---
        // Runs on pristine uncorrupted pixel data across multiple optical scales
        let detectedCode: string | null = null;

        // Pass 1: Full Frame Native Scan (Wide-angle detection)
        const targetFullW = Math.min(960, natW);
        const targetFullH = Math.round(targetFullW * (natH / natW));
        fullCanvas.width = targetFullW;
        fullCanvas.height = targetFullH;
        fullCtx.drawImage(sourceImage, 0, 0, targetFullW, targetFullH);
        const fullData = fullCtx.getImageData(0, 0, targetFullW, targetFullH);

        // 1A. Dual-Engine WebAssembly SIMD + jsQR Pass
        let qrResult = await decodeQRFromImageData(fullData);
        if (qrResult && qrResult.text) {
          detectedCode = qrResult.twoDigits || qrResult.text;
        }

        // Pass 2: Center 55% ROI Crop (Mid-distance Box Target Magnification)
        if (!detectedCode) {
          const cropW = Math.round(natW * 0.55);
          const cropH = Math.round(natH * 0.55);
          const cropX = Math.round((natW - cropW) / 2);
          const cropY = Math.round((natH - cropH) / 2);

          zoomCanvas.width = 640;
          zoomCanvas.height = Math.round(640 * (cropH / cropW));
          zoomCtx.drawImage(sourceImage, cropX, cropY, cropW, cropH, 0, 0, zoomCanvas.width, zoomCanvas.height);
          const midData = zoomCtx.getImageData(0, 0, zoomCanvas.width, zoomCanvas.height);
          qrResult = await decodeQRFromImageData(midData);
          if (qrResult && qrResult.text) {
            detectedCode = qrResult.twoDigits || qrResult.text;
          }
        }

        // Pass 3: Center 28% Telephoto ROI Crop (High-Altitude / Distant Small QR Codes)
        if (!detectedCode) {
          const teleW = Math.round(natW * 0.28);
          const teleH = Math.round(natH * 0.28);
          const teleX = Math.round((natW - teleW) / 2);
          const teleY = Math.round((natH - teleH) / 2);

          zoomCanvas.width = 640;
          zoomCanvas.height = Math.round(640 * (teleH / teleW));
          zoomCtx.drawImage(sourceImage, teleX, teleY, teleW, teleH, 0, 0, zoomCanvas.width, zoomCanvas.height);
          const teleData = zoomCtx.getImageData(0, 0, zoomCanvas.width, zoomCanvas.height);
          qrResult = await decodeQRFromImageData(teleData);
          if (qrResult && qrResult.text) {
            detectedCode = qrResult.twoDigits || qrResult.text;
          }

          // Pass 4: Adaptive Sunlight Contrast Enhancement (Only if raw passes didn't decode)
          if (!detectedCode) {
            enhanceContrast(teleData);
            qrResult = await decodeQRFromImageData(teleData);
            if (qrResult && qrResult.text) {
              detectedCode = qrResult.twoDigits || qrResult.text;
            }
          }
        }

        // --- FULLY AUTONOMOUS TRANSITIONS (TRIGGERED STRICTLY BY QR CODE) ---
        if (detectedCode) {
          lastSeenQrTimeRef.current = Date.now();

          // Support competition 2-digit numbers as well as URLs and general strings
          const { twoDigits } = extractTwoDigits(detectedCode);
          const displayCandidate = twoDigits || detectedCode;

          // 1. If currently in wide-angle IDLE search or zooming out -> IMMEDIATELY trigger Auto-Zoom In!
          if (autoZoomState === 'IDLE_SEARCHING' || autoZoomState === 'AUTO_ZOOMING_OUT') {
            setAutoZoomState('AUTO_ZOOMING_IN');
            consecutiveDecodesRef.current = 1;
            candidateCodeRef.current = displayCandidate;
            audioService.playBeep(1050, 70);
          } else if (autoZoomState === 'AUTO_ZOOMING_IN') {
            if (candidateCodeRef.current === displayCandidate) {
              consecutiveDecodesRef.current++;
            } else {
              candidateCodeRef.current = displayCandidate;
              consecutiveDecodesRef.current = 1;
            }

            // Once verified by 2 consistent frames or high zoom -> lock, alert, and start 3s hold before auto-zoom-out
            if (consecutiveDecodesRef.current >= 2 || zoom >= 2.0) {
              setVerifiedDigits(displayCandidate);
              setDetectedQr(displayCandidate);
              setAutoZoomState('QR_DECODED_HOLDING');
              ipCameraService.lockZoom(displayCandidate);
              audioService.playQrDetected();
              audioService.triggerHaptic('success');
              visionService.reportDecodedQR(displayCandidate, 0.99);

              const baseUrl = getPhoneBaseUrl(ipCamAddress);
              ipCameraService.sendPtzZoom(baseUrl, zoom, true);
            }
          }
        }
      } catch {
        // Ignored
      } finally {
        isProcessing = false;
      }
    };

    const scanTimer = setInterval(runMultiScaleScan, 130);
    return () => clearInterval(scanTimer);
  }, [isScanning, isIpCamActive, ipCamStatus, ipCamAddress, zoom, autoZoomState]);

  // Snapshot photo capture from Samsung S24 stream with HUD watermark
  const handleTakeSnapshot = () => {
    audioService.playBeep(980, 80);
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let captured = false;

    // Capture from Samsung S24 IP Camera
    if (isIpCamActive && ipCamImgRef.current && ipCamStatus === 'connected') {
      try {
        ctx.drawImage(ipCamImgRef.current, 0, 0, canvas.width, canvas.height);
        captured = true;
      } catch {
        captured = false;
      }
    }

    // Fallback Tactical Snapshot background if direct draw blocked
    if (!captured) {
      ctx.fillStyle = '#070D18';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#0284C7';
      ctx.font = 'bold 32px sans-serif';
      ctx.fillText('SAE INDIA DRONE OPTICAL SNAPSHOT', 50, 100);
      ctx.font = '22px monospace';
      ctx.fillStyle = '#94A3B8';
      ctx.fillText(`Source: Samsung S24 (${ipCamAddress})`, 50, 160);
      ctx.fillText(`Timestamp: ${new Date().toISOString()}`, 50, 200);
    }

    // Watermark live flight telemetry HUD onto snapshot
    ctx.fillStyle = 'rgba(7, 13, 24, 0.75)';
    ctx.fillRect(20, canvas.height - 70, canvas.width - 40, 50);
    ctx.fillStyle = '#38BDF8';
    ctx.font = 'bold 18px monospace';
    const hdgCardinal = getCardinal(telemetry.headingDeg || 0);
    ctx.fillText(
      `ALT: ${(telemetry.altitudeMeters || 0).toFixed(1)}m  |  HDG: ${(telemetry.headingDeg || 0)}° (${hdgCardinal})  |  V-SPD: ${(telemetry.verticalSpeedMs || 0).toFixed(1)}m/s  |  ZOOM: ${zoom.toFixed(1)}x`,
      40,
      canvas.height - 42
    );
    ctx.fillStyle = '#94A3B8';
    ctx.font = '14px monospace';
    ctx.fillText(
      `SAMSUNG S24 OPTICAL FEED  |  LAT: ${(telemetry.latitude || 0).toFixed(6)}  LON: ${(telemetry.longitude || 0).toFixed(6)}  |  ${new Date().toISOString()}`,
      40,
      canvas.height - 20
    );

    const dataUrl = canvas.toDataURL('image/jpeg');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `drone_snap_samsung_s24_${Date.now()}.jpg`;
    a.click();
  };

  // Toggle video recording from stream
  const handleToggleRecord = () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      audioService.playBeep(500, 100);
    } else {
      if (!ipCamImgRef.current || ipCamStatus !== 'connected') {
        alert('Active Samsung S24 IP camera stream required to start recording.');
        return;
      }
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 1280;
        canvas.height = 720;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const stream = (canvas as any).captureStream ? (canvas as any).captureStream(25) : null;
        if (!stream) {
          alert('Canvas video recording not supported on this browser.');
          return;
        }

        const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
        recordedChunksRef.current = [];
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) recordedChunksRef.current.push(e.data);
        };
        recorder.onstop = () => {
          const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `samsung_s24_mission_${Date.now()}.webm`;
          a.click();
          URL.revokeObjectURL(url);
        };

        recorder.start();
        mediaRecorderRef.current = recorder;
        setIsRecording(true);
        audioService.playBeep(880, 100);

        const renderInterval = setInterval(() => {
          if (!mediaRecorderRef.current || mediaRecorderRef.current.state !== 'recording') {
            clearInterval(renderInterval);
            return;
          }
          if (ipCamImgRef.current && ipCamImgRef.current.complete) {
            try {
              ctx.drawImage(ipCamImgRef.current, 0, 0, canvas.width, canvas.height);
            } catch {
              // cross-origin security
            }
          }
        }, 40);
      } catch {
        setIsRecording(false);
      }
    }
  };

  // Toggle QR scan mode
  const handleToggleScan = () => {
    setIsScanning((prev) => {
      const next = !prev;
      if (next) {
        audioService.playBeep(1100, 80);
      }
      return next;
    });
  };

  // Fullscreen video
  const handleFullscreen = () => {
    if (!containerRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      containerRef.current.requestFullscreen().catch(() => {});
    }
  };

  // Manual zoom setter (if operator ever wants manual override)
  const handleSetManualZoom = (newZoom: number) => {
    const clamped = Math.max(1.0, Math.min(4.0, newZoom));
    setZoom(clamped);
    audioService.playBeep(750, 40);
    ipCameraService.sendPtzZoom(getPhoneBaseUrl(ipCamAddress), clamped, true);
  };

  return (
    <Card
      title="CAMERA FEED (SAMSUNG S24)"
      action={
        <div className="flex items-center gap-1.5 relative">
          {/* Autonomous QR Auto-Zoom Status Badge */}
          <div
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] text-[10px] font-mono font-bold transition shadow-sm ${
              autoZoomState === 'AUTO_ZOOMING_IN'
                ? 'bg-amber-600 text-white shadow-[0_0_8px_rgba(245,158,11,0.6)] animate-pulse'
                : autoZoomState === 'QR_DECODED_HOLDING'
                ? 'bg-emerald-600 text-white shadow-[0_0_8px_rgba(16,185,129,0.5)]'
                : autoZoomState === 'AUTO_ZOOMING_OUT'
                ? 'bg-sky-600 text-white shadow-[0_0_8px_rgba(56,189,248,0.5)] animate-pulse'
                : 'bg-[#161B22] text-slate-300'
            }`}
            title="Autonomous QR Zoom: Automatically zooms in when ANY QR is seen, decodes it, and automatically zooms back out without requiring any clicks."
          >
            <Target className="w-3 h-3 text-sky-400" />
            <span>
              AUTO-QR ZOOM: {autoZoomState === 'AUTO_ZOOMING_IN' ? 'ZOOMING IN' : autoZoomState === 'QR_DECODED_HOLDING' ? 'DECODED' : autoZoomState === 'AUTO_ZOOMING_OUT' ? 'ZOOMING OUT' : 'STANDBY (1.0x)'}
            </span>
          </div>

          {/* Samsung S24 IP Cam ON/OFF Toggle Button */}
          <div className="flex items-center gap-1 bg-[#161B22] p-0.5 rounded-[6px] border border-[var(--uav-card-border)]">
            <button
              type="button"
              onClick={handleToggleIpCam}
              className={`flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] text-[10px] font-mono font-bold transition cursor-pointer ${
                isIpCamActive
                  ? 'bg-emerald-600 text-white shadow-[0_0_8px_rgba(34,197,94,0.4)]'
                  : 'bg-[#21262D] text-slate-400 hover:text-white'
              }`}
              title={
                isIpCamActive
                  ? 'Samsung S24 IP Camera is ON (Click to turn OFF)'
                  : 'Samsung S24 IP Camera is OFF (Click to turn ON)'
              }
            >
              <Smartphone className="w-3 h-3 text-white" />
              <span>IP CAM: {isIpCamActive ? 'ON' : 'OFF'}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setTempIpCamAddress(ipCamAddress);
                setShowIpCamConfig(true);
              }}
              className="p-1 rounded text-slate-400 hover:text-emerald-300 hover:bg-[#21262D] transition cursor-pointer"
              title="Configure Samsung S24 IP Camera IP & Settings"
            >
              <Settings className="w-3 h-3" />
            </button>
          </div>

          {/* Resolution Select */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowResMenu(!showResMenu);
                setShowFpsMenu(false);
              }}
              className="flex items-center gap-1 px-2 py-0.5 rounded-[6px] border border-[var(--uav-card-border)] bg-[#161B22] hover:bg-[#21262D] text-[11px] font-mono text-[var(--uav-text)] cursor-pointer"
            >
              <span>{resolution}</span>
              <ChevronDown className="w-3 h-3 text-[var(--uav-muted)]" />
            </button>
            {showResMenu && (
              <div className="absolute right-0 top-full mt-1 z-50 bg-[#161B22] border border-[var(--uav-card-border)] rounded shadow-xl py-1 text-[11px] font-mono w-20">
                {['720P', '1080P', '4K'].map((res) => (
                  <button
                    key={res}
                    type="button"
                    onClick={() => {
                      setResolution(res);
                      setShowResMenu(false);
                    }}
                    className="w-full text-left px-2 py-1 hover:bg-[#10B981] hover:text-emerald-950 font-medium text-slate-200"
                  >
                    {res}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* FPS Select */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowFpsMenu(!showFpsMenu);
                setShowResMenu(false);
              }}
              className="flex items-center gap-1 px-2 py-0.5 rounded-[6px] border border-[var(--uav-card-border)] bg-[#161B22] hover:bg-[#21262D] text-[11px] font-mono text-[var(--uav-text)] cursor-pointer"
            >
              <span>{fps}</span>
              <ChevronDown className="w-3 h-3 text-[var(--uav-muted)]" />
            </button>
            {showFpsMenu && (
              <div className="absolute right-0 top-full mt-1 z-50 bg-[#161B22] border border-[var(--uav-card-border)] rounded shadow-xl py-1 text-[11px] font-mono w-22">
                {['15 FPS', '30 FPS', '60 FPS'].map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => {
                      setFps(f);
                      setShowFpsMenu(false);
                    }}
                    className="w-full text-left px-2 py-1 hover:bg-[#10B981] hover:text-emerald-950 font-medium text-slate-200"
                  >
                    {f}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      }
      className={`h-[358px] shrink-0 select-none ${className}`}
      contentClassName="p-2 flex flex-col justify-between relative"
    >
      {/* Video Viewport Area (Exclusively for Samsung S24 IP Camera) */}
      <div
        ref={containerRef}
        className="flex-1 rounded-[8px] border border-[var(--uav-card-border)] bg-black overflow-hidden relative flex items-center justify-center"
      >
        {isIpCamActive ? (
          <div className="w-full h-full relative flex items-center justify-center bg-black overflow-hidden">
            {/* Visual Scaling Container with Hardware PTZ Zoom Sync */}
            <div
              className="w-full h-full flex items-center justify-center transition-transform duration-100 ease-out"
              style={{
                transform: `scale(${zoom})`,
                transformOrigin: 'center center',
              }}
            >
              <img
                key={`ip-cam-${streamReloadKey}-${useCors ? 'cors' : 'nocors'}`}
                ref={ipCamImgRef}
                src={getStreamUrl(ipCamAddress, ipCamMode)}
                alt="Samsung S24 IP Camera Feed"
                crossOrigin={useCors ? 'anonymous' : undefined}
                onLoad={() => {
                  setIpCamStatus('connected');
                }}
                onError={() => {
                  if (useCors) {
                    setUseCors(false);
                  } else {
                    setIpCamStatus('error');
                  }
                }}
                className="w-full h-full object-cover select-none"
              />
            </div>

            {/* Tactical UAV HUD OSD Telemetry Overlay */}
            <div className="absolute inset-0 pointer-events-none z-10 flex flex-col justify-between p-2 select-none">
              {/* Top OSD Bar */}
              <div className="flex items-start justify-between">
                {/* Left: Camera Status Badge & Zoom Readout */}
                <div className="flex items-center gap-1.5 pointer-events-auto">
                  {ipCamStatus === 'connected' && (
                    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-emerald-600/90 backdrop-blur-sm text-white font-mono font-bold text-[10px] tracking-wider uppercase shadow-md">
                      <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                      <span>S24 LIVE</span>
                    </div>
                  )}
                  {isRecording && (
                    <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-red-600/90 backdrop-blur-sm text-white font-mono font-bold text-[10px] tracking-wider uppercase animate-pulse shadow-md">
                      <span>● REC</span>
                    </div>
                  )}
                  {/* Autonomous Real-Time Zoom Badge */}
                  <div
                    className={`flex items-center gap-1 px-2 py-0.5 rounded font-mono font-bold text-[10px] tracking-wider shadow-md backdrop-blur-sm border ${
                      autoZoomState === 'QR_DECODED_HOLDING'
                        ? 'bg-emerald-600/90 border-emerald-300 text-white'
                        : autoZoomState === 'AUTO_ZOOMING_IN'
                        ? 'bg-amber-500/90 border-amber-300 text-black animate-pulse'
                        : autoZoomState === 'AUTO_ZOOMING_OUT'
                        ? 'bg-sky-600/90 border-sky-300 text-white animate-pulse'
                        : 'bg-black/60 border-slate-700 text-slate-300'
                    }`}
                  >
                    <span>ZOOM {zoom.toFixed(1)}x</span>
                    {autoZoomState === 'QR_DECODED_HOLDING' ? (
                      <Lock className="w-2.5 h-2.5" />
                    ) : autoZoomState === 'AUTO_ZOOMING_IN' ? (
                      <span className="text-[9px] font-bold">▲ AUTO-ZOOM IN</span>
                    ) : autoZoomState === 'AUTO_ZOOMING_OUT' ? (
                      <span className="text-[9px] font-bold">▼ AUTO-ZOOM OUT</span>
                    ) : (
                      <span className="text-[9px] text-sky-400">WIDE 1.0x</span>
                    )}
                  </div>
                </div>

                {/* Right: Live Flight HUD Box (Altitude, Compass Heading, Altitude Speed) */}
                <div className="bg-[#070D18]/85 backdrop-blur-sm border border-sky-500/40 rounded px-2.5 py-1 flex items-center gap-2.5 font-mono text-[10.5px] text-white shadow-lg pointer-events-auto">
                  {/* 1. Altitude */}
                  <div className="flex items-center gap-1" title="Current Relative Altitude">
                    <span className="text-sky-400 font-bold">ALT</span>
                    <span className="font-bold">{(telemetry.altitudeMeters || 0).toFixed(1)}m</span>
                  </div>
                  <div className="w-[1px] h-3 bg-slate-700" />

                  {/* 2. Compass Heading */}
                  <div className="flex items-center gap-1" title="Compass Heading & Cardinal">
                    <span className="text-amber-400 font-bold">HDG</span>
                    <span className="font-bold">
                      {(telemetry.headingDeg || 0).toString().padStart(3, '0')}°
                      <span className="text-slate-300 ml-0.5 text-[9.5px] font-semibold">{getCardinal(telemetry.headingDeg || 0)}</span>
                    </span>
                  </div>
                  <div className="w-[1px] h-3 bg-slate-700" />

                  {/* 3. Altitude Speed (Vertical Speed / Climb Rate) */}
                  <div className="flex items-center gap-1" title="Vertical Altitude Speed / Climb Rate">
                    <span className="text-emerald-400 font-bold">V-SPD</span>
                    <span
                      className={`font-bold ${
                        telemetry.verticalSpeedMs > 0.2
                          ? 'text-emerald-400'
                          : telemetry.verticalSpeedMs < -0.2
                          ? 'text-amber-400'
                          : 'text-slate-200'
                      }`}
                    >
                      {telemetry.verticalSpeedMs > 0 ? '▲+' : telemetry.verticalSpeedMs < 0 ? '▼' : ''}
                      {(telemetry.verticalSpeedMs || 0).toFixed(1)}m/s
                    </span>
                  </div>
                </div>
              </div>

              {/* Center Tactical Crosshair with Multi-Scale Target Box */}
              <div className="flex-1 flex items-center justify-center relative">
                {/* Aircraft Boresight Marker */}
                <div className="relative w-16 h-16 flex items-center justify-center pointer-events-none opacity-40">
                  <div className="w-4 h-[1px] bg-emerald-400 absolute left-0" />
                  <div className="w-4 h-[1px] bg-emerald-400 absolute right-0" />
                  <div className="h-4 w-[1px] bg-emerald-400 absolute top-0" />
                  <div className="h-4 w-[1px] bg-emerald-400 absolute bottom-0" />
                  <div className="w-1.5 h-1.5 border border-emerald-400 rounded-full" />
                </div>

                {/* Scanning Target Crosshairs Overlay with Dynamic Scale Ticks */}
                {isScanning && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div
                      className={`border-2 rounded-lg transition-all duration-150 relative flex items-center justify-center ${
                        autoZoomState === 'QR_DECODED_HOLDING'
                          ? 'w-48 h-48 border-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.7)]'
                          : autoZoomState === 'AUTO_ZOOMING_IN'
                          ? 'w-44 h-44 border-amber-400 border-dashed animate-pulse shadow-[0_0_15px_rgba(251,191,36,0.6)]'
                          : autoZoomState === 'AUTO_ZOOMING_OUT'
                          ? 'w-36 h-36 border-amber-400 border-dashed animate-pulse'
                          : 'w-36 h-36 border-emerald-400/50'
                      }`}
                    >
                      <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9.5px] font-mono text-white bg-black/80 px-1.5 py-0.5 rounded border border-emerald-500/50 max-w-[340px] truncate whitespace-nowrap">
                        {autoZoomState === 'QR_DECODED_HOLDING'
                          ? `QR DECODED [${(verifiedDigits || detectedQr || '').length > 20 ? (verifiedDigits || detectedQr || '').substring(0, 18) + '...' : (verifiedDigits || detectedQr)}] — RETURNING TO WIDE (${zoom.toFixed(1)}x)`
                          : autoZoomState === 'AUTO_ZOOMING_IN'
                          ? `QR SEEN — AUTO-ZOOMING IN (${zoom.toFixed(1)}x / 3.8x)`
                          : autoZoomState === 'AUTO_ZOOMING_OUT'
                          ? `AUTO-ZOOMING OUT TO WIDE (${zoom.toFixed(1)}x)`
                          : `WIDE VIEW (1.0x) — WAITING FOR QR`}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Bottom OSD Bar: Mode, Battery, Ground Speed, Manual Zoom Bar */}
              <div className="flex items-center justify-between text-[9px] font-mono bg-[#0D1117]/85 backdrop-blur-sm border border-slate-800/80 rounded px-2.5 py-1 text-slate-300 pointer-events-auto">
                <div className="flex items-center gap-2">
                  <span className="text-emerald-400 font-bold">{telemetry.flightMode}</span>
                  <span>•</span>
                  <span>BAT {telemetry.batteryPercent}% ({(telemetry.batteryVoltage || 0).toFixed(1)}V)</span>
                </div>

                {/* Quick Zoom Steps (1x, 2x, 3x, 4x) */}
                <div className="flex items-center gap-1">
                  <span className="text-slate-400 text-[8.5px]">ZOOM:</span>
                  {[1.0, 2.0, 3.0, 4.0].map((z) => (
                    <button
                      key={z}
                      type="button"
                      onClick={() => handleSetManualZoom(z)}
                      className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold cursor-pointer transition ${
                        Math.abs(zoom - z) < 0.25
                          ? 'bg-[#10B981] text-black font-bold'
                          : 'bg-[#21262D] text-slate-400 hover:text-white'
                      }`}
                    >
                      {z}x
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => handleSetManualZoom(zoom - 0.5)}
                    className="p-0.5 bg-[#21262D] hover:bg-slate-700 rounded text-slate-300 cursor-pointer"
                    title="Zoom Out"
                  >
                    <ZoomOut className="w-2.5 h-2.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetManualZoom(zoom + 0.5)}
                    className="p-0.5 bg-[#21262D] hover:bg-slate-700 rounded text-slate-300 cursor-pointer"
                    title="Zoom In"
                  >
                    <ZoomIn className="w-2.5 h-2.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Connecting State Overlay */}
            {ipCamStatus === 'connecting' && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#070D18]/90 text-center p-3 animate-in fade-in">
                <RefreshCw className="w-6 h-6 text-sky-400 animate-spin mb-2" />
                <span className="text-white text-[12px] font-mono font-bold">Connecting to Samsung S24...</span>
                <span className="text-slate-400 text-[10px] font-mono mt-1 truncate max-w-xs">
                  {getStreamUrl(ipCamAddress, ipCamMode)}
                </span>
              </div>
            )}

            {/* Offline / Connection Error Overlay */}
            {ipCamStatus === 'error' && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#0D1117]/95 text-center p-3 animate-in fade-in">
                <WifiOff className="w-7 h-7 text-rose-500 mb-1.5 animate-pulse" />
                <span className="text-rose-400 text-[12px] font-bold font-sans">Samsung S24 Camera Offline</span>
                <p className="text-slate-400 text-[10px] mt-1 max-w-xs leading-tight font-mono">
                  Cannot reach <span className="text-amber-300">{ipCamAddress}</span>. Ensure phone is on the same hotspot and 'Start server' is active in IP Webcam.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2 mt-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setIpCamStatus('connecting');
                      setUseCors(true);
                      setStreamReloadKey((k) => k + 1);
                    }}
                    className="px-2.5 py-1 bg-[#10B981] hover:bg-[#059669] text-black text-[10px] font-bold rounded flex items-center gap-1 cursor-pointer transition active:scale-95"
                  >
                    <RefreshCw className="w-3 h-3" /> Retry
                  </button>
                  <a
                    href={getPhoneBaseUrl(ipCamAddress)}
                    target="_blank"
                    rel="noreferrer"
                    className="px-2.5 py-1 bg-[#21262D] hover:bg-[#30363D] text-amber-300 text-[10px] font-bold rounded flex items-center gap-1 transition cursor-pointer"
                  >
                    <ExternalLink className="w-3 h-3" /> Test in Tab
                  </a>
                  <button
                    type="button"
                    onClick={() => setShowIpCamConfig(true)}
                    className="px-2.5 py-1 bg-[#21262D] hover:bg-[#30363D] text-slate-200 text-[10px] font-bold rounded flex items-center gap-1 cursor-pointer transition active:scale-95"
                  >
                    <Settings className="w-3 h-3" /> Change IP
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Standby Screen (When IP Camera is Paused - No desktop/laptop camera access) */
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#0D1117] text-center p-4">
            <div className="w-12 h-12 rounded-full border border-emerald-500/30 bg-emerald-950/30 flex items-center justify-center text-emerald-400 mb-2">
              <Smartphone className="w-6 h-6" />
            </div>
            <span className="text-white text-[12px] font-bold font-sans tracking-wide">
              Samsung S24 IP Camera Standby
            </span>
            <p className="text-slate-400 text-[10.5px] font-mono mt-1 max-w-xs leading-tight">
              Optical stream is paused. Click below to start stream from Samsung S24 on <span className="text-amber-300">{ipCamAddress}</span>.
            </p>
            <div className="flex items-center gap-2 mt-3">
              <button
                type="button"
                onClick={handleToggleIpCam}
                className="px-3.5 py-1.5 bg-[#10B981] hover:bg-[#059669] text-black text-[11px] font-mono font-bold rounded flex items-center gap-1.5 cursor-pointer transition active:scale-95 shadow-md shadow-emerald-600/20"
              >
                <Smartphone className="w-3.5 h-3.5" /> Start S24 Camera Feed
              </button>
              <button
                type="button"
                onClick={() => {
                  setTempIpCamAddress(ipCamAddress);
                  setShowIpCamConfig(true);
                }}
                className="px-3 py-1.5 bg-[#21262D] hover:bg-[#30363D] text-slate-200 text-[11px] font-mono font-bold rounded flex items-center gap-1 cursor-pointer transition active:scale-95"
              >
                <Settings className="w-3.5 h-3.5" /> Setup IP
              </button>
            </div>
          </div>
        )}

        {/* QR Detected Auto-Zooming In Banner */}
        {autoZoomState === 'AUTO_ZOOMING_IN' && (
          <div className="absolute bottom-3 inset-x-3 z-30 bg-amber-950/95 border-2 border-amber-400 text-amber-100 px-3 py-2 rounded-lg text-center font-mono shadow-2xl animate-in fade-in flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping" />
              <span className="text-[11.5px] font-bold">
                QR DETECTED — AUTO-ZOOMING IN ({zoom.toFixed(1)}x ➔ 3.8x) TO DECODE DIGITS...
              </span>
            </div>
            <span className="text-[10px] text-amber-300 font-mono">Hands-Free Auto-Scanning</span>
          </div>
        )}

        {/* QR Code Decoded Lock Banner (Auto-zooms out after 3 seconds) */}
        {autoZoomState === 'QR_DECODED_HOLDING' && (verifiedDigits || detectedQr) && (
          <div className="absolute bottom-3 inset-x-3 z-30 bg-emerald-950/95 border-2 border-emerald-400 text-emerald-100 px-3 py-2 rounded-lg text-center font-mono shadow-2xl animate-in fade-in flex items-center justify-between">
            <div className="flex items-center gap-2 overflow-hidden max-w-[80%]">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="text-[12px] font-bold truncate" title={verifiedDigits || detectedQr || ''}>
                QR CODE VERIFIED: [{verifiedDigits || detectedQr}] — AUTO-RETURNING TO WIDE (1.0x)...
              </span>
            </div>
            <span className="text-[10px] text-emerald-300 font-mono shrink-0 ml-2">Auto-Resetting to 1.0x</span>
          </div>
        )}
      </div>

      {/* Bottom Tool Row */}
      <div className="flex items-center justify-between pt-2 px-6">
        <button
          type="button"
          onClick={handleTakeSnapshot}
          title="Take Snapshot from Samsung S24 (Save Watermarked JPG)"
          aria-label="Take Snapshot"
          className="p-1 text-[var(--uav-muted)] hover:text-white transition cursor-pointer active:scale-90"
        >
          <Camera className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={handleToggleRecord}
          title={isRecording ? 'Stop Recording' : 'Start Recording S24 Stream'}
          aria-label="Record Video"
          className={`p-1 transition cursor-pointer active:scale-90 ${
            isRecording ? 'text-red-500 animate-pulse' : 'text-[var(--uav-muted)] hover:text-white'
          }`}
        >
          <Video className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={handleToggleScan}
          title={isScanning ? 'Disable QR Target Scanner' : 'Enable QR Target Scanner'}
          aria-label="Target Scan / Servo Lock"
          className={`p-1 transition cursor-pointer active:scale-90 ${
            isScanning ? 'text-emerald-400' : 'text-[var(--uav-muted)] hover:text-white'
          }`}
        >
          <Scan className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={handleFullscreen}
          title="Toggle Fullscreen Video"
          aria-label="Fullscreen Video"
          className="p-1 text-[var(--uav-muted)] hover:text-white transition cursor-pointer active:scale-90"
        >
          <Maximize className="w-4 h-4" />
        </button>
      </div>

      {/* Samsung S24 IP Camera Configuration Modal Popover */}
      {showIpCamConfig && (
        <div className="absolute inset-0 z-50 bg-[#0D1117]/95 backdrop-blur-md rounded-[10px] p-3.5 flex flex-col justify-between border border-emerald-500/50 shadow-2xl animate-in fade-in overflow-hidden">
          <div className="flex items-center justify-between pb-2 border-b border-[var(--uav-card-border)] shrink-0">
            <div className="flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-emerald-400" />
              <span className="font-bold text-[12px] text-white">Samsung S24 IP Camera Setup</span>
            </div>
            <button
              type="button"
              onClick={() => setShowIpCamConfig(false)}
              className="text-slate-400 hover:text-white p-1 rounded hover:bg-[#21262D] transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleSaveIpCamConfig} className="my-2.5 space-y-2.5 overflow-y-auto pr-1 flex-1">
            <div>
              <label className="text-[10.5px] text-slate-300 font-mono block mb-1 font-semibold">
                Phone IP Address &amp; Port (e.g. 192.168.43.1:8080):
              </label>
              <input
                type="text"
                value={tempIpCamAddress}
                onChange={(e) => setTempIpCamAddress(e.target.value)}
                placeholder="192.168.43.1:8080"
                className="w-full bg-[#11161D] border border-[var(--uav-card-border)] focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded px-3 py-1.5 text-[11.5px] font-mono text-white outline-none"
                autoFocus
              />
            </div>

            <div>
              <label className="text-[10.5px] text-slate-300 font-mono block mb-1 font-semibold">Stream Endpoint Mode:</label>
              <div className="grid grid-cols-2 gap-2 text-[10.5px] font-mono">
                <button
                  type="button"
                  onClick={() => setIpCamMode('mjpeg')}
                  className={`p-2 rounded border text-left cursor-pointer transition ${
                    ipCamMode === 'mjpeg'
                      ? 'bg-[#10B981]/20 border-emerald-400 text-emerald-200 ring-1 ring-emerald-400/50'
                      : 'bg-[#11161D] border-[var(--uav-card-border)] text-slate-400 hover:border-slate-600'
                  }`}
                >
                  <div className="font-bold text-[11px]">MJPEG (/video)</div>
                  <div className="text-[9.5px] opacity-75">Standard IP Webcam</div>
                </button>
                <button
                  type="button"
                  onClick={() => setIpCamMode('snapshot')}
                  className={`p-2 rounded border text-left cursor-pointer transition ${
                    ipCamMode === 'snapshot'
                      ? 'bg-[#10B981]/20 border-emerald-400 text-emerald-200 ring-1 ring-emerald-400/50'
                      : 'bg-[#11161D] border-[var(--uav-card-border)] text-slate-400 hover:border-slate-600'
                  }`}
                >
                  <div className="font-bold text-[11px]">Snapshot (/shot.jpg)</div>
                  <div className="text-[9.5px] opacity-75">Ultra-compatible Loop</div>
                </button>
              </div>
            </div>

            {typeof window !== 'undefined' && window.location.protocol === 'https:' && (
              <div className="text-[9.5px] text-amber-300 bg-amber-950/40 border border-amber-500/50 p-2 rounded leading-tight flex items-start gap-1.5 font-mono">
                <AlertCircle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                <span>
                  <strong>HTTPS Notice:</strong> Chrome blocks HTTP streams inside HTTPS pages. Click padlock icon next to URL &rarr; <em>Site settings</em> &rarr; set <em>Insecure content</em> to <strong>Allow</strong>.
                </span>
              </div>
            )}

            <div className="text-[9.5px] text-slate-400 bg-[#11161D] p-2 rounded border border-[var(--uav-card-border)] font-mono leading-relaxed space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-emerald-400 font-bold">Quick Setup Guide:</span>
                <a
                  href={getPhoneBaseUrl(tempIpCamAddress)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-emerald-400 hover:text-emerald-200 flex items-center gap-1 text-[9px] underline font-bold"
                >
                  Test Phone Link <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </div>
              <div>1. Connect Samsung S24 &amp; laptop to same hotspot / Wi-Fi.</div>
              <div>2. Open <strong>IP Webcam</strong> app on phone &rarr; scroll to bottom &rarr; tap <strong>Start server</strong>.</div>
              <div>3. Type IP from phone screen into box above (e.g. <code>192.168.43.1:8080</code>).</div>
              <div className="text-slate-500 pt-0.5 text-[9px]">
                Stream endpoint: <span className="text-emerald-400">{getStreamUrl(tempIpCamAddress, ipCamMode)}</span>
              </div>
            </div>
          </form>

          <div className="flex items-center justify-end gap-2.5 pt-2.5 border-t border-[var(--uav-card-border)] shrink-0">
            <button
              type="button"
              onClick={() => setShowIpCamConfig(false)}
              className="px-3.5 py-1.5 rounded bg-[#21262D] hover:bg-[#262C36] text-slate-300 hover:text-white text-[11px] font-mono cursor-pointer transition active:scale-95"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => handleSaveIpCamConfig()}
              className="px-4 py-1.5 rounded bg-[#10B981] hover:bg-[#059669] text-emerald-950 text-[11px] font-mono font-bold cursor-pointer transition active:scale-95 shadow-md shadow-emerald-500/20"
            >
              Save &amp; Connect S24
            </button>
          </div>
        </div>
      )}
    </Card>
  );
};
