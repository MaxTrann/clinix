// Hằng riêng của đối chiếu và dựng đoạn (chatbot B2; PLAN chatbot 5.7, 5.12). Cố ý KHÔNG đặt trong `chatbot.constants.ts` (của P1).

/** `traLoi` dài nhất, tính bằng điểm mã Unicode (V1: nhà cung cấp có thể bỏ qua `maxLength` nên kiểm ở máy chủ). */
export const ANSWER_MAX_CODE_POINTS = 800;

/** Số id chuyên khoa mô hình được trả tối đa trong `chuyenKhoaGoiY` (nhiều hơn là đầu ra sai). Máy chủ chỉ GIỮ `SPECIALTY_SUGGESTION_MAX`. */
export const SPECIALTY_ID_INPUT_MAX = 10;

/** Độ dài tối đa của một id trong `chuyenKhoaGoiY` (BIGINT có tối đa 19 chữ số). */
export const SPECIALTY_ID_MAX_LENGTH = 24;

/** Số chuyên khoa gợi ý giữ lại, theo thứ tự mô hình đưa (2.4.77, ANX-01). */
export const SPECIALTY_SUGGESTION_MAX = 3;

/** V9: đoạn lời nhắc hệ thống trùng từ chừng này ký tự liên tiếp trở lên là lộ lời nhắc. */
export const PROMPT_FRAGMENT_MIN_CHARS = 40;

/** V9: mã chim mồi ngắn hơn chừng này (sau chuẩn hoá) là cấu hình sai: nó sẽ khớp bừa hoặc không bảo vệ gì. */
export const CANARY_MIN_CHARS = 8;

/** V3: con số duy nhất được viết thẳng trong chữ tự do (số gọi cấp cứu, Q6). */
export const ALLOWED_NUMBER = '115';

/** Số thực thể KHÁC NHAU tối đa mỗi câu trả lời được đọc lại (mỗi bác sĩ là một truy vấn); vượt thì coi là V2. */
export const RESOLVE_MAX_ENTITIES = 24;
