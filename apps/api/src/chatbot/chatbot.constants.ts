// Hằng của scope "Trợ lý AI" (chatbot P1; PLAN chatbot 5.5, 5.13; T3, T4, T10). File này KHÔNG import gì để `config/env.validation.ts` dùng được mà không tạo vòng import.

/** Token DI của `ChatbotModule`. */
export const AI_CONFIG = Symbol('AI_CONFIG');
export const AI_CLOCK = Symbol('AI_CLOCK');
export const AI_PROVIDERS = Symbol('AI_PROVIDERS');

/** Giá trị mặc định của biến môi trường (PLAN 5.13). Biến bỏ trống hay không đặt thì dùng đúng các giá trị này. */
export const AI_DEFAULTS = {
  enabled: true,
  groqModel: 'openai/gpt-oss-20b',
  geminiModel: 'gemini-3.5-flash-lite',
  // Địa chỉ GỐC, chưa gồm đường dẫn của từng lời gọi (`/chat/completions`, `/interactions`). Nguồn: PLAN 3.4, ngày tra 27/11/2026.
  groqBaseUrl: 'https://api.groq.com/openai/v1',
  geminiBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
  groqTimeoutMs: 6000,
  geminiTimeoutMs: 8000,
  totalTimeoutMs: 20_000,
  cooldownSeconds: 60,
  ipPerMinute: 5,
  ipPerDay: 50,
  maxConcurrent: 3,
  groqPerMinute: 20,
  geminiPerMinute: 10,
} as const;

/** Còn dưới chừng này thì không thử thêm lần nào (Q8, HDA-08). Đúng bằng thì vẫn thử. */
export const MIN_ATTEMPT_MS = 2000;

/** Mỗi lớp thử tối đa hai lần: lần đầu và đúng một lần thử lại (2.4.76, T10). */
export const MAX_ATTEMPTS_PER_LAYER = 2;

/** Cửa sổ của trần "mỗi phút" theo nhà cung cấp (HDA-11). */
export const QUOTA_WINDOW_MS = 60_000;

/**
 * Trần của AI_TOTAL_TIMEOUT_MS: web chờ tối đa 45 giây (`LONG_TIMEOUT_MS` ở apps/web `shared/api/client`), nginx 60 giây (PLAN T3, 5.5).
 * Trần API phải NHỎ HƠN 45 giây để lỗi của API tới được web trước khi web tự bỏ cuộc. Không đọc file của web trong test (Docker của api chỉ có apps/api).
 */
export const AI_TOTAL_TIMEOUT_MAX_MS = 44_999;

/** Khoảng cho phép của thời gian chờ một lớp (mili giây). `[đề xuất]` */
export const AI_LAYER_TIMEOUT_RANGE = { min: 2000, max: 30_000 } as const;

/** Khoá API: ASCII in được, không khoảng trắng, không xuống dòng (chặn chèn header). Giá trị KHÔNG bao giờ vào thông báo lỗi. */
export const AI_API_KEY_PATTERN = /^[\x21-\x7E]{1,512}$/;

/** Tên model: chữ, số và `. _ / : -`. */
export const AI_MODEL_PATTERN = /^[A-Za-z0-9._/:-]{1,100}$/;

/** Cố định, theo ví dụ REST của trang Gemini (tra 27/11/2026); trang không nói bắt buộc. X1 M1 thử có và không rồi chốt (duyệt D1). */
export const GEMINI_API_REVISION = '2026-05-20';

/** PLAN 5.5: Groq chạy `reasoning_effort` thấp để nhanh. */
export const GROQ_REASONING_EFFORT = 'low';

/** Model đã ngừng mà PLAN 5.13 nêu: đặt vào cấu hình thì khởi động được nhưng có cảnh báo (T4, R1). Ngày theo PLAN 3.4. */
export const DEPRECATED_MODELS: readonly {
  readonly provider: 'groq' | 'gemini';
  readonly model: string;
  readonly since: string;
}[] = [
  { provider: 'groq', model: 'llama-3.1-8b-instant', since: '16/08/2026' },
  { provider: 'gemini', model: 'gemini-2.0-flash', since: '01/06/2026' },
];
