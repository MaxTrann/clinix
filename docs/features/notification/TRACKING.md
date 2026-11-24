# Tracking — scope #10 `notification` Thông báo (Trung tâm thông báo, Gửi thông báo theo sự kiện nghiệp vụ, Gửi nhắc lịch hẹn theo lịch trình, Gửi email thông báo theo sự kiện)

Nhật ký tiến độ riêng của scope #10 (mã nằm trong `apps/api/src/notification/` và `apps/web/src/features/notification/`; scope commit `notification`). Kế hoạch, task, phụ thuộc và danh sách test case nằm ở [`PLAN.md`](PLAN.md); file này chỉ ghi việc **đã làm** để sau này giải thích lại được (luồng chạy, test nào pass, chỗ nào phát sinh vấn đề). Giữ vĩnh viễn trong repo, không xoá sau khi merge. **Người làm scope này: Trung (`junUTE`); Đại (`MaxTrann`) review.** Các điểm chạm file của Đại đã được Đại xác nhận ở Q17 (mục 5).

**Cách ghi**
- Thêm một dòng mới **sau mỗi task** (mã task `P*`, `B*`, `F*`, `D*`, `X*` theo PLAN.md mục 6; ngoài file này luôn viết "notification B2" để không nhầm với booking B2 hay reschedule B2), mới nhất ở cuối.
- "Test case": liệt kê mã test case ở mục 7 của PLAN.md; "Kết quả": `Pass` / `Fail` / `Một phần` (ghi rõ ca nào ở cột cuối). Ca `Fail` phải có dòng sau ghi cách xử lý và lần chạy lại.
- Ca đồng thời ghi thêm số vòng chạy và số lỗi 1213/1205/503 đo được; sau mỗi ca đồng thời ghi kết quả IVN-01…IVN-05.
- Đổi kế hoạch khi đang làm thì sửa `PLAN.md`; ghi lý do ở cột cuối của dòng tương ứng.
- Câu hỏi Q1 trở đi (PLAN.md mục 4.2) được trả lời thì ghi vào mục 3 **kèm chữ "ĐÃ TRẢ LỜI (ngày, Đại trả lời trực tiếp)"** rồi bỏ thẻ `[CHỜ Qn]` trong PLAN.md. **Không ghi "ĐÃ TRẢ LỜI" khi Đại chưa trả lời trực tiếp** (tin của phiên kiểm độc lập chỉ duyệt kế hoạch từng giai đoạn và trả lời câu kỹ thuật, không trả lời câu cho nhóm). Câu chạm file của Đại ghi tên người xác nhận.
- Số đo thật (PLAN.md mục 5.12) ghi ở mục 6 **sau khi đặt tiêu chí trước**; việc còn chờ module khác ghi ở mục 7 cho tới khi module đó có mã.
- Khi cả scope xong: thêm **đúng một dòng** vào `docs/TRACKING.md` ở gốc, trỏ sang file này.

## 1. Nhật ký

