import React from 'react';
import {
  Calendar,
  Send,
  BarChart3,
  FileText,
  Satellite,
  Gamepad2,
  Battery,
  Crosshair,
  Settings,
  LogOut,
} from 'lucide-react';
import { DashboardTelemetryData } from '../../hooks/useDashboardTelemetry';

interface HeaderProps {
  telemetry: DashboardTelemetryData;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  onOpenSettings?: () => void;
  onLogout?: () => void;
  onArmClick?: () => void;
  onToggleRC?: () => void;
  rcOverrideEnabled?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  telemetry,
  activeTab = 'Fly',
  onTabChange,
  onOpenSettings,
  onLogout,
  onArmClick,
  onToggleRC,
  rcOverrideEnabled = true,
}) => {
  const isArmed = telemetry.isArmed;

  return (
    <header className="h-[65px] w-full px-3 bg-[var(--uav-header)] border-b border-[var(--uav-card-border)] flex items-center justify-between select-none shrink-0 z-40">
      {/* 1. Left: Brand & Wordmark */}
      <div className="flex items-center gap-3">
        {/* Custom Quadcopter Glyph */}
        <div className="w-8 h-8 rounded-[8px] bg-[#162744] border border-[#233C66] flex items-center justify-center text-[var(--uav-icon-blue)]">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M12 9V5" />
            <path d="M12 19v-4" />
            <path d="M9 12H5" />
            <path d="M19 12h-4" />
            <circle cx="5" cy="5" r="2" />
            <circle cx="19" cy="5" r="2" />
            <circle cx="5" cy="19" r="2" />
            <circle cx="19" cy="19" r="2" />
          </svg>
        </div>

        <div className="flex flex-col justify-center">
          <span className="font-orbitron font-extrabold text-[15px] tracking-[0.08em] text-[var(--uav-text)] leading-none">
            UAV CONTROL
          </span>
          <span className="text-[10px] font-sans text-[var(--uav-muted)] tracking-wide mt-0.5">
            Autonomous Flight System
          </span>
        </div>
      </div>

      {/* 2. Center: Segmented Navigation Group */}
      <nav aria-label="Main Navigation" className="flex items-center rounded-[8px] border border-[var(--uav-card-border)] bg-[#0B1424] p-[2px] gap-[2px]">
        {[
          { id: 'Plan', label: 'Plan', icon: <Calendar className="w-3.5 h-3.5" /> },
          { id: 'Fly', label: 'Fly', icon: <Send className="w-3.5 h-3.5" /> },
          { id: 'Analyze', label: 'Analyze', icon: <BarChart3 className="w-3.5 h-3.5" /> },
          { id: 'Logs', label: 'Logs', icon: <FileText className="w-3.5 h-3.5" /> },
        ].map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange?.(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-[6px] text-[12px] font-sans transition-all cursor-pointer ${
                isActive
                  ? 'bg-[var(--uav-primary-blue)] text-white font-semibold'
                  : 'text-[var(--uav-muted)] hover:text-[var(--uav-text)] hover:bg-[#142036]'
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* 3. Right: Status Pills & Settings */}
      <div className="flex items-center gap-2">
        {/* Arm State Pill */}
        <button
          type="button"
          onClick={onArmClick}
          title={isArmed ? 'Click to Disarm or View Flight Safety' : 'Click to Arm Vehicle'}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-[8px] text-[11px] font-semibold font-sans border transition active:scale-95 cursor-pointer ${
            isArmed
              ? 'bg-[#3b1212] border-[#7f1d1d] text-rose-300 hover:bg-[#4a1717]'
              : 'bg-[#0f291e] border-[#1b4d36] text-[#22C55E] hover:bg-[#143d2b]'
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              isArmed ? 'bg-rose-500 animate-pulse' : 'bg-[#22C55E]'
            }`}
          />
          <span>{isArmed ? 'ARMED' : 'DISARMED'}</span>
        </button>

        {/* Satellites & HDOP Pill */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-[8px] border border-[var(--uav-card-border)] bg-[#0F1829] text-[11px] font-mono text-[var(--uav-text)]">
          <Satellite className="w-3.5 h-3.5 text-[var(--uav-muted)]" />
          <span>
            {telemetry.isFixture
              ? '0 (99)'
              : `${telemetry.satellites} (${Math.round(telemetry.hdop)})`}
          </span>
        </div>

        {/* RC Gamepad Link Toggle Button */}
        <button
          type="button"
          onClick={onToggleRC}
          title={
            rcOverrideEnabled
              ? 'RC Manual Control: ENABLED (Click to Disable RC Override)'
              : 'RC Manual Control: DISABLED (Click to Enable RC Override)'
          }
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-[8px] border text-[11px] font-mono transition-all active:scale-95 cursor-pointer ${
            rcOverrideEnabled
              ? 'border-[#1b4d36] bg-[#0c2419] text-[#22C55E] hover:bg-[#123826]'
              : 'border-[var(--uav-card-border)] bg-[#0F1829] text-slate-400 hover:text-white hover:bg-[#162744]'
          }`}
        >
          <Gamepad2
            className={`w-3.5 h-3.5 ${
              rcOverrideEnabled ? 'text-[#22C55E]' : 'text-slate-400'
            }`}
          />
          <span className="font-semibold">
            RC: {rcOverrideEnabled ? 'ON' : 'OFF'}
          </span>
        </button>

        {/* Battery Percent & Voltage Pill */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-[8px] border border-[var(--uav-card-border)] bg-[#0F1829] text-[11px] font-mono">
          <Battery className="w-3.5 h-3.5 text-[var(--uav-amber)]" />
          <span className="text-[var(--uav-amber)] font-bold">
            {telemetry.batteryPercent}%
          </span>
          <span className="text-[var(--uav-muted)]">
            {telemetry.batteryVoltage.toFixed(1)}V
          </span>
        </div>

        {/* GPS Satellite Count Pill */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-[8px] border border-[#1b4d36] bg-[#0c2419] text-[11px] font-mono text-[#22C55E]">
          <Crosshair className="w-3.5 h-3.5 text-[#22C55E]" />
          <span>GPS: {telemetry.satellites} Sats</span>
        </div>

        {/* Settings Button */}
        <button
          type="button"
          onClick={onOpenSettings}
          title="Open Settings"
          aria-label="Open Settings"
          className="w-8 h-8 rounded-[8px] border border-[var(--uav-card-border)] bg-[#0F1829] hover:bg-[#162744] hover:text-white flex items-center justify-center text-[var(--uav-muted)] transition cursor-pointer"
        >
          <Settings className="w-4 h-4" />
        </button>

        {/* Optional Logout Button */}
        {onLogout && (
          <button
            type="button"
            onClick={onLogout}
            title="Log Out / Switch Operator"
            aria-label="Log Out / Switch Operator"
            className="w-8 h-8 rounded-[8px] border border-[var(--uav-card-border)] bg-[#0F1829] hover:bg-red-950/60 hover:text-red-400 hover:border-red-500/40 flex items-center justify-center text-[var(--uav-muted)] transition cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
          </button>
        )}
      </div>
    </header>
  );
};
