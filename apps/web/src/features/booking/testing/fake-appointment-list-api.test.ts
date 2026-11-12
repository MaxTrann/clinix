import { afterEach, describe, expect, it, vi } from 'vitest';
import { setApiAuthHooks } from '../../../shared/api/auth-hooks';
import { getPatientAppointments } from '../appointments/patient/api/patient-appointments-api';
import {
  apiErrorResponse,
  createFakeAppointmentListApi,
  makeAppointment,
  makeAppointments,
} from './fake-appointment-list-api';

// booking F1: hạ tầng test (không có mã PLAN). API giả phải đúng như B1 ở những chỗ test của trang dựa vào, nếu không test của trang đúng
// mà thật sai: số đếm áp mọi bộ lọc TRỪ trạng thái, cắt trang, trang vượt cuối, và chỉ trả lời bốn đường dẫn GET.
function setup() {
  const delegate = vi.fn(async () => new Response('delegate', { status: 404 }));
  const api = createFakeAppointmentListApi(delegate);
  vi.stubGlobal('fetch', api.fetch);
  return { api, delegate };
}

describe('fake-appointment-list-api', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setApiAuthHooks(null);
  });

  it('cắt trang theo `page` và `api.pageSize`, `total` là số sau khi lọc, trang vượt cuối ⇒ rỗng mà `total` vẫn đúng', async () => {
    const { api } = setup();
    api.appointments = makeAppointments(12);
    api.pageSize = 5;

    const first = await getPatientAppointments({ page: 1 });
    expect(first.items.map((item) => item.maLichHen)).toEqual(
      makeAppointments(12)
        .slice(0, 5)
        .map((item) => item.maLichHen),
    );
    expect(first).toMatchObject({ total: 12, page: 1, pageSize: 5 });

    const third = await getPatientAppointments({ page: 3 });
    expect(third.items).toHaveLength(2);

    const beyond = await getPatientAppointments({ page: 9 });
    expect(beyond.items).toEqual([]);
    expect(beyond).toMatchObject({ total: 12, page: 9 });
  });

  it('`demTheoTrangThai` áp bộ lọc `q` nhưng KHÔNG áp `trangThai`; `total` và `items` áp cả hai', async () => {
    const { api } = setup();
    api.appointments = [
      makeAppointment({ maLichHen: 'CP1', trangThai: 'DaXacNhan' }),
      makeAppointment({ maLichHen: 'CP2', trangThai: 'HoanThanh' }),
      makeAppointment({
        maLichHen: 'CP3',
        trangThai: 'HoanThanh',
        bacSi: 'Lê Thảo Vy',
      }),
    ];

    const byStatus = await getPatientAppointments({
      page: 1,
      trangThai: 'HoanThanh',
    });
    expect(byStatus.total).toBe(2);
    expect(byStatus.demTheoTrangThai).toMatchObject({
      DaXacNhan: 1,
      HoanThanh: 2,
    });

    const byKeyword = await getPatientAppointments({
      page: 1,
      trangThai: 'HoanThanh',
      q: 'thảo vy',
    });
    expect(byKeyword.items.map((item) => item.maLichHen)).toEqual(['CP3']);
    expect(byKeyword.demTheoTrangThai).toMatchObject({
      DaXacNhan: 0,
      HoanThanh: 1,
    });
  });

  it('ghi lại query và việc có gắn Authorization; bộ lọc ngoài trạng thái và `q` chỉ được ghi, không lọc', async () => {
    const { api } = setup();
    api.appointments = makeAppointments(3);
    setApiAuthHooks({
      getAccessToken: () => 'token-gia',
      recoverFromUnauthorized: async () => false,
    });
    const page = await getPatientAppointments({
      page: 1,
      bacSiId: '99',
      tuNgay: '2026-10-01',
    });

    expect(page.total).toBe(3);
    expect(api.callsTo('/patient/appointments')).toEqual([
      {
        method: 'GET',
        path: '/patient/appointments',
        query: { page: '1', bacSiId: '99', tuNgay: '2026-10-01' },
        hasToken: true,
      },
    ]);
    expect(api.writes()).toEqual([]);
  });

  it('`failNext` chỉ áp cho MỘT lần gọi kế tiếp của đúng đường dẫn; mọi đường dẫn khác chuyển cho `delegate`', async () => {
    const { api, delegate } = setup();
    api.failNext('list', () => apiErrorResponse(403, 'KHONG_DU_QUYEN'));

    await expect(getPatientAppointments({ page: 1 })).rejects.toMatchObject({
      maLoi: 'KHONG_DU_QUYEN',
    });
    await expect(getPatientAppointments({ page: 1 })).resolves.toMatchObject({
      total: 1,
    });

    await fetch('/api/patient/appointments/CP20261020001');
    await fetch('/api/patient/appointments', { method: 'POST' });
    expect(delegate).toHaveBeenCalledTimes(2);
    expect(api.writes()).toHaveLength(1);
  });

  it('ba đường dẫn còn lại trả thân do test đặt', async () => {
    const { api } = setup();
    api.relatives = { items: [{ ghi: 'chu' }] };
    api.specialties = { x: 1 };
    api.doctors = { y: 2 };
    const body = async (path: string) =>
      (await fetch(`/api${path}`)).json() as Promise<unknown>;

    expect(await body('/patient/relatives')).toEqual({
      items: [{ ghi: 'chu' }],
    });
    expect(await body('/public/specialties?pageSize=100')).toEqual({ x: 1 });
    expect(await body('/public/doctors?pageSize=100')).toEqual({ y: 2 });
  });
});