| Ngày | Việc đã làm | Test case | Kết quả | Vấn đề phát sinh / cách xử lý |
|---|---|---|---|---|
| 24/11/2026 | **Lập kế hoạch scope #10, giai đoạn 1** (Đại `MaxTrann` với Claude Code, Claude Sonnet 5.5; nhánh `docs/notification-plan`, worktree `clinix-app-doctor-exam`, `origin/main` `75ed996`). Đọc nguyên văn 2.4.59, 2.4.68, 2.4.69, 2.4.75 và các use case liên quan 2.4.42, 2.4.61, 2.4.62, 2.4.73, 2.4.74 cùng câu nhắc thông báo của 24 use case phát sinh sự kiện (bằng `python-docx`, chỉ đọc), đối chiếu với `Drive_Hien_Tai` (2.4.56); đối chiếu `docs/database/*` (`thong_bao`, `email_thong_bao`, `nhac_lich_hen`, `cau_hinh_he_thong`, quy tắc 28, 29, 31, 34, 35, 41, 62), `docs/features/{booking,admin,doctor,doctor-exam,payment,reschedule}/PLAN.md`, `docs/TECH_DEBT.md` (dòng 62, 90, 126 đến 129, 186, mục Doctor B10), mã `apps/api/src/{appointments/notifications,notification,doctor,wallet,payment,mail,common,database}`, `apps/web/src/{router,shared,features/{admin,patient,doctor,search}}` và mã Make của Figma. **Hỏi Đại bằng ba hộp câu hỏi** (4, 4 và 2 câu): Q1 đến Q10 đã trả lời, **cả mười theo đề xuất** (mục 3.1). Tạo `PLAN.md` (mục 0 đến 10, Phụ lục A và B nguyên văn; 131 mã test case, 15 task, 69 giờ cộng 3 giờ dự phòng) và file này. **Không** chạy `npm`, test, build, Docker, MySQL; **không** đọc `.env`; **không** sửa file nào khác; **không** lệnh git ghi. | — (tài liệu; chưa có mã) | — | **Phát hiện khi đối chiếu (đã nêu ở PLAN 3.3, chưa tự chọn bên nào):** (1) bảng `nhac_lich_hen` có DDL nhưng **chưa có migration và entity** (phiên kiểm độc lập báo trước, đã tự kiểm lại bằng `grep`); (2) **bảy** nơi ghi `thong_bao` (không phải ba) và 27 mã sự kiện ở sáu file hằng, hằng độ dài 500 khai bốn lần; (3) worker thư đã có 13 loại nên PLAN reschedule 5.10 ghi "tám loại" là **sai số hiện trạng** (L14); (4) 2.4.68 HĐK "mỗi thông báo kèm một email" trái quy tắc 62 (chỉ một số loại có thư); (5) 2.4.32 b5 và 2.4.34 b5 đòi thông báo tiếp đón mà booking chốt không có; (6) quy tắc 41 viết `ROW_COUNT 1 = vừa tạo` có thể sai dưới `mysql2` (giả thiết, M4); (7) `thong_bao` không có tiêu đề và liên kết nên danh mục suy ra từ mã; (8) hai cách đánh số 2.4 (2.4.59 và 2.4.56) nhưng không khác ý. Phiên kiểm độc lập (`Repo, Docker CI/CD…`) **không** trả lời câu quyết định nào: mọi câu quyết định sản phẩm và schema hỏi trực tiếp Đại; phiên đó chỉ gửi một tin kỹ thuật về `nhac_lich_hen` (đã đưa vào PLAN). |
| 24/11/2026 | **Phiên kiểm độc lập duyệt Q11, Q12, Q13** (tin của `Repo, Docker CI/CD và class diagram`, theo ủy quyền của Đại). Cập nhật `PLAN.md` và file này: đổi trạng thái ba câu; 5.4 đánh dấu một thông báo bằng MỘT câu `UPDATE` có điều kiện sở hữu; TTB-07 thêm ca spy và ca 404 y hệt; đột biến 3; M1, M2 đo ở mức một tài khoản kèm tiêu chí `Using filesort`; M4 thêm `affectedRows` của `UPDATE`; P2(b) làm trước B2 nếu M1 FAIL. **Không** thêm hay bỏ mã test case (vẫn 131). | TTB-07, M1, M2, M4 (đổi nội dung) | — | Phiên kiểm đã gửi trước đó một tin kỹ thuật về `nhac_lich_hen` (đã đưa vào P1). Q14 đến Q19 giữ cho Đại, không do phiên kiểm quyết. |
| 24/11/2026 | **Đại trả lời Q14 đến Q19** (trực tiếp, trong cửa sổ của Đại). Cập nhật `PLAN.md` và file này: đổi trạng thái sáu câu; thư nhắc lịch dùng khuôn thư B15 và ghi thời gian hẹn cụ thể (PLAN 1.1, 3.4 MH5, 5.6, NLH-17); Q18 phiên kiểm tạo nhãn và milestone bằng script; Q19 giao sửa PLAN reschedule cho PR reschedule B3. **Không** thêm hay bỏ mã test case (vẫn 131). | NLH-17 (đổi nội dung) | — | Q16 giữ `[cần điền]` (chưa có Excel). Sau khi cập nhật, báo phiên kiểm độc lập đường dẫn file nháp commit và PR theo chỉ dẫn của Đại. |

## 2. Kết quả test theo use case (mã ở PLAN.md mục 7; **chưa chạy ca nào**)

