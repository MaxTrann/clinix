import styles from './status.module.css';

export function LoadingState({
  message = 'Đang tải...',
}: {
  message?: string;
}) {
  return (
    <p role="status" className={styles.box}>
      {message}
    </p>
  );
}
