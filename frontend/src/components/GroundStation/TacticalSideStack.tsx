import React, { useState } from 'react';
import { DroneTelemetry, PreFlightChecklist } from '../../types/mission';
import { PixhawkConnectionState } from '../../types/mavlink';

interface TacticalSideStackProps {
  telemetry: DroneTelemetry;
  pixhawkState: PixhawkConnectionState;
  checklist: PreFlightChecklist;
  onSetAltitude: (alt: number) => void;
  onOpenCircleTest: () => void;
  onOpenLoiterTest: () => void;
  onArmToggle: () => void;
  isArming: boolean;
  className?: string;
}

export const TacticalSideStack: React.FC<TacticalSideStackProps> = ({
  telemetry,
  pixhawkState,
  checklist,
  onSetAltitude,
  onOpenCircleTest,
  onOpenLoiterTest,
  onArmToggle,
  isArming,
  className = ''
}) => {
  const [targetAlt, setTargetAlt] = useState<number>(telemetry.targetAltitude || 5.0);
  const [isLogExpanded, setIsLogExpanded] = useState<boolean>(false);
  const [setBtnText, setSetBtnText] = useState<string>('SET');

  const handleInc = () => setTargetAlt(prev => Math.min(30.0, +(prev + 0.5).toFixed(1)));
  const handleDec = () => setTargetAlt(prev => Math.max(1.0, +(prev - 0.5).toFixed(1)));

  const handleApplyAlt = () => {
    onSetAltitude(targetAlt);
    setSetBtnText('OK ✓');
    setTimeout(() => setSetBtnText('SET'), 1200);
  };

  const isArmed = telemetry.isArmed;

  // Check items list
  const sats = telemetry.gps?.satellites ?? telemetry.satellitesVisible ?? 14;
  const checks = [
    { label: 'GPS 3D Fix', ok: checklist.gpsAvailable, detail: `${sats} Sats` },
    { label: 'EKF Alignment', ok: checklist.batterySufficient && pixhawkState.ekfHealthy, detail: 'Normal' },
    { label: 'Battery Health', ok: checklist.batterySufficient, detail: `${telemetry.batteryPercent || 88}% (3S)` },
    { label: 'Home Coordinate', ok: checklist.homePointValid, detail: 'Locked' },
    { label: 'Barometer Calib', ok: Math.abs(telemetry.verticalSpeed || 0) < 1.0, detail: 'Zeroed' },
    { label: 'Arm Safety', ok: isArmed, detail: isArmed ? 'ARMED' : 'READY' },
    { label: 'Telemetry Link', ok: pixhawkState.isConnected, detail: `${(pixhawkState.heartbeatHz || 3.8).toFixed(1)} Hz` }
  ];

  const passedCount = checks.filter(c => c.ok).length;

  return (
    <div className={`w-72 flex flex-col gap-2 select-none z-30 ${className}`}>
      {/* PANEL 1: PRE-ARM CHECKS CARD */}
      <div className="bg-[#1b1c1e]/95 backdrop-blur-md rounded-xl shadow-2xl border border-[#343537]/80 overflow-hidden flex flex-col">
        <div className="px-3 py-2 bg-[#1f2022] border-b border-[#343537]/80 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[#57df85] text-[16px]">verified</span>
            <span className="font-sans text-[11px] uppercase tracking-wider text-slate-200 font-bold">PRE-ARM CHECKS</span>
          </div>
          <span className={`px-1.5 py-0.5 rounded font-mono text-[9px] font-bold ${
            passedCount >= 6 ? 'bg-[#008442]/30 text-[#57df85] border border-[#008442]/50' : 'bg-[#ee9800]/30 text-[#ffb95f]'
          }`}>
            {passedCount}/7 READY
          </span>
        </div>

        <div className="p-2 flex flex-col gap-1 text-[11px] font-mono bg-[#0d0e10]/80">
          {checks.map((item, idx) => (
            <div key={idx} className="flex items-center justify-between px-2 py-1 rounded bg-[#1f2022]/70 border border-[#292a2c]/60 hover:bg-[#1f2022] transition-colors">
              <span className="text-slate-400 truncate font-sans text-[10px]">{item.label}</span>
              <div className={`flex items-center gap-1 font-semibold shrink-0 text-[10px] ${item.ok ? 'text-[#57df85]' : 'text-slate-400'}`}>
                <span className="material-symbols-outlined text-[13px]">{item.ok ? 'check_circle' : 'radio_button_unchecked'}</span>
                <span>{item.detail}</span>
              </div>
            </div>
          ))}

          {/* Quick Arm / Disarm Trigger */}
          <button
            onClick={onArmToggle}
            disabled={isArming}
            className={`mt-1 py-1.5 rounded font-sans text-[11px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 shadow-md active:scale-95 cursor-pointer ${
              isArmed
                ? 'bg-[#93000a] hover:bg-[#b3000c] text-white border border-[#ffb4ab]/40'
                : 'bg-[#2f6fd6] hover:bg-[#387df0] text-white border border-[#aec6ff]/40'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">
              {isArming ? 'sync' : (isArmed ? 'power_settings_new' : 'lock_open')}
            </span>
            <span>{isArming ? 'COMMANDING...' : (isArmed ? 'DISARM DRONE' : 'ARM MOTORS')}</span>
          </button>
        </div>
      </div>

      {/* PANEL 2: TACTICAL CONTROLS & ALTITUDE STEPPER */}
      <div className="bg-[#1b1c1e]/95 backdrop-blur-md rounded-xl shadow-2xl border border-[#343537]/80 p-2.5 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="font-sans text-[11px] uppercase tracking-wider text-slate-200 font-bold">TACTICAL CONTROLS</span>
          <div className="flex items-center gap-1 bg-[#1f2022] px-2 py-0.5 rounded text-[#aec6ff] font-mono text-[10px] font-semibold border border-[#343537]/60">
            {telemetry.flightMode || 'GUIDED'}
          </div>
        </div>

        {/* Altitude Override Field with Steppers */}
        <div className="flex flex-col gap-1">
          <label className="font-sans text-[10px] uppercase text-slate-400 font-semibold">Target Altitude Override</label>
          <div className="flex items-center gap-1.5">
            <div className="flex-1 flex items-center bg-[#292a2c] rounded px-2 py-1 border border-[#343537]">
              <span className="material-symbols-outlined text-slate-400 text-[16px] mr-1">height</span>
              <input
                type="text"
                value={`${targetAlt.toFixed(1)} m`}
                readOnly
                className="w-full bg-transparent font-mono text-[11px] text-white focus:outline-none"
              />
            </div>
            <button
              onClick={handleDec}
              className="w-7 h-7 rounded bg-[#292a2c] hover:bg-[#343537] text-white flex items-center justify-center font-bold active:scale-95 transition-all cursor-pointer border border-[#343537]"
            >
              -
            </button>
            <button
              onClick={handleInc}
              className="w-7 h-7 rounded bg-[#292a2c] hover:bg-[#343537] text-white flex items-center justify-center font-bold active:scale-95 transition-all cursor-pointer border border-[#343537]"
            >
              +
            </button>
            <button
              onClick={handleApplyAlt}
              className="px-2.5 py-1 rounded bg-[#2f6fd6] hover:bg-[#387df0] text-white font-sans text-[11px] font-bold uppercase transition-all active:scale-95 cursor-pointer shadow-sm"
            >
              {setBtnText}
            </button>
          </div>
        </div>

        {/* Quick Test Mission Modals */}
        <div className="pt-1 grid grid-cols-2 gap-1.5">
          <button
            onClick={onOpenCircleTest}
            className="py-1.5 rounded bg-[#1f2022] hover:bg-[#292a2c] text-slate-200 border border-[#343537] text-center font-sans text-[10px] uppercase font-bold tracking-wider transition-colors flex items-center justify-center gap-1 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[14px] text-[#ffb95f]">radio_button_unchecked</span>
            <span>CIRCLE TEST</span>
          </button>
          <button
            onClick={onOpenLoiterTest}
            className="py-1.5 rounded bg-[#1f2022] hover:bg-[#292a2c] text-slate-200 border border-[#343537] text-center font-sans text-[10px] uppercase font-bold tracking-wider transition-colors flex items-center justify-center gap-1 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[14px] text-[#aec6ff]">pause_circle</span>
            <span>LOITER TEST</span>
          </button>
        </div>
      </div>

      {/* PANEL 3: EVENT LOG COLLAPSIBLE PILL */}
      <div className="bg-[#1b1c1e]/95 backdrop-blur-md rounded-xl shadow-xl border border-[#343537]/80 overflow-hidden">
        <div
          onClick={() => setIsLogExpanded(!isLogExpanded)}
          className="px-3 py-2 flex items-center justify-between cursor-pointer hover:bg-[#1f2022] transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#ffb95f] text-[16px]">notifications_active</span>
            <span className="font-sans text-[11px] uppercase font-bold tracking-wider text-slate-200">EVENT LOG</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="px-1.5 py-0.5 rounded bg-[#ee9800]/20 text-[#ffb95f] font-mono text-[9px] font-bold">
              {pixhawkState.statusHistory?.length || 0} MSGS
            </span>
            <span className="material-symbols-outlined text-slate-400 text-[16px] transition-transform duration-200">
              {isLogExpanded ? 'expand_less' : 'expand_more'}
            </span>
          </div>
        </div>

        {isLogExpanded && (
          <div className="p-2 border-t border-[#343537]/60 max-h-36 overflow-y-auto font-mono text-[10px] flex flex-col gap-1 bg-[#0d0e10]/90">
            {pixhawkState.statusHistory?.slice(0, 5).map((log, i) => (
              <div key={i} className="text-slate-300 leading-tight border-b border-[#292a2c]/40 pb-0.5">
                <span className="text-[#aec6ff]">[{log.severity}]</span> {log.text}
              </div>
            )) || <div className="text-slate-500">No active warnings.</div>}
          </div>
        )}
      </div>
    </div>
  );
};
