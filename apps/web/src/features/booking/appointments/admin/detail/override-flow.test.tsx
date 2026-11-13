import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ADMIN_CODE,
  cleanUpAdminAppointments,
  openAdminDetail,
} from '../../../../../router/admin-appointments-harness';
import { GENERIC_ERROR_MESSAGE } from '../../../../../shared/api/error-message';
import { holdResponse } from '../../../testing/appointment-detail-harness';
import { apiErrorResponse } from '../../../testing/fake-appointment-list-api';
import type { OverrideTarget } from '../api/admin-appointment-types';
import { OVERRIDE_TEXT } from './detail-messages';

// booking F10: nhóm nút và hộp override của Quản trị viên (QT-03) với API giả và router thật. Mã AQO và AQE là [đề xuất] (PLAN booking mục 7.41). QT-03 = AQO-01, AQO-02, AQO-05. Mức W: trang với API
// giả; jsdom không đo bố cục và tương phản thật nên phần đó là kiểm tay `M`.
afterEach(() => {
  vi.restoreAllMocks();
  cleanUpAdminAppointments();
});

const ALL_TARGETS = ['DaTiepDon', 'DaXacNhan', 'VangMat', 'DaHuy'];
const POST_PATH = `/admin/appointments/${ADMIN_CODE}/override-status`;
const LABEL: Record<OverrideTarget, string> = OVERRIDE_TEXT.buttons;

// Mở trang chi tiết, bấm nút của `target`, chờ hộp. `detail` đặt chi tiết (mặc định cho đủ bốn đích)
async function openDialog(
  target: OverrideTarget,
  detail: Parameters<typeof openAdminDetail>[0] = {},
) {
  const view = await openAdminDetail({ chuyenDuoc: ALL_TARGETS, ...detail });
  const opener = screen.getByRole('button', { name: LABEL[target] });
  fireEvent.click(opener);
  const dialog = await screen.findByRole('dialog');
  return { ...view, opener, dialog };
}

const reasonBox = () =>
  screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Lý do' });
const typeReason = (value: string) =>
  fireEvent.change(reasonBox(), { target: { value } });
const confirmButton = () => screen.getByRole('button', { name: 'Xác nhận' });
const writes = (api: { writes: () => unknown[] }) => api.writes();

async function submit(reason: string) {
  typeReason(reason);
  fireEvent.click(confirmButton());
}

// Các nút trong thẻ `Thao tác`, theo thứ tự hiện
const actionLabels = () => {
  const group = screen.queryByRole('group', { name: 'Thao tác' });
  return group === null
    ? []
    : within(group)
        .getAllByRole('button')
        .map((button) => button.textContent);
};

describe('nhóm nút theo `chuyenDuoc[]` (QT-03)', () => {
  it.each([
    [
      'DaXacNhan',
      ['DaTiepDon', 'VangMat', 'DaHuy'],
      ['Đã tiếp đón', 'Vắng mặt', 'Hủy lịch'],
    ],
    ['VangMat', ['DaXacNhan', 'DaTiepDon'], ['Đã tiếp đón', 'Đã xác nhận']],
    [
      'DaTiepDon',
      ['DaHuy', 'VangMat', 'DaXacNhan'],
      ['Đã xác nhận', 'Vắng mặt', 'Hủy lịch'],
    ],
    ['HoanThanh', ['DaHuy'], ['Hủy lịch']],
    ['ChoThanhToan', ['DaHuy'], ['Hủy lịch']],
    ['DaHuy', [], []],
  ])(
    'AQO-01 trạng thái %s với chuyenDuoc %j ⇒ nút %j, đúng thứ tự cố định (nguồn là MẢNG, không phải trạng thái)',
    async (trangThai, chuyenDuoc, expected) => {
      await openAdminDetail({ trangThai, chuyenDuoc });
      expect(actionLabels()).toEqual(expected);
      if (expected.length === 0) {
        expect(screen.queryByRole('heading', { name: 'Thao tác' })).toBeNull();
      }
    },
  );

  it('AQO-02 mã ngoài bốn đích (`HoanThanh`, `ChoThanhToan`, `DaDoiLich`, mã lạ) KHÔNG có nút, dù nằm trong `chuyenDuoc[]`', async () => {
    await openAdminDetail({
      chuyenDuoc: ['HoanThanh', 'ChoThanhToan', 'DaDoiLich', 'MaLa', 'DaHuy'],
    });
    expect(actionLabels()).toEqual(['Hủy lịch']);
    for (const name of ['Hoàn thành', 'Chờ thanh toán', 'Đã đổi lịch']) {
      expect(screen.queryByRole('button', { name })).toBeNull();
    }
  });
});

