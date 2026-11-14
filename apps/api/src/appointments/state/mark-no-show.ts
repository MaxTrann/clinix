import type { EntityManager } from 'typeorm';
import type { TrangThaiLichHen } from '../../admin/entities/enums.js';
import { toSecond } from '../../common/time/time.js';
import { BOOKING_NOTIFICATION_EVENTS } from '../appointments.constants.js';
import type { AppointmentNotifier } from '../ports/appointment-notifier.port.js';
import {
  canTransition,
  type TransitionContext,
  type TransitionDecision,
} from './appointment-state.matrix.js';
import { lockAppointment } from './cancel-appointment.query.js';
import { readLichHenKeys } from './lich-hen-keys.query.js';
import type { OnChanged } from './on-changed.js';
import {
  incrementNoShow,
  lockNoShowCounter,
  readNoShowCounter,
  setNoShowLock,
} from './no-show-counter.query.js';
import { setStatus } from './set-status.query.js';
import { windowOf, type StatusConfig } from './status-config.js';

// `AppointmentTransitionService.markNoShow` (task B12; PLAN booking 5.2, 5.3, 5.7, 5.12; Q14, Q22, Q24, Q25; TRACKING 3.26 B12-D): lịch thành `VangMat`, cộng `so_lan_no_show` của TÀI KHOẢN ĐẶT, bật cờ khoá
// đặt lịch khi đạt ngưỡng. MỘT thân cho BA người gọi, nên họ B (nhận `em`, KHÔNG mở giao dịch, KHÔNG bắt lỗi DB, KHÔNG ném `AppException`):
//  - `LeTan` (route của B12): phạm vi chi nhánh và cửa sổ `now > thoi_gian + check_in_sau_phut` (Q22; `NotDue` = `CHUA_QUA_GIO_HEN`).
//  - `QuanTriVien` (override, B14): `canAct` theo `BranchAccessPolicy`, KHÔNG điều kiện thời gian (quy tắc 40); nguồn do ma trận Q24 quyết nên gồm cả `DaTiepDon`; B14 ghi audit trong `onChanged` (tuỳ chọn, `on-changed.ts`), gọi SAU
//    thông báo, dưới khoá, cùng giao dịch (cộng thêm vào biến thể này, kết quả trả về không đổi).
//  - `HeThong` (job B13): `isDue(em)` là mệnh đề "ca đã kết thúc" của job, kiểm LẠI dưới khoá lịch (cùng hằng SQL với câu chọn ứng viên); B13 mở MỘT giao dịch riêng mỗi lịch và đổi lỗi ném thành `Failed` bằng
//    `failureOf`. Thêm biến thể cho người gọi mới là CỘNG THÊM vào union, không đổi chữ ký cũ.
// Nguồn hợp lệ do `canTransition` quyết (không cứng `DaXacNhan`). `now` và `config` do người gọi đọc NGOÀI giao dịch một lần (thân chạy lại được); `config === null` ⇒ `ConfigMissing`, không đoán ngưỡng (quy tắc 35).
//
// THỨ TỰ KHOÁ (PLAN 5.3): đọc THƯỜNG `benh_nhan_id` và `chi_nhanh_id` của lịch (cột bất biến) → `benh_nhan FOR UPDATE` (tầng 2) → `lich_hen FOR UPDATE` theo khoá chính (tầng 6) → kiểm LẠI phạm vi, trạng thái
// và điều kiện dưới khoá → ghi (`lich_hen`, `benh_nhan`) → `thong_bao` (tầng 7, SAU khi đã khoá lịch: CFP-08). KHÔNG khoá `khung_gio`: khung giờ giữ `DaDat` (INV-3), không giải phóng và không `WaitlistPort`.
// `benh_nhan` được khoá TRƯỚC `lich_hen` nên hai lịch của cùng một tài khoản nối đuôi nhau (VM-15, DT-15).
// CHU TRÌNH ĐÃ ĐO (B12-Q, 12/11/2026; Đại chấp nhận, phương án (1); bằng chứng `SHOW ENGINE INNODB STATUS` ở CT-13, cơ chế ở NSH-11): mọi `UPDATE lich_hen SET trang_thai` (của `cancel`, `expire`, `confirmPaid`, `checkIn`, `complete`) xin NGẦM
// khoá S trên hàng cha `benh_nhan` sau khi đã giữ X trên `lich_hen` (chỉ mục khoá ngoại `lich_hen_index_9 (benh_nhan_id, trang_thai, thoi_gian)` có cột `trang_thai`), tức thứ tự `lich_hen` rồi `benh_nhan`, NGƯỢC chiều hai bước khoá của hàm này. Vậy
// `markNoShow` đua đổi trạng thái của CÙNG MỘT lịch có thể bị 1213 (hàm này giữ `benh_nhan` X và chờ `lich_hen`, bên kia giữ `lich_hen` X và chờ S trên `benh_nhan`): `withBookingTransaction` hoàn tác và CHẠY LẠI thân, kết quả luôn đúng, 503
// chỉ khi ba lần liền. Người gọi PHẢI gọi trong vỏ `withBookingTransaction` (thân chạy lại được); job B13 coi hết lượt là `Failed` và lượt sau chạy lại. Hai lịch KHÁC nhau của cùng tài khoản và `create` không có cạnh ngược mới từ hàm này;
// trường hợp CÓ SẴN từ trước (`create` khoá `benh_nhan` X rồi `khung_gio` X đua `cancel` hay `expire` của lịch khác của cùng Bệnh nhân trên cùng khung giờ) cùng cơ chế: TECH_DEBT dòng 113.
// Thông báo đi cho tài khoản ĐẶT (`lich_hen.benh_nhan_id`, kể cả lịch của hồ sơ người thân, Q14) và gắn với CHÍNH lịch này; `KhoaDatLichNoShow` đúng MỘT lần khi cờ chuyển `false` sang `true`, cờ đã bật thì
// chỉ tăng số (VM-06); sau khi Quản trị viên mở khoá mà số vẫn >= ngưỡng thì khoá lại ngay (VM-07, Q25).

