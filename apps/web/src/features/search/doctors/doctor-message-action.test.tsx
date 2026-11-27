import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import type { VaiTro } from '../../auth';
import { resetAuthStore, setAuthState } from '../../auth/auth-store';
import { DoctorMessageAction } from './doctor-message-action';

// chat F4 `[ĐỤNG search]` — nút "Nhắn tin" với bác sĩ (2.4.20 b1; PLAN chat MH7, T12; WCH-13): Bệnh nhân và khách thấy liên kết tới trang Tin nhắn `?bacSi=`;
// Bác sĩ, Lễ tân, Quản trị viên thấy nút vô hiệu kèm chú thích. Khách đi đăng nhập rồi quay lại: khoá ở `router/chat-shell-route.test.tsx` (CSR-09) và
// `features/auth/return-to.test.ts` (BRT-CH1). Mã ca DMA-nn là [đề xuất].
afterEach(() => resetAuthStore());

function renderAction() {
  render(
    <MemoryRouter>
      <DoctorMessageAction bacSiId="12" label="Nhắn tin" className="h-12" />
    </MemoryRouter>,
  );
}

function signedInAs(vaiTro: VaiTro) {
  setAuthState({
    status: 'authenticated',
    user: { vaiTro, hoTen: 'Người dùng mẫu', daXacMinhEmail: true },
  });
}

describe('chat F4 — nút "Nhắn tin" ở tra cứu bác sĩ (WCH-13)', () => {
  it('WCH-13 DMA-01 Bệnh nhân: liên kết tới `/benh-nhan/tin-nhan?bacSi=12`', () => {
    signedInAs('BenhNhan');
    renderAction();
    expect(screen.getByRole('link', { name: 'Nhắn tin' })).toHaveAttribute(
      'href',
      '/benh-nhan/tin-nhan?bacSi=12',
    );
  });

  it.each(['unauthenticated', 'checking', 'error'] as const)(
    'WCH-13 DMA-02 khách (phiên %s): CÙNG liên kết (khu Bệnh nhân đưa đi đăng nhập rồi quay lại)',
    (status) => {
      setAuthState({ status, user: null });
      renderAction();
      expect(screen.getByRole('link', { name: 'Nhắn tin' })).toHaveAttribute(
        'href',
        '/benh-nhan/tin-nhan?bacSi=12',
      );
    },
  );

  it.each(['BacSi', 'LeTan', 'QuanTriVien'] as const)(
    'WCH-13 DMA-03 (sai vai trò) %s: nút vô hiệu, chú thích "Chỉ Bệnh nhân nhắn tin" gắn bằng aria-describedby; không có liên kết',
    (vaiTro) => {
      signedInAs(vaiTro);
      renderAction();
      const button = screen.getByRole('button', { name: 'Nhắn tin' });
      expect(button).toBeDisabled();
      expect(button).toHaveAccessibleDescription('Chỉ Bệnh nhân nhắn tin');
      expect(screen.queryByRole('link')).toBeNull();
    },
  );
});
