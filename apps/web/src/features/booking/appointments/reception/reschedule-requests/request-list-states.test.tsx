import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import {
  GENERIC_ERROR_MESSAGE,
  NETWORK_ERROR_MESSAGE,
  TIMEOUT_ERROR_MESSAGE,
} from '../../../../../shared/api/error-message';
import { NetworkError, TimeoutError } from '../../../../../shared/api/errors';
import {
  apiErrorResponse,
  jsonResponse,
} from '../../../testing/fake-appointment-list-api';
import {
  createFakeRescheduleRequestsApi,
  fakeRecord,
} from '../../../testing/fake-reschedule-requests-api';
import { installFakeFetch } from '../../../testing/install-fake-fetch';
import {
  makeHandledDetail,
  makeRequestDetail,
  makeRequestRows,
} from '../../../testing/reschedule-requests-fixtures';
import {
  cleanUpRequestsPage,
  currentUrl,
  listQueries,
  loaded,
  renderRequests,
  rowCodes,
  searchBox,
  submitSearch,
  tabButton,
  typeCode,
} from '../../../testing/reschedule-requests-harness';
import { RequestListView } from '../../common/reschedule-requests/request-list-view';
import { REQUEST_TEXT } from '../../common/reschedule-requests/request-text';
import type { RescheduleRequestsApi } from '../../common/reschedule-requests/request-types';

// reschedule F4: trạng thái đang tải, rỗng và lỗi của danh sách yêu cầu (WXD-04 theo PLAN reschedule 7.11; WXD-65 `[đề xuất]`). Câu chọn theo `maLoi`, KHÔNG theo mã HTTP (CODING_CONVENTION): mỗi nhánh có
// ca đối chứng cùng mã HTTP khác `maLoi`. Hết giờ (`TimeoutError`) chỉ sinh ra sau 15 giây thật của `request()`, nên ca hết giờ đưa `api` giả ném thẳng lỗi đó vào thành phần dùng chung.
afterEach(cleanUpRequestsPage);

const retryButton = () => screen.queryByRole('button', { name: 'Thử lại' });

describe('đang tải và rỗng', () => {
  it('WXD-04 lần tải đầu: "Đang tải yêu cầu đổi lịch..." (role status), h1 vẫn hiện; tải xong thì thay bằng bảng', async () => {
    // Cổng mở bằng tay: phản hồi bị giữ cho tới khi test gọi `release`
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    renderRequests({
      before: (api) => {
        api.failNext('list', async () => {
          await gate;
          return jsonResponse({ items: [], total: 0, page: 1, pageSize: 20 });
        });
      },
    });
    // Tìm theo chữ (thẻ `<output>` của `LocationProbe` cũng có vai trò ngầm `status`)
    expect(await screen.findByText(REQUEST_TEXT.loading)).toHaveAttribute(
      'role',
      'status',
    );
    expect(
      screen.getByRole('heading', { name: REQUEST_TEXT.title }),
    ).toBeInTheDocument();
    release();
    expect(
      await screen.findByText(REQUEST_TEXT.emptyWaiting),
    ).toBeInTheDocument();
    expect(screen.queryByText(REQUEST_TEXT.loading)).toBeNull();
  });

  it('WXD-04 rỗng có câu RIÊNG theo tab: Chờ duyệt "không có yêu cầu nào đang chờ", Đã xử lý "chưa có yêu cầu nào được xử lý"; chưa có bộ lọc thì KHÔNG có "Xóa lọc"', async () => {
    renderRequests();
    expect(
      await screen.findByText(REQUEST_TEXT.emptyWaiting),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: REQUEST_TEXT.clearFilters }),
    ).toBeNull();
    expect(screen.getByText('0 yêu cầu')).toBeInTheDocument();

    fireEvent.click(tabButton('Đã xử lý'));
    expect(
      await screen.findByText(REQUEST_TEXT.emptyHandled),
    ).toBeInTheDocument();
    expect(screen.queryByText(REQUEST_TEXT.emptyWaiting)).toBeNull();
  });

  it('WXD-04 có yêu cầu ở tab này mà tab kia rỗng không làm tab kia hiện dòng của tab này', async () => {
    renderRequests({
      before: (api) => {
        api.records = [fakeRecord(makeRequestDetail({ yeuCauId: '1' }))];
      },
    });
    await loaded();
    fireEvent.click(tabButton('Đã xử lý'));
    expect(
      await screen.findByText(REQUEST_TEXT.emptyHandled),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: REQUEST_TEXT.resultsRegion }),
    ).toBeNull();
  });
});

