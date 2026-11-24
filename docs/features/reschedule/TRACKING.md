# Tracking — scope #9 `booking` đổi lịch hẹn (Đổi lịch hẹn của Bệnh nhân, Đổi lịch hẹn hộ bệnh nhân của Lễ tân, Xử lý yêu cầu đổi lịch ngoài chính sách của Lễ tân và Quản trị viên)

Nhật ký tiến độ riêng của scope #9 (mã nằm trong `apps/api/src/appointments/reschedule/`, module Nest `AppointmentsModule` của `booking`). Kế hoạch, task, phụ thuộc và danh sách test case nằm ở [`PLAN.md`](PLAN.md); file này chỉ ghi việc **đã làm** để sau này giải thích lại được (luồng chạy, test nào pass, chỗ nào phát sinh vấn đề). Giữ vĩnh viễn trong repo, không xoá sau khi merge. **Người làm scope này: Đại (`MaxTrann`); Trung (`junUTE`) review.** Các điểm chạm file của Trung cần Trung xác nhận (mục 5).

**Cách ghi**
- Thêm một dòng mới **sau mỗi task** (mã task `P*`, `B*`, `F*`, `D*`, `X*` theo PLAN.md mục 6; ngoài file này luôn viết "reschedule B4" để không nhầm với booking B4), mới nhất ở cuối.
- "Test case": liệt kê mã test case ở mục 7 của PLAN.md; "Kết quả": `Pass` / `Fail` / `Một phần` (ghi rõ ca nào ở cột cuối). Ca `Fail` phải có dòng sau ghi cách xử lý và lần chạy lại.
- Ca đồng thời ghi thêm số vòng chạy và số lỗi 1213/1205/503 đo được; sau mỗi ca đồng thời ghi kết quả INV-1…INV-10 và IVT-01…IVT-07.
- Đổi kế hoạch khi đang làm thì sửa `PLAN.md`; ghi lý do ở cột cuối của dòng tương ứng.
- Câu hỏi Q1 trở đi (PLAN.md mục 4.2) được trả lời thì ghi vào mục 3 **kèm chữ "ĐÃ TRẢ LỜI (ngày, Đại trả lời trực tiếp)"** rồi bỏ thẻ `[CHỜ Qn]` trong PLAN.md. **Không ghi "ĐÃ TRẢ LỜI" khi Đại chưa trả lời trực tiếp** (tin của phiên kiểm độc lập chỉ duyệt kế hoạch từng giai đoạn và trả lời câu kỹ thuật, không trả lời câu cho nhóm). Câu chạm file của Trung ghi tên người xác nhận.
- Số đo thật (PLAN.md mục 5.14) ghi ở mục 6; việc còn chờ module khác ghi ở mục 7 cho tới khi module đó có mã.
- Khi cả scope xong: thêm **đúng một dòng** vào `docs/TRACKING.md` ở gốc, trỏ sang file này.

## 1. Nhật ký

| Ngày | Việc đã làm | Test case | Kết quả | Vấn đề phát sinh / cách xử lý |
|---|---|---|---|---|
| 24/11/2026 | **Lập kế hoạch scope #9, giai đoạn 1** (Đại `MaxTrann` với Claude Code, Claude Sonnet 5.5; nhánh `docs/reschedule-plan`, worktree `clinix-app-doctor-exam`, `origin/main` `412c0c2`). Đọc nguyên văn 2.4.9, 2.4.30, 2.4.31 và các use case hệ thống 2.4.36, 2.4.60, 2.4.61, 2.4.62, 2.4.68, 2.4.69, 2.4.70, 2.4.75 (bằng `python-docx`, chỉ đọc), cùng 2.1_2.2, 1.3, 1.2.1; đối chiếu `docs/database/*`, `docs/features/booking/PLAN.md` (5.2, 5.3, 5.4, 5.6, 5.10, 5.12), payment PLAN (Q11, Q22, E13), `docs/TECH_DEBT.md` dòng 147, 148, 260, và mã `apps/api/src/appointments/`, `payment/ports/payment-chain.ts`, `audit/`, `admin/entities/`, `apps/web/src/features/{booking,search,doctor}`. **Hỏi Đại bằng ba hộp câu hỏi** (4, 3 và 4 câu): Q1 đến Q7, Q9 đến Q12 đã trả lời (mục 3.1). Tạo `PLAN.md` (mục 0 đến 10, Phụ lục A và B nguyên văn) và file này. **Không** chạy `npm`, test, build, Docker, MySQL; **không** sửa file nào khác; **không** lệnh git ghi. | — (tài liệu; chưa có mã) | — | **Phát hiện khi đối chiếu (đã nêu ở PLAN 3.3, chưa tự chọn bên nào):** (1) 2.4.9 b5 giữ chỗ 15 phút trước màn xác nhận, mã đặt lịch chưa giữ lúc chọn khung giờ; (2) 2.4.9 b9 và 2.4.31 b6 viết "chuyển lịch hẹn" nhưng hậu điều kiện, schema và quyết định 16/10 là "tạo lịch mới"; (3) `ly_do_yeu_cau NOT NULL` nhưng 2.4.9 không có bước nhập lý do; (4) không có cột đếm số lần tự đổi dù 2.4.9 nói "tăng bộ đếm"; (5) 2.4 không có hạn đổi theo giờ (hai lỗ hổng); (6) 2.4.70 liệt kê 10 hành động nhạy cảm còn 2.1_2.2 ghi "8 hành động" (lệch từ trước, không do scope này); (7) 1.2.1 ghi hoàn tiền khi "đổi lịch hợp lệ" trái 2.4.9 (không giao dịch mới); (8) `audit-validation.ts` chưa có luật cho `XuLyDoiLichNgoaiChinhSach` dù ENUM đã có. Phiên kiểm độc lập (`Repo, Docker CI/CD…`) **không** dùng: mọi câu quyết định sản phẩm và schema hỏi trực tiếp Đại. |

