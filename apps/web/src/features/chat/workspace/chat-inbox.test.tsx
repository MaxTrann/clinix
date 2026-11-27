import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatRole } from '../api/chat-types';
import {
  apiError,
  cleanUpFakeChatApi,
  installFakeChatApi,
  message,
} from '../testing/fake-chat-api';
import { ChatWorkspace } from './chat-workspace';

// chat F5 — hộp thư Tin nhắn của Bác sĩ và Lễ tân (2.4.29; PLAN chat 5.6, 5.9, 5.13; Q15, Q23, Q25): WCH-18 (Bác sĩ: danh sách, tìm theo tên, lọc chưa đọc, quan hệ,
// banner, không có nút tạo mới) và WCH-19 (Lễ tân: nhãn trả lời, tên và SĐT Bệnh nhân, tìm theo tên, SĐT, email, 404, 403 khi hết phạm vi chi nhánh).
// Khung là `ChatWorkspace` dùng chung (F3) với cấu hình theo vai trò; API giả theo hợp đồng B2, B3. Mã ca CIB-nn là [đề xuất].
const PATH = '/benh-nhan/tin-nhan';

let api: ReturnType<typeof installFakeChatApi>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-27T03:00:00.000Z'));
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => 'visible',
  });
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    get: () => true,
  });
  api = installFakeChatApi();
});

afterEach(() => {
  vi.useRealTimers();
  cleanUpFakeChatApi();
  Reflect.deleteProperty(document, 'visibilityState');
  Reflect.deleteProperty(navigator, 'onLine');
});

