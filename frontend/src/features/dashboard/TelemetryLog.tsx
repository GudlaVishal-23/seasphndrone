import React, { useState, useEffect, useRef } from 'react';
import { Trash2 } from 'lucide-react';
import { Card } from '../../ui/Card';
import { eventLogService, GroundStationLogEvent } from '../../services/eventLogService';

interface TelemetryLogProps {
  className?: string;
  isFixture?: boolean;
}

interface LogEntry {
  id: string;
  timeStr: string;
  message: string;
  type: 'info' | 'success' | 'warn' | 'error';
}

const FIXTURE_LOGS: LogEntry[] = [
  { id: 'f1', timeStr: '12:00:01', message: 'Waiting for valid GPS...', type: 'info' },
  { id: 'f2', timeStr: '12:00:03', message: 'GPS fix acquired (8 sats)', type: 'success' },
  { id: 'f3', timeStr: '12:00:04', message: 'Battery: 88% (12.4V)', type: 'info' },
  { id: 'f4', timeStr: '12:00:05', message: 'EKF: Stable', type: 'warn' },
  { id: 'f5', timeStr: '12:00:06', message: 'Vehicle is DISARMED', type: 'warn' },
  { id: 'f6', timeStr: '12:00:08', message: 'Ready for mission', type: 'success' },
];

export const TelemetryLog: React.FC<TelemetryLogProps> = ({
  className = '',
  isFixture = false,
}) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isFixture) {
      setLogs(FIXTURE_LOGS);
      return;
    }

    const unsub = eventLogService.subscribeEvents((events: GroundStationLogEvent[]) => {
      // eventLogService unshifts new items, so reverse them for chronological top-to-bottom log view
      const chronological = [...events].reverse().slice(-500);
      setLogs(chronological);
    });

    return () => unsub();
  }, [isFixture]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const handleClear = () => {
    if (!isFixture) {
      eventLogService.clearEvents();
    }
    setLogs([]);
  };

  const getLogColor = (type: LogEntry['type']) => {
    switch (type) {
      case 'success':
        return 'text-[#22C55E]';
      case 'warn':
        return 'text-[var(--uav-amber)]';
      case 'error':
        return 'text-[#EF4444]';
      default:
        return 'text-[#94A3B8]';
    }
  };

  return (
    <Card
      title="TELEMETRY LOG"
      collapsible
      action={
        <button
          type="button"
          onClick={handleClear}
          className="flex items-center gap-1 px-2 py-0.5 rounded border border-red-500/50 text-red-400 hover:bg-red-500/20 text-[10px] font-medium transition cursor-pointer"
          title="Clear Telemetry Log"
          aria-label="Clear Telemetry Log"
        >
          <Trash2 className="w-3 h-3" />
          <span>Clear</span>
        </button>
      }
      className={`h-[205px] w-full shrink-0 select-none ${className}`}
      contentClassName="p-2 flex flex-col justify-between overflow-hidden"
    >
      <div
        ref={scrollRef}
        className="w-full h-full overflow-y-auto space-y-1 font-mono text-[11px] leading-[18px] pr-1 scrollbar-thin scrollbar-thumb-[#1C2A42]"
      >
        {logs.length === 0 ? (
          <div className="h-full flex items-center justify-center text-[var(--uav-muted)] text-[11px] italic">
            No telemetry events recorded
          </div>
        ) : (
          logs.map((log) => (
            <div key={log.id} className="flex items-start gap-1.5 break-all">
              <span className="text-[var(--uav-muted)] select-none shrink-0">
                [{log.timeStr}]
              </span>
              <span className={getLogColor(log.type)}>
                {log.message}
              </span>
            </div>
          ))
        )}
      </div>
    </Card>
  );
};
