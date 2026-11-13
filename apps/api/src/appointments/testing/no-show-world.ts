import type { DataSource } from 'typeorm';
import type { BacSi } from '../../admin/entities/bac-si.entity.js';
import type {
  CaLamViec,
  TrangThaiLichHen,
} from '../../admin/entities/enums.js';
import type { LichHen } from '../../admin/entities/lich-hen.entity.js';
import type { LichLamViec } from '../../admin/entities/lich-lam-viec.entity.js';
import { AppException } from '../../common/errors/app.exception.js';
import { NoShowJob } from '../noshow/no-show.job.js';
import { NoShowSweepService } from '../noshow/no-show-sweep.service.js';
import type { BookingFixtures } from './booking-fixtures.js';
import { runRounds } from './concurrency-harness.js';
import {
  reportRounds,
  winnerTally,
  type ReportOptions,
} from './concurrency-report.js';
import { createFakePorts } from './fake-ports.js';
import { resetBookingRound } from './payment-doctor-fakes.js';
import { logs, racePair } from './status-int-kit.js';
import {
  createStatusStack,
  setNoShow,
  statusWorld,
  type NoShowState,
  type StatusWorld,
} from './status-world.js';

// Hạ tầng test dùng chung của job tự Vắng mặt (task B13; PLAN booking 7.35 `[đề xuất]`; TRACKING 3.29 B13-H): ba int-spec (câu SQL, job, đồng thời) cùng dựng MỘT thế giới và MỘT bộ dịch vụ, để jscpd (vốn quét cả `*.int-spec.ts`)
// không thấy cùng một đoạn dựng ở nhiều ca. BỌC `statusWorld` (chính nó bọc `cancelWorld`, `expiryWorld` và `BookingFixtures.world`), không chép. Nằm trong `testing/` nên AR-01 và AR-06 bỏ qua (có `UPDATE` bằng SQL thẳng).
// Thế giới gốc: chi nhánh đủ 7 thứ (08:00 đến 12:00 và 13:00 đến 17:00), một bác sĩ, một ca sáng ngày 10/11/2026 (thứ Ba) với 8 khung giờ từ 08:00 đến 11:30; mốc `AFTER_ALL_WINDOWS` (12:00 cùng ngày) là ĐÚNG giờ kết thúc ca sáng.

export type NoShowWorld = Awaited<ReturnType<typeof noShowWorld>>;

/** Một lịch hẹn dựng theo ca (ngày, ca, giờ hẹn) thay vì theo chỉ số khung giờ của thế giới gốc. */
export interface ShiftedLichInput {
  /** Bác sĩ của ca; mặc định bác sĩ của thế giới. (bác sĩ, ngày, ca) là DUY NHẤT trong DB nên mỗi cặp chỉ có MỘT ca */
  doctor?: BacSi;
  /** 'YYYY-MM-DD' */
  ngay: string;
  ca: CaLamViec;
  /** Giờ hẹn 'HH:MM:SS' trong ngày `ngay` */
  gio: string;
  /** Chi nhánh GHI TRÊN CA (nguồn của giờ kết thúc ca); mặc định chi nhánh của bác sĩ */
  chiNhanhCa?: string;
  /** Chi nhánh ghi trên LỊCH (khác chi nhánh của ca khi bác sĩ đổi chi nhánh sau khi phân công) */
  chiNhanhLich?: string;
  trangThai?: TrangThaiLichHen;
  patientId?: string;
  hoSoNguoiThanId?: string | null;
}

/**
 * Thế giới của job: `statusWorld` cộng hàm dựng lịch theo CA tuỳ ý (mỗi (bác sĩ, ngày, ca) một ca, tái dùng cho các lịch cùng ca) với khung giờ ghi bằng CHUỖI (H1), lịch ở `trangThai` kèm khung giờ nhất quán.
 * Với lịch ở khung giờ số `i` của thế giới gốc dùng `w.booked('DaXacNhan', i)` như B12.
 */
