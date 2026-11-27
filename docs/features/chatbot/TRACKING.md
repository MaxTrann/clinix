# Tracking — scope #12 `chatbot` Trợ lý AI (hỏi – đáp an toàn và gợi ý đặt lịch)

Nhật ký tiến độ riêng của scope #12 (mã sẽ nằm trong `apps/api/src/chatbot/` và `apps/web/src/features/chatbot/`; scope commit `chatbot`). Kế hoạch, task, phụ thuộc và danh sách test case nằm ở [`PLAN.md`](PLAN.md); file này chỉ ghi việc **đã làm** để sau này giải thích lại được (luồng chạy, test nào pass, chỗ nào phát sinh vấn đề). Giữ vĩnh viễn trong repo, không xoá sau khi merge. **Người làm scope này: Đại (`MaxTrann`); Trung (`junUTE`) review.**

**Cách ghi**
- Thêm một dòng mới **sau mỗi task** (mã task `P*`, `B*`, `F*`, `X*` theo PLAN.md mục 6; ngoài file này luôn viết "chatbot B2" để không nhầm với booking B2, reschedule B2, notification B2 hay chat B2), mới nhất ở cuối.
- "Test case": liệt kê mã ở mục 7 của PLAN.md; "Kết quả": `Pass` / `Fail` / `Một phần` (ghi rõ ca nào ở cột cuối). Ca `Fail` phải có dòng sau ghi cách xử lý và lần chạy lại.
- Đổi kế hoạch khi đang làm thì sửa `PLAN.md`; ghi lý do ở cột cuối của dòng tương ứng.
- Quyết định của nhóm ghi ở mục 3. **Chỉ ghi "ĐÃ TRẢ LỜI" khi Đại trả lời trực tiếp** (tin của phiên kiểm độc lập chỉ duyệt kế hoạch và trả lời câu kỹ thuật).
- Số đo thật và kết quả bộ câu hỏi chuẩn (PLAN.md mục 5.15) ghi ở mục 6 **sau khi đặt tiêu chí trước**; việc còn chờ ghi ở mục 7.
- **Không dán khoá API, câu hỏi thật của người dùng, câu trả lời có dữ liệu thật hay dữ liệu bệnh nhân vào file này.** Câu trong bộ chuẩn là câu tổng hợp, ghi bằng mã câu.
- Khi cả scope xong: thêm **đúng một dòng** vào `docs/TRACKING.md` ở gốc, trỏ sang file này.

## 1. Nhật ký

