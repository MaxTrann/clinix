# Kế hoạch scope #11: `chat` Nhắn tin (Nhắn tin với bác sĩ, Nhắn tin với lễ tân, Nhắn tin với bệnh nhân)

> **Trạng thái: bản nháp 1, giai đoạn 1 (26/11/2026). Đại đã trả lời trực tiếp cả 25 câu Q1 đến Q25** (bảy hộp câu hỏi trong phiên lập kế hoạch): 22 câu theo đề xuất; **ba câu chọn khác đề xuất: Q1 (làm ảnh và PDF), Q2 (WebSocket), Q8 (gửi và nhận qua socket)**. Ghi ở [`TRACKING.md`](TRACKING.md) mục 3.1. Các điểm kỹ thuật T1 đến T14 (mục 4.3) **đã được phiên kiểm độc lập duyệt kỹ thuật** ngày 26/11/2026 kèm bổ sung; T12 và MH1 đến MH9 (chi tiết sản phẩm nhỏ) giữ mặc định `[đề xuất]`, Đại chưa trả lời trực tiếp. Còn lại: các `[cần điền]` ở 4.4 và việc ngoài repo ở 4.6. Chưa mở PR; **chưa tạo issue** (danh sách issue đề xuất ở mục 6.6; Đại tự chạy script sinh issue sau khi PR tài liệu merge).
> **Người LÀM scope này: Trung (`junUTE`), module `chat`; Đại (`MaxTrann`) review** (như scope thông báo). Điểm chạm file của người khác gắn thẻ `[ĐỤNG …]`; Đại approve PR tài liệu coi là xác nhận các điểm chạm file của Đại (`patient`, `auth`, `search`) và file dùng chung.
> Kế hoạch lập theo [`docs/FEATURE_PLANNING_PROMPT.md`](../../FEATURE_PLANNING_PROMPT.md) và prompt lập kế hoạch scope chat do Đại đưa ngày 26/11/2026. **Phiên lập kế hoạch này KHÔNG sửa `AI_USAGE_LOG.md` và `docs/TECH_DEBT.md`** (bản nháp hàng 203 và ba dòng nợ 323 đến 325 ở [`TRACKING.md`](TRACKING.md) mục 4; Đại ghi ở PR sau).
> Đã kiểm mã thật trên `origin/main` ở **`5598e8a`** (26/11/2026, PR 699); **Đối chiếu lại với `origin/main` `08965d2`** (đã có đổi lịch F5, F4b, X2 và notification D1, PR 701): `git diff` cho thấy **không file mã nào mà kế hoạch này dựa vào bị đổi**; số dòng DDL ở mục 2 đã cập nhật theo bản sau PR 701; thay đổi của PR 701 chạm chat ghi ở 3.3 L15. Chỗ nào ghi **"chưa đo"** hay **"chưa kiểm"** là suy ra từ mã hay tài liệu, **chưa chạy thử**; danh sách việc phải đo nằm ở mục 5.15 và gom vào task X1. Phiên này **không chạy** `npm`, test, build, Docker hay MySQL, **không đọc** `.env` thật, và **không sửa** file nào ngoài hai file mới `docs/features/chat/PLAN.md`, `TRACKING.md`.
> Scope này là **#11** trong lộ trình (Q19; danh sách chờ lùi sau), sau thông báo (#10, Trung đang làm; D1 đã merge ở PR 701, còn X3 #670) và song song với đổi lịch (#9, Đại, sắp xong). Sau chat là báo cáo và audit, AI, bài viết. **Mã mới nằm trong `apps/api/src/chat/` và `apps/web/src/features/chat/`**; scope commit `chat`.
> **Ba điều phải đọc trước khi chia việc:** (1) ba bảng `hoi_thoai`, `tai_khoan_hoi_thoai`, `tin_nhan` **chỉ có DDL ở `docs/database/`, chưa có migration và chưa có entity** (đã kiểm ở mục 2), nên P1 là điều kiện của mọi task backend; (2) theo Q2 và Q8, chat là **nơi đầu tiên trong repo dùng WebSocket** (chuông thông báo vẫn thăm dò 30 giây), nên P4, B5, F2 mang rủi ro kỹ thuật mới (mục 3.5 R1 đến R5); (3) theo Q1, Q5 đến Q7, chat là **nơi đầu tiên lưu tệp của người dùng trên máy chủ** (volume riêng, không dùng kho ảnh công khai).

## 0. Quy ước đọc

- Tên use case viết tắt, **trùng tiền tố mã test** (quét ngày 26/11/2026 bằng `grep` trên `docs/`, `apps/api/src`, `apps/api/test`, `apps/web/src`: chưa ai dùng): **NBS** = Nhắn tin với bác sĩ (2.4.20); **NLE** = Nhắn tin với lễ tân (2.4.21); **NBN** = Nhắn tin với bệnh nhân (2.4.29); **LOI** = lõi gửi tin và hội thoại; **QCH** = quyền và phạm vi; **MCH** = migration và schema; **TEP** = tệp đính kèm; **SOC** = WebSocket; **TBC** = thông báo tin mới; **BCH** = bảo mật dữ liệu và log; **HCH** = hợp đồng và kiến trúc; **CCH** = đồng thời; **WCH** = giao diện; **KCH** = kiểm tay; **IVC** = bất biến. `b4` = bước (4); `A1/5b` = luồng thay thế A1, mục 5b; "MT" = Mô tả; "TĐK" = tiền điều kiện; "HĐK" = hậu điều kiện. Nguyên văn ba use case ở **Phụ lục A**, các use case và tài liệu liên quan ở **Phụ lục B** (sao chép bằng script, không gõ lại). **Dự án không dùng Use Case ID**, chỉ tên.
- **Đánh số use case:** file gốc `D:\du_lieu\TLCN_CLINIX\2.4_Dac_Ta_Use_Case_CLINIX.docx` (76 use case) đánh số Nhắn tin với bệnh nhân là **2.4.29**; bản làm việc `Drive_Hien_Tai\2.4_Dac_Ta_Use_Case_CLINIX.docx` đánh số **2.4.28**; hai use case của Bệnh nhân là 2.4.20 và 2.4.21 ở cả hai. **Ba use case giống nhau từng dòng** (so bằng script: 21, 22 và 26 dòng). PLAN này dùng số của file gốc.
- Nguồn đúng khi lệch nhau: **schema DB (`docs/database/`) để code**; chỗ 2.4, 1.2.1, schema, Figma và mã lệch nhau ở mục 3.3 và 3.4. **Không tự chọn bên nào** (AGENTS mục 1.6). Figma chỉ là bản phác thảo: **không đề xuất đồng bộ lại Figma**; mã và PLAN là nguồn đúng.
- Thẻ: `[ĐỒNG BỘ TL]` = task phải sửa tài liệu (2.4 và file Word ở repo `TLCN_CLINIX`, `docs/database/*` cả ba file) trong **cùng PR** (file Word do Đại sửa, ngoài repo này); `[TIỀN ĐỀ]` = việc nền; `[CHỜ X1]` = chờ số đo; `[CHỜ Đại]` = cần Đại làm hay đồng ý; `[ĐỤNG x]` = sửa file thuộc module hay vùng x (báo người sở hữu): `[ĐỤNG notification]`, `[ĐỤNG auth]`, `[ĐỤNG doctor]`, `[ĐỤNG patient]`, `[ĐỤNG search]`, `[ĐỤNG upload]` (`common/upload`), `[ĐỤNG router]` (`router/role-nav.ts`, `role-routes.tsx`, `role-shells.tsx`), `[ĐỤNG shared]` (`apps/web/src/shared/**`), `[ĐỤNG database]` (`database/entities.ts`, `migrations/index.ts`, `app.module.ts`, `docs/database/*`), `[ĐỤNG docker]` (`docker-compose*.yml`, `Dockerfile`, `.env.example`, `.gitignore`, `config/env.validation.ts`, `nginx.conf`, `vite.config.ts`), `[ĐỤNG deps]` (`package.json`, lock); `[SOẠN TRƯỚC]` = viết được ngay nhưng **chưa merge** khi phụ thuộc chưa có; `[SAU]` = ngoài scope này, ghi để không quên.
- Mỗi task = **một PR** nhỏ, **chỉ backend HOẶC chỉ frontend**, 2 đến 7 giờ làm (hai ngoại lệ đã duyệt: F1 có thêm một PR nhỏ tách hook thăm dò, T10; P4 là task hạ tầng chạm thêm hai file cấu hình proxy của `apps/web`); scope commit `chat` (hạ tầng: `db`, `docker`, `web`; module khác bị chạm: `notification`). Test đặt cạnh mã; mỗi test ghi mã test case. Mã task: `P` nền, `B` backend, `F` frontend, `D` đồng bộ tài liệu, `X` đo thật, kiểm tay và tổng kết. Task có khoá, giao dịch, đồng thời, WebSocket, tệp hay quyền gắn mức kiểm **ĐẦY ĐỦ** (đột biến, `test:int` và `test:e2e`, ca đồng thời chạy một mình, EXPLAIN cho câu SQL mới); task web gắn mức **GỌN** (đột biến web bốn loại: kho trình duyệt/URL/log, bấm đúp, tính toán ở client, chặn theo trạng thái; không chạy tay jscpd và gitleaks, CI đo).
- `[đề xuất]` = giá trị AI tự đề xuất, chưa chốt; `[cần điền]` = thiếu thông tin, chưa có đề xuất. **Mục 4.4 liệt kê lại cả hai loại.**
- **Mã task trùng** với mã của `booking`, `reschedule` và `notification` (P1, B1, F1, X1…). Khi nhắc ngoài file này luôn viết **"chat B2"**; issue và PR dùng nhãn `[chat]` và hậu tố `(chat B2)`.
- **Thuật ngữ:** "hội thoại" = một dòng `hoi_thoai`; "hộp thư chung" = hội thoại `BenhNhan_LeTan` của một chi nhánh, mọi Lễ tân chi nhánh đó cùng thấy; "người tham gia" = tài khoản có quyền đọc và gửi theo mục 5.3 (với hộp thư chung, quyền của Lễ tân đến từ **phạm vi chi nhánh**, không từ dòng thành viên); "mốc đã đọc" = `tin_nhan_cuoi_da_doc_id`; "mã gửi" = `tin_nhan.ma_gui`; "đẩy" = sự kiện máy chủ phát qua WebSocket; "mốc bù" = `tin_nhan_id` lớn nhất mà web đã tải **liền mạch bằng REST** (không lấy từ tin được đẩy).

## 1. Phạm vi

**Làm (ba use case, theo `docs/database/` và 2.4):**

| Use case | Tác nhân | Việc chính của scope | Đường vào |
|---|---|---|---|
| **2.4.20 Nhắn tin với bác sĩ** | Bệnh nhân | Nhắn bác sĩ bất kỳ; tạo hội thoại ở tin đầu tiên; banner cảnh báo; trạng thái đã từng khám; lịch sử; gửi lỗi thì giữ nội dung | nút "Nhắn tin" ở thẻ và trang chi tiết bác sĩ; mục menu "Tin nhắn" |
| **2.4.21 Nhắn tin với lễ tân** | Bệnh nhân | Hộp thư chung chi nhánh; tự xác định chi nhánh (Q4), cho đổi; lịch sử | mục menu "Tin nhắn" |
| **2.4.29 Nhắn tin với bệnh nhân** | Bác sĩ, Lễ tân | Bác sĩ trả lời hội thoại Bệnh nhân đã mở (không tự mở); Lễ tân tìm theo tên, SĐT, email trong chi nhánh mình và trả lời | mục menu "Tin nhắn" của hai khung |

**Cùng phần hệ thống chúng chạm (phần của scope, không phải use case riêng):** tin chưa đọc và mốc đã đọc; **thông báo tin nhắn mới** (nối vào danh mục sự kiện của scope thông báo, Q11); tệp đính kèm ảnh và PDF (Q1, Q5, Q6, Q7); gửi và nhận tức thời qua WebSocket có dự phòng REST (Q2, Q8, Q22); giao diện hộp thư ở ba khung vai trò.

**Không làm (ghi rõ; module khác hoặc sau):**
- **Trợ lý AI** (2.4.7, 2.4.76 và hai use case AI hệ thống): scope AI sau. **Đề xuất bảng riêng cho AI** (loại hội thoại và thành viên của chat không biểu diễn được tác nhân AI); chat chỉ giữ đường dẫn `/benh-nhan/tin-nhan` để luồng A1 4b của 2.4.7 ("gợi ý dùng kênh "Nhắn tin với lễ tân"") liên kết tới.
- **Quản trị viên đọc hội thoại hay tệp** (Q13): không route, không trang.
- Sửa, xoá, thu hồi tin; báo cáo vi phạm; chặn người dùng; đóng hay lưu trữ hội thoại (quyết định 26/09/2026: **hội thoại luôn hoạt động, không có trạng thái đóng**; Q14 giữ mãi, không job dọn).
- Gọi thoại, gọi video (1.2.1: "không video call"); chỉ báo "đang nhập", trạng thái trực tuyến, "đã xem" cho người gửi (không use case nào đòi); tìm trong nội dung tin.
- Quét virus tệp (Q6, ghi nợ); nhiều tệp mỗi tin (Q6); xem PDF ngay trong trang (chỉ tải xuống).
- Email cho tin nhắn mới (Q11); thông báo đẩy di động; Flutter; nhiều tiến trình API và Redis adapter (ghi nợ); chuyển chuông thông báo sang WebSocket (giữ thăm dò 30 giây của scope thông báo).
- Nhật ký hành động cho thao tác chat (không thuộc danh sách hành động nhạy cảm 2.4.70).
- Giới hạn tần suất theo IP (việc X3 của auth/admin, làm trước khi mở công khai); chat chỉ giới hạn theo người gửi (Q17).
- Gửi email thật, đọc `.env` thật.
- Sửa `docs/features/reschedule/*`, `docs/features/notification/*`, `AI_USAGE_LOG.md`, `docs/TECH_DEBT.md`, `docs/database/*` ở PR kế hoạch này (chỉ báo; sửa ở P1, B6, D1 và các task `[ĐỒNG BỘ TL]`).
- Đồng bộ lại Figma: không.

### 1.1 Bảng use case → luồng, điều kiện, ngoại lệ → ĐÃ CÓ hay CÒN THIẾU → thành phần mã sẽ chạm

Cột "Nguyên văn" chép từ Phụ lục A (chữ trong ngoặc kép là chữ của 2.4). "Hiện trạng" là kết quả kiểm mã ở `5598e8a`, đối chiếu lại với `08965d2` (chi tiết ở mục 2). `chat/` = `apps/api/src/chat/`; `web/` = `apps/web/src/`.

| UC | Nguyên văn (luồng, điều kiện, ngoại lệ) | Hiện trạng | Thành phần mã sẽ chạm | Task |
|---|---|---|---|---|
| 2.4.20 | MT: "nhắn tin văn bản bất đồng bộ với bất kỳ bác sĩ nào trong hệ thống, không yêu cầu đã từng đặt lịch với bác sĩ đó" | **ĐÃ CÓ** DDL ba bảng; **CÒN THIẾU** migration, entity, API | `chat/entities/`, migration, `chat/core/` | P1, B1 |
| 2.4.20 | TĐK: "Đã đăng nhập vai trò Bệnh nhân (bắt buộc đăng nhập)." | **ĐÃ CÓ** `JwtAuthGuard`, `@Roles`, `RequireAuth` (web, giữ đường quay lại); **CÒN THIẾU** route | controller chat, route web | B3, F1 |
| 2.4.20 | b1: "bấm nút "Nhắn tin với bác sĩ" — đặt trên trang chi tiết hồ sơ bác sĩ, hoặc ngay trên thẻ bác sĩ trong danh sách" | **ĐÃ CÓ nút vô hiệu** (`features/search/doctors/doctor-card.tsx:141-149`, `doctor-detail-page.tsx` quanh dòng 236-243); ca TBS-20, UIS-10 và `booking-flow.test.tsx:382` khẳng định nút vô hiệu | `web/features/search/doctors/*`, `web/shared/routes/chat-paths.ts` | F4 |
| 2.4.20 | b2: "kiểm tra đã có hội thoại ... nếu chưa, chuẩn bị tạo hội thoại mới khi có tin nhắn đầu tiên" | **CÒN THIẾU**; bảng không có ràng buộc duy nhất cho cặp | `GET /chat/doctors/:bacSiId` (không tạo), tìm-hoặc-tạo dưới khoá tài khoản (Q9) | B1, B3 |
| 2.4.20 | b3: "khung chat kèm banner cảnh báo (tư vấn sơ bộ, không thay khám trực tiếp, không kê đơn) và trạng thái quan hệ (đã từng khám/chưa từng khám, tính động từ lịch sử lịch hẹn Đã xác nhận/Hoàn thành với bác sĩ này)" | **CÒN THIẾU**; `lich_hen` có chỉ mục `(benh_nhan_id, trang_thai, thoi_gian)` | `chat/read/relationship.query.ts` (Q16: thêm Đã tiếp đón), banner ở web | B2, B3, F4, F5 |
| 2.4.20 | b4, b5: "nhập nội dung tin nhắn và gửi" ... "lưu tin nhắn vào hội thoại hiện có, hoặc tạo hội thoại mới ... hiển thị trong khung chat, gửi thông báo tin nhắn mới cho bác sĩ" | **CÒN THIẾU** | lõi gửi (`chat/core/`), REST, socket, thông báo (Q11) | B1, B3, B5, B6 |
| 2.4.20 | b6: "xem lại lịch sử hội thoại bất kỳ lúc nào" | **CÒN THIẾU** | `GET /chat/conversations`, `/:id/messages` (con trỏ) | B2, F3 |
| 2.4.20 | A1: "Gửi tin nhắn thất bại do lỗi hệ thống/kết nối ... hiển thị thông báo lỗi, giữ nguyên nội dung Bệnh nhân đã nhập để gửi lại." | **CÒN THIẾU** | ô soạn giữ nháp, gửi lại cùng `ma_gui` (Q10) | F3, F2 |
| 2.4.20 | HĐK: "Tin nhắn được gửi và lưu ... bác sĩ nhận được thông báo tin nhắn mới. Thất bại: Tin nhắn không được lưu/gửi; hệ thống hiển thị lỗi tương ứng." | **CÒN THIẾU** | một giao dịch (hội thoại, thành viên, tin, thông báo) hoặc không gì cả | B1, B6 |
| 2.4.21 | MT: "trò chuyện với Lễ tân qua hộp thư chung của một chi nhánh; chi nhánh được hệ thống tự xác định theo lịch hẹn liên quan nếu có, nếu không thì dùng "chi nhánh đang chọn" hiện tại" | **ĐÃ CÓ** `chk_hoi_thoai_chi_nhanh` ở DDL; kho "chi nhánh đang chọn" (`web/shared/branch-selection/`, chú thích đã nhắc nhắn tin); API `public/branches` | `GET /chat/default-branch`, bộ chọn chi nhánh | B3, F4 |
| 2.4.21 | TĐK: "Đã đăng nhập vai trò Bệnh nhân." | **ĐÃ CÓ** guard | route | B3 |
| 2.4.21 | b1: "chọn chức năng "Nhắn tin với lễ tân"" | **CÒN THIẾU**; mục menu "Tin nhắn" vô hiệu (`router/role-nav.ts` dòng 57) | `role-nav.ts`, trang Tin nhắn | F1, F4 |
| 2.4.21 | b2, b3: "xác định chi nhánh: nếu Bệnh nhân có lịch hẹn liên quan gần nhất ... nếu không, dùng "chi nhánh đang chọn" hiện tại" ... "xác nhận chi nhánh (có thể đổi sang chi nhánh khác nếu muốn)" | **CÒN THIẾU** | quy tắc Q4 ở `chat/read/default-branch.query.ts`, bộ chọn có xác nhận | B3, F4 |
| 2.4.21 | b4, b5, b6: khung chat với hộp thư chung; gửi; "lưu tin nhắn vào hội thoại hiện có (tạo mới nếu chưa có), gửi thông báo tới Lễ tân thuộc chi nhánh đó" | **CÒN THIẾU** | như b4, b5 của 2.4.20 | B1, B3, B5, B6, F4 |
| 2.4.21 | b7: "xem lại lịch sử hội thoại bất kỳ lúc nào" | **CÒN THIẾU** | như b6 của 2.4.20 | B2, F3 |
| 2.4.21 | A1: gửi thất bại, "giữ nguyên nội dung Bệnh nhân đã nhập để gửi lại" | **CÒN THIẾU** | như A1 của 2.4.20 | F3, F2 |
| 2.4.21 | HĐK: "hội thoại giữa Bệnh nhân và hộp thư chung ... Lễ tân thuộc chi nhánh đó nhận được thông báo tin nhắn mới" | **CÒN THIẾU** | người nhận = mọi Lễ tân Đang hoạt động của chi nhánh | B6 |
| 2.4.29 | MT: (1) "Bác sĩ nhắn tin bất đồng bộ trực tiếp với bất kỳ bệnh nhân nào đã chủ động nhắn tới mình"; (2) "Lễ tân giải đáp ... qua hộp thư chung của chi nhánh mình được gán, tìm hội thoại theo họ tên/số điện thoại/email" | **CÒN THIẾU** | `chat/rest/`, trang hộp thư | B2, B3, F5 |
| 2.4.29 | TĐK: "Với Bác sĩ: chỉ truy cập hội thoại mà mình là người tham gia (Ownership)." ... "Với Lễ tân: hội thoại cần xử lý thuộc chi nhánh mình được gán (Branch Scope)." | **ĐÃ CÓ** `ReceptionScopeService` (đọc chi nhánh mỗi yêu cầu); **CÒN THIẾU** chính sách quyền hội thoại | `chat/core/chat-access.policy.ts` | B1, B2 |
| 2.4.29 | b1: "chọn một hội thoại do bệnh nhân đã chủ động nhắn tới (Bác sĩ không tự khởi tạo hội thoại mới với bệnh nhân)" | **CÒN THIẾU**; mục "Tin nhắn" của Bác sĩ vô hiệu (`role-nav.ts` dòng 113) | không có route tạo cho Bác sĩ, Lễ tân | B2, F5 |
| 2.4.29 | b2, A1 2a/2b: kiểm Ownership; "từ chối truy cập, thông báo không có quyền" | **CÒN THIẾU** | 404 cùng thân (T3), web hiện câu "không có quyền" | B2, F5 |
| 2.4.29 | b3: "khung chat kèm trạng thái quan hệ (đã từng có lịch hẹn Đã xác nhận/Hoàn thành ... hay chưa từng khám)" | **CÒN THIẾU** | như b3 của 2.4.20 (Q16) | B2, F5 |
| 2.4.29 | b4, b5: "nhập nội dung và gửi"; "lưu tin nhắn, gửi thông báo cho bệnh nhân" | **CÒN THIẾU** | lõi gửi, thông báo | B1, B3, B6 |
| 2.4.29 | b6: "(Luồng Lễ tân — thay thế từ bước 1)" ... "tìm hội thoại theo họ tên/số điện thoại/email bệnh nhân trong hộp thư chung của chi nhánh mình được gán" ... "hệ thống kiểm tra hội thoại thuộc chi nhánh Lễ tân được gán (Branch Scope)" | **ĐÃ CÓ** luật từ khoá của tra cứu hồ sơ (`patient/validation/keyword-policy.ts`); mục "Tin nhắn" của Lễ tân vô hiệu (dòng 95) | tìm trong phạm vi chi nhánh, tái dùng `buildLookupPatterns` | B2, F5 |
| 2.4.29 | A2: gửi thất bại, "giữ nguyên nội dung đã nhập để gửi lại" | **CÒN THIẾU** | như A1 | F3, F2 |
| 2.4.29 | HĐK: "lưu vào hội thoại tương ứng (1-1 với Bác sĩ, hoặc hộp thư chung ...); bệnh nhân nhận được thông báo" | **CÒN THIẾU** | như trên | B1, B6 |

**Use case chạm vào (không gộp, chỉ nối):**