| Nhóm | Mã | Số ca | Task | Trạng thái |
|---|---|---|---|---|
| Trung tâm thông báo (2.4.59) | TTB-01…TTB-16 | 16 | B2 | chưa chạy |
| Quyền và phạm vi | QTB-01…QTB-05 | 5 | B2 | chưa chạy |
| Danh mục sự kiện và sự kiện mới (2.4.68) | DMS-01…DMS-13 | 13 | B1, B6 | chưa chạy |
| Email theo sự kiện (2.4.75) | EMT-01…EMT-13 | 13 | B4, B5, X2 | chưa chạy |
| Nhắc lịch (2.4.69) | NLH-01…NLH-23 | 23 | B3 | chưa chạy |
| Migration và schema | MTB-01…MTB-11 | 11 | P1, P2 | chưa chạy |
| Hợp đồng và cổng | HTB-01…HTB-07 | 7 | B1, B2, B3 | chưa chạy |
| Bảo mật dữ liệu và log | BTB-01…BTB-07 | 7 | B2, B3, B4 | chưa chạy |
| Đồng thời | CTB-01…CTB-07 | 7 | X2 | chưa chạy |
| Giao diện | WTB-01…WTB-17 | 17 | F1, F2, F3 | chưa chạy |
| Kiểm tay | KTB-01…KTB-12 | 12 | X3 | chưa chạy |
| **Tổng** | | **131** | | **0 đã chạy** |

Đột biến bắt buộc (PLAN 5.12): 24, chưa chạy. Bất biến IVN-01 đến IVN-05: chưa viết.

## 3. Quyết định đã chốt

### 3.1 Quyết định của nhóm cho scope này

**Đại trả lời trực tiếp ngày 24/11/2026**, qua ba hộp câu hỏi trong phiên lập kế hoạch (mỗi câu có đề xuất kèm theo; **cả mười câu theo đề xuất**):

| Q | Quyết định | Ghi chú |
|---|---|---|
| Q1 | **ĐÃ TRẢ LỜI (24/11/2026, Đại trả lời trực tiếp): thăm dò HTTP mỗi 30 giây** (không SSE, không WebSocket) | Số 30 giây là `[đề xuất]`, chốt sau số đo M2; lệch chữ "ngay" của 2.4.59 b5 (L2), `[ĐỒNG BỘ TL]` |
| Q2 | **ĐÃ TRẢ LỜI (24/11/2026, Đại trả lời trực tiếp): không gửi bù, trễ tối đa 10 phút** | Con số 10 là của AI, Đại chọn phương án; hằng ở `reminder.constants.ts` |
| Q3 | **ĐÃ TRẢ LỜI (24/11/2026, Đại trả lời trực tiếp): nhắc lịch thử tổng 3 lần gồm lần đầu, cách 5 phút** | Cùng số với `EMAIL_MAX_ATTEMPTS` |
| Q4 | **ĐÃ TRẢ LỜI (24/11/2026, Đại trả lời trực tiếp): giữ thông báo mãi, không job dọn** | Ghi nợ (nháp TECH_DEBT 271) |
| Q5 | **ĐÃ TRẢ LỜI (24/11/2026, Đại trả lời trực tiếp): sổ danh mục chỉ đọc + test đối chiếu**, không `NotificationService` chung | Đổi kế hoạch cũ của doctor ("thay `LeaveNotifier`", L11); không đổi mã ghi của 7 nơi |
| Q6 | **ĐÃ TRẢ LỜI (24/11/2026, Đại trả lời trực tiếp): thêm thư hoàn thành lịch khám và ba thư nghỉ phép** | Chờ reschedule B3; đóng TECH_DEBT 186 và mục Doctor B10; sửa HDK-06 |
| Q7 | **ĐÃ TRẢ LỜI (24/11/2026, Đại trả lời trực tiếp): thêm `LichHenDaTiepDon` cho Bác sĩ, chỉ trong ứng dụng** | Còn lệch 2.4.34 b5 (bệnh nhân); `[ĐỒNG BỘ TL]` Đại sửa 2.4 |
| Q8 | **ĐÃ TRẢ LỜI (24/11/2026, Đại trả lời trực tiếp): cho phép thêm chỉ mục bằng migration nếu X1 vượt ngưỡng đặt trước** | Task P2 có điều kiện; sửa cả ba file `docs/database/*` khi làm; `nhac_lich_hen` (P1) là bắt buộc, không phải "đổi schema" |
| Q9 | **ĐÃ TRẢ LỜI (24/11/2026, Đại trả lời trực tiếp): giả định 40 giờ mỗi tuần cho Trung** | **Giả định** của AI, chưa phải số thật của Trung; sửa khi duyệt PR tài liệu |
| Q10 | **ĐÃ TRẢ LỜI (24/11/2026, Đại trả lời trực tiếp): không làm chuông ở header công khai đợt đầu** | Ghi nợ (nháp TECH_DEBT 272) |

**Đại trả lời trực tiếp tiếp, Q14 đến Q19 (24/11/2026):**

