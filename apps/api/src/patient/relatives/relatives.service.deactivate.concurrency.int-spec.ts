import type { LichHen } from '../../admin/entities/lich-hen.entity.js';
import { AppException } from '../../common/errors/app.exception.js';
import {
  serverDeadlocks,
  sleep,
} from '../../auth/testing/verification-int-helpers.js';
import { failureOf } from '../testing/profile-update-helpers.js';
import {
  BOOKING_VARIANTS,
  bookingTarget,
  detailsOf,
  expectLocksReleased,
  fakeBooking,
  insertActiveAppointment,
  LOCK_PATIENT_SQL,
  pauseNextDeactivate,
  relativeOutcome,
  waitForLockWaiterOn,
} from '../testing/relatives-deactivate-helpers.js';
import { insertRelativeRow } from '../testing/relatives-helpers.js';
import {
  expectAppException,
  queueBehindLock,
  useRelativesIntegration,
} from '../testing/relatives-update-helpers.js';
import { RelativesRepository } from './relatives.repository.js';

// Task B5 — ngừng sử dụng hồ sơ ĐUA NHAU với đặt lịch trên MySQL 8.4 thật (H1; PLAN patient 3.5, 5.3; NT-17, NT-24). `booking` chưa có nên được GIẢ LẬP theo hợp đồng PLAN
// (khoá `benh_nhan` trước, kiểm hồ sơ còn hiệu lực dưới khoá, đếm, chèn `ChoThanhToan`) ở hai biến thể: `plain-read` (kiểm bằng đọc THƯỜNG, nghĩa tối thiểu của hợp đồng) và
// `locked-read` (kiểm bằng `FOR UPDATE` hàng hồ sơ, mạnh hơn). Ép thứ tự bằng chờ khoá thật (`data_lock_waits` nối `data_locks`, không `sleep` cố định).
// Mã ca RDR-nn là [đề xuất] (TRACKING patient B5-G). Số vòng RELATIVE_RACE_ROUNDS (mặc định 15, tối thiểu theo PLAN NT-17).
const ROUNDS = Number(process.env['RELATIVE_RACE_ROUNDS'] ?? 15);
const TEST_TIMEOUT = Math.max(60_000, ROUNDS * 4_000);
const CONFLICT = 'HO_SO_NGUOI_THAN_DANG_CO_LICH_HEN';

const repository = new RelativesRepository();
const ctx = useRelativesIntegration(repository);

const activeRelative = (owner: string) =>
  insertRelativeRow(ctx.db, owner, { hoTen: 'Tên Gốc Giả', active: true });

// Kết quả của một bên, rút gọn để so: 'ok' | 'booked' | 'refused' | mã lỗi nghiệp vụ | 'LỖI-KHÁC:…'
function labelOf(settled: PromiseSettledResult<unknown>): string {
  if (settled.status === 'fulfilled') {
    return typeof settled.value === 'string' ? settled.value : 'ok';
  }
  const reason: unknown = settled.reason;
  return reason instanceof AppException
    ? reason.maLoi
    : `LỖI-KHÁC:${reason instanceof Error ? reason.message : String(reason)}`;
}