## 2. Kết quả test theo use case (mã ở PLAN.md mục 7; **chưa chạy ca nào**)

| Nhóm | Mã | Số ca | Task | Trạng thái |
|---|---|---|---|---|
| Bộ luật "đổi được không" | KDL-01…KDL-19 | 19 | B2 | chưa chạy |
| Bệnh nhân tự đổi và gửi yêu cầu (2.4.9) | DLH-01…DLH-23 | 23 | B4, B5, B6 | chưa chạy |
| Lễ tân đổi hộ (2.4.30) | DLO-01…DLO-10 | 10 | B7 | chưa chạy |
| Xử lý yêu cầu ngoài chính sách (2.4.31) | XDL-01…XDL-16 | 16 | B5, B8, B9 | chưa chạy |
| Đồng thời | TDL-01…TDL-18 | 18 | X2 | chưa chạy |
| Quyền và phạm vi | QDL-01…QDL-06 | 6 | B6, B7, B8 | chưa chạy |
| Migration và schema | MDL-01…MDL-07 | 7 | P1 | chưa chạy |
| Thông báo và nhật ký | NDL-01…NDL-08 | 8 | B3, P2, B7, B9 | chưa chạy |
| Hợp đồng và cổng | HDL-01…HDL-11 | 11 | B1, B4, B6 | chưa chạy |
| Bảo mật dữ liệu và log | BDL-01…BDL-05 | 5 | B3, B6, B7, B9 | chưa chạy |
| Giao diện Bệnh nhân | WDH-01…WDH-10 | 10 | F1, F2 | chưa chạy |
| Giao diện Lễ tân đổi hộ | WDO-01…WDO-06 | 6 | F3 | chưa chạy |
| Giao diện xử lý yêu cầu | WXD-01…WXD-14 | 14 | F4, F5 | chưa chạy |
| Kiểm tay | KTD-01…KTD-12 | 12 | X3 | chưa chạy |
| **Tổng** | | **165** | | **0 đã chạy** |

Đột biến bắt buộc (PLAN 5.14): 18, chưa chạy. Bất biến mới INV-7 đến INV-10: chưa viết.

## 3. Quyết định đã chốt

### 3.1 Quyết định của nhóm cho scope này

**Đại trả lời trực tiếp ngày 24/11/2026**, qua ba hộp câu hỏi trong phiên lập kế hoạch (mỗi câu có đề xuất kèm theo; **Q6 và Q9 chọn khác đề xuất**, các câu còn lại theo đề xuất):

