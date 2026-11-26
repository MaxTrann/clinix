import { afterEach, describe, expect, it, vi } from 'vitest';
import { setApiAuthHooks } from '../../../../../shared/api/auth-hooks';
import {
  ApiError,
  NetworkError,
  UnexpectedResponseError,
} from '../../../../../shared/api/errors';
import { createFakeAdminRescheduleRequestsApi } from '../../../testing/fake-admin-reschedule-requests-api';
import { jsonResponse } from '../../../testing/fake-appointment-list-api';
import { fakeRecord } from '../../../testing/fake-reschedule-requests-api';
import { installFakeFetch } from '../../../testing/install-fake-fetch';
import {
  makeRequestDetail,
  makeRequestRow,
} from '../../../testing/reschedule-requests-fixtures';
import type { RequestQuery } from '../../common/reschedule-requests/request-types';
import {
  ADMIN_REQUESTS_BASE,
  adminRequestsApi,
  buildAdminRequestsQuery,
  createAdminRequestsApi,
} from './admin-requests-api';
import { adminRequestHandlers } from './admin-requests-handle-api';

// reschedule F5, WXD-104…WXD-109 (`[đề xuất]`): gọi và đọc API của Quản trị viên (đúng đường dẫn `admin/…`, `chiNhanhId` chỉ khi có chọn, bộ đọc nghiêm dùng chung, lỗi theo `maLoi`). KHÔNG gọi backend thật.
const QUERY: RequestQuery = {
  tab: 'cho-duyet',
  page: 1,
  bacSiId: '',
  q: '',
};
const LIST = '/admin/reschedule-requests';

function setUp() {
  const api = createFakeAdminRescheduleRequestsApi(
    async () => new Response('Không có trong API giả', { status: 404 }),
  );
  api.records = [fakeRecord(makeRequestDetail({ yeuCauId: '101' }))];
  installFakeFetch(api.fetch);
  return api;
}

const fetchedUrls = () =>
  vi.mocked(fetch).mock.calls.map(([input]) => String(input));

afterEach(() => {
  vi.unstubAllGlobals();
  setApiAuthHooks(null);
});

describe('API đọc của Quản trị viên', () => {
  it('WXD-104 danh sách gọi `GET /api/admin/reschedule-requests` có `trangThai` và `page`; `bacSiId`, `q` chỉ khi có; gắn Authorization', async () => {
    const api = setUp();
    expect(ADMIN_REQUESTS_BASE).toBe('admin/reschedule-requests');
    await adminRequestsApi.list(QUERY);
    await adminRequestsApi.list({
      tab: 'da-xu-ly',
      page: 3,
      bacSiId: '5',
      q: 'CLX-20261120-7K3M9',
    });
    expect(api.listQueries()).toEqual([
      { trangThai: 'ChoDuyet', page: '1' },
      {
        trangThai: 'DaDuyet,TuChoi',
        page: '3',
        bacSiId: '5',
        q: 'CLX-20261120-7K3M9',
      },
    ]);
    expect(api.callsTo(LIST).map((call) => call.hasToken)).toEqual([
      true,
      true,
    ]);
    expect(
      fetchedUrls().every((url) =>
        url.startsWith('/api/admin/reschedule-requests'),
      ),
    ).toBe(true);
  });

  it('WXD-105 `chiNhanhId` chỉ gửi khi chuỗi khác rỗng; id BIGINT lớn hơn 2^53 giữ nguyên chuỗi', async () => {
    const api = setUp();
    await createAdminRequestsApi('9007199254740993').list(QUERY);
    await createAdminRequestsApi('').list(QUERY);
    await createAdminRequestsApi().list(QUERY);
    expect(api.listQueries()).toEqual([
      {
        trangThai: 'ChoDuyet',
        page: '1',
        chiNhanhId: '9007199254740993',
      },
      { trangThai: 'ChoDuyet', page: '1' },
      { trangThai: 'ChoDuyet', page: '1' },
    ]);
    // ca âm: khoá VẮNG hẳn, không phải chuỗi rỗng (`chiNhanhId=` là 400 ở máy chủ)
    expect('chiNhanhId' in buildAdminRequestsQuery(QUERY, '')).toBe(false);
  });

  it('WXD-106 chi tiết gọi đường dẫn của Quản trị viên, mã hoá id và KHÔNG bao giờ có `chiNhanhId`', async () => {
    const api = setUp();
    await expect(adminRequestsApi.get('101')).resolves.toMatchObject({
      yeuCauId: '101',
    });
    await createAdminRequestsApi('3').get('101');
    expect(api.callsTo(`${LIST}/101`).map((call) => call.query)).toEqual([
      {},
      {},
    ]);
    // ca âm: ký tự đặc biệt trong id không thoát khỏi đoạn đường
    await expect(adminRequestsApi.get('a/b?c')).rejects.toBeInstanceOf(
      ApiError,
    );
    expect(fetchedUrls().at(-1)).toBe(
      '/api/admin/reschedule-requests/a%2Fb%3Fc',
    );
  });
});

