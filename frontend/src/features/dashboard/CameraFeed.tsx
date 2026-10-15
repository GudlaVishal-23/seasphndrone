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
} from 'lucide-react';
import jsQR from 'jsqr';
import { Card } from '../../ui/Card';
import { visionService } from '../../services/visionService';
import { audioService } from '../../services/audioService';

interface CameraFeedProps {
  className?: string;
}

export const CameraFeed: React.FC<CameraFeedProps> = ({ className = '' }) => {
  const [resolution, setResolution] = useState('1080P');
  const [fps, setFps] = useState('30 FPS');
  const [showResMenu, setShowResMenu] = useState(false);
  const [showFpsMenu, setShowFpsMenu] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [detectedQr, setDetectedQr] = useState<string | null>(null);
  const [mediaStreamActive, setMediaStreamActive] = useState<boolean>(false);

  // Samsung Galaxy S24 IP Camera State
  const [isIpCamActive, setIsIpCamActive] = useState<boolean>(() => {
    return localStorage.getItem('sae_s24_ip_cam_enabled') === 'true';
  });
  const [ipCamAddress, setIpCamAddress] = useState<string>(() => {
    return localStorage.getItem('sae_s24_ip_cam_address') || '192.168.43.15:8080';
  });
  const [ipCamMode, setIpCamMode] = useState<'mjpeg' | 'snapshot'>(() => {
    return (localStorage.getItem('sae_s24_ip_cam_mode') as 'mjpeg' | 'snapshot') || 'mjpeg';
  });
  const [ipCamStatus, setIpCamStatus] = useState<'connected' | 'connecting' | 'error' | 'idle'>('idle');
  const [showIpCamConfig, setShowIpCamConfig] = useState<boolean>(false);
  const [tempIpCamAddress, setTempIpCamAddress] = useState<string>(ipCamAddress);
  const [streamReloadKey, setStreamReloadKey] = useState<number>(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const ipCamImgRef = useRef<HTMLImageElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

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
      setStreamReloadKey((k) => k + 1);
    }
  };

  // Initialize local webcam (when IP camera is OFF)
  useEffect(() => {
    if (isIpCamActive) {
      setIpCamStatus('connecting');
      return;
    }

    let stream: MediaStream | null = null;
    const startCam = async () => {
      try {
        const constraints: MediaStreamConstraints = {
          video: {
            width: resolution === '4K' ? 3840 : resolution === '1080P' ? 1920 : 1280,
            height: resolution === '4K' ? 2160 : resolution === '1080P' ? 1080 : 720,
            frameRate: parseInt(fps) || 30,
            facingMode: 'environment',
          },
        };
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
          setMediaStreamActive(true);
        }
      } catch (err) {
        setMediaStreamActive(false);
      }
    };

    startCam();

    return () => {
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [resolution, fps, isIpCamActive]);

  // QR detections subscriber from vision service
  useEffect(() => {
    const unsubQr = visionService.subscribeQR((qr) => {
      if (qr?.code) {
        setDetectedQr(qr.code);
        audioService.playBeep(1200, 120);
        setTimeout(() => setDetectedQr(null), 5000);
      }
    });
    return () => {
      unsubQr();
    };
  }, []);

  // Periodic QR scan for Samsung S24 stream
  useEffect(() => {
    if (!isScanning || !isIpCamActive || ipCamStatus !== 'connected') return;

    const scanCanvas = document.createElement('canvas');
    const scanCtx = scanCanvas.getContext('2d', { willReadFrequently: true });

    const scanInterval = setInterval(() => {
      const img = ipCamImgRef.current;
      if (!img || !img.complete || img.naturalWidth === 0 || !scanCtx) return;

      scanCanvas.width = 480;
      scanCanvas.height = 360;
      try {
        scanCtx.drawImage(img, 0, 0, scanCanvas.width, scanCanvas.height);
        const imgData = scanCtx.getImageData(0, 0, scanCanvas.width, scanCanvas.height);
        const code = jsQR(imgData.data, imgData.width, imgData.height);
        if (code && /^\d{2}$/.test(code.data.trim())) {
          setDetectedQr(code.data.trim());
          audioService.playBeep(1200, 120);
          setTimeout(() => setDetectedQr(null), 5000);
        }
      } catch {
        // Cross-origin read security handling
      }
    }, 450);

    return () => clearInterval(scanInterval);
  }, [isScanning, isIpCamActive, ipCamStatus]);

  // Snapshot photo capture (works with both Samsung S24 & Local camera)
  const handleTakeSnapshot = () => {
    audioService.playBeep(980, 80);
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let captured = false;

    // 1. Capture from Samsung S24 IP Camera if active
    if (isIpCamActive && ipCamImgRef.current && ipCamStatus === 'connected') {
      try {
        ctx.drawImage(ipCamImgRef.current, 0, 0, canvas.width, canvas.height);
        captured = true;
      } catch {
        captured = false;
      }
    }

    // 2. Capture from local video if active
    if (!captured && videoRef.current && mediaStreamActive) {
      try {
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        captured = true;
      } catch {
        captured = false;
      }
    }

    // 3. Fallback Tactical Snapshot card
    if (!captured) {
      ctx.fillStyle = '#070D18';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#0284C7';
      ctx.font = 'bold 32px sans-serif';
      ctx.fillText('SAE INDIA DRONE OPTICAL SNAPSHOT', 50, 100);
      ctx.font = '22px monospace';
      ctx.fillStyle = '#94A3B8';
      ctx.fillText(`Source: ${isIpCamActive ? `Samsung S24 (${ipCamAddress})` : 'Tactical Sensor'}`, 50, 160);
      ctx.fillText(`Timestamp: ${new Date().toISOString()}`, 50, 200);
    }

    const dataUrl = canvas.toDataURL('image/jpeg');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `drone_snap_${isIpCamActive ? 'samsung_s24_' : ''}${Date.now()}.jpg`;
    a.click();
  };

  // Toggle video recording
  const handleToggleRecord = () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      audioService.playBeep(500, 100);
    } else {
      if (videoRef.current && (videoRef.current.srcObject as MediaStream)) {
        try {
          const stream = videoRef.current.srcObject as MediaStream;
          const recorder = new MediaRecorder(stream);
          recordedChunksRef.current = [];
          recorder.ondataavailable = (e) => {
            if (e.data.size > 0) recordedChunksRef.current.push(e.data);
          };
          recorder.onstop = () => {
            const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `drone_rec_${Date.now()}.webm`;
            a.click();
            URL.revokeObjectURL(url);
          };
          recorder.start();
          mediaRecorderRef.current = recorder;
          setIsRecording(true);
          audioService.playBeep(880, 100);
        } catch {
          setIsRecording(false);
        }
      } else {
        alert(
          isIpCamActive
            ? 'IP camera stream active. Use snapshot button to save high-res imagery from Samsung S24.'
            : 'Active camera stream required to start recording.'
        );
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

  return (
    <Card
      title="CAMERA FEED"
      action={
        <div className="flex items-center gap-1.5 relative">
          {/* Samsung S24 IP Cam ON/OFF Toggle Button */}
          <div className="flex items-center gap-1 bg-[#091120] p-0.5 rounded-[6px] border border-[var(--uav-card-border)]">
            <button
              type="button"
              onClick={handleToggleIpCam}
              className={`flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] text-[10px] font-mono font-bold transition cursor-pointer ${
                isIpCamActive
                  ? 'bg-emerald-600 text-white shadow-[0_0_8px_rgba(34,197,94,0.4)] animate-pulse'
                  : 'bg-[#132238] text-slate-400 hover:text-white'
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
              className="p-1 rounded text-slate-400 hover:text-sky-300 hover:bg-[#132238] transition cursor-pointer"
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
              className="flex items-center gap-1 px-2 py-0.5 rounded-[6px] border border-[var(--uav-card-border)] bg-[#0B1322] hover:bg-[#132238] text-[11px] font-mono text-[var(--uav-text)] cursor-pointer"
            >
              <span>{resolution}</span>
              <ChevronDown className="w-3 h-3 text-[var(--uav-muted)]" />
            </button>
            {showResMenu && (
              <div className="absolute right-0 top-full mt-1 z-50 bg-[#0B1322] border border-[var(--uav-card-border)] rounded shadow-xl py-1 text-[11px] font-mono w-20">
                {['720P', '1080P', '4K'].map((res) => (
                  <button
                    key={res}
                    type="button"
                    onClick={() => {
                      setResolution(res);
                      setShowResMenu(false);
                    }}
                    className="w-full text-left px-2 py-1 hover:bg-[#1F6FEB] hover:text-white text-slate-200"
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
              className="flex items-center gap-1 px-2 py-0.5 rounded-[6px] border border-[var(--uav-card-border)] bg-[#0B1322] hover:bg-[#132238] text-[11px] font-mono text-[var(--uav-text)] cursor-pointer"
            >
              <span>{fps}</span>
              <ChevronDown className="w-3 h-3 text-[var(--uav-muted)]" />
            </button>
            {showFpsMenu && (
              <div className="absolute right-0 top-full mt-1 z-50 bg-[#0B1322] border border-[var(--uav-card-border)] rounded shadow-xl py-1 text-[11px] font-mono w-22">
                {['15 FPS', '30 FPS', '60 FPS'].map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => {
                      setFps(f);
                      setShowFpsMenu(false);
                    }}
                    className="w-full text-left px-2 py-1 hover:bg-[#1F6FEB] hover:text-white text-slate-200"
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
      {/* Video Viewport Area */}
      <div
        ref={containerRef}
        className="flex-1 rounded-[8px] border border-[var(--uav-card-border)] bg-black overflow-hidden relative flex items-center justify-center"
      >
        {/* CASE 1: Samsung S24 IP Camera Feed (When ON) */}
        {isIpCamActive ? (
          <div className="w-full h-full relative flex items-center justify-center bg-black overflow-hidden">
            <img
              key={`ip-cam-${streamReloadKey}`}
              ref={ipCamImgRef}
              src={getStreamUrl(ipCamAddress, ipCamMode)}
              alt="Samsung S24 IP Camera Feed"
              crossOrigin="anonymous"
              onLoad={() => {
                setIpCamStatus('connected');
                setMediaStreamActive(true);
              }}
              onError={() => {
                setIpCamStatus('error');
              }}
              className="w-full h-full object-cover select-none"
            />

            {/* Samsung S24 LIVE Badge */}
            {ipCamStatus === 'connected' && (
              <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] bg-emerald-600 text-white font-sans font-bold text-[10px] tracking-wider uppercase shadow-md animate-in fade-in">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                <span>SAMSUNG S24 LIVE</span>
              </div>
            )}

            {/* Connecting State Overlay */}
            {ipCamStatus === 'connecting' && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#070D18]/90 text-center p-3 animate-in fade-in">
                <RefreshCw className="w-6 h-6 text-sky-400 animate-spin mb-2" />
                <span className="text-white text-[12px] font-mono font-bold">Connecting to Samsung S24...</span>
                <span className="text-slate-400 text-[10px] font-mono mt-1 truncate max-w-xs">
                  {getStreamUrl(ipCamAddress, ipCamMode)}
                </span>
              </div>
            )}

            {/* Offline / Connection Error Overlay */}
            {ipCamStatus === 'error' && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#070D18]/95 text-center p-3 animate-in fade-in">
                <WifiOff className="w-7 h-7 text-rose-500 mb-1.5 animate-pulse" />
                <span className="text-rose-400 text-[12px] font-bold font-sans">Samsung S24 Camera Offline</span>
                <p className="text-slate-400 text-[10px] mt-1 max-w-xs leading-tight">
                  Cannot reach <span className="text-amber-300 font-mono">{ipCamAddress}</span>. Ensure phone is on the same hotspot and 'Start Server' is running in IP Webcam.
                </p>
                <div className="flex items-center gap-2 mt-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setIpCamStatus('connecting');
                      setStreamReloadKey((k) => k + 1);
                    }}
                    className="px-2.5 py-1 bg-sky-600 hover:bg-sky-500 text-white text-[10px] font-bold rounded flex items-center gap-1 cursor-pointer transition active:scale-95"
                  >
                    <RefreshCw className="w-3 h-3" /> Retry
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowIpCamConfig(true)}
                    className="px-2.5 py-1 bg-[#162744] hover:bg-[#20365c] text-slate-200 text-[10px] font-bold rounded flex items-center gap-1 cursor-pointer transition active:scale-95"
                  >
                    <Settings className="w-3 h-3" /> Change IP
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* CASE 2: Standard Local Video Element / Fallback (When IP Camera is OFF) */
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover ${mediaStreamActive ? 'block' : 'hidden'}`}
            />

            {!mediaStreamActive && (
              <div
                className="absolute inset-0 bg-cover bg-center"
                style={{
                  backgroundImage: `url('https://images.unsplash.com/photo-1508614589041-895b88991e3e?auto=format&fit=crop&w=800&q=80')`,
                  filter: 'contrast(1.05) brightness(0.95)',
                }}
              />
            )}

            {/* Standard LIVE Badge */}
            <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] bg-[#16A34A] text-white font-sans font-bold text-[10px] tracking-wider uppercase shadow-md">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              <span>LIVE</span>
            </div>
          </>
        )}

        {/* Recording active badge */}
        {isRecording && (
          <div className="absolute top-2 right-2 z-10 flex items-center gap-1 px-2 py-0.5 rounded bg-red-600 text-white font-sans font-bold text-[10px] tracking-wider uppercase animate-pulse shadow-md">
            <span>● REC</span>
          </div>
        )}

        {/* Scanning Target Crosshairs Overlay */}
        {isScanning && (
          <div className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center">
            <div className="w-32 h-32 border-2 border-emerald-400 border-dashed rounded-lg animate-pulse relative">
              <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-mono text-emerald-400 bg-black/70 px-1 rounded whitespace-nowrap">
                SCANNING QR (S24 CAM)
              </span>
            </div>
          </div>
        )}

        {/* QR Code Decoded Banner */}
        {detectedQr && (
          <div className="absolute bottom-3 inset-x-3 z-20 bg-emerald-950/95 border border-emerald-500 text-emerald-200 px-3 py-1.5 rounded-lg text-center font-mono text-[12px] font-bold shadow-xl animate-in fade-in">
            QR CODE VERIFIED: [{detectedQr}]
          </div>
        )}
      </div>

      {/* Bottom Tool Row */}
      <div className="flex items-center justify-between pt-2 px-6">
        <button
          type="button"
          onClick={handleTakeSnapshot}
          title={isIpCamActive ? 'Take Snapshot from Samsung S24 (Save JPG)' : 'Take Snapshot (Save JPG)'}
          aria-label="Take Snapshot"
          className="p-1 text-[var(--uav-muted)] hover:text-white transition cursor-pointer active:scale-90"
        >
          <Camera className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={handleToggleRecord}
          title={isRecording ? 'Stop Recording' : 'Start Recording Video'}
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
          title="Toggle Target Scan / QR Servo Lock"
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
        <div className="absolute inset-0 z-50 bg-[#070D18]/95 backdrop-blur-md rounded-[10px] p-3.5 flex flex-col justify-between border border-sky-500/50 shadow-2xl animate-in fade-in overflow-hidden">
          <div className="flex items-center justify-between pb-2 border-b border-[var(--uav-card-border)] shrink-0">
            <div className="flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-sky-400" />
              <span className="font-bold text-[12px] text-white">Samsung S24 IP Camera Setup</span>
            </div>
            <button
              type="button"
              onClick={() => setShowIpCamConfig(false)}
              className="text-slate-400 hover:text-white p-1 rounded hover:bg-[#132238] transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleSaveIpCamConfig} className="my-2.5 space-y-2.5 overflow-y-auto pr-1 flex-1">
            <div>
              <label className="text-[10.5px] text-slate-300 font-mono block mb-1 font-semibold">
                Phone IP Address &amp; Port (e.g. 192.168.43.15:8080):
              </label>
              <input
                type="text"
                value={tempIpCamAddress}
                onChange={(e) => setTempIpCamAddress(e.target.value)}
                placeholder="192.168.43.15:8080"
                className="w-full bg-[#0B1322] border border-[var(--uav-card-border)] focus:border-sky-500 focus:ring-1 focus:ring-sky-500 rounded px-3 py-1.5 text-[11.5px] font-mono text-white outline-none"
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
                      ? 'bg-sky-600/30 border-sky-400 text-sky-200 ring-1 ring-sky-400/50'
                      : 'bg-[#0B1322] border-[var(--uav-card-border)] text-slate-400 hover:border-slate-600'
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
                      ? 'bg-sky-600/30 border-sky-400 text-sky-200 ring-1 ring-sky-400/50'
                      : 'bg-[#0B1322] border-[var(--uav-card-border)] text-slate-400 hover:border-slate-600'
                  }`}
                >
                  <div className="font-bold text-[11px]">Snapshot (/shot.jpg)</div>
                  <div className="text-[9.5px] opacity-75">Ultra-compatible Loop</div>
                </button>
              </div>
            </div>

            <div className="text-[9.5px] text-slate-400 bg-[#0B1322] p-2 rounded border border-[var(--uav-card-border)] font-mono leading-relaxed">
              <span className="text-sky-300 font-bold block mb-0.5">Quick Setup Guide:</span>
              1. Mount Samsung S24 on drone, connected to laptop hotspot.<br />
              2. Open <span className="text-white font-bold">IP Webcam</span> on phone &amp; tap <span className="text-emerald-400 font-bold">Start Server</span>.<br />
              3. Stream URL: <span className="text-emerald-300 font-bold break-all">{getStreamUrl(tempIpCamAddress, ipCamMode)}</span>
            </div>
          </form>

          <div className="flex items-center justify-end gap-2.5 pt-2.5 border-t border-[var(--uav-card-border)] shrink-0">
            <button
              type="button"
              onClick={() => setShowIpCamConfig(false)}
              className="px-3.5 py-1.5 rounded bg-[#132238] hover:bg-[#1c3252] text-slate-300 hover:text-white text-[11px] font-mono cursor-pointer transition active:scale-95"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => handleSaveIpCamConfig()}
              className="px-4 py-1.5 rounded bg-sky-600 hover:bg-sky-500 text-white text-[11px] font-mono font-bold cursor-pointer transition active:scale-95 shadow-md shadow-sky-600/30"
            >
              Save &amp; Connect S24
            </button>
          </div>
        </div>
      )}
    </Card>
  );
};
