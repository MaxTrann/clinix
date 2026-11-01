import styles from './components/admin-components.module.css';

export function AdminForbiddenPage() {
  return (
    <main className={styles.forbiddenPage}>
      <section role="alert" className={styles.forbiddenCard}>
        <h1>Không đủ quyền truy cập</h1>
        <p>Bạn không có quyền truy cập trang này.</p>
      </section>
    </main>
  );
}
