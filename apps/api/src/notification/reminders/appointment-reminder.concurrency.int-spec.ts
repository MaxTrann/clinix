import { SLOT0_TIME } from '../../appointments/testing/cancel-world.js';
import {
  db,
  racePair,
  useStatusWorldHooks,
  world,
} from '../../appointments/testing/status-int-kit.js';
import { cancelInput } from '../../appointments/testing/cancel-world.js';
import { readAppointment } from '../../appointments/testing/expiry-fixtures.js';
import { createStatusStack } from '../../appointments/testing/status-world.js';
import { FakeMailService } from '../../mail/testing/fake-mail.service.js';
import { assertNotificationInvariants } from '../testing/notification-invariants.js';
import {
  createReminderService,
  HOUR_MS,
  insertReminderRow,
  readReminders,
  shift,
  sweepAt,
} from '../testing/reminder-fixtures.js';

// notification B3 — NLH-07: hai `AppointmentReminderService` (hai "tiến trình", mỗi bên một `FakeMailService`) cùng quét MỘT mốc trên MySQL 8.4 thật: đúng MỘT thư mỗi mốc.
// Hai đường: mốc MỚI (khoá chính khi `INSERT`: bên thua thấy 1062 hay không thấy lịch nữa) và dòng CHỜ THỬ LẠI (câu nhận việc có điều kiện: bên thua `lostClaim`).
// Chạy MỘT mình (PLAN 5.12). Mỗi vòng xen kẽ bên đi trước (`racePair`) để cả hai nhánh thắng đều chạy.
useStatusWorldHooks();
const ROUNDS = 20;
const MOC2 = shift(SLOT0_TIME, -2 * HOUR_MS);

async function race(round: number) {
  const a = createReminderService(db, new FakeMailService());
  const b = createReminderService(db, new FakeMailService());
  const [first, second] = racePair(
    round,
    () => sweepAt(a.service, MOC2),
    () => sweepAt(b.service, MOC2),
  );
  const summaries = await Promise.all([first(), second()]);
  return { summaries, sent: a.mail.sent.length + b.mail.sent.length };
}

describe('NLH-07 hai tiến trình cùng quét một mốc', () => {
  it(`mốc MỚI, ${String(ROUNDS)} vòng: mỗi vòng đúng MỘT dòng và MỘT thư`, async () => {
    const w = await world();
    const lich = await w.booked('DaXacNhan', 0);
    for (let round = 0; round < ROUNDS; round++) {
      await db.query('DELETE FROM nhac_lich_hen');
      const { summaries, sent } = await race(round);
      expect(sent, `vòng ${String(round)}`).toBe(1);
      expect(summaries.reduce((n, s) => n + s.created, 0)).toBe(1);
      expect(await readReminders(db, lich.lichHenId)).toMatchObject([
        { soGioTruoc: 2, trangThai: 'DaGui', soLanThu: 1 },
      ]);
    }
  });

  it(`dòng CHỜ THỬ LẠI, ${String(ROUNDS)} vòng: một bên nhận việc, bên kia lostClaim; đúng MỘT thư, so_lan_thu 2`, async () => {
    const w = await world();
    const lich = await w.booked('DaXacNhan', 0);
    let lost = 0;
    for (let round = 0; round < ROUNDS; round++) {
      await db.query('DELETE FROM nhac_lich_hen');
      await insertReminderRow(db, {
        lichHenId: lich.lichHenId,
        soGioTruoc: 2,
        trangThai: 'ThatBai',
        soLanThu: 1,
        lanThuCuoiLuc: '2026-11-10 05:50:00',
        loiCuoi: 'CONNECTION',
      });
      const { summaries, sent } = await race(round);
      expect(sent, `vòng ${String(round)}`).toBe(1);
      lost += summaries.reduce((n, s) => n + s.lostClaim, 0);
      expect(await readReminders(db, lich.lichHenId)).toMatchObject([
        { trangThai: 'DaGui', soLanThu: 2 },
      ]);
    }
    // Ghi số lần bên thua đi đường nhận việc (phần còn lại: bên chậm chọn sau khi bên kia đã gửi xong nên không thấy hàng)
    process.stderr.write(
      `NLH-07 lostClaim: ${String(lost)}/${String(ROUNDS)} vòng\n`,
    );
  });
});

// notification X2 — CTB-01 (hai tiến trình nhắc lịch, nhiều lịch cùng mốc) và CTB-07 (job nhắc lịch đua huỷ lịch), chạy MỘT mình. IVN-01…IVN-05 sau mỗi vòng. Số đo in với tiền tố `[X2-CTB-0n]`.
const unreadOf = async (taiKhoanId: string): Promise<number> =>
  Number(
    (
      (await db.query(
        'SELECT COUNT(*) AS n FROM thong_bao WHERE tai_khoan_id = ? AND trang_thai_doc = 0',
        [taiKhoanId],
      )) as { n: string }[]
    )[0]!.n,
  );
const notificationCounts = async () =>
  (
    (await db.query(
      'SELECT (SELECT COUNT(*) FROM thong_bao) AS thongBao, (SELECT COUNT(*) FROM email_thong_bao) AS email',
    )) as { thongBao: string; email: string }[]
  )[0];

