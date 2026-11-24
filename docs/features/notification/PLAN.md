# Kế hoạch scope #10: `notification` Thông báo (Trung tâm thông báo, Gửi thông báo theo sự kiện nghiệp vụ, Gửi nhắc lịch hẹn theo lịch trình, Gửi email thông báo theo sự kiện)

> **Trạng thái: bản nháp 1, giai đoạn 1 (24/11/2026). Cả 19 câu hỏi đã có quyết định**: Đại trả lời trực tiếp Q1 đến Q10 (ba hộp câu hỏi, cả mười theo đề xuất) và Q14 đến Q19 (Q15 thêm một điều chỉnh cho thư nhắc lịch; Q16 giữ `[cần điền]`); phiên kiểm độc lập duyệt Q11 đến Q13 theo ủy quyền của Đại; ghi ở [`TRACKING.md`](TRACKING.md) mục 3.1. Còn lại: các `[cần điền]` ở 4.3 và việc ngoài repo ở 4.5. Chưa mở PR; **chưa tạo issue** (danh sách issue đề xuất ở mục 6.6; Đại tự chạy script tạo issue sau khi PR tài liệu merge và các `[CHỜ …]` có xác nhận).
> **Người LÀM scope này: Trung (`junUTE`), module `notification`; Đại (`MaxTrann`) review** (ngược với scope đổi lịch). Điểm chạm file của Đại gắn `[ĐỤNG booking]`, `[ĐỤNG patient]` (Đại approve PR tài liệu coi là xác nhận, nếp payment P1): `appointments/notifications/*`, `appointments/state/*`, `appointments/appointments.constants.ts`, `features/patient/shell/*`.
> Kế hoạch do AI (Claude Code, model Claude Sonnet 5.5) lập theo [`docs/FEATURE_PLANNING_PROMPT.md`](../../FEATURE_PLANNING_PROMPT.md) và prompt lập kế hoạch scope #10 do Đại dán vào phiên ngày 24/11/2026 → **ghi nhật ký AI cho lần lập kế hoạch này ở `AI_USAGE_LOG.md`: dòng `[đề xuất]` 184** (kiểm lại số lớn nhất trên `main` lúc ghi; lúc soạn: `origin/main` có đến dòng 181, hàng 182 và 183 dành cho PR kế hoạch đổi lịch và reschedule P1; bản nháp dòng ở [`TRACKING.md`](TRACKING.md) mục 4). **Phiên này KHÔNG sửa `AI_USAGE_LOG.md` và `docs/TECH_DEBT.md`** (chỉ soạn nháp, Đại quyết ghi ở PR sau).
> Đã kiểm mã thật trên `origin/main` ở **`75ed996`** (24/11/2026, PR 632). Chỗ nào ghi **"chưa đo"** là suy ra từ mã hay tài liệu, **chưa chạy thử** trên MySQL thật; danh sách việc phải đo nằm ở mục 5.12 và gom vào task X1. Phiên này **không chạy** `npm`, test, build, Docker hay MySQL, **không đọc** `.env` thật, và **không sửa** file nào ngoài hai file mới `docs/features/notification/PLAN.md`, `TRACKING.md`.
> Scope này là **#10** trong lộ trình, giao cho Trung làm **song song** với scope #9 đổi lịch của Đại (PLAN đã merge ở PR 632, Epic #633, 20 task #634 đến #653); sau nó là danh sách chờ (#11), báo cáo và audit, chat, AI. **Mã nằm trong `apps/api/src/notification/`** (thư mục đã có `BranchChangeNotifier` của admin C4) và `apps/web/src/features/notification/` (mới); scope commit là `notification`.
> **Hai điều kiện chặn phải đọc trước khi chia việc:** (1) bảng `nhac_lich_hen` **chưa có migration và chưa có entity** (đã kiểm lại ở mục 2: `1793090000000-tao-bang-van-hanh.ts` chỉ có một câu `ALTER TABLE email_thong_bao COMMENT` nhắc tên bảng, không có `CREATE TABLE`; phiên kiểm độc lập cũng báo như vậy), nên task nền P1 là điều kiện của job nhắc lịch; (2) các task sửa `appointments/notifications/*` (B4, B5, B6) **phải chờ reschedule B3** (task đổi lịch sửa đúng các file này), không giành file.

## 0. Quy ước đọc

- Tên use case viết tắt, **trùng tiền tố mã test** (quét ngày 24/11/2026 bằng `grep` trên `docs/`, `apps/api/src`, `apps/web/src`: chưa ai dùng; danh sách đầy đủ ở mục 7): **TTB** = Trung tâm thông báo (2.4.59); **NLH** = Gửi nhắc lịch hẹn theo lịch trình (2.4.69); **DMS** = danh mục sự kiện và Gửi thông báo theo sự kiện nghiệp vụ (2.4.68); **EMT** = Gửi email thông báo theo sự kiện (2.4.75); **QTB** = quyền và phạm vi; **MTB** = migration và schema; **HTB** = hợp đồng và cổng; **BTB** = bảo mật dữ liệu và log; **CTB** = đồng thời; **WTB** = giao diện; **KTB** = kiểm tay. `b4` = bước (4); `A1/3b` = luồng thay thế A1, mục 3b; "MT" = Mô tả; "TĐK" = tiền điều kiện; "HĐK" = hậu điều kiện. Nguyên văn bốn use case ở **Phụ lục A**, các use case liên quan ở **Phụ lục B** (sao chép bằng script, không gõ lại). **Dự án không dùng Use Case ID**, chỉ tên.
- **Đánh số use case:** file gốc `D:\du_lieu\TLCN_CLINIX\2.4_Dac_Ta_Use_Case_CLINIX.docx` (76 use case, có use case hệ thống) đánh số Trung tâm thông báo là **2.4.59**; bản làm việc `Drive_Hien_Tai\2.4_Dac_Ta_Use_Case_CLINIX.docx` (57 use case có tác nhân chính) đánh số **2.4.56** và gộp ba use case hệ thống 2.4.68, 2.4.69, 2.4.75 vào bước (6) đến (13) và luồng A2 đến A6 của chính nó. **Nội dung không phát hiện chỗ khác nhau** (mục 3.3 L1). PLAN này dùng số của file gốc.
- Nguồn đúng khi lệch nhau: **schema DB (`docs/database/`) để code**; chỗ 2.4, schema, Figma và mã lệch nhau ở mục 3.3 và 3.4, đã hỏi ở mục 4.2. **Không tự chọn bên nào** (AGENTS mục 1.6). Figma chỉ là bản phác thảo: **không đề xuất đồng bộ lại Figma**; mã và PLAN là nguồn đúng.
- Thẻ: `[ĐỒNG BỘ TL]` = task phải sửa tài liệu (2.4 và các file Word ở repo `TLCN_CLINIX`, `docs/database/*` cả ba file) trong **cùng PR** (file Word do Đại sửa, ngoài repo này); `[TIỀN ĐỀ]` = việc nền; `[CHỜ Qn]` = chờ câu hỏi Qn; `[CHỜ Trung]` = cần Trung xác nhận; `[CHỜ Đại]` = cần Đại xác nhận; `[CHỜ <module>]` hay `[CHỜ reschedule B3]` = chờ module hay task đó có mã; `[ĐỤNG x]` = sửa file thuộc module x (báo người sở hữu); `[ĐỤNG router]` = `router/role-nav.ts`, `router/role-routes.tsx`; `[ĐỤNG shared]` = `shared/**`; `[ĐỤNG database]` = `database/entities.ts`, `database/migrations/index.ts`, `app.module.ts`; `[SOẠN TRƯỚC]` = viết được ngay nhưng **chưa merge** khi phụ thuộc chưa có; `[SAU]` = ngoài scope này, ghi để không quên.
- Mỗi task = **một PR** nhỏ, **chỉ backend HOẶC chỉ frontend**, khoảng 2 đến 7 giờ làm; scope commit `notification` (hạ tầng: `api`, `web`, `db`, `docs`; module khác bị chạm: `booking`, `doctor`, `admin`). Test đặt cạnh mã; mỗi test ghi mã test case. Mã task: `P` nền, `B` backend, `F` frontend, `D` đồng bộ tài liệu, `X` đo thật, kiểm tay và tổng kết. Task có khoá, giao dịch, job chạy đồng thời hay đụng worker thư gắn mức kiểm **ĐẦY ĐỦ** (đột biến, `test:int` và `test:e2e`, ca đồng thời chạy một mình, EXPLAIN cho câu SQL mới); task web và task chỉ đọc đơn giản gắn mức **GỌN** (đột biến web bốn loại: kho trình duyệt/URL/log, bấm đúp, tính toán ở client, chặn theo trạng thái; không chạy tay jscpd và gitleaks, CI đo).
- `[đề xuất]` = giá trị AI tự đề xuất, chưa chốt; `[cần điền]` = thiếu thông tin, chưa có đề xuất. **Cuối mục 4.3 liệt kê lại cả hai loại.**
- **Mã task trùng** với mã của `booking` (B1…B19, F1…F12, P1…P8, X1…X4) và của `reschedule` (P1, P2, B1…B9, F1…F5, D1, X1…X3). Khi nhắc ngoài file này luôn viết **"notification B2"** (task của scope này), **"reschedule B3"** hay **"booking B15"**; issue và PR dùng nhãn `[notification]` và hậu tố `(notification B2)`.
- **Thuật ngữ:** "thông báo" = một dòng `thong_bao` (trong ứng dụng); "thư của thông báo" = dòng `email_thong_bao` của nó; "hộp thư đi" = bảng `email_thong_bao`; "worker thư" = `EmailOutboxService` và `EmailOutboxJob` (booking B15); "nhắc lịch" = dòng `nhac_lich_hen` và thư nhắc của nó (không có `thong_bao`); "mốc" = một phần tử số giờ của `cau_hinh_he_thong.thoi_diem_nhac_lich`; "danh mục sự kiện" = file danh mục mã `loai_su_kien` ở `notification/catalog/` (Q5); "chuông" = nút thông báo kèm số chưa đọc ở thanh trên.

## 1. Phạm vi

**Làm (bốn use case, theo `docs/PLAN.md` mục "Thông báo / nhắc lịch"):**

| Use case | Tác nhân | Việc chính của scope | Đường vào |
|---|---|---|---|
| **2.4.59 Trung tâm thông báo** | Bệnh nhân, Bác sĩ, Lễ tân, Quản trị viên (cả hai phạm vi) | Danh sách (phân trang, lọc tất cả, chưa đọc, đã đọc), chi tiết, đánh dấu đã đọc một và tất cả, số chưa đọc, hiển thị tức thời (thăm dò 30 giây, Q1); chỉ thông báo của chính mình | chuông ở thanh trên và mục menu "Thông báo" của bốn khung vai trò |
| **2.4.68 Gửi thông báo theo sự kiện nghiệp vụ** | Hệ thống (các use case khác kích hoạt) | **Danh mục sự kiện** chung (Q5, đọc chỉ), bổ sung thư cho hoàn thành lịch khám và nghỉ phép (Q6), sự kiện tiếp đón cho Bác sĩ (Q7); chừa chỗ cho đổi lịch, waitlist, chat | các notifier hiện có của 7 nơi; không đổi hợp đồng của module khác trừ B4, B5, B6 |
| **2.4.69 Gửi nhắc lịch hẹn theo lịch trình** | Hệ thống (job `@Cron` mỗi phút) | Quét lịch `DaXacNhan` đạt mốc, tạo dòng `nhac_lich_hen`, nhận việc có điều kiện, gửi thư, thử lại tối đa 3 lần cách 5 phút (Q3), không gửi bù (Q2) | job `AppointmentReminderJob` |
| **2.4.75 Gửi email thông báo theo sự kiện** | Dịch vụ Email | Mở rộng worker thư sẵn có (booking B15) cho loại mới; kết quả từng thư; không gửi trùng; test chỉ dùng SMTP giả | `EmailOutboxJob` (đã có), mẫu thư mới |

**Cùng phần hệ thống chúng chạm (phần của scope, không phải use case riêng):** cấu hình thời điểm nhắc (2.4.42: **đã có** ở admin, chỉ đọc); gửi email mã OTP (2.4.73) và kích hoạt tài khoản nhân sự (2.4.74): **phân ranh, không đổi** (hai thư này gọi thẳng `MailService`, không có `thong_bao`, không có `email_thong_bao`; scope này chỉ dùng chung `MailService`, `renderMailShell`); giữ chỗ và mời waitlist (2.4.61, 2.4.62: **chỉ chừa chỗ**); bốn sự kiện của đổi lịch (reschedule B3: scope này chỉ **ghi danh mục** và hiển thị).

