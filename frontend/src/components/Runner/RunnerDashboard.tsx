import React, { useEffect, useState, useRef } from 'react';
import { RunnerLinkState, DroneQRDispatchPayload } from '../../types/runner';
import { MissionState } from '../../types/mission';
import { runnerCommService } from '../../services/runnerCommService';
import { missionEngine } from '../../services/missionEngine';
import { AckProtocolCard } from './AckProtocolCard';
import { 
  CheckCircle2, 
  Clock, 
  Radio, 
  Sparkles, 
  Wifi, 
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Lock
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface RunnerDashboardProps {
  runnerLink: RunnerLinkState;
  missionState: MissionState;
  remainingSeconds: number;
  elapsedSeconds: number;
  className?: string;
  onSwitchToGroundStation?: () => void;
}

export const RunnerDashboard: React.FC<RunnerDashboardProps> = ({
  runnerLink,
  missionState,
  remainingSeconds,
  elapsedSeconds,
  className = '',
  onSwitchToGroundStation,
}) => {
  const [receivedCode, setReceivedCode] = useState<string | null>(runnerLink.latestReceivedQR || null);
  const [ackDispatched, setAckDispatched] = useState<boolean>(false);
  const [receiptTimestamp, setReceiptTimestamp] = useState<number | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState<boolean>(false);

  // ADDC 2026 Ground Operative Puzzle Digits (Rulebook Fig. 1 & Sec. 3.1.3)
  const [puzzleDigit1, setPuzzleDigit1] = useState<string>('');
  const [puzzleDigit2, setPuzzleDigit2] = useState<string>('');
  const puzzleInput2Ref = useRef<HTMLInputElement>(null);

  const droneD1 = receivedCode && receivedCode.length >= 1 ? receivedCode[0] : '-';
  const droneD2 = receivedCode && receivedCode.length >= 2 ? receivedCode[1] : '-';
  const puzD1 = puzzleDigit1 || '-';
  const puzD2 = puzzleDigit2 || '-';
  const isMasterCodeComplete = Boolean(receivedCode && receivedCode.length >= 2 && puzzleDigit1 && puzzleDigit2);

  useEffect(() => {
    // Subscribe to direct wireless packets from Drone Android
    const unsubscribe = runnerCommService.subscribeMessages((msg) => {
      if (msg.type === 'QR_DISPATCH') {
        const dispatch = msg as DroneQRDispatchPayload;
        setReceivedCode(dispatch.qrCode);
        setReceiptTimestamp(Date.now());

        // Trigger celebratory confetti effect on code arrival
        try {
          confetti({
            particleCount: 60,
            spread: 70,
            origin: { y: 0.6 }
          });
        } catch (e) {}

        // AUTOMATIC RUNNER ACKNOWLEDGEMENT PROTOCOL (Zero-touch)
        // Automatically transmit ACK back to Drone Android immediately
        runnerCommService.sendAckToDrone(
          dispatch.qrCode,
          dispatch.messageId,
          dispatch.missionId,
          96
        );
        setAckDispatched(true);
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const totalDuration = missionEngine.getMissionDurationSeconds() || 300;
  const formatTime = (totalSecs: number) => {
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const isCritical = remainingSeconds <= Math.min(45, Math.max(15, Math.floor(totalDuration * 0.25))) && remainingSeconds > 0;
  const isWarning = remainingSeconds > Math.min(45, Math.max(15, Math.floor(totalDuration * 0.25))) && remainingSeconds <= Math.min(90, Math.max(30, Math.floor(totalDuration * 0.5)));
  const isComplete = missionState === 'MISSION_COMPLETE';
  const isExpired = remainingSeconds === 0;

  return (
    <div className={`p-3 sm:p-5 max-w-6xl mx-auto space-y-4 sm:space-y-5 font-mono ${className}`}>
      {/* Top Banner: Minimal Runner Status Bar */}
      <div className="bg-slate-900/90 p-3 sm:p-4 rounded-xl border border-slate-800 hud-border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div>
          <div className="text-[10px] sm:text-[11px] text-slate-400 font-bold uppercase tracking-wider">
            RUNNER ANDROID FIELD UNIT
          </div>
          <div className="text-sm sm:text-base font-black text-slate-100 mt-0.5 flex items-center space-x-2">
            <span>RUNNER STATUS:</span>
            <span className="text-emerald-400 flex items-center space-x-1 font-extrabold">
              <CheckCircle2 className="w-4 h-4" />
              <span>CONNECTED ✓</span>
            </span>
          </div>
        </div>

        {/* Wireless Link Status & GCS Quick Return */}
        <div className="flex items-center space-x-2 text-xs self-start sm:self-auto">
          <div className="bg-slate-950 px-3 py-1 rounded-lg border border-slate-800 text-slate-300 flex items-center space-x-1.5">
            <Wifi className="w-3.5 h-3.5 text-sky-400" />
            <span>P2P Direct ({runnerLink.signalStrengthDbm} dBm)</span>
          </div>
          <div className="bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800 text-emerald-400 font-bold text-xs">
            ~12m Proximity
          </div>
          {onSwitchToGroundStation && (
            <button
              type="button"
              onClick={onSwitchToGroundStation}
              className="px-2.5 py-1 rounded-lg bg-sky-950/80 hover:bg-sky-900 border border-sky-500/40 text-sky-300 hover:text-white font-sans text-xs font-bold transition cursor-pointer flex items-center space-x-1"
              title="Return to Ground Station Cockpit"
            >
              <span>🛰️</span>
              <span>GCS</span>
            </button>
          )}
        </div>
      </div>

      {/* ============================================================ */}
      {/* DUAL ESSENTIAL HERO CARDS: CODE & REMAINING TIME             */}
      {/* High contrast, glanceable at distance across all devices     */}
      {/* ============================================================ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        
        {/* CARD 1: RESCUE CODE */}
        <div className={`p-5 sm:p-7 rounded-2xl border-2 flex flex-col justify-between text-center transition-all ${
          receivedCode
            ? 'bg-gradient-to-b from-slate-900 via-emerald-950/40 to-slate-900 border-emerald-500 shadow-2xl shadow-emerald-500/20'
            : 'bg-slate-900/90 border-slate-800 shadow-xl'
        }`}>
          <div>
            <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
              <span className="text-[11px] sm:text-xs font-black uppercase tracking-widest text-slate-400">
                COMPETITION RESCUE TARGET
              </span>
              <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${
                receivedCode
                  ? 'bg-emerald-950 border-emerald-400 text-emerald-300 animate-pulse'
                  : 'bg-slate-950 border-slate-700 text-sky-400'
              }`}>
                {receivedCode ? 'LOCK CONFIRMED' : 'SEARCHING'}
              </span>
            </div>

            <div className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-400 mb-1">
              CODE
            </div>

            {/* Huge Prominent CODE Display */}
            <div className="py-4 sm:py-6">
              {receivedCode ? (
                <div className="text-7xl sm:text-8xl md:text-9xl font-black text-white tracking-widest leading-none drop-shadow-[0_10px_25px_rgba(16,185,129,0.6)]">
                  {receivedCode}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-5xl sm:text-6xl md:text-7xl font-black text-slate-600 tracking-widest leading-none animate-pulse">
                    ---
                  </div>
                  <div className="text-xs sm:text-sm text-slate-400 font-bold flex items-center justify-center space-x-1.5 mt-2">
                    <Radio className="w-4 h-4 text-sky-400 animate-spin" />
                    <span>AWAITING AIRBORNE QR LOCK</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Code Footer Status */}
          <div className="mt-3">
            {receivedCode ? (
              <div className="bg-emerald-950/80 border border-emerald-500/80 p-3 rounded-xl text-emerald-200 text-xs sm:text-sm font-extrabold flex items-center justify-center space-x-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>RECEIVED & AUTO-ACKNOWLEDGED</span>
              </div>
            ) : (
              <div className="bg-slate-950/80 border border-slate-800 p-2.5 rounded-xl text-slate-400 text-xs flex items-center justify-center space-x-2">
                <div className="w-2 h-2 rounded-full bg-sky-400 animate-ping" />
                <span>Code displays automatically when drone detects target</span>
              </div>
            )}
          </div>
        </div>

        {/* CARD 2: REMAINING TIME */}
        <div className={`p-5 sm:p-7 rounded-2xl border-2 flex flex-col justify-between text-center transition-all ${
          isComplete
            ? 'bg-gradient-to-b from-slate-900 via-emerald-950/30 to-slate-900 border-emerald-500 shadow-xl'
            : isExpired
            ? 'bg-gradient-to-b from-slate-900 via-rose-950/40 to-slate-900 border-rose-500 shadow-xl animate-pulse'
            : isCritical
            ? 'bg-gradient-to-b from-slate-900 via-rose-950/30 to-slate-900 border-rose-500/70 shadow-xl'
            : isWarning
            ? 'bg-gradient-to-b from-slate-900 via-amber-950/30 to-slate-900 border-amber-500/60 shadow-xl'
            : 'bg-slate-900/90 border-sky-500/40 shadow-xl'
        }`}>
          <div>
            <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
              <span className="text-[11px] sm:text-xs font-black uppercase tracking-widest text-slate-400">
                OFFICIAL MISSION WINDOW
              </span>
              <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full border bg-slate-950 border-slate-700 text-slate-300">
                MAX {totalDuration}s
              </span>
            </div>

            <div className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-400 mb-1">
              REMAINING TIME
            </div>

            {/* Huge Prominent REMAINING TIME Countdown */}
            <div className="py-4 sm:py-6">
              <div className={`text-6xl sm:text-7xl md:text-8xl lg:text-9xl font-black tracking-widest leading-none ${
                isComplete
                  ? 'text-emerald-400'
                  : isExpired
                  ? 'text-rose-500'
                  : isCritical
                  ? 'text-rose-400 animate-pulse'
                  : isWarning
                  ? 'text-amber-400'
                  : 'text-white'
              }`}>
                {formatTime(remainingSeconds)}
              </div>

              <div className="text-xs sm:text-sm font-bold text-slate-400 mt-2 flex items-center justify-center space-x-2">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>ELAPSED: +{formatTime(elapsedSeconds)}</span>
              </div>
            </div>
          </div>

          {/* Time Progress Bar & Footer */}
          <div className="space-y-2 mt-3">
            <div className="w-full bg-slate-950 h-2.5 rounded-full overflow-hidden border border-slate-800">
              <div
                className={`h-full transition-all duration-1000 ${
                  isCritical ? 'bg-rose-500' : isWarning ? 'bg-amber-500' : isComplete ? 'bg-emerald-500' : 'bg-sky-500'
                }`}
                style={{ width: `${Math.min(100, Math.max(0, (remainingSeconds / totalDuration) * 100))}%` }}
              />
            </div>

            <div className="text-[11px] text-slate-400 font-bold flex items-center justify-center space-x-1">
              {isCritical && !isComplete && (
                <span className="text-rose-400 flex items-center space-x-1 animate-pulse">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>CRITICAL: Safe RTL Standby</span>
                </span>
              )}
              {isComplete && (
                <span className="text-emerald-400 flex items-center space-x-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>MISSION COMPLETED IN TIME</span>
                </span>
              )}
              {!isCritical && !isComplete && (
                <span className="text-sky-400">COUNTDOWN SYNCHRONIZED WITH DRONE & GCS</span>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* ============================================================ */}
      {/* 4-DIGIT COMBINATION STATION (ADDC 2026 RULEBOOK SECTION 3.1.3) */}
      {/* [ UAV Digits 1 & 2 ] + [ Ground Puzzle Digits 3 & 4 ]         */}
      {/* ============================================================ */}
      <div className="bg-slate-900/90 p-4 sm:p-5 rounded-2xl border-2 border-slate-800 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 border-b border-slate-800 pb-2.5">
          <div className="flex items-center space-x-2">
            <Lock className="w-4 h-4 text-amber-400" />
            <span className="text-xs sm:text-sm font-black uppercase tracking-wider text-slate-200">
              INTELLIGENCE CACHE 4-DIGIT COMBINATION LOCK (30 PTS)
            </span>
          </div>
          <span className="text-[10px] text-slate-400 font-bold uppercase">
            RULEBOOK FIG. 1: [UAV 2 DIGITS] + [RUNNER 2 DIGITS]
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-center">
          {/* Section A: UAV Sourced Digits 1 & 2 */}
          <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800/80 flex flex-col items-center">
            <span className="text-[10px] text-sky-400 font-bold uppercase tracking-wider mb-1 flex items-center space-x-1">
              <span>AIRBORNE DRONE DIGITS (1 & 2)</span>
            </span>
            <div className="flex space-x-2 my-1">
              <div className="w-12 h-14 bg-slate-900 border-2 border-sky-500 rounded-lg flex items-center justify-center text-3xl font-black text-sky-300 shadow-lg shadow-sky-500/20">
                {droneD1}
              </div>
              <div className="w-12 h-14 bg-slate-900 border-2 border-sky-500 rounded-lg flex items-center justify-center text-3xl font-black text-sky-300 shadow-lg shadow-sky-500/20">
                {droneD2}
              </div>
            </div>
            <span className="text-[10px] text-slate-400 mt-1">
              {receivedCode ? 'AUTO-DISPATCHED FROM UAV' : 'Awaiting drone scan...'}
            </span>
          </div>

          {/* Section B: Ground Puzzle Digits 3 & 4 */}
          <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800/80 flex flex-col items-center">
            <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider mb-1 flex items-center space-x-1">
              <span>GROUND PUZZLE DIGITS (3 & 4)</span>
            </span>
            <div className="flex space-x-2 my-1">
              <input
                type="text"
                maxLength={1}
                value={puzzleDigit1}
                placeholder="P1"
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '');
                  setPuzzleDigit1(val);
                  if (val && puzzleInput2Ref.current) puzzleInput2Ref.current.focus();
                }}
                className="w-12 h-14 bg-slate-900 border-2 border-amber-500/80 focus:border-amber-400 rounded-lg text-center text-3xl font-black text-amber-300 outline-none shadow-lg shadow-amber-500/20"
              />
              <input
                ref={puzzleInput2Ref}
                type="text"
                maxLength={1}
                value={puzzleDigit2}
                placeholder="P2"
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '');
                  setPuzzleDigit2(val);
                }}
                className="w-12 h-14 bg-slate-900 border-2 border-amber-500/80 focus:border-amber-400 rounded-lg text-center text-3xl font-black text-amber-300 outline-none shadow-lg shadow-amber-500/20"
              />
            </div>
            <span className="text-[10px] text-slate-400 mt-1">
              Enter digits from Puzzle Stations 1 & 2
            </span>
          </div>

          {/* Section C: Master 4-Digit Unlock Keypad Code */}
          <div className={`p-3 rounded-xl border flex flex-col items-center justify-center transition-all ${
            isMasterCodeComplete
              ? 'bg-gradient-to-br from-emerald-950/80 to-slate-950 border-emerald-500 shadow-xl shadow-emerald-500/20'
              : 'bg-slate-950/80 border-slate-800'
          }`}>
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">
              ELECTRONIC KEYPAD COMBINATION
            </span>
            <div className={`text-3xl sm:text-4xl font-black tracking-widest my-1 ${
              isMasterCodeComplete ? 'text-emerald-400 animate-pulse' : 'text-slate-500'
            }`}>
              {droneD1} {droneD2} {puzD1} {puzD2}
            </div>
            <div className="text-[10px] font-bold mt-1">
              {isMasterCodeComplete ? (
                <span className="text-emerald-400 flex items-center space-x-1">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>READY TO UNLOCK CACHE BOX</span>
                </span>
              ) : (
                <span className="text-slate-400">Combine all 4 digits to unlock</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Diagnostics / Protocol Handshake (Collapsible for zero clutter) */}
      <div className="bg-slate-900/60 rounded-xl border border-slate-800/80 overflow-hidden">
        <button
          type="button"
          onClick={() => setShowDiagnostics(!showDiagnostics)}
          className="w-full px-4 py-2.5 flex items-center justify-between text-xs text-slate-400 hover:text-slate-200 transition font-bold uppercase cursor-pointer"
        >
          <span className="flex items-center space-x-2">
            <span>WIRELESS TELEMETRY & ACK PROTOCOL</span>
            <span className="text-[10px] text-emerald-400 font-extrabold">• DIRECT LINK</span>
          </span>
          {showDiagnostics ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {showDiagnostics && (
          <div className="p-3.5 pt-0 border-t border-slate-800/80">
            <AckProtocolCard
              runnerLink={runnerLink}
              receivedCode={receivedCode || undefined}
              ackSent={ackDispatched}
            />
          </div>
        )}
      </div>
    </div>
  );
};
