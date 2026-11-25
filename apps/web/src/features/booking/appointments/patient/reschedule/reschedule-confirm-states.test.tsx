import { fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GENERIC_ERROR_MESSAGE,
  NETWORK_ERROR_MESSAGE,
  TIMEOUT_ERROR_MESSAGE,
} from '../../../../../shared/api/error-message';
import { cleanUpDetailPage } from '../../../testing/appointment-detail-harness';
import { advanceClock } from '../../../testing/appointment-list-harness';
import { jsonResponse } from '../../../testing/fake-appointment-list-api';
import {
  apiError,
  CONFIRM_PATH,
  formLoaded,
  GRID_PATH,
  noLeak,
  OLD_DETAIL_PATH,
  renderConfirm,
  SLOT_ID,
  TEXT,
} from '../../../testing/reschedule-confirm-helpers';
import { DETAIL_TEXT } from '../detail/detail-messages';
import { LIST_TEXT } from '../list-messages';
import {
  RESCHEDULE_ERROR_CODES,
  RESCHEDULE_NOT_ALLOWED_MESSAGE,
  rescheduleMessageForCode,
} from '../../common/reschedule-errors';

// reschedule F2, mã ca WDH-36 [đề xuất] và WDH-07 (F2): các trạng thái của màn xác nhận KHÔNG cho gửi (preview nói không đổi được, khung giờ không hợp lệ, hợp đồng gãy) và lỗi khi tải preview. Chọn câu theo `maLoi`,
// KHÔNG theo mã HTTP hay `thongBao`. Hôm nay giả là 25/11/2026. Dữ liệu giả.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-25T03:00:00Z'));
});
afterEach(cleanUpDetailPage);

const retryButton = () => screen.queryByRole('button', { name: TEXT.retry });
const submitButtons = () =>
  [TEXT.confirmButton, TEXT.requestButton].map((name) =>
    screen.queryByRole('button', { name }),
  );
const expectNoSubmit = () => expect(submitButtons()).toEqual([null, null]);

describe('preview nói không đổi được (WDH-36)', () => {
  it.each([
    [RESCHEDULE_ERROR_CODES.NOT_RESCHEDULABLE],
    [RESCHEDULE_ERROR_CODES.TOO_LATE],
    [RESCHEDULE_ERROR_CODES.REQUEST_PENDING],
    [RESCHEDULE_ERROR_CODES.CHAIN_TOO_LONG],
    [RESCHEDULE_ERROR_CODES.SERVICE_CHANGED],
    [RESCHEDULE_ERROR_CODES.BRANCH_CHANGED],
  ])(
    'WDH-36 `choPhepDoi = false` + `lyDoKhongDoi` %s ⇒ câu theo MÃ, liên kết về chi tiết, KHÔNG nút gửi, không ô lý do',
    async (code) => {
      const { container } = renderConfirm({
        preview: { choPhepDoi: false, lyDoKhongDoi: code },
      });
      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(
        rescheduleMessageForCode(code)?.message as string,
      );
      expect(
        screen.getByRole('link', { name: TEXT.backToDetailLink }),
      ).toHaveAttribute('href', OLD_DETAIL_PATH);
      expectNoSubmit();
      expect(screen.queryByRole('textbox')).toBeNull();
      noLeak(container);
    },
  );

  it.each([
    ['vắng `lyDoKhongDoi`', undefined],
    ['mã lạ', 'MA_LA'],
    ['mã trùng khoá của nguyên mẫu', 'constructor'],
  ])(
    'WDH-36 `choPhepDoi = false` và %s ⇒ câu chung, không in mã thô',
    async (_name, code) => {
      const { container } = renderConfirm({
        preview: { choPhepDoi: false, lyDoKhongDoi: code },
      });
      expect(await screen.findByRole('alert')).toHaveTextContent(
        RESCHEDULE_NOT_ALLOWED_MESSAGE,
      );
      noLeak(container);
      expectNoSubmit();
    },
  );
});

