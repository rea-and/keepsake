import React, { useCallback, useEffect, useState } from 'react';
import { MonitorSmartphone } from 'lucide-react';

interface Device {
  id: string;
  label: string;
  createdAt: number;
  lastUsedAt: number;
  current: boolean;
}

interface DevicesListProps {
  /** Called after this device's own session is revoked, so the app can sign out locally. */
  onCurrentRevoked: () => void;
}

const formatLastUsed = (timestamp: number) => {
  const minutes = Math.round((Date.now() - timestamp) / 60000);
  if (minutes < 2) return 'just now';
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hours ago`;
  return new Date(timestamp).toLocaleDateString();
};

/** Devices signed in to this account, with a way to sign any of them out (for example a lost phone). */
export const DevicesList: React.FC<DevicesListProps> = ({ onCurrentRevoked }) => {
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/sessions');
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      setDevices((await res.json()).sessions || []);
      setError('');
    } catch {
      setError('Could not load your devices. Check your connection.');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const revoke = async (device: Device) => {
    const message = device.current ? 'Sign out of this device?' : `Sign out "${device.label}"? It will need to sign in again.`;
    if (!window.confirm(message)) return;
    try {
      const res = await fetch(`/api/auth/sessions/${encodeURIComponent(device.id)}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 404) throw new Error(`Server returned ${res.status}`);
      if (device.current) onCurrentRevoked();
      else await load();
    } catch {
      setError('Could not sign that device out. Try again.');
    }
  };

  return (
    <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#161619] space-y-3">
      <div className="flex items-center gap-2">
        <MonitorSmartphone className="w-4 h-4 text-sky-500" aria-hidden="true" />
        <h4 className="font-semibold text-sm text-neutral-900 dark:text-white">Signed-in devices</h4>
      </div>
      {error && <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
      {devices === null && !error && <p className="text-xs text-neutral-500">Loading…</p>}
      {devices && devices.length === 0 && <p className="text-xs text-neutral-500">No devices found.</p>}
      <ul className="space-y-2">
        {devices?.map((device) => (
          <li key={device.id} className="flex items-center justify-between gap-3 text-sm">
            <div className="min-w-0">
              <p className="font-medium text-neutral-900 dark:text-white truncate">
                {device.label}
                {device.current && <span className="ml-2 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-400">This device</span>}
              </p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">Last used {formatLastUsed(device.lastUsedAt)}</p>
            </div>
            <button
              type="button"
              onClick={() => void revoke(device)}
              className="shrink-0 px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 text-xs font-semibold text-neutral-600 dark:text-neutral-300 hover:text-rose-600 dark:hover:text-rose-400 hover:border-rose-300 dark:hover:border-rose-900"
            >
              Sign out
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};
