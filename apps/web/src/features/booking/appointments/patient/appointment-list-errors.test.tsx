import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  GENERIC_ERROR_MESSAGE,
  NETWORK_ERROR_MESSAGE,
  TIMEOUT_ERROR_MESSAGE,
} from '../../../../shared/api/error-message';
import {
  apiErrorResponse,
  jsonResponse,
  makeAppointments,
} from '../../testing/fake-appointment-list-api';
import {
  advanceClock,
  cleanUpListPage,
  lastListQuery,
  listQueries,
  loaded,
  renderListPage,
  rowCodes,
  startFakeClock,
  tab,
} from '../../testing/appointment-list-harness';
import { LIST_TEXT } from './list-messages';

// booking F1: trạng thái lỗi và mất mạng của danh sách. Mã LHL là [đề xuất] (PLAN booking mục 7.31 sau khi duyệt). Câu theo `maLoi`, KHÔNG theo mã HTTP
// (PLAN 5.13, CODING_CONVENTION): mỗi nhánh có cặp ca đối chứng cùng mã HTTP khác `maLoi`, hoặc cùng `maLoi` khác mã HTTP.
afterEach(cleanUpListPage);

const retryButton = () => screen.queryByRole('button', { name: 'Thử lại' });

describe('lỗi theo maLoi (lần tải đầu)', () => {
  it('LHL-08 `CHUA_DANG_NHAP` ⇒ câu phiên hết hạn, KHÔNG có `Thử lại`', async () => {
    renderListPage({
      before: (api) =>
        api.failNext('list', () => apiErrorResponse(401, 'CHUA_DANG_NHAP')),
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      LIST_TEXT.sessionExpired,
    );
    expect(retryButton()).toBeNull();
    // h1 và các ô lọc vẫn còn: trang không trắng
    expect(
      screen.getByRole('heading', { name: LIST_TEXT.title }),
    ).toBeInTheDocument();
  });

  it('LHL-08 `KHONG_DU_QUYEN` ⇒ câu không đủ quyền, KHÔNG có `Thử lại`; chọn câu theo `maLoi` nên cùng `maLoi` mà HTTP 500 vẫn ra câu này', async () => {
    for (const status of [403, 500]) {
      const { unmount } = renderListPage({
        before: (api) =>
          api.failNext('list', () =>
            apiErrorResponse(status, 'KHONG_DU_QUYEN'),
          ),
      });
      expect(await screen.findByRole('alert')).toHaveTextContent(
        LIST_TEXT.forbidden,
      );
      expect(retryButton()).toBeNull();
      unmount();
      cleanUpListPage();
    }
  });

  // Đối chứng: cùng mã HTTP 403 (và 500, 409, 400) nhưng `maLoi` lạ ⇒ câu chung kèm `Thử lại`, KHÔNG phải câu "không đủ quyền"
  it.each([403, 500, 409, 400, 404])(
    'LHL-08 HTTP %i với `maLoi` lạ ⇒ câu chung kèm `Thử lại` (không theo mã HTTP)',
    async (status) => {
      renderListPage({
        before: (api) =>
          api.failNext('list', () => apiErrorResponse(status, 'MA_LOI_LA')),
      });

      expect(await screen.findByRole('alert')).toHaveTextContent(
        GENERIC_ERROR_MESSAGE,
      );
      expect(retryButton()).toBeInTheDocument();
      expect(screen.queryByText(LIST_TEXT.forbidden)).toBeNull();
      expect(screen.queryByText(LIST_TEXT.sessionExpired)).toBeNull();
    },
  );

  it('LHL-08 400 `DU_LIEU_KHONG_HOP_LE` KHÔNG phải lỗi từ khoá (`loi[].ma` khác) ⇒ câu chung kèm `Thử lại`, không phải câu dưới ô tìm', async () => {
    renderListPage({
      before: (api) =>
        api.failNext('list', () =>
          apiErrorResponse(400, 'DU_LIEU_KHONG_HOP_LE', [
            { truong: 'tuNgay', ma: 'IS_CALENDAR_DATE' },
          ]),
        ),
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      GENERIC_ERROR_MESSAGE,
    );
    expect(retryButton()).toBeInTheDocument();
    expect(screen.queryByText(LIST_TEXT.keywordRejected)).toBeNull();
  });

  it('LHL-08 mạng đứt ⇒ câu mạng kèm `Thử lại`; có mạng lại thì `Thử lại` gọi lại ĐÚNG truy vấn và hiện bảng', async () => {
    const { api } = renderListPage({
      before: (fake) => {
        fake.appointments = makeAppointments(3);
        fake.failNext('list', () => {
          throw new TypeError('Failed to fetch');
        });
      },
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      NETWORK_ERROR_MESSAGE,
    );
    fireEvent.click(retryButton()!);

    await waitFor(() => expect(rowCodes()).toHaveLength(3));
    expect(screen.queryByRole('alert')).toBeNull();
    const queries = listQueries(api);
    expect(queries).toHaveLength(2);
    expect(queries[1]).toEqual(queries[0]);
  });

  it('LHL-08 phản hồi không phải JSON (HTML 502) ⇒ câu chung kèm `Thử lại`, không lộ nội dung HTML', async () => {
    renderListPage({
      before: (api) =>
        api.failNext(
          'list',
          () =>
            new Response('<html><body>Bad Gateway</body></html>', {
              status: 502,
            }),
        ),
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      GENERIC_ERROR_MESSAGE,
    );
    expect(retryButton()).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('Bad Gateway');
  });

  // Đồng hồ giả bật TRƯỚC khi dựng trang: hẹn giờ 15 giây của `request()` được tạo lúc tải đầu. `fetch` giả phải biết huỷ theo `signal` như `fetch` thật
  it('LHL-08 quá giờ chờ (15 giây) ⇒ câu quá giờ kèm `Thử lại`', async () => {
    startFakeClock();
    renderListPage({
      before: (api) =>
        api.failNext(
          'list',
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

  it('LHL-15 phản hồi 200 sai hình dạng (thiếu số đếm) ⇒ câu chung kèm `Thử lại`, trang không trắng và không vẽ dữ liệu dở', async () => {
    renderListPage({
      before: (api) =>
        api.failNext('list', () =>
          jsonResponse({ items: [], total: 0, page: 1, pageSize: 20 }),
        ),
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      GENERIC_ERROR_MESSAGE,
    );
    expect(retryButton()).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
    expect(
      screen.getByRole('heading', { name: LIST_TEXT.title }),
    ).toBeInTheDocument();
  });
});

describe('lỗi sau khi đã có dữ liệu', () => {
  it('LHL-08 đổi bộ lọc mà yêu cầu thất bại ⇒ hiện lỗi (không giữ bảng cũ che lỗi); `Thử lại` gửi lại ĐÚNG truy vấn của bộ lọc đó', async () => {
    const { api } = renderListPage({
      before: (fake) => {
        fake.appointments = makeAppointments(12);
      },
    });
    await loaded();

    api.failNext('list', () => apiErrorResponse(500, 'LOI_HE_THONG'));
    fireEvent.click(tab(/^Hoàn thành/));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      GENERIC_ERROR_MESSAGE,
    );
    expect(screen.queryByRole('table')).toBeNull();

    fireEvent.click(retryButton()!);
    await waitFor(() => expect(rowCodes()).toHaveLength(2));
    const queries = listQueries(api);
    expect(queries.at(-1)).toEqual({ page: '1', trangThai: 'HoanThanh' });
    expect(queries.at(-2)).toEqual(queries.at(-1));
    expect(lastListQuery(api)).toEqual({ page: '1', trangThai: 'HoanThanh' });
  });
});