describe('hộp override: nội dung, lý do bắt buộc (QT-03)', () => {
  it.each([
    ['DaHuy', 'DaXacNhan', ['hoàn 100% số tiền đã thu', 'không thể hoàn tác']],
    ['VangMat', 'DaXacNhan', ['cộng một lần vắng mặt']],
    ['DaTiepDon', 'VangMat', ['Bỏ qua cửa sổ tiếp đón']],
    ['DaXacNhan', 'VangMat', ['5 phút', 'chọn Đã tiếp đón']],
  ] as const)(
    'AQO-03 đích %s từ %s: hộp modal có tên, câu từ → đến, cảnh báo riêng, ô `Lý do` được focus, nút `Đóng` và `Xác nhận`',
    async (target, from, fragments) => {
      const { dialog } = await openDialog(target, { trangThai: from });
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(dialog).toHaveAccessibleName('Đổi trạng thái lịch hẹn');
      const fromLabel = from === 'DaXacNhan' ? 'Đã xác nhận' : 'Vắng mặt';
      expect(
        within(dialog).getByText(
          `Lịch hẹn ${ADMIN_CODE} sẽ chuyển từ ${fromLabel} sang ${LABEL[target] === 'Hủy lịch' ? 'Đã hủy' : LABEL[target]}.`,
        ),
      ).toBeInTheDocument();
      for (const fragment of fragments) {
        expect(dialog).toHaveTextContent(fragment);
      }
      expect(reasonBox()).toHaveFocus();
      expect(reasonBox()).toBeRequired();
      expect(
        within(dialog).getByRole('button', { name: 'Đóng' }),
      ).toBeEnabled();
      expect(confirmButton()).toBeEnabled();
    },
  );

  it('AQO-04 hộp `Đã xác nhận` nêu TECH_DEBT 120 (job tự Vắng mặt đánh lại trong tối đa 5 phút) và gợi ý `Đã tiếp đón` khi bệnh nhân đã đến; các đích khác không có câu đó', async () => {
    const restore = await openDialog('DaXacNhan', { trangThai: 'VangMat' });
    expect(restore.dialog).toHaveTextContent(
      'hệ thống sẽ tự đánh Vắng mặt lại trong tối đa 5 phút',
    );
    expect(restore.dialog).toHaveTextContent('hãy chọn Đã tiếp đón');
    restore.unmount();
    cleanUpAdminAppointments();
    const cancel = await openDialog('DaHuy');
    expect(cancel.dialog).not.toHaveTextContent('5 phút');
  });

  it.each([
    ['rỗng', ''],
    ['chỉ khoảng trắng', '   '],
    ['xuống dòng, tab, khoảng không ngắt', '\n\t \u00a0'],
    ['256 ký tự', 'a'.repeat(256)],
    ['128 biểu tượng (256 đơn vị UTF-16)', '😀'.repeat(128)],
  ])(
    'AQO-05 lý do %s ⇒ CHẶN: 0 POST, lời báo dưới ô, `aria-invalid`, tiêu điểm vào ô, nút vẫn bật',
    async (_name, reason) => {
      const { api } = await openDialog('VangMat');
      typeReason(reason);
      confirmButton().focus();
      fireEvent.click(confirmButton());
      const expected =
        reason.length > 255 && reason.trim().length > 255
          ? 'Lý do tối đa 255 ký tự.'
          : 'Vui lòng nhập lý do (tối đa 255 ký tự).';
      expect(await screen.findByText(expected)).toBeInTheDocument();
      expect(reasonBox()).toHaveAttribute('aria-invalid', 'true');
      expect(reasonBox()).toHaveFocus();
      expect(confirmButton()).toBeEnabled();
      expect(writes(api)).toEqual([]);
    },
  );

  it.each([
    ['cắt khoảng trắng hai đầu', '  a  ', 'a'],
    ['đúng 255 ký tự', 'a'.repeat(255), 'a'.repeat(255)],
    [
      '127 biểu tượng cộng "a" (255 đơn vị UTF-16)',
      '😀'.repeat(127) + 'a',
      '😀'.repeat(127) + 'a',
    ],
  ])(
    'AQO-05 lý do %s ⇒ gửi đúng MỘT POST với `lyDo` đã cắt khoảng trắng',
    async (_name, typed, sent) => {
      const { api } = await openDialog('VangMat');
      await submit(typed);
      await waitFor(() => expect(writes(api)).toHaveLength(1));
      expect(api.writeBodies()).toEqual([{ trangThai: 'VangMat', lyDo: sent }]);
    },
  );

  it('AQO-12 `Đóng` KHÔNG gọi API, trả tiêu điểm về ĐÚNG nút đã mở; mở lại thì ô lý do trống', async () => {
    const { api, opener } = await openDialog('DaHuy');
    typeReason('Gõ dở rồi đóng');
    fireEvent.click(screen.getByRole('button', { name: 'Đóng' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(writes(api)).toEqual([]);
    expect(opener).toHaveFocus();
    fireEvent.click(opener);
    await screen.findByRole('dialog');
    expect(reasonBox()).toHaveValue('');
  });
});

describe('gửi: thân đúng, chống bấm đúp, không đóng khi đang gửi (QT-03)', () => {
  it.each(ALL_TARGETS)(
    'AQO-06 đích %s ⇒ MỘT POST đúng đường dẫn, có token, thân đúng HAI khoá `trangThai` và `lyDo`',
    async (target) => {
      const { api } = await openDialog(target as OverrideTarget);
      await submit('Bệnh nhân đã đến quầy');
      await waitFor(() => expect(writes(api)).toHaveLength(1));
      const [request] = api.writes();
      expect(request.path).toBe(POST_PATH);
      expect(request.method).toBe('POST');
      expect(request.hasToken).toBe(true);
      expect(request.body).toEqual({
        trangThai: target,
        lyDo: 'Bệnh nhân đã đến quầy',
      });
      expect(Object.keys(request.body as object).sort()).toEqual([
        'lyDo',
        'trangThai',
      ]);
    },
  );

  it('AQO-07 chống bấm đúp: ba lần bấm `Xác nhận` trong MỘT lượt ⇒ đúng MỘT POST', async () => {
    const held = holdResponse(
      () =>
        new Response(
          JSON.stringify({ maLichHen: ADMIN_CODE, trangThai: 'VangMat' }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
    );
    const { api } = await openDialog('VangMat');
    api.failNext('override', held.override);
    typeReason('Không đến');
    const button = confirmButton();
    act(() => {
      fireEvent.click(button);
      fireEvent.click(button);
      fireEvent.click(button);
    });
    await waitFor(() => expect(writes(api)).toHaveLength(1));
    held.release();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(writes(api)).toHaveLength(1);
  });

  it('AQO-08 không đóng khi đang gửi: nút đổi chữ và vô hiệu, ô lý do chỉ đọc, `Đóng`, Esc, lớp phủ và `Quay lại danh sách` không làm gì; xong thì đóng được', async () => {
    const held = holdResponse(
      () =>
        new Response(
          JSON.stringify({ maLichHen: ADMIN_CODE, trangThai: 'VangMat' }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
    );
    const { api, router, dialog } = await openDialog('VangMat');
    api.failNext('override', held.override);
    await submit('Không đến');
    await waitFor(() => expect(writes(api)).toHaveLength(1));
    expect(
      within(dialog).getByRole('button', { name: 'Đang cập nhật…' }),
    ).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Đóng' })).toBeDisabled();
    expect(reasonBox()).toHaveAttribute('readonly');
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(dialog.parentElement as HTMLElement);
    fireEvent.click(screen.getByRole('link', { name: 'Quay lại danh sách' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(
      `/admin/lich-hen/${ADMIN_CODE}`,
    );
    held.release();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

describe('thành công: thông báo, tải lại, số hoàn THỰC TẾ', () => {
  it.each([
    ['DaTiepDon', 'Đã tiếp đón'],
    ['DaXacNhan', 'Đã xác nhận'],
    ['VangMat', 'Vắng mặt'],
  ] as const)(
    'AQO-09 đích %s ⇒ hộp đóng, thông báo "Đã cập nhật trạng thái lịch hẹn sang %s." nhận tiêu điểm, chi tiết tải lại (chip, nút, panel có mục mới theo giờ Việt Nam)',
    async (target, label) => {
      const from = target === 'DaXacNhan' ? 'VangMat' : 'DaXacNhan';
      const { api } = await openDialog(target, { trangThai: from });
      await submit('Bệnh nhân đã đến');
      const notice = await screen.findByRole('status');
      expect(notice).toHaveTextContent(
        `Đã cập nhật trạng thái lịch hẹn sang ${label}.`,
      );
      expect(screen.queryByRole('dialog')).toBeNull();
      await waitFor(() => expect(notice).toHaveFocus());
      await waitFor(() =>
        expect(api.callsTo(`/admin/appointments/${ADMIN_CODE}`)).toHaveLength(
          2,
        ),
      );
      // Panel: mục `OverrideLichHen` mới, 05:00Z = 12:00 giờ Việt Nam, kèm lý do
      const item = await screen.findByText(/Đổi trạng thái:/);
      expect(item.closest('li')).toHaveTextContent('18/10/2026 · 12:00');
      expect(item.closest('li')).toHaveTextContent('Lý do: Bệnh nhân đã đến');
      // Nút theo `chuyenDuoc[]` mới (rỗng) biến mất
      await waitFor(() => expect(actionLabels()).toEqual([]));
    },
  );

  it('AQO-09 đích `Hủy`: thông báo kèm số hoàn THỰC TẾ từ phản hồi (không tính ở client); `hoanCoc` null ⇒ "Không có khoản hoàn."', async () => {
    const first = await openDialog('DaHuy');
    await submit('Phòng khám nghỉ');
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Số tiền hoàn: 100.000đ (100%)',
    );
    first.unmount();
    cleanUpAdminAppointments();

    const second = await openDialog('DaHuy');
    second.api.cancelRefund = null;
    await submit('Phòng khám nghỉ');
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Không có khoản hoàn.',
    );
  });

  it('AQO-13 số hoàn lớn hơn 2^53 hiện đủ chữ số (định dạng từ CHUỖI, không qua `Number`)', async () => {
    const { api } = await openDialog('DaHuy');
    api.cancelRefund = { tyLe: 100, soTien: '9007199254740993.00' };
    await submit('Phòng khám nghỉ');
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Số tiền hoàn: 9.007.199.254.740.993đ (100%)',
    );
  });
});

describe('modal: Esc một lớp, bẫy Tab, nền inert, khoá cuộn, tiêu điểm', () => {
  it('AQO-10 mở: nền `inert`, cuộn bị khoá; Esc đóng đúng hộp (trang còn nguyên), gỡ `inert` và khoá cuộn, trả tiêu điểm về đúng nút đã mở; bấm lớp phủ cũng đóng', async () => {
    const { opener, dialog } = await openDialog('DaHuy');
    expect(document.body.style.overflow).toBe('hidden');
    const inertBefore = [...document.body.children].filter((el) =>
      el.hasAttribute('inert'),
    );
    expect(inertBefore.length).toBeGreaterThan(0);
    expect(dialog.closest('[inert]')).toBeNull();

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(
      screen.getByRole('heading', { level: 1, name: 'Chi tiết lịch hẹn' }),
    ).toBeVisible();
    expect(document.body.style.overflow).toBe('');
    expect(document.querySelectorAll('[inert]')).toHaveLength(0);
    expect(opener).toHaveFocus();

    fireEvent.click(opener);
    const again = await screen.findByRole('dialog');
    fireEvent.click(again.parentElement as HTMLElement);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(opener).toHaveFocus();
  });

  it('AQO-10 Tab và Shift+Tab bị bẫy trong hộp: từ nút cuối về ô lý do, từ ô lý do về nút cuối; tiêu điểm ở ngoài thì kéo vào', async () => {
    const { dialog } = await openDialog('VangMat');
    const last = within(dialog).getByRole('button', { name: 'Xác nhận' });
    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(reasonBox()).toHaveFocus();
    fireEvent.keyDown(reasonBox(), { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();
    (document.activeElement as HTMLElement).blur();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('AQO-14 mở, đóng, mở, đóng nhiều lần: mỗi Esc đóng đúng MỘT hộp; khoá cuộn và `inert` luôn trả về như cũ', async () => {
    const { opener } = await openDialog('VangMat');
    for (let round = 0; round < 3; round += 1) {
      fireEvent.keyDown(document, { key: 'Escape' });
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(document.body.style.overflow).toBe('');
      expect(document.querySelectorAll('[inert]')).toHaveLength(0);
      fireEvent.click(opener);
      await screen.findByRole('dialog');
      expect(document.body.style.overflow).toBe('hidden');
    }
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });
});

describe('dữ liệu cá nhân của hộp', () => {
  it('AQO-11 gõ lý do (có SĐT), gửi lỗi rồi gửi lại thành công: `localStorage.length`, `sessionStorage.length` bằng 0, không cookie, không `console`, URL không đổi và không chứa lý do', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map(
      (method) => vi.spyOn(console, method).mockImplementation(() => {}),
    );
    const { api, router } = await openDialog('VangMat');
    const before = router.state.location;
    api.failNext('override', () => apiErrorResponse(503, 'HE_THONG_DANG_BAN'));
    await submit('Liên hệ 0987654321 xác nhận');
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    fireEvent.click(confirmButton());
    await screen.findByRole('status');
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    expect(document.cookie).toBe('');
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    expect(router.state.location.pathname).toBe(before.pathname);
    expect(router.state.location.search).toBe(before.search);
    expect(
      `${router.state.location.pathname}${router.state.location.search}`,
    ).not.toContain('0987654321');
    // URL THẬT của cửa sổ (không chỉ URL của router bộ nhớ): lịch sử trình duyệt không được nhận lý do
    expect(window.location.href).not.toContain('0987654321');
    expect(window.location.href).not.toContain('lyDo');
  });
});

describe('lỗi khi gửi (bảng câu lỗi theo `maLoi`; bản đơn vị ở override-failure.test.ts)', () => {
  const alertText = async () =>
    (await screen.findByRole('alert')).textContent ?? '';

  it('AQE-01 400 `LY_DO_BAT_BUOC` từ máy chủ ⇒ câu dưới ô lý do, hộp ở lại, bấm lại được và lần sau thành công', async () => {
    const { api } = await openDialog('VangMat');
    api.failNext('override', () =>
      apiErrorResponse(400, 'DU_LIEU_KHONG_HOP_LE', [
        { truong: 'lyDo', ma: 'LY_DO_BAT_BUOC' },
      ]),
    );
    await submit('Lý do hợp lệ ở client');
    expect(
      await screen.findByText('Vui lòng nhập lý do (tối đa 255 ký tự).'),
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(confirmButton()).toBeEnabled();
    fireEvent.click(confirmButton());
    await screen.findByRole('status');
    expect(writes(api)).toHaveLength(2);
  });

  it('AQE-02 404 `KHONG_TIM_THAY` ⇒ MỘT câu, hộp chỉ còn `Đóng`, chi tiết tải lại', async () => {
    const { api } = await openDialog('VangMat');
    api.failNext('override', () => apiErrorResponse(404, 'KHONG_TIM_THAY'));
    await submit('Lý do');
    expect(await alertText()).toBe('Không tìm thấy lịch hẹn này.');
    expect(screen.queryByRole('button', { name: 'Xác nhận' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Đóng' })).toBeEnabled();
    await waitFor(() =>
      expect(
        api.callsTo(`/admin/appointments/${ADMIN_CODE}`).length,
      ).toBeGreaterThanOrEqual(2),
    );
  });

  it('AQE-03 409 `CHUYEN_TRANG_THAI_KHONG_HOP_LE` kèm hai trạng thái ⇒ câu có nhãn, dừng, chi tiết tải lại', async () => {
    const { api } = await openDialog('VangMat');
    api.failNext('override', () =>
      apiErrorResponse(409, 'CHUYEN_TRANG_THAI_KHONG_HOP_LE', undefined, {
        tuTrangThai: 'DaHuy',
        denTrangThai: 'VangMat',
      }),
    );
    await submit('Lý do');
    expect(await alertText()).toBe(
      'Không thể chuyển lịch hẹn từ Đã hủy sang Vắng mặt.',
    );
    expect(screen.queryByRole('button', { name: 'Xác nhận' })).toBeNull();
    await waitFor(() =>
      expect(
        api.callsTo(`/admin/appointments/${ADMIN_CODE}`).length,
      ).toBeGreaterThanOrEqual(2),
    );
  });

  it('AQE-04 409 `HE_THONG_CHUA_CAU_HINH` ở đích `Vắng mặt` (dù `chuyenDuoc[]` có đích đó) ⇒ câu chưa cấu hình, dừng', async () => {
    const { api } = await openDialog('VangMat');
    api.failNext('override', () =>
      apiErrorResponse(409, 'HE_THONG_CHUA_CAU_HINH'),
    );
    await submit('Lý do');
    expect(await alertText()).toBe(
      'Hệ thống chưa được cấu hình nên chưa thể thực hiện thao tác này.',
    );
    expect(screen.queryByRole('button', { name: 'Xác nhận' })).toBeNull();
  });

  it('AQE-05 503 `HE_THONG_DANG_BAN` ⇒ câu bận, bấm lại được, KHÔNG tải lại chi tiết (giao dịch hoàn tác trọn)', async () => {
    const { api } = await openDialog('VangMat');
    api.failNext('override', () => apiErrorResponse(503, 'HE_THONG_DANG_BAN'));
    await submit('Lý do');
    expect(await alertText()).toBe(
      'Hệ thống đang xử lý nhiều yêu cầu cùng lúc. Vui lòng thử lại sau ít giây.',
    );
    expect(confirmButton()).toBeEnabled();
    expect(api.callsTo(`/admin/appointments/${ADMIN_CODE}`)).toHaveLength(1);
    fireEvent.click(confirmButton());
    await screen.findByRole('status');
    expect(writes(api)).toHaveLength(2);
  });

  it.each([
    ['mạng đứt', () => Promise.reject(new TypeError('Failed to fetch'))],
    [
      '502 là HTML',
      () => new Response('<html>Bad Gateway</html>', { status: 502 }),
    ],
    [
      '200 sai đích (hợp đồng gãy)',
      () =>
        new Response(
          JSON.stringify({ maLichHen: ADMIN_CODE, trangThai: 'DaHuy' }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
    ],
  ])(
    'AQE-06 %s ⇒ "chưa rõ" theo đích kèm `Tải lại chi tiết`, đúng MỘT POST, KHÔNG tự gửi lại; `Tải lại chi tiết` đóng hộp và tải lại, không POST thêm',
    async (_name, response) => {
      const { api } = await openDialog('VangMat');
      api.failNext('override', response);
      await submit('Lý do');
      expect(await alertText()).toContain(OVERRIDE_TEXT.unsure.VangMat);
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(writes(api)).toHaveLength(1);
      fireEvent.click(screen.getByRole('button', { name: 'Tải lại chi tiết' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      await waitFor(() =>
        expect(
          api.callsTo(`/admin/appointments/${ADMIN_CODE}`).length,
        ).toBeGreaterThanOrEqual(2),
      );
      expect(writes(api)).toHaveLength(1);
    },
  );

  it('AQE-07 403 `KHONG_DU_QUYEN` ⇒ câu riêng, hộp chỉ còn `Đóng`, không tải lại (401 `CHUA_DANG_NHAP` ở bản đơn vị override-failure.test.ts: phiên hết hạn kéo cả app về đăng nhập)', async () => {
    const { api } = await openDialog('VangMat');
    api.failNext('override', () => apiErrorResponse(403, 'KHONG_DU_QUYEN'));
    await submit('Lý do');
    expect(await alertText()).toBe(
      'Bạn không có quyền thực hiện thao tác này.',
    );
    expect(screen.queryByRole('button', { name: 'Xác nhận' })).toBeNull();
    expect(api.callsTo(`/admin/appointments/${ADMIN_CODE}`)).toHaveLength(1);
  });

  it.each([
    [400, 409],
    [404, 500],
    [409, 502],
  ])(
    'AQE-08 chọn câu theo `maLoi`, KHÔNG theo mã HTTP: `maLoi` lạ cùng HTTP %i ⇒ câu chung; cùng `CHI_BAC_SI_HOAN_THANH` khác HTTP ⇒ cùng một câu',
    async (strangeStatus, sameCodeStatus) => {
      const { api } = await openDialog('VangMat');
      api.failNext('override', () =>
        apiErrorResponse(strangeStatus, 'MA_LA_XYZ'),
      );
      await submit('Lý do');
      expect(await alertText()).toBe(GENERIC_ERROR_MESSAGE);
      api.failNext('override', () =>
        apiErrorResponse(sameCodeStatus, 'CHI_BAC_SI_HOAN_THANH'),
      );
      fireEvent.click(confirmButton());
      await waitFor(async () =>
        expect(await alertText()).toBe(
          'Trạng thái Hoàn thành chỉ do Bác sĩ chuyển sau khi hoàn tất ca khám.',
        ),
      );
    },
  );
});