| Q | Quyết định | Ghi chú |
|---|---|---|
| Q14 | **ĐÃ TRẢ LỜI (24/11/2026, Đại trả lời trực tiếp): theo đề xuất — chuông là liên kết tới trang Thông báo kèm số chưa đọc** | Hộp thả xuống ghi nợ (nháp TECH_DEBT 272) |
| Q15 | **ĐÃ TRẢ LỜI (24/11/2026, Đại trả lời trực tiếp): đồng ý toàn bộ câu chữ đề xuất ở PLAN 5.3, 5.6, 5.7, 5.11; nhóm duyệt khi review PR của B1, B3, B4, B5, F2**; **điều chỉnh:** thư nhắc lịch dùng khuôn thư B15 và ghi thời gian hẹn cụ thể ("14:30 ngày 02/12"), không chỉ ghi "còn 2 giờ" | Đã sửa PLAN 1.1, 3.4 (MH5), 5.6, NLH-17; thư nhắc lịch vẫn chưa có khung Figma |
| Q16 | **ĐÃ TRẢ LỜI (24/11/2026, Đại trả lời trực tiếp): chưa có Excel nào cần đồng bộ; giữ `[cần điền]`, Đại và Trung kiểm sau** | |
| Q17 | **ĐÃ TRẢ LỜI (24/11/2026, Đại trả lời trực tiếp): xác nhận các điểm chạm file của `booking` và `patient`** (Đại approve PR tài liệu coi là xác nhận) | B4, B5, B6, F1 hết `[CHỜ Đại]` về file; vẫn chờ reschedule B3 |
| Q18 | **ĐÃ TRẢ LỜI (24/11/2026, Đại trả lời trực tiếp): đồng ý nhãn `module:notification` và milestone `notification`** | Phiên kiểm độc lập có script tự tạo cả hai |
| Q19 | **ĐÃ TRẢ LỜI (24/11/2026, Đại trả lời trực tiếp): không sửa PLAN reschedule ở PR này; việc sửa mục 5.10 và ca HDK-06 (13 loại, không phải "bốn") giao cho PR của reschedule B3** | B4 đọc lại bản HDK-06 đã sửa |

**Phiên kiểm độc lập duyệt ba câu kỹ thuật (24/11/2026, theo ủy quyền của Đại; KHÔNG phải Đại trả lời trực tiếp nên không ghi "ĐÃ TRẢ LỜI"):**

| Q | Quyết định | Điều kiện của phiên kiểm đã đưa vào PLAN |
|---|---|---|
| Q11 | **ĐÃ DUYỆT:** `GET /notifications/:id` chỉ đọc; web gọi `POST /notifications/:id/read` đúng một lần khi mở chi tiết | `POST` idempotent; thông báo của người khác và không tồn tại trả 404 y hệt nhau; điều kiện `tai_khoan_id` nằm trong chính câu `UPDATE`, không `SELECT` sở hữu riêng rồi `UPDATE` (PLAN 5.4, TTB-07, đột biến 3) |
| Q12 | **ĐÃ DUYỆT:** offset, `PageQueryDto` và `Paged<T>`, khoá `thoi_diem_tao DESC, thong_bao_id DESC`, R9 chấp nhận | M1 và M2 đo ở mức MỘT tài khoản nhiều dòng cho `tat-ca`, `chua-doc`, `unread-count`, tiêu chí đặt trước; `tat-ca` có thể filesort; phương án chỉ mục `(tai_khoan_id, thoi_diem_tao, thong_bao_id)` ghi sẵn ở P2(b), không thêm khi chưa đo (PLAN 5.12) |
| Q13 | **ĐÃ DUYỆT:** một nhóm `/notifications` cho bốn vai trò, `@Roles` từng route, `tai_khoan_id` từ token, không `RequireAdminScope` | không nhận `taiKhoanId` ở query hay body (QTB-04) |

Ghi chú: phiên kiểm nói thêm chỉ mục "vào task P1"; PLAN đặt ở **P2 (có điều kiện)** vì P1 là migration bắt buộc của `nhac_lich_hen` và Đại đã chọn "thêm chỉ mục chỉ khi vượt ngưỡng" (Q8); nếu M1 FAIL thì P2(b) chạy trước khi merge B2.

**Không còn câu quyết định nào mở.** Còn lại: các `[cần điền]` (Excel của Trung: Đại và Trung kiểm sau; mã sự kiện waitlist và chat; mốc migration chốt lúc làm), việc ngoài repo (D2), việc nhóm duyệt câu chữ khi review PR (Q15) và việc của Đại sau khi merge (mục 5).

