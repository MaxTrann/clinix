# ADR — Dịch vụ AI bên ngoài cho Trợ lý (Groq, Gemini)

Status: Accepted  
Date: 2026-11-27  
Scope: chatbot P1, issue #732 (Epic #731); consumer chatbot B2, B3, X1

## Bối cảnh

Trợ lý AI (scope #12) trả lời trên dữ liệu công khai của phòng khám và gợi ý chuyên khoa. Việc này cần một mô hình ngôn ngữ. Repo là đồ án học thuật dùng dữ liệu mẫu, không có máy chủ GPU, nên dùng dịch vụ ngoài có gói miễn phí.

Đại chốt (Q1, Q2, 26/11/2026): chuỗi **Groq, rồi Gemini, rồi câu dựng sẵn**; **bỏ Ollama**. Hai model mà use case 2.4.76 ghi (`gemini-2.0-flash`, `llama-3.1-8b-instant`) đều đã ngừng, nên tên model nằm trong cấu hình chứ không trong mã.

## Quyết định

- **Nhà cung cấp và thứ tự** (Q1):
  1. Groq: `POST {GROQ_BASE_URL}/chat/completions`, mặc định `https://api.groq.com/openai/v1`, model `openai/gpt-oss-120b` (mặc định từ 28/11/2026, trước đó `openai/gpt-oss-20b`; TRACKING chatbot 3.12), `reasoning_effort` thấp, đầu ra `json_schema` có `strict: true`. Mỗi lần thử chờ tối đa 6 giây.
  2. Gemini: Interactions API `POST {GEMINI_BASE_URL}/interactions`, mặc định `https://generativelanguage.googleapis.com/v1beta`, model `gemini-3.5-flash-lite`, `store: false`, đầu ra JSON theo lược đồ. Mỗi lần thử chờ tối đa 8 giây.
  3. Câu dựng sẵn (không gọi AI): hằng của chatbot B1.
  - Hai model mặc định là `[đề xuất]`, **chốt sau chatbot X1** (đo độ trễ, đầu ra đúng lược đồ, ánh xạ chuyên khoa, hạn mức).
- **Kết nối** (T4): `fetch` của Node, **không SDK** của nhà cung cấp và không thêm phụ thuộc. `HttpTransport` được tiêm vào adapter nên test không chạm mạng. `redirect: 'error'`: header khoá không bao giờ bị chuyển sang địa chỉ khác (`Authorization` bị `fetch` gỡ khi đổi origin nhưng `x-goog-api-key` thì không).
- **Khoá API:**
  - Chỉ ở `.env` cục bộ hay biến của máy chủ, gửi bằng **header** (`Authorization: Bearer` cho Groq, `x-goog-api-key` cho Gemini), **không bao giờ** ở URL hay query. Không đặt tiền tố `VITE_`.
  - **Mọi biến AI đều tuỳ chọn**: không có khoá nào thì API vẫn khởi động và Trợ lý trả câu dựng sẵn (staging tự triển khai từ `main` khi `.env` chưa có khoá). Biến sai thì API không khởi động và thông báo chỉ nêu **tên** biến.
  - Bộ che log đã che giá trị của biến có tên chứa `API_KEY` và header `Authorization`, `x-goog-api-key`.
  - Thân lỗi của nhà cung cấp **không** vào thông điệp lỗi hay log (nó có thể nhắc lại câu hỏi hay khoá): adapter phân loại lỗi chỉ theo mã HTTP, transport không trả thân khi mã không phải 2xx.
- **Test không bao giờ gọi AI thật** (T11): `NODE_ENV=test` thì nhà máy provider **không tạo** provider nào, dù có khoá; CI không có khoá. Đo thật là việc của chatbot X1, bằng khoá của Đại, chạy tay.
- **Hạn chót, thử lại, cooldown** (Q8, T3, T10):

  | Việc | Quy tắc |
  |---|---|
  | Hạn chót tổng | 20 giây (`AI_TOTAL_TIMEOUT_MS`, nhỏ hơn 45 giây của web), do **chuỗi** giữ (đua lời gọi với hẹn giờ rồi huỷ `AbortController`), không nhờ adapter |
  | Mỗi lần thử | chờ `min(thời gian của lớp, thời gian còn lại)`; còn dưới 2 giây thì không thử nữa |
  | Thử lại cùng lớp | đúng một lần với timeout, lỗi mạng, 5xx, đầu ra không phải JSON hay sai lược đồ |
  | Không thử lại | 429 và 4xx cấu hình sai (khoá sai, model đã ngừng, yêu cầu sai): chuyển lớp |
  | Cooldown | 60 giây, **chỉ sau khi lớp hỏng**, không bao giờ sau thành công; một lớp đã hỏng ít nhất một lần luôn vào cooldown dù thoát vì hết giờ |
  | Trần mỗi phút | theo từng nhà cung cấp (mặc định Groq 20, Gemini 10); chạm trần thì bỏ qua lớp, **không** cooldown |

- **Dữ liệu gửi đi:** câu hỏi và tối đa 6 lượt gần nhất **đã che định danh** (email, số điện thoại, CCCD, mã lịch; việc của chatbot B1), lời nhắc hệ thống và ngữ cảnh dữ liệu **công khai** (chi nhánh, chuyên khoa, dịch vụ, bác sĩ, chính sách). **Không** gửi dữ liệu tài khoản của Bệnh nhân, không lưu hội thoại (Q3, Q4).

## Hình dạng yêu cầu: đã tra lại ngày 27/11/2026 (chỉ đọc trang, chưa gọi API)

| Điểm | Groq | Gemini |
|---|---|---|
| Trang | https://console.groq.com/docs/structured-outputs ; /docs/reasoning ; /docs/errors | https://aistudio.google.com/docs/structured-output ; /api-reference/interactions-api ; /docs/interactions ; /docs/api-errors |
| Xác nhận đúng với PLAN 3.4 | URL; `Authorization: Bearer`; `response_format.json_schema{name, strict, schema}`; `openai/gpt-oss-20b` hỗ trợ `strict`; 429 kèm `retry-after` | URL; `x-goog-api-key`; `response_format{type, mime_type, schema}`; trường `store`; `gemini-3.5-flash-lite` có trong danh sách model |
| PLAN 3.4 chưa nêu, adapter dùng | `strict` đòi mọi trường `required` và `additionalProperties: false` (ràng buộc cho lược đồ của chatbot B2) | `input` là mảng bước `user_input` / `model_output` (**không có `role`**); `system_instruction` là chuỗi; `store` **mặc định `true`** nên phải gửi `false`; chữ ở `steps[model_output].content[text].text`; `status: incomplete` = chạm `max_tokens`; lỗi `{ "error": { "code", "message" } }` không có `status`; header `Api-Revision: 2026-05-20` có ở ví dụ nhưng trang không nói bắt buộc |
| **Chưa xác nhận được bằng trang** (chatbot X1 M1 đo thật) | dùng chung `reasoning_effort` và `include_reasoning` với `json_schema` ở `gpt-oss-20b`; tên trường `usage` | model có "nghĩ" mặc định không, token nghĩ có tính vào `max_output_tokens` không (có thể làm cụt JSON); có và không `Api-Revision` |

Công cụ đọc trang trả nguyên văn phần đầu trang dài và chỉ tóm tắt phần đuôi; các điểm dùng ở trên nằm trong phần nguyên văn. Fixture của test tự viết theo các trang này (xem `apps/api/src/chatbot/testing/fixtures/NGUON.md`), **không** chép từ lời gọi thật.

Ghi chú vận hành cho người tạo khoá Gemini (trang `/docs/api-key`): «The Gemini API rejects requests from **unrestricted standard keys**»; khoá tạo mới từ 28/05/2026 ở Google AI Studio tự là khoá có xác thực. Chưa kiểm bằng lời gọi thật.

## Điều khoản của nhà cung cấp (trích PLAN chatbot 3.4, đọc ngày 26/11/2026; **không đọc lại ở P1**)

- Gemini, gói miễn phí: «Google uses the content you submit to the Services and any generated responses to provide, improve, and develop»; «human reviewers may read, annotate, and process your API input and output»; «Do not submit sensitive, confidential, or personal information to the Unpaid Services». Gói trả phí không dùng để cải thiện sản phẩm. (https://aistudio.google.com/docs/terms, hiệu lực 23/03/2026)
- Gemini, y khoa và tuổi: «You may not use the Services in clinical practice, to provide medical advice,»; «You must be 18 years of age or older to use the APIs.»
- Groq: «Groq is not permitted to use Inputs or Outputs for training or fine-tuning any AI Model Services or other models»; mặc định không giữ dữ liệu suy luận; log lạm dụng giữ tối đa 30 ngày; bật được Zero Data Retention; lưu ở Hoa Kỳ. (https://console.groq.com/docs/legal/services-agreement, sửa 22/06/2026; /docs/your-data)
- Groq, y khoa và tuổi: từ 18 tuổi; «The AI Model Services should not be used for medical, legal, financial, or other professional advice.»
- **`store: false` của Gemini KHÔNG bảo đảm** dữ liệu gói miễn phí không bị dùng (điều khoản gói miễn phí vẫn áp). Không viết hay nói như thể bảo đảm.
- Hạn mức gói miễn phí của hai nhà cung cấp: **`[cần điền]`** (Đại đọc ở console, chỉ chép số; chatbot X1 M7). Bảng của Groq mang nhãn gói Developer (`gpt-oss-20b`: 30 yêu cầu mỗi phút, 8.000 token mỗi phút), chưa phải gói miễn phí.

## Phương án đã cân nhắc

- **Ollama cục bộ** (đề xuất ban đầu): loại theo Q2. Cần thêm RAM, ảnh Docker khoảng 3,2 GB, `qwen2.5:3b` dưới giấy phép Qwen Research, thời gian khởi động chưa đo; máy nhỏ không GPU khó đạt 6 đến 8 giây.
- **Gemini trước Groq** (đặc tả 2.4.76): đổi theo Q1; Groq cam kết không dùng đầu vào, đầu ra để huấn luyện, còn gói miễn phí Gemini dùng nội dung để cải thiện sản phẩm.
- **SDK chính thức:** loại (T4): thêm phụ thuộc, che mất hình dạng yêu cầu thật, khó thay bằng transport giả.
- **Streaming:** không (T3): Groq không hỗ trợ cùng đầu ra cấu trúc, và đối chiếu câu trả lời cần có trọn câu.
- **Gói trả phí ngay:** Đại chọn gói miễn phí kèm thông báo đầy đủ (Q5); xem lại trước khi mở công khai.

## Đánh đổi và hệ quả

- **Dữ liệu sức khoẻ người dùng gõ vào có thể rời hệ thống.** Che định danh chỉ giảm chứ không bắt được mọi họ tên, địa chỉ hay bệnh sử; dòng "từ 18 tuổi" không xác minh được. Điều khoản của cả hai nhà cung cấp nói dịch vụ không dùng để tư vấn y khoa, xung đột một phần với mục đích: chấp nhận cho đồ án dữ liệu mẫu, có thông báo và đồng ý trước câu đầu (Q5). **Phải xem lại trước khi mở công khai** (gói trả phí hay mô hình tự chạy, rà quy định bảo vệ dữ liệu cá nhân hiện hành `[cần điền]`).
- **Cooldown, trần mỗi phút nằm trong bộ nhớ một tiến trình API:** khởi động lại thì mất, nhiều tiến trình thì mỗi tiến trình tự học (ghi nợ kỹ thuật).
- **Khác đặc tả 2.4.76 (`[ĐỒNG BỘ TL]`):** hai lớp thay vì ba; trần tổng 20 giây (đặc tả: ba lớp, hai lần, 6 đến 8 giây mỗi lần, tối đa khoảng 48 giây); 429 và 4xx cấu hình sai không thử lại; cooldown tính sau khi lớp hỏng. Việc sửa file Word do nhóm làm (PLAN chatbot 4.6).
- **Model và API đổi nhanh:** cả hai model của đặc tả đã ngừng trong sáu tháng. Tên model và địa chỉ ở cấu hình, đặt model đã biết là ngừng thì khởi động được và có cảnh báo; 4xx ghi cảnh báo "kiểm tra khoá, địa chỉ hoặc model có thể đã ngừng".
- **Hạn mức miễn phí nhỏ:** có thể chỉ 2 đến 3 câu mỗi phút (PLAN R2). Rơi xuống lớp sau rồi câu dựng sẵn; thử trước buổi demo.

## Xác minh

- **Test đơn vị**, không chạm mạng: HDA-01 đến HDA-15 (chuỗi dự phòng, hạn chót trên đồng hồ ảo, cooldown, yêu cầu và phản hồi của hai adapter theo fixture, thân lỗi không rò) và CFG-01 đến CFG-04 (mặc định, không khoá vẫn khởi động, `NODE_ENV=test` không tạo provider, giá trị sai báo tên biến, khoá bị che trong log).
- **Đột biến 3 đến 6** (thử lại khi 429, bỏ trần tổng, cooldown sau thành công, tạo provider thật khi test): kết quả ở `docs/features/chatbot/TRACKING.md`.
- **Đo thật:** chatbot X1 (khoá của Đại, không in khoá, giãn lời gọi theo hạn mức).
