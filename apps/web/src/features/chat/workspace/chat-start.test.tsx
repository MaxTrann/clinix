import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  resetSelectedBranchForTest,
  setSelectedBranch,
} from '../../../shared/branch-selection/selected-branch-store';
import type { ChatRole } from '../api/chat-types';
import {
  cleanUpFakeChatApi,
  installFakeChatApi,
} from '../testing/fake-chat-api';
import { ChatWorkspace } from './chat-workspace';

// chat F4 — Bệnh nhân bắt đầu trò chuyện (PLAN chat 5.6, 5.13; 2.4.20 b1 đến b3; 2.4.21 b1 đến b4; Q4, Q24, MH1): WCH-12. Khung trước tin đầu theo `?bacSi=` và
// `?chiNhanh=`, bộ chọn chi nhánh "Nhắn lễ tân", nút "Nhắn bác sĩ". API giả theo hợp đồng B3, đồng hồ giả. Mã ca CST-nn là [đề xuất].
const PATH = '/benh-nhan/tin-nhan';
const DOCTOR_SEARCH = '/bac-si';

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
  localStorage.clear();
  resetSelectedBranchForTest();
  api = installFakeChatApi();
  api.startState.branchOptions = [
    { chiNhanhId: '1', ten: 'Quận 1', diaChi: '12 Lê Lợi' },
    { chiNhanhId: '2', ten: 'Thủ Đức', diaChi: '5 Võ Văn Ngân' },
    { chiNhanhId: '3', ten: 'Bình Thạnh', diaChi: '9 Điện Biên Phủ' },
  ];
});

afterEach(() => {
  vi.useRealTimers();
  cleanUpFakeChatApi();
  resetSelectedBranchForTest();
  localStorage.clear();
  Reflect.deleteProperty(document, 'visibilityState');
  Reflect.deleteProperty(navigator, 'onLine');
});

