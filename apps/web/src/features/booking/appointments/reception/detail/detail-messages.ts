import { COMMON_ACTION_TEXT } from '../../common/action-text';
import { COMMON_LIST_TEXT } from '../../common/list-text';

// Chữ của ngăn chi tiết lịch hẹn của Lễ tân (booking F8). Chữ của Figma `488:2`, `495:2` đến `497:2` khi có (tiêu đề ba khối, nhãn dòng, `Danh sách`, tên nút); còn lại là
// [đề xuất], chờ nhóm duyệt (Figma chưa có frame cho `Đã hủy`, `Vắng mặt`, `Chờ thanh toán`, lỗi, đang tải: PLAN 4.5). Đã bỏ `Email` (API không trả, Q32) và `Kênh đặt` (Q37).
export const DETAIL_TEXT = {
  dialogPrefix: 'Chi tiết lịch hẹn ',
  back: 'Danh sách',
  // Figma không có nút đóng (chỉ có liên kết `Danh sách`): nút X và Esc là [đề xuất] cho trợ năng (Đại duyệt 12/11/2026)
  close: 'Đóng',
  loading: 'Đang tải chi tiết lịch hẹn...',
  notFound: COMMON_ACTION_TEXT.notFound,
  sessionExpired: COMMON_LIST_TEXT.sessionExpired,
  forbidden: 'Bạn không có quyền xem lịch hẹn này.',
  sections: {
    patient: 'THÔNG TIN BỆNH NHÂN',
    doctor: 'BÁC SĨ & CHUYÊN KHOA',
    appointment: 'CHI TIẾT LỊCH HẸN',
  },
  rows: {
    name: 'Họ tên',
    booker: 'Người đặt',
    phone: 'Số điện thoại',
    reason: 'Lý do khám',
    doctor: 'Bác sĩ',
    specialty: 'Chuyên khoa',
    service: 'Dịch vụ',
    price: 'Giá khám',
    code: 'Mã lịch',
    date: 'Ngày khám',
    branch: 'Chi nhánh',
    deposit: 'Tiền cọc',
    paymentDeadline: 'Hạn thanh toán',
    cancelReason: 'Lý do hủy',
    due: 'Còn phải thu',
  },
  ownPerson: 'Bản thân',
  relativePerson: 'Người thân',
  bookerPhone: 'Của người đặt',
  noReason: 'Không ghi lý do',
  actionsGroup: 'Thao tác',
  // Nút chưa có hành động tới F9 (B12 chưa merge): vô hiệu kèm chữ ẩn cho trình đọc màn hình
  notImplementedHidden: '(chưa được triển khai)',
  // `Thu tiền & tiếp đón` thuộc `payment` (LTN-05): vô hiệu kèm chữ HIỆN
  notImplemented: 'Chưa được triển khai',
} as const;

// Dòng phụ dưới mã lịch, Figma "18/10 lúc 08:00"
export const whenLabel = (shortDate: string, time: string) =>
  `${shortDate} lúc ${time}`;

// "Ngày khám" và "Hạn thanh toán": "Thứ 3, 20/10/2026 · 08:00" (Figma ghi "18/10 · 08:00"; thêm thứ và năm vì API có đủ: [đề xuất])
export const dateTimeLabel = (weekdayDate: string, time: string) =>
  `${weekdayDate} · ${time}`;