export type MarkNoShowInput = {
  lichHenId: string;
  /** Mốc của lượt: người gọi đã `toSecond(nowVN())`; hàm KHÔNG tự đọc đồng hồ (H8) */
  now: Date;
  /** `SystemConfigService.get()` đọc ngoài giao dịch; `null` (chưa có cấu hình) ⇒ `ConfigMissing` */
  config: StatusConfig | null;
} & (
  | {
      actor: 'LeTan';
      /** Chi nhánh của Lễ tân (từ `ReceptionScopeService`); lịch ngoài chi nhánh ⇒ `NotFound` */
      chiNhanhId: string;
    }
  | {
      actor: 'QuanTriVien';
      /** Phạm vi theo `BranchAccessPolicy.canAccessBranch`; `false` ⇒ `NotFound`. Gọi hai lần: lần đọc thường và LẠI dưới khoá */
      canAct: (target: { chiNhanhId: string }) => boolean;
      /** Điểm cắm audit của override (B14): gọi một lần SAU thông báo, dưới khoá, kèm trạng thái nguồn đọc dưới khoá (`on-changed.ts`); ném ⇒ người gọi hoàn tác TẤT CẢ */
      onChanged?: OnChanged;
    }
  | {
      actor: 'HeThong';
      /** "Đến hạn tự Vắng mặt" của job (B13), kiểm dưới khoá lịch; `false` ⇒ `NotDue` */
      isDue: (em: EntityManager) => Promise<boolean>;
    }
);

