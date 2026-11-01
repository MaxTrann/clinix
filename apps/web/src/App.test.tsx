import { render, screen } from '@testing-library/react';
import App from './App';

// Task P2, cập nhật ở P6: App dựng router thật của trình duyệt; các route chi tiết ở router/routes.test.tsx.
describe('App', () => {
  it('hiển thị tên hệ thống', async () => {
    render(<App />);
    expect(
      await screen.findByRole('heading', { name: 'CLINIX' }),
    ).toBeInTheDocument();
  });
});