describe('khung giờ đã chọn không hợp lệ (WDH-36)', () => {
  it.each([
    [RESCHEDULE_ERROR_CODES.SAME_AS_CURRENT_SLOT],
    [RESCHEDULE_ERROR_CODES.OTHER_DOCTOR],
    ['KHUNG_GIO_DA_DAT'],
    ['BAC_SI_NGHI_PHEP'],
  ])(
    'WDH-36 `hopLe = false` + `lyDoKhongHopLe` %s ⇒ câu theo mã, liên kết "Chọn khung giờ khác", thẻ lịch hiện tại, KHÔNG thẻ "Lịch mới", KHÔNG nút gửi',
    async (code) => {
      const { container } = renderConfirm({
        before: (api) => {
          api.candidate = (khungGioId) => ({
            khungGioId,
            thoiGian: '2026-12-02T03:00:00.000Z',
            hopLe: false,
            lyDoKhongHopLe: code,
          });
        },
      });
      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(
        rescheduleMessageForCode(code)?.message as string,
      );
      expect(
        screen.getAllByRole('link', { name: TEXT.pickAnother })[0],
      ).toHaveAttribute('href', GRID_PATH);
      expect(
        screen.getByRole('heading', { name: TEXT.currentTitle }),
      ).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: TEXT.newTitle })).toBeNull();
      expectNoSubmit();
      noLeak(container);
    },
  );

  it.each([
    ['vắng `lyDoKhongHopLe`', undefined],
    ['mã lạ', 'MA_LA'],
  ])(
    'WDH-36 `hopLe = false` và %s ⇒ câu riêng của khung giờ (không phải "Lịch hẹn này hiện không thể đổi")',
    async (_name, code) => {
      renderConfirm({
        before: (api) => {
          api.candidate = (khungGioId) => ({
            khungGioId,
            thoiGian: '2026-12-02T03:00:00.000Z',
            hopLe: false,
            ...(code === undefined ? {} : { lyDoKhongHopLe: code }),
          });
        },
      });
      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(TEXT.slotNotUsable);
      expect(alert).not.toHaveTextContent(RESCHEDULE_NOT_ALLOWED_MESSAGE);
      expectNoSubmit();
    },
  );
});

describe('hợp đồng gãy (WDH-36)', () => {
  it('WDH-36 có `khungGioId` mà `lichMoi = null` ⇒ "phản hồi không dùng được" (câu chung) kèm "Thử lại", KHÔNG vẽ "Lịch mới" và KHÔNG nút gửi; "Thử lại" gọi lại rồi hiện biểu mẫu', async () => {
    const { api } = renderConfirm({
      before: (fake) => {
        fake.candidate = null;
      },
    });
    expect(await screen.findByText(GENERIC_ERROR_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: TEXT.newTitle })).toBeNull();
    expectNoSubmit();
    api.candidate = (khungGioId) => ({
      khungGioId,
      thoiGian: '2026-12-02T03:00:00.000Z',
      hopLe: true,
    });
    fireEvent.click(retryButton() as HTMLElement);
    await formLoaded();
    expect(api.previewCalls).toHaveLength(2);
  });

  it('WDH-36 `lichMoi.khungGioId` khác id trên URL ⇒ không dùng được (không vẽ "Lịch mới" của một khung giờ khác)', async () => {
    renderConfirm({
      before: (api) => {
        api.candidate = () => ({
          khungGioId: '5',
          thoiGian: '2026-12-02T03:00:00.000Z',
          hopLe: true,
        });
      },
    });
    expect(await screen.findByText(GENERIC_ERROR_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: TEXT.newTitle })).toBeNull();
    expectNoSubmit();
  });
});

