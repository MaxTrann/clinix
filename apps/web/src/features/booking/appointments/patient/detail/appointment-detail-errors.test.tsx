import { fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  GENERIC_ERROR_MESSAGE,
  NETWORK_ERROR_MESSAGE,
  TIMEOUT_ERROR_MESSAGE,
} from '../../../../../shared/api/error-message';
import {
  DETAIL_API_PATH,
  cleanUpDetailPage,
  detailLoaded,
  renderDetailPage,
} from '../../../testing/appointment-detail-harness';
import {
  advanceClock,
  startFakeClock,
} from '../../../testing/appointment-list-harness';
import {
  makeDetail,
  notFoundResponse,
} from '../../../testing/fake-appointment-detail-api';
import { jsonResponse } from '../../../testing/fake-appointment-list-api';
import { DETAIL_TEXT } from './detail-messages';
import { LIST_TEXT } from '../list-messages';

// booking F2: lỗi tải trang chi tiết, chọn câu theo `maLoi` (không theo mã HTTP; PLAN 5.13, 5.14). Mã LCT là [đề xuất] (PLAN booking mục 7.33). Dữ liệu giả.
afterEach(cleanUpDetailPage);

const apiError = (status: number, maLoi: string, extra: object = {}) =>
  jsonResponse({ maLoi, thongBao: 'Lỗi giả của test', ...extra }, status);
const retryButton = () => screen.queryByRole('button', { name: 'Thử lại' });
const alertText = () => screen.getByRole('alert').textContent;
const h1 = () =>
  screen.getByRole('heading', { level: 1, name: DETAIL_TEXT.title });

describe('404 KHONG_TIM_THAY', () => {
  it('LCT-06 một màn "Không tìm thấy lịch hẹn này." kèm liên kết về danh sách, không `Thử lại`, tiêu đề vẫn hiện', async () => {
    renderDetailPage({
      before: (api) => {
        api.detail = null;
      },
    });

    expect(await screen.findByText(DETAIL_TEXT.notFound)).toBeInTheDocument();
    expect(h1()).toBeInTheDocument();
    expect(retryButton()).toBeNull();
    const back = screen.getAllByRole('link', { name: DETAIL_TEXT.backToList });
    expect(back).toHaveLength(2);
    for (const link of back) {
      expect(link).toHaveAttribute('href', '/benh-nhan/lich-hen-cua-toi');
    }
    expect(
      screen.queryByRole('region', { name: DETAIL_TEXT.summary }),
    ).toBeNull();
  });

  it('LCT-06 hai thân 404 chỉ khác thongBao và requestId (lịch không có / của người khác) ⇒ CÙNG một DOM, không lộ lịch có tồn tại hay không', async () => {
    const first = renderDetailPage({
      before: (api) =>
        api.failNext('detail', () =>
          notFoundResponse({
            thongBao: 'Không có lịch hẹn này',
            requestId: 'req-1',
          }),
        ),
    });
    await screen.findByText(DETAIL_TEXT.notFound);
    const htmlA = first.container.innerHTML;
    first.unmount();
    cleanUpDetailPage();

    const second = renderDetailPage({
      before: (api) =>
        api.failNext('detail', () =>
          notFoundResponse({
            thongBao: 'Lịch hẹn thuộc người khác',
            requestId: 'req-2',
            chiTiet: { daTonTai: true },
          }),
        ),
    });
    await screen.findByText(DETAIL_TEXT.notFound);
    expect(second.container.innerHTML).toBe(htmlA);
    expect(second.container.textContent).not.toMatch(
      /người khác|req-|daTonTai/,
    );
  });
});

