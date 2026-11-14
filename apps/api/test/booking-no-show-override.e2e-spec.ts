import request from 'supertest';
import { vi } from 'vitest';
import { NoShowJob } from './../src/appointments/noshow/no-show.job.js';
import { BookingFixtures } from './../src/appointments/testing/booking-fixtures.js';
import { readAppointment } from './../src/appointments/testing/expiry-fixtures.js';
import { assertBookingInvariants } from './../src/appointments/testing/invariants.js';
import {
  expectedAudit,
  OVERRIDE_REASON,
  readAudit,
  scopeOf,
} from './../src/appointments/testing/override-world.js';
import {
  AFTER_ALL_WINDOWS,
  readNoShow,
  setNoShow,
  statusWorld,
} from './../src/appointments/testing/status-world.js';
import { T0 } from './../src/auth/testing/otp-int-helpers.js';
import {
  openRefreshHarness,
  type RefreshHarness,
} from './../src/auth/testing/refresh-http-helpers.js';
import { resetTables } from './../src/database/testing/test-database.js';

// Task B18 — NSO-11 (PLAN booking 7.46 `[đề xuất]`; TRACKING 3.40 B18-F): Quản trị viên khôi phục lịch qua route THẬT `POST /admin/appointments/:maLichHen/override-status`, rồi `NoShowJob` LẤY TỪ `AppModule` (không dựng tay) chạy:
// lịch đã khôi phục KHÔNG bị đánh Vắng mặt lại (TECH_DEBT 120), lịch chưa từng override vẫn bị đánh, và một lần override BỊ TỪ CHỐI (409) không làm lịch được miễn. AppModule + MySQL thật + configureApp như main.ts. `@Cron` của job tắt ở
// NODE_ENV=test nên job chỉ chạy khi test gọi `run(now)`; `now` truyền tường minh (đồng hồ giả chỉ giả `Date`, và token truy cập tạo SAU khi đặt giờ). Phần dịch vụ, SQL và đồng thời: src/appointments/noshow/*.int-spec.ts.
const CODE = 'CLX-20261110-CCC01';
const CODE_2 = 'CLX-20261110-CCC02';
const SLOW = 300_000;

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

/** Thế giới của override (`statusWorld`) cùng token của Quản trị viên Toàn hệ thống. */
async function world() {
  const w = await statusWorld(h.db, fx);
  const toan = (await h.sessions.create(scopeOf(w, 'Toan').accountId))
    .accessToken;
  return { ...w, toan };
}

const overrideTo = (code: string, accessToken: string, trangThai: string) =>
  request(h.app.getHttpServer())
    .post(`/admin/appointments/${code}/override-status`)
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ trangThai, lyDo: OVERRIDE_REASON });

describe('NSO-11 route override thật rồi NoShowJob của AppModule', () => {
  it(
    'khôi phục VangMat → DaXacNhan qua HTTP: job không đánh lại (so_lan_no_show giữ 1, một dòng nhật ký); lịch đối chứng chưa từng override vẫn bị đánh; lượt sau trống',
    async () => {
      const w = await world();
      await setNoShow(h.db, w.patientId, { soLan: 1, khoa: false });
      const restored = await w.booked('VangMat', 0, { maLichHen: CODE });
      const control = await w.booked('DaXacNhan', 1, {
        maLichHen: CODE_2,
        patientId: w.secondPatientId,
      });

      const res = await overrideTo(CODE, w.toan, 'DaXacNhan');
      expect(res.status).toBe(200);
      expect(res.body).toStrictEqual({
        maLichHen: CODE,
        trangThai: 'DaXacNhan',
      });

      const job = h.app.get(NoShowJob);
      // Giờ kết thúc ca sáng 10/11/2026: cả hai lịch ĐỀU đã quá hạn; TRƯỚC B18 lịch vừa khôi phục bị đánh lại cùng lượt này
      await expect(job.run(AFTER_ALL_WINDOWS)).resolves.toMatchObject({
        noShowed: 1,
        notConfirmed: 0,
        notDue: 0,
        failedBusy: 0,
        failedError: 0,
      });
      expect((await readAppointment(h.db, restored.lichHenId)).trangThai).toBe(
        'DaXacNhan',
      );
      expect((await readAppointment(h.db, control.lichHenId)).trangThai).toBe(
        'VangMat',
      );
      expect(await readNoShow(h.db, w.patientId)).toEqual({
        soLan: 1,
        khoa: false,
      });
      expect(await readNoShow(h.db, w.secondPatientId)).toEqual({
        soLan: 1,
        khoa: false,
      });
      expect(await readAudit(h.db)).toMatchObject([
        expectedAudit(w, 'Toan', restored.lichHenId, 'VangMat', 'DaXacNhan'),
      ]);
      await expect(job.run(AFTER_ALL_WINDOWS)).resolves.toMatchObject({
        noShowed: 0,
      });
      await assertBookingInvariants(h.db);
    },
    SLOW,
  );

  it(
    'override BỊ TỪ CHỐI qua HTTP (DaXacNhan → DaXacNhan: 409, không dòng nhật ký) không làm lịch được miễn: job vẫn đánh Vắng mặt lịch đó',
    async () => {
      const w = await world();
      const lich = await w.booked('DaXacNhan', 0, { maLichHen: CODE });

      const res = await overrideTo(CODE, w.toan, 'DaXacNhan');
      expect(res.status).toBe(409);
      expect(await readAudit(h.db)).toEqual([]);

      await expect(
        h.app.get(NoShowJob).run(AFTER_ALL_WINDOWS),
      ).resolves.toMatchObject({ noShowed: 1 });
      expect((await readAppointment(h.db, lich.lichHenId)).trangThai).toBe(
        'VangMat',
      );
      expect(await readNoShow(h.db, w.patientId)).toEqual({
        soLan: 1,
        khoa: false,
      });
      await assertBookingInvariants(h.db);
    },
    SLOW,
  );
});
