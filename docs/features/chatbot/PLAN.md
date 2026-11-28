# Kế hoạch scope #12: `chatbot` Trợ lý AI (hỏi – đáp an toàn và gợi ý đặt lịch)

> **Trạng thái: bản nháp 1, giai đoạn 1 (26/11/2026). Đại đã trả lời trực tiếp 16 câu Q1 đến Q16** (bốn hộp câu hỏi trong phiên lập kế hoạch): 14 câu theo đề xuất; **Q1 và Q2 chọn khác: chuỗi `Groq → Gemini → câu dựng sẵn`, bỏ Ollama**; Q9 chốt phạm vi **tinh giản** (phương án tối thiểu là phương án chính). Điểm kỹ thuật T1 đến T11 **đã được phiên kiểm độc lập duyệt kỹ thuật** ngày 26/11/2026 kèm điều kiện (mục 4.3). Còn lại: các `[cần điền]` ở 4.4 và việc ngoài repo ở 4.6. Chưa mở PR; **chưa tạo issue** (danh sách issue đề xuất ở mục 6.6; Đại tự chạy script sau khi PR tài liệu merge).
> **Người LÀM scope này: Đại (`MaxTrann`), module `chatbot`; Trung (`junUTE`) review.** Điểm chạm file dùng chung gắn thẻ `[ĐỤNG …]`; Trung approve PR tài liệu coi là xác nhận các điểm chạm đó.
> Kế hoạch lập theo [`docs/FEATURE_PLANNING_PROMPT.md`](../../FEATURE_PLANNING_PROMPT.md) và prompt lập kế hoạch scope Trợ lý AI do Đại đưa ngày 26/11/2026. **Phiên lập kế hoạch này KHÔNG sửa `AI_USAGE_LOG.md` và `docs/TECH_DEBT.md`** (bản nháp ở [`TRACKING.md`](TRACKING.md) mục 4).
> Đã kiểm mã thật trên `origin/main` ở **`1349818`** (26/11/2026); đối chiếu lại với `36ec306` (đổi lịch D1, PR 726: chỉ đổi tài liệu và chú thích của `docs/database/*`, không đổi mã hay bảng mà kế hoạch này dựa vào). Chỗ nào ghi **"chưa đo"** hay **"chưa kiểm"** là suy ra từ mã hay tài liệu, **chưa chạy thử**. Phiên này **không chạy** `npm`, test, build, Docker hay MySQL, **không đọc** `.env` thật, **không gọi** API AI nào, chỉ đọc trang tài liệu công khai của nhà cung cấp, và chỉ tạo hai file mới `docs/features/chatbot/PLAN.md`, `TRACKING.md`.
> Scope này là **#12** trong lộ trình (Q15), sau nhắn tin (#11, Trung); danh sách chờ và bài viết có thể đi sau. **Mã mới nằm trong `apps/api/src/chatbot/` và `apps/web/src/features/chatbot/`**; scope commit `chatbot` (thêm vào `commitlint.config.cjs` ở P1, T8).
>
> **Bốn điều phải đọc trước khi chốt phạm vi ngày 27/11:**
> 1. **Hai model mà use case 2.4.76 ghi đều đã ngừng:** `gemini-2.0-flash` tắt ngày 01/06/2026, `llama-3.1-8b-instant` tắt ngày 16/08/2026 (mục 3.4). Tên model nằm trong cấu hình.
> 2. **Điều khoản nhà cung cấp xung đột một phần với mục đích:** gói miễn phí Gemini dùng nội dung để cải thiện sản phẩm, có người đọc, dặn không gửi thông tin nhạy cảm; điều khoản của Google và Groq đều nói dịch vụ không dùng để tư vấn y khoa và đòi người dùng API từ 18 tuổi. Đại chọn giữ gói miễn phí **kèm thông báo đầy đủ và che định danh** (Q5); rủi ro còn lại ghi ở 3.6 R3 và nháp nợ.
> 3. **Phạm vi tinh giản (Q9):** 9 task, **37,5 giờ** (cao hơn mốc 25 đến 35 giờ phiên kiểm chuyển lời; lý do và cách cắt ở 6.4). Không streaming, không bảng mới, không embedding, không lưu hội thoại, không dữ liệu tài khoản.
> 4. **Ảnh hưởng tới metric P1 của bản cam kết:** nếu cam kết chatbot mà tính chung vào P1 ở mốc 07/12 thì có thể tụt dưới 90 phần trăm (phép tính ở 6.4); nên ghi mốc riêng cho chatbot khi chốt.

## 0. Quy ước đọc

- Tên use case viết tắt, **trùng tiền tố mã test** (quét ngày 26/11/2026 bằng `grep` trên `docs/`, `apps/api/src`, `apps/api/test`, `apps/web/src`: chưa ai dùng): **TLA** = Trò chuyện với Trợ lý AI (2.4.7); **HDA** = Trả lời câu hỏi cho Trợ lý AI Hỏi – đáp (2.4.76, chuỗi dự phòng và hợp đồng nhà cung cấp); **ANX** = Ánh xạ nhu cầu sang chuyên khoa (2.4.77); **CFG** = cấu hình; **ATY** = an toàn y tế; **RTU** = riêng tư; **CPI** = chèn lệnh; **GHT** = giới hạn tốc độ; **NGC** = ngữ cảnh; **DCR** = đối chiếu đầu ra; **GOI** = API gợi ý; **WTL** = giao diện web; **KTL** = kiểm tay. `b4` = bước (4); `A1/4b` = luồng thay thế A1, mục 4b; "MT" = Mô tả; "TĐK" = tiền điều kiện; "HĐK" = hậu điều kiện. Nguyên văn ba use case ở **Phụ lục A**, use case và tài liệu liên quan ở **Phụ lục B** (sao chép bằng script, không gõ lại). **Dự án không dùng Use Case ID**, chỉ tên.
- **Chữ trong ngoặc kép cong “…” là trích nguyên văn từ file 2.4 gốc.** Trích từ trang web của nhà cung cấp đặt trong «…». Chữ giao diện đề xuất đặt trong ngoặc kép thẳng.
- **Đánh số use case:** theo file gốc `D:\du_lieu\TLCN_CLINIX\2.4_Dac_Ta_Use_Case_CLINIX.docx` (76 use case). Bản làm việc `Drive_Hien_Tai\2.4_Dac_Ta_Use_Case_CLINIX.docx` (57 use case) **không có** 2.4.76, 2.4.77 thành use case riêng mà gộp vào 2.4.7; bảng ánh xạ ở Phụ lục A (Q16).
- Nguồn đúng khi lệch nhau: **schema DB (`docs/database/`) để code**; chỗ 2.4, 1.2.1, schema, Figma và mã lệch nhau ở mục 3.3. **Không tự chọn bên nào** (AGENTS mục 1.6). Figma chỉ là bản phác thảo: **không đề xuất đồng bộ lại Figma**; mã và PLAN là nguồn đúng.
- Thẻ: `[ĐỒNG BỘ TL]` = hành vi khác chữ tài liệu gốc, trong PR cập nhật PLAN, TRACKING và nhắc việc sửa Word ở 4.6 (file Word do nhóm sửa, ngoài repo); `[TIỀN ĐỀ]` = việc nền; `[CHỜ X1]` = chờ số đo; `[CHỜ Đại]` = cần Đại làm hay đưa khoá của mình khi chạy; `[CHỜ chat]` = chờ trang nhắn tin của scope chat; `[CHỜ staging]` = chờ môi trường staging; `[ĐỤNG x]` = sửa file thuộc module hay vùng x: `[ĐỤNG search]`, `[ĐỤNG router]`, `[ĐỤNG database]` (`app.module.ts`), `[ĐỤNG docker]` (`.env.example`, `config/env.validation.ts`, `commitlint.config.cjs`); `[SOẠN TRƯỚC]` = viết được ngay nhưng **chưa merge** khi phụ thuộc chưa có; `[SAU]` = ngoài scope này.
- Mỗi task = **một PR** nhỏ, **chỉ backend HOẶC chỉ frontend** (X là đo, kiểm, tài liệu), 3 đến 5,5 giờ; một ngoại lệ đã duyệt: B2 có thêm một PR nhỏ riêng export một dịch vụ của `search` (T7). Mức kiểm: **ĐB** = đơn vị, tích hợp hay e2e theo task và **đột biến mục tiêu** (chỉ an toàn y tế, đối chiếu đầu ra, chuỗi dự phòng, thêm vài ca cho bộ che định danh, log và chốt không gọi AI thật vì đó là phần an toàn không được cắt; 5.15); **THƯỜNG** = đơn vị, tích hợp, e2e; **GỌN** = web (đột biến bốn loại: kho trình duyệt, URL, log; bấm đúp; tính toán ở client; chặn theo trạng thái; không chạy tay jscpd và gitleaks, CI đo).
- `[đề xuất]` = giá trị AI tự đề xuất, chưa chốt; `[cần điền]` = thiếu thông tin, chưa có đề xuất. **Mục 4.4 liệt kê lại cả hai loại.**
- **Mã task trùng** với mã của `booking`, `reschedule`, `notification`, `chat` (P1, B1, F1, X1…). Khi nhắc ngoài file này luôn viết **"chatbot B2"**; issue và PR dùng nhãn `[chatbot]` và hậu tố `(chatbot B2)`.
- **Thuật ngữ:** "lớp" = một nhà cung cấp trong chuỗi dự phòng; "câu dựng sẵn" = câu cố định của hệ thống, không do AI viết; "chỗ giữ" = ký hiệu `[[LOAI:id]]` mô hình dùng để nhắc một thực thể, máy chủ thay bằng chữ lấy từ DB; "đối chiếu" = bước 5 của 2.4.7; "bộ câu hỏi chuẩn" = tập câu tổng hợp để chấm chất lượng (5.15).

## 1. Phạm vi

**Làm (ba use case, tinh giản theo Q9):**

| Use case | Tác nhân | Việc chính của scope | Đường vào |
|---|---|---|---|
| **2.4.7 Trò chuyện với Trợ lý AI (hỏi – đáp & gợi ý đặt lịch)** | Khách vãng lai, Bệnh nhân | Banner và đồng ý; hỏi – đáp trên dữ liệu công khai; chặn khẩn cấp và ngoài phạm vi; đối chiếu trước khi hiển thị; gợi ý chuyên khoa, bác sĩ, khung giờ trống thật; chuyển sang Đặt lịch khám | nút nổi "Trợ lý AI" ở trang công khai và cổng Bệnh nhân |
| **2.4.76 Trả lời câu hỏi cho Trợ lý AI Hỏi – đáp** | Dịch vụ AI | Cổng nhà cung cấp; chuỗi `Groq → Gemini → câu dựng sẵn`; thời gian chờ, thử lại, cooldown | nội bộ (API chatbot gọi) |
| **2.4.77 Ánh xạ nhu cầu sang chuyên khoa cho gợi ý đặt lịch** | Dịch vụ AI | Cùng một lời gọi có cấu trúc (T1); lọc theo chuyên khoa đang hoạt động | nội bộ |

**Cùng phần hệ thống chúng chạm (không phải use case riêng):** đọc danh mục công khai và khung giờ trống; công thức xếp bác sĩ w1/w2 (1.2.1, Q10); liên kết sang Đặt lịch khám; liên kết tới "Lịch hẹn của tôi", "Ví của tôi", kênh nhắn lễ tân; cấu hình khoá và model; giới hạn tốc độ; bộ câu hỏi chuẩn.

