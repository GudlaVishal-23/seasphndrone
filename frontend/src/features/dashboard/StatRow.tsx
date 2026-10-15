import React from 'react';
import {
  ShieldCheck,
  Satellite,
  Battery,
  Mountain,
  Gauge,
  Compass,
  Clock,
} from 'lucide-react';
import { StatTile } from '../../ui/StatTile';
import { DashboardTelemetryData } from '../../hooks/useDashboardTelemetry';

interface StatRowProps {
  telemetry: DashboardTelemetryData;
  className?: string;
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

export const StatRow: React.FC<StatRowProps> = ({ telemetry, className = '' }) => {
  const isArmed = telemetry.isArmed;

  const batteryColor =
    telemetry.batteryPercent <= 20
      ? 'text-[#EF4444]'
      : telemetry.batteryPercent <= 35
      ? 'text-[var(--uav-amber)]'
      : 'text-[#22C55E]';

  const modeColor = !isArmed
    ? 'text-slate-400'
    : telemetry.flightMode === 'RTL'
    ? 'text-rose-400 animate-pulse'
    : 'text-[#22C55E]';

  return (
    <div
      className={`grid grid-cols-7 gap-3 h-[66px] items-stretch select-none ${className}`}
    >
      {/* 1. FLIGHT MODE */}
      <StatTile
        icon={
          isArmed ? (
            <ShieldCheck className="w-5 h-5 text-[#22C55E]" />
          ) : (
            <ShieldCheck className="w-5 h-5 text-slate-500" />
          )
        }
        label="FLIGHT MODE"
        value={isArmed ? telemetry.flightMode : 'DISARMED'}
        valueClassName={modeColor}
      />

      {/* 2. GPS */}
      <StatTile
        icon={<Satellite className="w-5 h-5 text-[var(--uav-icon-blue)]" />}
        label="GPS"
        value={`${telemetry.satellites} Sats`}
        valueClassName="text-[var(--uav-text)]"
      />

      {/* 3. BATTERY */}
      <StatTile
        icon={<Battery className={`w-5 h-5 ${batteryColor}`} />}
        label="BATTERY"
        value={`${telemetry.batteryPercent}% (${telemetry.batteryVoltage.toFixed(1)}V)`}
        valueClassName={batteryColor}
      />

      {/* 4. ALTITUDE */}
      <StatTile
        icon={<Mountain className="w-5 h-5 text-[var(--uav-icon-blue)]" />}
        label="ALTITUDE"
        value={`${telemetry.altitudeMeters.toFixed(1)} m`}
        valueClassName="text-[var(--uav-text)]"
      />

      {/* 5. SPEED */}
      <StatTile
        icon={<Gauge className="w-5 h-5 text-[var(--uav-icon-blue)]" />}
        label="SPEED"
        value={`${telemetry.speedMs.toFixed(1)} m/s`}
        valueClassName="text-[var(--uav-text)]"
      />

      {/* 6. HEADING */}
      <StatTile
        icon={<Compass className="w-5 h-5 text-[var(--uav-icon-blue)]" />}
        label="HEADING"
        value={`${telemetry.headingDeg}° (${getCardinal(telemetry.headingDeg)})`}
        valueClassName="text-[var(--uav-text)]"
      />

      {/* 7. FLIGHT TIME */}
      <StatTile
        icon={<Clock className="w-5 h-5 text-[var(--uav-icon-blue)]" />}
        label="FLIGHT TIME"
        value={telemetry.flightTimeStr}
        valueClassName="text-[var(--uav-text)] font-mono"
      />
    </div>
  );
};
