import type { PaymentView } from '../ports/payment.port.js';
import type { RefundView } from '../ports/wallet.port.js';
import { canTransition } from '../state/appointment-state.matrix.js';
import { toItemCore } from './list-item.mapper.js';
import type {
  PatientAppointmentDetail,
  PatientAppointmentItem,
  PatientVisibleState,
} from './patient-appointments.dto.js';
import type {
  PatientAppointmentDetailRow,
  PatientAppointmentRow,
} from './patient-appointments.repository.js';

// Ánh xạ hàng thô thành JSON cho Bệnh nhân, dùng CHUNG cho danh sách (B1) và chi tiết (B2): chỉ MỘT nơi viết `choPhepHuy` và mười hai khoá của một lịch (task B2;
// TRACKING 3.15 B2-B). Chỉ liệt kê từng khoá (không trải hàng thô): cột thừa của repository, như `lichHenId`, không bao giờ ra ngoài (LSH-14).

/** Bệnh nhân huỷ được không: hỏi ma trận P1 (LSH-13), không viết lại luật; ma trận đổi thì `choPhepHuy` đổi theo. Không cần `ctx` (không có điều kiện thời gian cho Bệnh nhân huỷ). */
export function canPatientCancel(trangThai: PatientVisibleState): boolean {
  return canTransition({ actor: 'BenhNhan', from: trangThai, to: 'DaHuy' }).ok;
}

// Mười khoá chung (`toItemCore`, dùng cả cho Lễ tân và Quản trị viên) cộng hai khoá riêng của Bệnh nhân: `hanThanhToan` và `choPhepHuy`. Thứ tự khoá trong JSON giữ như trước.
export function toItem(row: PatientAppointmentRow): PatientAppointmentItem {
  return {
    ...toItemCore(row),
    hanThanhToan: row.hanThanhToan?.toISOString() ?? null,
    choPhepHuy: canPatientCancel(row.trangThai),
  };
}

// Cổng là mã của module khác: ánh xạ TỪNG khoá của hình dạng đã khai, để bản thật có trả thừa trường (mã cổng thanh toán, id ví, người thu) thì cũng không lọt ra JSON.
function toPayment(view: PaymentView | null): PaymentView | null {
  if (view === null) return null;
  return {
    daThu: view.daThu,
    conPhaiThu: view.conPhaiThu,
    giaoDich: view.giaoDich.map((entry) => ({
      phuongThuc: entry.phuongThuc,
      soTien: entry.soTien,
      thoiDiem: entry.thoiDiem,
    })),
  };
}

function toRefund(view: RefundView | null): RefundView | null {
  if (view === null) return null;
  return {
    soTien: view.soTien,
    trangThai: view.trangThai,
    thoiDiem: view.thoiDiem,
  };
}

/** Chi tiết = mười hai khoá của `toItem` cộng bốn khoá. `serverTime` do người gọi lấy (đồng hồ giả được trong test); ISO 8601 UTC, GIỮ mili giây (3.15.1, câu (d)). */
export function toDetail(
  row: PatientAppointmentDetailRow,
  extras: {
    thanhToan: PaymentView | null;
    hoanTien: RefundView | null;
    serverTime: Date;
  },
): PatientAppointmentDetail {
  return {
    ...toItem(row),
    lyDoKham: row.lyDoKham,
    thanhToan: toPayment(extras.thanhToan),
    hoanTien: toRefund(extras.hoanTien),
    thoiGianMayChu: extras.serverTime.toISOString(),
  };
}
