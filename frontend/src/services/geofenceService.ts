/**
 * Geofence Coordination Service
 * Manages autonomous geofence boundaries (Circle, Rectangle, Arena, Polygon),
 * altitude ceilings/floors, breach failsafe actions (RTL, LOITER, LAND),
 * real-time telemetry breach monitoring, and MAVLink / Pixhawk synchronization.
 */

import { mavlinkService } from './mavlinkService';
import { audioService } from './audioService';
import { LatLngPoint } from '../types/mission';

export type GeofenceShape = 'ARENA_RECTANGLE' | 'CIRCLE' | 'CUSTOM_POLYGON';
export type GeofenceBreachAction = 'RTL' | 'LOITER' | 'LAND' | 'POSHOLD';
export type GeofenceAnchor = 'HOME' | 'DRONE' | 'CUSTOM';

export interface GeofenceConfig {
  enabled: boolean;
  shape: GeofenceShape;
  radiusMeters: number;          // for CIRCLE
  widthMeters: number;           // for ARENA_RECTANGLE (East-West)
  heightMeters: number;          // for ARENA_RECTANGLE (North-South)
  maxAltitudeMeters: number;     // Ceiling AGL
  minAltitudeMeters: number;     // Floor AGL
  breachAction: GeofenceBreachAction;
  anchorType: GeofenceAnchor;
  customAnchor: LatLngPoint | null;
  customVertices: LatLngPoint[];
}

export interface GeofenceState extends GeofenceConfig {
  isBreached: boolean;
  breachReason: string | null;
  distanceToBoundaryMeters: number | null;
  currentAltitudeMeters: number;
  lastBreachTimestamp: number | null;
  effectiveAnchor: LatLngPoint | null;
}

const STORAGE_KEY = 'cade_geofence_config_v2';

// Standard SAE India ADDC Rule 3.3 Defaults: 50m x 50m Arena, 25m Ceiling, RTL Action
const DEFAULT_CONFIG: GeofenceConfig = {
  enabled: true,
  shape: 'ARENA_RECTANGLE',
  radiusMeters: 50,
  widthMeters: 50,
  heightMeters: 50,
  maxAltitudeMeters: 25.0,
  minAltitudeMeters: 1.5,
  breachAction: 'RTL',
  anchorType: 'HOME',
  customAnchor: null,
  customVertices: [],
};

// Geodesic destination helper using WGS-84 Earth radius
function computeDestination(lat: number, lon: number, distanceMeters: number, bearingDeg: number): LatLngPoint {
  const R = 6371000;
  const dByR = distanceMeters / R;
  const radBearing = (bearingDeg * Math.PI) / 180;
  const radLat = (lat * Math.PI) / 180;
  const radLon = (lon * Math.PI) / 180;

  const lat2 = Math.asin(
    Math.sin(radLat) * Math.cos(dByR) +
    Math.cos(radLat) * Math.sin(dByR) * Math.cos(radBearing)
  );
  const lon2 = radLon + Math.atan2(
    Math.sin(radBearing) * Math.sin(dByR) * Math.cos(radLat),
    Math.cos(dByR) - Math.sin(radLat) * Math.sin(lat2)
  );

  return {
    lat: (lat2 * 180) / Math.PI,
    lng: (lon2 * 180) / Math.PI,
  };
}

