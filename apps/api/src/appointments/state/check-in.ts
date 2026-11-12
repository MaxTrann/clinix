import type { EntityManager } from 'typeorm';
import type { TrangThaiLichHen } from '../../admin/entities/enums.js';
import { toSecond } from '../../common/time/time.js';
import {
  canTransition,
  type TransitionContext,
  type TransitionDecision,
} from './appointment-state.matrix.js';
import { lockAppointment } from './cancel-appointment.query.js';
import { setStatus } from './set-status.query.js';
import { windowOf, type StatusConfig } from './status-config.js';

// `AppointmentTransitionService.checkIn` (task B12; PLAN booking 5.2, 5.7, 5.10 B; Q21, Q22; quy tắc 40, 46, 47; TRACKING 3.26 B12-C): `DaXacNhan` thành `DaTiepDon`. Hai người gọi: route của LỄ TÂN
// (`ReceptionStatusService`, mở giao dịch riêng) và `payment` B17 (thu tiền mặt tại quầy, gọi TRONG giao dịch của nó). Họ B của khuôn bảy bước (chú thích đầu `appointment-transition.service.ts`): nhận `em`
// của NGƯỜI GỌI, KHÔNG mở giao dịch, KHÔNG bắt lỗi DB, KHÔNG ném `AppException`; kết quả là giá trị có kiểu, người gọi đổi sang lỗi API SAU commit.
//
// `actor` là union gắn với dữ liệu riêng của từng người gọi (như `CancelInput` của B10), thay cờ `requireFullyPaid` của PLAN: cờ boolean để người gọi `LeTan` tắt được kiểm tiền, union thì không biên dịch.
//  - `LeTan`: phạm vi chi nhánh (kiểm LẠI dưới khoá, 404) và `remainingToCollect` (đọc DƯỚI khoá lịch, đúng chỗ quy tắc 46 đòi); đòi `conPhaiThu = 0` (A2) và cửa sổ.
//  - `ThanhToan`: `payment` tự ghi tiền trong giao dịch của nó nên KHÔNG đòi `conPhaiThu = 0` (quy tắc 46, ô `ThanhToan` của ma trận) nhưng VẪN đòi cửa sổ (quy tắc 40). Phạm vi chi nhánh là việc của
//    `payment` (quy tắc 45 b).
// Luật nằm ở `canTransition` (một nơi, dùng cả cho `chuyenDuoc[]` của B3); ở đây chỉ dựng ngữ cảnh rồi đổi từ chối của ma trận thành kết quả có kiểu.
//
// KHOÁ: chỉ `lich_hen` theo khoá chính (tầng 6, quy tắc 7). KHÔNG khoá `khung_gio` (khung giờ giữ `DaDat`, INV-3) và KHÔNG khoá `benh_nhan`. KHÔNG thông báo (PLAN 5.12 không có sự kiện tiếp đón) và không
// cổng nào sau commit. `now` và `config` do người gọi đọc NGOÀI giao dịch một lần: thân chạy lại được khi 1213, 1205 (`withBookingTransaction`) mà không giữ trạng thái.
//
// ĐIỀU KIỆN NGƯỜI GỌI `payment` (B17) PHẢI GIỮ (TRACKING 3.26 B12-C; CKI-08 chứng minh): (1) gọi trong giao dịch của chính mình qua `withBookingTransaction`, thân chạy lại được; (2) gọi `checkIn` TRƯỚC mọi
// INSERT vào bảng có khoá ngoại tới `lich_hen` (`giao_dich_thanh_toan`, `thong_bao`…), HOẶC sau khi chính `payment` đã `SELECT … FOR UPDATE` hàng `lich_hen` theo khoá chính (quy tắc 46 bước 2). LÝ DO (đo ở
// B12-S, CKI-08): ghi bảng con trước rồi mới khoá X thì HAI lần thu tiền cùng một lịch (hai Lễ tân hay hai tab) cùng giữ khoá S trên hàng cha rồi cùng nâng lên X ⇒ deadlock 1213 (thử lại xử lý được, kết quả đúng).
// KHÔNG phải đua với `cancel`: yêu cầu nâng S lên X được InnoDB cấp vượt hàng đợi nên `cancel` đang chờ không tạo chu trình (đo 0 lần 1213). `confirmPaid` KHÁC `checkIn`: CFP-08 (B11) deadlock qua `khung_gio` vì
// `confirmPaid` xin `khung_gio` còn `checkIn` thì không; (3) không đang giữ khoá `khung_gio`; (4) `InvalidState`, `OutsideWindow`, `ConfigMissing`, `NotFound` ⇒ KHÔNG ghi tiền (hoàn tác giao dịch của mình).

export type CheckInInput = {
  lichHenId: string;
  /** Mốc của lượt: người gọi đã `toSecond(nowVN())`; hàm KHÔNG tự đọc đồng hồ (H8) */
  now: Date;
  /** `SystemConfigService.get()` đọc ngoài giao dịch; `null` (chưa có cấu hình) ⇒ `ConfigMissing` */
  config: StatusConfig | null;
} & (
  | {
      actor: 'LeTan';
      /** Chi nhánh của Lễ tân (từ `ReceptionScopeService`, không từ người dùng); lịch ngoài chi nhánh ⇒ `NotFound` */
      chiNhanhId: string;
      /** Số còn phải thu (`PaymentSummaryPort.remainingToCollect`), được gọi DƯỚI khoá lịch và chỉ khi lịch `DaXacNhan` và đã có cấu hình */
      remainingToCollect: (em: EntityManager) => Promise<string>;
    }
  | {
      /** Thanh toán offline tại quầy (B17): tự ghi tiền nên không đòi `conPhaiThu = 0`; vẫn đòi cửa sổ */
      actor: 'ThanhToan';
    }
);

