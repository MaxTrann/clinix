import { NETWORK_ERROR_MESSAGE } from '../api/error-message';
import { useOnlineStatus } from '../hooks/use-online-status';

export function OfflineBanner() {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <p
      role="alert"
      className="border-b border-danger-line bg-danger-soft px-3 py-2 text-center text-sm text-danger-strong"
    >
      {NETWORK_ERROR_MESSAGE}
    </p>
  );
}
