import { errorMessageFor } from '../api/error-message';
import { RequestAbortedError } from '../api/errors';
import styles from './status.module.css';

interface ErrorStateProps {
  error: unknown;
  onRetry?: () => void;
}

export function ErrorState({ error, onRetry }: ErrorStateProps) {
  // Nơi gọi tự huỷ thì không có gì để báo cho người dùng
  if (error instanceof RequestAbortedError) return null;

  return (
    <div role="alert" className={styles.box}>
      <p>{errorMessageFor(error)}</p>
      {onRetry && (
        <button type="button" className={styles.retry} onClick={onRetry}>
          Thử lại
        </button>
      )}
    </div>
  );
}