| Q | Quyết định | Ghi chú |
|---|---|---|
| Q1 | **ĐÃ TRẢ LỜI (24/11/2026, Đại trả lời trực tiếp): thêm cột `lich_hen.so_lan_tu_doi_lich`.** Lịch mới = cũ + 1 khi tự đổi, bằng cũ khi đổi hộ hoặc duyệt | Kiểu `int NOT NULL DEFAULT 0` + CHECK là `[đề xuất]` của AI; migration và ba file `docs/database/*` ở reschedule P1 |
| Q2 | **ĐÃ TRẢ LỜI (24/11/2026, Đại trả lời trực tiếp): nguyên tử một bước lúc xác nhận** (không giữ chỗ 15 phút khi xem màn xác nhận) | Khác chữ 2.4.9 b5; `[ĐỒNG BỘ TL]` sửa 2.4.9 và 2.4.30 |
| Q3 | **ĐÃ TRẢ LỜI (24/11/2026, Đại trả lời trực tiếp): chặn theo giờ hẹn cũ, không thêm cấu hình** (Bệnh nhân: chưa tới giờ hẹn cũ; Lễ tân và duyệt: tới hết cửa sổ tiếp đón `check_in_sau_phut`) | Lỗ hổng hoàn cọc theo giờ hẹn mới còn, ghi nợ (mục 4.2) |
| Q4 | **ĐÃ TRẢ LỜI (24/11/2026, Đại trả lời trực tiếp): khoá `lich_hen` rồi kiểm ở service**, tối đa một `ChoDuyet` mỗi lịch, không thêm UNIQUE ở DB | Test đồng thời TDL-16 thay lưới DB |
| Q5 | **ĐÃ TRẢ LỜI (24/11/2026, Đại trả lời trực tiếp): thêm cột `thong_bao.yeu_cau_doi_lich_ngoai_chinh_sach_id`** + FK + UNIQUE | Thông báo của yêu cầu để `lich_hen_id` NULL |
| Q6 | **ĐÃ TRẢ LỜI (24/11/2026, Đại trả lời trực tiếp), KHÁC đề xuất: thêm ENUM `DoiLichHo` vào `nhat_ky_hanh_dong.hanh_dong` và ghi Audit mọi lần Lễ tân đổi hộ** | Đề xuất ban đầu là không ghi Audit. Cần P1, P2, `[ĐỒNG BỘ TL]` 2.4.70, 2.1_2.2, 1.2.1, 1.3; `[CHỜ Trung]` |
| Q7 | **ĐÃ TRẢ LỜI (24/11/2026, Đại trả lời trực tiếp): đồng ý toàn bộ (a) đến (j)** | Nội dung từng mục ở PLAN 4.2 dòng Q7 |
| Q9 | **ĐÃ TRẢ LỜI (24/11/2026, Đại trả lời trực tiếp), KHÁC đề xuất: Lễ tân đổi hộ bắt buộc nhập lý do 1 đến 255 ký tự** | Đề xuất ban đầu là không nhập. Hệ quả `[đề xuất]`: lý do vào Audit `DoiLichHo.ly_do` và vào thông báo cho bệnh nhân (Đại sửa khi duyệt PR nếu không muốn) |
| Q10 | **ĐÃ TRẢ LỜI (24/11/2026, Đại trả lời trực tiếp): ghi chú xử lý gửi nguyên văn cho bệnh nhân** (cả duyệt và từ chối) | Ô nhập của nhân sự có dòng nhắc |
| Q11 | **ĐÃ TRẢ LỜI (24/11/2026, Đại trả lời trực tiếp): hai tab Chờ duyệt và Đã xử lý** | |
| Q12 | **ĐÃ TRẢ LỜI (24/11/2026, Đại trả lời trực tiếp): `thoi_diem_tao` của lịch mới = lúc đổi; báo cáo loại lịch có `lich_hen_truoc_id`** | Ghi ở mục 7 cho module báo cáo |

**Còn mở (chưa ai trả lời, không có chữ "ĐÃ TRẢ LỜI"):** Q8 (giá trị `so_lan_tu_doi_lich_toi_da` và `check_in_sau_phut`, `[cần điền]`), Q13 (mã sự kiện, câu chữ, mã lỗi `[đề xuất]`; duyệt khi review PR), Q14 (hạn mức giờ mỗi tuần và Iteration của Đại, `[cần điền]`), Q15 (có Excel của Trung cần đồng bộ không, `[cần điền]`), Q16 (Trung xác nhận các điểm chạm file của Trung; approve PR tài liệu coi là xác nhận).

### 3.2 Quyết định kế thừa từ module khác (không bàn lại; nguồn ở PLAN.md 4.1)

