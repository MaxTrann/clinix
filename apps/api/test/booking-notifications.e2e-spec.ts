import request from 'supertest';
import { vi } from 'vitest';
import { BookingFixtures } from './../src/appointments/testing/booking-fixtures.js';
import { cancelWorld } from './../src/appointments/testing/cancel-world.js';
import { assertBookingInvariants } from './../src/appointments/testing/invariants.js';
import {
  readOutbox,
  readThongBao,
} from './../src/appointments/testing/notification-world.js';
import { T0 } from './../src/auth/testing/otp-int-helpers.js';
import {
  openRefreshHarness,
  type RefreshHarness,
} from './../src/auth/testing/refresh-http-helpers.js';
import { resetTables } from './../src/database/testing/test-database.js';
import { EmailOutboxJob } from './../src/appointments/notifications/email-outbox.job.js';

// Task B15 — thông báo và hộp thư đi qua HTTP THẬT: AppModule + MySQL thật + configureApp như main.ts (PLAN booking 5.12, 7.14, 7.43; TRACKING 3.37 B15-L). OBX-10 (TB-01, TB-08, DL-01): một lần huỷ của Bệnh nhân và một lần tạo
// lịch cọc 0đ qua route thật ra ĐÚNG một dòng `thong_bao` cho tài khoản đặt và MỘT dòng `email_thong_bao` ChoGui; KHÔNG có thư nào được gửi trong request (`MailService` của harness là `FakeMailService`, worker tắt ở NODE_ENV=test).
// Phần dịch vụ, UNIQUE và khoá: src/appointments/notifications/booking-notifier.int-spec.ts; worker: email-outbox.int-spec.ts.
const CODE = 'CLX-20261110-CCC01';

let h: RefreshHarness;
let fx: BookingFixtures;

beforeAll(async () => {
  h = await openRefreshHarness();
  fx = new BookingFixtures(h.db);
});

beforeEach(async () => {
  await resetTables(h.db);
  h.mail.reset();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

afterAll(async () => {
  await resetTables(h.db);
  await h.close();
});

const tokenOf = async (accountId: string) =>
  (await h.sessions.create(accountId)).accessToken;

describe('OBX-10 huỷ qua route thật: một thông báo, một email ChoGui, không thư nào gửi trong request', () => {
  it('POST /patient/appointments/:maLichHen/cancel: 200; đúng 1 dòng LichHenDaHuy cho Bệnh nhân đặt; đúng 1 dòng email_thong_bao ChoGui; MailService chưa được gọi; INV', async () => {
    const w = await cancelWorld(h.db, fx);
    await w.booked('DaXacNhan', 0, {
      maLichHen: CODE,
      hoSoNguoiThanId: w.relativeId,
    });

    const res = await request(h.app.getHttpServer())
      .post(`/patient/appointments/${CODE}/cancel`)
      .set('Authorization', `Bearer ${await tokenOf(w.patientId)}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body).toStrictEqual({
      maLichHen: CODE,
      trangThai: 'DaHuy',
      hoanCoc: null,
    });
    const rows = await readThongBao(h.db);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      taiKhoanId: w.patientId,
      loai: 'LichHenDaHuy',
      noiDung: `Lịch hẹn ${CODE} đã được hủy theo yêu cầu của bạn. Lịch hẹn này chưa phát sinh khoản thanh toán nên không có hoàn tiền.`,
    });
    expect(await readOutbox(h.db)).toEqual([
      expect.objectContaining({
        thongBaoId: rows[0]!.thongBaoId,
        trangThai: 'ChoGui',
        soLanThu: 0,
        daGuiLuc: null,
        loiCuoi: null,
      }),
    ]);
    // TB-08: không có đường nào tới SMTP trong test; thư là việc của worker (tắt ở NODE_ENV=test)
    expect(h.mail.attempts).toEqual([]);
    await assertBookingInvariants(h.db);
  });
});

describe('DL-01 tạo lịch cọc 0đ qua route thật: thông báo xác nhận có hàng thật, không có lý do khám', () => {
  it('POST /booking/appointments (hồ sơ người thân, có lý do khám): 201; 1 dòng LichHenDaXacNhan cho Bệnh nhân ĐẶT, chữ có mã lịch hẹn và KHÔNG có lý do khám; 1 dòng email ChoGui', async () => {
    const w = await fx.world();
    const patientId = w.patient.account.taiKhoanId;
    const lyDoKham = 'Đau ngực khó thở (lý do khám riêng tư)';

    const res = await request(h.app.getHttpServer())
      .post('/booking/appointments')
      .set('Authorization', `Bearer ${await tokenOf(patientId)}`)
      .send({
        khungGioId: w.slotIds[0],
        hoSoNguoiThanId: w.relativeId,
        lyDoKham,
      });

    expect(res.status).toBe(201);
    const maLichHen = (res.body as { maLichHen: string }).maLichHen;
    const rows = await readThongBao(h.db);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      taiKhoanId: patientId,
      loai: 'LichHenDaXacNhan',
    });
    expect(rows[0]!.noiDung).toContain(maLichHen);
    expect(rows[0]!.noiDung).not.toContain(lyDoKham);
    expect(await readOutbox(h.db)).toEqual([
      expect.objectContaining({
        thongBaoId: rows[0]!.thongBaoId,
        trangThai: 'ChoGui',
      }),
    ]);
    expect(h.mail.attempts).toEqual([]);
    await assertBookingInvariants(h.db);
  });
});

describe('OBX-10 worker trong app thật: job có mặt trong AppModule, thư đi qua MailService GIẢ của harness (TB-08)', () => {
  it('huỷ qua HTTP rồi chạy `EmailOutboxJob.run(now)` của app: đúng MỘT thư tới email của Bệnh nhân đặt (FakeMailService), dòng email DaGui; lượt sau không gửi lại', async () => {
    const w = await cancelWorld(h.db, fx);
    await w.booked('DaXacNhan', 0, { maLichHen: CODE });
    await request(h.app.getHttpServer())
      .post(`/patient/appointments/${CODE}/cancel`)
      .set('Authorization', `Bearer ${await tokenOf(w.patientId)}`)
      .send({})
      .expect(200);
    expect(h.mail.attempts).toEqual([]);

    const job = h.app.get(EmailOutboxJob);
    const now = new Date('2026-11-02T08:30:00+07:00');
    expect(await job.run(now)).toMatchObject({ sent: 1, failed: 0 });

    expect(h.mail.sent).toHaveLength(1);
    const [{ email }] = await h.db.query<{ email: string }[]>(
      'SELECT email FROM tai_khoan WHERE tai_khoan_id = ?',
      [w.patientId],
    );
    expect(h.mail.sent[0]).toMatchObject({
      to: email,
      subject: '[CLINIX] Lịch hẹn đã bị hủy',
    });
    expect(h.mail.sent[0]!.text).toContain(CODE);
    expect(await readOutbox(h.db)).toEqual([
      expect.objectContaining({ trangThai: 'DaGui', soLanThu: 1 }),
    ]);
    expect(await job.run(new Date(now.getTime() + 30 * 60_000))).toMatchObject({
      sent: 0,
    });
    expect(h.mail.attempts).toHaveLength(1);
  });
});
