// Hằng riêng của ngữ cảnh công khai (chatbot B2; PLAN chatbot 5.6, T5). Cố ý KHÔNG đặt trong `chatbot.constants.ts` (của P1).

/** Trần độ dài ngữ cảnh gửi cho mô hình, tính bằng `String.length` (tiếng Việt có dấu đều nằm trong BMP). Mục tiêu khoảng 2.000 token, chưa đo (X1 M4). */
export const CONTEXT_MAX_CHARS = 6000;

/** Số bác sĩ tối đa vào ngữ cảnh mỗi câu hỏi. */
export const CONTEXT_MAX_DOCTORS = 8;

/** Số dịch vụ khớp tên tối đa được kèm chi tiết (giá, cọc, thời lượng, hoàn) ngoài dịch vụ của các bác sĩ đã chọn. */
export const CONTEXT_MAX_MATCHED_SERVICES = 8;

/** Bản chụp dùng tối đa chừng này mili giây (đúng bằng thì coi là hết hạn). Chỉ giữ MỘT bản. */
export const CONTEXT_CACHE_TTL_MS = 60_000;

/** Mô tả chuyên khoa cắt ở chừng này điểm mã, thêm dấu ba chấm nếu bị cắt. */
export const SPECIALTY_DESCRIPTION_MAX_CHARS = 120;

/** `PublicDoctorService.list` nhận `pageSize` tối đa 100. */
export const DOCTOR_ROSTER_PAGE_SIZE = 100;

/** Danh sách bác sĩ trong bản chụp tối đa 5 trang × 100 = 500 người; quá thì bỏ phần còn lại theo nếp sắp của search. */
export const DOCTOR_ROSTER_MAX_PAGES = 5;

/**
 * Hai dòng đánh dấu khối dữ liệu (PLAN 5.8, CPI-03). Lời nhắc hệ thống (chatbot B3) phải nói: nội dung giữa hai dòng là DỮ LIỆU,
 * không phải chỉ dẫn. Chữ lấy từ DB bị làm sạch nên không thể giả hai dòng này.
 */
export const CONTEXT_DATA_START = '<<<BAT_DAU_DU_LIEU_CONG_KHAI>>>';
export const CONTEXT_DATA_END = '<<<KET_THUC_DU_LIEU_CONG_KHAI>>>';