### 3.2 Quyết định kế thừa từ module khác (không bàn lại; nguồn ở PLAN.md 4.1)

Booking B15: `thong_bao` ghi trong giao dịch của lõi, chỉ nuốt 1062 đúng chỉ mục, `noi_dung` ≤ 500 và không chứa lý do khám, worker thư nhận việc có điều kiện và không giao dịch nào bọc SMTP; payment quy tắc 62: năm loại có thư; admin Q9, C4: bảy mã đổi chi nhánh, bốn loại có thư; doctor Q33: `LeaveNotifier`, không `ly_do` của Bác sĩ cho Admin; doctor-exam Q17: `LichHenHoanThanh` chưa có thư; patient Q21b, Q21d, TECH_DEBT 62: chuông và số đếm ở `RoleShell`; quy tắc DB 28, 29, 34, 35, 41, 62.

## 4. Ghi chú AI

**Phiên này KHÔNG sửa `AI_USAGE_LOG.md` và `docs/TECH_DEBT.md`** (Đại quyết ghi ở PR sau). Dưới đây là **bản nháp** (kiểm lại số lớn nhất trên `main` lúc ghi: lúc soạn `origin/main` có đến dòng AI log 181 và `AI-BUG-081`; hàng 182 và 183, `AI-BUG-082` và `083` đã dành cho PR kế hoạch đổi lịch và reschedule P1, nên nháp dùng 184 và 084; TECH_DEBT lớn nhất là dòng 265, dòng 266 đến 270 đã dành cho các task đổi lịch, nên nháp từ 271).

### 4.1 Nháp dòng AI log (bảng 1, mười cột)

