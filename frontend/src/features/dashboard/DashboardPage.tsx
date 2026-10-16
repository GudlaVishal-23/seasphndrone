import React, { useState, useEffect, useRef } from 'react';
import {
  AlertTriangle,
  ShieldAlert,
  CheckCircle2,
  X,
  ArrowUp,
  ArrowDown,
  Pause,
  Crosshair,
  Send,
  Calendar,
} from 'lucide-react';
import { useDashboardTelemetry } from '../../hooks/useDashboardTelemetry';
import { mavlinkService } from '../../services/mavlinkService';
import { missionEngine } from '../../services/missionEngine';
import { groundStationMissionService, computeDestination } from '../../services/groundStationMissionService';
import { runnerCommService } from '../../services/runnerCommService';
import { audioService } from '../../services/audioService';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { StatRow } from './StatRow';
import { InstrumentColumn } from './instruments/InstrumentColumn';
import { MapPanel } from './MapPanel';
import { CameraFeed } from './CameraFeed';
import { MissionStatus } from './MissionStatus';
import { WaypointManager } from './WaypointManager';
import { FlightParams } from './FlightParams';
import { MissionPatterns } from './MissionPatterns';
import { TelemetryLog } from './TelemetryLog';
import { FlightLogsDeck } from './FlightLogsDeck';
import { AutonomousMissionConfigModal } from '../../components/Mission/AutonomousMissionConfigModal';
import { MissionHistoryModal } from '../../components/History/MissionHistoryModal';
import { SerialDiagnosticsModal } from '../../components/Drone/SerialDiagnosticsModal';
import { AppRole } from '../../types/mission';

