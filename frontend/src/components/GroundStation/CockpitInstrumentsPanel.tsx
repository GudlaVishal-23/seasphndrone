import React from 'react';
import { DroneTelemetry } from '../../types/mission';

interface CockpitInstrumentsPanelProps {
  telemetry: DroneTelemetry;
  flightTimeStr?: string;
  onOpenSettings?: () => void;
  className?: string;
}

export const CockpitInstrumentsPanel: React.FC<CockpitInstrumentsPanelProps> = ({
  telemetry,
  flightTimeStr = '00:02:32',
  onOpenSettings,
  className = ''
}) => {
  const pitch = Math.max(-45, Math.min(45, telemetry.pitch || 0));
  const roll = Math.max(-60, Math.min(60, telemetry.roll || 0));
  const heading = Math.round((telemetry.heading || 0) % 360);
  const alt = Math.max(0, telemetry.altitude || 0);
  const targetAlt = telemetry.targetAltitude || 5.0;
  const speed = Math.max(0, telemetry.groundSpeed || 0);
  const vSpeed = telemetry.verticalSpeed || 0;

  // Arc calculations (Circumference of r=38 is 2 * PI * 38 = 238.76)
  const CIRCUMFERENCE = 238.76;
  const altArcOffset = CIRCUMFERENCE - Math.min(1, alt / 15.0) * CIRCUMFERENCE;
  const targetAltArcOffset = CIRCUMFERENCE - Math.min(1, targetAlt / 15.0) * CIRCUMFERENCE;
  const speedArcOffset = CIRCUMFERENCE - Math.min(1, speed / 8.0) * CIRCUMFERENCE;

  return (
    <div className={`w-80 bg-[#1b1c1e]/95 backdrop-blur-md rounded-xl shadow-2xl border border-[#343537]/80 overflow-hidden flex flex-col text-slate-100 select-none ${className}`}>
      {/* Panel Header */}
      <div className="px-3 py-2 bg-[#1f2022] border-b border-[#343537]/80 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="material-symbols-outlined text-[#aec6ff] text-[18px]">speed</span>
          <span className="font-sans text-[11px] uppercase tracking-wider text-slate-200 font-bold">INSTRUMENTS</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-[#0d0e10] px-2 py-0.5 rounded text-[#57df85] font-mono text-[10px] font-semibold border border-[#343537]/50">
            <span className="material-symbols-outlined text-[12px]">schedule</span>
            <span>{flightTimeStr}</span>
          </div>
          {onOpenSettings && (
            <button
              onClick={onOpenSettings}
              className="w-6 h-6 rounded flex items-center justify-center text-slate-400 hover:text-white hover:bg-[#292a2c] transition-colors"
              title="Instrument Settings"
            >
              <span className="material-symbols-outlined text-[16px]">tune</span>
            </button>
          )}
        </div>
      </div>

      {/* Quick Status Sub-Strip */}
      <div className="px-3 py-1.5 bg-[#0d0e10]/90 flex items-center justify-between text-slate-400 font-mono text-[10px] border-b border-[#343537]/60">
        <div className="flex items-center gap-1">
          <span className="text-[#57df85] font-semibold">BATT:</span>
          <span className="text-slate-200">{telemetry.batteryPercent || 88}% ({(telemetry.batteryVoltage || 12.4).toFixed(1)}V)</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[#aec6ff] font-semibold">V/S:</span>
          <span className={`font-semibold ${vSpeed >= 0 ? 'text-[#57df85]' : 'text-[#ffb4ab]'}`}>
            {vSpeed >= 0 ? '+' : ''}{vSpeed.toFixed(1)} m/s
          </span>
        </div>
      </div>

      {/* 2x2 Clean Flat Vector Instrument Gauges */}
      <div className="p-2.5 grid grid-cols-2 gap-2 bg-[#1b1c1e]">
        {/* 1. ATTITUDE INDICATOR (Artificial Horizon) */}
        <div className="flex flex-col items-center bg-[#0d0e10] rounded-lg p-2 border border-[#292a2c] shadow-inner">
          <div className="w-full flex justify-between items-center mb-1">
            <span className="font-sans text-[9px] uppercase tracking-wider text-slate-400 font-semibold">ATTITUDE</span>
            <span className="font-mono text-[9px] text-[#57df85]">PITCH {pitch.toFixed(0)}°</span>
          </div>
          <div className="w-24 h-24 rounded-full overflow-hidden relative flex items-center justify-center bg-[#343537] shadow-md border border-[#424753]">
            {/* Horizon Disk: Sky Blue / Ground Brown with dynamic Roll & Pitch */}
            <div
              className="absolute inset-0 origin-center flex flex-col transition-transform duration-75 ease-out"
              style={{
                transform: `rotate(${roll}deg) translateY(${pitch * -1.2}px)`
              }}
            >
              <div className="w-full h-1/2 bg-[#2f6fd6]/90 border-b border-white" />
              <div className="w-full h-1/2 bg-[#5b3800]" />
              {/* Pitch ladder markings */}
              <div className="absolute top-[35%] left-1/2 -translate-x-1/2 w-5 h-0.5 bg-white/70" />
              <div className="absolute top-[65%] left-1/2 -translate-x-1/2 w-5 h-0.5 bg-white/70" />
            </div>
            {/* Center Aircraft Reticle Symbol */}
            <div className="relative z-10 flex items-center pointer-events-none">
              <div className="w-3.5 h-1 bg-[#ffb95f] rounded-l" />
              <div className="w-2.5 h-2.5 rounded-full border-2 border-[#ffb95f] bg-transparent mx-0.5" />
              <div className="w-3.5 h-1 bg-[#ffb95f] rounded-r" />
            </div>
            {/* Roll Scale Ticks */}
            <div className="absolute top-1 w-1 h-1.5 bg-white/80 pointer-events-none" />
          </div>
          <span className="font-sans text-[8px] uppercase tracking-tight text-slate-400 mt-1 font-semibold">
            ROLL {Math.abs(roll).toFixed(0)}° {roll >= 0 ? 'R' : 'L'}
          </span>
        </div>

        {/* 2. HEADING / COMPASS ROSE */}
        <div className="flex flex-col items-center bg-[#0d0e10] rounded-lg p-2 border border-[#292a2c] shadow-inner">
          <div className="w-full flex justify-between items-center mb-1">
            <span className="font-sans text-[9px] uppercase tracking-wider text-slate-400 font-semibold">HEADING</span>
            <span className="font-mono text-[10px] text-[#aec6ff] font-bold">{heading.toString().padStart(3, '0')}°</span>
          </div>
          <div className="w-24 h-24 rounded-full relative flex items-center justify-center bg-[#292a2c] shadow-md border border-[#424753]">
            {/* Rotating Compass Dial */}
            <svg className="w-full h-full p-1" viewBox="0 0 100 100">
              <circle cx="50" cy="50" fill="none" r="44" stroke="#343537" strokeWidth="2" />
              {/* Cardinal Ticks */}
              <text x="50" y="16" fill="#ffb4ab" fontFamily="Inter" fontSize="9" fontWeight="700" textAnchor="middle">N</text>
              <text x="86" y="53" fill="#e3e2e4" fontFamily="Inter" fontSize="9" fontWeight="600" textAnchor="middle">E</text>
              <text x="50" y="90" fill="#e3e2e4" fontFamily="Inter" fontSize="9" fontWeight="600" textAnchor="middle">S</text>
              <text x="14" y="53" fill="#e3e2e4" fontFamily="Inter" fontSize="9" fontWeight="600" textAnchor="middle">W</text>
              <line x1="50" y1="8" x2="50" y2="11" stroke="#8c909e" strokeWidth="1.5" />
              <line x1="92" y1="50" x2="89" y2="50" stroke="#8c909e" strokeWidth="1.5" />
              <line x1="50" y1="92" x2="50" y2="89" stroke="#8c909e" strokeWidth="1.5" />
              <line x1="8" y1="50" x2="11" y2="50" stroke="#8c909e" strokeWidth="1.5" />
              {/* Heading Needle pointing to current heading */}
              <g transform={`rotate(${heading} 50 50)`} className="transition-transform duration-100 ease-out">
                <polygon points="50,14 46,50 54,50" fill="#57df85" />
                <polygon points="50,86 47,50 53,50" fill="#8c909e" />
                <circle cx="50" cy="50" r="3.5" fill="#121315" stroke="#57df85" strokeWidth="1.5" />
              </g>
            </svg>
          </div>
          <span className="font-sans text-[8px] uppercase tracking-tight text-slate-400 mt-1 font-semibold">MAG FIXED</span>
        </div>

        {/* 3. ALTITUDE DIAL GAUGE */}
        <div className="flex flex-col items-center bg-[#0d0e10] rounded-lg p-2 border border-[#292a2c] shadow-inner">
          <div className="w-full flex justify-between items-center mb-1">
            <span className="font-sans text-[9px] uppercase tracking-wider text-slate-400 font-semibold">ALTITUDE</span>
            <span className="font-mono text-[9px] text-slate-400">TGT {targetAlt.toFixed(1)}m</span>
          </div>
          <div className="w-24 h-24 rounded-full relative flex flex-col items-center justify-center bg-[#292a2c] shadow-md border border-[#424753]">
            <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" fill="none" r="38" stroke="#1f2022" strokeWidth="5" />
              {/* Target arc */}
              <circle
                cx="50"
                cy="50"
                fill="none"
                opacity="0.35"
                r="38"
                stroke="#2f6fd6"
                strokeDasharray={CIRCUMFERENCE}
                strokeDashoffset={targetAltArcOffset}
                strokeWidth="5"
              />
              {/* Live altitude arc */}
              <circle
                cx="50"
                cy="50"
                fill="none"
                r="38"
                stroke="#57df85"
                strokeDasharray={CIRCUMFERENCE}
                strokeDashoffset={altArcOffset}
                strokeLinecap="round"
                strokeWidth="5"
                className="transition-all duration-150 ease-out"
              />
            </svg>
            <span className="font-mono text-[20px] leading-none text-white font-bold">{alt.toFixed(1)}</span>
            <span className="font-sans text-[8px] text-[#57df85] font-semibold uppercase mt-0.5 tracking-wider">M (AGL)</span>
          </div>
          <span className="font-sans text-[8px] uppercase tracking-tight text-slate-400 mt-1 font-semibold">
            MSL {(alt + 38.2).toFixed(1)}m
          </span>
        </div>

        {/* 4. AIRSPEED / GROUNDSPEED GAUGE */}
        <div className="flex flex-col items-center bg-[#0d0e10] rounded-lg p-2 border border-[#292a2c] shadow-inner">
          <div className="w-full flex justify-between items-center mb-1">
            <span className="font-sans text-[9px] uppercase tracking-wider text-slate-400 font-semibold">AIRSPEED</span>
            <span className="font-mono text-[9px] text-slate-300">GS {speed.toFixed(1)}</span>
          </div>
          <div className="w-24 h-24 rounded-full relative flex flex-col items-center justify-center bg-[#292a2c] shadow-md border border-[#424753]">
            <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" fill="none" r="38" stroke="#1f2022" strokeWidth="5" />
              {/* Safe flight envelope arc */}
              <circle
                cx="50"
                cy="50"
                fill="none"
                opacity="0.3"
                r="38"
                stroke="#ee9800"
                strokeDasharray={CIRCUMFERENCE}
                strokeDashoffset="140"
                strokeWidth="5"
              />
              {/* Current airspeed arc */}
              <circle
                cx="50"
                cy="50"
                fill="none"
                r="38"
                stroke="#aec6ff"
                strokeDasharray={CIRCUMFERENCE}
                strokeDashoffset={speedArcOffset}
                strokeLinecap="round"
                strokeWidth="5"
                className="transition-all duration-150 ease-out"
              />
            </svg>
            <span className="font-mono text-[20px] leading-none text-white font-bold">{speed.toFixed(1)}</span>
            <span className="font-sans text-[8px] text-[#aec6ff] font-semibold uppercase mt-0.5 tracking-wider">M/S (GS)</span>
          </div>
          <span className="font-sans text-[8px] uppercase tracking-tight text-slate-400 mt-1 font-semibold">
            WIND 1.2 M/S
          </span>
        </div>
      </div>
    </div>
  );
};
