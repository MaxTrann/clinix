import { afterEach, describe, expect, it, vi } from 'vitest';
import { setApiAuthHooks } from '../../../../../shared/api/auth-hooks';
import { UnexpectedResponseError } from '../../../../../shared/api/errors';
import { parseOperationsAppointmentPage } from '../../common/operations-appointment';
import {
  jsonResponse,
  type FakeRequest,
} from '../../../testing/fake-appointment-list-api';
import { makeAdminAppointment } from '../../../testing/fake-admin-api';
import {
  buildAdminListQuery,
  getAdminAppointments,
} from './admin-appointments-api';

// booking F10: lời gọi và bộ đọc `GET /admin/appointments`. Mã AQL là [đề xuất] (PLAN booking mục 7.41). Hợp đồng đọc từ mã backend B4 (TRACKING 3.33.1): `{ items, total, page, pageSize }`, mỗi dòng
// đúng mười một khoá.
afterEach(() => {
  vi.unstubAllGlobals();
  setApiAuthHooks(null);
});

describe('buildAdminListQuery', () => {
  it('AQL-01 chỉ có `page` khi chưa lọc gì; giá trị rỗng hay chưa chọn không bao giờ được gửi (`q=` rỗng là 400)', () => {
    expect(buildAdminListQuery({ page: 1 })).toEqual({ page: 1 });
    expect(
      buildAdminListQuery({
        page: 3,
        trangThai: undefined,
        chiNhanhId: '',
        chuyenKhoaId: '',
        bacSiId: '',
        dichVuKhamId: '',
        tuNgay: '',
        denNgay: '',
        q: '',
      }),
    ).toEqual({ page: 3 });
  });

  it('AQL-05 đủ khoá B4 nhận, giá trị giữ NGUYÊN chuỗi (id lớn hơn 2^53, ngày); KHÔNG `pageSize`, `thanhToan`', () => {
    const query = buildAdminListQuery({
      page: 2,
      trangThai: 'DaHuy',
      chiNhanhId: '3',
      chuyenKhoaId: '2',
      bacSiId: '9007199254740993',
      dichVuKhamId: '31',
      tuNgay: '2026-10-01',
      denNgay: '2026-10-31',
      q: 'Nguyễn',
    });
    expect(query).toEqual({
      page: 2,
      trangThai: 'DaHuy',
      chiNhanhId: '3',
      chuyenKhoaId: '2',
      bacSiId: '9007199254740993',
      dichVuKhamId: '31',
      tuNgay: '2026-10-01',
      denNgay: '2026-10-31',
      q: 'Nguyễn',
    });
    expect(Object.keys(query)).not.toContain('pageSize');
    expect(Object.keys(query)).not.toContain('thanhToan');
  });
});

describe('parseOperationsAppointmentPage (dùng chung với Lễ tân)', () => {
  it('AQL-11 mỗi dòng đúng mười một khoá, thân đúng bốn khoá; khoá thừa (`demTheoTrangThai`, `email`, `thanhToan`) không lọt ra', () => {
    const row = {
      ...makeAdminAppointment(),
      email: 'lo.ra@example.com',
      thanhToan: { da: '0' },
    };
    const page = parseOperationsAppointmentPage({
      items: [row],
      total: 1,
      page: 1,
      pageSize: 20,
      demTheoTrangThai: { DaXacNhan: 1 },
    });
    expect(Object.keys(page).sort()).toEqual([
      'items',
      'page',
      'pageSize',
      'total',
    ]);
    expect(Object.keys(page.items[0]).sort()).toEqual(
      [
        'bacSi',
        'chiNhanh',
        'chuyenKhoa',
        'dichVu',
        'giaSnapshot',
        'maLichHen',
        'nguoiDat',
        'nguoiKham',
        'thoiGian',
        'tienCoc',
        'trangThai',
      ].sort(),
    );
  });

  it('AQL-11 thiếu từng khoá, sai kiểu, tiền sai dạng, `total` không phải số nguyên ⇒ phản hồi không dùng được', () => {
    const good = makeAdminAppointment() as unknown as Record<string, unknown>;
    for (const key of Object.keys(good)) {
      const { [key]: _removed, ...without } = good;
      void _removed;
      expect(
        () =>
          parseOperationsAppointmentPage({
            items: [without],
            total: 1,
            page: 1,
            pageSize: 20,
          }),
        key,
      ).toThrow(UnexpectedResponseError);
    }
    for (const bad of [
      { ...good, giaSnapshot: '300000,00' },
      { ...good, nguoiKham: { hoTen: 'A', laBanThan: 'true' } },
      { ...good, thoiGian: 'không phải ngày' },
      { ...good, nguoiDat: null },
    ]) {
      expect(() =>
        parseOperationsAppointmentPage({
          items: [bad],
          total: 1,
          page: 1,
          pageSize: 20,
        }),
      ).toThrow(UnexpectedResponseError);
    }
    expect(() =>
      parseOperationsAppointmentPage({
        items: [],
        total: 1.5,
        page: 1,
        pageSize: 20,
      }),
    ).toThrow(UnexpectedResponseError);
    expect(() => parseOperationsAppointmentPage('<html>')).toThrow(
      UnexpectedResponseError,
    );
  });

  it('AQL-11 mã trạng thái lạ (kể cả `DaDoiLich`) vẫn qua bộ đọc (giao diện hiện "Chưa xác định", không vỡ trang)', () => {
    const page = parseOperationsAppointmentPage({
      items: [makeAdminAppointment({ trangThai: 'DaDoiLich' })],
      total: 1,
      page: 1,
      pageSize: 20,
    });
    expect(page.items[0].trangThai).toBe('DaDoiLich');
  });
});

describe('getAdminAppointments', () => {
  it('AQL-01 gọi `GET /api/admin/appointments` GẮN token, query đúng; trả trang đã kiểm hình dạng', async () => {
    setApiAuthHooks({
      getAccessToken: () => 'token-gia',
      recoverFromUnauthorized: async () => false,
    });
    const seen: FakeRequest[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input), 'http://localhost');
        seen.push({
          method: init?.method ?? 'GET',
          path: url.pathname,
          query: Object.fromEntries(url.searchParams),
          hasToken: new Headers(init?.headers).has('Authorization'),
        });
        return jsonResponse({
          items: [makeAdminAppointment()],
          total: 1,
          page: 1,
          pageSize: 20,
        });
      }),
    );
    const page = await getAdminAppointments({ page: 1, chiNhanhId: '3' });
    expect(page.total).toBe(1);
    expect(seen).toEqual([
      {
        method: 'GET',
        path: '/api/admin/appointments',
        query: { page: '1', chiNhanhId: '3' },
        hasToken: true,
      },
    ]);
  });
});
