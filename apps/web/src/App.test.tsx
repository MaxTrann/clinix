import { render, screen } from '@testing-library/react';
import App from './App';

// Task P2, cập nhật ở P6: App dựng router thật của trình duyệt; các route chi tiết ở router/routes.test.tsx.
describe('App', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('hiển thị tên hệ thống', async () => {
    // Khung công khai (search F1) gọi /public/clinic-info: giả API lỗi để test không đi ra mạng thật
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('{}', { status: 500 }))),
    );
    render(<App />);
    expect(
      await screen.findByRole('heading', { name: 'CLINIX' }),
    ).toBeInTheDocument();
  });
});