// Haversine distance in meters
function computeHaversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Point-in-polygon raycasting algorithm
function isPointInPolygon(pt: LatLngPoint, poly: LatLngPoint[]): boolean {
  if (poly.length < 3) return true;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].lat, yi = poly[i].lng;
    const xj = poly[j].lat, yj = poly[j].lng;
    const intersect = ((yi > pt.lng) !== (yj > pt.lng)) &&
      (pt.lat < ((xj - xi) * (pt.lng - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

class GeofenceService {
  private config: GeofenceConfig = { ...DEFAULT_CONFIG };
  private state: GeofenceState;
  private listeners: Set<(state: GeofenceState) => void> = new Set();
  private telemetryUnsubscribe: (() => void) | null = null;
  private breachAudioCooldown = 0;
  private autoFailsafeTriggered = false;

  constructor() {
    this.restoreConfig();
    this.state = {
      ...this.config,
      isBreached: false,
      breachReason: null,
      distanceToBoundaryMeters: null,
      currentAltitudeMeters: 0,
      lastBreachTimestamp: null,
      effectiveAnchor: null,
    };
    this.initTelemetry();
  }

  private restoreConfig() {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        this.config = { ...DEFAULT_CONFIG, ...parsed };
      }
    } catch {
      this.config = { ...DEFAULT_CONFIG };
    }
  }

  private persistConfig() {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.config));
    } catch {}
  }

  private initTelemetry() {
    this.telemetryUnsubscribe = mavlinkService.subscribeTelemetry((telem) => {
      this.evaluateBreach(telem);
    });
  }

  public getEffectiveAnchor(): LatLngPoint | null {
    if (this.config.anchorType === 'CUSTOM' && this.config.customAnchor) {
      return this.config.customAnchor;
    }
    const home = mavlinkService.getHomePoint();
    if (this.config.anchorType === 'HOME' && home && home.isSet && Math.abs(home.latitude) > 0.001) {
      return { lat: home.latitude, lng: home.longitude };
    }
    const telem = mavlinkService.getTelemetry();
    if (telem && telem.gps?.isLocked && telem.latitude && Math.abs(telem.latitude) > 0.001) {
      return { lat: telem.latitude, lng: telem.longitude };
    }
    if (home && Math.abs(home.latitude) > 0.001) {
      return { lat: home.latitude, lng: home.longitude };
    }
    return null;
  }

  /**
   * Generates polygon vertices for map rendering and breach checks
   */
  public getBoundaryVertices(): LatLngPoint[] {
    const anchor = this.getEffectiveAnchor();
    if (!anchor) return [];

    if (this.config.shape === 'ARENA_RECTANGLE') {
      const halfW = (this.config.widthMeters || 50) / 2;
      const halfH = (this.config.heightMeters || 50) / 2;
      const diag = Math.sqrt(halfW * halfW + halfH * halfH);
      const angle = (Math.atan2(halfW, halfH) * 180) / Math.PI;

      const p1 = computeDestination(anchor.lat, anchor.lng, diag, angle);
      const p2 = computeDestination(anchor.lat, anchor.lng, diag, 180 - angle);
      const p3 = computeDestination(anchor.lat, anchor.lng, diag, 180 + angle);
      const p4 = computeDestination(anchor.lat, anchor.lng, diag, 360 - angle);
      return [p1, p2, p3, p4];
    }

    if (this.config.shape === 'CIRCLE') {
      const radius = this.config.radiusMeters || 50;
      const segments = 32;
      const vertices: LatLngPoint[] = [];
      for (let i = 0; i < segments; i++) {
        const bearing = (i * 360) / segments;
        vertices.push(computeDestination(anchor.lat, anchor.lng, radius, bearing));
      }
      return vertices;
    }

    if (this.config.shape === 'CUSTOM_POLYGON' && this.config.customVertices.length >= 3) {
      return this.config.customVertices;
    }

    return [];
  }

  private evaluateBreach(telem: any) {
    const currentAlt = telem.altitude || telem.altitudeMeters || 0;
    this.state.currentAltitudeMeters = currentAlt;
    const anchor = this.getEffectiveAnchor();
    this.state.effectiveAnchor = anchor;

    const isGpsValid = Boolean(telem.gps?.isLocked && Math.abs(telem.latitude) > 0.001);
    if (!this.config.enabled || !anchor || !isGpsValid) {
      if (this.state.isBreached) {
        this.state.isBreached = false;
        this.state.breachReason = null;
        this.notify();
      }
      return;
    }

    const dronePt: LatLngPoint = { lat: telem.latitude, lng: telem.longitude };
    let isHorizontalBreached = false;
    let distToEdge: number | null = null;

    if (this.config.shape === 'CIRCLE') {
      const distFromCenter = computeHaversine(anchor.lat, anchor.lng, dronePt.lat, dronePt.lng);
      distToEdge = parseFloat((this.config.radiusMeters - distFromCenter).toFixed(1));
      isHorizontalBreached = distFromCenter > this.config.radiusMeters;
    } else {
      const vertices = this.getBoundaryVertices();
      if (vertices.length >= 3) {
        const isInside = isPointInPolygon(dronePt, vertices);
        isHorizontalBreached = !isInside;
        // Approximate distance to anchor
        const distFromCenter = computeHaversine(anchor.lat, anchor.lng, dronePt.lat, dronePt.lng);
        const approxHalf = Math.min(this.config.widthMeters, this.config.heightMeters) / 2;
        distToEdge = parseFloat((approxHalf - distFromCenter).toFixed(1));
      }
    }

    const isCeilingBreached = currentAlt > this.config.maxAltitudeMeters;
    const isFloorBreached = telem.isArmed && currentAlt < this.config.minAltitudeMeters && currentAlt > 0.3;

    const isBreached = isHorizontalBreached || isCeilingBreached || isFloorBreached;
    this.state.distanceToBoundaryMeters = distToEdge;

    if (isBreached) {
      let reason = '';
      if (isHorizontalBreached) reason = 'Perimeter Boundary Breached';
      else if (isCeilingBreached) reason = `Altitude Ceiling Exceeded (${currentAlt.toFixed(1)}m > ${this.config.maxAltitudeMeters}m)`;
      else if (isFloorBreached) reason = `Floor Altitude Breached (${currentAlt.toFixed(1)}m < ${this.config.minAltitudeMeters}m)`;

      const wasAlreadyBreached = this.state.isBreached;
      this.state.isBreached = true;
      this.state.breachReason = reason;
      this.state.lastBreachTimestamp = Date.now();

      // Trigger audible warning on first breach or every 5 seconds
      if (Date.now() - this.breachAudioCooldown > 5000) {
        this.breachAudioCooldown = Date.now();
        audioService.playRtlAlert();
        audioService.triggerHaptic('warning');
      }

      // Execute autonomous failsafe action if airborne and armed
      if (telem.isArmed && !this.autoFailsafeTriggered && !wasAlreadyBreached) {
        this.autoFailsafeTriggered = true;
        this.executeBreachAction(this.config.breachAction);
      }
    } else {
      if (this.state.isBreached) {
        this.state.isBreached = false;
        this.state.breachReason = null;
        this.autoFailsafeTriggered = false;
      }
    }

    this.notify();
  }

  private async executeBreachAction(action: GeofenceBreachAction) {
    console.warn(`[GEOFENCE FAILSAFE] Executing breach response: ${action}`);
    try {
      if (action === 'RTL') {
        await mavlinkService.setFlightMode('RTL');
      } else if (action === 'LOITER') {
        await mavlinkService.setFlightMode('LOITER');
      } else if (action === 'LAND') {
        await mavlinkService.setFlightMode('LAND');
      } else if (action === 'POSHOLD') {
        await mavlinkService.setFlightMode('POSHOLD');
      }
    } catch (e) {
      console.error('[GEOFENCE] Failed to dispatch breach mode command', e);
    }
  }

  public setEnabled(enabled: boolean) {
    this.config.enabled = enabled;
    this.state.enabled = enabled;
    if (!enabled) {
      this.state.isBreached = false;
      this.state.breachReason = null;
      this.autoFailsafeTriggered = false;
    }
    this.persistConfig();
    this.notify();
  }

  public updateConfig(newConfig: Partial<GeofenceConfig>) {
    this.config = { ...this.config, ...newConfig };
    this.state = { ...this.state, ...this.config };
    this.persistConfig();
    this.notify();
  }

  public resetToADDCDefaults() {
    this.config = { ...DEFAULT_CONFIG };
    this.state = { ...this.state, ...this.config, isBreached: false, breachReason: null };
    this.persistConfig();
    audioService.playBeep(880, 100);
    this.notify();
  }

  public clearGeofence() {
    this.config.enabled = false;
    this.state.enabled = false;
    this.state.isBreached = false;
    this.state.breachReason = null;
    this.persistConfig();
    audioService.playBeep(450, 80);
    this.notify();
  }

  /**
   * Sets a custom anchor point anywhere (e.g. cricket ground selected on map)
   */
  public setCustomAnchor(lat: number, lng: number) {
    this.config.anchorType = 'CUSTOM';
    this.config.customAnchor = { lat, lng };
    this.state.anchorType = 'CUSTOM';
    this.state.customAnchor = { lat, lng };
    this.state.effectiveAnchor = { lat, lng };
    this.persistConfig();
    audioService.playBeep(880, 80);
    this.notify();
  }

  /**
   * Checks whether given coordinate is strictly inside the active geofence
   */
  public isInsideGeofence(lat: number, lng: number): boolean {
    if (!this.config.enabled) return true;
    const anchor = this.getEffectiveAnchor();
    if (!anchor || Math.abs(lat) <= 0.001) return true;

    if (this.config.shape === 'CIRCLE') {
      const dist = computeHaversine(anchor.lat, anchor.lng, lat, lng);
      return dist <= (this.config.radiusMeters || 50);
    } else {
      const vertices = this.getBoundaryVertices();
      if (vertices.length < 3) return true;
      return isPointInPolygon({ lat, lng }, vertices);
    }
  }

  /**
   * Checks whether the vehicle is permitted to arm under geofence rules
   */
  public canArmVehicle(lat?: number, lng?: number): { canArm: boolean; reason?: string } {
    if (!this.config.enabled) return { canArm: true };
    const droneLat = lat ?? mavlinkService.getTelemetry().latitude;
    const droneLng = lng ?? mavlinkService.getTelemetry().longitude;
    if (droneLat && droneLng && Math.abs(droneLat) > 0.001) {
      const anchor = this.getEffectiveAnchor();
      if (!anchor || (Math.abs(anchor.lat - droneLat) < 0.0002 && Math.abs(anchor.lng - droneLng) < 0.0002)) {
        return { canArm: true };
      }
      const inside = this.isInsideGeofence(droneLat, droneLng);
      if (!inside) {
        return {
          canArm: false,
          reason: 'Aircraft is OUTSIDE the active Geofence boundary. Move aircraft inside or position geofence over current area to arm.'
        };
      }
    }
    return { canArm: true };
  }

  public getState(): GeofenceState {
    return { ...this.state };
  }

  public subscribe(fn: (state: GeofenceState) => void): () => void {
    this.listeners.add(fn);
    fn(this.getState());
    return () => this.listeners.delete(fn);
  }

  private notify() {
    const s = this.getState();
    this.listeners.forEach((fn) => fn(s));
  }
}

export const geofenceService = new GeofenceService();
