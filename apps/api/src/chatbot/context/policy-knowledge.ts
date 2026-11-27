import type { PolicyConfig } from './context.types.js';
import { parsePlaceholders } from './placeholder.js';

// Tệp chính sách của Trợ lý (chatbot B2; PLAN chatbot 5.6, Q11 "chưa dùng bài viết, thêm tệp chính sách"). Chữ do Đại duyệt nguyên văn ngày 27/11/2026;
// nhờ Trung đối chiếu P5 và P6 với mã booking trước khi merge. KHÔNG ghi số cứng: số đi qua chỗ giữ `[[CS:…]]` (máy chủ thay bằng giá trị đọc từ
// `cau_hinh_he_thong` lúc dựng đoạn) và `[[HOAN:id]]`. Mỗi câu nêu NGUỒN trong mã để người đọc đối chiếu được; nguồn là chữ ghi chú, không dùng lúc chạy.
// Tránh các từ mà luật V7 và V8 chặn ("miễn phí", "giảm giá", "kê đơn"…) để mô hình không bị mời nhắc lại.

export interface PolicyLine {
  /** Mã câu, dùng ở TRACKING. */
  readonly id: string;
  readonly text: string;
  /** Nguồn đối chiếu trong mã hay tài liệu (ghi chú). */
  readonly source: string;
}

export const POLICY_LINES: readonly PolicyLine[] = [
  {
    id: 'P1',
    text: 'Đặt lịch khám trực tuyến cần tài khoản Bệnh nhân đã đăng nhập và đã xác minh email bằng mã OTP.',
    source:
      '2.4.1 (PLAN chatbot Phụ lục B); auth/login/login-rules.ts unverifiedStatusFor; RequireAuth vai Bệnh nhân',
  },
  {
    id: 'P2',
    text: 'Khi chọn khung giờ còn trống ở dịch vụ có đặt cọc, lịch hẹn ở trạng thái chờ thanh toán và khung giờ được giữ cho bạn trong [[CS:giuCho]]. Quá hạn mà chưa thanh toán thì lịch tự hủy và khung giờ được trả lại.',
    source:
      'appointments/create/create-appointment.service.ts (zeroDeposit ? DaXacNhan : ChoThanhToan); appointments/slots/slot-hold.service.ts holdDeadline; appointments/expiry/hold-expiry.job.ts',
  },
  {
    id: 'P3',
    text: 'Dịch vụ không đặt cọc thì lịch được xác nhận ngay, không cần thanh toán trước.',
    source:
      'appointments/create/create-appointment.service.ts (cọc 0đ INSERT thẳng DaXacNhan)',
  },
  {
    id: 'P4',
    text: 'Bệnh nhân hủy được lịch đang chờ thanh toán hoặc đã xác nhận; lịch đã tiếp đón thì không hủy được.',
    source:
      'appointments/state/appointment-state.matrix.ts (BenhNhan: ChoThanhToan và DaXacNhan tới DaHuy; DaTiepDon không huỷ được)',
  },
  {
    id: 'P5',
    text: 'Cọc đã thanh toán được hoàn theo mốc thời gian của dịch vụ tại lúc đặt lịch: hủy càng sát giờ hẹn thì tỷ lệ hoàn càng thấp, đã quá giờ hẹn thì không hoàn.',
    source:
      'appointments/cancel/refund-calculator.ts calculateRefund (đọc chinh_sach_hoan_snapshot chụp lúc đặt, quá giờ hẹn thì 0%); payment/policy/policy.rules.ts (giờ giảm thì tỷ lệ không tăng)',
  },
  {
    id: 'P6',
    text: 'Lịch đã xác nhận có thể tự đổi sang khung giờ khác của cùng bác sĩ, cùng dịch vụ, cùng chi nhánh, trước giờ hẹn, tối đa [[CS:doiLich]]. Hết lượt tự đổi thì gửi yêu cầu kèm lý do để lễ tân hoặc quản trị viên xem xét.',
    source:
      'appointments/reschedule/reschedulability.rules.ts (bước 3 DaXacNhan, bước 4 hạn đổi, bước 7 đến 10 checkTargetSlot, checkQuota và loai TuDoi hay GuiYeuCau)',
  },
  {
    id: 'P7',
    text: 'Giờ nhận khám của từng chi nhánh nêu ở phần chi nhánh. Khung giờ còn trống do hệ thống tính theo thời điểm bạn xem nên Trợ lý không nêu giờ cụ thể; hãy chọn khung giờ ở trang đặt lịch.',
    source:
      'PLAN chatbot 5.6 ("Khung giờ không bao giờ vào ngữ cảnh"); câu của sản phẩm',
  },
];

/** Câu có chỗ giữ `[[CS:…]]` cần cấu hình hệ thống. */
const needsConfig = (line: PolicyLine): boolean => {
  const parsed = parsePlaceholders(line.text);
  return parsed.ok && parsed.refs.some((ref) => ref.kind === 'CS');
};

/**
 * Các câu đưa vào ngữ cảnh. Chưa cấu hình hệ thống (`config = null`) thì BỎ câu cần `[[CS:…]]`: mô hình không có chỗ giữ đó để dùng,
 * và nếu vẫn dùng thì V2 từ chối. `config` chỉ để biết có hay không: giá trị số không bao giờ vào chữ ở đây.
 */
export function buildPolicyLines(config: PolicyConfig | null): string[] {
  return POLICY_LINES.filter(
    (line) => config !== null || !needsConfig(line),
  ).map((line) => line.text);
}
