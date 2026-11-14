import { COMMON_ACTION_TEXT } from '../../common/action-text';
import { COMMON_LIST_TEXT } from '../../common/list-text';
import type { OverrideTarget } from '../api/admin-appointment-types';

// Chữ của trang chi tiết lịch hẹn của Quản trị viên và hộp override (booking F10). Chữ của Figma `512:2` khi có (`Quay lại danh sách`, `Chi tiết lịch hẹn`, tiêu đề các thẻ, nhãn dòng, câu rỗng
// của panel lịch sử); còn lại là [đề xuất], chờ nhóm duyệt (Figma chưa có frame cho hộp override, đang gửi, lỗi, panel khi lỗi: PLAN 4.5, TRACKING 3.35 F10-F). Đã bỏ `Email`, `Giới tính`,
// `Ngày sinh` (B4 không trả, Q32), `Kênh đặt` (không có cột) và thẻ `Thanh toán` (B4 không trả `thanhToan`).
export const DETAIL_TEXT = {
  back: 'Quay lại danh sách',
  title: 'Chi tiết lịch hẹn',
  loading: 'Đang tải chi tiết lịch hẹn...',
  notFound: COMMON_ACTION_TEXT.notFound,
  sessionExpired: COMMON_LIST_TEXT.sessionExpired,
  forbidden: 'Bạn không có quyền xem lịch hẹn này.',
  // Tên vùng của thẻ đầu (F12, như trang Bệnh nhân)
  summary: 'Tóm tắt lịch hẹn',
  sections: {
    appointment: 'Thông tin lịch hẹn',
    // F12: tiền đi cùng nhau trong một thẻ như trang Bệnh nhân (chỗ của thẻ `Thanh toán` ở Figma `512:2`)
    cost: 'Chi phí & Thanh toán',
    patient: 'Thông tin bệnh nhân',
    history: 'Lịch sử trạng thái',
    actions: 'Thao tác',
  },
  rows: {
    date: 'Ngày khám',
    time: 'Giờ khám',
    doctor: 'Bác sĩ',
    specialty: 'Chuyên khoa',
    service: 'Dịch vụ',
    branch: 'Chi nhánh',
    price: 'Giá khám',
    deposit: 'Tiền cọc',
    paymentDeadline: 'Hạn thanh toán',
    cancelReason: 'Lý do hủy',
    due: 'Còn phải thu',
    person: 'Người khám',
    name: 'Họ tên',
    booker: 'Người đặt',
    phone: 'Số điện thoại',
    reason: 'Lý do khám',
  },
  ownPerson: 'Bản thân',
  relativePerson: 'Người thân',
  bookerPhone: 'Của người đặt',
  noReason: 'Không ghi lý do',
  // Panel "Lịch sử trạng thái"
  history: {
    // Figma `512:2` (chữ nghiêng): chỉ dùng khi mảng rỗng, bình thường luôn có mục `TaoLich`
    empty: 'Chưa có lịch sử trạng thái được ghi nhận',
    created: 'Tạo lịch hẹn',
    cancelled: 'Hủy lịch hẹn',
    reasonPrefix: 'Lý do: ',
    // Tiếp đón, Vắng mặt, xác nhận thanh toán không có mốc riêng (TECH_DEBT 111): nói thẳng để người xem không tưởng là đủ mọi lần đổi
    note: 'Chỉ ghi nhận tạo lịch, hủy và đổi trạng thái thủ công của Quản trị viên.',
  },
} as const;

// Dòng của mục `OverrideLichHen`: "Đổi trạng thái: Đã xác nhận → Vắng mặt"
export const overrideTitle = (from: string, to: string) =>
  `Đổi trạng thái: ${from} → ${to}`;

// Giờ của một mục lịch sử: "20/10/2026 · 08:00" (đã đổi sang giờ Việt Nam ở nơi gọi)
export const historyWhen = (date: string, time: string) => `${date} · ${time}`;

// ---- Hộp override và nhóm nút (B14; TRACKING 3.35 F10-F) ----
export const OVERRIDE_TEXT = {
  hint: 'Chuyển lịch hẹn sang trạng thái:',
  buttons: {
    DaTiepDon: 'Đã tiếp đón',
    DaXacNhan: 'Đã xác nhận',
    VangMat: 'Vắng mặt',
    DaHuy: 'Hủy lịch',
  },
  dialog: {
    title: 'Đổi trạng thái lịch hẹn',
    reasonLabel: 'Lý do',
    reasonTooLong: 'Lý do tối đa 255 ký tự.',
    close: 'Đóng',
    confirm: 'Xác nhận',
    confirming: 'Đang cập nhật…',
  },
  // Cảnh báo riêng từng đích (chữ [đề xuất]; số hoàn và số lần vắng mặt KHÔNG nằm ở đây: máy chủ trả hay không có)
  warnings: {
    DaHuy:
      'Lịch hẹn sẽ bị hủy và hoàn 100% số tiền đã thu. Thao tác này không thể hoàn tác.',
    VangMat:
      'Lịch hẹn sẽ được ghi nhận vắng mặt và cộng một lần vắng mặt cho bệnh nhân.',
    DaTiepDon: 'Bỏ qua cửa sổ tiếp đón và khoản còn phải thu.',
    // Sau B18 job tự Vắng mặt BỎ QUA lịch đã được override (TECH_DEBT 138): lịch khôi phục mà bệnh nhân vẫn vắng không bao giờ tự Vắng mặt, nên hộp phải nói đúng điều đó (booking F12, UI-13)
    DaXacNhan:
      'Khôi phục không trừ lần vắng mặt đã ghi. Hệ thống sẽ không tự đánh Vắng mặt lại lịch đã khôi phục: nếu bệnh nhân vẫn không đến, hãy đổi sang Vắng mặt thủ công. Nếu bệnh nhân đã đến, hãy chọn Đã tiếp đón.',
  } satisfies Record<OverrideTarget, string>,
  // POST không biết kết quả khi mất mạng, quá giờ hay phản hồi lạ: máy chủ có thể đã xử lý xong (nếp F2, F9). Bấm lại thủ công an toàn: lần hai ra 409 cùng đích.
  unsure: {
    DaHuy: 'Mất kết nối khi đang hủy, chưa rõ lịch hẹn đã được hủy hay chưa.',
    VangMat:
      'Mất kết nối khi đang ghi nhận, chưa rõ lịch hẹn đã được đánh dấu vắng mặt hay chưa.',
    DaTiepDon:
      'Mất kết nối khi đang tiếp đón, chưa rõ bệnh nhân đã được tiếp đón hay chưa.',
    DaXacNhan:
      'Mất kết nối khi đang khôi phục, chưa rõ lịch hẹn đã về trạng thái Đã xác nhận hay chưa.',
  } satisfies Record<OverrideTarget, string>,
} as const;

export const transitionSentence = (code: string, from: string, to: string) =>
  `Lịch hẹn ${code} sẽ chuyển từ ${from} sang ${to}.`;

export const doneLabel = (stateLabel: string) =>
  `Đã cập nhật trạng thái lịch hẹn sang ${stateLabel}.`;