interface DashboardPageProps {
  onLogout?: () => void;
  onSwitchRole?: (role: AppRole) => void;
  currentRole?: AppRole;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  onLogout,
  onSwitchRole,
  currentRole = 'GROUND_STATION',
}) => {
  const telemetry = useDashboardTelemetry();
  const [activeTab, setActiveTab] = useState<'Plan' | 'Fly' | 'Logs'>('Fly');
  const [activeNav, setActiveNav] = useState<string>('Dashboard');
  const [showArmModal, setShowArmModal] = useState<boolean>(false);
  const [showRtlModal, setShowRtlModal] = useState<boolean>(false);
  const [rtlConfirmPending, setRtlConfirmPending] = useState<boolean>(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const rtlTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (rtlTimerRef.current) clearTimeout(rtlTimerRef.current);
    };
  }, []);

  // Modals & Overlays (Streamlined essential cockpit modals)
  const [isConfigModalOpen, setIsConfigModalOpen] = useState<boolean>(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState<boolean>(false);
  const [isDiagnosticsModalOpen, setIsDiagnosticsModalOpen] = useState<boolean>(false);
  const [isFlightControlModalOpen, setIsFlightControlModalOpen] = useState<boolean>(false);

  const showNotification = (msg: string) => {
    setActionNotice(msg);
    setTimeout(() => setActionNotice(null), 4000);
  };

  const handleTabChange = (tab: string) => {
    setActiveTab(tab as any);
    audioService.playBeep(700, 50);

    if (tab === 'Logs') {
      setActiveNav('Logs');
      showNotification('Flight Logs & MAVLink Telemetry Deck active');
    } else if (tab === 'Plan') {
      showNotification('Plan Mode Active: Define waypoints, search patterns, and geofence.');
    } else if (tab === 'Fly') {
      setActiveNav('Dashboard');
    }
  };

  const handleNavChange = (nav: string) => {
    setActiveNav(nav);
    audioService.playBeep(650, 40);

    if (nav === 'Mission' || nav === 'Mission Plan') {
      setIsConfigModalOpen(true);
    } else if (nav === 'Diagnostics' || nav === 'Telemetry') {
      setIsDiagnosticsModalOpen(true);
    } else if (nav === 'Logs' || nav === 'Flight Logs') {
      setActiveTab('Logs');
    } else if (nav === 'Flight Control') {
      setIsFlightControlModalOpen(true);
    } else if (nav === 'Dashboard' || nav === 'Cockpit') {
      setActiveTab('Fly');
      setActiveNav('Dashboard');
    }
  };

  const handleToggleRC = () => {
    const nextState = mavlinkService.toggleRCOverride();
    audioService.playBeep(nextState ? 950 : 520, 90);
    showNotification(
      nextState
        ? '🎮 RC MANUAL CONTROL OVERRIDE: ON (Handheld Transmitter in Command)'
        : '🤖 RC OVERRIDE: OFF (Autonomous GCS Navigation Active)'
    );
  };

  const handleToggleArm = async () => {
    if (telemetry.isArmed) {
      showNotification('Disarming vehicle motors...');
      audioService.playBeep(450, 120);
      try {
        const success = await mavlinkService.sendDisarmCommand(false);
        if (success) {
          showNotification('Vehicle Disarmed ✓');
          audioService.playBeep(350, 150);
        } else {
          showNotification('Disarm rejected by Pixhawk (Confirm vehicle is landed or disarm via RC)');
        }
      } catch (err: any) {
        showNotification(`Disarm failed: ${err?.message || 'Check connection'}`);
      }
    } else {
      showNotification('Sending ARM command to flight controller...');
      audioService.playBeep(850, 100);
      try {
        const success = await mavlinkService.sendArmCommand(false);
        if (success) {
          showNotification('Vehicle Armed — Motors spinning ✓');
          audioService.playBeep(1100, 150);
        } else {
          showNotification('Arm rejected by Pixhawk. Check safety switch, GPS 3D fix, and compass.');
        }
      } catch (err: any) {
        showNotification(`Arm failed: ${err?.message || 'Check pre-arm conditions'}`);
      }
    }
  };

  const handleNudge = async (direction: 'N' | 'S' | 'E' | 'W' | 'UP' | 'DOWN', distanceMeters: number = 5) => {
    if (direction !== 'UP' && direction !== 'DOWN') {
      if (!telemetry.isGpsValid || !telemetry.latitude || Math.abs(telemetry.latitude) <= 0.001) {
        showNotification('⚠️ Cannot nudge drone: Pixhawk GPS Signal Unavailable (No Lock)');
        return;
      }
    }
    const lat = telemetry.latitude;
    const lon = telemetry.longitude;
    const alt = telemetry.altitudeMeters || 5.0;

    let targetLat = lat;
    let targetLon = lon;
    let targetAlt = alt;

    if (direction === 'N') {
      const dest = computeDestination(lat, lon, distanceMeters, 0);
      targetLat = dest.lat; targetLon = dest.lng;
    } else if (direction === 'S') {
      const dest = computeDestination(lat, lon, distanceMeters, 180);
      targetLat = dest.lat; targetLon = dest.lng;
    } else if (direction === 'E') {
      const dest = computeDestination(lat, lon, distanceMeters, 90);
      targetLat = dest.lat; targetLon = dest.lng;
    } else if (direction === 'W') {
      const dest = computeDestination(lat, lon, distanceMeters, 270);
      targetLat = dest.lat; targetLon = dest.lng;
    } else if (direction === 'UP') {
      targetAlt = Math.min(120, alt + 2);
    } else if (direction === 'DOWN') {
      targetAlt = Math.max(1, alt - 2);
    }

    try {
      if (direction === 'UP' || direction === 'DOWN') {
        await mavlinkService.commandVerticalAltitude(targetAlt);
        showNotification(`Vertical ${direction === 'UP' ? 'Climb ▲' : 'Descent ▼'} to ${targetAlt.toFixed(1)}m at current location ✓`);
      } else {
        await mavlinkService.flyToPosition(targetLat, targetLon, targetAlt);
        showNotification(`Nudged ${direction} by ${distanceMeters}m`);
      }
      audioService.playBeep(880, 80);
    } catch (err: any) {
      showNotification(`Nudge failed: ${err?.message || 'Error'}`);
    }
  };

  const handleArmAndFly = () => {
    setShowArmModal(true);
    audioService.playBeep(900, 100);
  };

  const confirmArmAndFly = async () => {
    setShowArmModal(false);
    showNotification('Arming flight controller and starting mission...');
    try {
      if (missionEngine?.startMission) {
        await missionEngine.startMission();
      } else {
        await mavlinkService.sendArmCommand(false);
        await mavlinkService.setFlightMode('AUTO');
      }
      showNotification('Vehicle Armed — Autonomous mission initiated ✓');
      audioService.playBeep(1000, 120);
    } catch (err: any) {
      showNotification(`Mission start failed: ${err?.message || 'Check pre-arm conditions'}`);
    }
  };

  const handleEmergencyRTL = async () => {
    if (!rtlConfirmPending) {
      // 1st Click: Prime RTL confirmation with 4-second auto-disarm timer
      setRtlConfirmPending(true);
      audioService.playBeep(450, 150);
      showNotification('⚠️ CONFIRM RTL: Click the button a 2nd time within 4s to Return to Launch!');
      if (rtlTimerRef.current) clearTimeout(rtlTimerRef.current);
      rtlTimerRef.current = setTimeout(() => {
        setRtlConfirmPending(false);
      }, 4000);
    } else {
      // 2nd Click: Immediately execute Return to Launch without blocking modals
      if (rtlTimerRef.current) {
        clearTimeout(rtlTimerRef.current);
        rtlTimerRef.current = null;
      }
      setRtlConfirmPending(false);
      setShowRtlModal(false);
      showNotification('🚨 EMERGENCY RTL EXECUTED — Aircraft Returning to Launch Site ✓');
      audioService.playRtlAlert();
      try {
        await mavlinkService.commandRTL();
        if (missionEngine?.triggerEmergencyRTL) {
          missionEngine.triggerEmergencyRTL('Operator 2-Click Emergency RTL from Dashboard');
        }
      } catch (err: any) {
        showNotification(`RTL failed: ${err?.message || 'Check MAVLink link'}`);
      }
    }
  };

  const confirmEmergencyRTL = async () => {
    setShowRtlModal(false);
    setRtlConfirmPending(false);
    showNotification('🚨 EMERGENCY RTL EXECUTED — Aircraft Returning to Launch Site ✓');
    audioService.playRtlAlert();
    try {
      await mavlinkService.commandRTL();
      if (missionEngine?.triggerEmergencyRTL) {
        missionEngine.triggerEmergencyRTL('Operator Emergency RTL from Dashboard');
      }
    } catch (err: any) {
      showNotification(`RTL failed: ${err?.message || 'Could not send mode'}`);
    }
  };

  const handleUploadWaypoints = async () => {
    const mission = groundStationMissionService.getCurrentMission();
    if (!mission || mission.waypoints.length === 0) {
      showNotification('No waypoints to upload. Click map or select a pattern first.');
      return;
    }

    showNotification(`Uploading ${mission.waypoints.length} waypoints to Pixhawk flight controller...`);
    try {
      const res = await groundStationMissionService.uploadMissionToDrone();
      if (res.success) {
        showNotification(`Waypoints uploaded & verified ✓ (${mission.waypoints.length} items)`);
        audioService.playBeep(980, 100);
      } else {
        showNotification(`Upload failed: ${res.message}`);
      }
    } catch (err: any) {
      showNotification(`Upload error: ${err?.message || 'Check connection'}`);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[var(--uav-bg)] text-[var(--uav-text)] flex flex-col font-sans select-none overflow-x-hidden">
      {/* 1. Header (65px) */}
      <Header
        telemetry={telemetry}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        onOpenSettings={() => setIsConfigModalOpen(true)}
        onLogout={onLogout}
        onSwitchRole={onSwitchRole}
        currentRole={currentRole}
        onArmClick={() => {
          if (telemetry.isArmed) {
            handleToggleArm();
          } else {
            handleArmAndFly();
          }
        }}
        onToggleRC={handleToggleRC}
        rcOverrideEnabled={telemetry.rcOverrideEnabled}
      />

      {/* Plan Mode Tactical Planning Banner */}
      {activeTab === 'Plan' && (
        <div className="w-full bg-[#161B22] border-b border-[var(--uav-card-border)] text-white px-4 py-2 flex items-center justify-between z-20 shadow-md">
          <div className="flex items-center gap-2 text-[12px] font-semibold text-emerald-300">
            <Calendar className="w-4 h-4 text-emerald-400" />
            <span>MISSION PLANNER ACTIVE: Click map to plot waypoints or configure autonomous search patterns in the right panel.</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleUploadWaypoints}
              className="px-3 py-1 bg-[#10B981] hover:bg-[#059669] text-emerald-950 text-[11px] font-bold rounded flex items-center gap-1.5 transition cursor-pointer"
            >
              <Send className="w-3 h-3" />
              <span>Upload Plan</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('Fly');
                setActiveNav('Dashboard');
              }}
              className="px-3 py-1 bg-[#21262D] hover:bg-[#262C36] text-slate-300 hover:text-white text-[11px] font-bold rounded transition cursor-pointer"
            >
              Switch to Fly Cockpit
            </button>
          </div>
        </div>
      )}

      {/* 2. Alert Banners (Link Lost / Stale Heartbeat / Connecting) */}
      {telemetry.isLinkLost && (
        <div className="w-full bg-red-600/95 border-b border-red-500 text-white px-4 py-2 flex items-center justify-between z-30 shadow-lg">
          <div className="flex items-center gap-2 text-[12px] font-bold tracking-wide">
            <AlertTriangle className="w-5 h-5 animate-pulse text-amber-300" />
            <span>CRITICAL LINK LOST: No MAVLink heartbeat from Pixhawk for &gt; 5 seconds. Use RC transmitter switch to RTL or LAND immediately.</span>
          </div>
          <button
            type="button"
            onClick={handleEmergencyRTL}
            className={`px-3 py-1 font-bold text-[11px] rounded uppercase tracking-wider cursor-pointer ${
              rtlConfirmPending ? 'bg-red-600 text-white animate-pulse border-2 border-white' : 'bg-white text-red-700 hover:bg-red-50'
            }`}
          >
            {rtlConfirmPending ? 'Confirm RTL Now' : 'Force RTL'}
          </button>
        </div>
      )}

      {!telemetry.isLinkLost && telemetry.isStale && (
        <div className="w-full bg-amber-600/90 border-b border-amber-500 text-white px-4 py-1.5 flex items-center gap-2 text-[12px] font-semibold z-30">
          <AlertTriangle className="w-4 h-4 text-white" />
          <span>STALE HEARTBEAT: Telemetry stream delayed (&gt; 2s). Check wireless signal strength or USB connection.</span>
        </div>
      )}

      {telemetry.isConnecting && (
        <div className="w-full bg-[var(--uav-primary-blue)]/90 border-b border-blue-400 text-white px-4 py-1.5 flex items-center gap-2 text-[12px] font-semibold z-30">
          <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          <span>CONNECTING: Establishing MAVLink bridge to Pixhawk flight controller...</span>
        </div>
      )}

      {/* Floating Action Notice Banner */}
      {actionNotice && (
        <div className="fixed top-20 right-6 z-50 bg-[#161B22] border border-[var(--uav-primary-blue)] text-white px-4 py-2.5 rounded-lg shadow-2xl flex items-center gap-2 text-[12px] font-medium animate-in fade-in slide-in-from-top-4">
          <CheckCircle2 className="w-4 h-4 text-[var(--uav-icon-blue)]" />
          <span>{actionNotice}</span>
        </div>
      )}

      {/* 3. Main Body: Sidebar + Dashboard Panels Grid */}
      <div className="flex flex-1 overflow-hidden w-full">
        {/* Left Sidebar (185px) */}
        <Sidebar
          activeNav={activeNav}
          onNavChange={handleNavChange}
          onEmergencyRTL={handleEmergencyRTL}
          rtlConfirmPending={rtlConfirmPending}
          onToggleRC={handleToggleRC}
          rcOverrideEnabled={telemetry.rcOverrideEnabled}
          isArmed={telemetry.isArmed}
          onToggleArm={handleToggleArm}
        />

        {/* Right Dashboard Content */}
        <main className="flex-1 flex flex-col p-3 gap-3 overflow-y-auto overflow-x-hidden min-w-0">
          {activeTab === 'Logs' ? (
            <FlightLogsDeck
              telemetry={telemetry}
              onReturnToCockpit={() => {
                setActiveTab('Fly');
                setActiveNav('Dashboard');
              }}
            />
          ) : (
            <>
              {/* Stat Row (66px) */}
              <StatRow telemetry={telemetry} />

              {/* Middle Row (540px) */}
              <div className="grid grid-cols-[287px_1fr_419px] gap-3 h-[540px] items-stretch">
                {/* Column 1: Instruments (287px) */}
                <InstrumentColumn telemetry={telemetry} />

                {/* Column 2: Map Panel (1fr) */}
                <MapPanel
                  telemetry={telemetry}
                  onWaypointAdded={(_lat, _lon) => showNotification('Waypoint added to mission')}
                />

                {/* Column 3: Camera & Mission Status (419px) */}
                <div className="flex flex-col gap-3 h-[540px] w-[419px] shrink-0">
                  <CameraFeed telemetry={telemetry} />
                  <MissionStatus
                    isArmed={telemetry.isArmed}
                    onUploadWaypoints={handleUploadWaypoints}
                    onArmAndFly={handleArmAndFly}
                  />
                </div>
              </div>

              {/* Bottom Row (205px) */}
              <div className="grid grid-cols-[1.32fr_1.02fr_0.88fr_1fr] gap-3 h-[205px] items-stretch">
                <WaypointManager
                  onClearAll={() => showNotification('Mission waypoints cleared')}
                  onSaveKml={() => showNotification('Mission KML downloaded')}
                  onLoadKml={() => showNotification('Mission KML loaded')}
                />
                <FlightParams />
                <MissionPatterns
                  onSelectPattern={(pat) => showNotification(`${pat} pattern generated`)}
                />
                <TelemetryLog
                  isFixture={telemetry.isFixture}
                  onExpandLogs={() => {
                    setActiveTab('Logs');
                    setActiveNav('Logs');
                  }}
                />
              </div>
            </>
          )}
        </main>
      </div>

      {/* 4. Safety Confirmation Modal: ARM & FLY */}
      {showArmModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#161B22] border-2 border-emerald-500 rounded-[12px] max-w-md w-full p-6 text-white shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-emerald-400">
              <ShieldAlert className="w-8 h-8" />
              <div>
                <h3 className="font-orbitron font-bold text-[16px] tracking-wide text-white">
                  CONFIRM ARM &amp; FLY
                </h3>
                <p className="text-[11px] text-[var(--uav-muted)]">Autonomous Mission Execution Safety Gate</p>
              </div>
            </div>

            <p className="text-[12px] text-slate-300 leading-relaxed">
              You are about to arm vehicle motors and initiate autonomous mission navigation. Ensure all personnel are clear of spinning propellers, GPS 3D fix is locked, and flight boundaries are secure.
            </p>

            <div className="bg-[#11161D] p-3 rounded-lg border border-[var(--uav-card-border)] space-y-1 text-[11px]">
              <div className="flex justify-between">
                <span className="text-[var(--uav-muted)]">GPS Satellites:</span>
                <span className="font-mono font-bold text-white">{telemetry.satellites} Sats (HDOP {telemetry.hdop.toFixed(1)})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--uav-muted)]">Battery Voltage:</span>
                <span className="font-mono font-bold text-[#22C55E]">{telemetry.batteryVoltage.toFixed(1)}V ({telemetry.batteryPercent}%)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--uav-muted)]">Flight Mode Target:</span>
                <span className="font-mono font-bold text-emerald-400">AUTO / GUIDED</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowArmModal(false)}
                className="px-4 py-2 rounded-lg border border-[var(--uav-card-border)] text-[var(--uav-muted)] hover:text-white hover:bg-[#21262D] text-[12px] font-semibold transition cursor-pointer"
              >
                CANCEL
              </button>
              <button
                type="button"
                onClick={confirmArmAndFly}
                className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[12px] tracking-wider uppercase transition shadow-lg cursor-pointer"
              >
                CONFIRM ARM &amp; LAUNCH
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Safety Confirmation Modal: EMERGENCY RTL */}
      {showRtlModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#161B22] border-2 border-red-600 rounded-[12px] max-w-md w-full p-6 text-white shadow-2xl space-y-4">
            <div className="flex items-center justify-between text-red-500">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />
                <h3 className="font-orbitron font-bold text-[16px] tracking-wide text-white">
                  EMERGENCY RETURN-TO-LAUNCH
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowRtlModal(false)}
                className="text-[var(--uav-muted)] hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-[12px] text-slate-300 leading-relaxed">
              This will immediately abort any active search or servo tracking and command the Pixhawk flight controller to enter RTL mode, climbing to safe altitude and returning directly to the home coordinate.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowRtlModal(false)}
                className="px-4 py-2 rounded-lg border border-[var(--uav-card-border)] text-[var(--uav-muted)] hover:text-white hover:bg-[#21262D] text-[12px] font-semibold transition cursor-pointer"
              >
                CANCEL
              </button>
              <button
                type="button"
                onClick={confirmEmergencyRTL}
                className="px-5 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold text-[12px] tracking-wider uppercase transition shadow-lg cursor-pointer"
              >
                EXECUTE EMERGENCY RTL
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Autonomous Mission Configuration Modal */}
      {isConfigModalOpen && (
        <AutonomousMissionConfigModal
          isOpen={isConfigModalOpen}
          onClose={() => {
            setIsConfigModalOpen(false);
            setActiveNav('Dashboard');
          }}
          telemetry={telemetry.rawTelemetry}
          homePoint={mavlinkService.getHomePoint()}
          pixhawkState={telemetry.rawConnectionState}
          missionState={missionEngine.getCurrentState()}
          onStartMission={() => {
            setIsConfigModalOpen(false);
            setActiveNav('Dashboard');
            missionEngine.startMission();
          }}
        />
      )}

      {/* 7. Mission History / Analytics Modal */}
      {isHistoryModalOpen && (
        <MissionHistoryModal
          isOpen={isHistoryModalOpen}
          onClose={() => {
            setIsHistoryModalOpen(false);
            setActiveNav('Dashboard');
          }}
        />
      )}

      {/* 8. Serial & Diagnostics Modal */}
      {isDiagnosticsModalOpen && (
        <SerialDiagnosticsModal
          isOpen={isDiagnosticsModalOpen}
          onClose={() => {
            setIsDiagnosticsModalOpen(false);
            setActiveNav('Dashboard');
            if (activeTab === 'Logs') setActiveTab('Fly');
          }}
          connectionState={telemetry.rawConnectionState}
          telemetry={telemetry.rawTelemetry}
          runnerLink={runnerCommService.getState()}
        />
      )}

      {/* 9. Tactical Flight Control Modal */}
      {isFlightControlModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#161B22] border border-[var(--uav-card-border)] rounded-[12px] max-w-2xl w-full p-5 text-white shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--uav-card-border)]">
              <div className="flex items-center gap-2.5">
                <Crosshair className="w-5 h-5 text-[var(--uav-primary-blue)]" />
                <h3 className="font-orbitron font-bold text-[15px] tracking-wide text-white">
                  TACTICAL FLIGHT CONTROL &amp; AUTOPILOT OVERRIDES
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsFlightControlModalOpen(false);
                  setActiveNav('Dashboard');
                }}
                className="text-[var(--uav-muted)] hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Command Buttons */}
            <div>
              <span className="text-[11px] font-bold text-[var(--uav-muted)] uppercase tracking-wider block mb-2">
                Primary Flight Modes
              </span>
              <div className="grid grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    if (!telemetry.isArmed) {
                      await mavlinkService.sendArmCommand(true);
                    }
                    await mavlinkService.commandTakeoff(5.0);
                    showNotification('Takeoff commanded: 5.0m AGL');
                  }}
                  className="py-2.5 px-3 rounded-lg bg-emerald-600/20 border border-emerald-500/40 hover:bg-emerald-600/30 text-emerald-300 font-semibold text-[12px] flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  <ArrowUp className="w-4 h-4 text-emerald-400" />
                  <span>Takeoff (5m)</span>
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await mavlinkService.setFlightMode('LOITER');
                    showNotification('Autopilot switched to LOITER');
                  }}
                  className="py-2.5 px-3 rounded-lg bg-[#10B981]/20 border border-emerald-500/40 hover:bg-[#10B981]/30 text-emerald-300 font-semibold text-[12px] flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  <Pause className="w-4 h-4 text-emerald-400" />
                  <span>Loiter Hold</span>
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await mavlinkService.setFlightMode('LAND');
                    showNotification('Autopilot switched to LAND');
                  }}
                  className="py-2.5 px-3 rounded-lg bg-amber-600/20 border border-amber-500/40 hover:bg-amber-600/30 text-amber-300 font-semibold text-[12px] flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  <ArrowDown className="w-4 h-4 text-amber-400" />
                  <span>Land Now</span>
                </button>
                <button
                  type="button"
                  onClick={handleEmergencyRTL}
                  className={`py-2.5 px-3 rounded-lg font-semibold text-[12px] flex items-center justify-center gap-2 transition cursor-pointer ${
                    rtlConfirmPending
                      ? 'bg-red-600 border-2 border-white text-white animate-pulse shadow-lg'
                      : 'bg-rose-600/20 border border-rose-500/40 hover:bg-rose-600/30 text-rose-300'
                  }`}
                  title={
                    rtlConfirmPending
                      ? 'CLICK AGAIN TO RETURN TO LAUNCH NOW'
                      : 'Emergency Return To Launch (Click once to prime, click 2nd time to execute)'
                  }
                >
                  <AlertTriangle
                    className={`w-4 h-4 ${
                      rtlConfirmPending ? 'text-white animate-bounce' : 'text-rose-400'
                    }`}
                  />
                  <span>
                    {rtlConfirmPending ? 'Confirm RTL (Click Again)' : 'Emergency RTL'}
                  </span>
                </button>
              </div>
            </div>

            {/* Guided Directional Nudges */}
            <div>
              <span className="text-[11px] font-bold text-[var(--uav-muted)] uppercase tracking-wider block mb-2">
                Guided 3D Reposition Nudges (±5m Horizontal, ±2m Vertical)
              </span>
              <div className="grid grid-cols-3 gap-2 max-w-xs mx-auto">
                <div />
                <button
                  type="button"
                  onClick={() => handleNudge('N', 5)}
                  className="py-2 px-3 rounded-lg bg-[#21262D] border border-[var(--uav-card-border)] hover:bg-[#262C36] text-white text-[12px] font-mono font-bold transition cursor-pointer"
                >
                  ▲ North (+5m)
                </button>
                <button
                  type="button"
                  onClick={() => handleNudge('UP', 2)}
                  className="py-2 px-3 rounded-lg bg-[#21262D] border border-[var(--uav-card-border)] hover:bg-[#262C36] text-emerald-300 text-[12px] font-mono font-bold transition cursor-pointer"
                >
                  ▲ Climb (+2m)
                </button>

                <button
                  type="button"
                  onClick={() => handleNudge('W', 5)}
                  className="py-2 px-3 rounded-lg bg-[#21262D] border border-[var(--uav-card-border)] hover:bg-[#262C36] text-white text-[12px] font-mono font-bold transition cursor-pointer"
                >
                  ◀ West (+5m)
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await mavlinkService.setFlightMode('LOITER');
                    showNotification('Loiter Hold');
                  }}
                  className="py-2 px-3 rounded-lg bg-[#10B981] hover:bg-[#059669] text-emerald-950 font-bold text-[12px] font-mono transition cursor-pointer"
                >
                  STOP / HOLD
                </button>
                <button
                  type="button"
                  onClick={() => handleNudge('E', 5)}
                  className="py-2 px-3 rounded-lg bg-[#21262D] border border-[var(--uav-card-border)] hover:bg-[#262C36] text-white text-[12px] font-mono font-bold transition cursor-pointer"
                >
                  East (+5m) ▶
                </button>

                <div />
                <button
                  type="button"
                  onClick={() => handleNudge('S', 5)}
                  className="py-2 px-3 rounded-lg bg-[#21262D] border border-[var(--uav-card-border)] hover:bg-[#262C36] text-white text-[12px] font-mono font-bold transition cursor-pointer"
                >
                  ▼ South (+5m)
                </button>
                <button
                  type="button"
                  onClick={() => handleNudge('DOWN', 2)}
                  className="py-2 px-3 rounded-lg bg-[#21262D] border border-[var(--uav-card-border)] hover:bg-[#262C36] text-amber-300 text-[12px] font-mono font-bold transition cursor-pointer"
                >
                  ▼ Descend (-2m)
                </button>
              </div>
            </div>

            {/* Active Flight Status Footer */}
            {/* Active Flight Status Footer */}
            <div className="pt-2 border-t border-[var(--uav-card-border)] flex items-center justify-between">
              <div className="flex items-center gap-3 text-[11px] font-mono">
                <span className="text-[var(--uav-muted)]">
                  Mode: <strong className="text-emerald-400">{telemetry.flightMode || 'GUIDED'}</strong>
                </span>
                <span className="text-[var(--uav-muted)]">
                  Motors: <strong className={telemetry.isArmed ? 'text-red-400' : 'text-emerald-400'}>{telemetry.isArmed ? 'ARMED' : 'DISARMED'}</strong>
                </span>
                <span className="text-[var(--uav-muted)]">
                  Altitude: <strong className="text-amber-400">{(telemetry.altitudeMeters || 0).toFixed(1)}m</strong>
                </span>
              </div>

              <button
                type="button"
                onClick={() => {
                  setIsFlightControlModalOpen(false);
                  setActiveNav('Dashboard');
                }}
                className="px-4 py-1.5 rounded-lg border border-[var(--uav-card-border)] text-[var(--uav-muted)] hover:text-white text-[12px] font-semibold transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