describe('lỗi theo maLoi (lần tải đầu)', () => {
  it('WXD-04 `CHUA_DANG_NHAP` ⇒ câu phiên hết hạn, KHÔNG có "Thử lại"; h1, hai tab và ô tìm vẫn còn', async () => {
    renderRequests({
      before: (api) =>
        api.failNext('list', () => apiErrorResponse(401, 'CHUA_DANG_NHAP')),
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      REQUEST_TEXT.sessionExpired,
    );
    expect(retryButton()).toBeNull();
    expect(
      screen.getByRole('heading', { name: REQUEST_TEXT.title }),
    ).toBeInTheDocument();
    expect(tabButton('Chờ duyệt')).toBeInTheDocument();
    expect(searchBox()).toBeInTheDocument();
  });

  it('WXD-04 `KHONG_DU_QUYEN` ⇒ câu không đủ quyền, KHÔNG có "Thử lại"; cùng `maLoi` mà HTTP 500 vẫn ra câu này (theo `maLoi`)', async () => {
    for (const status of [403, 500]) {
      const { unmount } = renderRequests({
        before: (api) =>
          api.failNext('list', () =>
            apiErrorResponse(status, 'KHONG_DU_QUYEN'),
          ),
      });
      expect(await screen.findByRole('alert')).toHaveTextContent(
        REQUEST_TEXT.forbidden,
      );
      expect(retryButton()).toBeNull();
      unmount();
      cleanUpRequestsPage();
    }
  });

  it.each([401, 403, 404, 409, 400, 500])(
    'WXD-04 HTTP %i với `maLoi` lạ ⇒ câu chung kèm "Thử lại" (không theo mã HTTP)',
    async (status) => {
      renderRequests({
        before: (api) =>
          api.failNext('list', () => apiErrorResponse(status, 'MA_LOI_LA')),
      });
      expect(await screen.findByRole('alert')).toHaveTextContent(
        GENERIC_ERROR_MESSAGE,
      );
      expect(retryButton()).toBeInTheDocument();
      expect(screen.queryByText(REQUEST_TEXT.forbidden)).toBeNull();
      expect(screen.queryByText(REQUEST_TEXT.sessionExpired)).toBeNull();
    },
  );

  it('WXD-04 mạng đứt ⇒ câu mạng kèm "Thử lại"; có mạng lại thì "Thử lại" gọi lại ĐÚNG truy vấn và hiện bảng', async () => {
    const { api } = renderRequests({
      before: (fake) => {
        fake.records = makeRequestRows(3).map((row) =>
          fakeRecord(makeRequestDetail(row)),
        );
        fake.failNext('list', () => {
          throw new TypeError('Failed to fetch');
        });
      },
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      NETWORK_ERROR_MESSAGE,
    );
    const failed = listQueries(api)[0];
    fireEvent.click(retryButton()!);
    await loaded();
    expect(rowCodes()).toHaveLength(3);
    expect(listQueries(api)).toHaveLength(2);
    expect(listQueries(api)[1]).toEqual(failed);
    expect(retryButton()).toBeNull();
  });

  it.each([
    ['NetworkError', () => new NetworkError(), NETWORK_ERROR_MESSAGE],
    [
      'TimeoutError (hết 15 giây)',
      () => new TimeoutError(),
      TIMEOUT_ERROR_MESSAGE,
    ],
  ])(
    'WXD-04 %s ở thành phần dùng chung ⇒ câu riêng kèm "Thử lại"; bấm lại thì tải lại',
    async (_name, makeError, message) => {
      installFakeFetch(
        createFakeRescheduleRequestsApi(
          async () => new Response('', { status: 404 }),
        ).fetch,
      );
      let calls = 0;
      const api: RescheduleRequestsApi = {
        list: () => {
          calls += 1;
          return calls === 1
            ? Promise.reject(makeError())
            : Promise.resolve({ items: [], total: 0, page: 1, pageSize: 20 });
        },
        get: () => Promise.reject(new Error('không dùng')),
      };
      render(
        <MemoryRouter>
          <RequestListView api={api} detailPath={(id) => `/x/${id}`} />
        </MemoryRouter>,
      );
      expect(await screen.findByRole('alert')).toHaveTextContent(message);
      fireEvent.click(retryButton()!);
      expect(
        await screen.findByText(REQUEST_TEXT.emptyWaiting),
      ).toBeInTheDocument();
      expect(calls).toBe(2);
    },
  );

  it('WXD-04 phản hồi 200 sai hình dạng (HTML, thiếu khoá của dòng, thiếu `total`) hay 502 ⇒ câu chung kèm "Thử lại", trang không trắng', async () => {
    const bads = [
      () => new Response('<html>bad gateway</html>', { status: 200 }),
      () =>
        jsonResponse({
          items: [{ maLichHen: 'CLX-20261120-7K3M9' }],
          total: 1,
          page: 1,
          pageSize: 20,
        }),
      () => jsonResponse({ items: [], page: 1, pageSize: 20 }),
      () => new Response('<html>bad gateway</html>', { status: 502 }),
    ];
    for (const bad of bads) {
      const { unmount } = renderRequests({
        before: (api) => api.failNext('list', bad),
      });
      expect(await screen.findByRole('alert')).toHaveTextContent(
        GENERIC_ERROR_MESSAGE,
      );
      expect(retryButton()).toBeInTheDocument();
      expect(
        screen.getByRole('heading', { name: REQUEST_TEXT.title }),
      ).toBeInTheDocument();
      unmount();
      cleanUpRequestsPage();
    }
  });

  it('WXD-04 MỘT dòng hỏng làm cả trang không dùng được: không vẽ các dòng còn lại (không dữ liệu dở)', async () => {
    renderRequests({
      before: (api) => {
        const good = makeRequestRows(2);
        api.listBody = {
          items: [good[0], { ...good[1], soLanDaTuDoi: '2' }],
          total: 2,
          page: 1,
          pageSize: 20,
        };
      },
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      GENERIC_ERROR_MESSAGE,
    );
    expect(
      screen.queryByRole('region', { name: REQUEST_TEXT.resultsRegion }),
    ).toBeNull();
  });

  it('WXD-04 lỗi khi đổi tab (sau khi đã có bảng) ⇒ thay bảng bằng lỗi theo `maLoi`; "Thử lại" về lại bảng', async () => {
    const { api } = renderRequests({
      before: (fake) => {
        fake.records = [
          fakeRecord(makeHandledDetail('DaDuyet', { yeuCauId: '1' })),
          fakeRecord(
            makeRequestDetail({
              yeuCauId: '2',
              maLichHen: 'CLX-20261121-AAAAA',
            }),
          ),
        ];
      },
    });
    await loaded();
    api.failNext('list', () => apiErrorResponse(500, 'MA_LOI_LA'));
    fireEvent.click(tabButton('Đã xử lý'));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      GENERIC_ERROR_MESSAGE,
    );
    fireEvent.click(retryButton()!);
    await loaded();
    expect(rowCodes()).toHaveLength(1);
  });
});

describe('máy chủ từ chối mã lịch hẹn', () => {
  it('WXD-65 400 `MA_LICH_HEN_KHONG_HOP_LE` (lưới an toàn khi web và máy chủ lệch nhau) ⇒ lỗi cạnh ô tìm, KHÔNG khối lỗi chung và KHÔNG "Thử lại" vô ích', async () => {
    renderRequests({
      before: (api) =>
        api.failNext('list', () =>
          apiErrorResponse(400, 'DU_LIEU_KHONG_HOP_LE', [
            { truong: 'q', ma: 'MA_LICH_HEN_KHONG_HOP_LE' },
          ]),
        ),
    });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(REQUEST_TEXT.codeInvalid);
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(retryButton()).toBeNull();
    expect(searchBox()).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByText(GENERIC_ERROR_MESSAGE)).toBeNull();
  });

  it('WXD-65 cùng 400 `DU_LIEU_KHONG_HOP_LE` mà lỗi ở TRƯỜNG khác ⇒ câu chung kèm "Thử lại" (đối chứng)', async () => {
    renderRequests({
      before: (api) =>
        api.failNext('list', () =>
          apiErrorResponse(400, 'DU_LIEU_KHONG_HOP_LE', [
            { truong: 'page', ma: 'TRUONG_KHONG_HOP_LE' },
          ]),
        ),
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      GENERIC_ERROR_MESSAGE,
    );
    expect(retryButton()).toBeInTheDocument();
  });

  it('WXD-65 sau lỗi mã, gõ mã đúng rồi "Tìm" thì bảng về lại (lỗi biến mất)', async () => {
    const { api } = renderRequests({
      before: (fake) => {
        fake.records = [fakeRecord(makeRequestDetail({ yeuCauId: '1' }))];
        fake.failNext('list', () =>
          apiErrorResponse(400, 'DU_LIEU_KHONG_HOP_LE', [
            { truong: 'q', ma: 'MA_LICH_HEN_KHONG_HOP_LE' },
          ]),
        );
      },
    });
    await screen.findByRole('alert');
    typeCode('CLX-20261120-7K3M9');
    submitSearch();
    await loaded();
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(listQueries(api).at(-1)).toMatchObject({ q: 'CLX-20261120-7K3M9' });
    expect(currentUrl()).toBe('/le-tan/yeu-cau-doi-lich?q=CLX-20261120-7K3M9');
  });
});
