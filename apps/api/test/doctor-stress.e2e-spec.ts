import 'reflect-metadata';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource, type EntityManager } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { KhungGio } from '../src/admin/entities/khung-gio.entity.js';
import { AdminFixtures } from '../src/admin/testing/admin-fixtures.js';
import { SessionService } from '../src/auth/session/session.service.js';
import { nowVN, todayVN } from '../src/common/time/time.js';
import { resetTables } from '../src/database/testing/test-database.js';
import { DoctorFixtures } from '../src/doctor/testing/doctor-fixtures.js';
import { assertInvariants } from '../src/doctor/testing/invariants.js';
import {
  formatCalendarDate,
  isoWeekdayOfEpochDay,
  parseCalendarDate,
} from '../src/scheduling/calendar-date.js';
import { LeaveReader } from '../src/scheduling/leave/leave.reader.js';

// Doctor DH-10 (B16) — stress qua HTTP thật + MySQL thật + booking thật: phân công, gỡ ca, tạo yêu cầu nghỉ, DUYỆT (kèm bước 2 huỷ lịch bằng `cancel` của booking) và ĐẶT LỊCH GIẢ
// (theo hợp đồng D4: giữ `bac_si` FOR SHARE, hỏi `LeaveReader`, rồi mới chèn lịch) đua nhau trên cùng hai bác sĩ và cùng vài ngày, ≥ 100 vòng. Mỗi vòng bắn đồng thời 8 thao tác.
// Mong đợi (PLAN 7 DH-10): bất biến IV-01…IV-04 đúng sau MỖI vòng; 0 deadlock còn sót = không có phản hồi 5xx nào (1213/1205 đã được thử lại bên trong và không lọt ra ngoài).
// Số ngẫu nhiên là bộ sinh có hạt giống cố định: lỗi nào cũng chạy lại được y như cũ.
const ROUNDS = 100;
const OPS_PER_ROUND = 8;

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('DH-10 stress: phân công + gỡ ca + tạo yêu cầu + duyệt + đặt lịch giả', () => {
  let app: NestExpressApplication;
  let db: DataSource;
  let fx: DoctorFixtures;
  let sessions: SessionService;

  const TODAY = todayVN(nowVN());
  const day = (offset: number) =>
    formatCalendarDate((parseCalendarDate(TODAY) as number) + offset);

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    db = app.get(DataSource);
    fx = new DoctorFixtures(db);
    sessions = app.get(SessionService);
  });
  beforeEach(async () => {
    await resetTables(db);
  });
  afterAll(async () => app?.close());

  const tokenOf = async (accountId: string) =>
    (await sessions.create(accountId)).accessToken;

  it(
    `${ROUNDS} vòng × ${OPS_PER_ROUND} thao tác đồng thời: IV-01…IV-04 đúng sau mỗi vòng, không phản hồi 5xx, mỗi loại thao tác đều thành công ít nhất một lần`,
    { timeout: 600_000 },
    async () => {
      const random = mulberry32(20261112);
      const pick = <T>(items: readonly T[]): T =>
        items[Math.floor(random() * items.length)] as T;

      const world = await fx.world();
      const second = await fx.admin.doctor(world.branch);
      const doctors = [world.doctor, second];
      const patient = await fx.admin.patient();
      const systemToken = await tokenOf(world.systemAdmin.account.taiKhoanId);
      const doctorTokens = await Promise.all(
        doctors.map((d) => tokenOf(d.account.taiKhoanId)),
      );
      // Vài ngày tới, cả hai ca, cả hai bác sĩ có sẵn (phân công/gỡ ca sẽ làm xáo trộn dần).
      const days = [3, 4, 5, 6, 7].map(day);
      for (const doctor of doctors)
        for (const ngay of days)
          for (const ca of ['CaSang', 'CaChieu'] as const)
            await fx.shiftWithSlots(doctor.profile, { ngay, ca });

      const send = (
        method: 'post' | 'delete',
        path: string,
        token: string,
        body?: object,
      ) => {
        const req = request(app.getHttpServer())[method](path).auth(token, {
          type: 'bearer',
        });
        return body ? req.send(body) : req;
      };

      /** Đặt lịch giả theo hợp đồng D4 (khoá bac_si FOR SHARE, hỏi nghỉ phép, chèn lịch và đánh dấu ô DaDat cùng giao dịch). Trả mã trạng thái giả. */
      const fakeBook = async (): Promise<number> => {
        const rows: {
          id: string;
          bacSiId: string;
          ngay: string;
          ca: string;
        }[] = await db.query(
          `SELECT CAST(k.khung_gio_id AS CHAR) AS id, CAST(l.bac_si_id AS CHAR) AS bacSiId,
                    DATE_FORMAT(l.ngay, '%Y-%m-%d') AS ngay, l.ca AS ca
               FROM khung_gio k JOIN lich_lam_viec l ON l.lich_lam_viec_id = k.lich_lam_viec_id
              WHERE k.trang_thai = 'ConTrong' AND l.ngay >= ?`,
          [day(1)],
        );
        const slot = rows.length === 0 ? undefined : pick(rows);
        if (slot === undefined) return 0;
        return db.transaction('READ COMMITTED', async (em: EntityManager) => {
          await em.query(
            `SELECT tai_khoan_id FROM bac_si WHERE tai_khoan_id = ? FOR SHARE`,
            [slot.bacSiId],
          );
          const blocking = await new LeaveReader().findBlockingLeave(em, {
            bacSiId: slot.bacSiId,
            ngay: slot.ngay,
            ca: slot.ca as 'CaSang' | 'CaChieu',
          });
          if (blocking !== null) return 409;
          const khungGio = await em
            .getRepository(KhungGio)
            .findOne({ where: { khungGioId: slot.id } });
          // Ô có thể đã bị gỡ ca giữa lúc chọn và lúc khoá: bỏ qua, không phải lỗi
          if (khungGio === null || khungGio.trangThai !== 'ConTrong')
            return 404;
          const doctor = doctors.find(
            (d) => d.account.taiKhoanId === slot.bacSiId,
          );
          if (doctor === undefined) return 404;
          await new AdminFixtures(em).appointment(
            doctor.profile,
            khungGio,
            patient.account.taiKhoanId,
          );
          await em.query(
            `UPDATE khung_gio SET trang_thai = 'DaDat' WHERE khung_gio_id = ?`,
            [slot.id],
          );
          return 201;
        });
      };

      const successes = new Map<string, number>();
      const failures: string[] = [];
      const record = (kind: string, status: number, maLoi?: string) => {
        if (status >= 500)
          failures.push(`${kind} ${status} ${maLoi ?? ''}`.trim());
        if (status >= 200 && status < 300)
          successes.set(kind, (successes.get(kind) ?? 0) + 1);
      };

      for (let round = 0; round < ROUNDS; round += 1) {
        const shiftIds: { id: string }[] = await db.query(
          `SELECT CAST(lich_lam_viec_id AS CHAR) AS id FROM lich_lam_viec WHERE ngay >= ?`,
          [day(1)],
        );
        const pendingIds: { id: string }[] = await db.query(
          `SELECT CAST(yeu_cau_nghi_phep_id AS CHAR) AS id FROM yeu_cau_nghi_phep WHERE trang_thai = 'ChoDuyet'`,
        );
        const ops: Promise<void>[] = [];
        for (let i = 0; i < OPS_PER_ROUND; i += 1) {
          const kind = pick([
            'assign',
            'remove',
            'leave',
            'approve',
            'approve',
            'book',
            'book',
            'book',
          ] as const);
          if (kind === 'assign') {
            const ngay = pick(days);
            ops.push(
              send('post', '/admin/doctor-shifts', systemToken, {
                bacSiIds: [pick(doctors).account.taiKhoanId],
                tuNgay: ngay,
                denNgay: ngay,
                thuTrongTuan: [
                  isoWeekdayOfEpochDay(parseCalendarDate(ngay) as number),
                ],
                cas: [pick(['CaSang', 'CaChieu'] as const)],
              }).then((res) => record(kind, res.status, res.body?.maLoi)),
            );
          } else if (kind === 'remove' && shiftIds.length > 0) {
            ops.push(
              send(
                'delete',
                `/admin/doctor-shifts/${pick(shiftIds).id}`,
                systemToken,
              ).then((res) => record(kind, res.status, res.body?.maLoi)),
            );
          } else if (kind === 'leave') {
            const index = Math.floor(random() * doctors.length);
            const ngay = pick(days);
            const body =
              random() < 0.5
                ? { hinhThuc: 'CaNgay', tuNgay: ngay, denNgay: ngay }
                : {
                    hinhThuc: 'TheoCa',
                    tuNgay: ngay,
                    denNgay: ngay,
                    ca: pick(['CaSang', 'CaChieu'] as const),
                  };
            ops.push(
              send(
                'post',
                '/doctor/leave-requests',
                doctorTokens[index] as string,
                { ...body, lyDo: 'Việc gia đình' },
              ).then((res) => record(kind, res.status, res.body?.maLoi)),
            );
          } else if (kind === 'approve' && pendingIds.length > 0) {
            ops.push(
              send(
                'post',
                `/admin/leave-requests/${pick(pendingIds).id}/approve`,
                systemToken,
              ).then((res) => record(kind, res.status, res.body?.maLoi)),
            );
          } else if (kind === 'book') {
            ops.push(fakeBook().then((status) => record(kind, status)));
          }
        }
        await Promise.all(ops);
        // IV-01…IV-04 sau mỗi vòng (ném lỗi nêu rõ bất biến nào vỡ)
        await assertInvariants(db, day(0));
      }

      expect(
        failures,
        'phản hồi 5xx (deadlock hay lỗi hệ thống lọt ra ngoài)',
      ).toEqual([]);
      // Stress có ý nghĩa: mỗi loại thao tác đều thành công ít nhất một lần
      for (const kind of ['assign', 'remove', 'leave', 'approve', 'book'])
        expect(
          successes.get(kind) ?? 0,
          `không có ${kind} nào thành công`,
        ).toBeGreaterThan(0);
    },
  );
});
