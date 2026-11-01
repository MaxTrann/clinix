import { Link } from 'react-router';
import { homePathFor, useAuth } from '../features/auth';

// Trang công khai: Khách vãng lai và Bệnh nhân cùng tra cứu ở đây nên người đã đăng nhập không bị chuyển đi.
export function HomePage() {
  const { user } = useAuth();

  return (
    <main>
      <h1>CLINIX</h1>
      <p>Hệ thống đặt lịch khám bệnh</p>
      {user && <Link to={homePathFor(user.vaiTro)}>Về trang của bạn</Link>}
    </main>
  );
}