`AppointmentTransitionService` và `SlotHoldService` là nơi duy nhất ghi `lich_hen.trang_thai` và `khung_gio` (booking H7); thứ tự khoá 5.3 của booking (mở rộng, không đảo); payment E13: giao dịch thanh toán và hoàn tiền trỏ lịch gốc, đổi lịch không tạo giao dịch; admin Q6, Q48: chặn đặt **và đổi** vào vùng bị loại bởi thay đổi chi nhánh; Q31 booking: Bệnh nhân không thấy lịch `DaDoiLich`; quy tắc DB 2, 3, 4, 27, 29, 35.

## 4. Ghi chú AI

**Phiên này KHÔNG sửa `AI_USAGE_LOG.md` và `docs/TECH_DEBT.md`** (Đại quyết ghi ở PR sau). Dưới đây là **bản nháp** (kiểm lại số lớn nhất trên `main` lúc ghi: lúc soạn `origin/main` có đến dòng AI log 180 và `AI-BUG-081`; Đại giữ dòng 181 cho cửa sổ khác, nên nháp dùng 182; TECH_DEBT lớn nhất là dòng 265 nên nháp từ 266).

### 4.1 Nháp dòng AI log (bảng 1, mười cột)

| # | Ngày | Người dùng | Công cụ / model | Phạm vi (module/file) | Prompt chính | Phần AI sinh | Phần tự sửa/viết | Cách kiểm chứng | Commit/PR |
|---|------|-----------|-----------------|-----------------------|--------------|--------------|------------------|-----------------|-----------|
| 182 | 24/11/2026 | MaxTrann | Claude Code (Claude Sonnet 5.5) | `docs/features/reschedule/PLAN.md`, `docs/features/reschedule/TRACKING.md` (MỚI; chỉ hai file này; kế hoạch scope #9 đổi lịch hẹn) | Lập kế hoạch (chỉ tài liệu, không viết mã) cho scope #9 "Đổi lịch hẹn" của module `booking`: ba use case 2.4.9, 2.4.30, 2.4.31 và phần hệ thống chúng chạm; đối chiếu 2.4 với schema, PLAN booking, payment và mã; hỏi Đại các quyết định sản phẩm và schema | Toàn bộ PLAN (mục 0 đến 10, 165 mã test case, 20 task, 98 giờ) và TRACKING; Phụ lục A và B sao chép bằng script từ file Word; bản nháp commit, PR, AI log, nợ kỹ thuật | Đại trả lời trực tiếp ba hộp câu hỏi (Q1 đến Q7, Q9 đến Q12; Q6 và Q9 khác đề xuất); PLAN còn chờ Đại và Trung duyệt | Đọc nguyên văn 2.4 bằng `python-docx` (chỉ đọc); đối chiếu từng số dòng DDL, tên hàm, đường dẫn tệp trong PLAN với mã trên `origin/main` `412c0c2`; script kiểm tiêu đề PR ≤ 100 ký tự, số cột bảng, tên mã test case không trùng; không chạy `npm`, test, build, Docker, MySQL; không lệnh git ghi | `[cần điền]` (PR tài liệu của Đại) |

### 4.2 Nháp dòng nợ kỹ thuật (từ 266; chỉ ghi khi lối tắt có thật trong mã; cột: STT | Ngày | Mô tả | Nguyên nhân | Hậu quả | Cách xử lý, bắt đầu lại khi | Trạng thái)

| STT | Ngày | Mô tả | Nguyên nhân | Hậu quả | Xử lý | Trạng thái |
|---|---|---|---|---|---|---|
| 266 | `[ngày merge B4]` | **Đổi lịch sát giờ sang ngày xa rồi huỷ lấy hoàn cọc theo giờ hẹn mới** (reschedule Q3; PLAN R3): mốc hoàn của `chinh_sach_hoan_snapshot` tính theo giờ hẹn của lịch MỚI | Use case không có hạn đổi theo giờ; Đại chọn không thêm cấu hình số giờ tối thiểu | Lịch 1 giờ nữa (hoàn 0%) đổi sang ngày xa rồi huỷ hoàn 100% | Thêm `cau_hinh_he_thong.so_gio_toi_thieu_doi_lich` (chặn đổi sát giờ), hoặc tính hoàn theo giờ hẹn gốc của chuỗi | Mở |
| 267 | `[ngày merge B9]` | **Yêu cầu đổi lịch tồn không tự đóng** khi lịch gốc bị huỷ, đã tiếp đón, Vắng mặt, đã đổi hộ hay quá giờ (reschedule Q7 (g); PLAN R6): ENUM không có trạng thái "Hết hạn" | Đại chọn không tự đóng | Danh sách "Chờ duyệt" còn dòng không duyệt được (`coTheDuyet = false`), nhân sự phải từ chối thủ công | Job dọn hoặc đóng ở luồng huỷ (cần giá trị ENUM mới hoặc từ chối tự động có ghi chú) | Mở |
| 268 | `[ngày merge B4]` | **Đổi lịch × huỷ, tiếp đón, xác nhận cùng một lịch có thể 1213 nội bộ** (khoá S ngầm của khoá ngoại `lich_hen.benh_nhan_id`, cùng loại rủi ro đã chấp nhận ở booking B12 R, TECH_DEBT dòng 113); số lần đo ở TDL-04, TDL-17 | Đổi lịch xin `benh_nhan` X (tầng 2) trước `khung_gio` và `lich_hen` để tuần tự với `create` | `withBookingTransaction` chạy lại, kết quả đúng; 503 chỉ khi ba lần liền | Hướng (i) hay (ii) của dòng 113 khi Đại quyết | Mở |
| 269 | `[ngày merge B4]` | **Mã lịch hẹn cũ hết dùng được sau đổi lịch** (404 với Bệnh nhân; reschedule PLAN L9, R7): liên kết trong thư xác nhận ban đầu và nhắc lịch gửi trước chết | Q31 booking ẩn `DaDoiLich`; lịch mới có mã mới (UNIQUE) | Bệnh nhân bấm liên kết cũ ra 404 | Trang thân thiện "lịch đã được đổi" kèm mã mới (cần chuỗi cha-con ở API), hoặc giữ mã cũ cho chuỗi (đổi schema) | Mở |
| 270 | `[SAU]` | **Chi tiết nhân sự (Lễ tân, Quản trị viên) chưa hiện liên kết "đã đổi từ / sang" của chuỗi đổi lịch** | Ngoài phạm vi 2.4.30 và 2.4.31 | Khó truy vết lịch trước và sau đổi từ giao diện | Thêm hai khoá `lichHenTruoc` và `lichHenSau` (danh sách trắng) ở chi tiết nhân sự | Mở |

Cập nhật dòng có sẵn khi mã có: **dòng 260 → Đã đóng** (reschedule B4 gọi `findBlocking` cho khung giờ đích dưới khoá, KDL-17 và HDL-05); **dòng 147** thêm "khung giờ giải phóng do đổi lịch cũng chưa mời ai" (waitlist `Noop`).

### 4.3 Nháp lỗi AI (`AI-BUG-083`, `[đề xuất]`; chỉ ghi nếu Đại muốn, vì cả hai lỗi do AI tự phát hiện và sửa trước khi giao, chưa vào commit nào)

| Mã | Ngày | Mô tả | Cách phát hiện | Cách sửa |
|---|---|---|---|---|
| `AI-BUG-083` | 24/11/2026 | Ở reschedule (lập kế hoạch, MaxTrann, Claude Code Claude Sonnet 5.5): ba sai sót trong bản nháp PLAN, đều sửa trước khi giao: (1) ghi tên tệp prompt `Prompt_Doi_Lich_2026-11-24` trong đầu PLAN trong khi Đại chỉ dán nội dung vào phiên (bịa tên nguồn, vi phạm AGENTS mục 1.4); (2) tính số ô ma trận trạng thái sai khi thêm actor `DoiLich` ("294 ô: 22 → 23") thay vì 7 × 7 × 7 = 343 ô; (3) ghi sai khoá ngoại của bảng yêu cầu ("FK `lich_lam_viec`"; FK thật tới `lich_hen`, `khung_gio`, `tai_khoan`) | tự rà lại khi đối chiếu với `appointment-state.matrix.ts` và DDL trước khi tạo file | sửa cả ba chỗ ở PLAN trước khi ghi vào repo |

## 5. Phối hợp với module khác

| Với | Điểm | Cần gì | Trạng thái |
|---|---|---|---|
| Trung (admin, `database`) | P1: cột `lich_hen.so_lan_tu_doi_lich`, `thong_bao.yeu_cau_doi_lich_ngoai_chinh_sach_id` + UNIQUE, ENUM `DoiLichHo`, entity `YeuCauDoiLichNgoaiChinhSach`, `enums.ts`, ba file `docs/database/*`, `database/entities.ts`, `migrations/index.ts` | `[CHỜ Trung]` (Trung approve PR tài liệu coi là xác nhận); báo Trung trước khi merge P1 | chờ |
| Trung (audit) | P2: luật kiểm `XuLyDoiLichNgoaiChinhSach` và `DoiLichHo` ở `audit-validation.ts`, `audit-entry.ts` | `[CHỜ Trung]`; mô hình `chi_tiet_thay_doi` ở PLAN 5.11 | chờ |
| Trung (search) | F1: prop `onSelect` ở `SlotCell` và `DoctorSlotGrid` (mặc định giữ liên kết) | `[CHỜ Trung]` | chờ |
| Trung (doctor) | F5: bật tab "Yêu cầu đổi lịch" ở `ApprovalsHostPage`, sửa ca WA-13, theo nếp D8 | `[CHỜ Trung]` | chờ |
| payment, wallet | không đổi mã; HDL-03, HDL-04 chạy với lớp thật; `PaymentChain.MAX_CHAIN_DEPTH` làm trần chuỗi | báo Trung khi chuỗi dài làm đổi hành vi | không cần xác nhận |
| waitlist (#11) | `WaitlistPort.onSlotReleased` gọi sau đổi lịch; `Noop` hiện nay | chạy lại DLH-13, DLH-14 khi có mã | `[CHỜ waitlist]` (không chặn) |
| notification (Trung tâm thông báo, nhắc lịch) | bốn sự kiện mới; nhắc lịch tính mốc cho lịch mới | module sau đọc mục 7 | ghi chú |
| báo cáo (sau) | lịch có `lich_hen_truoc_id` không phải "lượt đặt" mới (Q12) | module báo cáo đọc mục 7 | ghi chú |

## 6. Số đo thật (PLAN.md mục 5.14, task X1; **tiêu chí đặt TRƯỚC khi chạy, không đổi sau khi thấy số**; chưa đo)

| Mã | Câu hỏi | Tiêu chí đạt | Kết quả |
|---|---|---|---|
| M1 | Hoán vị khung giờ X↔Y: id tăng dần có deadlock không; đối chứng cũ-rồi-mới | tăng dần 0 lần 1213/1205 trong 300 vòng; đối chứng có ít nhất một 1213 | chưa đo |
| M2 | `INSERT` yêu cầu xin khoá S ngầm nào, theo thứ tự nào | khẳng định hay bác bỏ giả thiết R2; chọn thứ tự an toàn | chưa đo |
| M3 | EXPLAIN danh sách yêu cầu theo phạm vi chi nhánh ở 100.000 yêu cầu | `range` hoặc `ref`, không `filesort` | chưa đo |
| M4 | `PaymentChain` ở độ sâu 19 | một câu, thời gian ghi nhận | chưa đo |
| M5 | Khoá S ngầm khi `UPDATE lich_hen SET trang_thai` mà đã giữ X trên `benh_nhan` | không thêm chờ | chưa đo |
| M6 | Cặp "đổi × áp dụng thay đổi chi nhánh" của admin | có hay không chu trình | chưa đo |
| M7 | `ALTER … MODIFY ENUM` trên `nhat_ky_hanh_dong` | thuật toán và thời gian ghi nhận | chưa đo |

## 7. Cảnh báo và việc chờ module khác (cập nhật khi module đó có mã)

- **`waitlist` còn `Noop`:** khung giờ cũ được giải phóng nhưng không mời ai; khi #11 có mã, chạy lại DLH-13, DLH-14 với bản thật và cập nhật dòng TECH_DEBT 147.
- **Báo cáo (module sau):** lịch mới do đổi lịch có `thoi_diem_tao` = lúc đổi và `lich_hen_truoc_id` khác NULL; khi đếm "lượt đặt lịch" phải loại các lịch này (Q12).
- **Nhắc lịch (`nhac_lich_hen`) và Trung tâm thông báo (module sau):** nhắc lịch tính mốc cho lịch **mới** và bỏ qua lịch `DaDoiLich` (2.4.69 A2); chuông thông báo hiển thị bốn sự kiện mới khi module có.
- **Đồng bộ tài liệu ngoài repo (D2, Đại):** 2.4.9, 2.4.30, 2.4.31, 2.4.70, 2.1_2.2, 1.2.1, 1.3.6 (danh sách chi tiết ở PLAN 4.5).
- **Cấu hình:** `so_lan_tu_doi_lich_toi_da` và `check_in_sau_phut` còn `[cần điền]` (Q8); chưa có giá trị thì đổi lịch trả `HE_THONG_CHUA_CAU_HINH`.
- **Yêu cầu tồn** (R6) và **liên kết cũ trong thư** (R7): ghi nợ kỹ thuật ở mục 4.2 khi mã có.
