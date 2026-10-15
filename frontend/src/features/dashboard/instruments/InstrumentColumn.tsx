import React from 'react';
import { Card } from '../../../ui/Card';
import { DashboardTelemetryData } from '../../../hooks/useDashboardTelemetry';

interface InstrumentColumnProps {
  telemetry: DashboardTelemetryData;
}

const getHeadingCardinal = (deg: number): string => {
  const norm = ((deg % 360) + 360) % 360;
  if (norm >= 337.5 || norm < 22.5) return 'North';
  if (norm >= 22.5 && norm < 67.5) return 'North-East';
  if (norm >= 67.5 && norm < 112.5) return 'East';
  if (norm >= 112.5 && norm < 157.5) return 'South-East';
  if (norm >= 157.5 && norm < 202.5) return 'South';
  if (norm >= 202.5 && norm < 247.5) return 'South-West';
  if (norm >= 247.5 && norm < 292.5) return 'West';
  return 'North-West';
};

export const InstrumentColumn: React.FC<InstrumentColumnProps> = ({ telemetry }) => {
  const roll = telemetry.rollDeg || 0;
  const pitch = Math.max(-45, Math.min(45, telemetry.pitchDeg || 0));
  const heading = telemetry.headingDeg || 0;
  const alt = Math.max(0, telemetry.altitudeMeters || 0);
  const spd = Math.max(0, telemetry.speedMs || 0);

  // SVG Gauge calculations (Circumference of r=32 circle is 201)
  const arcCircumference = 201;
  const altPercent = Math.min(1, alt / 50); // Scale up to 50m
  const altOffset = arcCircumference * (1 - altPercent * 0.75);

  const spdPercent = Math.min(1, spd / 15); // Scale up to 15 m/s
  const spdOffset = arcCircumference * (1 - spdPercent * 0.75);

  return (
    <div className="flex flex-col gap-3 h-[540px] w-[287px] shrink-0 select-none">
      {/* 1. ATTITUDE (180 px) */}
      <Card
        title="ATTITUDE"
        collapsible
        className="h-[180px] shrink-0"
        contentClassName="p-2 flex flex-col items-center justify-center relative overflow-hidden"
      >
        <div className="w-28 h-28 rounded-full border-2 border-[var(--uav-card-border)] overflow-hidden relative shadow-inner bg-[#094182]">
          {/* Pitch & Roll Moving Disk */}
          <div
            className="absolute inset-[-40px] transition-transform duration-100 ease-out flex flex-col items-center justify-center pointer-events-none"
            style={{
              transform: `rotate(${-roll}deg) translateY(${pitch * 1.5}px)`,
            }}
          >
            {/* Sky (Upper half) */}
            <div className="w-full h-1/2 bg-[#094182]" />
            {/* Horizon Separation Line */}
            <div className="w-full h-[2px] bg-[var(--uav-amber)] shrink-0" />
            {/* Ground (Lower half) */}
            <div className="w-full h-1/2 bg-[#1b7a37]" />

            {/* Pitch Ladder Marks */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-2">
              <div className="w-8 h-[1px] bg-white/70" />
              <div className="w-14 h-[1px] bg-white/90" />
              <div className="w-20 h-[2px] bg-amber-400" />
              <div className="w-14 h-[1px] bg-white/90" />
              <div className="w-8 h-[1px] bg-white/70" />
            </div>
          </div>

          {/* Aircraft Fixed Center Crosshair Overlay */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            <div className="w-10 h-1 bg-[var(--uav-amber)] rounded-full shadow" />
            <div className="w-2.5 h-2.5 rounded-full border-2 border-[var(--uav-amber)] bg-black/40 absolute" />
          </div>
        </div>

        <div className="w-full flex justify-between items-center px-4 text-[10px] font-mono text-[var(--uav-muted)] mt-1.5">
          <span>ROLL {roll.toFixed(1)}°</span>
          <span>PITCH {pitch.toFixed(1)}°</span>
        </div>
      </Card>

      {/* 2. COMPASS / HEADING (156 px) */}
      <Card
        title="COMPASS / HEADING"
        collapsible
        className="h-[156px] shrink-0"
        contentClassName="p-2 flex items-center justify-between overflow-hidden"
      >
        <div className="w-24 h-24 rounded-full border-2 border-[var(--uav-card-border)] bg-[#0A1324] relative flex items-center justify-center ml-2 shadow-inner">
          <span className="absolute top-1 text-[9px] font-bold text-red-500 font-mono">N</span>
          <span className="absolute right-1 text-[9px] font-bold text-[var(--uav-muted)] font-mono">E</span>
          <span className="absolute bottom-1 text-[9px] font-bold text-[var(--uav-muted)] font-mono">S</span>
          <span className="absolute left-1 text-[9px] font-bold text-[var(--uav-muted)] font-mono">W</span>

          {/* Compass Dial Needle */}
          <div
            className="w-1.5 h-18 relative flex flex-col items-center justify-between transition-transform duration-150 ease-out"
            style={{ transform: `rotate(${heading}deg)` }}
          >
            <div className="w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-b-[24px] border-b-red-500" />
            <div className="w-2 h-2 rounded-full bg-white z-10" />
            <div className="w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[24px] border-t-slate-400" />
          </div>
        </div>

        <div className="flex flex-col items-center justify-center pr-6">
          <span className="text-[26px] font-bold text-[var(--uav-text)] font-sans leading-none font-orbitron">
            {heading}°
          </span>
          <span className="text-[12px] text-[var(--uav-muted)] font-sans mt-1">
            {getHeadingCardinal(heading)}
          </span>
          {/* Magnetometer Sensing Health Badge */}
          <div className="mt-2 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#0A1324] border border-[var(--uav-card-border)] text-[9.5px] font-mono" title={`Magnetometer: ${telemetry.isCompassHealthy ? 'Healthy & Calibrated' : 'Check I2C cable / Calibrate'}`}>
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                telemetry.isCompassHealthy ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'
              }`}
            />
            <span className="text-slate-300">
              MAG {telemetry.magFieldStrength || 480}mG
            </span>
          </div>
        </div>
      </Card>

      {/* 3. ALTITUDE & SPEED (181 px) */}
      <Card
        title="ALTITUDE & SPEED"
        collapsible
        className="h-[181px] shrink-0"
        contentClassName="p-2 flex items-center justify-around overflow-hidden"
      >
        {/* Altitude Radial Gauge */}
        <div className="flex flex-col items-center">
          <div className="w-20 h-20 relative flex items-center justify-center">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 76 76">
              <circle
                cx="38"
                cy="38"
                r="32"
                fill="none"
                stroke="#162744"
                strokeWidth="5"
              />
              <circle
                cx="38"
                cy="38"
                r="32"
                fill="none"
                stroke="#1F6FEB"
                strokeWidth="5"
                strokeDasharray={arcCircumference}
                strokeDashoffset={altOffset}
                strokeLinecap="round"
                className="transition-all duration-300"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[15px] font-bold font-mono text-white leading-none">
                {alt.toFixed(1)}
              </span>
              <span className="text-[9px] text-[var(--uav-muted)] font-mono">m</span>
            </div>
          </div>
          <span className="text-[10px] font-semibold tracking-wider text-[var(--uav-muted)] uppercase mt-1">
            ALTITUDE
          </span>
        </div>

        {/* Air Speed Radial Gauge */}
        <div className="flex flex-col items-center">
          <div className="w-20 h-20 relative flex items-center justify-center">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 76 76">
              <circle
                cx="38"
                cy="38"
                r="32"
                fill="none"
                stroke="#162744"
                strokeWidth="5"
              />
              <circle
                cx="38"
                cy="38"
                r="32"
                fill="none"
                stroke="#22C55E"
                strokeWidth="5"
                strokeDasharray={arcCircumference}
                strokeDashoffset={spdOffset}
                strokeLinecap="round"
                className="transition-all duration-300"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[15px] font-bold font-mono text-white leading-none">
                {spd.toFixed(1)}
              </span>
              <span className="text-[9px] text-[var(--uav-muted)] font-mono">m/s</span>
            </div>
          </div>
          <span className="text-[10px] font-semibold tracking-wider text-[var(--uav-muted)] uppercase mt-1">
            AIR SPEED
          </span>
        </div>
      </Card>
    </div>
  );
};
