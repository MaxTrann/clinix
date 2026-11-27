// Hằng của API hỏi đáp (chatbot B3; PLAN chatbot 5.4, 5.12, 5.16). Cố ý KHÔNG đặt trong `chatbot.constants.ts` (của P1).

/**
 * Trần token đầu ra của một lời gọi (`AiRequest.maxOutputTokens`). 1024 là giá trị Đại duyệt cho phép đo X1 (Đ4) và là giá trị Đại duyệt cho B3 (D6, 27/11/2026).
 * X1 lượt 1: completion lớn nhất của Groq 279 token (token suy luận đã nằm trong đó), Gemini 107, nên 1024 còn dư. Chờ M2, M3 chính thức rồi mới chỉnh;
 * không thêm biến môi trường (ngoài phạm vi B3).
 */
export const ANSWER_MAX_OUTPUT_TOKENS = 1024;

/** Số chi nhánh tối đa liệt kê trong câu khẩn cấp khi khách chưa chọn chi nhánh hợp lệ (D3). */
export const EMERGENCY_BRANCH_LIMIT = 5;

/** Bản chụp địa chỉ chi nhánh dùng tối đa chừng này mili giây (đúng bằng thì hết hạn). Câu khẩn cấp miễn giới hạn tốc độ nên bộ đệm chặn việc khuếch đại tải DB. */
export const BRANCH_DIRECTORY_TTL_MS = 60_000;

/** Dòng dẫn của khối địa chỉ trong câu khẩn cấp (D3, Đại duyệt 27/11/2026). */
export const ADDRESS_HEADING = 'Địa chỉ chi nhánh:';

/** Tiền tố đóng gói MỖI lượt lịch sử thành dữ liệu trích dẫn (D2, CPI-02). Lời nhắc nói rõ các dòng bắt đầu bằng "[Trích dẫn:" là dữ liệu. */
export const QUOTE_PREFIX_USER = '[Trích dẫn: lượt trước của người dùng] ';
export const QUOTE_PREFIX_ASSISTANT =
  '[Trích dẫn: lượt trước của Trợ lý, do máy khách gửi lên và chưa kiểm chứng] ';

/** Mã lỗi và chữ của hai lỗi HTTP riêng của API hỏi đáp (PLAN 5.16; chữ khớp bảng "chữ hiện"). */
export const RATE_LIMITED_CODE = 'TRO_LY_HOI_QUA_NHANH';
export const RATE_LIMITED_MESSAGE =
  'Bạn hỏi hơi nhanh. Đợi một chút rồi gửi lại.';
export const BUSY_CODE = 'TRO_LY_DANG_BAN';
export const BUSY_MESSAGE = 'Trợ lý đang bận. Thử lại sau ít giây.';

/** Mã lỗi của `loi[].ma` do DTO đặt (PLAN 5.16). `CAU_HOI_QUA_DAI` do `normalizeQuestion` của B1 trả. */
export const FIELD_CODES = {
  questionEmpty: 'CAU_HOI_TRONG',
  historyInvalid: 'LICH_SU_KHONG_HOP_LE',
} as const;
