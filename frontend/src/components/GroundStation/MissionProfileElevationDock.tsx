import React from 'react';
import { DroneTelemetry } from '../../types/mission';
import { LiveVideoFeed } from './LiveVideoFeed';

interface MissionProfileElevationDockProps {
  telemetry: DroneTelemetry;
  flightTimeStr: string;
  isMissionRunning: boolean;
  onStartResumeMission: () => void;
  onHoldMission: () => void;
  onAbortRTL: () => void;
  isPipVisible: boolean;
  onTogglePip: () => void;
  className?: string;
}

export const MissionProfileElevationDock: React.FC<MissionProfileElevationDockProps> = ({
  telemetry,
  flightTimeStr,
  isMissionRunning,
  onStartResumeMission,
  onHoldMission,
  onAbortRTL,
  isPipVisible,
  onTogglePip,
  className = ''
}) => {
  const currentAlt = Math.max(0, telemetry.altitude || 0);
  const targetAlt = telemetry.targetAltitude || 5.0;

  // Scale: 0 to 12m maps to SVG height 55 down to 10
  const uavSvgY = Math.max(10, Math.min(55, 55 - (currentAlt / 12) * 45));

  return (
    <div className={`flex items-end gap-2 select-none ${className}`}>
      {/* 1. PICTURE-IN-PICTURE (PIP) CAMERA RECON FEED */}
      {isPipVisible && (
        <div className="w-64 h-40 bg-[#1b1c1e]/95 backdrop-blur-md rounded-xl shadow-2xl border border-[#343537]/80 overflow-hidden flex flex-col shrink-0 relative group">
          {/* Live Video Feed Content */}
          <div className="w-full h-full relative overflow-hidden bg-black">
            <LiveVideoFeed className="w-full h-full object-cover" />

            {/* Tactical HUD Crosshair Overlay */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-12 h-12 border border-[#57df85]/60 rounded-full flex items-center justify-center">
                <div className="w-1.5 h-1.5 bg-[#57df85] rounded-full animate-ping" />
              </div>
              <div className="absolute w-full h-px bg-[#57df85]/20" />
              <div className="absolute h-full w-px bg-[#57df85]/20" />
            </div>

            {/* Target Box Tag */}
            <div className="absolute right-2 bottom-6 px-1.5 py-0.5 rounded bg-[#2f6fd6]/80 border border-[#aec6ff]/60 flex flex-col text-[8px] pointer-events-none">
              <span className="font-sans text-[#f8f8ff] font-bold">BOX 42 (94%)</span>
              <span className="font-mono text-[#57df85]">LOCKED</span>
            </div>
          </div>

          {/* Top Header Overlay */}
          <div className="absolute top-0 inset-x-0 p-1.5 bg-gradient-to-b from-black/80 to-transparent flex items-center justify-between text-white z-10">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#ffb4ab] animate-pulse" />
              <span className="font-sans text-[9px] uppercase font-bold tracking-wider text-slate-200">CAM 1 • GIMBAL -90°</span>
            </div>
            <button
              onClick={onTogglePip}
              className="w-5 h-5 rounded bg-black/50 hover:bg-black/90 flex items-center justify-center text-slate-300 hover:text-white transition-colors cursor-pointer"
              title="Close or Expand PiP"
            >
              <span className="material-symbols-outlined text-[13px]">close</span>
            </button>
          </div>

          {/* Bottom Details Footer */}
          <div className="absolute bottom-0 inset-x-0 px-2 py-0.5 bg-[#0d0e10]/90 backdrop-blur-xs flex items-center justify-between font-mono text-[9px] text-[#8c909e] z-10 border-t border-[#343537]/40">
            <span>1080p 60FPS</span>
            <span className="text-[#57df85]">LATENCY: 28ms</span>
          </div>
        </div>
      )}

      {/* 2. MISSION FLIGHT PROFILE / ELEVATION TIMELINE */}
      <div className="flex-1 bg-[#1b1c1e]/95 backdrop-blur-md rounded-xl shadow-2xl border border-[#343537]/80 p-2.5 flex flex-col gap-2">
        {/* Top Strip: Status Bar & Timer Floating Pill */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#aec6ff] text-[18px]">show_chart</span>
            <span className="font-sans text-[11px] uppercase font-bold tracking-wider text-slate-200">
              MISSION PROFILE &amp; ALTITUDE CROSS-SECTION
            </span>
          </div>

          {/* Center Mission Clock Pill */}
          <div className="px-3 py-0.5 rounded-full bg-[#292a2c] flex items-center gap-1.5 shadow-sm border border-[#343537]/50 font-mono text-[11px]">
            <span className="w-2 h-2 rounded-full bg-[#57df85] animate-pulse" />
            <span className="font-bold text-slate-200">
              TIME: <span className="text-[#57df85]">{flightTimeStr}</span>
            </span>
            <span className="text-slate-500">|</span>
            <span className="text-slate-400">TGT: {targetAlt.toFixed(1)}m</span>
          </div>

          {/* Emergency & Tactical Execution Bar */}
          <div className="flex items-center gap-1.5">
            {/* Start / Resume */}
            <button
              onClick={onStartResumeMission}
              className={`px-3 py-1 rounded font-sans text-[11px] font-bold uppercase tracking-wider flex items-center gap-1 transition-all active:scale-95 shadow-md cursor-pointer ${
                isMissionRunning
                  ? 'bg-[#292a2c] text-slate-400 border border-[#343537]'
                  : 'bg-[#008442] hover:bg-[#009e4f] text-[#e8ffe8]'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">play_arrow</span>
              <span>{isMissionRunning ? 'RUNNING' : 'START'}</span>
            </button>

            {/* Pause / Hold */}
            <button
              onClick={onHoldMission}
              className="px-3 py-1 rounded bg-[#ee9800] hover:bg-[#ffaa1a] text-[#5b3800] font-sans text-[11px] font-bold uppercase tracking-wider flex items-center gap-1 transition-all active:scale-95 shadow-md cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">pause</span>
              <span>HOLD</span>
            </button>

            {/* Abort & RTL (High Contrast) */}
            <button
              onClick={onAbortRTL}
              className="px-3 py-1 rounded bg-[#93000a] hover:bg-[#b3000c] text-[#ffdad6] hover:text-white font-sans text-[11px] font-bold uppercase tracking-wider flex items-center gap-1 transition-all active:scale-95 shadow-md cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">emergency</span>
              <span>ABORT &amp; RTL</span>
            </button>
          </div>
        </div>

        {/* Interactive SVG Altitude Elevation Profile & Speed Cross-Section */}
        <div className="w-full h-16 bg-[#0d0e10] rounded-lg p-1.5 relative overflow-hidden flex items-end border border-[#292a2c]">
          <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 800 60">
            <defs>
              <linearGradient id="altitude-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#aec6ff" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#aec6ff" stopOpacity="0.0" />
              </linearGradient>
              <linearGradient id="ground-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#343537" stopOpacity="0.6" />
                <stop offset="100%" stopColor="#121315" stopOpacity="0.8" />
              </linearGradient>
            </defs>

            {/* Ground Terrain Baseline */}
            <polygon points="0,58 120,54 260,56 420,50 600,52 800,55 800,60 0,60" fill="url(#ground-fill)" />
            <polyline points="0,58 120,54 260,56 420,50 600,52 800,55" fill="none" stroke="#424753" strokeWidth="1.5" />

            {/* Planned Altitude Profile Trajectory */}
            <polygon points="40,54 180,32 330,25 480,15 630,15 760,36 760,55 40,54" fill="url(#altitude-fill)" />
            <polyline points="40,54 180,32 330,25" fill="none" stroke="#57df85" strokeWidth="2" />
            <polyline points="330,25 480,15 630,15 760,36" fill="none" stroke="#ffb95f" strokeDasharray="4 4" strokeWidth="2" />

            {/* WP A Marker */}
            <line x1="180" y1="32" x2="180" y2="55" stroke="#424753" strokeDasharray="2 2" strokeWidth="1" />
            <circle cx="180" cy="32" r="3" fill="#57df85" />
            <text x="180" y="26" fill="#8c909e" fontFamily="JetBrains Mono" fontSize="8" textAnchor="middle">WP1: 5m</text>

            {/* Live UAV Altitude Marker */}
            <line x1="330" y1="0" x2="330" y2="60" stroke="#aec6ff" strokeDasharray="2 2" strokeWidth="1" />
            <circle cx="330" cy={uavSvgY} r="4" fill="#aec6ff" stroke="#002e6a" strokeWidth="1.5" />
            <circle cx="330" cy={uavSvgY} r="8" fill="none" stroke="#aec6ff" strokeWidth="1" className="animate-ping" />
            <text x="330" y={Math.max(10, uavSvgY - 10)} fill="#aec6ff" fontFamily="JetBrains Mono" fontSize="9" fontWeight="700" textAnchor="middle">
              UAV {currentAlt.toFixed(1)}m
            </text>

            {/* WP B Marker */}
            <line x1="480" y1="15" x2="480" y2="52" stroke="#424753" strokeDasharray="2 2" strokeWidth="1" />
            <circle cx="480" cy="15" r="3" fill="#2f6fd6" />
            <text x="480" y="10" fill="#aec6ff" fontFamily="JetBrains Mono" fontSize="8" textAnchor="middle">WP2: 8m</text>

            {/* WP C Marker */}
            <line x1="630" y1="15" x2="630" y2="52" stroke="#424753" strokeDasharray="2 2" strokeWidth="1" />
            <circle cx="630" cy="15" r="2.5" fill="#8c909e" />
            <text x="630" y="10" fill="#8c909e" fontFamily="JetBrains Mono" fontSize="8" textAnchor="middle">WP3: 8m</text>

            {/* WP D Marker */}
            <line x1="760" y1="36" x2="760" y2="55" stroke="#424753" strokeDasharray="2 2" strokeWidth="1" />
            <circle cx="760" cy="36" r="2.5" fill="#8c909e" />
            <text x="760" y="30" fill="#8c909e" fontFamily="JetBrains Mono" fontSize="8" textAnchor="middle">WP4: 5m</text>
          </svg>

          {/* Dynamic Grid Scale Indicators */}
          <div className="absolute left-2 top-1 font-mono text-[8px] text-[#8c909e]">ALT AGL (0m - 12m)</div>
          <div className="absolute right-2 bottom-1 font-mono text-[8px] text-[#8c909e]">DIST TO HOME: {((telemetry.distanceToHome || 0)).toFixed(0)}m</div>
        </div>
      </div>
    </div>
  );
};