async function flush(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function renderInbox(role: ChatRole, path = PATH) {
  const router = createMemoryRouter(
    // Đường dẫn trang không quan trọng ở đây: khung chỉ đọc tham số `?hoiThoai=`
    [{ path: '/benh-nhan/tin-nhan', element: <ChatWorkspace role={role} /> }],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
  await flush();
  return router;
}

const rows = () =>
  within(
    screen.getByRole('list', { name: 'Danh sách hội thoại' }),
  ).getAllByRole('button');
const tabs = () =>
  within(screen.getByRole('group', { name: 'Lọc hội thoại' }))
    .getAllByRole('button')
    .map((tab) => tab.textContent);
const listCalls = () => api.callsTo('GET', '/chat/conversations');

/** Hội thoại bác sĩ nhìn từ phía Bác sĩ: đối tác là Bệnh nhân, chỉ họ tên. */
function seedDoctorInbox() {
  api.seed('1', {
    row: {
      doiTac: { vaiTro: 'BenhNhan', tenHienThi: 'Nguyễn An' },
      quanHe: 'DaTungKham',
      soTinChuaDoc: 2,
      tinCuoi: {
        id: '10',
        trichDan: 'Bác sĩ ơi',
        nguoiGuiHienThi: 'Nguyễn An',
        thoiDiemGui: '2026-11-27T01:00:00.000Z',
      },
    },
    head: {
      doiTac: { vaiTro: 'BenhNhan', tenHienThi: 'Nguyễn An' },
      quanHe: 'DaTungKham',
    },
    messages: [message({ id: '10', noiDung: 'Bác sĩ ơi' })],
  });
  api.seed('2', {
    row: {
      doiTac: { vaiTro: 'BenhNhan', tenHienThi: 'Trần Bảo' },
      quanHe: 'ChuaTungKham',
    },
  });
}

/** Hộp thư chung của chi nhánh nhìn từ phía Lễ tân: đối tác là Bệnh nhân, họ tên và SĐT (Q23). */
function seedReceptionInbox() {
  const reception = { loai: 'BenhNhan_LeTan', quanHe: null };
  api.seed('1', {
    row: {
      ...reception,
      doiTac: {
        vaiTro: 'BenhNhan',
        tenHienThi: 'Nguyễn An',
        soDienThoai: '0901234567',
      },
      trangThaiTraLoi: 'ChoTraLoi',
    },
    head: {
      ...reception,
      doiTac: {
        vaiTro: 'BenhNhan',
        tenHienThi: 'Nguyễn An',
        soDienThoai: '0901234567',
      },
      banner: false,
    },
  });
  api.seed('2', {
    row: {
      ...reception,
      doiTac: {
        vaiTro: 'BenhNhan',
        tenHienThi: 'Lê Chi',
        soDienThoai: '0907654321',
      },
      trangThaiTraLoi: 'DaTraLoi',
      traLoiBoi: 'Phạm Dung',
    },
  });
  api.seed('3', {
    row: {
      ...reception,
      doiTac: {
        vaiTro: 'BenhNhan',
        tenHienThi: 'Võ Em',
        soDienThoai: '0911111111',
      },
      trangThaiTraLoi: 'DaTraLoi',
      traLoiBoi: 'Bạn',
    },
  });
}

describe('chat F5 — hộp thư Bác sĩ (WCH-18)', () => {
  it('WCH-18 CIB-01 danh sách: họ tên Bệnh nhân (không SĐT), chip quan hệ, số chưa đọc; tab "Tất cả / Chưa đọc"; không có nút tạo hội thoại', async () => {
    seedDoctorInbox();
    await renderInbox('BacSi');
    const [first, second] = rows();
    expect(first).toHaveAccessibleName('Nguyễn An, 2 tin chưa đọc');
    expect(first).toHaveTextContent('Đã từng khám');
    expect(first).not.toHaveTextContent(/0\d{9}/);
    // Nhãn loại "Bác sĩ"/"Lễ tân" chỉ dành cho Bệnh nhân (tìm đúng chữ của nhãn; xem trước "Bác sĩ ơi" không tính)
    expect(within(first).queryByText('Bác sĩ')).toBeNull();
    expect(within(first).queryByText('Lễ tân')).toBeNull();
    expect(second).toHaveTextContent('Chưa từng khám');
    expect(tabs()).toEqual(['Tất cả', 'Chưa đọc']);
    expect(screen.queryByRole('button', { name: 'Nhắn lễ tân' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Nhắn bác sĩ' })).toBeNull();
  });

  it('WCH-18 CIB-02 tìm theo họ tên (Q25) và lọc chưa đọc đều gửi lên máy chủ', async () => {
    seedDoctorInbox();
    await renderInbox('BacSi');
    const search = screen.getByLabelText('Tìm theo họ tên bệnh nhân');
    fireEvent.change(search, { target: { value: 'Bảo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tìm' }));
    await flush();
    expect(listCalls().at(-1)?.query.get('q')).toBe('Bảo');
    expect(rows()).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Chưa đọc' }));
    await flush();
    expect(listCalls().at(-1)?.query.get('loc')).toBe('chua-doc');
    expect(listCalls().at(-1)?.query.get('q')).toBe('Bảo');
  });

  it('WCH-18 CIB-03 mở hội thoại: banner tư vấn sơ bộ, chip quan hệ ở đầu khung; trả lời gửi vào đúng hội thoại', async () => {
    seedDoctorInbox();
    await renderInbox('BacSi', `${PATH}?hoiThoai=1`);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'Nguyễn An',
    );
    expect(
      screen.getByText(
        'Chỉ tư vấn sơ bộ, không thay khám trực tiếp, không kê đơn.',
      ),
    ).toBeInTheDocument();
    const box = screen.getByLabelText('Nội dung tin nhắn');
    fireEvent.change(box, { target: { value: 'Chào anh An' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    await flush();
    expect(api.callsTo('POST', '/chat/conversations/1/messages')).toHaveLength(
      1,
    );
  });

  it('WCH-18 CIB-04 (âm) hội thoại không phải của mình (404) ⇒ "Bạn không có quyền xem hội thoại này.", không ô soạn, không "Thử lại"', async () => {
    seedDoctorInbox();
    await renderInbox('BacSi', `${PATH}?hoiThoai=99`);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Bạn không có quyền xem hội thoại này.',
    );
    expect(screen.queryByLabelText('Nội dung tin nhắn')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
  });
});

describe('chat F5 — hộp thư Lễ tân (WCH-19)', () => {
  it('WCH-19 CIB-05 dòng có họ tên và SĐT Bệnh nhân (Q23); nhãn "Chờ trả lời", "Đã trả lời · {tên}", "Đã trả lời · Bạn" (Q15); không chip quan hệ', async () => {
    seedReceptionInbox();
    await renderInbox('LeTan');
    const [wait, other, self] = rows();
    expect(wait).toHaveTextContent('Nguyễn An · 0901234567');
    expect(wait).toHaveTextContent('Chờ trả lời');
    expect(other).toHaveTextContent('Đã trả lời · Phạm Dung');
    expect(self).toHaveTextContent('Đã trả lời · Bạn');
    expect(wait).not.toHaveTextContent(/từng khám/);
    expect(tabs()).toEqual(['Tất cả', 'Chưa đọc']);
    expect(screen.queryByRole('button', { name: 'Nhắn lễ tân' })).toBeNull();
  });

  it('WCH-19 CIB-06 tìm theo họ tên, SĐT hay email gửi lên máy chủ; từ khoá sai ⇒ câu theo `TU_KHOA_KHONG_HOP_LE`', async () => {
    seedReceptionInbox();
    await renderInbox('LeTan');
    const search = screen.getByLabelText(
      'Tìm theo họ tên, số điện thoại hoặc email',
    );
    for (const keyword of ['0907654321', 'chi@example.com']) {
      fireEvent.change(search, { target: { value: keyword } });
      fireEvent.click(screen.getByRole('button', { name: 'Tìm' }));
      await flush();
      expect(listCalls().at(-1)?.query.get('q')).toBe(keyword);
    }
    fireEvent.change(search, { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tìm' }));
    await flush();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Từ khoá cần từ 2 đến 100 ký tự.',
    );
  });

  it('WCH-19 CIB-07 mở hội thoại: đầu khung có tên và SĐT, không banner (hộp thư chung)', async () => {
    seedReceptionInbox();
    await renderInbox('LeTan', `${PATH}?hoiThoai=1`);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'Nguyễn An · 0901234567',
    );
    expect(screen.queryByText(/Chỉ tư vấn sơ bộ/)).toBeNull();
  });

  it('WCH-19 CIB-08 (âm, 2.4.29 A1) Lễ tân không còn phạm vi chi nhánh (403) ⇒ "Bạn không có quyền thực hiện thao tác này." ở danh sách và khung tin, không "Thử lại"', async () => {
    seedReceptionInbox();
    api.replyNext('GET /chat/conversations', apiError(403, 'KHONG_DU_QUYEN'));
    api.replyNext('GET /chat/conversations/1', apiError(403, 'KHONG_DU_QUYEN'));
    await renderInbox('LeTan', `${PATH}?hoiThoai=1`);
    const alerts = screen.getAllByRole('alert');
    expect(alerts).toHaveLength(2);
    for (const alert of alerts)
      expect(alert).toHaveTextContent(
        'Bạn không có quyền thực hiện thao tác này.',
      );
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
    expect(screen.queryByLabelText('Nội dung tin nhắn')).toBeNull();
    expect(screen.queryByText('câu của máy chủ')).toBeNull();
  });

  it('WCH-19 CIB-09 (âm) hội thoại của chi nhánh khác (404) ⇒ câu không có quyền xem', async () => {
    seedReceptionInbox();
    await renderInbox('LeTan', `${PATH}?hoiThoai=77`);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Bạn không có quyền xem hội thoại này.',
    );
  });
});
