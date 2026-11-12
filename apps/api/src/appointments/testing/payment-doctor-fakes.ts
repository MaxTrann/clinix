import type { DataSource, EntityManager } from 'typeorm';
import { HoldExpiryJob } from '../expiry/hold-expiry.job.js';
import { withBookingTransaction } from '../locking/booking-transaction.js';
import type {
  AppointmentEvent,
  AppointmentNotifier,
} from '../ports/appointment-notifier.port.js';
import { SlotHoldService } from '../slots/slot-hold.service.js';
import {
  AppointmentTransitionService,
  type CompleteOutcome,
  type ConfirmPaidOutcome,
} from '../state/appointment-transition.service.js';
import { BookingFixtures } from './booking-fixtures.js';
import { readAppointment } from './expiry-fixtures.js';
import { FakeWaitlistPort } from './fake-ports.js';
import { interceptQuery } from './query-spy.js';

// Bản GIẢ của `payment` và `doctor` cho test tích hợp của B11 (CG-02, CG-07, DT-03, DT-04, CFP-06…CFP-08; TRACKING 3.24.2 (h)). KHÔNG đổi schema, KHÔNG bảng tạm.
// LƯU Ý đã phát hiện khi viết (12/11/2026): bảng `giao_dich_thanh_toan` CHƯA có migration nào (chỉ có ở `docs/database/`, module `payment` sẽ tạo) nên DB test không có nó. "Hàng ghi của payment" ở đây là một dòng
// `thong_bao` với loại sự kiện `FakeThanhToan`: bảng đó CÓ trong DB test và có khoá ngoại tới `lich_hen` (`lich_hen_id`) và `tai_khoan` (`tai_khoan_id`), tức cùng cơ chế khoá chia sẻ trên hàng cha của InnoDB mà điều kiện
// thứ tự gọi của `payment` dựa vào (cơ chế là của InnoDB, áp dụng cho mọi bảng con). Dọn dữ liệu giữa các ca do `resetTables` (TRUNCATE khi tắt kiểm tra khoá ngoại) và `DELETE FROM thong_bao` ở từng vòng.

/** Loại sự kiện của dòng `thong_bao` mà `payment` giả ghi (không phải một sự kiện của booking). */
export const FAKE_PAYMENT_EVENT = 'FakeThanhToan';

// Một dòng, bắt đầu ngay bằng `INSERT INTO thong_bao`: test chuỗi khoá nhận ra câu này theo đầu câu
const INSERT_THONG_BAO_SQL =
  'INSERT INTO thong_bao (tai_khoan_id, noi_dung, loai_su_kien, lich_hen_id, thoi_diem_tao) VALUES (?, ?, ?, ?, ?)';

/**
 * `AppointmentNotifier` GIẢ nhưng GHI THẬT một dòng `thong_bao` TRONG `em` của người gọi (đúng hợp đồng port: ghi trong giao dịch đổi trạng thái), để ca hoàn tác thấy dòng đó biến mất cùng giao dịch
 * và ca đồng thời đếm đúng một thông báo cho bên thắng. `events` ghi mọi lần gọi, KỂ CẢ lần bị hoàn tác sau đó.
 */
export class RecordingAppointmentNotifier implements AppointmentNotifier {
  readonly events: AppointmentEvent[] = [];

  async notify(em: EntityManager, event: AppointmentEvent): Promise<void> {
    this.events.push(event);
    const noiDung =
      event.daThu === undefined
        ? event.loaiSuKien
        : `${event.loaiSuKien}: đã thu ${event.daThu}`;
    await em.query(INSERT_THONG_BAO_SQL, [
      event.taiKhoanId,
      noiDung,
      event.loaiSuKien,
      event.lichHenId,
      new Date(),
    ]);
  }
}

export interface FakePaymentInput {
  lichHenId: string;
  /** Tài khoản đặt (khoá ngoại của dòng ghi) */
  taiKhoanId: string;
  /** Mặc định "150000.00" */
  soTienDaThu?: string;
  /**
   * `confirmFirst` (mặc định) = ĐÚNG hợp đồng: gọi `confirmPaid` TRƯỚC, rồi mới ghi bảng có khoá ngoại tới `lich_hen`. `writeFirst` = ĐẢO thứ tự (vi phạm điều kiện người gọi): ghi dòng
   * có khoá ngoại TRƯỚC, rồi mới gọi `confirmPaid`.
   */
  order?: 'confirmFirst' | 'writeFirst';
  /** Gọi ngay SAU lần ghi đầu của `writeFirst`, TRƯỚC `confirmPaid` (chạy lại mỗi lần `withBookingTransaction` thử lại: hook tự chống lặp) */
  afterFirstWrite?: () => Promise<void>;
  /** Ném sau khi đã ghi hết (CG-02: "lỗi sau đó" ⇒ hoàn tác cả hai) */
  failAfter?: Error;
}

export function insertFakePaymentRow(
  em: EntityManager,
  input: { lichHenId: string; taiKhoanId: string },
): Promise<unknown> {
  return em.query(INSERT_THONG_BAO_SQL, [
    input.taiKhoanId,
    'Giao dịch thanh toán giả',
    FAKE_PAYMENT_EVENT,
    input.lichHenId,
    new Date(),
  ]);
}

/**
 * `payment` giả: MỘT giao dịch `withBookingTransaction` THẬT (READ COMMITTED, thử lại 1213 và 1205 bằng cách chạy lại thân) gọi `confirmPaid` thật. Chỉ ghi dòng "thanh toán" khi `Confirmed`
 * (với `confirmFirst`); `writeFirst` ghi trước nên có dòng cả khi kết quả không phải `Confirmed`.
 */
