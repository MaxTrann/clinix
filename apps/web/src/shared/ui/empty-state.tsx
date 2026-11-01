import styles from './status.module.css';

export function EmptyState({
  message = 'Chưa có dữ liệu.',
}: {
  message?: string;
}) {
  return <p className={styles.box}>{message}</p>;
}
