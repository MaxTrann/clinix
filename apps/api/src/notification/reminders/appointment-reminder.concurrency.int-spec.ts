import { SLOT0_TIME } from '../../appointments/testing/cancel-world.js';
import {
  db,
  racePair,
  useStatusWorldHooks,
  world,
} from '../../appointments/testing/status-int-kit.js';
import { FakeMailService } from '../../mail/testing/fake-mail.service.js';
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