export async function noShowWorld(db: DataSource, fx: BookingFixtures) {
  const w = await statusWorld(db, fx);
  const shifts = new Map<string, LichLamViec>();
  const shiftOf = async (input: ShiftedLichInput, doctor: BacSi) => {
    const key = `${doctor.taiKhoanId}|${input.ngay}|${input.ca}`;
    const known = shifts.get(key);
    if (known !== undefined) return known;
    const shift = await fx.admin.shift(doctor, {
      ngay: input.ngay,
      ca: input.ca,
      ...(input.chiNhanhCa === undefined
        ? {}
        : { chiNhanhId: input.chiNhanhCa }),
    });
    shifts.set(key, shift);
    return shift;
  };
  return {
    ...w,
    /** Lịch hẹn ở ca và giờ cho trước (khung giờ chèn bằng chuỗi giờ); trả lịch hẹn vừa tạo */
    lichAt: async (input: ShiftedLichInput): Promise<LichHen> => {
      const doctor = input.doctor ?? w.doctor.profile;
      const shift = await shiftOf(input, doctor);
      const inserted: { insertId: string } = await db.query(
        "INSERT INTO khung_gio (lich_lam_viec_id, ngay_gio, trang_thai) VALUES (?, ?, 'ConTrong')",
        [shift.lichLamViecId, `${input.ngay} ${input.gio}`],
      );
      const lich = await fx.appointmentIn(input.trangThai ?? 'DaXacNhan', {
        doctor,
        khungGioId: String(inserted.insertId),
        patientId: input.patientId ?? w.patientId,
        hoSoNguoiThanId: input.hoSoNguoiThanId ?? null,
      });
      if (input.chiNhanhLich !== undefined)
        await db.query(
          'UPDATE lich_hen SET chi_nhanh_id = ? WHERE lich_hen_id = ?',
          [input.chiNhanhLich, lich.lichHenId],
        );
      return lich;
    },
  };
}

/** Giờ nhận khám của MỘT thứ trong tuần của chi nhánh: nghỉ cả ngày, hoặc buổi sáng và buổi chiều (`null` = không có buổi đó). Giờ dạng 'HH:MM:SS'. */
export type DayHours =
  | { off: true }
  | {
      sang: readonly [string, string] | null;
      chieu: readonly [string, string] | null;
    };

/** Ghi giờ nhận khám của một thứ (1 = Thứ Hai … 7 = Chủ nhật) của chi nhánh; giữ đúng CHECK của lịch hoạt động (nghỉ ⇒ cả bốn cột trống). */
export async function setDayHours(
  db: DataSource,
  chiNhanhId: string,
  thu: number,
  hours: DayHours,
): Promise<void> {
  const sang = 'off' in hours ? null : hours.sang;
  const chieu = 'off' in hours ? null : hours.chieu;
  await db.query(
    `UPDATE chi_nhanh_lich_hoat_dong
        SET hoat_dong = ?, gio_bat_dau_sang = ?, gio_ket_thuc_sang = ?, gio_bat_dau_chieu = ?, gio_ket_thuc_chieu = ?
      WHERE chi_nhanh_id = ? AND thu_trong_tuan = ?`,
    [
      'off' in hours ? 0 : 1,
      sang?.[0] ?? null,
      sang?.[1] ?? null,
      chieu?.[0] ?? null,
      chieu?.[1] ?? null,
      chiNhanhId,
      thu,
    ],
  );
}

/** Xoá HẲN dòng lịch hoạt động của một thứ (chi nhánh "chưa khai báo" thứ đó): câu ứng viên dùng JOIN nên loại lịch, câu đếm dùng LEFT JOIN nên đếm. */
export async function deleteDayHours(
  db: DataSource,
  chiNhanhId: string,
  thu: number,
): Promise<void> {
  await db.query(
    'DELETE FROM chi_nhanh_lich_hoat_dong WHERE chi_nhanh_id = ? AND thu_trong_tuan = ?',
    [chiNhanhId, thu],
  );
}