describe('CTB-01 hai tiến trình nhắc lịch cùng mốc, 8 lịch', () => {
  const CTB_ROUNDS = 40;
  const LICH = 8;

  it(`${String(CTB_ROUNDS)} vòng × ${String(LICH)} lịch: mỗi lịch đúng MỘT thư, ${String(LICH)} dòng DaGui so_lan_thu 1; có tranh nhau thật; không lỗi (1213, 1205); không thông báo hay dòng thư nào (IVN-04)`, async () => {
    const w = await world();
    const ids: string[] = [];
    for (let slot = 0; slot < LICH; slot++)
      ids.push((await w.booked('DaXacNhan', slot)).lichHenId);
    // Dữ liệu dựng: dồn giờ hẹn của 8 lịch vào CÙNG cửa sổ 10 phút của mốc 2 giờ (khung giờ thật cách nhau 30 phút); câu chọn của nhắc lịch chỉ đọc `lich_hen.thoi_gian`
    for (const [i, id] of ids.entries())
      await db.query(
        'UPDATE lich_hen SET thoi_gian = ? WHERE lich_hen_id = ?',
        [shift(SLOT0_TIME, -i * 60_000), id],
      );
    const before = await notificationCounts();
    let contended = 0;
    for (let round = 0; round < CTB_ROUNDS; round++) {
      await db.query('DELETE FROM nhac_lich_hen');
      const { summaries, sent } = await race(round);
      expect(sent, `vòng ${String(round)}: số thư`).toBe(LICH);
      const rows = await readReminders(db);
      expect(rows, `vòng ${String(round)}`).toHaveLength(LICH);
      for (const row of rows)
        expect(row).toMatchObject({
          soGioTruoc: 2,
          trangThai: 'DaGui',
          soLanThu: 1,
        });
      expect(new Set(rows.map((r) => r.lichHenId)).size).toBe(LICH);
      // Tranh nhau thật: bên kia cũng tạo được dòng hay gặp lostClaim, không phải một bên làm hết một mình
      if (summaries.every((s) => s.sent > 0 || s.lostClaim > 0)) contended++;
      await assertNotificationInvariants(db, unreadOf);
    }
    expect(await notificationCounts()).toEqual(before);
    process.stderr.write(
      `[X2-CTB-01] ${String(CTB_ROUNDS)} vòng × ${String(LICH)} lịch; vòng cả hai bên cùng tham gia: ${String(contended)}\n`,
    );
    expect(contended, 'CTB-01: hai bên không hề tranh nhau').toBeGreaterThan(0);
  }, 300_000);
});

describe('CTB-07 job nhắc lịch đua huỷ lịch cùng mốc', () => {
  const CTB_ROUNDS = 40;

  it(`${String(CTB_ROUNDS)} vòng: không bao giờ hai thư; huỷ trước khi nhận việc ⇒ không thư (không dòng, hay ThatBai LICH_KHONG_CON_HIEU_LUC); huỷ sau ⇒ thư có thể đã đi (ghi số); huỷ luôn thành công`, async () => {
    const w = await world();
    const stack = createStatusStack(db);
    const outcomes: Record<string, number> = {};
    for (let round = 0; round < CTB_ROUNDS; round++) {
      await db.query('DELETE FROM nhac_lich_hen');
      const lich = await w.booked('DaXacNhan', 0);
      const reminder = createReminderService(db, new FakeMailService());
      const [first, second] = racePair(
        round,
        () => sweepAt(reminder.service, MOC2),
        () =>
          stack.cancellation.cancel(cancelInput(w, 'BenhNhan', lich.maLichHen)),
      );
      const settled = await Promise.allSettled([first(), second()]);
      for (const result of settled)
        expect(result.status, `vòng ${String(round)}`).toBe('fulfilled');
      expect((await readAppointment(db, lich.lichHenId)).trangThai).toBe(
        'DaHuy',
      );
      const sent = reminder.mail.sent.length;
      expect(sent, `vòng ${String(round)}: hai thư`).toBeLessThanOrEqual(1);
      const rows = await readReminders(db, lich.lichHenId);
      let label: string;
      if (sent === 1) {
        expect(rows).toMatchObject([{ trangThai: 'DaGui', soLanThu: 1 }]);
        label = 'nhận việc trước huỷ: thư đã đi';
      } else if (rows.length === 0) {
        label = 'huỷ trước câu chọn: không dòng';
      } else {
        expect(rows).toMatchObject([
          { trangThai: 'ThatBai', loiCuoi: 'LICH_KHONG_CON_HIEU_LUC' },
        ]);
        label = 'huỷ sau câu chọn: ThatBai, không thư';
      }
      outcomes[label] = (outcomes[label] ?? 0) + 1;
      await assertNotificationInvariants(db, unreadOf);
    }
    process.stderr.write(
      `[X2-CTB-07] ${String(CTB_ROUNDS)} vòng; kết cục ${JSON.stringify(outcomes)}\n`,
    );
  }, 300_000);
});