describe('lỗi khác theo maLoi', () => {
  it('LCT-06 CHUA_DANG_NHAP ⇒ câu hết phiên, không `Thử lại`', async () => {
    renderDetailPage({
      before: (api) =>
        api.failNext('detail', () => apiError(401, 'CHUA_DANG_NHAP')),
    });

    expect(
      await screen.findByText(LIST_TEXT.sessionExpired),
    ).toBeInTheDocument();
    expect(retryButton()).toBeNull();
    expect(h1()).toBeInTheDocument();
  });

  it('LCT-06 KHONG_DU_QUYEN ⇒ câu không có quyền, không `Thử lại`', async () => {
    renderDetailPage({
      before: (api) =>
        api.failNext('detail', () => apiError(403, 'KHONG_DU_QUYEN')),
    });

    expect(await screen.findByText(DETAIL_TEXT.forbidden)).toBeInTheDocument();
    expect(retryButton()).toBeNull();
  });

  it.each([
    [
      'mạng',
      NETWORK_ERROR_MESSAGE,
      () => Promise.reject(new TypeError('Failed to fetch')),
    ],
    [
      'HTML 502 (nginx)',
      GENERIC_ERROR_MESSAGE,
      () => new Response('<html>502 Bad Gateway</html>', { status: 502 }),
    ],
    [
      'thân rỗng 500',
      GENERIC_ERROR_MESSAGE,
      () => new Response('', { status: 500 }),
    ],
    [
      'maLoi lạ cùng HTTP 404',
      GENERIC_ERROR_MESSAGE,
      () => apiError(404, 'MA_LA'),
    ],
    [
      'maLoi lạ cùng HTTP 403',
      GENERIC_ERROR_MESSAGE,
      () => apiError(403, 'MA_LA'),
    ],
    [
      'maLoi lạ cùng HTTP 500',
      GENERIC_ERROR_MESSAGE,
      () => apiError(500, 'MA_LA'),
    ],
    [
      'LOI_HE_THONG 500',
      GENERIC_ERROR_MESSAGE,
      () => apiError(500, 'LOI_HE_THONG'),
    ],
  ] as const)(
    'LCT-06 %s ⇒ câu chung hoặc câu mạng kèm `Thử lại`, và `Thử lại` gọi lại đúng MỘT GET rồi hiện trang',
    async (_name, message, response) => {
      const { api } = renderDetailPage({
        before: (fake) => fake.failNext('detail', response),
      });

      expect(await screen.findByText(message)).toBeInTheDocument();
      // maLoi lạ cùng 404 KHÔNG được coi là "không tìm thấy" (chọn theo maLoi, không theo mã HTTP)
      expect(screen.queryByText(DETAIL_TEXT.notFound)).toBeNull();
      expect(api.callsTo('GET', DETAIL_API_PATH)).toHaveLength(1);

      fireEvent.click(retryButton() as HTMLElement);
      await detailLoaded();
      expect(api.callsTo('GET', DETAIL_API_PATH)).toHaveLength(2);
      expect(screen.queryByRole('alert')).toBeNull();
    },
  );

  it('LCT-06 quá giờ (15 giây không có phản hồi) ⇒ câu quá giờ kèm `Thử lại`', async () => {
    // Đồng hồ giả bật TRƯỚC khi dựng trang: hẹn giờ 15 giây của `request()` được tạo lúc tải đầu. `fetch` giả phải biết huỷ theo `signal` như `fetch` thật.
    startFakeClock();
    renderDetailPage({
      before: (api) =>
        api.failNext(
          'detail',
          (init) =>
            new Promise<Response>((_resolve, reject) => {
              init?.signal?.addEventListener('abort', () =>
                reject(new DOMException('Aborted', 'AbortError')),
              );
            }),
        ),
    });
    await advanceClock(15_000);

    expect(alertText()).toContain(TIMEOUT_ERROR_MESSAGE);
    expect(retryButton()).toBeInTheDocument();
  });

  it('LCT-05 200 nhưng thân sai hợp đồng (thiếu khoá) ⇒ phản hồi không dùng được: câu chung kèm `Thử lại`, trang không vỡ', async () => {
    renderDetailPage({
      before: (api) => {
        const incomplete: Record<string, unknown> = { ...makeDetail() };
        delete incomplete.thanhToan;
        api.detail = incomplete;
      },
    });

    expect(await screen.findByText(GENERIC_ERROR_MESSAGE)).toBeInTheDocument();
    expect(retryButton()).toBeInTheDocument();
    expect(h1()).toBeInTheDocument();
  });
});
