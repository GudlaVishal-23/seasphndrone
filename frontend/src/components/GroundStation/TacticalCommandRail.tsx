import React from 'react';

interface TacticalCommandRailProps {
  isArmed: boolean;
  flightMode: string;
  onTakeoff: () => void;
  onLoiter: () => void;
  onLand: () => void;
  onEmergencyRTL: () => void;
  onDropPayload?: () => void;
  onOpenHistory?: () => void;
  className?: string;
}

export const TacticalCommandRail: React.FC<TacticalCommandRailProps> = ({
  isArmed,
  flightMode,
  onTakeoff,
  onLoiter,
  onLand,
  onEmergencyRTL,
  onDropPayload,
  onOpenHistory,
  className = ''
}) => {
  return (
    <aside className={`flex flex-col w-12 bg-[#1b1c1e]/95 backdrop-blur-md rounded-xl shadow-2xl border border-[#343537]/80 p-1 gap-1.5 z-30 select-none ${className}`}>
      {/* TAKEOFF BUTTON */}
      <button
        onClick={onTakeoff}
        className="group flex flex-col items-center justify-center h-12 w-full rounded-lg bg-[#1f2022] hover:bg-[#292a2c] text-[#aec6ff] border border-transparent hover:border-[#2f6fd6]/40 transition-all active:scale-95 cursor-pointer shadow-sm"
        title="Initiate Autonomous Takeoff (5.0m)"
      >
        <span className="material-symbols-outlined text-[#aec6ff] text-[20px] group-hover:scale-110 transition-transform">flight_takeoff</span>
        <span className="font-sans text-[8px] uppercase tracking-tighter text-[#aec6ff] mt-0.5 font-bold">TAKEOFF</span>
      </button>

      {/* PAUSE / LOITER BUTTON */}
      <button
        onClick={onLoiter}
        className={`group flex flex-col items-center justify-center h-12 w-full rounded-lg bg-[#1f2022] hover:bg-[#292a2c] text-[#ffb95f] border border-transparent hover:border-[#ee9800]/40 transition-all active:scale-95 cursor-pointer shadow-sm ${
          flightMode === 'LOITER' ? 'ring-1 ring-[#ee9800] bg-[#ee9800]/20' : ''
        }`}
        title="Loiter / Brake and Hold Position"
      >
        <span className="material-symbols-outlined text-[#ffb95f] text-[20px] group-hover:scale-110 transition-transform">pause_circle</span>
        <span className="font-sans text-[8px] uppercase tracking-tighter text-[#ffb95f] mt-0.5 font-bold">PAUSE</span>
      </button>

      {/* LAND BUTTON */}
      <button
        onClick={onLand}
        className={`group flex flex-col items-center justify-center h-12 w-full rounded-lg bg-[#1f2022] hover:bg-[#292a2c] text-slate-300 border border-transparent hover:border-slate-500/40 transition-all active:scale-95 cursor-pointer shadow-sm ${
          flightMode === 'LAND' ? 'ring-1 ring-white bg-white/20' : ''
        }`}
        title="Precision Land at Current Coordinates"
      >
        <span className="material-symbols-outlined text-slate-300 text-[20px] group-hover:scale-110 transition-transform">flight_land</span>
        <span className="font-sans text-[8px] uppercase tracking-tighter text-slate-300 mt-0.5 font-bold">LAND</span>
      </button>

      <div className="w-full h-px bg-[#343537] my-0.5" />

      {/* RETURN TO LAUNCH (RTL) - EMERGENCY HIGH CONTRAST */}
      <button
        onClick={onEmergencyRTL}
        className="group flex flex-col items-center justify-center h-12 w-full rounded-lg bg-[#93000a]/40 hover:bg-[#93000a] text-[#ffb4ab] hover:text-white border border-[#93000a] transition-all active:scale-95 cursor-pointer shadow-md"
        title="Emergency Return to Launch (RTL)"
      >
        <span className="material-symbols-outlined text-[20px] group-hover:scale-110 transition-transform">u_turn_left</span>
        <span className="font-sans text-[8px] uppercase tracking-tighter mt-0.5 font-bold">RTL</span>
      </button>

      {/* ACTION / DROP PAYLOAD */}
      <button
        onClick={onDropPayload}
        className="group flex flex-col items-center justify-center h-12 w-full rounded-lg bg-[#1f2022] hover:bg-[#292a2c] text-[#57df85] border border-transparent hover:border-[#008442]/40 transition-all active:scale-95 cursor-pointer shadow-sm"
        title="Trigger Rescue Mission Code Dispatch"
      >
        <span className="material-symbols-outlined text-[#57df85] text-[20px] group-hover:scale-110 transition-transform">local_shipping</span>
        <span className="font-sans text-[8px] uppercase tracking-tighter text-[#57df85] mt-0.5 font-bold">DROP</span>
      </button>

      {/* MISSION HISTORY BUTTON */}
      {onOpenHistory && (
        <button
          onClick={onOpenHistory}
          className="group flex flex-col items-center justify-center h-12 w-full rounded-lg bg-[#1f2022] hover:bg-[#292a2c] text-[#ffb95f] border border-transparent hover:border-[#ee9800]/40 transition-all active:scale-95 cursor-pointer shadow-sm"
          title="Mission History (5 Most Recent Flights)"
        >
          <span className="material-symbols-outlined text-[#ffb95f] text-[20px] group-hover:scale-110 transition-transform">history</span>
          <span className="font-sans text-[8px] uppercase tracking-tighter text-[#ffb95f] mt-0.5 font-bold">HISTORY</span>
        </button>
      )}
    </aside>
  );
};