describe('lỗi khi tải preview (WDH-36, WDH-07)', () => {
  it('WDH-36 404 `KHONG_TIM_THAY` và 403 `KHONG_DU_QUYEN` là MỘT thẻ chung "Không tìm thấy lịch hẹn này." cùng DOM, kèm liên kết "Lịch hẹn của tôi"; không "Thử lại", không nút gửi', async () => {
    const html: string[] = [];
    for (const [status, code] of [
      [404, 'KHONG_TIM_THAY'],
      [403, 'KHONG_DU_QUYEN'],
    ] as const) {
      const { container, unmount } = renderConfirm({
        before: (api) => api.failNext('preview', () => apiError(status, code)),
      });
      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(DETAIL_TEXT.notFound);
      expect(
        screen.getByRole('link', { name: DETAIL_TEXT.backToList }),
      ).toBeInTheDocument();
      expect(retryButton()).toBeNull();
      expectNoSubmit();
      noLeak(container);
      html.push(alert.innerHTML);
      unmount();
      cleanUpDetailPage();
      vi.useFakeTimers({ toFake: ['Date'] });
    }
    expect(html[0]).toBe(html[1]);
  });

  it('WDH-36 401 ⇒ câu phiên hết hạn, không "Thử lại"', async () => {
    renderConfirm({
      before: (api) =>
        api.failNext('preview', () => apiError(401, 'CHUA_DANG_NHAP')),
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      LIST_TEXT.sessionExpired,
    );
    expect(retryButton()).toBeNull();
  });

  it('WDH-36 404 `KHUNG_GIO_KHONG_TON_TAI` (không phải "không tìm thấy lịch") ⇒ câu của khung giờ kèm "Chọn khung giờ khác"; KHÔNG tự chuyển trang', async () => {
    renderConfirm({
      before: (api) =>
        api.failNext('preview', () => apiError(404, 'KHUNG_GIO_KHONG_TON_TAI')),
    });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Không tìm thấy khung giờ này.');
    expect(alert).not.toHaveTextContent(DETAIL_TEXT.notFound);
    expect(screen.getByTestId('url')).toHaveTextContent(CONFIRM_PATH);
    expect(
      screen.getAllByRole('link', { name: TEXT.pickAnother })[0],
    ).toHaveAttribute('href', GRID_PATH);
  });

  it.each([
    [
      '409 HE_THONG_CHUA_CAU_HINH',
      () => apiError(409, 'HE_THONG_CHUA_CAU_HINH'),
    ],
    ['503 HE_THONG_DANG_BAN', () => apiError(503, 'HE_THONG_DANG_BAN')],
  ])(
    'WDH-36 %s ⇒ câu theo mã kèm "Thử lại"; bấm gọi lại đúng MỘT lần rồi hiện biểu mẫu',
    async (_name, response) => {
      const { api } = renderConfirm({
        before: (fake) => fake.failNext('preview', response),
      });
      expect(await screen.findByRole('alert')).toBeInTheDocument();
      expect(api.previewCalls).toHaveLength(1);
      fireEvent.click(retryButton() as HTMLElement);
      await formLoaded();
      expect(api.previewCalls).toHaveLength(2);
      expect(screen.queryByRole('alert')).toBeNull();
    },
  );

  it.each([
    [
      'mất mạng',
      NETWORK_ERROR_MESSAGE,
      () => Promise.reject(new TypeError('Failed to fetch')),
    ],
    [
      'HTML 502 (nginx)',
      GENERIC_ERROR_MESSAGE,
      () => new Response('<html>502</html>', { status: 502 }),
    ],
    [
      '500 LOI_HE_THONG',
      GENERIC_ERROR_MESSAGE,
      () => apiError(500, 'LOI_HE_THONG'),
    ],
    [
      'maLoi lạ cùng HTTP 409',
      GENERIC_ERROR_MESSAGE,
      () => apiError(409, 'MA_LA'),
    ],
    [
      'maLoi lạ cùng HTTP 404',
      GENERIC_ERROR_MESSAGE,
      () => apiError(404, 'MA_LA'),
    ],
    [
      '200 sai hợp đồng (thiếu `lichCu.bacSiId`)',
      GENERIC_ERROR_MESSAGE,
      () =>
        jsonResponse({
          choPhepDoi: true,
          loai: 'TuDoi',
          soLanDaDoi: 0,
          soLanToiDa: 2,
          coYeuCauChoDuyet: false,
          lichCu: { thoiGian: '2026-11-30T02:30:00.000Z' },
          lichMoi: null,
          thoiGianMayChu: '2026-11-25T03:00:00.000Z',
        }),
    ],
  ] as const)(
    'WDH-07 %s ⇒ câu chung kèm "Thử lại", không lộ chi tiết; "Thử lại" gọi lại đúng MỘT lần',
    async (_name, message, response) => {
      const { api, container } = renderConfirm({
        before: (fake) => fake.failNext('preview', response),
      });
      expect(await screen.findByText(message)).toBeInTheDocument();
      // `maLoi` lạ cùng 404 KHÔNG bị coi là "không tìm thấy" (chọn theo maLoi, không theo mã HTTP)
      expect(screen.queryByText(DETAIL_TEXT.notFound)).toBeNull();
      noLeak(container);
      fireEvent.click(retryButton() as HTMLElement);
      await formLoaded();
      expect(api.previewCalls).toHaveLength(2);
    },
  );

  it('WDH-07 hết thời gian chờ (15 giây không phản hồi) ⇒ câu quá giờ kèm "Thử lại"', async () => {
    // Đồng hồ giả bật TRƯỚC khi dựng trang: hẹn giờ 15 giây của `request()` được tạo lúc tải đầu; `fetch` giả huỷ theo `signal` như `fetch` thật
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(new Date('2026-11-25T03:00:00Z'));
    renderConfirm({
      before: (api) =>
        api.failNext(
          'preview',
          (init) =>
            new Promise<Response>((_resolve, reject) => {
              init?.signal?.addEventListener('abort', () =>
                reject(new DOMException('Aborted', 'AbortError')),
              );
            }),
        ),
    });
    await advanceClock(15_000);
    expect(screen.getByRole('alert')).toHaveTextContent(TIMEOUT_ERROR_MESSAGE);
    expect(retryButton()).toBeInTheDocument();
    expectNoSubmit();
  });

  it('WDH-36 id khung giờ không rò ra lời báo lỗi', async () => {
    renderConfirm({
      before: (api) =>
        api.failNext('preview', () => apiError(500, 'LOI_HE_THONG')),
    });
    // chỉ xét lời báo lỗi: ô dò URL của harness in đúng URL có id
    expect((await screen.findByRole('alert')).textContent).not.toContain(
      SLOT_ID,
    );
  });
});