/**
 * "Một bản API" của job: `createStatusStack` (dịch vụ chuyển trạng thái và huỷ THẬT, thông báo GHI THẬT dòng `thong_bao`, cổng `Fake`) cộng `NoShowSweepService` và `NoShowJob` THẬT. Truyền chung `ports` để hai bản
 * API đếm vào cùng bộ đếm mời chờ và hoàn tiền; mỗi bản có cờ `running` riêng của job, như hai tiến trình thật (VM-09).
 */
export function createNoShowStack(
  db: DataSource,
  ports: ReturnType<typeof createFakePorts> = createFakePorts(),
) {
  const stack = createStatusStack(db, ports);
  const sweep = new NoShowSweepService(db, stack.transition, stack.configs);
  return { ...stack, sweep, job: new NoShowJob(sweep) };
}

export type NoShowStack = ReturnType<typeof createNoShowStack>;

/**
 * Dữ liệu dựng lại SẠCH cho một vòng hay một ca: xoá thông báo và lịch, đưa khung giờ về `ConTrong`, đặt bộ đếm của tài khoản đặt về `counter`, rồi dựng các lịch `DaXacNhan` ở các khung giờ `slots` của thế giới gốc.
 */
export async function freshConfirmed(
  db: DataSource,
  w: StatusWorld,
  options: {
    counter?: NoShowState;
    slots?: readonly number[];
    patientId?: string;
  } = {},
): Promise<LichHen[]> {
  await resetBookingRound(db);
  const patientId = options.patientId ?? w.patientId;
  await setNoShow(db, patientId, options.counter ?? { soLan: 0, khoa: false });
  const lich: LichHen[] = [];
  for (const slot of options.slots ?? [0])
    lich.push(await w.booked('DaXacNhan', slot, { patientId }));
  return lich;
}

/** Tag của dòng số liệu đồng thời của B13 (in vào log của vitest) */
export const RACE_TAG = 'B13-DT';

/**
 * Khung "hai bên đua" của B13: mỗi vòng `setup` dựng dữ liệu MỚI, hai bên cùng xuất phát và xen kẽ ai đi trước (`racePair`), `check` kiểm kết quả vòng đó và GHI bên thắng vào `tally`; xong in một dòng
 * `[B13-DT]` (số vòng, bên thắng, số lần thử lại, hết lượt) và khẳng định hết lượt (503) = 0, cùng 0 lần thử lại trừ khi `options.retriesAllowed`.
 */
export async function raceRounds<Context>(spec: {
  name: string;
  rounds: number;
  options?: ReportOptions;
  setup: (round: number) => Promise<Context>;
  first: (context: Context, round: number) => Promise<unknown>;
  second: (context: Context, round: number) => Promise<unknown>;
  check: (
    context: Context,
    results: PromiseSettledResult<unknown>[],
    tally: ReturnType<typeof winnerTally>,
    round: number,
  ) => Promise<void>;
}): Promise<Record<string, number>> {
  const tally = winnerTally();
  await runRounds({
    rounds: spec.rounds,
    setup: spec.setup,
    race: (context, round) =>
      racePair(
        round,
        () => spec.first(context, round),
        () => spec.second(context, round),
      ),
    check: (context, results, round) =>
      spec.check(context, results, tally, round),
  });
  reportRounds(
    RACE_TAG,
    spec.name,
    spec.rounds,
    tally.winners,
    logs,
    spec.options,
  );
  return tally.winners;
}

/** Kết quả nghiệp vụ của một lời gọi có thể bị từ chối bằng `AppException` (403, 409…); mọi lỗi khác (deadlock, 1205, lỗi lạ) vẫn ném để vòng đỏ. */
export async function outcomeOf<T>(
  promise: Promise<T>,
): Promise<{ kind: 'ok'; value: T } | { kind: 'refused'; maLoi: string }> {
  try {
    return { kind: 'ok', value: await promise };
  } catch (error) {
    if (error instanceof AppException)
      return { kind: 'refused', maLoi: error.maLoi };
    throw error;
  }
}