**Không làm (module khác hoặc sau; chỉ nêu cổng ở mục 5.9):**
- Thông báo đẩy trên thiết bị di động (use case ghi rõ không làm; DB không có bảng token thiết bị; Flutter làm sau).
- `NotificationService` chung thay cả 7 notifier hiện có (Q5 chọn sổ danh mục chỉ đọc; lý do và chi phí ở 4.2).
- Job dọn thông báo cũ (Q4: giữ mãi; ghi nợ).
- Chuông ở header công khai khi Bệnh nhân đang đặt lịch (Q10: không ở đợt đầu; ghi nợ). Hộp thả xuống (dropdown) của chuông: **chuông là liên kết tới trang** (Q14, Đại đã trả lời; hộp thả xuống ghi nợ, nháp TECH_DEBT 272).
- Sự kiện và thư của **danh sách chờ** (#11: mời, kết quả), của **chat** (tin nhắn mới): chỉ chừa dòng ở danh mục.
- Thông báo cho Bệnh nhân khi tiếp đón hay khôi phục trạng thái (2.4.34 b5): Q7 chỉ thêm cho Bác sĩ; phần còn lại ghi lệch.
- Tắt hay bật từng loại thông báo theo người dùng, xoá thông báo, lưu trữ: use case không có.
- Phản hồi nhanh trong thư nhắc (2.4.69: "không kèm phản hồi nhanh"); thông báo trong ứng dụng cho nhắc lịch (2.4.75 b4 và `COMMENT` của bảng: nhắc lịch **không có** `thong_bao`).
- Gửi lại thư bằng tay từ giao diện (TECH_DEBT 129), ngưỡng tuổi cho thư tồn (TECH_DEBT 127): giữ nguyên nợ.
- Gửi email thật, đọc `.env` thật: mọi test dùng `FakeMailService` hoặc `mail/testing/fake-smtp-server.ts`.
- Sửa `docs/features/reschedule/*`, `AI_USAGE_LOG.md`, `docs/TECH_DEBT.md`, `docs/database/*` ở PR kế hoạch này (chỉ báo; sửa ở D1, P1 và các task `[ĐỒNG BỘ TL]`).
- Đồng bộ lại Figma: không (Figma chỉ phác thảo).

### 1.1 Bảng use case → luồng, điều kiện, ngoại lệ → ĐÃ CÓ hay CÒN THIẾU → thành phần mã sẽ chạm

Cột "Luồng" ghi số bước và mã luồng thay thế theo nguyên văn Phụ lục A. "Hiện trạng" là kết quả kiểm mã ở `75ed996` (chi tiết ở mục 2). Tên tệp là nơi **sẽ** tạo hoặc sửa (`notification/` = `apps/api/src/notification/`; `web/` = `apps/web/src/`); "đã có" = dùng lại, không sửa.

| UC | Luồng, điều kiện, ngoại lệ (nguyên văn rút gọn) | Hiện trạng | Thành phần mã | Task |
|---|---|---|---|---|
| 2.4.59 | TĐK: đã đăng nhập, bất kỳ vai trò nào trong bốn vai trò | **ĐÃ CÓ** mẫu `@Roles` cả bốn vai trò (`patient/profile/profile.controller.ts`); **CÒN THIẾU** route | `notification/center/notification-center.controller.ts` | B2 |
| 2.4.59 | b1, b2: mở Trung tâm; danh sách thông báo của tài khoản mình, mới nhất trước, kèm số chưa đọc | **CÒN THIẾU** API và web; **đã có** bảng và chỉ mục `thong_bao_index_25 (tai_khoan_id, trang_thai_doc, thoi_diem_tao)` | `GET /notifications`, `GET /notifications/unread-count`; `web/features/notification/pages/notification-center-page.tsx` | B2, F2 |
| 2.4.59 | b3, b4: chọn một thông báo xem chi tiết; hệ thống tự đánh dấu đã đọc | **CÒN THIẾU** | `GET /notifications/:id`, `POST /notifications/:id/read` (Q11: đọc thuần và ghi riêng); panel chi tiết gọi `read` một lần | B2, F2 |
| 2.4.59 | MT: "đánh dấu đã đọc thông báo của tài khoản mình"; Figma Make có "Đánh dấu tất cả đã đọc" | **CÒN THIẾU** | `POST /notifications/read-all` (chia lô 500, `READ COMMITTED`, 5.4) | B2, F2 |
| 2.4.59 | b5, MT: thông báo mới trong lúc đang hoạt động hiện ngay vào danh sách (đẩy tức thời, không phải đẩy thiết bị) | **CÒN THIẾU** | thăm dò `unread-count` mỗi 30 giây khi tab hiện (Q1); tải lại trang 1 khi số tăng | F1, F2 |
| 2.4.59 | MT, HĐK: chỉ truy cập thông báo của chính mình | **CÒN THIẾU** kiểm; id từ token, không nhận `taiKhoanId` | điều kiện `tai_khoan_id = người gọi` trong MỌI câu SQL; id của người khác ⇒ 404 cùng thân với "không có" | B2 |
| 2.4.59 | A1: không có thông báo nào ⇒ danh sách trống | **CÒN THIẾU** | `items: []`, `total: 0`; web câu rỗng riêng cho từng bộ lọc | B2, F2 |
| 2.4.59 | (ngầm) chuông và số đếm ở khung của từng vai trò | **CÒN THIẾU**; bốn khung đang có mục "Thông báo" **vô hiệu** (`router/role-nav.ts` dòng 52, 79, 91; `admin-sidebar.tsx` dòng 176; `admin-header.tsx` nút `disabled`); TECH_DEBT 62 | `RoleShell` (prop mới), `role-nav.ts` (`to`), `AdminHeader`; `web/shared/routes/notification-paths.ts` | F1, F3 |
| 2.4.68 | b1 đến b3: use case khác kích hoạt sự kiện; xác định tài khoản; tạo `thong_bao` | **ĐÃ CÓ một phần:** 7 nơi ghi (5.3), **không có danh mục mã chung**, mỗi nơi tự cắt 500 ký tự | `notification/catalog/notification-catalog.ts` (chỉ đọc, Q5) và test đối chiếu | B1 |
| 2.4.68 | MT: xác nhận đặt lịch; huỷ; hoàn thành; thanh toán thất bại; hoàn tiền; kết quả rút tiền; vắng mặt; khoá no-show; nghỉ phép; thay đổi chi nhánh; kết quả thay đổi chi nhánh | **ĐÃ CÓ mã** 11 nhóm (booking 4, doctor-exam 1, doctor 4, payment 5, wallet 6, admin 7 mã); **CÒN THIẾU** đổi lịch (reschedule B3), waitlist (#11) | catalog ghi cả mã đã có và mã chừa chỗ | B1 |
| 2.4.68 | b4: ghi nhận bản ghi email (chờ gửi) rồi gửi qua Dịch vụ Email | **ĐÃ CÓ** cho 13 loại (booking 4, payment 5, thay đổi chi nhánh 4); **CÒN THIẾU** hoàn thành lịch khám và nghỉ phép (Q6) | `insertEmailRow` (đã có, dùng lại); mẫu thư mới; `MAIL_EVENTS` thêm loại | B4, B5 |
| 2.4.68 | b5: cập nhật số chưa đọc, hiển thị ngay nếu tài khoản đang hoạt động | **CÒN THIẾU** | như b5 của 2.4.59 | F1 |
| 2.4.68 | A1: gửi email thất bại, thông báo giữ nguyên, không hoàn tác sự kiện gốc | **ĐÃ CÓ** (`EmailOutboxService`: `ThatBai` + `loi_cuoi` cố định, thử lại 3 lần cách 5 phút) | kế thừa; chạy lại với loại mới | B4, B5 (EMT-08) |
| 2.4.68 | A2: một sự kiện nhiều lịch của nhiều bệnh nhân (thay đổi chi nhánh): mỗi bệnh nhân một thông báo, chạy lại không trùng | **ĐÃ CÓ** (admin C4, UNIQUE theo yêu cầu) | không đổi | — |
| 2.4.68 | HĐK: "đồng thời một email tương ứng" và "mỗi thông báo tối đa một email đã gửi" | **KHỚP một phần:** `email_thong_bao.thong_bao_id UNIQUE`; nhưng **chỉ một số loại có thư** (quy tắc 62; admin Q9) | danh mục ghi cột "có thư"; L8 ở 3.3 | B1 |
| 2.4.32 b5, 2.4.34 b5 | tiếp đón: "thông báo cho Bác sĩ phụ trách" (b5 của 2.4.32); "thông báo cho bệnh nhân" (b5 của 2.4.34) | **CÒN THIẾU**: booking đã chốt tiếp đón không có sự kiện | `LichHenDaTiepDon` cho Bác sĩ, chỉ trong ứng dụng (Q7) | B6 |
| 2.4.69 | b1: định kỳ quét lịch `DaXacNhan` sắp tới, xác định lịch vừa đạt mốc | **CÒN THIẾU**; `cau_hinh_he_thong.thoi_diem_nhac_lich` và form admin **đã có**; bảng `nhac_lich_hen` có DDL nhưng **chưa có migration, entity** | `notification/reminders/appointment-reminder.job.ts`, `reminder.query.ts`; migration + `admin/entities/nhac-lich-hen.entity.ts` | P1, B3 |
| 2.4.69 | b2: soạn nội dung nhắc (thông tin lịch hẹn, thời gian còn lại) | **CÒN THIẾU** mẫu | `reminder-mail.templates.ts` (khuôn thư B15, dựng trên `renderMailShell`; **ghi thời gian hẹn cụ thể** như "14:30 ngày 02/12", Q15) | B3 |
| 2.4.69 | b3: nhận việc cho mốc, chỉ một tiến trình nhận được | **CÒN THIẾU**; nếp `CLAIM_EMAIL_SQL` của B15 | `UPDATE … WHERE so_lan_thu = :đã đọc` (quy tắc 41) | B3, X2 |
| 2.4.69 | b4: kết quả riêng từng cặp (lịch, mốc): chờ gửi, đã gửi, thất bại kèm lỗi và số lần thử; mốc theo CHÍNH số giờ | **CÒN THIẾU** | khoá chính `(lich_hen_id, so_gio_truoc)` | B3 |
| 2.4.69 | A1: gửi lỗi, thử lại tối đa 3 lần cách 5 phút, chỉ khi lịch còn `DaXacNhan` và chưa tới giờ hẹn; hết lần thì bỏ mốc, không gửi bù | **CÒN THIẾU**; `[cần điền]` "lần đầu có tính không" → **Q3 đã trả lời** | `reminder.constants.ts` (3 lần gồm lần đầu, 5 phút) | B3 |
| 2.4.69 | A2: lịch huỷ hay đổi trước mốc: không gửi; đổi lịch thì tính mốc theo khung giờ mới | **CÒN THIẾU**; lịch mới là `lich_hen` mới nên tự có bộ mốc mới (quy tắc 41) | điều kiện `trang_thai = 'DaXacNhan'`; chờ reschedule B4 chỉ cho ca E2E đổi lịch thật | B3 |
| 2.4.69 | A3: lịch đặt sát giờ, mốc đã qua: `[cần điền]` có gửi bù không, trễ tối đa bao lâu | `[cần điền]` → **Q2 đã trả lời:** không gửi bù, trễ tối đa 10 phút | `cua_so_tre_phut = 10` (hằng) | B3 |
| 2.4.75 | b1 đến b3: CLINIX gửi yêu cầu (địa chỉ, nội dung theo mẫu) tới Dịch vụ Email; nhận kết quả | **ĐÃ CÓ** (`MailService`, `SmtpMailService`; test: `FakeMailService`, `fake-smtp-server.ts`) | dùng lại | — |
| 2.4.75 | b4: cập nhật bản ghi email: `DaGui` + thời điểm; nhận việc bằng cập nhật có điều kiện; không bao giờ hai email `DaGui` cho một thông báo; với nhắc lịch: bản ghi của mốc | **ĐÃ CÓ** cho `email_thong_bao`; **CÒN THIẾU** cho `nhac_lich_hen` | `CLAIM_EMAIL_SQL` (đã có); `reminder.query.ts` (mới) | B3 |
| 2.4.75 | A1: lỗi ⇒ `ThatBai` + lỗi + tăng số lần thử; gửi lại trên chính bản ghi; `[cần điền]` số lần, khoảng cách (`[đề xuất]` 3 lần, 5 phút) | **ĐÃ CÓ** (`EMAIL_MAX_ATTEMPTS = 3`, `EMAIL_RETRY_GAP_MINUTES = 5`) | điền chữ cho 2.4.75 ở D2 | D1 |
| 2.4.75 | MT: loại có thư: xác nhận đặt lịch, thanh toán, hoàn tiền, waitlist, nhắc lịch, thay đổi chi nhánh | **KHỚP một phần:** mã còn gửi thêm huỷ, vắng mặt, khoá no-show, rút tiền; Q6 thêm hoàn thành và nghỉ phép; waitlist chưa có | L7 ở 3.3 | B4, B5 |

### 1.2 Nơi đặt và ranh giới với module khác

- Thư mục mã (`[đề xuất]`): `apps/api/src/notification/catalog/` (danh mục), `notification/center/` (API Trung tâm thông báo), `notification/reminders/` (job và thư nhắc lịch); entity bảng nền `NhacLichHen` ở `apps/api/src/admin/entities/` (nếp "entity bảng nền dùng chung một chỗ", booking PLAN 5.1). Web: `apps/web/src/features/notification/` và `apps/web/src/shared/routes/notification-paths.ts`.
- **Hai module Nest mới** (`NotificationCenterModule` gồm controller, service, repository và danh mục; `ReminderModule` gồm job, service, mẫu thư, nhập `MailModule` và `SystemConfigModule`), mỗi module một dòng ở `app.module.ts` `[ĐỤNG database]`. `NotificationModule` hiện có (xuất `BranchChangeNotifier`) **giữ nguyên**.
- **Worker thư không chuyển nhà:** `EmailOutboxService` và `EmailOutboxJob` ở lại `appointments/notifications/` (B4 và B5 chỉ thêm loại và mẫu thư ở đó, nên `[ĐỤNG booking]`, `[CHỜ reschedule B3]`). Lý do: chuyển nhà là refactor đụng AR-06 và hàng chục ca của booking, payment, wallet, admin, doctor-exam (chiều phụ thuộc: các module ghi gọi `appointments/notifications/thong-bao-insert.query.ts`).
- Thư mục tài liệu: `docs/features/notification/` (theo prompt của Đại). Commit scope `notification`.
## 2. Hiện trạng repo (đã kiểm ở `75ed996`, 24/11/2026)

| Chỗ | Tình trạng | Nguồn kiểm |
|---|---|---|
| Bảng `thong_bao` | Có (migration `1793090000000-tao-bang-van-hanh.ts`, cộng `1793448000000-thong-bao-lich-hen.ts`); cột `thong_bao_id`, `tai_khoan_id`, `noi_dung varchar(500)`, `loai_su_kien varchar(100)`, `trang_thai_doc`, `yeu_cau_thay_doi_chi_nhanh_id`, `lich_hen_id`, `thoi_diem_tao`; chỉ mục `thong_bao_index_25 (tai_khoan_id, trang_thai_doc, thoi_diem_tao)` và hai UNIQUE `(…_id, tai_khoan_id, loai_su_kien)`. **Không có** cột tiêu đề, kiểu liên kết, thời điểm đọc. Entity `admin/entities/thong-bao.entity.ts` | `clinix_mysql.sql:556-565, 697-701`; entity |
| Bảng `email_thong_bao` | Có; `thong_bao_id UNIQUE` (đúng một dòng thư mỗi thông báo), `trang_thai` (`ChoGui`, `DaGui`, `ThatBai`, `BoQua`), `so_lan_thu`, `lan_thu_cuoi_luc`, `da_gui_luc`, `loi_cuoi`; CHECK `chk_email_thong_bao_ket_qua`; entity có | `clinix_mysql.sql:567-576, 1039-1044` |
| Bảng `nhac_lich_hen` | DDL **có** ở `clinix_mysql.sql:578-588`, chỉ mục `nhac_lich_hen_index_trang_thai (trang_thai, lan_thu_cuoi_luc)`, FK `lich_hen_id`, hai CHECK (`chk_nhac_lich_hen_moc`, `chk_nhac_lich_hen_ket_qua`). **KHÔNG có migration** (`grep "CREATE TABLE \`nhac_lich_hen\`"` ở `apps/api/src/database/migrations/` không ra file nào; chữ `nhac_lich_hen` chỉ nằm trong một câu `ALTER TABLE email_thong_bao COMMENT` và trong chuỗi `CREATE TABLE cau_hinh_he_thong`) và **KHÔNG có entity**. Quy tắc DB 41 và `COMMENT` của bảng ghi "ChoGui = đã tạo nhưng chưa có worker nhận" | `docs/database/`; `database/migrations/`; `admin/entities/` (đã tự kiểm lại sau tin của phiên kiểm độc lập) |
| `cau_hinh_he_thong.thoi_diem_nhac_lich` | Cột `json NOT NULL DEFAULT (json_array(72,24,2))`, CHECK `chk_cau_hinh_nhac_lich` (mảng số nguyên dương không trùng, **DB chấp nhận mảng rỗng**); form admin (admin B5) đã đọc và ghi, `REMINDER_LIMITS = { maxItems: 5, minHours: 1, maxHours: 720 }` (**1 đến 5 mốc**, không cho rỗng); `SystemConfigService.getOrThrow()` ném `HE_THONG_CHUA_CAU_HINH` (409) khi chưa có dòng | `admin/system-config/system-config-params.ts`, `system-config.service.ts` |
| Nơi ghi `thong_bao` | **BẢY** nơi, không có cổng chung: (1) booking `BookingNotifier` (qua `insertThongBao` + `insertEmailRow`); (2) doctor `LeaveNotifier` (INSERT riêng, **không** thư); (3) doctor-exam `ExamNotifier` (qua `insertThongBao`, **không** thư); (4) payment `topup-notifier.ts` (INSERT riêng + `insertEmailRow` cho `NapViThatBai`); (5) wallet `refund-notifier.ts` (`insertThongBao` + `insertEmailRow`); (6) wallet `withdrawal-notifier.ts` (INSERT riêng + `insertEmailRow` cho hai loại); (7) admin `BranchChangeNotifier` (INSERT riêng + `insertEmailRow`). `thong-bao-insert.query.ts` của booking là nơi duy nhất viết `INSERT INTO email_thong_bao` (AR-06) | `grep "INSERT INTO thong_bao"`; `appointments/testing/architecture-rules.ts:194-217` |
| Mã sự kiện đã có | **27 mã**: booking 4 (`LichHenDaXacNhan`, `LichHenDaHuy`, `LichHenVangMat`, `KhoaDatLichNoShow`); doctor-exam 1 (`LichHenHoanThanh`); doctor 4 (`NghiPhepDaGui`, `NghiPhepChoDuyet`, `NghiPhepDaDuyet`, `NghiPhepTuChoi`); payment 5 (`NapViThanhCong`, `NapViThatBai`, `NapViDaDoiSoat`, `NapViCanXuLy`, `NapViChuaXuLyDuoc`); wallet 6 (`RutTienDaGui`, `RutTienDuocDuyet`, `RutTienBiTuChoi`, `HoanCocThanhCong`, `HoanCocCanXuLy`, `HoanTienDacBiet`); admin 7 (`KetQuaYeuCauThayDoiChiNhanh`, `ThayDoiChiNhanhAnhHuongLichHen:v{n}`, `HuyThayDoiChiNhanh`, `DoiHieuLucThayDoiChiNhanh:v{n}`, `YeuCauThayDoiChiNhanhQuaHan:v{n}`, `KetQuaDoiHieuLucThayDoiChiNhanh:v{n}`, `RutThayDoiChiNhanh`). Hằng nằm ở **sáu** file khác nhau; `NOTIFICATION_MAX_LENGTH = 500` bị khai **bốn lần** (wallet, doctor-exam, `LEAVE_NOTIFICATION_MAX_LENGTH`, `THONG_BAO_MAX_LENGTH` của admin) | `appointments.constants.ts:172`, `examination.constants.ts:34`, `leave-notifier.ts` (`LEAVE_EVENTS`), `payment.constants.ts:20`, `wallet.constants.ts:66, 90`, `notification/branch-change-events.ts` |
| Worker thư | `EmailOutboxService` + `EmailOutboxJob` ở `appointments/notifications/` (`NotificationsModule`, một dòng ở `app.module.ts`); mỗi phút (giây thứ 5), lô 100 × tối đa 10, `EMAIL_MAX_ATTEMPTS = 3`, `EMAIL_RETRY_GAP_MINUTES = 5`, nhận việc bằng `UPDATE … WHERE so_lan_thu = :đã đọc`, `NOT_CONFIGURED` không tính lần thử, tắt khi `NODE_ENV=test`. Danh sách trắng `MAIL_EVENTS` = **13 loại** (booking 4 + payment 5 + thay đổi chi nhánh 4) so bằng `SUBSTRING_INDEX(loai_su_kien, ':', 1)`. Mẫu thư ở `booking-mail.templates.ts`, `payment-mail.templates.ts`, `branch-change-mail.templates.ts`, dựng trên `renderMailShell` (không script, ảnh, liên kết) | `email-outbox.*`, `notifications.constants.ts` |
| `MailService` và thư khác | `MailService` (trừu tượng, `send` một thư), `SmtpMailService` (Gmail SMTP, mỗi lần một kết nối, không pool: TECH_DEBT 21); OTP và liên kết kích hoạt gọi thẳng `MailService` (không có `thong_bao`); test: `FakeMailService` (`attempts`, `sent`, `failNextWith`, `failAllWith`) và `fake-smtp-server.ts` | `mail/` |
| Job và lịch | `ScheduleModule.forRoot()` MỘT lần ở `app.module.ts` (AR-03 quét `forRoot(` trong `appointments/`); các lớp `@Cron` hiện có: hết hạn giữ chỗ, Vắng mặt, gửi thư, hoàn cọc, đối soát nạp ví, dọn tài khoản chưa xác minh, dọn ảnh tải lên, áp dụng thay đổi chi nhánh, dọn huỷ nghỉ phép; mọi job `disabled: process.env.NODE_ENV === 'test'`, cờ `running` chống chạy chồng, `run(now?)` không bao giờ ném | `*.job.ts` |
| Thời gian | `nowVN()` trả instant, `toSecond(date)`, `todayVN()`; múi giờ `+07:00` ở driver, session MySQL và `TZ` container; API trả thời gian bằng `toISOString()` (UTC), nơi hiển thị đổi sang giờ Việt Nam | `common/time/time.ts`; `appointments/active-appointment.query.ts:9` |
| Lớp quyền API | `@Roles('BenhNhan','BacSi','LeTan','QuanTriVien')` + `CurrentUser()` trên route dùng chung (mẫu `profile.controller.ts`: không `OriginGuard` vì xác thực bằng header, `Cache-Control: no-store`); phân trang offset `PageQueryDto` (mặc định 20, tối đa 100) + `Paged<T>` (admin Q42); mã lỗi chung `KHONG_TIM_THAY` (404, cùng thân cho "không có" và "ngoài phạm vi"), `DU_LIEU_KHONG_HOP_LE` (400, `loi[{truong, ma}]`), `CHUA_DANG_NHAP` (401) | `patient/profile/`, `common/paging/`, `common/errors/error-codes.ts` |
| Web: khung vai trò | `RoleShell` (`shared/ui/role-shell.tsx`) dùng cho Bệnh nhân (`PatientLayout`), Lễ tân (`ReceptionLayout`), Bác sĩ (`DoctorLayout`); **không có chuông, không có số đếm**; mục "Thông báo" ở `role-nav.ts` (3 khung) **không có `to`** (nút vô hiệu); khung Admin có `AdminHeader` với nút chuông `disabled` và mục sidebar "Thông báo" không `to`. **Không có `features/notification/`**; không có trang nào gọi API thông báo. Quy tắc nối: module có trang chỉ thêm `to` ở `role-nav.ts` và route ở `role-routes.tsx` (Q21d của patient) | `router/role-nav.ts`, `features/admin/components/admin-header.tsx`, TECH_DEBT 62 |
| Web: nếp thăm dò | Không có hook thăm dò nào; có `useRemote` (`shared/hooks/use-remote.ts`), `useOnlineStatus`, lớp client duy nhất `shared/api/client.ts` | `shared/hooks/`, `shared/api/` |
| Chờ module `notification` | TECH_DEBT 62 (chuông và số đếm), 186 (doctor-exam: thư `678:2`, nhắc đánh giá, chuông), mục "Doctor B10" (`LeaveNotifier` chưa có thư; "khi `notification` có `NotificationService` thì thay"); PLAN doctor, doctor-exam, booking, admin có thẻ `[CHỜ notification]` | `docs/TECH_DEBT.md`; `docs/features/*/PLAN.md` |
| Đổi lịch (reschedule) | PLAN đã merge, **chưa có mã**; P1 (migration chạm `thong_bao`: cột `yeu_cau_doi_lich_ngoai_chinh_sach_id` + UNIQUE; ENUM `nhat_ky_hanh_dong`) đang viết ở cửa sổ khác; B3 sửa `appointments/notifications/*` (bốn sự kiện, thư, `MAIL_EVENTS`) | `docs/features/reschedule/PLAN.md` 5.10, 6.2 |
| Figma | Mã Make (`Figma_Make_Sync/source_snapshot`): `pages/shared/NotificationCenterPage.tsx` (một trang cho cả bốn vai trò; ba bộ lọc Tất cả, Chưa đọc, Đã đọc; 20 dòng mỗi trang; panel chi tiết; "Đánh dấu tất cả đã đọc"), `components/shared/NotificationPanel.tsx` (hộp thả xuống của chuông, "Xem tất cả"). Khung (manifest): Bệnh nhân `412:2`, chi tiết `413:2`; Bác sĩ `456:2`; Lễ tân `482:2`; Admin `509:2`, chi tiết `670:2`. **Mẫu thư:** `678:2` (hoàn thành lịch khám), `688:2` (cập nhật nghỉ phép). **Chưa có** khung nào cho thư nhắc lịch | manifest và mã Make |

## 3. Phân tích ảnh hưởng

### 3.1 Bảng và cột scope này chạm tới (đọc từ `docs/database/clinix_mysql.sql`)

| Bảng | Cột | Cách chạm |
|---|---|---|
| `thong_bao` | `tai_khoan_id`, `trang_thai_doc`, `thoi_diem_tao`, `noi_dung`, `loai_su_kien`, `lich_hen_id` | **ĐỌC** ở Trung tâm thông báo (mọi câu có `tai_khoan_id = người gọi`); `UPDATE trang_thai_doc` (một và tất cả); `INSERT` do `ExamNotifier` (đã có), `LeaveNotifier` (đã có), `BookingNotifier` (thêm `LichHenDaTiepDon`, B6). **Không thêm cột, không đổi UNIQUE** (reschedule P1 đang thêm một cột: scope này **không** sửa `thong-bao.entity.ts`, đọc bằng SQL thô nên không xung đột) |
| `email_thong_bao` | cả bảng | `INSERT` qua `insertEmailRow` cho `LichHenHoanThanh` (B4) và ba loại nghỉ phép (B5); worker `UPDATE` (đã có) |
| `nhac_lich_hen` | cả bảng | **TẠO** (P1: migration, entity); `INSERT`, `UPDATE` (nhận việc, kết quả) ở `notification/reminders/` |
| `lich_hen` | `lich_hen_id`, `ma_lich_hen`, `trang_thai`, `thoi_gian`, `benh_nhan_id`, `ho_so_nguoi_than_id`, `bac_si_id`, `khung_gio_id` | chỉ ĐỌC (quét mốc đến hạn, dựng thư, lấy `ma_lich_hen` cho liên kết, lấy `bac_si_id` cho sự kiện tiếp đón); **không ghi** |
| `cau_hinh_he_thong` | `thoi_diem_nhac_lich` | chỉ ĐỌC qua `SystemConfigService.getOrThrow()` |
| `tai_khoan` | `email`, `ho_ten`, `vai_tro` | ĐỌC lúc dựng thư (đã có `readEmailPayload`) |
| `lich_hen` (chỉ mục) | `(trang_thai, thoi_gian)` | **chưa có**; quét nhắc lịch mỗi phút cần (TECH_DEBT 90 ghi NoShowJob đã quét tuyến tính vì thiếu); **chỉ thêm nếu X1 đo vượt ngưỡng (Q8)** ở task P2 |
| `thong_bao` (chỉ mục) | `(tai_khoan_id, thoi_diem_tao)` | **chưa có**; danh sách "tất cả" có thể cần; **chỉ thêm nếu X1 đo vượt ngưỡng (Q8)** ở task P2 |
| `nhat_ky_hanh_dong` | — | **không ghi** (use case không có hành động nhạy cảm; đánh dấu đã đọc không phải) |

### 3.2 API và hành vi đã có hoặc đã chốt bị chạm tới

| Chỗ | Chạm thế nào | Xử lý để không phá thiết kế đã chốt |
|---|---|---|
| `EmailOutboxService.buildMessage` và `MAIL_EVENTS` (B15, payment B17, admin C4) | thêm loại `LichHenHoanThanh` (B4) và `NghiPhepDaGui`, `NghiPhepDaDuyet`, `NghiPhepTuChoi` (B5): thêm hằng, mẫu thư, một nhánh `switch`, một phần tử `MAIL_EVENTS` | **chờ reschedule B3** (cùng file); giữ cấu trúc "viết bằng chữ để booking không import hằng module khác" kèm spec kiểm khớp; `NghiPhepChoDuyet` (Admin) không có thư |
| Ca HDK-06 (`doctor/examination/notifications/exam-notifier.int-spec.ts:105`: hộp thư đi BỎ QUA `LichHenHoanThanh`) | đổi thành "worker GỬI `LichHenHoanThanh`" + ca âm "loại lạ vẫn bị bỏ qua" (B4) | **trùng ca** với reschedule B3 (PLAN reschedule 5.10 viết "sửa ca HDK-06 thành tám loại"): B4 làm SAU reschedule B3 và đọc lại bản ca đã sửa |
| `ExamNotifier` (doctor-exam B1) | thêm `insertEmailRow` sau `insertThongBao` khi `Inserted` (B4) | nếp `refund-notifier.ts` dòng 39; `[ĐỤNG doctor]` (file của Trung, chính người làm) |
| `LeaveNotifier` (doctor B10) | thêm `INSERT email_thong_bao` cho ba loại gửi Bác sĩ (B5); PLAN doctor ghi "thay bằng `NotificationService` khi có": **không thay** (Q5), giữ `LeaveNotifier` | `[ĐỤNG doctor]`; sửa PLAN doctor ở D1 (một dòng) |
| `AppointmentTransitionService.checkIn` và `BookingNotifier` (booking B12) | thêm một sự kiện `LichHenDaTiepDon` cho Bác sĩ (B6) | `[ĐỤNG booking]`, `[CHỜ reschedule B3]`; hằng `BOOKING_NOTIFICATION_EVENTS` thêm một khoá (test BCS-04 "bốn mã" cập nhật thành năm); **không** đổi chữ ký `notify(em, event)` |
| `RoleShell` và ba layout (patient F1, F2; doctor F1) | thêm prop tuỳ chọn cho chuông và số đếm trên menu (TECH_DEBT 62) | prop tuỳ chọn, mặc định ẩn: ca RoleShell và layout cũ không đổi; `[ĐỤNG shared]`, `[ĐỤNG patient]`, `[ĐỤNG doctor]` |
| `AdminHeader`, `admin-sidebar.tsx` (admin F1) | bật nút chuông và mục "Thông báo" | `[ĐỤNG admin]`; ca `admin-layout.test.tsx` sửa tối thiểu (F3) |
| `router/role-nav.ts`, `role-routes.tsx` | thêm `to` cho "Thông báo" ở ba khung, route `/…/thong-bao` ở bốn vai trò | `[ĐỤNG router]`; nếp patient Q21d |
| `database/entities.ts`, `migrations/index.ts`, `app.module.ts` | thêm entity `NhacLichHen`, một migration, hai module | `[ĐỤNG database]`; mốc migration **lớn hơn** mọi migration trên `main` lúc merge (reschedule P1 dự kiến `1793966400000`, kiểm lại) |
| `docs/TECH_DEBT.md` dòng 62, 186, mục "Doctor B10" | đóng khi F1 (62), B4 (186), B5 (Doctor B10) xong | Đại ghi ở PR sau (phiên này chỉ soạn nháp) |
| `docs/TECH_DEBT.md` dòng 90 (NoShowJob quét tuyến tính) | đóng nếu P2 thêm chỉ mục `lich_hen (trang_thai, thoi_gian)` | chỉ khi X1 vượt ngưỡng |

### 3.3 Đối chiếu với thiết kế đã chốt: KHỚP, LỆCH hay MÂU THUẪN (**nêu rõ, đã hỏi ở 4.2**)

| # | Chỗ | Bên A | Bên B | Kết luận |
|---|---|---|---|---|
| L1 | Hai bản 2.4 | File gốc: 2.4.59 (người dùng) + 2.4.68, 2.4.69, 2.4.75 (hệ thống) | `Drive_Hien_Tai` 2.4.56 gộp ba use case hệ thống vào bước (6) đến (13), A2 đến A6 | 2.4.59 **khớp nguyên văn 17 trên 17 câu**; ba use case hệ thống viết lại theo ngôi khác và số bước khác nên khớp máy từng câu thất bại (không phải khác ý); đọc cả hai: **không phát hiện khác biệt về ý** (cùng danh sách sự kiện, cùng [cần điền] A3 và 2c, cùng 3 lần cách 5 phút). Không cần hỏi; báo Đại biết có hai cách đánh số |
| L2 | "Hiển thị ngay" | 2.4.59 b5, 2.4.68 b5: thông báo mới "được hiển thị ngay vào danh sách" | Q1: thăm dò mỗi 30 giây ⇒ độ trễ tối đa 30 giây | **LỆCH nhẹ về chữ "ngay"**; Đại đã chọn. `[ĐỒNG BỘ TL]` thêm "trong vòng 30 giây" vào b5 của 2.4.59 và 2.4.68 (D2) |
| L3 | Nhắc lịch sát giờ | 2.4.69 A3 1b: `[cần điền]` có gửi bù không, trễ tối đa bao lâu; lần đầu có tính vào số lần thử không | Q2, Q3 đã trả lời | Điền: không gửi bù, trễ tối đa 10 phút; tổng 3 lần gồm lần đầu. `[ĐỒNG BỘ TL]` điền A3 và A1 của 2.4.69, quy tắc DB 41 và `COMMENT` bảng (quy tắc 41 và `COMMENT` ghi "Chưa chốt [cần điền]"; **chỉ sửa chữ ở D1, không đổi DDL** nên không cần migration) |
| L4 | Số lần thử email thông báo | 2.4.75 A1 2c: `[cần điền]`, `[đề xuất]` 3 lần cách 5 phút | Mã: `EMAIL_MAX_ATTEMPTS = 3`, `EMAIL_RETRY_GAP_MINUTES = 5` (quy tắc 34, Q9 admin) | **KHỚP** với đề xuất; `[ĐỒNG BỘ TL]` bỏ `[cần điền]` ở 2.4.75 (D2) |
| L5 | "Thanh toán thất bại" | 2.4.68 MT và TĐK liệt kê "thanh toán thất bại" | Mã chỉ có `NapViThatBai` (nạp ví thất bại); thanh toán cọc bằng ví chạy đồng bộ, hết số dư thì trả lỗi tại chỗ và không ghi thông báo | **Mơ hồ** (3.4 MH1): đọc là `NapViThatBai`; nếu Đại muốn thêm thông báo "thanh toán cọc thất bại" thì là sự kiện mới của `payment` (ngoài scope; ghi vào danh mục khi có) |
| L6 | Waitlist | 2.4.68 liệt kê "gửi lời mời và kết quả waitlist"; 2.4.75 liệt kê "lời mời và kết quả danh sách chờ" | Chưa có mã (scope #11); `WaitlistPort` còn `Noop` | **Chừa chỗ:** danh mục có hai dòng `[CHỜ waitlist]` (mã `[cần điền]`), test báo khi module thêm mã mà quên khai (DMS-13) |
| L7 | Danh sách loại có thư | 2.4.75 MT: xác nhận đặt lịch, thanh toán, hoàn tiền, waitlist, nhắc lịch, thay đổi chi nhánh | Mã đang gửi thêm: huỷ, vắng mặt, khoá no-show, rút tiền (được/bị từ chối); Q6 thêm hoàn thành và nghỉ phép | **LỆCH về chữ** (2.4.75 liệt kê thiếu). `[ĐỒNG BỘ TL]` cập nhật MT 2.4.75 cho khớp danh mục (D2) |
| L8 | "Đồng thời một email tương ứng" | 2.4.68 HĐK: mỗi thông báo kèm một email | Quy tắc 62 (payment) và admin Q9: **chỉ một số loại có thư**; còn lại chỉ trong ứng dụng (`NapViThanhCong`, `RutTienDaGui`, `NghiPhepChoDuyet`, `YeuCauThayDoiChiNhanhQuaHan`…) | **LỆCH đã chốt trước** ở module khác (không bàn lại). Danh mục ghi cột "có thư" từng mã; `[ĐỒNG BỘ TL]` sửa HĐK 2.4.68 thành "email cho các sự kiện có kênh email (xem danh mục)" (D2) |
| L9 | Tiếp đón | 2.4.32 b5: "thông báo cho Bác sĩ phụ trách"; 2.4.34 b5: "thông báo cho bệnh nhân" | Booking chốt tiếp đón và khôi phục KHÔNG có sự kiện (`docs/database/clinix_quy_tac_nghiep_vu.md`, mục "booking B12" dòng 661 "không thông báo" và mục "booking B14" dòng 676 "**[cần điền]** nếu nhóm muốn thêm kèm mẫu thư") | Q7: thêm `LichHenDaTiepDon` cho Bác sĩ, chỉ trong ứng dụng; **còn lệch** 2.4.34 b5 (bệnh nhân không nhận). `[ĐỒNG BỘ TL]` sửa 2.4.34 b5 (D2) |
| L10 | Nghỉ phép: bệnh nhân | 2.4.51 HĐK: "bệnh nhân liên quan nhận được thông báo" | Duyệt nghỉ phép huỷ lịch qua dịch vụ huỷ chung (`BacSiNghiPhep`) ⇒ `LichHenDaHuy` cho tài khoản đặt (booking) | **KHỚP** (không cần sự kiện riêng); danh mục ghi `LichHenDaHuy` phục vụ cả hai nguồn |
| L11 | Thay thế `LeaveNotifier` | PLAN doctor Q33, TECH_DEBT "Doctor B10": "khi `notification` có `NotificationService`: thay `LeaveNotifier` và gửi email" | Q5: **không** làm `NotificationService` chung | **Đổi kế hoạch cũ có chủ ý** (Đại chọn): giữ `LeaveNotifier`, chỉ thêm thư (B5); sửa chữ ở PLAN doctor và dòng nợ (D1) |
| L12 | Chuông và số đếm | TECH_DEBT 62: "`notification` thêm chuông + số đếm vào `RoleShell` (prop mới) và đặt `to` ở `role-nav.ts`" | Figma Make: chuông có hộp thả xuống (`NotificationPanel`) và "Xem tất cả" | Làm theo TECH_DEBT 62; **hộp thả xuống ngoài đợt đầu** (Q14, Đại đã trả lời; nháp TECH_DEBT 272) |
| L13 | Mốc nhắc rỗng | DB: `chk_cau_hinh_nhac_lich` chấp nhận mảng rỗng; quy tắc 41: "chưa chốt có cho tắt không" | Admin B5: 1 đến 5 mốc, không cho rỗng | **KHỚP ở tầng ứng dụng**; job vẫn xử lý mảng rỗng như "không nhắc" (NLH-23) phòng dữ liệu nhập tay |
| L14 | Số hàng "tám loại" | PLAN reschedule 5.10: "worker thư quét **tám** loại (thêm bốn loại)" và "HDK-06 hiện khẳng định chỉ bốn loại của booking" | Mã: `MAIL_EVENTS` đã có **13 loại** (4 + 5 payment + 4 thay đổi chi nhánh); HDK-06 nằm ở `exam-notifier.int-spec.ts` và khẳng định "bỏ qua `LichHenHoanThanh`" | **PLAN reschedule ghi sai số hiện trạng** (13 + 4 = 17 sau reschedule B3; sau scope này 17 + 1 + 3 = 21). Không sửa PLAN reschedule ở đây; **Q19: Đại giao việc sửa mục 5.10 và ca HDK-06 cho PR của reschedule B3** |
| L15 | Danh mục mã | `COMMENT` của `thong_bao.loai_su_kien`: "Chưa có danh mục mã sự kiện chung"; chỉ liệt kê hai mã | Quy tắc DB mục admin D6 liệt kê bảy mã; mã thật 27 | Danh mục `notification/catalog/` là nguồn mã (Q5); **không sửa `COMMENT`** (đổi `COMMENT` cột cần migration và qua `schema-parity`); ghi ở D1 |
| L16 | `ROW_COUNT` của tạo dòng nhắc | Quy tắc 41, `COMMENT` bảng: `INSERT … ON DUPLICATE KEY UPDATE lich_hen_id = lich_hen_id`, "ROW_COUNT 1 = vừa tạo, 0 = đã có" | Dự án dùng `mysql2` ^3.24.6; theo hiểu biết của AI (**chưa kiểm trong repo**) `mysql2` mặc định bật cờ `FOUND_ROWS` (đếm hàng khớp, không đếm hàng đổi) ⇒ với dòng đã có có thể trả **1**, làm mất ý nghĩa của quy tắc | **Giả thiết, chưa đo** (M4 ở X1). Nếu đúng như nghi: dùng `INSERT` thường và bắt 1062 trên khoá chính (nếp `insertThongBao`) và sửa chữ quy tắc 41 cùng PR `[ĐỒNG BỘ TL]` |
| **KHỚP** | Hộp thư đi và nhận việc có điều kiện | `email_thong_bao.thong_bao_id UNIQUE`, `CLAIM_EMAIL_SQL`; quy tắc 34 | 2.4.75 b4 | Dùng lại nguyên, không đổi |
| **KHỚP** | Nhắc lịch không có `thong_bao` | `COMMENT` bảng, quy tắc 34 ("không có trạng thái BoQua"), 2.4.75 b4 | 2.4.69 | Làm đúng: chỉ `nhac_lich_hen` |
| **KHỚP** | Lịch đổi giờ ⇒ bộ mốc mới | Quy tắc 41: "đổi giờ tạo `lich_hen` mới nên tự có bộ mốc mới" | 2.4.69 A2; reschedule L11 | Không cần mã riêng; chỉ ca E2E (NLH-09) |

### 3.4 Chỗ mơ hồ còn lại (đã hỏi hoặc đã chọn mặc định ở mục 4.2)

- **MH1 "Thanh toán thất bại"** (2.4.68): đọc là nạp ví thất bại (`NapViThatBai`); không thêm sự kiện (L5).
- **MH2 Người nhận thư nhắc cho lịch của hồ sơ người thân:** tài khoản ĐẶT (`lich_hen.benh_nhan_id`), thư ghi "Người được khám: {tên} (đặt hộ)" như thư xác nhận (nếp B15). `[đề xuất]`.
- **MH3 Tài khoản đặt bị khoá hay ngừng hoạt động:** worker thư hiện không kiểm; nhắc lịch theo cùng nếp, không kiểm `[đề xuất]` (lịch vẫn tồn tại, tài khoản bị khoá không có nghĩa lịch bị huỷ).
- **MH4 Sự kiện tiếp đón qua nhiều đường:** `checkIn` được gọi bởi Lễ tân (đổi trạng thái), thu tiền mặt tại quầy (payment) và Quản trị viên (override sang `DaTiepDon`). `[đề xuất]` sự kiện phát ở **hàm `checkIn`** nên cả ba đường đều báo Bác sĩ một lần (UNIQUE chống trùng); kiểm đúng đường nào gọi `checkIn` khi làm B6 (DMS-10).
- **MH5 "Thời gian còn lại" trong thư nhắc** (2.4.69 b2): **Đại đã chốt (Q15):** thư nhắc ghi **thời gian hẹn cụ thể** dạng "14:30 ngày 02/12" (kèm hàng "Ngày giờ" đầy đủ theo khuôn thư B15), **không** chỉ ghi "còn 2 giờ"; "thời gian còn lại" chỉ là phần phụ "(sau khoảng {mốc} giờ nữa)" theo CHÍNH mốc (ổn định khi gửi lại).
- **MH6 Danh sách "đã đọc" và lọc:** Figma Make có ba bộ lọc (Tất cả, Chưa đọc, Đã đọc) nên API nhận `trangThaiDoc` ba giá trị; không lọc theo nhóm `[đề xuất]`.
- **MH7 Thông báo mồ côi mã:** `thong_bao` có `loai_su_kien` không có trong danh mục (module thêm mã mà quên khai, hay dữ liệu cũ) ⇒ API trả tiêu đề mặc định "Thông báo", không liên kết, **không 500** (TTB-11); test DMS chặn từ gốc.
- **MH8 Thông báo gắn `yeu_cau_thay_doi_chi_nhanh_id` hay `lich_hen_id` bị xoá:** khoá ngoại để mặc định (chặn xoá) nên không xảy ra; không xử lý.

### 3.5 Bẫy và rủi ro (xử lý trong task; khoá và đồng thời chi tiết ở 5.4 và 5.6)

- **R1 Xung đột file với reschedule.** Cùng sửa `appointments/notifications/*` (reschedule B3 và notification B4, B5, B6), `database/entities.ts`, `migrations/index.ts`, `app.module.ts`, ca HDK-06. Xử lý: B4, B5, B6 chờ reschedule B3; P1 chờ reschedule P1 hoặc chọn mốc migration lớn hơn; bảng 6.3.
- **R2 Thăm dò dồn tải.** 200 phiên × mỗi 30 giây ≈ 6,7 yêu cầu mỗi giây vào một câu `COUNT` theo chỉ mục. Chưa đo: M2. Xử lý: tạm dừng khi tab ẩn; một lời gọi đang chạy thì bỏ lượt; số giây là một hằng.
- **R3 Đánh dấu tất cả đọc khoá khoảng chỉ mục.** `UPDATE … WHERE tai_khoan_id = ? AND trang_thai_doc = 0` ở `REPEATABLE READ` (mặc định MySQL) có thể giữ khoá khoảng trên `thong_bao_index_25` và chặn `INSERT thong_bao` của giao dịch booking (đang `READ COMMITTED`, giữ nhiều khoá khác) ⇒ chờ hay 1213. Xử lý: chạy ở `READ COMMITTED`, chia lô 500; đo M5; ca CTB-02.
- **R4 Quét nhắc lịch mỗi phút trên `lich_hen`.** Không có chỉ mục `(trang_thai, thoi_gian)` ⇒ quét khoá chính (như TECH_DEBT 90). Xử lý: truy vấn dạng khoảng hẹp theo từng mốc (`thoi_gian BETWEEN now + mốc − 10 phút AND now + mốc`), đo M3, P2 có điều kiện (Q8).
- **R5 Thông lượng SMTP.** `SmtpMailService` mở một kết nối cho mỗi thư (TECH_DEBT 21): khoảng 1 thư mỗi giây là ước lượng `[đề xuất]` (chưa đo, M7); lượt chạy dài hơn 1 phút thì lượt kế bị bỏ qua (`running`); mốc quá cửa sổ 10 phút không còn được gửi và **không để lại dấu vết** (không có dòng nào). Chấp nhận ở quy mô đồ án; ghi nợ.
- **R6 Thư có thể trùng** khi tiến trình chết đúng giữa SMTP nhận và ghi `DaGui` (TECH_DEBT 126): nhắc lịch kế thừa; chấp nhận.
- **R7 Thư tồn khi mới có SMTP** (TECH_DEBT 127): nhắc lịch có cửa sổ 10 phút nên không tồn; thư `LichHenHoanThanh` và nghỉ phép **chỉ ghi cho thông báo mới** (không backfill, EMT-07) nên không làm nợ 127 nặng thêm so với hiện nay.
- **R8 `thong_bao` là bản ghi bất biến.** Đổi chữ ở `notification-text.ts` không sửa dòng đã ghi (TECH_DEBT 128). Tiêu đề hiển thị lấy từ danh mục nên đổi tiêu đề **đổi cả dòng cũ** (khác `noi_dung`); chấp nhận, ghi ở 5.3.
- **R9 Phân trang offset khi có thông báo mới giữa hai lần bấm trang:** dòng có thể lặp hoặc lệch một dòng giữa hai trang; chấp nhận (Q12 `[đề xuất]`), khoá phụ `thong_bao_id DESC` giữ thứ tự ổn định.
- **R10 Phụ thuộc chéo.** B6 thêm một khoá vào `BOOKING_NOTIFICATION_EVENTS` (test BCS-04 "bốn mã"); B4 và B5 thêm loại vào `MAIL_EVENTS` (ca OBX-06 của booking PLAN ghi "câu SQL lọc đúng bốn loại" trong khi mã đã lọc 13 loại từ payment B17: đọc bản ca hiện hành khi làm).
- **R11 Hai StrictMode.** Trang chi tiết gọi `POST read` khi mở: `useEffect` chạy hai lần ở chế độ dev; phải chặn gọi hai lần (WTB-08, đột biến "bấm đúp").
- **R12 Văn bản người dùng nhập trong thông báo.** `noi_dung` có thể chứa ghi chú, lý do từ chối do nhân sự gõ (ví dụ `NghiPhepTuChoi`, rút tiền): hiển thị dạng chữ, không `dangerouslySetInnerHTML`; thư thoát HTML (BTB-04, EMT-10).
## 4. Câu hỏi và quyết định

### 4.1 Đã chốt ở module khác (kế thừa — **không bàn lại**)

- **auth** (`docs/features/auth/TRACKING.md` mục 3): TypeORM `synchronize: false`, migration viết tay đối chiếu DDL từng dòng; mã lỗi nghiệp vụ ổn định, không 500 cho lỗi UNIQUE/FK/deadlock đã lường trước; khoá hàng theo thứ tự cố định, thử lại 1205/1213, test nhiều tài khoản đồng thời, đồng hồ giả; mọi test mock `MailService`.
- **booking** (`docs/features/booking/PLAN.md` 5.12, B15; TRACKING 3.37): `thong_bao` ghi **trong** giao dịch của lõi bằng `em` của người gọi (lỗi ghi ⇒ hoàn tác cả lần đổi trạng thái); chỉ nuốt 1062 của ĐÚNG chỉ mục UNIQUE ("đã có", không 500); `thong_bao.noi_dung` ≤ 500 ký tự, **không chứa lý do khám**, là hợp đồng chữ (TECH_DEBT 128: phương án P, thư dựng lúc gửi từ DB); worker thư nhận việc bằng `UPDATE` có điều kiện, không giao dịch nào bọc lời gọi SMTP, `NOT_CONFIGURED` không tính lần thử, log không có địa chỉ, tiêu đề, nội dung; tác dụng phụ ngoài DB chỉ sau commit, đúng một lần; hết hạn giữ chỗ **không** thông báo (Q6); Q31 Bệnh nhân không thấy lịch `DaDoiLich`.
- **payment và wallet** (`docs/features/payment/PLAN.md` 5.12; quy tắc DB 62): thông báo của tiền ghi cùng giao dịch với luồng tiền; **năm loại có thư** (`NapViThatBai`, `HoanCocThanhCong`, `HoanTienDacBiet`, `RutTienDuocDuyet`, `RutTienBiTuChoi`), các loại còn lại chỉ trong ứng dụng; `noi_dung` không chứa mã giao dịch cổng, số dư hay lý do nội bộ của Quản trị viên.
- **admin** (`docs/features/admin/PLAN.md` Q9, C4; quy tắc DB mục "admin D6"): `notification/` tối thiểu (`BranchChangeNotifier`), bảy mã sự kiện (bốn loại có thư), hậu tố `:v{n}`; **Q9 "bỏ qua màn Trung tâm thông báo"** (scope này làm màn đó); `REMINDER_LIMITS` 1 đến 5 mốc (Q34); Q40 tài nguyên ngoài phạm vi ⇒ 404 cùng thân; Q42 phân trang offset `common/paging`.
- **doctor** (`docs/features/doctor/PLAN.md` Q33, H12): `LeaveNotifier` ghi `thong_bao` cùng giao dịch, bốn mã `NghiPhep*`, **không** chứa `ly_do` xin nghỉ của Bác sĩ cho Admin; email `[CHỜ notification]`.
- **doctor-exam** (`docs/features/doctor-exam/PLAN.md` Q17, E6, L12): `ExamNotifier` ghi `LichHenHoanThanh` cho tài khoản đặt, không thư (`[CHỜ notification]`, mẫu `678:2`).
- **patient** (Q21b, Q21d, TECH_DEBT 62): chuông và số đếm ẩn cho tới khi module `notification` có; module có trang chỉ thêm `to` ở `role-nav.ts` và route ở `role-routes.tsx`; Q13 không lộ id nội bộ ra API của patient.
- **reschedule** (`docs/features/reschedule/PLAN.md` 5.10): bốn sự kiện `LichHenDaDoiLich`, `YeuCauDoiLichDangCho`, `YeuCauDoiLichDaDuyet`, `YeuCauDoiLichBiTuChoi` do **reschedule B3** ghi; nhắc lịch tính mốc cho lịch mới và bỏ qua lịch `DaDoiLich` là việc của scope này.
- **Quy tắc DB** (`clinix_quy_tac_nghiep_vu.md`): 28 (UNIQUE thông báo theo nguồn), 29 (email: `DaGui` có `da_gui_luc`, `BoQua` không dùng cho nhắc lịch), 31, 34 (nhắc lịch: mỗi (lịch, mốc) một dòng; email 3 lần cách 5 phút), 35 (thiếu cấu hình thì từ chối, không số ngầm), 41 (nhắc lịch theo mốc), 62 (thông báo của tiền).

### 4.2 Câu hỏi gộp và đề xuất (**Đại đã trả lời trực tiếp ngày 24/11/2026 các câu Q1 đến Q10** qua ba hộp câu hỏi; cả mười câu **theo đề xuất**; phiên kiểm độc lập (theo ủy quyền của Đại) **đã duyệt ba câu kỹ thuật Q11, Q12, Q13 ngày 24/11/2026**; **Đại đã trả lời trực tiếp Q14 đến Q19 ngày 24/11/2026**: Q15 thêm một điều chỉnh cho thư nhắc lịch, Q16 giữ `[cần điền]`, các câu còn lại theo đề xuất; Q19 giao việc sửa PLAN reschedule cho PR reschedule B3)

| Q | Câu hỏi | Trả lời hoặc đề xuất | Truy vết |
|---|---|---|---|
| **Q1★** | Thông báo "tức thời" trong ứng dụng bằng cách nào (thăm dò, SSE hay WebSocket)? | **ĐÃ TRẢ LỜI (24/11/2026, Đại trả lời trực tiếp): theo đề xuất — thăm dò HTTP mỗi 30 giây.** `GET /notifications/unread-count` mỗi 30 giây khi tab đang hiện (`document.visibilityState`), tải lại ngay khi tab được hiện lại hay focus, bỏ lượt khi lời gọi trước chưa xong; khi số chưa đọc **tăng**, danh sách đang mở tải lại trang 1 và vùng `aria-live` đọc "Bạn có thông báo mới". Không hạ tầng mới. Lý do không chọn SSE: `EventSource` không gửi được header `Authorization` (token nằm trong bộ nhớ, refresh chỉ qua cookie), nginx cần tắt bộ đệm, nhiều tiến trình API cần kênh chung (không có Redis); WebSocket cần thư viện và cổng riêng, dư cho luồng một chiều. **Số 30 giây là `[đề xuất]`, chốt sau số đo M2** | 2.4.59 b5, MT; 2.4.68 b5 |
| **Q2★** | Lịch đặt sát giờ đã qua mốc nhắc: có gửi bù không, trễ tối đa bao lâu? | **ĐÃ TRẢ LỜI (24/11/2026, Đại trả lời trực tiếp): theo đề xuất — không gửi bù, trễ tối đa 10 phút.** Một mốc chỉ được tạo dòng khi `thoi_gian − mốc giờ` nằm trong `[now − 10 phút, now]`; mốc cũ hơn bị bỏ lặng lẽ. 10 phút là hằng `[đề xuất]` ở `reminder.constants.ts` (không cột cấu hình). Ví dụ: lịch đặt lúc còn 20 giờ với mốc 72, 24, 2: hai mốc đầu bỏ, chỉ nhận mốc 2 giờ | 2.4.69 A3 |
| **Q3★** | Nhắc lịch thử gửi tối đa mấy lần (lần đầu có tính không)? | **ĐÃ TRẢ LỜI (24/11/2026, Đại trả lời trực tiếp): theo đề xuất — tổng 3 lần gồm lần đầu, cách 5 phút.** Cùng số với `EMAIL_MAX_ATTEMPTS = 3`; hằng riêng ở `reminder.constants.ts`; chỉ thử lại khi lịch còn `DaXacNhan` và chưa tới giờ hẹn; hết lần thì giữ `ThatBai`, không gửi bù mốc khác | 2.4.69 A1, 3b, 3c; quy tắc 41 |
| **Q4** | Giữ thông báo trong ứng dụng bao lâu? | **ĐÃ TRẢ LỜI (24/11/2026, Đại trả lời trực tiếp): theo đề xuất — giữ mãi, không job dọn.** Danh sách phân trang theo chỉ mục có sẵn; ghi nợ kỹ thuật kèm số đo M1 ở 100.000 dòng (nháp TECH_DEBT 271 ở TRACKING 4.2). Hệ quả: `thong_bao` và `email_thong_bao` chỉ tăng | 2.4.59 (không nêu thời hạn) |
| **Q5★** | Có gom ba nơi ghi thông báo (thực tế bảy nơi) vào một cổng chung không? | **ĐÃ TRẢ LỜI (24/11/2026, Đại trả lời trực tiếp): theo đề xuất — sổ danh mục chỉ đọc + test đối chiếu.** `notification/catalog/notification-catalog.ts`: mỗi mã → nhóm, tiêu đề hiển thị, người nhận (vai trò), có thư hay không, kiểu liên kết, mô-đun nguồn, trạng thái (`CoMa` hay `ChoModule`); API đọc dùng nó để thêm `tieuDe`, `nhom`, `lienKet`. **Không đổi mã ghi của module khác**; test (DMS-01 đến DMS-07) đỏ khi module thêm mã mà quên khai. Không chọn `NotificationService` chung (thay 7 notifier, khoảng +25 giờ, rủi ro hồi quy ở booking, payment, wallet) và không chọn "không danh mục" (không phát hiện mã thiếu) | 2.4.68 |
| **Q6★** | Có thêm thư cho hoàn thành lịch khám và nghỉ phép không? | **ĐÃ TRẢ LỜI (24/11/2026, Đại trả lời trực tiếp): theo đề xuất — thêm cả hai.** (a) `LichHenHoanThanh` cho tài khoản đặt (Figma `678:2`): B4; (b) ba thư nghỉ phép cho **Bác sĩ** `NghiPhepDaGui`, `NghiPhepDaDuyet`, `NghiPhepTuChoi` (Figma `688:2`): B5; `NghiPhepChoDuyet` (Admin) **chỉ trong ứng dụng**. Không backfill thư cho thông báo đã ghi. Hệ quả: sửa ca HDK-06, đóng TECH_DEBT 186 và mục "Doctor B10"; chờ reschedule B3 (cùng file worker) | 2.4.68 MT; TECH_DEBT 186; PLAN doctor Q33 |
| **Q7★** | Tiếp đón có thông báo cho ai? (2.4.32 b5 báo Bác sĩ; 2.4.34 b5 báo bệnh nhân; booking chốt không sự kiện) | **ĐÃ TRẢ LỜI (24/11/2026, Đại trả lời trực tiếp): theo đề xuất — thêm `LichHenDaTiepDon` cho Bác sĩ phụ trách, chỉ trong ứng dụng.** Người nhận = `lich_hen.bac_si_id`; gắn `lich_hen_id`; ghi trong giao dịch `checkIn`; không thư; Bệnh nhân **không** nhận (đang ở quầy). **Còn lệch** 2.4.34 b5 → `[ĐỒNG BỘ TL]` Đại sửa 2.4 (D2) | 2.4.32 b5; 2.4.34 b5 |
| **Q8★** | Có cho thêm chỉ mục nếu số đo vượt ngưỡng không? | **ĐÃ TRẢ LỜI (24/11/2026, Đại trả lời trực tiếp): theo đề xuất — cho phép thêm chỉ mục bằng migration, chỉ khi vượt ngưỡng đặt trước ở X1.** Hai ứng viên: `lich_hen (trang_thai, thoi_gian)` (phục vụ nhắc lịch, đóng TECH_DEBT 90) và `thong_bao (tai_khoan_id, thoi_diem_tao, thong_bao_id)` (danh sách "tất cả"); khi thêm thì sửa **cả ba** file `docs/database/*`, `schema-parity`, entity và báo Đại (task P2, có điều kiện). **Bảng `nhac_lich_hen` là bắt buộc** (P1: DDL đã có trong docs, chỉ thiếu migration và entity), không phải đổi schema | 5.12 M1, M3 |
| **Q9** | Hạn mức giờ mỗi tuần của Trung? | **ĐÃ TRẢ LỜI (24/11/2026, Đại trả lời trực tiếp): theo đề xuất — giả định 40 giờ mỗi tuần.** Đây là **giả định** của AI được Đại chọn, chưa phải số thật của Trung: Trung hay Đại sửa khi duyệt PR tài liệu; bảng 6.4 chia Iteration theo 40 giờ | 6.4 |
| **Q10** | Chuông ở header công khai khi Bệnh nhân đang đặt lịch? | **ĐÃ TRẢ LỜI (24/11/2026, Đại trả lời trực tiếp): theo đề xuất — không ở đợt đầu, ghi nợ.** Chuông chỉ ở khung theo vai trò (`RoleShell`, `AdminHeader`); Bệnh nhân vào Thông báo qua menu hay "Trang của tôi"; không sửa `features/search/shell/public-header.tsx` (nháp TECH_DEBT 272) | TECH_DEBT 62 |
| **Q11** | Chi tiết "tự đánh dấu đã đọc" làm ở `GET` hay ở `POST` riêng? | **ĐÃ DUYỆT (24/11/2026, phiên kiểm độc lập theo ủy quyền của Đại; không phải Đại trả lời trực tiếp): theo đề xuất.** `GET /notifications/:id` **chỉ đọc**, web gọi `POST /notifications/:id/read` đúng một lần khi mở chi tiết. **Điều kiện của phiên kiểm:** `POST` idempotent (đã đọc rồi vẫn 200, không đổi dòng); thông báo của tài khoản khác và thông báo không tồn tại trả 404 **y hệt nhau** (không lộ sự tồn tại); điều kiện `tai_khoan_id = người gọi` nằm **trong chính câu `UPDATE`**, không kiểm sở hữu bằng một `SELECT` riêng rồi `UPDATE` (5.4). Lý do chọn: `GET` không có tác dụng phụ (proxy, tải trước, làm mới trang không đánh dấu nhầm); hành vi người dùng vẫn đúng 2.4.59 b4 | 2.4.59 b3, b4 |
| **Q12** | Phân trang offset hay con trỏ? | **ĐÃ DUYỆT (24/11/2026, phiên kiểm độc lập theo ủy quyền của Đại; không phải Đại trả lời trực tiếp): theo đề xuất.** offset `page`, `pageSize` (mặc định 20 theo Figma Make, tối đa 100) dùng `PageQueryDto` và `Paged<T>` có sẵn (admin Q42), kèm `soChuaDoc`; khoá sắp xếp `thoi_diem_tao DESC, thong_bao_id DESC`; rủi ro R9 chấp nhận. **Điều kiện của phiên kiểm:** M1 và M2 đo ở mức **MỘT tài khoản nhiều dòng**, không chỉ ở tổng 100.000 dòng, cho ba câu `tat-ca`, `chua-doc` và `unread-count`: chỉ mục `thong_bao_index_25 (tai_khoan_id, trang_thai_doc, thoi_diem_tao)` phục vụ tốt `unread-count` (chạy mỗi 30 giây mỗi tab) và lọc `chua-doc`, `da-doc`, nhưng `tat-ca` sắp theo `thoi_diem_tao` mà `trang_thai_doc` đứng giữa chỉ mục nên có thể `filesort`. Tiêu chí đạt đặt trước ở 5.12; nếu `tat-ca` filesort ở tập lớn thì dùng phương án đã ghi sẵn: chỉ mục `(tai_khoan_id, thoi_diem_tao, thong_bao_id)` (migration, ba file `docs/database/*`, `schema-parity`), **không thêm khi chưa đo**. Phiên kiểm nói "task P1"; PLAN đặt ở **P2 (có điều kiện, Q8 Đại đã chọn)** vì P1 là migration bắt buộc của `nhac_lich_hen`; nếu M1 FAIL thì P2(b) chạy **trước khi merge B2** | 2.4.59 b2 |
| **Q13** | Đường dẫn API: chung hay theo vai trò? | **ĐÃ DUYỆT (24/11/2026, phiên kiểm độc lập theo ủy quyền của Đại; không phải Đại trả lời trực tiếp): theo đề xuất.** **một** nhóm `/notifications` cho bốn vai trò (cùng nếp `/profile`: dữ liệu của chính tài khoản, không phạm vi chi nhánh), `@Roles` ghi rõ trên từng route, `tai_khoan_id` lấy từ token (không nhận `taiKhoanId` ở query hay body); không dùng `RequireAdminScope`. Chi tiết 5.4 | 2.4.59 |
| **Q14** | Chuông là liên kết tới trang hay hộp thả xuống? | **ĐÃ TRẢ LỜI (24/11/2026, Đại trả lời trực tiếp): theo đề xuất.** Chuông là liên kết tới trang Thông báo kèm số chưa đọc (đủ 2.4.59, ít giờ nhất); hộp thả xuống 5 thông báo mới nhất ("Xem tất cả" như `NotificationPanel` của Figma Make) ghi nợ (nháp TECH_DEBT 272, cùng dòng Q10) | 4.4 |
| **Q15** | Câu chữ: tiêu đề từng mã trong danh mục, thư hoàn thành, thư nghỉ phép, thư nhắc lịch, câu rỗng | **ĐÃ TRẢ LỜI (24/11/2026, Đại trả lời trực tiếp): đồng ý toàn bộ câu chữ đề xuất ở 5.3, 5.6, 5.7 và 5.11; nhóm duyệt khi review PR của B1, B3, B4, B5, F2. ĐIỀU CHỈNH so với đề xuất: thư nhắc lịch dùng khuôn thư B15 và ghi thời gian hẹn CỤ THỂ (ví dụ "14:30 ngày 02/12"), không chỉ ghi "còn 2 giờ".** Thư nhắc lịch vẫn chưa có khung Figma (khuôn thư B15 thay thế, nếp patient Q22) | nếp Q13 booking |
| **Q16** | Có file Excel của Trung (hay bảng ngoài repo) cần đồng bộ cho bốn use case này không? | **ĐÃ TRẢ LỜI (24/11/2026, Đại trả lời trực tiếp): chưa có Excel nào cần đồng bộ; giữ `[cần điền]`, Đại và Trung kiểm sau.** | `[ĐỒNG BỘ TL]` |
| **Q17** | Đại xác nhận các điểm chạm file của Đại (`booking`, `patient`) | **ĐÃ TRẢ LỜI (24/11/2026, Đại trả lời trực tiếp): xác nhận** (Đại approve PR tài liệu coi là xác nhận): `appointments/notifications/*` (B4, B5, B6), `appointments/state/*`, `appointments.constants.ts` (B6), `features/patient/shell/role-layout.tsx` (F1) | mục 6.3 |
| **Q18** | Tên nhãn GitHub và milestone | **ĐÃ TRẢ LỜI (24/11/2026, Đại trả lời trực tiếp): đồng ý** nhãn `module:notification` và milestone `notification`; **phiên kiểm độc lập có script tự tạo cả hai** (không còn là việc tay của Đại). Hiện chưa có trong repo (nhãn hiện có: `module:auth`, `admin`, `patient`, `search`, `booking`, `doctor`, `payment`, `wallet`) | 6.6 |
| **Q19** | Sửa PLAN reschedule 5.10 và ca HDK-06 cho khớp mã (13 loại hiện có, không phải "bốn") | **ĐÃ TRẢ LỜI (24/11/2026, Đại trả lời trực tiếp): không sửa PLAN reschedule ở PR này; việc sửa mục 5.10 và ca HDK-06 giao cho PR của reschedule B3.** Phiên này không sửa `docs/features/reschedule/*`; B4 làm sau reschedule B3 và đọc lại bản ca HDK-06 đã sửa | 3.3 L14 |

### 4.3 Mọi chỗ còn `[cần điền]` và `[đề xuất]` liên quan (và câu hỏi tương ứng)

| Giá trị | Ở đâu | Loại | Câu hỏi |
|---|---|---|---|
| Chu kỳ thăm dò 30 giây | `features/notification` | `[đề xuất]` (cách thăm dò đã chọn, số giây chốt sau M2) | Q1 |
| Cửa sổ trễ 10 phút; 3 lần gồm lần đầu; khoảng cách 5 phút | `reminder.constants.ts` | `[đề xuất]` (Đại đã chọn phương án; con số 10 là của AI) | Q2, Q3 |
| Hạn mức 40 giờ mỗi tuần của Trung | 6.4 | `[đề xuất]` (giả định, chưa phải số thật) | Q9 |
| Tên đường dẫn `/notifications…`, khoá JSON | 5.4 | `[đề xuất]` (phiên kiểm đã duyệt 24/11/2026; Đại sửa khi duyệt PR nếu muốn) | Q11, Q12, Q13 |
| Tiêu đề từng mã (≤ 60 ký tự), câu rỗng, nhãn nhóm | 5.3, 5.10 | đã được Đại đồng ý (Q15); nhóm duyệt khi review B1, F2 | Q15 |
| Chữ thư hoàn thành (`678:2`), thư nghỉ phép (`688:2`), thư nhắc lịch (khuôn B15, ghi thời gian hẹn cụ thể) | 5.6, 5.7 | đã được Đại đồng ý (Q15); nhóm duyệt khi review B3, B4, B5 | Q15 |
| Mã `LichHenDaTiepDon` và chữ thông báo | 5.8 | `[đề xuất]` | Q7, Q15 |
| Mã sự kiện của waitlist và chat | 5.3 | `[cần điền]` (module sau) | — |
| Mốc migration (lớn hơn migration cuối của `main` và reschedule P1 dự kiến `1793966400000`; dự kiến `1794052800000`) | P1 | `[đề xuất]` (kiểm lại lúc làm) | — |
| Tên chỉ mục mới (nếu P2): `lich_hen_index_trang_thai_thoi_gian`, `thong_bao_index_tai_khoan_thoi_diem` | P2 | `[đề xuất]` (chỉ nếu X1 vượt ngưỡng) | Q8 |
| Ngưỡng PASS của M1 đến M7 | 5.12 | `[đề xuất]` (đặt trước; **không đổi sau khi thấy số**) | — |
| Mức kiểm ĐẦY ĐỦ hay GỌN theo task; giờ ước; Iteration | 6.2, 6.4 | `[đề xuất]` | Q9 |
| Có Excel nào cần đồng bộ | 4.5 | `[cần điền]` (Đại: chưa có Excel nào cần đồng bộ; Đại và Trung kiểm sau) | Q16 |
| Nhãn `module:notification`, milestone `notification` | 6.6 | đã được Đại đồng ý (Q18); phiên kiểm tạo bằng script | Q18 |

### 4.4 Figma

Figma chỉ là bản phác thảo: **không đồng bộ lại Figma**. Giao diện theo component hiện có (`RoleShell`, `EmptyState`, `ErrorState`, `LoadingState`, `use-modal-dialog`) và mã Make làm khuôn **bố cục** (không làm khuôn mã): `NotificationCenterPage.tsx` (danh sách trái, chi tiết phải; ba bộ lọc; "Đánh dấu tất cả đã đọc"; hàng chưa đọc có chấm và chữ đậm; màn hẹp tách thành hai màn). Khung trong manifest: Bệnh nhân `412:2` và chi tiết `413:2`, Bác sĩ `456:2`, Lễ tân `482:2`, Admin `509:2` và chi tiết `670:2`; mẫu thư `678:2`, `688:2`. **Chưa đối chiếu bằng mắt** (phiên này không mở Figma): khi làm F2, B4, B5 đối chiếu nếu đọc được; **thiếu khung** (trạng thái lỗi và mất mạng của danh sách, câu rỗng từng bộ lọc) thì theo nếp patient Q22 và **hỏi Đại**, không tự thiết kế lại; riêng **thư nhắc lịch** Đại đã chốt dùng khuôn thư B15 (Q15). Màu và biểu tượng của từng nhóm (Make dùng lucide: `Calendar`, `Wallet`, `Stethoscope`, `Clock`, `RefreshCw`…) đối chiếu với `lucide-react` đang dùng ở `role-nav.ts`.

### 4.5 Việc của nhóm (ngoài repo; không sửa file Word hay Figma từ repo này)

- **D2 `[ĐỒNG BỘ TL]` (Đại sửa file Word ở repo `TLCN_CLINIX`):** 2.4.59 b5 và 2.4.68 b5 (thêm "trong vòng 30 giây": L2); 2.4.68 HĐK (email theo các sự kiện có kênh email: L8) và MT (thêm tiếp đón, bỏ chữ "đổi lịch" nếu không có sự kiện riêng); 2.4.69 A1 (3 lần gồm lần đầu) và A3 (không gửi bù, trễ tối đa 10 phút: L3); 2.4.75 MT (danh sách loại có thư: L7) và A1 2c (3 lần, 5 phút: L4); 2.4.32 b5 và 2.4.34 b5 (tiếp đón: L9); 2.4.59 (thêm "đánh dấu tất cả đã đọc" nếu nhóm muốn giữ chức năng này); 1.2.1 và 1.3 (mục thông báo, nhắc lịch) và 2.1_2.2 (sơ đồ include) cho khớp. Hai cách đánh số 2.4.59 và 2.4.56 (L1): chọn một khi đồng bộ.
- **Excel của Trung** (nếu có): Đại đã trả lời Q16: chưa có Excel nào cần đồng bộ; giữ `[cần điền]`, Đại và Trung kiểm sau.
- Báo Đại trước khi merge B4, B5, B6 (đổi file của Đại), và báo Trung biết khi Đại merge reschedule B3 (mở khoá B4 đến B6).
## 5. Thiết kế kỹ thuật

### 5.1 Cấu trúc thư mục (tạo thư mục khi có file đầu tiên; test cạnh mã; `[đề xuất]`)

```
apps/api/src/notification/                      # đã có: branch-change-*.ts, notification.module.ts (giữ nguyên)
  catalog/
    notification-catalog.ts                     # B1: sổ danh mục mã sự kiện (chỉ đọc)
    notification-catalog.spec.ts                # DMS-01…DMS-07, DMS-13
    notification-catalog.int-spec.ts            # DMS-08
  center/                                       # B2: Trung tâm thông báo (2.4.59)
    notification-center.module.ts
    notification-center.controller.ts           # chỉ nhận/trả
    notification-center.service.ts
    notification-center.repository.ts           # SQL tham số hoá; MỘT nơi UPDATE thong_bao.trang_thai_doc
    notification-center.dto.ts                  # query và kiểu phản hồi
    notification-link.ts                        # dựng `lienKet` (kiểu liên kết, không đường dẫn web)
  reminders/                                    # B3: nhắc lịch (2.4.69)
    reminder.module.ts
    appointment-reminder.job.ts                 # @Cron mỏng
    appointment-reminder.service.ts             # tạo dòng, nhận việc, gửi, ghi kết quả
    reminder.query.ts                           # NƠI DUY NHẤT ghi nhac_lich_hen
    reminder-mail.templates.ts                  # dựng trên renderMailShell của booking
    reminder.constants.ts                       # cron, tên job, 10 phút, 3 lần, 5 phút
  testing/                                      # đã có branch-change-fixtures.ts; thêm fixture thông báo và nhắc lịch
apps/api/src/admin/entities/nhac-lich-hen.entity.ts   # P1 (entity bảng nền, nếp booking 5.1)
apps/api/src/database/migrations/<mốc>-tao-bang-nhac-lich-hen.ts   # P1
apps/web/src/features/notification/             # F1, F2: api/, hooks/, components/, pages/, testing/, index.ts
apps/web/src/shared/routes/notification-paths.ts # F1: bốn đường dẫn Thông báo theo vai trò
```

`AppModule` thêm **hai** phần tử `NotificationCenterModule` và `ReminderModule` (mỗi cái một dòng `import` và một phần tử mảng; `[ĐỤNG database]`). Không thêm `ScheduleModule.forRoot()` (AR-03). Không có biến môi trường mới (`.env.example` không đổi); các số (30 giây, 10 phút, 3 lần, 5 phút, cỡ lô) là hằng trong mã.

### 5.2 Dữ liệu: một migration bắt buộc (P1), hai chỉ mục có điều kiện (P2)

- **P1: `CREATE TABLE nhac_lich_hen`** chép **NGUYÊN VĂN** từ `docs/database/clinix_mysql.sql` (dòng 578 đến 588: bảng; dòng 705: chỉ mục `nhac_lich_hen_index_trang_thai (trang_thai, lan_thu_cuoi_luc)`; dòng 916: khoá ngoại `lich_hen_id`; dòng 1045 đến 1052: `chk_nhac_lich_hen_moc`, `chk_nhac_lich_hen_ket_qua`; số dòng ở `75ed996`, tìm lại bằng từ khoá). **Không đổi chữ nào của DDL**: bài `schema-parity.int-spec.ts` so cả văn bản lẫn `SHOW CREATE TABLE` (phiên kiểm độc lập). `down` xoá bảng (chỉ dữ liệu nhắc lịch, không phải dữ liệu nghiệp vụ). Entity `NhacLichHen` ở `admin/entities/nhac-lich-hen.entity.ts` (khoá chính kép `(lichHenId, soGioTruoc)`, enum `TRANG_THAI_NHAC_LICH_HEN` thêm vào `enums.ts`), đăng ký ở `database/entities.ts` và `migrations/index.ts`. Đặt tên theo ngoại lệ có chủ đích của AGENTS mục 4 (`NhacLichHen`, `lichHenId`, `soGioTruoc`, `trangThai`, `soLanThu`, `lanThuCuoiLuc`, `daGuiLuc`, `loiCuoi`, `thoiDiemTao`).
- **Mốc migration:** lớn hơn mọi migration trên `main` lúc merge. Migration cuối hiện có là `1793880000000-nghi-theo-ca-nhieu-ngay.ts`; reschedule P1 dự kiến `1793966400000` (**chưa merge**, kiểm lại lúc làm); mốc dự kiến của P1 này `[đề xuất]` `1794052800000`. Khoảng cách một ngày (86.400.000 ms) theo nếp các migration hiện có.
- **P2 (có điều kiện, chỉ khi X1 vượt ngưỡng; Q8):** (a) `CREATE INDEX lich_hen_index_trang_thai_thoi_gian ON lich_hen (trang_thai, thoi_gian)` nếu M3 FAIL (đóng luôn TECH_DEBT 90 nếu đo lại NoShowJob đạt); (b) `CREATE INDEX thong_bao_index_tai_khoan_thoi_diem ON thong_bao (tai_khoan_id, thoi_diem_tao, thong_bao_id)` nếu M1 FAIL (**dự đoán chưa đo:** danh sách `tat-ca` có thể `filesort` vì `trang_thai_doc` đứng giữa chỉ mục `thong_bao_index_25`; nếu M1 FAIL thì P2(b) làm **trước khi merge B2**). Sửa **cả ba** file `docs/database/*`, entity (`@Index`), `schema-parity`; `[ĐỒNG BỘ TL]`; tên chỉ mục `[đề xuất]`. Hai chỉ mục chạm bảng nóng (`lich_hen`) hay bảng ghi nhiều (`thong_bao`): chạy `EXPLAIN` trước và sau, ghi số vào TRACKING.
- **Không đổi gì khác ở DB:** không thêm cột vào `thong_bao` (tiêu đề và kiểu liên kết suy từ `loai_su_kien` bằng danh mục), không đổi UNIQUE, không thêm cột thời điểm đọc, không thêm bảng cấu hình.
- **Bất biến sau scope** (dùng cho X2): IVN-01 mọi `email_thong_bao` có `thong_bao` và mỗi `thong_bao` tối đa một dòng thư; IVN-02 không `thong_bao` trùng `(lich_hen_id, tai_khoan_id, loai_su_kien)`; IVN-03 mọi `nhac_lich_hen` có `so_lan_thu` từ 0 đến 3, `DaGui` có `da_gui_luc`, `ThatBai` có `loi_cuoi`; IVN-04 không `thong_bao` hay `email_thong_bao` nào mang `loai_su_kien` của nhắc lịch (nhắc lịch không có thông báo); IVN-05 `soChuaDoc` = số dòng `trang_thai_doc = 0` của tài khoản.

### 5.3 Danh mục sự kiện (B1; Q5: sổ chỉ đọc, KHÔNG đổi mã ghi của module khác; tiêu đề Đại đã đồng ý ở Q15, nhóm duyệt khi review B1)

Một mục của danh mục (`[đề xuất]` kiểu):

```ts
interface CatalogEntry {
  ma: string;                       // phần gốc của loai_su_kien (không hậu tố ":v{n}")
  coPhienBan: boolean;              // true nếu nơi ghi gắn ":v{n}" (admin C4)
  nhom: 'LichHen' | 'DoiLich' | 'NghiPhep' | 'Vi' | 'ChiNhanh';
  tieuDe: string;                   // ≤ 60 ký tự, hiển thị ở danh sách và chi tiết
  nguoiNhan: readonly VaiTro[];     // vai trò nhận (dùng cho DMS-08, không lọc ở API)
  coThu: boolean;                   // có dòng email_thong_bao (phải bằng MAIL_EVENTS của worker: DMS-04)
  lienKet: 'LichHen' | 'Vi' | 'NghiPhep' | 'ThayDoiChiNhanh' | null; // kiểu liên kết trung tính theo vai trò
  nguon: string;                    // module và notifier ghi
  trangThai: 'CoMa' | 'ChoModule';  // ChoModule: mã đã khai nhưng nơi ghi chưa có
}
```

- **API dùng danh mục thế nào:** mã lạ (không có trong danh mục; hay dữ liệu cũ) ⇒ tiêu đề "Thông báo", không liên kết, không 500 (TTB-11). Mã có hậu tố (`ThayDoiChiNhanhAnhHuongLichHen:v2`) tra bằng phần gốc (cùng hàm `baseEventOf` của worker thư). **Tiêu đề không lưu ở DB** nên đổi tiêu đề ở danh mục đổi luôn dòng cũ (R8: chấp nhận; `noi_dung` thì bất biến).
- **Test đối chiếu (DMS-01 đến DMS-07):** import các hằng `BOOKING_NOTIFICATION_EVENTS`, `EXAM_NOTIFICATION_EVENTS`, `LEAVE_EVENTS`, `TOPUP_NOTIFICATION_EVENTS`, `WITHDRAWAL_NOTIFICATION_EVENTS`, `REFUND_NOTIFICATION_EVENTS`, `BRANCH_CHANGE_EVENTS` (chỉ ở **file spec**, không ở mã chạy: giữ chiều phụ thuộc "booking không import module khác lúc chạy"): mọi mã phải có trong danh mục và ngược lại; mã duy nhất không phân biệt hoa thường (`utf8mb4_unicode_ci`), ≤ 100 ký tự kể cả `:v{n}`; tập `coThu` khớp `MAIL_EVENTS` của worker; bốn hằng độ dài 500 bằng `NOTIFICATION_CONTENT_MAX` của danh mục (không sửa mã của họ, chỉ so).
- **Bảng danh mục khởi đầu** (27 mã đã có + 1 mã mới của B6 + 4 mã của reschedule; tiêu đề đã được Đại đồng ý ở Q15, nhóm duyệt khi review B1):

| Mã | Nhóm | Tiêu đề hiển thị | Người nhận | Thư | Liên kết | Nguồn | Trạng thái |
|---|---|---|---|---|---|---|---|
| `LichHenDaXacNhan` | LichHen | Đặt lịch thành công | Bệnh nhân (tài khoản đặt) | có | LichHen | booking `BookingNotifier` | CoMa |
| `LichHenDaHuy` | LichHen | Lịch hẹn đã huỷ | Bệnh nhân | có | LichHen | booking (kể cả huỷ do nghỉ phép) | CoMa |
| `LichHenVangMat` | LichHen | Ghi nhận vắng mặt | Bệnh nhân | có | LichHen | booking | CoMa |
| `KhoaDatLichNoShow` | LichHen | Hạn chế đặt lịch | Bệnh nhân | có | LichHen | booking | CoMa |
| `LichHenHoanThanh` | LichHen | Đã hoàn thành lịch khám | Bệnh nhân | **có (B4)** | LichHen | doctor-exam `ExamNotifier` | CoMa |
| `LichHenDaTiepDon` | LichHen | Bệnh nhân đã được tiếp đón | Bác sĩ phụ trách | không | LichHen | booking `checkIn` (B6) | ChoModule (B6) |
| `LichHenDaDoiLich` | DoiLich | Lịch hẹn đã đổi | Bệnh nhân | có | LichHen | reschedule B3 | ChoModule |
| `YeuCauDoiLichDangCho` | DoiLich | Yêu cầu đổi lịch đang chờ duyệt | Bệnh nhân | có | null | reschedule B3 | ChoModule |
| `YeuCauDoiLichDaDuyet` | DoiLich | Yêu cầu đổi lịch được duyệt | Bệnh nhân | có | null | reschedule B3 | ChoModule |
| `YeuCauDoiLichBiTuChoi` | DoiLich | Yêu cầu đổi lịch bị từ chối | Bệnh nhân | có | null | reschedule B3 | ChoModule |
| `NghiPhepDaGui` | NghiPhep | Đã gửi yêu cầu nghỉ phép | Bác sĩ | **có (B5)** | NghiPhep | doctor `LeaveNotifier` | CoMa |
| `NghiPhepChoDuyet` | NghiPhep | Có yêu cầu nghỉ phép mới | Quản trị viên có thẩm quyền | không | NghiPhep | doctor `LeaveNotifier` | CoMa |
| `NghiPhepDaDuyet` | NghiPhep | Yêu cầu nghỉ phép được duyệt | Bác sĩ | **có (B5)** | NghiPhep | doctor `LeaveNotifier` | CoMa |
| `NghiPhepTuChoi` | NghiPhep | Yêu cầu nghỉ phép bị từ chối | Bác sĩ | **có (B5)** | NghiPhep | doctor `LeaveNotifier` | CoMa |
| `NapViThanhCong` | Vi | Nạp ví thành công | Bệnh nhân | không | Vi | payment `topup-notifier` | CoMa |
| `NapViThatBai` | Vi | Nạp ví thất bại | Bệnh nhân | có | Vi | payment | CoMa |
| `NapViDaDoiSoat` | Vi | Nạp ví đã được cộng | Bệnh nhân | không | Vi | payment | CoMa |
| `NapViCanXuLy` | Vi | Có giao dịch nạp ví cần xử lý | Quản trị viên Toàn hệ thống | không | Vi | payment | CoMa |
| `NapViChuaXuLyDuoc` | Vi | Nạp ví chưa xử lý được | Bệnh nhân | không | Vi | payment | CoMa |
| `RutTienDaGui` | Vi | Đã gửi yêu cầu rút tiền | Bệnh nhân | không | Vi | wallet `withdrawal-notifier` | CoMa |
| `RutTienDuocDuyet` | Vi | Yêu cầu rút tiền được duyệt | Bệnh nhân | có | Vi | wallet | CoMa |
| `RutTienBiTuChoi` | Vi | Yêu cầu rút tiền bị từ chối | Bệnh nhân | có | Vi | wallet | CoMa |
| `HoanCocThanhCong` | Vi | Đã hoàn tiền cọc | Bệnh nhân | có | LichHen | wallet `refund-notifier` | CoMa |
| `HoanCocCanXuLy` | Vi | Có khoản hoàn cọc cần xử lý | Quản trị viên Toàn hệ thống | không | Vi | wallet | CoMa |
| `HoanTienDacBiet` | Vi | Hoàn tiền đặc biệt | Bệnh nhân | có | LichHen | wallet `special-refund` | CoMa |
| `KetQuaYeuCauThayDoiChiNhanh` | ChiNhanh | Kết quả yêu cầu thay đổi chi nhánh | Người đề xuất (Quản trị viên) | có | ThayDoiChiNhanh | admin `BranchChangeNotifier` | CoMa |
| `ThayDoiChiNhanhAnhHuongLichHen` (`:v{n}`) | ChiNhanh | Chi nhánh thay đổi, ảnh hưởng lịch hẹn | Bệnh nhân có lịch bị ảnh hưởng | có | ThayDoiChiNhanh | admin | CoMa |
| `HuyThayDoiChiNhanh` | ChiNhanh | Thay đổi chi nhánh đã bị huỷ | Bệnh nhân đã được báo, người đề xuất | có | ThayDoiChiNhanh | admin | CoMa |
| `DoiHieuLucThayDoiChiNhanh` (`:v{n}`) | ChiNhanh | Thay đổi chi nhánh dời ngày hiệu lực | Bệnh nhân | có | ThayDoiChiNhanh | admin | CoMa |
| `KetQuaDoiHieuLucThayDoiChiNhanh` (`:v{n}`) | ChiNhanh | Đã dời hiệu lực thay đổi chi nhánh | Người đề xuất | không | ThayDoiChiNhanh | admin | CoMa |
| `YeuCauThayDoiChiNhanhQuaHan` (`:v{n}`) | ChiNhanh | Yêu cầu thay đổi chi nhánh quá hạn | Quản trị viên Toàn hệ thống, người đề xuất | không | ThayDoiChiNhanh | admin | CoMa |
| `RutThayDoiChiNhanh` | ChiNhanh | Yêu cầu thay đổi chi nhánh đã được rút | Quản trị viên Toàn hệ thống | không | ThayDoiChiNhanh | admin | CoMa |

Chừa chỗ (không có mã, **không** là dòng của danh mục; ghi ở comment `CHO_MODULE` để DMS-13 nhắc): danh sách chờ (lời mời, kết quả; scope #11, thư theo 2.4.75), chat (tin nhắn mới tới Bác sĩ, Lễ tân, Bệnh nhân; 2.4.20, 2.4.21, 2.4.29), "thanh toán cọc thất bại" (nếu Đại muốn: L5).

Tổng "có thư" sau scope: booking 4 + `LichHenHoanThanh` 1 + nghỉ phép 3 + payment 5 + thay đổi chi nhánh 4 + đổi lịch 4 = **21** loại (DMS-04 khớp `MAIL_EVENTS`; 13 hiện có + 4 của reschedule B3 + 4 của scope này).

### 5.4 API Trung tâm thông báo (task B2; tiền tố `/api` qua proxy; `Cache-Control: no-store` đặt TRƯỚC khi gọi service để nhánh lỗi cũng có; id BIGINT là chuỗi; tên `[đề xuất]`, Q11 đến Q13)

Mọi route: `@Roles('BenhNhan', 'BacSi', 'LeTan', 'QuanTriVien')`, tài khoản **chỉ lấy từ token** (`CurrentUser()`; không khai `@Query('taiKhoanId')` nên tham số lạ bị bỏ qua hoặc 400 theo `forbidNonWhitelisted`), không `RequireAdminScope` (dữ liệu cá nhân), không `OriginGuard` (xác thực bằng header như `profile`).

| Route | Việc | Thành công | Lỗi |
|---|---|---|---|
| `GET /notifications?page=&pageSize=&trangThaiDoc=` | danh sách của tài khoản gọi, `ORDER BY thoi_diem_tao DESC, thong_bao_id DESC` | 200 `{ items[], total, page, pageSize, soChuaDoc }`; `page` mặc định 1, `pageSize` mặc định 20 tối đa 100; `trangThaiDoc` ∈ `tat-ca` (mặc định), `chua-doc`, `da-doc` | 400 `DU_LIEU_KHONG_HOP_LE` (`loi[{truong, ma}]`); 401 `CHUA_DANG_NHAP` |
| `GET /notifications/unread-count` | số chưa đọc | 200 `{ soChuaDoc }` | 401 |
| `GET /notifications/:id` | chi tiết MỘT thông báo của chính mình, **chỉ đọc** (Q11) | 200 một mục (cùng khuôn `items[]`) | 401; 404 `KHONG_TIM_THAY` cho id không tồn tại, **của người khác**, hay sai dạng (`/^[1-9][0-9]{0,19}$/`): **cùng thân phản hồi** |
| `POST /notifications/:id/read` | đánh dấu đã đọc, idempotent; điều kiện sở hữu nằm trong chính câu `UPDATE` | 200 `{ id, daDoc: true, soChuaDoc }`; đã đọc rồi vẫn 200, không đổi dòng | 401; 404 `KHONG_TIM_THAY` **y hệt** thân của "không tồn tại" (không lộ sự tồn tại) |
| `POST /notifications/read-all` | đánh dấu mọi thông báo chưa đọc của chính mình | 200 `{ daDanhDau, soChuaDoc: 0 }` | 401 |

Khuôn một mục (`items[]` và chi tiết): `{ id, loai, nhom, tieuDe, noiDung, daDoc, thoiDiemTao, lienKet }`; `loai` = phần gốc của mã; `thoiDiemTao` = `toISOString()` (UTC; nơi hiển thị đổi giờ Việt Nam, nếp B3 booking); `lienKet` = `{ kieu: 'LichHen', maLichHen }` khi `thong_bao.lich_hen_id` có giá trị (JOIN `lich_hen` lấy `ma_lich_hen`; **không** trả `lich_hen_id`, nếp patient Q13) hoặc `{ kieu: 'Vi' | 'NghiPhep' | 'ThayDoiChiNhanh' }` theo danh mục, hoặc `null`. **Danh sách trắng:** không `tai_khoan_id`, `lich_hen_id`, `yeu_cau_…_id`, không trạng thái thư; thông báo của tài khoản khác không bao giờ xuất hiện.

- **Trả lại số chưa đọc ở mọi lần ghi** để web cập nhật chuông ngay không chờ chu kỳ thăm dò kế tiếp.
- **SQL** (tham số hoá, mọi câu có `tai_khoan_id = ?` từ token): danh sách `SELECT … FROM thong_bao t LEFT JOIN lich_hen lh ON lh.lich_hen_id = t.lich_hen_id WHERE t.tai_khoan_id = ? [AND t.trang_thai_doc = ?] ORDER BY t.thoi_diem_tao DESC, t.thong_bao_id DESC LIMIT ? OFFSET ?` và `SELECT COUNT(*)` cùng điều kiện (hai câu, không giao dịch); số chưa đọc `SELECT COUNT(*) FROM thong_bao WHERE tai_khoan_id = ? AND trang_thai_doc = 0` (phủ bởi tiền tố `(tai_khoan_id, trang_thai_doc)` của `thong_bao_index_25`); đánh dấu một: **MỘT câu** `UPDATE thong_bao SET trang_thai_doc = 1 WHERE thong_bao_id = ? AND tai_khoan_id = ?` (điều kiện sở hữu nằm **trong chính câu `UPDATE`**, không `SELECT` sở hữu riêng rồi `UPDATE` theo id: điều kiện của phiên kiểm khi duyệt Q11; **không** có `AND trang_thai_doc = 0` để dòng đã đọc vẫn khớp). Có hàng **khớp** ⇒ 200 (kể cả đã đọc rồi: idempotent); không hàng nào khớp ⇒ 404 `KHONG_TIM_THAY`, cùng thân cho "của người khác" và "không tồn tại". Nếu `affectedRows` của `mysql2` chỉ đếm hàng **đổi** (không đếm hàng khớp) thì đọc số khớp từ `info` hay, khi `affectedRows` = 0, phân biệt bằng một `SELECT 1 … WHERE thong_bao_id = ? AND tai_khoan_id = ?` chạy **sau** `UPDATE` (quyền vẫn do chính `UPDATE` bảo đảm; M4 đo cả điểm này). `notification-center.repository.ts` là **nơi duy nhất** của scope này ghi `thong_bao` (chỉ `UPDATE trang_thai_doc`; không `INSERT`, không `DELETE`: HTB-06).
- **Đánh dấu tất cả (R3):** lặp `UPDATE thong_bao SET trang_thai_doc = 1 WHERE tai_khoan_id = ? AND trang_thai_doc = 0 ORDER BY thong_bao_id LIMIT 500` cho tới khi `affectedRows < 500`, **mỗi lô một giao dịch `READ COMMITTED` riêng** (không giữ khoá khoảng trên `thong_bao_index_25` lâu, không chặn `INSERT thong_bao` của giao dịch booking đang ghi cho cùng tài khoản; số đo M5; ca CTB-02). Thông báo mới ghi giữa các lô vẫn chưa đọc (đúng: người dùng chưa thấy nó).
- **Không** nhật ký hành động, không nhật ký đọc (không phải hành động nhạy cảm, 2.4.70); log chỉ có số lượng và loại lỗi cố định, không `noi_dung`, họ tên, email (BTB-01).
- **Không** giới hạn tần suất theo IP (việc X3 của auth/admin, làm trước khi mở công khai; TECH_DEBT hiện có).

### 5.5 Thông báo tức thời trong ứng dụng (Q1: thăm dò; F1, F2)

- **Hook `useUnreadCount()`** (một nơi, dùng chung chuông và menu): gọi `GET /notifications/unread-count` khi gắn, rồi mỗi **30 giây** `[đề xuất]` bằng `setTimeout` nối tiếp (không `setInterval`: lời gọi chậm không chồng lời gọi); **tạm dừng** khi `document.visibilityState !== 'visible'` và gọi ngay một lần khi tab hiện lại hay cửa sổ `focus`; huỷ lời gọi đang bay khi gỡ; lời gọi trước chưa xong thì bỏ lượt.
- **Số tăng so với lần trước** ⇒ (a) vùng `aria-live="polite"` ẩn thị giác đọc "Bạn có thông báo mới"; (b) tín hiệu cho `useNotificationList` tải lại **trang 1** nếu trang Thông báo đang mở (thông báo mới hiện ngay vào danh sách, đúng 2.4.59 b5 trong giới hạn 30 giây, L2). Số **giảm** (đọc ở thiết bị khác) chỉ cập nhật số.
- **Lỗi thăm dò** (mạng, 5xx, quá giờ): giữ số cũ, không hiện hộp lỗi (chuông không được làm hỏng trang), thử lại ở nhịp sau; offline (`useOnlineStatus`) tạm dừng. 401: lớp client lo làm mới phiên (`shared/api/client.ts`), hook không tự vòng lặp.
- **Sau mỗi thao tác ghi** (`read`, `read-all`) dùng số `soChuaDoc` trả về để cập nhật ngay (không chờ nhịp).
- **Chi phí:** `COUNT` theo tiền tố chỉ mục; 200 phiên cùng mở ≈ 6,7 yêu cầu mỗi giây (R2). **Chưa đo**: M2 chốt số giây (nếu FAIL thì 60 giây). Không SSE, không WebSocket, không thư viện mới.

### 5.6 Nhắc lịch theo lịch trình (task B3; 2.4.69; quy tắc DB 41, 34; Q2, Q3)

**Job `AppointmentReminderJob`** (`notification/reminders/`), theo nếp `HoldExpiryJob`, `EmailOutboxJob`: `@Cron(REMINDER_CRON, { name: 'notification-appointment-reminder', disabled: process.env.NODE_ENV === 'test' })` mỗi phút ở giây `[đề xuất]` 30 (đã dùng: 5 gửi thư, 20 hết hạn giữ chỗ, 40 Vắng mặt và hoàn cọc; kiểm lại bảng giây lúc làm); `run(now?)` chỉ nhận `now` khi đúng là `Date`, cờ `running` chống chạy chồng, **không bao giờ ném**, log chỉ có số lượng và loại lỗi. Hằng ở `reminder.constants.ts`: `REMINDER_LATE_WINDOW_MINUTES = 10` (Q2), `REMINDER_MAX_ATTEMPTS = 3` gồm lần đầu (Q3), `REMINDER_RETRY_GAP_MINUTES = 5`, cỡ lô và số lô **dùng chung** `BOOKING_JOB_BATCH_SIZE` (100) và `BOOKING_JOB_MAX_BATCHES` (10). Một mốc `now = toSecond(nowVN())` cho cả lượt (test đưa mốc giả vào `run(now)`).

**Mỗi lượt:**

1. **Đọc cấu hình** `SystemConfigService.getOrThrow()` (`HE_THONG_CHUA_CAU_HINH` ⇒ ghi log cảnh báo một dòng và kết thúc lượt, **không số ngầm**, quy tắc 35); `thoiDiemNhacLich` rỗng (DB chấp nhận) ⇒ chỉ làm bước 3.
2. **Tìm mốc mới đến hạn**, một câu cho mỗi mốc `h` (tối đa 5 câu, dạng khoảng hẹp để dùng chỉ mục nếu có): lịch `DaXacNhan`, `thoi_gian > now`, `thoi_gian BETWEEN now + h giờ − 10 phút AND now + h giờ` (tương đương mốc `thoi_gian − h giờ` nằm trong `[now − 10 phút, now]`, đóng hai đầu), **chưa có** dòng `(lich_hen_id, h)` (`LEFT JOIN nhac_lich_hen … IS NULL`), `ORDER BY thoi_gian, lich_hen_id LIMIT cỡ lô`. Khác `JSON_TABLE` của câu mẫu ở cuối `clinix_mysql.sql` (cho phép test mốc từng giờ và dùng chỉ mục khoảng); ý nghĩa như nhau.
3. **Tìm dòng đang chờ hay cần thử lại:** `nhac_lich_hen` có `trang_thai IN ('ChoGui','ThatBai')`, `so_lan_thu < 3`, `(lan_thu_cuoi_luc IS NULL OR lan_thu_cuoi_luc <= now − 5 phút)` và (`ChoGui` **hoặc** lịch còn `DaXacNhan` với `thoi_gian > now`): `ChoGui` luôn được chọn để **đóng** dòng mồ côi; `ThatBai` chỉ thử lại khi lịch còn hiệu lực (A1 3b). Không phụ thuộc cấu hình hiện hành (mốc đã bị gỡ khỏi cấu hình vẫn được thử lại nốt: "đổi cấu hình không làm lệch lịch sử").
4. **Với mỗi (lịch, mốc):** (a) mốc mới: `INSERT INTO nhac_lich_hen (lich_hen_id, so_gio_truoc, thoi_diem_tao) VALUES (?, ?, ?)`; lỗi 1062 trên khoá chính ⇒ bên khác đã tạo, **bỏ qua** (nếp `insertThongBao`; phương án `ON DUPLICATE KEY UPDATE` của quy tắc 41 chỉ dùng nếu M4 đạt, L16); (b) **nhận việc** `UPDATE nhac_lich_hen SET so_lan_thu = so_lan_thu + 1, lan_thu_cuoi_luc = ? WHERE lich_hen_id = ? AND so_gio_truoc = ? AND trang_thai IN ('ChoGui','ThatBai') AND so_lan_thu = ?` (giá trị đã đọc): chỉ `affectedRows = 1` mới được đi tiếp, bên thua đếm `lostClaim`; (c) **kiểm lại lịch ngay trước khi gửi** (`trang_thai = 'DaXacNhan'` và `thoi_gian > now`; không hơn kém ý A1 3b); không còn hiệu lực ⇒ ghi `ThatBai` với `loi_cuoi = 'LICH_KHONG_CON_HIEU_LUC'` (3c: bỏ hẳn mốc), **không gửi**; (d) dựng thư bằng `readNotificationContext` và `readClinicFooter` của booking (tài khoản ĐẶT là người nhận; **không** `ly_do_kham`, SĐT, `ly_do_huy`) và `MailService.send`; (e) thành công ⇒ `UPDATE … SET trang_thai = 'DaGui', da_gui_luc = ?, loi_cuoi = NULL WHERE … AND so_lan_thu = ?`; lỗi gửi ⇒ `ThatBai`, `da_gui_luc = NULL`, `loi_cuoi` = loại lỗi cố định (`MailSendError.kind`, không `message`); `NOT_CONFIGURED` ⇒ trả dòng về đúng giá trị cũ và **dừng cả lượt**, không tính lần thử.
5. **Kết thúc:** log "Nhắc lịch: tạo X, gửi Y, lỗi Z, bên khác nhận trước W, bỏ vì lịch đổi V" (không mã lịch kèm địa chỉ; chỉ số); `more = true` nếu hết trần lô.

**Không** ghi `thong_bao` hay `email_thong_bao` cho nhắc lịch (2.4.75 b4; `COMMENT` bảng; IVN-04). **Không** ghi nhật ký. Không đổi trạng thái lịch (HĐK thất bại 2.4.69). **Mẫu thư** (`reminder-mail.templates.ts`; **dùng khuôn thư B15** ở `booking-mail.templates.ts`, không có khung Figma; **Đại chốt ở Q15: ghi thời gian hẹn CỤ THỂ**, không chỉ ghi "còn N giờ"): tiêu đề `[CLINIX] Nhắc lịch hẹn khám lúc {HH:mm} ngày {dd/MM}` (ví dụ "14:30 ngày 02/12"); thân: lời chào theo họ tên người đặt; câu chính "Lịch hẹn {mã} của bạn diễn ra **lúc {HH:mm} ngày {dd/MM}**" rồi "(sau khoảng {mốc} giờ nữa)" chỉ là phần phụ; các hàng chi tiết như thư xác nhận: người được khám (kèm "(đặt hộ)"), bác sĩ (`formatDoctorName`), dịch vụ, chuyên khoa, chi nhánh và địa chỉ, **Ngày giờ** đầy đủ bằng `formatAppointmentTime` (ví dụ "Thứ Ba, 02/12/2026 — 14:30"); lưu ý đến trước giờ hẹn 10 đến 15 phút và mang giấy tờ tùy thân (câu có sẵn ở thư xác nhận); chân thư phòng khám; **không** nút, không liên kết, không phản hồi nhanh (2.4.69 MT); mọi dữ liệu qua `toSingleLine` rồi `escapeHtml` (EMT-10). Ngày và giờ lấy từ `readNotificationContext` (`ngay`, `gio` đã ở giờ Việt Nam do `DATE_FORMAT` của MySQL, không qua `Date` của JS nên không lệch múi giờ: NLH-20); `{dd/MM}` là phần đầu của `ngay`. Phần "sau khoảng {mốc} giờ nữa" in theo CHÍNH mốc (ổn định khi gửi lại, MH5 ở 3.4); thời gian hẹn cụ thể mới là thông tin chính.

**Đổi lịch (A2):** lịch cũ `DaDoiLich` không được chọn (điều kiện `DaXacNhan`); lịch mới là `lich_hen` mới nên có bộ mốc mới (quy tắc 41) tính theo `thoi_gian` mới; ca NLH-09 dựng lịch nối chuỗi bằng SQL; chạy lại với đổi lịch thật khi reschedule B4 có mã (`[CHỜ reschedule]`, không chặn).

**Nhiều tiến trình:** an toàn nhờ (b) và `INSERT` có khoá chính; hai tiến trình cùng quét một mốc chỉ một bên gửi (NLH-07, CTB-01). Dòng `ChoGui` đã nhận việc mà tiến trình chết chỉ được chọn lại sau 5 phút (`lan_thu_cuoi_luc <= now − 5 phút`): gửi **ít nhất một lần**, có thể trùng nếu chết đúng giữa SMTP và ghi `DaGui` (TECH_DEBT 126, R6).

### 5.7 Email theo sự kiện (tasks B4, B5; 2.4.75; Q6)

- **Hộp thư đi và worker dùng lại nguyên** (`email_thong_bao`, `EmailOutboxService`, `EmailOutboxJob`, `claimEmail`, `markSent`, `markFailed`, `releaseClaim`): không thêm bảng, không thêm worker. B4 và B5 chỉ **thêm loại và mẫu**:
  1. **B4: `LichHenHoanThanh`** (Figma `678:2`): `ExamNotifier` thêm `insertEmailRow(em, thongBaoId)` khi `insertThongBao` trả `Inserted` (nếp `refund-notifier.ts`); `notifications.constants.ts` thêm hằng viết bằng chữ (spec kiểm khớp `EXAM_NOTIFICATION_EVENTS`); `MAIL_EVENTS` thêm loại; `buildMessage` thêm `case` ở nhánh booking (dùng `readNotificationContext`: mã lịch, bác sĩ, ngày giờ, chi nhánh); mẫu `renderExamCompletedMail` ở `booking-mail.templates.ts` (hay file mới cùng thư mục); câu nhắc đánh giá bằng **chữ** (thư không có liên kết: `renderMailShell`); sửa ca HDK-06 (EMT-03).
  2. **B5: `NghiPhepDaGui`, `NghiPhepDaDuyet`, `NghiPhepTuChoi`** (Figma `688:2`, chỉ tab "Đã gửi · Chờ duyệt" có nội dung: hai tab còn lại chưa có nên câu chữ theo đề xuất ở đây, Đại đã đồng ý ở Q15, nhóm duyệt khi review B5): `LeaveNotifier` thêm `INSERT INTO email_thong_bao` qua `insertEmailRow` cho ba loại gửi Bác sĩ; **không** cho `NghiPhepChoDuyet` (Admin). Thân thư là `thong_bao.noi_dung` (đã chỉ có tên bác sĩ, khoảng ngày, ca; lý do từ chối của Admin nếu có; **không** `ly_do` xin nghỉ của Bác sĩ: doctor Q33), vì nhóm này không có `lich_hen_id`: nhánh mới `renderLeaveMail` đặt **trước** kiểm `payload.lichHenId === null` của `buildMessage`.
- **Không backfill:** thông báo đã ghi trước B4, B5 không có dòng thư và **không được tạo** (EMT-07); thư chỉ cho thông báo ghi sau khi B4, B5 merge.
- **Phân ranh 2.4.73 và 2.4.74:** thư OTP và liên kết kích hoạt **không qua** hộp thư đi (gọi thẳng `MailService`, không có `thong_bao`); scope này không đổi hai luồng đó (chỉ dùng chung `MailService`).
- **Test không gửi thư thật** (EMT-11): mọi ca dùng `FakeMailService` (`attempts`, `sent`, `failNextWith`) hay `fake-smtp-server.ts`; `NODE_ENV=test` tắt job; **không** đọc `.env`; ca kiến trúc quét mã test không tự tạo `nodemailer` ngoài hai fake này.
- **Kế thừa không đổi:** thử lại 3 lần cách 5 phút, `NOT_CONFIGURED` không tính, `loi_cuoi` là loại lỗi cố định, log không địa chỉ; nợ TECH_DEBT 126, 127, 129 giữ nguyên.

### 5.8 Sự kiện tiếp đón cho Bác sĩ (task B6; Q7; 2.4.32 b5)

- **Mã** `LichHenDaTiepDon` thêm vào `BOOKING_NOTIFICATION_EVENTS` (khoá `CHECKED_IN`); **người nhận** = Bác sĩ phụ trách `lich_hen.bac_si_id` (trường `taiKhoanId` của `AppointmentEvent` mang **người nhận**, không còn luôn là tài khoản đặt: sửa chú thích của cổng); gắn `lich_hen_id` ⇒ UNIQUE `(lich_hen_id, tai_khoan_id, loai_su_kien)` chống trùng; **chỉ `thong_bao`, không `email_thong_bao`** (`BookingNotifier` bỏ `insertEmailRow` cho loại này, bằng một tập "loại có thư" riêng của booking); chữ `[đề xuất]`: "Bệnh nhân {người được khám} đã được tiếp đón cho lịch hẹn {mã} lúc {giờ}." (không SĐT, email, lý do khám).
- **Phát ở hàm `checkIn`** (nơi Lễ tân, thu tiền mặt tại quầy và Quản trị viên override đều đi qua: quy tắc 46, 47; MH4 ở 3.4), **trong cùng giao dịch** và **sau** khi trạng thái đã đổi (thứ tự khoá: thông báo ở tầng 7, sau khi đã khoá lịch; booking PLAN 5.3); lỗi ghi ⇒ hoàn tác cả lần tiếp đón (nếp HL-16, CG-02); 1062 ⇒ "đã có". Vắng mặt và khôi phục `DaXacNhan` **không** sinh sự kiện này (DMS-12).
- **Chạm file của booking** (`[ĐỤNG booking]`, `[CHỜ reschedule B3]`): `appointments.constants.ts`, `ports/appointment-notifier.port.ts`, `notifications/booking-notifier.ts`, `notifications/notification-text.ts`, `state/` (nơi gọi `notify`); sửa test BCS-04 ("bốn mã" thành năm) và kiểm tập "loại có thư" của booking.

### 5.9 Cổng và điểm nối với module khác

| Module | Điểm nối | Việc cụ thể | Ghi chú |
|---|---|---|---|
| `booking` | `AppointmentNotifier` (cổng), `BookingNotifier`, worker thư, `readNotificationContext`, `insertThongBao`, `insertEmailRow`, `renderMailShell`, `SystemConfigService` | B6: một sự kiện mới; B4, B5: loại và mẫu thư; B3: dùng lại ngữ cảnh thư và chân thư; B2: **không** gọi booking | `[ĐỤNG booking]`; chờ reschedule B3; chiều phụ thuộc giữ: booking không import `notification/` lúc chạy |
| `payment`, `wallet` | `topup-notifier`, `refund-notifier`, `withdrawal-notifier`, `PAYMENT_MAIL_EVENTS` | **không đổi mã**; danh mục chỉ ghi nhận (B1); web hiển thị (F2) | spec B1 import hằng của họ chỉ ở file test |
| `doctor` | `LeaveNotifier`, `ApprovalsHostPage` (trang Duyệt yêu cầu: đích liên kết `NghiPhep` của Admin) | B5: thêm thư; F2: liên kết `NghiPhep` tới trang nghỉ phép của Bác sĩ và trang duyệt của Admin | `[ĐỤNG doctor]` (file của Trung) |
| `doctor-exam` | `ExamNotifier`, ca HDK-06 | B4: thêm thư, sửa HDK-06 | `[ĐỤNG doctor]`; trùng ca với reschedule B3 (L14) |
| `admin` | `BranchChangeNotifier` (không đổi), `SystemConfigService`, `AdminHeader`, `admin-sidebar.tsx`, entity | B1: ghi nhận mã; F3: bật chuông và mục menu; P1: entity mới; B3: đọc cấu hình | `[ĐỤNG admin]` (file của Trung) |
| `reschedule` (#9) | bốn sự kiện (reschedule B3), lịch nối chuỗi `lich_hen_truoc_id` | danh mục ghi sẵn 4 mã `ChoModule`; B3 nhắc lịch bỏ qua lịch `DaDoiLich`, lịch mới có mốc riêng (NLH-09); reschedule B3 ghi 4 mã vào MAIL_EVENTS **trước** B4, B5, B6 | **không sửa** `docs/features/reschedule/*`; xem R1, L14 |
| `waitlist` (#11) | `WaitlistPort`; thông báo mời, kết quả; thư theo 2.4.75 | chừa chỗ: không mã, không task; khi #11 có mã thì khai vào danh mục và (nếu có thư) vào `MAIL_EVENTS` | `[CHỜ waitlist]` |
| `chat` (sau) | tin nhắn mới tới Bác sĩ, Lễ tân, Bệnh nhân | chừa chỗ như trên | |
| `auth` | `@Roles`, `CurrentUser()`, `JwtAuthGuard`, làm mới phiên ở `shared/api/client.ts` | dùng nguyên | |
| `mail` | `MailService`, `renderMailShell`, `toSingleLine`, `escapeHtml`, `FakeMailService`, `fake-smtp-server.ts` | dùng nguyên; không đổi `mail/` | |
| `search` | `PublicHeader` (chuông cho Bệnh nhân khi đang đặt lịch) | **không** làm (Q10; nháp TECH_DEBT 272) | |
| `shared` (web) | `RoleShell`, `RoleNavItem`, `shared/api/client.ts`, `shared/hooks`, `shared/ui` | thêm prop tuỳ chọn cho chuông và số đếm (F1); dùng nguyên các phần còn lại | `[ĐỤNG shared]` |
| báo cáo (sau) | — | không dùng `thong_bao` | |

### 5.10 Frontend (bám component hiện có; chuông là liên kết, Q14; mức kiểm GỌN)

- **Khung vai trò** (F1): `RoleShell` thêm prop tuỳ chọn `notifications?: { unread: number; to: string; announce: boolean }` ⇒ thanh trên hiện **chuông** (liên kết `to`, nhãn truy cập "Thông báo, N chưa đọc", số hiện `99+` khi quá 99, ẩn số khi 0) và **số đếm** trên mục menu "Thông báo" (`RoleNavItem` thêm `badge?: 'notifications'`); mặc định không có ⇒ khung cũ không đổi (ca `role-shell.test.tsx` giữ nguyên). Các layout (Bệnh nhân, Lễ tân, Bác sĩ) **nhận** `notifications` qua prop từ `router/role-routes.tsx` (router tự gọi `useUnreadCount()` và truyền), để `features/patient` và `features/doctor` **không import chéo** `features/notification` (kiểm các `architecture.test.ts` hiện có khi làm). `role-nav.ts` đặt `to` cho "Thông báo" của ba khung; `role-routes.tsx` thêm route `…/thong-bao` (đường dẫn ở `shared/routes/notification-paths.ts`: `/benh-nhan/thong-bao`, `/le-tan/thong-bao`, `/bac-si-portal/thong-bao`, `/admin/thong-bao`, khớp manifest Figma Make).
- **Trang Trung tâm thông báo** (F2), **một** thành phần dùng cho bốn vai trò: ba tab Tất cả, Chưa đọc, Đã đọc (URL giữ `?loc=` và `?trang=`); danh sách phân trang 20 dòng, mới nhất trước; hàng chưa đọc có chấm, chữ đậm và `aria-label` "chưa đọc"; mỗi hàng: biểu tượng theo nhóm, tiêu đề, `noiDung` rút gọn hai dòng, thời gian tương đối và tuyệt đối theo giờ Việt Nam; nút "Đánh dấu tất cả đã đọc" (vô hiệu khi không còn chưa đọc, khoá khi đang gửi); chọn một hàng ⇒ **panel chi tiết** (nội dung đầy đủ dạng chữ, nhóm, thời gian, nút liên kết nếu `lienKet` có và vai trò mở được) và gọi `POST read` **đúng một lần** (chặn bấm đúp và `StrictMode`); màn dưới 1024 px: danh sách và chi tiết là hai màn có nút "Quay lại" (như `onBack` của Make) và ở 375 px không tràn ngang.
- **Bảng liên kết kiểu × vai trò → đường dẫn** (`notification-links.ts`; đường dẫn lấy từ `shared/routes`, không viết cứng): `LichHen` + `maLichHen` ⇒ Bệnh nhân `patientAppointmentDetailPath`, Lễ tân `receptionAppointmentDetailPath`, Bác sĩ `doctorAppointmentDetailPath`, Admin `adminAppointmentDetailPath`; `Vi` ⇒ Bệnh nhân `PATIENT_WALLET_PATH`, Admin trang tài chính ví (`ADMIN_WITHDRAWALS_PATH` `[đề xuất]`); `NghiPhep` ⇒ Bác sĩ trang nghỉ phép (`DOCTOR_PATHS.leave`), Admin trang "Duyệt yêu cầu"; `ThayDoiChiNhanh` ⇒ Admin trang chi nhánh, Bệnh nhân "Lịch hẹn của tôi"; ô (kiểu, vai trò) không có đích ⇒ không hiện nút.
- **Admin** (F3): `AdminHeader` bỏ `disabled` ở nút chuông và biến thành liên kết có số đếm; mục sidebar "Thông báo" có `to`; số đếm lấy qua prop như trên; không thêm CSS Module mới (nếp web admin; ca FG-06 đếm 5 file).
- **Kiến trúc web:** một lớp API client (`shared/api/client.ts`), không `fetch` ngoài lớp client, đường dẫn ở `shared/routes`, mã lỗi → câu theo `maLoi` (5.11), **không** `dangerouslySetInnerHTML` (WTB-12); dọn timer và listener khi gỡ; đủ trạng thái tải (khung giữ chỗ), rỗng (câu riêng từng bộ lọc), lỗi (nút "Thử lại"), mất mạng (banner có sẵn), quá giờ.
- **Trợ năng:** chuông có tên truy cập kèm số; vùng `aria-live="polite"`; danh sách là `ul` với nút chọn hàng; bàn phím: Tab, Enter hay Space chọn, Esc đóng panel khi là ngăn; tiêu điểm về hàng vừa mở khi đóng; tương phản chấm chưa đọc đo bằng script nếp `reference_contrast_measurement` (viền nhạt `gray-200` dưới 3:1 là nếp có sẵn).

### 5.11 Mã lỗi → chữ (`maLoi` ổn định; chữ Đại đã đồng ý ở Q15, nhóm duyệt khi review F2; frontend chọn theo `maLoi`, không theo câu chữ)

Scope này **không có mã lỗi nghiệp vụ riêng**: dùng mã chung (`common/errors/error-codes.ts`).

| `maLoi` | HTTP | Khi nào | Câu hiển thị `[đề xuất]` |
|---|---|---|---|
| `CHUA_DANG_NHAP` | 401 | không có hay hết hạn token | (lớp client làm mới phiên, hỏng thì về đăng nhập) |
| `DU_LIEU_KHONG_HOP_LE` | 400 | `page`, `pageSize` sai, `trangThaiDoc` lạ | "Bộ lọc không hợp lệ. Vui lòng tải lại trang." |
| `KHONG_TIM_THAY` | 404 | thông báo không có, của người khác, `id` sai dạng | "Không tìm thấy thông báo này." |
| `LOI_HE_THONG` | 500 | lỗi ngoài dự kiến | "Hệ thống đang gặp sự cố. Vui lòng thử lại sau." |
| (mạng, quá giờ) | — | không tới được máy chủ | "Không tải được thông báo. Kiểm tra kết nối rồi thử lại." |

Câu rỗng: tab Tất cả "Bạn chưa có thông báo nào."; Chưa đọc "Bạn không có thông báo chưa đọc."; Đã đọc "Bạn chưa có thông báo đã đọc."; nút "Đánh dấu tất cả đã đọc"; thông báo khi đánh dấu một hàng thất bại: "Chưa đánh dấu được là đã đọc. Thử lại sau." (không chặn xem).

### 5.12 Kiểm thử, việc phải **đo thật** trước khi viết mã, dữ liệu mẫu

- **Mức kiểm ĐẦY ĐỦ** cho P1, B2, B3, B4, B5, B6, X2 (khoá, giao dịch, job, đồng thời, worker thư): đột biến (mỗi ca một lượt vitest một file nối tiếp, xin "RẢNH" của phiên kiểm trước khi chạy: đột biến là lane NẶNG), `test:int` và `test:e2e` trên MySQL thật, ca đồng thời chạy một mình, EXPLAIN cho câu SQL mới. **Mức GỌN** cho B1 (hàm thuần và spec) và task web F1, F2, F3 (đột biến web bốn loại): jscpd và gitleaks do CI đo, báo cáo ghi "CI đo".
- **Đột biến bắt buộc** (mỗi dòng một đột biến, phải bị bắt bởi ít nhất một ca): (1) bỏ `tai_khoan_id` khỏi một câu của Trung tâm (TTB-05, TTB-06, TTB-07, QTB-03); (2) `read-all` đánh dấu cả thông báo của tài khoản khác (TTB-08); (3) `POST read` không kiểm sở hữu, hay kiểm bằng `SELECT` riêng rồi `UPDATE` chỉ theo `thong_bao_id` (TTB-07, QTB-03); (4) sắp xếp tăng dần hay bỏ khoá phụ `thong_bao_id` (TTB-01, TTB-13); (5) `soChuaDoc` tính theo bộ lọc (TTB-01, TTB-09); (6) mã lạ ném 500 (TTB-11); (7) `read-all` một câu duy nhất ở `REPEATABLE READ` (CTB-02, M5); (8) mốc tính ngược chiều (NLH-03); (9) bỏ hay nới cửa sổ 10 phút (NLH-04, NLH-05); (10) không loại lịch khác `DaXacNhan` (NLH-08); (11) không kiểm lại lịch sau khi nhận việc (NLH-12); (12) bỏ trần 3 lần (NLH-11); (13) gửi TRƯỚC khi nhận việc (NLH-07, CTB-01); (14) thử lại sớm hơn 5 phút (NLH-10); (15) ghi `error.message` vào `loi_cuoi` (NLH-10, BTB-07); (16) mốc theo vị trí mảng (NLH-16); (17) nhắc lịch ghi `thong_bao` hay `email_thong_bao` (NLH-18); (18) danh mục thiếu hay thừa một mã (DMS-01, DMS-02); (19) thư hoàn thành chứa `ly_do_kham` (EMT-02, BTB-06); (20) thư nghỉ phép chứa `ly_do` của Bác sĩ (EMT-05); (21) `NghiPhepChoDuyet` có thư (EMT-04, EMT-12); (22) `LichHenDaTiepDon` ghi cho tài khoản đặt (DMS-09); (23) `LichHenDaTiepDon` ghi ngoài giao dịch hay nuốt mọi lỗi (DMS-09); (24) web: không dừng thăm dò khi tab ẩn, không dọn timer, gọi `POST read` hai lần, `dangerouslySetInnerHTML` (WTB-02, WTB-08, WTB-12).
- **Việc phải đo thật ở task X1** (tiêu chí PASS/FAIL đặt TRƯỚC khi chạy, ghi ở TRACKING mục 6; nếp "Quy ước đo thật"; spec đo tạm rồi xoá; Docker và MySQL có thể tắt lúc đầu phiên, bật bằng `docker desktop start` rồi `docker compose up -d db`; DB `*_test` riêng, **không** đụng DB `clinix`):

| Mã đo | Câu hỏi | Tiêu chí đạt (đặt trước) |
|---|---|---|
| M1 | Danh sách thông báo ở mức **MỘT tài khoản nhiều dòng**, không chỉ ở tổng 100.000 dòng: tài khoản có 20.000 dòng (10.000 chưa đọc), 999 tài khoản còn lại chia đều phần còn lại; ba câu `tat-ca`, `chua-doc`, `da-doc`; trang 1 và trang 500; EXPLAIN. **Dự đoán chưa đo:** `tat-ca` có thể `Using filesort` (điều kiện của phiên kiểm khi duyệt Q12) | `chua-doc` và `da-doc`: dùng `thong_bao_index_25`, **không** `Using filesort`; `tat-ca`: **không** `Using filesort` trên tập lớn hơn 1.000 hàng của một tài khoản; cả sáu ca p95 ≤ 50 ms (100 lần mỗi ca); FAIL (kể cả chỉ `tat-ca` có filesort) ⇒ P2(b) chỉ mục `(tai_khoan_id, thoi_diem_tao, thong_bao_id)` làm **trước khi merge B2**; **không thêm chỉ mục khi chưa đo** |
| M2 | `unread-count` (câu chạy mỗi 30 giây mỗi tab đang mở) ở mức MỘT tài khoản 20.000 dòng (10.000 chưa đọc) và chi phí thăm dò: cùng dữ liệu M1; EXPLAIN; 200 luồng giả lập mỗi 30 giây trong 60 giây | EXPLAIN: `ref` hay `range` trên `thong_bao_index_25`, không `ALL`; `COUNT` p95 ≤ 20 ms; tải 200 luồng: 0 lỗi, p95 ≤ 30 ms; ghi CPU và số kết nối; FAIL ⇒ chu kỳ 60 giây |
| M3 | Quét nhắc lịch ở 100.000 `lich_hen` (30.000 `DaXacNhan` tương lai trải đều 14 ngày), mốc 72, 24, 2: EXPLAIN và thời gian một lượt (ba câu) | p95 ≤ 100 ms cho cả ba câu; FAIL (hay `type = ALL`) ⇒ P2(a) chỉ mục `(trang_thai, thoi_gian)`; sau đó đo lại truy vấn NoShowJob để đóng TECH_DEBT 90 |
| M4 | `affectedRows` dưới cấu hình `mysql2` và TypeORM của dự án: (i) `INSERT … ON DUPLICATE KEY UPDATE lich_hen_id = lich_hen_id` (lần đầu, lần hai); (ii) `UPDATE thong_bao SET trang_thai_doc = 1 WHERE …` trên hàng ĐÃ đọc (khớp nhưng không đổi) | (i) PASS nếu lần đầu = 1 và lần hai = 0 (giữ quy tắc 41); ngược lại dùng `INSERT` thường và bắt 1062, sửa chữ quy tắc 41 và `COMMENT` bảng cùng PR; (ii) PASS nếu = 1 (đếm hàng khớp, một câu `UPDATE` đủ để phân biệt 200 và 404); ngược lại dùng phương án đọc `info` hay `SELECT` sau `UPDATE` ở 5.4 |
| M5 | `read-all` (500 dòng mỗi lô) đồng thời với `INSERT thong_bao` của một giao dịch `READ COMMITTED` cùng tài khoản, 300 vòng, hai luồng; đối chứng `REPEATABLE READ` một câu | `READ COMMITTED` chia lô: 0 lần 1213 và 1205, mỗi `INSERT` chờ ≤ 100 ms; đối chứng: ghi nhận (chứng minh quy tắc cần, không phải điều kiện PASS) |
| M6 | Câu chọn lô của worker thư (`SELECT_DUE_EMAILS_SQL`) với 21 loại ở 100.000 `email_thong_bao` (200 chờ, 5.000 `ThatBai` hết lần) | ≤ 10 ms (B15 đo 1,7 ms ở 13 loại, TECH_DEBT 129) |
| M7 | Thông lượng một lượt nhắc lịch: 1.000 mốc đến hạn cùng phút với `FakeMailService` 0 ms và đối chứng 300 ms mỗi thư | đủ 1.000 mốc, không mốc nào gửi hai lần; ở 300 ms mỗi thư tổng thời gian ≤ 600 giây (nằm trong cửa sổ 10 phút); ghi thời gian thật và `more` |

- **Dữ liệu mẫu (X3):** seed demo (Đại chạy; **không** `seed:*` lên DB `clinix` khi chưa được Đại đồng ý): mỗi vai trò ít nhất 25 thông báo trộn đọc và chưa đọc (để thấy phân trang, tab), một lịch `DaXacNhan` cách giờ hẹn khoảng 2 giờ 5 phút để thấy thư nhắc tới hộp thư giả, dòng `cau_hinh_he_thong` có `thoi_diem_nhac_lich`. Test tự động **không** dùng seed (fixture riêng ở `notification/testing/` và `appointments/testing/`).
## 6. Kế hoạch task

**Cách gọi mã task:** mã của scope này là `P1`, `P2`, `B1` đến `B6`, `F1` đến `F3`, `D1`, `X1` đến `X3`. Mã **trùng** với mã của `booking` (PLAN [`docs/features/booking/PLAN.md`](../booking/PLAN.md)) và của `reschedule` (PLAN [`docs/features/reschedule/PLAN.md`](../reschedule/PLAN.md)). Vì vậy khi nhắc ngoài file này luôn viết **"notification B2"** (task của scope này), **"reschedule B3"** hay **"booking B15"**; issue và PR dùng nhãn `[notification]` và hậu tố `(notification B2)`.

### 6.1 Sơ đồ phụ thuộc và năm lát cắt giao được (cùng một hàng = làm song song được; `→` = phải xong trước)

```
Nền đã có: booking lõi (cổng thông báo, B15 hộp thư đi và worker, mail-format) · payment, wallet (notifier) · doctor (LeaveNotifier) · doctor-exam (ExamNotifier)
           admin (BranchChangeNotifier, cấu hình nhắc lịch) · mail (MailService, fake) · web RoleShell và layout bốn vai trò
Chờ ngoài scope: reschedule P1 (mốc migration) · reschedule B3 (sửa appointments/notifications/*)

S1 Nền:                       P1 ─┬─ X1 (đo M1…M7; M1, M2, M5, M6 làm được trước P1)        B1 (danh mục; độc lập)
                                   └─ P2 (chỉ khi X1 vượt ngưỡng; [CHỜ X1])
S2 Trung tâm thông báo (MVP): B1, X1 (+ P2(b) nếu M1 FAIL) ─ B2 (API) ─ F1 (chuông, thăm dò, menu; [SOẠN TRƯỚC] bằng API giả) ─ F2 (trang) ─ F3 (Admin)
S3 Nhắc lịch:                 P1, X1 ─ B3 (job, mẫu thư, dòng nhac_lich_hen)        (độc lập với S2)
S4 Thư và sự kiện mới:        [CHỜ reschedule B3] ─ B4 (thư hoàn thành) ─ B5 (thư nghỉ phép);  B1 + [CHỜ reschedule B3] ─ B6 (tiếp đón)
S5 Hoàn tất:                  B2, B3, B4, B5, B6 ─ X2 (đồng thời) ;  mọi task ─ D1 (tài liệu repo) ─ X3 (kiểm tay, tổng kết)
```

Lát cắt giao được: **S2** là MVP (Bệnh nhân, Bác sĩ, Lễ tân, Quản trị viên xem thông báo, có chuông và số đếm); **S3** cộng nhắc lịch; **S4** hoàn thiện thư và sự kiện; **S1** và **S5** là nền và hoàn tất. S2 và S3 không chờ ai ngoài scope (trừ mốc migration của P1).

### 6.2 Danh sách task (mỗi task = một PR; người làm Trung `junUTE`, Đại review; giờ là `[đề xuất]`, giờ thật khi làm)

| ID | Việc (file chính) | Phụ thuộc | Truy vết | Test case | Thẻ | Giờ | Mức |
|---|---|---|---|---|---|---|---|
| **P1** | Migration `CREATE TABLE nhac_lich_hen` **nguyên văn DDL** (bảng, chỉ mục, khoá ngoại, hai CHECK), entity `NhacLichHen`, enum `TRANG_THAI_NHAC_LICH_HEN`, đăng ký `entities.ts`, `migrations/index.ts`; cập nhật bài parity | — (mốc migration sau reschedule P1) | 2.4.69 b4; 2.4.75 b4; quy tắc DB 34, 41; L19 | MTB-01…MTB-09, MTB-11 | `[ĐỤNG admin]` `[ĐỤNG database]` `[CHỜ reschedule P1]` (mềm: chỉ về mốc) | 4 | ĐẦY ĐỦ |
| **P2** | **Có điều kiện (Q8):** chỉ mục `lich_hen (trang_thai, thoi_gian)` và/hoặc `thong_bao (tai_khoan_id, thoi_diem_tao, thong_bao_id)`; ba file `docs/database/*`, entity, migration | X1 (chỉ làm khi M1 hay M3 FAIL; nếu M1 FAIL thì P2(b) **trước B2**) | Q8; TECH_DEBT 90 | MTB-10 | `[ĐỒNG BỘ TL]` `[ĐỤNG database]` `[ĐỤNG booking]` (bảng `lich_hen`) `[CHỜ X1]` | 3 | ĐẦY ĐỦ |
| **X1** | Đo thật M1 đến M7 (5.12); tiêu chí đặt trước; spec đo tạm rồi xoá; ghi TRACKING mục 6 | P1 (M3, M4, M7 cần bảng); M1, M2, M5, M6 làm được trước | R2 đến R5; L16 | — (số đo) | `[TIỀN ĐỀ]` | 5 | ĐẦY ĐỦ |
| **B1** | Danh mục sự kiện `notification/catalog/` + test đối chiếu mọi hằng mã của 7 nơi ghi, tập "có thư" khớp worker, độ dài 500 | — | 2.4.68; Q5; L6, L8, L15 | DMS-01…DMS-08, DMS-13, HTB-07 | | 5 | GỌN |
| **B2** | API Trung tâm thông báo: danh sách, số chưa đọc, chi tiết, đánh dấu một và tất cả (chia lô `READ COMMITTED`); `NotificationCenterModule`; fixture | B1; X1 (M1, M5); P2(b) nếu M1 FAIL | 2.4.59 b1 đến b4, A1, MT; Q1, Q11 đến Q13 | TTB-01…TTB-16, QTB-01…QTB-05, HTB-01…HTB-04, BTB-02…BTB-04 | `[ĐỤNG database]` (`app.module.ts`) | 6,5 | ĐẦY ĐỦ |
| **B3** | Job nhắc lịch: cấu hình, tìm mốc, tạo dòng, nhận việc, gửi, thử lại; `reminder.query.ts`, mẫu thư; `ReminderModule` | P1; X1 (M3, M4, M7) | 2.4.69 (b1 đến b4, A1 đến A3); 2.4.75 b4; Q2, Q3 | NLH-01…NLH-23, HTB-05, HTB-06, BTB-01, BTB-05 đến BTB-07 | `[ĐỤNG database]` | 7 | ĐẦY ĐỦ |
| **B4** | Thư hoàn thành lịch khám (`678:2`): `ExamNotifier` ghi dòng thư, hằng và mẫu, `MAIL_EVENTS`, `buildMessage`; sửa HDK-06 | B1; **reschedule B3** | 2.4.68 MT; 2.4.75; Q6; TECH_DEBT 186 | EMT-01, EMT-02, EMT-03, EMT-08, EMT-10 đến EMT-13 | `[ĐỤNG booking]` `[ĐỤNG doctor]` `[CHỜ reschedule B3]` | 5 | ĐẦY ĐỦ |
| **B5** | Thư nghỉ phép (`688:2`) cho Bác sĩ: `LeaveNotifier` ghi dòng thư ba loại, `renderLeaveMail`, `MAIL_EVENTS` | B4 (cùng worker) | Q6; doctor Q33; mục Doctor B10 | EMT-04…EMT-07, EMT-08, EMT-10 | `[ĐỤNG booking]` `[ĐỤNG doctor]` `[CHỜ B4]` | 5 | ĐẦY ĐỦ |
| **B6** | Sự kiện `LichHenDaTiepDon` cho Bác sĩ (chỉ trong ứng dụng): hằng, người nhận, chữ, nơi gọi trong `checkIn`; bỏ dòng thư cho loại này | B1; **reschedule B3** | 2.4.32 b5; Q7; L9 | DMS-09…DMS-12 | `[ĐỤNG booking]` `[CHỜ reschedule B3]` | 4 | ĐẦY ĐỦ |
| **F1** | Web (1/3): kiểu và API client, `useUnreadCount` (thăm dò), `RoleShell` prop chuông và số đếm, `to` ở `role-nav.ts`, route ở `role-routes.tsx`, `notification-paths.ts`; fake API | B2 (`[SOẠN TRƯỚC]` bằng API giả theo 5.4) | 2.4.59 b5; TECH_DEBT 62; Q1, Q14 | WTB-01…WTB-05, WTB-16 | `[ĐỤNG shared]` `[ĐỤNG router]` `[ĐỤNG patient]` `[ĐỤNG doctor]` | 6 | GỌN |
| **F2** | Web (2/3): trang Trung tâm thông báo (tab, danh sách, phân trang, panel chi tiết, đánh dấu một và tất cả, trạng thái, liên kết theo vai trò) | F1 | 2.4.59 b1 đến b4, A1 | WTB-06…WTB-14, WTB-16, WTB-17 | `[ĐỤNG router]` | 6,5 | GỌN |
| **F3** | Web (3/3): khung Quản trị viên: bật chuông ở `AdminHeader`, mục sidebar "Thông báo", route `/admin/thong-bao` dùng lại trang F2; sửa ca `admin-layout` | F2 | 2.4.59 (Quản trị viên) | WTB-15 | `[ĐỤNG admin]` | 3 | GỌN |
| **D1** | Tài liệu của repo: tick PLAN này; PLAN booking, doctor, doctor-exam (thẻ `[CHỜ notification]`, mục B15, HDK-06, thay `LeaveNotifier`), quy tắc DB 41 và `COMMENT` (chữ, nếu M4 đòi); một dòng `docs/TRACKING.md`; nháp đóng TECH_DEBT 62, 186, Doctor B10 (Đại ghi) | mọi B và F | `[ĐỒNG BỘ TL]` | — | `[ĐỒNG BỘ TL]` | 2 | — |
| **X2** | Đồng thời và bất biến trên MySQL thật: bộ CTB, mỗi ca một mình, IVN-01…IVN-05 sau mỗi ca, đếm 1213, 1205, 503 | B2, B3, B4, B5, B6 | R3, R6 | CTB-01…CTB-07, EMT-09 | | 5 | ĐẦY ĐỦ |
| **X3** | Kiểm tay trình duyệt bốn vai trò (KTB-01…KTB-12), đột biến lô (24 đột biến, 5.12), jscpd và gitleaks (CI đo), tổng kết TRACKING, seed demo | mọi task | mục 10 | KTB-01…KTB-12 | `[CHỜ Đại]` (seed, DB `clinix`) | 5 | ĐẦY ĐỦ |

**Tổng 69 giờ** cộng **3 giờ dự phòng** cho P2 (chỉ khi X1 vượt ngưỡng) = tối đa 72 giờ (không tính D2 của Đại ngoài repo). `[đề xuất]`: số giờ là ước của AI, giờ thật ghi ở TRACKING.

### 6.3 File của module khác và file dùng chung bị chạm, cách tránh xung đột với đổi lịch

| File | Của | Task | Cách |
|---|---|---|---|
| `apps/api/src/appointments/notifications/{email-outbox.service,email-outbox.query,notifications.constants,booking-mail.templates,booking-notifier,notification-text}.ts` + test | Đại (booking); **reschedule B3 cũng sửa** | B4, B5, B6 | **chờ reschedule B3 merge**, `git pull` rồi đọc lại bản đã sửa; một PR mỗi lần; báo Đại; nếu B3 trượt thì B4 đến B6 trượt theo (R1) |
| `apps/api/src/doctor/examination/notifications/exam-notifier.int-spec.ts` (HDK-06) | Trung (doctor-exam); reschedule PLAN cũng định sửa | B4 | làm sau reschedule B3; đọc bản ca hiện hành (L14) |
| `apps/api/src/doctor/notifications/leave-notifier.ts` + test | Trung (doctor) | B5 | báo Đại biết (cùng worker với B4) |
| `apps/api/src/appointments/{appointments.constants.ts,ports/appointment-notifier.port.ts,state/*}` | Đại (booking) | B6 | chờ reschedule B3; sửa BCS-04; báo Đại |
| `apps/api/src/database/{entities.ts,migrations/index.ts}`, migration mới | chung | P1, (P2) | `git pull` trước; mốc lớn hơn mọi migration trên `main` lúc merge (reschedule P1 dự kiến `1793966400000`); báo Đại; rebase khi reschedule P1 merge trước |
| `apps/api/src/admin/entities/{nhac-lich-hen.entity.ts (mới),enums.ts}` | Trung (admin) | P1 | thêm file mới và một hằng; **không sửa `thong-bao.entity.ts`** (reschedule P1 thêm cột vào đó) |
| `apps/api/src/app.module.ts` | chung | B2, B3 | hai dòng `import` và hai phần tử mảng; rebase khi trùng với PR khác |
| `docs/database/clinix.dbml`, `clinix_mysql.sql`, `clinix_quy_tac_nghiep_vu.md` | chung | P2 (nếu làm), D1 (chữ quy tắc 41 nếu M4 đòi) | P1 **không** sửa ba file (DDL đã có); P2 và D1 sửa **cả ba** khớp nhau, `git pull` trước, báo Đại |
| `apps/web/src/shared/ui/role-shell.tsx`, `role-shell-sidebar.tsx` (+ test) | chung | F1 | prop tuỳ chọn, mặc định giữ khung cũ; ca `role-shell.test.tsx` không đổi |
| `apps/web/src/features/patient/shell/*`, `features/doctor/shell/doctor-layout.tsx` | Đại (patient), Trung (doctor) | F1 | chỉ thêm prop truyền xuống; không import chéo `features/notification` |
| `apps/web/src/router/{role-nav.ts,role-routes.tsx}` | chung | F1, F2 | `[ĐỤNG router]`, nếp patient Q21d; reschedule F1 và F4 cũng thêm dòng ở đây: rebase |
| `apps/web/src/features/admin/components/{admin-header,admin-sidebar}.tsx`, `admin-layout.test.tsx` | Trung (admin) | F3 | sửa tối thiểu; không thêm CSS Module |
| `apps/web/src/shared/routes/notification-paths.ts` | chung | F1 | file **mới**, chỉ hằng |
| `docs/TECH_DEBT.md`, `AI_USAGE_LOG.md` | Đại | D1 | **phiên lập kế hoạch này không sửa**; nháp ở TRACKING mục 4 |
| `docs/features/reschedule/*`, `docs/features/booking/*`, `doctor/*`, `doctor-exam/*`, `admin/*`, `docs/PLAN.md` | các module | D1 | **không sửa ở PR tài liệu của kế hoạch**; sửa ở D1 |
| `.env.example`, `docker-compose*.yml`, `.github/workflows/*`, `package.json`, `apps/web/nginx.conf` | chung | — | scope này **không** thêm cấu hình, biến môi trường, phụ thuộc, không đổi proxy |

### 6.4 Ước giờ và chia Iteration (`[đề xuất]`; Iteration một tuần; hạn mức giờ mỗi tuần của Trung là **giả định 40 giờ** Đại đã chọn, chưa phải số thật, Q9)

| Lát cắt | Task (giờ) | Giờ |
|---|---|---|
| **S1 Nền** | P1 4 · X1 5 · B1 5 · (P2 3, dự phòng) | **14** (+3) |
| **S2 Trung tâm thông báo** | B2 6,5 · F1 6 · F2 6,5 · F3 3 | **22** |
| **S3 Nhắc lịch** | B3 7 | **7** |
| **S4 Thư và sự kiện mới** | B4 5 · B5 5 · B6 4 | **14** |
| **S5 Hoàn tất** | D1 2 · X2 5 · X3 5 | **12** |
| **Tổng** | | **69** (+3) |

| Iteration | Task | Giờ | Ghi chú |
|---|---|---|---|
| **8** (01/12 đến 07/12) | P1, X1, B1, B2, F1, F2, B3 | **40** | X1 chạy khi máy rảnh (lane nặng); M1, M2, M5, M6 trước P1; F1 `[SOẠN TRƯỚC]` bằng API giả từ đầu tuần; B3 sau X1 (M3, M4, M7); **nếu M1 FAIL**: P2(b) 3 giờ vào Iteration 8 và B3 trượt sang Iteration 9 |
| **9** (08/12 đến 14/12) | F3, B4, B5, B6, X2 (+ P2 nếu X1 FAIL) | **22** (+3) | B4, B5, B6 **chờ reschedule B3** (Đại làm ở Iteration 8); nếu B3 trượt thì B4 đến B6 trượt sang Iteration 10 |
| **10** (15/12 đến 21/12) `[đề xuất]`, chưa có trong Project | D1, X3 (+ B4, B5, B6 nếu trượt) | **7** (+14 dự phòng) | Iteration 9 và 10 chưa có trong Project: việc của Đại. Khoảng trống Iteration 10 là chỗ đệm cho việc trượt |

**Giờ ước cho việc LẬP KẾ HOẠCH này:** `[đề xuất]` **5 giờ** (đọc nguồn và mã 2; đối chiếu, so hai bản 2.4 và hỏi Đại 1; viết PLAN, TRACKING, nháp 2) cộng khoảng 1 giờ review của mỗi người. **Phương án cắt nếu thiếu giờ** (Đại quyết): (1) bỏ B5 (thư nghỉ phép; nghỉ phép tiếp tục chỉ trong ứng dụng): −5 giờ, thiếu một nửa Q6; (2) bỏ B6 (tiếp đón): −4 giờ, 2.4.32 b5 còn lệch; (3) bỏ F3 (Admin): −3 giờ nhưng thiếu một vai trò của 2.4.59; (4) bỏ tab "Đã đọc" ở F2: −1 giờ; (5) bỏ đột biến lô web ở X3: −1,5 giờ (không khuyến nghị). **Không cắt** B1, B2, B3, F1, F2 (lõi bốn use case).

### 6.5 Việc nào bắt đầu ngay, việc nào phải chờ

- **Ngay (độc lập):** B1; X1 phần M1, M2, M5, M6 (không cần bảng mới); F1 `[SOẠN TRƯỚC]` bằng API giả khi hợp đồng 5.4 được duyệt; D2 (Đại sửa Word, ngoài repo).
- **P1:** làm được ngay nhưng **chọn mốc migration sau reschedule P1** (merge sau hay đổi mốc khi rebase); báo Đại.
- **Sau B1 và X1:** B2 (nếu M1 FAIL thì **P2(b) trước**, rồi B2: không merge danh sách khi số đo đòi chỉ mục mà chưa có). **Sau P1 và X1 (M3, M4, M7):** B3.
- **Chờ reschedule B3:** B4, B5, B6 (cùng file `appointments/notifications/*`). Trong lúc chờ, viết trước được hàm thuần (mẫu thư, hằng, chữ) ở file **mới** (`[SOẠN TRƯỚC]`), chưa nối vào worker.
- **P2:** chỉ khi X1 vượt ngưỡng; nếu PASS thì **đóng** task này (ghi vào TRACKING).
- **Không chờ `waitlist`, `chat`:** chỉ chừa chỗ ở danh mục.
- **Không chờ payment, wallet, admin:** đã có mã; scope chỉ đọc hằng của họ ở file test.

### 6.6 Thông tin để sinh issue (**KHÔNG tạo issue lúc này**: Đại tự chạy script sau khi PR tài liệu merge và các `[CHỜ …]` có xác nhận)

Mỗi task một issue; nhãn `module:notification` (**chưa có** trong repo; Đại đồng ý tên ở Q18 và **phiên kiểm độc lập có script tự tạo cả nhãn lẫn milestone**) cộng `backend`, `frontend` hay `docs` (task web: `frontend`; task cần đồng bộ tài liệu thêm `docs-sync`; `testing` cho X1, X2); milestone `notification` (đã đồng ý, Q18; phiên kiểm tạo bằng script); giao `junUTE` (người làm), review `MaxTrann` (Đại review mọi PR của scope); Epic `[notification] Epic · Thông báo (scope #10): Trung tâm thông báo, nhắc lịch, email theo sự kiện` (nhãn `epic`, `module:notification`) gom mọi task; Iteration theo 6.4. Tiêu đề issue dạng `[notification] <mã> · <tên> (<backend|frontend|docs>)` (≤ 100 ký tự), tiêu đề PR ≤ 100 ký tự và `Closes #<issue>` ở thân PR (Epic dùng `Refs`). Khuôn thân issue theo issue reschedule #634 (đọc bằng `gh issue view 634`) và booking #249: `## Mô tả`, `## Truy vết`, `## Phụ thuộc`, `## Lưu ý` (thẻ `[CHỜ …]` trong PLAN; **Người làm: `junUTE`; người review: `MaxTrann`**; "Mã task trùng tên với task của `booking` và `reschedule`: khi nhắc ngoài PLAN này, viết notification B2"), `## Test case liên quan` (kèm "Danh sách đầy đủ ở `docs/features/notification/PLAN.md` mục 7"), `## Đóng khi` (bốn ô chuẩn: PR được người còn lại review và squash merge, tiêu đề theo Conventional Commits ≤ 100 ký tự, `Closes #<issue>`; test case đã chạy và ghi vào `docs/features/notification/TRACKING.md`; tài liệu đồng bộ đã cập nhật trong cùng PR; đã ghi `AI_USAGE_LOG.md`, không `Co-Authored-By` của AI), nguồn `docs/features/notification/PLAN.md` task `<mã>`.

Nhãn `blocked` (gỡ khi điều kiện có): **P1**: `[CHỜ reschedule P1]` (mốc migration; gỡ khi reschedule P1 merge hay khi đã chọn mốc lớn hơn); **P2**: `[CHỜ X1]` (chỉ mở khi X1 vượt ngưỡng; nếu PASS thì **không tạo issue** hay đóng ngay); **B4, B5, B6**: `[CHỜ reschedule B3]` (issue #639); **B5**: thêm `[CHỜ B4]`; **X3**: `[CHỜ Đại]` (seed, DB `clinix`). Q1 đến Q10 đã được Đại trả lời trực tiếp 24/11/2026; **Q11 đến Q13 đã được phiên kiểm độc lập duyệt** (24/11/2026, theo ủy quyền của Đại); **Q14 đến Q19 đã được Đại trả lời trực tiếp** (24/11/2026): không còn câu quyết định mở; Q15 chỉ còn việc nhóm duyệt câu chữ khi review PR của B1, B3, B4, B5, F2; Q16 giữ `[cần điền]` (chưa có Excel nào cần đồng bộ); Q19 giao việc sửa PLAN reschedule 5.10 và ca HDK-06 cho PR của reschedule B3.

| ID | Tiêu đề issue | Tiêu đề PR (`<loại>(<scope>): …`) | Iter. | "Đóng khi" (ngoài bốn ô chuẩn) |
|---|---|---|---|---|
| P1 | `[notification] P1 · Migration và entity bảng nhắc lịch hẹn (backend)` | `feat(db): thêm migration và entity bảng nhac_lich_hen cho nhắc lịch (notification P1)` | 8 | Migration lên và xuống được; `schema-parity` xanh (DDL nguyên văn, không đổi chữ); MTB-01…MTB-09, MTB-11 Pass; mốc lớn hơn migration cuối của `main` |
| P2 | `[notification] P2 · Chỉ mục cho quét nhắc lịch và danh sách thông báo (backend)` | `feat(db): thêm chỉ mục lich_hen và thong_bao theo số đo X1 (notification P2)` | 9 | **Chỉ khi X1 vượt ngưỡng:** ba file `docs/database/*` khớp; `schema-parity` xanh; EXPLAIN trước và sau ghi ở TRACKING; MTB-10 Pass; đóng TECH_DEBT 90 nếu đo lại NoShowJob đạt |
| X1 | `[notification] X1 · Đo thật danh sách, thăm dò, quét nhắc lịch, khoá đánh dấu đọc (backend)` | `test(notification): đo thật danh sách thông báo, thăm dò và quét nhắc lịch (notification X1)` | 8 | M1 đến M7 có số đo ở TRACKING mục 6; tiêu chí đặt trước, không đổi sau khi thấy số; spec đo tạm đã xoá; kết luận P2 làm hay đóng |
| B1 | `[notification] B1 · Danh mục sự kiện thông báo và test đối chiếu (backend)` | `feat(notification): thêm danh mục mã sự kiện thông báo và test đối chiếu (notification B1)` | 8 | DMS-01…DMS-08, DMS-13, HTB-07 Pass; không sửa mã ghi của module khác; đột biến 18 bị bắt |
| B2 | `[notification] B2 · API Trung tâm thông báo: danh sách, chi tiết, đánh dấu đã đọc (backend)` | `feat(notification): thêm API Trung tâm thông báo cho bốn vai trò (notification B2)` | 8 | TTB-01…TTB-16, QTB-01…QTB-05, HTB-01…HTB-04, BTB-02…BTB-04 Pass; EXPLAIN M1 đạt; đột biến 1 đến 7 bị bắt |
| B3 | `[notification] B3 · Job gửi nhắc lịch hẹn theo mốc cấu hình (backend)` | `feat(notification): thêm job nhắc lịch hẹn theo mốc, thử lại và chống gửi trùng (notification B3)` | 8 | NLH-01…NLH-23, HTB-05, HTB-06, BTB-01, BTB-05…BTB-07 Pass; đột biến 8 đến 17 bị bắt; số đo M3, M4, M7 đạt hoặc đã xử lý |
| B4 | `[notification] B4 · Thư hoàn thành lịch khám cho Bệnh nhân (backend)` | `feat(notification): thêm thư hoàn thành lịch khám vào worker gửi thư (notification B4)` | 9 | EMT-01…EMT-03, EMT-08, EMT-10…EMT-13 Pass; HDK-06 đã sửa; đóng TECH_DEBT 186 (nháp); đột biến 19 bị bắt |
| B5 | `[notification] B5 · Thư nghỉ phép cho Bác sĩ (backend)` | `feat(notification): thêm thư nghỉ phép cho Bác sĩ vào worker gửi thư (notification B5)` | 9 | EMT-04…EMT-08, EMT-10 Pass; không `ly_do` xin nghỉ trong thư; `NghiPhepChoDuyet` không thư; đóng mục Doctor B10 (nháp); đột biến 20, 21 bị bắt |
| B6 | `[notification] B6 · Sự kiện tiếp đón gửi Bác sĩ phụ trách (backend)` | `feat(booking): thêm thông báo tiếp đón cho Bác sĩ phụ trách (notification B6)` | 9 | DMS-09…DMS-12 Pass; `BCS-04` cập nhật; đột biến 22, 23 bị bắt |
| F1 | `[notification] F1 · Chuông thông báo, số chưa đọc và thăm dò ở khung vai trò (frontend)` | `feat(web): thêm chuông thông báo, thăm dò số chưa đọc và mục menu Thông báo (notification F1)` | 8 | WTB-01…WTB-05, WTB-16 Pass; ca `role-shell` và layout cũ không đổi; đóng TECH_DEBT 62 (nháp) |
| F2 | `[notification] F2 · Trang Trung tâm thông báo: danh sách, chi tiết, đánh dấu đã đọc (frontend)` | `feat(web): thêm trang Trung tâm thông báo cho Bệnh nhân, Lễ tân và Bác sĩ (notification F2)` | 8 | WTB-06…WTB-14, WTB-16, WTB-17 Pass; đột biến web bốn loại bị bắt |
| F3 | `[notification] F3 · Quản trị viên mở Trung tâm thông báo từ chuông và menu (frontend)` | `feat(web): bật chuông và mục Thông báo ở khung Quản trị viên (notification F3)` | 9 | WTB-15 Pass; ca `admin-layout` đã sửa tối thiểu |
| D1 | `[notification] D1 · Đồng bộ tài liệu repo sau khi có mã thông báo (docs)` | `docs(notification): đồng bộ PLAN, TRACKING và nợ kỹ thuật sau khi có mã thông báo (notification D1)` | 10 | Mọi ô PLAN này đã tick; PLAN booking, doctor, doctor-exam và `docs/TRACKING.md` khớp; nháp đóng TECH_DEBT 62, 186, Doctor B10 gửi Đại |
| X2 | `[notification] X2 · Đồng thời và bất biến của thông báo và nhắc lịch trên MySQL thật (backend)` | `test(notification): thêm bộ ca đồng thời và bất biến cho thông báo và nhắc lịch (notification X2)` | 9 | CTB-01…CTB-07, EMT-09 Pass một mình; 0 lần 503; IVN-01…IVN-05 xanh; ghi số 1213 và 1205 |
| X3 | `[notification] X3 · Kiểm tay bốn vai trò, đột biến lô, tổng kết scope thông báo (docs)` | `docs(notification): tổng kết kiểm tay và đột biến của scope thông báo (notification X3)` | 10 | KTB-01…KTB-12 Pass; 24 đột biến bị bắt; CI xanh; mục 10 đạt |

**Nhãn Epic:** `[notification] Epic · Thông báo (scope #10): Trung tâm thông báo, nhắc lịch, email theo sự kiện` (Epic gom 15 issue, hay 14 khi P2 đóng; không đóng khi chưa đạt mục 10).
## 7. Test case dự kiến

Loại: **U** đơn vị (không DB), **I** tích hợp trên MySQL thật (`*.int-spec.ts`), **E** e2e qua `AppModule` (`test:e2e`), **C** đồng thời (một mình), **W** giao diện (Vitest và happy-dom), **B** trình duyệt (kiểm tay). Mỗi test ghi mã ở tên ca (`it('TTB-01: …')`). Mọi ca đều có ca âm và ca biên; endpoint mới có ca đúng và sai tài khoản (không có "sai chi nhánh": thông báo là dữ liệu cá nhân, không có phạm vi chi nhánh). Ca đồng thời chạy MỘT mình, sau mỗi ca chạy IVN-01…IVN-05. Dữ liệu dựng bằng fixture (`notification/testing/`, `appointments/testing/`), mỗi ca tự truyền cấu hình (không số cứng của mã), đồng hồ giả cho mọi ca có giờ, và **chạy dưới cả `TZ=UTC` lẫn `TZ=Asia/Ho_Chi_Minh`** với ca có ngày giờ (nếp `reference_tz_dependent_int_spec`). **Mọi ca thư dùng `FakeMailService` hay `fake-smtp-server.ts`; không có ca nào gửi thư thật.** **Trạng thái: chưa chạy ca nào** (kế hoạch giai đoạn 1; mục "Kết quả test" ở TRACKING mục 2).

### 7.1 Trung tâm thông báo (TTB) — B2

| Mã | Loại | Điều kiện | Kết quả mong đợi | Truy vết |
|---|---|---|---|---|
| TTB-01 | I, E | tài khoản có 5 thông báo đọc lẫn chưa đọc, ghi ở các thời điểm khác nhau | `GET /notifications` trả `items` mới nhất trước, mỗi mục đủ 8 khoá `id, loai, nhom, tieuDe, noiDung, daDoc, thoiDiemTao, lienKet`; `total`, `page`, `pageSize`, `soChuaDoc` đúng; **không** `taiKhoanId`, `lichHenId`, `yeuCau…Id`, trạng thái thư | 2.4.59 b2 |
| TTB-02 | I | `trangThaiDoc` = `tat-ca` (mặc định), `chua-doc`, `da-doc`; giá trị lạ (`abc`, rỗng, `CHUA-DOC`) | ba giá trị lọc đúng; `total` theo bộ lọc nhưng `soChuaDoc` luôn là TỔNG chưa đọc; giá trị lạ ⇒ 400 `DU_LIEU_KHONG_HOP_LE` có `loi[{truong:'trangThaiDoc'}]` | 2.4.59 b2; MH6 |
| TTB-03 | I | phân trang biên: `pageSize` 20 (mặc định), 1, 100; 0, 101, âm, không phải số; `page` 0, âm, vượt trang cuối | 1 và 100 hợp lệ; ngoài miền ⇒ 400; trang vượt cuối ⇒ `items: []`, `total` đúng, không 500 | Q12 |
| TTB-04 | I, E | tài khoản chưa có thông báo nào | `items: []`, `total: 0`, `soChuaDoc: 0`, 200 (A1: danh sách trống, không lỗi) | 2.4.59 A1 |
| TTB-05 | I | hai tài khoản A và B, mỗi bên có thông báo | A chỉ thấy của A ở danh sách, `total` và `soChuaDoc`; B không thấy của A | 2.4.59 MT, HĐK |
| TTB-06 | I, E | `GET /notifications/:id` với id của B (A gọi), id không có, `abc`, `0`, `-1`, `1e3`, `01`, 21 chữ số | **cùng thân** `KHONG_TIM_THAY` 404 cho mọi ca (không phân biệt "của người khác" với "không có"); id đúng của A ⇒ 200 | 2.4.59 MT; admin Q40 |
| TTB-07 | I | `POST /:id/read`: id chưa đọc của A; gọi lần hai; id của B; id không có; spy câu SQL | lần đầu: đúng MỘT hàng đổi, trả `daDoc: true` và `soChuaDoc` giảm 1; lần hai 200 không đổi gì; id của B ⇒ 404 và hàng của B **không đổi**; id không có ⇒ 404 với **thân y hệt** ca id của B (không lộ sự tồn tại); câu `UPDATE` **có `tai_khoan_id` trong `WHERE`** và không có `SELECT` sở hữu chạy trước nó | 2.4.59 b4; Q11 |
| TTB-08 | I | `POST /read-all`: A có 1.200 chưa đọc (chia lô 500), B có 3 chưa đọc | `daDanhDau` = 1.200, `soChuaDoc` = 0; hàng của B nguyên; chạy lần hai ⇒ `daDanhDau` 0; không giữ giao dịch nào mở sau khi xong | 2.4.59 MT |
| TTB-09 | I | `GET /unread-count` sau chuỗi: thêm, đọc một, đọc tất cả, thêm | số đúng ở từng bước; 0 khi không có | 2.4.59 b2 |
| TTB-10 | I | `GET /:id` rồi `GET /unread-count` | chi tiết **không** tự đánh dấu đã đọc (đọc thuần); số chưa đọc không đổi | Q11 |
| TTB-11 | I, U | mã trong danh mục; mã có hậu tố `:v2`; mã **lạ** (không có trong danh mục); mã chữ hoa thường khác | tiêu đề, nhóm, kiểu liên kết theo danh mục (hậu tố tra bằng phần gốc, `loai` trả phần gốc); mã lạ ⇒ `tieuDe` "Thông báo", `nhom` mặc định, `lienKet` null, **không 500** | 2.4.68; MH7 |
| TTB-12 | I | thông báo có `lich_hen_id`; có `yeu_cau_thay_doi_chi_nhanh_id`; không gắn gì; loại `Vi`, `NghiPhep` | `lienKet = { kieu:'LichHen', maLichHen }` (mã, **không** id) khi có lịch; theo danh mục khi không; `null` nếu danh mục không có kiểu | patient Q13 |
| TTB-13 | I | 30 thông báo cùng một giây `thoi_diem_tao`, đọc qua hai trang | thứ tự ổn định nhờ `thong_bao_id DESC`; không lặp, không sót giữa trang 1 và trang 2 | R9 |
| TTB-14 | U | `noi_dung` 500 ký tự đủ, chứa `<script>`, `&`, `"`, tiếng Việt có dấu, ký tự đa byte | trả **nguyên văn** (không cắt, không thoát), chữ không bị hỏng | BDL |
| TTB-15 | E | `Cache-Control` ở mọi route, kể cả 400, 401, 404 | `no-store` | nếp `profile` |
| TTB-16 | I, E | gọi bằng tài khoản Bệnh nhân, Bác sĩ, Lễ tân, Quản trị viên Toàn hệ thống, Quản trị viên Chi nhánh | cả năm gọi được mọi route và chỉ thấy thông báo của chính mình | 2.4.59 TĐK |

### 7.2 Quyền và phạm vi (QTB) — B2

| Mã | Loại | Kịch bản | Kết quả mong đợi |
|---|---|---|---|
| QTB-01 | E | không có header `Authorization`, mọi route | 401 `CHUA_DANG_NHAP`, không dữ liệu |
| QTB-02 | E | token hết hạn hay bị sửa | 401 như trên; không 500 |
| QTB-03 | E | tài khoản A thử mọi route với id của B (đoán tuần tự id) | không bao giờ đọc hay đánh dấu được thông báo của B; hàng của B không đổi |
| QTB-04 | E | `?taiKhoanId=…` trong query hay thân; trường lạ ở thân `POST` | bị bỏ qua hay 400 theo `forbidNonWhitelisted`; không có tác dụng (nếp QP-05 patient); `@Roles` ghi rõ trên **từng** route (nếp QP-08) |
| QTB-05 | I, E | Quản trị viên Chi nhánh và Toàn hệ thống | không có `RequireAdminScope`; chỉ thấy thông báo của chính mình (không thấy thông báo của Quản trị viên khác dù cùng chi nhánh) |

### 7.3 Danh mục sự kiện và sự kiện mới (DMS) — B1, B6

| Mã | Loại | Kịch bản | Kết quả mong đợi | Truy vết |
|---|---|---|---|---|
| DMS-01 | U | mọi mã trong `BOOKING_NOTIFICATION_EVENTS`, `EXAM_NOTIFICATION_EVENTS`, `LEAVE_EVENTS`, `TOPUP_NOTIFICATION_EVENTS`, `WITHDRAWAL_NOTIFICATION_EVENTS`, `REFUND_NOTIFICATION_EVENTS`, `BRANCH_CHANGE_EVENTS` (phần gốc) | **có** trong danh mục; thiếu thì test đỏ và nêu mã thiếu | Q5 |
| DMS-02 | U | mọi mục danh mục có `trangThai = 'CoMa'` | có ở một tập hằng của module nguồn (không mã mồ côi); mục `ChoModule` được phép không có | Q5 |
| DMS-03 | U | tính duy nhất và dạng mã | không trùng nhau kể cả không phân biệt hoa thường (`utf8mb4_unicode_ci`); ≤ 100 ký tự kể cả `:v{n}`; PascalCase | quy tắc DB 28 |
| DMS-04 | U | tập `coThu = true` của danh mục so với `MAIL_EVENTS` của worker (phần gốc) | **bằng nhau** (hiện 13 loại; sau B4, B5: 17; cộng bốn loại đổi lịch của reschedule B3: 21) | 2.4.75 |
| DMS-05 | U | tiêu đề và nhóm | mỗi mục có tiêu đề không rỗng ≤ 60 ký tự, nhóm và kiểu liên kết thuộc tập biết; không ký tự điều khiển | Q15 |
| DMS-06 | U | tra cứu `baseEventOf` | `ThayDoiChiNhanhAnhHuongLichHen:v3` ra mục gốc; mã lạ ra `null` (người gọi dùng mặc định) | 2.4.68 A2 |
| DMS-07 | U | bốn hằng độ dài 500 (`wallet`, `doctor-exam`, `LEAVE_NOTIFICATION_MAX_LENGTH`, `THONG_BAO_MAX_LENGTH`) | bằng `NOTIFICATION_CONTENT_MAX` của danh mục và bằng cột `varchar(500)`; không sửa file của họ, chỉ so | L15 |
| DMS-08 | I | chạy notifier thật trên fixture (leave, topup `NapViCanXuLy`, withdrawal, refund, branch-change): vai trò của người nhận | khớp cột "người nhận" của danh mục (ví dụ `NapViCanXuLy` chỉ Quản trị viên Toàn hệ thống; `NghiPhepDaGui` chỉ Bác sĩ) | 2.4.68 b2 |
| DMS-09 | I | B6: `checkIn` thành công | đúng MỘT `thong_bao` `LichHenDaTiepDon` cho Bác sĩ `lich_hen.bac_si_id`, gắn `lich_hen_id`, cùng giao dịch, **không** `email_thong_bao`; lỗi ghi ⇒ hoàn tác cả lần tiếp đón; trùng UNIQUE ⇒ "đã có", không 500 | 2.4.32 b5; Q7 |
| DMS-10 | I | ba đường vào `checkIn`: Lễ tân đổi trạng thái, thu tiền mặt tại quầy, Quản trị viên override sang `DaTiepDon` | mỗi đường đúng một thông báo cho Bác sĩ; đường không qua `checkIn` (nếu có) ghi lệch vào TRACKING | MH4 |
| DMS-11 | I | Bác sĩ phụ trách `NgungHoatDong`; lịch của Bác sĩ khác chi nhánh với Lễ tân (đã bị chặn bởi phạm vi) | vẫn ghi thông báo (không chặn tiếp đón); ca ngoài phạm vi vẫn 404 như cũ, **không** ghi | 2.4.32 TĐK |
| DMS-12 | I | Vắng mặt, khôi phục `DaXacNhan`, huỷ, hoàn thành | **không** sinh `LichHenDaTiepDon`; các sự kiện cũ của booking không đổi (ca B12 cũ vẫn Pass) | Q7 |
| DMS-13 | U | mục `CHO_MODULE` (waitlist, chat, thanh toán cọc thất bại) và các mục `ChoModule` (đổi lịch) | test **đỏ** khi module thêm hằng mã mà danh mục chưa bỏ cờ `ChoModule`; ghi lời nhắc nơi sửa | L6 |

### 7.4 Email theo sự kiện (EMT) — B4, B5

| Mã | Loại | Kịch bản | Kết quả mong đợi | Truy vết |
|---|---|---|---|---|
| EMT-01 | I | B4: `complete` ca khám thành công | `ExamNotifier` ghi `thong_bao` `LichHenHoanThanh` **và** MỘT `email_thong_bao` `ChoGui` cùng giao dịch; chạy lại ("đã có" do UNIQUE) ⇒ không dòng thư thứ hai; lỗi ghi thư ⇒ hoàn tác cả `complete` | 2.4.68 b4; Q6 |
| EMT-02 | I | worker gửi thư hoàn thành (`FakeMailService`) | gửi đúng 1 thư tới email tài khoản đặt; dòng `DaGui`, `so_lan_thu` 1; thư có mã lịch, người được khám, bác sĩ, ngày giờ, chi nhánh và câu nhắc đánh giá bằng chữ; **không** `ly_do_kham`, SĐT; qua `renderMailShell` | 2.4.75 b1 đến b4 |
| EMT-03 | I | **sửa HDK-06**: worker GỬI loại hoàn thành; ca âm: loại lạ (không trong `MAIL_EVENTS`) vẫn bị bỏ qua | ca cũ "bỏ qua `LichHenHoanThanh`" thay bằng ca mới; ca âm giữ hành vi "không chọn, không gửi, không đổi" | L14 |
| EMT-04 | I | B5: `LeaveNotifier` cho ba loại gửi Bác sĩ và loại gửi Admin | `NghiPhepDaGui`, `NghiPhepDaDuyet`, `NghiPhepTuChoi`: `thong_bao` + một `email_thong_bao`; `NghiPhepChoDuyet`: `thong_bao`, **không** thư; lỗi ghi ⇒ hoàn tác cả yêu cầu nghỉ phép | Q6; doctor Q33 |
| EMT-05 | I, U | nội dung thư nghỉ phép | chỉ tên bác sĩ, khoảng ngày, ca (và lý do TỪ CHỐI của Admin nếu có, doctor B14); **không** `ly_do` xin nghỉ của Bác sĩ; dữ liệu qua `toSingleLine` rồi `escapeHtml` | doctor Q33 |
| EMT-06 | I | người nhận thư nghỉ phép | email của **Bác sĩ** (tài khoản của `thong_bao`), không phải Admin | 2.4.68 b2 |
| EMT-07 | I | thông báo nghỉ phép và hoàn thành ghi **trước** B4, B5 (không có dòng thư) | worker không tạo thư cho chúng; số dòng `email_thong_bao` không đổi; thông báo mới sau B4, B5 có thư | R7 |
| EMT-08 | I | gửi lỗi (`failNextWith`) cho loại mới; `NOT_CONFIGURED`; đồng hồ giả +4:59 và +5:00 | `ThatBai` + `loi_cuoi` = loại lỗi cố định (không `message`); thử lại tối đa 3 lần cách 5 phút; không thử ở +4:59; `NOT_CONFIGURED` trả hàng về đúng giá trị cũ, cả lượt dừng | 2.4.75 A1 |
| EMT-09 | C | hai worker (hai `EmailOutboxService`) cùng lúc cho loại mới, 40 vòng × 8 thư (MỘT mình) | mỗi thư đúng MỘT lần; 8 dòng `DaGui`, `so_lan_thu` 1; có tranh nhận việc thật; không 1213, không 1205 | 2.4.75 b4 |
| EMT-10 | U | mẫu thư với `<script>`, `&`, `"` trong tên bác sĩ, khoảng ngày, ghi chú | thoát đúng; không script, ảnh, font ngoài, liên kết, thẻ `style` | BDL-04 |
| EMT-11 | I | **không gửi thư thật**: mọi ca dùng fake; ca kiến trúc quét mã test | không file test nào tự tạo `nodemailer` hay đọc `.env`; `NODE_ENV=test` tắt `EmailOutboxJob` | AGENTS mục 3 |
| EMT-12 | I | loại chỉ trong ứng dụng (`NghiPhepChoDuyet`, `LichHenDaTiepDon`, `NapViThanhCong`, `RutTienDaGui`…) có dòng `thong_bao` | worker **không chọn**, không gửi, không đổi (mở rộng OBX-06) | 2.4.68 HĐK |
| EMT-13 | U | `MAIL_EVENTS` sau B4, B5 | thêm đúng 4 loại (`LichHenHoanThanh`, ba `NghiPhep…`) so với bản trước; không loại nào bị mất | DMS-04 |

### 7.5 Nhắc lịch (NLH) — B3

| Mã | Loại | Kịch bản | Kết quả mong đợi | Truy vết |
|---|---|---|---|---|
| NLH-01 | I | lịch `DaXacNhan`, mốc 24 giờ vừa đạt (`now` = `thoi_gian` − 24 giờ + 1 phút), `run(now)` | tạo MỘT dòng `(lich_hen_id, 24)`; gửi MỘT thư tới email tài khoản ĐẶT; dòng `DaGui`, `da_gui_luc` có, `so_lan_thu` 1 | 2.4.69 b1 đến b4 |
| NLH-02 | I | mốc 72, 24, 2 của cùng một lịch ở ba thời điểm | ba dòng, ba thư, mỗi mốc một lần; chạy lại từng thời điểm không gửi thêm | 2.4.69 b4 |
| NLH-03 | U | biên mốc: `now` = mốc − 1 giây; = mốc; = mốc + 1 giây | trước mốc: không dòng; **đúng mốc: có** (đóng); sau mốc: có (trong cửa sổ) | 2.4.69 b1 |
| NLH-04 | U | biên cửa sổ trễ: `now` = mốc + 10 phút; mốc + 10 phút + 1 giây | +10 phút: gửi (đóng); +10 phút 1 giây: **không** dòng, không thư (bỏ lặng lẽ) | Q2 |
| NLH-05 | I | A3: lịch được tạo lúc còn 20 giờ với mốc 72, 24, 2 | hai mốc 72 và 24 không dòng, không thư; mốc 2 giờ gửi khi tới | 2.4.69 A3; Q2 |
| NLH-06 | I | `run(now)` hai lần liên tiếp với cùng `now` | một dòng, một thư; lần hai đếm "đã có" (1062 hay `ROW_COUNT` theo M4), không lỗi | 2.4.69 b4 |
| NLH-07 | C | hai `AppointmentReminderService` (hai tiến trình) cùng quét một mốc | đúng MỘT thư (một bên nhận việc `affectedRows` 1, bên kia `lostClaim`) | 2.4.69 b3 |
| NLH-08 | I | lịch ở `ChoThanhToan`, `DaTiepDon`, `HoanThanh`, `DaHuy`, `DaDoiLich`, `VangMat`; lịch `DaXacNhan` đã qua giờ hẹn (`thoi_gian ≤ now`) | không dòng, không thư | 2.4.69 TĐK, A2 |
| NLH-09 | I | A2: lịch bị huỷ giữa hai mốc; lịch đổi: cũ `DaDoiLich` + mới `DaXacNhan` có `lich_hen_truoc_id` (dựng bằng SQL) | mốc kế của lịch huỷ không gửi; lịch cũ không nhắc, lịch mới nhắc theo **giờ mới** với bộ mốc riêng | 2.4.69 A2; quy tắc 41 |
| NLH-10 | I | A1: gửi lỗi ở lần 1 (`failNextWith`); +4:59; +5:00; thành công ở lần 2 | lần 1: `ThatBai`, `loi_cuoi` = loại cố định (không `message`), `so_lan_thu` 1; không thử lúc +4:59; lúc +5:00 gửi lại, `DaGui`, `so_lan_thu` 2 | 2.4.69 A1 3b; Q3 |
| NLH-11 | I | lỗi cả 3 lần | `ThatBai`, `so_lan_thu` = 3; lần chạy sau **không** chọn dù lịch còn hiệu lực; **không** gửi bù mốc khác | 2.4.69 A1 3c; Q3 |
| NLH-12 | I | mốc `ThatBai` rồi lịch bị huỷ; hay lịch qua giờ hẹn; hay dòng `ChoGui` mà lịch đã huỷ | không thử lại `ThatBai`; dòng `ChoGui` được **đóng** thành `ThatBai` với `loi_cuoi` = `LICH_KHONG_CON_HIEU_LUC`, **không** gửi | 2.4.69 A1 3b, 3c |
| NLH-13 | I | dòng `ChoGui` mồ côi (đã nhận việc, `so_lan_thu` 1, `lan_thu_cuoi_luc` > 5 phút trước); chưa quá 5 phút | quá 5 phút: được chọn lại (gửi ít nhất một lần); chưa quá: **không** chọn (tránh gửi trùng) | R6 |
| NLH-14 | I | `NOT_CONFIGURED` (chưa có SMTP) | dòng về đúng giá trị cũ (`so_lan_thu`, `lan_thu_cuoi_luc`, `trang_thai`), cả lượt dừng, không tính lần thử | nếp OBX |
| NLH-15 | I | không có dòng cấu hình; đổi mảng giữa chừng `[72,24,2]` → `[48,12]` | không dòng cấu hình ⇒ không gửi, một dòng log cảnh báo, không số ngầm; đổi mảng: dòng cũ giữ, hàng chờ thử lại vẫn được thử, mốc mới tính theo giờ mới | quy tắc 35, 41 |
| NLH-16 | I | mốc 24 ở vị trí thứ 2 của mảng | `so_gio_truoc` ghi **24** (số giờ), không phải 2 (vị trí) | 2.4.69 b4; quy tắc 41 |
| NLH-17 | I | nội dung thư; lịch của hồ sơ người thân | chỉ tài khoản ĐẶT nhận; thư ghi "Người được khám: {tên} (đặt hộ)"; thư ghi **thời gian hẹn CỤ THỂ dạng `HH:mm ngày dd/MM`** (ví dụ "14:30 ngày 02/12") ở tiêu đề và câu chính, kèm hàng "Ngày giờ" đầy đủ (`formatAppointmentTime`) theo giờ Việt Nam; "sau khoảng {mốc} giờ nữa" chỉ là phần phụ và thư **không** chỉ ghi thời gian còn lại; **không** `ly_do_kham`, SĐT, `ly_do_huy`; qua `renderMailShell`; không liên kết; đủ bác sĩ, chi nhánh, lưu ý đến trước giờ hẹn | 2.4.69 b2; MH5; Q15 |
| NLH-18 | I | sau một lượt gửi thành công | **không** dòng `thong_bao` và **không** dòng `email_thong_bao` mới (chỉ `nhac_lich_hen`) | 2.4.75 b4; IVN-04 |
| NLH-19 | U | hằng | 10 phút, 3 lần, 5 phút nằm MỘT chỗ (`reminder.constants.ts`), không đọc từ cấu hình hay `.env` | quy tắc 41 |
| NLH-20 | I | lịch 00:30 và 23:30; mốc 72 giờ qua nửa đêm; chạy dưới `TZ=UTC` và `TZ=Asia/Ho_Chi_Minh` | cùng kết quả ở hai múi giờ; không lệch ngày | AGENTS mục 3 |
| NLH-21 | I | 1.000 lịch cùng mốc; lô 100, tối đa 10 lô | một lượt xử lý đủ 1.000 (hết trần lô thì `more = true`); lượt sau nhặt phần còn lại; không mốc nào gửi hai lần | M7 |
| NLH-22 | I | vỏ job | `run` không bao giờ ném (lỗi DB nuốt, log loại lỗi cố định); chạy chồng cùng tiến trình bị bỏ qua; tắt ở `NODE_ENV=test`; `run` chỉ nhận `now` khi là `Date` | nếp `HoldExpiryJob` |
| NLH-23 | I | `thoi_diem_nhac_lich` là mảng rỗng (nhập tay, DB chấp nhận) | không nhắc mốc mới, không lỗi; dòng đang chờ thử lại vẫn được xử lý | L13 |

### 7.6 Migration và schema (MTB) — P1, P2

| Mã | Loại | Kịch bản | Kết quả mong đợi |
|---|---|---|---|
| MTB-01 | I | `up` rồi so với DDL | bảng `nhac_lich_hen` khớp **nguyên văn** `clinix_mysql.sql` (`schema-parity`: văn bản và `SHOW CREATE TABLE`) |
| MTB-02 | I | `up`, `down`, `up` | `down` xoá bảng; schema trở về trước; chạy lại được |
| MTB-03 | I | chèn trùng `(lich_hen_id, so_gio_truoc)` | lỗi 1062 trên khoá chính |
| MTB-04 | I | `chk_nhac_lich_hen_moc`: `so_gio_truoc` = 0, âm, 1 | 0 và âm bị từ chối; 1 hợp lệ |
| MTB-05 | I | `chk_nhac_lich_hen_ket_qua`: `DaGui` thiếu `da_gui_luc` hay `so_lan_thu` 0; `ThatBai` thiếu `loi_cuoi` hay có `da_gui_luc`; `ChoGui` có `da_gui_luc`; ba trạng thái hợp lệ | các tổ hợp sai bị từ chối; hợp lệ qua |
| MTB-06 | I | khoá ngoại `lich_hen_id`: lịch không tồn tại; xoá `lich_hen` còn dòng nhắc | 1452 và 1451 |
| MTB-07 | U | entity `NhacLichHen` | khoá chính kép đúng, kiểu `bigint` là chuỗi, `loi_cuoi` `varchar(500)`, enum khớp DB, tên theo AGENTS mục 4 |
| MTB-08 | I | chỉ mục `nhac_lich_hen_index_trang_thai` | có đúng hai cột `(trang_thai, lan_thu_cuoi_luc)` theo thứ tự |
| MTB-09 | I | migration chạy trên DB đã có dữ liệu cũ (`thong_bao`, `email_thong_bao`, `lich_hen`) | không đổi dòng nào của bảng khác |
| MTB-10 | I | (P2, nếu làm) chỉ mục mới | khớp ba file `docs/database/*` và entity; `EXPLAIN` trước và sau ghi ở TRACKING |
| MTB-11 | U | thứ tự mốc ở `migrations/index.ts` | tăng dần; mốc P1 lớn hơn migration cuối của `main` lúc merge (kể cả reschedule P1 nếu đã merge) |

### 7.7 Hợp đồng và cổng (HTB)

| Mã | Loại | Kịch bản | Kết quả mong đợi | Task |
|---|---|---|---|---|
| HTB-01 | E | hợp đồng danh sách và chi tiết | đúng tập khoá ở 5.4; `lienKet` đúng từng `kieu`; không khoá thừa | B2 |
| HTB-02 | E | hợp đồng lỗi | 400, 401, 404 dùng **mã chung** (`DU_LIEU_KHONG_HOP_LE`, `CHUA_DANG_NHAP`, `KHONG_TIM_THAY`); không mã riêng mới; không `message` tự do | B2 |
| HTB-03 | U | định dạng thời gian | `thoiDiemTao` là `toISOString()` (UTC); web đổi sang giờ Việt Nam (cặp với WTB-06) | B2 |
| HTB-04 | I | notifier **thật** của booking, doctor-exam, doctor, payment, wallet (hoàn cọc, rút tiền), admin ghi dòng thật; rồi đọc bằng API | mỗi dòng ra đúng `tieuDe`, `nhom`, `lienKet` theo danh mục (chạy chéo module, không dùng mock) | B2 |
| HTB-05 | E | `AppModule` dựng với `NotificationCenterModule` và `ReminderModule` | dựng được; `ScheduleModule.forRoot()` vẫn đúng một lần; job nhắc lịch đăng ký đúng một tên (`notification-appointment-reminder`) và tắt ở `NODE_ENV=test` | B2, B3 |
| HTB-06 | U | kiến trúc | `INSERT` và `UPDATE nhac_lich_hen` chỉ ở `notification/reminders/reminder.query.ts`; ở `notification/center/` chỉ `UPDATE thong_bao SET trang_thai_doc` (không `INSERT`, không `DELETE`) | B1, B3 |
| HTB-07 | U | chiều phụ thuộc | mã chạy của `appointments/` **không** import `notification/`; `notification/catalog/` **không** import module khác lúc chạy (chỉ ở file spec) | B1 |

### 7.8 Bảo mật dữ liệu và log (BTB)

| Mã | Loại | Kịch bản | Kết quả mong đợi | Task |
|---|---|---|---|---|
| BTB-01 | I | log của job nhắc lịch và API Trung tâm (thành công và lỗi) | chỉ số lượng, id nội bộ và tên lớp hay loại lỗi cố định; **không** email, họ tên, `noi_dung`, `error.message` | B3, B2 |
| BTB-02 | E | thân phản hồi | danh sách trắng; không email, SĐT, `tai_khoan_id` | B2 |
| BTB-03 | E | `Cache-Control: no-store` | mọi route (= TTB-15) | B2 |
| BTB-04 | U, W | `noi_dung` chứa `<script>`, `&`, dấu nháy | API trả nguyên văn; web hiển thị dạng chữ, không `dangerouslySetInnerHTML` (cặp WTB-12) | B2, F2 |
| BTB-05 | U | quét `notification/` | mọi câu SQL tham số hoá, không nối chuỗi giá trị; không `SELECT *` | B2, B3 |
| BTB-06 | I | thư nhắc lịch và thư hoàn thành | không `ly_do_kham`, `ly_do_huy`, `so_dien_thoai`; quét câu SQL ngữ cảnh | B3, B4 |
| BTB-07 | I | `nhac_lich_hen.loi_cuoi` | là loại lỗi cố định (`MailSendError.kind`, `LICH_KHONG_CON_HIEU_LUC`), không chứa địa chỉ hay chữ của máy chủ SMTP | B3 |

### 7.9 Đồng thời (CTB) — X2 (chạy MỘT mình; ghi số vòng và số 1213/1205/503)

| Mã | Loại | Kịch bản | Kết quả mong đợi |
|---|---|---|---|
| CTB-01 | C | hai worker nhắc lịch cùng mốc, 40 vòng × 8 lịch | mỗi mốc đúng MỘT thư; 8 dòng `DaGui` `so_lan_thu` 1; có tranh nhận việc thật; không 1213, không 1205 |
| CTB-02 | C | `read-all` đồng thời với giao dịch booking `INSERT thong_bao` cùng tài khoản, 300 vòng | 0 lần 1213 và 1205; mỗi `INSERT` chờ ≤ 100 ms; không mất thông báo mới (dòng mới chưa đọc nếu ghi sau lô) |
| CTB-03 | C | hai `POST /:id/read` cùng lúc cùng id | cả hai 200; hàng đã đọc; `soChuaDoc` đúng, không âm |
| CTB-04 | C | hai `POST /read-all` cùng lúc | tổng `daDanhDau` của hai bên = số chưa đọc ban đầu; `soChuaDoc` cuối = 0 |
| CTB-05 | C | `read` và `read-all` xen kẽ với `INSERT thong_bao` (booking, wallet) | 0 lần 1213; IVN-05 đúng sau mỗi vòng |
| CTB-06 | C | hai `checkIn` cùng lúc cùng lịch (Lễ tân bấm đúp, hay Lễ tân và thu tiền mặt) | đúng MỘT `thong_bao` `LichHenDaTiepDon`; không 500; lịch `DaTiepDon` đúng một lần |
| CTB-07 | C | job nhắc lịch × huỷ lịch cùng lúc cùng mốc | lịch huỷ trước nhận việc ⇒ không thư (đóng `ThatBai` `LICH_KHONG_CON_HIEU_LUC`); huỷ sau nhận việc ⇒ thư có thể đã đi (chấp nhận, ghi); không bao giờ hai thư |

### 7.10 Giao diện (WTB) — mức GỌN; đột biến web bốn loại (kho trình duyệt/URL/log, bấm đúp, tính toán ở client, chặn theo trạng thái)

| Mã | Task | Kịch bản | Kết quả mong đợi |
|---|---|---|---|
| WTB-01 | F1 | chuông ở khung Bệnh nhân, Lễ tân, Bác sĩ | hiện số chưa đọc (`99+` khi quá 99, ẩn số khi 0); nhãn truy cập "Thông báo, N chưa đọc"; là liên kết tới trang Thông báo |
| WTB-02 | F1 | thăm dò | gọi mỗi 30 giây khi tab hiện; **tạm dừng** khi tab ẩn, gọi ngay khi hiện lại hay focus; không chồng lời gọi; dọn timer và listener khi gỡ |
| WTB-03 | F1 | số tăng | vùng `aria-live="polite"` đọc "Bạn có thông báo mới"; trang danh sách đang mở tải lại trang 1; số giảm chỉ cập nhật số |
| WTB-04 | F1 | lỗi thăm dò: mạng, 5xx, quá giờ, 401 | giữ số cũ, không hộp lỗi, thử lại ở nhịp sau; 401 do lớp client xử lý, không vòng lặp |
| WTB-05 | F1 | menu và route | mục "Thông báo" của ba khung có `to` và số đếm (không còn nút vô hiệu); route `/benh-nhan/thong-bao`, `/le-tan/thong-bao`, `/bac-si-portal/thong-bao`, `/admin/thong-bao` đúng; ca menu cũ không đổi |
| WTB-06 | F2 | danh sách | mới nhất trước; hàng chưa đọc có chấm, chữ đậm, `aria-label`; thời gian tương đối và tuyệt đối theo giờ Việt Nam; ba tab và URL giữ `loc`, `trang` |
| WTB-07 | F2 | phân trang và bộ lọc | đổi bộ lọc về trang 1; trang vượt cuối quay về trang cuối hay hiện rỗng có lối quay lại |
| WTB-08 | F2 | mở chi tiết | panel hiện nội dung đầy đủ dạng chữ; gọi `POST read` **đúng một lần** (bấm đúp và `StrictMode` không gọi hai lần); thất bại ⇒ vẫn xem được, hiện nhắc nhỏ |
| WTB-09 | F2 | "Đánh dấu tất cả đã đọc" | khoá khi đang gửi (bấm đúp một lần); thành công ⇒ số về 0; vô hiệu khi không còn chưa đọc |
| WTB-10 | F2 | trạng thái | khung giữ chỗ khi tải; câu rỗng riêng từng tab; lỗi có "Thử lại"; mất mạng (banner); quá giờ |
| WTB-11 | F2 | liên kết theo vai trò | bảng (kiểu, vai trò) ⇒ đường dẫn đúng (từ `shared/routes`); không có đích ⇒ không nút; đích 404 do trang đích xử lý |
| WTB-12 | F2 | kiến trúc | không `fetch` ngoài lớp client; đường dẫn từ `shared/routes`; không `dangerouslySetInnerHTML` (nội dung có `<b>` hiện nguyên chữ) |
| WTB-13 | F2 | bàn phím và trình đọc màn hình | Tab, Enter hay Space chọn hàng; Esc đóng panel dạng ngăn; tiêu điểm về hàng vừa mở; nhãn đủ |
| WTB-14 | F2 | màn hẹp (dưới 1024 px, 375 px) | danh sách và chi tiết là hai màn có nút "Quay lại"; không tràn ngang |
| WTB-15 | F3 | khung Quản trị viên | nút chuông `AdminHeader` hết `disabled`, là liên kết có số đếm; mục sidebar "Thông báo" có `to`; cả hai phạm vi; ca `admin-layout` cũ sửa tối thiểu |
| WTB-16 | F1, F2 | kiến trúc | `features/patient`, `features/doctor`, `features/admin` không import chéo `features/notification` ngoài `index.ts` (các `architecture.test.ts` hiện có xanh) |
| WTB-17 | F2 | đột biến web | bốn loại bị bắt: kho trình duyệt hay URL (không giữ thông báo ở `localStorage`), bấm đúp, tính toán ở client (không đếm chưa đọc bằng cách đếm danh sách đang hiện), chặn theo trạng thái (nút vô hiệu đúng lúc) |

### 7.11 Kiểm tay trình duyệt (KTB) — X3 (bốn vai trò; 125 phần trăm và 375 px; không dùng DB `clinix` khi chưa được Đại đồng ý; dùng hộp thư giả, không SMTP thật)

KTB-01 Bệnh nhân đặt lịch ở một cửa sổ, cửa sổ kia (Bệnh nhân) thấy chuông tăng trong 30 giây không cần tải lại; KTB-02 mở thông báo: số giảm, hàng hết đậm; KTB-03 "Đánh dấu tất cả đã đọc"; KTB-04 Lễ tân tiếp đón ⇒ Bác sĩ nhận `LichHenDaTiepDon`; KTB-05 Bác sĩ hoàn thành ca khám ⇒ Bệnh nhân nhận thông báo và thư (hộp thư giả); KTB-06 Bác sĩ gửi yêu cầu nghỉ phép ⇒ Bác sĩ nhận thông báo và thư, Quản trị viên nhận thông báo (không thư), duyệt rồi từ chối cho đủ ba thư; KTB-07 nhắc lịch: lịch cách giờ hẹn khoảng 2 giờ 5 phút với mốc 2 giờ ⇒ thư nhắc tới hộp thư giả đúng một lần; KTB-08 Admin Toàn hệ thống và Chi nhánh thấy đúng thông báo của mình; KTB-09 hết phiên đăng nhập khi đang thăm dò; KTB-10 125 phần trăm và 375 px; KTB-11 mất mạng rồi có mạng lại (chuông tiếp tục); KTB-12 bàn phím và tiêu điểm ở trang, panel. Mỗi ca ghi kết quả thật vào TRACKING mục 2.

## 8. Đề xuất gom cụm (chỉ đề xuất — nhóm chốt)

Hai cụm giao được: **Cụm 1 = S1 + S2 + S3 (P1, X1, B1, B2, F1, F2, F3, B3: 43 giờ)** cho Trung tâm thông báo bốn vai trò và nhắc lịch (không chờ reschedule B3); **Cụm 2 = S4 + S5 (B4, B5, B6, D1, X2, X3: 26 giờ, cộng P2 3 giờ nếu cần)** cho thư mới, sự kiện tiếp đón và hoàn tất (chờ reschedule B3). Nếu cần giao sớm hơn, Cụm 1 đủ cho 2.4.59 và 2.4.69 và một phần 2.4.68; đủ bốn use case cần cả hai cụm.

## 9. Quy trình bắt buộc cho mỗi PR của scope

Theo `AGENTS.md` mục 5 và `CONTRIBUTING.md`: nhánh `feat/notification-…` do người dùng tạo, không làm trên `main`; viết test theo mã test case rồi code; chạy `lint`, `build`, `test` (và `test:int`, `test:e2e` cho task ĐẦY ĐỦ) ở máy và báo kết quả **thật**; task `[ĐỒNG BỘ TL]` sửa tài liệu trong **cùng PR**; cập nhật `docs/features/notification/TRACKING.md` (ngày, việc, mã test case, pass hay fail, vấn đề) và tick ô tương ứng ở PLAN này; cấu hình mới vào `.env.example` (scope này không có); lối tắt kỹ thuật vào `docs/TECH_DEBT.md` (Đại ghi); `AI_USAGE_LOG.md`: người dùng ghi một dòng cho mỗi lần dùng AI; **không** `git add`, `commit`, `push` do AI; tiêu đề PR là commit cuối (squash), Conventional Commits, scope `notification` (hạ tầng: `db`, `web`, `api`; module khác bị chạm: `booking`), ≤ 100 ký tự; PR cần người còn lại approve (Đại) và CI xanh (bảy check bắt buộc). Chạy lệnh đột biến ở lane nặng khi phiên kiểm báo "RẢNH". **Không đọc, in hay chép `.env` thật; test không gửi thư thật.**

## 10. Điều kiện hoàn thành scope

- [ ] Bốn use case chạy đúng trên MySQL thật: 2.4.59 (danh sách, chi tiết, đánh dấu một và tất cả, số chưa đọc, thăm dò ở bốn vai trò, A1), 2.4.68 (danh mục khớp mã; thư hoàn thành, nghỉ phép; tiếp đón), 2.4.69 (mọi bước và A1, A2, A3), 2.4.75 (loại mới qua worker; không gửi trùng; không thư thật).
- [ ] Mọi mã test case ở mục 7 đã chạy hoặc ghi rõ lý do hoãn ở TRACKING mục 2 (KTB kiểm tay có kết quả thật).
- [ ] IVN-01…IVN-05 xanh sau mọi ca đồng thời; 0 lần 503; số 1213 và 1205 được ghi ở CTB-02.
- [ ] 24 đột biến ở 5.12 đều bị ít nhất một ca bắt.
- [ ] M1 đến M7 có số đo thật và kết luận (P2 làm hay đóng); tiêu chí không đổi sau khi thấy số.
- [ ] Không còn thẻ `[CHỜ …]` trong PLAN này (trừ `[CHỜ waitlist]`, `[CHỜ chat]` chừa chỗ), không còn `[cần điền]` chặn mã.
- [ ] Danh mục khớp mã (DMS xanh); `MAIL_EVENTS` khớp danh mục; HDK-06 đã sửa; nháp đóng TECH_DEBT 62, 186, mục Doctor B10 (và 90 nếu P2 làm) gửi Đại; D2 (Word) do Đại báo xong.
- [ ] Ba file `docs/database/*` khớp migration (P1 không đổi DDL; P2 nếu có); PLAN booking, doctor, doctor-exam, `docs/TRACKING.md` đã đồng bộ ở D1.
- [ ] CI xanh (bảy check), jscpd ≤ 3% (CI đo), 0 lỗi lint.
## Phụ lục A. Nguyên văn 2.4.59, 2.4.68, 2.4.69, 2.4.75 (sao chép bằng script từ `2.4_Dac_Ta_Use_Case_CLINIX.docx`, không diễn giải)

Nguồn: `D:\du_lieu\TLCN_CLINIX\2.4_Dac_Ta_Use_Case_CLINIX.docx` (file gốc, 76 use case), đọc bằng `python-docx` ngày 24/11/2026; mỗi ô Word được tách dòng tại chỗ xuống dòng của ô. Dự án không dùng Use Case ID. Chữ trong ngoặc vuông `[đề xuất]`, `[cần điền]` là của tài liệu gốc. **Đối chiếu với `Drive_Hien_Tai\2.4_Dac_Ta_Use_Case_CLINIX.docx`:** 2.4.59 ở đây là 2.4.56 ở đó và **khớp nguyên văn 17 trên 17 câu**; ba use case hệ thống 2.4.68, 2.4.69, 2.4.75 không có số riêng ở bản Drive mà nằm ở bước (6) đến (13) và luồng A2 đến A6 của 2.4.56, câu chữ viết lại; **không phát hiện khác biệt về ý** (mục 3.3 L1).

### 2.4.59. Use case Trung tâm thông báo

**Mô tả.** Cho phép người dùng đã đăng nhập xem danh sách, chi tiết, đánh dấu đã đọc thông báo của tài khoản mình; hiển thị số lượng chưa đọc và thông báo tức thời trong ứng dụng (không phải thông báo đẩy trên thiết bị di động). Chỉ truy cập thông báo của chính mình.

**Tác nhân kích hoạt.** Bệnh nhân, Bác sĩ, Lễ tân, Quản trị viên.

**Tiền điều kiện.** Đã đăng nhập (bất kỳ vai trò nào trong 4 vai trò trên).

**Hậu điều kiện.**
- Thành công: Người dùng xem được danh sách/chi tiết thông báo của mình; thông báo được đánh dấu đã đọc nếu chọn.
- Thất bại: Không áp dụng (use case chủ yếu chỉ đọc, trừ hành động đánh dấu đã đọc).

**Các bước thực hiện.**
- (1) Người dùng mở Trung tâm thông báo.
- (2) Hệ thống hiển thị danh sách thông báo của tài khoản mình (mới nhất trước), kèm số lượng chưa đọc.
- (3) Người dùng chọn một thông báo để xem chi tiết.
- (4) Hệ thống hiển thị nội dung chi tiết, tự động đánh dấu đã đọc.
- (5) Thông báo mới phát sinh trong lúc người dùng đang hoạt động được hiển thị ngay vào danh sách trong ứng dụng (đẩy tức thời trong ứng dụng; không phải thông báo đẩy trên thiết bị di động).

**Luồng thay thế.**
- A1. Không có thông báo nào
- 2a. Hệ thống không tìm thấy thông báo nào của tài khoản.
- 2b. Hệ thống hiển thị danh sách trống.

### 2.4.68. Use case Gửi thông báo theo sự kiện nghiệp vụ

**Mô tả.** Gửi thông báo (trong ứng dụng và email) khi có các sự kiện nghiệp vụ: xác nhận đặt lịch; huỷ, đổi lịch, hoàn thành; thanh toán thất bại; hoàn tiền xong; kết quả yêu cầu rút tiền; đánh dấu vắng mặt; khoá do no-show; gửi lời mời và kết quả waitlist; nghỉ phép; thay đổi lịch hoạt động hoặc dịch vụ khả dụng của chi nhánh đã được duyệt và sắp có hiệu lực, ảnh hưởng lịch hẹn của bệnh nhân (gửi cho từng bệnh nhân bị ảnh hưởng, trước thời điểm có hiệu lực); kết quả yêu cầu thay đổi chi nhánh cho người đề xuất. Hai kênh: thông báo trong ứng dụng và email; "đẩy tức thời" chỉ là việc hiển thị ngay thông báo trong ứng dụng cho phiên đang hoạt động, không phải thông báo đẩy trên thiết bị di động.

**Tác nhân kích hoạt.** Hệ thống (kích hoạt bởi các use case nghiệp vụ khác khi sự kiện xảy ra).

**Tiền điều kiện.** Một sự kiện nghiệp vụ thuộc danh sách được định nghĩa vừa xảy ra (đặt lịch, huỷ, đổi lịch, hoàn thành, thanh toán thất bại, hoàn tiền, kết quả yêu cầu rút tiền, đánh dấu vắng mặt, khoá no-show, waitlist, nghỉ phép; thay đổi lịch hoạt động/dịch vụ khả dụng của chi nhánh đã duyệt và sắp có hiệu lực; kết quả yêu cầu thay đổi chi nhánh).

**Hậu điều kiện.**
- Thành công: Thông báo trong ứng dụng được tạo cho (các) tài khoản liên quan; đồng thời một email tương ứng được gửi qua Dịch vụ Email (use case "Gửi email thông báo theo sự kiện").
- Thất bại (gửi email lỗi): Thông báo trong ứng dụng vẫn được tạo; việc gửi email được ghi nhận thất bại, không chặn luồng nghiệp vụ chính đã kích hoạt sự kiện. Email có thể được gửi lại; mỗi thông báo có tối đa một email đã gửi.

**Các bước thực hiện.**
- (1) Một use case nghiệp vụ khác kích hoạt sự kiện (ví dụ: đặt lịch thành công).
- (2) Hệ thống xác định (các) tài khoản liên quan cần nhận thông báo.
- (3) Hệ thống tạo thông báo trong ứng dụng cho (các) tài khoản đó.
- (4) Hệ thống ghi nhận một bản ghi email cho thông báo đó (trạng thái chờ gửi) rồi gửi email tương ứng qua Dịch vụ Email (use case "Gửi email thông báo theo sự kiện").
- (5) Hệ thống cập nhật số lượng thông báo chưa đọc, hiển thị ngay thông báo trong ứng dụng nếu tài khoản đang hoạt động trên hệ thống (đẩy tức thời trong ứng dụng; không phải thông báo đẩy trên thiết bị di động).

**Luồng thay thế.**
- A1. Gửi email thất bại
- 4a. Dịch vụ Email gặp lỗi hoặc không phản hồi.
- 4b. Hệ thống ghi nhận gửi email thất bại kèm lỗi; thông báo trong ứng dụng vẫn giữ nguyên đã tạo; không chặn hay hoàn tác sự kiện nghiệp vụ gốc (ví dụ yêu cầu thay đổi chi nhánh đã duyệt vẫn giữ trạng thái Đã duyệt); email được gửi lại sau theo use case "Gửi email thông báo theo sự kiện" mà không gửi trùng — use case kết thúc.
- A2. Một sự kiện làm nhiều lịch hẹn của nhiều bệnh nhân bị ảnh hưởng (thay đổi chi nhánh)
- 2a. Thay đổi lịch hoạt động hoặc dịch vụ khả dụng của chi nhánh đã duyệt ảnh hưởng nhiều lịch hẹn, có thể nhiều lịch của cùng một bệnh nhân (kể cả lịch cho hồ sơ người thân).
- 2b. Hệ thống tạo một thông báo cho mỗi bệnh nhân đặt lịch (gom các lịch hẹn của họ), không tạo thông báo cho bệnh nhân không bị ảnh hưởng; chạy lại sự kiện không tạo thông báo trùng.
- 2c. Thông báo được tạo trước thời điểm có hiệu lực của thay đổi, cách thời điểm đó ít nhất số ngày thông báo trước đã cấu hình.

### 2.4.69. Use case Gửi nhắc lịch hẹn theo lịch trình

**Mô tả.** Tự tính thời điểm gửi nhắc lịch theo cấu hình (ví dụ trước 72, 24, 2 giờ), gửi qua email, không kèm phản hồi nhanh. Chạy theo lịch, dùng chung cơ chế lập lịch với hết hạn giữ chỗ và hết hạn lời mời.

**Tác nhân kích hoạt.** Hệ thống (chạy theo lịch trình định kỳ).

**Tiền điều kiện.** Có lịch hẹn Đã xác nhận sắp tới, đạt một trong các mốc thời gian nhắc đã cấu hình (ví dụ trước 72/24/2 giờ, do Quản trị viên cấu hình).

**Hậu điều kiện.**
- Thành công: Email nhắc lịch được gửi tới bệnh nhân liên quan qua Dịch vụ Email (use case "Gửi email thông báo theo sự kiện").
- Thất bại: Không gửi được email (lỗi Dịch vụ Email); hệ thống ghi nhận lỗi, không ảnh hưởng trạng thái lịch hẹn.

**Các bước thực hiện.**
- (1) Hệ thống định kỳ quét các lịch hẹn Đã xác nhận sắp tới, xác định lịch hẹn nào vừa đạt một mốc nhắc đã cấu hình.
- (2) Hệ thống soạn nội dung nhắc lịch (thông tin lịch hẹn, thời gian còn lại).
- (3) Hệ thống nhận việc gửi cho mốc đó (chỉ một tiến trình nhận được, nên không gửi trùng khi có nhiều tiến trình cùng quét) rồi gửi email nhắc lịch qua Dịch vụ Email.
- (4) Hệ thống ghi nhận kết quả riêng cho từng cặp (lịch hẹn, mốc nhắc) — chờ gửi, đã gửi hoặc thất bại kèm lỗi và số lần thử; mốc được xác định theo chính số giờ đã cấu hình (ví dụ 72, 24, 2) nên đổi cấu hình không làm lệch lịch sử và một mốc của một lịch hẹn không bao giờ được gửi hai lần.

**Luồng thay thế.**
- A1. Gửi email thất bại
- 3a. Dịch vụ Email gặp lỗi hoặc không phản hồi.
- 3b. Hệ thống ghi nhận mốc đó thất bại kèm lỗi và số lần thử, tự động thử lại tối đa 3 lần, cách nhau 5 phút mỗi lần; chỉ thử lại khi lịch hẹn vẫn Đã xác nhận và chưa tới giờ hẹn.
- 3c. Nếu hết 3 lần vẫn lỗi (hoặc lịch hẹn đã huỷ/đổi/quá giờ): hệ thống bỏ hẳn mốc nhắc đó, ghi nhận thất bại, không gửi bù ở mốc khác và không ảnh hưởng luồng nghiệp vụ nào.
- A2. Lịch hẹn bị huỷ/đổi lịch trước khi tới mốc nhắc kế tiếp
- 1a. Hệ thống phát hiện lịch hẹn đã Đã hủy hoặc đổi sang khung giờ khác trước khi tới mốc nhắc.
- 1b. Hệ thống không gửi nhắc cho mốc đó (hoặc tính lại mốc theo khung giờ mới nếu đã đổi lịch) — use case kết thúc cho mốc cũ.
- A3. Lịch hẹn được đặt khi đã qua một hoặc nhiều mốc nhắc
- 1a. Hệ thống phát hiện lịch hẹn Đã xác nhận được tạo sát giờ hẹn nên một hoặc nhiều mốc (ví dụ 72 giờ) đã qua trước khi lịch hẹn tồn tại, hoặc việc quét chậm sau khi đạt mốc.
- 1b. Có gửi nhắc cho mốc đã qua hay không và cho phép trễ tối đa bao lâu sau khi đạt mốc: [cần điền]; lần gửi đầu có tính vào số lần thử lại tối đa hay không: [cần điền].

### 2.4.75. Use case Gửi email thông báo theo sự kiện

**Mô tả.** Gửi email cho các sự kiện nghiệp vụ mà hệ thống yêu cầu: xác nhận đặt lịch, thanh toán, hoàn tiền, lời mời và kết quả danh sách chờ, nhắc lịch hẹn theo lịch trình, thay đổi lịch hoạt động/dịch vụ khả dụng của chi nhánh ảnh hưởng lịch hẹn. Hệ thống CLINIX ghi nhận kết quả từng email (chờ gửi, đã gửi, thất bại kèm lỗi và số lần thử) để gửi lại được mà không gửi trùng.

**Tác nhân kích hoạt.** Dịch vụ Email.

**Tiền điều kiện.** Hệ thống CLINIX yêu cầu gửi một email thông báo cho một sự kiện nghiệp vụ cụ thể (từ use case "Gửi thông báo theo sự kiện nghiệp vụ" hoặc "Gửi nhắc lịch hẹn theo lịch trình").

**Hậu điều kiện.**
- Thành công: Email thông báo được gửi tới địa chỉ đích.
- Thất bại: Email không gửi được; hệ thống CLINIX ghi nhận thất bại (không chặn luồng nghiệp vụ gốc). Thông báo trong ứng dụng và quyết định nghiệp vụ đã duyệt không bị xóa hay hoàn tác.

**Các bước thực hiện.**
- (1) Hệ thống CLINIX gửi yêu cầu (địa chỉ email, nội dung theo mẫu sự kiện) tới Dịch vụ Email.
- (2) Dịch vụ Email soạn và gửi email theo mẫu tương ứng sự kiện.
- (3) Dịch vụ Email trả kết quả gửi về hệ thống CLINIX.
- (4) Hệ thống CLINIX cập nhật bản ghi email của thông báo (với email nhắc lịch hẹn, là bản ghi của mốc nhắc tương ứng — mỗi cặp lịch hẹn và mốc có một bản ghi — vì nhắc lịch không có thông báo trong ứng dụng đi kèm): Đã gửi kèm thời điểm gửi. Trước mỗi lần gửi, hệ thống nhận việc gửi bằng một cập nhật có điều kiện (chưa Đã gửi); chỉ lần nhận thành công mới được gọi Dịch vụ Email, nên một thông báo không bao giờ có hai email Đã gửi.

**Luồng thay thế.**
- A1. Gửi email thất bại
- 2a. Dịch vụ Email gặp lỗi.
- 2b. Dịch vụ Email trả kết quả thất bại; hệ thống CLINIX ghi nhận Thất bại kèm lỗi và tăng số lần thử, không chặn hay hoàn tác sự kiện nghiệp vụ gốc.
- 2c. Email được gửi lại trên chính bản ghi đó cho tới khi Đã gửi (số lần thử lại tối đa và khoảng cách giữa các lần: [cần điền]; [đề xuất] như nhắc lịch hẹn: tối đa 3 lần, cách 5 phút). Email nhắc lịch hẹn theo quy tắc riêng của use case "Gửi nhắc lịch hẹn theo lịch trình".

## Phụ lục B. Nguyên văn các use case liên quan (chỉ phần Mô tả, Hậu điều kiện và những câu nhắc thông báo hay email)

Sao chép bằng script từ cùng file gốc. 2.4.42, 2.4.61, 2.4.62, 2.4.73, 2.4.74: phần Mô tả (cộng Hậu điều kiện của 2.4.61, 2.4.62). Các use case phát sinh sự kiện: **chỉ những câu có chữ** "gửi thông báo", "thông báo cho", "nhận được thông báo", "thông báo kết quả", "thông báo xác nhận", "gửi email", "email xác nhận", "Trung tâm thông báo", "thông báo trong ứng dụng" hay "nhắc lịch" (lọc bằng biểu thức chính quy; câu "thông báo lỗi", "thông báo lý do"… của giao diện bị bỏ).

### 2.4.42. Use case Cập nhật cấu hình hệ thống

**Mô tả.** Cho phép Quản trị viên phạm vi Toàn hệ thống thiết lập các thông số cấu hình vận hành của hệ thống: thời gian giữ chỗ, thời điểm nhắc lịch (các mốc số giờ trước giờ hẹn), khung giờ cho phép tiếp đón (check-in: số phút trước và số phút sau giờ hẹn mà Lễ tân còn được chuyển lịch hẹn sang Đã tiếp đón; giá trị: [cần điền]), số lịch hẹn đang hoạt động tối đa của mỗi hồ sơ đi khám (bản thân hoặc từng hồ sơ người thân được tính riêng; giá trị: [cần điền]), số lần tự đổi lịch tối đa cho mỗi lịch hẹn, thời hạn phản hồi lời mời danh sách chờ, số mục chờ tối đa mỗi bệnh nhân, ngưỡng no-show (số lần no-show mới đạt hoặc vượt ngưỡng thì khoá quyền tự đặt lịch trực tuyến; mức 3 lần là [đề xuất]), số ngày thông báo trước cho bệnh nhân bị ảnh hưởng khi thay đổi lịch hoạt động hoặc dịch vụ khả dụng của chi nhánh có hiệu lực (giá trị: [cần điền]), trọng số w1/w2 khi gợi ý bác sĩ. Thời lượng khung giờ không cấu hình riêng mà lấy theo thời lượng của dịch vụ khám; thời gian đặt trước không bị giới hạn bởi một số ngày cố định mà do lịch làm việc bác sĩ đã được công bố tới đâu. Mọi thay đổi cấu hình được ghi vào Audit Log (giá trị trước – sau và lý do) trong cùng một giao dịch.

### 2.4.61. Use case Giữ chỗ tạm thời & chống trùng lịch

**Mô tả.** Tác vụ khoá tạm một khung giờ được chọn trong thời gian giới hạn, ngăn đặt trùng (double-booking) khi nhiều kênh cùng thao tác đồng thời. Dùng chung cho đặt lịch, đổi lịch, đổi lịch hẹn hộ bệnh nhân, và mời danh sách chờ.

**Hậu điều kiện.**
- Thành công: Khung giờ chuyển sang Đang giữ chỗ, gắn với giao dịch gọi và thời hạn giữ chỗ (15 phút cho đặt lịch/đổi lịch; 1 giờ cho mời waitlist — dùng thời hạn phản hồi lời mời); use case gọi tiếp tục xử lý.
- Thất bại: Khung giờ không đổi trạng thái (đã bị giữ/đặt bởi giao dịch khác); use case gọi nhận báo tranh chấp và tự xử lý (thường là báo lỗi cho người dùng chọn khung giờ khác).

### 2.4.62. Use case Mời waitlist tuần tự & xử lý hết hạn

**Mô tả.** Khi có khung giờ trống phát sinh (do huỷ hoặc đổi lịch), hệ thống gửi lời mời cho ứng viên khớp tiêu chí theo thứ hạng đăng ký, mỗi thời điểm một ứng viên cho một khung giờ; giữ chỗ cho ứng viên trong suốt thời hạn phản hồi; từ chối hoặc hết hạn thì nhả chỗ và mời người kế tiếp.

**Hậu điều kiện.**
- Thành công (có ứng viên chấp nhận): Một ứng viên trong danh sách chờ đặt lịch thành công với khung giờ đó; mục chờ chuyển Đã chấp nhận.
- Thành công (không ai chấp nhận, hết danh sách chờ): Khung giờ vẫn ở trạng thái Còn trống, không còn ai được mời.
- Thất bại: Không áp dụng theo nghĩa giao dịch — đây là tác vụ nền, luôn kết thúc ở một trong các trạng thái trên.

### 2.4.73. Use case Gửi email mã OTP

**Mô tả.** Gửi email chứa mã OTP khi người dùng đăng ký tài khoản hoặc quên mật khẩu.

### 2.4.74. Use case Gửi email kích hoạt tài khoản nhân sự

**Mô tả.** Gửi email chứa liên kết kích hoạt (dùng một lần, thời hạn [đề xuất: 24 giờ]) khi Quản trị viên tạo tài khoản nhân sự mới hoặc gửi lại liên kết, để nhân sự tự thiết lập mật khẩu và kích hoạt tài khoản. Email không chứa mật khẩu. Liên kết mới chỉ có hiệu lực khi email được gửi thành công; khi là lần gửi lại, liên kết cũ chỉ mất hiệu lực vào lúc đó.

### Các câu nhắc thông báo hay email trong use case phát sinh sự kiện

**2.4.8. Use case Đặt lịch khám**
- (Hậu điều kiện) Thành công: Lịch hẹn luôn tạo ở trạng thái Chờ thanh toán, khung giờ chuyển Đang giữ chỗ, giá dịch vụ lưu snapshot tại thời điểm đặt; hệ thống tự động ghi nhận giao dịch thanh toán 0đ Thành công ngay nếu dịch vụ không yêu cầu cọc, hoặc chờ Bệnh nhân hoàn tất use case "Thanh toán lịch khám" nếu dịch vụ có cọc. Khi giao dịch Thành công: lịch hẹn chuyển Đã xác nhận, khung giờ chuyển Đã đặt, hệ thống sinh mã lịch hẹn, hiển thị phiếu và gửi email xác nhận.
- (Các bước thực hiện) (16) Khi giao dịch thanh toán Thành công (tức thời với 0đ, hoặc sau khi Bệnh nhân hoàn tất thanh toán cọc): hệ thống chuyển lịch hẹn sang Đã xác nhận, khung giờ sang Đã đặt, gửi email xác nhận, hiển thị bước 6 "Hoàn tất".

**2.4.9. Use case Đổi lịch hẹn**
- (Các bước thực hiện) (9) Hệ thống chuyển lịch hẹn sang khung giờ mới, giải phóng khung giờ cũ, tăng bộ đếm số lần tự đổi, gửi thông báo xác nhận đổi lịch thành công.
- (Luồng thay thế) 8c. Hệ thống thông báo cho Bệnh nhân yêu cầu đang chờ duyệt; lịch hẹn giữ nguyên khung giờ cũ cho tới khi có kết quả — use case kết thúc.

**2.4.10. Use case Hủy lịch hẹn**
- (Các bước thực hiện) (8) Hệ thống gửi thông báo xác nhận hủy lịch (và số tiền hoàn, nếu có) cho Bệnh nhân.

**2.4.11. Use case Đăng ký chờ và phản hồi lời mời**
- (Các bước thực hiện) (4) Hệ thống tạo mục chờ ở trạng thái Đang chờ, xếp hạng theo thời điểm đăng ký, thông báo xác nhận cho Bệnh nhân.
- (Các bước thực hiện) (5) (Khi hệ thống mời theo use case "Mời waitlist tuần tự & xử lý hết hạn") Hệ thống gửi thông báo mời Bệnh nhân (mục chờ chuyển Đang chờ → Đã mời), kèm thời hạn phản hồi (1 giờ, do Quản trị viên cấu hình).
- (Các bước thực hiện) (6) Bệnh nhân xem chi tiết lời mời (khung giờ cụ thể được mời) trong Trung tâm thông báo hoặc màn hình danh sách chờ của mình.

**2.4.13. Use case Nạp tiền vào ví**
- (Luồng thay thế) 6b. Hệ thống cập nhật giao dịch sang Thất bại, không cộng tiền vào ví, thông báo cho Bệnh nhân.

**2.4.14. Use case Thanh toán lịch khám**
- (Các bước thực hiện) (6) Hệ thống hiển thị phiếu lịch hẹn đã xác nhận và gửi email xác nhận cho Bệnh nhân.

**2.4.15. Use case Yêu cầu rút tiền từ ví**
- (Các bước thực hiện) (5) Hệ thống tạo yêu cầu rút tiền ở trạng thái Chờ duyệt, tạm giữ số tiền yêu cầu (không còn tính vào số dư khả dụng), thông báo cho Bệnh nhân.
- (Các bước thực hiện) (7) Hệ thống cập nhật trạng thái yêu cầu (Đã duyệt/Từ chối) và trừ tiền ví tương ứng (đồng thời bỏ phần tạm giữ) nếu được duyệt, hoặc nhả phần tạm giữ nếu bị từ chối; gửi thông báo kết quả cho Bệnh nhân.

**2.4.20. Use case Nhắn tin với bác sĩ**
- (Hậu điều kiện) Thành công: Tin nhắn được gửi và lưu vào hội thoại giữa Bệnh nhân và bác sĩ được chọn (tạo hội thoại mới nếu chưa có); bác sĩ nhận được thông báo tin nhắn mới.
- (Các bước thực hiện) (5) Hệ thống lưu tin nhắn vào hội thoại hiện có, hoặc tạo hội thoại mới nếu đây là tin nhắn đầu tiên; hiển thị trong khung chat, gửi thông báo tin nhắn mới cho bác sĩ.

**2.4.21. Use case Nhắn tin với lễ tân**
- (Hậu điều kiện) Thành công: Tin nhắn được gửi vào hội thoại giữa Bệnh nhân và hộp thư chung của chi nhánh xác định; Lễ tân thuộc chi nhánh đó nhận được thông báo tin nhắn mới.
- (Các bước thực hiện) (6) Hệ thống lưu tin nhắn vào hội thoại hiện có (tạo mới nếu chưa có), gửi thông báo tới Lễ tân thuộc chi nhánh đó.

**2.4.25. Use case Tạo yêu cầu xin nghỉ phép**
- (Các bước thực hiện) (6) Hệ thống thông báo cho Bác sĩ yêu cầu đang chờ duyệt, và gửi thông báo cho Quản trị viên có thẩm quyền phê duyệt.
- (Luồng thay thế) *b. Hệ thống chuyển yêu cầu sang Từ chối, khung giờ làm việc liên quan nhận lịch hẹn trở lại, thông báo cho Bác sĩ — use case kết thúc.

**2.4.28. Use case Xác nhận hoàn thành ca khám**
- (Mô tả) Cho phép Bác sĩ xác nhận hoàn thành một ca khám sau khi khám xong, chuyển lịch hẹn từ Đã tiếp đón sang Hoàn thành. Không bắt buộc phải có hồ sơ/ghi chú khám trước: ghi hồ sơ khám là thao tác độc lập (use case "Ghi hồ sơ khám bệnh"), Bác sĩ có thể ghi trước hoặc sau khi hoàn thành. Việc này kích hoạt quyền đánh giá của bệnh nhân và gửi thông báo kết quả khám.
- (Hậu điều kiện) Thành công: Lịch hẹn chuyển sang Hoàn thành; bệnh nhân được kích hoạt quyền đánh giá bác sĩ cho lịch hẹn này (use case "Đánh giá bác sĩ"); bệnh nhân nhận được thông báo kết quả khám. Hồ sơ khám (nếu đã có) giữ nguyên; nếu chưa có, bệnh nhân thấy "Chưa có hồ sơ khám" cho tới khi Bác sĩ ghi hồ sơ.
- (Các bước thực hiện) (5) Hệ thống chuyển lịch hẹn sang Hoàn thành, kích hoạt quyền đánh giá cho bệnh nhân, gửi thông báo kết quả khám cho bệnh nhân.

**2.4.29. Use case Nhắn tin với bệnh nhân**
- (Hậu điều kiện) Thành công: Tin nhắn được gửi/lưu vào hội thoại tương ứng (1-1 với Bác sĩ, hoặc hộp thư chung chi nhánh với Lễ tân); bệnh nhân nhận được thông báo tin nhắn mới.
- (Các bước thực hiện) (5) Hệ thống lưu tin nhắn, gửi thông báo cho bệnh nhân.

**2.4.30. Use case Đổi lịch hẹn hộ bệnh nhân**
- (Các bước thực hiện) (8) Hệ thống chuyển lịch hẹn sang khung giờ mới, giải phóng khung giờ cũ, gửi thông báo cho bệnh nhân.

**2.4.31. Use case Xử lý yêu cầu đổi lịch ngoài chính sách**
- (Các bước thực hiện) (6) Nếu giữ chỗ thành công: hệ thống chuyển lịch hẹn cũ sang Đã đổi lịch với khung giờ mới, giải phóng khung giờ cũ, cập nhật yêu cầu sang Đã duyệt, ghi Audit Log, thông báo cho bệnh nhân.
- (Các bước thực hiện) (7) Nếu Từ chối: hệ thống cập nhật yêu cầu sang Từ chối kèm ghi chú, ghi Audit Log, thông báo cho bệnh nhân; lịch hẹn giữ nguyên khung giờ cũ.

**2.4.32. Use case Thanh toán offline tại quầy**
- (Các bước thực hiện) (5) Hệ thống chuyển lịch hẹn sang Đã tiếp đón trong cùng một thao tác với bước (4) (một trong hai bước lỗi thì hoàn tác cả hai), thông báo cho Bác sĩ phụ trách.

**2.4.33. Use case Tự động đánh dấu vắng mặt quá giờ hẹn**
- (Hậu điều kiện) Thành công: Lịch hẹn chuyển sang Vắng mặt; khung giờ được giải phóng (có thể kích hoạt mời waitlist); kích hoạt use case "Cộng dồn no-show & khóa đặt lịch"; bệnh nhân nhận được thông báo.
- (Các bước thực hiện) (6) Hệ thống gửi thông báo cho bệnh nhân lịch hẹn đã bị đánh dấu vắng mặt.

**2.4.34. Use case Cập nhật trạng thái lịch hẹn**
- (Các bước thực hiện) (5) Hệ thống thông báo cho bệnh nhân.
- (Các bước thực hiện) (6) (Luồng Quản trị viên — override, thay thế từ bước 1) Quản trị viên chọn một lịch hẹn trong phạm vi quản trị, chọn "Cập nhật trạng thái lịch hẹn" (override); hệ thống hiển thị đầy đủ các trạng thái có thể (kể cả ngoài luồng chuẩn) và yêu cầu nhập lý do override (bắt buộc); Quản trị viên chọn trạng thái mới, nhập lý do; hệ thống chuyển lịch hẹn sang trạng thái đã chọn, ghi Audit Log (ai, lịch hẹn nào, trạng thái trước/sau, lý do), thông báo cho bệnh nhân nếu áp dụng.

**2.4.45. Use case Quản lý chi nhánh / cơ sở**
- (Hậu điều kiện) Thành công (ảnh hưởng lịch hẹn đã đặt, cần phê duyệt): Yêu cầu thay đổi được lưu ở trạng thái Chờ phê duyệt cùng nội dung trước – sau và người đề xuất; thông tin chi nhánh đang áp dụng GIỮ NGUYÊN. Khi Quản trị viên Toàn hệ thống duyệt: yêu cầu có thời điểm có hiệu lực không sớm hơn thời điểm duyệt cộng số ngày thông báo trước, danh sách lịch hẹn bị ảnh hưởng được ghi nhận, mỗi bệnh nhân bị ảnh hưởng nhận thông báo trong ứng dụng và email; thông tin chi nhánh chỉ được cập nhật khi đến thời điểm có hiệu lực. Khi bị từ chối: yêu cầu ghi lý do từ chối và người gửi được thông báo.
- (Hậu điều kiện) Thất bại gửi email: thông báo trong ứng dụng vẫn còn và yêu cầu đã duyệt không bị hoàn tác; email được ghi nhận lỗi và gửi lại được (use case "Gửi email thông báo theo sự kiện").
- (Các bước thực hiện) (9) Hệ thống tạo thông báo trong ứng dụng và email cho từng bệnh nhân có lịch hẹn bị ảnh hưởng (mỗi bệnh nhân một thông báo gom các lịch hẹn của họ) bằng use case "Gửi thông báo theo sự kiện nghiệp vụ". Thông báo được tạo trước thời điểm có hiệu lực; thông tin chi nhánh vẫn chưa thay đổi.
- (Luồng thay thế) *b. Hệ thống ghi lý do, thông báo cho người gửi yêu cầu (trong ứng dụng và email); thông tin chi nhánh giữ nguyên; bệnh nhân không nhận thông báo vì không có gì thay đổi — use case kết thúc.
- (Luồng thay thế) A4. Gửi email thông báo cho bệnh nhân bị ảnh hưởng thất bại
- (Luồng thay thế) 9b. Hệ thống ghi nhận lỗi gửi email, giữ nguyên thông báo trong ứng dụng đã tạo và quyết định đã duyệt (không hoàn tác); email được gửi lại sau mà không gửi trùng — tiếp tục bước 10.

**2.4.51. Use case Phê duyệt yêu cầu nghỉ phép**
- (Hậu điều kiện) Thành công (duyệt): Yêu cầu chuyển Đã duyệt; khung giờ làm việc liên quan không còn được tính là khung giờ còn trống (nghỉ phép đã duyệt); lịch hẹn Chờ thanh toán trong khung giờ đó tự động huỷ (giải phóng khung giờ, không hoàn tiền vì chưa thanh toán); lịch hẹn Đã xác nhận trong khung giờ đó tự động huỷ, hoàn 100% số tiền đã cọc vào ví bệnh nhân; bệnh nhân liên quan nhận được thông báo.
- (Các bước thực hiện) (4) Nếu Duyệt: hệ thống ghi nhận khung giờ làm việc thuộc khoảng nghỉ (không còn là khung giờ còn trống); tự động huỷ các lịch hẹn Chờ thanh toán trong khung giờ đó (không hoàn tiền); tự động huỷ các lịch hẹn Đã xác nhận trong khung giờ đó, hoàn 100% số tiền đã cọc vào ví bệnh nhân (use case "Hoàn tiền tự động"); gửi thông báo cho các bệnh nhân liên quan.
- (Các bước thực hiện) (5) Nếu Từ chối: hệ thống bỏ chặn khung giờ làm việc (nhận lịch hẹn trở lại), thông báo cho bác sĩ.

**2.4.53. Use case Xử lý rút tiền, hoàn tiền đặc biệt & nạp ví chưa cộng**
- (Hậu điều kiện) Thành công (xử lý nạp ví đã xác minh nhưng chưa cộng): Số tiền của giao dịch nạp được cộng vào ví Bệnh nhân đúng một lần, ghi vào lịch sử nạp, giao dịch được đánh dấu Đã đối soát; ghi Audit Log; thông báo kết quả cho Bệnh nhân. Không tạo hoàn tiền và không đổi yêu cầu rút tiền nào.
- (Hậu điều kiện) Thành công (chưa thể xử lý nạp ví): Giao dịch nạp giữ trong hàng đợi đối soát kèm lý do chưa thể xử lý; số dư ví không đổi; ghi Audit Log; thông báo kết quả cho Bệnh nhân.
- (Các bước thực hiện) (4) Hệ thống cập nhật trạng thái yêu cầu, nếu Duyệt thì trừ tiền ví và bỏ phần tạm giữ, nếu Từ chối thì nhả phần tạm giữ, ghi Audit Log, thông báo cho bệnh nhân.
- (Các bước thực hiện) (5) (Luồng hoàn tiền đặc biệt — thay thế từ bước 1) Quản trị viên chọn "Xử lý rút tiền, hoàn tiền đặc biệt & nạp ví chưa cộng" → "Hoàn tiền đặc biệt", tìm bệnh nhân/giao dịch liên quan; hệ thống hiển thị biểu mẫu nhập số tiền hoàn và lý do (bắt buộc); Quản trị viên nhập thông tin và xác nhận; hệ thống cộng số tiền vào ví bệnh nhân, ghi Audit Log, thông báo cho bệnh nhân.
- (Các bước thực hiện) (10) Nếu Cộng ví: hệ thống cộng đúng số tiền của giao dịch vào ví Bệnh nhân đúng một lần (idempotent), ghi vào lịch sử nạp, đánh dấu giao dịch Đã đối soát. Nếu Ghi nhận chưa thể xử lý: giao dịch giữ trong hàng đợi đối soát kèm lý do. Cả hai trường hợp hệ thống ghi Audit Log và thông báo kết quả cho Bệnh nhân.

**2.4.63. Use case Xác minh thanh toán & xác nhận lịch hẹn**
- (Các bước thực hiện) (5) Hệ thống gửi thông báo xác nhận lịch hẹn cho Bệnh nhân (use case "Gửi thông báo theo sự kiện nghiệp vụ").

**2.4.64. Use case Tự hủy lịch quá hạn thanh toán**
- (Các bước thực hiện) (5) Hệ thống gửi thông báo cho bệnh nhân lịch hẹn đã bị huỷ do quá hạn thanh toán.

**2.4.65. Use case Đối soát giao dịch thanh toán**
- (Các bước thực hiện) (4) Nếu thử lại thành công: hệ thống cộng đúng số tiền vào số dư ví, ghi vào lịch sử nạp, đánh dấu giao dịch Đã đối soát, thông báo cho khách hàng.
- (Luồng thay thế) 5b. Hệ thống dừng tự động thử lại, giữ giao dịch trong hàng đợi đối soát, thông báo cho Quản trị viên can thiệp thủ công (use case "Xử lý rút tiền, hoàn tiền đặc biệt & nạp ví chưa cộng").

**2.4.66. Use case Hoàn tiền tự động**
- (Hậu điều kiện) Thành công: Số tiền hoàn được cộng vào ví của bệnh nhân; lịch sử hoàn tiền được ghi lại (Thành công); bệnh nhân nhận được thông báo.
- (Các bước thực hiện) (3) Hệ thống ghi lịch sử hoàn tiền (Thành công), gửi thông báo cho bệnh nhân.