export type MarkNoShowOutcome =
  /** Lịch `VangMat`, `so_lan_no_show` đã cộng 1 (`soLanNoShow` là số MỚI); `khoaDatLich` = cờ khoá vừa được bật ở lần này; đã ghi thông báo trong `em` */
  | { kind: 'NoShowed'; soLanNoShow: number; khoaDatLich: boolean }
  /** Không có lịch đó, hoặc ngoài phạm vi của người gọi: cùng một 404 */
  | { kind: 'NotFound' }
  /** Ma trận không cho `actor` đi từ trạng thái này sang `VangMat` (job: "không còn `DaXacNhan`"; bấm đúp: đã `VangMat`) */
  | { kind: 'InvalidState'; trangThai: TrangThaiLichHen }
  /** Chưa đến hạn: Lễ tân chưa quá `thoi_gian + check_in_sau_phut` (`CHUA_QUA_GIO_HEN`), hoặc ca của job chưa kết thúc */
  | { kind: 'NotDue' }
  /** Chưa có `cau_hinh_he_thong` (quy tắc 35): không đoán ngưỡng */
  | { kind: 'ConfigMissing' };

export interface MarkNoShowDeps {
  notifier: AppointmentNotifier;
}

// Từ chối của ma trận cho đích `VangMat` đổi sang kết quả có kiểu. `ChiBacSiHoanThanh`, `ConPhanChuaThanhToan` và `NgoaiKhungGioTiepDon` không thể ra với đích này.
function refusalOf(
  decision: Extract<TransitionDecision, { ok: false }>,
  trangThai: TrangThaiLichHen,
): Extract<
  MarkNoShowOutcome,
  { kind: 'InvalidState' | 'NotDue' | 'ConfigMissing' }
> {
  switch (decision.reason) {
    case 'KhongHopLe':
      return { kind: 'InvalidState', trangThai };
    case 'ChuaQuaGioHen':
      return { kind: 'NotDue' };
    case 'ThieuDuLieu':
      return { kind: 'ConfigMissing' };
    case 'ChiBacSiHoanThanh':
    case 'ConPhanChuaThanhToan':
    case 'NgoaiKhungGioTiepDon':
      throw new Error(
        `ma trận từ chối ${decision.reason} cho đích VangMat: nhánh không có trong markNoShow`,
      );
  }
}

// Phạm vi theo người gọi (404 khi `false`); dùng cả ở lần đọc thường lẫn dưới khoá (5.3 quy tắc 2)
function inScope(input: MarkNoShowInput, chiNhanhId: string): boolean {
  switch (input.actor) {
    case 'LeTan':
      return chiNhanhId === input.chiNhanhId;
    case 'QuanTriVien':
      return input.canAct({ chiNhanhId });
    case 'HeThong':
      return true;
  }
}

