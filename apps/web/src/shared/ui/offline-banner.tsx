import { NETWORK_ERROR_MESSAGE } from '../api/error-message';
import { useOnlineStatus } from '../hooks/use-online-status';
import styles from './status.module.css';

export function OfflineBanner() {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <p role="alert" className={styles.box}>
      {NETWORK_ERROR_MESSAGE}
    </p>
  );
}