export type CheckInOutcome =
  /** `DaXacNhan` thành `DaTiepDon`; khung giờ giữ `DaDat`; không thông báo */
  | { kind: 'CheckedIn' }
  /** Không có lịch đó, hoặc (`LeTan`) lịch ngoài chi nhánh: cùng một 404 */
  | { kind: 'NotFound' }
  /** Lịch không còn `DaXacNhan` dưới khoá (kể cả đã `DaTiepDon`: bấm đúp là `InvalidState`, không có `AlreadyCheckedIn`) */
  | { kind: 'InvalidState'; trangThai: TrangThaiLichHen }
  /** Chưa có `cau_hinh_he_thong` (quy tắc 35): không đoán số phút */
  | { kind: 'ConfigMissing' }
  /** Chỉ `LeTan`: còn phải thu (A2), `conPhaiThu` là chuỗi decimal */
  | { kind: 'OwedAmount'; conPhaiThu: string }
  /** Ngoài `[thoi_gian − truoc, thoi_gian + sau]` (đóng hai đầu, Q22) */
  | { kind: 'OutsideWindow'; tu: Date; den: Date };

type CheckInRefusal = Exclude<
  CheckInOutcome,
  { kind: 'CheckedIn' } | { kind: 'NotFound' }
>;

// Từ chối của ma trận cho đích `DaTiepDon` đổi sang kết quả có kiểu. `ChiBacSiHoanThanh` và `ChuaQuaGioHen` không thể ra với đích này: nếu ra là ma trận đã đổi mà chỗ này chưa theo.
function refusalOf(
  decision: Extract<TransitionDecision, { ok: false }>,
  trangThai: TrangThaiLichHen,
): CheckInRefusal {
  switch (decision.reason) {
    case 'KhongHopLe':
      return { kind: 'InvalidState', trangThai };
    case 'ThieuDuLieu':
      return { kind: 'ConfigMissing' };
    case 'ConPhanChuaThanhToan':
      return { kind: 'OwedAmount', conPhaiThu: decision.conPhaiThu };
    case 'NgoaiKhungGioTiepDon':
      return { kind: 'OutsideWindow', tu: decision.tu, den: decision.den };
    case 'ChiBacSiHoanThanh':
    case 'ChuaQuaGioHen':
      throw new Error(
        `ma trận từ chối ${decision.reason} cho đích DaTiepDon: nhánh không có trong checkIn`,
      );
  }
}

/** Thân của `checkIn` (họ B: chỉ nhận `em`). Có thể chạy lại từ đầu khi vỏ của người gọi thử lại: không giữ trạng thái, không tác dụng phụ ngoài `em`. */
export async function checkInWithin(
  em: EntityManager,
  input: CheckInInput,
): Promise<CheckInOutcome> {
  const now = toSecond(input.now);

  // Bước 2 đến 3: khoá `lich_hen` theo khoá chính (tầng 6) rồi kiểm LẠI phạm vi và trạng thái dưới khoá. Phạm vi TRƯỚC trạng thái: người ngoài phạm vi không đoán được trạng thái của lịch người khác.
  const row = await lockAppointment(em, input.lichHenId);
  if (row === null) return { kind: 'NotFound' };
  if (input.actor === 'LeTan' && row.chiNhanhId !== input.chiNhanhId)
    return { kind: 'NotFound' };

  // Bước 4: ngữ cảnh cho ma trận. Số còn phải thu CHỈ được hỏi khi ma trận sẽ dùng đến nó (`LeTan`, lịch `DaXacNhan`, đã có cấu hình), và hỏi DƯỚI khoá lịch (quy tắc 46).
  const ctx: TransitionContext = {};
  const window = windowOf(input.config, now, row.thoiGian);
  if (window !== undefined) ctx.window = window;
  if (
    input.actor === 'LeTan' &&
    row.trangThai === 'DaXacNhan' &&
    window !== undefined
  )
    ctx.conPhaiThu = await input.remainingToCollect(em);
  const decision = canTransition({
    actor: input.actor,
    from: row.trangThai,
    to: 'DaTiepDon',
    ctx,
  });
  // Bước 6: từ chối là KẾT QUẢ CÓ KIỂU, trước lần ghi đầu tiên nên không có gì để hoàn tác
  if (!decision.ok) return refusalOf(decision, row.trangThai);

  // Bước 5: `UPDATE` có điều kiện trạng thái nguồn. Không còn đúng 1 hàng dưới khoá là dữ liệu lệch: ném `Error` để người gọi hoàn tác trọn.
  const changed = await setStatus(em, {
    lichHenId: input.lichHenId,
    from: row.trangThai,
    to: 'DaTiepDon',
  });
  if (!changed)
    throw new Error(
      `lịch hẹn ${input.lichHenId} không còn ${row.trangThai} dưới khoá khi tiếp đón`,
    );
  return { kind: 'CheckedIn' };
}