async function flush(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function renderChat(path = PATH, role: ChatRole = 'BenhNhan') {
  const router = createMemoryRouter(
    [
      {
        path: '/benh-nhan/tin-nhan',
        element: <ChatWorkspace role={role} doctorSearchPath={DOCTOR_SEARCH} />,
      },
      { path: '/bac-si', element: <p>Trang tra cứu bác sĩ</p> },
    ],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
  await flush();
  return router;
}

const composer = () => screen.getByLabelText('Nội dung tin nhắn');
function send(text: string) {
  fireEvent.change(composer(), { target: { value: text } });
  fireEvent.keyDown(composer(), { key: 'Enter' });
}
const startSends = (bacSiId = '7') =>
  api.callsTo('POST', `/chat/doctors/${bacSiId}/messages`);
const createdConversations = () =>
  api.requests.filter(
    (r) => r.method === 'POST' && /^\/chat\/(doctors|branches)\//.test(r.path),
  );

describe('chat F4 — nhắn bác sĩ lần đầu (WCH-12)', () => {
  it('WCH-12 CST-01 `?bacSi=` ⇒ đầu khung (tên, chip quan hệ, banner), "Chưa có tin nhắn nào."; mở trang KHÔNG tạo hội thoại', async () => {
    api.seedDoctorStart('7', {
      doiTac: { vaiTro: 'BacSi', tenHienThi: 'ThS.BS. Lê Minh' },
      quanHe: 'ChuaTungKham',
    });
    await renderChat(`${PATH}?bacSi=7`);
    expect(api.callsTo('GET', '/chat/doctors/7')).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'ThS.BS. Lê Minh',
    );
    expect(screen.getByRole('heading', { level: 2 })).toHaveFocus();
    expect(screen.getByText('Chưa từng khám')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Chỉ tư vấn sơ bộ, không thay khám trực tiếp, không kê đơn.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Chưa có tin nhắn nào.')).toBeInTheDocument();
    expect(createdConversations()).toHaveLength(0);
  });

  it('WCH-12 CST-02 gửi tin đầu ⇒ POST tới bác sĩ (`noiDung`, `maGui`), rồi THAY đường dẫn bằng `?hoiThoai=` và khung tin thường hiện tin vừa gửi', async () => {
    api.seedDoctorStart('7');
    const router = await renderChat(`${PATH}?bacSi=7`);
    const historyBefore = router.state.historyAction;
    send('Chào bác sĩ, tôi muốn hỏi');
    await flush();
    await flush();
    expect(startSends()).toHaveLength(1);
    expect(startSends()[0]!.body).toMatchObject({
      noiDung: 'Chào bác sĩ, tôi muốn hỏi',
    });
    expect(router.state.location.search).toBe('?hoiThoai=901');
    expect(router.state.historyAction).toBe('REPLACE');
    expect(historyBefore).not.toBe('REPLACE');
    expect(
      within(screen.getByRole('list', { name: 'Tin nhắn' })).getByText(
        'Chào bác sĩ, tôi muốn hỏi',
      ),
    ).toBeInTheDocument();
    // Danh sách được làm tươi để hội thoại mới hiện ở cột trái
    expect(
      within(
        screen.getByRole('list', { name: 'Danh sách hội thoại' }),
      ).getAllByRole('button'),
    ).toHaveLength(1);
  });

  it('WCH-12 CST-03 đã có hội thoại với bác sĩ ⇒ mở thẳng hội thoại đó (không dựng khung trống, không tạo mới)', async () => {
    api.seedDoctorStart('7');
    api.seed('55');
    api.pairStart('doctor:7', '55');
    const router = await renderChat(`${PATH}?bacSi=7`);
    await flush();
    expect(router.state.location.search).toBe('?hoiThoai=55');
    expect(api.callsTo('GET', '/chat/conversations/55')).toHaveLength(1);
    expect(createdConversations()).toHaveLength(0);
  });

  it('WCH-12 CST-04 tin đầu lỗi mạng ⇒ giữ nội dung, "Gửi lại" CÙNG `maGui`; bấm đúp chỉ một yêu cầu; ô soạn khoá trong lúc chờ', async () => {
    api.seedDoctorStart('7');
    await renderChat(`${PATH}?bacSi=7`);
    api.replyNext('POST /chat/doctors/7/messages', { network: true });
    send('Tin đầu');
    await flush();
    expect(screen.getByText('Tin đầu')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Chưa gửi được do mạng',
    );
    expect(composer()).toBeDisabled();
    api.replyNext('POST /chat/doctors/7/messages', { hold: true });
    const resend = screen.getByRole('button', { name: 'Gửi lại' });
    fireEvent.click(resend);
    fireEvent.click(resend);
    await flush();
    expect(startSends()).toHaveLength(2);
    const [first, second] = startSends().map(
      (call) => (call.body as { maGui: string }).maGui,
    );
    expect(second).toBe(first);
  });

  it('WCH-12 CST-05 bác sĩ ngưng hoạt động (`coTheGui` sai) ⇒ xem được, ô soạn khoá kèm lý do', async () => {
    api.seedDoctorStart('8', {
      coTheGui: false,
      lyDoKhongGui: 'CHAT_NGUOI_NHAN_KHONG_HOAT_DONG',
    });
    await renderChat(`${PATH}?bacSi=8`);
    expect(composer()).toBeDisabled();
    expect(composer()).toHaveAccessibleDescription(
      'Tài khoản người nhận đang ngưng hoạt động nên chưa gửi được. Bạn có thể nhắn lễ tân.',
    );
  });

  it('WCH-12 CST-06 (âm) bác sĩ không tồn tại ⇒ "Không tìm thấy bác sĩ hoặc chi nhánh này.", không có ô soạn', async () => {
    await renderChat(`${PATH}?bacSi=404`);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Không tìm thấy bác sĩ hoặc chi nhánh này.',
    );
    expect(screen.queryByLabelText('Nội dung tin nhắn')).toBeNull();
  });
});

describe('chat F4 — nhắn lễ tân và nút "Nhắn bác sĩ" (WCH-12)', () => {
  const dialog = () =>
    screen.getByRole('dialog', { name: 'Nhắn lễ tân chi nhánh' });
  const radio = (name: RegExp) => within(dialog()).getByRole('radio', { name });

  it('WCH-12 CST-07 chi nhánh theo API được chọn sẵn kèm câu gợi ý; đổi được; xác nhận ⇒ `?chiNhanh=` và đầu khung "Lễ tân · …" (không banner)', async () => {
    api.startState.defaultBranch = { chiNhanhId: '2', nguon: 'LichHenSapToi' };
    api.seedBranchStart('3', 'Bình Thạnh');
    const router = await renderChat();
    fireEvent.click(screen.getByRole('button', { name: 'Nhắn lễ tân' }));
    await flush();
    expect(
      api.callsTo('GET', '/public/branches')[0]!.query.get('pageSize'),
    ).toBe('100');
    expect(radio(/Thủ Đức/)).toBeChecked();
    expect(
      within(dialog()).getByText('Đã chọn sẵn chi nhánh của lịch hẹn sắp tới.'),
    ).toBeInTheDocument();
    fireEvent.click(radio(/Bình Thạnh/));
    fireEvent.click(
      within(dialog()).getByRole('button', { name: 'Nhắn lễ tân' }),
    );
    await flush();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(router.state.location.search).toBe('?chiNhanh=3');
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'Lễ tân · Bình Thạnh',
    );
    expect(screen.queryByText(/Chỉ tư vấn sơ bộ/)).toBeNull();
    expect(createdConversations()).toHaveLength(0);
  });

  it('WCH-12 CST-08 API không gợi ý ⇒ chi nhánh đang chọn ở trình duyệt; gợi ý lỗi vẫn chọn tay được', async () => {
    setSelectedBranch({ chiNhanhId: '1', nguon: 'NguoiDung' });
    api.replyNext('GET /chat/default-branch', { network: true });
    await renderChat();
    fireEvent.click(screen.getByRole('button', { name: 'Nhắn lễ tân' }));
    await flush();
    expect(radio(/Quận 1/)).toBeChecked();
    expect(
      within(dialog()).getByText('Đã chọn sẵn chi nhánh bạn đang xem.'),
    ).toBeInTheDocument();
  });

  it('WCH-12 CST-09 "Toàn quốc" ⇒ không chọn sẵn, nút xác nhận khoá tới khi chọn; Esc đóng hộp và trả tiêu điểm về nút', async () => {
    setSelectedBranch({ chiNhanhId: null, nguon: 'NguoiDung' });
    await renderChat();
    const opener = screen.getByRole('button', { name: 'Nhắn lễ tân' });
    fireEvent.click(opener);
    await flush();
    expect(
      within(dialog())
        .getAllByRole('radio')
        .filter((r) => (r as HTMLInputElement).checked),
    ).toHaveLength(0);
    expect(
      within(dialog()).getByRole('button', { name: 'Nhắn lễ tân' }),
    ).toBeDisabled();
    expect(
      within(dialog()).getByText('Chọn chi nhánh bạn muốn nhắn.'),
    ).toBeInTheDocument();
    fireEvent.click(radio(/Quận 1/));
    expect(
      within(dialog()).getByRole('button', { name: 'Nhắn lễ tân' }),
    ).toBeEnabled();
    fireEvent.keyDown(document, { key: 'Escape' });
    await flush();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(opener).toHaveFocus();
  });

  it('WCH-12 CST-10 gửi tin đầu tới lễ tân ⇒ POST tới chi nhánh rồi mở hội thoại', async () => {
    api.seedBranchStart('3', 'Bình Thạnh');
    const router = await renderChat(`${PATH}?chiNhanh=3`);
    send('Cho tôi hỏi giờ làm việc');
    await flush();
    await flush();
    expect(api.callsTo('POST', '/chat/branches/3/messages')).toHaveLength(1);
    expect(router.state.location.search).toBe('?hoiThoai=901');
  });

  it('WCH-12 CST-11 "Nhắn bác sĩ" dẫn tới trang tra cứu bác sĩ (Q24)', async () => {
    await renderChat();
    expect(screen.getByRole('link', { name: 'Nhắn bác sĩ' })).toHaveAttribute(
      'href',
      DOCTOR_SEARCH,
    );
  });

  it.each(['BacSi', 'LeTan'] as const)(
    'WCH-12 CST-12 (sai vai trò) %s: không có "Nhắn lễ tân", "Nhắn bác sĩ"; `?bacSi=` không mở khung bắt đầu, không gọi API của Bệnh nhân',
    async (role) => {
      api.seedDoctorStart('7');
      await renderChat(`${PATH}?bacSi=7`, role);
      expect(screen.queryByRole('button', { name: 'Nhắn lễ tân' })).toBeNull();
      expect(screen.queryByRole('link', { name: 'Nhắn bác sĩ' })).toBeNull();
      expect(api.callsTo('GET', '/chat/doctors/7')).toHaveLength(0);
      expect(screen.queryByLabelText('Nội dung tin nhắn')).toBeNull();
    },
  );

  it('WCH-12 CST-13 hội thoại ưu tiên hơn tham số bắt đầu: `?hoiThoai=` cùng `?bacSi=` ⇒ mở hội thoại', async () => {
    api.seed('1');
    api.seedDoctorStart('7');
    await renderChat(`${PATH}?hoiThoai=1&bacSi=7`);
    expect(api.callsTo('GET', '/chat/doctors/7')).toHaveLength(0);
    expect(api.callsTo('GET', '/chat/conversations/1')).toHaveLength(1);
  });
});