/** Thân của `markNoShow` (họ B: chỉ nhận `em`). Có thể chạy lại từ đầu khi vỏ của người gọi thử lại: không giữ trạng thái, không tác dụng phụ ngoài `em`. */
export async function markNoShowWithin(
  em: EntityManager,
  input: MarkNoShowInput,
  deps: MarkNoShowDeps,
): Promise<MarkNoShowOutcome> {
  const now = toSecond(input.now);

  // Bước 1: đọc thường cột bất biến; ngoài phạm vi thì dừng NGAY, trước khi xin bất kỳ khoá nào (người ngoài phạm vi không được tranh khoá `benh_nhan` của người khác)
  const keys = await readLichHenKeys(em, input.lichHenId);
  if (keys === null || !inScope(input, keys.chiNhanhId))
    return { kind: 'NotFound' };

  // Bước 2: tầng 2. Không có hàng `benh_nhan` cho tài khoản đặt của một lịch là dữ liệu lệch (khoá ngoại `lich_hen.benh_nhan_id`): ném `Error`
  const counter = await lockNoShowCounter(em, keys.benhNhanId);
  if (counter === null)
    throw new Error(
      `tài khoản ${keys.benhNhanId} của lịch ${input.lichHenId} không có hàng benh_nhan`,
    );

  // Bước 2 đến 3: tầng 6 theo khoá chính, rồi kiểm LẠI phạm vi và trạng thái dưới khoá
  const row = await lockAppointment(em, input.lichHenId);
  if (row === null || !inScope(input, row.chiNhanhId))
    return { kind: 'NotFound' };
  if (row.benhNhanId !== keys.benhNhanId)
    throw new Error(
      `lịch ${input.lichHenId} đổi tài khoản đặt giữa hai lần đọc (cột bất biến)`,
    );

  // Bước 4: ma trận với trạng thái nguồn ĐỌC DƯỚI KHOÁ. Chỉ `LeTan` có điều kiện thời gian trong ma trận; `HeThong` có `isDue` bên dưới, `QuanTriVien` không có điều kiện (quy tắc 40).
  const ctx: TransitionContext = {};
  if (input.actor === 'LeTan') {
    const window = windowOf(input.config, now, row.thoiGian);
    if (window !== undefined) ctx.window = window;
  }
  const decision = canTransition({
    actor: input.actor,
    from: row.trangThai,
    to: 'VangMat',
    ctx,
  });
  // Bước 6: từ chối là KẾT QUẢ CÓ KIỂU, trước lần ghi đầu tiên nên không có gì để hoàn tác
  if (!decision.ok) return refusalOf(decision, row.trangThai);
  // Ngưỡng cần cho mọi người gọi: không đoán khi chưa có cấu hình (quy tắc 35)
  const { config } = input;
  if (config === null) return { kind: 'ConfigMissing' };
  if (input.actor === 'HeThong' && !(await input.isDue(em)))
    return { kind: 'NotDue' };

  // Bước 5: `UPDATE` lịch có điều kiện nguồn, rồi bộ đếm. Lỗi nào sau lần ghi đầu cũng là `Error` thường: hoàn tác CẢ lịch, bộ đếm, cờ và thông báo, không commit nửa chừng.
  const changed = await setStatus(em, {
    lichHenId: input.lichHenId,
    from: row.trangThai,
    to: 'VangMat',
  });
  if (!changed)
    throw new Error(
      `lịch hẹn ${input.lichHenId} không còn ${row.trangThai} dưới khoá khi đánh Vắng mặt`,
    );
  if (!(await incrementNoShow(em, row.benhNhanId)))
    throw new Error(
      `không cộng được so_lan_no_show của tài khoản ${row.benhNhanId}`,
    );
  const after = await readNoShowCounter(em, row.benhNhanId);
  if (after === null)
    throw new Error(
      `tài khoản ${row.benhNhanId} biến mất dưới khoá khi cộng no-show`,
    );
  // Số mới >= ngưỡng (đạt HOẶC vượt, Q25) và cờ đang tắt ⇒ bật cờ. Cờ đã bật thì KHÔNG bật lại và không cảnh báo lặp (A4/10b).
  const locksNow = after.soLan >= config.nguongNoShow && !after.khoa;
  if (locksNow && !(await setNoShowLock(em, row.benhNhanId)))
    throw new Error(
      `không bật được cờ khoá đặt lịch của tài khoản ${row.benhNhanId}`,
    );

  // Bước 7: thông báo ghi TRONG giao dịch, SAU khi đã khoá lịch (CFP-08), cho tài khoản ĐẶT và gắn với chính lịch này. Lỗi `notify` nổi lên, không bị nuốt: hoàn tác theo.
  await deps.notifier.notify(em, {
    loaiSuKien: BOOKING_NOTIFICATION_EVENTS.NO_SHOW,
    lichHenId: input.lichHenId,
    taiKhoanId: row.benhNhanId,
  });
  if (locksNow)
    await deps.notifier.notify(em, {
      loaiSuKien: BOOKING_NOTIFICATION_EVENTS.NO_SHOW_LOCK,
      lichHenId: input.lichHenId,
      taiKhoanId: row.benhNhanId,
    });
  // Điểm cắm audit của Quản trị viên (B14): SAU thông báo (audit là tầng 7, bảng chỉ-thêm), dưới khoá, một lần; ném ⇒ người gọi hoàn tác trọn (lịch, bộ đếm, cờ, thông báo)
  if (input.actor === 'QuanTriVien')
    await input.onChanged?.(em, { from: row.trangThai });
  return {
    kind: 'NoShowed',
    soLanNoShow: after.soLan,
    khoaDatLich: locksNow,
  };
}