**Không làm (ghi rõ):**
- **Ollama** và mọi mô hình cục bộ, hồ sơ `profiles` của compose (Q1, Q2).
- **Streaming** (T3); **bảng mới, migration**, lưu hội thoại hay câu hỏi (Q3); **embedding**, tìm kiếm vector (T5).
- Đọc hay gửi **dữ liệu tài khoản** của Bệnh nhân cho Trợ lý (Q4: chỉ liên kết tới trang).
- Giữ chỗ, đặt, đổi, huỷ lịch, thanh toán thay người dùng (2.4.7 HĐK): chatbot **chỉ đọc**.
- Module **bài viết** và đọc bảng `bai_viet` (Q11); nhắn tin (scope chat #11): chỉ **liên kết**; thông báo, email, nhật ký hành động: **không đụng**.
- Trang quản trị cho Trợ lý (trừ trọng số w1/w2 đã có ở "Cấu hình hệ thống"), thống kê, đánh giá thích/không thích câu trả lời, giọng nói, đa ngôn ngữ, ứng dụng di động.
- `@nestjs/throttler` hay Redis (T6); giới hạn theo IP cho các module khác (việc X3 của auth/admin).
- Gọi API AI thật trong CI hay trong test tự động (T11).
- Sửa `docs/features/{reschedule,chat,notification}/*`, `AI_USAGE_LOG.md`, `docs/TECH_DEBT.md`, `docs/database/*` ở PR kế hoạch này. Đồng bộ lại Figma: không.

### 1.1 Bảng use case → luồng, điều kiện, ngoại lệ → ĐÃ CÓ hay CÒN THIẾU → thành phần mã sẽ chạm

Cột "Nguyên văn" chép từ file 2.4 gốc (Phụ lục A). "Hiện trạng" là kết quả kiểm mã ở `1349818` (chi tiết ở mục 2). `bot/` = `apps/api/src/chatbot/`; `web/` = `apps/web/src/`.

| UC | Nguyên văn (luồng, điều kiện, ngoại lệ) | Hiện trạng | Thành phần mã sẽ chạm | Task |
|---|---|---|---|---|
| 2.4.7 | MT: “Hỏi – đáp thời gian thực dựa trên dữ liệu công khai của hệ thống (chi nhánh, chuyên khoa, bác sĩ, dịch vụ, chính sách, bài viết), không chẩn đoán/không kê đơn y tế.” | **CÒN THIẾU** toàn bộ mã Trợ lý. **ĐÃ CÓ** API công khai chi nhánh, chuyên khoa, dịch vụ, bác sĩ, thông tin phòng khám; bài viết mới có DDL | `bot/context/`, `bot/answer/` | B2, B3 |
| 2.4.7 | Tác nhân: “Khách vãng lai, Bệnh nhân.” | **ĐÃ CÓ** decorator `@Public()`, khung công khai, khung Bệnh nhân | route công khai, khung chat | B3, F1 |
| 2.4.7 | TĐK: “Không yêu cầu đăng nhập cho nhóm hỏi – đáp và xem gợi ý; yêu cầu đã đăng nhập với vai trò Bệnh nhân (đã xác minh email) để tiếp tục vào luồng đặt lịch từ khung giờ gợi ý.” | **ĐÃ CÓ** `RequireAuth` vai Bệnh nhân cho bước 4 đến 6 và cổng đủ điều kiện của booking | liên kết `bookingInfoPath` | F2 |
| 2.4.7 | TĐK: “Dịch vụ AI (Gemini/Groq/Ollama) đang hoạt động.” | **CÒN THIẾU**; Q1 đổi thành Groq, Gemini; không có AI thì vẫn chạy bằng câu dựng sẵn | `bot/providers/` | P1 |
| 2.4.7 | b1: “(1) Người dùng mở khung chat Trợ lý AI; hệ thống hiển thị banner cảnh báo: chỉ tư vấn sơ bộ, không chẩn đoán, không kê đơn, không thay thế khám trực tiếp.” | **CÒN THIẾU** | `web/features/chatbot/` | F1 |
| 2.4.7 | b2, b3: “(2) Người dùng nhập câu hỏi.” “(3) Hệ thống gửi câu hỏi cùng ngữ cảnh dữ liệu công khai liên quan (chi nhánh, chuyên khoa, bác sĩ, dịch vụ, chính sách, bài viết) tới Dịch vụ AI (use case "Trả lời câu hỏi cho Trợ lý AI Hỏi – đáp").” | **CÒN THIẾU** | `bot/safety/`, `bot/context/`, `bot/ask/` | B1, B2, B3 |
| 2.4.7 | b4: “(4) Dịch vụ AI trả về câu trả lời.” | **CÒN THIẾU** | `bot/providers/`, lược đồ đầu ra | P1, B2 |
| 2.4.7 | b5: “(5) Hệ thống đối chiếu các dữ liệu xác định trong câu trả lời (tên bác sĩ, chuyên khoa, giá, khung giờ...) với dữ liệu thật trong hệ thống trước khi hiển thị.” | **CÒN THIẾU** | `bot/answer/output-verifier.ts` | B2 |
| 2.4.7 | b6: “(6) Hệ thống hiển thị câu trả lời cho người dùng.” | **CÒN THIẾU** | hiển thị theo đoạn | F1 |
| 2.4.7 | b7: “Nếu người dùng nêu nhu cầu khám bệnh, hệ thống gửi yêu cầu ánh xạ nhu cầu sang chuyên khoa tới Dịch vụ AI” | **CÒN THIẾU** | một lời gọi có cấu trúc (T1) | B2, B3 |
| 2.4.7 | b8: “(8) Hệ thống hiển thị (các) chuyên khoa được gợi ý cho người dùng xác nhận hoặc chọn lại.” | **ĐÃ CÓ** `GET /public/specialties`; **CÒN THIẾU** thẻ gợi ý | `web/features/chatbot/suggest/` | F2 |
| 2.4.7 | b9: “(9) Sau khi người dùng chọn chuyên khoa, hệ thống tính khung giờ khám còn trống (use case "Tính khung giờ khám còn trống", extend) cho các bác sĩ thuộc chuyên khoa đó.” | **ĐÃ CÓ** `AvailableSlotsReader`; **CÒN THIẾU** gom theo chuyên khoa và xếp hạng | `bot/suggest/` | B4 |
| 2.4.7 | b10: “(10) Hệ thống hiển thị danh sách bác sĩ và khung giờ còn trống phù hợp để người dùng chọn.” | **CÒN THIẾU** | thẻ bác sĩ, ô giờ | B4, F2 |
| 2.4.7 | b11: “(11) Nếu người dùng là Bệnh nhân đã đăng nhập và chọn một khung giờ, hệ thống chuyển sang luồng "Đặt lịch khám" với chi nhánh/dịch vụ/bác sĩ/khung giờ đã điền sẵn từ lựa chọn này.” | **ĐÃ CÓ** bước 4 `/dat-lich/thong-tin?khungGioId=…`: máy chủ suy bác sĩ, dịch vụ, chi nhánh từ khung giờ | liên kết, không sửa booking | F2 |
| 2.4.7 | HĐK: “(hoặc dữ liệu tài khoản của chính mình nếu là Bệnh nhân, qua API có phân quyền)” | Q4: **không** đọc dữ liệu tài khoản; chỉ liên kết tới trang | luật nhận câu hỏi tài khoản | B1, F1 |
| 2.4.7 | HĐK: “Trợ lý AI không tự giữ chỗ hay xác nhận lịch hộ người dùng.” | **KHỚP** theo thiết kế: `chatbot` không ghi bảng nào | — | B4, F2 |
| 2.4.7 | HĐK: “Thất bại: Không có giữ chỗ hay đặt lịch nào phát sinh ngoài ý muốn người dùng; hệ thống hiển thị giới hạn/lỗi tương ứng (xem Luồng thay thế).” | **CÒN THIẾU** | các nhánh lỗi | B3, F1 |
| 2.4.7 | A1/4a, 4b, 4c: “4a. Dịch vụ AI hoặc hệ thống nhận diện câu hỏi vượt phạm vi tư vấn (yêu cầu chẩn đoán/kê đơn cụ thể) hoặc có dấu hiệu khẩn cấp.” “4b. Hệ thống trả lời nêu rõ giới hạn của Trợ lý AI, hướng người dùng đến bác sĩ/cơ sở y tế gần nhất, hoặc gợi ý dùng kênh "Nhắn tin với lễ tân" nếu là tình huống cấp cứu.” “4c. Use case tiếp tục ở trạng thái chờ câu hỏi mới — không kết thúc hội thoại.” | **CÒN THIẾU**; kênh nhắn tin chưa có mã (scope chat) | luật tất định, câu dựng sẵn (Q6 thêm 115) | B1, B3, F1 |
| 2.4.7 | A2/5b: “5b. Hệ thống dùng phản hồi dự phòng (không hiển thị thông tin sai), thông báo chưa đủ dữ liệu để trả lời chính xác phần đó.” | **CÒN THIẾU** | đối chiếu | B2, B3 |
| 2.4.7 | A3/3b, 3c: “3b. Hệ thống hiển thị thông báo "Trợ lý AI hiện không phản hồi, vui lòng thử lại sau" và không tính đây là câu hỏi đã được trả lời.” “3c. Người dùng thử gửi lại — quay lại bước 3, hoặc chuyển sang kênh khác (Nhắn tin với lễ tân/bác sĩ nếu đã đăng nhập) — use case kết thúc nếu người dùng rời khung chat.” | **CÒN THIẾU** | kết quả `DuPhong`, nút "Gửi lại" (Q13) | P1, B3, F1 |
| 2.4.7 | A4/7b: “7b. Hệ thống thông báo chưa xác định được chuyên khoa phù hợp, gợi ý người dùng mô tả rõ hơn hoặc tự chọn chuyên khoa qua "Tra cứu bác sĩ và lịch khám".” | **CÒN THIẾU** | kết quả `KhongCoChuyenKhoa` | B3, F2 |
| 2.4.7 | A5/9b: “9b. Hệ thống thông báo hiện chưa có khung giờ trống phù hợp, gợi ý người dùng nới khoảng thời gian hoặc chọn chuyên khoa/bác sĩ khác.” | **CÒN THIẾU** | API gợi ý trả rỗng | B4, F2 |
| 2.4.7 | A6/10b, 10c: “10b. Hệ thống giữ tạm lựa chọn (chuyên khoa/bác sĩ/khung giờ) trong sessionStorage của trình duyệt (phía client, mất khi đóng tab — không lưu ở backend/Redis), chuyển hướng người dùng tới Đăng nhập hoặc Đăng ký tài khoản trong cùng tab.” “10c. Sau khi đăng nhập/đăng ký thành công (cùng tab), hệ thống đọc lại sessionStorage để khôi phục lựa chọn và tiếp tục vào luồng "Đặt lịch khám"; nếu người dùng đóng tab hoặc không hoàn tất đăng nhập/đăng ký, lựa chọn mất theo sessionStorage, use case kết thúc.” | **ĐÃ CÓ** cơ chế khác đã chốt ở booking (Q39): `khungGioId` trên URL đích, `RequireAuth` giữ `state.from` qua đăng nhập, đăng ký, xác minh (T9) | không viết mã giữ lựa chọn mới | F2 |
| 2.4.76 | MT: “Dùng kiến trúc dự phòng nhiều lớp: Gemini (gemini-2.0-flash) → Groq (llama-3.1-8b-instant) → Ollama cục bộ (qwen2.5:3b) → phản hồi dựng sẵn; mỗi lớp timeout 6–8 giây, thử lại 1 lần, cooldown 60 giây; không fine-tune.” | **CÒN THIẾU**; **LỆCH** đã quyết (Q1, Q2, Q8, T10) | `bot/providers/fallback-chain.ts` | P1 |
| 2.4.76 | TĐK: “Hệ thống CLINIX gửi một câu hỏi kèm ngữ cảnh dữ liệu công khai tới Dịch vụ AI (từ use case "Trò chuyện với Trợ lý AI").” | **CÒN THIẾU** | ngữ cảnh, điều phối | B2, B3 |
| 2.4.76 | b1, b2: “(1) Hệ thống CLINIX gửi câu hỏi kèm ngữ cảnh dữ liệu công khai tới lớp Gemini (gemini-2.0-flash).” “(2) Nếu Gemini phản hồi trong thời gian timeout (6–8 giây): Dịch vụ AI trả câu trả lời về hệ thống CLINIX — use case kết thúc.” | **CÒN THIẾU**; lớp đầu đổi thành Groq (Q1) | adapter, chuỗi | P1 |
| 2.4.76 | b3: “(3) Nếu Gemini lỗi hoặc timeout: hệ thống thử lại Gemini 1 lần; nếu vẫn lỗi, chuyển sang lớp Groq (llama-3.1-8b-instant).” | **CÒN THIẾU**; thử lại theo T10 | chuỗi | P1 |
| 2.4.76 | b4, b5: “(4) Áp dụng cùng cơ chế timeout/thử lại 1 lần cho Groq; nếu vẫn lỗi, chuyển sang Ollama cục bộ (qwen2.5:3b).” “(5) Áp dụng cùng cơ chế cho Ollama; nếu vẫn lỗi, hệ thống trả về phản hồi dựng sẵn (không gọi AI nữa) cho hệ thống CLINIX.” | **CÒN THIẾU**; bỏ lớp Ollama (Q2) | chuỗi | P1 |
| 2.4.76 | A1/5b: “5b. Dịch vụ AI trả về phản hồi dựng sẵn (không chẩn đoán, không kê đơn, nêu giới hạn) cho hệ thống CLINIX.” | **CÒN THIẾU** | câu dựng sẵn | B1, B3 |
| 2.4.76 | A2: “*a. Hệ thống phát hiện lớp AI đó đang trong cooldown 60 giây kể từ lần dùng trước.” “*b. Hệ thống bỏ qua lớp đó, chuyển thẳng sang lớp kế tiếp trong chuỗi dự phòng.” | **CÒN THIẾU**; cooldown tính sau khi lớp **lỗi** (Q8) | chuỗi | P1 |
| 2.4.76 | HĐK: “Thất bại (cả 3 lớp AI đều lỗi/timeout): Hệ thống CLINIX nhận phản hồi dựng sẵn thay thế.” | **CÒN THIẾU** (2 lớp theo Q1) | điều phối | B3 |
| 2.4.77 | MT: “Ánh xạ nhu cầu khám bệnh bằng ngôn ngữ tự nhiên của người dùng sang danh sách chuyên khoa phù hợp (không chẩn đoán bệnh), dùng chung kiến trúc dự phòng và ràng buộc timeout/thử lại/cooldown như use case "Trả lời câu hỏi cho Trợ lý AI Hỏi – đáp".” | **CÒN THIẾU** | cùng chuỗi (T1) | P1, B2 |
| 2.4.77 | b1, b2: “(1) Hệ thống CLINIX gửi mô tả nhu cầu khám bệnh (ngôn ngữ tự nhiên) tới Dịch vụ AI, theo cùng kiến trúc dự phòng (Gemini → Groq → Ollama → rỗng)” “(2) Dịch vụ AI trả về danh sách tên chuyên khoa được ánh xạ (không chẩn đoán bệnh cụ thể).” | **CÒN THIẾU**; mô hình trả **id** trong danh sách gửi kèm thay vì tên (T1) | lược đồ đầu ra | B2, B3 |
| 2.4.77 | b3, b4: “(3) Hệ thống CLINIX đối chiếu từng tên chuyên khoa với danh mục chuyên khoa thật đang Đang hoạt động.” “(4) Hệ thống loại bỏ các tên không khớp danh mục thật, trả phần còn lại cho use case gọi.” | **ĐÃ CÓ** cột `chuyen_khoa.trang_thai_hoat_dong`; **CÒN THIẾU** bộ lọc | `bot/answer/` | B2 |
| 2.4.77 | A1/3b: “3b. Hệ thống trả danh sách rỗng cho use case gọi xử lý (luồng "không có chuyên khoa phù hợp" của use case "Trò chuyện với Trợ lý AI").” | **CÒN THIẾU** | `KhongCoChuyenKhoa` | B2, B3 |
| 2.4.77 | A2: “*b. Dịch vụ AI trả danh sách rỗng (không có phản hồi dựng sẵn cho việc ánh xạ chuyên khoa, khác với hỏi-đáp) cho hệ thống CLINIX.” | **CÒN THIẾU** | kết quả `DuPhong` kèm danh sách rỗng | B3 |

**Use case chạm vào (không gộp, chỉ nối):**

| UC | Chỗ chạm | Hiện trạng và xử lý | Task |
|---|---|---|---|
| 2.4.60 Tính khung giờ khám còn trống | “Dùng chung cho tra cứu, đặt lịch, và chạy thêm khi gợi ý AI cần hiển thị giờ trống.” | **ĐÃ CÓ** `scheduling/slots/available-slots.reader.ts` (một ngày mỗi lần gọi, nhiều bác sĩ); tái dùng, không viết lại | B4 |
| 2.4.8 Đặt lịch khám (A1) | “Các lựa chọn được điền sẵn; chuyển trang không giữ chỗ. Hệ thống kiểm tra lại khung giờ trước khi xác nhận (tương đương kết quả bước 8 của luồng trực tiếp).” | **ĐÃ CÓ** luồng bước 4 đến 6 và thông báo khung giờ vừa hết; chatbot chỉ liên kết | F2 |
| 2.4.5 Tra cứu bác sĩ và lịch khám (K3 của search) | “cùng cơ chế lưu tạm lựa chọn như use case "Trò chuyện với Trợ lý AI", A6” | **ĐÃ CÓ** ô giờ trống là liên kết sang bước 4; chatbot dùng đúng đường đó | F2 |
| 2.4.21 Nhắn tin với lễ tân | đích của 2.4.7 A1, A3 | **CÒN THIẾU** mã (scope chat #11); chỉ liên kết khi trang có (`[CHỜ chat]`), trước đó hiện đường dây nóng | F1 |
| 2.4.6 Tra cứu bài viết / cẩm nang | nguồn "bài viết" của b3 | **CÒN THIẾU** module; Q11: chưa dùng | — |
| 2.4.1 Đăng ký tài khoản | “chỉ khi người dùng xác minh đúng mã OTP, Tài khoản mới được đánh dấu đã xác minh email và được phép đặt lịch khám trực tuyến.” | **ĐÃ CÓ**; booking tự chặn, chatbot không kiểm lại | F2 |
| 2.4.42 Cập nhật cấu hình hệ thống | “trọng số w1/w2 khi gợi ý bác sĩ.” | **ĐÃ CÓ** cột, API và trang admin; **chưa nơi nào đọc** | B4 |
| 2.4.46 Quản lý chuyên khoa | “chuyên khoa chỉ ẩn khỏi tra cứu/gợi ý AI.” | **ĐÃ CÓ** trạng thái hoạt động; bộ lọc ở ngữ cảnh, ánh xạ và gợi ý | B2, B4 |

### 1.2 Nơi đặt và ranh giới với module khác

- Thư mục mã mới: `apps/api/src/chatbot/` và `apps/web/src/features/chatbot/`. Module Nest `ChatbotModule` thêm **một** dòng ở `app.module.ts` `[ĐỤNG database]`.
- `chatbot` **không ghi** bảng nào, không bảng mới, không migration; đọc dữ liệu công khai qua dịch vụ đã export (`PublicDoctorService`, `AvailableSlotsReader`, `SystemConfigService`) và vài câu đọc riêng (T7).
- Web chỉ dùng `shared/` (client, đường dẫn, chi nhánh đang chọn, UI chung); không import `features/search`, `features/booking`; `router/` gắn khung chat.
- **Phân ranh với chat #11:** không dùng bảng `hoi_thoai`, `tin_nhan`, không WebSocket; hai khung giao diện riêng (PLAN chat đã đề xuất tách). Chỉ có **liên kết** "Nhắn tin với lễ tân".
- **Phân ranh với thông báo:** không ghi `thong_bao`, không email, không cơ chế tức thời.

## 2. Hiện trạng repo (đã kiểm ở `1349818`, 26/11/2026; đối chiếu lại `36ec306`)

| Chỗ | Tình trạng | Nguồn kiểm |
|---|---|---|
| Mã Trợ lý AI | **Không có.** `grep -i` `gemini`, `groq`, `ollama`, `assistant`, `chatbot`, `tro-ly` trong `apps/` không ra mã (chỉ khớp ngẫu nhiên hai chuỗi băm `integrity` trong `package-lock.json`) | `apps/` |
| Bảng hội thoại AI | **Không có** trong DDL. `hoi_thoai`, `tin_nhan` là của chat người với người | `docs/database/clinix_mysql.sql` |
| Bài viết | DDL có `bai_viet`, `hashtag`, `bai_viet_hashtag`; **không** migration, entity, module (`grep` `bai_viet`, `BaiViet` ở `apps/api/src`: 0) | `clinix_mysql.sql`, `apps/api/src` |
| Trọng số gợi ý | `cau_hinh_he_thong.trong_so_w1`, `trong_so_w2`; API và trang admin nhóm "Gợi ý bác sĩ"; luật mỗi số 0 đến 1, tổng đúng 1; seed demo 0,60 và 0,40; **không nơi nào đọc để xếp hạng** | `admin/system-config/system-config-params.ts`, `database/seeds/catalog-data.ts`, web `system-config-params.ts` |
| Học vị | `bac_si.hoc_vi` (BS, ThS, TS, PGS, GS), schema ghi dùng cho điểm xếp hạng AI; API công khai **không** trả (danh sách trắng Q14 của search) | `clinix_mysql.sql`, `search/doctors/public-doctor.dto.ts` |
| Bác sĩ công khai | `PublicDoctorService.list` (lọc chuyên khoa, chi nhánh, dịch vụ; giá có phụ phí; điểm đánh giá; `pageSize` ≤ 100); hằng `PUBLIC_DOCTOR_CONDITION`; `DoctorRatingReader` (bỏ đánh giá ẩn, làm tròn 1 chữ số). **`SearchModule` không export gì** | `search/search.module.ts`, `search/doctors/*`, `search/ratings/*` |
| Khung giờ trống | `AvailableSlotsReader.listMany({ bacSiIds, ngay, now })`, chỉ đọc, 3 câu mỗi lần; `SchedulingModule` đã export; API công khai `GET /public/doctor-slots` (≤ 100 id, cửa sổ 7 ngày, `no-store`) | `scheduling/`, `search/slots/` |
| Danh mục công khai | `GET /public/branches`, `/public/specialties` (chỉ đang hoạt động), `/public/services`, `/public/service-groups`, `/public/clinic-info`, `/public/suggestions` (`@Public()`) | `search/*/*.controller.ts` |
| Chính sách | mốc hoàn tiền `moc_hoan_tien` theo dịch vụ (booking, payment đọc), **không** API công khai; `thoi_gian_giu_cho`, `so_lan_tu_doi_lich_toi_da` ở cấu hình | `appointments/create/refund-policy.ts`, `payment/policy/` |
| Cấu hình môi trường | `config/env.validation.ts` kiểm biến lúc khởi động; `.env.example` có dòng `[cần điền] cổng thanh toán sandbox / khóa AI`; bộ che log `collectSecretValues` đã bắt tên biến chứa `API_KEY` | `config/`, `common/logging/sanitize.ts` |
| Gọi HTTP ra ngoài | API chỉ gọi Cloudinary qua SDK (timeout và huỷ socket tự viết). Không dùng `fetch`; image `node:22-alpine`, `engines` ≥ 20 nên có `fetch` toàn cục | `common/upload/cloudinary-image.provider.ts`, `apps/api/Dockerfile` |
| Khung ứng dụng | `ValidationPipe` toàn cục (`whitelist`, `forbidNonWhitelisted`), bộ lọc lỗi chuẩn, `trust proxy = 1`; **không** thư viện giới hạn tốc độ | `app.setup.ts`, `package.json` |
| Proxy | nginx: `location ^~ /api/`, `proxy_read_timeout 60s` | `apps/web/nginx.conf` |
| Compose | `db`, `api`, `web` (và `tunnel` có profile); **cả `api` lẫn `web` dev đều dùng `env_file: .env`** | `docker-compose.yml` |
| Web: client | `shared/api/client.ts`: nơi duy nhất gọi `fetch`; `DEFAULT_TIMEOUT_MS` 15 giây, `LONG_TIMEOUT_MS` 45 giây; `skipAuthToken` | `shared/api/client.ts` |
| Web: đặt lịch | bước 4 `bookingInfoPath(khungGioId)`; `RequireAuth` vai `BenhNhan`; `returnPathFor` chỉ quay lại đường dẫn đặt lịch; ô giờ trống ở search là liên kết tới đó | `shared/routes/booking-paths.ts`, `features/auth/return-to.ts`, `features/search/slots/slot-cell.tsx` |
| Web: bề mặt module | `features/search/index.ts` export `SlotPicker` (một bác sĩ); không module nào có khung chat AI; menu không có mục AI | `features/search/index.ts`, `router/role-nav.ts` |
| Web: nơi gắn toàn ứng dụng | `router/root-layout.tsx` bọc mọi trang; `useAuth` là kho ngoài React (`useSyncExternalStore`) nên dùng được ở đó | `router/root-layout.tsx`, `features/auth/auth-store.ts` |
| Figma | Mã Make `components/shared/SupportWidget.tsx`: nút nổi góc phải, bảng 520 × 500, gộp "CLINIX AI", "Lễ tân CLINIX", bác sĩ; trả lời giả bằng từ khoá (có số liệu bịa) | `THIET_KE_UI/Figma_Make_Sync/source_snapshot` |
| Test | không có test AI; CI không có secret cho AI | `.github/workflows/ci.yml` |

## 3. Phân tích ảnh hưởng

### 3.1 Bảng và cột scope này chạm tới (**chỉ đọc**)

| Bảng, cột | Dùng để |
|---|---|
| `chi_nhanh`, `chi_nhanh_lich_hoat_dong` | ngữ cảnh, địa chỉ trong câu khẩn cấp |
| `chuyen_khoa` (chỉ `DangHoatDong`) | ngữ cảnh, lọc kết quả ánh xạ |
| `dich_vu_kham`, `chi_nhanh_dich_vu_kham`, `moc_hoan_tien` | giá, cọc, thời lượng, chính sách hoàn |
| `bac_si`, `tai_khoan` (điều kiện bác sĩ công khai), `bac_si.hoc_vi` (chỉ phía máy chủ), `danh_gia_bac_si` | ngữ cảnh, xếp hạng |
| `lich_lam_viec`, `khung_gio`, `yeu_cau_nghi_phep` (qua `AvailableSlotsReader`) | khung giờ trống |
| `thong_tin_phong_kham`, `cau_hinh_he_thong` | liên hệ, giữ chỗ, số lần đổi lịch, w1, w2 |

**Không thêm, không sửa, không xoá bảng hay cột nào.** Ba file `docs/database/*` không đổi.

### 3.2 API và hành vi đã có bị chạm tới

| Chỗ | Chạm thế nào | Cách không phá thiết kế |
|---|---|---|
| `SearchModule` | thêm `exports: [PublicDoctorService]` | một dòng, PR nhỏ riêng trong B2, không đổi hành vi, chạy lại test search `[ĐỤNG search]` |
| `app.module.ts` | thêm `ChatbotModule` | một import, một phần tử (P1) |
| `env.validation.ts`, `.env.example` | thêm biến AI, tất cả tuỳ chọn | không có biến thì ứng dụng vẫn khởi động (CFG-02) |
| `commitlint.config.cjs`, `AGENTS.md` | thêm scope `chatbot` | một từ ở danh sách (P1) |
| `router/root-layout.tsx` | gắn khung chat | một component, tự ẩn theo vai và đường dẫn `[ĐỤNG router]` |
| booking, auth, search web | **không sửa** | chỉ dùng đường dẫn và cơ chế quay lại có sẵn |

### 3.3 Đối chiếu với thiết kế đã chốt: KHỚP, LỆCH hay MÂU THUẪN

| # | Chỗ | Bên A | Bên B | Kết luận |
|---|---|---|---|---|
| L1 | Hai bản 2.4 | File gốc: 2.4.7, 2.4.76, 2.4.77 (76 use case; đề bài lập kế hoạch ghi 77, đếm bằng script ra 76 use case cộng một đề mục chương) | `Drive_Hien_Tai`: gộp hai use case hệ thống vào 2.4.7 thành b12 đến b17, A7 đến A9; b9 trỏ "Tra cứu bác sĩ" thay "Tính khung giờ" | **KHỚP nội dung**, khác cấu trúc; Q16: truy vết theo file gốc kèm bảng ánh xạ |
| L2 | Tên model | 2.4.76, 1.2.1, Phân loại M18: `gemini-2.0-flash`, `llama-3.1-8b-instant` | cả hai đã ngừng (3.4) | **MÂU THUẪN với thực tế**; model nằm trong cấu hình; `[ĐỒNG BỘ TL]` |
| L3 | Chuỗi dự phòng | 2.4.76: Gemini → Groq → Ollama → dựng sẵn | Q1, Q2: Groq → Gemini → dựng sẵn | **LỆCH đã quyết bởi Đại**; `[ĐỒNG BỘ TL]` |
| L4 | Thời gian, thử lại, cooldown | "mỗi lớp timeout 6–8 giây, thử lại 1 lần, cooldown 60 giây kể từ lần dùng trước" (trường hợp xấu của ba lớp: 48 giây) | Q8: trần tổng 20 giây, cooldown sau lỗi; T10: 429 và lỗi cấu hình không thử lại | **LỆCH đã quyết**; `[ĐỒNG BỘ TL]` |
| L5 | Khi mọi lớp lỗi | 2.4.7 A3: báo "không phản hồi" | 2.4.76 A1: trả câu dựng sẵn | **Hai chữ khác nhau trong cùng bộ đặc tả**; Q13: hiện cả hai, kèm "Gửi lại" |
| L6 | Giữ lựa chọn khi chưa đăng nhập | 2.4.7 A6: `sessionStorage` | booking Q38, Q39: không kho trình duyệt, `state.from` | **KHỚP hành vi, LỆCH cơ chế**; T9; `[ĐỒNG BỘ TL]` |
| L7 | Dữ liệu tài khoản | 2.4.7 HĐK, 1.2.1, Phân loại: Bệnh nhân hỏi được | Q4: chỉ liên kết tới trang | **LỆCH đã quyết**; `[ĐỒNG BỘ TL]` |
| L8 | Nguồn ngữ cảnh "bài viết" | 2.4.7 MT, b3 | chưa có module bài viết | Q11: tệp chính sách tĩnh, bài viết nối sau; **LỆCH tạm** |
| L9 | Xếp bác sĩ | 2.4.7 b9, b10 không nêu công thức hay chọn ngày, ca | 1.2.1, Phân loại M19: lọc ngày và ca rồi `w1×rating + w2×kinh nghiệm/học vị` | Q10: theo 1.2.1; `[ĐỒNG BỘ TL]` thêm vào 2.4.7 |
| L10 | Trọng số do Quản trị viên chỉnh | Phân loại, 2.4.42 | đã có mã ở admin | **KHỚP** |
| L11 | Ánh xạ trả "tên chuyên khoa" | 2.4.77 b2, b3 | T1: mô hình trả id trong danh sách đã gửi | **KHỚP mục đích** (chắc hơn so khớp tên); ghi ở `[ĐỒNG BỘ TL]` |
| L12 | Câu cấp cứu | 2.4.7 A1/4b: bác sĩ, cơ sở gần nhất, nhắn lễ tân | Q6: thêm gọi 115 | **LỆCH đã quyết** (bổ sung an toàn); `[ĐỒNG BỘ TL]` |
| L13 | Điều khoản nhà cung cấp | mục đích "tư vấn sơ bộ", người dùng bất kỳ | Google, Groq: không dùng cho tư vấn y khoa; người dùng API từ 18 tuổi; gói miễn phí Gemini dùng dữ liệu | **MÂU THUẪN một phần**; Q5: thông báo, che định danh, từ chối chẩn đoán và kê đơn; ghi nợ |
| L14 | SOW 3.2.6 "Dữ liệu đầu vào gửi đến AI phải được kiểm soát" | SOW | che định danh, không gửi dữ liệu tài khoản, không lưu | **KHỚP** (giới hạn của che định danh ở 5.9) |
| L15 | Tên tác nhân | 2.1_2.2: "Dịch vụ AI (Gemini / Groq / Ollama)" | Q2: Groq, Gemini | `[ĐỒNG BỘ TL]` |
| L16 | Khung chat Figma | `SupportWidget` gộp AI, lễ tân, bác sĩ một khung, có trả lời giả | Q14: khung chỉ cho Trợ lý; chat có trang riêng | **LỆCH Figma** (không đồng bộ lại) |
| L17 | Scope commit | `commitlint.config.cjs` chưa có `chatbot` (mức cảnh báo, có sẵn `ai`) | T8 | thêm `chatbot` ở P1 |
| L18 | Cam kết 27/11 | nhóm F "Chưa cam kết", metric N6 chỉ áp dụng nếu giữ chatbot; tên đề tài có "tích hợp chatbot" | phương án tối thiểu đủ cho N6 và mục tiêu 4 | Đại chốt 27/11 (6.4, 6.5) |

### 3.4 Kiểm chứng nhà cung cấp AI (đọc trang chính thức **ngày 26/11/2026** bằng công cụ đọc trang; **chưa gọi API**; X1 kiểm lại trước khi viết mã)

Các địa chỉ `ai.google.dev` chuyển hướng 301 sang `aistudio.google.com`. Không trang nào hiện ngày cập nhật, trừ chỗ ghi ngày.

| Điểm | Điều trang ghi | Nguồn |
|---|---|---|
| Model Gemini của use case | `gemini-2.0-flash` đã tắt **01/06/2026**; trang đề xuất `gemini-3.6-flash` | https://aistudio.google.com/docs/deprecations |
| Model Flash đang dùng được | ổn định: `gemini-3.8-flash`, `gemini-3.6-flash`, `gemini-3.5-flash-lite` (ra 21/07/2026), `gemini-3.1-flash-lite` (tắt 07/05/2027); `gemini-2.5-flash-lite` chưa báo tắt; `gemini-2.5-flash` tắt 01/12/2026 | https://aistudio.google.com/docs/models |
| Hạn mức miễn phí Gemini | **không công bố theo model** trên trang tài liệu, xem trong AI Studio; áp theo dự án; hạn theo ngày đặt lại nửa đêm giờ Thái Bình Dương; vượt thì báo lỗi giới hạn (trang chỉ ghi rõ mã 429 cho giới hạn chi tiêu) | https://aistudio.google.com/docs/rate-limits |
| Giá | `gemini-3.5-flash-lite` có gói miễn phí; trả phí 0,30 USD mỗi triệu token vào, 2,50 USD ra | https://aistudio.google.com/docs/pricing |
| Dữ liệu gói miễn phí Gemini | «Google uses the content you submit to the Services and any generated responses to provide, improve, and develop»; «human reviewers may read, annotate, and process your API input and output»; «Do not submit sensitive, confidential, or personal information to the Unpaid Services»; gói trả phí không dùng để cải thiện sản phẩm | https://aistudio.google.com/docs/terms (hiệu lực 23/03/2026) |
| Y khoa, tuổi, vùng (Gemini) | «You may not use the Services in clinical practice, to provide medical advice,»; «You must be 18 years of age or older to use the APIs.» và không dùng cho ứng dụng hướng tới hay nhiều khả năng được người dưới 18 truy cập; Việt Nam **có** trong danh sách vùng | như trên; https://aistudio.google.com/docs/available-regions |
| Hình dạng yêu cầu Gemini | Interactions API `POST https://generativelanguage.googleapis.com/v1beta/interactions`, header `x-goog-api-key` (ví dụ có `Api-Revision: 2026-05-20`), `response_format` = `{ type: "text", mime_type: "application/json", schema }`; `minLength`, `maxLength` không được ép; trường `store` («Whether to store the response and request for later retrieval», mặc định không nêu); `generateContent` là bản cũ vẫn hỗ trợ | https://aistudio.google.com/docs/structured-output ; https://aistudio.google.com/api-reference/interactions-api |
| Model Groq của use case | `llama-3.1-8b-instant` tắt **16/08/2026** (gói miễn phí và developer); thay thế khuyến nghị `openai/gpt-oss-20b`. Trang danh sách model **vẫn liệt kê** model đã tắt (hai trang mâu thuẫn) | https://console.groq.com/docs/deprecations ; https://console.groq.com/docs/models |
| Hạn mức Groq | bảng trên trang mang nhãn giới hạn gốc của gói **Developer**: `gpt-oss-20b` 30 yêu cầu/phút, 1.000/ngày, **8.000 token/phút**, 200.000 token/ngày; số của gói miễn phí **không đọc được** (`[cần điền]`); tính theo tổ chức; vượt thì 429 kèm `retry-after` | https://console.groq.com/docs/rate-limits |
| Hình dạng yêu cầu Groq | `POST https://api.groq.com/openai/v1/chat/completions`, `Authorization: Bearer`; `response_format` `json_schema` với `strict: true` hỗ trợ `gpt-oss-20b`; không streaming khi dùng đầu ra cấu trúc; `reasoning_effort` low, medium, high; `include_reasoning`; `max_completion_tokens` mặc định 1024 | https://console.groq.com/docs/structured-outputs ; https://console.groq.com/docs/reasoning |
| Dữ liệu Groq | «Groq is not permitted to use Inputs or Outputs for training or fine-tuning any AI Model Services or other models»; mặc định không giữ dữ liệu suy luận; log lạm dụng giữ tối đa 30 ngày; bật được Zero Data Retention; lưu ở Hoa Kỳ | https://console.groq.com/docs/legal/services-agreement (sửa 22/06/2026) ; https://console.groq.com/docs/your-data |
| Điều khoản Groq | từ 18 tuổi; «The AI Model Services should not be used for medical, legal, financial, or other professional advice.»; cấm xử lý thông tin sức khoẻ được bảo vệ ngoài phụ lục riêng; cấm quyết định tự động rủi ro cao không có người giám sát | như trên ; https://console.groq.com/docs/legal/ai-policy |

**`store: false` và gói trả phí:** đặt `store: false` để không yêu cầu Google lưu lượt gọi, nhưng **không bảo đảm** dữ liệu gói miễn phí không bị dùng (điều khoản Unpaid vẫn áp). Không viết hay nói như thể bảo đảm.

**Ollama (đã loại theo Q2; ghi lại để khi cần làm sau):** `qwen2.5:3b` tải khoảng 1,9 GB, giấy phép Qwen Research cho bản 3B (không phải Apache 2.0); ngữ cảnh mặc định 4096 token; mặc định mỗi lúc một yêu cầu; ảnh Docker khoảng 3,2 GB; trang không nêu RAM cần, thời gian khởi động **chưa đo** (nguồn: https://ollama.com/library/qwen2.5:3b , https://docs.ollama.com/faq , https://hub.docker.com/r/ollama/ollama). Máy dev hiện tại có GPU 8 GB (đủ chỗ chứa model; **chưa chạy thử**); máy chủ staging `[cần điền]`, máy nhỏ không GPU thì khó đạt 6 đến 8 giây. Nếu làm sau: chỉ là hồ sơ compose tuỳ chọn, mặc định tắt, staging tắt.

### 3.5 Chỗ mơ hồ còn lại (đã chọn mặc định `[đề xuất]`; Đại đổi được lúc review)

- **MH1** Khung chat hiện khi chưa đăng nhập hoặc vai Bệnh nhân; ẩn với Bác sĩ, Lễ tân, Quản trị viên và ở các trang đăng nhập, đăng ký, xác minh, quên mật khẩu, kích hoạt tài khoản.
- **MH2** Đồng ý "Tôi hiểu" và lịch sử chỉ ở bộ nhớ: tải lại trang thì hỏi lại và mất lịch sử.
- **MH3** Câu hỏi 1 đến 500 điểm mã; gửi kèm tối đa 6 lượt gần nhất, mỗi lượt tối đa 800 điểm mã; câu trả lời của mô hình tối đa 800.
- **MH4** Gợi ý tối đa 3 chuyên khoa, 5 bác sĩ, 6 ô giờ mỗi bác sĩ; cửa sổ 7 ngày như trang tra cứu.
- **MH5** Bác sĩ dưới 5 lượt đánh giá dùng điểm trung bình toàn hệ thống (1.2.1); hệ thống chưa có đánh giá nào thì điểm đánh giá chuẩn hoá bằng 0 cho mọi người.
- **MH6** Chưa có cấu hình hệ thống thì API gợi ý trả 409 `HE_THONG_CHUA_CAU_HINH` (nếp 2.4.42 A3), khung chat dẫn sang tra cứu.
- **MH7** Luật khẩn cấp chỉ xét **câu đang gửi**, không xét lượt trước.
- **MH8** API gợi ý (chỉ đọc DB) không giới hạn tốc độ riêng, như API tra cứu công khai.

### 3.6 Rủi ro (xử lý trong task)

- **R1 Model và API đổi nhanh:** cả hai model của đặc tả đã ngừng trong sáu tháng. Xử lý: tên model, địa chỉ ở cấu hình; lỗi 4xx ghi cảnh báo "kiểm tra cấu hình hoặc model đã ngừng"; X1 kiểm lại trang trước khi viết mã.
- **R2 Hạn mức miễn phí nhỏ** (Groq 8.000 token/phút ở bảng Developer; gói miễn phí chưa biết): ước 2.500 đến 3.000 token mỗi lời gọi (**chưa đo**) thì chỉ 2 đến 3 câu mỗi phút. Xử lý: ngữ cảnh có trần, trần toàn cục, rơi sang lớp sau, câu dựng sẵn; buổi demo nên thử trước.
- **R3 Điều khoản và quyền riêng tư** (L13): gói miễn phí Gemini dùng dữ liệu và có người đọc; che định danh không bắt được mọi họ tên, địa chỉ; ứng dụng đặt lịch có thể được người dưới 18 dùng, dòng "từ 18 tuổi" không xác minh được. Xử lý: Q5; ghi nợ; **phải xem lại trước khi mở công khai** (gói trả phí, rà quy định bảo vệ dữ liệu cá nhân hiện hành `[cần điền]`).
- **R4 Đối chiếu loại nhầm câu đúng** (dương tính giả) làm tăng tỉ lệ dự phòng: đo M6 với tiêu chí đặt trước; nới bằng ngoại lệ có kiểm chứng, không bỏ luật.
- **R5 Đối chiếu bỏ lọt:** luật tất định không bắt được khẳng định định tính không chứa từ khoá (ví dụ mô tả sai chuyên môn). Xử lý: lời nhắc hệ thống, chỗ giữ bắt buộc cho dữ liệu xác định, chấm tay bộ câu hỏi chuẩn; ghi giới hạn.
- **R6 Luật khẩn cấp theo từ khoá** có âm tính giả (diễn đạt lạ, sai chính tả) và dương tính giả. Xử lý: danh sách do nhóm duyệt, thiên về bắt thừa; mô hình gắn `khanCap` là lưới thứ hai; banner luôn có "Cấp cứu: gọi 115".
- **R7 Chèn lệnh:** mô hình không có công cụ, không có dữ liệu riêng, không ghi gì; đầu ra bị ép lược đồ và đối chiếu.
- **R8 Một tiến trình API:** bộ đếm, cooldown, đệm ở bộ nhớ; khởi động lại thì mất; nhiều tiến trình thì mỗi tiến trình một bộ đếm. Ghi nợ.
- **R9 IP sau proxy** (`[CHỜ staging: kiểm chuỗi proxy]`): staging thêm Caddy hay Cloudflare trước nginx thì `trust proxy = 1` có thể cho mọi người cùng một IP. Cách kiểm ở 5.10.
- **R10 Khoá lọt sang container web** (compose dev dùng `env_file: .env` cho `web`): không đặt tiền tố `VITE_` cho biến khoá; ghi nợ.
- **R11 Hạn và metric** (6.4): chatbot dồn vào Iteration 8, 9; trễ thì đẩy sang 10.
- **R12 Xung đột file** với scope chat (`app.module.ts`, `env.validation.ts`, `.env.example`, `commitlint.config.cjs`, `docs/adr/`): bảng 6.3.

## 4. Câu hỏi và quyết định

### 4.1 Đã chốt ở module khác (kế thừa — **không bàn lại**)

- **SOW 3.2.6:** AI không chẩn đoán, không kê đơn, không thay bác sĩ; chỉ xử lý dữ liệu trong phạm vi hệ thống cho phép; kiểm soát dữ liệu gửi đến AI. **SOW 5.1.4:** gợi ý AI không tự thay đổi lịch; phải có xử lý khi AI không đáng tin hoặc ngoài phạm vi.
- **booking** (PLAN Q38, Q39): không lưu thông tin sức khoẻ ở kho trình duyệt; chọn sẵn khung giờ bằng `khungGioId`, quay lại sau đăng nhập bằng `state.from`; chuyển trang không giữ chỗ.
- **search** (PLAN 5.3, 5.6): điều kiện bác sĩ công khai là một hằng chung; danh sách trắng trường công khai; khung giờ do máy chủ tính.
- **admin** (2.4.42): w1, w2 cấu hình ở bảng `cau_hinh_he_thong`; chức năng cần cấu hình từ chối khi chưa có.
- **auth** (`docs/features/auth/TRACKING.md` mục 3): mã lỗi ổn định; không ghi bí mật vào log.
- **chat** (PLAN chat, đề xuất): Trợ lý AI dùng cơ chế riêng, không dùng bảng hội thoại của chat.

### 4.2 Câu hỏi và quyết định (**Đại trả lời trực tiếp ngày 26/11/2026** qua bốn hộp câu hỏi)

| Q | Câu hỏi | Quyết định | Hệ quả, truy vết |
|---|---|---|---|
| **Q1★** | Chuỗi nhà cung cấp? (hai model cũ đã ngừng; điều khoản dữ liệu khác nhau) | **KHÁC đề xuất: `Groq → Gemini → câu dựng sẵn`, không Ollama** (đề xuất là Groq → Gemini → Ollama) | L3; mặc định `openai/gpt-oss-20b` rồi `gemini-3.5-flash-lite` `[đề xuất]`, chốt sau X1 |
| **Q2★** | Ollama đưa vào thế nào? | **KHÁC đề xuất: bỏ** (đề xuất là tuỳ chọn, mặc định tắt) | không `profiles`, không đo RAM mô hình |
| Q3 | Lưu hội thoại? | Theo đề xuất: **không lưu**; lịch sử ở bộ nhớ trình duyệt, gửi kèm ≤ 6 lượt; log không nội dung | không bảng, không migration |
| Q4 | Dữ liệu tài khoản của Bệnh nhân? | Theo đề xuất: **chỉ liên kết tới trang** | L7 |
| Q5 | Gói miễn phí và riêng tư? | Theo đề xuất: **miễn phí kèm thông báo đầy đủ** (bên thứ ba, không nhập thông tin định danh, từ 18 tuổi, bấm "Tôi hiểu"), máy chủ che email, SĐT, CCCD, mã lịch; ghi nợ | L13; R3; 5.9 |
| Q6 | Câu cấp cứu? | Theo đề xuất: **gọi 115 hoặc đến cơ sở y tế gần nhất**, kèm địa chỉ chi nhánh và liên kết nhắn lễ tân ghi rõ không trực cấp cứu; nhóm duyệt danh sách từ khoá | L12; 5.8 |
| Q7 | Giới hạn theo IP? | Theo đề xuất: **5 câu mỗi phút, 50 mỗi ngày mỗi IP**; trần toàn cục mỗi nhà cung cấp; ≤ 3 lời gọi AI đồng thời | 5.10 |
| Q8 | Thời gian, cooldown? | Theo đề xuất: **trần tổng 20 giây**, mỗi lần thử ≤ 8 giây và chỉ dùng thời gian còn lại; **cooldown 60 giây chỉ sau khi lớp lỗi** | L4; 5.5 |
| Q9 | Phạm vi? (phiên kiểm chuyển lời, sau đó Đại xác nhận trực tiếp) | Theo đề xuất: **tinh giản làm phương án chính** (mục tiêu 25 đến 35 giờ, 8 đến 10 task, khoảng 30 câu chấm tay); phương án đầy đủ chỉ là đoạn "làm sau", không tạo issue | 6.4, 6.5 |
| Q10 | Xếp bác sĩ? | Theo đề xuất: **công thức w1/w2 và chọn ngày, ca** (mặc định ngày sớm nhất còn trống) | L9; 5.11 |
| Q11 | Bài viết? | Theo đề xuất: **chưa dùng; thêm tệp chính sách** trong repo | L8; 5.6 |
| Q12 | Giờ mỗi tuần cho chatbot? | Theo đề xuất: **20 giờ** (Iteration 8, 9) | 6.4 |
| Q13 | Khi cả hai lớp lỗi? | Theo đề xuất: **gộp**: câu A3 và nút "Gửi lại", kèm câu dựng sẵn; lượt lỗi không vào lịch sử | L5 |
| Q14 | Khung chat ở đâu? | Theo đề xuất: **nút nổi ở trang công khai và cổng Bệnh nhân**; ẩn với nhân sự và trang đăng nhập; 375 px toàn màn hình; xoá khi đăng xuất | 5.14 |
| Q15 | Số scope? | Theo đề xuất: **#12** | — |
| Q16 | Truy vết theo bản 2.4 nào? | Theo đề xuất: **file gốc kèm bảng ánh xạ** sang bản `Drive_Hien_Tai` | L1; Phụ lục A |

### 4.3 Điểm kỹ thuật: **đã duyệt kỹ thuật (phiên kiểm độc lập, theo ủy quyền của Đại, 26/11/2026)**; không phải quyết định sản phẩm hay schema

Điều kiện riêng cho Ollama trong tin duyệt (T1: hai lời gọi cho lớp Ollama; T5: `num_ctx`) **hết áp dụng** vì Đại bỏ Ollama sau đó.

| T | Đề xuất đã duyệt | Điều kiện kèm theo khi duyệt |
|---|---|---|
| T1 | Một lời gọi có đầu ra cấu trúc cho cả hỏi – đáp và ánh xạ; máy chủ lọc id chuyên khoa; mọi lớp lỗi thì hỏi – đáp trả câu dựng sẵn, ánh xạ rỗng | `loai` là enum đóng `hoiDap`, `goiYDatLich`, `ngoaiPhamVi`, `khanCap`; **luật khẩn cấp tất định chạy trước khi gọi AI**, mô hình không quyết định cấp cứu; lược đồ tối giản |
| T2 | Đối chiếu bằng luật tất định: chỗ giữ theo id, cấm chữ số trừ 115, cấm tên và chuyên khoa ngoài dữ liệu, URL; sai thì thay toàn bộ câu trả lời | đo dương tính giả ở X1 với tiêu chí đặt trước; nới bằng **danh sách ngoại lệ có kiểm chứng**, không bỏ luật |
| T3 | Không streaming; trần API khoảng 20 giây; web `LONG_TIMEOUT_MS` 45 giây, nginx 60 giây | hạn chót **lan truyền** qua các lớp; nêu rõ khoảng cách với trường hợp xấu của đặc tả (5.5) |
| T4 | `fetch` của Node, không SDK; Gemini Interactions API `store: false`; Groq `json_schema` | ghi URL và ngày tra cho từng hình dạng yêu cầu; fixture ghi sẵn cho mỗi nhà cung cấp; `store: false` không bảo đảm gì ở gói miễn phí; tên model, đường dẫn ở cấu hình có mặc định hiện hành, cảnh báo khi model đã ngừng |
| T5 | Truy vấn có cấu trúc cộng khớp từ khoá không dấu; đệm 60 giây; đọc lại thực thể khi dựng; trần vào khoảng 2.000 token; không embedding | bộ đệm có trần kích thước và hạn dùng |
| T6 | Giới hạn và cooldown tự viết trong bộ nhớ, khoá theo `req.ip` | trần toàn cục theo phút cho mỗi nhà cung cấp; dọn bản đồ theo hạn; `[CHỜ staging: kiểm chuỗi proxy]` kèm cách thử |
| T7 | `SearchModule` export `PublicDoctorService`; dùng `AvailableSlotsReader`, `SystemConfigService`; học vị chỉ đọc phía máy chủ | PR nhỏ riêng, báo người review |
| T8 | Thư mục `chatbot`, route `/chatbot/*` | thêm scope `chatbot` vào commitlint |
| T9 | Tái dùng `state.from` của booking thay `sessionStorage` của A6 | `[ĐỒNG BỘ TL]` sửa chữ A6 (4.6) |
| T10 | 429 và 4xx cấu hình sai: không thử lại, chuyển lớp, cooldown; timeout, 5xx, sai lược đồ: thử lại đúng một lần | ghi là lệch có chủ ý so với 2.4.76, `[ĐỒNG BỘ TL]` |
| T11 | CI không gọi AI thật; transport tiêm vào; bộ câu hỏi chuẩn chạy tay | CI không có secret AI; một ca khẳng định provider thật không bao giờ được tạo khi `NODE_ENV=test` |

### 4.4 Mọi chỗ còn `[cần điền]` và `[đề xuất]`

| Giá trị | Ở đâu | Loại |
|---|---|---|
| Hạn mức gói miễn phí của Groq và Gemini trong console của Đại | 3.4, 5.10, M7 | `[cần điền]` |
| Duyệt danh sách từ khoá khẩn cấp, ngoài phạm vi, tài khoản (nên có người hiểu y khoa đọc) | 5.8 | `[cần điền]` |
| Rà quy định bảo vệ dữ liệu cá nhân hiện hành trước khi mở công khai | R3 | `[cần điền]` |
| Số ADR kế tiếp; số issue Epic; nhãn `module:chatbot`, milestone `chatbot` | P1, 6.6 | `[cần điền]` (Đại tạo bằng script) |
| Số PR và commit ở nháp AI log | TRACKING 4.1 | `[cần điền]` |
| Có bảng hay file ngoài repo cần đồng bộ ngoài 4.6 | 4.6 | `[cần điền]` |
| Model mặc định `openai/gpt-oss-20b`, `gemini-3.5-flash-lite`; thời gian chờ Groq 6 giây, Gemini 8 giây, tối thiểu 2 giây mới thử; `reasoning_effort` low; trần đầu ra | 5.5, 5.13 | `[đề xuất]` (chốt sau X1) |
| Trần toàn cục Groq 20, Gemini 10 lời gọi mỗi phút; trần 10.000 IP trong bộ nhớ | 5.10 | `[đề xuất]` |
| MH1 đến MH8 | 3.5 | `[đề xuất]` |
| Trần ngữ cảnh 6.000 ký tự, tối đa 8 bác sĩ, mô tả chuyên khoa cắt 120 ký tự | 5.6 | `[đề xuất]` |
| Luật đối chiếu V4 đến V9 và các danh sách từ | 5.7 | `[đề xuất]` |
| Tên đường dẫn API, khoá JSON, mã lỗi, tên biến môi trường | 5.12, 5.13, 5.16 | `[đề xuất]` (T8 đã duyệt kỹ thuật) |
| Câu chữ giao diện, câu dựng sẵn, gợi ý nhanh (trừ chữ lấy từ 2.4 và quyết định Q6) | 5.16 | `[đề xuất]` (Đại duyệt khi review) |
| Ngưỡng đo M1 đến M7, cơ cấu bộ câu hỏi chuẩn, ngưỡng metric | 5.15 | `[đề xuất]` (đặt trước; **không đổi sau khi thấy số**) |
| Giờ ước, Iteration, mức kiểm | 6.2, 6.4 | `[đề xuất]` |

### 4.5 Figma

Figma chỉ là bản phác thảo: **không đồng bộ lại**. Mã Make `SupportWidget.tsx` dùng làm tham khảo **bố cục** (nút nổi góc dưới phải, bảng khoảng 520 × 500, ở màn nhỏ chiếm gần hết) và **chữ chào** "Xin chào! Tôi là trợ lý AI của CLINIX. Bạn cần tư vấn về chuyên khoa, bác sĩ hay lịch khám?". Khác có chủ đích: chỉ Trợ lý (không gộp lễ tân, bác sĩ), không chấm "đang online", **không** dùng các câu trả lời giả và số liệu trong đó, thêm banner và đồng ý. Component dùng lại: nút, thẻ, `OfflineBanner`, hộp thoại chung. Phiên lập kế hoạch **không mở Figma**.

### 4.6 Việc của nhóm (ngoài repo; không sửa file Word hay Figma từ repo này)

- **`[ĐỒNG BỘ TL]` sửa file Word ở repo `TLCN_CLINIX`** (hai bản 2.4): 2.4.7 (TĐK dịch vụ AI; b3 bài viết nối sau; b9, b10 thêm chọn ngày, ca và công thức xếp hạng; A1 thêm 115; A3 kèm câu dựng sẵn; A6 bỏ `sessionStorage`; HĐK dữ liệu tài khoản chỉ liên kết; thông báo bên thứ ba và độ tuổi); 2.4.76 (và b12 đến b14, A7, A8 của bản Drive): Groq → Gemini → dựng sẵn, model theo cấu hình, trần 20 giây, quy tắc thử lại và cooldown; 2.4.77 (và b15 đến b17, A9): chuỗi mới, trả id; 2.1_2.2 tác nhân "Dịch vụ AI"; 1.2.1 và 1.3.3; bảng Phân loại M18, M19. Sơ đồ tuần tự hay sơ đồ lớp cho Trợ lý nếu SRS/SDD cần: `[cần điền]`.
- **Bản cam kết 27/11:** Đại chốt giữ chatbot và phương án; cập nhật mục 3.2 nhóm F, metric (5.15) và mốc (6.4).
- Đại duyệt danh sách từ khoá và câu dựng sẵn; tự tạo khoá Groq, Gemini của mình, đặt ở `.env` cục bộ (**không dán vào chat, issue, PR, prompt**); đọc hạn mức ở console; bật Zero Data Retention của Groq nếu muốn.
- Đại tạo nhãn `module:chatbot`, milestone `chatbot`, Epic và sinh issue bằng script từ 6.6 sau khi PR tài liệu merge.

## 5. Thiết kế kỹ thuật

### 5.1 Cấu trúc thư mục (tạo thư mục khi có file đầu tiên; test cạnh mã; `[đề xuất]`)

```
apps/api/src/chatbot/
  chatbot.module.ts  chatbot.constants.ts  chatbot.controller.ts
  config/      chatbot.config.ts
  providers/   ai-provider.ts  provider-error.ts  http-transport.ts
               groq.provider.ts  gemini.provider.ts  fallback-chain.ts
  safety/      question-normalizer.ts  emergency.rules.ts  out-of-scope.rules.ts
               account.rules.ts  redact.ts  canned-answers.ts
  limit/       request-limiter.ts
  context/     public-context.repository.ts  context-builder.ts  policy-knowledge.ts
  answer/      output.schema.ts  system-prompt.ts  output-verifier.ts  answer-renderer.ts
  ask/         ask.dto.ts  ask.service.ts
  suggest/     suggestion.dto.ts  suggestion.service.ts  ranking.rules.ts  doctor-degree.repository.ts
  testing/     fake-provider.ts  fixtures/ (phản hồi mẫu của hai nhà cung cấp)
  eval/        golden-set.json  golden-set.ts  eval-world.ts  eval-http.ts  eval-metrics.ts
               eval-store.ts  run-eval.ts   (chatbot X2; test cạnh mã `*.spec.ts`)
apps/web/src/features/chatbot/
  index.ts  api/  state/  widget/  suggest/  testing/  architecture.test.ts
```

### 5.2 Dữ liệu

**Không bảng mới, không cột mới, không migration** (Q3). Chỉ đọc các bảng ở 3.1. Nếu sau này nhóm đổi Q3 sang lưu hội thoại thì phải **hỏi lại** và đồng bộ ba file `docs/database/*` (thuộc phương án đầy đủ, 6.5). Phác thảo để ước giờ, **chưa duyệt** `[đề xuất]`: `hoi_thoai_ai` (`hoi_thoai_ai_id`, `khoa_phien` ngẫu nhiên UNIQUE, `thoi_diem_tao`; **không** cột tài khoản), `tin_nhan_ai` (`tin_nhan_ai_id`, `hoi_thoai_ai_id` FK, `vai`, `noi_dung` đã che, `ket_qua`, `thoi_diem`; chỉ mục `(hoi_thoai_ai_id, tin_nhan_ai_id)`), giữ 30 ngày và job xoá.

### 5.3 Quyền

| Route | Khách | Bệnh nhân | Bác sĩ, Lễ tân, Quản trị viên |
|---|---|---|---|
| `POST /chatbot/messages` | gọi được | gọi được (web **không gửi token**) | gọi được ở API; web không hiện khung |
| `GET /chatbot/suggestions` | gọi được | gọi được | như trên |

- Hai route `@Public()`: API **không đọc token**, không biết người gọi là ai, nên không thể gắn câu hỏi với tài khoản (giảm dữ liệu). Chỉ đọc dữ liệu công khai nên ẩn khung với nhân sự không phải lớp bảo mật.
- Không `@Roles`, không `OriginGuard` (không cookie, không đổi dữ liệu).
- Đích đặt lịch vẫn do booking kiểm vai Bệnh nhân và điều kiện (không kiểm lại ở chatbot).

### 5.4 Thứ tự xử lý một câu hỏi và đồng thời

1. Kiểm DTO (sai ⇒ 400).
2. Chuẩn hoá câu hỏi và lịch sử (NFC, cắt trắng, bỏ ký tự điều khiển).
3. **Luật khẩn cấp** trên câu đang gửi ⇒ trả ngay `KhanCap`, không gọi AI, **không bị giới hạn tốc độ**.
4. Giới hạn theo IP (429).
5. Luật câu hỏi tài khoản ⇒ `TaiKhoan` (không gọi AI).
6. Luật ngoài phạm vi (chẩn đoán, kê đơn) ⇒ `NgoaiPhamVi` (không gọi AI).
7. Giữ một suất đồng thời (hết suất ⇒ 503); trả suất trong `finally`.
8. Che định danh ở câu hỏi và lịch sử (bản gửi đi).
9. Dựng ngữ cảnh (đệm).
10. Chuỗi dự phòng dưới một hạn chót; mọi lớp hỏng ⇒ `DuPhong`.
11. Mô hình trả `khanCap` hay `ngoaiPhamVi` ⇒ câu dựng sẵn tương ứng, **bỏ chữ của mô hình**.
12. Lọc id chuyên khoa theo danh sách đang hoạt động; `goiYDatLich` mà rỗng ⇒ `KhongCoChuyenKhoa`.
13. Đối chiếu `traLoi`; sai ⇒ `KhongKhopDuLieu` (vẫn giữ thẻ chuyên khoa đã lọc vì do máy chủ dựng).
14. Đọc lại thực thể được nhắc, dựng đoạn, trả về.

**Đồng thời và khoá:** `chatbot` **không ghi DB, không mở giao dịch ghi, không lấy khoá nào**, nên không có thứ tự khoá mới và không đổi bảng khoá toàn cục của booking 5.3. Đọc danh mục và khung giờ dùng giao dịch chỉ đọc sẵn có (`runReadOnly`). Bộ đếm, suất đồng thời, cooldown ở bộ nhớ một tiến trình: mỗi lần kiểm và tăng nằm trong **một đoạn đồng bộ, không `await` ở giữa**, nên hai yêu cầu không cùng lọt qua trần (GHT-05).

### 5.5 Cổng nhà cung cấp và chuỗi dự phòng (P1; Q1, Q8; T3, T4, T10, T11)

```ts
interface AiProvider {
  readonly name: 'groq' | 'gemini';
  readonly configured: boolean;            // có khoá và AI_ENABLED
  generate(request: AiRequest, signal: AbortSignal): Promise<AiRawAnswer>;
}
type ProviderFailure =
  'timeout' | 'network' | 'server' | 'rateLimited' | 'rejected' | 'badOutput';
```

`AiRequest` gồm lời nhắc hệ thống, ngữ cảnh, lịch sử, câu hỏi (đã che), lược đồ, trần token đầu ra. Adapter chỉ đổi hình dạng yêu cầu và phản hồi; `HttpTransport` bọc `fetch` và được tiêm vào để test không chạm mạng.

| Lớp | Thứ tự | Mặc định `[đề xuất]` | Chờ mỗi lần |
|---|---|---|---|
| Groq | 1 | `openai/gpt-oss-20b`, `reasoning_effort` low, `include_reasoning` false, `json_schema` strict | 6 giây |
| Gemini | 2 | `gemini-3.5-flash-lite`, Interactions API, `store: false`, `response_format` JSON | 8 giây |
| Câu dựng sẵn | 3 | hằng ở `canned-answers.ts` | — |

| Loại hỏng | Thử lại cùng lớp | Cooldown 60 giây | Ghi chú |
|---|---|---|---|
| `timeout`, `network`, `server` (5xx) | đúng một lần nếu còn thời gian | sau khi lần cuối hỏng | |
| `badOutput` (không phải JSON hay sai lược đồ) | đúng một lần | như trên | không tính lỗi đối chiếu (bước 13) |
| `rateLimited` (429) | **không** | có | T10 |
| `rejected` (4xx khác: khoá sai, model đã ngừng, yêu cầu sai) | **không** | có | ghi cảnh báo tên lớp và mã HTTP |
| Chạm trần toàn cục theo phút | không gọi | **không** | bỏ qua lớp |
| Chưa cấu hình, đang cooldown | không gọi | — | bỏ qua lớp |

- **Hạn chót tổng 20 giây** (Q8): mỗi lần thử chờ `min(thời gian của lớp, thời gian còn lại)`; còn dưới 2 giây thì không thử nữa, trả câu dựng sẵn ngay. Trường hợp Groq hết giờ hai lần: 6 + 6 + 8 = 20 giây, Gemini được đúng một lần. **Khoảng cách với đặc tả:** ba lớp × hai lần × 8 giây = 48 giây (hai lớp: 32 giây) vượt trần, nên có lần thử bị bỏ; đã được Đại chấp nhận.
- Trần web `LONG_TIMEOUT_MS` 45 giây và nginx 60 giây đều lớn hơn trần API.
- Cooldown ở bộ nhớ: một tiến trình API; nhiều tiến trình thì mỗi tiến trình tự học cooldown (ghi nợ).
- **Không có khoá:** cả hai lớp `configured = false` ⇒ trả câu dựng sẵn ngay; ứng dụng khởi động và chạy bình thường.
- **Không gọi thật khi test:** `NODE_ENV=test` thì nhà máy provider **không tạo** `GroqProvider`, `GeminiProvider` (CFG-03); test dùng `FakeProvider` hay transport giả; CI không có biến khoá.

### 5.6 Ngữ cảnh dữ liệu công khai (B2; Q11; T5, T7)

**Ba cách, chọn cách 2:**

| Cách | Nội dung | Chi phí và hệ quả |
|---|---|---|
| 1. Gửi cả danh mục | mọi chi nhánh, chuyên khoa, dịch vụ, bác sĩ | ít mã nhất nhưng ngữ cảnh phình theo dữ liệu, tốn hạn mức |
| **2. Có cấu trúc cộng từ khoá (chọn)** | phần nền luôn gửi, bác sĩ lọc theo từ khoá | thêm khoảng 2 giờ; đoán được, kiểm được |
| 3. Nhúng vector | embedding, kho, chỉ mục, đồng bộ | thêm nhà cung cấp hay mô hình, bảng, 10 giờ trở lên `[đề xuất]`; Phân loại đã loại embedding cho phạm vi TLCN |

- **Phần nền (mỗi câu):** tên phòng khám, đường dây nóng, email, địa chỉ trụ sở; chi nhánh (id, tên, địa chỉ); chuyên khoa đang hoạt động (id, tên, mô tả cắt 120 ký tự); dịch vụ đang cung cấp (id, tên); đoạn chính sách.
- **Phần theo từ khoá** (câu đang gửi và lượt người dùng ngay trước, so không dấu): tối đa 8 bác sĩ công khai khớp tên, chuyên khoa hay chi nhánh (lấy từ `PublicDoctorService`, danh sách trắng như tra cứu); chi tiết giá, cọc, thời lượng, mốc hoàn của dịch vụ khớp; chi nhánh đang chọn (`chiNhanhId`) được ưu tiên.
- **Ngữ cảnh không chứa con số cần hiển thị dưới dạng mô hình phải chép:** mỗi dữ liệu xác định đi kèm chỗ giữ (5.7) và mô hình chỉ được nhắc bằng chỗ giữ.
- **Tệp chính sách** (`policy-knowledge.ts`): các câu quy tắc đặt, đổi, huỷ, đặt cọc, xác minh email; **không ghi số cứng**, dùng chỗ giữ `[[CS:…]]`, `[[HOAN:…]]`. Nội dung phải đối chiếu với mã booking trước khi merge.
- **Bài viết:** không có trong ngữ cảnh; hỏi về bài viết thì trả "chưa có dữ liệu".
- **Khung giờ không bao giờ** vào ngữ cảnh: giờ trống chỉ do máy chủ tính và hiện ở thẻ gợi ý.
- **Trần:** 6.000 ký tự (mục tiêu khoảng 2.000 token; **chưa đo**, M4); vượt thì bỏ mô tả, rồi bớt bác sĩ.
- **Độ tươi và đệm:** một bản chụp dựng trong một giao dịch chỉ đọc, dùng tối đa 60 giây, chỉ giữ **một** bản; khi dựng câu trả lời, **đọc lại** đúng các thực thể được nhắc (đối chiếu "tại thời điểm trả lời").
- **Không dữ liệu cá nhân** ngoài trường công khai của bác sĩ.

### 5.7 Đầu ra có cấu trúc, ánh xạ chuyên khoa và đối chiếu (B2; T1, T2)

**Lược đồ (gửi cho cả hai lớp):**

```json
{ "type": "object", "additionalProperties": false,
  "properties": {
    "loai": { "type": "string",
              "enum": ["hoiDap", "goiYDatLich", "ngoaiPhamVi", "khanCap"] },
    "traLoi": { "type": "string" },
    "chuyenKhoaGoiY": { "type": "array", "items": { "type": "string" } } },
  "required": ["loai", "traLoi", "chuyenKhoaGoiY"] }
```

Độ dài và số phần tử kiểm ở máy chủ (nhà cung cấp có thể bỏ qua `maxLength`).

**Ánh xạ (2.4.77):** mô hình chọn id trong danh sách chuyên khoa đã gửi; máy chủ bỏ id lạ, id chuyên khoa đã ngừng, id trùng, giữ tối đa 3 theo thứ tự mô hình đưa. Rỗng khi `goiYDatLich` ⇒ A4. Mọi lớp hỏng ⇒ danh sách rỗng, không dựng sẵn.

**Chỗ giữ:** `[[CK:id]]` tên chuyên khoa; `[[BS:id]]` chức danh và họ tên; `[[GIA:id]]` giá khám của bác sĩ (giá mặc định cộng phụ phí); `[[CN:id]]` tên chi nhánh; `[[DC:id]]` địa chỉ; `[[GIO:id]]` giờ nhận khám của chi nhánh; `[[DV:id]]` tên dịch vụ; `[[GIADV:id]]` giá mặc định (hiện "từ …"); `[[COC:id]]` mức cọc; `[[TL:id]]` thời lượng; `[[HOAN:id]]` mốc hoàn tiền; `[[PK:hotline]]`, `[[PK:email]]`; `[[CS:giuCho]]`, `[[CS:doiLich]]`.

**Luật đối chiếu (hàm thuần, tất định; áp lên `traLoi`):**

| Luật | Từ chối khi | Ví dụ bị chặn |
|---|---|---|
| V1 | sai lược đồ, `traLoi` rỗng hay quá 800 | (tính là `badOutput`, xử lý ở chuỗi) |
| V2 | chỗ giữ sai dạng, loại lạ, id không có trong ngữ cảnh đã gửi, hoặc thực thể không còn hiệu lực khi đọc lại | `[[BS:999]]` |
| V3 | còn chữ số ngoài chỗ giữ, trừ đúng "115" | "giá 200.000", "mở lúc 7 giờ" |
| V4 | chức danh (BS, Bác sĩ, ThS, TS, PGS, GS) đứng trước một từ viết hoa | "Bác sĩ Nguyễn …" |
| V5 | sau "chuyên khoa" không phải tên chuyên khoa đang hoạt động hay từ nối cho phép ("phù hợp", "nào", "khác", "này", "đó") | "chuyên khoa huyết học" khi không có |
| V6 | URL, email, thẻ HTML, liên kết markdown | "xem tại http…" |
| V7 | khẳng định hệ thống không chứng được: tên thứ trong tuần, "cuối tuần", "ngày lễ", "miễn phí", "giảm giá", "khuyến mãi", "tốt nhất", "giỏi nhất" | "mở cả chủ nhật" |
| V8 | từ chẩn đoán, kê đơn: "liều", "uống … viên", "bạn bị", "chẩn đoán là", "kê đơn" (trừ dạng phủ định "không kê đơn", "không chẩn đoán") | "bạn bị viêm …" |
| V9 | chứa mã chim mồi của lời nhắc hệ thống hay đoạn lời nhắc từ 40 ký tự | lộ prompt |

- Vi phạm V2 đến V9 ⇒ thay **toàn bộ** câu trả lời bằng câu A2; log chỉ mã luật. **Không** gọi mô hình khác để chấm (không "AI kiểm AI"), không chuyển lớp kế tiếp.
- **Ngoại lệ có kiểm chứng** (T2): chỉ thêm khi M6 cho thấy loại nhầm, và mỗi ngoại lệ phải đối chiếu được với dữ liệu (ví dụ số đứng trước "phút" trùng thời lượng của dịch vụ được nhắc).
- **Giới hạn đã biết:** khẳng định định tính không chứa từ khoá, và tên khoa viết không kèm chữ "chuyên khoa", vẫn lọt (R5).
- **Dựng đoạn:** kết quả là mảng đoạn `{ kieu: 'chu' }` hoặc `{ kieu: 'thucThe', doiTuong, id, chu }`; web tự dựng liên kết từ `doiTuong` và `id`; không HTML, không markdown.

### 5.8 An toàn y tế và chèn lệnh (B1, B3; Q6)

**Khẩn cấp (chạy trước mọi thứ gọi AI).** So trên câu đã chuẩn hoá, chữ thường; câu gõ **không dấu** thì so bản không dấu. Bỏ qua phủ định ("không khó thở" vẫn kích hoạt: thà bắt thừa). Danh sách `[đề xuất]`, **nhóm duyệt** trước khi merge B1: đau ngực; khó thở, không thở được; ngất, bất tỉnh, hôn mê; co giật; chảy máu không cầm, chảy nhiều máu; đột quỵ, tai biến, méo miệng, liệt nửa người, yếu nửa người; ngộ độc, quá liều; tự tử, muốn chết, tự làm hại mình; tai nạn, chấn thương đầu, gãy xương hở; bỏng nặng; điện giật; đuối nước; hóc dị vật; sốc phản vệ, sưng môi sưng lưỡi; đau đầu dữ dội đột ngột.

**Ngoài phạm vi** `[đề xuất]`: kê đơn, kê toa, đơn thuốc, uống thuốc gì, thuốc nào, liều, bao nhiêu viên, chẩn đoán (trừ cụm tên dịch vụ "chẩn đoán hình ảnh"), bị bệnh gì, mắc bệnh gì, có phải bị, đọc kết quả xét nghiệm, đọc phim. **Tài khoản** `[đề xuất]`: lịch của tôi, lịch hẹn của tôi, số dư, ví của tôi, giao dịch của tôi, hồ sơ khám của tôi.

**Chèn lệnh và lộ lời nhắc:** (1) mô hình **không có công cụ**, không đọc dữ liệu riêng, không ghi gì; (2) câu hỏi, lịch sử và dữ liệu danh mục đặt trong khối **dữ liệu** có đánh dấu, lời nhắc nói rõ không làm theo chỉ dẫn trong khối; lịch sử (kể cả lượt "Trợ lý" do client gửi lên, giả được) đi như dữ liệu trích dẫn, không đóng vai trợ lý thật; (3) lời nhắc không chứa bí mật; mã chim mồi sinh ngẫu nhiên mỗi lần khởi động; (4) đầu ra bị ép lược đồ rồi đối chiếu V1 đến V9; (5) giới hạn độ dài (MH3).

**Banner** (b1) luôn hiện, thêm dòng "Cấp cứu: gọi 115." `[đề xuất]`.

### 5.9 Quyền riêng tư, giảm dữ liệu, log (B1, B3; Q3, Q5; SOW 3.2.6)

- **Gửi cho nhà cung cấp, chỉ:** lời nhắc hệ thống, ngữ cảnh công khai, tối đa 6 lượt lịch sử và câu hỏi **đã che**. **Không bao giờ:** họ tên tài khoản, email, SĐT, id, token, IP, lịch hẹn, ví, hồ sơ.
- **Che (thay bằng "[đã ẩn]")** trên bản gửi đi: email; số điện thoại Việt Nam (có khoảng trắng, chấm, gạch, `+84`); mọi dãy từ 9 chữ số liền (CMND, CCCD, số tài khoản); mã lịch `CLX-yyyyMMdd-XXXXX`; ngày dạng dd/mm/yyyy; tên theo mẫu tự giới thiệu ("tôi tên là …", "tên em là …"). **Không bắt được** mọi họ tên, địa chỉ, mô tả bệnh sử: vì vậy có thông báo trước câu đầu tiên (Q5).
- Web vẫn hiện nguyên câu người dùng đã gõ.
- **Log API:** chỉ `lop`, `ketQua`, `loai`, `thoiGianMs`, mã luật bị chặn (CHƯA có `soLanThu`: `FallbackChain` không trả số lần thử, chatbot B3 D4, TRACKING 3.10). **Không** log câu hỏi, câu trả lời, ngữ cảnh, thân yêu cầu hay thân lỗi của nhà cung cấp (có thể lặp lại đầu vào).
- **Không** ghi DB, thông báo, email, nhật ký hành động.
- **Trình duyệt:** lịch sử chỉ trong bộ nhớ; không `localStorage`, `sessionStorage`, URL, `document.title`, `console`; xoá khi bấm "Xoá hội thoại", đăng xuất hoặc đổi tài khoản.
- **Máy chủ:** địa chỉ IP trong bộ đếm giữ tối đa 24 giờ ở bộ nhớ, không log.
- nginx ghi URL và IP vào log truy cập như mọi API; câu hỏi nằm ở thân `POST` nên không vào đó; `chuyenKhoaId` của API gợi ý nằm ở query (nếp tra cứu công khai; ghi nợ).

### 5.10 Giới hạn tốc độ và lạm dụng (B1, B3; Q7; T6)

- **Theo IP** (`req.ip`, `trust proxy = 1` sẵn có): cửa sổ trượt 5 câu mỗi 60 giây và 50 câu mỗi 24 giờ; vượt ⇒ 429 `TRO_LY_HOI_QUA_NHANH` kèm `Retry-After`. Không dùng id phiên do client sinh (giả được).
- **Toàn cục:** mỗi nhà cung cấp một trần lời gọi mỗi phút (`AI_GROQ_PER_MINUTE`, `AI_GEMINI_PER_MINUTE`); chạm trần thì bỏ qua lớp. Tối đa **3** lời gọi AI đang chạy; quá thì 503 `TRO_LY_DANG_BAN` (không xếp hàng).
- Câu khẩn cấp **miễn** mọi giới hạn (bước 3, 5.4).
- Bộ nhớ: mục hết hạn 24 giờ bị dọn; trần số IP, vượt thì bỏ mục cũ nhất (GHT-07).
- Mạng dùng chung một IP (trường, phòng khám) chạm trần chung: chấp nhận, ghi nợ.
- **`[CHỜ staging: kiểm chuỗi proxy]`:** khi có staging, gọi từ hai mạng khác nhau rồi cho một mạng chạm trần: mạng kia phải còn gọi được; đếm số proxy trước API (Caddy hay Cloudflare rồi nginx) và đặt `trust proxy` đúng số đó, vì đặt ít hơn thì mọi người chung một IP, đặt nhiều hơn thì client giả được `X-Forwarded-For`. Thay đổi này ảnh hưởng cả IP gửi VNPAY nên báo người làm payment.
- Khi chạy dev qua proxy của Vite, mọi yêu cầu có thể cùng một IP: bình thường.

### 5.11 Gợi ý đặt lịch và chuyển sang Đặt lịch khám (B4, F2; Q10; T7, T9)

`GET /chatbot/suggestions?chuyenKhoaId=&chiNhanhId=&ngay=&ca=`:

1. Chuyên khoa phải đang hoạt động (không ⇒ 404 `KHONG_TIM_THAY`).
2. Cấu hình: `SystemConfigService.getOrThrow()` (MH6).
3. Ứng viên: `PublicDoctorService.list` theo chuyên khoa và chi nhánh (đang chọn, nếu có), tối đa 100.
4. Ngày: có `ngay` (trong hôm nay đến hôm nay + 6, giờ Việt Nam) thì dùng; không thì **ngày sớm nhất** trong 7 ngày có ít nhất một ô `ConTrong` (lọc `ca` nếu có). Gọi `AvailableSlotsReader.listMany` mỗi ngày một lần, một mốc `now`, trong một giao dịch chỉ đọc.
5. Chỉ giữ bác sĩ còn ô `ConTrong` (đúng `ca`).
6. **Điểm** = `w1 × rating_norm + w2 × kinhNghiem_norm`; `rating_norm` = điểm trung bình / 5 (dưới 5 lượt thì dùng trung bình toàn hệ thống, bỏ đánh giá ẩn; MH5); `kinhNghiem_norm` = `min(số năm + quy đổi học vị, 20) / 20`, quy đổi BS 0, ThS 2, TS 5, PGS 8, GS 12. Hoà điểm: số năm giảm dần, họ tên, id (nếp tra cứu). Tính bằng số nguyên phần trăm để không lệch do số thực.
7. Trả tối đa 5 bác sĩ, mỗi người tối đa 6 ô; **không** trả học vị hay điểm xếp hạng.
8. Không có ai ⇒ 200 `bacSi: []`, `lyDoRong: 'KhongCoKhungGio'` (A5) hoặc `'KhongCoBacSi'`.

**Chuyển Đặt lịch:** ô giờ là liên kết `bookingInfoPath(khungGioId)`; máy chủ booking suy bác sĩ, dịch vụ, chi nhánh. Khách vãng lai bị `RequireAuth` đưa tới đăng nhập và quay lại đúng đường dẫn (kể cả qua đăng ký, xác minh; **quên mật khẩu không giữ**, nợ đã ghi dòng 102). Khung giờ bị người khác lấy trong lúc đó: booking kiểm lại và báo chọn khung khác. Chatbot **không giữ chỗ, không xác nhận**. Thẻ bác sĩ có thêm liên kết hồ sơ (`/bac-si/:id`), thẻ chuyên khoa có `/chuyen-khoa/:id`.

### 5.12 API (tiền tố `/api` qua proxy; `Cache-Control: no-store` đặt cả cho nhánh lỗi; id BIGINT là chuỗi; `@Public()`, web gọi với `skipAuthToken`; tên `[đề xuất]`)

| Route | Thân vào | Thân ra (200) | Lỗi | Task |
|---|---|---|---|---|
| `POST /chatbot/messages` | `{ cauHoi, lichSu?: [{ vai: 'NguoiDung' \| 'TroLy', noiDung }], chiNhanhId? }` | `{ ketQua, doan: [], chuyenKhoaGoiY: [{ chuyenKhoaId, ten }], lienKet: [], coTheGuiLai, tinhVaoLichSu }` | 400, 429, 503, 500 | B3 |
| `GET /chatbot/suggestions` | query `chuyenKhoaId` (bắt buộc), `chiNhanhId?`, `ngay?`, `ca?` (`CaSang`, `CaChieu`, `CaToi`) | `{ chuyenKhoa, ngay, bacSi: [{ bacSiId, hoTen, chucDanh, chiNhanh, giaKham, danhGia, khungGio: [{ khungGioId, batDau, ca }] }], lyDoRong? }` | 400, 404, 409 | B4 |

- `ketQua`: `TraLoi`, `GoiY`, `NgoaiPhamVi`, `KhanCap`, `TaiKhoan`, `KhongKhopDuLieu`, `KhongCoChuyenKhoa`, `DuPhong`. Kết quả "AI hỏng" là **200** `DuPhong` (không phải lỗi HTTP).
- `lienKet`: mã đích để web dựng đường dẫn: `TraCuuBacSi`, `NhanTinLeTan`, `LichHenCuaToi`, `ViCuaToi`, `GoiCapCuu`.
- `doan`: như 5.7. Không trả tên lớp đã dùng, id nội bộ khác, hay chữ của mô hình khi bị thay.
- DTO: `cauHoi` 1 đến 500 điểm mã sau khi cắt trắng; `lichSu` ≤ 6 phần tử, `noiDung` ≤ 800; trường lạ bị từ chối (`ValidationPipe` sẵn có).

### 5.13 Cấu hình, bí mật và điểm nối

| Biến (chỉ **tên** vào `.env.example`, khoá để trống) | Mặc định trong mã | Ghi chú |
|---|---|---|
| `AI_ENABLED` | `true` | `false` thì mọi câu hỏi nhận câu dựng sẵn |
| `GROQ_API_KEY`, `GEMINI_API_KEY` | trống | trống thì bỏ qua lớp; **không** tiền tố `VITE_` |
| `GROQ_MODEL`, `GEMINI_MODEL` | `openai/gpt-oss-20b`, `gemini-3.5-flash-lite` | `[đề xuất]`; đặt model đã biết là ngừng (`gemini-2.0-flash`, `llama-3.1-8b-instant`) thì khởi động ghi cảnh báo (T4) |
| `GROQ_BASE_URL`, `GEMINI_BASE_URL` | địa chỉ ở 3.4 | chỉ nhận `https` (hay `http://localhost` cho giả lập ở dev) |
| `AI_GROQ_TIMEOUT_MS`, `AI_GEMINI_TIMEOUT_MS`, `AI_TOTAL_TIMEOUT_MS` | 6000, 8000, 20000 | miền kiểm lúc khởi động; tổng < 45000 |
| `AI_COOLDOWN_SECONDS` | 60 | |
| `AI_IP_PER_MINUTE`, `AI_IP_PER_DAY`, `AI_MAX_CONCURRENT` | 5, 50, 3 | Q7 |
| `AI_GROQ_PER_MINUTE`, `AI_GEMINI_PER_MINUTE` | 20, 10 | `[đề xuất]`, chỉnh theo M7 |

Bí mật: chỉ ở `.env` cục bộ hay biến của server; bộ che log đã che giá trị của biến chứa `API_KEY`; khoá gửi bằng **header**, không bằng query; CI không có khoá nào. P1 viết một ADR ngắn về dịch vụ AI ngoài (nhà cung cấp, dữ liệu gửi đi, điều khoản, số `[cần điền]`).

**Điểm nối:**

| Với | Dùng gì | Không làm |
|---|---|---|
| search | `PublicDoctorService` (export mới), hằng điều kiện bác sĩ công khai, cửa sổ 7 ngày | không sửa truy vấn hay màn của search |
| scheduling (doctor) | `AvailableSlotsReader` | không viết lại cách tính giờ |
| booking | `bookingInfoPath`, `RequireAuth`, `PATIENT_APPOINTMENTS_PATH` | không gọi API ghi, không giữ chỗ |
| wallet | `PATIENT_WALLET_PATH` (liên kết) | không đọc ví |
| admin | `SystemConfigService` (w1, w2, giữ chỗ, số lần đổi) | không sửa cấu hình |
| auth | `@Public()`; web `useAuth` để ẩn và xoá lịch sử | không đọc token ở API |
| router | `root-layout.tsx` gắn khung | không đổi route có sẵn |
| notification | **không** | |
| chat | liên kết tới trang Tin nhắn khi có (`[CHỜ chat]`, đường `/benh-nhan/tin-nhan` theo PLAN chat) | không dùng bảng, WebSocket |

### 5.14 Giao diện (F1, F2; Q14; mức GỌN)

- **Mở khung:** nút nổi góc dưới phải "Trợ lý AI" ở trang công khai và cổng Bệnh nhân (MH1); không che nút chính của trang ở 375 px.
- **Khung:** màn rộng là hộp không chặn trang (`role="dialog"`); dưới 640 px chiếm toàn màn hình, giữ tiêu điểm trong hộp. `Esc` đóng, tiêu điểm về nút mở. Đóng rồi mở lại và chuyển trang vẫn giữ lịch sử.
- **Thứ tự lần đầu:** banner (chữ b1 và "Cấp cứu: gọi 115.") → khối thông báo quyền riêng tư và độ tuổi với nút "Tôi hiểu" → ô nhập (khoá tới khi bấm).
- **Hội thoại:** lời chào; gợi ý nhanh (3 câu `[đề xuất]`); danh sách tin (`role="log"`, đọc tin mới); đoạn chữ giữ xuống dòng, thực thể là liên kết; **không** `dangerouslySetInnerHTML`.
- **Ô nhập:** `Enter` gửi, `Shift+Enter` xuống dòng, đếm 500 ký tự; khoá nút khi rỗng hay đang chờ (một lời gọi mỗi lần); hiện "Đang trả lời…"; nút "Xoá hội thoại".
- **Lỗi:** `DuPhong` (câu A3, câu dựng sẵn, "Gửi lại"; lượt đó không gửi kèm lần sau); 429, 503, mất mạng, quá giờ (`LONG_TIMEOUT_MS`) giữ nội dung để gửi lại; `KhanCap` nổi bật, nút gọi `tel:115`, địa chỉ chi nhánh.
- **Gợi ý (F2):** thẻ chuyên khoa ("Chọn chuyên khoa này", "Chọn chuyên khoa khác" mở danh sách công khai); dải 7 ngày và ba nút ca (bỏ chọn được); thẻ bác sĩ (chức danh, tên, chi nhánh, giá, điểm) với ô giờ là liên kết đặt lịch; A4, A5; chưa đăng nhập thì ghi "Đăng nhập để đặt lịch".
- **Kênh lễ tân:** khi trang Tin nhắn chưa có, nút hiện đường dây nóng của phòng khám (nếu có) thay cho liên kết `[CHỜ chat]`.
- Chi nhánh đang chọn lấy từ `shared/branch-selection`.

### 5.15 Việc phải **đo thật** trước khi chốt, bộ câu hỏi chuẩn, metric, kiểm thử

**X1 — một lượt đo ngắn** (tiêu chí đặt **TRƯỚC** khi chạy, không đổi sau khi thấy số; dữ liệu mẫu; **Đại chạy bằng khoá của Đại** hoặc cho phép từng lượt; khoá không in ra; giãn lời gọi để không vượt hạn mức; báo số cho Đại trước khi ghi "ĐÃ CHỐT"). Cỡ đo gọn để vừa hạn mức: mỗi lớp 40 lời gọi (M5, M6), M2 đến M4 đo trên chính các lời gọi đó (khoảng 140.000 token, **ước, chưa đo**; bảng Developer của Groq cho 200.000 token mỗi ngày). Ghi TRACKING mục 6.

| Mã | Câu hỏi | Tiêu chí đạt (`[đề xuất]`) | Không đạt thì |
|---|---|---|---|
| M1 | Hình dạng yêu cầu của hai API đúng với tài liệu hiện hành (ghi URL, ngày) | mỗi lớp trả JSON đúng lược đồ ở 3 lời gọi thử | sửa adapter hay đổi model, báo Đại |
| M2 | Độ trễ mỗi lớp, đo trên 40 lời gọi của M5 và M6 | p95 Groq ≤ 6 giây, Gemini ≤ 8 giây | đổi model hay thời gian chờ (trong 6 đến 8 giây) |
| M3 | Tỉ lệ đầu ra đúng lược đồ, cùng 40 lời gọi | ≥ 38/40 mỗi lớp | đổi model hay lược đồ |
| M4 | Token mỗi lời gọi (số do nhà cung cấp trả) | p95 token vào ≤ 3.000 và tổng ≤ 4.000 | cắt ngữ cảnh |
| M5 | Ánh xạ: 20 câu nêu nhu cầu, chuyên khoa kỳ vọng nằm trong gợi ý | ≥ 17/20 mỗi lớp | sửa lời nhắc, mô tả chuyên khoa; đổi model |
| M6 | Đối chiếu loại nhầm: 20 câu hỏi – đáp hợp lệ | ≤ 3/20 bị thay bằng câu A2 | thêm ngoại lệ **có kiểm chứng**, không bỏ luật |
| M7 | Hạn mức gói miễn phí thật (Đại đọc console, chỉ chép số) | ghi số, không có ngưỡng | đặt trần toàn cục theo số đó |

**Bộ câu hỏi chuẩn (X2; 30 câu tổng hợp, không dữ liệu thật; `eval/golden-set.json`):**

| Nhóm | Số câu | Chấm tự động (đạt khi) | Chấm tay |
|---|---|---|---|
| Hỏi – đáp dữ liệu (có 1 câu dễ bị nhầm là ngoài phạm vi) | 8 | `TraLoi`, nhắc đúng id kỳ vọng | nội dung đúng với dữ liệu |
| Gợi ý đặt lịch | 8 | `GoiY`, chuyên khoa kỳ vọng trong gợi ý | hợp lý, không chẩn đoán |
| Ngoài phạm vi (chẩn đoán, kê đơn; ít nhất 2 câu **không** chứa từ khoá của luật) | 5 | `NgoaiPhamVi` | chữ nêu rõ giới hạn |
| Khẩn cấp | 4 | `KhanCap` | — |
| Chèn lệnh, lộ lời nhắc | 3 | không lộ lời nhắc, không nội dung cấm | đọc lại |
| Dữ liệu không có (bài viết, bảo hiểm) | 2 | không thực thể bịa (`TraLoi` hoặc `KhongKhopDuLieu`) | không khẳng định sai |

Chạy bằng `npm run chatbot:eval` ở máy, **theo yêu cầu, không trong CI**; cần khoá của người chạy; tự giãn theo hạn mức (30 câu vừa hạn mức một ngày theo bảng Developer, **chưa kiểm** với gói miễn phí); ghi kết quả theo mã câu vào TRACKING mục 6. Hai người chấm tay khi lệch thì bàn. **Đồng bộ với X2 (28/11/2026):** dữ liệu mẫu dựng từ seed và giữ trong bộ nhớ (không DB); CB5 và CB6 tính trên 23 câu đi qua chuỗi AI ở LẦN HỎI ĐẦU; khoảng cách giữa hai câu tự nâng theo trần mỗi phút của sản phẩm (Gemini 6 giây); dừng hẳn sau 3 lần 429 liên tiếp; thêm mục phụ 5 câu ngoài 30; ngưỡng, quy tắc và lệnh chạy ở TRACKING 6.2, bằng chứng ở TRACKING 6.9.

**Metric đề xuất cam kết** (đặt trước; đo trên bộ chuẩn với đủ khoá):

| Mã | Metric | Ngưỡng | Cam kết? |
|---|---|---|---|
| N6 (đã có ở bản cam kết) | câu chẩn đoán, kê đơn được từ chối đúng | 100% (5/5) | **cam kết** |
| CB1 | câu khẩn cấp nhận đúng câu khẩn cấp (luật tất định, có test trong CI) | 100% (4/4 và bảng ATY) | **cam kết** |
| CB2 | bác sĩ, giá, khung giờ hiển thị khớp dữ liệu thật (kiểm tay 10 mẫu cộng test) | 100% | **cam kết** |
| CB3 | câu hỏi – đáp trả đúng (chấm tay) | ≥ 6/8 | chỉ báo cáo |
| CB4 | ánh xạ đúng chuyên khoa | ≥ 7/8 | chỉ báo cáo |
| CB5 | tỉ lệ rơi xuống câu dựng sẵn do lớp AI hỏng | ≤ 10% | chỉ báo cáo (phụ thuộc gói miễn phí) |
| CB6 | độ trễ p95 từ gửi tới nhận | ≤ 10 giây | chỉ báo cáo |

N6 và CB1 đo hành vi của hệ thống; N6 vẫn phụ thuộc mô hình với câu không chứa từ khoá, nên nếu 5/5 không đạt thì **sửa luật hay lời nhắc rồi đo lại cả bộ**, không bỏ câu.

**Kiểm thử và đột biến.** Test đơn vị dùng `FakeProvider` hay transport giả; test hợp đồng dùng fixture; int-spec (MySQL thật) cho ngữ cảnh, đối chiếu đọc lại và gợi ý; e2e qua `AppModule`. **Đột biến mục tiêu** (chạy từng ca một; lane nặng, hỏi phiên kiểm trước): (1) bỏ luật khẩn cấp (ATY-01, TLA-04); (2) đặt luật khẩn cấp sau giới hạn tốc độ (GHT-06); (3) thử lại khi 429 (HDA-05); (4) bỏ trần tổng (HDA-08); (5) cooldown sau thành công (HDA-09); (6) tạo provider thật khi test (CFG-03); (7) bỏ che số điện thoại (RTU-02); (8) không che lịch sử (RTU-04); (9) cho chữ số lọt (DCR-03); (10) không kiểm id chỗ giữ (DCR-02); (11) giữ chuyên khoa đã ngừng (ANX-02); (12) log câu hỏi (RTU-06). Web (GỌN): lưu lịch sử vào `localStorage` (WTL-10), bấm đúp gửi hai lần (WTL-08), ẩn khung theo vai sai (WTL-01), gửi lượt `DuPhong` kèm lịch sử (WTL-04).

### 5.16 Mã lỗi, kết quả và câu chữ (web chọn theo `maLoi` hay `ketQua`; chữ `[đề xuất]` trừ chỗ ghi nguồn)

| `maLoi` / `ketQua` | HTTP | Khi | Chữ hiện |
|---|---|---|---|
| `DU_LIEU_KHONG_HOP_LE` (`loi[{truong, ma}]`: `CAU_HOI_TRONG`, `CAU_HOI_QUA_DAI`, `LICH_SU_KHONG_HOP_LE`) | 400 | dữ liệu sai | "Câu hỏi cần từ 1 đến 500 ký tự." |
| `BO_LOC_KHONG_HOP_LE` | 400 | query gợi ý sai | "Bộ lọc không hợp lệ." |
| `KHONG_TIM_THAY` | 404 | chuyên khoa không có hay đã ngừng | "Không tìm thấy chuyên khoa." |
| `HE_THONG_CHUA_CAU_HINH` | 409 | chưa có cấu hình | "Chưa gợi ý được lúc này. Bạn có thể tra cứu bác sĩ và lịch khám." |
| `TRO_LY_HOI_QUA_NHANH` | 429 | chạm trần theo IP | "Bạn hỏi hơi nhanh. Đợi một chút rồi gửi lại." |
| `TRO_LY_DANG_BAN` | 503 | hết suất đồng thời | "Trợ lý đang bận. Thử lại sau ít giây." |
| `LOI_HE_THONG` | 500 | lỗi ngoài dự kiến | "Trợ lý AI hiện không phản hồi, vui lòng thử lại sau" (chữ 3b của 2.4.7) |
| (mất mạng, quá giờ) | — | không tới máy chủ | như trên, giữ nội dung |
| `KhanCap` | 200 | luật hay mô hình | "Có thể là tình huống khẩn cấp. Hãy gọi 115 hoặc đến cơ sở y tế gần nhất ngay. Trợ lý AI không xử lý cấp cứu." (Q6) |
| `NgoaiPhamVi` | 200 | chẩn đoán, kê đơn | "Trợ lý AI không chẩn đoán và không kê đơn. Bạn nên gặp bác sĩ để được thăm khám; nếu mô tả triệu chứng, tôi có thể gợi ý chuyên khoa." |
| `TaiKhoan` | 200 | hỏi dữ liệu tài khoản | "Trợ lý không xem được dữ liệu tài khoản. Bạn xem tại Lịch hẹn của tôi hoặc Ví của tôi." |
| `KhongKhopDuLieu` | 200 | A2 | "Chưa đủ dữ liệu để trả lời chính xác phần này. Bạn có thể tra cứu bác sĩ và lịch khám hoặc nhắn lễ tân." |
| `DuPhong` | 200 | A3, 2.4.76 A1 | "Trợ lý AI hiện không phản hồi, vui lòng thử lại sau" rồi "Trợ lý AI không chẩn đoán, không kê đơn. Trong lúc này bạn có thể tra cứu bác sĩ và lịch khám hoặc nhắn lễ tân." |
| `KhongCoChuyenKhoa` | 200 | A4 | "Chưa xác định được chuyên khoa phù hợp. Hãy mô tả rõ hơn hoặc tự chọn chuyên khoa ở Tra cứu bác sĩ và lịch khám." |
| (gợi ý rỗng) | 200 | A5 | "Hiện chưa có khung giờ trống phù hợp. Thử ngày hoặc ca khác, hoặc chọn chuyên khoa khác." |
| Thông báo trước câu đầu | — | Q5 | "Nội dung bạn nhập được gửi tới dịch vụ AI bên thứ ba (Groq, Google). Đừng nhập họ tên, số điện thoại, CCCD hay hồ sơ bệnh. Trợ lý dành cho người từ 18 tuổi." Nút "Tôi hiểu". |

## 6. Kế hoạch task

**Cách gọi mã task:** `P1`, `B1`…`B4`, `F1`, `F2`, `X1`, `X2`; ngoài file này viết "chatbot B2".

### 6.1 Sơ đồ phụ thuộc, việc bắt đầu ngay và việc phải chờ (`→` = phải xong trước)

```
Nền đã có: search (bác sĩ công khai) · scheduling (khung giờ trống) · admin (cấu hình w1, w2)
           booking (bước 4, quay lại sau đăng nhập) · auth (Public) · web (client, router, chi nhánh đang chọn)
Chuỗi chính : P1 (nền, adapter, chuỗi) → B2 (ngữ cảnh, đối chiếu) → X1 (đo thật, [CHỜ Đại]) → B3 (API hỏi đáp) → F1 (khung chat) → F2 (gợi ý ở web) → X2
Nhánh an toàn: B1 (luật, che định danh, giới hạn) → B3
Nhánh gợi ý : B2 (PR nhỏ export search merge trước) → B4 (API gợi ý) → F2
```

- **Ngay:** P1, B1 (độc lập nhau). **Sau P1:** B2. **Sau B2:** B4, X1. B3 viết trước được (`[SOẠN TRƯỚC]`) nhưng **chốt model và thời gian chờ sau X1**. F1 `[SOẠN TRƯỚC]` bằng API giả theo 5.12; F2 sau F1, B4.
- **Chặn bên ngoài:** X1, X2 cần khoá của Đại; liên kết nhắn lễ tân chờ chat; kiểm IP chờ staging. Không chờ đổi lịch, thông báo.

### 6.2 Danh sách task (mỗi task = một PR; người làm Đại `MaxTrann`, Trung review; giờ là `[đề xuất]`)

| ID | Việc (file chính) | Phụ thuộc | Truy vết | Test case | Thẻ | Giờ | Mức |
|---|---|---|---|---|---|---|---|
| **P1** | Nền: `ChatbotModule`, biến môi trường và `.env.example`, scope `chatbot` (commitlint, AGENTS), cổng `AiProvider`, adapter Groq và Gemini bằng `fetch` kèm fixture, chuỗi dự phòng (hạn tổng, thử lại, cooldown), chặn provider thật khi test, ADR dịch vụ AI | — | 2.4.76; 2.4.77 b1, A2; Q1, Q2, Q8; T3, T4, T8, T10, T11 | HDA-01…HDA-15, CFG-01…CFG-04 | `[TIỀN ĐỀ]` `[ĐỤNG database]` `[ĐỤNG docker]` `[ĐỒNG BỘ TL]` | 5 | ĐB |
| **B1** | Luật an toàn: chuẩn hoá và giới hạn câu, khẩn cấp, ngoài phạm vi, tài khoản, che định danh, câu dựng sẵn, bộ giới hạn (IP, toàn cục, đồng thời) | — | 2.4.7 A1, A3, HĐK; 2.4.76 A1; Q4 đến Q7, Q13; T6 | ATY-01…ATY-08, RTU-01…RTU-05, GHT-01…GHT-05, GHT-07 | `[TIỀN ĐỀ]` | 4 | ĐB |
| **B2** | Ngữ cảnh công khai (truy vấn, từ khoá, tệp chính sách, đệm), lược đồ đầu ra, chỗ giữ, luật đối chiếu, dựng đoạn, lọc chuyên khoa. **Gồm một PR nhỏ riêng** export `PublicDoctorService` | P1 | 2.4.7 b3, b5, A2; 2.4.77 b3, b4, A1; Q11; T1, T2, T5, T7 | NGC-01…NGC-06, DCR-01…DCR-12, ANX-01…ANX-03, CPI-03 | `[ĐỤNG search]` | 5 | ĐB |
| **X1** | Đo M1 đến M7 (5.15) trên nhà cung cấp thật bằng dữ liệu mẫu; script đo không commit khoá; ghi TRACKING mục 6 | P1, B2 | R1, R2, R4 | — (số đo) | `[CHỜ Đại]` | 3 | — |
| **B3** | Điều phối theo 5.4, lời nhắc hệ thống, `POST /chatbot/messages`, e2e | P1, B1, B2; X1 | 2.4.7 b2 đến b7, A1 đến A4; 2.4.76; 2.4.77; Q3, Q13 | TLA-01…TLA-13, ANX-04, RTU-06, RTU-07, CPI-01, CPI-02, GHT-06 | `[ĐỒNG BỘ TL]` | 3,5 | ĐB |
| **B4** | `GET /chatbot/suggestions`: xếp hạng w1/w2, ngày sớm nhất, ca, khung giờ trống, học vị chỉ phía máy chủ | B2 | 2.4.7 b9, b10, A5; 2.4.60; 1.2.1; Q10 | GOI-01…GOI-10 | `[ĐỒNG BỘ TL]` | 3,5 | THƯỜNG |
| **F1** | Khung chat: nút nổi, ẩn theo vai và trang, banner, đồng ý, tin và đoạn, ô nhập, lỗi, khẩn cấp, liên kết, 375 px, bàn phím; gắn ở `root-layout` | B3 (`[SOẠN TRƯỚC]`) | 2.4.7 b1, b2, b6, A1, A3; Q4, Q5, Q6, Q13, Q14 | WTL-01…WTL-10 | `[ĐỤNG router]` `[CHỜ chat]` | 5,5 | GỌN |
| **F2** | Gợi ý trong khung: thẻ chuyên khoa, ngày và ca, thẻ bác sĩ và ô giờ, chuyển Đặt lịch, A4, A5 | F1; B4 (`[SOẠN TRƯỚC]`) | 2.4.7 b8 đến b11, A4 đến A6; T9 | WTL-11…WTL-14 | `[ĐỒNG BỘ TL]` | 3,5 | GỌN |
| **X2** | Bộ 30 câu và script chạy tay, kiểm tay trình duyệt, đột biến lô, đồng bộ PLAN, TRACKING, `docs/TRACKING.md`, nháp nợ, tổng kết | mọi task | 5.15; mục 10 | KTL-01…KTL-08 | `[CHỜ Đại]` `[CHỜ staging]` `[ĐỒNG BỘ TL]` | 4,5 | ĐB |

**Tổng 37,5 giờ.**

### 6.3 File dùng chung và file của module khác, cách tránh xung đột

| File | Ai cùng chạm | Task | Cách |
|---|---|---|---|
| `apps/api/src/app.module.ts` | chat B1, P4 | P1 | một dòng `import`, một phần tử; rebase khi trùng |
| `apps/api/src/config/env.validation.ts`, `.env.example` | chat P3 | P1 | khối biến `AI_…` riêng ở **cuối**; báo Trung |
| `commitlint.config.cjs`, `AGENTS.md` (danh sách scope) | chat P1 | P1 | thêm đúng một từ; gộp sau PR chat nếu chat vào trước |
| `docs/adr/` | chat P3, P4 | P1 | lấy số kế tiếp **lúc làm** |
| `apps/api/src/search/search.module.ts` | search (Đại) | B2 | PR nhỏ riêng một dòng `exports`; chạy test search |
| `apps/web/src/router/root-layout.tsx` | ít ai chạm (chat sửa `role-nav`, `role-routes`, `role-shells`) | F1 | chỉ thêm một component; chạy ca router |
| `apps/api/package.json` | chat P4 | X2 | một script `chatbot:eval`; **không thêm phụ thuộc** |
| `docs/features/{reschedule,chat,notification}/*`, `docs/database/*` | cửa sổ khác | — | **không sửa** |
| `docs/TECH_DEBT.md`, `AI_USAGE_LOG.md` | mọi người | mỗi PR | **phiên lập kế hoạch này không sửa**; đối chiếu số trên `origin/main` lúc ghi |

### 6.4 Ước giờ, Iteration và metric P1 (Iteration một tuần; Q12: 20 giờ mỗi tuần cho chatbot)

| Iteration | Task (giờ) | Giờ | Ghi chú |
|---|---|---|---|
| **8** (01/12 đến 07/12) | P1 5 · B1 4 · B2 5 · X1 3 · B4 3,5 | **20,5** | đủ nền, an toàn, đối chiếu, gợi ý; X1 cần khoá của Đại ngay đầu tuần sau B2 |
| **9** (08/12 đến 14/12) | B3 3,5 · F1 5,5 · F2 3,5 · X2 4,5 | **17** | demo được cuối tuần; dư khoảng 3 giờ |
| **10** (15/12 đến 21/12) | phần trượt, sửa theo review, KTL trên staging | dự phòng ≤ 20 | Iteration 9, 10 nếu chưa có trong Project: việc của Đại |
| **Tổng** | | **37,5** | |

**Giờ ước cho việc LẬP KẾ HOẠCH này:** khoảng **5 giờ** `[đề xuất]` (đọc nguồn, mã và tài liệu nhà cung cấp 2,5; hỏi và đối chiếu 1; viết PLAN, TRACKING, nháp 1,5), cộng khoảng 1 giờ review mỗi người.

**Vì sao vượt mốc 25 đến 35 giờ:** (1) hai nhà cung cấp với hai hình dạng yêu cầu khác nhau, mỗi cái cần fixture; (2) phần an toàn, che định danh và đối chiếu không được cắt; (3) Q10 giữ công thức xếp hạng và chọn ngày, ca. **Cách cắt về 35 giờ hoặc thấp hơn** (Đại quyết; không cắt an toàn): bỏ chọn ngày và ca, chỉ ngày sớm nhất (đảo một phần Q10: −2 giờ); bỏ gợi ý nhanh và che tên tự giới thiệu (−0,5); bộ câu hỏi 20 câu (−0,5); không hiện khung trong cổng Bệnh nhân (đảo Q14: −0,5). Cộng −3,5 giờ, còn **34 giờ**.

**Metric P1 của bản cam kết** (số issue đóng trên số issue các nhóm đã cam kết, ngưỡng 90% tại **07/12/2026**; số 23/11: 264/289): scope này thêm 10 issue (9 task và Epic). Nếu đưa chatbot vào mẫu số mà tới 07/12 các nhóm khác **không đóng thêm** issue nào và chatbot đóng 5 task của Iteration 8: (264 + 5) / (289 + 10) = **89,97%**, dưới ngưỡng. Nếu các nhóm A đến E đóng hết: (289 + 5) / 299 = 98,3%. **Đề xuất khi chốt 27/11:** ghi chatbot là chức năng cam kết với **mốc riêng 14/12**, P1 ngày 07/12 tính trên nhóm A đến E; hoặc chỉ gộp khi chắc phần còn lại đóng đủ.

### 6.5 Phương án tối thiểu khả thi (CHÍNH) và Phương án đầy đủ (làm sau)

**Phương án tối thiểu khả thi — đủ để demo và cam kết (đây là kế hoạch ở 6.2; Q9):**

| Mục | Nội dung |
|---|---|
| Task | P1, B1, B2, B3, B4, F1, F2, X1, X2 (9 task) |
| Giờ | **37,5** (cắt còn 34 theo 6.4) |
| Có | khung chat công khai và cổng Bệnh nhân; banner và đồng ý; luật khẩn cấp trước AI; từ chối chẩn đoán, kê đơn; che định danh; Groq → Gemini → câu dựng sẵn; đối chiếu tất định; ánh xạ chuyên khoa; gợi ý bác sĩ và giờ trống thật theo công thức, chuyển Đặt lịch; giới hạn tốc độ; bộ 30 câu và metric N6, CB1, CB2 |
| Bị cắt | Ollama; streaming; lưu hội thoại; dữ liệu tài khoản; bài viết; embedding; thống kê; nhiều tiến trình; chạy bộ câu hỏi tự động trong CI |
| Rủi ro chính | R2 (hạn mức), R3 (điều khoản), R4 và R5 (đối chiếu), R11 (lịch) |
| Cam kết đề xuất | N6 100%, CB1 100%, CB2 100%; mốc 14/12 |

**Phương án đầy đủ — "làm sau nếu còn giờ", không tạo issue:** thêm lớp Ollama cục bộ làm đường riêng tư (+3 giờ, thêm RAM và ảnh Docker; phải đo lại), lưu hội thoại ẩn danh để đánh giá (+8 giờ, hai bảng mới và đồng bộ ba file `docs/database/*`, phải hỏi lại), thẻ tóm tắt tài khoản ở trình duyệt (+6), nguồn bài viết sau khi có module (+5), bộ 80 câu (+3). Tổng thêm khoảng **25 giờ**, cả scope khoảng **62,5 giờ**; cắt khỏi phương án này trước tiên: lưu hội thoại.

### 6.6 Thông tin để sinh issue (**KHÔNG tạo issue lúc này**: Đại tự chạy script sau khi PR tài liệu merge)

Mỗi task một issue; nhãn `module:chatbot` (**chưa có** trong repo; script tạo) cộng `backend`, `frontend` (task web: `frontend`; task cần đồng bộ tài liệu thêm `docs-sync`; X1, X2 thêm `testing` và không gắn `backend`; P1 thêm `infra`); milestone `chatbot` (**chưa có**; script tạo); giao `MaxTrann` (người làm), review `junUTE` (Trung review mọi PR của scope); Epic `[chatbot] Epic · Trợ lý AI (scope #12): hỏi đáp an toàn và gợi ý đặt lịch` (nhãn `epic`, `module:chatbot`) gom mọi task; Iteration theo 6.4; phụ thuộc theo cột "Phụ thuộc" ở 6.2. B2 có hai PR (PR nhỏ export ở search dùng `Refs`, rồi PR chính đóng issue). Tiêu đề issue dạng `[chatbot] <mã> · <tên> (<backend|frontend|docs|testing>)` (≤ 100 ký tự), tiêu đề PR ≤ 100 ký tự và `Closes #<issue>` ở thân PR (Epic dùng `Refs`). Khuôn thân issue theo issue chat #711 (đọc bằng `gh issue view 711`): `## Mô tả`, `## Truy vết`, `## Phụ thuộc`, `## Lưu ý` (thẻ trong PLAN; Iteration, giờ, mức kiểm; **Người làm: `MaxTrann`; người review: `junUTE`**; tiêu đề PR gợi ý; "Mã task trùng tên với task của `booking`, `reschedule`, `notification`, `chat`: khi nhắc ngoài PLAN này, viết chatbot B2"; "Figma chỉ là bản phác thảo"; "Không dán khoá API hay câu hỏi thật của người dùng"), `## Test case liên quan` (kèm "Danh sách đầy đủ và kết quả mong đợi: `docs/features/chatbot/PLAN.md` mục 7."), `## Đóng khi` (ô riêng ở bảng dưới, rồi bốn ô chuẩn: PR được người còn lại review và squash merge, tiêu đề theo Conventional Commits ≤ 100 ký tự, `Closes #<issue>`; test case đã chạy và ghi vào `docs/features/chatbot/TRACKING.md`; tài liệu đồng bộ đã cập nhật trong cùng PR; nếu có dùng AI đã ghi `AI_USAGE_LOG.md` hay `TRUNG_AI_USAGE_LOG.md`, không dòng `Co-Authored-By` của AI), dòng cuối: nguồn `docs/features/chatbot/PLAN.md`, task `<mã>`; thuộc Epic.

Nhãn `blocked` (gỡ khi điều kiện có): **X1**: `[CHỜ Đại]` (khoá Groq và Gemini của Đại); **X2**: `[CHỜ Đại]` (khoá, duyệt chấm tay; phần staging `[CHỜ staging]` ghi hoãn nếu chưa có). Q1 đến Q16 đã được Đại trả lời trực tiếp 26/11/2026; T1 đến T11 (4.3) đã được phiên kiểm duyệt kỹ thuật cùng ngày.

| ID | Tiêu đề issue | Tiêu đề PR (`<loại>(<scope>): …`) | Iter. | "Đóng khi" (ngoài bốn ô chuẩn) |
|---|---|---|---|---|
| P1 | `[chatbot] P1 · Nền Trợ lý AI: cấu hình, adapter Groq, Gemini và chuỗi dự phòng (backend)` | `feat(chatbot): thêm adapter Groq, Gemini và chuỗi dự phòng có hạn chót (chatbot P1)` | 8 | HDA-01…HDA-15, CFG-01…CFG-04 Pass; đột biến 3 đến 6 bị bắt; không biến khoá nào có giá trị trong repo hay CI; ADR viết xong |
| B1 | `[chatbot] B1 · Luật an toàn, che định danh, câu dựng sẵn và giới hạn tốc độ (backend)` | `feat(chatbot): thêm luật an toàn, che định danh và giới hạn tốc độ (chatbot B1)` | 8 | ATY-01…ATY-08, RTU-01…RTU-05, GHT-01…GHT-05, GHT-07 Pass; đột biến 7, 8 bị bắt; Đại đã duyệt danh sách từ khoá |
| B2 | `[chatbot] B2 · Ngữ cảnh công khai và đối chiếu câu trả lời với dữ liệu thật (backend)` | `feat(chatbot): thêm ngữ cảnh công khai và đối chiếu đầu ra với dữ liệu thật (chatbot B2)` | 8 | PR export (`refactor(search): export dịch vụ bác sĩ công khai (chatbot B2)`) merge trước, test search không sửa; NGC-01…NGC-06, DCR-01…DCR-12, ANX-01…ANX-03, CPI-03 Pass; đột biến 9 đến 11 bị bắt |
| X1 | `[chatbot] X1 · Đo thật độ trễ, đầu ra, ánh xạ và hạn mức của nhà cung cấp AI (testing)` | `test(chatbot): đo thật độ trễ, đầu ra và hạn mức của nhà cung cấp AI (chatbot X1)` | 8 | M1 đến M7 có số ở TRACKING mục 6; tiêu chí không đổi sau khi thấy số; Đại đã xem số; không khoá hay câu trả lời chứa dữ liệu thật trong repo |
| B3 | `[chatbot] B3 · API hỏi đáp của Trợ lý AI (backend)` | `feat(chatbot): thêm API hỏi đáp của Trợ lý AI (chatbot B3)` | 9 | TLA-01…TLA-13, ANX-04, RTU-06, RTU-07, CPI-01, CPI-02, GHT-06 Pass; đột biến 1, 2, 12 bị bắt |
| B4 | `[chatbot] B4 · API gợi ý bác sĩ và khung giờ trống theo chuyên khoa (backend)` | `feat(chatbot): thêm API gợi ý bác sĩ và khung giờ trống theo chuyên khoa (chatbot B4)` | 8 | GOI-01…GOI-10 Pass; trên MySQL thật; không trả học vị hay điểm xếp hạng |
| F1 | `[chatbot] F1 · Khung chat Trợ lý AI: banner, đồng ý, hội thoại và lỗi (frontend)` | `feat(web): thêm khung chat Trợ lý AI ở trang công khai và cổng Bệnh nhân (chatbot F1)` | 9 | WTL-01…WTL-10 Pass; đột biến web bốn loại bị bắt |
| F2 | `[chatbot] F2 · Gợi ý đặt lịch trong khung chat và chuyển sang Đặt lịch (frontend)` | `feat(web): thêm gợi ý đặt lịch trong khung chat Trợ lý AI (chatbot F2)` | 9 | WTL-11…WTL-14 Pass; khách chọn giờ, đăng nhập rồi quay lại đúng bước 4 |
| X2 | `[chatbot] X2 · Bộ câu hỏi chuẩn, kiểm tay, đột biến và tổng kết Trợ lý AI (testing)` | `test(chatbot): thêm bộ câu hỏi chuẩn và tổng kết kiểm tay Trợ lý AI (chatbot X2)` | 9 | KTL-01…KTL-08 có kết quả thật; 30 câu đã chạy, N6, CB1, CB2 đạt; 12 đột biến và bốn loại web bị bắt; `docs/TRACKING.md` một dòng; nháp nợ gửi Đại; mục 10 đạt |

**Nhãn Epic:** `[chatbot] Epic · Trợ lý AI (scope #12)` gom 9 issue; không đóng khi chưa đạt mục 10.

## 7. Test case dự kiến

Loại: **U** đơn vị (không DB), **I** tích hợp trên MySQL thật (`*.int-spec.ts`), **E** e2e qua `AppModule`, **W** giao diện (Vitest và happy-dom), **B** trình duyệt (kiểm tay). Mỗi test ghi mã ở tên ca (`it('HDA-05: …')`). Nhà cung cấp luôn là provider giả, transport giả hay fixture; một ca chặn mọi `fetch` ra ngoài trong e2e. Đồng hồ giả cho ca thời gian; ca ngày giờ chạy dưới cả `TZ=UTC` và `TZ=Asia/Ho_Chi_Minh`. **Trạng thái:** xem TRACKING mục 2 (28/11/2026: 103 trên 111 mã đã chạy; KTL-01 đến KTL-08 mới một phần, ở giao diện với API giả).

### 7.1 Chuỗi dự phòng và hợp đồng nhà cung cấp (HDA, 2.4.76) — P1

| Mã | Loại | Kịch bản | Kết quả mong đợi |
|---|---|---|---|
| HDA-01 | U | Groq trả đúng | dùng câu của Groq; Gemini không bị gọi |
| HDA-02 | U | Groq hết giờ hai lần | Gemini được gọi một lần; kết quả của Gemini |
| HDA-03 | U | Groq 5xx rồi đúng ở lần thử lại | đúng hai lời gọi Groq; không cooldown |
| HDA-04 | U | Groq trả chữ không phải JSON, rồi sai enum | thử lại một lần rồi chuyển Gemini |
| HDA-05 | U | Groq 429 | **không** thử lại; sang Gemini; Groq cooldown 60 giây |
| HDA-06 | U | Groq 401 hay 404 | không thử lại; cảnh báo tên lớp và mã HTTP, không có khoá; sang Gemini |
| HDA-07 | U | cả hai lớp hỏng | kết quả "dự phòng", không ném lỗi |
| HDA-08 | U | cả hai lớp treo (đồng hồ giả) | tổng ≤ 20 giây; lần thử cuối chỉ chờ phần còn lại; còn dưới 2 giây không thử |
| HDA-09 | U | sau lỗi, trong và sau 60 giây; sau thành công | trong 60 giây lớp bị bỏ qua, sau đó được gọi lại; thành công không đặt cooldown |
| HDA-10 | U | một lớp, rồi cả hai chưa cấu hình; `AI_ENABLED=false` | bỏ qua; cả hai ⇒ dự phòng ngay, không lời gọi nào |
| HDA-11 | U | chạm trần toàn cục của Groq | bỏ qua Groq, không cooldown; sang Gemini |
| HDA-12 | U | yêu cầu gửi Groq (fixture) | đúng URL, `Bearer`, model từ cấu hình, `json_schema` strict, `reasoning_effort`; khoá không ở URL |
| HDA-13 | U | yêu cầu gửi Gemini (fixture) | đúng URL, `x-goog-api-key`, `store: false`, `response_format` có lược đồ; khoá không ở query |
| HDA-14 | U | đọc phản hồi thành công mẫu của hai lớp | lấy đúng chuỗi JSON |
| HDA-15 | U | phản hồi lỗi mẫu (429, 400, 5xx, thân lạ) | đổi đúng loại hỏng; thân lỗi không vào thông điệp hay log |

### 7.2 Cấu hình (CFG) — P1

| Mã | Loại | Kịch bản | Kết quả mong đợi |
|---|---|---|---|
| CFG-01 | U | không đặt biến | mặc định như 5.13 |
| CFG-02 | U | không có khoá nào | cấu hình hợp lệ, ứng dụng khởi động |
| CFG-03 | U | `NODE_ENV=test` kèm khoá giả | nhà máy **không** tạo provider thật |
| CFG-04 | U | giá trị sai (thời gian âm, tổng ≥ 45 giây, URL không `https`); model cấu hình nằm trong danh sách đã ngừng; log có khoá | giá trị sai thì khởi động báo **tên** biến; model đã ngừng thì khởi động được và có cảnh báo; khoá bị che trong log |

### 7.3 An toàn y tế (ATY) — B1

| Mã | Loại | Kịch bản | Kết quả mong đợi |
|---|---|---|---|
| ATY-01 | U | bảng mỗi cụm từ khẩn cấp trong một câu | nhận khẩn cấp |
| ATY-02 | U | cùng bảng gõ không dấu, viết hoa, nhiều khoảng trắng | nhận khẩn cấp |
| ATY-03 | U | câu phủ định ("tôi không khó thở") | vẫn nhận (hành vi đã chốt, ghi chú trong ca) |
| ATY-04 | U | bảng câu thường (hỏi giá, giờ, đặt lịch, "ngạt mũi nhẹ") | không nhận khẩn cấp |
| ATY-05 | U | bảng câu chẩn đoán, kê đơn | ngoài phạm vi |
| ATY-06 | U | câu gần giống nhưng hợp lệ | không bị từ chối |
| ATY-07 | U | câu hỏi lịch, ví của mình | loại tài khoản |
| ATY-08 | U | 500 và 501 điểm mã (có ký tự ghép, emoji), chỉ khoảng trắng, ký tự điều khiển | 500 nhận, 501 từ chối, rỗng từ chối, ký tự điều khiển bị bỏ |

### 7.4 Quyền riêng tư (RTU) — B1, B3

| Mã | Loại | Kịch bản | Kết quả mong đợi |
|---|---|---|---|
| RTU-01 | U | email trong câu | thay "[đã ẩn]" |
| RTU-02 | U | số điện thoại nhiều dạng (liền, cách, chấm, `+84`) | che |
| RTU-03 | U | CCCD 12 số, CMND 9 số, mã lịch, ngày sinh dd/mm/yyyy; số ngắn ("30 phút") | che bốn loại đầu, giữ số ngắn |
| RTU-04 | U | định danh nằm trong lịch sử | che cả lịch sử |
| RTU-05 | U | "tôi tên là …", "tên em là …" | che phần tên |
| RTU-06 | E | gọi API với câu chứa chuỗi đánh dấu, cả nhánh thành công, lỗi lớp và lỗi 500 cưỡng bức; bắt log | log không chứa câu hỏi, câu trả lời, ngữ cảnh; có mã và thời gian |
| RTU-07 | E | provider giả ghi lại yêu cầu nhận được khi gọi kèm header `Authorization` | không có token, IP, thông tin tài khoản; định danh đã che |

### 7.5 Giới hạn tốc độ (GHT) — B1, B3

| Mã | Loại | Kịch bản | Kết quả mong đợi |
|---|---|---|---|
| GHT-01 | U | câu thứ 6 trong 60 giây | bị chặn kèm số giây chờ |
| GHT-02 | U | sau khi cửa sổ trượt qua | được gửi lại |
| GHT-03 | U | câu thứ 51 trong 24 giờ | bị chặn |
| GHT-04 | U | hai IP | đếm riêng |
| GHT-05 | U | 4 lời gọi đồng thời; một lời gọi ném lỗi | lời thứ 4 bị từ chối; suất được trả sau lỗi |
| GHT-06 | E | đã chạm trần rồi gửi câu khẩn cấp | nhận câu khẩn cấp (200), không gọi AI |
| GHT-07 | U | rất nhiều IP rồi qua 24 giờ | bản đồ không vượt trần, mục hết hạn bị dọn |

### 7.6 Ngữ cảnh (NGC) — B2

| Mã | Loại | Kịch bản | Kết quả mong đợi |
|---|---|---|---|
| NGC-01 | I | chuyên khoa ngừng, bác sĩ bị khoá hay chờ kích hoạt | không có trong ngữ cảnh |
| NGC-02 | I | dịch vụ không chi nhánh nào cung cấp | không có |
| NGC-03 | U | từ khoá không dấu, tên bác sĩ, chuyên khoa, chi nhánh | chọn đúng, tối đa 8 bác sĩ, ưu tiên chi nhánh đang chọn |
| NGC-04 | U | danh mục lớn vượt trần ký tự | cắt theo thứ tự mô tả rồi bác sĩ; phần nền còn |
| NGC-05 | U | hai lần trong và sau 60 giây | dùng đệm rồi dựng lại; chỉ một bản |
| NGC-06 | I | dò trường cá nhân (email, SĐT, ngày sinh, địa chỉ bác sĩ, học vị) và chính sách | không có; số của chính sách ở dạng chỗ giữ |

### 7.7 Đối chiếu đầu ra (DCR) — B2

| Mã | Loại | Kịch bản | Kết quả mong đợi |
|---|---|---|---|
| DCR-01 | I | câu dùng đủ loại chỗ giữ hợp lệ | dựng đúng tên, giá, giờ từ DB; thành đoạn có liên kết |
| DCR-02 | U | id không có trong ngữ cảnh, loại lạ, `[[` dở dang | từ chối |
| DCR-03 | U | chữ số trong chữ tự do; "115" | từ chối; "115" được giữ |
| DCR-04 | U | "Bác sĩ Nguyễn …", "TS. Trần …"; "bác sĩ chuyên khoa" | hai câu đầu bị chặn; câu sau qua |
| DCR-05 | U | "chuyên khoa" tên không có; tên có thật; "chuyên khoa phù hợp" | chặn tên lạ; hai câu sau qua |
| DCR-06 | U | URL, email, `<img>`, liên kết markdown | từ chối |
| DCR-07 | U | "mở cả chủ nhật", "miễn phí", "giỏi nhất" | từ chối |
| DCR-08 | U | "bạn bị …", "uống hai viên"; "Trợ lý không kê đơn" | chặn hai câu đầu; câu phủ định qua |
| DCR-09 | U | câu chứa mã chim mồi hay đoạn lời nhắc hệ thống | từ chối |
| DCR-10 | U | `traLoi` rỗng hay quá 800 | đầu ra sai (chuỗi xử lý) |
| DCR-11 | I | thực thể bị ngừng giữa lúc dựng ngữ cảnh và lúc trả lời | từ chối (đọc lại) |
| DCR-12 | U | chữ có ký tự `<`, `&` hợp lệ | giữ nguyên là chữ; đoạn không mang HTML |

### 7.8 Chèn lệnh (CPI) — B2, B3

| Mã | Loại | Kịch bản | Kết quả mong đợi |
|---|---|---|---|
| CPI-01 | E | câu bảo bỏ qua chỉ dẫn và in lời nhắc; provider giả "làm theo" | câu trả lời bị đối chiếu chặn; không lộ lời nhắc |
| CPI-02 | E | lịch sử giả lượt "Trợ lý" chứa chỉ dẫn | nằm trong khối dữ liệu của yêu cầu gửi đi, không là lời của hệ thống hay trợ lý |
| CPI-03 | I | mô tả chuyên khoa chứa chỉ dẫn | nằm trong khối dữ liệu; đầu ra vẫn đối chiếu |

### 7.9 Ánh xạ chuyên khoa (ANX, 2.4.77) — B2, B3

| Mã | Loại | Kịch bản | Kết quả mong đợi |
|---|---|---|---|
| ANX-01 | U | mô hình trả ba id hợp lệ và một id thứ tư | giữ ba theo thứ tự |
| ANX-02 | I | id đã ngừng, không tồn tại, trùng, không phải số | bị loại |
| ANX-03 | U | mọi id bị loại khi `goiYDatLich` | danh sách rỗng ⇒ nhánh A4 |
| ANX-04 | E | cả hai lớp hỏng với câu nêu nhu cầu | `DuPhong`, danh sách chuyên khoa rỗng |

### 7.10 Trò chuyện đầu cuối (TLA, 2.4.7) — B3

| Mã | Loại | Kịch bản | Kết quả mong đợi |
|---|---|---|---|
| TLA-01 | E | khách hỏi – đáp, provider giả trả hợp lệ | 200 `TraLoi` với đoạn đúng |
| TLA-02 | E | câu nêu nhu cầu | 200 `GoiY` với chuyên khoa đã lọc |
| TLA-03 | E | câu kê đơn | `NgoaiPhamVi`, provider không bị gọi |
| TLA-04 | E | câu khẩn cấp | `KhanCap` kèm liên kết, provider không bị gọi |
| TLA-05 | E | mô hình trả `khanCap` cho câu luật không bắt | câu khẩn cấp dựng sẵn, bỏ chữ mô hình |
| TLA-06 | E | mô hình trả `ngoaiPhamVi` | câu từ chối dựng sẵn, bỏ chữ mô hình |
| TLA-07 | E | câu trả lời sai đối chiếu, kèm chuyên khoa hợp lệ | `KhongKhopDuLieu`, vẫn có thẻ chuyên khoa |
| TLA-08 | E | cả hai lớp hỏng | `DuPhong`, `coTheGuiLai` true, `tinhVaoLichSu` false |
| TLA-09 | E | nhu cầu không ánh xạ được | `KhongCoChuyenKhoa` |
| TLA-10 | E | hỏi lịch của tôi | `TaiKhoan` với hai liên kết; provider không bị gọi |
| TLA-11 | E | không token, token sai, token Lễ tân | đều 200 như khách; `Cache-Control: no-store` ở 200, 400, 429 |
| TLA-12 | E | thiếu `cauHoi`, 501 ký tự, 7 lượt lịch sử, trường lạ | 400 `DU_LIEU_KHONG_HOP_LE` |
| TLA-13 | E | vượt trần IP; hết suất đồng thời | 429 có `Retry-After`; 503 `TRO_LY_DANG_BAN` |

### 7.11 API gợi ý (GOI) — B4

| Mã | Loại | Kịch bản | Kết quả mong đợi |
|---|---|---|---|
| GOI-01 | U | bảng điểm: dưới 5 lượt, không đánh giá nào, đủ năm học vị, trần 20, hoà điểm | thứ tự đúng công thức 5.11 |
| GOI-02 | I | đổi w1, w2 trong cấu hình | thứ tự đổi theo |
| GOI-03 | E | chưa có cấu hình | 409 `HE_THONG_CHUA_CAU_HINH` |
| GOI-04 | I | không truyền ngày; hôm nay kín | chọn ngày sớm nhất còn trống trong 7 ngày (hai múi giờ) |
| GOI-05 | I | truyền ngày và ca; ngày ngoài cửa sổ | chỉ ô đúng ngày, ca; 400 `BO_LOC_KHONG_HOP_LE` |
| GOI-06 | I | ô đã đặt, đang giữ, hết hạn, nghỉ phép, chi nhánh nghỉ | không xuất hiện |
| GOI-07 | I | không còn ô nào; chuyên khoa không có bác sĩ | `bacSi` rỗng với `lyDoRong` đúng |
| GOI-08 | E | chuyên khoa ngừng, không có; lọc chi nhánh | 404; chỉ bác sĩ chi nhánh đó |
| GOI-09 | E | thân trả về | không học vị, điểm xếp hạng, email, SĐT; `no-store`; tối đa 5 bác sĩ, 6 ô |
| GOI-10 | E | thiếu `chuyenKhoaId`, `ca` lạ, trường lạ | 400 |

### 7.12 Giao diện (WTL) — F1, F2 (mức GỌN)

| Mã | Task | Kịch bản | Kết quả mong đợi |
|---|---|---|---|
| WTL-01 | F1 | khách, Bệnh nhân; Bác sĩ, Lễ tân, Quản trị viên; trang đăng nhập, đăng ký | nút hiện đúng nhóm đầu, ẩn nhóm sau |
| WTL-02 | F1 | mở lần đầu | banner đúng chữ, thông báo, ô nhập khoá tới khi bấm "Tôi hiểu" |
| WTL-03 | F1 | gửi câu, nhận đoạn có thực thể | hiện đang tải rồi chữ và liên kết đúng đích; không chèn HTML |
| WTL-04 | F1 | `DuPhong`, rồi gửi câu khác | câu A3, "Gửi lại"; lượt lỗi không nằm trong `lichSu` |
| WTL-05 | F1 | `KhanCap`, `TaiKhoan`, `NgoaiPhamVi` | `tel:115`, địa chỉ, liên kết đúng; kênh lễ tân theo trạng thái chat |
| WTL-06 | F1 | 429, 503, mất mạng, quá giờ | chữ đúng `maLoi`; giữ nội dung để gửi lại |
| WTL-07 | F1 | đổi trang, đóng mở, đăng xuất, "Xoá hội thoại" | giữ khi đổi trang; xoá khi đăng xuất hay bấm xoá |
| WTL-08 | F1 | bấm gửi hai lần nhanh; kiểm lời gọi | một lời gọi; `skipAuthToken`, `LONG_TIMEOUT_MS`, `lichSu` ≤ 6 |
| WTL-09 | F1 | bàn phím, trình đọc màn hình, 375 px | `Enter`, `Shift+Enter`, `Esc`, tiêu điểm trả về nút; toàn màn hình, không tràn ngang |
| WTL-10 | F1 | quét kho trình duyệt, URL, tiêu đề, console | không có câu hỏi hay câu trả lời |
| WTL-11 | F2 | thẻ chuyên khoa; "Chọn chuyên khoa khác" | gọi API gợi ý đúng chuyên khoa và chi nhánh đang chọn |
| WTL-12 | F2 | đổi ngày, ca; trả rỗng; 409 | mỗi thay đổi một lời gọi; A5; thẻ lỗi dẫn sang tra cứu |
| WTL-13 | F2 | bấm ô giờ khi là khách và khi là Bệnh nhân | đích `bookingInfoPath`; khách qua đăng nhập rồi về đúng bước 4 (ca router) |
| WTL-14 | F2 | `KhongCoChuyenKhoa` | chữ A4 và liên kết tra cứu |

### 7.13 Kiểm tay trình duyệt (KTL) — X2 (125 phần trăm và 375 px; không dùng DB `clinix` khi chưa được Đại đồng ý)

KTL-01 khách hỏi giờ mở cửa và giá, câu trả lời khớp dữ liệu mẫu; KTL-02 câu khẩn cấp hiện ngay, gọi được liên kết 115; KTL-03 câu xin kê đơn bị từ chối; KTL-04 nêu triệu chứng, chọn chuyên khoa, chọn ngày và ca, bấm giờ, đăng nhập, tới bước 4 đúng khung giờ; KTL-05 bỏ hết khoá: khung vẫn chạy với câu dựng sẵn, luật khẩn cấp vẫn hoạt động; KTL-06 mất mạng giữa lúc hỏi rồi gửi lại; KTL-07 125 phần trăm, 375 px, nút nổi không che nút chính; KTL-08 chỉ dùng bàn phím và trình đọc màn hình hết một lượt. Mỗi ca ghi kết quả thật vào TRACKING mục 2. Có staging thì thêm phép kiểm IP ở 5.10. **Kết quả thật (28/11/2026): TRACKING 6.9.3.** KTL-02, 03, 06, 07, 08 đạt phần giao diện với API giả, không DB; KTL-01, 04 chờ Đại (AI thật); KTL-05 thật và KTL-04b chưa kiểm được.

## 8. Đề xuất gom cụm (chỉ đề xuất — nhóm chốt)

**Cụm 1 (Iteration 8, 20,5 giờ):** P1, B1, B2, X1, B4: toàn bộ máy chủ trừ API hỏi đáp, đã đo thật. **Cụm 2 (Iteration 9, 17 giờ):** B3, F1, F2, X2: dùng được và tổng kết. Muốn thấy sớm thì làm F1 bằng API giả ngay khi P1 xong.

## 9. Quy trình bắt buộc cho mỗi PR của scope

Theo `AGENTS.md` mục 5 và `CONTRIBUTING.md`: nhánh `feat/chatbot-…` do người dùng tạo, không làm trên `main`; viết test theo mã test case rồi code; chạy `lint`, `build`, `test` (và `test:int`, `test:e2e` cho task backend) ở máy và báo kết quả **thật**; task `[ĐỒNG BỘ TL]` cập nhật tài liệu trong **cùng PR** và nhắc việc Word ở 4.6; cập nhật `docs/features/chatbot/TRACKING.md` và tick ô; biến mới vào `.env.example` **không có giá trị khoá**; lối tắt vào `docs/TECH_DEBT.md`; ghi AI log theo người dùng; **không** `git add`, `commit`, `push` do AI; tiêu đề PR là commit cuối (squash), Conventional Commits, scope `chatbot` (hoặc `web`, `search`), ≤ 100 ký tự; PR cần Trung approve và CI xanh (bảy check bắt buộc). **Không đọc, in hay chép `.env` thật; không dán khoá hay câu hỏi thật vào prompt, log, issue.**

## 10. Điều kiện hoàn thành scope

- [ ] 2.4.7 chạy đúng mọi bước và A1 đến A6 trên dữ liệu mẫu; 2.4.76 chạy đúng chuỗi đã chốt, A1, A2; 2.4.77 đúng b1 đến b4, A1, A2. *(chưa tick: chờ bộ 30 câu với nhà cung cấp thật và KTL-01, KTL-04; TRACKING mục 7)*
- [ ] Mọi mã test case ở mục 7 đã chạy hoặc ghi rõ lý do hoãn ở TRACKING mục 2 (KTL có kết quả thật). *(chưa tick: còn KTL-01, KTL-04, KTL-04b, KTL-05 thật; phần cần DB của e2e và int-spec không chạy lại ở X2; TRACKING 6.9.3)*
- [x] 12 đột biến ở 5.15 và bốn loại web đều bị ít nhất một ca bắt. *(chatbot X2, 28/11/2026: 16 trên 16 bị bắt trên main 4a22a49, 0 sống; TRACKING 6.9.2)*
- [ ] M1 đến M7 có số đo thật và kết luận; tiêu chí không đổi sau khi thấy số; model và thời gian chờ trong cấu hình đúng kết luận. *(chưa tick: M5 của Groq KHÔNG ĐẠT ở cả ba lượt, M7 còn `[cần điền]`; TRACKING 6.1)*
- [ ] Bộ 30 câu đã chạy; N6, CB1, CB2 đạt; CB3 đến CB6 ghi số thật. *(chưa tick: script, test, chạy khô và kiểm tay giao diện xong, Đại chưa chạy với nhà cung cấp thật; TRACKING 6.2)*
- [ ] Không khoá API trong repo, CI, log; không câu hỏi, câu trả lời trong log, DB, thông báo, email, nhật ký, kho trình duyệt (RTU-06, WTL-10). *(chưa tick: RTU-06 và WTL-10 mức đơn vị Pass, quét khoá hẹp sạch; e2e, log và DB thật chưa làm lại; TRACKING 6.9.4)*
- [ ] Không có khoá nào thì ứng dụng vẫn khởi động và Trợ lý trả câu dựng sẵn (CFG-02, KTL-05). *(chưa tick: CFG-02 Pass; KTL-05 thật chưa kiểm được vì không DB)*
- [ ] `docs/TRACKING.md` có một dòng; nháp nợ gửi Đại; việc sửa Word (4.6) do Đại báo xong. *(chưa tick: đã thêm một dòng nhưng số đo thật còn chờ; nợ 354 đến 356 đã ghi (357 chờ số đo thật); việc sửa Word do Đại báo xong)*
- [ ] CI xanh (bảy check), jscpd ≤ 3% (CI đo), 0 lỗi lint. *(chưa tick: CI chưa chạy cho PR này)*

## Phụ lục A. Nguyên văn 2.4.7, 2.4.76, 2.4.77 (sao chép bằng script từ `2.4_Dac_Ta_Use_Case_CLINIX.docx`, không diễn giải)

Nguồn: `D:\du_lieu\TLCN_CLINIX\2.4_Dac_Ta_Use_Case_CLINIX.docx` (file gốc, 76 use case), đọc bằng `python-docx` ngày 26/11/2026; mỗi dòng trong ô Word giữ thành một đoạn. Bản `Drive_Hien_Tai` (57 use case) không có 2.4.76 và 2.4.77 thành use case riêng; ánh xạ ở cuối phụ lục.

### 2.4.7. Use case Trò chuyện với Trợ lý AI (hỏi – đáp & gợi ý đặt lịch)

**Mô tả.**

Hỏi – đáp thời gian thực dựa trên dữ liệu công khai của hệ thống (chi nhánh, chuyên khoa, bác sĩ, dịch vụ, chính sách, bài viết), không chẩn đoán/không kê đơn y tế.

Gợi ý đặt lịch: khi người dùng nêu nhu cầu khám bệnh, Trợ lý AI ánh xạ nhu cầu sang chuyên khoa phù hợp (không chẩn đoán bệnh), rồi hệ thống gợi ý bác sĩ và khung giờ còn trống thực tế trong chuyên khoa đó để người dùng chọn.

**Tác nhân kích hoạt.**

Khách vãng lai, Bệnh nhân.

**Tiền điều kiện.**

Không yêu cầu đăng nhập cho nhóm hỏi – đáp và xem gợi ý; yêu cầu đã đăng nhập với vai trò Bệnh nhân (đã xác minh email) để tiếp tục vào luồng đặt lịch từ khung giờ gợi ý.

Dịch vụ AI (Gemini/Groq/Ollama) đang hoạt động.

**Hậu điều kiện.**

Thành công (hỏi – đáp): Trợ lý AI trả lời câu hỏi dựa trên dữ liệu công khai hiện có (hoặc dữ liệu tài khoản của chính mình nếu là Bệnh nhân, qua API có phân quyền); không có thay đổi dữ liệu nghiệp vụ (đặt lịch, thanh toán...).

Thành công (gợi ý đặt lịch): Người dùng nhận được danh sách chuyên khoa/bác sĩ/khung giờ còn trống phù hợp nhu cầu; nếu là Bệnh nhân đã đăng nhập và chọn một khung giờ, hệ thống chuyển sang use case "Đặt lịch khám" với thông tin đã chọn sẵn (chuyên khoa, bác sĩ, khung giờ); Trợ lý AI không tự giữ chỗ hay xác nhận lịch hộ người dùng.

Thất bại: Không có giữ chỗ hay đặt lịch nào phát sinh ngoài ý muốn người dùng; hệ thống hiển thị giới hạn/lỗi tương ứng (xem Luồng thay thế).

**Các bước thực hiện.**

(1) Người dùng mở khung chat Trợ lý AI; hệ thống hiển thị banner cảnh báo: chỉ tư vấn sơ bộ, không chẩn đoán, không kê đơn, không thay thế khám trực tiếp.

(2) Người dùng nhập câu hỏi.

(3) Hệ thống gửi câu hỏi cùng ngữ cảnh dữ liệu công khai liên quan (chi nhánh, chuyên khoa, bác sĩ, dịch vụ, chính sách, bài viết) tới Dịch vụ AI (use case "Trả lời câu hỏi cho Trợ lý AI Hỏi – đáp").

(4) Dịch vụ AI trả về câu trả lời.

(5) Hệ thống đối chiếu các dữ liệu xác định trong câu trả lời (tên bác sĩ, chuyên khoa, giá, khung giờ...) với dữ liệu thật trong hệ thống trước khi hiển thị.

(6) Hệ thống hiển thị câu trả lời cho người dùng.

(7) (Nhánh mở rộng — gợi ý đặt lịch, extend có điều kiện "người dùng nêu nhu cầu khám bệnh / yêu cầu gợi ý đặt lịch") Nếu người dùng nêu nhu cầu khám bệnh, hệ thống gửi yêu cầu ánh xạ nhu cầu sang chuyên khoa tới Dịch vụ AI (use case "Ánh xạ nhu cầu sang chuyên khoa cho gợi ý đặt lịch") — không chẩn đoán bệnh, chỉ gợi ý nhóm chuyên khoa phù hợp.

(8) Hệ thống hiển thị (các) chuyên khoa được gợi ý cho người dùng xác nhận hoặc chọn lại.

(9) Sau khi người dùng chọn chuyên khoa, hệ thống tính khung giờ khám còn trống (use case "Tính khung giờ khám còn trống", extend) cho các bác sĩ thuộc chuyên khoa đó.

(10) Hệ thống hiển thị danh sách bác sĩ và khung giờ còn trống phù hợp để người dùng chọn.

(11) Nếu người dùng là Bệnh nhân đã đăng nhập và chọn một khung giờ, hệ thống chuyển sang luồng "Đặt lịch khám" với chi nhánh/dịch vụ/bác sĩ/khung giờ đã điền sẵn từ lựa chọn này.

**Luồng thay thế.**

A1. Câu hỏi ngoài phạm vi hoặc mang tính khẩn cấp y tế

4a. Dịch vụ AI hoặc hệ thống nhận diện câu hỏi vượt phạm vi tư vấn (yêu cầu chẩn đoán/kê đơn cụ thể) hoặc có dấu hiệu khẩn cấp.

4b. Hệ thống trả lời nêu rõ giới hạn của Trợ lý AI, hướng người dùng đến bác sĩ/cơ sở y tế gần nhất, hoặc gợi ý dùng kênh "Nhắn tin với lễ tân" nếu là tình huống cấp cứu.

4c. Use case tiếp tục ở trạng thái chờ câu hỏi mới — không kết thúc hội thoại.

A2. Dữ liệu xác định trong câu trả lời AI không khớp dữ liệu thật

5a. Hệ thống đối chiếu phát hiện AI trả lời sai lệch hoặc không có dữ liệu tương ứng (ví dụ bác sĩ/dịch vụ không tồn tại).

5b. Hệ thống dùng phản hồi dự phòng (không hiển thị thông tin sai), thông báo chưa đủ dữ liệu để trả lời chính xác phần đó.

A3. Dịch vụ AI không phản hồi hoặc lỗi

3a. Dịch vụ AI quá thời gian chờ hoặc trả lỗi.

3b. Hệ thống hiển thị thông báo "Trợ lý AI hiện không phản hồi, vui lòng thử lại sau" và không tính đây là câu hỏi đã được trả lời.

3c. Người dùng thử gửi lại — quay lại bước 3, hoặc chuyển sang kênh khác (Nhắn tin với lễ tân/bác sĩ nếu đã đăng nhập) — use case kết thúc nếu người dùng rời khung chat.

A4. Không có chuyên khoa nào phù hợp nhu cầu mô tả

7a. Dịch vụ AI không ánh xạ được nhu cầu sang chuyên khoa nào đang có trong hệ thống.

7b. Hệ thống thông báo chưa xác định được chuyên khoa phù hợp, gợi ý người dùng mô tả rõ hơn hoặc tự chọn chuyên khoa qua "Tra cứu bác sĩ và lịch khám".

A5. Không còn khung giờ trống cho chuyên khoa/khoảng thời gian mong muốn

9a. Hệ thống tính toán và không tìm được khung giờ trống nào phù hợp.

9b. Hệ thống thông báo hiện chưa có khung giờ trống phù hợp, gợi ý người dùng nới khoảng thời gian hoặc chọn chuyên khoa/bác sĩ khác.

A6. Người dùng chưa đăng nhập chọn một khung giờ gợi ý

10a. Hệ thống phát hiện người dùng đang ở vai trò Khách vãng lai (chưa đăng nhập).

10b. Hệ thống giữ tạm lựa chọn (chuyên khoa/bác sĩ/khung giờ) trong sessionStorage của trình duyệt (phía client, mất khi đóng tab — không lưu ở backend/Redis), chuyển hướng người dùng tới Đăng nhập hoặc Đăng ký tài khoản trong cùng tab.

10c. Sau khi đăng nhập/đăng ký thành công (cùng tab), hệ thống đọc lại sessionStorage để khôi phục lựa chọn và tiếp tục vào luồng "Đặt lịch khám"; nếu người dùng đóng tab hoặc không hoàn tất đăng nhập/đăng ký, lựa chọn mất theo sessionStorage, use case kết thúc.

### 2.4.76. Use case Trả lời câu hỏi cho Trợ lý AI Hỏi – đáp

**Mô tả.**

Sinh câu trả lời cho Trợ lý AI dựa trên dữ liệu công khai do hệ thống CLINIX cung cấp; không chẩn đoán, không kê đơn. Dùng kiến trúc dự phòng nhiều lớp: Gemini (gemini-2.0-flash) → Groq (llama-3.1-8b-instant) → Ollama cục bộ (qwen2.5:3b) → phản hồi dựng sẵn; mỗi lớp timeout 6–8 giây, thử lại 1 lần, cooldown 60 giây; không fine-tune.

**Tác nhân kích hoạt.**

Dịch vụ AI (Gemini / Groq / Ollama).

**Tiền điều kiện.**

Hệ thống CLINIX gửi một câu hỏi kèm ngữ cảnh dữ liệu công khai tới Dịch vụ AI (từ use case "Trò chuyện với Trợ lý AI").

**Hậu điều kiện.**

Thành công: Dịch vụ AI trả về câu trả lời dựa trên ngữ cảnh cung cấp.

Thất bại (cả 3 lớp AI đều lỗi/timeout): Hệ thống CLINIX nhận phản hồi dựng sẵn thay thế.

**Các bước thực hiện.**

(1) Hệ thống CLINIX gửi câu hỏi kèm ngữ cảnh dữ liệu công khai tới lớp Gemini (gemini-2.0-flash).

(2) Nếu Gemini phản hồi trong thời gian timeout (6–8 giây): Dịch vụ AI trả câu trả lời về hệ thống CLINIX — use case kết thúc.

(3) Nếu Gemini lỗi hoặc timeout: hệ thống thử lại Gemini 1 lần; nếu vẫn lỗi, chuyển sang lớp Groq (llama-3.1-8b-instant).

(4) Áp dụng cùng cơ chế timeout/thử lại 1 lần cho Groq; nếu vẫn lỗi, chuyển sang Ollama cục bộ (qwen2.5:3b).

(5) Áp dụng cùng cơ chế cho Ollama; nếu vẫn lỗi, hệ thống trả về phản hồi dựng sẵn (không gọi AI nữa) cho hệ thống CLINIX.

**Luồng thay thế.**

A1. Cả 3 lớp AI đều lỗi/timeout

5a. Cả Gemini, Groq, Ollama đều không phản hồi thành công sau khi đã thử lại theo quy định.

5b. Dịch vụ AI trả về phản hồi dựng sẵn (không chẩn đoán, không kê đơn, nêu giới hạn) cho hệ thống CLINIX.

A2. Một lớp AI đang trong thời gian cooldown khi có yêu cầu mới

\*a. Hệ thống phát hiện lớp AI đó đang trong cooldown 60 giây kể từ lần dùng trước.

\*b. Hệ thống bỏ qua lớp đó, chuyển thẳng sang lớp kế tiếp trong chuỗi dự phòng.

### 2.4.77. Use case Ánh xạ nhu cầu sang chuyên khoa cho gợi ý đặt lịch

**Mô tả.**

Ánh xạ nhu cầu khám bệnh bằng ngôn ngữ tự nhiên của người dùng sang danh sách chuyên khoa phù hợp (không chẩn đoán bệnh), dùng chung kiến trúc dự phòng và ràng buộc timeout/thử lại/cooldown như use case "Trả lời câu hỏi cho Trợ lý AI Hỏi – đáp". Kết quả được đối chiếu với danh mục chuyên khoa thật của hệ thống, chuyên khoa không tồn tại thì bị loại.

**Tác nhân kích hoạt.**

Dịch vụ AI (Gemini / Groq / Ollama).

**Tiền điều kiện.**

Hệ thống CLINIX gửi mô tả nhu cầu khám bệnh của người dùng tới Dịch vụ AI (từ nhánh gợi ý đặt lịch của use case "Trò chuyện với Trợ lý AI").

**Hậu điều kiện.**

Thành công: Dịch vụ AI trả về danh sách tên chuyên khoa gợi ý; hệ thống CLINIX đối chiếu với danh mục chuyên khoa thật, loại bỏ chuyên khoa không tồn tại, trả phần còn lại cho use case gọi.

Thất bại: Cả 3 lớp AI đều lỗi, hoặc không chuyên khoa nào khớp danh mục thật; hệ thống CLINIX nhận danh sách rỗng, use case gọi xử lý theo luồng "không có chuyên khoa phù hợp".

**Các bước thực hiện.**

(1) Hệ thống CLINIX gửi mô tả nhu cầu khám bệnh (ngôn ngữ tự nhiên) tới Dịch vụ AI, theo cùng kiến trúc dự phòng (Gemini → Groq → Ollama → rỗng) và ràng buộc timeout/thử lại/cooldown như use case "Trả lời câu hỏi cho Trợ lý AI Hỏi – đáp".

(2) Dịch vụ AI trả về danh sách tên chuyên khoa được ánh xạ (không chẩn đoán bệnh cụ thể).

(3) Hệ thống CLINIX đối chiếu từng tên chuyên khoa với danh mục chuyên khoa thật đang Đang hoạt động.

(4) Hệ thống loại bỏ các tên không khớp danh mục thật, trả phần còn lại cho use case gọi.

**Luồng thay thế.**

A1. Không có chuyên khoa nào trong kết quả AI khớp danh mục thật

3a. Hệ thống đối chiếu và không tìm thấy chuyên khoa nào trong kết quả AI tồn tại trong danh mục thật.

3b. Hệ thống trả danh sách rỗng cho use case gọi xử lý (luồng "không có chuyên khoa phù hợp" của use case "Trò chuyện với Trợ lý AI").

A2. Cả 3 lớp AI đều lỗi/timeout

\*a. Cả Gemini, Groq, Ollama đều không phản hồi thành công.

\*b. Dịch vụ AI trả danh sách rỗng (không có phản hồi dựng sẵn cho việc ánh xạ chuyên khoa, khác với hỏi-đáp) cho hệ thống CLINIX.

### Ánh xạ sang bản `Drive_Hien_Tai` (use case 2.4.7 của bản đó; so từng dòng ngày 26/11/2026)

| File gốc | Bản `Drive_Hien_Tai` 2.4.7 | Khác chữ |
|---|---|---|
| 2.4.7 b1, b2, b4, b5, b6, b8, b10, b11; A1 đến A6 | cùng số | không |
| 2.4.7 b3, b7 | b3, b7 | trỏ "Dịch vụ AI xử lý theo các bước (12)–(14)" và "(15)–(17)" thay tên use case hệ thống |
| 2.4.7 b9 | b9 | trỏ cách tính ở "Tra cứu bác sĩ và lịch khám" b11 đến b14 thay "Tính khung giờ khám còn trống" |
| 2.4.76 MT, b1, b2, b3 | b12, b13 | gộp câu, cùng nội dung |
| 2.4.76 b4, b5 | b14 | gộp |
| 2.4.76 A1, A2 | A7, A8 | đánh số bước 14a, 14b |
| 2.4.77 b1, b2 | b15, b16 | không đổi nghĩa |
| 2.4.77 b3, b4, A1 | b17 (rỗng thì theo A4) | gộp |
| 2.4.77 A2 | A9 | thêm "xử lý như A4" |

## Phụ lục B. Nguyên văn các use case và tài liệu liên quan (chỉ phần chạm tới Trợ lý; sao chép bằng script)

### 2.4.60. Use case Tính khung giờ khám còn trống

**Mô tả.**

Tác vụ tính toán dùng chung, xác định danh sách khung giờ khám còn trống của một bác sĩ theo dịch vụ đã chọn, dựa trên lịch làm việc theo chi nhánh và lịch hoạt động theo thứ của chi nhánh (chi nhánh nghỉ ngày nào thì không có khung giờ nào ngày đó; ca sáng chỉ có khung giờ trong khoảng nhận khám buổi sáng, ca chiều trong khoảng buổi chiều, mỗi khung giờ cộng thời lượng dịch vụ phải nằm trọn trong khoảng, không xuyên giờ nghỉ trưa; các khung giờ trong một khoảng nối liền nhau theo thời lượng dịch vụ (khung đầu bắt đầu đúng giờ bắt đầu khoảng, khung sau bắt đầu đúng lúc khung trước kết thúc), phần dư cuối khoảng không đủ một khung thì không có khung giờ); loại trừ khung giờ đã Đã đặt, Đang giữ chỗ, hoặc trùng lịch nghỉ đã duyệt. Dùng chung cho tra cứu, đặt lịch, và chạy thêm khi gợi ý AI cần hiển thị giờ trống.

**Tác nhân kích hoạt.**

Hệ thống (được include/extend bởi: Tra cứu bác sĩ và lịch khám, Đặt lịch khám, Đổi lịch hẹn, Trò chuyện với Trợ lý AI).

**Tiền điều kiện.**

Có yêu cầu tính khung giờ từ một use case gọi (tra cứu, đặt lịch, đổi lịch, gợi ý AI).

Bác sĩ và dịch vụ mục tiêu đã xác định.

Chi nhánh đã khai báo lịch hoạt động cho thứ của ngày được hỏi (chưa khai báo thì xử lý như ngày nghỉ [đề xuất]).

**Hậu điều kiện.**

Thành công: Trả về danh sách khung giờ với trạng thái tương ứng (Còn trống, Đã đặt, Đang giữ chỗ, Hết hạn) cho use case gọi sử dụng.

Thất bại: Không trả được danh sách khung giờ (ví dụ dữ liệu lịch làm việc không hợp lệ); use case gọi nhận thông báo lỗi và tự xử lý.

**Các bước thực hiện.**

(1) Use case gọi (Tra cứu bác sĩ và lịch khám, Đặt lịch khám, Đổi lịch hẹn, hoặc Trò chuyện với Trợ lý AI) yêu cầu tính khung giờ cho một bác sĩ, dịch vụ, khoảng thời gian.

(2) Hệ thống lấy lịch làm việc của bác sĩ theo chi nhánh và lịch hoạt động của chi nhánh đó theo thứ của từng ngày trong khoảng thời gian đó, rồi chia mỗi khoảng nhận khám tương ứng với ca thành các khung giờ liên tiếp dài đúng thời lượng dịch vụ (khung sau bắt đầu đúng lúc khung trước kết thúc, phần dư cuối khoảng không đủ một khung thì bỏ).

(3) Hệ thống loại trừ các khung giờ đã Đã đặt, Đang giữ chỗ, trùng thời gian nghỉ phép đã duyệt, rơi vào ngày chi nhánh nghỉ, hoặc không nằm trọn (từ giờ bắt đầu đến hết thời lượng dịch vụ) trong khoảng nhận khám tương ứng với ca của chi nhánh vào ngày đó (ngoài khoảng, xuyên giờ nghỉ trưa hoặc kết thúc sau giờ kết thúc của khoảng).

(4) Hệ thống đánh dấu các khung giờ đã quá giờ hiện tại là Hết hạn.

(5) Hệ thống trả về danh sách khung giờ còn lại ở trạng thái Còn trống cùng các khung giờ khác kèm trạng thái, cho use case gọi hiển thị.

**Luồng thay thế.**

A1. Bác sĩ không có lịch làm việc nào trong khoảng thời gian yêu cầu

2a. Hệ thống không tìm thấy ca làm việc nào của bác sĩ trong khoảng thời gian đó.

2b. Hệ thống trả về danh sách rỗng cho use case gọi hiển thị (không có khung giờ nào khả dụng).

A2. Chi nhánh nghỉ hoặc chưa khai báo lịch hoạt động vào ngày được hỏi

2a. Hệ thống phát hiện thứ của ngày được hỏi là ngày nghỉ của chi nhánh, hoặc chi nhánh chưa khai báo lịch hoạt động cho thứ đó.

2b. Hệ thống trả danh sách rỗng kèm lý do ("Chi nhánh nghỉ vào Thứ …" hoặc "Chi nhánh chưa khai báo lịch hoạt động ngày này") để use case gọi hiển thị; không coi là lỗi.

### 2.4.8. Use case Đặt lịch khám

**Mô tả.**

Cho phép Bệnh nhân đặt lịch khám trực tuyến qua 3 điểm vào:

(1) Trực tiếp bấm nút "Đặt lịch khám" trên thanh điều hướng/trang chủ để vào trang đặt lịch riêng;

(2) Từ trang chủ/danh mục dịch vụ duyệt theo dịch vụ/chuyên khoa, bấm chọn thẳng một khung giờ cụ thể của một bác sĩ để vào trang đặt lịch với chuyên khoa/bác sĩ/khung giờ đã điền sẵn;

(3) Từ trang danh sách/chi tiết bác sĩ, bấm chọn khung giờ ngay trên trang bác sĩ.

Việc chọn khung giờ chỉ lưu lựa chọn, chưa giữ chỗ. Hệ thống kiểm tra lại và chỉ giữ chỗ khi Bệnh nhân bắt đầu thanh toán cọc. Lịch hẹn chỉ được xác nhận sau khi thanh toán thành công trong thời gian giữ chỗ (tức thì nếu dịch vụ không yêu cầu đặt cọc), nếu không lịch tự hủy và khung giờ được giải phóng.

**Tiền điều kiện.**

Đã đăng nhập với vai trò Bệnh nhân, tài khoản đang hoạt động.

Chưa bị khoá đặt lịch trực tuyến do no-show.

Hồ sơ đi khám (bản thân hoặc người thân) đang ở trạng thái hiệu lực.

Chưa vượt số lịch hẹn đang hoạt động tối đa của hồ sơ đi khám đó.

### 2.4.5. Use case Tra cứu bác sĩ và lịch khám

**Mô tả.**

Cho phép người dùng tra cứu lịch khám theo dịch vụ: chọn dịch vụ → chuyên khoa, rồi xem danh sách bác sĩ kèm toàn bộ khung giờ trong ngày (Còn trống, Đã đặt, Đang giữ chỗ, Hết hạn). Bấm khung giờ Còn trống để đặt lịch; bấm khung Đã đặt/Đang giữ chỗ để đăng ký chờ. Use case này chỉ để xem, không giữ chỗ hay đăng ký chờ ngay.

### 2.4.21. Use case Nhắn tin với lễ tân

**Mô tả.**

Cho phép Bệnh nhân trò chuyện với Lễ tân qua hộp thư chung của một chi nhánh; chi nhánh được hệ thống tự xác định theo lịch hẹn liên quan nếu có, nếu không thì dùng "chi nhánh đang chọn" hiện tại.

**Tiền điều kiện.**

Đã đăng nhập vai trò Bệnh nhân.

### 2.4.6. Use case Tra cứu bài viết / cẩm nang

**Mô tả.**

Cho phép người dùng xem danh sách, chi tiết bài viết/cẩm nang y tế đã xuất bản; tìm kiếm theo tên và hashtag; xem bài viết liên quan (theo hashtag trùng) và bài viết nổi bật (theo lượt Thích).

**Tiền điều kiện.**

Không yêu cầu đăng nhập.

Có ít nhất một bài viết ở trạng thái Đã xuất bản do Quản trị viên tạo.

### 2.4.1. Use case Đăng ký tài khoản

**Mô tả.**

Cho phép Khách vãng lai tạo tài khoản để trở thành Bệnh nhân, bằng cách cung cấp họ tên, email, số điện thoại, mật khẩu; có thể tuỳ chọn quét mã QR ở mặt trước CCCD gắn chip để điền nhanh thông tin. Sau khi gửi yêu cầu đăng ký, hệ thống tạo ngay Tài khoản với vai trò Bệnh nhân ở trạng thái chưa xác minh email và gửi mã OTP qua email; chỉ khi người dùng xác minh đúng mã OTP, Tài khoản mới được đánh dấu đã xác minh email và được phép đặt lịch khám trực tuyến.

### 2.4.42. Use case Cập nhật cấu hình hệ thống

**Mô tả.**

Cho phép Quản trị viên phạm vi Toàn hệ thống thiết lập các thông số cấu hình vận hành của hệ thống: thời gian giữ chỗ, thời điểm nhắc lịch (các mốc số giờ trước giờ hẹn), khung giờ cho phép tiếp đón (check-in: số phút trước và số phút sau giờ hẹn mà Lễ tân còn được chuyển lịch hẹn sang Đã tiếp đón; giá trị: [cần điền]), số lịch hẹn đang hoạt động tối đa của mỗi hồ sơ đi khám (bản thân hoặc từng hồ sơ người thân được tính riêng; giá trị: [cần điền]), số lần tự đổi lịch tối đa cho mỗi lịch hẹn, thời hạn phản hồi lời mời danh sách chờ, số mục chờ tối đa mỗi bệnh nhân, ngưỡng no-show (số lần no-show mới đạt hoặc vượt ngưỡng thì khoá quyền tự đặt lịch trực tuyến; mức 3 lần là [đề xuất]), số ngày thông báo trước cho bệnh nhân bị ảnh hưởng khi thay đổi lịch hoạt động hoặc dịch vụ khả dụng của chi nhánh có hiệu lực (giá trị: [cần điền]), trọng số w1/w2 khi gợi ý bác sĩ. Thời lượng khung giờ không cấu hình riêng mà lấy theo thời lượng của dịch vụ khám; thời gian đặt trước không bị giới hạn bởi một số ngày cố định mà do lịch làm việc bác sĩ đã được công bố tới đâu. Mọi thay đổi cấu hình được ghi vào Audit Log (giá trị trước – sau và lý do) trong cùng một giao dịch.

### 2.4.46. Use case Quản lý chuyên khoa

**Mô tả.**

Cho phép Quản trị viên thêm, cập nhật, đổi trạng thái hoạt động của chuyên khoa. Chuyển Ngừng hoạt động là xoá mềm: không bắt buộc gỡ bác sĩ đang gán trước — chuyên khoa chỉ ẩn khỏi tra cứu/gợi ý AI.

### Đoạn của 2.4.8 (A1) và 2.4.5 (bước 10, A4)

1-8a. Bệnh nhân đã duyệt và bấm chọn sẵn một khung giờ cụ thể của một bác sĩ từ nơi khác — use case "Tra cứu bác sĩ và lịch khám" (từ trang chủ/danh mục dịch vụ), hoặc từ trang danh sách/chi tiết bác sĩ — thay cho các bước 1–8 của luồng trực tiếp.

1-8b. Hệ thống chuyển thẳng vào trang đặt lịch với dịch vụ/chuyên khoa, bác sĩ, chi nhánh, khung giờ đã điền sẵn; Các lựa chọn được điền sẵn; chuyển trang không giữ chỗ. Hệ thống kiểm tra lại khung giờ trước khi xác nhận (tương đương kết quả bước 8 của luồng trực tiếp).

1-8c. Bệnh nhân tiếp tục từ bước 9 ("Thông tin") của luồng trực tiếp trở đi.

(10) Người dùng bấm chọn một khung giờ đang Còn trống của một bác sĩ để tiếp tục đặt lịch: hệ thống chuyển sang "Đặt lịch khám" với chi nhánh/dịch vụ/bác sĩ/khung giờ đã điền sẵn.

11a/8c. Hệ thống phát hiện người dùng đang ở vai trò Khách vãng lai (chưa đăng nhập) khi bấm khung giờ Còn trống (đặt lịch) hoặc xác nhận popup đăng ký chờ.

11b/8c-2. Hệ thống giữ tạm lựa chọn (dịch vụ/chuyên khoa/bác sĩ/khung giờ hoặc tiêu chí ca), chuyển hướng người dùng tới Đăng nhập hoặc Đăng ký tài khoản.

11c/8c-3. Sau khi đăng nhập/đăng ký thành công, hệ thống khôi phục lựa chọn đã chọn và tiếp tục vào luồng tương ứng ("Đặt lịch khám" hoặc "Đăng ký chờ và phản hồi lời mời") — cùng cơ chế lưu tạm lựa chọn như use case "Trò chuyện với Trợ lý AI", A6 (xem vấn đề 2 của use case đó); nếu người dùng không hoàn tất đăng nhập/đăng ký, use case kết thúc và lựa chọn không được lưu.

### SOW (`PROJECT CHARTER & STATEMENT OF WORK (SOW).docx`): mục tiêu AI, 3.2.6 và 5.1.4

> AI trong hệ thống được định hướng là công cụ hỗ trợ quá trình tìm kiếm và đặt lịch, không thay thế vai trò của bác sĩ và không đưa ra chẩn đoán, chỉ định điều trị hoặc các quyết định chuyên môn y tế. Các chức năng AI cần được thiết kế với phạm vi sử dụng rõ ràng, có cơ chế kiểm soát đầu vào và đầu ra nhằm hạn chế các trường hợp sử dụng sai mục đích.

> 3.2.6. Giới hạn đối với AI

> Các chức năng AI không được sử dụng để đưa ra chẩn đoán, kê đơn hoặc thay thế quyết định chuyên môn của bác sĩ.

> AI chỉ được phép xử lý và cung cấp thông tin trong phạm vi dữ liệu và chức năng được hệ thống cho phép.

> Dữ liệu đầu vào gửi đến AI phải được kiểm soát để hạn chế việc tiết lộ thông tin nhạy cảm không cần thiết.

> 5.1.4. Đảm bảo yêu cầu đối với chức năng AI

> Nếu các chức năng AI được đưa vào phiên bản nghiệm thu hoặc demo:

> AI chỉ hoạt động trong phạm vi hỗ trợ đã xác định.

> Không thực hiện chẩn đoán, kê đơn hoặc thay thế quyết định chuyên môn của bác sĩ.

> Các gợi ý do AI cung cấp không được tự động thay đổi lịch hẹn hoặc dữ liệu nghiệp vụ khi chưa có xác nhận của người dùng.

> Hệ thống cần có cơ chế xử lý phù hợp khi AI không thể đưa ra kết quả đáng tin cậy hoặc yêu cầu nằm ngoài phạm vi cho phép.

### 1.2.1 Yêu cầu chức năng (`1.2.1_Yeu_Cau_Chuc_Nang.docx`)

> Gợi ý bác sĩ: AI ánh xạ nhu cầu sang chuyên khoa; hệ thống lọc bác sĩ có khung giờ đúng ngày và ca đã chọn rồi xếp theo Điểm = w1×rating_norm + w2×kinh_nghiệm_norm (đề xuất w1 = 0,6; w2 = 0,4; rating_norm = rating trung bình / 5, dưới 5 lượt đánh giá dùng rating trung bình toàn hệ thống; kinh_nghiệm_norm = min(số năm kinh nghiệm + năm quy đổi học vị, 20) / 20; quy đổi BS +0, ThS +2, TS +5, PGS +8, GS +12).

> 7 — Trò chuyện với Trợ lý AI (hỏi – đáp & gợi ý đặt lịch) — Tra cứu, Tính toán, Kết xuất — - Hỏi – đáp theo thời gian thực trên dữ liệu công khai (chi nhánh, chuyên khoa, bác sĩ, dịch vụ, chính sách, bài viết); không chẩn đoán, không kê đơn; ngoài phạm vi hoặc khẩn cấp thì nêu giới hạn và hướng đến bác sĩ/cơ sở y tế hoặc Lễ tân.
>
> - Dữ liệu xác định (bác sĩ, chuyên khoa, giá, khung giờ) phải đối chiếu dữ liệu thật; không có thì dùng phản hồi dự phòng.
>
> - Gợi ý đặt lịch: AI ánh xạ nhu cầu sang chuyên khoa (không chẩn đoán); chọn chuyên khoa xong, hệ thống gợi ý bác sĩ và khung giờ trống thật. Khung giờ chỉ được tính khi gợi ý cần hiển thị giờ trống. AI không tự giữ chỗ hay xác nhận lịch.
>
> - Khách xem đủ kết quả, cần đăng nhập/đăng ký để giữ chỗ. — Gộp hỏi – đáp và gợi ý đặt lịch thành một chức năng (nhóm chốt 21/09).

> 6 — Trả lời câu hỏi cho Trợ lý AI Hỏi – đáp — Tính toán, Kết xuất — - Sinh câu trả lời trên dữ liệu công khai do hệ thống cung cấp; không chẩn đoán, không kê đơn. — Tác nhân: Dịch vụ AI (Gemini / Groq / Ollama).

> 7 — Ánh xạ nhu cầu sang chuyên khoa cho gợi ý đặt lịch — Tính toán, Kết xuất — - Ánh xạ nhu cầu bằng ngôn ngữ tự nhiên sang danh sách chuyên khoa (không chẩn đoán), dùng chung kiến trúc dự phòng và ràng buộc như Hỏi – đáp. — Tác nhân: Dịch vụ AI. [đề xuất] Đối chiếu chuyên khoa với danh mục thật, không có thì loại.

### 1.3.3 Quy trình tra cứu thông tin và hỏi đáp với Trợ lý AI (`1.3_Quy_Trinh_Tac_Nghiep_CLINIX.docx`, ba đoạn về Trợ lý)

> Trợ lý AI hỗ trợ hai nhóm nhu cầu: hỏi đáp về dữ liệu công khai của hệ thống (chi nhánh, chuyên khoa, bác sĩ, dịch vụ, chính sách, bài viết) và gợi ý đặt lịch. Khi người dùng mở khung chat, hệ thống hiển thị cảnh báo rằng Trợ lý AI chỉ tư vấn sơ bộ, không chẩn đoán, không kê đơn và không thay thế khám trực tiếp. Câu hỏi được gửi cùng ngữ cảnh dữ liệu công khai liên quan đến Dịch vụ AI; câu trả lời trước khi hiển thị được đối chiếu với dữ liệu thật của hệ thống (tên bác sĩ, chuyên khoa, giá, khung giờ), nếu sai lệch thì hệ thống dùng phản hồi dự phòng thay vì hiển thị thông tin sai. Dịch vụ AI được tổ chức theo chuỗi dự phòng nhiều lớp (Gemini, rồi Groq, rồi Ollama chạy cục bộ, cuối cùng là phản hồi dựng sẵn) với giới hạn thời gian chờ, thử lại và thời gian nghỉ cho từng lớp, nên người dùng vẫn nhận được phản hồi khi một lớp gặp sự cố.

> Khi người dùng nêu nhu cầu khám bệnh, Trợ lý AI ánh xạ nhu cầu sang chuyên khoa phù hợp mà không chẩn đoán bệnh; kết quả được đối chiếu với danh mục chuyên khoa đang hoạt động và loại bỏ chuyên khoa không tồn tại. Sau khi người dùng xác nhận hoặc chọn lại chuyên khoa, hệ thống tính khung giờ còn trống của các bác sĩ thuộc chuyên khoa đó và hiển thị để người dùng chọn. Nếu là Bệnh nhân đã đăng nhập và chọn một khung giờ, hệ thống chuyển sang quy trình đặt lịch với thông tin đã điền sẵn; Trợ lý AI không tự giữ chỗ hay xác nhận lịch thay người dùng. Với câu hỏi vượt phạm vi tư vấn hoặc có dấu hiệu khẩn cấp, hệ thống nêu rõ giới hạn của Trợ lý AI và hướng người dùng đến cơ sở y tế gần nhất hoặc kênh nhắn tin với lễ tân.

### 2.1_2.2 Tác nhân và quan hệ (`2.1_2.2_Actor_UseCase_CLINIX.docx`)

> Dịch vụ AI (Gemini / Groq / Ollama) — • Trả lời câu hỏi cho Trợ lý AI Hỏi – đáp
>
> • Ánh xạ nhu cầu sang chuyên khoa cho gợi ý đặt lịch

> Dịch vụ AI (Gemini / Groq / Ollama) — Trả lời câu hỏi cho Trợ lý AI Hỏi – đáp
>
> Ánh xạ nhu cầu sang chuyên khoa cho gợi ý đặt lịch

> • &lt;&lt;extend>> Trò chuyện với Trợ lý AI (hỏi – đáp & gợi ý đặt lịch) → Tính khung giờ khám còn trống: nhánh rẽ khi gợi ý đặt lịch cần hiển thị khung giờ trống.

### Bảng phân loại phạm vi (`Phan_Loai_Pham_Vi_Chuc_Nang_TLCN_KLTN_v1.docx`, M18, M19)

> 18 — M18. Trợ lý AI Hỏi – đáp (AI Q&A Assistant) — Trả lời câu hỏi dựa trên dữ liệu công khai của hệ thống; dữ liệu xác định phải truy xuất/đối chiếu dữ liệu thật, không tìm thấy thì dùng phản hồi fallback; không chẩn đoán, không kê đơn; ngoài phạm vi thì nêu rõ giới hạn và chuyển hướng. [Cập nhật 14/09/2026 — chốt kiến trúc dự phòng 3 lớp: Gemini API (gemini-2.0-flash) chính, Groq API (llama-3.1-8b-instant) dự phòng 1, model cục bộ qua Ollama (qwen2.5:3b) dự phòng 2, phản hồi dựng sẵn nếu cả ba lỗi; timeout 6-8s / retry 1 lần / cooldown 60s. Không tự huấn luyện/fine-tune model nào.] — TLCN CORE — Là một trong hai chức năng AI làm nên bản sắc của đề tài. Cơ chế grounding và fallback (truy xuất dữ liệu thật, không tìm thấy thì trả lời fallback thay vì tự sinh thông tin) là một yêu cầu kỹ thuật rõ ràng, kiểm chứng được. |

> 19 — M19. AI gợi ý đặt lịch (AI-assisted Appointment Recommendation) — Mô tả nhu cầu bằng ngôn ngữ tự nhiên → gợi ý Chuyên khoa → truy vấn dữ liệu thật để gợi ý Bác sĩ và Khung giờ trống; người dùng tự chọn và xác nhận qua luồng đặt lịch chuẩn; AI không tự tạo, giữ chỗ hoặc xác nhận lịch hẹn. [Cập nhật 14/09/2026 — chốt công thức chấm điểm gợi ý bác sĩ: Điểm = w1×rating chuẩn hoá + w2×kinh nghiệm/học vị chuẩn hoá (đề xuất w1=0,6, w2=0,4); lịch trống xử lý bằng lọc đúng ngày/ca trước rồi mới xếp hạng, không nằm trong công thức điểm; Quản trị viên chỉnh trọng số; ý "có thể ghim ưu tiên bác sĩ" ở đây là ghi nhận lịch sử và ĐÃ ĐƯỢC THAY THẾ (không còn chức năng ghim, xem [27/09] và [18/10/2026] ở M19 Phần 2); hai trọng số vẫn [cần điền].] — TLCN CORE — Là chức năng tạo điểm khác biệt lớn nhất của đề tài và nối thẳng vào Booking; ranh giới an toàn đã rõ (AI chỉ gợi ý, không tự tạo/giữ chỗ/xác nhận lịch hẹn). |

### Mục tiêu đề tài 4 và cách chứng minh (`HO_SO_NOP_TRANG\MUC_TIEU_DE_TAI_CLINIX.docx`)

> Mục tiêu 4. Tích hợp chatbot hỗ trợ có kiểm soát.

> Gợi ý chuyên khoa, bác sĩ và khung giờ còn trống thật từ nhu cầu người dùng nêu; chatbot không tự đặt lịch.

> Không chẩn đoán, không kê đơn, không thay quyết định chuyên môn của bác sĩ; kiểm soát đầu vào và đầu ra, hạn chế dữ liệu nhạy cảm gửi tới AI, có phản hồi dự phòng khi dịch vụ AI không khả dụng.

> 4. Chatbot hỗ trợ có kiểm soát — Bộ câu hỏi kiểm thử chatbot gồm câu hợp lệ và câu ngoài phạm vi (chẩn đoán, kê đơn) cho kết quả đúng giới hạn; gợi ý khung giờ khớp dữ liệu thật.

### Bản cam kết sản phẩm và metric 23/11 (`Cam_Ket_San_Pham_Va_Metric_CLINIX_2026-11-23.md`: nhóm F, N6, P1, ghi chú tên đề tài)

> F — Chatbot hỏi đáp và gợi ý; thông báo trong ứng dụng; danh sách chờ; chat bệnh nhân với bác sĩ hoặc lễ tân; dashboard và báo cáo vận hành; bài viết và cẩm nang; màn xem nhật ký hành động — Chưa có mã nguồn — Chưa cam kết. Chốt giữ hay chuyển sang Khóa luận ở văn bản Phạm vi (hạn 27/11/2026); khi chốt sẽ cập nhật bản cam kết này. |

> N6 — Tỉ lệ câu hỏi ngoài phạm vi (chẩn đoán, kê đơn) bị chatbot từ chối đúng trên bộ câu hỏi kiểm thử. Đo bằng bộ câu hỏi kiểm thử chatbot. — Chatbot chưa có mã nguồn. — 100% câu hỏi ngoài phạm vi bị từ chối đúng. Chỉ áp dụng nếu chatbot được giữ trong phạm vi ở văn bản 27/11. |

> P1 — Tỉ lệ khối lượng hoàn thành so với cam kết: số issue đã đóng trên số issue của các nhóm đã cam kết (tracker GitHub Issues, theo milestone). — 264/289 issue của chín milestone module (91,3%). Milestone xong hoàn toàn: auth, catalog, patient, search, doctor-exam. — Tối thiểu 90% tại 07/12/2026; 100% issue của nhóm A, B và C. |

> - **Chatbot và các chức năng nhóm F chưa có mã nguồn.** Tên đề tài có cụm "tích hợp chatbot" và mục tiêu 4 nói về chatbot, nên nếu chatbot được chuyển sang Khóa luận thì phải điều chỉnh lại tên đề tài, mục tiêu 4 và metric N6. Nhóm chốt ở văn bản Phạm vi (27/11/2026).
