import { render, screen } from '@testing-library/react';
import App from './App';

// Task P2 (khởi tạo apps/web) — không có mã test case riêng trong plan auth.
describe('App', () => {
  it('hiển thị tên hệ thống', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'CLINIX' })).toBeInTheDocument();
  });
});
