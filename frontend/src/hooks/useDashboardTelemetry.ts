import { useState, useEffect, useRef } from 'react';
import { DroneTelemetry } from '../types/mission';
import { PixhawkConnectionState } from '../types/mavlink';
import { mavlinkService } from '../services/mavlinkService';
import { missionEngine } from '../services/missionEngine';

export interface DashboardTelemetryData {
  isFixture: boolean;
  isConnected: boolean;
  isConnecting: boolean;
  isArmed: boolean;
  flightMode: string;
  satellites: number;
  hdop: number;
  batteryPercent: number;
  batteryVoltage: number;
  altitudeMeters: number;
  speedMs: number;
  verticalSpeedMs: number;
  headingDeg: number;
  rollDeg: number;
  pitchDeg: number;
  latitude: number;
  longitude: number;
  flightTimeStr: string;
  rcSignalDetected: boolean;
  rcOverrideEnabled: boolean;
  magFieldStrength: number;
  isCompassHealthy: boolean;
  isCompassCalibrated: boolean;
  isStale: boolean;
  isLinkLost: boolean;
  rawTelemetry: DroneTelemetry;
  rawConnectionState: PixhawkConnectionState;
}

export const useDashboardTelemetry = (): DashboardTelemetryData => {
  const isFixtureMode =
    import.meta.env.DEV &&
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('fixture') === 'reference';

  const [telemetry, setTelemetry] = useState<DroneTelemetry>(mavlinkService.getTelemetry());
  const [connState, setConnState] = useState<PixhawkConnectionState>(mavlinkService.getConnectionState());
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(missionEngine.getElapsedSeconds());
  const [isStale, setIsStale] = useState<boolean>(false);
  const [isLinkLost, setIsLinkLost] = useState<boolean>(false);

  const lastUpdateRef = useRef<number>(0);

  useEffect(() => {
    if (isFixtureMode) return;

    // Throttle telemetry listener updates to <= 10Hz (every 100ms)
    const unsubTelemetry = mavlinkService.subscribeTelemetry((t) => {
      const now = Date.now();
      if (now - lastUpdateRef.current >= 100) {
        lastUpdateRef.current = now;
        setTelemetry(t);
      }
    });

    const unsubConn = mavlinkService.subscribeConnection((c) => {
      setConnState(c);
    });

    const unsubMission = missionEngine.subscribeState((_st, elapsed) => {
      setElapsedSeconds(elapsed);
    });

    // Watchdog for stale heartbeat (> 2s) and link lost (> 5s)
    const watchdog = setInterval(() => {
      const state = mavlinkService.getConnectionState();
      if (state.isConnected && state.lastHeartbeat > 0) {
        const age = Date.now() - state.lastHeartbeat;
        setIsStale(age > 2000);
        setIsLinkLost(age > 5000);
      } else {
        setIsStale(false);
        setIsLinkLost(false);
      }
    }, 500);

    return () => {
      unsubTelemetry();
      unsubConn();
      unsubMission();
      clearInterval(watchdog);
    };
  }, [isFixtureMode]);

  const formatFlightTime = (sec: number): string => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  if (isFixtureMode) {
    return {
      isFixture: true,
      isConnected: true,
      isConnecting: false,
      isArmed: false,
      flightMode: 'DISARMED',
      satellites: 8,
      hdop: 0.9,
      batteryPercent: 88,
      batteryVoltage: 12.4,
      altitudeMeters: 0.0,
      speedMs: 0.0,
      verticalSpeedMs: 0.0,
      headingDeg: 0,
      rollDeg: 0.0,
      pitchDeg: 0.0,
      latitude: 17.3850,
      longitude: 78.4867,
      flightTimeStr: '00:00',
      rcSignalDetected: false,
      rcOverrideEnabled: true,
      magFieldStrength: 480,
      isCompassHealthy: true,
      isCompassCalibrated: true,
      isStale: false,
      isLinkLost: false,
      rawTelemetry: telemetry,
      rawConnectionState: connState,
    };
  }

  const isConnected = connState.isConnected;
  const isConnecting = connState.phase === 'WAITING_FOR_MAVLINK' || connState.phase === 'SERIAL_OPENING';

  return {
    isFixture: false,
    isConnected,
    isConnecting,
    isArmed: telemetry.isArmed,
    flightMode: telemetry.flightMode || 'DISARMED',
    satellites: telemetry.gps?.satellites ?? 0,
    hdop: telemetry.gps?.hdop ?? 99.0,
    batteryPercent: telemetry.batteryPercent ?? 0,
    batteryVoltage: telemetry.batteryVoltage ?? 0,
    altitudeMeters: telemetry.altitude ?? 0.0,
    speedMs: telemetry.groundSpeed ?? 0.0,
    verticalSpeedMs: telemetry.verticalSpeed ?? 0.0,
    headingDeg: Math.round(((telemetry.heading ?? 0) % 360 + 360) % 360),
    rollDeg: telemetry.roll ?? 0.0,
    pitchDeg: telemetry.pitch ?? 0.0,
    latitude: telemetry.latitude || telemetry.gps?.latitude || 0,
    longitude: telemetry.longitude || telemetry.gps?.longitude || 0,
    flightTimeStr: formatFlightTime(elapsedSeconds),
    rcSignalDetected: Boolean(telemetry.rcSignalDetected),
    rcOverrideEnabled: Boolean(connState.rcOverrideEnabled ?? telemetry.rcOverrideEnabled ?? true),
    magFieldStrength: telemetry.magFieldStrength ?? 480,
    isCompassHealthy: telemetry.isCompassHealthy ?? true,
    isCompassCalibrated: telemetry.isCompassCalibrated ?? true,
    isStale,
    isLinkLost,
    rawTelemetry: telemetry,
    rawConnectionState: connState,
  };
};
