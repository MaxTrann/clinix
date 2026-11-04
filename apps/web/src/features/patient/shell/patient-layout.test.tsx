import { render, screen } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { resetAuthForTest } from '../../auth/auth-session';
import { setAuthState } from '../../auth/auth-store';
import { PatientLayout } from './patient-layout';

// patient F1. PL-08 [đề xuất]: nếu khung bị render khi chưa có người dùng (gắn sai chỗ, ngoài cổng RequireAuth) thì không vẽ gì,
// không hiện họ tên rỗng hay nút Đăng xuất. Đường đúng đi qua cổng đã phủ ở router/role-routes.test.tsx.
it('PL-08 KG-03 không có người dùng: khung không render gì', () => {
  resetAuthForTest();
  setAuthState({ status: 'unauthenticated', user: null });
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <PatientLayout items={[]} />,
        // Trang con có chữ nhận dạng: khung không được để lộ trang con khi chưa có người dùng
        children: [{ index: true, element: <p>Nội dung trang con</p> }],
      },
    ],
    { initialEntries: ['/'] },
  );
  const { container } = render(<RouterProvider router={router} />);
  expect(container).toBeEmptyDOMElement();
  expect(screen.queryByText('Nội dung trang con')).toBeNull();
});
