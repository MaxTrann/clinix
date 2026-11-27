// MỌI chữ hiển thị của khung chat ở MỘT chỗ. Chữ lấy từ PLAN chatbot 5.16 và 2.4.7 b1 giữ nguyên văn; chữ còn lại do Đại duyệt
// ngày 27/11/2026 (TRACKING chatbot, chatbot F1). Chữ của câu trả lời (`TraLoi`, `KhanCap`, `DuPhong`…) KHÔNG nằm ở đây:
// web in đúng `doan` do máy chủ trả (chữ dựng sẵn của chatbot B1).
export const CHATBOT_TEXT = {
  launcher: 'Trợ lý AI',
  title: 'Trợ lý AI CLINIX',
  close: 'Đóng Trợ lý AI',
  // b1 của 2.4.7 (đặc tả ghi: "chỉ tư vấn sơ bộ, không chẩn đoán, không kê đơn, không thay thế khám trực tiếp")
  bannerLine1:
    'Trợ lý AI chỉ tư vấn sơ bộ, không chẩn đoán, không kê đơn, không thay thế khám trực tiếp.',
  bannerLine2: 'Cấp cứu: gọi 115.',
  greeting:
    'Xin chào! Tôi là trợ lý AI của CLINIX. Bạn cần tư vấn về chuyên khoa, bác sĩ hay lịch khám?',
  quickQuestions: [
    'Phòng khám có những chuyên khoa nào?',
    'Giờ nhận khám của phòng khám là mấy giờ?',
    'Tôi muốn khám tổng quát, nên chọn chuyên khoa nào?',
  ],
  // Thông báo trước câu đầu (Q5)
  consentNotice:
    'Nội dung bạn nhập được gửi tới dịch vụ AI bên thứ ba (Groq, Google). Đừng nhập họ tên, số điện thoại, CCCD hay hồ sơ bệnh. Trợ lý dành cho người từ 18 tuổi.',
  consentAccept: 'Tôi hiểu',
  log: 'Hội thoại với Trợ lý AI',
  inputLabel: 'Nhập câu hỏi của bạn',
  send: 'Gửi',
  typing: 'Đang trả lời…',
  clear: 'Xoá hội thoại',
  retry: 'Gửi lại',
  // Đọc cho trình đọc màn hình (chỉ `sr-only`)
  srUser: 'Bạn: ',
  srAssistant: 'Trợ lý AI: ',
  call115: 'Gọi 115',
  linkAppointments: 'Lịch hẹn của tôi',
  linkWallet: 'Ví của tôi',
  linkDoctors: 'Tra cứu bác sĩ và lịch khám',
  linkMessages: 'Nhắn lễ tân',
  // Chữ lỗi theo PLAN 5.16
  errorInvalid: 'Câu hỏi cần từ 1 đến 500 ký tự.',
  errorTooFast: 'Bạn hỏi hơi nhanh. Đợi một chút rồi gửi lại.',
  errorBusy: 'Trợ lý đang bận. Thử lại sau ít giây.',
  // Chữ 3b của 2.4.7 (không dấu chấm cuối): dùng cho 500, mất mạng, quá giờ, phản hồi không dùng được
  errorUnavailable: 'Trợ lý AI hiện không phản hồi, vui lòng thử lại sau',
  // Thẻ gợi ý đặt lịch (chatbot F2; Đại duyệt 27/11/2026). Chữ có ghi (P) ở TRACKING 3.9 là nguyên văn PLAN 5.14, 5.16; chữ còn lại là chữ mới đã duyệt.
  suggest: {
    title: 'Gợi ý đặt lịch khám',
    specialtyGroup: 'Chuyên khoa gợi ý',
    chooseSpecialty: 'Chọn chuyên khoa này',
    specialtyChosen: 'Đã chọn',
    otherSpecialty: 'Chọn chuyên khoa khác',
    specialtySelectLabel: 'Chuyên khoa',
    specialtySelectPlaceholder: 'Chọn chuyên khoa…',
    specialtiesLoading: 'Đang tải danh sách chuyên khoa…',
    specialtiesEmpty: 'Chưa có chuyên khoa nào để chọn.',
    dayGroup: 'Ngày khám',
    shiftGroup: 'Ca khám',
    shifts: { CaSang: 'Sáng', CaChieu: 'Chiều', CaToi: 'Tối' },
    loading: 'Đang tìm bác sĩ và giờ trống…',
    loginHint: 'Đăng nhập để đặt lịch',
    slotGroup: 'Giờ trống',
    fullSchedule: 'Xem lịch đầy đủ',
    // A5 (2.4.7 9b): chữ PLAN 5.16; câu thứ hai là chữ mới cho trường hợp chuyên khoa không có bác sĩ nào
    emptyNoSlot:
      'Hiện chưa có khung giờ trống phù hợp. Thử ngày hoặc ca khác, hoặc chọn chuyên khoa khác.',
    emptyNoDoctor:
      'Chuyên khoa này hiện chưa có bác sĩ phù hợp. Hãy chọn chuyên khoa khác hoặc tra cứu bác sĩ và lịch khám.',
    // Chữ theo `maLoi` của PLAN 5.16
    errorFilter: 'Bộ lọc không hợp lệ.',
    errorNotFound: 'Không tìm thấy chuyên khoa.',
    errorNotConfigured:
      'Chưa gợi ý được lúc này. Bạn có thể tra cứu bác sĩ và lịch khám.',
    retry: 'Thử lại',
  },
} as const;

export function counterText(length: number, max: number): string {
  return `${length}/${max}`;
}

// Chữ có số liệu của thẻ gợi ý. `day` là nhãn ngày đã dựng ("Thứ 6 28/11").
export function suggestSummaryEarliest(day: string, count: number): string {
  return `Ngày sớm nhất còn giờ trống: ${day}. Có ${count} bác sĩ.`;
}

export function suggestSummaryPicked(day: string, count: number): string {
  return `${day}: có ${count} bác sĩ còn giờ trống.`;
}

export function suggestPrice(amount: string): string {
  return `Giá khám ${amount}`;
}

export function suggestRating(score: string, count: number): string {
  return `${score} · ${count} đánh giá`;
}

// Phần chữ chỉ đọc cho trình đọc màn hình sau giờ "09:30": ngày và tên bác sĩ
export function suggestSlotSuffix(dayMonth: string, doctor: string): string {
  return ` ngày ${dayMonth}, ${doctor}`;
}