describe('API ghi của Quản trị viên', () => {
  it('WXD-107 duyệt và từ chối: `POST …/admin/…/:id/approve|reject`, thân đúng `{ ghiChu }`, có token, không tham số, kết quả đọc bằng bộ đọc chung', async () => {
    const api = setUp();
    api.records.push(fakeRecord(makeRequestDetail({ yeuCauId: '102' })));

    await expect(
      adminRequestHandlers.approve('101', { ghiChu: 'Đồng ý.' }),
    ).resolves.toMatchObject({
      lichHenMoi: { trangThai: 'DaXacNhan' },
    });
    await expect(
      adminRequestHandlers.reject('102', { ghiChu: 'Không đổi được.' }),
    ).resolves.toEqual({ thoiGianMayChu: api.inner.serverTime });

    expect(api.writes()).toEqual([
      {
        method: 'POST',
        path: `${LIST}/101/approve`,
        query: {},
        hasToken: true,
        body: { ghiChu: 'Đồng ý.' },
      },
      {
        method: 'POST',
        path: `${LIST}/102/reject`,
        query: {},
        hasToken: true,
        body: { ghiChu: 'Không đổi được.' },
      },
    ]);
  });
});

describe('bộ đọc nghiêm và lỗi qua API của Quản trị viên', () => {
  it('WXD-108 ca âm: id là số, thiếu khoá, trạng thái lạ ở danh sách, chi tiết và 200 của ghi ⇒ `UnexpectedResponseError`', async () => {
    const api = setUp();
    const row = makeRequestRow();
    const page = (item: unknown) => ({
      items: [item],
      total: 1,
      page: 1,
      pageSize: 20,
    });
    for (const bad of [
      page({ ...row, yeuCauId: 101 }),
      page({ ...row, chiNhanh: undefined }),
      page({ ...row, trangThai: 'Khac' }),
      { items: [row] },
    ]) {
      api.inner.listBody = bad;
      await expect(adminRequestsApi.list(QUERY)).rejects.toBeInstanceOf(
        UnexpectedResponseError,
      );
    }

    api.inner.detailBodies['101'] = {
      ...makeRequestDetail(),
      coTheDuyet: undefined,
    };
    await expect(adminRequestsApi.get('101')).rejects.toBeInstanceOf(
      UnexpectedResponseError,
    );

    api.inner.failNextWrite('approve', () =>
      jsonResponse({ yeuCau: { trangThai: 'TuChoi' } }),
    );
    await expect(
      adminRequestHandlers.approve('101', { ghiChu: 'a' }),
    ).rejects.toBeInstanceOf(UnexpectedResponseError);
    api.inner.failNextWrite('reject', () => jsonResponse({}));
    await expect(
      adminRequestHandlers.reject('101', { ghiChu: 'a' }),
    ).rejects.toBeInstanceOf(UnexpectedResponseError);
  });

  it('WXD-109 lỗi HTTP ra `ApiError` đúng `maLoi`; đứt mạng ra `NetworkError`', async () => {
    const api = setUp();
    const cases: [number, string][] = [
      [400, 'DU_LIEU_KHONG_HOP_LE'],
      [401, 'CHUA_DANG_NHAP'],
      [403, 'KHONG_DU_QUYEN'],
      [404, 'KHONG_TIM_THAY'],
      [409, 'YEU_CAU_DA_XU_LY'],
      [500, 'LOI_HE_THONG'],
    ];
    for (const [status, maLoi] of cases) {
      api.inner.failNext('list', () =>
        jsonResponse({ maLoi, thongBao: 'giả' }, status),
      );
      await expect(adminRequestsApi.list(QUERY)).rejects.toMatchObject({
        status,
        maLoi,
      });
    }
    api.inner.failNext('detail', () =>
      Promise.reject(new TypeError('offline')),
    );
    await expect(adminRequestsApi.get('101')).rejects.toBeInstanceOf(
      NetworkError,
    );
    // 404 của đường GHI dùng mã khác với đường đọc (B8 `KHONG_TIM_THAY`, B9 `YEU_CAU_DOI_LICH_KHONG_TON_TAI`)
    await expect(
      adminRequestHandlers.approve('999', { ghiChu: 'a' }),
    ).rejects.toMatchObject({
      status: 404,
      maLoi: 'YEU_CAU_DOI_LICH_KHONG_TON_TAI',
    });
    await expect(adminRequestsApi.get('999')).rejects.toMatchObject({
      status: 404,
      maLoi: 'KHONG_TIM_THAY',
    });
  });
});