// ---- Hộp huỷ, hộp vắng mặt, tiếp đón (booking F9) ----
// Chữ của Figma `490:2` (Hủy lịch hẹn: tiêu đề, `Lý do hủy *`, `Đóng`, `Xác nhận hủy`) và `489:2` (Đánh dấu vắng mặt: tiêu đề, câu xác nhận, `Hủy`, `Xác nhận`) khi có; còn lại là
// [đề xuất], chờ nhóm duyệt (Figma chưa có frame cho lỗi, đang gửi, kết quả, hộp xác nhận tiếp đón: TRACKING 3.30 F9-E). Câu lý do và lỗi lấy từ PLAN 5.14 khi có.
export const ACTION_TEXT = {
  cancel: {
    title: 'Hủy lịch hẹn',
    reasonLabel: 'Lý do hủy',
    close: 'Đóng',
    confirm: 'Xác nhận hủy',
    confirming: 'Đang hủy…',
    // PLAN 5.14 `LY_DO_BAT_BUOC`
    reasonRequired: COMMON_ACTION_TEXT.reasonRequired,
    reasonTooLong: 'Lý do hủy tối đa 255 ký tự.',
    done: 'Đã hủy lịch hẹn.',
  },
  noShow: {
    title: 'Đánh dấu vắng mặt',
    patientPrefix: 'Bệnh nhân ',
    willBeMarked:
      ' sẽ được ghi nhận vắng mặt. Thao tác này không thể hoàn tác.',
    keep: 'Hủy',
    confirm: 'Xác nhận',
    confirming: 'Đang ghi nhận…',
    done: 'Đã ghi nhận vắng mặt.',
  },
  checkIn: {
    confirming: 'Đang tiếp đón…',
    done: 'Đã tiếp đón bệnh nhân.',
  },
  reload: COMMON_ACTION_TEXT.reload,
  close: COMMON_ACTION_TEXT.close,
  forbidden: COMMON_ACTION_TEXT.forbidden,
  // PLAN 5.14 `CHI_BAC_SI_HOAN_THANH` (chung, ở `common/action-text.ts`) và `CHUA_QUA_GIO_HEN` (riêng của Lễ tân)
  onlyDoctorCompletes: COMMON_ACTION_TEXT.onlyDoctorCompletes,
  windowNotOver: 'Chưa hết thời gian tiếp đón nên chưa thể đánh dấu vắng mặt.',
  notConfigured: COMMON_ACTION_TEXT.notConfigured,
  // `CON_PHAN_CHUA_THANH_TOAN`: bỏ vế "Vui lòng thu tiền tại quầy trước khi tiếp đón." của PLAN 5.14 tới B17, vì nút `Thu tiền & tiếp đón` còn vô hiệu (Đại duyệt 13/11/2026)
  unpaidUnknown: 'Lịch hẹn còn khoản chưa thanh toán nên chưa thể tiếp đón.',
  windowUnknown: 'Hiện chưa trong khung giờ tiếp đón của lịch hẹn này.',
  transitionUnknown: COMMON_ACTION_TEXT.transitionUnknown,
  // POST không biết kết quả khi mất mạng, quá giờ hay phản hồi lạ: máy chủ có thể đã xử lý xong (nếp F2). Bấm lại thủ công an toàn: lần hai ra 409 cùng đích.
  unsure: {
    DaHuy: 'Mất kết nối khi đang hủy, chưa rõ lịch hẹn đã được hủy hay chưa.',
    VangMat:
      'Mất kết nối khi đang ghi nhận, chưa rõ lịch hẹn đã được đánh dấu vắng mặt hay chưa.',
    DaTiepDon:
      'Mất kết nối khi đang tiếp đón, chưa rõ bệnh nhân đã được tiếp đón hay chưa.',
  },
} as const;

export const unpaidLabel = (amount: string) =>
  `Lịch hẹn còn ${amount} chưa thanh toán nên chưa thể tiếp đón.`;

// Hai mốc cùng một ngày Việt Nam ⇒ ghi ngày MỘT lần; khác ngày ⇒ ghi ngày ở từng mốc. Hai biên là đóng nên hiện đúng hai mốc.
export const windowSameDayLabel = (from: string, to: string, date: string) =>
  `Chỉ tiếp đón từ ${from} đến ${to} ngày ${date}.`;
export const windowTwoDaysLabel = (
  from: string,
  fromDate: string,
  to: string,
  toDate: string,
) => `Chỉ tiếp đón từ ${from} ngày ${fromDate} đến ${to} ngày ${toDate}.`;

// Hai câu chuyển trạng thái dùng chung ở `common/action-text.ts` (F10); xuất lại để các chỗ import cũ vẫn chạy
export { alreadyInStateLabel, transitionLabel } from '../../common/action-text';