export function fakePayment(
  db: DataSource,
  service: AppointmentTransitionService,
  input: FakePaymentInput,
): Promise<ConfirmPaidOutcome> {
  return withBookingTransaction(
    db,
    async (em) => {
      const writeFirst = input.order === 'writeFirst';
      if (writeFirst) {
        await insertFakePaymentRow(em, input);
        await input.afterFirstWrite?.();
      }
      const outcome = await service.confirmPaid(em, {
        lichHenId: input.lichHenId,
        soTienDaThu: input.soTienDaThu ?? '150000.00',
      });
      if (!writeFirst && outcome.kind === 'Confirmed')
        await insertFakePaymentRow(em, input);
      if (input.failAfter !== undefined) throw input.failAfter;
      return outcome;
    },
    { label: 'fake-payment' },
  );
}

/** `doctor` giả: MỘT giao dịch `withBookingTransaction` THẬT gọi `complete` thật, rồi (tuỳ ca) ném lỗi như khi ghi hồ sơ khám hỏng (CG-07, CMP-03). */
export function fakeDoctorExam(
  db: DataSource,
  service: AppointmentTransitionService,
  input: { lichHenId: string; bacSiId: string; failAfter?: Error },
): Promise<CompleteOutcome> {
  return withBookingTransaction(
    db,
    async (em) => {
      const outcome = await service.complete(em, {
        lichHenId: input.lichHenId,
        bacSiId: input.bacSiId,
      });
      if (input.failAfter !== undefined) throw input.failAfter;
      return outcome;
    },
    { label: 'fake-doctor-exam' },
  );
}

/** Một bộ dịch vụ thật (`AppointmentTransitionService` với thông báo GHI THẬT, cổng danh sách chờ `Fake`), job hết hạn và hai bản giả của người gọi, chung một `DataSource`. */
export function createTransitionStack(db: DataSource, patientId: string) {
  const notifier = new RecordingAppointmentNotifier();
  const waitlist = new FakeWaitlistPort();
  const service = new AppointmentTransitionService(
    db,
    new SlotHoldService(),
    waitlist,
    notifier,
  );
  return {
    notifier,
    waitlist,
    service,
    job: new HoldExpiryJob(db, service),
    pay: (lichHenId: string, extra: Partial<FakePaymentInput> = {}) =>
      fakePayment(db, service, { lichHenId, taiKhoanId: patientId, ...extra }),
    exam: (lichHenId: string, bacSiId: string, failAfter?: Error) =>
      fakeDoctorExam(db, service, {
        lichHenId,
        bacSiId,
        ...(failAfter === undefined ? {} : { failAfter }),
      }),
  };
}

export type TransitionStack = ReturnType<typeof createTransitionStack>;

export interface NotificationRow {
  taiKhoanId: string;
  lichHenId: string;
  loai: string;
}

/** Các dòng `thong_bao` theo thứ tự ghi; `loai` lọc theo loại sự kiện (bỏ trống: mọi loại). */
export async function notificationRows(
  db: DataSource,
  loai?: string,
): Promise<NotificationRow[]> {
  return db.query(
    `SELECT CAST(tai_khoan_id AS CHAR) AS taiKhoanId, CAST(lich_hen_id AS CHAR) AS lichHenId, loai_su_kien AS loai
FROM thong_bao ${loai === undefined ? '' : 'WHERE loai_su_kien = ?'}
ORDER BY thong_bao_id`,
    loai === undefined ? [] : [loai],
  );
}

/** Ảnh chụp trạng thái cần so sánh "không đổi một byte": hàng lịch, hàng khung giờ và số dòng `thong_bao`. */
export async function snapshotState(
  db: DataSource,
  ids: { lichHenId: string; khungGioId: string },
) {
  return {
    appointment: await readAppointment(db, ids.lichHenId),
    slot: await new BookingFixtures(db).slotState(ids.khungGioId),
    thongBao: (await notificationRows(db)).length,
  };
}

/** Dọn giữa các vòng đua: dòng `thong_bao` (khoá ngoại tới `lich_hen`) trước, rồi lịch, rồi đưa mọi khung giờ về `ConTrong`. */
export async function resetBookingRound(db: DataSource): Promise<void> {
  await db.query('DELETE FROM thong_bao');
  await db.query('DELETE FROM lich_hen');
  await db.query(
    "UPDATE khung_gio SET trang_thai = 'ConTrong', giu_cho_den = NULL",
  );
}

/**
 * Chạy `work` trong MỘT `withBookingTransaction` THẬT và ghi lại mọi câu SQL của thân (bỏ hai câu đặt timeout chờ khoá, X1b) theo thứ tự đã CHẠY XONG. Dùng cho CFP-06, CMP-03: chỉ có MỘT nơi ghi câu SQL của
 * giao dịch (jscpd quét file test). Muốn ném lỗi SAU một câu đã chạy thật thì dùng `failAfterStatement` của B8 (`testing/statement-recorder.ts`), không cần hàm này.
 */
export function recordTransaction<T>(
  db: DataSource,
  label: string,
  work: (em: EntityManager) => Promise<T>,
) {
  const statements: string[] = [];
  const run = () =>
    withBookingTransaction(
      db,
      async (em) => {
        interceptQuery(em, async (sql, execute) => {
          const result = await execute();
          statements.push(sql);
          return result;
        });
        return work(em);
      },
      { label },
    );
  const body = () =>
    statements.filter((sql) => !/^s*(SET SESSION|SELECT @@session)/i.test(sql));
  return { run, body };
}
