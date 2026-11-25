import { fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  cleanUpDetailPage,
  DETAIL_CODE,
} from '../../../testing/appointment-detail-harness';
import { makeDetail } from '../../../testing/fake-appointment-detail-api';
import {
  CONFIRM_PATH,
  apiError,
  confirmButton,
  formLoaded,
  GRID_PATH,
  renderConfirm,
  requestButton,
  reasonField,
  SLOT_ID,
  TEXT,
} from '../../../testing/reschedule-confirm-helpers';

// reschedule F2: màn xác nhận đổi lịch, nhánh hợp lệ. Mã WDH-21 (đích của F1: đọc `khungGioId` từ URL, ca âm giữ nguyên), WDH-34 (`TuDoi`: cũ → mới, "còn n lần", tên bác sĩ từ chi tiết, tải lại),
// WDH-35 (`GuiYeuCau`: nhãn, dòng nhắc, ô lý do bắt buộc), WDH-07 (đang tải). Dữ liệu giả.
afterEach(cleanUpDetailPage);

describe('đọc khungGioId từ URL (WDH-21)', () => {
  it.each([
    ['thiếu khoá', ''],
    ['rỗng', '?khungGioId='],
    ['có chữ', '?khungGioId=abc'],
    ['số 0 đứng đầu', '?khungGioId=007'],
    ['số 0', '?khungGioId=0'],
    ['số âm', '?khungGioId=-5'],
    ['số thập phân', '?khungGioId=1.5'],
    ['dạng khoa học', '?khungGioId=1e5'],
    ['vượt BIGINT', '?khungGioId=9223372036854775808'],
    ['dài quá 19 chữ số', '?khungGioId=12345678901234567890'],
    ['lặp khoá', '?khungGioId=1&khungGioId=2'],
    ['khoá sai tên', '?slot=5'],
  ])(
    'WDH-21 ca âm: %s ⇒ "Liên kết chọn khung giờ không hợp lệ." kèm liên kết về trang chọn; KHÔNG gọi API nào, không có nút gửi',
    (_name, search) => {
      const { api } = renderConfirm({
        path: `${CONFIRM_PATH.split('?')[0]}${search}`,
      });
      expect(screen.getByRole('alert')).toHaveTextContent(TEXT.invalidLink);
      expect(
        screen.getAllByRole('link', { name: TEXT.pickAnother })[0],
      ).toHaveAttribute('href', GRID_PATH);
      expect(
        screen.queryByRole('button', { name: TEXT.confirmButton }),
      ).toBeNull();
      expect(
        screen.queryByRole('button', { name: TEXT.requestButton }),
      ).toBeNull();
      expect(api.detail.requests).toEqual([]);
      expect(api.previewCalls).toEqual([]);
    },
  );

  it('WDH-21 liên kết "Chọn khung giờ khác" (hai chỗ) về trang chọn; bấm thì thấy lại lưới', async () => {
    renderConfirm({ path: `${CONFIRM_PATH.split('?')[0]}?khungGioId=5` });
    await formLoaded();
    const links = screen.getAllByRole('link', { name: TEXT.pickAnother });
    expect(links.length).toBeGreaterThanOrEqual(1);
    for (const link of links) expect(link).toHaveAttribute('href', GRID_PATH);
    fireEvent.click(links[0]);
    expect(
      await screen.findByRole('button', { name: '08:00, còn trống' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('url')).toHaveTextContent(GRID_PATH);
  });
});

describe('nhánh tự đổi, `loai = TuDoi` (WDH-34)', () => {
  it('WDH-34 tiêu đề nhận tiêu điểm; GET preview đúng MỘT lần với đúng mã và id khung giờ (id lớn hơn 2^53 nguyên chuỗi)', async () => {
    const { api } = renderConfirm();
    await formLoaded();
    expect(
      screen.getByRole('heading', { level: 1, name: TEXT.confirmTitle }),
    ).toBe(document.activeElement);
    expect(api.previewCalls).toEqual([
      { maLichHen: DETAIL_CODE, khungGioId: SLOT_ID },
    ]);
    expect(api.submitCalls).toEqual([]);
  });

  it('WDH-34 "Lịch hiện tại" → "Lịch mới" theo giờ Việt Nam: cũ 30/11/2026 09:30, mới 02/12/2026 10:00', async () => {
    renderConfirm();
    await formLoaded();
    const current = screen
      .getByRole('heading', { name: TEXT.currentTitle })
      .closest('section') as HTMLElement;
    const next = screen
      .getByRole('heading', { name: TEXT.newTitle })
      .closest('section') as HTMLElement;
    expect(current).toHaveTextContent('09:30');
    expect(current).toHaveTextContent('30/11/2026');
    expect(next).toHaveTextContent('10:00');
    expect(next).toHaveTextContent('02/12/2026');
  });

  it('WDH-34 giờ mới là 17:30Z ⇒ hiện 00:30 NGÀY HÔM SAU (không dùng giờ máy)', async () => {
    renderConfirm({
      before: (api) => {
        api.candidate = (khungGioId) => ({
          khungGioId,
          thoiGian: '2026-12-01T17:30:00.000Z',
          hopLe: true,
        });
      },
    });
    await formLoaded();
    const next = screen
      .getByRole('heading', { name: TEXT.newTitle })
      .closest('section') as HTMLElement;
    expect(next).toHaveTextContent('00:30');
    expect(next).toHaveTextContent('02/12/2026');
    expect(next).not.toHaveTextContent('17:30');
  });

  it.each([
    [0, 2, 2],
    [1, 2, 1],
    [1, 5, 4],
    [0, 7, 7],
  ])(
    'WDH-34 đã đổi %i trên %i lần ⇒ "Bạn còn %i lần tự đổi…" (số của MÁY CHỦ, không có ô lý do)',
    async (used, max, left) => {
      renderConfirm({ preview: { soLanDaDoi: used, soLanToiDa: max } });
      await formLoaded();
      expect(screen.getByText(TEXT.remaining(left))).toBeInTheDocument();
      expect(screen.queryByRole('textbox')).toBeNull();
      expect(confirmButton()).toBeEnabled();
      expect(
        screen.queryByRole('button', { name: TEXT.requestButton }),
      ).toBeNull();
    },
  );

  it('WDH-34 `loai` do máy chủ quyết, web không tự suy từ hai số: loai TuDoi dù số nói "hết lần" ⇒ vẫn là nhánh tự đổi', async () => {
    renderConfirm({ preview: { loai: 'TuDoi', soLanDaDoi: 2, soLanToiDa: 2 } });
    await formLoaded();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(confirmButton()).toBeInTheDocument();
    // không còn lần nào để "còn n" ⇒ câu số liệu của F1, không in số âm hay "0"
    expect(screen.getByText(TEXT.usedCount(2, 2))).toBeInTheDocument();
    expect(screen.queryByText(/còn -?\d+ lần/)).toBeNull();
  });

  it('WDH-34 thẻ "Lịch hẹn" lấy TÊN bác sĩ, chuyên khoa, chi nhánh, người khám từ chi tiết lịch (preview không có các tên này)', async () => {
    const { api } = renderConfirm({
      before: (fake) => {
        fake.detail.detail = makeDetail({
          bacSi: 'Trần Thị B',
          chuyenKhoa: 'Da liễu',
          chiNhanh: 'CLINIX Thủ Đức',
          nguoiKham: { hoTen: 'Lê Văn C', laBanThan: false },
        });
      },
    });
    const card = (
      await screen.findByRole('heading', {
        level: 2,
        name: TEXT.appointmentTitle,
      })
    ).closest('section') as HTMLElement;
    for (const text of [
      'Trần Thị B',
      'Da liễu',
      'CLINIX Thủ Đức',
      'Lê Văn C',
    ]) {
      expect(card).toHaveTextContent(text);
    }
    expect(
      api.detail.callsTo('GET', `/patient/appointments/${DETAIL_CODE}`),
    ).toHaveLength(1);
  });

  it('WDH-34 chi tiết lỗi (500) ⇒ KHÔNG thẻ "Lịch hẹn", KHÔNG báo lỗi, trang vẫn xác nhận được (lời gọi phụ không làm hỏng trang)', async () => {
    renderConfirm({
      before: (fake) =>
        fake.detail.failNext('detail', () => apiError(500, 'LOI_HE_THONG')),
    });
    await formLoaded();
    expect(
      screen.queryByRole('heading', { name: TEXT.appointmentTitle }),
    ).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(confirmButton()).toBeEnabled();
  });

  it('WDH-34 id khung giờ KHÔNG hiện ra màn hình (chỉ ở URL)', async () => {
    const { container } = renderConfirm();
    await formLoaded();
    const page = container.querySelector('section') as HTMLElement;
    expect(page.textContent).not.toContain(SLOT_ID);
  });

  it('WDH-34 tải lại (dựng lại với cùng URL) vẫn ra đúng màn xác nhận: id nằm trên URL, không ở kho trình duyệt', async () => {
    const first = renderConfirm();
    await formLoaded();
    first.unmount();
    cleanUpDetailPage();
    const second = renderConfirm();
    await formLoaded();
    expect(second.api.previewCalls).toEqual([
      { maLichHen: DETAIL_CODE, khungGioId: SLOT_ID },
    ]);
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });
});

describe('nhánh gửi yêu cầu, `loai = GuiYeuCau` (WDH-35, WDH-04)', () => {
  const REQUEST = { loai: 'GuiYeuCau', soLanDaDoi: 2, soLanToiDa: 2 } as const;

  it('WDH-35 nhãn "Gửi yêu cầu đổi lịch", dòng nhắc "chuyển cho Lễ tân duyệt; lịch giữ nguyên", ô lý do BẮT BUỘC; KHÔNG có nút "Xác nhận đổi lịch" và không có "còn n lần"', async () => {
    renderConfirm({ preview: REQUEST });
    await formLoaded();
    expect(screen.getByText(TEXT.requestConfirmNotice)).toBeInTheDocument();
    expect(requestButton()).toBeEnabled();
    expect(reasonField()).toHaveAttribute('aria-required', 'true');
    expect(
      screen.queryByRole('button', { name: TEXT.confirmButton }),
    ).toBeNull();
    expect(screen.queryByText(/Bạn còn \d+ lần/)).toBeNull();
  });

  it('WDH-35 `loai` do máy chủ quyết: GuiYeuCau dù hai số còn lần (0 trên 2) ⇒ vẫn là nhánh yêu cầu', async () => {
    renderConfirm({
      preview: { loai: 'GuiYeuCau', soLanDaDoi: 0, soLanToiDa: 2 },
    });
    await formLoaded();
    expect(requestButton()).toBeInTheDocument();
    expect(reasonField()).toBeInTheDocument();
  });

  it('WDH-35 `soLanToiDa = 0` (mọi lần đổi là yêu cầu) ⇒ nhánh yêu cầu', async () => {
    renderConfirm({
      preview: { loai: 'GuiYeuCau', soLanDaDoi: 0, soLanToiDa: 0 },
    });
    await formLoaded();
    expect(reasonField()).toBeInTheDocument();
  });

  it('WDH-04 bấm gửi khi chưa nhập lý do ⇒ không gọi POST, lỗi cạnh ô', async () => {
    const { api } = renderConfirm({ preview: REQUEST });
    await formLoaded();
    fireEvent.click(requestButton());
    expect(screen.getByRole('alert')).toHaveTextContent(
      TEXT.reasonRange(5, 500),
    );
    expect(api.submitCalls).toEqual([]);
    expect(document.activeElement).toBe(reasonField());
  });
});

describe('đang tải (WDH-07)', () => {
  it('WDH-07 preview chưa về ⇒ trạng thái đang tải có chữ, tiêu đề vẫn hiện, CHƯA có nút gửi', async () => {
    renderConfirm({
      before: (api) =>
        api.failNext('preview', () => new Promise<Response>(() => undefined)),
    });
    expect(await screen.findByText(TEXT.loading)).toHaveAttribute(
      'role',
      'status',
    );
    expect(
      screen.getByRole('heading', { level: 1, name: TEXT.confirmTitle }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: TEXT.confirmButton }),
    ).toBeNull();
  });
});