| # | Ngày | Người dùng | Công cụ / model | Phạm vi (module/file) | Prompt chính | Phần AI sinh | Phần tự sửa/viết | Cách kiểm chứng | Commit/PR |
|---|------|-----------|-----------------|-----------------------|--------------|--------------|------------------|-----------------|-----------|
| 184 | 24/11/2026 | MaxTrann | Claude Code (Claude Sonnet 5.5) | `docs/features/notification/PLAN.md`, `docs/features/notification/TRACKING.md` (MỚI; chỉ hai file này; kế hoạch scope #10 thông báo) | Lập kế hoạch (chỉ tài liệu, không viết mã) cho scope #10 "Thông báo" (module `notification`): Trung tâm thông báo (2.4.59), Gửi thông báo theo sự kiện (2.4.68), Gửi nhắc lịch hẹn theo lịch trình (2.4.69), Gửi email thông báo theo sự kiện (2.4.75); đối chiếu 2.4 với schema, PLAN các module và mã; hỏi Đại các quyết định sản phẩm và schema | Toàn bộ PLAN (mục 0 đến 10, 131 mã test case, 15 task, 69 giờ cộng 3 giờ dự phòng) và TRACKING; Phụ lục A và B sao chép bằng script từ file Word; bản nháp commit, PR, AI log, nợ kỹ thuật | Đại trả lời trực tiếp ba hộp câu hỏi (Q1 đến Q10, cả mười theo đề xuất); Đại trả lời trực tiếp Q14 đến Q19 (Q15 chỉnh thư nhắc lịch); phiên kiểm độc lập duyệt Q11 đến Q13 theo ủy quyền; PLAN còn chờ Đại và Trung duyệt | Đọc nguyên văn 2.4 bằng `python-docx` (chỉ đọc) và so hai bản; đối chiếu tên hàm, hằng, đường dẫn, số dòng DDL trong PLAN với mã trên `origin/main` `75ed996`; tự kiểm lại tin của phiên kiểm độc lập về `nhac_lich_hen` bằng `grep`; script kiểm tiêu đề issue và PR ≤ 100 ký tự, số cột bảng, mã test case không trùng và mỗi mã có task nhận; không chạy `npm`, test, build, Docker, MySQL; không đọc `.env`; không lệnh git ghi | `[cần điền]` (PR tài liệu của Đại) |

### 4.2 Nháp dòng nợ kỹ thuật (từ 271; chỉ ghi khi lối tắt có thật trong mã; cột: STT | Ngày | Mô tả | Nguyên nhân | Hậu quả | Xử lý | Trạng thái)

| STT | Ngày | Mô tả | Nguyên nhân | Hậu quả | Xử lý | Trạng thái |
|---|---|---|---|---|---|---|
| 271 | `[ngày merge B2]` | **Thông báo trong ứng dụng giữ mãi, không job dọn** (notification Q4): `thong_bao` và `email_thong_bao` chỉ tăng | Use case không nêu hạn giữ; Đại chọn không làm job dọn | Bảng lớn dần; số đo M1 ở 100.000 dòng ghi ở TRACKING mục 6 | Job xoá thông báo đã đọc sau N ngày (xoá `email_thong_bao` trước vì khoá ngoại) khi M1 xấu đi | Mở |
| 272 | `[ngày merge F1]` | **Chuông chỉ là liên kết tới trang Thông báo, không hộp thả xuống; không có chuông ở header công khai khi Bệnh nhân đang đặt lịch** (Q10, Q14); Figma Make có `NotificationPanel` và chuông ở `PublicHeader` | Giảm giờ và tránh sửa `features/search/shell/public-header.tsx` | Bệnh nhân đang đặt lịch không thấy số chưa đọc | Thêm hộp thả xuống 5 thông báo mới nhất và chuông ở `PublicHeader` (dùng chung thành phần chuông) | Mở |
| 273 | `[ngày merge B3]` | **Mốc nhắc lịch quá cửa sổ 10 phút bị bỏ lặng lẽ, không để lại dấu vết; thông lượng gửi nhắc phụ thuộc SMTP** (~1 thư mỗi giây là ước lượng chưa đo, M7; TECH_DEBT 21 không pool) | Q2; không có dòng nào cho mốc bị bỏ | Quá tải nhiều trăm thư cùng 10 phút ⇒ một số mốc không bao giờ gửi, không ai biết | Đếm mốc bị bỏ ở log mỗi lượt hay ghi dòng `ThatBai` `QUA_CUA_SO`; pool SMTP | Mở |
| 274 | `[ngày merge F1]` | **"Thông báo tức thời" là thăm dò 30 giây**: độ trễ tối đa 30 giây (lệch chữ "hiển thị ngay" của 2.4.59 b5); mỗi phiên một yêu cầu mỗi 30 giây | Q1: không hạ tầng đẩy (không Redis, `EventSource` không gửi header) | Tải nền tỉ lệ số phiên mở; thông báo đến chậm tới 30 giây | SSE hay WebSocket khi có kênh chung giữa các tiến trình API | Mở |
| 275 | `[ngày merge B6]` | **Tiếp đón chỉ báo Bác sĩ, không báo Bệnh nhân** (Q7): 2.4.34 b5 còn lệch | Bệnh nhân đang ở quầy; booking chốt không có sự kiện | Nhật ký 2.4 và mã lệch nhau | Đại sửa 2.4.34 b5 (D2) hay thêm sự kiện cho Bệnh nhân | Mở |
| 276 | `[ngày merge B4]` | **Không backfill thư cho thông báo hoàn thành và nghỉ phép đã ghi trước B4, B5** | `thong_bao` bất biến; ghi thư muộn cho thông báo cũ là gửi thư cũ về sau (TECH_DEBT 127) | Bệnh nhân và Bác sĩ không có thư cho sự kiện cũ | Chấp nhận (dữ liệu mẫu) | Mở |
| 277 | `[ngày merge B2]` | **Phân trang offset của Trung tâm thông báo** có thể lặp hay lệch một dòng khi có thông báo mới giữa hai lần bấm trang (R9); tiêu đề hiển thị suy từ danh mục nên đổi tiêu đề đổi cả dòng cũ (R8) | Q12 (nếp admin Q42); `thong_bao` không có cột tiêu đề | Hiếm; chỉ ảnh hưởng hiển thị | Phân trang bằng con trỏ `thong_bao_id`; lưu tiêu đề nếu cần bất biến | Mở |

Cập nhật dòng có sẵn khi mã có: **dòng 62 → Đã đóng** (notification F1: chuông và số đếm ở `RoleShell`, `to` ở `role-nav.ts`; phần hộp thả xuống và header công khai chuyển sang dòng 272); **dòng 186 → Đã đóng** (notification B4: thư hoàn thành lịch khám `678:2`, nhắc đánh giá bằng chữ; chuông có từ F1); **mục "Doctor B10" → Đã đóng** (notification B5: thêm thư nghỉ phép; **không** thay `LeaveNotifier` bằng `NotificationService`, Q5); **dòng 90 → Đã đóng nếu P2 thêm chỉ mục** `lich_hen (trang_thai, thoi_gian)` và đo lại NoShowJob đạt; **dòng 126, 127, 129** thêm câu "loại thư của notification B3, B4, B5 cũng chịu hạn chế này".

### 4.3 Nháp lỗi AI (`AI-BUG-084`, `[đề xuất]`; chỉ ghi nếu Đại muốn, vì mọi lỗi do AI tự phát hiện và sửa trước khi giao, chưa vào commit nào)

| Mã | Ngày | Mô tả | Cách phát hiện | Cách sửa |
|---|---|---|---|---|
| `AI-BUG-084` | 24/11/2026 | Ở notification (lập kế hoạch, MaxTrann, Claude Code Claude Sonnet 5.5): năm sai sót trong bản nháp PLAN, đều sửa trước khi giao: (1) ghi "8 lớp `@Cron`" từ trí nhớ trong khi mã có nhiều hơn; (2) ghi nguồn một quy tắc ("tiếp đón không có sự kiện") là "PLAN booking mục B12" trong khi nó nằm ở `clinix_quy_tac_nghiep_vu.md` mục "booking B12" và "booking B14"; (3) đặt nhãn `M1…M8` cho chỗ mơ hồ ở mục 3.4 trùng với `M1…M7` của số đo ở 5.12; (4) một tiêu đề PR dài 101 ký tự (giới hạn 100); (5) chuỗi trong script có dấu gạch chéo ngược đứng trước số 2 (`\2`) nên Python đọc thành ký tự điều khiển `\x02`, làm hỏng đường dẫn `D:\du_lieu\TLCN_CLINIX\2.4_…` | (1), (2) tự rà khi đối chiếu với `grep`; (3) tự rà khi đọc lại; (4), (5) script kiểm tiêu đề và quét ký tự điều khiển | sửa cả năm chỗ trước khi ghi vào repo (đổi nhãn thành `MH1…MH8`, rút gọn tiêu đề, ghép đường dẫn bằng `chr(92)`) |

## 5. Phối hợp với module khác

| Với | Điểm | Cần gì | Trạng thái |
|---|---|---|---|
| Đại (booking) | B4, B5, B6: sửa `appointments/notifications/*`, `appointments/state/*`, `appointments.constants.ts`; ca HDK-06, BCS-04 | **Đã xác nhận (Q17, 24/11/2026)**; vẫn **chờ reschedule B3** (#639) merge | chờ reschedule B3 |
| Đại (reschedule) | P1 (#634): mốc migration và `entities.ts`; B3 (#639): worker thư; PLAN reschedule 5.10 ghi "tám loại" (L14, Q19) | **Q19: Đại giao việc sửa mục 5.10 và ca HDK-06 cho PR của reschedule B3**; rebase `database/*`, `app.module.ts`, `router/*` khi trùng | chờ |
| Đại (patient) | F1: `features/patient/shell/role-layout.tsx` (thêm prop truyền xuống) | **Đã xác nhận (Q17, 24/11/2026)** | xong |
| Trung (admin) | P1: `admin/entities/nhac-lich-hen.entity.ts`, `enums.ts`; F3: `admin-header.tsx`, `admin-sidebar.tsx`; B1: ghi nhận `BranchChangeNotifier` (không sửa) | Trung là người làm | không cần |
| Trung (doctor, doctor-exam) | B4: `ExamNotifier`, ca HDK-06; B5: `LeaveNotifier`; F1: `DoctorLayout` | Trung là người làm; báo Đại vì cùng worker | không cần |
| payment, wallet | B1: chỉ đọc hằng ở file spec; không đổi mã | báo Đại biết khi thêm mã mới ở hai module này | không cần xác nhận |
| waitlist (#11), chat (sau) | thông báo mời, kết quả, tin nhắn mới | chừa chỗ ở danh mục (DMS-13); khi có mã thì khai và (nếu có thư) thêm `MAIL_EVENTS` | `[CHỜ waitlist]`, `[CHỜ chat]` (không chặn) |
| search | `PublicHeader` (chuông cho Bệnh nhân đang đặt lịch) | không làm (Q10) | ghi nợ 272 |
| Đại (GitHub) | nhãn `module:notification`, milestone `notification`, Epic, script sinh issue; seed demo (X3); sửa Word (D2) | Q18: đã đồng ý tên, **phiên kiểm có script tự tạo nhãn và milestone**; Q16: chưa có Excel | nhãn, milestone: phiên kiểm; còn lại chờ |

## 6. Số đo thật (PLAN.md mục 5.12, task X1; **tiêu chí đặt TRƯỚC khi chạy, không đổi sau khi thấy số**; chưa đo)

| Mã | Câu hỏi | Tiêu chí đạt | Kết quả |
|---|---|---|---|
| M1 | Danh sách thông báo theo tài khoản ở 100.000 dòng (một tài khoản 20.000 dòng, 10.000 chưa đọc): ba bộ lọc, trang 1 và trang 500, EXPLAIN | p95 ≤ 50 ms (100 lần mỗi ca) cho cả sáu ca; FAIL ⇒ P2(b) | chưa đo |
| M2 | Đếm chưa đọc và chi phí thăm dò (200 luồng mỗi 30 giây trong 60 giây) | `COUNT` p95 ≤ 20 ms; 0 lỗi, p95 ≤ 30 ms dưới tải; FAIL ⇒ chu kỳ 60 giây | chưa đo |
| M3 | Quét nhắc lịch ở 100.000 `lich_hen` (30.000 `DaXacNhan` tương lai trải 14 ngày), mốc 72, 24, 2: EXPLAIN | p95 ≤ 100 ms cho cả ba câu; FAIL hay `type = ALL` ⇒ P2(a); đo lại NoShowJob để đóng TECH_DEBT 90 | chưa đo |
| M4 | `affectedRows` của `INSERT … ON DUPLICATE KEY UPDATE lich_hen_id = lich_hen_id` dưới `mysql2` và TypeORM của dự án | PASS nếu lần đầu 1 và lần hai 0; ngược lại dùng `INSERT` thường + bắt 1062, sửa chữ quy tắc 41 | chưa đo |
| M5 | `read-all` (lô 500, `READ COMMITTED`) × `INSERT thong_bao` cùng tài khoản, 300 vòng, hai luồng; đối chứng `REPEATABLE READ` một câu | 0 lần 1213 và 1205; mỗi `INSERT` chờ ≤ 100 ms; đối chứng chỉ ghi nhận | chưa đo |
| M6 | Câu chọn lô của worker thư với 21 loại ở 100.000 `email_thong_bao` (200 chờ, 5.000 `ThatBai` hết lần) | ≤ 10 ms | chưa đo |
| M7 | Thông lượng một lượt nhắc lịch: 1.000 mốc cùng phút, `FakeMailService` 0 ms và 300 ms mỗi thư | đủ 1.000 mốc, không mốc nào hai lần; ở 300 ms mỗi thư tổng ≤ 600 giây; ghi thời gian thật và `more` | chưa đo |

## 7. Cảnh báo và việc chờ module khác (cập nhật khi module đó có mã)

- **Chờ reschedule B3 (#639)** cho B4, B5, B6 (cùng `appointments/notifications/*`) và **reschedule P1 (#634)** cho mốc migration của P1; theo dõi Epic #633. Nếu B3 trượt, B4 đến B6 trượt theo (Iteration 10 là chỗ đệm).
- **PLAN reschedule 5.10 ghi "tám loại"** trong khi worker đã có 13 loại (L14, Q19): **Đại giao việc sửa mục 5.10 và ca HDK-06 cho PR của reschedule B3**; scope này **không** sửa `docs/features/reschedule/*`.
- **Dòng `cau_hinh_he_thong` không tạo sẵn** (quy tắc 35): chưa có dòng thì nhắc lịch không chạy (ghi một dòng log cảnh báo, NLH-15); dữ liệu mẫu và môi trường demo phải có dòng cấu hình.
- **SMTP chưa cấu hình** thì thư nằm hàng đợi, không tính lần thử (TECH_DEBT 127): khi Đại cấu hình SMTP thật mọi thư tồn được gửi; nhắc lịch có cửa sổ 10 phút nên không tồn.
- **Đồng bộ tài liệu ngoài repo (D2, Đại):** 2.4.59, 2.4.68, 2.4.69, 2.4.75, 2.4.32, 2.4.34 (danh sách chi tiết ở PLAN 4.5); chọn một cách đánh số (2.4.59 hay 2.4.56).
- **Nhãn và milestone** `module:notification`, `notification` chưa có trên GitHub: Đại đã đồng ý tên (Q18); **phiên kiểm độc lập có script tự tạo cả hai**.
- **Waitlist, chat:** chừa chỗ ở danh mục; khi có mã chạy lại DMS-13 và cập nhật `MAIL_EVENTS`.
- **Báo cáo (module sau):** không dùng `thong_bao`; nhắc lịch không có `thong_bao` nên không vào số liệu thông báo.
