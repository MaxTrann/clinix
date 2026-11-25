import { fireEvent, screen, within } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GENERIC_ERROR_MESSAGE,
  NETWORK_ERROR_MESSAGE,
  TIMEOUT_ERROR_MESSAGE,
} from '../../../../../shared/api/error-message';
import {
  cleanUpDetailPage,
  DETAIL_CODE,
} from '../../../testing/appointment-detail-harness';
import { advanceClock } from '../../../testing/appointment-list-harness';
import { jsonResponse } from '../../../testing/fake-appointment-list-api';
import { fakeDay, fakeSlot } from '../../../testing/fake-reschedule-api';
import { renderReschedule } from '../../../testing/reschedule-harness';
import { DETAIL_TEXT } from '../detail/detail-messages';
import { LIST_TEXT } from '../list-messages';
import { RESCHEDULE_ERROR_CODES } from './reschedule-errors';
import { RESCHEDULE_TEXT } from './reschedule-text';

// reschedule F1: đủ trạng thái của trang chọn khung giờ. Mã WDH-07 (đang tải, rỗng, lỗi, mất mạng, hết thời gian; PLAN reschedule 7.11) và WDH-27 [đề xuất] (không lộ thông điệp máy chủ, mã
// nội bộ hay `requestId`). Chọn câu theo `maLoi`, KHÔNG theo mã HTTP hay `thongBao` (PLAN 5.13). Hôm nay giả là 25/11/2026. Dữ liệu giả.
const TODAY = '2026-11-25';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${TODAY}T03:00:00Z`));
});
afterEach(cleanUpDetailPage);

const apiError = (status: number, maLoi: string, extra: object = {}) =>
  jsonResponse(
    {
      maLoi,
      thongBao: 'THONG_BAO_NOI_BO_CUA_MAY_CHU',
      requestId: 'req-nội-bộ-1',
      ...extra,
    },
    status,
  );
const retryButton = () => screen.queryByRole('button', { name: 'Thử lại' });
const noLeak = (container: HTMLElement) =>
  expect(container.textContent).not.toMatch(
    /THONG_BAO_NOI_BO|req-nội-bộ|LOI_HE_THONG|MA_LA|KHONG_DU_QUYEN|KHONG_TIM_THAY|LICH_HEN_|chiTiet|stack/,
  );

describe('đang tải và rỗng (WDH-07)', () => {
  it('WDH-07 đang tải preview ⇒ trạng thái có chữ, tiêu đề vẫn hiện, CHƯA có lưới', async () => {
    renderReschedule({
      before: (api) =>
        api.failNext('preview', () => new Promise<Response>(() => undefined)),
    });
    expect(await screen.findByText(RESCHEDULE_TEXT.loading)).toHaveAttribute(
      'role',
      'status',
    );
    expect(
      screen.getByRole('heading', { level: 1, name: RESCHEDULE_TEXT.title }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Ngày khám' })).toBeNull();
  });

  it('WDH-07 bác sĩ không còn khung giờ trống ⇒ "Không còn khung giờ trống trong ngày này", các ô khác vẫn hiện và không bấm được', async () => {
    renderReschedule({
      before: (api) => {
        api.slotsFor = (bacSiId, ngay) =>
          fakeDay(bacSiId, [
            fakeSlot('1', ngay, '08:00', 'DaDat'),
            fakeSlot('2', ngay, '08:30', 'HetHan'),
          ]);
      },
    });
    expect(
      await screen.findByText('Không còn khung giờ trống trong ngày này'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /còn trống/ })).toBeNull();
    expect(screen.getAllByRole('img')).toHaveLength(2);
  });

  it('WDH-07 `CoLich` mà không có khung giờ nào ⇒ cùng câu rỗng', async () => {
    renderReschedule({
      before: (api) => {
        api.slotsFor = (bacSiId) => fakeDay(bacSiId, []);
      },
    });
    expect(
      await screen.findByText('Không còn khung giờ trống trong ngày này'),
    ).toBeInTheDocument();
  });
});

describe('404, 403 và 401 (WDH-07)', () => {
  it('WDH-07, WDH-27 404 và 403 là MỘT thẻ chung "Không tìm thấy lịch hẹn này." kèm liên kết về danh sách, không `Thử lại`, DOM giống nhau', async () => {
    const htmlOf: string[] = [];
    for (const [status, maLoi] of [
      [404, 'KHONG_TIM_THAY'],
      [403, 'KHONG_DU_QUYEN'],
    ] as const) {
      const { container, unmount } = renderReschedule({
        before: (api) =>
          api.failNext('preview', () =>
            apiError(status, maLoi, { chiTiet: { daTonTai: true } }),
          ),
      });
      const notice = await screen.findByRole('alert');
      expect(notice).toHaveTextContent(DETAIL_TEXT.notFound);
      expect(
        within(notice).getByRole('link', { name: DETAIL_TEXT.backToList }),
      ).toHaveAttribute('href', '/benh-nhan/lich-hen-cua-toi');
      expect(retryButton()).toBeNull();
      expect(screen.queryByRole('group', { name: 'Ngày khám' })).toBeNull();
      noLeak(container);
      htmlOf.push(container.innerHTML);
      unmount();
    }
    expect(htmlOf[0]).toBe(htmlOf[1]);
  });

  it('WDH-07 401 ⇒ câu phiên hết hạn, không `Thử lại`', async () => {
    renderReschedule({
      before: (api) =>
        api.failNext('preview', () => apiError(401, 'CHUA_DANG_NHAP')),
    });
    expect(
      await screen.findByText(LIST_TEXT.sessionExpired),
    ).toBeInTheDocument();
    expect(retryButton()).toBeNull();
  });
});

describe('409 theo maLoi (WDH-07, PLAN 5.13)', () => {
  it.each([
    [
      RESCHEDULE_ERROR_CODES.NOT_RESCHEDULABLE,
      'Lịch hẹn này hiện không thể đổi. Chỉ lịch đã xác nhận mới đổi được.',
    ],
    [RESCHEDULE_ERROR_CODES.TOO_LATE, 'Đã quá giờ hẹn nên không thể đổi lịch.'],
    [
      RESCHEDULE_ERROR_CODES.REQUEST_PENDING,
      'Lịch hẹn này đã có yêu cầu đổi lịch đang chờ duyệt.',
    ],
    [
      RESCHEDULE_ERROR_CODES.CHAIN_TOO_LONG,
      'Lịch hẹn này đã đổi quá nhiều lần. Vui lòng huỷ và đặt lịch mới.',
    ],
    [
      RESCHEDULE_ERROR_CODES.SERVICE_CHANGED,
      'Bác sĩ đã thay đổi dịch vụ so với lúc đặt. Vui lòng huỷ và đặt lịch mới.',
    ],
  ])(
    'WDH-07 409 %s ⇒ đúng câu của 5.13, liên kết về chi tiết, KHÔNG `Thử lại`, không lộ thông điệp máy chủ',
    async (maLoi, message) => {
      const { container } = renderReschedule({
        before: (api) => api.failNext('preview', () => apiError(409, maLoi)),
      });
      const notice = await screen.findByRole('alert');
      expect(notice).toHaveTextContent(message);
      expect(
        within(notice).getByRole('link', {
          name: RESCHEDULE_TEXT.backToDetailLink,
        }),
      ).toHaveAttribute('href', `/benh-nhan/lich-hen-cua-toi/${DETAIL_CODE}`);
      expect(retryButton()).toBeNull();
      expect(screen.queryByRole('group', { name: 'Ngày khám' })).toBeNull();
      expect(container.textContent).not.toContain('THONG_BAO_NOI_BO');
    },
  );

  it('WDH-07 chọn câu theo `maLoi`, KHÔNG theo `thongBao`: thân nói câu khác vẫn ra câu của `maLoi`', async () => {
    renderReschedule({
      before: (api) =>
        api.failNext('preview', () =>
          apiError(409, RESCHEDULE_ERROR_CODES.TOO_LATE, {
            thongBao: 'Lịch hẹn này đã có yêu cầu đổi lịch đang chờ duyệt.',
          }),
        ),
    });
    const notice = await screen.findByRole('alert');
    expect(notice).toHaveTextContent('Đã quá giờ hẹn nên không thể đổi lịch.');
    expect(notice).not.toHaveTextContent('yêu cầu đổi lịch đang chờ duyệt');
  });

  it('WDH-07 `HE_THONG_CHUA_CAU_HINH` ⇒ câu hệ thống chưa sẵn sàng kèm "Thử lại" gọi lại preview và hiện lưới', async () => {
    const { api } = renderReschedule({
      before: (fake) =>
        fake.failNext('preview', () => apiError(409, 'HE_THONG_CHUA_CAU_HINH')),
    });
    expect(
      await screen.findByText(
        'Hệ thống chưa sẵn sàng nhận đặt lịch. Vui lòng thử lại sau.',
      ),
    ).toBeInTheDocument();
    fireEvent.click(retryButton() as HTMLElement);
    expect(
      await screen.findByRole('button', { name: '08:00, còn trống' }),
    ).toBeInTheDocument();
    expect(api.previewCalls).toHaveLength(2);
  });

  it('WDH-07 503 `HE_THONG_DANG_BAN` ⇒ câu bận kèm "Thử lại"', async () => {
    renderReschedule({
      before: (api) =>
        api.failNext('preview', () => apiError(503, 'HE_THONG_DANG_BAN')),
    });
    expect(
      await screen.findByText(
        'Hệ thống đang xử lý nhiều yêu cầu cùng lúc. Vui lòng thử lại sau ít giây.',
      ),
    ).toBeInTheDocument();
    expect(retryButton()).toBeInTheDocument();
  });
});

describe('mạng, quá giờ, phản hồi lạ (WDH-07)', () => {
  it.each([
    [
      'mất mạng',
      NETWORK_ERROR_MESSAGE,
      () => Promise.reject(new TypeError('Failed to fetch')),
    ],
    [
      'HTML 502 (nginx)',
      GENERIC_ERROR_MESSAGE,
      () => new Response('<html>502 Bad Gateway</html>', { status: 502 }),
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
    'WDH-07, WDH-27 %s ⇒ câu chung kèm "Thử lại", không lộ chi tiết; "Thử lại" gọi lại đúng MỘT lần rồi hiện lưới',
    async (_name, message, response) => {
      const { api, container } = renderReschedule({
        before: (fake) => fake.failNext('preview', response),
      });
      expect(await screen.findByText(message)).toBeInTheDocument();
      // `maLoi` lạ cùng 404 KHÔNG bị coi là "không tìm thấy" (chọn theo maLoi, không theo mã HTTP)
      expect(screen.queryByText(DETAIL_TEXT.notFound)).toBeNull();
      noLeak(container);
      expect(api.previewCalls).toHaveLength(1);

      fireEvent.click(retryButton() as HTMLElement);
      expect(
        await screen.findByRole('button', { name: '08:00, còn trống' }),
      ).toBeInTheDocument();
      expect(api.previewCalls).toHaveLength(2);
      expect(screen.queryByRole('alert')).toBeNull();
    },
  );

  it('WDH-07 hết thời gian chờ (15 giây không phản hồi) ⇒ câu quá giờ kèm "Thử lại"', async () => {
    // Đồng hồ giả bật TRƯỚC khi dựng trang: hẹn giờ 15 giây của `request()` được tạo lúc tải đầu. `fetch` giả phải biết huỷ theo `signal` như `fetch` thật.
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(new Date(`${TODAY}T03:00:00Z`));
    renderReschedule({
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
  });
});

describe('lỗi của lưới tách khỏi preview (WDH-07)', () => {
  it('WDH-07, WDH-27 lưới lỗi ⇒ chỉ phần lưới báo lỗi kèm "Thử lại"; thẻ lịch hiện tại và dải ngày vẫn hiện; "Thử lại" gọi lại lưới (không gọi lại preview)', async () => {
    const { api, container } = renderReschedule({
      before: (fake) =>
        fake.failNext('slots', () => apiError(500, 'LOI_HE_THONG')),
    });
    expect(
      await screen.findByText('Không tải được khung giờ.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: RESCHEDULE_TEXT.currentTitle,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('group', { name: 'Ngày khám' }),
    ).toBeInTheDocument();
    noLeak(container);

    fireEvent.click(retryButton() as HTMLElement);
    expect(
      await screen.findByRole('button', { name: '08:00, còn trống' }),
    ).toBeInTheDocument();
    expect(api.slotCalls).toHaveLength(2);
    expect(api.previewCalls).toHaveLength(1);
  });

  it('WDH-07 mất mạng ở lưới ⇒ cùng câu lỗi lưới và "Thử lại" chạy được', async () => {
    renderReschedule({
      before: (api) =>
        api.failNext('slots', () => Promise.reject(new TypeError('x'))),
    });
    expect(
      await screen.findByText('Không tải được khung giờ.'),
    ).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(retryButton() as HTMLElement);
    });
    expect(
      await screen.findByRole('button', { name: '08:00, còn trống' }),
    ).toBeInTheDocument();
  });
});