describe('ngừng sử dụng đua với đặt lịch', { timeout: TEST_TIMEOUT }, () => {
  it.each(BOOKING_VARIANTS)(
    `RDR-01 (NT-17, H1) %s: ngừng và booking giả lập chạy CÙNG LÚC (${String(ROUNDS)} vòng, luân phiên bên nào được gọi trước): mỗi vòng đúng MỘT trong hai (ngừng 200 + đặt bị từ chối, hoặc ngừng 409 + đã đặt); không lỗi nào khác; không bao giờ vừa ngừng vừa còn lịch chặn; 0 deadlock`,
    async (variant) => {
      const deadlocksBefore = await serverDeadlocks(ctx.db);
      const tally: Record<string, number> = {};
      for (let round = 0; round < ROUNDS; round++) {
        const owner = await ctx.newPatient();
        const id = await activeRelative(owner);
        const target = await bookingTarget(ctx.fx, owner, id);
        const stop = () => ctx.service.deactivate(owner, id);
        const book = () => fakeBooking(ctx.db, variant, target);

        // Vòng chẵn: ngừng được gọi trước; vòng lẻ: đặt lịch được gọi trước. Bên thứ hai trễ 0, 1 hoặc 2 ms để các thứ tự xen kẽ khác nhau
        const settled =
          round % 2 === 0
            ? await Promise.allSettled([stop(), sleep(round % 3).then(book)])
            : await Promise.allSettled([sleep(round % 3).then(stop), book()]);
        const [stopLabel, bookLabel] = [
          settled[0] ? labelOf(settled[0]) : '?',
          settled[1] ? labelOf(settled[1]) : '?',
        ];
        const key = `ngừng=${stopLabel} + đặt=${bookLabel}`;
        tally[key] = (tally[key] ?? 0) + 1;

        const outcome = await relativeOutcome(ctx.db, id);
        const where = `vòng ${String(round)} (${variant}): ${key}`;
        // Bất biến H1: hồ sơ đã ngừng thì KHÔNG được còn lịch chặn nào
        expect(outcome.active || outcome.blocking === 0, where).toBe(true);
        if (stopLabel === 'ok') {
          expect([bookLabel, outcome], where).toEqual([
            'refused',
            { active: false, blocking: 0 },
          ]);
        } else {
          expect([stopLabel, bookLabel, outcome], where).toEqual([
            CONFLICT,
            'booked',
            { active: true, blocking: 1 },
          ]);
        }
      }
      expect((await serverDeadlocks(ctx.db)) - deadlocksBefore).toBe(0);
      // Phân bố hai nhánh để người đọc thấy vòng tự do có chạm cả hai (KHÔNG khẳng định tỉ lệ: nhánh nào cũng hợp lệ; hai nhánh được ép tất định ở RDR-02, RDR-03)
      process.stderr.write(`RDR-01 ${variant}: ${JSON.stringify(tally)}\n`);
    },
  );

  it('RDR-02 (NT-24, H1) TẤT ĐỊNH, booking đến trước: booking giả lập khoá benh_nhan, ngừng được gọi ở kết nối khác và ĐỨNG CHỜ khoá benh_nhan (kiểm bằng data_lock_waits trên bảng benh_nhan), booking chèn lịch ChoThanhToan rồi commit ⇒ ngừng 409 với chiTiet có ĐÚNG lịch vừa chèn, hồ sơ vẫn hiệu lực', async () => {
    const owner = await ctx.newPatient();
    const id = await activeRelative(owner);
    const target = await bookingTarget(ctx.fx, owner, id);
    let inserted: LichHen | undefined;

    const error = await queueBehindLock(
      ctx.db,
      (em) => em.query(LOCK_PATIENT_SQL, [owner]),
      () => failureOf(() => ctx.service.deactivate(owner, id)),
      async (em) => {
        // Người đang đợi phải là đợi đúng bảng benh_nhan (không phải một khoá nào khác)
        await waitForLockWaiterOn(ctx.db, 'benh_nhan');
        inserted = await insertActiveAppointment(em, target);
      },
    ).catch((failure: unknown) => {
      if (
        failure instanceof Error &&
        failure.message.startsWith('Không thấy giao dịch nào chờ khoá')
      ) {
        throw new Error(
          `Ngừng sử dụng KHÔNG đứng chờ khoá benh_nhan của booking giả lập (nó phải khoá benh_nhan trước hết, NT-24): ${failure.message}`,
        );
      }
      throw failure;
    });

    expectAppException(error, 409, CONFLICT);
    expect(inserted?.maLichHen).toBeDefined();
    const details = detailsOf(error) as {
      maLichHen: string;
      trangThai: string;
    }[];
    expect(details.map((d) => [d.maLichHen, d.trangThai])).toEqual([
      [inserted?.maLichHen, 'ChoThanhToan'],
    ]);
    expect(await relativeOutcome(ctx.db, id)).toEqual({
      active: true,
      blocking: 1,
    });
    await expectLocksReleased(ctx.db, owner, id);
  });

  it.each(BOOKING_VARIANTS)(
    'RDR-03 (NT-17, nhánh còn lại, tất định) %s, ngừng đến trước: ngừng dừng ngay trước UPDATE khi đã giữ cả hai khoá, booking giả lập bắt đầu và ĐỨNG CHỜ khoá benh_nhan; nhả ngừng ⇒ ngừng 200, booking thấy hồ sơ đã ngừng ⇒ từ chối, không có lịch hẹn mới',
    async (variant) => {
      const owner = await ctx.newPatient();
      const id = await activeRelative(owner);
      const target = await bookingTarget(ctx.fx, owner, id);
      const pause = pauseNextDeactivate(repository);
      const stop = ctx.service.deactivate(owner, id);
      stop.catch(() => undefined);
      let booking: Promise<'booked' | 'refused'> | undefined;
      try {
        await Promise.race([
          pause.entered,
          stop.then(() => {
            throw new Error('ngừng xong trước khi dừng');
          }),
        ]);
        booking = fakeBooking(ctx.db, variant, target);
        booking.catch(() => undefined);
        await waitForLockWaiterOn(ctx.db, 'benh_nhan');
      } finally {
        pause.resume();
      }

      expect(await stop).toStrictEqual({ trangThaiHieuLuc: false });
      expect(await booking).toBe('refused');
      expect(await relativeOutcome(ctx.db, id)).toEqual({
        active: false,
        blocking: 0,
      });
      await expectLocksReleased(ctx.db, owner, id);
    },
  );
});
