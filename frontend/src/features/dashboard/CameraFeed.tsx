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
  Target,
  Layers,
  Eye,
  Navigation,
  Compass,
  MapPin,
  Clock,
  ShieldAlert,
  ArrowRight
} from 'lucide-react';
import { decodeQRFromImageData } from '../../services/qrDecoderService';
import { Card } from '../../ui/Card';
import { visionService } from '../../services/visionService';
import { audioService } from '../../services/audioService';
import { ipCameraService } from '../../services/ipCameraService';
import { reconDetectionService } from '../../services/reconDetectionService';
import {
  QRDetectionRecord,
  GCSVisualStatus,
  QRProcessingState,
  TargetLocation
} from '../../types/recon';
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

  const [activeTab, setActiveTab] = useState<'STREAM' | 'DETECTIONS' | 'TARGET'>('STREAM');
  const [resolution, setResolution] = useState('1080P');
  const [fps, setFps] = useState('30 FPS');
  const [showResMenu, setShowResMenu] = useState(false);
  const [showFpsMenu, setShowFpsMenu] = useState(false);
  const [isScanning, setIsScanning] = useState(true);
  const [isRecording, setIsRecording] = useState(false);

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

  // AERORECON State & Intelligence
  const [visualStatus, setVisualStatus] = useState<GCSVisualStatus>(reconDetectionService.getVisualStatus());
  const [detections, setDetections] = useState<QRDetectionRecord[]>(reconDetectionService.getDetections());
  const [latestDetection, setLatestDetection] = useState<QRDetectionRecord | null>(reconDetectionService.getLatestDetection());
  const [activeTarget, setActiveTarget] = useState<TargetLocation | null>(reconDetectionService.getActiveTarget());
  const [targetDist, setTargetDist] = useState<number | null>(null);
  const [targetBearing, setTargetBearing] = useState<number | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<QRDetectionRecord | null>(null);
  const [isApproaching, setIsApproaching] = useState<boolean>(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const ipCamImgRef = useRef<HTMLImageElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  const showNotification = (msg: string) => {
    setActionNotice(msg);
    setTimeout(() => setActionNotice(null), 3500);
  };

  const getPhoneBaseUrl = (address: string) => {
    let clean = address.trim();
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      clean = `http://${clean}`;
    }
    return clean.replace(/\/+$/, '');
  };

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

  // Subscribe to AERORECON Detection Service
  useEffect(() => {
    const unsubDetections = reconDetectionService.subscribeDetections((list, latest) => {
      setDetections(list);
      setLatestDetection(latest);
    });

    const unsubStatus = reconDetectionService.subscribeVisualStatus((status) => {
      setVisualStatus(status);
    });

    const unsubTarget = reconDetectionService.subscribeActiveTarget((target, dist, bearing) => {
      setActiveTarget(target);
      setTargetDist(dist);
      setTargetBearing(bearing);
    });

    return () => {
      unsubDetections();
      unsubStatus();
      unsubTarget();
    };
  }, []);

  // Continuous Full-Frame Edge-to-Edge QR Detection Loop (Wide FOV at 1.0x native, NO digital zoom)
  useEffect(() => {
    if (!isScanning || !isIpCamActive || ipCamStatus !== 'connected') return;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    let isProcessing = false;

    const scanFrame = async () => {
      if (isProcessing || !ctx || !ipCamImgRef.current) return;
      isProcessing = true;

      try {
        const img = ipCamImgRef.current;
        let source: CanvasImageSource | null = null;
        let w = 0;
        let h = 0;

        if (img.complete && img.naturalWidth > 0) {
          try {
            canvas.width = 2;
            canvas.height = 2;
            ctx.drawImage(img, 0, 0, 2, 2);
            ctx.getImageData(0, 0, 1, 1);
            source = img;
            w = img.naturalWidth;
            h = img.naturalHeight;
          } catch {
            source = null;
          }
        }

        if (!source) {
          // Fetch clean snapshot frame via backend proxy
          try {
            const baseUrl = getPhoneBaseUrl(ipCamAddress);
            const proxyUrl = `/api/ipcam/proxy?url=${encodeURIComponent(`${baseUrl}/shot.jpg`)}&_t=${Date.now()}`;
            const res = await fetch(proxyUrl, { cache: 'no-store' });
            if (res.ok) {
              const blob = await res.blob();
              if (blob.size > 200) {
                const bmp = await createImageBitmap(blob);
                source = bmp;
                w = bmp.width;
                h = bmp.height;
              }
            }
          } catch {}
        }

        if (source && w > 0 && h > 0) {
          canvas.width = w;
          canvas.height = h;
          ctx.drawImage(source, 0, 0, w, h);

          const imageData = ctx.getImageData(0, 0, w, h);
          const qrRes = await decodeQRFromImageData(imageData);

          if (qrRes && qrRes.text) {
            const payload = qrRes.text.trim();
            const isDuplicate = reconDetectionService.isDuplicateDetection(payload);

            if (!isDuplicate) {
              const photoDataUrl = canvas.toDataURL('image/jpeg', 0.90);
              reconDetectionService.handleRawDetectionEvent({
                photoDataUrl,
                thumbnailDataUrl: photoDataUrl,
                rawImageData: imageData,
                initialPayload: payload
              });
            }
          }
        }
      } catch (err) {
      } finally {
        isProcessing = false;
      }
    };

    const interval = setInterval(scanFrame, 200); // 5 Hz scan rate
    return () => clearInterval(interval);
  }, [isScanning, isIpCamActive, ipCamStatus, ipCamAddress]);

  const handleApproachTarget = async (detectionId?: string) => {
    setIsApproaching(true);
    audioService.playBeep(980, 100);
    showNotification('Approaching confirmed target location in GUIDED mode...');
    try {
      const res = await reconDetectionService.requestTargetApproach(detectionId, 12.0, 2.5);
      showNotification(res.message);
    } catch (err: any) {
      showNotification(`Approach error: ${err?.message || 'Check link'}`);
    } finally {
      setIsApproaching(false);
    }
  };

  const handleRetryDecode = async (detectionId: string) => {
    showNotification('Retrying software contrast/binarization filters on saved photo...');
    audioService.playBeep(650, 60);
    const updated = await reconDetectionService.retryRecordDecode(detectionId);
    if (updated?.payload) {
      showNotification(`Decoded successfully: [${updated.payload}] ✓`);
      audioService.playBeep(1100, 120);
    } else {
      showNotification('Retry complete: QR code undecodable in this frame.');
    }
  };

  // Visual Status badge calculation
  const getStatusBadge = (status: GCSVisualStatus) => {
    switch (status) {
      case 'TARGET_LOCATION_CONFIRMED':
        return { label: 'TARGET LOCATION CONFIRMED', color: 'bg-emerald-600 text-white animate-pulse', icon: Target };
      case 'QR_DATA_EXTRACTED':
        return { label: 'QR DATA EXTRACTED', color: 'bg-emerald-500 text-white', icon: CheckCircle2 };
      case 'PHOTO_CAPTURED':
        return { label: 'PHOTO CAPTURED', color: 'bg-sky-600 text-white animate-pulse', icon: Camera };
      case 'PROCESSING_IMAGE':
        return { label: 'PROCESSING IMAGE', color: 'bg-amber-600 text-white animate-pulse', icon: RefreshCw };
      case 'QR_DETECTED':
        return { label: 'QR DETECTED', color: 'bg-amber-500 text-black animate-pulse', icon: Target };
      case 'GPS_UNAVAILABLE':
        return { label: 'GPS UNAVAILABLE', color: 'bg-rose-600 text-white animate-pulse', icon: AlertCircle };
      case 'COMMUNICATION_LOST':
        return { label: 'COMMUNICATION LOST', color: 'bg-red-700 text-white animate-pulse', icon: ShieldAlert };
      case 'CAMERA_CONNECTED':
        return { label: 'CAMERA CONNECTED', color: 'bg-slate-800 text-emerald-400', icon: Camera };
      case 'SEARCHING_FOR_QR':
      default:
        return { label: 'SEARCHING FOR QR', color: 'bg-slate-800 text-sky-400', icon: Scan };
    }
  };

  const statusBadge = getStatusBadge(visualStatus);
  const StatusIcon = statusBadge.icon;

  const handleFullscreen = () => {
    if (!containerRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      containerRef.current.requestFullscreen().catch(() => {});
    }
  };

  return (
    <Card
      title="DRONE-CORE CAMERA INTELLIGENCE"
      action={
        <div className="flex items-center gap-1.5 relative">
          {/* AERORECON 9-State Visual Status Badge */}
          <div
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] text-[10px] font-mono font-bold transition shadow-sm ${statusBadge.color}`}
            title="AERORECON Visual Intelligence State"
          >
            <StatusIcon className="w-3 h-3" />
            <span className="hidden sm:inline">{statusBadge.label}</span>
          </div>

          {/* Tab Navigation: STREAM | DETECTIONS ({n}) | TARGET */}
          <div className="flex items-center bg-[#161B22] p-0.5 rounded-[6px] border border-[var(--uav-card-border)] text-[10px] font-mono">
            <button
              type="button"
              onClick={() => setActiveTab('STREAM')}
              className={`px-2 py-0.5 rounded-[4px] font-bold transition cursor-pointer ${
                activeTab === 'STREAM' ? 'bg-[#10B981] text-black font-extrabold' : 'text-slate-400 hover:text-white'
              }`}
            >
              STREAM
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('DETECTIONS')}
              className={`px-2 py-0.5 rounded-[4px] font-bold transition cursor-pointer flex items-center gap-1 ${
                activeTab === 'DETECTIONS' ? 'bg-[#10B981] text-black font-extrabold' : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>ARCHIVE</span>
              {detections.length > 0 && (
                <span className="w-4 h-4 rounded-full bg-sky-500 text-white text-[9px] flex items-center justify-center">
                  {detections.length}
                </span>
              )}
            </button>
            {activeTarget && (
              <button
                type="button"
                onClick={() => setActiveTab('TARGET')}
                className={`px-2 py-0.5 rounded-[4px] font-bold transition cursor-pointer flex items-center gap-1 ${
                  activeTab === 'TARGET' ? 'bg-[#10B981] text-black font-extrabold' : 'text-emerald-400 hover:text-white'
                }`}
              >
                <span>TARGET</span>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              </button>
            )}
          </div>

          {/* Camera Config Button */}
          <button
            type="button"
            onClick={() => {
              setTempIpCamAddress(ipCamAddress);
              setShowIpCamConfig(true);
            }}
            className="p-1 rounded text-slate-400 hover:text-emerald-300 hover:bg-[#21262D] transition cursor-pointer"
            title="Configure Camera Stream IP & Settings"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        </div>
      }
      className={`h-[358px] shrink-0 select-none ${className}`}
      contentClassName="p-2 flex flex-col justify-between relative overflow-hidden"
    >
      {/* Action Notice Banner */}
      {actionNotice && (
        <div className="absolute top-3 inset-x-4 z-40 bg-[#161B22]/95 border border-sky-400 text-white px-3 py-1.5 rounded-lg shadow-xl flex items-center gap-2 text-[11px] font-mono animate-in fade-in">
          <CheckCircle2 className="w-3.5 h-3.5 text-sky-400 shrink-0" />
          <span className="truncate">{actionNotice}</span>
        </div>
      )}

      {/* VIEWPORT AREA: STREAM TAB */}
      {activeTab === 'STREAM' && (
        <div
          ref={containerRef}
          className="flex-1 rounded-[8px] border border-[var(--uav-card-border)] bg-black overflow-hidden relative flex items-center justify-center"
        >
          {isIpCamActive ? (
            <div className="w-full h-full relative flex items-center justify-center bg-black overflow-hidden">
              {/* Native Wide FOV (Fixed 1.0x - Zero Digital Zoom Distortion) */}
              <img
                key={`ip-cam-${streamReloadKey}-${useCors ? 'cors' : 'nocors'}`}
                ref={ipCamImgRef}
                src={getStreamUrl(ipCamAddress, ipCamMode)}
                alt="Drone Core Camera Live Stream"
                crossOrigin={useCors ? 'anonymous' : undefined}
                onLoad={() => setIpCamStatus('connected')}
                onError={() => {
                  if (useCors) setUseCors(false);
                  else setIpCamStatus('error');
                }}
                className="w-full h-full object-cover select-none"
              />

              {/* Tactical UAV HUD Telemetry Overlay */}
              <div className="absolute inset-0 pointer-events-none z-10 flex flex-col justify-between p-2 select-none">
                {/* Top OSD Bar */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-1.5 pointer-events-auto">
                    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-emerald-600/90 backdrop-blur-sm text-white font-mono font-bold text-[10px] tracking-wider uppercase shadow">
                      <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                      <span>DRONE CORE CAM</span>
                    </div>
                    <div className="px-2 py-0.5 rounded bg-black/60 border border-slate-700 text-sky-300 font-mono font-bold text-[10px]">
                      WIDE FOV (1.0x)
                    </div>
                  </div>

                  {/* Flight Telemetry Readout */}
                  <div className="bg-[#070D18]/85 backdrop-blur-sm border border-sky-500/40 rounded px-2.5 py-1 flex items-center gap-2.5 font-mono text-[10.5px] text-white shadow-lg pointer-events-auto">
                    <div className="flex items-center gap-1">
                      <span className="text-sky-400 font-bold">ALT</span>
                      <span className="font-bold">{(telemetry.altitudeMeters || 12.0).toFixed(1)}m</span>
                    </div>
                    <div className="w-[1px] h-3 bg-slate-700" />
                    <div className="flex items-center gap-1">
                      <span className="text-amber-400 font-bold">HDG</span>
                      <span className="font-bold">
                        {(telemetry.headingDeg || 0).toString().padStart(3, '0')}°
                        <span className="text-slate-300 ml-0.5 text-[9.5px] font-semibold">{getCardinal(telemetry.headingDeg || 0)}</span>
                      </span>
                    </div>
                    <div className="w-[1px] h-3 bg-slate-700" />
                    <div className="flex items-center gap-1">
                      <span className="text-emerald-400 font-bold">G-SPD</span>
                      <span className="font-bold">{(telemetry.speedMs || 0).toFixed(1)}m/s</span>
                    </div>
                  </div>
                </div>

                {/* Center Tactical Crosshair */}
                <div className="flex-1 flex items-center justify-center relative pointer-events-none">
                  <div className="relative w-16 h-16 flex items-center justify-center opacity-40">
                    <div className="w-4 h-[1px] bg-emerald-400 absolute left-0" />
                    <div className="w-4 h-[1px] bg-emerald-400 absolute right-0" />
                    <div className="h-4 w-[1px] bg-emerald-400 absolute top-0" />
                    <div className="h-4 w-[1px] bg-emerald-400 absolute bottom-0" />
                    <div className="w-1.5 h-1.5 border border-emerald-400 rounded-full" />
                  </div>

                  {/* Wide Detection Bounding Box Marker */}
                  {isScanning && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="w-44 h-44 border border-emerald-400/40 rounded-lg flex items-center justify-center relative">
                        <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] font-mono text-slate-300 bg-black/80 px-2 py-0.5 rounded border border-slate-700">
                          {latestDetection
                            ? `LAST: ${latestDetection.detectionId} [${latestDetection.status}]`
                            : 'SEARCHING FULL FRAME (10–15m AGL)'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Bottom OSD Bar: Mode, Battery, Latest Detection Preview */}
                <div className="flex items-center justify-between text-[9px] font-mono bg-[#0D1117]/85 backdrop-blur-sm border border-slate-800/80 rounded px-2.5 py-1 text-slate-300 pointer-events-auto">
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-400 font-bold">{telemetry.flightMode}</span>
                    <span>•</span>
                    <span>BAT {telemetry.batteryPercent}% ({(telemetry.batteryVoltage || 0).toFixed(1)}V)</span>
                    <span>•</span>
                    <span>GPS: {telemetry.isGpsValid ? `${telemetry.satellites} Sats` : 'UNAVAILABLE'}</span>
                  </div>

                  {latestDetection && (
                    <button
                      type="button"
                      onClick={() => setSelectedPhoto(latestDetection)}
                      className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-sky-950/80 hover:bg-sky-900 border border-sky-500/40 text-sky-300 cursor-pointer transition"
                    >
                      <Eye className="w-3 h-3" />
                      <span>LATEST PHOTO</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Connecting State */}
              {ipCamStatus === 'connecting' && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#070D18]/90 text-center p-3">
                  <RefreshCw className="w-6 h-6 text-sky-400 animate-spin mb-2" />
                  <span className="text-white text-[12px] font-mono font-bold">Connecting to Drone Camera...</span>
                  <span className="text-slate-400 text-[10px] font-mono mt-1 truncate max-w-xs">{ipCamAddress}</span>
                </div>
              )}

              {/* Error State */}
              {ipCamStatus === 'error' && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#0D1117]/95 text-center p-3">
                  <WifiOff className="w-7 h-7 text-rose-500 mb-1.5 animate-pulse" />
                  <span className="text-rose-400 text-[12px] font-bold">Drone Core Camera Offline</span>
                  <p className="text-slate-400 text-[10px] mt-1 max-w-xs leading-tight font-mono">
                    Cannot reach <span className="text-amber-300">{ipCamAddress}</span>. Check network link.
                  </p>
                  <div className="flex items-center gap-2 mt-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        setIpCamStatus('connecting');
                        setUseCors(true);
                        setStreamReloadKey((k) => k + 1);
                      }}
                      className="px-2.5 py-1 bg-[#10B981] hover:bg-[#059669] text-black text-[10px] font-bold rounded flex items-center gap-1 cursor-pointer"
                    >
                      <RefreshCw className="w-3 h-3" /> Retry
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowIpCamConfig(true)}
                      className="px-2.5 py-1 bg-[#21262D] hover:bg-[#30363D] text-slate-200 text-[10px] font-bold rounded flex items-center gap-1 cursor-pointer"
                    >
                      <Settings className="w-3 h-3" /> Change IP
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#0D1117] text-center p-4">
              <Smartphone className="w-8 h-8 text-slate-500 mb-2" />
              <span className="text-white text-[12px] font-bold">Camera Standby</span>
              <p className="text-slate-400 text-[10.5px] font-mono mt-1">Optical stream paused.</p>
              <button
                type="button"
                onClick={handleToggleIpCam}
                className="mt-3 px-3.5 py-1.5 bg-[#10B981] text-black text-[11px] font-mono font-bold rounded flex items-center gap-1.5 cursor-pointer"
              >
                Start Camera Stream
              </button>
            </div>
          )}
        </div>
      )}

      {/* VIEWPORT AREA: DETECTIONS ARCHIVE TAB */}
      {activeTab === 'DETECTIONS' && (
        <div className="flex-1 rounded-[8px] border border-[var(--uav-card-border)] bg-[#0D1117] p-2 flex flex-col gap-2 overflow-y-auto">
          <div className="flex items-center justify-between text-[11px] font-mono font-bold text-slate-300 border-b border-slate-800 pb-1">
            <span>CAPTURED RECON PHOTOS ({detections.length})</span>
            {detections.length > 0 && (
              <button
                type="button"
                onClick={() => reconDetectionService.clearAllDetections()}
                className="text-[10px] text-slate-500 hover:text-red-400 cursor-pointer"
              >
                Clear All
              </button>
            )}
          </div>

          {detections.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-500 text-[11px] font-mono p-4 text-center">
              <Camera className="w-6 h-6 mb-1 text-slate-600" />
              <span>No QR detections captured yet. Monitoring search area at 10–15m altitude.</span>
            </div>
          ) : (
            detections.map((rec) => (
              <div
                key={rec.detectionId}
                className="bg-[#11161D] border border-slate-800 hover:border-slate-700 rounded-lg p-2 flex items-center justify-between gap-2 text-[10.5px] font-mono transition"
              >
                {/* Photo Thumbnail */}
                <div
                  onClick={() => setSelectedPhoto(rec)}
                  className="w-12 h-10 rounded overflow-hidden bg-black border border-slate-700 shrink-0 cursor-pointer hover:border-sky-400 transition relative group"
                >
                  {rec.photoDataUrl ? (
                    <img src={rec.thumbnailDataUrl || rec.photoDataUrl} alt={rec.detectionId} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-600">
                      <Camera className="w-3 h-3" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                    <Eye className="w-3 h-3 text-white" />
                  </div>
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-white truncate">{rec.detectionId}</span>
                    <span
                      className={`text-[9px] px-1.5 py-0.2 rounded font-bold ${
                        rec.status === 'TARGET_LOCATION_CONFIRMED'
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40'
                          : rec.status === 'QR_DECODED'
                          ? 'bg-sky-950 text-sky-300 border border-sky-500/40'
                          : 'bg-amber-950 text-amber-300 border border-amber-500/40'
                      }`}
                    >
                      {rec.status}
                    </span>
                  </div>
                  <div className="text-slate-400 truncate text-[9.5px]">
                    {rec.payload ? `Payload: "${rec.payload}"` : 'QR Detected — Data Pending'}
                  </div>
                  <div className="text-[9px] text-slate-500">
                    Pixhawk GPS: {rec.gpsFixValid ? `${rec.droneLatitude.toFixed(4)}, ${rec.droneLongitude.toFixed(4)}` : 'UNAVAILABLE'}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  {rec.status === 'DECODE_FAILED' && (
                    <button
                      type="button"
                      onClick={() => handleRetryDecode(rec.detectionId)}
                      className="p-1 rounded bg-[#21262D] hover:bg-slate-700 text-amber-300 cursor-pointer"
                      title="Retry decoding saved image"
                    >
                      <RefreshCw className="w-3 h-3" />
                    </button>
                  )}
                  {rec.isTargetLocationConfirmed && (
                    <button
                      type="button"
                      onClick={() => handleApproachTarget(rec.detectionId)}
                      className="p-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"
                      title="Approach Target"
                    >
                      <Navigation className="w-3 h-3" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setSelectedPhoto(rec)}
                    className="p-1 rounded bg-[#21262D] hover:bg-slate-700 text-slate-300 hover:text-white cursor-pointer"
                    title="Inspect Photo & Telemetry"
                  >
                    <Eye className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* VIEWPORT AREA: TARGET INTEL TAB */}
      {activeTab === 'TARGET' && activeTarget && (
        <div className="flex-1 rounded-[8px] border border-emerald-500/40 bg-[#0D1117] p-3 flex flex-col justify-between overflow-y-auto">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-emerald-400 border-b border-emerald-500/30 pb-1.5">
              <div className="flex items-center gap-1.5">
                <Target className="w-4 h-4 animate-pulse" />
                <span className="font-orbitron font-bold text-[12px] text-white">CONFIRMED GROUND TARGET (CASE A)</span>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 border border-emerald-400 text-emerald-300 font-bold">
                {targetDist !== null ? `${targetDist}m AWAY` : 'DISTANCE PENDING'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px] font-mono bg-black/40 p-2.5 rounded border border-slate-800">
              <div>
                <span className="text-slate-400 block text-[9.5px]">TARGET LATITUDE</span>
                <span className="text-white font-bold">{activeTarget.latitude.toFixed(6)}°</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[9.5px]">TARGET LONGITUDE</span>
                <span className="text-white font-bold">{activeTarget.longitude.toFixed(6)}°</span>
              </div>
              {targetBearing !== null && (
                <div>
                  <span className="text-slate-400 block text-[9.5px]">BEARING FROM DRONE</span>
                  <span className="text-amber-300 font-bold">{targetBearing}°</span>
                </div>
              )}
              {activeTarget.altitude !== undefined && (
                <div>
                  <span className="text-slate-400 block text-[9.5px]">TARGET ALTITUDE</span>
                  <span className="text-sky-300 font-bold">{activeTarget.altitude}m</span>
                </div>
              )}
            </div>

            <p className="text-[10px] text-slate-400 font-mono leading-relaxed">
              Target GPS verified from QR payload. Mission controller movement request uses Pixhawk GUIDED mode (MAV_CMD_DO_REPOSITION) maintaining safe 10–15m altitude.
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={() => handleApproachTarget()}
              disabled={isApproaching}
              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-[11.5px] font-bold rounded flex items-center gap-2 cursor-pointer shadow transition active:scale-95"
            >
              <Navigation className="w-4 h-4" />
              <span>{isApproaching ? 'Approaching...' : 'Navigate Toward Target'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Bottom Tool Row */}
      <div className="flex items-center justify-between pt-2 px-6">
        <button
          type="button"
          onClick={() => {
            if (latestDetection) setSelectedPhoto(latestDetection);
            else showNotification('No photo captured yet');
          }}
          title="Inspect Latest Captured Photo"
          aria-label="Inspect Photo"
          className="p-1 text-[var(--uav-muted)] hover:text-white transition cursor-pointer active:scale-90"
        >
          <Camera className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => setIsRecording(!isRecording)}
          title={isRecording ? 'Stop Recording' : 'Start Recording Stream'}
          aria-label="Record Video"
          className={`p-1 transition cursor-pointer active:scale-90 ${
            isRecording ? 'text-red-500 animate-pulse' : 'text-[var(--uav-muted)] hover:text-white'
          }`}
        >
          <Video className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => setIsScanning(!isScanning)}
          title={isScanning ? 'Disable QR Target Scanner' : 'Enable QR Target Scanner'}
          aria-label="Target Scan"
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

      {/* Full-Screen Original Photo Inspection Modal */}
      {selectedPhoto && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#161B22] border border-slate-700 rounded-xl max-w-2xl w-full p-4 text-white shadow-2xl space-y-3 flex flex-col max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Camera className="w-4 h-4 text-sky-400" />
                <h3 className="font-orbitron font-bold text-[13px] text-white">ORIGINAL CAPTURED PHOTO &amp; TELEMETRY</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPhoto(null)}
                className="text-slate-400 hover:text-white p-1 rounded hover:bg-[#21262D] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 min-h-[200px] max-h-[340px] bg-black rounded-lg border border-slate-800 overflow-hidden flex items-center justify-center relative">
              {selectedPhoto.photoDataUrl ? (
                <img src={selectedPhoto.photoDataUrl} alt={selectedPhoto.detectionId} className="w-full h-full object-contain" />
              ) : (
                <div className="text-slate-500 font-mono text-[11px]">Original image data unavailable</div>
              )}
              <div className="absolute top-2 left-2 bg-black/75 px-2 py-0.5 rounded text-[10px] font-mono text-emerald-400 border border-slate-800">
                ORIGINAL RESOLUTION (NO ZOOM)
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10.5px] font-mono bg-[#11161D] p-2 rounded-lg border border-slate-800">
              <div>
                <span className="text-slate-400 block text-[9px]">DETECTION ID</span>
                <span className="text-white font-bold">{selectedPhoto.detectionId}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[9px]">STATUS</span>
                <span className="text-emerald-400 font-bold">{selectedPhoto.status}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[9px]">PIXHAWK LATITUDE</span>
                <span className="text-white font-bold">
                  {selectedPhoto.gpsFixValid ? `${selectedPhoto.droneLatitude.toFixed(6)}°` : 'UNAVAILABLE'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[9px]">PIXHAWK LONGITUDE</span>
                <span className="text-white font-bold">
                  {selectedPhoto.gpsFixValid ? `${selectedPhoto.droneLongitude.toFixed(6)}°` : 'UNAVAILABLE'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[9px]">ALTITUDE (AGL)</span>
                <span className="text-sky-300 font-bold">{selectedPhoto.droneAltitudeAgl.toFixed(1)}m</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[9px]">GPS FIX</span>
                <span className="text-white font-bold">
                  {selectedPhoto.gpsFixType} ({selectedPhoto.satellites} Sats)
                </span>
              </div>
              <div className="col-span-2">
                <span className="text-slate-400 block text-[9px]">DECODED PAYLOAD</span>
                <span className="text-emerald-300 font-bold break-all">{selectedPhoto.payload || 'Data Pending (Undecoded)'}</span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-[10px] text-slate-400 font-mono truncate max-w-sm">{selectedPhoto.notes}</span>
              <div className="flex items-center gap-2">
                {selectedPhoto.status === 'DECODE_FAILED' && (
                  <button
                    type="button"
                    onClick={() => handleRetryDecode(selectedPhoto.detectionId)}
                    className="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-black font-bold text-[11px] font-mono rounded cursor-pointer"
                  >
                    Retry Filters
                  </button>
                )}
                {selectedPhoto.isTargetLocationConfirmed && (
                  <button
                    type="button"
                    onClick={() => {
                      handleApproachTarget(selectedPhoto.detectionId);
                      setSelectedPhoto(null);
                    }}
                    className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] font-mono rounded flex items-center gap-1.5 cursor-pointer"
                  >
                    <Navigation className="w-3.5 h-3.5" />
                    <span>Approach Target</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedPhoto(null)}
                  className="px-3 py-1 bg-[#21262D] hover:bg-slate-700 text-slate-300 text-[11px] font-mono rounded cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Camera Configuration Modal */}
      {showIpCamConfig && (
        <div className="absolute inset-0 z-50 bg-[#0D1117]/95 backdrop-blur-md rounded-[10px] p-3.5 flex flex-col justify-between border border-emerald-500/50 shadow-2xl animate-in fade-in overflow-hidden">
          <div className="flex items-center justify-between pb-2 border-b border-[var(--uav-card-border)] shrink-0">
            <div className="flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-emerald-400" />
              <span className="font-bold text-[12px] text-white">Camera Connection Setup</span>
            </div>
            <button
              type="button"
              onClick={() => setShowIpCamConfig(false)}
              className="text-slate-400 hover:text-white p-1 rounded hover:bg-[#21262D] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleSaveIpCamConfig} className="my-2.5 space-y-2.5 overflow-y-auto pr-1 flex-1">
            <div>
              <label className="text-[10.5px] text-slate-300 font-mono block mb-1 font-semibold">
                Camera IP Address &amp; Port (e.g. 192.168.11.208:8080):
              </label>
              <input
                type="text"
                value={tempIpCamAddress}
                onChange={(e) => setTempIpCamAddress(e.target.value)}
                placeholder="192.168.11.208:8080"
                className="w-full bg-[#11161D] border border-[var(--uav-card-border)] focus:border-emerald-500 rounded px-3 py-1.5 text-[11.5px] font-mono text-white outline-none"
                autoFocus
              />
            </div>

            <div>
              <label className="text-[10.5px] text-slate-300 font-mono block mb-1 font-semibold">Stream Mode:</label>
              <div className="grid grid-cols-2 gap-2 text-[10.5px] font-mono">
                <button
                  type="button"
                  onClick={() => setIpCamMode('mjpeg')}
                  className={`p-2 rounded border text-left cursor-pointer transition ${
                    ipCamMode === 'mjpeg'
                      ? 'bg-[#10B981]/20 border-emerald-400 text-emerald-200'
                      : 'bg-[#11161D] border-[var(--uav-card-border)] text-slate-400'
                  }`}
                >
                  <div className="font-bold text-[11px]">MJPEG (/video)</div>
                  <div className="text-[9.5px] opacity-75">Live Stream Feed</div>
                </button>
                <button
                  type="button"
                  onClick={() => setIpCamMode('snapshot')}
                  className={`p-2 rounded border text-left cursor-pointer transition ${
                    ipCamMode === 'snapshot'
                      ? 'bg-[#10B981]/20 border-emerald-400 text-emerald-200'
                      : 'bg-[#11161D] border-[var(--uav-card-border)] text-slate-400'
                  }`}
                >
                  <div className="font-bold text-[11px]">Snapshot (/shot.jpg)</div>
                  <div className="text-[9.5px] opacity-75">Snapshot Loop</div>
                </button>
              </div>
            </div>
          </form>

          <div className="flex items-center justify-end gap-2.5 pt-2.5 border-t border-[var(--uav-card-border)] shrink-0">
            <button
              type="button"
              onClick={() => setShowIpCamConfig(false)}
              className="px-3.5 py-1.5 rounded bg-[#21262D] text-slate-300 hover:text-white text-[11px] font-mono cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => handleSaveIpCamConfig()}
              className="px-4 py-1.5 rounded bg-[#10B981] hover:bg-[#059669] text-emerald-950 text-[11px] font-mono font-bold cursor-pointer"
            >
              Save &amp; Connect
            </button>
          </div>
        </div>
      )}
    </Card>
  );
};