| UC | Chỗ chạm | Hiện trạng và xử lý | Task |
|---|---|---|---|
| 2.4.59 Trung tâm thông báo | thông báo tin mới hiện trong danh sách, có liên kết tới hội thoại | **ĐÃ CÓ** (scope #10, B2 và F2); thêm mã, kiểu liên kết `HoiThoai` | B6, F1 |
| 2.4.68 Gửi thông báo theo sự kiện | danh sách sự kiện **không có** "tin nhắn mới" | **CÒN THIẾU** ở 2.4 (L2); mã theo Q11; `[ĐỒNG BỘ TL]` | B6, D1 |
| 2.4.40 Quản lý tài khoản người dùng | khoá tài khoản thu hồi phiên | **ĐÃ CÓ**; socket phải ngắt và không đẩy cho phiên đã thu hồi (R5); không gửi được tới bên bị khoá (Q3) | B1, B5 |
| 2.4.26, 2.4.37, 2.4.8 | lịch của Bác sĩ, tra cứu hồ sơ, đặt lịch | chỉ đọc `lich_hen` cho chi nhánh mặc định và trạng thái quan hệ; **không** sửa | B2, B3 |
| 2.4.7, 2.4.76 Trợ lý AI | 2.4.7 A1 liên kết tới "Nhắn tin với lễ tân" | `[SAU]`: scope AI tự nối | — |

### 1.2 Nơi đặt và ranh giới với module khác

- Thư mục mã mới: `apps/api/src/chat/` (kèm `chat/entities/`: module sở hữu bảng của mình như `payment`, `wallet`, `doctor`; T4) và `apps/web/src/features/chat/`, `apps/web/src/shared/routes/chat-paths.ts`.
- Module Nest `ChatModule` thêm **một** dòng ở `app.module.ts` `[ĐỤNG database]`.
- Chat **chỉ ghi** `hoi_thoai`, `tai_khoan_hoi_thoai`, `tin_nhan` và `thong_bao` của chính sự kiện chat (mỗi module tự ghi thông báo bằng hằng mã của mình, nếp notification Q5). **Không ghi** bảng của `booking`, `patient`, `doctor`, `admin`, `payment`, `wallet`.
- Thư mục tài liệu: `docs/features/chat/`. Commit scope `chat`: chưa có trong `commitlint.config.cjs` (`scope-enum` mức cảnh báo, không chặn) và kiểm `pr-title` của CI không giới hạn scope; `[đề xuất]` thêm `chat` vào `commitlint.config.cjs` và AGENTS ở P1 (T9).

## 2. Hiện trạng repo (đã kiểm ở `5598e8a`, 26/11/2026; đối chiếu lại với `origin/main` `08965d2`: đã có F5, F4b, X2, notification D1 PR 701; số dòng `docs/database/*` theo `08965d2`)

| Chỗ | Tình trạng | Nguồn kiểm |
|---|---|---|
| Bảng `hoi_thoai` | DDL có: `loai ENUM('BenhNhan_BacSi','BenhNhan_LeTan')`, `chi_nhanh_id` (NULL được), `nguoi_tao_id NOT NULL`, `thoi_diem_tao`; chỉ mục `(chi_nhanh_id, loai, thoi_diem_tao)`; `chk_hoi_thoai_chi_nhanh`; **không** ràng buộc duy nhất cho cặp, **không** cột trạng thái, **không** cột bác sĩ (bác sĩ chỉ nằm ở bảng thành viên) | `clinix_mysql.sql:608-614, 737, 801, 1035-1037`; `clinix.dbml:928-940` |
| Bảng `tai_khoan_hoi_thoai` | PK `(tai_khoan_id, hoi_thoai_id)`, chỉ mục `(hoi_thoai_id, tai_khoan_id)`, `tin_nhan_cuoi_da_doc_id` FK tới `tin_nhan`; ghi chú: chưa đọc = tin có id lớn hơn mốc (hay mọi tin nếu trống) và người gửi khác mình; mốc cùng hội thoại kiểm ở service; Lễ tân mỗi người một dòng, tạo khi mở hoặc trả lời lần đầu | `clinix_mysql.sql:616-621, 739, 803`; quy tắc DB mục 2 dòng 14 |
| Bảng `tin_nhan` | `noi_dung text NOT NULL`, `tep_dinh_kem varchar(255)`, `thoi_diem_gui`; chỉ mục `(hoi_thoai_id, tin_nhan_id)`; **không** mã gửi, **không** thông tin tệp | `clinix_mysql.sql:623-630, 741` |
| Migration và entity chat | **KHÔNG có.** `grep` `hoi_thoai`, `tin_nhan` ở `apps/api/src` chỉ ra một chú thích ở `auth/register/unverified-patient-cleaner.ts:18`; không migration, không entity, không module `chat`. Migration cuối: `1794139200000-chi-muc-thong-bao-tai-khoan.ts` | `database/migrations/`, `database/entities.ts` |
| Danh mục sự kiện | `notification/catalog/notification-catalog.ts`: `CHO_MODULE` có `{ module: 'chat', suKien: 'Tin nhắn mới (2.4.20, 2.4.21, 2.4.29)' }`; `NhomSuKien` và `KieuLienKet` chưa có chat. DMS-13 đỏ khi module thêm hằng `*_EVENTS` mà chưa khai, và đòi đúng danh sách module chừa chỗ `['waitlist','waitlist','chat','payment']` | `notification-catalog.ts` quanh dòng 418-435; `notification-catalog.spec.ts` DMS-13 |
| `thong_bao` | không có cột trỏ hội thoại; UNIQUE chỉ cho lịch hẹn và yêu cầu (NULL không bị so) | `clinix_mysql.sql`, entity `admin/entities/thong-bao.entity.ts` |
| Trung tâm thông báo | API và web đã merge (notification B2, F1 đến F3); chuông **thăm dò 30 giây** (`features/notification/unread/use-unread-count.ts`, logic thăm dò viết ngay trong hook); X3 (#670) còn mở; D1 (#668) đã merge (PR 701) | mã web, `gh issue list`, `gh pr list` |
| Xác thực | `JwtAuthGuard` toàn cục chỉ đọc header HTTP; `TokenService.verifyAccessToken`; `SessionService.resolveActive` (một câu theo khoá chính, kèm `trang_thai = 'DangHoatDong'`); access token 15 phút giữ trong bộ nhớ web; `OriginGuard` so `Origin` với `WEB_ORIGIN` | `auth/guards/`, `auth/session/`, `phien-dang-nhap.repository.ts:175-195` |
| Phạm vi Lễ tân | `ReceptionScopeService.resolve` đọc DB mỗi yêu cầu (403 `KHONG_DU_QUYEN`); `resolveReceptionBranch` | `rbac/`, `appointments/reception-branch.ts` |
| Giao dịch và khoá | `withBookingTransaction` (READ COMMITTED, thử lại 1213/1205 hai lần, chờ khoá 3 giây, 503 `HE_THONG_DANG_BAN`) đang được `doctor`, `payment`, `wallet` dùng; bảng thứ tự khoá toàn cục tầng 1 `tai_khoan` … 7c `thong_bao` | `appointments/locking/booking-transaction.ts`, `lock-order.ts` |
| Tải tệp | `common/upload/`: `ImageProcessor` (JPEG, PNG, WebP tĩnh; nhận ≤ 10 MB, ra ≤ 2 MB, ≤ 25 megapixel; ảnh nhỏ có EXIF được mã hoá lại để bỏ metadata), `FileInterceptor` (multer giữ trong bộ nhớ), interceptor giới hạn đồng thời và hạn giờ; **chỉ** ảnh chuyên khoa công khai lên Cloudinary (ADR 0001: "không dùng cho ảnh bệnh nhân"). `UploadModule` **không** export `ImageProcessor`. **Không có** kho tệp cục bộ | `common/upload/`, `docs/adr/0001-…` |
| WebSocket | **Không có** thư viện (`apps/api/package.json` không có `@nestjs/websockets`, `socket.io`); không gateway | `package.json` hai app |
| Hạ tầng | `docker-compose.yml` và `.staging.yml` chỉ có volume `db-data`; `Dockerfile` API chạy `USER node`; `nginx.conf` có một `location ^~ /api/` cho API, đã có `proxy_http_version 1.1` nhưng đặt `Connection ""`, **không** có header `Upgrade`, `proxy_read_timeout 60s` (nên **không chuyển tiếp nâng cấp WebSocket**), `client_max_body_size 11m`; Vite proxy `/api/` không bật `ws` | `docker-compose*.yml`, `apps/api/Dockerfile`, `apps/web/nginx.conf:9-27`, `vite.config.ts` |
| Web: lớp client | `shared/api/client.ts` là nơi duy nhất gọi `fetch`; đọc thân bằng `response.text()` rồi `JSON.parse` (**chưa tải được dữ liệu nhị phân**); gửi được `FormData`; hook phiên `getAccessToken`, `recoverFromUnauthorized`, `getRequestSignal` | `shared/api/client.ts`, `auth-hooks.ts` |
| Web: khung và menu | **Không có** `features/chat`. Mục "Tin nhắn" vô hiệu ở `PATIENT_NAV` (dòng 57), `RECEPTION_NAV` (95), `DOCTOR_NAV` (113). `RoleNavItem.badge` chỉ có `'notifications'`; `role-shells.tsx` gọi hook thông báo rồi truyền xuống (WTB-16) | `router/role-nav.ts`, `role-shells.tsx`, `shared/ui/role-shell*.tsx` |
| Log | `SanitizingLogger` che theo tên khoá (mật khẩu, token…), **không** che `noiDung`; che bỏ `sql`, `query`, `parameters` của lỗi; `data-source.ts` không bật log câu lệnh | `common/logging/`, `database/data-source.ts` |
| Nợ liên quan | TECH_DEBT 36 (tài khoản chưa xác minh bị khoá ngoại chặn xoá, kể cả bảng chat: không xảy ra vì chưa đăng nhập được); 62 (từ PR 701: phần còn lại là số đếm mục "Tin nhắn", chờ module chat, và của đổi lịch); không có dòng nào về tệp đính kèm | `docs/TECH_DEBT.md` |
| Figma | Mã Make: `pages/patient/PatientMessagingPage.tsx`, `pages/doctor/DoctorMessagingPage.tsx`, `pages/shared/ChatPage.tsx` (Lễ tân); khung manifest Bệnh nhân (6), Bác sĩ (2), Lễ tân (2), route `…/tin-nhan`; có lọc, tìm, "Chọn bác sĩ", "Chọn chi nhánh", nhãn đã từng khám, "Enter để gửi · Shift+Enter xuống dòng"; **không** có đính kèm, không có cơ chế tức thời | `THIET_KE_UI/Figma_Make_Sync/` (không mở Figma) |

## 3. Phân tích ảnh hưởng

### 3.1 Bảng và cột scope này chạm tới

| Bảng | Cột | Cách chạm |
|---|---|---|
| `hoi_thoai` | cả bảng (**DDL không đổi**) | **TẠO** (P1); `INSERT` chỉ ở một nơi (tìm-hoặc-tạo, B1); `SELECT … FOR UPDATE` khi gửi, `FOR SHARE` khi đánh dấu đọc |
| `tai_khoan_hoi_thoai` | cả bảng (**DDL không đổi**) | **TẠO** (P1); thành viên chèn lúc tạo; Lễ tân chèn khi mở hoặc trả lời lần đầu; mốc chỉ tiến tới |
| `tin_nhan` | cột cũ + **mới** `ma_gui`, `tep_ten_goc`, `tep_loai`, `tep_dung_luong`; **mới** UNIQUE `(nguoi_gui_id, ma_gui)` và hai CHECK (Q7, Q10, Q21) | **TẠO** (P1); `INSERT` ở lõi gửi; đọc theo con trỏ; không `UPDATE`, không `DELETE` |
| `thong_bao` | `tai_khoan_id`, `loai_su_kien`, `noi_dung`, `trang_thai_doc`, `thoi_diem_tao` | `INSERT` `TinNhanMoi:{id}` (gộp) và `UPDATE trang_thai_doc` cho **đúng** dòng của hội thoại vừa đọc (B6); **không đổi schema** (Q11) |
| `tai_khoan` | `trang_thai`, `ho_ten`, `so_dien_thoai`, `email`, `loai_tai_khoan` | đọc; `SELECT … FOR UPDATE` hàng của **Bệnh nhân** chỉ khi mở hội thoại (Q9) |
| `bac_si`, `le_tan`, `chi_nhanh` | chức danh, chi nhánh | chỉ đọc |
| `lich_hen` | `benh_nhan_id`, `bac_si_id`, `chi_nhanh_id`, `trang_thai`, `thoi_gian` | chỉ đọc (chi nhánh mặc định Q4, trạng thái quan hệ Q16) |
| `email_thong_bao`, `nhat_ky_hanh_dong` | — | **không ghi** |
| `phien_dang_nhap` | — | chỉ qua `SessionService.resolveActive` |
| (có điều kiện, P2) `hoi_thoai.tin_nhan_cuoi_id` + chỉ mục `(chi_nhanh_id, loai, tin_nhan_cuoi_id)`; chỉ mục `tin_nhan (nguoi_gui_id, thoi_diem_gui)` | — | **chỉ thêm khi X1 vượt ngưỡng đặt trước** (Q12): cột và chỉ mục hội thoại theo M1, M2; chỉ mục tin theo M4 |

### 3.2 API và hành vi đã có hoặc đã chốt bị chạm tới

| Chỗ | Chạm thế nào | Xử lý để không phá thiết kế đã chốt |
|---|---|---|
| `notification-catalog.ts`, DMS-13, `notification-link.ts` (API) và `notification-links.ts`, `notification-icons.ts` (web) | thêm nhóm `TinNhan`, mã `TinNhanMoi`, kiểu liên kết `HoiThoai`; bỏ dòng `chat` khỏi `CHO_MODULE`, thêm `CHAT_NOTIFICATION_EVENTS` vào `SOURCE_EVENT_SETS` | `[ĐỤNG notification]` (module của Trung); giữ "danh mục không import module khác lúc chạy" (HTB-07); đọc DMS-03 đến DMS-07 bản hiện hành trước khi sửa |
| `features/search/doctors/{doctor-card,doctor-detail-page}.tsx` và ca TBS-20, UIS-10, `booking-flow.test.tsx` | nút "Nhắn tin" thành liên kết (khách: đăng nhập rồi quay lại; vai trò khác: giữ vô hiệu) | `[ĐỤNG search]`; sửa tối thiểu ca đang khẳng định `toBeDisabled` |
| `router/role-nav.ts`, `role-routes.tsx`, `role-shells.tsx`; `shared/ui/role-shell*.tsx`; `features/patient/shell/*`, `features/doctor/shell/*` | `to` cho "Tin nhắn" ba khung, số đếm, route; một kết nối socket do router mở | `[ĐỤNG router]` `[ĐỤNG shared]` `[ĐỤNG patient]` `[ĐỤNG doctor]`; prop tuỳ chọn, mặc định giữ khung cũ (nếp notification F1); ca đếm liên kết cũ sửa có ghi chú |
| `shared/api/client.ts` | thêm đường tải nhị phân (tệp đính kèm) | `[ĐỤNG shared]`; không thêm `fetch` ở nơi khác; hành vi JSON cũ không đổi |
| `common/upload/upload.module.ts` | export `ImageProcessor` | `[ĐỤNG upload]`; không đổi `ImageProcessor` và chính sách ảnh chuyên khoa |
| `docker-compose*.yml`, `apps/api/Dockerfile`, `.env.example`, `.gitignore`, `config/env.validation.ts` | volume `chat-files`, biến `CHAT_FILES_DIR` | `[ĐỤNG docker]`; biến có giá trị mặc định dev; không secret |
| `apps/web/nginx.conf`, `vite.config.ts` | location và proxy riêng cho đường socket có `Upgrade` (task P4) | `[ĐỤNG docker]`; không đổi location `/api/` cho REST |
| `package.json` và lock của hai app | `@nestjs/websockets`, `@nestjs/platform-socket.io`, `socket.io` (API), `socket.io-client` (web) | `[ĐỤNG deps]`; phiên bản tra ở registry lúc làm (T1), **không ghi theo trí nhớ** |
| `app.module.ts`, `database/entities.ts`, `migrations/index.ts`, `docs/database/*` | một module, ba entity, một migration | `[ĐỤNG database]` `[ĐỒNG BỘ TL]`; mốc lớn hơn mọi migration trên `main` lúc merge |
| `AuthModule`, `RbacModule`, `patient/validation`, `appointments/locking` | **chỉ dùng** (import hàm, service đã export) | không sửa; không sao chép |
| `docs/TECH_DEBT.md` dòng 62 | phần số đếm mục "Tin nhắn" đóng khi F1 xong | Đại ghi ở PR sau (phiên này chỉ soạn nháp) |

### 3.3 Đối chiếu với thiết kế đã chốt: KHỚP, LỆCH hay MÂU THUẪN

| # | Chỗ | Bên A | Bên B | Kết luận |
|---|---|---|---|---|
| L1 | Hai bản 2.4 | File gốc: 2.4.20, 2.4.21, 2.4.29 | `Drive_Hien_Tai`: 2.4.20, 2.4.21, 2.4.28 | **KHỚP từng dòng**; chỉ khác số của use case thứ ba. Không cần hỏi |
| L2 | Thông báo tin mới | 2.4.20, 2.4.21, 2.4.29: người nhận "nhận được thông báo tin nhắn mới" | 2.4.68 (MT, TĐK) và đoạn sự kiện của 1.2.1 **không liệt kê** tin nhắn; 2.4.68 HĐK đòi "đồng thời một email tương ứng" | **LỆCH**; Q11: ghi `thong_bao` (gộp), **không email**; `[ĐỒNG BỘ TL]` thêm "tin nhắn mới (chỉ trong ứng dụng)" vào 2.4.68 và 1.2.1 |
| L3 | "Bất đồng bộ" | 2.4.20 MT, 1.2.1: nhắn tin "bất đồng bộ" | Q2, Q8: WebSocket | **KHỚP** (người nhận không cần trực tuyến; tin lưu rồi mới đẩy) |
| L4 | "Văn bản" | 2.4.20 MT "tin nhắn văn bản", 2.4.29 MT, 1.2.1, 1.3.10 | Q1: thêm ảnh và PDF (1.2.1 mục dữ liệu và schema vốn có `tep_dinh_kem`) | **MÂU THUẪN với chữ use case; Đại đã quyết** (Q1); `[ĐỒNG BỘ TL]` sửa 2.4.20, 2.4.21, 2.4.29 (và 2.4.28), 1.2.1, 1.3.10 |
| L5 | Chi nhánh khi chưa có lịch | 2.4.21 b2: dùng "chi nhánh đang chọn"; 1.3.10 cùng ý | 1.2.1 dòng "Nhắn tin với lễ tân": "nếu chưa từng đặt lịch, bệnh nhân tự chọn chi nhánh" | **LỆCH nhẹ**; hợp nhất: chọn sẵn chi nhánh đang chọn (nếu là một chi nhánh), "Toàn quốc" thì phải chọn; luôn đổi được (b3). `[ĐỒNG BỘ TL]` |
| L6 | Chưa đọc ở hộp thư chung | schema: tin sau mốc của chính mình, người gửi khác mình | Q15: giữ công thức, thêm nhãn "Chờ trả lời" / "Đã trả lời · tên" | **KHỚP** schema (tin đồng nghiệp trả lời cũng là chưa đọc) |
| L7 | Trạng thái quan hệ | 2.4.20 b3, 2.4.29 b3: "Đã xác nhận/Hoàn thành" | Q16: thêm "Đã tiếp đón" (gồm lịch của người thân) | **LỆCH đã quyết**; `[ĐỒNG BỘ TL]` |
| L8 | Từ chối truy cập | 2.4.29 A1 2b: "thông báo không có quyền" | Nếp dự án: ngoài phạm vi trả 404 cùng thân (admin Q40, booking, notification) | **LỆCH về mã HTTP** (T3): API 404 `KHONG_TIM_THAY`, web hiện "Bạn không có quyền xem hội thoại này." đúng chữ use case |
| L9 | Không có trạng thái đóng | quyết định 26/09/2026, `COMMENT` bảng | Q3: bên bị khoá thì không gửi được tới họ, lịch sử vẫn đọc | **KHỚP**: chặn suy ra lúc gửi từ `tai_khoan.trang_thai`, không thêm cột hay trạng thái hội thoại |
| L10 | Hai cơ chế tức thời | scope thông báo Q1: thăm dò 30 giây; chỉ thị lập kế hoạch: tận dụng, không dựng hai cơ chế | Q2, Q8: chat dùng WebSocket; chuông giữ thăm dò | **LỆCH đã quyết bởi Đại**: repo sẽ có hai cơ chế; ghi nợ (nháp ở TRACKING 4.2); dự phòng của chat cũng là thăm dò (Q22) |
| L11 | Kho tệp | ADR 0001: Cloudinary cho ảnh chuyên khoa công khai, "không dùng cho ảnh bệnh nhân" | Q5: volume riêng | **KHỚP** với ADR; P3 viết ADR mới cho kho tệp chat, P4 cho WebSocket (T14) |
| L12 | Số scope | PLAN đổi lịch và thông báo ghi danh sách chờ là #11 | Q19: chat là #11 | **LỆCH chữ**; D1 ghi chú ở `docs/TRACKING.md`; không sửa PLAN của module khác ở PR này |
| L13 | Tìm bệnh nhân | tra cứu hồ sơ (patient Q16): Lễ tân tìm **toàn hệ thống** | 2.4.29 b6: tìm trong hộp thư **chi nhánh mình** | **KHỚP** use case; tái dùng luật từ khoá, khác phạm vi |
| L14 | Người nhận ở danh mục | 2.4.68: "các tài khoản liên quan" | Quản trị viên không tham gia chat (Q13) | **KHỚP**: người nhận chỉ Bệnh nhân, Bác sĩ, Lễ tân |
| L15 | PR 701 (notification D1) chạm gì tới chat | PR 701 thêm quy tắc DB "mọi mã `thong_bao.loai_su_kien` nằm ở danh mục" và chốt 21 loại có thư; mục admin D6 mô tả hậu tố `:v{n}`; đóng phần chuông của TECH_DEBT 62 (còn số đếm "Tin nhắn"); không đổi ba bảng chat (chỉ chữ chú thích, số dòng DDL lùi 4) | Chat: `TinNhanMoi` không thư (số 21 không đổi) nhưng thêm **dạng hậu tố mới** `:{hoiThoaiId}` | **KHỚP** về danh mục; B6 ghi dạng hậu tố mới vào quy tắc DB (`[ĐỒNG BỘ TL]`, 5.10) |

### 3.4 Chỗ mơ hồ còn lại (đã chọn mặc định `[đề xuất]`; phiên kiểm bảo giữ mặc định và sẽ báo Đại một lần; Đại chưa trả lời trực tiếp)

- **MH1 "Chi nhánh đang chọn"** nằm ở trình duyệt (`localStorage`) nên API `default-branch` chỉ trả chi nhánh suy từ lịch hẹn hoặc `null`; web dùng kho `shared/branch-selection` khi `null`; máy chủ nhận mọi `chiNhanhId` tồn tại.
- **MH2 "Lịch còn hiệu lực sắp tới" (Q4):** trạng thái `ChoThanhToan`, `DaXacNhan`, `DaTiepDon` và `thoi_gian` từ **đầu ngày hôm nay** (giờ Việt Nam) trở đi, sắp tăng dần (lấy gần nhất; trùng giờ thì `lich_hen_id` nhỏ); không có thì lịch `HoanThanh` có `thoi_gian` lớn nhất; không có thì `null`.
- **MH3 Lịch của hồ sơ người thân** (cùng `benh_nhan_id`) được tính cho cả chi nhánh mặc định và trạng thái quan hệ (hội thoại thuộc tài khoản).
- **MH4 Bác sĩ đổi chi nhánh:** hội thoại bác sĩ không gắn chi nhánh nên không đổi.
- **MH5 Lễ tân đổi chi nhánh:** quyền theo chi nhánh **hiện tại** (đọc mỗi yêu cầu và trước mỗi lần đẩy); dòng thành viên cũ vô hại.
- **MH6 Bệnh nhân bị khoá đặt lịch do vắng mặt** vẫn nhắn được (cờ này không phải khoá tài khoản, 2.4.40).
- **MH7 Nút "Nhắn tin" cho người chưa đăng nhập** đi tới đăng nhập rồi quay lại (nếp `RequireAuth`); Bác sĩ, Lễ tân, Quản trị viên xem trang công khai thấy nút vô hiệu kèm chú thích "Chỉ Bệnh nhân nhắn tin" (T12).
- **MH8 Hội thoại chỉ có tin tệp:** dòng xem trước ở danh sách là "[Ảnh]" hay "[Tệp PDF]", không hiện tên tệp (T12).
- **MH9 Phiên đăng nhập và socket:** kết nối socket không gia hạn phiên; web làm mới token như khi thăm dò thông báo (không đổi chính sách phiên của auth).

### 3.5 Bẫy và rủi ro (xử lý trong task; khoá và đồng thời chi tiết ở 5.4)

- **R1 Công nghệ mới trong repo:** WebSocket chưa có tiền lệ (xác thực, quyền, log, test). Xử lý: một lõi gửi dùng chung cho REST và socket; X1 đo trước; REST và thăm dò dự phòng đủ chạy khi socket hỏng.
- **R2 Guard, pipe, filter toàn cục có thể không áp cho gateway** (chưa kiểm với NestJS 12): `JwtAuthGuard` đọc header HTTP nên không dùng được cho socket. Xử lý: gateway tự xác thực lúc bắt tay và mỗi sự kiện, tự kiểm DTO (`whitelist`, `forbidNonWhitelisted`), tự đổi lỗi thành mã; X1 M9 và ca SOC chứng minh.
- **R3 Proxy chặn nâng cấp:** `location ^~ /api/` của `nginx.conf` đặt `Connection ""` và không có header `Upgrade`; Vite proxy chưa bật `ws`. Xử lý (P4): location và proxy riêng cho đường socket (5.7); bắt tay thật qua nginx và Vite ở ca SOC-16, đo X1 M10, X3 chạy lại đầu cuối (KCH-10).
- **R4 Một tiến trình API:** danh sách kết nối ở bộ nhớ; chạy nhiều tiến trình sẽ mất đẩy giữa các tiến trình. Chấp nhận, ghi nợ.
- **R5 Quyền thay đổi khi socket đang mở** (đăng xuất, khoá, đổi chi nhánh, hết hạn token). Xử lý: tính người nhận từ DB mỗi lần đẩy, kiểm phiên của từng socket trước khi đẩy, quét định kỳ, ngắt khi token hết hạn.
- **R6 Rò nội dung vào log** (lỗi gateway, lỗi multer, lỗi TypeORM, biến `DEBUG` của socket.io). Xử lý: quy tắc 5.11 và ca BCH bắt log thật.
- **R7 Tệp độc hại** (không quét virus, Q6): chỉ nhận đúng bốn loại theo nội dung, mã hoá lại ảnh, PDF chỉ tải xuống, `nosniff`, `Content-Security-Policy` sandbox, tên tệp không bao giờ thành đường dẫn.
- **R8 Bộ nhớ khi tải tệp** (multer giữ 10 MB trong bộ nhớ): giới hạn đồng thời, đo X1 M8.
- **R9 Tệp mồ côi hoặc mất tệp** (tiến trình chết giữa ghi tệp và commit; khôi phục DB không kèm volume): job dọn tệp không được tham chiếu; ghi chú sao lưu hai thứ cùng nhau.
- **R10 Đĩa và bảng chỉ tăng** (Q14): ghi nợ.
- **R11 Lỡ tin đẩy rồi hỏi bù sai mốc:** id tin **không liên tục theo hội thoại** nên web không tự phát hiện lỗ. Xử lý: mốc bù chỉ lấy từ lần tải REST liền mạch (5.7), ca WCH-06.
- **R12 Deadlock với auth, admin, thông báo qua khoá `S` ngầm của khoá ngoại tới `tai_khoan`:** thứ tự khoá 5.4, thử lại, đo X1 M5, M6.
- **R13 Hộp thư Lễ tân lớn:** danh sách sắp theo tin cuối và đếm chưa đọc phải tính theo từng hội thoại. Xử lý: đo X1 M1, M2; P2 nếu vượt ngưỡng.
- **R14 Xung đột file** với đổi lịch (router, `app.module.ts`) và thông báo X3: bảng 6.3.
- **R15 Lễ tân mới được gán** thấy mọi hội thoại cũ là chưa đọc (hệ quả công thức đã chốt, Q15): số ở menu đếm hội thoại, trần "99+"; ghi nợ.
- **R16 Tên tệp tiếng Việt có thể bị đọc sai mã** ở lớp multipart (nghi ngờ mặc định latin1 của multer, **chưa kiểm**): ca TEP-06 chứng minh trước khi lưu.
- **R17 Ước giờ:** hai phần mới (WebSocket, tệp) có thể vượt; đệm khoảng 11 giờ (6.4).

## 4. Câu hỏi và quyết định

### 4.1 Đã chốt ở module khác (kế thừa — **không bàn lại**)

- **Thiết kế schema 26/09/2026:** hội thoại luôn hoạt động, **không có trạng thái đóng**; hộp thư chung Lễ tân mỗi người một dòng mốc đã đọc; quy tắc DB 16 (CHECK chi nhánh) và quy tắc 14 mục 2 (mốc cùng hội thoại kiểm ở service).
- **auth** (`docs/features/auth/TRACKING.md` mục 3): TypeORM `synchronize: false`, migration viết tay đối chiếu DDL từng dòng; access JWT 15 phút, phiên thu hồi được; mã lỗi ổn định, không 500 cho UNIQUE, FK, deadlock đã lường trước.
- **booking** (PLAN 5.3): giao dịch ghi READ COMMITTED, thử lại 1213/1205, thứ tự khoá toàn cục, tác dụng phụ ngoài DB chỉ sau commit.
- **notification** (PLAN 4.2, 5.3): chuông thăm dò 30 giây (Q1, **không đổi**); danh mục sự kiện là sổ chỉ đọc, module tự ghi `thong_bao` (Q5); `thong_bao.noi_dung` ≤ 500.
- **patient** (Q16, Q19): luật từ khoá tra cứu; Q21b, Q21d: khung ẩn mục chưa có trang, module có trang chỉ thêm `to` và route.
- **admin** (Q40, Q42): ngoài phạm vi ⇒ 404 cùng thân; phân trang (chat dùng con trỏ thay offset vì danh sách thay đổi liên tục).

### 4.2 Câu hỏi gộp và quyết định (**Đại trả lời trực tiếp ngày 26/11/2026** qua bảy hộp câu hỏi)

| Q | Câu hỏi | Quyết định | Hệ quả, truy vết |
|---|---|---|---|
| **Q1★** | Có làm gửi tệp không? | **KHÁC đề xuất: làm ảnh và PDF** (đề xuất là không làm) | Thêm P3, B4, F6; L4 `[ĐỒNG BỘ TL]` |
| **Q2★** | Đẩy tin tức thời bằng gì? | **KHÁC đề xuất: WebSocket** (đề xuất là thăm dò 5/15/30 giây) | Thêm P4, B5, F2; L10; R1 đến R5 |
| Q3 | Một bên bị khoá thì hội thoại ra sao? | Theo đề xuất: lịch sử **đọc được, chặn gửi** tin mới (cả mở hội thoại mới) | 409 `CHAT_NGUOI_NHAN_KHONG_HOAT_DONG`; L9 |
| Q4 | "Lịch hẹn liên quan gần nhất" tính thế nào? | Theo đề xuất: lịch còn hiệu lực sắp tới, rồi lịch Hoàn thành gần nhất, rồi chi nhánh đang chọn; luôn đổi được | MH2 |
| Q5 | Tệp lưu ở đâu? | Theo đề xuất: **volume Docker riêng**, tải qua API có kiểm quyền | `[ĐỤNG docker]`; sao lưu riêng |
| Q6 | Giới hạn tệp? | Theo đề xuất: JPEG, PNG, WebP, PDF; **1 tệp mỗi tin, ≤ 10 MB**; ảnh nén lại ≤ 2 MB và bỏ EXIF; PDF chỉ tải xuống; **không quét virus** | ghi nợ |
| Q7 | Thông tin tệp để đâu? | Theo đề xuất: **thêm ba cột** vào `tin_nhan` (tên gốc, kiểu MIME, dung lượng); `tep_dinh_kem` giữ khoá lưu | P1, ba file `docs/database/*` |
| **Q8★** | WebSocket mang gì? | **KHÁC đề xuất: gửi và nhận qua socket** (đề xuất là socket chỉ báo hiệu); chuông thông báo giữ thăm dò | gateway kiểm dữ liệu, chống trùng, giới hạn; dùng chung lõi gửi |
| Q9 | Chống tạo trùng hội thoại? | Theo đề xuất: **khoá hàng `tai_khoan` của Bệnh nhân** rồi tìm-hoặc-tạo; không đổi schema | 5.4; HCH-01 |
| Q10 | Chống gửi trùng? | Theo đề xuất: cột **`ma_gui`** và UNIQUE `(nguoi_gui_id, ma_gui)` | P1; gửi lại trả đúng tin cũ |
| Q11 | Thông báo tin mới? | Theo đề xuất: **gộp** (mỗi người tối đa một thông báo chưa đọc mỗi hội thoại), mã hội thoại gắn sau `loai_su_kien` (`TinNhanMoi:{id}`), đọc hội thoại thì đã đọc; **không email, không nội dung**; không đổi schema | 5.10; B6 |
| Q12 | Được thêm cột, chỉ mục khi đo vượt ngưỡng? | Theo đề xuất: **cho phép, chỉ khi vượt** ngưỡng đặt trước ở X1 | P2 có điều kiện |
| Q13 | Quản trị viên đọc hội thoại? | Theo đề xuất: **không** | QCH-02 |
| Q14 | Giữ bao lâu, sửa, xoá, thu hồi? | Theo đề xuất: **giữ mãi**; không sửa, xoá, thu hồi, báo cáo, chặn | ghi nợ |
| Q15 | Hộp thư chung: ai thấy đã có người trả lời? | Theo đề xuất: giữ công thức schema; nhãn **"Chờ trả lời" / "Đã trả lời · tên"**; số ở menu đếm hội thoại có tin chưa đọc | L6; R15 |
| Q16 | Lịch nào tính "đã từng khám"? | Theo đề xuất: `DaXacNhan`, **`DaTiepDon`**, `HoanThanh`, gồm lịch của người thân | L7 `[ĐỒNG BỘ TL]` |
| Q17 | Giới hạn nội dung và tốc độ? | Theo đề xuất: **1 đến 2000 ký tự**, **20 tin mỗi phút** mỗi người gửi; văn bản thuần, cắt trắng hai đầu, giữ xuống dòng; tin chỉ có tệp được phép | 5.5 |
| Q18 | Bệnh nhân thấy tên Lễ tân? | Theo đề xuất: **"Lễ tân · {tên chi nhánh}"**, API không trả họ tên hay id Lễ tân cho Bệnh nhân; Lễ tân thấy tên đồng nghiệp | QCH-11 |
| Q19 | Số scope? | Theo đề xuất: **#11** (danh sách chờ lùi sau) | L12 |
| Q20 | Giờ mỗi tuần của Trung? | Theo đề xuất: **giả định 40 giờ** (chưa phải số thật của Trung) | 6.4 |
| Q21 | Thêm CHECK cho `tin_nhan`? | Theo đề xuất: **hai CHECK** (cột tệp cùng trống hoặc cùng có, 1 byte đến 10 MB; nội dung rỗng chỉ khi có tệp) | 5.2; MCH-06, MCH-07 |
| Q22 | Tệp đi đường nào, socket mất thì sao? | Theo đề xuất: **tệp qua HTTP**; socket mất thì gửi chữ qua REST và **thăm dò 15 giây**; một lõi gửi, cùng `ma_gui` | 5.6, 5.7 |
| Q23 | Lễ tân thấy gì về Bệnh nhân? | Theo đề xuất: **họ tên và SĐT** (email chỉ để tìm); Bác sĩ chỉ thấy họ tên | 5.6 |
| Q24 | Chọn bác sĩ mới từ trang Tin nhắn? | Theo đề xuất: **dẫn sang trang tra cứu bác sĩ** (không viết hộp "Chọn bác sĩ" như Figma) | F4 |
| Q25 | Bác sĩ có ô tìm? | Theo đề xuất: **có, theo họ tên**, trong hội thoại của chính mình | B2, F5 |

### 4.3 Điểm kỹ thuật: **đã duyệt kỹ thuật (phiên kiểm độc lập, theo ủy quyền của Đại, 26/11/2026)**; không phải quyết định sản phẩm hay schema

T1 đến T14 được duyệt như đề xuất kèm bổ sung ghi ở từng dòng (T1, T6, T7, T10). **T12 cùng MH1 đến MH9** là chi tiết sản phẩm nhỏ: phiên kiểm bảo **giữ mặc định** và sẽ báo Đại một lần; **Đại chưa trả lời trực tiếp** nên vẫn mang nhãn `[đề xuất]`.

| T | Đề xuất | Lý do và phương án khác |
|---|---|---|
| T1 | `socket.io` qua `@nestjs/websockets` + `@nestjs/platform-socket.io`, web `socket.io-client`, chỉ `transports: ['websocket']`; phiên bản `[cần điền]`, tra registry lúc làm P4. **Bổ sung khi duyệt:** proxy nginx và Vite cho đường socket thuộc **P4** (5.7), bắt tay thật qua nginx là ca SOC-16 của P4 | có nối lại, ack, token trong gói bắt tay (không nằm trên URL). Khác: `ws` thuần (tự viết nối lại, ack) |
| T2 | Route chung `/chat/…` cho ba vai trò, quyền ở một chính sách; riêng Bệnh nhân: `/chat/doctors`, `/chat/branches`, `/chat/default-branch` | ít lặp mã. Khác: ba nhóm route theo vai trò |
| T3 | Không có quyền ⇒ 404 `KHONG_TIM_THAY` cùng thân; web hiện câu "không có quyền" | nếp dự án; không lộ sự tồn tại. Khác: 403 như chữ 2.4.29 |
| T4 | Entity ở `chat/entities/` | module sở hữu bảng; không đụng `admin/entities`, `enums.ts` |
| T5 | Dùng lại `withBookingTransaction`; thêm tầng khoá chat giữa tầng 1 và 7c, ghi ở file của chat (không sửa `lock-order.ts`) | cùng nếp `payment`, `wallet`, `doctor` |
| T6 | Giới hạn 20 tin/phút bằng đếm dòng `tin_nhan` (không bảng mới); giới hạn **mềm** giữa các hội thoại khác nhau. **Bổ sung khi duyệt:** câu đếm cần chỉ mục `(nguoi_gui_id, thoi_diem_gui)` khi người gửi có nhiều tin; chỉ mục đó **không** ở P1 mà là **P2(b)**, quyết theo **M4** của X1: p95 > 10 ms ở người gửi 20.000 tin ⇒ làm P2(b) trước khi merge B1; ≤ 10 ms ⇒ không thêm | khoá tài khoản người gửi mỗi lần gửi sẽ tạo chu trình chờ (5.4) |
| T7 | Dùng lại `ImageProcessor`: **thêm `ImageProcessor` vào `exports` của `UploadModule`** (một dòng ở `apps/api/src/common/upload/upload.module.ts`, hiện chỉ export `UploadService`, `UploadRepository`; `[ĐỤNG upload]`) | đúng giới hạn Q6; không viết lại |
| T8 | Số: thăm dò dự phòng 15 giây, số đếm 30 giây, làm tươi an toàn khi socket nối 60 giây, chờ ack 10 giây, quét phiên 60 giây, tối đa 5 socket mỗi tài khoản, gói socket ≤ 64 KB, tải tệp đồng thời 4, dọn tệp mồ côi hằng ngày (tuổi ≥ 24 giờ), trang 20 hội thoại và 30 tin | chốt sau X1 |
| T9 | Thêm scope `chat` vào `commitlint.config.cjs` và AGENTS ở P1 | hiện chỉ cảnh báo |
| T10 | Tách logic thăm dò ra `shared/hooks/use-polling.ts` và dùng lại cho chuông. **Bổ sung khi duyệt:** là **một PR nhỏ ở nhánh riêng trong F1**; hành vi chuông **không đổi**; các ca của `use-unread-count.test.tsx` giữ nguyên, **không sửa** (phải sửa test cũ là tín hiệu sai: dừng và báo) | tránh trùng mã; chạm `features/notification` |
| T11 | `down` của migration P1 **từ chối** khi `tin_nhan` còn dòng | dữ liệu người dùng, kèm tệp ở volume (nếp ADR 0001 chặn khi còn dữ liệu) |
| T12 | Xem trước "[Ảnh]", "[Tệp PDF]"; vai trò khác thấy nút "Nhắn tin" vô hiệu; banner hiện cả hai phía ở hội thoại bác sĩ; Bệnh nhân có lọc "Tất cả / Bác sĩ / Lễ tân" như Figma | chi tiết giao diện; **giữ mặc định** theo phiên kiểm, Đại chưa trả lời; đổi được khi review F3 đến F5 |
| T13 | `GET` tìm kiếm giữ từ khoá ở query như tra cứu hồ sơ (nginx ghi query vào log truy cập) | nếp patient B6; ghi nợ. Khác: `POST` tìm kiếm |
| T14 | ADR mới `docs/adr/` cho kho tệp chat (P3) và WebSocket (P4), số ADR kế tiếp lúc làm | truy vết quyết định công nghệ |

### 4.4 Mọi chỗ còn `[cần điền]` và `[đề xuất]`

| Giá trị | Ở đâu | Loại |
|---|---|---|
| Phiên bản `socket.io`, `socket.io-client`, `@nestjs/websockets`, `@nestjs/platform-socket.io` | P4, F2 | `[cần điền]` (tra registry; T1) |
| Số thật giờ mỗi tuần của Trung | 6.4 | `[cần điền]` (đang giả định 40 giờ, Q20) |
| Số ADR kế tiếp; nhãn GitHub `module:chat`, milestone `chat`, số issue Epic | P3, P4, 6.6 | `[cần điền]` (Đại tạo bằng script) |
| Số PR và commit ở nháp AI log | TRACKING 4.1 | `[cần điền]` |
| Mọi số ở T8; mốc migration `1794225600000`; tên cột `tep_ten_goc`, `tep_loai`, `tep_dung_luong`, kiểu `char(36)`, tên chỉ mục `tin_nhan_index_nguoi_gui_ma_gui`, tên CHECK; timeout 3600 giây của location socket; câu SQL đếm giới hạn | 5.2, 5.5, 5.7, T8 | `[đề xuất]` |
| Biến `CHAT_FILES_DIR` và giá trị mặc định | 5.8 | `[đề xuất]` |
| Tên đường dẫn API, khoá JSON, tên sự kiện socket, mã lỗi | 5.6, 5.7, 5.14 | `[đề xuất]` (T2, T3 đã duyệt kỹ thuật; Đại sửa được khi review) |
| Câu chữ giao diện, thông báo, banner (trừ chữ lấy từ 2.4), nhãn | 5.10, 5.13, 5.14 | `[đề xuất]` (Đại duyệt khi review) |
| Chuẩn hoá nội dung (NFC, ký tự điều khiển bị từ chối), kiểm đuôi PDF `%%EOF` | 5.5, 5.8 | `[đề xuất]` |
| MH1 đến MH9, T12 | 3.4, 4.3 | `[đề xuất]` (giữ mặc định; Đại chưa trả lời) |
| Ngưỡng PASS của M1 đến M10 và cỡ dữ liệu đo | 5.15 | `[đề xuất]` (đặt trước; **không đổi sau khi thấy số**) |
| Giờ ước, Iteration, mức kiểm | 6.2, 6.4 | `[đề xuất]` |
| Có file Excel hay bảng ngoài repo cần đồng bộ | 4.6 | `[cần điền]` |

### 4.5 Figma

Figma chỉ là bản phác thảo: **không đồng bộ lại**. Giao diện dựng theo component hiện có (`RoleShell`, `EmptyState`, `ErrorState`, `LoadingState`, `use-modal-dialog`, nếp trang Thông báo hai cột) và mã Make làm khuôn **bố cục và chữ tham khảo** (không làm khuôn mã). Khung trong manifest: Bệnh nhân "Tin nhắn" và năm khung con (hội thoại bác sĩ, hội thoại chi nhánh, tin nhắn mới, chọn bác sĩ, chọn chi nhánh), Bác sĩ "Tin nhắn" và "Hội thoại", Lễ tân "Tin nhắn" và "Hội thoại". Khác Make có chủ đích: không hộp "Chọn bác sĩ" (Q24); thêm đính kèm, banner, trạng thái kết nối. Phiên lập kế hoạch **chưa đối chiếu bằng mắt** (không mở Figma).

### 4.6 Việc của nhóm (ngoài repo; không sửa file Word hay Figma từ repo này)

- **`[ĐỒNG BỘ TL]` Đại sửa file Word ở repo `TLCN_CLINIX`** (hai bản 2.4): 2.4.20, 2.4.21, 2.4.29 (2.4.28): thêm gửi ảnh và PDF (L4), chặn gửi tới bên bị khoá (Q3), định nghĩa "lịch hẹn gần nhất" (Q4), "Đã tiếp đón" (L7), giới hạn 2000 ký tự và 20 tin/phút (Q17), tên Lễ tân (Q18), hộp thư chung (Q15); 2.4.68: thêm "tin nhắn mới (chỉ trong ứng dụng)" (L2); 1.2.1 (dữ liệu và ba dòng chức năng nhắn tin: văn bản và tệp, chọn chi nhánh L5), 1.3.10, và 2.1_2.2 nếu đổi quan hệ include.
- **Excel hay bảng ngoài repo:** `[cần điền]` (chưa biết có cái nào cho ba use case này).
- Đại tạo nhãn `module:chat`, milestone `chat`, Epic và sinh issue bằng script từ mục 6.6 sau khi PR tài liệu merge.
- Môi trường chạy: volume `chat-files` phải được sao lưu và khôi phục cùng DB; seed demo (X3) do Đại hay Trung chạy, **không** `seed:*` lên DB `clinix` khi chưa được Đại đồng ý.

## 5. Thiết kế kỹ thuật

### 5.1 Cấu trúc thư mục (tạo thư mục khi có file đầu tiên; test cạnh mã; `[đề xuất]`)

```
apps/api/src/chat/
  chat.module.ts
  chat.constants.ts                 # B1: mã lỗi, giới hạn (2000, 20/phút), CHAT_NOTIFICATION_EVENTS (B6)
  entities/                         # P1: hoi-thoai, tai-khoan-hoi-thoai, tin-nhan (.entity.ts)
  core/                             # B1
    chat-content.rules.ts           # hàm thuần: chuẩn hoá, kiểm nội dung, mã gửi
    chat-access.policy.ts           # MỘT nơi định nghĩa quyền đọc, gửi (REST, socket, tệp dùng chung)
    chat-lock-order.ts              # tầng khoá của chat (T5)
    conversation-open.repository.ts # NƠI DUY NHẤT INSERT hoi_thoai (HCH-01)
    message.repository.ts           # INSERT tin_nhan, đọc theo mã gửi, đếm giới hạn
    send-message.service.ts         # lõi gửi: một thân cho mọi cổng
    ports/chat-notifier.port.ts     # Noop; B6 là adapter
    ports/chat-realtime.port.ts     # Noop; B5 là adapter
  read/                             # B2, B3: danh sách, tin, chưa đọc, quan hệ, chi nhánh mặc định
  rest/                             # B2, B3, B4: controller, DTO, mapper theo vai trò
  attachments/                      # P3: kho tệp; B4: kiểm, xử lý, tải, dọn mồ côi
  realtime/                         # P4: gateway, xác thực bắt tay; B5: sự kiện, đẩy, quét phiên
  notifications/                    # B6: chat-notifier, câu chữ
  testing/                          # fixture, bất biến IVC, client socket giả
apps/web/src/features/chat/         # api/, realtime/, components/, pages/, testing/, index.ts
apps/web/src/shared/routes/chat-paths.ts
```

`ChatModule` nhập `AuthModule`, `RbacModule`, module export `ImageProcessor`. Biến môi trường mới duy nhất: `CHAT_FILES_DIR` (`.env.example`).

### 5.2 Dữ liệu: một migration bắt buộc (P1), một migration có điều kiện (P2)

**P1 (`[ĐỒNG BỘ TL]`, sửa cả ba file `docs/database/*` rồi migration chép đúng chữ đã sửa):** `hoi_thoai` và `tai_khoan_hoi_thoai` giữ **nguyên văn** DDL hiện có (bảng, chỉ mục `hoi_thoai_index_26`, `tai_khoan_hoi_thoai_index_27`, COMMENT, khoá ngoại, `chk_hoi_thoai_chi_nhanh`). `tin_nhan` thêm bốn cột, một UNIQUE, hai CHECK `[đề xuất]` tên:

```sql
CREATE TABLE `tin_nhan` (
  `tin_nhan_id` bigint PRIMARY KEY AUTO_INCREMENT,
  `hoi_thoai_id` bigint NOT NULL,
  `nguoi_gui_id` bigint NOT NULL,
  `ma_gui` char(36) COMMENT 'Mã ý định gửi do client sinh (UUID); NULL cho tin nạp sẵn. Duy nhất theo người gửi',
  `noi_dung` text NOT NULL COMMENT 'Văn bản thuần; rỗng chỉ khi có tệp đính kèm',
  `tep_dinh_kem` varchar(255) COMMENT 'Khoá lưu trữ của tệp trên volume riêng; NULL nếu không có tệp',
  `tep_ten_goc` varchar(255),
  `tep_loai` varchar(100) COMMENT 'Kiểu MIME do máy chủ xác định từ nội dung tệp',
  `tep_dung_luong` int COMMENT 'Số byte đã lưu',
  `thoi_diem_gui` datetime NOT NULL
);
CREATE UNIQUE INDEX `tin_nhan_index_nguoi_gui_ma_gui` ON `tin_nhan` (`nguoi_gui_id`, `ma_gui`);
ALTER TABLE `tin_nhan` ADD CONSTRAINT `chk_tin_nhan_tep` CHECK (
    (`tep_dinh_kem` IS NULL AND `tep_ten_goc` IS NULL AND `tep_loai` IS NULL AND `tep_dung_luong` IS NULL)
 OR (`tep_dinh_kem` IS NOT NULL AND `tep_ten_goc` IS NOT NULL AND `tep_loai` IS NOT NULL
     AND `tep_dung_luong` IS NOT NULL AND `tep_dung_luong` BETWEEN 1 AND 10485760)
);
ALTER TABLE `tin_nhan` ADD CONSTRAINT `chk_tin_nhan_noi_dung` CHECK (
    `noi_dung` <> '' OR `tep_dinh_kem` IS NOT NULL
);
```

(Phần `ENGINE=InnoDB …` như mọi bảng.) Lưu ý: (a) `tep_dung_luong IS NOT NULL` phải viết riêng, vì `NULL BETWEEN …` cho UNKNOWN và CHECK **chấp nhận** UNKNOWN (MCH-06); (b) collation `utf8mb4_unicode_ci` so chuỗi theo kiểu đệm khoảng trắng nên dự đoán `'   ' <> ''` là sai và CHECK chặn cả nội dung toàn dấu cách (**chưa đo**, MCH-07); nội dung toàn xuống dòng do service chặn; (c) UNIQUE được tạo **trước** khoá ngoại nên MySQL có thể không sinh chỉ mục riêng cho `nguoi_gui_id` (ảnh hưởng câu đếm giới hạn tốc độ: M4).

- Thứ tự câu của migration: ba `CREATE TABLE`, chỉ mục, COMMENT, bảy khoá ngoại, ba CHECK. Bảy khoá ngoại như DDL hiện có (`hoi_thoai.chi_nhanh_id`, `.nguoi_tao_id`; `tai_khoan_hoi_thoai.tai_khoan_id`, `.hoi_thoai_id`, `.tin_nhan_cuoi_da_doc_id`; `tin_nhan.hoi_thoai_id`, `.nguoi_gui_id`).
- `down`: xoá `tai_khoan_hoi_thoai`, `tin_nhan`, `hoi_thoai`; **từ chối** khi `tin_nhan` còn dòng (T11).
- Mốc `[đề xuất]` `1794225600000` (một ngày sau migration cuối `1794139200000` trên `main`; kiểm lại lúc làm).
- Entity `HoiThoai`, `TaiKhoanHoiThoai`, `TinNhan` (tên theo ngoại lệ AGENTS mục 4), enum `LOAI_HOI_THOAI`; đăng ký `entities.ts`, `migrations/index.ts`. Quy tắc DB: thêm UNIQUE và hai CHECK vào mục 1, sửa số đếm ở đầu file; thêm mục 2 "một hội thoại mỗi cặp, bảo đảm bằng khoá tài khoản Bệnh nhân" và "mã gửi".
- **P2 (có điều kiện, Q12):** (a) nếu M1 hay M2 FAIL: `hoi_thoai.tin_nhan_cuoi_id bigint NULL` (cập nhật trong giao dịch gửi, dưới khoá hội thoại), khoá ngoại tới `tin_nhan`, chỉ mục `(chi_nhanh_id, loai, tin_nhan_cuoi_id)`; (b) nếu M4 FAIL: chỉ mục `tin_nhan (nguoi_gui_id, thoi_diem_gui)` cho câu đếm giới hạn tốc độ (T6, 5.5). Sửa ba file `docs/database/*`, entity, `schema-parity`; mặt nạ ở `database/testing/official-schema.ts` cho migration P1 (nếp `reference_db_parity`: mỗi migration sau cần mặt nạ để migration trước còn khớp file SQL).
- **Không đổi gì khác:** không thêm cột vào `hoi_thoai` và `thong_bao` (Q9, Q11), không trạng thái đóng, không bảng giới hạn tốc độ.

### 5.3 Quyền và điều kiện: ai nhắn được ai (một chính sách `chat-access.policy.ts`)

| Việc | Bệnh nhân | Bác sĩ | Lễ tân | Quản trị viên |
|---|---|---|---|---|
| Mở hội thoại mới (ở tin đầu tiên) | **có**: bác sĩ `DangHoatDong` bất kỳ; chi nhánh bất kỳ tồn tại | không | không | không |
| Thấy hội thoại | dòng thành viên của mình | dòng thành viên **và** `loai = 'BenhNhan_BacSi'` | `loai = 'BenhNhan_LeTan'` **và** `chi_nhanh_id` = chi nhánh hiện tại của mình (không cần dòng thành viên) | không |
| Đọc tin, tải tệp, đánh dấu đọc | như "thấy" | như "thấy" | như "thấy" | không |
| Gửi | như "thấy" và bên kia hoạt động | như "thấy" và Bệnh nhân `DangHoatDong` | như "thấy" và Bệnh nhân `DangHoatDong` | không |

- "Bên kia hoạt động" của Bệnh nhân: hội thoại bác sĩ ⇒ bác sĩ `DangHoatDong`; hộp thư chung ⇒ luôn gửi được (chi nhánh không có trạng thái). Người gửi bị khoá không đăng nhập được (auth đã chặn).
- Không thấy ⇒ **404 `KHONG_TIM_THAY` cùng thân** cho "không có", "của người khác", "id sai dạng" (T3). Sai vai trò ở route riêng ⇒ 403 `KHONG_DU_QUYEN`.
- Chi nhánh của Lễ tân đọc bằng `ReceptionScopeService.resolve` ở **mỗi** yêu cầu, mỗi sự kiện socket và mỗi lần đẩy; không lấy từ token hay client.
- Tài khoản chỉ lấy từ token; không DTO nào nhận `taiKhoanId`.

### 5.4 Thứ tự khoá, giao dịch, tương tranh (**thêm tầng của chat, không đảo bảng khoá toàn cục booking 5.3**)

Mọi luồng ghi đi trong `withBookingTransaction` (READ COMMITTED, thử lại 1213/1205 hai lần, chờ khoá 3 giây; T5). Tầng (nhỏ khoá trước):

| Tầng | Hàng khoá | Mở hội thoại + tin đầu | Gửi vào hội thoại đã có | Đánh dấu đã đọc |
|---|---|---|---|---|
| 1 | `tai_khoan` của **Bệnh nhân chủ hội thoại** `FOR UPDATE` | **có** | **KHÔNG** | không |
| C1 | `hoi_thoai` | hàng mới chèn (chưa ai thấy nên không phải chờ) | `FOR UPDATE` theo khoá chính | `FOR SHARE` theo khoá chính |
| C2 | `tin_nhan` (`INSERT`; khoá `S` ngầm của khoá ngoại trên `hoi_thoai`, `tai_khoan` người gửi) | có | có | chỉ đọc (kiểm thuộc hội thoại) |
| C3 | `tai_khoan_hoi_thoai` | chèn thành viên | dòng của Lễ tân nếu chưa có (`INSERT … ON DUPLICATE KEY UPDATE` không đổi gì) | upsert mốc |
| 7c | `thong_bao` | `INSERT` nếu chưa có dòng chưa đọc | `INSERT` nếu chưa có | `UPDATE` đã đọc |

Quy tắc:
1. **Một nơi duy nhất** chèn `hoi_thoai` (HCH-01). Tìm-hoặc-tạo: khoá tài khoản Bệnh nhân (câu đầu tiên), rồi tìm hội thoại theo `nguoi_tao_id`, `loai` và bác sĩ (qua `tai_khoan_hoi_thoai`) hoặc `chi_nhanh_id`. **Chưa có** ⇒ chèn hội thoại, thành viên, tin đầu và thông báo **trong cùng giao dịch** (hàng mới không ai khác thấy nên không phải chờ). **Đã có** ⇒ giao dịch kết thúc ngay (không khoá gì thêm) rồi chạy **luồng gửi thường**.
2. **Vì sao không khoá hội thoại đã có trong khi giữ khoá tài khoản:** luồng gửi thường giữ `hoi_thoai` `X` rồi cần `S` trên tài khoản Bệnh nhân (khoá ngoại của `tin_nhan` hay `thong_bao`); nếu luồng mở giữ `X` tài khoản và chờ `hoi_thoai` thì thành chu trình. Vì cùng lý do, luồng gửi **không** khoá tài khoản người gửi (T6).
3. **Gửi thường khoá `hoi_thoai` `FOR UPDATE` trước mọi thứ:** các tin của một hội thoại được cấp id và commit **tuần tự**, nên thứ tự `tin_nhan_id` bằng thứ tự hiện, và câu "tin sau mốc bù" không bao giờ bỏ sót tin commit muộn. Không có khoá này, giao dịch cấp id 10 có thể commit sau id 11 và người đang thăm dò đã nhận 11 sẽ mất 10.
4. Trong khoá: kiểm lại quyền và trạng thái bên nhận, **tìm mã gửi**, đếm giới hạn tốc độ, `INSERT`, ghi thông báo. `ER_DUP_ENTRY` trên `tin_nhan_index_nguoi_gui_ma_gui` (đua cùng mã gửi ở hai hội thoại) được đổi thành 409, không 500.
5. **Đánh dấu đọc** khoá `hoi_thoai` `FOR SHARE` **trước** khi ghi `tai_khoan_hoi_thoai` (cùng thứ tự với gửi, vì gửi cũng có thể chèn dòng thành viên của Lễ tân), kiểm tin thuộc hội thoại, upsert chỉ tiến tới: `INSERT … AS moi ON DUPLICATE KEY UPDATE tin_nhan_cuoi_da_doc_id = GREATEST(COALESCE(tai_khoan_hoi_thoai.tin_nhan_cuoi_da_doc_id, 0), moi.tin_nhan_cuoi_da_doc_id)` (cú pháp bí danh dòng của MySQL 8.0.19+). **Đã đo ở X1 M7 (26/11/2026):** cột bên trong `COALESCE` **phải có tiền tố tên bảng**; viết không tiền tố như bản trước của dòng này thì MySQL 8.4 báo 1052 `ER_NON_UNIQ_ERROR` (cột trùng tên với cột của bí danh `moi`). `affectedRows` dưới `mysql2`: chèn mới 1, mốc tiến 2, mốc lùi hay bằng 1 (cờ `CLIENT_FOUND_ROWS`), nên không dùng `affectedRows` để biết mốc có đổi.
6. Tác dụng phụ ngoài DB (**đẩy** qua socket) chạy **sau commit, đúng một lần**, bọc `try/catch`; lỗi đẩy không làm hỏng việc gửi (web bù bằng REST). Tin trùng mã gửi không đẩy lại.
7. Kết quả **có kiểu**, không ném `AppException` trong thân (nếp booking); một mốc `now = toSecond(nowVN())` cho cả lượt.

**Phân tích từng cặp tương tranh (chưa đo; X1 đo, X2 chạy):**

| Cặp | Phân tích | Kết luận dự kiến |
|---|---|---|
| mở × mở cùng cặp (hai tab, socket và REST) | cùng khoá tài khoản ⇒ tuần tự; bên sau thấy hội thoại đã có | đúng một hội thoại, hai tin (hoặc một nếu cùng mã gửi) |
| mở bác sĩ × mở chi nhánh, cùng Bệnh nhân | tuần tự theo tài khoản | hai hội thoại |
| mở × gửi vào hội thoại khác của cùng Bệnh nhân | gửi giữ hội thoại, chờ `S` tài khoản; mở giữ `X` tài khoản nhưng không chờ hội thoại nào | không chu trình |
| gửi × gửi cùng hội thoại | tuần tự theo `hoi_thoai` | id tăng đúng thứ tự commit |
| gửi × gửi cùng mã gửi | cùng hội thoại: bên sau thấy mã, trả tin cũ; khác hội thoại: UNIQUE chặn, 409 | một dòng |
| gửi × đánh dấu đọc cùng hội thoại | `X` và `S` trên `hoi_thoai` | tuần tự |
| đánh dấu × đánh dấu cùng người | `S` + `S`, đụng ở hàng thành viên; upsert có thể sinh 1213 | thử lại; mốc là lớn nhất |
| gửi × "đánh dấu tất cả đã đọc" của Trung tâm thông báo | chỉ gặp ở `thong_bao`; phía kia không xin khoá chat | không chu trình; đo M6 |
| gửi × khoá tài khoản (admin), đăng nhập (auth) | `S` ngầm trên `tai_khoan` chờ `X` ngắn của phía kia; phía kia không chờ bảng chat | chờ ngắn; hết giờ thì thử lại |
| hai Lễ tân trả lời cùng lúc | tuần tự theo hội thoại | hai tin, hai dòng thành viên |
| dồn 25 tin cùng lúc một hội thoại | đếm trong khoá hội thoại | đúng 20 tin được nhận |
| dồn tin ở nhiều hội thoại cùng lúc | đếm không khoá người gửi | giới hạn mềm, vượt vài tin (T6) |

**Bất biến** (kiểm sau mỗi ca đồng thời; `chat/testing/`): **IVC-01** tối đa một hội thoại mỗi cặp (Bệnh nhân, Bác sĩ) và (Bệnh nhân, chi nhánh); **IVC-02** hội thoại bác sĩ có đúng hai thành viên (Bệnh nhân là `nguoi_tao_id`, một Bác sĩ), hộp thư chung có Bệnh nhân là thành viên và `nguoi_tao_id`, thành viên khác là tài khoản Lễ tân; **IVC-03** mọi hội thoại có ít nhất một tin; **IVC-04** mọi mốc đã đọc trỏ tin cùng hội thoại; **IVC-05** không hai tin cùng `(nguoi_gui_id, ma_gui)`; **IVC-06** tối đa một `thong_bao` chưa đọc `TinNhanMoi:{id}` mỗi (tài khoản, hội thoại); **IVC-07** người gửi của mỗi tin là Bệnh nhân chủ, Bác sĩ thành viên, hoặc tài khoản Lễ tân (hộp thư chung); **IVC-08** (chỉ test) mọi `tep_dinh_kem` có tệp trên đĩa.

### 5.5 Lõi gửi tin (B1; dùng chung cho REST, socket và tệp)

**Vào:** người gửi (tài khoản, vai trò, từ token), đích (`hoiThoaiId` hoặc `bacSiId` hoặc `chiNhanhId`, đúng một), `noiDung`, `maGui`, tuỳ chọn thông tin tệp đã xử lý (B4).

**Kiểm nội dung (hàm thuần `chat-content.rules.ts`):** đổi `CRLF`, `CR` thành `LF`; chuẩn hoá NFC; cắt khoảng trắng hai đầu; từ chối ký tự điều khiển trừ `\n`, `\t`; độ dài **1 đến 2000 điểm mã** (rỗng chỉ khi có tệp); không đụng HTML (lưu nguyên, hiển thị dạng chữ). `maGui` đúng dạng UUID.

**Thứ tự lỗi `[đề xuất]`:** (1) dữ liệu sai (400); (2) không thấy đích (404); (3) mã gửi đã dùng đúng hội thoại và đúng nội dung ⇒ **thành công**, trả tin cũ (kể cả khi lúc này bên kia bị khoá hay đã hết lượt); mã đã dùng cho nội dung hay hội thoại khác ⇒ 409 `CHAT_MA_GUI_DA_DUNG`; (4) bên kia không hoạt động (409); (5) quá 20 tin trong 60 giây gần nhất (429): đếm bằng `SELECT COUNT(*) FROM (SELECT 1 FROM tin_nhan WHERE nguoi_gui_id = ? AND thoi_diem_gui > ? LIMIT 20) t` `[đề xuất]` với mốc `now − 60 giây`; chỉ mục `(nguoi_gui_id, thoi_diem_gui)` chỉ có khi M4 FAIL (P2(b)).

**Ra:** `Sent` | `Duplicate` | lỗi có kiểu. Cổng `ChatNotifier` (trong giao dịch) và `ChatRealtime` (sau commit) mặc định `Noop`; B6 và B5 thay adapter (nếp cổng booking).

### 5.6 API REST (tiền tố `/api` qua proxy; `Cache-Control: no-store` đặt cả cho nhánh lỗi; id BIGINT là chuỗi; tên `[đề xuất]`, T2)

Mọi route `@Roles` ghi rõ trên route, tài khoản từ token, không `OriginGuard` (xác thực bằng header), không `RequireAdminScope`.

| Route | Vai trò | Việc | Task |
|---|---|---|---|
| `GET /chat/conversations?loc=&q=&truoc=&limit=` | BN, BS, LT | danh sách thấy được, sắp theo tin cuối mới nhất; `loc` = `tat-ca` hoặc `chua-doc` (Bệnh nhân thêm `bac-si`, `le-tan`); `q`: Lễ tân tìm họ tên, SĐT, email; Bác sĩ chỉ họ tên; con trỏ `truoc` = id tin cuối của dòng cuối trang trước; `limit` mặc định 20, tối đa 50 | B2 |
| `GET /chat/conversations/:id` | BN, BS, LT | chi tiết đầu khung: đối tác, quan hệ, banner, `coTheGui`, `lyDoKhongGui` | B2 |
| `GET /chat/conversations/:id/messages?truoc=&sau=&limit=` | BN, BS, LT | tin theo id **tăng dần**; không tham số: trang mới nhất; `truoc`: tin cũ hơn; `sau`: tin mới hơn (không dùng cùng lúc); `limit` mặc định 30, tối đa 100 | B2 |
| `POST /chat/conversations/:id/read` `{ tinNhanId }` | BN, BS, LT | đẩy mốc tiến tới; tin không thuộc hội thoại ⇒ 404; cũ hơn mốc ⇒ 200 không đổi | B2 |
| `GET /chat/unread-count` | BN, BS, LT | `{ soHoiThoaiChuaDoc }` (trần 100) | B2 |
| `POST /chat/conversations/:id/messages` `{ noiDung, maGui }` hoặc `multipart` (B4) | BN, BS, LT | gửi vào hội thoại đã có | B3, B4 |
| `GET /chat/doctors/:bacSiId` | BN | đầu khung trước tin đầu: tên, chức danh, quan hệ, `hoiThoaiId` hay `null`, `coTheGui`; **không tạo** gì | B3 |
| `POST /chat/doctors/:bacSiId/messages` | BN | tìm-hoặc-tạo rồi gửi | B3, B4 |
| `GET /chat/branches/:chiNhanhId` | BN | tên chi nhánh, `hoiThoaiId` hay `null` | B3 |
| `POST /chat/branches/:chiNhanhId/messages` | BN | tìm-hoặc-tạo rồi gửi | B3, B4 |
| `GET /chat/default-branch` | BN | `{ chiNhanhId, nguon }`, `nguon` = `LichHenSapToi`, `LichHenDaKham` hay `null` (Q4, MH2) | B3 |
| `GET /chat/messages/:tinNhanId/attachment` | BN, BS, LT | tải tệp (5.8) | B4 |

- Gửi thành công **201** `{ hoiThoaiId, tinNhan }`; mã gửi trùng hợp lệ **200** cùng thân.
- **Mục tin:** `{ id, laCuaToi, nguoiGui: { vaiTro, tenHienThi }, noiDung, tep: { ten, loai, dungLuong } | null, thoiDiemGui, maGui }` (`maGui` chỉ trả cho chính người gửi). Tên hiển thị: Bệnh nhân thấy bác sĩ là "{chức danh} {họ tên}", Lễ tân là **"Lễ tân · {tên chi nhánh}"** (Q18, không id); Lễ tân thấy họ tên đồng nghiệp; Bác sĩ thấy họ tên Bệnh nhân.
- **Mục danh sách:** `{ id, loai, doiTac, tinCuoi: { id, trichDan (≤ 100 ký tự, hoặc "[Ảnh]"/"[Tệp PDF]"), nguoiGuiHienThi, thoiDiemGui }, soTinChuaDoc (trần 100), trangThaiTraLoi, traLoiBoi, quanHe }`; `doiTac` của Lễ tân là Bệnh nhân gồm **họ tên và SĐT** (Q23), của Bác sĩ chỉ họ tên; `trangThaiTraLoi` (`ChoTraLoi`, `DaTraLoi`) chỉ cho Lễ tân (Q15); `quanHe` (`DaTungKham`, `ChuaTungKham`) cho hội thoại bác sĩ (Q16). **Danh sách trắng theo vai trò** (QCH-11): không trả `tai_khoan_id`, email, ngày sinh, địa chỉ.
- Tìm kiếm tái dùng `normalizeKeyword`, `isValidKeyword`, `buildLookupPatterns` của `patient` (mã lỗi `TU_KHOA_KHONG_HOP_LE`), ràng buộc `loai` và `chi_nhanh_id` nằm **trong chính câu SQL**.
- Chưa đọc: `tin_nhan_id > COALESCE(mốc, 0) AND nguoi_gui_id <> người xem`, đếm qua chỉ mục `(hoi_thoai_id, tin_nhan_id)` với `LIMIT 100`.

### 5.7 WebSocket (P4, B5, F2; Q2, Q8, Q22; tên và số `[đề xuất]`, T1, T8)

- **Đường:** trình duyệt nối `/api/socket.io/`, proxy bỏ `/api`; `transports: ['websocket']`.
- **Proxy (P4):** `nginx.conf` hiện chỉ có `location ^~ /api/` cho API (đã có `proxy_http_version 1.1` nhưng `Connection ""`, không `Upgrade`, `proxy_read_timeout 60s`). P4 thêm **location riêng `^~ /api/socket.io/`** (tiền tố dài hơn nên được chọn trước), cùng nếp `resolver` và `rewrite` bỏ `/api`, có `proxy_http_version 1.1`, `proxy_set_header Upgrade $http_upgrade`, `proxy_set_header Connection "upgrade"`, các header `Host` và `X-Forwarded-*`, `proxy_read_timeout` và `proxy_send_timeout` đủ dài `[đề xuất]` 3600 giây (tối thiểu lớn hơn nhịp ping của socket.io); không đổi location `/api/`. `vite.config.ts` thêm khoá proxy `'/api/socket.io/'` có `ws: true`, đặt trước khoá `'/api/'` (kiểm ở P4). Bắt tay thật qua nginx dựng bằng compose là ca **SOC-16 của P4** (DB tạm, không đụng DB `clinix`); X1 M10 đo giữ kết nối rảnh; X3 chạy lại đầu cuối (KCH-10).
- **Bắt tay:** access token gửi trong gói xác thực của giao thức (`auth.token`), **không** trên URL hay query; kiểm chữ ký (`verifyAccessToken`), phiên (`resolveActive`), vai trò thuộc Bệnh nhân, Bác sĩ, Lễ tân (Quản trị viên bị từ chối), header `Origin` đúng `WEB_ORIGIN`, tối đa 5 kết nối mỗi tài khoản. Từ chối: lỗi kết nối kèm `maLoi`.
- **Vòng đời:** máy chủ ngắt khi token hết hạn; mỗi sự kiện vào kiểm lại phiên; quét phiên mọi kết nối mỗi 60 giây; web đóng socket khi đăng xuất, nối lại với token mới (gọi một route REST để lớp client làm mới token khi cần).
- **Client → máy chủ:** `chat:gui` `{ hoiThoaiId | bacSiId | chiNhanhId, noiDung, maGui }`, trả lời bằng ack `{ ok: true, hoiThoaiId, tinNhan }` hoặc `{ ok: false, maLoi, loi? }`. Cùng luật DTO với REST (từ chối trường lạ), gọi **cùng lõi gửi**; không nhận tệp; gói ≤ 64 KB; sự kiện lạ bị bỏ qua; lỗi ngoài dự kiến trả `LOI_HE_THONG`, log chỉ mã và id.
- **Máy chủ → client:** `chat:tin-moi` `{ hoiThoaiId, tinNhan }` tới mọi kết nối (kể cả tab khác của người gửi) của: Bệnh nhân và Bác sĩ của hội thoại bác sĩ; Bệnh nhân và **mọi Lễ tân đang hoạt động của chi nhánh** (tính từ DB lúc đẩy). Thân được dựng **riêng cho từng người nhận** theo danh sách trắng 5.6. Trước khi đẩy, kiểm phiên của từng kết nối; kết nối không còn hợp lệ bị ngắt và không nhận.
- **Đẩy là cố gắng hết sức; REST là nguồn đúng.** Web: khi nối lại, khi tab hiện lại và mỗi 60 giây: tải trang mới nhất của hội thoại đang mở, gộp theo id; nếu không chồng lên phần đang có thì tải lùi bằng `truoc` (giới hạn số trang, quá thì dựng lại khung); tải lại danh sách và số đếm.
- **Mốc bù** khi dự phòng bằng `sau=`: id lớn nhất đã tải **liền mạch bằng REST**; tin được đẩy chỉ hiển thị, **không** tăng mốc (R11).
- **Dự phòng khi mất kết nối:** gửi tin chữ qua REST, thăm dò khung đang mở và danh sách mỗi 15 giây, dừng khi tab ẩn hay mất mạng; số đếm 30 giây; nối lại được thì ngừng thăm dò.
- **Gửi qua socket mà không có ack sau 10 giây:** coi là chưa rõ, gửi lại bằng REST **cùng `maGui`** (không trùng).
- Không bật `DEBUG` của socket.io; không log gói tin.
- **Tên hằng:** hằng tên sự kiện socket **không** đặt đuôi `_EVENTS` (ví dụ `CHAT_SOCKET_MESSAGES`), vì DMS-13 quét mọi `export const …_EVENTS` trong `apps/api/src` và đỏ nếu hằng chưa khai ở danh mục thông báo; chỉ `CHAT_NOTIFICATION_EVENTS` (B6) mang đuôi đó.

### 5.8 Tệp đính kèm (P3, B4, F6; Q1, Q5, Q6, Q7, Q22)

- **Nhận:** JPEG, PNG, WebP, PDF; mỗi tin một tệp; ≤ 10 MB đầu vào; kiểm **theo nội dung**, không tin tên hay `Content-Type` của client. Ảnh qua `ImageProcessor` (≤ 25 megapixel, tĩnh; ra ≤ 2 MB; bỏ EXIF và metadata). PDF: bắt đầu `%PDF-` và có `%%EOF` trong 1024 byte cuối; không đổi byte.
- **Kho:** giao diện `ChatFileStore` (ghi, đọc luồng, xoá, liệt kê); bản đĩa cục bộ ở `CHAT_FILES_DIR`; khoá `yyyy/mm/<uuid>.<đuôi theo loại đã nhận ra>`; ghi file tạm rồi đổi tên; đọc chỉ nhận khoá đúng mẫu (chặn đi ngược thư mục). Tên gốc chỉ là dữ liệu hiển thị: bỏ phần đường dẫn và ký tự điều khiển (kể cả ký tự đổi chiều chữ), ≤ 255 điểm mã, rỗng thì "tep-dinh-kem" kèm đuôi.
- **Tải lên:** `multipart` trường `file`, `noiDung`, `maGui`; `files: 1`, trường lạ bị từ chối; tối đa 4 tải đồng thời (quá thì 503), hạn giờ 45 giây; nginx `client_max_body_size 11m` đã đủ.
- **Thứ tự:** kiểm quyền và mã gửi (trùng ⇒ trả tin cũ, không xử lý tệp) → xử lý → ghi tệp → giao dịch gửi (kiểm lại dưới khoá) → commit; giao dịch lỗi hoặc trùng ⇒ xoá tệp vừa ghi.
- **Dọn mồ côi:** job `@Cron` hằng ngày xoá tệp **không dòng nào tham chiếu** và cũ hơn 24 giờ; không bao giờ xoá tệp được tham chiếu; tắt khi `NODE_ENV=test`.
- **Tải xuống:** kiểm quyền như đọc tin; header `Content-Type` từ `tep_loai`, `Content-Length`, `Content-Disposition: attachment` (tên mã hoá UTF-8), `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; sandbox`, `Cache-Control: no-store`; tệp mất trên đĩa ⇒ 404 và log id tin.
- **Web:** tải bằng lớp client (đường nhị phân mới), hiện ảnh qua object URL (thu hồi khi gỡ), PDF tải xuống bằng liên kết `download`; không `iframe`, không `embed`.
- **Hạ tầng:** volume `chat-files` ở hai file compose, gắn `/data/chat`; `Dockerfile` tạo thư mục thuộc người dùng `node`; thư mục dev nằm trong `.gitignore`; biến ở `.env.example` giá trị giả; sao lưu cùng DB.

### 5.9 Mốc đã đọc, tin chưa đọc, hộp thư chung

- Chưa đọc theo đúng công thức của bảng (5.6); mốc **chỉ tiến tới**, kiểm thuộc cùng hội thoại ở service (quy tắc 14).
- Lễ tân chưa có dòng ⇒ mọi tin của người khác là chưa đọc; dòng được tạo khi mở (web gọi `read`) hoặc trả lời lần đầu.
- Số ở menu = **số hội thoại** có ít nhất một tin chưa đọc (Q15), trần 100 hiện "99+"; số ở từng dòng = số tin chưa đọc, trần "99+".
- Nhãn Lễ tân (Q15): tin cuối của Bệnh nhân ⇒ "Chờ trả lời"; tin cuối của Lễ tân ⇒ "Đã trả lời · {tên}" (chính mình thì "Đã trả lời · Bạn").
- Web gọi `read` với id lớn nhất đang hiện, chỉ khi khung đang mở và tab hiện; một lần mỗi giá trị.

### 5.10 Thông báo tin nhắn mới (B6; Q11; `[ĐỤNG notification]`)

- Mã `TinNhanMoi`, lưu `loai_su_kien = 'TinNhanMoi:{hoiThoaiId}'` (≤ 100 ký tự; `baseCodeOf` cắt ở dấu `:` như hậu tố `:v{n}` sẵn có).
- **Người nhận:** Bệnh nhân gửi ở hội thoại bác sĩ ⇒ Bác sĩ; ở hộp thư chung ⇒ mọi Lễ tân `DangHoatDong` của chi nhánh; Bác sĩ hay Lễ tân gửi ⇒ Bệnh nhân (đồng nghiệp Lễ tân không nhận). Người nhận không hoạt động thì không ghi.
- **Gộp:** trong giao dịch gửi, dưới khoá hội thoại, chỉ `INSERT` khi người đó chưa có dòng chưa đọc cùng `loai_su_kien`. Đánh dấu đọc hội thoại mà **không còn tin chưa đọc** ⇒ cập nhật các dòng đó thành đã đọc. Đọc một phần ⇒ giữ chưa đọc.
- **Chữ `[đề xuất]`** (không bao giờ có nội dung tin, tên tệp, SĐT, email; ≤ 500): Bác sĩ "Bạn có tin nhắn mới từ bệnh nhân {họ tên}."; Lễ tân "Bệnh nhân {họ tên} nhắn tin vào hộp thư chi nhánh {tên}."; Bệnh nhân "Bạn có tin nhắn mới từ {chức danh} {họ tên}." hoặc "Bạn có tin nhắn mới từ lễ tân chi nhánh {tên}."
- **Không email**, không `email_thong_bao` (`coThu: false`), không `nhat_ky_hanh_dong`.
- **Danh mục:** nhóm mới `TinNhan`, tiêu đề "Tin nhắn mới" `[đề xuất]`, người nhận Bệnh nhân, Bác sĩ, Lễ tân, `lienKet: 'HoiThoai'`; `notification-link.ts` trả `{ kieu: 'HoiThoai', hoiThoaiId }` tách từ hậu tố; web đổi sang trang Tin nhắn theo vai trò (`?hoiThoai=`); biểu tượng nhóm; DMS-13 bỏ `chat` khỏi `CHO_MODULE`, thêm `CHAT_NOTIFICATION_EVENTS` vào tập đối chiếu.
- Chat **tự ghi** thông báo của mình ở `chat/notifications/` (nếp Q5 của thông báo); không sửa repository của Trung tâm thông báo.
- **Quy tắc DB (`[ĐỒNG BỘ TL]`, B6):** thêm vào `docs/database/clinix_quy_tac_nghiep_vu.md` mã `TinNhanMoi` (chỉ trong ứng dụng, số 21 loại có thư không đổi) và dạng hậu tố `:{hoiThoaiId}` bên cạnh `:v{n}` đã có (L15); không đổi DDL.

### 5.11 Quyền riêng tư và an toàn

- **Nội dung tin, tên tệp, từ khoá tìm kiếm không bao giờ** vào log, thông báo, email, nhật ký hành động, thông điệp lỗi, URL (trừ từ khoá tìm kiếm ở query theo nếp tra cứu hồ sơ, T13). Log chỉ id, số đếm, mã lỗi, tên lớp lỗi. Không log DTO. Ca BCH bắt log thật (kể cả lỗi DB cưỡng bức).
- Hiển thị bằng nút văn bản (text node) của React, `white-space: pre-wrap`, **không** `dangerouslySetInnerHTML`, không tự biến chữ thành liên kết ở đợt này.
- Quản trị viên: không route (403), socket từ chối.
- Phản hồi theo danh sách trắng từng vai trò; `no-store`.
- Chống lạm dụng: 20 tin/phút, 5 kết nối mỗi tài khoản, gói socket 64 KB, tải đồng thời 4.
- Giữ mãi (Q14); không sửa, xoá, thu hồi.
- Web không lưu nội dung tin ở `localStorage`, `sessionStorage`, URL; nháp giữ trong bộ nhớ.
- Trợ lý AI sau này **không** đọc bảng chat (đề xuất phân ranh cho scope AI).

### 5.12 Cổng và điểm nối với module khác

| Module | Điểm nối | Việc cụ thể | Ghi chú |
|---|---|---|---|
| `auth` | `TokenService`, `SessionService`, `@Roles`, `CurrentUser()`, cách so `Origin` | dùng nguyên; socket tự gọi | `[ĐỤNG auth]` chỉ nếu phải export thêm (đã export `TokenService`, `SessionService`) |
| `rbac` | `ReceptionScopeService` | phạm vi Lễ tân | không sửa |
| `notification` | danh mục, liên kết, web | 5.10 | `[ĐỤNG notification]`, B6, F1 |
| `booking` | `withBookingTransaction`, bảng khoá | dùng nguyên; đọc `lich_hen` | không ghi bảng của booking |
| `patient` | luật từ khoá; khung Bệnh nhân, Lễ tân | tái dùng; thêm số đếm menu | `[ĐỤNG patient]` (web shell) |
| `doctor` | khung Bác sĩ | thêm số đếm, route | `[ĐỤNG doctor]` |
| `search` | nút "Nhắn tin", API `public/branches` | liên kết; bộ chọn chi nhánh | `[ĐỤNG search]` |
| `common/upload` | `ImageProcessor` | export thêm một provider | `[ĐỤNG upload]` |
| `mail`, `admin`, `payment`, `wallet` | — | không đổi (khoá tài khoản của admin tự thu hồi phiên) | |
| `waitlist`, báo cáo | — | không liên quan | |
| AI (sau) | đường dẫn trang Tin nhắn | chỉ giữ route ổn định | `[SAU]` |

### 5.13 Giao diện (web; một khung dùng chung `ChatWorkspace`, cấu hình theo vai trò; mức GỌN)

- **Route:** `/benh-nhan/tin-nhan`, `/le-tan/tin-nhan`, `/bac-si-portal/tin-nhan` (khớp manifest Make); `?hoiThoai=` mở hội thoại; Bệnh nhân thêm `?bacSi=` và `?chiNhanh=` để bắt đầu; hằng ở `shared/routes/chat-paths.ts`.
- **Menu:** `to` cho "Tin nhắn" ba khung, số hội thoại chưa đọc (`99+`, ẩn khi 0, nhãn truy cập "Tin nhắn, N hội thoại chưa đọc"); router lấy số rồi truyền xuống như chuông (`features/patient`, `features/doctor` không import `features/chat`).
- **Danh sách:** tên, xem trước, giờ Việt Nam, số chưa đọc, nhãn loại hay nhãn trả lời; tab "Tất cả / Chưa đọc" (Bệnh nhân thêm "Bác sĩ / Lễ tân"); ô tìm cho Lễ tân và Bác sĩ (gửi lên máy chủ, không lọc ở client); "Xem thêm" theo con trỏ.
- **Khung tin:** tin cũ trên, mới dưới; ngăn theo ngày "Hôm nay", "Hôm qua", dd/MM; "Xem tin cũ hơn"; tự cuộn khi đang ở cuối, ngược lại nút "Tin mới ↓" `[đề xuất]`; banner (hội thoại bác sĩ): "Chỉ tư vấn sơ bộ, không thay khám trực tiếp, không kê đơn."; chip "Đã từng khám" / "Chưa từng khám".
- **Ô soạn:** nhiều dòng; **Enter gửi, Shift+Enter xuống dòng**; đếm ký tự khi gần 2000; nút đính kèm (F6); khi không gửi được (`coTheGui` sai) thì khoá kèm lý do; tin đang gửi hiện "Đang gửi…", lỗi hiện "Gửi lại" (cùng `maGui`) và **giữ nguyên nội dung** (A1); bấm đúp không gửi hai lần; nháp giữ theo hội thoại trong bộ nhớ.
- **Bắt đầu trò chuyện (Bệnh nhân):** "Nhắn lễ tân" mở bộ chọn chi nhánh đã chọn sẵn theo Q4 (hoặc chi nhánh đang chọn), bấm xác nhận mới vào khung; "Nhắn bác sĩ" dẫn tới trang tra cứu bác sĩ (Q24). Hội thoại chỉ được tạo khi gửi tin đầu.
- **Trạng thái:** khung giữ chỗ khi tải; rỗng ("Chưa có hội thoại nào.", "Chưa có tin nhắn nào."); lỗi có "Thử lại"; mất mạng (banner có sẵn); quá giờ; mất kết nối socket: dòng nhỏ "Đang nối lại, tin mới có thể đến chậm." `[đề xuất]`; 404 hội thoại: "Bạn không có quyền xem hội thoại này.".
- **Bố cục:** hai cột từ 1024 px; hẹp hơn thì danh sách và khung là hai màn có "Quay lại"; 375 px không tràn ngang.
- **Trợ năng:** danh sách là `ul` các nút có nhãn gồm số chưa đọc; khung tin `role="log"` đọc **chỉ tin mới đến** (không đọc cả lịch sử khi tải); ô soạn có nhãn; tiêu điểm về khung khi mở, về dòng vừa mở khi quay lại; Esc quay lại ở màn hẹp.
- **Kiến trúc:** chỉ `features/chat/realtime/` mở socket (một kết nối mỗi tab, do router mở cho Bệnh nhân, Bác sĩ, Lễ tân); `fetch` chỉ ở lớp client; không kho trình duyệt cho nội dung; `features/chat` chỉ import `shared/` và `auth` qua `index.ts` (đường dẫn trang tra cứu bác sĩ do router truyền xuống, không import `features/search`).

### 5.14 Mã lỗi → chữ (`maLoi` ổn định; chữ `[đề xuất]`; web chọn theo `maLoi`)

| `maLoi` | HTTP | Khi nào | Câu hiển thị |
|---|---|---|---|
| `DU_LIEU_KHONG_HOP_LE` (`loi[{truong:'noiDung', ma:'NOI_DUNG_TRONG' / 'NOI_DUNG_QUA_DAI' / 'NOI_DUNG_KY_TU_KHONG_HOP_LE'}]`, `maGui`) | 400 | nội dung, mã gửi, tham số sai | "Tin nhắn phải có từ 1 đến 2000 ký tự." (theo `ma`) |
| `TU_KHOA_KHONG_HOP_LE` | 400 | từ khoá tìm sai | "Từ khoá cần từ 2 đến 100 ký tự." |
| `KHONG_TIM_THAY` | 404 | không thấy hội thoại, bác sĩ, chi nhánh, tin, tệp | "Bạn không có quyền xem hội thoại này." (khung chat) hoặc "Không tìm thấy." |
| `KHONG_DU_QUYEN` | 403 | sai vai trò, Lễ tân hết phạm vi | "Bạn không có quyền thực hiện thao tác này." |
| `CHAT_NGUOI_NHAN_KHONG_HOAT_DONG` | 409 | bên nhận bị khoá hay chờ kích hoạt | "Tài khoản người nhận đang ngưng hoạt động nên chưa gửi được. Bạn có thể nhắn lễ tân." |
| `CHAT_MA_GUI_DA_DUNG` | 409 | mã gửi dùng lại cho nội dung khác | "Chưa gửi được. Vui lòng gửi lại." (web sinh mã mới) |
| `CHAT_GUI_QUA_NHANH` | 429 | quá 20 tin trong một phút | "Bạn gửi quá nhanh. Đợi một chút rồi gửi lại." |
| `CHAT_TEP_KHONG_HOP_LE` | 400 | loại tệp sai, ảnh hỏng, PDF không đúng | "Chỉ gửi được ảnh JPEG, PNG, WebP hoặc tệp PDF." |
| `CHAT_TEP_QUA_LON` | 413 | tệp hơn 10 MB | "Tệp tối đa 10 MB." |
| `CHAT_TAI_TEP_DANG_BAN` | 503 | quá số tải đồng thời | "Hệ thống đang bận nhận tệp. Thử lại sau ít phút." |
| `HE_THONG_DANG_BAN` | 503 | tranh khoá hết lượt thử | "Hệ thống đang bận. Thử lại sau." |
| `LOI_HE_THONG` | 500 | lỗi ngoài dự kiến | "Chưa gửi được. Nội dung vẫn còn, hãy thử lại." |
| (mạng, quá giờ) | — | không tới máy chủ | "Chưa gửi được do mạng. Nội dung vẫn còn, hãy thử lại." |

Mã lỗi ảnh của `ImageProcessor` (`ANH_…`) được đổi sang mã `CHAT_TEP_…` tại lớp chat.

### 5.15 Kiểm thử, việc phải **đo thật** trước khi viết mã, dữ liệu mẫu

- **Mức kiểm ĐẦY ĐỦ** cho P1, P2, P3, P4, B1 đến B6, X2: đột biến (mỗi ca một lượt vitest một file nối tiếp, xin "RẢNH" của phiên kiểm trước khi chạy: đột biến là lane NẶNG), `test:int` và `test:e2e` trên MySQL thật, ca đồng thời chạy một mình, EXPLAIN cho câu SQL mới. **Mức GỌN** cho F1 đến F6 (đột biến web bốn loại; jscpd và gitleaks do CI đo, báo cáo ghi "CI đo").
- **Đột biến bắt buộc** (mỗi dòng ít nhất một ca bắt): (1) bỏ khoá tài khoản khi mở (LOI-16, CCH-01); (2) luôn tạo hội thoại mới (LOI-02); (3) khoá hội thoại đã có trong khi giữ khoá tài khoản (LOI-18, CCH-03); (4) bỏ khoá `hoi_thoai` khi gửi (LOI-17, CCH-04); (5) bỏ kiểm mã gửi (LOI-07, SOC-13); (6) cho 21 tin mỗi phút (LOI-10); (7) nhận tin rỗng không tệp (LOI-03); (8) bỏ chặn bên nhận ngưng hoạt động (LOI-11); (9) bỏ điều kiện chi nhánh ở danh sách Lễ tân (QCH-05); (10) Bác sĩ xem hội thoại không phải thành viên (QCH-04); (11) mốc đã đọc lùi (NBN-15, CCH-06); (12) không kiểm tin thuộc hội thoại khi đánh dấu (QCH-10); (13) đếm cả tin của chính mình (NBN-10); (14) trả tên Lễ tân cho Bệnh nhân (NLE-09, QCH-11); (15) ghi một thông báo mỗi tin (TBC-02); (16) đưa nội dung tin vào thông báo (TBC-05); (17) đọc hội thoại không đánh dấu thông báo (TBC-03); (18) đẩy không kiểm phiên (SOC-09); (19) nhận token ở query (SOC-02); (20) đẩy trước commit (SOC-12); (21) khoá tệp lấy từ tên người dùng (TEP-07); (22) bỏ kiểm nội dung tệp (TEP-03); (23) thiếu `nosniff` hay `Content-Disposition` (TEP-09); (24) không xoá tệp khi giao dịch lỗi (TEP-08); (25) log nội dung tin (BCH-01); (26) quan hệ bỏ `DaTiepDon` hay tính `DaHuy` (NBS-04, NBS-05); (27) chi nhánh mặc định lấy lịch xa nhất hay lịch huỷ (NLE-03, NLE-04); (28) web: mốc bù lấy từ tin được đẩy (WCH-06); (29) web: gửi lại sinh `maGui` mới (WCH-09); (30) web: lưu nội dung vào `localStorage` hay `dangerouslySetInnerHTML` (WCH-17).
- **Việc phải đo thật ở X1** (tiêu chí đặt TRƯỚC khi chạy, ghi TRACKING mục 6; spec đo tạm rồi xoá; DB tạm `*_test` riêng, **không** đụng DB `clinix`, `clinix_test`; nạp bằng `INSERT … SELECT`, `ANALYZE TABLE`, mỗi câu làm nóng 5 lần rồi đo 100 lần). **Bộ dữ liệu `[đề xuất]`:** 100.000 `tin_nhan`; một chi nhánh 5.000 hội thoại hộp thư chung (và 1.000 ở chi nhánh khác); một hội thoại 20.000 tin; một Bệnh nhân 50 hội thoại; một Bác sĩ 2.000 hội thoại; một người gửi 20.000 tin.

| Mã đo | Câu hỏi | Tiêu chí đạt (đặt trước) |
|---|---|---|
| M1 | Danh sách hội thoại (hộp thư 5.000, Bác sĩ 2.000, Bệnh nhân 50): trang đầu, trang sâu, lọc chưa đọc, tìm kiếm; EXPLAIN | p95 ≤ 100 ms mỗi ca, không quét toàn bảng `tin_nhan`; FAIL ⇒ P2(a) trước khi merge B2 |
| M2 | Số hội thoại chưa đọc (Lễ tân mới chưa có dòng nào; Lễ tân đã đọc hết; Bác sĩ) và chi phí thăm dò dự phòng: 200 phiên, trong đó 30 Lễ tân cùng một hộp thư, gọi số đếm và danh sách mỗi 15 giây trong 60 giây | câu đếm p95 ≤ 50 ms; dưới tải: 0 lỗi, p95 ≤ 100 ms, ghi CPU và số kết nối; FAIL ⇒ P2(a), đổi câu hoặc giãn chu kỳ (ghi lại) |
| M3 | Tin theo con trỏ `truoc`, `sau` ở hội thoại 20.000 tin; EXPLAIN | dùng chỉ mục `(hoi_thoai_id, tin_nhan_id)`, không `filesort`, p95 ≤ 20 ms |
| M4 | Câu đếm giới hạn tốc độ (5.5) của người gửi 20.000 tin khi chỉ có UNIQUE `(nguoi_gui_id, ma_gui)` | p95 ≤ 10 ms; FAIL ⇒ P2(b) chỉ mục `(nguoi_gui_id, thoi_diem_gui)` trước khi merge B1 rồi đo lại; PASS ⇒ không thêm |
| M5 | Mở hội thoại đồng thời (300 vòng × 2) có và không khoá tài khoản; mở × gửi hội thoại khác | có khoá: 0 hội thoại trùng, 0 lần 503; đối chứng không khoá: ≥ 1 trùng (chứng minh khoá cần); ghi số 1213, 1205 |
| M6 | Gửi × đánh dấu đọc × "đánh dấu tất cả" của Trung tâm, 300 vòng | 0 lần 503; mọi lỗi tranh khoá được thử lại; không dòng thông báo chưa đọc trùng |
| M7 | Cú pháp upsert mốc (bí danh dòng, `GREATEST`) trên MySQL 8.4 | mốc không bao giờ lùi, chạy được; ghi `affectedRows` |
| M8 | Bốn tải đồng thời PDF 10 MB và ảnh 10 MB: bộ nhớ, thời gian | tăng bộ nhớ đỉnh ≤ 300 MB, mỗi yêu cầu ≤ 10 giây |
| M9 | 200 kết nối socket, đẩy tới 30 Lễ tân; guard, pipe, filter toàn cục có áp vào gateway không; ngắt phiên bị thu hồi | p95 nhận tin ≤ 500 ms sau commit; 0 lỗi; ghi bộ nhớ tăng; phiên thu hồi bị ngắt ≤ 60 giây |
| M10 | Nâng cấp WebSocket qua Vite proxy và qua ảnh nginx của `apps/web` (cấu hình do P4 đưa vào repo), giữ kết nối rảnh 5 phút | nối được ở cả hai, không bị đóng vì `proxy_read_timeout` |

- **Dữ liệu mẫu (X3):** seed demo (người chạy được Đại đồng ý): mỗi vai trò vài hội thoại hai loại, có tin chưa đọc, một ảnh và một PDF giả. Test tự động **không** dùng seed (fixture ở `chat/testing/`).

## 6. Kế hoạch task

**Cách gọi mã task:** `P1`…`P4`, `B1`…`B6`, `F1`…`F6`, `D1`, `X1`…`X3`; ngoài file này viết "chat B2".

### 6.1 Sơ đồ phụ thuộc và lát cắt giao được (cùng một hàng = làm song song được; `→` = phải xong trước)

```
Nền đã có: auth (token, phiên, Roles) · rbac (phạm vi Lễ tân) · booking (withBookingTransaction) · notification (danh mục, Trung tâm, chuông)
           common/upload (ImageProcessor) · search (nút Nhắn tin vô hiệu, public/branches) · web RoleShell, lớp client
S0 Nền:           P1 ─┐   P3 (độc lập)   P4 (độc lập)
                      └── X1 (M1…M7 cần P1; M8 cần P3; M9, M10 cần P4) ── P2 (chỉ khi vượt ngưỡng; [CHỜ X1])
S1 Nhắn tin chữ:  P1, X1 ─ B1 ─ B2 (đọc, mốc, tìm) ─┬─ B3 (gửi REST, Bệnh nhân) ─────────┐
                                                    └─ F1 (nền web) ─ F3 (khung dùng chung) ─┬─ F4 (Bệnh nhân; cần B3)
                                                                                             └─ F5 (Bác sĩ, Lễ tân; cần B3)
S2 Tức thời:      P4, B1 ─ B5 (gateway) ─ F2 (socket, dự phòng; [SOẠN TRƯỚC] bằng socket giả)
S3 Tệp:           P3, B3 ─ B4 ─ F6 (cần F3)
S4 Thông báo:     B1 ─ B6 (liên kết web ở F1)
S5 Hoàn tất:      B1…B6 ─ X2 (đồng thời) ;  mọi task ─ D1 ─ X3
```

Lát cắt giao được: **S1** là MVP (ba use case bằng chữ, gửi qua REST, web tự làm tươi 15 giây khi chưa có socket); **S2** thêm tức thời; **S3** thêm tệp; **S4** thêm thông báo; **S0**, **S5** là nền và hoàn tất. Không chờ ai ngoài scope.

### 6.2 Danh sách task (mỗi task = một PR; người làm Trung `junUTE`, Đại review; giờ là `[đề xuất]`)

| ID | Việc (file chính) | Phụ thuộc | Truy vết | Test case | Thẻ | Giờ | Mức |
|---|---|---|---|---|---|---|---|
| **P1** | Sửa ba file `docs/database/*` (bốn cột, UNIQUE, hai CHECK, quy tắc), migration ba bảng, entity `chat/entities/`, enum, đăng ký; `down` chặn khi còn dòng; scope `chat` vào commitlint (T9) | — | 2.4.20, 2.4.21, 2.4.29; Q7, Q10, Q21 | MCH-01…MCH-11 | `[ĐỒNG BỘ TL]` `[ĐỤNG database]` | 5 | ĐẦY ĐỦ |
| **P2** | **Có điều kiện (Q12):** (a) `hoi_thoai.tin_nhan_cuoi_id` + chỉ mục khi **M1 hay M2** FAIL; (b) chỉ mục `tin_nhan (nguoi_gui_id, thoi_diem_gui)` khi **M4** FAIL; ba file DB, entity, mặt nạ | X1 (M1, M2, M4) | Q12; T6 | MCH-12 | `[CHỜ X1]` `[ĐỒNG BỘ TL]` `[ĐỤNG database]` | 3 | ĐẦY ĐỦ |
| **P3** | Kho tệp: `ChatFileStore` và bản đĩa, `CHAT_FILES_DIR`, volume hai file compose, `Dockerfile`, `.env.example`, `.gitignore`; ADR kho tệp | — | Q5, Q6 | TEP-07, TEP-14, HCH-05 | `[ĐỤNG docker]` | 3,5 | ĐẦY ĐỦ |
| **P4** | Hạ tầng WebSocket: thư viện, adapter, gateway chỉ bắt tay (token, phiên, vai trò, Origin, số kết nối, ngắt khi hết hạn); location `^~ /api/socket.io/` ở `nginx.conf` và khoá proxy `ws: true` ở `vite.config.ts`; ADR WebSocket | — | Q2, Q8; T1; R3 | SOC-01…SOC-04, SOC-11, SOC-16 | `[ĐỤNG deps]` `[ĐỤNG docker]` `[ĐỤNG auth]` (chỉ dùng) | 4 | ĐẦY ĐỦ |
| **X1** | Đo M1 đến M10 (5.15), tiêu chí đặt trước, spec đo tạm rồi xoá, ghi TRACKING mục 6 | P1 (M1…M7), P3 (M8), P4 (M9, M10) | R2, R3, R8, R12, R13 | — (số đo) | `[TIỀN ĐỀ]` | 6 | ĐẦY ĐỦ |
| **B1** | Lõi: luật nội dung, chính sách quyền, tìm-hoặc-tạo dưới khoá, gửi (mã gửi, giới hạn, chặn bên khoá), cổng thông báo và đẩy `Noop`, fixture | P1; X1 (M4, M5, M7); P2(b) nếu M4 FAIL | 2.4.20 b4, b5; 2.4.21 b6; 2.4.29 b5; Q3, Q9, Q10, Q17 | LOI-01…LOI-18, HCH-01…HCH-03, BCH-01 | `[ĐỤNG database]` (`app.module.ts`) | 7 | ĐẦY ĐỦ |
| **B2** | API đọc: danh sách (ba vai trò, lọc, tìm), chi tiết, tin theo con trỏ, đánh dấu đọc, số đếm, quan hệ | B1; X1 (M1, M2, M3, M6); P2(a) nếu M1, M2 FAIL | 2.4.20 b3, b6; 2.4.29 b1 đến b3, b6, A1; Q15, Q16, Q23, Q25 | NBS-04…NBS-07, NBS-11, NBN-01, NBN-03…NBN-12, NBN-14, NBN-15, QCH-01…QCH-05, QCH-07, QCH-08, QCH-10, QCH-11, BCH-05 | | 7 | ĐẦY ĐỦ |
| **B3** | API gửi bằng JSON: gửi vào hội thoại, tin đầu tới bác sĩ và chi nhánh, đầu khung trước tin đầu, chi nhánh mặc định | B1; B2 (mapper) | 2.4.20 b1, b2, b5, A1; 2.4.21 b2 đến b6; 2.4.29 b4; Q4, Q18 | NBS-01…NBS-03, NBS-08…NBS-10, NLE-01…NLE-10, NBN-02, NBN-13, QCH-06, QCH-09, QCH-12, BCH-02, BCH-06, HCH-04 | | 5 | ĐẦY ĐỦ |
| **B4** | Tệp: `multipart` ở ba route gửi, kiểm nội dung, `ImageProcessor`, PDF, ghi kho, xoá khi lỗi, tải xuống, job dọn mồ côi | P3, B3 | Q1, Q5, Q6, Q7, Q22 | TEP-01…TEP-06, TEP-08…TEP-13, QCH-12, BCH-01 | `[ĐỤNG upload]` | 7 | ĐẦY ĐỦ |
| **B5** | Gateway: `chat:gui` qua lõi, đẩy sau commit theo người nhận và vai trò, kiểm phiên trước khi đẩy, quét định kỳ | P4, B1, B2 (mapper) | Q2, Q8; 2.4.20 b5; R5 | SOC-05…SOC-10, SOC-12…SOC-15, QCH-02 (socket), HCH-04, BCH-01 | | 7 | ĐẦY ĐỦ |
| **B6** | Thông báo tin mới: adapter cổng, gộp, đánh dấu đọc, danh mục, liên kết API, DMS-13, ghi dạng hậu tố mới vào quy tắc DB | B1, B2 | 2.4.20, 2.4.21, 2.4.29 HĐK; 2.4.68; Q11; L15 | TBC-01…TBC-10, BCH-03, HCH-06 | `[ĐỤNG notification]` `[ĐỒNG BỘ TL]` `[ĐỤNG database]` | 4 | ĐẦY ĐỦ |
| **F1** | Web nền: kiểu, API client chat, đường tải nhị phân, `chat-paths`, route ba khung (trang tạm), menu "Tin nhắn" và số đếm (thăm dò 30 giây), liên kết thông báo `HoiThoai`. **Gồm một PR nhỏ riêng (T10)** tách hook thăm dò, merge trước PR chính | B2 (`[SOẠN TRƯỚC]` bằng API giả); phần liên kết thông báo khớp B6 | 2.4.20 TĐK; Q11 | WCH-01…WCH-03, TBC-08 (web) | `[ĐỤNG shared]` `[ĐỤNG router]` `[ĐỤNG patient]` `[ĐỤNG doctor]` `[ĐỤNG notification]` | 5 | GỌN |
| **F2** | Socket ở web: kết nối, token, nối lại, đóng khi đăng xuất; tự làm tươi của F3 thành dự phòng (ngừng khi socket nối), gửi qua REST khi mất kết nối; mốc bù và gộp tin | B5 (`[SOẠN TRƯỚC]` bằng socket giả), F3 | Q2, Q8, Q22; R3, R11 | WCH-04…WCH-06 | `[ĐỤNG deps]` `[ĐỤNG router]` | 6 | GỌN |
| **F3** | Khung nhắn tin dùng chung: danh sách, khung tin, ô soạn, gửi qua REST, gửi lại, đánh dấu đọc, tự làm tươi 15 giây, trạng thái, bàn phím, 375 px | F1; B3 (`[SOẠN TRƯỚC]`) | 2.4.20 b4 đến b6, A1; 2.4.21 b5, b7; 2.4.29 A2 | WCH-07…WCH-11, WCH-15…WCH-17, BCH-04 | | 7 | GỌN |
| **F4** | Bệnh nhân: trang Tin nhắn, bắt đầu trò chuyện (chi nhánh, bác sĩ), banner, quan hệ, nút ở tra cứu bác sĩ | F3, B3 | 2.4.20 b1 đến b3; 2.4.21 b1 đến b4; Q4, Q24 | WCH-12, WCH-13 | `[ĐỤNG search]` | 6 | GỌN |
| **F5** | Bác sĩ và Lễ tân: hộp thư, tìm, lọc chưa đọc, nhãn trả lời, quan hệ, không có quyền | F3, B2, B3 | 2.4.29; Q15, Q23, Q25 | WCH-18, WCH-19 | `[ĐỤNG router]` | 5 | GỌN |
| **F6** | Đính kèm ở web: chọn, kiểm trước, xem trước, gửi `multipart`, hiện ảnh, tải PDF, lỗi | F3, B4 | Q1, Q6, Q22 | WCH-14 | `[ĐỤNG shared]` | 5,5 | GỌN |
| **D1** | Tài liệu repo: tick PLAN, `docs/TRACKING.md`, ghi chú số scope, nợ (nháp), PLAN thông báo và patient phần thẻ chờ chat; kiểm lại ADR | mọi B, F | `[ĐỒNG BỘ TL]` | — | `[ĐỒNG BỘ TL]` | 2 | — |
| **X2** | Đồng thời và bất biến trên MySQL thật: bộ CCH, mỗi ca một mình, IVC sau mỗi ca, đếm 1213, 1205, 503 | B1…B6 | R11, R12 | CCH-01…CCH-11 | | 6 | ĐẦY ĐỦ |
| **X3** | Kiểm tay trình duyệt ba vai trò (KCH), đột biến lô (30), seed demo, tổng kết | mọi task | mục 10 | KCH-01…KCH-12 | `[CHỜ Đại]` (seed, DB `clinix`) | 6 | ĐẦY ĐỦ |

**Tổng 104 giờ** cộng **3 giờ dự phòng** cho P2 (chỉ khi X1 vượt ngưỡng). Con số này cao hơn ước 97 giờ đã nêu trong hộp câu hỏi Q20 bảy giờ do tách nhỏ task sau khi chốt thiết kế; vẫn vừa ba Iteration với 40 giờ mỗi tuần (6.4).

### 6.3 File của module khác và file dùng chung bị chạm, cách tránh xung đột

| File | Của | Task | Cách |
|---|---|---|---|
| `docs/database/{clinix.dbml, clinix_mysql.sql, clinix_quy_tac_nghiep_vu.md}` | chung | P1, P2, B6 | PR 701 (notification D1) vừa sửa chữ cả ba file: P1 làm trên `main` mới (`git pull` trước); sửa cả ba khớp nhau; báo Đại |
| `apps/api/src/database/{entities.ts, migrations/index.ts}`, migration mới | chung | P1, P2 | mốc lớn hơn mọi migration trên `main` lúc merge; thêm vào cuối mảng; mặt nạ cho migration cũ khi P2 |
| `apps/api/src/app.module.ts` | chung | B1, P4 | một dòng `import`, một phần tử; rebase khi trùng PR khác |
| `apps/api/package.json`, `apps/web/package.json`, lock | chung | P4, F2 | PR riêng cho thư viện; phiên bản tra registry; chạy `npm ci` sau rebase |
| `docker-compose.yml`, `docker-compose.staging.yml`, `apps/api/Dockerfile`, `.env.example`, `.gitignore`, `config/env.validation.ts` | chung | P3 | một PR nhỏ; báo Đại (file hạ tầng chung) |
| `apps/web/nginx.conf`, `vite.config.ts` | chung | P4 | thêm location riêng `^~ /api/socket.io/` (`Upgrade`, `Connection`, timeout đọc đủ dài) và khoá proxy `ws: true` trước `'/api/'`; không đổi location và khoá `/api/` |
| `apps/api/src/common/upload/upload.module.ts` | Trung (admin) | B4 | thêm `ImageProcessor` vào `exports` (một dòng, `[ĐỤNG upload]`) |
| `apps/api/src/notification/{catalog,center}/…` | Trung (notification) | B6 | D1 của thông báo đã merge; một PR riêng; chạy DMS và TTB |
| `apps/web/src/features/notification/{center/notification-links.ts, …icons.ts}`; `unread/use-unread-count.ts` và `shared/hooks/use-polling.ts` (mới; T10) | Trung (notification), chung | F1 | sửa tối thiểu; tách hook ở **PR nhỏ riêng**, không sửa `use-unread-count.test.tsx` |
| `apps/web/src/shared/api/client.ts` (+ test) | chung | F1 | thêm hàm mới, không đổi hành vi cũ |
| `apps/web/src/shared/ui/role-shell*.tsx`, `features/patient/shell/*`, `features/doctor/shell/*` | chung, Đại, Trung | F1 | prop tuỳ chọn, mặc định giữ khung cũ |
| `apps/web/src/router/{role-nav.ts, role-routes.tsx, role-shells.tsx}` | chung | F1, F2, F5 | đổi lịch F5 (PR 702) đã merge và sửa `role-routes.tsx`: làm trên `main` mới; rebase khi trùng PR khác |
| `apps/web/src/features/search/doctors/*` và ca TBS-20, UIS-10, `booking-flow.test.tsx` | Đại (search, booking) | F4 | sửa tối thiểu phần nút; báo Đại |
| `docs/TECH_DEBT.md`, `AI_USAGE_LOG.md`, `TRUNG_AI_USAGE_LOG.md` | Đại / Trung | D1, mỗi PR | **phiên lập kế hoạch này không sửa**; nháp ở TRACKING mục 4 |
| `docs/features/{reschedule,notification,patient}/*`, `docs/PLAN.md` | các module | D1 | **không sửa ở PR tài liệu của kế hoạch**; sửa ở D1 khi cần |

### 6.4 Ước giờ và chia Iteration (`[đề xuất]`; Iteration một tuần; hạn mức giờ mỗi tuần của Trung là **giả định 40 giờ** Đại đã chọn, Q20, chưa phải số thật)

| Lát cắt | Task (giờ) | Giờ |
|---|---|---|
| **S0 Nền** | P1 5 · P3 3,5 · P4 4 · X1 6 · (P2 3, dự phòng) | **18,5** (+3) |
| **S1 Nhắn tin chữ** | B1 7 · B2 7 · B3 5 · F1 5 · F3 7 · F4 6 · F5 5 | **42** |
| **S2 Tức thời** | B5 7 · F2 6 | **13** |
| **S3 Tệp** | B4 7 · F6 5,5 | **12,5** |
| **S4 Thông báo** | B6 4 | **4** |
| **S5 Hoàn tất** | D1 2 · X2 6 · X3 6 | **14** |
| **Tổng** | | **104** (+3) |

| Iteration | Task | Giờ | Ghi chú |
|---|---|---|---|
| **8** (01/12 đến 07/12) | P1, P3, P4, X1, B1, B2, F1 | **37,5** (+3 nếu X1 đòi P2) | X1 là lane nặng, chạy khi máy rảnh; B1, B2 sau số đo; F1 `[SOẠN TRƯỚC]` bằng API giả |
| **9** (08/12 đến 14/12) | B3, B4, B5, B6, F2, F3 | **36** | F2 `[SOẠN TRƯỚC]` trước khi B5 merge; B6 sửa file của thông báo (cùng người làm; D1 của thông báo đã merge) |
| **10** (15/12 đến 21/12) | F4, F5, F6, X2, D1, X3 | **30,5** (+5 giờ X3 của thông báo còn lại theo PLAN thông báo) | Iteration 9, 10 chưa có trong Project: việc của Đại |

Đệm khoảng **11 giờ** (còn 8 giờ nếu làm P2). **Giờ ước cho việc LẬP KẾ HOẠCH này:** `[đề xuất]` **5 giờ** (đọc nguồn và mã 2; đối chiếu và hỏi Đại 1,5; viết PLAN, TRACKING, nháp 1,5), cộng khoảng 1 giờ review mỗi người.

**Phương án cắt nếu thiếu giờ** (Đại quyết; đảo quyết định đã chốt): (1) bỏ tệp (P3, B4, F6: −16 giờ, đảo Q1); (2) bỏ WebSocket, chỉ thăm dò (P4, B5, F2: −17 giờ, đảo Q2, Q8); (3) bỏ ô tìm của Bác sĩ (−1 giờ, đảo Q25); (4) bỏ bộ lọc "Bác sĩ / Lễ tân" của Bệnh nhân (−0,5 giờ). **Không cắt** P1, B1, B2, B3, B6, F1, F3, F4, F5 (lõi ba use case).

### 6.5 Việc nào bắt đầu ngay, việc nào phải chờ

- **Ngay (độc lập):** P1; P3; P4. Mọi quyết định sản phẩm và schema đã có (Q1 đến Q25); việc sửa Word (4.6) không chặn mã.
- **Sau P1 (và P3, P4 cho phần tương ứng):** X1. **Sau X1:** B1, B2; nếu M1, M2 hay M4 FAIL thì **P2 trước** rồi mới merge B2 (hoặc B1 với M4).
- **Chuỗi chính:** B1 → B2 → B3 → B4; B1 + P4 → B5; B2 → B6; F1 → F3 → F4, F5; F3 + B5 → F2; F3 + B4 → F6.
- **P2:** chỉ khi X1 vượt ngưỡng; PASS thì không tạo issue hay đóng ngay.
- **Không chờ** đổi lịch, danh sách chờ, AI. Notification D1 và đổi lịch F5 đã merge: chỉ cần làm trên `main` mới (P1: ba file `docs/database/*`; F1: router).

### 6.6 Thông tin để sinh issue (**KHÔNG tạo issue lúc này**: Đại tự chạy script sau khi PR tài liệu merge)

Mỗi task một issue; nhãn `module:chat` (**chưa có** trong repo; script của Đại tạo) cộng `backend`, `frontend` hay `docs` (task web: `frontend`; task cần đồng bộ tài liệu thêm `docs-sync`; X1, X2 thêm `testing`; P3, P4 thêm `infra`); milestone `chat` (**chưa có**; script tạo); giao `junUTE` (người làm), review `MaxTrann` (Đại review mọi PR của scope); Epic `[chat] Epic · Nhắn tin (scope #11): Bệnh nhân, Bác sĩ, Lễ tân, tức thời, tệp, thông báo` (nhãn `epic`, `module:chat`) gom mọi task; Iteration theo 6.4. F1 có hai PR (PR nhỏ tách hook, T10, rồi PR chính đóng issue; PR nhỏ dùng `Refs`). Tiêu đề issue dạng `[chat] <mã> · <tên> (<backend|frontend|docs|testing>)` (≤ 100 ký tự), tiêu đề PR ≤ 100 ký tự và `Closes #<issue>` ở thân PR (Epic dùng `Refs`). Khuôn thân issue theo issue notification #656 (đọc bằng `gh issue view 656`): `## Mô tả`, `## Truy vết`, `## Phụ thuộc`, `## Lưu ý` (thẻ trong PLAN; Iteration, giờ, mức kiểm; **Người làm: `junUTE`; người review: `MaxTrann`**; tiêu đề PR gợi ý; "Mã task trùng tên với task của `booking`, `reschedule`, `notification`: khi nhắc ngoài PLAN này, viết chat B2"; "Figma chỉ là bản phác thảo"), `## Test case liên quan` (kèm "Danh sách đầy đủ và kết quả mong đợi: `docs/features/chat/PLAN.md` mục 7."), `## Đóng khi` (ô riêng ở bảng dưới, rồi bốn ô chuẩn: PR được người còn lại review và squash merge, tiêu đề theo Conventional Commits ≤ 100 ký tự, `Closes #<issue>`; test case đã chạy và ghi vào `docs/features/chat/TRACKING.md`; tài liệu đồng bộ đã cập nhật trong cùng PR; nếu có dùng AI đã ghi `AI_USAGE_LOG.md` hay `TRUNG_AI_USAGE_LOG.md`, không dòng `Co-Authored-By` của AI), dòng cuối: nguồn `docs/features/chat/PLAN.md`, task `<mã>`; thuộc Epic.

Nhãn `blocked` (gỡ khi điều kiện có): **P2**: `[CHỜ X1]` (chỉ mở khi X1 vượt ngưỡng; PASS thì **không tạo issue**); **X3**: `[CHỜ Đại]` (seed, DB `clinix`). Q1 đến Q25 đã được Đại trả lời trực tiếp 26/11/2026; T1 đến T14 (4.3) đã được phiên kiểm duyệt kỹ thuật ngày 26/11/2026 kèm bổ sung.

| ID | Tiêu đề issue | Tiêu đề PR (`<loại>(<scope>): …`) | Iter. | "Đóng khi" (ngoài bốn ô chuẩn) |
|---|---|---|---|---|
| P1 | `[chat] P1 · Migration và entity ba bảng chat, cột mã gửi và tệp (backend)` | `feat(db): thêm migration và entity ba bảng chat cùng cột mã gửi, tệp (chat P1)` | 8 | MCH-01…MCH-11 Pass; ba file `docs/database/*` khớp; `schema-parity` xanh; mốc lớn hơn migration cuối của `main` |
| P2 | `[chat] P2 · Cột tin cuối và chỉ mục tin nhắn theo số đo X1 (backend)` | `feat(db): thêm cột tin cuối và chỉ mục tin nhắn theo số đo X1 (chat P2)` | 8 | **Chỉ khi X1 vượt ngưỡng** (phần (a) theo M1, M2; phần (b) theo M4): ba file DB khớp; EXPLAIN trước và sau ghi TRACKING; MCH-12 Pass |
| P3 | `[chat] P3 · Kho tệp riêng trên volume cho tệp đính kèm (backend)` | `feat(chat): thêm kho tệp riêng trên volume cho tệp đính kèm (chat P3)` | 8 | TEP-07, TEP-14, HCH-05 Pass; đột biến 21 bị bắt; `docker compose config` chạy được với volume mới; ADR viết xong |
| P4 | `[chat] P4 · Hạ tầng WebSocket và xác thực kết nối (backend)` | `feat(chat): thêm gateway WebSocket và xác thực kết nối (chat P4)` | 8 | SOC-01…SOC-04, SOC-11, SOC-16 Pass (bắt tay thật qua nginx và Vite); đột biến 19 bị bắt; phiên bản thư viện tra từ registry ghi ở PR; ADR viết xong |
| X1 | `[chat] X1 · Đo thật danh sách, chưa đọc, khoá, tải tệp và WebSocket (testing)` | `test(chat): đo thật danh sách hội thoại, khoá, tải tệp và WebSocket (chat X1)` | 8 | M1 đến M10 có số ở TRACKING mục 6; tiêu chí không đổi sau khi thấy số; spec đo tạm đã xoá; kết luận P2 làm hay đóng |
| B1 | `[chat] B1 · Lõi tìm-hoặc-tạo hội thoại và gửi tin chống trùng (backend)` | `feat(chat): thêm lõi tìm-hoặc-tạo hội thoại và gửi tin chống trùng (chat B1)` | 8 | LOI-01…LOI-18, HCH-01…HCH-03, BCH-01 Pass; đột biến 1 đến 8 và 25 bị bắt |
| B2 | `[chat] B2 · API danh sách hội thoại, tin nhắn, mốc đã đọc và tìm kiếm (backend)` | `feat(chat): thêm API danh sách hội thoại, tin nhắn và mốc đã đọc (chat B2)` | 8 | NBS-04…NBS-07, NBS-11, NBN-01, NBN-03…NBN-12, NBN-14, NBN-15, QCH-01…QCH-05, QCH-07, QCH-08, QCH-10, QCH-11, BCH-05 Pass; EXPLAIN M1 đến M3 đạt; đột biến 9 đến 14, 26 bị bắt |
| B3 | `[chat] B3 · API gửi tin, bắt đầu hội thoại và chi nhánh mặc định (backend)` | `feat(chat): thêm API gửi tin và bắt đầu hội thoại cho Bệnh nhân (chat B3)` | 9 | NBS-01…NBS-03, NBS-08…NBS-10, NLE-01…NLE-10, NBN-02, NBN-13, QCH-06, QCH-09, QCH-12, BCH-02, BCH-06, HCH-04 Pass; đột biến 27 bị bắt |
| B4 | `[chat] B4 · Gửi và tải tệp ảnh, PDF trong hội thoại (backend)` | `feat(chat): thêm gửi và tải tệp ảnh, PDF trong hội thoại (chat B4)` | 9 | TEP-01…TEP-06, TEP-08…TEP-13, QCH-12, BCH-01 Pass; đột biến 22 đến 24 bị bắt |
| B5 | `[chat] B5 · Gửi và nhận tin tức thời qua WebSocket (backend)` | `feat(chat): thêm gửi và đẩy tin tức thời qua WebSocket (chat B5)` | 9 | SOC-05…SOC-10, SOC-12…SOC-15, QCH-02 (socket), HCH-04, BCH-01 Pass; đột biến 18 và 20 bị bắt |
| B6 | `[chat] B6 · Thông báo tin nhắn mới gộp theo hội thoại (backend)` | `feat(notification): thêm thông báo tin nhắn mới gộp theo hội thoại (chat B6)` | 9 | TBC-01…TBC-10, BCH-03, HCH-06 Pass; DMS xanh, `CHO_MODULE` không còn `chat`; quy tắc DB ghi dạng hậu tố mới; đột biến 15 đến 17 bị bắt |
| F1 | `[chat] F1 · Nền web nhắn tin: API client, menu Tin nhắn, số chưa đọc, route (frontend)` | `feat(web): thêm nền nhắn tin, menu Tin nhắn và số hội thoại chưa đọc (chat F1)` | 8 | PR tách hook (`refactor(web): tách hook thăm dò dùng chung (chat F1)`) merge trước, `use-unread-count.test.tsx` không sửa; WCH-01…WCH-03, TBC-08 (web) Pass; ca khung và route cũ chỉ sửa có ghi chú |
| F2 | `[chat] F2 · Kết nối WebSocket ở web, nối lại và thăm dò dự phòng (frontend)` | `feat(web): thêm kết nối WebSocket cho nhắn tin và thăm dò dự phòng (chat F2)` | 9 | WCH-04…WCH-06 Pass; đột biến 28 bị bắt |
| F3 | `[chat] F3 · Khung nhắn tin dùng chung: danh sách, khung tin, ô soạn (frontend)` | `feat(web): thêm khung nhắn tin dùng chung cho ba vai trò (chat F3)` | 9 | WCH-07…WCH-11, WCH-15…WCH-17, BCH-04 Pass; đột biến 29, 30 bị bắt |
| F4 | `[chat] F4 · Bệnh nhân bắt đầu trò chuyện với bác sĩ hoặc lễ tân (frontend)` | `feat(web): thêm trang Tin nhắn của Bệnh nhân và nút Nhắn tin ở tra cứu (chat F4)` | 10 | WCH-12, WCH-13 Pass; ca TBS-20, UIS-10 đã sửa tối thiểu |
| F5 | `[chat] F5 · Hộp thư Tin nhắn của Bác sĩ và Lễ tân (frontend)` | `feat(web): thêm hộp thư Tin nhắn cho Bác sĩ và Lễ tân (chat F5)` | 10 | WCH-18, WCH-19 Pass |
| F6 | `[chat] F6 · Đính kèm và xem ảnh, PDF trong khung chat (frontend)` | `feat(web): thêm đính kèm và xem ảnh, PDF trong khung chat (chat F6)` | 10 | WCH-14 Pass; đột biến web bốn loại cho phần tệp bị bắt |
| D1 | `[chat] D1 · Đồng bộ tài liệu repo sau khi có mã nhắn tin (docs)` | `docs(chat): đồng bộ PLAN, TRACKING và nợ kỹ thuật sau khi có mã nhắn tin (chat D1)` | 10 | Mọi ô PLAN này đã tick; `docs/TRACKING.md` một dòng; nháp nợ gửi Đại |
| X2 | `[chat] X2 · Đồng thời và bất biến của nhắn tin trên MySQL thật (testing)` | `test(chat): thêm bộ ca đồng thời và bất biến của nhắn tin (chat X2)` | 10 | CCH-01…CCH-11 Pass một mình; 0 lần 503; IVC-01…IVC-08 xanh; ghi số 1213 và 1205 |
| X3 | `[chat] X3 · Kiểm tay ba vai trò, đột biến lô, tổng kết scope chat (docs)` | `docs(chat): tổng kết kiểm tay và đột biến của scope chat (chat X3)` | 10 | KCH-01…KCH-12 Pass; 30 đột biến bị bắt; CI xanh; mục 10 đạt |

**Nhãn Epic:** `[chat] Epic · Nhắn tin (scope #11)` gom 20 issue (19 khi P2 không tạo); không đóng khi chưa đạt mục 10.

## 7. Test case dự kiến

Loại: **U** đơn vị (không DB), **I** tích hợp trên MySQL thật (`*.int-spec.ts`), **E** e2e qua `AppModule` (`test:e2e`; ca socket nối client thật tới app test), **C** đồng thời (một mình), **W** giao diện (Vitest và happy-dom), **B** trình duyệt (kiểm tay). Mỗi test ghi mã ở tên ca (`it('LOI-07: …')`). Mọi ca có ca âm và ca biên; endpoint mới có ca đúng và sai vai trò, đúng và sai chi nhánh. Ca đồng thời chạy MỘT mình, sau mỗi ca chạy IVC-01…IVC-08. Dữ liệu dựng bằng fixture (`chat/testing/`, `appointments/testing/`), đồng hồ giả cho ca có giờ, chạy dưới cả `TZ=UTC` lẫn `TZ=Asia/Ho_Chi_Minh` với ca có ngày giờ. Kho tệp test ở thư mục tạm; không gửi thư thật. **Trạng thái: chưa chạy ca nào** (kế hoạch giai đoạn 1; kết quả ghi ở TRACKING mục 2).

### 7.1 Nhắn tin với bác sĩ (NBS) — B2, B3

| Mã | Loại | Kịch bản | Kết quả mong đợi |
|---|---|---|---|
| NBS-01 | E | Bệnh nhân chưa từng đặt lịch gửi tin đầu tới một bác sĩ | 201; đúng một hội thoại `BenhNhan_BacSi`, `chi_nhanh_id` trống, hai thành viên, một tin |
| NBS-02 | I | gửi tin tiếp theo tới cùng bác sĩ | dùng hội thoại cũ; không tạo mới |
| NBS-03 | E | `GET /chat/doctors/:id` trước khi nhắn | `hoiThoaiId` null; không dòng nào được tạo |
| NBS-04 | I | quan hệ với lịch `DaXacNhan`, `DaTiepDon`, `HoanThanh` (từng cái) | `DaTungKham` |
| NBS-05 | I | chỉ có lịch `ChoThanhToan`, `DaHuy`, `DaDoiLich`, `VangMat` | `ChuaTungKham` |
| NBS-06 | I | lịch của hồ sơ người thân cùng tài khoản | `DaTungKham` |
| NBS-07 | I | lịch với bác sĩ khác | `ChuaTungKham` |
| NBS-08 | E | `bacSiId` không tồn tại, hoặc là tài khoản không phải bác sĩ, hoặc sai dạng | 404 cùng thân |
| NBS-09 | I | bác sĩ `NgungHoatDong` hay `ChoKichHoat` | 409 `CHAT_NGUOI_NHAN_KHONG_HOAT_DONG`; không hội thoại, không tin |
| NBS-10 | I | lỗi giữa giao dịch (cổng thông báo ném) | hoàn tác trọn: không hội thoại, không tin (A1) |
| NBS-11 | I | 45 tin, tải trang mới nhất rồi `truoc` | thứ tự id tăng; 30 rồi 15; không trùng, không thiếu |

### 7.2 Nhắn tin với lễ tân (NLE) — B3

| Mã | Loại | Kịch bản | Kết quả mong đợi |
|---|---|---|---|
| NLE-01 | I | có lịch còn hiệu lực sắp tới | chi nhánh của lịch đó, `LichHenSapToi` |
| NLE-02 | I | không lịch sắp tới, có lịch `HoanThanh` | chi nhánh lịch Hoàn thành mới nhất, `LichHenDaKham` |
| NLE-03 | I | chỉ lịch `DaHuy`, `DaDoiLich`, `VangMat`, hoặc không lịch | `null` |
| NLE-04 | I | hai lịch sắp tới; lịch `DaTiepDon` hôm nay đã qua giờ | gần nhất; lịch hôm nay vẫn tính; trùng giờ lấy id nhỏ |
| NLE-05 | I | lịch của người thân | được tính |
| NLE-06 | E | tin đầu tới một chi nhánh | hội thoại `BenhNhan_LeTan` có `chi_nhanh_id`, thành viên chỉ Bệnh nhân |
| NLE-07 | I | gửi lại cùng chi nhánh; gửi chi nhánh khác | cùng hội thoại; hội thoại thứ hai |
| NLE-08 | E | chi nhánh không tồn tại | 404 |
| NLE-09 | E | Bệnh nhân đọc tin Lễ tân trả lời | `tenHienThi` "Lễ tân · {chi nhánh}"; không họ tên, không id Lễ tân ở bất kỳ khoá nào |
| NLE-10 | I | Bệnh nhân bị khoá, Lễ tân trả lời | 409 `CHAT_NGUOI_NHAN_KHONG_HOAT_DONG`; lịch sử vẫn đọc được |

### 7.3 Nhắn tin với bệnh nhân (NBN) — B2, B3

| Mã | Loại | Kịch bản | Kết quả mong đợi |
|---|---|---|---|
| NBN-01 | E | Bác sĩ xem danh sách | chỉ hội thoại mình là thành viên |
| NBN-02 | E | (B3) Bác sĩ, Lễ tân thử mở hội thoại (`/chat/doctors`, `/chat/branches`) | 403; không có route nào cho họ tạo |
| NBN-03 | E | Bác sĩ không tham gia: chi tiết, tin, đánh dấu (phần gửi: QCH-12) | 404 cùng thân; không ghi gì (A1) |
| NBN-04 | I | Bác sĩ xem đầu khung | quan hệ đúng theo NBS-04, NBS-05 |
| NBN-05 | I | Lễ tân xem danh sách | chỉ hộp thư chung chi nhánh mình; không hội thoại bác sĩ |
| NBN-06 | I | tìm theo họ tên (có và không dấu, `đ`), SĐT, email | chỉ kết quả trong chi nhánh mình; bệnh nhân chi nhánh khác không hiện |
| NBN-07 | E | từ khoá 1 ký tự, 101 ký tự, ký tự điều khiển | 400 `TU_KHOA_KHONG_HOP_LE` |
| NBN-08 | I | tin cuối của Bệnh nhân, rồi của Lễ tân | `ChoTraLoi`; `DaTraLoi` kèm tên (chính mình: "Bạn") |
| NBN-09 | I | Lễ tân chưa có dòng; đọc; đồng nghiệp trả lời | chưa đọc = mọi tin của người khác; 0; lại tăng |
| NBN-10 | I | tin do chính mình gửi | không bao giờ tính chưa đọc |
| NBN-11 | I | 150 tin chưa đọc; 120 hội thoại chưa đọc | số trần 100; số menu trần 100 |
| NBN-12 | I | lọc `chua-doc`; Bác sĩ tìm theo tên | chỉ hội thoại có tin chưa đọc; Bác sĩ không tìm được theo SĐT |
| NBN-13 | I | Lễ tân trả lời lần đầu | tạo đúng một dòng thành viên cho người đó |
| NBN-14 | I | Lễ tân đổi chi nhánh | chi nhánh cũ 404 ngay; chi nhánh mới thấy được |
| NBN-15 | I | đánh dấu đọc bằng id cũ hơn mốc hiện có | 200; mốc không đổi (chỉ tiến tới) |

### 7.4 Lõi gửi tin (LOI) — B1

| Mã | Loại | Kịch bản | Kết quả mong đợi |
|---|---|---|---|
| LOI-01 | U | khoảng trắng hai đầu, `CRLF`, chữ tổ hợp | cắt, đổi `LF`, NFC; xuống dòng giữa giữ nguyên |
| LOI-02 | I | gửi tới đích đã có hội thoại | không tạo hội thoại mới |
| LOI-03 | U, I | rỗng, toàn khoảng trắng, toàn xuống dòng, không tệp | 400 `NOI_DUNG_TRONG` |
| LOI-04 | U | 2000 và 2001 điểm mã, emoji ngoài BMP | nhận; 400 `NOI_DUNG_QUA_DAI`; đếm theo điểm mã |
| LOI-05 | U | ký tự điều khiển (trừ `\n`, `\t`) | 400 |
| LOI-06 | U | `maGui` thiếu, sai dạng | 400 |
| LOI-07 | I | gửi lại cùng mã và nội dung | `Duplicate`: cùng id; một dòng; không thông báo thêm; thành công kể cả khi đã hết lượt |
| LOI-08 | I | cùng mã, khác nội dung hay khác hội thoại | 409 `CHAT_MA_GUI_DA_DUNG` |
| LOI-09 | I | hai người gửi dùng cùng một mã | cả hai được nhận |
| LOI-10 | I | tin thứ 20 và 21 trong 60 giây; sau cửa sổ (đồng hồ giả) | nhận; 429; nhận lại; giới hạn riêng từng người |
| LOI-11 | I | bên nhận ngưng hoạt động (cả hai chiều) | 409; không ghi |
| LOI-12 | I | giờ gửi dưới `TZ=UTC` và giờ Việt Nam | `thoi_diem_gui` là giờ Việt Nam tới giây |
| LOI-13 | U | cổng đẩy | gọi sau commit đúng một lần; không gọi khi `Duplicate` hay lỗi; cổng ném không làm hỏng việc gửi |
| LOI-14 | I | cổng thông báo ném | tin bị hoàn tác |
| LOI-15 | I | nội dung có HTML, SQL; hai tin liên tiếp | lưu nguyên văn; id tăng |
| LOI-16 | I | hai lần mở cùng cặp chạy đồng thời trên hai kết nối thật (cổng đồng bộ) | một hội thoại; bên sau gửi vào hội thoại đã có |
| LOI-17 | I | hai tin cùng hội thoại, giao dịch đầu dừng trước commit | giao dịch sau chờ khoá hội thoại; id commit đúng thứ tự |
| LOI-18 | I | mở tới đích đã có hội thoại | giao dịch mở không xin khoá nào trên `hoi_thoai` (đọc `performance_schema.data_locks`) |

### 7.5 Quyền và phạm vi (QCH) — B2, B3, B4, B5

| Mã | Loại | Kịch bản | Kết quả mong đợi |
|---|---|---|---|
| QCH-01 | E | không token, token sai, hết hạn ở mọi route | 401 mã đúng |
| QCH-02 | E | Quản trị viên (cả hai phạm vi) mọi route và socket | 403; socket từ chối |
| QCH-03 | E | Bệnh nhân A vào hội thoại của B: chi tiết, tin, đánh dấu (phần gửi và tệp: QCH-12) | 404 cùng thân |
| QCH-04 | E | Bác sĩ khác; Bác sĩ vào hộp thư chung | 404 |
| QCH-05 | E | Lễ tân chi nhánh khác; Lễ tân vào hội thoại bác sĩ; Lễ tân tìm ra bệnh nhân chi nhánh khác | 404; không có kết quả |
| QCH-06 | E | Bác sĩ, Lễ tân gọi `/chat/doctors`, `/chat/branches`, `default-branch` | 403 |
| QCH-07 | E | id sai dạng (0, âm, chữ, quá 20 số) | 404, không 500 |
| QCH-08 | E | Lễ tân không còn phạm vi hợp lệ | 403 `KHONG_DU_QUYEN` |
| QCH-09 | E | thân có `taiKhoanId`, `chiNhanhId`, trường lạ | 400 `TRUONG_KHONG_DUOC_PHEP` |
| QCH-10 | E | đánh dấu bằng id tin của hội thoại khác | 404; mốc không đổi |
| QCH-11 | I, E | khoá JSON theo vai trò ở mọi route | đúng danh sách trắng; không email, ngày sinh, địa chỉ; Bệnh nhân không nhận họ tên hay id Lễ tân; Bác sĩ không nhận SĐT |
| QCH-12 | E | (B3, B4) gửi tin và tải tệp ở hội thoại không thấy được, đủ ba vai trò | 404 cùng thân; không ghi tin, không ghi tệp |

### 7.6 Migration và schema (MCH) — P1, P2

| Mã | Loại | Kịch bản | Kết quả mong đợi |
|---|---|---|---|
| MCH-01 | U | chữ DDL của migration so với `clinix_mysql.sql` đã sửa | khớp từng câu |
| MCH-02 | I | up, down, up; down khi còn tin | chạy; **từ chối** khi còn dòng |
| MCH-03 | I | `schema-parity` ba bảng | `SHOW CREATE TABLE` giống DB dựng từ file SQL |
| MCH-04 | U | entity khớp cột | đúng tên, kiểu |
| MCH-05 | I | `chk_hoi_thoai_chi_nhanh` hai chiều | từ chối đúng |
| MCH-06 | I | tin có một phần cột tệp, kể cả `tep_dung_luong` trống; 0 byte; 10.485.761 byte; đủ và đúng | từ chối; từ chối; từ chối; nhận 10.485.760 |
| MCH-07 | I | `noi_dung` `''`, `'   '` không tệp; `''` có tệp | từ chối; từ chối (kiểm giả định đệm khoảng trắng); nhận |
| MCH-08 | I | trùng `(nguoi_gui_id, ma_gui)`; nhiều `ma_gui` NULL | 1062; nhận |
| MCH-09 | I | mốc trỏ tin không tồn tại | khoá ngoại chặn |
| MCH-10 | U | `entities.ts`, `migrations/index.ts` | đăng ký đủ (`registry.spec`) |
| MCH-11 | U | thứ tự mốc | sau mọi migration trước |
| MCH-12 | I | (P2) cột, chỉ mục mới | parity xanh; EXPLAIN dùng chỉ mục |

### 7.7 Tệp đính kèm (TEP) — P3, B4

| Mã | Loại | Kịch bản | Kết quả mong đợi |
|---|---|---|---|
| TEP-01 | I | JPEG, PNG, WebP có EXIF toạ độ | tệp lưu không còn metadata; ≤ 2 MB |
| TEP-02 | I | ảnh trên 2 MB; trên 25 megapixel | nén ≤ 2 MB; từ chối |
| TEP-03 | I | tệp thực thi đổi đuôi, ảnh động, ảnh hỏng | 400 `CHAT_TEP_KHONG_HOP_LE`; không tệp, không tin |
| TEP-04 | I | PDF đúng; PDF giả; 10 MB; 10 MB + 1 byte | nhận; 400; nhận; 413 |
| TEP-05 | E | hai tệp; trường lạ trong `multipart` | 400 |
| TEP-06 | E | tên tiếng Việt, có đường dẫn, ký tự đổi chiều, dài 300 | giữ đúng dấu; đã làm sạch; ≤ 255 |
| TEP-07 | U | khoá lưu; khoá đi ngược thư mục khi đọc | đúng mẫu; từ chối |
| TEP-08 | I | giao dịch lỗi; gửi trùng mã | tệp mới bị xoá; không tệp mồ côi |
| TEP-09 | E | người tham gia tải | 200; đủ sáu header; byte đúng |
| TEP-10 | E | người ngoài; tin không tệp; tệp mất trên đĩa | 404; 404; 404 và log chỉ id |
| TEP-11 | I | job dọn: tệp mồ côi cũ, mới, tệp được tham chiếu | chỉ xoá mồ côi cũ hơn 24 giờ |
| TEP-12 | E | quá số tải đồng thời | 503 `CHAT_TAI_TEP_DANG_BAN`; các tải khác xong |
| TEP-13 | E | tin chỉ có tệp | nhận; xem trước "[Ảnh]" hoặc "[Tệp PDF]" |
| TEP-14 | U | `CHAT_FILES_DIR` thiếu hay không ghi được | lỗi rõ ràng, không ghi ra ngoài thư mục |

### 7.8 WebSocket (SOC) — P4, B5

| Mã | Loại | Kịch bản | Kết quả mong đợi |
|---|---|---|---|
| SOC-01 | E | token đúng; thiếu; sai; hết hạn; Quản trị viên | nối; từ chối kèm mã; Quản trị viên từ chối |
| SOC-02 | E | token ở query | bị bỏ qua, từ chối |
| SOC-03 | E | `Origin` sai hay vắng | từ chối |
| SOC-04 | E | kết nối thứ sáu cùng tài khoản | từ chối |
| SOC-05 | E | gửi qua socket đúng; rỗng; quá dài; trường lạ | ack thành công; ack mã như REST; không ghi khi lỗi |
| SOC-06 | E | gửi vào hội thoại không phải của mình | ack `KHONG_TIM_THAY`; không ghi |
| SOC-07 | E | người nhận của tin đẩy (hội thoại bác sĩ, hộp thư chung, nhiều tab) | đúng tập; Lễ tân chi nhánh khác và bác sĩ khác không nhận |
| SOC-08 | E | thân đẩy theo vai trò | Bệnh nhân không nhận tên Lễ tân |
| SOC-09 | E | đăng xuất, khoá tài khoản khi đang nối | không nhận đẩy nữa; bị ngắt trong ≤ 60 giây; gửi trả lỗi phiên |
| SOC-10 | E | Lễ tân đổi chi nhánh khi đang nối | ngừng nhận tin chi nhánh cũ ngay |
| SOC-11 | E | token hết hạn khi đang nối | máy chủ ngắt |
| SOC-12 | I | giao dịch bị hoàn tác | không đẩy gì |
| SOC-13 | E | gửi socket rồi gửi lại REST cùng mã | một dòng; chỉ một lần đẩy |
| SOC-14 | E | gói quá 64 KB | bị từ chối, kết nối xử lý an toàn |
| SOC-15 | E | lỗi bất ngờ trong xử lý | ack `LOI_HE_THONG`; gateway còn chạy; log không nội dung |
| SOC-16 | B | **(P4, chạy tay)** bắt tay thật qua nginx dựng bằng compose (ảnh `apps/web`, DB tạm) và qua Vite proxy | nâng cấp thành công (101) ở cả hai; REST qua `/api/` không đổi |

### 7.9 Thông báo tin mới (TBC) — B6

| Mã | Loại | Kịch bản | Kết quả mong đợi |
|---|---|---|---|
| TBC-01 | I | Bệnh nhân nhắn bác sĩ | một `thong_bao` `TinNhanMoi:{id}` cho bác sĩ; không dòng email |
| TBC-02 | I | tin thứ hai khi chưa đọc | vẫn một dòng |
| TBC-03 | I | bác sĩ đọc hết rồi Bệnh nhân nhắn tiếp | dòng cũ đã đọc; thêm một dòng mới |
| TBC-04 | I | hộp thư chung ba Lễ tân; một người trả lời | mỗi Lễ tân một dòng; trả lời không báo đồng nghiệp; Bệnh nhân nhận một dòng |
| TBC-05 | U, I | nội dung, tên tệp rất dài, tên dài | không có nội dung tin, tên tệp, SĐT, email; ≤ 500 |
| TBC-06 | I | người nhận ngưng hoạt động | không ghi |
| TBC-07 | U | danh mục và DMS-13 | có `TinNhanMoi` `coThu` sai; `CHO_MODULE` không còn `chat` |
| TBC-08 | E, W | Trung tâm thông báo | `lienKet` `{ kieu: 'HoiThoai', hoiThoaiId }`; nút mở đúng trang theo vai trò |
| TBC-09 | I | đọc một phần (còn tin chưa đọc) | thông báo vẫn chưa đọc |
| TBC-10 | I | "đánh dấu tất cả đã đọc" ở Trung tâm rồi có tin mới | ghi dòng mới |

### 7.10 Bảo mật dữ liệu và log (BCH)

| Mã | Loại | Kịch bản | Kết quả mong đợi | Task |
|---|---|---|---|---|
| BCH-01 | I, E | bắt log khi gửi thành công, lỗi, lỗi socket, lỗi tải tệp | không nội dung, tên tệp, SĐT, email, token | B1, B4, B5 |
| BCH-02 | E | ép lỗi DB khi gửi | 500 chung; log không nội dung | B3 |
| BCH-03 | I | mọi thao tác chat | không dòng `email_thong_bao`, `nhat_ky_hanh_dong` | B6 |
| BCH-04 | W | nội dung `<img src=x onerror=…>` | hiện nguyên chữ, không chạy | F3 |
| BCH-05 | E | mọi phản hồi REST chat, kể cả lỗi | `Cache-Control: no-store` | B2, B3 |
| BCH-06 | E | thân lỗi | không lặp lại nội dung đã gửi | B3 |

### 7.11 Hợp đồng và kiến trúc (HCH)

| Mã | Loại | Kịch bản | Kết quả mong đợi | Task |
|---|---|---|---|---|
| HCH-01 | U | quét mã `chat/` | đúng một nơi `INSERT INTO hoi_thoai` | B1 |
| HCH-02 | U | SQL của chat | tham số hoá; không `SELECT *` | B1 |
| HCH-03 | U | bảng chat ghi | không `INSERT`, `UPDATE`, `DELETE` bảng của module khác, trừ `thong_bao` ở `chat/notifications/` | B1 |
| HCH-04 | U | REST và gateway | cùng gọi lõi gửi; không chép luật | B3, B5 |
| HCH-05 | U | kho tệp | chỉ `chat/attachments/` đọc ghi đĩa; khoá không từ dữ liệu người dùng | P3 |
| HCH-06 | U | danh mục thông báo | không import `chat/` lúc chạy | B6 |

### 7.12 Đồng thời (CCH) — X2 (chạy MỘT mình; ghi số vòng và số 1213/1205/503)

| Mã | Loại | Kịch bản | Kết quả mong đợi |
|---|---|---|---|
| CCH-01 | C | hai tin đầu cùng cặp cùng lúc, 300 vòng | một hội thoại, hai tin; 0 lần 503 |
| CCH-02 | C | tin đầu tới bác sĩ và chi nhánh cùng lúc | hai hội thoại |
| CCH-03 | C | mở × gửi hội thoại khác của cùng Bệnh nhân × nhân sự trả lời | không 503; mọi tin được lưu |
| CCH-04 | C | nhiều tin cùng hội thoại, một người đọc hỏi bù liên tục bằng `sau` | người đọc nhận đủ mọi tin, không sót |
| CCH-05 | C | socket và REST cùng mã cùng lúc | một dòng; một bên `Duplicate` |
| CCH-06 | C | hai `read` cùng người với hai id khác nhau | mốc là id lớn; không lùi |
| CCH-07 | C | gửi × `read` × "đánh dấu tất cả" của Trung tâm | IVC-06 đúng; không 503 |
| CCH-08 | C | gửi × khoá tài khoản người nhận | hoặc tin lưu trước khi khoá, hoặc 409; không nửa vời |
| CCH-09 | C | hai Lễ tân trả lời cùng lúc | hai tin; hai dòng thành viên |
| CCH-10 | C | 25 tin cùng lúc một hội thoại | đúng 20 được nhận |
| CCH-11 | C | hai tải tệp cùng mã cùng lúc | một dòng, một tệp trên đĩa |

### 7.13 Giao diện (WCH) — mức GỌN

| Mã | Task | Kịch bản | Kết quả mong đợi |
|---|---|---|---|
| WCH-01 | F1 | menu ba khung | "Tin nhắn" có `to`, số hội thoại chưa đọc (`99+`, ẩn khi 0), nhãn truy cập |
| WCH-02 | F1 | route theo vai trò; Quản trị viên | đúng ba route; Quản trị viên không có |
| WCH-03 | F1 | API client và tải nhị phân | đọc đúng hình dạng; lỗi, 401, quá giờ như lớp client |
| WCH-04 | F2 | kết nối | token trong gói xác thực; token mới khi nối lại; đóng khi đăng xuất hay gỡ khung; một kết nối mỗi tab |
| WCH-05 | F2 | dự phòng | socket nối thì ngừng tự làm tươi 15 giây; mất kết nối thì bật lại và gửi qua REST; nối lại thì ngừng |
| WCH-06 | F2 | mốc bù và gộp | tin đẩy không tăng mốc; nối lại tải bù, gộp, bỏ trùng, đúng thứ tự; ack quá giờ gửi lại cùng mã |
| WCH-07 | F3 | danh sách | tải, rỗng, lỗi, mất mạng; tab; ô tìm gửi lên máy chủ; "Xem thêm" |
| WCH-08 | F3 | khung tin | tải tin cũ; tự cuộn đúng; ngăn ngày giờ Việt Nam; tự làm tươi 15 giây bằng `sau=` mốc bù, dừng khi tab ẩn hay mất mạng |
| WCH-09 | F3 | ô soạn | Enter, Shift+Enter; đếm ký tự; không gửi rỗng; lỗi giữ nội dung; "Gửi lại" cùng `maGui`; bấm đúp một lần |
| WCH-10 | F3 | không gửi được; 404 | khoá kèm lý do; câu không có quyền |
| WCH-11 | F3 | đánh dấu đọc | chỉ khi khung mở và tab hiện; một lần mỗi giá trị (cả `StrictMode`) |
| WCH-12 | F4 | bắt đầu trò chuyện | chi nhánh theo API, rồi chi nhánh đang chọn, "Toàn quốc" phải chọn; đổi được; `?bacSi=`; banner và quan hệ |
| WCH-13 | F4 | nút ở tra cứu | Bệnh nhân: liên kết; khách: đăng nhập rồi quay lại; vai trò khác: vô hiệu |
| WCH-14 | F6 | đính kèm | chọn, chặn sớm loại và cỡ, xem trước, gửi `multipart`, ảnh object URL được thu hồi, PDF tải xuống, lỗi giữ tệp |
| WCH-15 | F3 | trợ năng | bàn phím, tiêu điểm, vùng `log` chỉ đọc tin mới |
| WCH-16 | F3 | 375 px và từ 1024 px | một màn có "Quay lại"; hai cột; không tràn ngang |
| WCH-17 | F6 | đột biến web | bốn loại bị bắt (kho trình duyệt, bấm đúp, tính ở client, chặn theo trạng thái) |
| WCH-18 | F5 | hộp thư Bác sĩ | danh sách, tìm theo tên, lọc chưa đọc, quan hệ, banner, không có nút tạo mới |
| WCH-19 | F5 | hộp thư Lễ tân | nhãn "Chờ trả lời" / "Đã trả lời · tên", tên và SĐT Bệnh nhân, tìm theo tên, SĐT, email, 404 |

### 7.14 Kiểm tay trình duyệt (KCH) — X3 (ba vai trò; 125 phần trăm và 375 px; không dùng DB `clinix` khi chưa được Đại đồng ý)

KCH-01 Bệnh nhân bấm "Nhắn tin" ở thẻ bác sĩ khi chưa đăng nhập, đăng nhập rồi quay lại đúng khung; KCH-02 Bệnh nhân gửi, Bác sĩ ở cửa sổ khác thấy ngay không tải lại, chuông và số menu tăng; KCH-03 Bác sĩ trả lời, Bệnh nhân thấy ngay; KCH-04 nhắn lễ tân: chi nhánh chọn sẵn đúng, đổi được; hai Lễ tân cùng thấy; một người trả lời, người kia thấy nhãn; KCH-05 tắt đường socket (chặn nâng cấp), vẫn nhắn được qua dự phòng, bật lại tự nối; KCH-06 mất mạng giữa lúc gửi, gửi lại không trùng; KCH-07 gửi ảnh và PDF, tải về đúng; tệp sai loại bị chặn; KCH-08 khoá tài khoản bác sĩ khi đang chat; KCH-09 đăng xuất ở tab khác; KCH-10 chạy lại đầu cuối (nhắn tin) qua ảnh nginx của `apps/web` (compose dựng riêng, DB tạm; bắt tay đã kiểm ở SOC-16); KCH-11 125 phần trăm và 375 px; KCH-12 bàn phím và trình đọc màn hình ở danh sách, khung, ô soạn. Mỗi ca ghi kết quả thật vào TRACKING mục 2.

## 8. Đề xuất gom cụm (chỉ đề xuất — nhóm chốt)

**Cụm 1 = S0 + S1 + S4** (P1, P3, P4, X1, B1, B2, B3, B6, F1, F3, F4, F5: 64,5 giờ): đủ ba use case bằng chữ kèm thông báo, gửi qua REST và tự làm tươi; **Cụm 2 = S2 + S3 + S5** (B4, B5, F2, F6, D1, X2, X3: 39,5 giờ): tức thời, tệp, hoàn tất. Muốn thấy sớm thì giao Cụm 1 trước (P3, P4 vẫn nên làm sớm vì X1 cần chúng để đo).

## 9. Quy trình bắt buộc cho mỗi PR của scope

Theo `AGENTS.md` mục 5 và `CONTRIBUTING.md`: nhánh `feat/chat-…` do người dùng tạo, không làm trên `main`; viết test theo mã test case rồi code; chạy `lint`, `build`, `test` (và `test:int`, `test:e2e` cho task ĐẦY ĐỦ) ở máy và báo kết quả **thật**; task `[ĐỒNG BỘ TL]` sửa tài liệu trong **cùng PR**; cập nhật `docs/features/chat/TRACKING.md` và tick ô tương ứng; cấu hình mới vào `.env.example`; lối tắt kỹ thuật vào `docs/TECH_DEBT.md`; ghi AI log theo người dùng; **không** `git add`, `commit`, `push` do AI; tiêu đề PR là commit cuối (squash), Conventional Commits, scope `chat` (hạ tầng `db`, `docker`, `web`; module khác bị chạm `notification`), ≤ 100 ký tự; PR cần Đại approve và CI xanh (bảy check bắt buộc). Đột biến là lane nặng. **Không đọc, in hay chép `.env` thật; không đưa nội dung tin thật vào prompt hay log.**

## 10. Điều kiện hoàn thành scope

Trạng thái ghi ở chat D1 (28/11/2026): ô nào chưa tick thì ghi rõ còn chờ task nào; X3 tick nốt khi tổng kết scope.

- [ ] Ba use case chạy đúng trên MySQL thật: 2.4.20 (mọi bước và A1), 2.4.21 (mọi bước và A1), 2.4.29 (hai luồng, A1, A2). *(Chờ X3: ca tự động NBS, NLE, NBN đã Pass trên MySQL thật; còn kiểm tay KCH.)*
- [ ] Mọi mã test case ở mục 7 đã chạy hoặc ghi rõ lý do hoãn ở TRACKING mục 2 (KCH có kết quả thật). *(149/172 đã chạy; chờ X2: CCH-01…CCH-11, X3: KCH-01…KCH-12.)*
- [ ] IVC-01…IVC-08 xanh sau mọi ca đồng thời; 0 lần 503; số 1213 và 1205 được ghi. *(Chờ X2.)*
- [x] 30 đột biến ở 5.15 đều bị ít nhất một ca bắt. *(Mỗi đột biến đã bị bắt ở task của nó, ghi ở TRACKING mục 2; X3 chạy lại theo lô.)*
- [ ] M1 đến M10 có số đo thật và kết luận (P2 làm hay đóng); tiêu chí không đổi sau khi thấy số. *(M1 đến M7 có số, P2 làm phần (b); chờ X1: M8, M9, M10.)*
- [x] Không nội dung tin, tên tệp trong log, thông báo, email, nhật ký (BCH, TBC-05). *(BCH-01…BCH-06, TBC-05 Pass ở B1 đến B6, F3.)*
- [ ] Chạy được qua Vite proxy và ảnh nginx, gồm WebSocket và tải tệp; volume tệp được mô tả cách sao lưu. *(WebSocket qua nginx và Vite: SOC-16 ở P4; chờ X3: tải tệp qua nginx; cách sao lưu volume chưa có, nợ 323 (b).)*
- [ ] Danh mục thông báo khớp mã (DMS xanh); ba file `docs/database/*` khớp migration; `docs/TRACKING.md` có một dòng; nháp nợ gửi Đại; việc sửa Word (4.6) do Đại báo xong. *(DMS, ba file DB, dòng `docs/TRACKING.md` và nợ 323 đến 325 đã xong ở D1; chờ Đại: sửa Word 4.6.)*
- [ ] CI xanh (bảy check), jscpd ≤ 3% (CI đo), 0 lỗi lint. *(Mỗi PR đã merge đều xanh; chờ CI của các PR X1 đến X3.)*

## Phụ lục A. Nguyên văn 2.4.20, 2.4.21, 2.4.29 (sao chép bằng script từ `2.4_Dac_Ta_Use_Case_CLINIX.docx`, không diễn giải)

Nguồn: `D:\du_lieu\TLCN_CLINIX\2.4_Dac_Ta_Use_Case_CLINIX.docx` (file gốc, 76 use case), đọc bằng `python-docx` ngày 26/11/2026; mỗi dòng trong ô Word giữ thành một đoạn. Dự án không dùng Use Case ID. **Đối chiếu với `Drive_Hien_Tai\2.4_Dac_Ta_Use_Case_CLINIX.docx`:** 2.4.20 và 2.4.21 trùng số, Nhắn tin với bệnh nhân là 2.4.28 ở đó; **cả ba giống từng dòng** (21, 22 và 26 dòng).

### 2.4.20. Use case Nhắn tin với bác sĩ

**Mô tả.**

Cho phép Bệnh nhân nhắn tin văn bản bất đồng bộ với bất kỳ bác sĩ nào trong hệ thống, không yêu cầu đã từng đặt lịch với bác sĩ đó. Khung chat hiển thị trạng thái quan hệ (đã từng khám/chưa từng khám, tính động từ lịch sử lịch hẹn) để bác sĩ tham khảo, kèm banner: chỉ tư vấn sơ bộ, không thay khám trực tiếp, không kê đơn.

**Tác nhân kích hoạt.**

Bệnh nhân.

**Tiền điều kiện.**

Đã đăng nhập vai trò Bệnh nhân (bắt buộc đăng nhập).

**Hậu điều kiện.**

Thành công: Tin nhắn được gửi và lưu vào hội thoại giữa Bệnh nhân và bác sĩ được chọn (tạo hội thoại mới nếu chưa có); bác sĩ nhận được thông báo tin nhắn mới.

Thất bại: Tin nhắn không được lưu/gửi; hệ thống hiển thị lỗi tương ứng.

**Các bước thực hiện.**

(1) Bệnh nhân bấm nút "Nhắn tin với bác sĩ" — đặt trên trang chi tiết hồ sơ bác sĩ, hoặc ngay trên thẻ bác sĩ trong danh sách — với bất kỳ bác sĩ nào, không giới hạn đã từng khám.

(2) Hệ thống kiểm tra đã có hội thoại giữa Bệnh nhân và bác sĩ này chưa; nếu chưa, chuẩn bị tạo hội thoại mới khi có tin nhắn đầu tiên.

(3) Hệ thống hiển thị khung chat kèm banner cảnh báo (tư vấn sơ bộ, không thay khám trực tiếp, không kê đơn) và trạng thái quan hệ (đã từng khám/chưa từng khám, tính động từ lịch sử lịch hẹn Đã xác nhận/Hoàn thành với bác sĩ này).

(4) Bệnh nhân nhập nội dung tin nhắn và gửi.

(5) Hệ thống lưu tin nhắn vào hội thoại hiện có, hoặc tạo hội thoại mới nếu đây là tin nhắn đầu tiên; hiển thị trong khung chat, gửi thông báo tin nhắn mới cho bác sĩ.

(6) Bệnh nhân có thể xem lại lịch sử hội thoại bất kỳ lúc nào.

**Luồng thay thế.**

A1. Gửi tin nhắn thất bại do lỗi hệ thống/kết nối

5a. Hệ thống không lưu/gửi được tin nhắn do lỗi hệ thống hoặc mất kết nối.

5b. Hệ thống hiển thị thông báo lỗi, giữ nguyên nội dung Bệnh nhân đã nhập để gửi lại.

### 2.4.21. Use case Nhắn tin với lễ tân

**Mô tả.**

Cho phép Bệnh nhân trò chuyện với Lễ tân qua hộp thư chung của một chi nhánh; chi nhánh được hệ thống tự xác định theo lịch hẹn liên quan nếu có, nếu không thì dùng "chi nhánh đang chọn" hiện tại.

**Tác nhân kích hoạt.**

Bệnh nhân.

**Tiền điều kiện.**

Đã đăng nhập vai trò Bệnh nhân.

**Hậu điều kiện.**

Thành công: Tin nhắn được gửi vào hội thoại giữa Bệnh nhân và hộp thư chung của chi nhánh xác định; Lễ tân thuộc chi nhánh đó nhận được thông báo tin nhắn mới.

Thất bại: Tin nhắn không được lưu/gửi; hệ thống hiển thị lỗi tương ứng.

**Các bước thực hiện.**

(1) Bệnh nhân chọn chức năng "Nhắn tin với lễ tân".

(2) Hệ thống xác định chi nhánh: nếu Bệnh nhân có lịch hẹn liên quan gần nhất, dùng chi nhánh của lịch hẹn đó; nếu không, dùng "chi nhánh đang chọn" hiện tại của Bệnh nhân.

(3) Bệnh nhân xác nhận chi nhánh (có thể đổi sang chi nhánh khác nếu muốn).

(4) Hệ thống hiển thị khung chat với hộp thư chung của chi nhánh đó.

(5) Bệnh nhân nhập nội dung tin nhắn và gửi.

(6) Hệ thống lưu tin nhắn vào hội thoại hiện có (tạo mới nếu chưa có), gửi thông báo tới Lễ tân thuộc chi nhánh đó.

(7) Bệnh nhân có thể xem lại lịch sử hội thoại bất kỳ lúc nào.

**Luồng thay thế.**

A1. Gửi tin nhắn thất bại do lỗi hệ thống/kết nối

6a. Hệ thống không lưu/gửi được tin nhắn do lỗi hệ thống hoặc mất kết nối.

6b. Hệ thống hiển thị thông báo lỗi, giữ nguyên nội dung Bệnh nhân đã nhập để gửi lại.

### 2.4.29. Use case Nhắn tin với bệnh nhân

**Mô tả.**

Use case dùng chung tên nhưng khác luồng nghiệp vụ theo tác nhân: (1) Bác sĩ nhắn tin bất đồng bộ trực tiếp với bất kỳ bệnh nhân nào đã chủ động nhắn tới mình, khung chat hiển thị trạng thái quan hệ (đã từng khám/chưa từng khám); (2) Lễ tân giải đáp thắc mắc của bệnh nhân qua hộp thư chung của chi nhánh mình được gán, tìm hội thoại theo họ tên/số điện thoại/email của bệnh nhân.

**Tác nhân kích hoạt.**

Bác sĩ, Lễ tân.

**Tiền điều kiện.**

Đã đăng nhập với vai trò Bác sĩ hoặc Lễ tân.

Với Bác sĩ: chỉ truy cập hội thoại mà mình là người tham gia (Ownership).

Với Lễ tân: hội thoại cần xử lý thuộc chi nhánh mình được gán (Branch Scope).

**Hậu điều kiện.**

Thành công: Tin nhắn được gửi/lưu vào hội thoại tương ứng (1-1 với Bác sĩ, hoặc hộp thư chung chi nhánh với Lễ tân); bệnh nhân nhận được thông báo tin nhắn mới.

Thất bại: Tin nhắn không được lưu/gửi; hệ thống hiển thị lỗi tương ứng.

**Các bước thực hiện.**

(1) (Luồng Bác sĩ) Bác sĩ chọn chức năng "Nhắn tin với bệnh nhân", chọn một hội thoại do bệnh nhân đã chủ động nhắn tới (Bác sĩ không tự khởi tạo hội thoại mới với bệnh nhân).

(2) Hệ thống kiểm tra Bác sĩ là người tham gia hội thoại đó (Ownership).

(3) Hệ thống hiển thị khung chat kèm trạng thái quan hệ (đã từng có lịch hẹn Đã xác nhận/Hoàn thành với bệnh nhân này, hay chưa từng khám).

(4) Bác sĩ nhập nội dung và gửi.

(5) Hệ thống lưu tin nhắn, gửi thông báo cho bệnh nhân.

(6) (Luồng Lễ tân — thay thế từ bước 1) Lễ tân chọn chức năng "Nhắn tin với bệnh nhân", tìm hội thoại theo họ tên/số điện thoại/email bệnh nhân trong hộp thư chung của chi nhánh mình được gán; hệ thống kiểm tra hội thoại thuộc chi nhánh Lễ tân được gán (Branch Scope), rồi thực hiện các bước gửi tin nhắn tương tự bước 3–5 ở trên.

**Luồng thay thế.**

A1. Không có quyền truy cập hội thoại

2a. Hệ thống phát hiện Bác sĩ không phải người tham gia hội thoại, hoặc hội thoại không thuộc chi nhánh Lễ tân được gán.

2b. Hệ thống từ chối truy cập, thông báo không có quyền — use case kết thúc.

A2. Gửi tin nhắn thất bại do lỗi hệ thống/kết nối

5a. Hệ thống không lưu/gửi được tin nhắn do lỗi hệ thống hoặc mất kết nối.

5b. Hệ thống hiển thị thông báo lỗi, giữ nguyên nội dung đã nhập để gửi lại.

## Phụ lục B. Nguyên văn các use case và tài liệu liên quan (chỉ phần chạm tới nhắn tin; sao chép bằng script)

### 2.4.59. Use case Trung tâm thông báo

**Mô tả.**

Cho phép người dùng đã đăng nhập xem danh sách, chi tiết, đánh dấu đã đọc thông báo của tài khoản mình; hiển thị số lượng chưa đọc và thông báo tức thời trong ứng dụng (không phải thông báo đẩy trên thiết bị di động). Chỉ truy cập thông báo của chính mình.

**Hậu điều kiện.**

Thành công: Người dùng xem được danh sách/chi tiết thông báo của mình; thông báo được đánh dấu đã đọc nếu chọn.

Thất bại: Không áp dụng (use case chủ yếu chỉ đọc, trừ hành động đánh dấu đã đọc).

### 2.4.68. Use case Gửi thông báo theo sự kiện nghiệp vụ

**Mô tả.**

Gửi thông báo (trong ứng dụng và email) khi có các sự kiện nghiệp vụ: xác nhận đặt lịch; huỷ, đổi lịch, hoàn thành; thanh toán thất bại; hoàn tiền xong; kết quả yêu cầu rút tiền; đánh dấu vắng mặt; khoá do no-show; gửi lời mời và kết quả waitlist; nghỉ phép; thay đổi lịch hoạt động hoặc dịch vụ khả dụng của chi nhánh đã được duyệt và sắp có hiệu lực, ảnh hưởng lịch hẹn của bệnh nhân (gửi cho từng bệnh nhân bị ảnh hưởng, trước thời điểm có hiệu lực); kết quả yêu cầu thay đổi chi nhánh cho người đề xuất. Hai kênh: thông báo trong ứng dụng và email; "đẩy tức thời" chỉ là việc hiển thị ngay thông báo trong ứng dụng cho phiên đang hoạt động, không phải thông báo đẩy trên thiết bị di động.

**Tiền điều kiện.**

Một sự kiện nghiệp vụ thuộc danh sách được định nghĩa vừa xảy ra (đặt lịch, huỷ, đổi lịch, hoàn thành, thanh toán thất bại, hoàn tiền, kết quả yêu cầu rút tiền, đánh dấu vắng mặt, khoá no-show, waitlist, nghỉ phép; thay đổi lịch hoạt động/dịch vụ khả dụng của chi nhánh đã duyệt và sắp có hiệu lực; kết quả yêu cầu thay đổi chi nhánh).

**Hậu điều kiện.**

Thành công: Thông báo trong ứng dụng được tạo cho (các) tài khoản liên quan; đồng thời một email tương ứng được gửi qua Dịch vụ Email (use case "Gửi email thông báo theo sự kiện").

Thất bại (gửi email lỗi): Thông báo trong ứng dụng vẫn được tạo; việc gửi email được ghi nhận thất bại, không chặn luồng nghiệp vụ chính đã kích hoạt sự kiện. Email có thể được gửi lại; mỗi thông báo có tối đa một email đã gửi.

### 2.4.7. Use case Trò chuyện với Trợ lý AI (hỏi – đáp & gợi ý đặt lịch) (một luồng thay thế)

A1. Câu hỏi ngoài phạm vi hoặc mang tính khẩn cấp y tế

4a. Dịch vụ AI hoặc hệ thống nhận diện câu hỏi vượt phạm vi tư vấn (yêu cầu chẩn đoán/kê đơn cụ thể) hoặc có dấu hiệu khẩn cấp.

4b. Hệ thống trả lời nêu rõ giới hạn của Trợ lý AI, hướng người dùng đến bác sĩ/cơ sở y tế gần nhất, hoặc gợi ý dùng kênh "Nhắn tin với lễ tân" nếu là tình huống cấp cứu.

4c. Use case tiếp tục ở trạng thái chờ câu hỏi mới — không kết thúc hội thoại.

### 2.4.76. Use case Trả lời câu hỏi cho Trợ lý AI Hỏi – đáp

**Mô tả.**

Sinh câu trả lời cho Trợ lý AI dựa trên dữ liệu công khai do hệ thống CLINIX cung cấp; không chẩn đoán, không kê đơn. Dùng kiến trúc dự phòng nhiều lớp: Gemini (gemini-2.0-flash) → Groq (llama-3.1-8b-instant) → Ollama cục bộ (qwen2.5:3b) → phản hồi dựng sẵn; mỗi lớp timeout 6–8 giây, thử lại 1 lần, cooldown 60 giây; không fine-tune.

### 2.4.8. Use case Đặt lịch khám

**Mô tả.**

Cho phép Bệnh nhân đặt lịch khám trực tuyến qua 3 điểm vào:

(1) Trực tiếp bấm nút "Đặt lịch khám" trên thanh điều hướng/trang chủ để vào trang đặt lịch riêng;

(2) Từ trang chủ/danh mục dịch vụ duyệt theo dịch vụ/chuyên khoa, bấm chọn thẳng một khung giờ cụ thể của một bác sĩ để vào trang đặt lịch với chuyên khoa/bác sĩ/khung giờ đã điền sẵn;

(3) Từ trang danh sách/chi tiết bác sĩ, bấm chọn khung giờ ngay trên trang bác sĩ.

Việc chọn khung giờ chỉ lưu lựa chọn, chưa giữ chỗ. Hệ thống kiểm tra lại và chỉ giữ chỗ khi Bệnh nhân bắt đầu thanh toán cọc. Lịch hẹn chỉ được xác nhận sau khi thanh toán thành công trong thời gian giữ chỗ (tức thì nếu dịch vụ không yêu cầu đặt cọc), nếu không lịch tự hủy và khung giờ được giải phóng.

### 2.4.26. Use case Xem danh sách lịch hẹn được phân công

**Mô tả.**

Cho phép Bác sĩ xem danh sách lịch hẹn mình được phân công phụ trách, hiển thị theo dòng thời gian (ngày/tuần/tháng).

### 2.4.37. Use case Tra cứu hồ sơ bệnh nhân

**Mô tả.**

Cho phép Lễ tân tìm kiếm hồ sơ bệnh nhân theo họ tên, số điện thoại, hoặc email; hiển thị kèm danh sách hồ sơ người thân liên kết với tài khoản đó.

**Tiền điều kiện.**

Đã đăng nhập vai trò Lễ tân.

### 2.4.40. Use case Quản lý tài khoản người dùng (bước khoá tài khoản)

(7) Hệ thống cập nhật trạng thái tương ứng, thông báo cho Quản trị viên; nếu khoá tài khoản, thu hồi ngay các phiên đăng nhập hiện tại của tài khoản đó

### 1.2.1 Yêu cầu chức năng (các hàng nhắn tin và phân quyền; `1.2.1_Yeu_Cau_Chuc_Nang.docx`)

**Dữ liệu lưu trữ (một đoạn).** Thông báo trong ứng dụng; hội thoại (mã, loại: Bệnh nhân–Bác sĩ / Bệnh nhân–Lễ tân, chi nhánh liên quan, danh sách người tham gia, người tạo, thời điểm tạo; mỗi người tham gia lưu mốc tin đã đọc cuối cùng, hội thoại không có trạng thái đóng) và tin nhắn (mã, mã hội thoại, người gửi, nội dung, tệp đính kèm, thời điểm gửi); mã OTP email; nhật ký hành động nhạy cảm (Audit Log); cấu hình hệ thống.

**Bộ phận: Bệnh nhân Mã số: BN — hàng 19: Nhắn tin với bác sĩ.**

- Nhắn tin văn bản bất đồng bộ với bất kỳ bác sĩ nào trong hệ thống, không yêu cầu đã từng đặt lịch với bác sĩ đó; không video call.

- Hiển thị trạng thái quan hệ trên khung chat để bác sĩ phân biệt: đã từng có lịch hẹn Đã xác nhận/Hoàn thành với bác sĩ đó, hay chưa từng khám, tính động từ lịch sử lịch hẹn, không lưu field riêng.

- Xem lại lịch sử và gửi tin mới bất kỳ lúc nào; hội thoại không có trạng thái đóng.

- Có banner: tư vấn sơ bộ, không thay khám trực tiếp, không kê đơn.

Ghi chú: Bắt buộc đăng nhập. Quyền kiểm tra ở Backend.

**Bộ phận: Bệnh nhân Mã số: BN — hàng 20: Nhắn tin với lễ tân.**

- Trò chuyện với Lễ tân qua hộp thư chung của chi nhánh,  chi nhánh xác định theo lịch hẹn liên quan nếu có; nếu chưa từng đặt lịch, bệnh nhân tự chọn chi nhánh cần tư vấn khi bắt đầu hội thoại.

- Xem lịch sử, gửi tin theo quy tắc như trên.

Ghi chú: Kiểm tra quyền ở Backend theo Role + Ownership + Branch Scope.

**Bộ phận: Bác sĩ Mã số: BS — hàng 13: Nhắn tin với bệnh nhân.**

- Nhắn tin văn bản bất đồng bộ với bất kỳ bệnh nhân nào chủ động nhắn tới, không yêu cầu bệnh nhân đã từng đặt lịch với mình; không video call.

- Hiển thị trạng thái quan hệ trên khung chat: bệnh nhân đã từng có lịch hẹn Đã xác nhận/Hoàn thành với mình, hay chưa từng khám.

- Xem lại lịch sử và gửi tin mới bất kỳ lúc nào (hội thoại không có trạng thái đóng).

Ghi chú: Chỉ truy cập hội thoại mà mình là người tham gia (Ownership), không giới hạn theo bệnh nhân đã từng khám.

**Bộ phận: Lễ tân Mã số: LT — hàng 17: Nhắn tin với bệnh nhân.**

- Giải đáp thắc mắc của bệnh nhân qua hộp thư chung của chi nhánh; tìm hội thoại theo họ tên, số điện thoại, email.

Ghi chú: Kiểm tra quyền ở Backend theo Role + Branch Scope.

**Yêu cầu hệ thống — hàng 4: Phân quyền.**

Vai trò kết hợp quyền sở hữu/phạm vi (Role + Ownership + Branch Scope) cho 5 tác nhân: Khách, Bệnh nhân, Bác sĩ, Lễ tân, Quản trị viên. Quản trị viên có phạm vi Toàn hệ thống hoặc Chi nhánh, dùng chung một role kết hợp thuộc tính phạm vi. Mọi truy cập dữ liệu và hội thoại được kiểm tra ở Backend, không chỉ ẩn/hiện giao diện; Quản trị viên không mặc nhiên được xem dữ liệu khám bệnh chi tiết.

Ghi chú: Đảm bảo an toàn dữ liệu và kiểm soát truy cập.

### 1.3.10 Quy trình nhắn tin tư vấn trực tuyến (`1.3_Quy_Trinh_Tac_Nghiep_CLINIX.docx`)

Hệ thống cung cấp hai kênh nhắn tin cho Bệnh nhân. Với bác sĩ, Bệnh nhân có thể nhắn tin văn bản bất đồng bộ với bất kỳ bác sĩ nào, kể cả khi chưa từng đặt lịch với bác sĩ đó, từ trang chi tiết hoặc thẻ bác sĩ trong danh sách. Khung chat hiển thị cảnh báo (chỉ tư vấn sơ bộ, không thay khám trực tiếp, không kê đơn) và trạng thái quan hệ đã từng khám hay chưa từng khám, được tính từ lịch sử lịch hẹn; hội thoại chỉ được tạo khi có tin nhắn đầu tiên. Bác sĩ chỉ trả lời các hội thoại do bệnh nhân chủ động nhắn tới và chỉ truy cập được hội thoại mà mình tham gia. Với lễ tân, Bệnh nhân nhắn vào hộp thư chung của một chi nhánh; chi nhánh được xác định theo lịch hẹn liên quan gần nhất, nếu không có thì dùng chi nhánh đang chọn, và Bệnh nhân có thể đổi sang chi nhánh khác.

Phía Lễ tân tìm hội thoại theo họ tên, số điện thoại hoặc email của bệnh nhân trong hộp thư chung của chi nhánh mình được gán và không truy cập được hội thoại ngoài phạm vi chi nhánh. Với cả hai kênh, mỗi tin nhắn được lưu vào hội thoại, người nhận nhận được thông báo tin nhắn mới và người dùng có thể xem lại lịch sử hội thoại bất kỳ lúc nào; khi gửi lỗi, hệ thống giữ nguyên nội dung đã nhập để gửi lại.