| Ngày | Việc đã làm | Test case | Kết quả | Vấn đề phát sinh / cách xử lý |
|---|---|---|---|---|
| 26/11/2026 | **Lập kế hoạch scope #12, giai đoạn 1** (Đại `MaxTrann`; nhánh `docs/chatbot-plan`, worktree `clinix-app-doctor-exam`, `origin/main` `1349818`). Đọc nguyên văn 2.4.7, 2.4.76, 2.4.77 và các use case chạm vào bằng `python-docx` (chỉ đọc), so từng dòng với bản `Drive_Hien_Tai`; đọc SOW 3.2.6 và 5.1.4, 1.2.1, 1.3.3, 2.1_2.2, bảng Phân loại M18, M19, mục tiêu đề tài, bản cam kết 23/11, mã Make `SupportWidget` của Figma; đối chiếu `docs/database/*`, ADR 0001, `docs/TECH_DEBT.md`, mã `apps/api/src/{search,scheduling,admin/system-config,pricing,common,config,auth}`, `apps/web/src/{router,shared,features}`, hạ tầng compose, Dockerfile, nginx; đọc trang tài liệu chính thức của Gemini, Groq, Ollama (qua công cụ đọc trang; **không gọi API**, không khoá). Đo RAM và GPU máy dev (chỉ đọc). **Hỏi Đại bằng bốn hộp câu hỏi** (16 câu, mục 3.1): 14 theo đề xuất; Q1, Q2 chọn khác (Groq → Gemini → câu dựng sẵn, bỏ Ollama). Tạo `PLAN.md` (mục 0 đến 10, Phụ lục A và B nguyên văn; 111 mã test case, 9 task, 37,5 giờ) và file này. **Không** chạy `npm`, test, build, Docker, MySQL; **không** đọc `.env`; **không** sửa file nào khác; git chỉ đọc và `git fetch`. | — (tài liệu; chưa có mã) | — | **Phát hiện khi đối chiếu (PLAN mục 2, 3.3, 3.4):** (1) `gemini-2.0-flash` tắt 01/06/2026, `llama-3.1-8b-instant` tắt 16/08/2026; (2) gói miễn phí Gemini dùng nội dung để cải thiện sản phẩm và dặn không gửi thông tin nhạy cảm; Google và Groq đều nói không dùng cho tư vấn y khoa và đòi người dùng API từ 18 tuổi; (3) chưa có mã AI, chưa có module bài viết (bảng `bai_viet` mới có DDL); (4) trọng số w1, w2 đã chỉnh được ở trang cấu hình nhưng chưa nơi nào đọc; (5) 2.4.7 A6 đòi `sessionStorage` trong khi booking đã chốt giữ lựa chọn qua URL và `state.from`; (6) 2.4.7 A3 và 2.4.76 A1 đòi hai phản hồi khác nhau khi mọi lớp lỗi; (7) bản `Drive_Hien_Tai` gộp 2.4.76, 2.4.77 vào 2.4.7; (8) file gốc có 76 use case (đề bài ghi 77). Tổng 37,5 giờ cao hơn mốc 25 đến 35 giờ phiên kiểm chuyển lời (lý do và cách cắt ở PLAN 6.4). Trong lúc viết, `main` thêm PR 726 (`36ec306`, đổi lịch D1): `git diff` chỉ đổi tài liệu và chú thích `docs/database/*`, không đổi mã hay bảng kế hoạch dựa vào. |
| 26/11/2026 | **Phiên kiểm độc lập duyệt kỹ thuật T1 đến T11** (theo ủy quyền của Đại; không phải Đại trả lời trực tiếp), kèm điều kiện (PLAN 4.3). Cùng tin đó đề xuất ba phương án quyền riêng tư; một tin sau **chuyển lời** Đại muốn tinh giản. Cả hai việc thuộc quyết định sản phẩm nên đã hỏi Đại trực tiếp (Q5, Q9). Điều kiện riêng cho Ollama hết áp dụng sau Q1, Q2. | — | — | Phiên kiểm đề xuất che cả "họ tên nhận ra được": kế hoạch chỉ che tên theo mẫu tự giới thiệu và ghi giới hạn (PLAN 5.9). |
| 27/11/2026 | **chatbot P1 (issue #732): nền Trợ lý AI ở máy chủ** (Đại `MaxTrann`; nhánh `feat/chatbot-p1-nen-nha-cung-cap-ai`, `origin/main` `0f31bb3`). Đọc lại bằng công cụ đọc trang các trang hình dạng yêu cầu của Groq (structured-outputs, reasoning, errors) và Gemini (structured-output, interactions-api, interactions, api-errors) ngày 27/11/2026, **không gọi API**, không đọc `.env`. Tạo `apps/api/src/chatbot/` (phần P1 của PLAN 5.1): cổng `AiProvider`, `FetchHttpTransport` (`fetch`, `redirect: error`, thân lỗi không rời transport), `GroqProvider`, `GeminiProvider` (Interactions API, `store: false`), `FallbackChain` (hạn chót tổng 20 giây lan truyền, thử lại đúng một lần, cooldown 60 giây chỉ sau khi lớp hỏng, trần mỗi phút theo nhà cung cấp, đồng hồ và `AbortController` do chuỗi giữ), nhà máy `createAiProviders` (`NODE_ENV=test` không tạo provider), `ChatbotModule` (chưa có controller); khối biến `AI_…`, `GROQ_…`, `GEMINI_…` ở `config/env.validation.ts` (tất cả tuỳ chọn, để trống là mặc định); `.env.example` (chỉ tên biến, hai khoá để trống); từ `chatbot` ở `commitlint.config.cjs` và `AGENTS.md`; ADR 0007; fixture tự viết theo tài liệu. Đồ giả cho test: `FakeClock` (đồng hồ ảo), `FakeProvider`, `FakeHttpTransport`. Chạy `npm ci` ở `apps/api` (phiên kiểm cho phép; chỉ đổi `node_modules` vì worktree thiếu `socket.io` của chat P4). | HDA-01…HDA-15, CFG-01…CFG-04 | **Pass** (đơn vị): 13 file spec mới, 233 ca, 233 xanh, đủ 19 mã; cả bộ `api-unit` 459 file, 8.925 ca, 0 đỏ (một worker, 204 giây); `tsc` 0 lỗi ở file của P1; `oxlint --type-aware` 0; Prettier sạch; đột biến 3 đến 6 **cả bốn bị bắt** (mục 2). **`test:e2e` riêng của chatbot Pass**: `src/chatbot/chatbot.e2e-spec.ts`, 4 ca xanh (CFG-02, CFG-03, CFG-04 qua AppModule thật, nạp lại module sau khi đặt biến), 43 giây, một worker, DB tạm `clinix_chatbot_p1_test` (**chưa dọn**, chờ Đại cho phép); **không** chạy `test/app.e2e-spec.ts` cùng DB tạm vì nó khẳng định tên DB là `clinix_test`, và chưa chạy cả bộ `test:e2e` ở máy (CI chạy). | (1) Giờ ước **6,9 giờ, vượt 5 giờ của PLAN**: PLAN chưa tính ADR, fixture của hai nhà cung cấp, đồng hồ ảo cho HDA-08, HDA-09 và đột biến ở mức ĐB; không cắt phần an toàn. (2) Ba điều PLAN 3.4 chưa nêu nay đã tra và ghi ở ADR 0007 (Gemini `input` là mảng bước không có `role`; `store` mặc định `true`; chữ ở `steps` kiểu `model_output`); **không sửa chữ PLAN 3.4** (Đại chưa đồng ý). (3) **Chưa xác nhận bằng trang, chờ X1 M1 đo thật:** Groq dùng chung `reasoning_effort` và `include_reasoning` với `json_schema`; tên trường `usage` của Groq; header `Api-Revision` (đang gửi theo ví dụ của trang, duyệt D1); Gemini có "nghĩ" mặc định và token nghĩ có tính vào `max_output_tokens` không. (4) Điểm lệch có chủ ý so với 2.4.76 ở mục 3.4, `[ĐỒNG BỘ TL]`. (5) Ngoài bốn đột biến bắt buộc, đã chạy thêm **8 biến thể phụ, cả 8 bị bắt** (mục 2), gồm các ca "HDA-08 điều chỉnh phiên kiểm" (cooldown khi hết giờ) và ca kiểm `signal` bị huỷ; lần đầu một lệnh nối 11 biến thể bị bộ phân loại quyền từ chối (ngoài lượt được cấp), sau đó chạy từng lệnh một. (6) `tsc` toàn dự án còn 3 lỗi có sẵn ở `notification/` và `payment/` (không thuộc P1). |
| 27/11/2026 | **chatbot B1** (Đại `MaxTrann`; nhánh `feat/chatbot-b1-luat-an-toan`, `origin/main` `0f31bb3`, issue 733, Epic 731). Thêm `apps/api/src/chatbot/safety/` (`question-normalizer`, `phrase-matcher` dùng chung, `emergency.rules`, `out-of-scope.rules`, `account.rules`, `redact`, `canned-answers`) và `limit/` (`sliding-window-limiter`, `request-limiter`), kèm test cạnh mã. Chỉ hàm thuần và bộ nhớ: không gọi AI, DB, mạng, không đọc biến môi trường, không log, không import `providers/` hay `config/` (khoá bằng `safety.architecture.spec.ts`). Khớp từ khoá theo TỪNG TỪ (đúng dấu hoặc không dấu); khẩn cấp 15 nhóm 70 cụm, ngoài phạm vi 4 nhóm 18 cụm, tài khoản 3 nhóm 15 cụm (mục 3.5). Che định danh theo 5.9; sáu loại câu dựng sẵn; bộ giới hạn IP 5 mỗi phút, 50 mỗi ngày, 3 suất đồng thời, trần 10.000 IP, cửa sổ trượt, đồng hồ tiêm vào. Không chạm `chatbot.module.ts`, `config/`, `providers/`, `app.module.ts`, `.env.example` (việc của P1, B3). Kiểm: `tsc`, `oxlint`, `prettier --check`, `vitest` từng thư mục, `api-unit` cả bộ, đột biến 7, 8 cùng bốn đột biến tuỳ chọn. | ATY-01…ATY-08, RTU-01…RTU-05, GHT-01…GHT-05, GHT-07 (cộng 58 ca bổ sung mã `B1-nn`, mục 6.3). RTU-06, RTU-07, GHT-06 là e2e của B3, chưa chạy | **Pass**: 10 file, 465 ca (vitest `src/chatbot`, một worker, 1,9 giây); `api-unit` cả bộ 456 file, 9.157 ca, 0 đỏ (4 phút 4 giây); đột biến 7 và 8 bị bắt, bốn đột biến tuỳ chọn cũng bị bắt (mục 6.3) | (1) Ca ATY-06 phát hiện hai cụm ngoài phạm vi "liều bao nhiêu", "bao nhiêu liều" làm câu gõ không dấu "trị liệu bao nhiêu tiền" bị nhận nhầm là kê đơn ("liều" bỏ dấu trùng "liệu": trị liệu, tài liệu, dữ liệu): bỏ hai cụm, Đại xác nhận trực tiếp 27/11/2026 (ngoài phạm vi còn 18 cụm). (2) Lần chạy đầu một ca `B1-05` đỏ do chính test: regex "uống" khớp trong chữ "tình huống"; sửa bằng ranh giới từ Unicode, chữ câu dựng sẵn không đổi. (3) Ca nhập nhằng đã biết, giới hạn và chỗ B3 phải nối: mục 3.5. (4) `tsc` ở worktree này báo 10 lỗi có sẵn ở module `chat` (thiếu `socket.io`, `@nestjs/websockets` trong `node_modules` của worktree), không có lỗi nào trong `src/chatbot`; không chạy `npm ci` vì quy tắc "Không gọi mạng" của lượt máy. (5) Chưa chạy: 10 đột biến còn lại của PLAN 5.15 (1 đến 6, 9 đến 12) thuộc P1, B2, B3. |

## 2. Kết quả test theo use case (mã ở PLAN.md mục 7)

| Nhóm | Mã | Số ca | Task | Trạng thái |
|---|---|---|---|---|
| Chuỗi dự phòng và hợp đồng nhà cung cấp (2.4.76) | HDA-01…HDA-15 | 15 | P1 | **Pass** (27/11/2026, đơn vị: đủ 15 mã có ca) |
| Cấu hình | CFG-01…CFG-04 | 4 | P1 | **Pass** (27/11/2026, đơn vị: đủ 4 mã có ca; e2e qua AppModule thật: 4 ca xanh) |
| An toàn y tế | ATY-01…ATY-08 | 8 | B1 | **Pass** (chatbot B1, 27/11/2026; mục 6.3) |
| Quyền riêng tư | RTU-01…RTU-07 | 7 | B1, B3 | RTU-01…RTU-05 **Pass** (chatbot B1); RTU-06, RTU-07 chưa chạy (B3, e2e) |
| Giới hạn tốc độ | GHT-01…GHT-07 | 7 | B1, B3 | GHT-01…GHT-05, GHT-07 **Pass** (chatbot B1); GHT-06 chưa chạy (B3, e2e) |
| Ngữ cảnh | NGC-01…NGC-06 | 6 | B2 | chưa chạy |
| Đối chiếu đầu ra | DCR-01…DCR-12 | 12 | B2 | chưa chạy |
| Chèn lệnh | CPI-01…CPI-03 | 3 | B2, B3 | chưa chạy |
| Ánh xạ chuyên khoa (2.4.77) | ANX-01…ANX-04 | 4 | B2, B3 | chưa chạy |
| Trò chuyện đầu cuối (2.4.7) | TLA-01…TLA-13 | 13 | B3 | chưa chạy |
| API gợi ý | GOI-01…GOI-10 | 10 | B4 | chưa chạy |
| Giao diện | WTL-01…WTL-14 | 14 | F1, F2 | chưa chạy |
| Kiểm tay | KTL-01…KTL-08 | 8 | X2 | chưa chạy |
| **Tổng** | | **111** | | **38 đã chạy (19 P1, 19 B1), 73 chưa** |

Đột biến mục tiêu (PLAN 5.15): 12; **đã chạy 6, cả 6 bị bắt**: Đ3 đến Đ6 (chatbot P1, 27/11/2026; kèm 8 biến thể phụ ở bảng dưới) và Đ7, Đ8 (chatbot B1, 27/11/2026; kèm bốn đột biến tuỳ chọn, bảng ở mục 6.3); còn 6 chưa chạy (Đ1, Đ2, Đ9 đến Đ12); bốn loại đột biến web: chưa chạy.

| Đột biến (PLAN 5.15) | Chỗ sửa | Ca bắt | Ca đỏ | Quy trình |
|---|---|---|---|---|
| Đ3 thử lại khi 429 | `fallback-chain.ts`: bỏ `rateLimited` khỏi tập không thử lại | HDA-05 (cũng HDA-07, HDA-15 mức chuỗi) | 3 trên 31 | sao lưu ngoài repo kèm SHA-256; đối chứng trước xanh; một vitest một file; khôi phục trong `finally` đúng SHA; đối chứng sau xanh |
| Đ4 bỏ trần tổng | `fallback-chain.ts`: mỗi lần thử chờ đủ thời gian của lớp, không `min` với thời gian còn lại | HDA-08 (hai ca: biên 2000 ms, và 7 + 7 + 6 giây) | 2 trên 31 | như trên |
| Đ5 cooldown sau thành công | `fallback-chain.ts`: đặt cooldown ở nhánh thành công | HDA-09 (4 ca), HDA-03, HDA-05, HDA-11 (2 ca) | 8 trên 31 | như trên |
| Đ6 provider thật khi test | `provider-factory.ts`: bỏ nhánh `nodeEnv === 'test'` | CFG-03 (ca nhà máy và ca module Nest) | 1 trên 7 và 1 trên 5 | như trên |

Ca Đ4 cơ bản (6 + 6 + 8 giây) **không** bắt được Đ4 (vì ba số đó trùng với thời gian còn lại); hai ca biến thể mới bắt.

**Tám biến thể phụ** (ngoài PLAN; phiên kiểm cấp lượt 27/11/2026, mỗi biến thể một lệnh riêng; **cả 8 bị bắt**, khôi phục đúng SHA, đối chứng sau xanh):

| Biến thể | Chỗ sửa | Ca bắt | Ca đỏ |
|---|---|---|---|
| `rejected` thử lại | `fallback-chain.ts`: 4xx cấu hình sai được thử lại | HDA-06 (400, 401, 404, 413), HDA-09 (cooldown cấu hình được) | 5 trên 31 |
| Bỏ ngưỡng 2 giây | dừng khi `còn <= 0` thay vì `còn < 2000` | HDA-08 (còn 1999 ms; ca điều chỉnh phiên kiểm) | 2 trên 31 |
| Ngưỡng lệch biên | `còn <= 2000` thì không thử | HDA-08 (ca biên đúng 2000 ms) | 1 trên 31 |
| Hết giờ không đặt cooldown (điều chỉnh 1 của phiên kiểm) | bỏ cooldown ở nhánh hết giờ | HDA-08 điều chỉnh phiên kiểm | 1 trên 31 |
| Hết hạn không `abort()` (điều chỉnh 2) | bỏ `controller.abort()` | HDA-02, HDA-08 (ca phớt lờ signal) | 2 trên 31 |
| Không huỷ hẹn giờ khi xong (điều chỉnh 2) | bỏ `cancelTimer()` ở `finally` | HDA-01, HDA-02, HDA-10, HDA-08 (ca hẹn giờ riêng) | 4 trên 31 |
| Groq khoá ở query | `?key=` ở URL | HDA-12 (3 ca) | 3 trên 29 |
| Gemini khoá ở query | `?key=` ở URL | HDA-13 (3 ca) | 3 trên 34 |

Còn soạn sẵn nhưng **chưa chạy** (không bắt buộc): hết suất mỗi phút vẫn đặt cooldown, hết lần thử không đặt cooldown, Gemini `store: true`.

## 3. Quyết định đã chốt

### 3.1 Quyết định của nhóm cho scope này

**Đại trả lời trực tiếp ngày 26/11/2026**, qua bốn hộp câu hỏi trong phiên lập kế hoạch (mỗi câu có đề xuất kèm theo; câu hỏi đầy đủ và hệ quả ở PLAN mục 4.2).

| Q | Quyết định | Ghi chú |
|---|---|---|
| Q1 | **ĐÃ TRẢ LỜI (26/11/2026, Đại trả lời trực tiếp): Groq → Gemini → câu dựng sẵn, không Ollama** | **Khác đề xuất**; trái 2.4.76, `[ĐỒNG BỘ TL]` |
| Q2 | **ĐÃ TRẢ LỜI (26/11/2026, Đại trả lời trực tiếp): bỏ Ollama** | **Khác đề xuất** (tuỳ chọn, mặc định tắt) |
| Q3 | **ĐÃ TRẢ LỜI (26/11/2026, Đại trả lời trực tiếp): không lưu hội thoại** | Không bảng mới |
| Q4 | **ĐÃ TRẢ LỜI (26/11/2026, Đại trả lời trực tiếp): dữ liệu tài khoản chỉ liên kết tới trang** | `[ĐỒNG BỘ TL]` |
| Q5 | **ĐÃ TRẢ LỜI (26/11/2026, Đại trả lời trực tiếp): gói miễn phí kèm thông báo đầy đủ, đồng ý "Tôi hiểu", che định danh** | Ghi nợ rủi ro điều khoản |
| Q6 | **ĐÃ TRẢ LỜI (26/11/2026, Đại trả lời trực tiếp): câu cấp cứu nêu gọi 115 và cơ sở gần nhất** | Danh sách từ khoá Đại duyệt |
| Q7 | **ĐÃ TRẢ LỜI (26/11/2026, Đại trả lời trực tiếp): 5 câu mỗi phút, 50 mỗi ngày mỗi IP; trần toàn cục; 3 lời gọi cùng lúc** | |
| Q8 | **ĐÃ TRẢ LỜI (26/11/2026, Đại trả lời trực tiếp): trần tổng 20 giây, cooldown sau lỗi** | `[ĐỒNG BỘ TL]` |
| Q9 | **ĐÃ TRẢ LỜI (26/11/2026, Đại trả lời trực tiếp): tinh giản làm phương án chính** | Phiên kiểm chuyển lời trước, Đại xác nhận |
| Q10 | **ĐÃ TRẢ LỜI (26/11/2026, Đại trả lời trực tiếp): công thức w1/w2 và chọn ngày, ca** | Theo 1.2.1 |
| Q11 | **ĐÃ TRẢ LỜI (26/11/2026, Đại trả lời trực tiếp): chưa dùng bài viết, thêm tệp chính sách** | Nối sau |
| Q12 | **ĐÃ TRẢ LỜI (26/11/2026, Đại trả lời trực tiếp): 20 giờ mỗi tuần cho chatbot (Iteration 8, 9)** | |
| Q13 | **ĐÃ TRẢ LỜI (26/11/2026, Đại trả lời trực tiếp): khi cả hai lớp lỗi thì gộp câu A3, "Gửi lại" và câu dựng sẵn** | |
| Q14 | **ĐÃ TRẢ LỜI (26/11/2026, Đại trả lời trực tiếp): nút nổi ở trang công khai và cổng Bệnh nhân** | |
| Q15 | **ĐÃ TRẢ LỜI (26/11/2026, Đại trả lời trực tiếp): scope #12** | |
| Q16 | **ĐÃ TRẢ LỜI (26/11/2026, Đại trả lời trực tiếp): truy vết theo file 2.4 gốc kèm bảng ánh xạ** | |

### 3.2 Quyết định kế thừa từ module khác (không bàn lại; nguồn ở PLAN.md 4.1)

SOW 3.2.6 và 5.1.4: AI không chẩn đoán, không kê đơn, không tự đổi dữ liệu; kiểm soát dữ liệu gửi đi. Booking Q38, Q39: không lưu thông tin sức khoẻ ở kho trình duyệt; giữ khung giờ qua URL và `state.from`. Search: điều kiện bác sĩ công khai, danh sách trắng, khung giờ do máy chủ tính. Admin: w1, w2 ở cấu hình hệ thống; chưa cấu hình thì từ chối. Auth: mã lỗi ổn định, không log bí mật.

### 3.3 Điểm kỹ thuật đã duyệt (PLAN 4.3, T1 đến T11)

**Đã duyệt kỹ thuật (phiên kiểm độc lập, theo ủy quyền của Đại, 26/11/2026; Đại chưa trả lời trực tiếp):** T1 một lời gọi có cấu trúc, enum đóng, luật khẩn cấp trước AI; T2 đối chiếu tất định, đo dương tính giả, ngoại lệ có kiểm chứng; T3 không streaming, hạn chót lan truyền; T4 `fetch`, không SDK, fixture, ghi URL và ngày tra, `store: false` không bảo đảm gì ở gói miễn phí; T5 ngữ cảnh có cấu trúc, đệm có trần; T6 giới hạn trong bộ nhớ, trần toàn cục, dọn bản đồ, chờ kiểm proxy ở staging; T7 export một dịch vụ của search bằng PR nhỏ; T8 thư mục `chatbot`, thêm scope commitlint; T9 tái dùng `state.from`; T10 không thử lại 429 và 4xx; T11 CI không khoá AI, không tạo provider thật khi test.

### 3.4 Điểm lệch có chủ ý so với 2.4.76 và điều đã ghi ở ADR 0007 (chatbot P1, 27/11/2026) `[ĐỒNG BỘ TL]`

Việc sửa file Word do nhóm làm ở repo `TLCN_CLINIX` (PLAN 4.6); chưa làm.

- **T10 (lệch có chủ ý):** 429 và 4xx cấu hình sai (khoá sai, model đã ngừng, yêu cầu sai) **không thử lại**, chuyển lớp và vào cooldown; timeout, lỗi mạng, 5xx, đầu ra sai lược đồ thử lại đúng một lần. Đặc tả 2.4.76 thử lại một lần cho mọi lỗi.
- **Hai lớp thay vì ba** (Q1, Q2) và **trần tổng 20 giây** (Q8) thay vì ba lớp, hai lần, 6 đến 8 giây mỗi lần (khoảng 48 giây): có lần thử bị bỏ khi hết giờ, Đại đã chấp nhận.
- **Cooldown 60 giây chỉ sau khi lớp hỏng**, không sau thành công; lớp đã hỏng ít nhất một lần vào cooldown dù thoát vì hết giờ hay hết suất (điều chỉnh của phiên kiểm, 27/11/2026).
- **Trần mỗi phút theo nhà cung cấp** (HDA-11) nằm ở P1; chatbot B1 chỉ làm giới hạn theo IP và đồng thời, dùng lại, không làm trùng.
- **Quyết định kỹ thuật D1 đến D6** (phiên kiểm duyệt kỹ thuật theo ủy quyền của Đại, 27/11/2026; không phải Đại trả lời trực tiếp): gửi `Api-Revision` như hằng số và X1 chốt có hay không; `AiRequest` mang `output.isValid` thay thư viện kiểm lược đồ; `AiRawAnswer` chỉ có `text`, chưa có `usage`; không sửa `vitest.test-env.ts`; danh sách model đã ngừng giữ hai model của PLAN 5.13.

### 3.5 Chatbot B1: danh sách từ khoá, câu dựng sẵn, cách khớp và chỗ B3 phải nối (PLAN 5.8, 5.16)

Nguồn duy nhất của danh sách là mã: `safety/emergency.rules.ts`, `out-of-scope.rules.ts`, `account.rules.ts`, `canned-answers.ts` (đầu mỗi file ghi trạng thái duyệt). Bản trích để đọc: `D:\du_lieu\TLCN_CLINIX\REPO MÃ NGUỒN\Chatbot_B1_Danh_Sach_Tu_Khoa_Cho_Duyet_2026-11-27.md`.

| Việc | Quyết định | Ai duyệt, khi nào |
|---|---|---|
| Danh sách khẩn cấp: 15 nhóm, **70 cụm** (30 của PLAN 5.8, 36 bổ sung của phiên viết B1, **4 cụm bổ sung do Đại chốt 27/11/2026**: "ngừng thở", "ngưng thở" (nhóm `KC_KHO_THO`), "mất ý thức" (`KC_BAT_TINH`), "xuất huyết" (`KC_CHAY_MAU`)) | Duyệt | Đại, 27/11/2026: nhắn cho phiên kiểm ("đã đọc xong danh sách, tôi duyệt hết", "thêm 4 cụm đó đi"), rồi **xác nhận trực tiếp bằng hộp câu hỏi** trong cửa sổ B1 cùng ngày. **Trung chưa xem** (nên xem trước khi merge) |
| Danh sách ngoài phạm vi: 4 nhóm, **18 cụm**. Bản Đại duyệt có 20 cụm; ca ATY-06 phát hiện "liều bao nhiêu", "bao nhiêu liều" nhận nhầm "trị liệu bao nhiêu tiền" gõ không dấu nên **bỏ hai cụm**. Ngoại lệ tên dịch vụ: "chẩn đoán hình ảnh" | Duyệt (bản 18 cụm) | Đại, xác nhận trực tiếp bằng hộp câu hỏi 27/11/2026 |
| Danh sách tài khoản: 3 nhóm, **15 cụm** | Duyệt | như dòng đầu |
| Cách khớp **theo từng từ** (đúng dấu hoặc dạng bỏ dấu của từ; câu gõ lẫn vẫn bắt), thay cho "cả câu không dấu mới so bản không dấu" của PLAN 5.8 | Đồng ý (kỹ thuật) | phiên kiểm độc lập (theo ủy quyền của Đại), 27/11/2026 |
| "ngat mui" gõ không dấu bị nhận khẩn cấp; "tai nạn" đứng trần; "liều" đứng một mình bỏ, thay bằng cụm; ký tự điều khiển đổi thành dấu cách | Giữ như đề xuất | như dòng đầu |
| Nhóm tự hại (`KC_TU_HAI`) dùng **chung một câu 115** theo Q6. Kết quả của `detectEmergency` mang mã nhóm để sau này B3 hay nhóm đổi sang câu riêng mà không đụng bộ khớp; câu riêng cần người có chuyên môn viết, không phải AI | Giữ một câu | như dòng đầu |
| Chữ sáu loại câu dựng sẵn, gồm dòng "Lễ tân không trực cấp cứu. Đừng chờ tin nhắn trả lời; hãy gọi 115 hoặc đến cơ sở y tế gần nhất." | Duyệt nguyên văn | Đại, hộp câu hỏi 27/11/2026 |
| Trần toàn cục theo nhà cung cấp | **Không làm ở B1**: P1 giữ (`providers/provider-quota.ts`, HDA-11). `SlidingWindowLimiter` chỉ là lớp trong của bộ đếm IP | phiên kiểm, 27/11/2026 |

**Ca nhập nhằng đã biết (thà bắt thừa; mỗi ca có một ca test ghi lại hành vi):**

| Câu | Kết quả | Ghi chú |
|---|---|---|
| "đau ngực nhẹ khi ho", "tôi không khó thở" | khẩn cấp | phủ định bị bỏ qua (ATY-03) |
| "ngat mui nhe" (không dấu) | khẩn cấp (`KC_BAT_TINH`) | "ngat" là dạng bỏ dấu của "ngất"; câu có dấu "ngạt mũi nhẹ" thì không bị nhận (ATY-04) |
| "cho minh tu tu xem" (không dấu) | khẩn cấp (`KC_TU_HAI`) | "tu tu" là dạng bỏ dấu của "tự tử"; "từ từ" có dấu thì không bị nhận |
| "bảo hiểm tai nạn có được hưởng không" | khẩn cấp (`KC_TAI_NAN`) | cụm "tai nạn" đứng trần |
| "đau muốn chết" | khẩn cấp (`KC_TU_HAI`) | |
| "ngộ độc thực phẩm có khám không", "sưng môi do dị ứng" | khẩn cấp | |
| "xuất huyết khi tới kỳ kinh" | khẩn cấp (`KC_CHAY_MAU`) | cụm do Đại chốt 27/11/2026, chấp nhận bắt cả câu hỏi về chu kỳ kinh |
| "đơn thuốc cũ có mang theo không" | ngoài phạm vi (`NP_KE_DON`) | nhầm nhẹ: câu quy trình có "đơn thuốc" |
| "vật lý trị liệu bao nhiêu tiền" (có dấu, không dấu), "chẩn đoán hình ảnh ở tầng mấy", "cho em hỏi một xíu" | **không** bị chặn | ATY-04, ATY-06 |

**Giới hạn đã biết của B1 (không phải lỗi):**
- Cụm là dãy từ **liền nhau**: "đau thắt ở ngực" không khớp; diễn đạt lạ, sai chính tả hay gõ kiểu Telex dở ("dau nguwc") có thể lọt (PLAN R6). Banner luôn có "Cấp cứu: gọi 115" và mô hình gắn `khanCap` là lưới thứ hai.
- Bộ che không bắt được họ tên không theo mẫu tự giới thiệu, địa chỉ, bệnh sử (thông báo trước câu đầu, Q5). Tên theo mẫu: viết hoa chữ đầu thì che các từ viết hoa liền nhau, gõ chữ thường thì che tối đa 4 từ (thà che thừa). Ngày `dd/mm/yyyy` luôn bị che, nên câu "lịch ngày 27/11/2026 còn trống không" mất ngày (ngày không có năm như "5/3" giữ nguyên). Giá tiền ("2.000.000 đồng"), "30 phút", "115", giờ ("08:30") giữ nguyên.
- Bộ giới hạn chỉ ở bộ nhớ một tiến trình (khởi động lại thì mất; nhiều tiến trình thì mỗi tiến trình một bộ đếm); khoá IPv6 theo `/64` chưa làm (đổi tiền tố là né được); khoá bị bỏ khi vượt trần 10.000 IP thì IP đó được đếm lại từ đầu. Nợ kỹ thuật: dòng 341 ở `docs/TECH_DEBT.md` (Đại đồng ý ghi 27/11/2026). Kiểm giới hạn theo IP qua hai mạng khác nhau và `trust proxy` ở staging là việc của X2 (ghi "chờ X2"): staging đã chạy chuỗi Caddy rồi nginx, `deploy/staging/00-realip.conf` (PR 760) giữ IP khách để API đọc đúng.

**Chỗ chatbot B3 phải nối:**
- Thứ tự gọi theo 5.4: (2) `normalizeQuestion`, `normalizeHistory`; (3) `detectEmergency`, trúng thì trả `KhanCap` NGAY và **không** gọi `checkIp` (miễn giới hạn; GHT-06 và đột biến 2 là của B3); (4) `RequestLimiter.checkIp` (429 `TRO_LY_HOI_QUA_NHANH`, `Retry-After` = `retryAfterSeconds`); (5) `detectAccountQuestion`; (6) `detectOutOfScope`; (7) `RequestLimiter.withSlot` (`acquired: false` thì 503 `TRO_LY_DANG_BAN`); (8) `redactText`, `redactTurns`.
- Tham số: `new RequestLimiter({ ipPerMinute, ipPerDay, maxConcurrent, maxTrackedIps })` nhận số từ `AI_IP_PER_MINUTE`, `AI_IP_PER_DAY`, `AI_MAX_CONCURRENT` (B1 không đọc biến môi trường; mặc định bằng PLAN: 5, 50, 3, 10.000).
- Câu dựng sẵn: `getCannedAnswer(kind)` trả mảng chữ; B3 đổi thành đoạn `{ kieu: 'chu', chu }` (5.7) và ghép địa chỉ chi nhánh vào `KhanCap`; hai cờ `coTheGuiLai`, `tinhVaoLichSu` là mặc định theo loại, B3 đổi được.
- `redactTurns` dùng trường `noiDung` (lược đồ API 5.12) còn lượt của cổng nhà cung cấp P1 là `AiTurn` `{ role, content }`: B3 ánh xạ.
- Khi review B3: (a) câu tài khoản và ngoài phạm vi vẫn **tiêu hao hạn mức IP** vì bước 4 đứng trước bước 5 và 6, câu khẩn cấp thì không; (b) ngày `dd/mm/yyyy` trong câu hỏi bị bộ che thay bằng "[đã ẩn]" nên mô hình không thấy; (c) lượt lịch sử `TroLy` do client gửi lên giả được, chỉ là dữ liệu trích dẫn.

## 4. Ghi chú AI

**Phiên lập kế hoạch KHÔNG sửa `AI_USAGE_LOG.md` và `docs/TECH_DEBT.md`** (Đại quyết ghi ở PR sau). Dưới đây là **bản nháp**; kiểm lại số lớn nhất trên `main` lúc ghi. Lúc soạn (`origin/main` `36ec306`) AI log có đến hàng 204, TECH_DEBT đến dòng 327, `AI-BUG` đến 116. Dải số đã cấp cho task này: **AI log hàng 206, nợ kỹ thuật 332 đến 334, `AI-BUG` 120 đến 121** (203 và 323 đến 325 của chat, 205 và 328 đến 331 đã dành cho việc khác).

### 4.1 Nháp dòng AI log (bảng 1, mười cột)

| # | Ngày | Người dùng | Công cụ / model | Phạm vi (module/file) | Prompt chính | Phần AI sinh | Phần tự sửa/viết | Cách kiểm chứng | Commit/PR |
|---|------|-----------|-----------------|-----------------------|--------------|--------------|------------------|-----------------|-----------|
| 206 | 26/11/2026 | MaxTrann | Claude Code (Claude Sonnet 5.5) | `docs/features/chatbot/PLAN.md`, `docs/features/chatbot/TRACKING.md` (MỚI; chỉ hai file này; kế hoạch scope #12 Trợ lý AI) | Lập kế hoạch (chỉ tài liệu, không viết mã) cho scope "Trợ lý AI": Trò chuyện với Trợ lý AI (2.4.7), Trả lời câu hỏi cho Trợ lý AI Hỏi – đáp (2.4.76), Ánh xạ nhu cầu sang chuyên khoa (2.4.77); đối chiếu 2.4 với schema, mã và tài liệu nhà cung cấp; hỏi Đại các quyết định sản phẩm và schema; phương án tối thiểu và đầy đủ; danh sách issue đề xuất | Toàn bộ PLAN (mục 0 đến 10, 111 mã test case, 9 task, 37,5 giờ) và TRACKING; Phụ lục A và B sao chép bằng script; bản nháp commit, PR, AI log, nợ kỹ thuật | Đại trả lời trực tiếp bốn hộp câu hỏi (Q1 đến Q16; 14 theo đề xuất, Q1, Q2 chọn khác); phiên kiểm độc lập duyệt kỹ thuật T1 đến T11 kèm điều kiện (26/11/2026); PLAN còn chờ Đại, Trung review | Đọc nguyên văn 2.4 bằng `python-docx` (chỉ đọc), so hai bản; đối chiếu tên lớp, đường dẫn, cột với mã trên `origin/main` `1349818` rồi so `git diff` tới `36ec306`; đọc trang chính thức của Gemini, Groq, Ollama ngày 26/11/2026 qua hai tác tử con chỉ đọc trang (không gọi API); script kiểm 53 đoạn trích 2.4 đúng từng chữ, số cột bảng, 111 mã test không trùng và mỗi mã đúng một task nhận, mã ở bảng task khớp ô "Đóng khi", 12 đột biến giao đủ, giờ khớp giữa các bảng, tiêu đề issue và PR ≤ 100 ký tự, không ký tự `@` nào ngoài backtick; không chạy `npm`, test, build, Docker, MySQL; không đọc `.env`; không lệnh git ghi | `[cần điền]` (PR tài liệu của Đại) |

### 4.2 Nháp dòng nợ kỹ thuật (332 đến 334; chỉ ghi khi lối tắt có thật trong mã; cột đúng bảng của `docs/TECH_DEBT.md`)

| # | Ngày | Mô tả nợ | Vì sao chấp nhận | Rủi ro | Kế hoạch xử lý (khi nào) | Trạng thái |
|---|---|---|---|---|---|---|
| 332 | `[ngày merge chatbot B3]` | **Trợ lý AI dùng gói miễn phí của bên thứ ba:** (a) Gemini miễn phí dùng nội dung để cải thiện sản phẩm và có người đọc; (b) điều khoản Google, Groq không cho dùng làm tư vấn y khoa, đòi người dùng API từ 18 tuổi, dòng "từ 18 tuổi" không xác minh được; (c) che định danh không bắt được mọi họ tên, địa chỉ, bệnh sử; (d) container `web` ở dev cũng nhận khoá qua `env_file` | Q5: đồ án dùng dữ liệu mẫu, có thông báo và đồng ý trước câu đầu, không lưu, không gửi dữ liệu tài khoản | Dữ liệu sức khoẻ người dùng gõ vào rời hệ thống; vi phạm điều khoản có thể làm tài khoản hay khoá API bị chặn | Trước khi mở công khai: chuyển gói trả phí hay mô hình tự chạy, rà quy định bảo vệ dữ liệu cá nhân, tách biến môi trường của `web` | Mở |
| 333 | `[ngày merge chatbot B1]` | **Giới hạn và trạng thái của Trợ lý trong bộ nhớ một tiến trình:** bộ đếm theo IP, trần toàn cục, cooldown, đệm ngữ cảnh; `req.ip` sau proxy staging chưa kiểm; mạng chung một IP chạm trần chung; `chuyenKhoaId` của API gợi ý nằm ở query nên vào log truy cập nginx | T6: một tiến trình API, không Redis; nếp tra cứu công khai | Khởi động lại hay chạy nhiều tiến trình thì trần mất tác dụng; sau proxy mọi người có thể chung một IP | Kiểm chuỗi proxy khi có staging (PLAN 5.10); Redis hay throttling chung (việc X3 auth/admin) trước khi mở công khai | Mở |
| 334 | `[ngày merge chatbot B2]` | **Đối chiếu và luật an toàn bằng luật tất định:** khẳng định định tính không chứa từ khoá, tên khoa viết không kèm "chuyên khoa" vẫn lọt; luật khẩn cấp theo từ khoá có âm tính và dương tính giả, chỉ xét câu đang gửi; ngữ cảnh chưa có bài viết | T2: không dùng AI chấm AI; Q11 | Trợ lý nói sai mà không bị chặn; bỏ sót câu cấp cứu diễn đạt lạ | Bổ sung bộ câu chuẩn và ngoại lệ có kiểm chứng theo thực tế; nối bài viết khi module có | Mở |

### 4.3 Nháp lỗi AI (`AI-BUG-120`, `[đề xuất]`; chỉ ghi nếu Đại muốn, vì mọi lỗi do AI tự phát hiện và sửa trước khi giao, chưa vào commit nào)

| Mã | Ngày | Mô tả lỗi | Nguyên nhân (phân tích) | Cách phát hiện | Commit sửa |
|---|---|---|---|---|---|
| `AI-BUG-120` | 26/11/2026 | Ở chatbot (lập kế hoạch, MaxTrann, Claude Code Claude Sonnet 5.5): các sai sót trong bản nháp PLAN, đều sửa trước khi giao: (1) ghi Gemini trả mã 429 khi vượt hạn mức trong khi trang chỉ nêu 429 cho giới hạn chi tiêu; (2) ghi "một chuỗi băm" trong khi `grep` khớp hai; (3) kế hoạch đo X1 gồm quá nhiều lời gọi so với hạn mức token mỗi ngày ghi ở chính bảng 3.4; (4) sơ đồ phụ thuộc vẽ lặp một task | Viết gọn lại báo cáo của tác tử đọc trang mà không đối chiếu từng câu; đặt cỡ đo trước khi nhân với hạn mức | Đọc lại bản nháp đối chiếu với báo cáo đọc trang, kết quả `grep` và phép nhân hạn mức | `[cần điền]` (chưa vào commit) |

## 5. Phối hợp với module khác

| Với | Điểm | Cần gì | Trạng thái |
|---|---|---|---|
| Trung (chat) | P1: `app.module.ts`, `env.validation.ts`, `.env.example`, `commitlint.config.cjs`, `docs/adr/` | ai merge sau thì rebase; báo nhau | P1 đã sửa: `app.module.ts` (hai dòng), `env.validation.ts` (khối cuối class, hai hàm nhỏ, một dòng ở `crossFieldProblems`), `.env.example` (khối cuối), `commitlint.config.cjs` và `AGENTS.md` (một từ), ADR 0007; **báo Trung ở PR** |
| Trung (review) | mọi PR của scope | review và approve | chờ |
| Đại (search) | B2: export `PublicDoctorService` | PR nhỏ riêng, test search không đổi | chờ |
| Đại (router) | F1: `router/root-layout.tsx` | không đụng `role-nav`, `role-routes`, `role-shells` | chờ |
| Chat | liên kết tới trang Tin nhắn | `[CHỜ chat]`; trước đó hiện đường dây nóng | chờ |
| Payment | kiểm `trust proxy` ở staging ảnh hưởng IP gửi VNPAY | báo khi đổi | `[CHỜ staging]` |
| Phiên kiểm | T1 đến T11 | duyệt kỹ thuật | đã duyệt 26/11/2026 |
| Đại (khoá, cam kết) | khoá Groq, Gemini cục bộ; đọc hạn mức; duyệt từ khoá và câu chữ; chốt phạm vi 27/11 | trước X1 và B1 | chờ |
| Đại (GitHub) | nhãn `module:chatbot`, milestone `chatbot`, Epic, script sinh issue | sau khi PR tài liệu merge | chờ |
| Đổi lịch, thông báo | không chạm | — | không chờ |

## 6. Số đo thật và bộ câu hỏi chuẩn (PLAN.md mục 5.15; **tiêu chí đặt TRƯỚC khi chạy, không đổi sau khi thấy số**)

### 6.1 Đo X1

| Mã | Câu hỏi | Tiêu chí đạt | Kết quả |
|---|---|---|---|
| M1 | Hình dạng yêu cầu đúng tài liệu hiện hành | 3 lời gọi thử mỗi lớp ra JSON đúng lược đồ | chưa đo |
| M2 | Độ trễ mỗi lớp (40 lời gọi) | p95 Groq ≤ 6 giây, Gemini ≤ 8 giây | chưa đo |
| M3 | Đầu ra đúng lược đồ | ≥ 38/40 mỗi lớp | chưa đo |
| M4 | Token mỗi lời gọi | p95 vào ≤ 3.000, tổng ≤ 4.000 | chưa đo |
| M5 | Ánh xạ chuyên khoa (20 câu) | ≥ 17/20 mỗi lớp | chưa đo |
| M6 | Đối chiếu loại nhầm (20 câu hợp lệ) | ≤ 3/20 | chưa đo |
| M7 | Hạn mức gói miễn phí (Đại đọc console) | ghi số | chưa đo |

### 6.2 Bộ câu hỏi chuẩn (X2) và metric

| Nhóm | Số câu | Đạt tự động | Đạt chấm tay |
|---|---|---|---|
| Hỏi – đáp dữ liệu | 8 | chưa chạy | chưa chấm |
| Gợi ý đặt lịch | 8 | chưa chạy | chưa chấm |
| Ngoài phạm vi (N6) | 5 | chưa chạy | chưa chấm |
| Khẩn cấp (CB1) | 4 | chưa chạy | — |
| Chèn lệnh, lộ lời nhắc | 3 | chưa chạy | chưa chấm |
| Dữ liệu không có | 2 | chưa chạy | chưa chấm |

N6, CB1, CB2 (cam kết đề xuất) và CB3 đến CB6 (báo cáo): chưa đo.

### 6.3 Chatbot B1: kết quả test và đột biến mục tiêu (PLAN 5.15; chạy 27/11/2026)

**Mã test case** (10 file spec, 465 ca, xanh): ATY-01…ATY-08 (`emergency.rules`, `out-of-scope.rules`, `account.rules`, `phrase-matcher`, `question-normalizer`), RTU-01…RTU-05 (`redact`), GHT-01…GHT-05 và GHT-07 (`sliding-window-limiter`, `request-limiter`); cả 19 mã Pass, 0 đỏ. Dòng **Tổng** và câu "Đột biến mục tiêu" ở mục 2 đã cộng cả hai bên sau khi gộp với P1: 19 mã của P1 và 19 mã của B1 (8 ATY, 5 RTU, 6 GHT) là 38 mã đã chạy; Đ3 đến Đ8 đã chạy, cả 6 bị bắt.

**Ca bổ sung của B1** (mã `B1-nn`, ngoài PLAN mục 7, không tính vào 111 mã): 58 ca. `B1-01`…`B1-07` là hợp đồng câu dựng sẵn (`canned-answers.spec.ts`); còn lại là ca cơ chế của bộ khớp (`phrase-matcher.spec.ts`), bất biến và an toàn đầu vào lạ của bộ che (`redact.spec.ts`: chuỗi rỗng, 100.000 ký tự, mẫu lặp dưới 2 giây, che hai lần bằng che một lần), giá trị mặc định và tham số sai của bộ giới hạn, ca nhập nhằng đã biết, và 18 ca của `safety.architecture.spec.ts` (đối chứng ÂM trên nguồn giả trước khi quét mã thật).

Giao thức mỗi đột biến: sao lưu file mã ngoài repo kèm SHA-256; đối chứng TRƯỚC (một vitest một file, phải xanh); áp đột biến (đoạn thay phải xuất hiện đúng một lần); chạy lại đúng file spec đó; khôi phục trong `finally` rồi so SHA-256; đối chứng SAU (phải xanh); `git status --porcelain` chỉ còn `apps/api/src/chatbot/`. Một lệnh vitest một file, một worker.

| Đột biến | Ca phải bắt | Kết quả | Ca đỏ / tổng | Đối chứng trước, sau | SHA-256 khôi phục |
|---|---|---|---|---|---|
| **7** bỏ che số điện thoại (xoá mẫu `PHONE` khỏi `REDACTION_PATTERNS`, `safety/redact.ts`) | RTU-02 | **bị bắt** | 15 / 77 (RTU-02 mười dạng số, RTU-03 CCCD gõ cách, RTU-04, RTU-05 và một ca bổ sung) | 0 đỏ, 0 đỏ | khớp |
| **8** không che lịch sử (`redactTurns` giữ nguyên `noiDung`) | RTU-04 | **bị bắt** | 2 / 77 (cả hai ca của RTU-04) | 0 đỏ, 0 đỏ | khớp |
| (i) tắt bỏ dấu khi khớp (`plain: exact`, `safety/phrase-matcher.ts`) | ATY-02 | bị bắt | 89 / 200 (`emergency.rules.spec.ts`) | 0 đỏ, 0 đỏ | khớp |
| (ii) bỏ `finally` ở `withSlot` (`limit/request-limiter.ts`) | GHT-05 | bị bắt | 3 / 27 | 0 đỏ, 0 đỏ | khớp |
| (iii) ngưỡng 500 điểm mã dùng `>=` (`safety/question-normalizer.ts`) | ATY-08 | bị bắt | 7 / 21 | 0 đỏ, 0 đỏ | khớp |
| (iv) bỏ dọn mục quá hạn (`limit/sliding-window-limiter.ts`) | GHT-07 | bị bắt | 1 / 10 | 0 đỏ, 0 đỏ | khớp |

Đột biến (i) đến (iv) là bốn đột biến **tuỳ chọn** do phiên viết B1 đề xuất cho phần an toàn y tế (không nằm trong 12 đột biến của PLAN 5.15). Mười đột biến còn lại của PLAN (1 đến 6, 9 đến 12) thuộc P1, B2, B3. Số liệu thô nằm ở thư mục tạm của phiên (không vào repo).

## 7. Cảnh báo và việc chờ (cập nhật khi có thay đổi)

- **Chốt phạm vi 27/11:** phương án tối thiểu 37,5 giờ (cắt còn 34, PLAN 6.4); nếu cam kết chatbot thì đề xuất mốc riêng 14/12 để không làm metric P1 ngày 07/12 tụt dưới 90 phần trăm (PLAN 6.4).
- **Hai model của đặc tả đã ngừng**; trang nhà cung cấp đổi nhanh: X1 kiểm lại trước khi viết mã.
- **Hạn mức miễn phí nhỏ** (PLAN 3.6 R2): thử trước buổi demo.
- **`[ĐỒNG BỘ TL]` ngoài repo (Đại):** 2.4.7, 2.4.76, 2.4.77 (hai bản), 2.1_2.2, 1.2.1, 1.3.3, bảng Phân loại M18, M19 (PLAN 4.6); chưa sửa.
- **Nhãn `module:chatbot` và milestone `chatbot` chưa có** trên GitHub.
- Trước khi viết B1: Đại duyệt danh sách từ khoá khẩn cấp, ngoài phạm vi, tài khoản.
- **chatbot P1 (27/11/2026):** `test:e2e` riêng của chatbot đã chạy (4 ca xanh). DB tạm `clinix_chatbot_p1_test` còn nguyên trong MySQL `clinix-app-db-1`, **cần Đại cho phép mới dọn**. Cả bộ `test:e2e` chưa chạy ở máy (CI chạy).
- **chatbot P1: vị trí file e2e.** `src/chatbot/chatbot.e2e-spec.ts` đặt **cạnh mã** để nằm trong phạm vi duyệt sẵn của task; nếp của dự án là đặt e2e ở `apps/api/test/`. `vitest.config.e2e.ts` có `include: ['**/*.e2e-spec.ts']` nên CI nhặt file này cùng các file ở `test/`. **Chuyển sang `test/` nếu Trung muốn.** Ca không khẳng định tên DB (CI dùng `clinix_test`, kiểm tay dùng DB tạm), đặt và khôi phục `process.env` đầy đủ trong `afterEach`.
- **chatbot P1 (27/11/2026):** dòng nợ kỹ thuật 339 (cooldown, trần mỗi phút ở bộ nhớ một tiến trình; PLAN R8), hàng AI log 212 và `AI-BUG-126` đã ghi vào `docs/TECH_DEBT.md` và `AI_USAGE_LOG.md` theo ý Đại (phiên kiểm chuyển lại câu trả lời). Bộ đếm IP là nợ của chatbot B1, B1 tự ghi.
- **chatbot X1 M1** phải đo thêm: Groq `reasoning_effort` cùng `json_schema`, tên trường `usage`, có và không `Api-Revision`, Gemini "nghĩ" mặc định và `max_output_tokens`. Hạn mức gói miễn phí vẫn `[cần điền]`.
- **Lược đồ của chatbot B2 phải đúng luật `strict` của Groq:** mọi trường nằm trong `required` và mọi đối tượng có `additionalProperties: false`; Gemini bỏ qua `minLength`, `maxLength`.
- **chatbot B1 (27/11/2026):** danh sách từ khoá khẩn cấp, ngoài phạm vi, tài khoản đã được Đại duyệt (mục 3.5), nên việc ở dòng "Trước khi viết B1" phía trên đã xong. **Trung chưa xem**: nên đọc mục 3.5 và ba file `*.rules.ts` trước khi duyệt PR chatbot B1.
