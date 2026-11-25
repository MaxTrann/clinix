# Kế hoạch scope #9: `booking` đổi lịch hẹn (Đổi lịch hẹn của Bệnh nhân, Đổi lịch hẹn hộ bệnh nhân của Lễ tân, Xử lý yêu cầu đổi lịch ngoài chính sách của Lễ tân và Quản trị viên)

> **Trạng thái: bản nháp 1, giai đoạn 1 (24/11/2026). Đại đã trả lời trực tiếp MƯỜI MỘT quyết định** (ba hộp câu hỏi trong phiên lập kế hoạch: Q1 đến Q7 và Q9 đến Q12; **Q6 và Q9 khác đề xuất**, còn lại theo đề xuất; ghi ở [`TRACKING.md`](TRACKING.md) mục 3.1). Còn mở: Q8, Q13 đến Q16 (mục 4.2), các `[cần điền]` ở 4.3 và việc ngoài repo ở 4.5. Chưa mở PR; **chưa tạo issue** (danh sách issue đề xuất ở mục 6.6; Đại tự chạy script tạo issue sau khi PR tài liệu merge và các `[CHỜ …]` có xác nhận).
> **Người LÀM scope này: Đại (`MaxTrann`), module `booking`; Trung (`junUTE`) review.** Điểm chạm file của Trung gắn `[CHỜ Trung]` (Trung approve PR tài liệu coi là xác nhận, nếp payment P1): `audit/`, `admin/entities/` và `database/`, `features/search/slots/`, `features/doctor/admin/approvals/`.
> Kế hoạch do AI (Claude Code, model Claude Sonnet 5.5) lập theo [`docs/FEATURE_PLANNING_PROMPT.md`](../../FEATURE_PLANNING_PROMPT.md) và prompt lập kế hoạch scope #9 do Đại dán vào phiên ngày 24/11/2026 → **ghi nhật ký AI cho lần lập kế hoạch này ở `AI_USAGE_LOG.md`: dòng `[đề xuất]` 182** (kiểm lại số lớn nhất trên `main` lúc ghi; lúc soạn: `origin/main` có đến dòng 180, dòng 181 do cửa sổ khác giữ; bản nháp dòng ở [`TRACKING.md`](TRACKING.md) mục 4). **Phiên này KHÔNG sửa `AI_USAGE_LOG.md` và `docs/TECH_DEBT.md`** (chỉ soạn nháp, Đại quyết ghi ở PR sau).
> Đã kiểm mã thật trên `origin/main` ở **`412c0c2`** (23/11/2026, PR 630, booking B16b). Chỗ nào ghi **"chưa đo"** là suy ra từ mã hay tài liệu, **chưa chạy thử** trên MySQL thật; danh sách việc phải đo nằm ở mục 5.14 và gom vào task X1. Phiên này **không chạy** `npm`, test, build, Docker hay MySQL và **không sửa** file nào ngoài hai file mới `docs/features/reschedule/PLAN.md`, `TRACKING.md`.
> Scope này là **#9** trong lộ trình 15 scope, sau `payment` và `wallet` (#7, đã có mã) và `doctor` phần khám bệnh (#8, đã có mã); sau nó là thông báo (Trung tâm thông báo, nhắc lịch), danh sách chờ (#11), báo cáo, chat, AI. **Mã nằm trong `apps/api/src/appointments/reschedule/`** (cùng `AppointmentsModule` vì H7: chỉ `appointments/` ghi `lich_hen.trang_thai` và `khung_gio.trang_thai`); scope commit là `booking`.

## 0. Quy ước đọc

- Tên use case viết tắt, **trùng tiền tố mã test** (quét ngày 24/11/2026 bằng `grep` trên `docs/` và `apps/`: chưa ai dùng; danh sách đầy đủ ở mục 7): **DLH** = Đổi lịch hẹn (Bệnh nhân, 2.4.9); **DLO** = Đổi lịch hẹn hộ bệnh nhân (Lễ tân, 2.4.30); **XDL** = Xử lý yêu cầu đổi lịch ngoài chính sách (2.4.31); **KDL** = bộ luật "đổi được không"; **TDL** = đồng thời; **QDL** = quyền và phạm vi; **MDL** = migration; **NDL** = thông báo và nhật ký; **HDL** = hợp đồng và cổng; **BDL** = bảo mật dữ liệu và log; **WDH**, **WDO**, **WXD** = giao diện Bệnh nhân, Lễ tân đổi hộ, xử lý yêu cầu; **KTD** = kiểm tay. `b4` = bước (4); `A1/5b` = luồng thay thế A1, mục 5b; "MT" = Mô tả; "TĐK" = tiền điều kiện; "HĐK" = hậu điều kiện. Nguyên văn ba use case ở **Phụ lục A**, các use case hệ thống liên quan ở **Phụ lục B** (sao chép bằng script, không gõ lại). **Dự án không dùng Use Case ID**, chỉ tên.
- Nguồn đúng khi lệch nhau: **schema DB (`docs/database/`) để code**; chỗ 2.4, schema, Figma và mã lệch nhau ở mục 3.3 và 3.4, đã hỏi ở mục 4.2. **Không tự chọn bên nào** (AGENTS mục 1.6). Figma chỉ là bản phác thảo: **không đề xuất đồng bộ lại Figma**; mã và PLAN là nguồn đúng.
- Thẻ: `[ĐỒNG BỘ TL]` = task phải sửa tài liệu (2.4 và các file Word ở repo `TLCN_CLINIX`, `docs/database/*` cả ba file) trong **cùng PR** (file Word do Đại sửa, ngoài repo này); `[TIỀN ĐỀ]` = việc nền; `[CHỜ Qn]` = chờ câu hỏi Qn; `[CHỜ Trung]` = cần Trung xác nhận; `[CHỜ Đại]` = cần Đại xác nhận; `[CHỜ <module>]` = chờ module đó có mã; `[ĐỤNG x]` = sửa file thuộc module x (báo người sở hữu); `[ĐỤNG router]` = `router/role-nav.ts`, `router/role-routes.tsx`; `[ĐỤNG shared]` = `shared/**`; `[ĐỤNG database]` = `database/entities.ts`, `database/migrations/index.ts`, `app.module.ts`; `[SOẠN TRƯỚC]` = viết được ngay nhưng **chưa merge** khi phụ thuộc chưa có; `[SAU]` = ngoài scope này, ghi để không quên.
- Mỗi task = **một PR** nhỏ, **chỉ backend HOẶC chỉ frontend**, khoảng 3 đến 6,5 giờ làm; scope commit `booking` (hạ tầng: `api`, `web`, `db`, `docs`; module khác bị chạm: `admin`, `audit`, `search`, `doctor`). Test đặt cạnh mã; mỗi test ghi mã test case. Mã task: `P` nền, `B` backend, `F` frontend, `D` đồng bộ tài liệu, `X` đo thật, kiểm tay và tổng kết. Task có khoá, giao dịch hay đồng thời gắn mức kiểm **ĐẦY ĐỦ** (đột biến, `test:int` và `test:e2e`, ca đồng thời chạy một mình, EXPLAIN cho câu SQL mới); task web gắn mức **GỌN** (đột biến web bốn loại: kho trình duyệt/URL/log, bấm đúp, tính toán ở client, chặn theo trạng thái; không chạy tay jscpd và gitleaks, CI đo).
- `[đề xuất]` = giá trị AI tự đề xuất, chưa chốt; `[cần điền]` = thiếu thông tin, chưa có đề xuất. **Cuối mục 4.3 liệt kê lại cả hai loại.**
- **Thuật ngữ:** "lịch cũ" = lịch hẹn bị thay (`DaXacNhan` trước đổi, `DaDoiLich` sau đổi); "lịch mới" = lịch hẹn sinh ra, `lich_hen_truoc_id` = lịch cũ; "chuỗi đổi lịch" = các lịch nối nhau bằng `lich_hen_truoc_id`; "lịch gốc" = đầu chuỗi (`PaymentChain.rootOf`); "tự đổi" = Bệnh nhân tự đổi trong hạn mức; "đổi hộ" = Lễ tân đổi; "duyệt" = Lễ tân hoặc Quản trị viên duyệt yêu cầu ngoài chính sách.

## 1. Phạm vi

**Làm (ba use case, theo `docs/PLAN.md` scope #9):**

| Use case | Tác nhân | Việc chính của scope | Đường vào |
|---|---|---|---|
| **2.4.9 Đổi lịch hẹn** | Bệnh nhân | Xem trước (còn mấy lần tự đổi, khung giờ mới có đổi được không); **tự đổi** khung giờ của lịch `DaXacNhan` (giữ nguyên bác sĩ, dịch vụ): tạo lịch mới liên kết lịch cũ, lịch cũ `DaDoiLich`, giải phóng khung giờ cũ, tăng bộ đếm; **vượt hạn mức** thì tạo yêu cầu ngoài chính sách `ChoDuyet` kèm lý do | nút "Đổi lịch" ở chi tiết "Lịch hẹn của tôi" |
| **2.4.30 Đổi lịch hẹn hộ bệnh nhân** | Lễ tân (chi nhánh được gán) | Xem trước và **đổi hộ** không giới hạn số lần, không tính vào số lần tự đổi; ghi Audit `DoiLichHo` (Q6) kèm lý do (Q9) | nút "Đổi lịch hộ" ở chi tiết Quản lý lịch hẹn của Lễ tân |
| **2.4.31 Xử lý yêu cầu đổi lịch ngoài chính sách** | Lễ tân (chi nhánh), Quản trị viên (Toàn hệ thống: tất cả; Chi nhánh: chi nhánh được gán) | Danh sách (hai tab, Q11), chi tiết, **duyệt** (giữ khung giờ mới trước, lịch cũ `DaDoiLich`, có thể chọn khung giờ thay thế) hoặc **từ chối**, ghi chú bắt buộc, Audit `XuLyDoiLichNgoaiChinhSach`, thông báo bệnh nhân | trang "Yêu cầu đổi lịch" của Lễ tân; tab "Yêu cầu đổi lịch" trong "Duyệt yêu cầu" của Admin |

**Cùng phần hệ thống chúng chạm (phần của scope, không phải use case riêng):** giữ chỗ và chống trùng (2.4.61: **dùng lại**, thêm đường đổi); tính khung giờ trống (2.4.60: dùng lại `GET /public/doctor-slots`); gửi thông báo theo sự kiện và email (2.4.68, 2.4.75: thêm bốn sự kiện); ghi nhật ký hành động nhạy cảm (2.4.70: thêm `DoiLichHo`, thêm luật kiểm cho `XuLyDoiLichNgoaiChinhSach`); mời danh sách chờ khi khung giờ trống (2.4.62: **chỉ gọi cổng** `WaitlistPort.onSlotReleased`, đang `Noop`); hoàn và chuyển cọc (2.4.66, payment: **không có mã mới**, chỉ chứng minh lịch mới dùng đúng cọc của lịch gốc).

**Không làm (module khác hoặc sau; chỉ nêu cổng ở mục 5.9):**
- Quản trị viên **đổi hộ trực tiếp** (2.4.30 chỉ có Lễ tân; Quản trị viên chỉ xử lý yêu cầu; Q7 (i)). Đổi bác sĩ, dịch vụ hay chi nhánh khi đổi lịch (2.4.9: muốn đổi phải huỷ và đặt lịch mới).
- Đổi lịch lịch `ChoThanhToan` (Q7 (a)); đổi lịch đã `DaTiepDon`, `HoanThanh`, `DaHuy`, `VangMat`.
- **Hoàn hay thu thêm tiền khi đổi:** không có (UC: không tạo giao dịch thanh toán mới; giá, cọc, chính sách hoàn là bản chụp cũ). Chênh lệch giá giữa hai khung giờ không xuất hiện vì giá là snapshot.
- Mời danh sách chờ thật, thông báo trong ứng dụng hiển thị (chuông, Trung tâm thông báo), nhắc lịch theo lịch trình (`nhac_lich_hen`), báo cáo: module sau (mục 5.9 nêu điểm nối).
- Bệnh nhân **rút yêu cầu** đang chờ (Q7 (f)); tự đóng yêu cầu tồn khi lịch gốc bị huỷ hay quá giờ (Q7 (g), ghi nợ).
- Hiển thị liên kết "lịch đã đổi từ / sang" trong chi tiết nhân sự: `[SAU]` (một dòng, nếu Đại muốn).
- Đồng bộ lại Figma: không (Figma chỉ phác thảo).

### 1.1 Bảng use case → luồng, điều kiện, ngoại lệ → thành phần mã sẽ chạm

Cột "Luồng" ghi số bước và mã luồng thay thế theo nguyên văn Phụ lục A. Tên tệp là nơi **sẽ** tạo hoặc sửa (`reschedule/` = `apps/api/src/appointments/reschedule/`); "đã có" = dùng lại, không sửa.

| UC | Luồng, điều kiện, ngoại lệ (nguyên văn rút gọn) | Thành phần mã | Task |
|---|---|---|---|
| 2.4.9 | TĐK: Bệnh nhân sở hữu lịch (bản thân hoặc hồ sơ người thân), lịch `DaXacNhan` | `reschedule/reschedule.reader.ts`, `reschedulability.rules.ts` (trạng thái, sở hữu qua `benh_nhan_id`; hồ sơ người thân ngừng ⇒ 409); `@Roles('BenhNhan')` | B2, B6 |
| 2.4.9 | b2, A3: lịch không `DaXacNhan` ⇒ từ chối kèm lý do | `LICH_HEN_KHONG_CHO_DOI` (mục 5.13); Bệnh nhân với `DaDoiLich` ⇒ 404 cùng thân (Q31 booking) | B2, B6 |
| 2.4.9 | b2 đếm số lần đã tự đổi; b8, A2: đạt hạn mức ⇒ không đổi, tạo yêu cầu | cột mới `lich_hen.so_lan_tu_doi_lich` (Q1), `cau_hinh_he_thong.so_lan_tu_doi_lich_toi_da` qua `SystemConfigService`; `reschedule/requests/create-reschedule-request.service.ts`; `VUOT_SO_LAN_TU_DOI` khi thiếu lý do | P1, B5, B6 |
| 2.4.9 | b3: danh sách khung giờ trống khác của cùng bác sĩ, cùng dịch vụ (2.4.60) | **đã có** `GET /public/doctor-slots` (search K1); web `DoctorSlotGrid` thêm chế độ chọn | F1 `[ĐỤNG search]` |
| 2.4.9 | b5, A1: giữ chỗ khung giờ mới trước khi đụng lịch cũ; tranh chấp hoặc ngoài ngày, giờ nhận khám ⇒ từ chối, giữ nguyên | `AppointmentRescheduleService` (khoá khung giờ mới TRƯỚC khung giờ cũ và lịch cũ, Q2: nguyên tử một bước); dùng `BookabilityReader` và `evaluateBookability` (thêm tham số `thayThe`) | B2, B4 |
| 2.4.9 | b6, b7: màn xác nhận cũ → mới | `GET …/reschedule-preview` (đọc không khoá); web `RescheduleConfirm` | B6, F2 |
| 2.4.9 | b9, HĐK: tạo lịch mới liên kết lịch trước, sao chép giá, cọc, chính sách hoàn; lịch cũ `DaDoiLich`; không giao dịch thanh toán mới; giải phóng khung giờ cũ (có thể mời waitlist); tăng bộ đếm; thông báo | `insertLichHen` (thêm `lichHenTruocId`, `soLanTuDoiLich`), `AppointmentTransitionService.markReplaced`, `SlotHoldService.release`, `WaitlistPort.onSlotReleased` sau commit, `AppointmentNotifier` (`LichHenDaDoiLich`) | B1, B3, B4 |
| 2.4.30 | TĐK: Lễ tân, lịch thuộc chi nhánh được gán, `DaXacNhan` | `reschedule/reception-reschedule.controller.ts`, `ReceptionScopeService` (đã có), 404 cùng thân ngoài phạm vi | B7 |
| 2.4.30 | b3 đến b8, A1, A2: như 2.4.9; HĐK: không giới hạn số lần, không tính vào số lần tự đổi | cùng `AppointmentRescheduleService` với `via: 'DoiHo'` (bộ đếm giữ nguyên); Audit `DoiLichHo` + lý do (Q6, Q9) | B4, B7, P2 |
| 2.4.31 | TĐK: Lễ tân (chi nhánh) hoặc Quản trị viên (phạm vi); có yêu cầu `ChoDuyet` | `reschedule/requests/*-reschedule-requests.controller.ts` (reception, admin), `BranchAccessPolicy` (đã có) | B8 |
| 2.4.31 | b1 đến b3: danh sách, chi tiết (lịch gốc, khung giờ mong muốn, số lần đã tự đổi, lý do) | `RescheduleRequestListService`, danh sách trắng trường; hai tab (Q11) | B8, F4, F5 |
| 2.4.31 | b4, A1: ghi chú bắt buộc | DTO `ghiChu` 1 đến 255 sau chuẩn hoá; 400 khi thiếu; giao diện giữ lựa chọn Duyệt/Từ chối | B9, F4 |
| 2.4.31 | b5, b6, A2: duyệt = giữ chỗ khung giờ mới trước, chỉ khi thành công mới `DaDoiLich`; tranh chấp ⇒ yêu cầu vẫn `ChoDuyet`, chọn khung giờ thay thế hoặc từ chối; Audit; thông báo | `AppointmentRescheduleService` với `via: 'DuyetYeuCau'` (`khungGioId` tuỳ chọn = thay thế), `RescheduleRequestHandleService`, `AuditService` (`XuLyDoiLichNgoaiChinhSach`) | B9, P2 |
| 2.4.31 | b7: từ chối = không giữ chỗ; yêu cầu `TuChoi` kèm ghi chú; Audit; thông báo | cùng service, nhánh không đụng khung giờ | B9 |

### 1.2 Nơi đặt và ranh giới với module khác

- Thư mục mã: `apps/api/src/appointments/reschedule/` (lõi, bộ luật, đọc, preview, controller Bệnh nhân và Lễ tân) và `reschedule/requests/` (yêu cầu ngoài chính sách: tạo, danh sách, chi tiết, duyệt, từ chối). Entity `YeuCauDoiLichNgoaiChinhSach` ở `apps/api/src/admin/entities/` (nếp "entity bảng nền dùng chung một chỗ", booking PLAN 5.1). Web: `apps/web/src/features/booking/appointments/reschedule/` (dùng chung) cộng chỗ cắm ở `patient/`, `reception/`, `admin/` của `features/booking/appointments/`.
- **Không tạo module Nest mới**: lớp mới khai trong `AppointmentsModule` (controller, provider), nhập thêm `SystemConfigModule`, `AuditModule` nếu chưa có.
- Thư mục tài liệu: `docs/features/reschedule/` (theo prompt của Đại). Commit scope `booking`.

## 2. Hiện trạng repo (đã kiểm ở `412c0c2`, 24/11/2026)

| Chỗ | Tình trạng | Nguồn kiểm |
|---|---|---|
| `AppointmentTransitionService` | Có `confirmPaid`, `complete`, `checkIn`, `markNoShow`, `restoreConfirmed`, `expire`, `cancel`; **KHÔNG có `markReplaced`**; ma trận 6 actor (`BenhNhan`, `LeTan`, `QuanTriVien`, `BacSi`, `HeThong`, `ThanhToan`) không có ô nào tới `DaDoiLich` | `state/appointment-state.matrix.ts:27-60`, booking PLAN 5.2 dòng "→ `DaDoiLich`" |
| `lich_hen.lich_hen_truoc_id` | Cột UNIQUE + FK tự tham chiếu đã có ở DDL, migration và entity (`lichHenTruocId`); **không có mã nào ghi nó**; quy tắc 27 ("không tự trỏ chính nó") ghi "CHƯA có mã triển khai" | `admin/entities/lich-hen.entity.ts:40`, `docs/database/clinix_quy_tac_nghiep_vu.md` dòng 82 |
| Bộ đếm số lần tự đổi | **Không có cột nào** (chỉ cấu hình `cau_hinh_he_thong.so_lan_tu_doi_lich_toi_da int NOT NULL`, `[cần điền]`, không DEFAULT; form cấu hình của admin đã đọc và ghi cột này) | `clinix_mysql.sql:346`, `admin/system-config/system-config-params.ts` |
| Bảng `yeu_cau_doi_lich_ngoai_chinh_sach` | **Có trong `clinix_mysql.sql` nhưng CHƯA có migration nào tạo** (sửa 24/11/2026 khi làm reschedule P1: bản đầu ghi nhầm là đã có ở `1793090000000-tao-bang-van-hanh.ts`, migration đó chỉ nhắc tên bảng trong ENUM `loai_doi_tuong`; file SQL có 46 bảng, migration tạo 36; reschedule P1 tạo bảng bằng đúng 8 câu của file SQL); trong file SQL bảng có CHECK `chk_doi_lich_xu_ly`, `chk_doi_lich_nguoi_xu_ly`, chỉ mục `(trang_thai, thoi_diem_tao)`, FK tới `lich_hen`, `khung_gio` và `tai_khoan` (`nguoi_xu_ly_id`); **chưa có entity**; không có UNIQUE chặn nhiều `ChoDuyet` | `clinix_mysql.sql:414-424, 669, 967-975` |
| Audit | ENUM `hanh_dong` đã có `XuLyDoiLichNgoaiChinhSach` và `loai_doi_tuong` đã có `yeu_cau_doi_lich_ngoai_chinh_sach`, nhưng `audit-validation.ts` **chưa có `case`** cho hành động này (tầng audit từ chối hành động không có luật) | `audit/audit-validation.ts` (`case` đến `TuChoiRutTien`), `audit-entry.ts` |
| Cổng của booking | `PaymentPort`, `PaymentSummaryPort`, `WalletBalancePort`, `RefundPort` bản **thật** (payment B7, B9); `DoctorLeavePort` thật (B16a); `PendingBranchChangesPort` thật (B16b, 23/11/2026) nhưng **chỉ `BookabilityReader.read` gọi** (TECH_DEBT 260); `WaitlistPort` còn `Noop` | `appointments/ports/`, TECH_DEBT dòng 147, 148, 260 |
| `BookabilityReader`, `evaluateBookability` | Dùng cho `checks` và `create`; đã loại "lịch chủ hết hạn của chính khung giờ" khỏi đếm và chồng giờ; **chưa có tham số "lịch đang đổi"**; `findActiveAppointments` và `findOverlappingAppointments` chưa nhận id loại trừ | `slots/bookability.reader.ts`, `bookability.rules.ts`, `active-appointment.query.ts`, `overlapping-appointment.query.ts` |
| `SlotHoldService` | `hold`, `markBooked`, `release(from, den)`, `expireLapsedHold`, `holdForInvitation`, `releaseInvitationHold`; nơi DUY NHẤT ghi `khung_gio` | `slots/slot-hold.service.ts` |
| Khoá | `lock-order.ts` (bảng `LOCK_ORDER`), `withBookingTransaction` (READ COMMITTED, thử lại 1213/1205 hai lần, chờ khoá 3 giây) | `locking/` |
| `PaymentChain` | Đã có: `rootOf` đệ quy về lịch gốc, `MAX_CHAIN_DEPTH = 20`; `PaymentSummaryPort.amountPaid`, `remainingToCollect`, `amountRefundable` đã truy lịch gốc; wallet hoàn tìm lịch cuối chuỗi bằng đệ quy xuôi | `payment/ports/payment-chain.ts`, `wallet/refund/refund.queries.ts:151` |
| Thông báo | `BookingNotifier` ghi `thong_bao` + `email_thong_bao` trong giao dịch; `EmailOutboxService` chỉ quét **bốn** loại của booking (HDK-06); UNIQUE `(lich_hen_id, tai_khoan_id, loai_su_kien)`; chưa có cột nối tới yêu cầu đổi lịch | `appointments/notifications/`, `clinix_mysql.sql:556-565, 699-701` |
| Route | `patient/appointments` (danh sách, chi tiết, `cancel-preview`, `cancel`), `reception/appointments` (danh sách, chi tiết, `status`), `admin/appointments` (danh sách, chi tiết, `override-status`), `doctor/appointments`, `booking/{eligibility,checks,appointments}`; **không có route đổi lịch** | `grep @Controller` ở `appointments/` |
| Web | "Yêu cầu đổi lịch" ở menu Lễ tân là **mục vô hiệu** (không `to`); tab "Yêu cầu đổi lịch" ở "Duyệt yêu cầu" của Admin là **nút vô hiệu** (ca WA-13 của `doctor`); `SlotCell` là `Link` sang Bước 4 đặt lịch, `DoctorSlotGrid` chỉ hiển thị; chi tiết lịch Bệnh nhân có hộp huỷ (`cancel-box`), chi tiết Lễ tân có `reception-actions` | `router/role-nav.ts:76`, `features/doctor/admin/approvals/approvals-host-page.tsx`, `features/search/slots/slot-cell.tsx` |
| Tên dễ nhầm | `admin/branch-change-requests/branch-change-reschedule.service.ts` là **dời hiệu lực** yêu cầu thay đổi chi nhánh (admin B22), **không liên quan** đổi lịch hẹn; không đặt tên mới là `RescheduleService` ở nơi dễ trùng | đã đọc đầu file |
| Bác sĩ có một dịch vụ khám chính và một chi nhánh | `bac_si.dich_vu_kham_id`, `bac_si.chi_nhanh_id`; admin B13 chặn cả đổi chi nhánh (`DOI_CHI_NHANH_BI_CHAN`) lẫn đổi dịch vụ chính (`DOI_DICH_VU_CHINH_BI_CHAN`) khi còn lịch hẹn hoạt động hoặc ca từ hôm nay, nên hai mã 409 `LICH_HEN_KHAC_DICH_VU_HIEN_TAI` và `LICH_HEN_KHAC_CHI_NHANH_HIEN_TAI` của scope này chỉ là **lưới an toàn** cho dữ liệu lệch (ca KDL-07 và KDL-08 dựng dữ liệu bằng SQL trực tiếp) | `admin/doctors/doctor-update.service.ts:28-31`, `BookabilityReader.READ_DOCTOR_SQL` |

## 3. Phân tích ảnh hưởng

### 3.1 Bảng và cột scope này chạm tới (đọc từ `docs/database/clinix_mysql.sql`)

| Bảng | Cột | Cách chạm |
|---|---|---|
| `lich_hen` | `lich_hen_truoc_id` (UNIQUE, FK), `trang_thai`, `khung_gio_id`, `khung_gio_dang_giu` (cột sinh UNIQUE), `gia_snapshot`, `tien_coc_snapshot`, `chinh_sach_hoan_snapshot`, `thoi_diem_tao`, `thoi_diem_xac_nhan`, `ly_do_kham`, `han_thanh_toan`; **cột MỚI `so_lan_tu_doi_lich`** (Q1) | `INSERT` lịch mới (sao chép bản chụp, `lich_hen_truoc_id` = lịch cũ); `UPDATE` lịch cũ → `DaDoiLich` (chỉ qua `markReplaced`) |
| `khung_gio` | `trang_thai`, `giu_cho_den` | khung giờ mới `ConTrong` → `DangGiuCho` → `DaDat`; khung giờ cũ `DaDat` → `ConTrong` (chỉ qua `SlotHoldService`) |
| `yeu_cau_doi_lich_ngoai_chinh_sach` | cả bảng (`lich_hen_id`, `khung_gio_mong_muon_id`, `ly_do_yeu_cau`, `trang_thai`, `ghi_chu_xu_ly`, `nguoi_xu_ly_id`, `thoi_diem_xu_ly`, `thoi_diem_tao`) | `INSERT`, đọc danh sách, `UPDATE` khi xử lý |
| `cau_hinh_he_thong` | `so_lan_tu_doi_lich_toi_da`, `check_in_sau_phut`, `so_lich_hen_toi_da_moi_ho_so`, `thoi_gian_giu_cho` | chỉ đọc qua `SystemConfigService.getOrThrow()` |
| `thong_bao`, `email_thong_bao` | **cột MỚI `thong_bao.yeu_cau_doi_lich_ngoai_chinh_sach_id`** + FK + UNIQUE (Q5) | ghi bốn sự kiện mới |
| `nhat_ky_hanh_dong` | `hanh_dong` (thêm giá trị **`DoiLichHo`**, Q6), `loai_doi_tuong`, `chi_tiet_thay_doi` | ghi `XuLyDoiLichNgoaiChinhSach` và `DoiLichHo` cùng giao dịch |
| `benh_nhan`, `ho_so_nguoi_than` | khoá `FOR UPDATE` (tầng 2, 3) | đổi lịch khoá như tạo lịch để tuần tự hoá với `create` của cùng bệnh nhân (chồng giờ) |
| `bac_si`, `dich_vu_kham`, `lich_lam_viec`, `chi_nhanh_lich_hoat_dong`, `yeu_cau_nghi_phep`, `yeu_cau_thay_doi_chi_nhanh` | đọc | nghỉ phép, giờ nhận khám, vùng bị loại: qua cổng và `BranchHoursReader` đã có |
| `giao_dich_thanh_toan`, `giao_dich_vi`, `lich_su_hoan_tien` | **không ghi**; đọc qua `PaymentChain` | chứng minh đổi lịch không đụng tiền (HDL-03) |

### 3.2 API và hành vi đã có hoặc đã chốt bị chạm tới

| Chỗ | Chạm thế nào | Xử lý để không phá thiết kế đã chốt |
|---|---|---|
| `evaluateBookability` và `BookabilityReader` (B6a, B7) | thêm tham số tuỳ chọn `thayThe: { maLichHen }` vào `facts` và đầu vào reader: loại lịch đang đổi khỏi số lịch đang hoạt động và khỏi chồng giờ (Q7 (e)); cờ no-show truyền `false` (Q7 (b)) | tham số tuỳ chọn, mặc định không đổi hành vi của `checks` và `create` (ca DL-* cũ vẫn Pass); thứ tự 9 bước giữ nguyên |
| `AppointmentTransitionService` và ma trận | thêm actor `DoiLich` với MỘT ô `DaXacNhan → DaDoiLich` và hàm `markReplaced`; bảng 6 × 7 × 7 = 294 ô thành 7 × 7 × 7 = 343 ô, **22 → 23 ô được phép** | hàm thuần, bảng ô được viết tay trong test ma trận; AR-01 (UPDATE `lich_hen` chỉ ở `state/`) và AR-07 (bề mặt gọi vào) cập nhật đúng một tên |
| `insertLichHen` (`create/lich-hen-insert.query.ts`, NƠI DUY NHẤT chèn `lich_hen`, luật AR-06), `duplicate-key.ts` | thêm hai trường tuỳ chọn `lichHenTruocId`, `soLanTuDoiLich` vào `LichHenInsertRow` (hai cột vào câu `INSERT`; `thoi_diem_xac_nhan` đã bằng `thoi_diem_tao` khi `trangThai = 'DaXacNhan'` nên **không thêm tham số**) và kết quả `DuplicateChain` cho 1062 trên khoá `lich_hen_truoc_id` | tham số tuỳ chọn, `create` không truyền ⇒ hành vi cũ; 1062 trên khoá này ⇒ kết quả có kiểu `NotReschedulable` (lịch cũ đã có lịch mới), không 500; đường đổi lịch vẫn chèn qua đúng hàm này nên AR-06 không đổi |
| `GET /patient/appointments/:maLichHen` và chi tiết Lễ tân (B2, B3 booking) | thêm khoá `choPhepDoiLich` và `yeuCauDoiLich` (yêu cầu mới nhất của lịch) | hợp đồng 17 khoá của chi tiết Bệnh nhân (16 khoá cũ cộng `moc` của booking B19) đổi thành 19 (HDL-11); sửa ca B2 liên quan trong cùng PR `[ĐỤNG booking B2]` |
| `EmailOutboxService` (B15) | thêm bốn loại sự kiện vào `MAIL_EVENTS` (13 loại hiện có: 4 booking, 5 payment, 4 thay đổi chi nhánh; sau B3 là 17) | ca HDK-06 ở `exam-notifier.int-spec.ts` (bỏ qua `LichHenHoanThanh`) vẫn đúng; chữ "chỉ quét bốn loại" sai ở `examination.constants.spec.ts` được sửa; bốn mã mới ở hằng riêng `RESCHEDULE_NOTIFICATION_EVENTS`, `BOOKING_NOTIFICATION_EVENTS` không đổi |
| `AuditService` (`audit/`) | thêm luật cho `XuLyDoiLichNgoaiChinhSach` và `DoiLichHo` | `[ĐỤNG audit]` `[CHỜ Trung]`; ENUM đổi ở migration (P1), luật ở P2; test `audit-enum-parity` cập nhật |
| `PendingBranchChangesPort.findBlocking` | gọi cho khung giờ ĐÍCH dưới khoá, MỘT lần mỗi lượt | **đóng TECH_DEBT dòng 260** ở B4 (ca KDL-17); khung giờ NGUỒN trong vùng bị loại vẫn cho đổi đi |
| `SlotCell` và `DoctorSlotGrid` (search K2) | thêm chế độ `onSelect` (nút thay vì liên kết) | `[ĐỤNG search]` `[CHỜ Trung]`; mặc định giữ liên kết, ca K2 cũ không đổi |
| Trang "Duyệt yêu cầu" của Admin và menu Lễ tân | bật tab và mục menu | `[ĐỤNG doctor]` (một dòng + sửa ca WA-13) và `[ĐỤNG router]` |
| `docs/TECH_DEBT.md` dòng 147, 148, 260 | 260 đóng; 147 (waitlist `Noop`) nhắc thêm khung giờ do đổi lịch giải phóng | Đại ghi ở PR sau (phiên này chỉ soạn nháp) |

### 3.3 Đối chiếu với thiết kế đã chốt: KHỚP, LỆCH hay MÂU THUẪN (**nêu rõ, đã hỏi ở 4.2**)

| # | Chỗ | Bên A | Bên B | Kết luận |
|---|---|---|---|---|
| L1 | Giữ chỗ khung giờ mới | 2.4.9 b5 và 2.4.30 b5: chọn khung giờ → **giữ chỗ 15 phút** → màn xác nhận → xác nhận; 2.4.61 b5: hết hạn thì tự giải phóng | Mã đặt lịch (booking 5.4): **chọn khung giờ chưa giữ**, giữ ở lúc tạo; khung giờ `DangGiuCho` không có lịch `ChoThanhToan` giữ chỉ dành cho lời mời waitlist (INV-5), DB không biết ai giữ | **Q2 (Đại chọn nguyên tử một bước lúc xác nhận)**: không có giữ chỗ 15 phút khi xem màn xác nhận; tranh chấp bị báo ở bước xác nhận. `[ĐỒNG BỘ TL]` sửa b5 của 2.4.9 và 2.4.30 (ý "giữ chỗ trước khi đụng lịch cũ" vẫn đúng ở mức giao dịch) |
| L2 | "Chuyển lịch hẹn" hay "tạo lịch hẹn mới" | 2.4.9 b9 và 2.4.31 b6: "chuyển lịch hẹn sang khung giờ mới" | HĐK của cả ba use case, quyết định Database Diagram 16/10, `lich_hen_truoc_id` UNIQUE, quy tắc DB 2, 3, 4: **tạo lịch mới liên kết lịch cũ**, lịch cũ `DaDoiLich` | **KHỚP với HĐK** (mã làm theo HĐK); b9 và b6 là chữ cũ. `[ĐỒNG BỘ TL]` sửa lời b9 và b6 |
| L3 | Lý do của yêu cầu | 2.4.9 A2 8b: tạo yêu cầu "kèm khung giờ mong muốn" (không nói lý do); 2.4.31 b3 hiển thị "lý do" | Schema: `ly_do_yeu_cau text NOT NULL` ("Lý do bệnh nhân cần đổi lịch") | **Q7 (f)**: giao diện thêm ô lý do bắt buộc (5 đến 500 ký tự `[đề xuất]`). `[ĐỒNG BỘ TL]` thêm bước nhập lý do vào 2.4.9 A2 |
| L4 | Bộ đếm "số lần tự đổi" | 2.4.9 b9: "tăng bộ đếm số lần tự đổi"; 2.4.30 HĐK: "không tính vào số lần tự đổi của bệnh nhân" | Không có cột đếm; `lich_hen_truoc_id` chỉ cho độ sâu chuỗi (mọi lần đổi, kể cả Lễ tân) | **Q1 (cột `lich_hen.so_lan_tu_doi_lich`)**. `[ĐỒNG BỘ TL]` DDL ba file |
| L5 | Hạn đổi theo giờ | 2.4.9, 2.4.30: chỉ đòi `DaXacNhan` | Hai lỗ hổng: né no-show; hoàn cọc theo giờ hẹn mới | **Q3 (chặn theo giờ hẹn cũ, không thêm cấu hình)**; lỗ hổng hoàn cọc ghi nợ (nháp TECH_DEBT 266) |
| L6 | Số hành động nhạy cảm của Audit | 2.4.70 liệt kê 10 hành động, **không có đổi lịch hộ**; sơ đồ include ở 2.1_2.2 ghi "8 hành động" (thiếu hai hành động mà 2.4.70 có) | Đại chọn ghi Audit `DoiLichHo` | **Q6**. `[ĐỒNG BỘ TL]` thêm vào 2.4.70, 2.1_2.2, 1.2.1 (mục "Ghi nhật ký hành động nhạy cảm"), 1.3 (mục nhật ký); **phát hiện thêm:** hai bản đã lệch nhau từ trước (8 so với 10) và ENUM của DB còn nhiều hành động hơn nữa, báo Đại, không tự chọn |
| L7 | Ghi chú xử lý đi đâu | 2.4.31 HĐK từ chối: "kèm ghi chú lý do"; không nói ra ngoài hay nội bộ | Chưa có quy định | **Q10 (gửi nguyên văn cho bệnh nhân)**; nhắc ở ô nhập của nhân sự |
| L8 | Người duyệt chọn khung giờ thay thế | 2.4.31 A2 5c: "chọn khung giờ khác thay thế hoặc Từ chối" | Bảng yêu cầu chỉ có `khung_gio_mong_muon_id` (không ghi đè) | **Q7 (g)**: `khungGioId` tuỳ chọn khi duyệt; khung giờ thật nằm ở lịch mới và Audit; `khung_gio_mong_muon_id` giữ nguyên là ý muốn của bệnh nhân |
| L9 | Mã lịch hẹn cũ chết | Q31 booking: Bệnh nhân không thấy `DaDoiLich` (404) | 2.4.9 không nói mã lịch mới | Mã **mới** (`ma_lich_hen` UNIQUE), thông báo và thư dùng mã mới; liên kết cũ trong thư xác nhận ban đầu ra 404 (rủi ro R7) |
| L10 | "Hoàn tiền tự động … khi hủy hoặc đổi lịch hợp lệ" | 1.2.1 (chức năng Hoàn tiền tự động) | 2.4.9 HĐK: "không tạo giao dịch thanh toán mới (thanh toán và hoàn tiền truy về lịch hẹn gốc)"; payment Q11, E13 | **Mã không hoàn tiền khi đổi** (chỉ khi huỷ). Chữ "hoặc đổi lịch" của 1.2.1 mơ hồ: báo Đại, `[ĐỒNG BỘ TL]` nếu muốn bỏ |
| L11 | Nhắc lịch khi đổi | 2.4.69 A2: "tính lại mốc theo khung giờ mới nếu đã đổi lịch" | Đổi lịch tạo lịch MỚI, lịch cũ `DaDoiLich` không còn là `DaXacNhan` | Lịch mới có mốc nhắc riêng, lịch cũ không nhắc: việc của module nhắc lịch (ghi ở 5.9); không đổi gì ở scope này |
| L12 | Xác nhận quy tắc DB | Quy tắc 2: "chỉ cho đổi khi lịch cũ ở DaXacNhan **[đề xuất, chưa xác nhận]**"; quy tắc 27 "CHƯA có mã triển khai" | 2.4.9 A3 | Q7 (a) xác nhận; D1 bỏ chữ "chưa xác nhận" và cập nhật quy tắc 27 (`[ĐỒNG BỘ TL]` ở P1 vì cùng file) |
| L13 | Biên cấu hình hạ thấp | `so_lich_hen_toi_da_moi_ho_so` hạ xuống dưới số lịch hồ sơ đang có | Q7 (e): đếm không tính lịch đang đổi | Hồ sơ có 3 lịch, tối đa hạ còn 2: đếm các lịch KHÁC = 2 ≥ 2 ⇒ `VUOT_SO_LICH_HEN_TOI_DA` chặn một lần đổi vốn không tăng số lịch. Rủi ro R9; `[đề xuất]` giữ đúng chữ Q7 (e), nếu Đại muốn thì bỏ kiểm số lịch ở đường đổi (một dòng) |
| **KHỚP** | Bản chụp giá, cọc, chính sách hoàn sao chép nguyên; không giao dịch thanh toán mới; thanh toán truy lịch gốc | payment E13, Q11, Q22; `PaymentChain`; wallet `refund.queries` | | Không đổi gì ở payment và wallet |
| **KHỚP** | `markReplaced` và chỗ đặt `DaDoiLich` | booking PLAN 5.10 B ("`markReplaced`, `DaXacNhan → DaDoiLich` cùng giao dịch tạo lịch mới") | | Đúng tên, B1 làm |
| **KHỚP** | Cổng thay đổi chi nhánh gọi cho khung giờ đích dưới khoá | TECH_DEBT 260, admin Q6, Q48 | | B4 làm, ca KDL-17, HDL-05 |

### 3.4 Chỗ mơ hồ còn lại (đã hỏi hoặc đã chọn mặc định ở mục 4.2)

- 2.4.30 "áp dụng đúng chính sách chuẩn": đọc là điều kiện trạng thái, khung giờ, giữ chỗ trước, tranh chấp (giống 2.4.9) **trừ số lần** (đã nói riêng). Không có "chính sách chuẩn" nào khác trong 2.4, 1.3, 1.2.1.
- 2.4.31 TĐK: "Quản trị viên (trong phạm vi quản trị của mình)": Toàn hệ thống xem tất cả; Chi nhánh chỉ chi nhánh được gán (đã nêu trong chính 2.4.31). Tài khoản Quản trị viên Chi nhánh thao tác lịch ngoài chi nhánh ⇒ 404 cùng thân (admin Q40).
- Yêu cầu quá hạn xử lý không có trạng thái "Hết hạn": ENUM chỉ `ChoDuyet`, `DaDuyet`, `TuChoi` (không đổi).
- `so_lan_tu_doi_lich_toi_da = 0` hợp lệ (CHECK `>= 0`): mọi lần của Bệnh nhân là yêu cầu. 2.4 ghi "2 [đề xuất]", DDL `[cần điền]` (Q8).
- Lễ tân đổi hộ cho lịch đã quá giờ hẹn nhưng còn trong cửa sổ tiếp đón (Q3): dùng `check_in_sau_phut` (`[cần điền]`, Q8).

### 3.5 Bẫy và rủi ro (xử lý trong task; khoá và đồng thời chi tiết ở 5.4)

- **R1 Deadlock hoán vị.** Hai lịch đổi chéo khung giờ của nhau (A: X→Y, B: Y→X) xin hai khoá `khung_gio` ngược chiều. Xử lý: luôn khoá hai khung giờ **theo `khung_gio_id` tăng dần**, rồi `lich_hen` theo khoá chính (TDL-03; X1 M1 đối chứng đảo thứ tự ⇒ 1213).
- **R2 Khoá S ngầm của khoá ngoại.** `INSERT yeu_cau_doi_lich_ngoai_chinh_sach` xin S trên `khung_gio` (khung giờ mong muốn) và `lich_hen` sau khi đã giữ X trên `lich_hen`: ngược chiều bảng khoá (bài học B11, B12 booking). Xử lý: khoá khung giờ mong muốn TRƯỚC `lich_hen`, rồi mới `INSERT` (5.4); đo ở X1 M2; TDL-18.
- **R3 Hoàn cọc theo giờ hẹn mới (kẽ hở có chủ ý).** Q3: không thêm số giờ tối thiểu nên lịch 1 giờ nữa (hoàn 0%) đổi sang ngày xa rồi huỷ (hoàn 100% theo giờ hẹn mới) vẫn được. Ghi nợ (nháp TECH_DEBT 266); nếu cần chặn: thêm cấu hình `so_gio_toi_thieu_doi_lich` `[SAU]`.
- **R4 Chuỗi dài chạm `MAX_CHAIN_DEPTH = 20` của `PaymentChain`.** Lễ tân và duyệt không bị hạn mức nên chuỗi có thể dài; quá 20 thì mọi truy vấn tiền ném `CHAIN_TOO_DEEP` (500). Xử lý: đổi lịch từ chối trước khi chạm (`CHUOI_DOI_LICH_QUA_DAI`, 19 lịch), KDL-16, HDL-09.
- **R5 Cấu hình chưa có.** Không có dòng `cau_hinh_he_thong` hoặc `so_lan_tu_doi_lich_toi_da` không đọc được ⇒ `HE_THONG_CHUA_CAU_HINH` cho cả đổi lịch (quy tắc 35); dữ liệu mẫu phải có dòng cấu hình.
- **R6 Yêu cầu tồn.** Lịch gốc bị huỷ, Vắng mặt hay quá giờ trong lúc yêu cầu `ChoDuyet`: duyệt bị 409, chỉ từ chối được (Q7 (g)); danh sách vẫn hiện (cờ `coTheDuyet = false`). Nháp TECH_DEBT 267.
- **R7 Mã cũ chết.** Thư xác nhận ban đầu chứa mã cũ; sau đổi, mở mã cũ ra 404 với Bệnh nhân. Thông báo đổi lịch ghi rõ mã mới.
- **R8 Trùng mã (jscpd).** Khối "hết hạn lười, giữ chỗ, đặt khung giờ" lặp với `CreateAppointmentService`: tách hàm dùng chung `claimSlot` ở `slots/` (B1); phía web tái dùng bộ chọn khung giờ (F1).
- **R9 Cấu hình hạ thấp chặn đổi lịch** (L13).
- **R10 `ly_do_yeu_cau` và ghi chú là văn bản người dùng nhập**: chỉ văn bản thuần, thoát HTML khi dựng thư, không `dangerouslySetInnerHTML` (BDL-04).
- **R11 `WaitlistPort` còn `Noop`:** khung giờ cũ được giải phóng nhưng không mời ai; khi `waitlist` có mã phải chạy lại DLH-13, DLH-14 với bản thật (TECH_DEBT 147).
- **R12 Gỡ ca của `doctor`:** `DELETE khung_gio` bị chặn bởi khoá ngoại khi có `lich_hen` hay yêu cầu tham chiếu (booking D7): khung giờ mới của lịch mới và khung giờ mong muốn của yêu cầu giữ ca không gỡ được (đúng ý đồ).
- **R13 Báo cáo sau này:** lịch mới có `thoi_diem_tao` = lúc đổi (Q12); báo cáo đếm "lượt đặt" phải loại lịch có `lich_hen_truoc_id` (TRACKING mục 7 để module báo cáo đọc).

## 4. Câu hỏi và quyết định

### 4.1 Đã chốt ở module khác (kế thừa — **không bàn lại**)

- **auth** (`docs/features/auth/TRACKING.md` mục 3): TypeORM `synchronize: false`, migration viết tay đối chiếu DDL; mã lỗi nghiệp vụ ổn định, không 500 cho lỗi UNIQUE/FK/deadlock đã lường trước; khoá hàng theo thứ tự cố định, thử lại 1205/1213, test nhiều tài khoản đồng thời, đồng hồ giả.
- **booking** (`docs/features/booking/PLAN.md`): `AppointmentTransitionService` và `SlotHoldService` là nơi DUY NHẤT ghi `lich_hen.trang_thai` và `khung_gio` (H7, AR-01, AR-06, AR-07); thứ tự khoá toàn cục 5.3 (tầng 2 đến 7) và quy tắc "khoá `lich_hen` chỉ theo khoá chính hoặc `ma_lich_hen`" (quy tắc 7); `withBookingTransaction` (READ COMMITTED, thử lại, chờ khoá 3 giây); kết quả có kiểu thay vì ném trong giao dịch; tác dụng phụ ngoài DB chỉ sau commit, đúng một lần; Q31 Bệnh nhân không thấy `DaDoiLich` (404 cùng thân); Q12 tập "đang hoạt động" = `ChoThanhToan`, `DaXacNhan`, `DaTiepDon`; H8 mốc `toSecond(nowVN())`, nửa mở; H10 danh sách trắng và 404 cùng thân; Q24 ma trận override; B15 thông báo ghi trong giao dịch.
- **payment và wallet** (`docs/features/payment/PLAN.md` Q11, Q22, E13): giao dịch thanh toán và hoàn tiền luôn trỏ **lịch gốc**; `PaymentChain.rootOf` một chỗ; đổi lịch **không** tạo giao dịch, **không** chuyển hay sao chép dữ liệu; lịch mới sao chép ba bản chụp; thu tiền mặt ở lịch mới ghi `lich_hen_id` = lịch gốc.
- **admin** (`docs/features/admin/PLAN.md` và TRACKING mục 3): Q6 và Q48 `booking` **chặn đặt và đổi lịch** vào vùng bị loại bởi thay đổi chi nhánh đã duyệt chưa áp dụng; Q40 tài nguyên ngoài phạm vi ⇒ 404 cùng thân; Q42 phân trang offset `common/paging`; Q39 audit tối thiểu; Q41 admin sở hữu migration bảng nền (booking đã có tiền lệ P6, P7, B19: làm migration trên bảng admin khi Trung đồng ý).
- **doctor**: D7 `DELETE khung_gio` bị chặn bởi khoá ngoại khi có `lich_hen` hay `yeu_cau_doi_lich_ngoai_chinh_sach` tham chiếu; `LeaveReader` thật qua `DoctorLeavePort`.
- **search**: K1 `GET /public/doctor-slots` trả `khungGioId`, trạng thái ô do máy chủ tính (đã xét hết hạn giữ chỗ và quá giờ); K2 lưới khung giờ.
- **patient**: Q13 hợp đồng khoá `benh_nhan` → `ho_so_nguoi_than`; không lộ `lich_hen_id` ra API của patient; hồ sơ của người khác ⇒ 404 cùng thân.
- **Quy tắc DB** (`clinix_quy_tac_nghiep_vu.md`): 2, 3, 4 (đổi lịch tạo lịch mới trong CÙNG giao dịch, sao chép ba bản chụp, tài chính truy lịch gốc), 27 (kiểm "không tự trỏ chính nó" ở service), 29 (khung giờ trong khoảng nhận khám), 35 (thiếu cấu hình thì từ chối), 37 (đếm và tạo trong một giao dịch, khoá `benh_nhan`), 38 (không giới hạn số ngày đặt trước).

### 4.2 Câu hỏi gộp và đề xuất (**Đại đã trả lời trực tiếp ngày 24/11/2026 các câu Q1 đến Q7 và Q9 đến Q12** qua ba hộp câu hỏi; Q6 và Q9 **khác** đề xuất ban đầu; phiên kiểm độc lập được ủy quyền trả lời câu kỹ thuật nhưng **chưa** trả lời câu nào ở đây)

| Q | Câu hỏi | Trả lời hoặc đề xuất | Truy vết |
|---|---|---|---|
| **Q1★** | Số lần tự đổi lưu ở đâu? | **ĐÃ TRẢ LỜI (24/11/2026, Đại trả lời trực tiếp): theo đề xuất.** Thêm cột `lich_hen.so_lan_tu_doi_lich` `int NOT NULL DEFAULT 0` + CHECK `>= 0` (`chk_lich_hen_so_lan_tu_doi`); kiểu `int` cùng kiểu cấu hình để không tràn khi cấu hình lớn `[đề xuất]`. Lịch mới = lịch cũ + 1 khi Bệnh nhân tự đổi; **bằng** lịch cũ khi Lễ tân đổi hộ hoặc duyệt; lịch cũ giữ nguyên; lịch tạo trước đó = 0. Migration, entity, ba file `docs/database/*` (tiền lệ B19). **Không** đếm độ sâu chuỗi (lệch 2.4.30 và dễ chạm trần 20 của `PaymentChain`) | L4; 2.4.9 b2, b9; 2.4.30 HĐK |
| **Q2★** | Giữ chỗ khung giờ mới: hai pha đúng chữ use case hay nguyên tử? | **ĐÃ TRẢ LỜI (24/11/2026, Đại trả lời trực tiếp): nguyên tử một bước lúc xác nhận, theo đề xuất.** `GET reschedule-preview` chỉ đọc (không khoá, không ghi); `POST reschedule` làm tất cả trong MỘT giao dịch: khoá `benh_nhan`, `ho_so_nguoi_than`, `bac_si`, **hai** `khung_gio` theo id tăng dần, `lich_hen` cũ → kiểm → chèn lịch mới → khung giờ mới `DaDat` → khung giờ cũ `ConTrong` → lịch cũ `DaDoiLich`. Không có trạng thái giữ chỗ không chủ (INV-5 giữ nguyên), không job dọn mới, không đổi `SlotHoldService`. Khác chữ 2.4.9 b5 ở chỗ không giữ 15 phút trong lúc xem màn xác nhận | L1; 2.4.9 b5, A1; 2.4.61 |
| **Q3★** | Hạn đổi theo giờ? | **ĐÃ TRẢ LỜI (24/11/2026, Đại trả lời trực tiếp): theo đề xuất, không thêm cấu hình.** Bệnh nhân tự đổi hoặc gửi yêu cầu: `thoi_gian` của lịch cũ `> now` (nửa mở: đúng mốc là đã qua). Lễ tân đổi hộ và Lễ tân/QTV duyệt: `thoi_gian + check_in_sau_phut phút > now`. Mã lỗi `LICH_HEN_DA_QUA_GIO`. Lỗ hổng "đổi sát giờ sang ngày xa rồi huỷ để hoàn cọc theo giờ hẹn mới" **còn** (R3), ghi nợ | L5; R3 |
| **Q4** | Chặn nhiều yêu cầu `ChoDuyet` cho một lịch ở đâu? | **ĐÃ TRẢ LỜI (24/11/2026, Đại trả lời trực tiếp): theo đề xuất.** Khoá `lich_hen` `FOR UPDATE` rồi kiểm ở service: tối đa MỘT `ChoDuyet` mỗi lịch, 409 `DA_CO_YEU_CAU_DOI_LICH_CHO_DUYET`; bị `TuChoi` thì gửi lại được. **Không** thêm UNIQUE ở DB (không đổi schema bảng yêu cầu). Test đồng thời mười yêu cầu cùng lúc (TDL-16) thay cho lưới DB | 2.4.9 A2; quy tắc "chống chạy đua bằng khoá hàng" của AGENTS |
| **Q5** | Thông báo cho yêu cầu gắn vào đâu? | **ĐÃ TRẢ LỜI (24/11/2026, Đại trả lời trực tiếp): theo đề xuất.** Thêm cột `thong_bao.yeu_cau_doi_lich_ngoai_chinh_sach_id` (nullable, FK) và UNIQUE `thong_bao_index_yeu_cau_doi_lich (yeu_cau_doi_lich_ngoai_chinh_sach_id, tai_khoan_id, loai_su_kien)` theo nếp `thong_bao_index_yeu_cau_chi_nhanh`. Thông báo **của yêu cầu** để `lich_hen_id` = NULL (tránh trùng UNIQUE `thong_bao_index_lich_hen` khi một lịch có nhiều yêu cầu theo thời gian); thông báo `LichHenDaDoiLich` gắn `lich_hen_id` = lịch MỚI | 2.4.68; B15 |
| **Q6★** | Đổi lịch hộ có ghi Audit không? | **ĐÃ TRẢ LỜI (24/11/2026, Đại trả lời trực tiếp): KHÁC đề xuất — thêm giá trị ENUM `DoiLichHo` vào `nhat_ky_hanh_dong.hanh_dong` và ghi Audit cho mọi lần Lễ tân đổi hộ.** Cần: migration `MODIFY` ENUM (giữ nguyên thứ tự cũ, thêm cuối), `admin/entities/enums.ts`, luật kiểm trong `audit/` (P2), `audit-enum-parity`, ba file `docs/database/*`; `[ĐỒNG BỘ TL]` thêm vào 2.4.70 (hiện 10 hành động), 2.1_2.2, 1.2.1, 1.3. Mô hình ghi: `ma_doi_tuong` = id lịch **cũ**, `chi_nhanh_id` = chi nhánh của lịch, `chi_tiet_thay_doi` = `{ truoc: { ma_lich_hen, thoi_gian }, sau: { ma_lich_hen, thoi_gian }, ly_do }` `[đề xuất]` | L6; 2.4.70 |
| **Q7** | Gói đề xuất nhỏ (a) đến (j)? | **ĐÃ TRẢ LỜI (24/11/2026, Đại trả lời trực tiếp): đồng ý toàn bộ (a) đến (j).** (a) chỉ `DaXacNhan` đổi được, `ChoThanhToan` phải trả tiền hoặc huỷ; (b) cờ khoá no-show **không** chặn đổi lịch; (c) giữ nguyên bác sĩ, dịch vụ, chi nhánh: khung giờ mới phải của đúng bác sĩ cũ (qua ngày khác được), bác sĩ đã đổi dịch vụ chính hay chi nhánh so với lúc đặt ⇒ 409, phải huỷ và đặt lại; (d) lịch mới: mã mới, `thoi_diem_xac_nhan` = lúc đổi, sao chép giá, cọc, chính sách hoàn; lịch cũ giữ nguyên mọi mốc; (e) hồ sơ người thân đã ngừng ⇒ 409 như đặt lịch; số lịch tối đa và chồng giờ **không tính** lịch đang đổi; (f) yêu cầu: lý do bắt buộc (`ly_do_yeu_cau NOT NULL`; độ dài 5 đến 500 `[đề xuất]`), khung giờ mong muốn phải còn trống lúc gửi nhưng **không giữ chỗ**, không có thao tác rút yêu cầu; (g) người duyệt được chọn khung giờ thay thế (2.4.31 A2 5c), ghi chú bắt buộc khi duyệt lẫn từ chối (1 đến 255), lịch gốc không còn `DaXacNhan` thì duyệt 409 và chỉ từ chối được, không tự đóng yêu cầu tồn khi lịch bị huỷ (ghi nợ); (h) duyệt và từ chối ghi Audit `XuLyDoiLichNgoaiChinhSach` cùng giao dịch (luật kiểm ở `audit/`); (i) Quản trị viên **không** đổi hộ trực tiếp; (j) giao diện: nút "Đổi lịch" ở chi tiết lịch Bệnh nhân và Lễ tân, trang "Yêu cầu đổi lịch" của Lễ tân, tab "Yêu cầu đổi lịch" trong "Duyệt yêu cầu" của Admin | mục 1, 3.3 |
| **Q8** | Giá trị `so_lan_tu_doi_lich_toi_da` và `check_in_sau_phut`; ai tạo dòng cấu hình đầu? | **`[CHỜ Đại]`** `[cần điền]`. Đề xuất: Đại nhập ở form cấu hình admin (đã có); **dữ liệu mẫu và test không dựa vào số cứng của mã** (mỗi ca truyền giá trị); seed demo `so_lan_tu_doi_lich_toi_da = 2` (2.4 ghi "2 [đề xuất]") và `check_in_sau_phut` do Đại điền. Mã không có số ngầm (quy tắc 35) | 2.4.42 A3; quy tắc 35 |
| **Q9** | Lễ tân đổi hộ có phải nhập lý do? | **ĐÃ TRẢ LỜI (24/11/2026, Đại trả lời trực tiếp): KHÁC đề xuất — bắt buộc lý do 1 đến 255 ký tự.** DTO `lyDo` bắt buộc cho `POST /reception/appointments/:maLichHen/reschedule`; vào Audit `DoiLichHo.ly_do`. **Hệ quả `[đề xuất]`, Đại sửa khi duyệt PR:** lý do cũng nằm trong thông báo và thư cho bệnh nhân (cùng tinh thần Q10) và ô nhập nhắc "Bệnh nhân sẽ đọc lý do này". `[ĐỒNG BỘ TL]` thêm bước nhập lý do vào 2.4.30 | 2.4.30; Q6, Q10 |
| **Q10** | Ghi chú xử lý có gửi cho bệnh nhân không? | **ĐÃ TRẢ LỜI (24/11/2026, Đại trả lời trực tiếp): theo đề xuất — gửi nguyên văn** (cả duyệt lẫn từ chối) trong thông báo, thư và banner chi tiết lịch; ô nhập của nhân sự có dòng nhắc; thư thoát HTML, không chứa gì khác của nhân sự | L7; 2.4.31 HĐK |
| **Q11** | Danh sách yêu cầu chỉ `ChoDuyet` hay thêm tab `Đã xử lý`? | **ĐÃ TRẢ LỜI (24/11/2026, Đại trả lời trực tiếp): theo đề xuất — hai tab Chờ duyệt (mặc định) và Đã xử lý (chỉ đọc).** Cùng một API, bộ lọc `trangThai` | 2.4.31 b1 |
| **Q12** | `thoi_diem_tao` của lịch mới? | **ĐÃ TRẢ LỜI (24/11/2026, Đại trả lời trực tiếp): theo đề xuất — lúc đổi** (`now`, cùng hàm tạo lịch); `thoi_diem_xac_nhan` = `now`. Module báo cáo sau này loại lịch có `lich_hen_truoc_id` khi đếm "lượt đặt" (ghi ở TRACKING mục 7) | R13 |
| **Q13** | Mã sự kiện thông báo, câu chữ thông báo và thư, mã lỗi tiếng Việt? | **`[CHỜ Đại]`** `[đề xuất]` ở 5.10 và 5.13; nhóm duyệt khi review PR của B3, B6 | Q13 booking nếp |
| **Q14** | Thứ tự lát cắt, hạn mức giờ mỗi tuần và Iteration của Đại? | **`[CHỜ Đại]`** `[cần điền]` hạn mức; đề xuất ở 6.4: S1 → S2 → S3 → S4 → S5, tổng 103 giờ | 6.4 |
| **Q15** | Có file Excel của Trung (hoặc bảng khác ngoài repo) cần đồng bộ cho use case đổi lịch không? | **`[CHỜ Đại]`** `[cần điền]`; phiên này không có file đó | `[ĐỒNG BỘ TL]` |
| **Q16** | Trung xác nhận các điểm chạm file của Trung | **`[CHỜ Trung]`** (approve PR tài liệu coi là xác nhận): `audit/audit-validation.ts` và `audit-entry.ts` (P2), `admin/entities/*` + `database/` + migration + ba file `docs/database/*` (P1), `features/search/slots/slot-cell.tsx` và `doctor-slot-grid.tsx` (F1), `features/doctor/admin/approvals/approvals-host-page.tsx` + ca WA-13 (F5) | mục 6.3 |

### 4.3 Mọi chỗ còn `[cần điền]` và `[đề xuất]` liên quan (và câu hỏi tương ứng)

| Giá trị | Ở đâu | Loại | Câu hỏi |
|---|---|---|---|
| `so_lan_tu_doi_lich_toi_da` (2.4 ghi 2) | `cau_hinh_he_thong` | `[cần điền]` | Q8 |
| `check_in_sau_phut` (cửa sổ tiếp đón, dùng cho giờ muộn nhất của Lễ tân đổi hộ và duyệt) | `cau_hinh_he_thong` | `[cần điền]` | Q8 |
| Kiểu `int NOT NULL DEFAULT 0` + CHECK của `so_lan_tu_doi_lich`; tên CHECK; tên chỉ mục `thong_bao_index_yeu_cau_doi_lich` | migration, DDL | `[đề xuất]` | Q1, Q5 |
| Độ dài `ly_do_yeu_cau` 5 đến 500 ký tự; ghi chú xử lý 1 đến 255 (đúng `varchar(255)`); lý do đổi hộ 1 đến 255 | DTO | `[đề xuất]` (ghi chú và lý do đổi hộ: theo schema và Q9) | Q7 (f), Q9 |
| Mã lỗi `LICH_HEN_KHONG_CHO_DOI`, `LICH_HEN_DA_QUA_GIO`, `VUOT_SO_LAN_TU_DOI`, `DA_CO_YEU_CAU_DOI_LICH_CHO_DUYET`, `KHUNG_GIO_TRUNG_LICH_CU`, `KHUNG_GIO_KHAC_BAC_SI`, `LICH_HEN_KHAC_DICH_VU_HIEN_TAI`, `LICH_HEN_KHAC_CHI_NHANH_HIEN_TAI`, `CHUOI_DOI_LICH_QUA_DAI`, `YEU_CAU_DA_XU_LY`, `YEU_CAU_DOI_LICH_KHONG_TON_TAI` và câu chữ | 5.13 | `[đề xuất]` | Q13 |
| Mã sự kiện `LichHenDaDoiLich`, `YeuCauDoiLichDangCho`, `YeuCauDoiLichDaDuyet`, `YeuCauDoiLichBiTuChoi` và nội dung thư | 5.10 | `[đề xuất]` | Q13 |
| Đường dẫn endpoint, khoá JSON | 5.8 | `[đề xuất]` | Q13 |
| Mô hình `chi_tiet_thay_doi` của `DoiLichHo` và `XuLyDoiLichNgoaiChinhSach` | 5.11 | `[đề xuất]` | Q6, Q16 |
| Lý do đổi hộ nằm trong thông báo cho bệnh nhân | 5.10 | `[đề xuất]` (hệ quả Q9, Q10) | Q9 |
| Mức kiểm ĐẦY ĐỦ hay GỌN theo từng task; giờ ước; Iteration | 6.4 | `[đề xuất]` | Q14 |
| `MAX_CHAIN_DEPTH - 1 = 19` làm trần chuỗi khi đổi (lấy từ hằng của `PaymentChain`, không số cứng) | 5.6 | `[đề xuất]` | — |
| Có Excel nào cần đồng bộ | 4.5 | `[cần điền]` | Q15 |

### 4.4 Figma

Figma chỉ là bản phác thảo: **không đồng bộ lại Figma**. Giao diện theo component hiện có của `booking` (chi tiết lịch, hộp xác nhận, `action-dialog`) và `search` (lưới khung giờ). Booking PLAN 4.4 ghi frame `493:2` (Lễ tân, đổi lịch hộ) là "ngoài phạm vi" của scope đó và code của `doctor` ghi frame `582:2` ("Duyệt yêu cầu", hai tab). **Chưa đối chiếu bằng mắt**: khi làm F3, F4, F5 đối chiếu hai frame này nếu đọc được; frame thiếu (trang chọn khung giờ đổi lịch của Bệnh nhân, hộp duyệt/từ chối, banner yêu cầu) thì theo nếp patient Q22 và **hỏi Đại**, không tự thiết kế lại.

### 4.5 Việc của nhóm (ngoài repo; không sửa file Word hay Figma từ repo này)

- **D2 `[ĐỒNG BỘ TL]` (Đại sửa file Word ở repo `TLCN_CLINIX`):** 2.4.9 b5 (bỏ giữ chỗ 15 phút trước màn xác nhận: Q2), b9 ("tạo lịch hẹn mới liên kết", L2), A2 (thêm bước nhập lý do yêu cầu: L3); 2.4.30 b5 và b8 (như trên) và thêm bước nhập lý do (Q9); 2.4.31 b6 ("tạo lịch hẹn mới", L2) và A2 5c (rõ "chọn khung giờ thay thế"); 2.4.70 và 2.1_2.2 (thêm "đổi lịch hộ bệnh nhân" vào hành động nhạy cảm; sửa con số 8 so với 10, L6); 1.2.1 (Ghi nhật ký; "Hoàn tiền tự động: hoặc đổi lịch hợp lệ", L10); 1.3.6 (quy trình đổi lịch: bỏ "giữ chỗ tạm thời", thêm Audit đổi hộ); sơ đồ class và sequence nếu có bộ đếm mới (`so_lan_tu_doi_lich`).
- **Excel của Trung** (nếu có): Q15.
- Báo Trung trước khi merge P1 và P2 (đổi file của hai người).

## 5. Thiết kế kỹ thuật

### 5.1 Cấu trúc thư mục (tạo thư mục khi có file đầu tiên; test cạnh mã; `[đề xuất]`)

```
apps/api/src/appointments/
  reschedule/                                  # lõi và đường của Bệnh nhân, Lễ tân (B1 đến B7)
    reschedule.types.ts                        # input/outcome có kiểu, actor, via
    reschedulability.rules.ts                  # hàm thuần: trạng thái, hạn giờ, bác sĩ-dịch vụ-chi nhánh khớp, chuỗi, hạn mức
    reschedule.reader.ts                       # đọc facts (thường hoặc dưới khoá), nối BookabilityReader (tham số thayThe)
    reschedule-locks.ts                        # khoá theo thứ tự 5.4 (chuỗi 2, 3, 4, 5a, 5b, 6, 6c)
    appointment-reschedule.service.ts          # giao dịch lõi: tự đổi, đổi hộ, duyệt (một thân giao dịch dùng chung)
    reschedule-preview.service.ts              # GET preview, đọc không khoá
    patient-reschedule.controller.ts / .dto.ts
    reception-reschedule.controller.ts / .dto.ts
    requests/                                  # yêu cầu ngoài chính sách (B5, B8, B9)
      reschedule-request.repository.ts         # câu SQL thô: tạo, đọc, danh sách theo phạm vi, cập nhật xử lý
      create-reschedule-request.service.ts
      reschedule-request-list.service.ts       # danh sách và chi tiết, danh sách trắng khoá
      reschedule-request-handle.service.ts     # duyệt (gọi lõi) và từ chối
      reception-reschedule-requests.controller.ts / admin-reschedule-requests.controller.ts / *.dto.ts
  slots/ (sửa)         bookability.rules.ts, bookability.reader.ts, thêm claim-slot.ts (dùng chung với create)
  state/ (sửa)         appointment-state.matrix.ts (actor DoiLich), appointment-transition.service.ts (markReplaced), mark-replaced.ts
  create/ (sửa)        lich-hen-insert.query.ts (hai cột), duplicate-key.ts (khoá lich_hen_truoc_id)
  active-appointment.query.ts, overlapping-appointment.query.ts (tham số loại trừ)
  notifications/ (sửa) booking-notifier.ts, booking-mail.templates.ts, notification-text.ts, email-outbox.query.ts, notifications.constants.ts
  appointments.constants.ts (sửa: mã lỗi, BOOKING_NOTIFICATION_EVENTS), appointments.module.ts (controller, provider)
  testing/ (sửa)       invariants.ts (INV-7 đến INV-10), fixtures đổi lịch
apps/api/src/admin/entities/yeu-cau-doi-lich-ngoai-chinh-sach.entity.ts (MỚI), lich-hen.entity.ts, thong-bao.entity.ts, enums.ts (sửa)
apps/api/src/audit/ (sửa)  audit-validation.ts, audit-entry.ts (hai hành động)
apps/api/src/database/migrations/ (MỚI một migration), database/entities.ts, database/migrations/index.ts (sửa)
apps/web/src/features/booking/appointments/reschedule/   # dùng chung: api, kiểu, hook, bộ chọn khung giờ, màn xác nhận, thông báo lỗi
apps/web/src/features/booking/appointments/{patient,reception,admin}/   # chỗ cắm: nút, trang, tab
apps/web/src/features/booking/index.ts                   # xuất PATIENT_RESCHEDULE_ROUTES, RECEPTION_RESCHEDULE_REQUEST_ROUTES, ADMIN_RESCHEDULE_REQUEST_ROUTES
apps/web/src/shared/routes/booking-paths.ts              # hằng đường dẫn mới
```

Controller chỉ nhận/trả, DTO + `class-validator`, import tương đối có đuôi `.js`; `controller → service → repository`; SQL thô cho câu cần khoá hoặc ghép nhiều bảng (nếp patient, search, booking).

### 5.2 Dữ liệu: một migration, ba file DDL (task P1, `[ĐỒNG BỘ TL]`)

Một migration `DoiLich1793966400000` (file `1793966400000-doi-lich.ts`; mốc = mốc cuối `1793880000000` + 86.400.000; tên ban đầu của PLAN là `DoiLich<mốc thời gian lớn hơn migration cuối>`) (nếp B19: ba cột, migration, ba file docs trong cùng PR; Trung review). Nội dung (DDL `[đề xuất]`, đối chiếu từng dòng với `clinix_mysql.sql` khi viết):

```sql
-- Q1: bộ đếm số lần tự đổi (lịch cũ nhận 0, không điền giả)
ALTER TABLE `lich_hen` ADD COLUMN `so_lan_tu_doi_lich` int NOT NULL DEFAULT 0
  COMMENT 'Số lần Bệnh nhân đã TỰ đổi trong chuỗi đổi lịch tính tới lịch này (booking scope #9, Q1). Lịch mới = lịch cũ + 1 khi Bệnh nhân tự đổi; bằng lịch cũ khi Lễ tân đổi hộ hoặc Lễ tân/QTV duyệt yêu cầu ngoài chính sách; lịch không phải do đổi lịch tạo = 0' AFTER `lich_hen_truoc_id`;
ALTER TABLE `lich_hen` ADD CONSTRAINT `chk_lich_hen_so_lan_tu_doi` CHECK (`so_lan_tu_doi_lich` >= 0);
-- Q5: thông báo của yêu cầu đổi lịch (nếp thong_bao_index_yeu_cau_chi_nhanh)
ALTER TABLE `thong_bao` ADD COLUMN `yeu_cau_doi_lich_ngoai_chinh_sach_id` bigint
  COMMENT 'Chỉ có với thông báo sinh từ một yêu cầu đổi lịch ngoài chính sách; khi có thì lich_hen_id để trống (tránh trùng UNIQUE khi một lịch có nhiều yêu cầu theo thời gian)' AFTER `lich_hen_id`;
CREATE UNIQUE INDEX `thong_bao_index_yeu_cau_doi_lich` ON `thong_bao` (`yeu_cau_doi_lich_ngoai_chinh_sach_id`, `tai_khoan_id`, `loai_su_kien`);
ALTER TABLE `thong_bao` ADD FOREIGN KEY (`yeu_cau_doi_lich_ngoai_chinh_sach_id`) REFERENCES `yeu_cau_doi_lich_ngoai_chinh_sach` (`yeu_cau_doi_lich_ngoai_chinh_sach_id`);
-- Q6: giá trị mới ở CUỐI ENUM (giữ nguyên mọi giá trị cũ và thứ tự)
ALTER TABLE `nhat_ky_hanh_dong` MODIFY `hanh_dong` ENUM (<26 giá trị hiện có, giữ nguyên thứ tự>, 'DoiLichHo') NOT NULL;
```

- **Không** đổi cấu trúc bảng `yeu_cau_doi_lich_ngoai_chinh_sach` so với `clinix_mysql.sql` (Q4: không UNIQUE DB); migration P1 chỉ **tạo** bảng vì chưa migration nào tạo (xem đoạn "Sửa 24/11/2026" ở cuối mục này). Hai CHECK sẵn có (`chk_doi_lich_xu_ly`, `chk_doi_lich_nguoi_xu_ly`) giữ nguyên và được test lại trên entity (MDL-07).
- `chk_lich_hen_so_lan_tu_doi` chỉ tham chiếu cột mới (không tham chiếu cột AUTO_INCREMENT nên không dính lỗi 3818 của quy tắc 27).
- **Ba file `docs/database/*` sửa cùng PR:** `clinix.dbml` (cột, FK, index, ENUM), `clinix_mysql.sql` (DDL, đầu file ghi dòng "24/11/2026 (booking scope #9, task P1)…" theo nếp dòng 46 của file, các `COMMENT`, danh sách CHECK ở đầu file), `clinix_quy_tac_nghiep_vu.md` (mục mới "booking scope #9 — Đổi lịch": ý nghĩa `so_lan_tu_doi_lich`, quy tắc cột này; xác nhận quy tắc 2 bỏ chữ "[đề xuất, chưa xác nhận]"; cập nhật quy tắc 27 "đã có mã" khi B1 xong; dòng B19 "Đổi lịch (chưa có mã)" đổi thành tham chiếu mục mới; hai dòng mới ở bảng "quy tắc DB không ép": chuỗi tối đa `MAX_CHAIN_DEPTH - 1` và "mỗi lịch cũ chỉ có một lịch mới" đã là UNIQUE).
- Entity: `YeuCauDoiLichNgoaiChinhSach` (mới, đủ cột bảng, enum trạng thái), `LichHen.soLanTuDoiLich`, `ThongBao.yeuCauDoiLichNgoaiChinhSachId`; `enums.ts` thêm `DoiLichHo`; `database/entities.ts` và `migrations/index.ts` đăng ký.
- Test chạy ở P1: parity `schema-parity` và `audit-enum-parity`, migration lên và xuống trên MySQL thật (MDL-01 đến MDL-10).
- **Sửa 24/11/2026 khi làm P1 (đã kiểm bằng mã và DDL; Đại duyệt các điểm này cùng ngày, câu E1, E3, E7 của TRACKING 1.1):** (1) bảng `yeu_cau_doi_lich_ngoai_chinh_sach` có trong `clinix_mysql.sql` nhưng **CHƯA migration nào tạo** (bản đầu của PLAN ghi nhầm là đã có ở `1793090000000-tao-bang-van-hanh.ts`; migration đó chỉ nhắc tên bảng trong ENUM `loai_doi_tuong`; file SQL có 46 bảng, migration tạo 36), nên migration P1 **TẠO bảng** bằng đúng 8 câu nguyên văn của file SQL, đặt TRƯỚC các câu khác vì khóa ngoại của `thong_bao` cần bảng; (2) ba câu của `thong_bao` chạy theo thứ tự **cột, chỉ mục, khóa ngoại** (nếp P7; khối SQL trên ghi cột, khóa ngoại, chỉ mục) để `SHOW CREATE TABLE` trùng DB dựng từ file SQL chính thức; (3) ENUM `hanh_dong` hiện có **26** giá trị (đếm ở `clinix_mysql.sql`), thành 27; (4) CHECK viết nhiều dòng theo nếp file SQL, COMMENT của hai cột ghi "(reschedule P1, Q1)" và "(reschedule P1, Q5)" (chữ cuối cùng ở migration và `clinix_mysql.sql`); (5) `down` **CHẶN** khi còn dữ liệu mới (bộ đếm khác 0, thông báo gắn yêu cầu, nhật ký `DoiLichHo`, dòng của bảng yêu cầu), báo SỐ dòng, theo nếp P7, B19, UX7, payment P1; (6) thêm MDL-08 đến MDL-10 (hai mặt nạ cho test của migration cũ, mốc migration, `dbml-parity.spec.ts`) và hai mặt nạ ở `database/testing/official-schema.ts`; (7) bỏ chữ "[đề xuất, chưa xác nhận]" ở quy tắc service 2 (căn cứ Q7 (a)), quy tắc 27 để B1.

### 5.3 Máy trạng thái và bất biến

| Chuyển | Ai | Điều kiện (kiểm LẠI dưới khoá) | Khung giờ |
|---|---|---|---|
| `DaXacNhan` → `DaDoiLich` | actor mới `DoiLich` (chỉ `AppointmentRescheduleService` gọi `markReplaced`; **không có API đổi trạng thái tay**, Q24 vẫn cấm override tới `DaDoiLich`) | lịch còn `DaXacNhan` và lịch mới đã được chèn trong CÙNG giao dịch | khung giờ cũ `DaDat` → `ConTrong` (`release(from: 'DaDat', den: null)`); khung giờ mới `ConTrong` → `DangGiuCho` → `DaDat` (`hold` rồi `markBooked`; cọc đã thu nên không có hạn thanh toán) |
| (tạo) → `DaXacNhan` | cùng service | `INSERT` thẳng, `han_thanh_toan` NULL, `lich_hen_truoc_id` = lịch cũ | như trên |

`markReplaced(em, { lichHenId })`: `UPDATE lich_hen SET trang_thai = 'DaDoiLich' WHERE lich_hen_id = ? AND trang_thai = 'DaXacNhan'` phải ảnh hưởng đúng 1 hàng, **không đổi mọi cột khác** (đặc biệt các mốc B19: "lịch cũ thành `DaDoiLich` giữ nguyên mọi mốc"); trả `Replaced` hoặc `InvalidState`.

**Bất biến mới** (viết thành truy vấn trong `appointments/testing/invariants.ts`, chạy sau mọi test đồng thời; INV-1 đến INV-6 của booking giữ nguyên):
- **INV-7:** lịch `DaDoiLich` ⇔ có **đúng một** lịch khác có `lich_hen_truoc_id` trỏ nó; lịch có `lich_hen_truoc_id` khác NULL thì cha của nó là `DaDoiLich`.
- **INV-8:** lịch con cùng cha về `benh_nhan_id`, `ho_so_nguoi_than_id`, `bac_si_id`, `chi_nhanh_id`, `dich_vu_kham_id`, `gia_snapshot`, `tien_coc_snapshot`, `chinh_sach_hoan_snapshot` (so từng cột, JSON so sau khi phân tích); `so_lan_tu_doi_lich` của con bằng cha hoặc cha + 1.
- **INV-9:** mỗi chuỗi có **đúng một** lịch không phải `DaDoiLich` (lịch cuối, đang sống hoặc đã `HoanThanh`/`DaHuy`/`VangMat`), không có vòng, độ dài `<= MAX_CHAIN_DEPTH`.
- **INV-10 (tiền):** đổi lịch không làm đổi số hàng và tổng của `giao_dich_thanh_toan`, `giao_dich_vi`, `lich_su_hoan_tien` (đếm trước và sau mỗi ca đổi); sổ ví giữ IVT-01 đến IVT-07 của payment.

### 5.4 Thứ tự khoá, giao dịch, tương tranh (**mở rộng bảng khoá toàn cục booking 5.3, không đảo**)

Mọi luồng ghi của scope này đi trong `withBookingTransaction` (READ COMMITTED, thử lại 1213/1205 hai lần, chờ khoá 3 giây) và xin khoá THEO CHIỀU từ ngoài vào trong, bỏ qua tầng không cần:

| Tầng | Hàng khoá | Tự đổi, đổi hộ, duyệt | Tạo yêu cầu | Từ chối |
|---|---|---|---|---|
| 2 | `benh_nhan` `FOR UPDATE` của **chủ lịch cũ** (không phải tài khoản người thao tác) | có | có | không |
| 3 | `ho_so_nguoi_than` `FOR UPDATE` (nếu lịch của hồ sơ người thân), kiểm hiệu lực dưới khoá | có | có | không |
| 4 | `bac_si` `FOR SHARE` (một hàng: khung giờ mới phải cùng bác sĩ) | có | có | không |
| 5 | `khung_gio` `FOR UPDATE`: **hai hàng theo `khung_gio_id` tăng dần**, so BẰNG BigInt (không so chuỗi: "9" lớn hơn "10") | khung giờ cũ và mới | **một** hàng: khung giờ mong muốn | không |
| 6 | `lich_hen` cũ `FOR UPDATE` theo `lich_hen_id` (không bao giờ theo `khung_gio_id`, quy tắc 7) | có | có | không |
| 6c | `yeu_cau_doi_lich_ngoai_chinh_sach` `FOR UPDATE` theo khoá chính (**SAU** `lich_hen`, **TRƯỚC** tầng 7) | duyệt: có | không (chưa có hàng) | có |
| 7 | `thong_bao`, `email_thong_bao`, `nhat_ky_hanh_dong` (chỉ-thêm) | có | có | có |

Quy tắc áp dụng (chép nếp booking 5.3 và thêm đặc thù đổi lịch):
1. **Đọc thường MỘT lần** theo `ma_lich_hen` (hoặc `yeu_cau_id`) để lấy `lich_hen_id`, `benh_nhan_id`, `ho_so_nguoi_than_id`, `bac_si_id`, `khung_gio_id` (cũ); cả năm giá trị **bất biến** sau khi chèn lịch. Khung giờ mới: đọc thường `khung_gio ⋈ lich_lam_viec` để biết `bac_si_id` (bất biến) và từ chối `KHUNG_GIO_KHAC_BAC_SI` TRƯỚC khi xin khoá nào; khung giờ trùng khung giờ cũ cũng từ chối trước khoá. Rồi khoá theo bảng trên, rồi **kiểm lại trạng thái, sở hữu, phạm vi, điều kiện dưới khoá**.
2. Hai `khung_gio` luôn khoá **theo id tăng dần** bất kể đâu là cũ, đâu là mới (R1). Hai lần đổi chéo X↔Y cùng xin X trước rồi Y: không có chu trình; bên thứ hai thấy khung giờ đã `DaDat` ⇒ `KHUNG_GIO_DA_DAT` (TDL-03).
3. Mọi `INSERT` có khoá ngoại (`lich_hen` mới trỏ `lich_hen_truoc_id`, `khung_gio_id`, `benh_nhan_id`; `yeu_cau` trỏ `khung_gio` và `lich_hen`; `thong_bao`) chỉ được chạy **SAU** khi mọi hàng cha đã khoá ở tầng trên (bài học B11, B12, R2): InnoDB xin S trên hàng cha, nên xin sau tầng 6 mà hàng cha ở tầng 5 là ngược chiều. Thông báo của yêu cầu để `lich_hen_id` NULL nên không xin S trên `lich_hen`.
4. **Từ chối chỉ khoá 6c.** Từ chối không ghi `lich_hen`, `khung_gio` nên bỏ qua tầng 2 đến 6; `UPDATE` yêu cầu không đổi cột khoá ngoại nào ngoài `nguoi_xu_ly_id` (S trên `tai_khoan`, tầng 1: cùng loại rủi ro đã chấp nhận ở booking B12 R). Duyệt và từ chối cùng một yêu cầu tuần tự nhờ 6c (TDL-13).
5. Tác dụng phụ **sau commit, đúng một lần**: `WaitlistPort.onSlotReleased(khungGioCuId)` chỉ khi giờ hẹn cũ `> now` và đổi đã `Rescheduled`; bọc `try/catch`, log chỉ id nội bộ và tên lớp lỗi; không hoàn tiền, không gọi `PaymentPort`.
6. Thông báo, email, audit ghi bằng `em` của giao dịch (lỗi ⇒ hoàn tác cả đổi lịch, 2.4.70 A1).
7. Kết quả **có kiểu** (không ném `AppException` trong thân): từ chối xảy ra TRƯỚC lần ghi đầu tiên ⇒ giao dịch commit rỗng; lỗi sau lần ghi đầu tiên ⇒ NÉM nội bộ để hoàn tác trọn rồi đổi sang lỗi API sau khi giao dịch đóng (nếp `CreateRollback`).
8. Một mốc `now = toSecond(nowVN())` cho cả lượt và mọi lần chạy lại của thân; không `NOW()` trong SQL.

**Phân tích từng cặp tương tranh (chưa đo; X1 M1 đến M6 đo, X2 chạy):**

| Cặp | Phân tích | Kết luận dự kiến |
|---|---|---|
| đổi × đổi, hoán vị khung giờ | cùng khoá X trước Y | một thắng hoặc cả hai `KHUNG_GIO_DA_DAT`; 0 lần 1213 (đối chứng đảo thứ tự ⇒ 1213, M1) |
| đổi × đổi, cùng khung giờ mới (hai bệnh nhân) | khoá tầng 2 khác nhau, gặp nhau ở tầng 5 | một thắng; thua `KHUNG_GIO_DA_DAT` |
| đổi × đổi, cùng một lịch (hai tab) | cùng `benh_nhan` X ⇒ tuần tự; bên sau thấy `DaDoiLich` (Bệnh nhân: 404 cùng thân) | một thắng, không chuỗi rẽ nhánh; 1062 của `lich_hen_truoc_id` không lộ ra |
| đổi × `create` của cùng bệnh nhân | cùng `benh_nhan` X ⇒ tuần tự; chồng giờ được kiểm lại sau | không có hai lịch chồng giờ (TDL-11) |
| đổi × huỷ, tiếp đón, xác nhận, hết hạn của cùng lịch | đường kia xin khung giờ rồi `lich_hen`, rồi S ngầm trên `benh_nhan` (B12 Q): ngược chiều tầng 2 của đổi lịch | **rủi ro ĐÃ biết và đã chấp nhận ở B12** (TECH_DEBT 113): có thể 1213, `withBookingTransaction` hoàn tác và chạy lại, kết quả cuối đúng, 503 chỉ khi ba lần liền; TDL-04 đếm và ghi số đo |
| đổi × `markNoShow` hoặc job Vắng mặt | cả hai khoá `benh_nhan` X trước (tầng 2 rồi 6) | tuần tự, không chu trình |
| đổi × duyệt nghỉ phép | duyệt nghỉ xin `bac_si` X, đổi xin S ở tầng 4, kiểm nghỉ phép dưới khoá (H5) | hoặc đổi thấy nghỉ đã duyệt và từ chối, hoặc lịch mới bị `findAffectedByLeave` bắt và huỷ hoàn cọc đúng một lần (TDL-09) |
| đổi × admin áp dụng/duyệt thay đổi chi nhánh | `PendingBranchChangesPort` đọc dưới khoá `bac_si` và `khung_gio` (H6); phía admin chưa kiểm khoá | `[chưa đo]` M6: đọc mã `admin/…/apply` rồi đo; TDL-10 |
| duyệt × duyệt, duyệt × từ chối | 6c | một thắng (TDL-12, TDL-13) |
| duyệt × huỷ lịch gốc, duyệt × đổi hộ | tầng 2 đến 6 như đổi × huỷ | một thắng; không lịch mới từ lịch đã huỷ (TDL-14, TDL-15) |
| tạo yêu cầu × tạo yêu cầu cùng lịch | khoá `lich_hen` rồi kiểm "đã có `ChoDuyet`" dưới khoá | đúng một yêu cầu (TDL-16) |
| gỡ ca (`doctor`) × đổi/tạo yêu cầu | `DELETE khung_gio` bị khoá ngoại chặn khi có lịch hay yêu cầu tham chiếu (D7) | `CA_DANG_CO_LICH_HEN` phía doctor, không deadlock vì thứ tự `khung_gio` trước `lich_hen` |

### 5.5 Lõi đổi lịch: một thân giao dịch cho ba đường (task B1 đến B4)

```ts
// reschedule.types.ts [đề xuất]; giống nếp cancel.types.ts: actor và via là MỘT union gắn với nhau
type RescheduleInput = { maLichHen: string; khungGioMoiId: string } & (
  | { via: 'TuDoi'; actor: { kind: 'BenhNhan'; accountId: string }; lyDoYeuCau: string | null }
  | { via: 'DoiHo'; actor: { kind: 'LeTan'; accountId: string; chiNhanhId: string }; lyDo: string }
  | { via: 'DuyetYeuCau'; actor: { kind: 'LeTan'; accountId: string; chiNhanhId: string } | { kind: 'QuanTriVien'; accountId: string; scope: AdminScope };
      yeuCauId: string; ghiChu: string }
);
type RescheduleOutcome =
  | { kind: 'Rescheduled'; maLichHenCu: string; maLichHenMoi: string; thoiGianMoi: Date }
  | { kind: 'RequestCreated'; yeuCauId: string }                       // TuDoi, vượt hạn mức, có lyDoYeuCau
  | { kind: 'NeedsRequestReason'; soLanDaDoi: number; toiDa: number }  // TuDoi, vượt hạn mức, thiếu lyDoYeuCau: không ghi gì
  | { kind: 'Rejected'; failure: RescheduleFailure };                  // mã ở 5.13; từ chối trước lần ghi đầu tiên
```

Luồng (một giao dịch; `now = toSecond(nowVN())` MỘT lần; cấu hình ngoài giao dịch):
0. Ngoài giao dịch: DTO; `SystemConfigService.getOrThrow()` (thiếu ⇒ 409 `HE_THONG_CHUA_CAU_HINH`); đọc thường lịch cũ theo `ma_lich_hen` và khung giờ mới (5.4 quy tắc 1); không có/ngoài phạm vi/của người khác ⇒ `NotFound` (Bệnh nhân với `DaDoiLich` cũng `NotFound`, cùng thân); `KHUNG_GIO_TRUNG_LICH_CU`, `KHUNG_GIO_KHAC_BAC_SI`. **Chọn nhánh (đổi hay yêu cầu) ngay ở lần đọc thường**: `so_lan_tu_doi_lich` của lịch cũ bất biến sau khi chèn (chỉ lịch MỚI nhận giá trị cộng thêm), nên số đếm đọc thường đã đủ; nhờ vậy nhánh yêu cầu không phải khoá khung giờ cũ.
1. Giao dịch: khoá theo 5.4 (`benh_nhan` → `ho_so_nguoi_than` → `bac_si` → hai `khung_gio` tăng dần → `lich_hen` cũ → với duyệt: yêu cầu).
2. Kiểm LẠI dưới khoá: phạm vi và sở hữu (404), trạng thái `DaXacNhan` (`LICH_HEN_KHONG_CHO_DOI`), hạn giờ theo `via` (Q3; `LICH_HEN_DA_QUA_GIO`), hồ sơ người thân còn hiệu lực, bác sĩ vẫn giữ dịch vụ và chi nhánh của lịch (`LICH_HEN_KHAC_DICH_VU_HIEN_TAI`, `LICH_HEN_KHAC_CHI_NHANH_HIEN_TAI`), độ dài chuỗi (`CHUOI_DOI_LICH_QUA_DAI`); duyệt: yêu cầu còn `ChoDuyet` (`YEU_CAU_DA_XU_LY`).
3. `BookabilityReader.read(em, {…, noShowLocked: false, thayThe: { maLichHen: cũ }}, 'locked')` rồi `evaluateBookability(facts)` (9 bước giữ nguyên thứ tự: khung giờ `DaDat`/`DangGiuCho`/`HetHan`, quá giờ, bác sĩ khả dụng, ca đúng chi nhánh, giờ nhận khám, nghỉ phép, **vùng bị loại bởi thay đổi chi nhánh** (đóng TECH_DEBT 260: `findBlocking` với `ca` của khung giờ ĐÍCH, dưới khoá; khung giờ NGUỒN không kiểm), số lịch, chồng giờ; hai bước cuối **không tính** lịch cũ). Lỗi đầu tiên ⇒ `Rejected`.
4. `TuDoi`: nếu `so_lan_tu_doi_lich >= toiDa`: có `lyDoYeuCau` ⇒ **nhánh yêu cầu** (5.7: kiểm "đã có `ChoDuyet`", chèn yêu cầu, thông báo `YeuCauDoiLichDangCho`, KHÔNG ghi khung giờ nào, trả `RequestCreated`); thiếu ⇒ `NeedsRequestReason` (không ghi gì).
5. Nhánh đổi: hết hạn lười nếu khung giờ mới `DangGiuCho` đã quá hạn (dùng chung `claimSlot` với `create`); `INSERT lich_hen` mới qua `insertLichHen`: mã mới (sinh lại tối đa 5 lần như `create`), `khung_gio_id` mới, `lich_hen_truoc_id` = cũ (**service kiểm "không tự trỏ chính nó" trước**, quy tắc 27), cùng `benh_nhan_id`, `ho_so_nguoi_than_id`, `bac_si_id`, `chi_nhanh_id`, `dich_vu_kham_id` với lịch cũ, `thoi_gian` = giờ khung giờ mới, ba bản chụp **sao chép nguyên** từ lịch cũ (không tính lại giá: bác sĩ đổi phụ phí về sau không ảnh hưởng), `trang_thai` `DaXacNhan`, `han_thanh_toan` NULL, `ly_do_kham` sao chép, `thoi_diem_tao` = `now` (Q12), `thoi_diem_xac_nhan` = `now` (Q7 (d)), `so_lan_tu_doi_lich` = cũ + 1 (`TuDoi`) hoặc cũ (`DoiHo`, `DuyetYeuCau`). 1062 trên `ma_lich_hen` ⇒ sinh lại; trên `khung_gio_dang_giu` ⇒ hoàn tác `KHUNG_GIO_DA_DAT`; trên `lich_hen_truoc_id` ⇒ hoàn tác `LICH_HEN_KHONG_CHO_DOI` (đã có lịch mới).
6. `SlotHoldService.hold` + `markBooked` khung giờ mới (`ConTrong` → `DaDat`), `release(from: 'DaDat', den: null)` khung giờ cũ; mỗi lần không `Done` ⇒ ném để hoàn tác trọn (dữ liệu lệch).
7. `AppointmentTransitionService.markReplaced` lịch cũ → `DaDoiLich`.
8. `DuyetYeuCau`: `UPDATE` yêu cầu `DaDuyet` + `ghi_chu_xu_ly` + `nguoi_xu_ly_id` + `thoi_diem_xu_ly` (CHECK DB bắt cặp này); Audit `XuLyDoiLichNgoaiChinhSach`. `DoiHo`: Audit `DoiLichHo`.
9. `AppointmentNotifier.notify(em, …)`: `LichHenDaDoiLich` (tự đổi, đổi hộ; `lich_hen_id` = lịch MỚI) hoặc `YeuCauDoiLichDaDuyet` (duyệt; gắn yêu cầu). Mọi lỗi từ bước 5 đến 9 ⇒ ném, hoàn tác cả lịch mới lẫn khung giờ.
10. Commit; sau commit: `WaitlistPort.onSlotReleased(khungGioCuId)` (5.4 quy tắc 5). Trả `Rescheduled`.

**Vì sao nguyên tử một bước vẫn đúng ý "giữ chỗ trước, chỉ khi chắc chắn mới đụng lịch cũ" (2.4.9 b5, 2.4.31 b5, b6):** khung giờ mới được khoá `FOR UPDATE` và kiểm trống dưới khoá TRƯỚC mọi thay đổi lịch cũ; `INSERT` lịch mới (lưới UNIQUE `khung_gio_dang_giu`) xảy ra TRƯỚC `markReplaced`; mọi bước cùng một giao dịch nên không có lúc nào Bệnh nhân mất lịch (lỗi bất kỳ ⇒ lịch cũ vẫn `DaXacNhan`, khung giờ cũ vẫn `DaDat`).

### 5.6 Bộ luật "đổi được không" và thứ tự lỗi (task B2)

`reschedulability.rules.ts` (hàm thuần, không đọc đồng hồ) quyết các điều kiện riêng của đổi lịch; điều kiện chung với đặt lịch dùng lại `evaluateBookability` với `facts.thayThe`:

```ts
// Thêm vào BookabilityFacts (tuỳ chọn, mặc định null = hành vi cũ của checks và create):
thayThe: { maLichHen: string } | null;
// counted = (m) => m !== ownHolder && m !== thayThe?.maLichHen   (đếm lịch đang hoạt động VÀ chồng giờ)
```

**Thứ tự lỗi** (dừng ở lỗi đầu tiên; mọi đường dùng chung):
`400` DTO → `401/403` vai trò → `409 HE_THONG_CHUA_CAU_HINH` → `404` lịch (không có, của người khác, ngoài phạm vi, `DaDoiLich` với Bệnh nhân; cùng một thân) → `409 LICH_HEN_KHONG_CHO_DOI` (kèm `chiTiet.trangThai`) → `409 LICH_HEN_DA_QUA_GIO` → `409 HO_SO_NGUOI_THAN_DA_NGUNG` → `404 KHUNG_GIO_KHONG_TON_TAI` → `409 KHUNG_GIO_TRUNG_LICH_CU` → `409 KHUNG_GIO_KHAC_BAC_SI` → `409 LICH_HEN_KHAC_DICH_VU_HIEN_TAI` → `409 LICH_HEN_KHAC_CHI_NHANH_HIEN_TAI` → `409 CHUOI_DOI_LICH_QUA_DAI` → chín bước của `evaluateBookability` (bước 1 khoá no-show **không áp dụng**, Q7 (b)) → riêng `TuDoi`: `VUOT_SO_LAN_TU_DOI` hoặc nhánh yêu cầu → `409 DA_CO_YEU_CAU_DOI_LICH_CHO_DUYET` (nhánh yêu cầu).

Hạn giờ (Q3), nửa mở theo H8: `TuDoi`: lịch cũ `thoi_gian > now`; `DoiHo`, `DuyetYeuCau`: `thoi_gian + check_in_sau_phut phút > now` (`check_in_sau_phut` đọc từ cấu hình; không có ⇒ `HE_THONG_CHUA_CAU_HINH`). Không tách thời gian bằng chuỗi: so `Date`.

Đổi hộ khi đang có yêu cầu `ChoDuyet` của chính lịch đó được phép (Lễ tân có thể đang thực hiện hộ); yêu cầu thành "tồn" (R6) và Lễ tân từ chối kèm ghi chú.

Chuỗi: `PaymentChain` (đọc, có sẵn) cho độ sâu; từ chối khi độ sâu hiện tại `>= MAX_CHAIN_DEPTH - 1` (lấy hằng, không số cứng).

### 5.7 Yêu cầu ngoài chính sách (task B5, B8, B9)

**Tạo (nhánh của `TuDoi` vượt hạn mức):** sau bước 3 ở 5.5, chuỗi khoá 2, 3, 4, 5 (CHỈ khung giờ mong muốn), 6; kiểm `SELECT 1 FROM yeu_cau_doi_lich_ngoai_chinh_sach WHERE lich_hen_id = ? AND trang_thai = 'ChoDuyet'` (dưới khoá `lich_hen`, Q4) ⇒ 409 `DA_CO_YEU_CAU_DOI_LICH_CHO_DUYET`; `INSERT` (`lich_hen_id`, `khung_gio_mong_muon_id`, `ly_do_yeu_cau` chuẩn hoá 5 đến 500, `trang_thai` `ChoDuyet`, `thoi_diem_tao` = `now`); `notify` `YeuCauDoiLichDangCho`. Khung giờ mong muốn **không** đổi trạng thái (Q7 (f)): người khác đặt được ngay sau đó, nên lúc duyệt có thể gặp 409 (A2 của 2.4.31).

**Danh sách và chi tiết** (`GET …/reschedule-requests`): lọc `trangThai` (mặc định `ChoDuyet`; tab "Đã xử lý" = `DaDuyet,TuChoi`), `bacSiId`, `q` (mã lịch hẹn, chuẩn hoá chữ hoa như `AppointmentCodePipe`), `chiNhanhId` (chỉ Quản trị viên Toàn hệ thống); phân trang offset `common/paging`; sắp `thoi_diem_tao` tăng cho `ChoDuyet` (cũ nhất trước), giảm cho đã xử lý. Phạm vi: `lich_hen.chi_nhanh_id` bằng chi nhánh Lễ tân (`ReceptionScopeService`) hoặc `BranchAccessPolicy` cho Quản trị viên; ngoài phạm vi ⇒ không xuất hiện ở danh sách và 404 cùng thân ở chi tiết. **Danh sách trắng khoá** (không SĐT, email, `ly_do_kham`, giá, id lịch): `yeuCauId`, `trangThai`, `thoiDiemTao`, `maLichHen`, `nguoiKham { hoTen, laNguoiThan }`, `bacSi { hoTen }`, `chiNhanh { id, ten }`, `thoiGianCu`, `thoiGianMongMuon`, `soLanDaTuDoi`; chi tiết thêm `soLanToiDa`, `lyDoYeuCau`, `trangThaiLichGoc`, `coTheDuyet`, `lyDoKhongDuyet`, `khungGioMongMuon { khungGioId, trangThai }` (cho nhân sự biết còn trống không), `ghiChuXuLy`, `thoiDiemXuLy`, `nguoiXuLy { hoTen }`. `coTheDuyet` tính từ trạng thái lịch gốc, hạn giờ của nhân sự và trạng thái yêu cầu (đọc thường, kết quả thông tin; quyết định thật ở lúc duyệt).

**Duyệt** (`POST …/:yeuCauId/approve` `{ ghiChu, khungGioId? }`): đọc thường yêu cầu và lịch gốc; kiểm phạm vi; chạy lõi 5.5 với `via: 'DuyetYeuCau'`, khung giờ đích = `khungGioId` (thay thế) hoặc `khung_gio_mong_muon_id`. Từ chối có kiểu (tranh chấp, quá giờ, lịch gốc không còn `DaXacNhan`, vùng bị loại…) ⇒ 409 **và yêu cầu vẫn `ChoDuyet`**, không audit, không thông báo (2.4.31 A2). **Từ chối** (`POST …/:yeuCauId/reject` `{ ghiChu }`): khoá 6c (5.4 quy tắc 4), kiểm `ChoDuyet`, `UPDATE` `TuChoi`, Audit, `notify` `YeuCauDoiLichBiTuChoi`; **không** giữ chỗ, không đụng khung giờ (2.4.31 b7). Ghi chú: `trim`, 1 đến 255 ký tự, văn bản thuần (Q10: đi nguyên văn tới bệnh nhân).

**Yêu cầu tồn** (R6): lịch gốc huỷ, tiếp đón, Vắng mặt hay đã đổi hộ ⇒ `coTheDuyet = false`, duyệt 409, từ chối được. Không có trạng thái "Hết hạn" trong ENUM, không job dọn (nháp TECH_DEBT 267).

### 5.8 Endpoint (tên `[đề xuất]`, Q13; tiền tố `/api` qua proxy; `Cache-Control: no-store`; id BIGINT là chuỗi)

| Vai | Route | Thân / tham số | Thành công | Lỗi |
|---|---|---|---|---|
| Bệnh nhân | `GET /patient/appointments/:maLichHen/reschedule-preview?khungGioId=` | `khungGioId` tuỳ chọn | 200 `{ choPhepDoi, lyDoKhongDoi?, loai: 'TuDoi' \| 'GuiYeuCau', soLanDaDoi, soLanToiDa, coYeuCauChoDuyet, lichCu: { thoiGian }, lichMoi: { khungGioId, thoiGian, hopLe, lyDoKhongHopLe? } \| null, thoiGianMayChu }` (đọc không khoá; không có `khungGioId` thì chỉ trả điều kiện đổi để hiện nút) | 404, 403, 409 `HE_THONG_CHUA_CAU_HINH` |
| Bệnh nhân | `POST /patient/appointments/:maLichHen/reschedule` | `{ khungGioId, lyDoYeuCau? }` | 201 `{ ketQua: 'DaDoi', lichHenMoi: { maLichHen, thoiGian, trangThai }, lichHenCu: { maLichHen }, thoiGianMayChu }` hoặc 201 `{ ketQua: 'DaGuiYeuCau', yeuCau: { trangThai: 'ChoDuyet', thoiGianMongMuon }, thoiGianMayChu }` | 400, 403, 404, 409 (mã 5.13) |
| Lễ tân | `GET /reception/appointments/:maLichHen/reschedule-preview?khungGioId=` | như trên (không có `loai`, `soLan*`) | 200 | 404 cùng thân ngoài chi nhánh |
| Lễ tân | `POST /reception/appointments/:maLichHen/reschedule` | `{ khungGioId, lyDo }` (Q9) | 201 `{ ketQua: 'DaDoi', lichHenMoi, lichHenCu }` | như trên |
| Lễ tân | `GET /reception/reschedule-requests`, `GET /reception/reschedule-requests/:yeuCauId` | 5.7 | 200 | 404 ngoài chi nhánh |
| Lễ tân | `POST /reception/reschedule-requests/:yeuCauId/approve`, `…/reject` | 5.7 | 200 `{ yeuCau: { trangThai }, lichHenMoi? }` | 400 ghi chú, 404, 409 |
| Quản trị viên | `GET /admin/reschedule-requests`, `…/:yeuCauId`, `POST …/approve`, `…/reject` | như Lễ tân, thêm `chiNhanhId` cho Toàn hệ thống | như trên | 404 ngoài phạm vi |
| Bệnh nhân | `GET /patient/appointments/:maLichHen` (đã có) | thêm khoá `choPhepDoiLich` và `yeuCauDoiLich` | `yeuCauDoiLich: { trangThai, thoiGianMongMuon, ghiChuXuLy, thoiDiemTao } \| null` (yêu cầu **mới nhất** của lịch); 17 → 19 khoá | |
| Lễ tân | `GET /reception/appointments/:maLichHen` (đã có) | thêm `choPhepDoiLich` và `coYeuCauChoDuyet` | | |
| (đã có) | `GET /public/doctor-slots?bacSiId=&ngay=` | lưới khung giờ cho bộ chọn | | |

Quyền: `@Roles` ghi TRÊN TỪNG route (AR-02, QB-07); Quản trị viên `@RequireAdminScope('Any')`; Quản trị viên **không** có route đổi hộ; Bệnh nhân không có route yêu cầu của nhân sự; vai khác ⇒ 403. Phạm vi và sở hữu kiểm ở lần đọc thường **và** lại dưới khoá (5.4 quy tắc 1).

### 5.9 Cổng và điểm nối với module khác

| Module | Điểm nối | Việc cụ thể | Ghi chú |
|---|---|---|---|
| `payment` | `PaymentSummaryPort.amountPaid`, `remainingToCollect`, `amountRefundable` (đã truy lịch gốc qua `PaymentChain`) | **Không có mã mới**; ca HDL-03 chạy với lớp thật trên chuỗi 2 và 3 lịch; thu tiền mặt ở lịch mới ghi `lich_hen_id` = lịch gốc (ca TTQ-13 trong PLAN payment; chạy lại với đổi lịch thật ở HDL-03) | `PaymentPort.recordZeroPayment` **không** gọi khi đổi (lịch cọc 0đ đã có giao dịch 0đ ở lịch gốc) |
| `wallet` | `RefundPort`, `refund.queries` (đệ quy xuôi tới lịch cuối) | không đổi; HDL-04: huỷ lịch **mới** hoàn đúng theo `chinh_sach_hoan_snapshot` và giờ hẹn mới, trên khoản thanh toán của lịch gốc, không hoàn hai lần | kẽ hở R3 |
| `waitlist` | `WaitlistPort.onSlotReleased(khungGioCuId)` | gọi sau commit; `Noop` hiện tại không mời ai (chạy đủ, cảnh báo log một lần); khi #11 có mã: chạy lại DLH-13, DLH-14, đóng TECH_DEBT 147 phần này | đổi lịch **không phụ thuộc** waitlist |
| `notification` (Trung tâm thông báo, nhắc lịch) | `AppointmentNotifier`, `thong_bao`, `email_thong_bao` | bốn sự kiện mới (5.10); nhắc lịch (`nhac_lich_hen`) tính mốc cho lịch **mới** và bỏ qua lịch `DaDoiLich` (2.4.69 A2): việc của module sau | |
| `audit` | `AuditService` | hai hành động (5.11); luật kiểm ở P2 | `[ĐỤNG audit]` |
| `admin` | `SystemConfigService`, `BranchAccessPolicy`, `PendingBranchChangesPort`, entity | đọc cấu hình; phạm vi Quản trị viên; cổng vùng bị loại; entity mới | `[ĐỤNG admin]` |
| `scheduling` | `BranchHoursReader`, `checkSlotWithinBranchHours`, `LeaveReader` (qua `DoctorLeavePort`) | dùng nguyên, không sửa | |
| `search` | `GET /public/doctor-slots`, `SlotCell`, `DoctorSlotGrid` | web thêm chế độ chọn | `[ĐỤNG search]` |
| `doctor` | trang "Duyệt yêu cầu" (tab đổi lịch), `D7` gỡ ca | bật tab (F5); không đổi gì ở gỡ ca | `[ĐỤNG doctor]` |
| báo cáo (sau) | `lich_hen.lich_hen_truoc_id`, `thoi_diem_tao` | loại lịch có `lich_hen_truoc_id` khi đếm "lượt đặt" (Q12) | TRACKING mục 7 |

### 5.10 Thông báo và email (Q5, Q9, Q10, Q13; ghi **trong** giao dịch bằng `em`; mức tối thiểu như booking B15)

| Sự kiện (`loai_su_kien` `[đề xuất]`) | Khi nào | Gửi cho | `lich_hen_id` | `yeu_cau_…_id` | Nội dung (≤ 500, văn bản thuần, không `ly_do_kham`) |
|---|---|---|---|---|---|
| `LichHenDaDoiLich` | tự đổi, đổi hộ thành công | tài khoản đặt | lịch **MỚI** | NULL | "Lịch hẹn {mã cũ} đã đổi sang {mã mới}: {giờ cũ} → {giờ mới}, {bác sĩ}, {chi nhánh}." Đổi hộ thêm "Lễ tân đã đổi hộ. Lý do: {lyDo}." (Q9, `[đề xuất]`) |
| `YeuCauDoiLichDangCho` | tạo yêu cầu | tài khoản đặt | NULL | yêu cầu | "Yêu cầu đổi lịch hẹn {mã} sang {giờ mong muốn} đã được gửi. Lịch hẹn giữ nguyên {giờ cũ} cho tới khi có kết quả." |
| `YeuCauDoiLichDaDuyet` | duyệt | tài khoản đặt | NULL | yêu cầu | "Yêu cầu đổi lịch hẹn {mã cũ} đã được duyệt. Lịch mới {mã mới}: {giờ mới}. Ghi chú: {ghiChu}." (Q10) |
| `YeuCauDoiLichBiTuChoi` | từ chối | tài khoản đặt | NULL | yêu cầu | "Yêu cầu đổi lịch hẹn {mã} bị từ chối. Lịch hẹn giữ nguyên {giờ cũ}. Ghi chú: {ghiChu}." (Q10) |

- Mỗi `thong_bao` kèm MỘT `email_thong_bao` `ChoGui` (nếp B15); worker `EmailOutboxJob` quét **17** loại (13 loại hiện có thêm bốn loại: `MAIL_EVENTS` ở `email-outbox.query.ts`); bốn mã mới ở hằng riêng `RESCHEDULE_NOTIFICATION_EVENTS`; sửa chữ ca HDK-06 ở `examination.constants.spec.ts`. Thư dựng trên `renderMailShell`, mọi dữ liệu qua `toSingleLine` rồi `escapeHtml`; ghi chú và lý do cắt theo hàm có sẵn để `noi_dung` ≤ 500 (ghi chú 255 + câu mẫu vừa với dữ liệu thường; trường hợp xấu nhất của đổi hộ thì phần lý do bị cắt, phần cố định giữ nguyên).
- Chống ghi trùng: UNIQUE `(lich_hen_id, tai_khoan_id, loai_su_kien)` cho `LichHenDaDoiLich`; UNIQUE mới `(yeu_cau_…_id, tai_khoan_id, loai_su_kien)` cho ba loại còn lại (Q5): chạy lại là "đã có", không dòng email thứ hai; một lịch có hai yêu cầu theo thời gian vẫn có đủ thông báo.
- `AppointmentEvent` thêm trường tuỳ chọn `doiLich?: { maLichHenCu, thoiGianCu, thoiGianMoi, via, lyDo? }` và `yeuCau?: { yeuCauId, ghiChu?, maLichHenMoi?, thoiGianMongMuon }`; chữ ký `notify(em, event)` không đổi, bản `Fake` và `Noop` không vỡ (BPO).
- Lỗi gửi thư **không** hoàn tác đổi lịch (H12). Hết hạn, từ chối do 4xx, kiểm tra thất bại: **không** thông báo.

### 5.11 Nhật ký hành động (P2 viết luật, B7 và B9 gọi; `AuditService`, cùng giao dịch)

| Hành động | Đối tượng (`loai_doi_tuong`, `ma_doi_tuong`) | `chi_nhanh_id` | `chi_tiet_thay_doi` `[đề xuất]` (luật kiểm: đúng tập khoá, không tên, SĐT, email) |
|---|---|---|---|
| `DoiLichHo` (Q6) | `lich_hen`, id lịch **cũ** | chi nhánh của lịch | `{ truoc: { ma_lich_hen, thoi_gian }, sau: { ma_lich_hen, thoi_gian }, ly_do }` (`ly_do` 1 đến 255) |
| `XuLyDoiLichNgoaiChinhSach` (đã có trong ENUM) | `yeu_cau_doi_lich_ngoai_chinh_sach`, id yêu cầu | chi nhánh của lịch | `{ truoc: { trang_thai: 'ChoDuyet' }, sau: { trang_thai: 'DaDuyet' \| 'TuChoi' }, ghi_chu, ma_lich_hen_cu, ma_lich_hen_moi? }` (`ma_lich_hen_moi` chỉ khi duyệt; khung giờ thật suy ra từ lịch mới) |

Không ghi nhật ký khi: Bệnh nhân tự đổi, tạo yêu cầu, đọc, từ chối do 4xx (2.4.70 chỉ liệt kê hành động nhạy cảm; NDL-05). Lỗi ghi nhật ký ⇒ hoàn tác cả hành động gốc (2.4.70 A1; NDL-04, XDL-14, DLO-08). Mô hình này cần Trung xác nhận (Q16).

### 5.12 Frontend (bám component hiện có; trạng thái chưa có frame theo nếp patient Q22; mức kiểm GỌN)

- **Bệnh nhân** (F1, F2): ở chi tiết "Lịch hẹn của tôi" thêm nút "Đổi lịch" (khi `choPhepDoiLich`), nhãn "Gửi yêu cầu đổi lịch" khi hết lần tự đổi, vô hiệu kèm lý do khi đã có yêu cầu chờ hoặc lịch không đổi được; route `PATIENT_APPOINTMENT_DETAIL_ROUTE/doi-lich` (`[đề xuất]`): thẻ "Lịch hiện tại", dải ngày và **lưới khung giờ của đúng bác sĩ** (tái dùng `useDoctorSlots`, `DateStrip`, `DoctorSlotGrid`; ô của khung giờ cũ vô hiệu; ô `ConTrong` thành nút chọn qua prop `onSelect` mới, mặc định vẫn là liên kết) → màn xác nhận "cũ → mới" (giờ Việt Nam; hiện "Bạn còn n lần tự đổi" hoặc "Yêu cầu sẽ chuyển cho Lễ tân duyệt; lịch giữ nguyên tới khi có kết quả" kèm ô lý do 5 đến 500 ký tự) → kết quả: đã đổi ⇒ sang chi tiết lịch MỚI với thông báo; đã gửi yêu cầu ⇒ về chi tiết lịch cũ với banner "Đang chờ duyệt" (và sau đó "Bị từ chối: {ghi chú}"). Đủ loading, rỗng, lỗi, mất mạng, timeout; nút gửi khoá khi đang gửi (bấm đúp không gửi hai lần); `KHUNG_GIO_DA_DAT` quay lại lưới và tải lại.
- **Lễ tân đổi hộ** (F3): nút "Đổi lịch hộ" ở `reception-actions` (khi `choPhepDoiLich`), dùng chung bộ chọn và màn xác nhận của F1, F2 (thêm ô lý do bắt buộc 1 đến 255, dòng nhắc "Bệnh nhân sẽ đọc lý do này").
- **Lễ tân xử lý yêu cầu** (F4): mục menu "Yêu cầu đổi lịch" có `to` (`[ĐỤNG router]`: `role-nav.ts`, `role-routes.tsx`); trang hai tab Chờ duyệt / Đã xử lý; bảng (mã lịch, người khám, bác sĩ, giờ cũ → giờ mong muốn, số lần đã tự đổi, ngày gửi), phân trang; chi tiết (khung hoặc trang con) với lý do, trạng thái khung giờ mong muốn, nút "Duyệt" và "Từ chối" mở hộp ghi chú bắt buộc (giữ lựa chọn khi lỗi; dòng nhắc "Bệnh nhân sẽ đọc ghi chú này"); "Duyệt" cho "Chọn khung giờ khác" (bộ chọn dùng chung); 409 tranh chấp giữ nguyên hộp và gợi ý chọn khung giờ khác hoặc từ chối.
- **Quản trị viên** (F5): tab "Yêu cầu đổi lịch" trong `ApprovalsHostPage` thành liên kết thật tới route con `ADMIN_RESCHEDULE_REQUESTS_PATH` (`[đề xuất]` `/admin/duyet-yeu-cau/doi-lich`), nội dung là thành phần của F4 với API `admin/…`; booking xuất `ADMIN_RESCHEDULE_REQUEST_ROUTES` từ `features/booking/index.ts` và `doctor` chỉ thêm một dòng (nếp D8); sửa ca WA-13 (tab đổi lịch hết vô hiệu).
- **Kiến trúc web:** một lớp API client (`shared/api/client.ts`), đường dẫn ở `shared/routes/booking-paths.ts`, mã lỗi → câu theo `maLoi` (5.13), không `dangerouslySetInnerHTML`, không `fetch` ngoài lớp client (ca kiến trúc như BWZ-08).

### 5.13 Mã lỗi → thông báo (`maLoi` ổn định; chữ `[đề xuất]`, Q13; frontend chọn theo `maLoi`, không theo câu chữ)

| `maLoi` | HTTP | Khi nào | Câu hiển thị `[đề xuất]` |
|---|---|---|---|
| `LICH_HEN_KHONG_CHO_DOI` | 409 (`chiTiet.trangThai`) | trạng thái khác `DaXacNhan` (`ChoThanhToan` kèm gợi ý thanh toán hoặc huỷ) | "Lịch hẹn này hiện không thể đổi. Chỉ lịch đã xác nhận mới đổi được." |
| `LICH_HEN_DA_QUA_GIO` | 409 | Q3 | "Đã quá giờ hẹn nên không thể đổi lịch." |
| `KHUNG_GIO_TRUNG_LICH_CU` | 409 | khung giờ mới là khung giờ cũ | "Bạn đang chọn đúng khung giờ hiện tại. Vui lòng chọn khung giờ khác." |
| `KHUNG_GIO_KHAC_BAC_SI` | 409 | khung giờ thuộc bác sĩ khác | "Chỉ đổi được sang khung giờ của cùng bác sĩ. Muốn đổi bác sĩ, vui lòng huỷ và đặt lại." |
| `LICH_HEN_KHAC_DICH_VU_HIEN_TAI`, `LICH_HEN_KHAC_CHI_NHANH_HIEN_TAI` | 409 | bác sĩ đã đổi dịch vụ chính hay chi nhánh | "Bác sĩ đã thay đổi dịch vụ (hoặc chi nhánh) so với lúc đặt. Vui lòng huỷ và đặt lịch mới." |
| `VUOT_SO_LAN_TU_DOI` | 409 (`chiTiet: { soLanDaDoi, toiDa }`) | hết lần tự đổi, thiếu lý do | "Bạn đã dùng hết số lần tự đổi. Hãy nhập lý do để gửi yêu cầu cho lễ tân." |
| `DA_CO_YEU_CAU_DOI_LICH_CHO_DUYET` | 409 | đã có yêu cầu chờ | "Lịch hẹn này đã có yêu cầu đổi lịch đang chờ duyệt." |
| `CHUOI_DOI_LICH_QUA_DAI` | 409 | chuỗi quá dài (R4) | "Lịch hẹn này đã đổi quá nhiều lần. Vui lòng huỷ và đặt lịch mới." |
| `YEU_CAU_DOI_LICH_KHONG_TON_TAI` | 404 | yêu cầu không có hoặc ngoài phạm vi | "Không tìm thấy yêu cầu." (cùng thân) |
| `YEU_CAU_DA_XU_LY` | 409 | duyệt hoặc từ chối yêu cầu đã xử lý | "Yêu cầu này đã được xử lý." |
| Dùng lại của booking (không đổi mã) | 404, 409 | `KHUNG_GIO_KHONG_TON_TAI`, `KHUNG_GIO_DA_DAT`, `KHUNG_GIO_DANG_GIU`, `KHUNG_GIO_DA_QUA`, `BAC_SI_KHONG_KHA_DUNG`, `CHI_NHANH_NGHI`, `CHI_NHANH_CHUA_KHAI_BAO`, `CA_KHONG_TON_TAI`, `NGOAI_GIO_HOAT_DONG`, `BAC_SI_NGHI_PHEP`, `KHUNG_GIO_NGOAI_LICH_MOI`, `LICH_HEN_TRUNG_THOI_GIAN`, `VUOT_SO_LICH_HEN_TOI_DA`, `HO_SO_NGUOI_THAN_DA_NGUNG`, `HE_THONG_CHUA_CAU_HINH`, `HE_THONG_DANG_BAN` (503) | câu hiện có ở `booking-errors.ts` (web) |
| `DU_LIEU_KHONG_HOP_LE` | 400 | DTO: khoá lạ, thiếu `khungGioId`, ghi chú rỗng hoặc dài, lý do ngoài độ dài | câu theo trường |

### 5.14 Kiểm thử, việc phải **đo thật** trước khi viết mã, dữ liệu mẫu

- **Mức kiểm ĐẦY ĐỦ** cho P1, B1, B4, B5, B9 (khoá, giao dịch, đồng thời): đột biến (mỗi ca một lượt vitest một file nối tiếp, xin "RẢNH" của phiên kiểm trước khi chạy: đột biến là lane NẶNG), `test:int` và `test:e2e` trên MySQL thật, ca đồng thời chạy một mình, EXPLAIN cho câu SQL mới. **Mức GỌN** cho task web (đột biến web bốn loại) và các task backend chỉ đọc (B8): jscpd và gitleaks do CI đo, báo cáo ghi "CI đo".
- **Đột biến bắt buộc** (mỗi dòng một đột biến, phải bị bắt bởi ít nhất một ca): (1) bỏ loại lịch cũ khỏi đếm hoặc chồng giờ (KDL-10, KDL-11); (2) khoá hai khung giờ theo thứ tự "cũ rồi mới" thay vì id tăng dần (TDL-03); (3) so id khung giờ bằng chuỗi (TDL-03 với id 9 và 10); (4) không kiểm lại trạng thái dưới khoá (TDL-04); (5) không `+1` bộ đếm khi tự đổi (DLH-01, DLH-05); (6) `+1` khi đổi hộ hoặc duyệt (DLO-01, XDL-06); (7) quên `markReplaced` hoặc quên `release` khung giờ cũ (DLH-01, INV); (8) sao chép thiếu một bản chụp, hoặc tính lại giá (DLH-01, INV-8); (9) gọi `onSlotReleased` trong giao dịch hoặc hai lần (DLH-13, HDL-06); (10) bỏ `findBlocking` hoặc gọi với khung giờ NGUỒN (KDL-17, HDL-05); (11) từ chối vẫn giữ chỗ (XDL-08); (12) duyệt thất bại vẫn đổi yêu cầu sang `DaDuyet` (XDL-07); (13) ghi chú rỗng được chấp nhận (XDL-09); (14) tạo yêu cầu thứ hai khi đã có `ChoDuyet` (XDL-02, TDL-16); (15) bỏ phạm vi chi nhánh ở danh sách hoặc chi tiết (XDL-03, QDL-02); (16) tạo `giao_dich_thanh_toan` khi đổi (HDL-03, INV-10); (17) bỏ kiểm trần chuỗi (KDL-16); (18) thông báo gắn `lich_hen_id` của yêu cầu (NDL-03).
- **Việc phải đo thật ở task X1** (tiêu chí PASS/FAIL đặt TRƯỚC khi chạy, ghi ở TRACKING mục 6; nếp "Quy ước đo thật"; spec đo tạm rồi xoá; Docker và MySQL có thể tắt lúc đầu phiên, bật bằng `docker desktop start` rồi `docker compose up -d db`):

| Mã đo | Câu hỏi | Tiêu chí đạt (đặt trước) |
|---|---|---|
| M1 | Hoán vị khung giờ X↔Y: thứ tự id tăng dần có deadlock không; đối chứng thứ tự cũ-rồi-mới | tăng dần: 0 lần 1213/1205 trong 300 vòng; đối chứng: có ít nhất một 1213 (chứng minh quy tắc cần) |
| M2 | `INSERT yeu_cau` (FK `khung_gio`, `lich_hen`) xin khoá S ngầm nào, theo thứ tự nào (dùng `information_schema` và `performance_schema.data_locks`) | khẳng định hay bác bỏ giả thiết R2; chọn thứ tự an toàn |
| M3 | EXPLAIN danh sách yêu cầu theo phạm vi chi nhánh ở 100.000 yêu cầu và 100.000 lịch | `range` hoặc `ref`, không `filesort` trên tập lớn; nếu cần chỉ mục mới thì thêm vào P1 |
| M4 | `PaymentChain` ở độ sâu 19 | một câu, thời gian ghi nhận; không 500 |
| M5 | Khoá S ngầm `UPDATE lich_hen SET trang_thai` trên `benh_nhan` khi ta đã giữ X (B12 R) | không thêm chờ; ghi nhận |
| M6 | Đọc mã `admin/branch-change-requests/apply/` và đo cặp "đổi × áp dụng thay đổi chi nhánh" | có hay không chu trình; nếu có, ghi rủi ro chấp nhận như B12 |
| M7 | `ALTER … MODIFY ENUM` trên `nhat_ky_hanh_dong` (INPLACE hay COPY) với bảng lớn | thời gian và loại thuật toán ghi nhận (để biết có cần cửa sổ bảo trì) |

- **Dữ liệu mẫu (X3):** seed demo (Đại chạy; **không** `seed:*` lên DB `clinix` khi chưa được Đại đồng ý): một lịch `DaXacNhan` cọc 0đ, một lịch cọc > 0 đã thanh toán bằng ví, một lịch đã dùng hết lần tự đổi, một yêu cầu `ChoDuyet`; dòng `cau_hinh_he_thong` có `so_lan_tu_doi_lich_toi_da` và `check_in_sau_phut`. Test tự động **không** dùng seed (fixture riêng ở `appointments/testing/`).

## 6. Kế hoạch task

**Cách gọi mã task:** mã của scope này là `P1`, `P2`, `B1` đến `B9`, `F1` đến `F5`, `D1`, `X1` đến `X3`. Mã **trùng** với mã task của module `booking` ở PLAN [`docs/features/booking/PLAN.md`](../booking/PLAN.md) (B1 đến B19, F1 đến F12, P1 đến P8, X1 đến X4). Vì vậy khi nhắc ngoài file này luôn viết **"reschedule B4"** (task của scope này) hay **"booking B12"** (task của booking lõi); issue và PR dùng nhãn `[reschedule]` và hậu tố `(reschedule B4)`.

### 6.1 Sơ đồ phụ thuộc và năm lát cắt giao được (cùng một hàng = làm song song được; `→` = phải xong trước)

```
Nền đã có: booking lõi (ma trận, create, cancel, B15 thông báo, bốn cổng thật + waitlist Noop) · payment và wallet (PaymentChain, hoàn cọc) · admin (cấu hình, rbac, audit)
           search K1 và K2 (lưới khung giờ) · doctor (nghỉ phép, gỡ ca, trang Duyệt yêu cầu) · PendingBranchChangesPort thật (B16b)

S1 Nền (không thấy được gì trên giao diện):  P1 ─┬─ P2 (audit; [CHỜ Trung])
                                                   ├─ X1 (đo M1 đến M7) ─ B1 (nền ghi: markReplaced, ma trận, chèn nối chuỗi, khoá)
                                                   ├─ B2 (bộ luật và reader, tham số thayThe)
                                                   └─ B3 (thông báo, thư, bốn sự kiện)
S2 Bệnh nhân tự đổi và gửi yêu cầu:           B1,B2,B3,X1 ─ B4 (lõi giao dịch) ─ B5 (tạo yêu cầu, entity, chi tiết lịch) ─ B6 (route Bệnh nhân)
                                                   B6 ─ F1 (bộ chọn khung giờ dùng chung; [SOẠN TRƯỚC] bằng API giả) ─ F2 (xác nhận, kết quả, banner)
S3 Lễ tân đổi hộ:                              B4,B3,P2 ─ B7 ─ F3 (cần F1)
S4 Xử lý yêu cầu:                              B5 ─ B8 (danh sách, chi tiết) ;  B4,B5,P2,B3 ─ B9 (duyệt, từ chối)
                                                   B8,B9 ─ F4 (trang Lễ tân; [SOẠN TRƯỚC]; cần F1) ─ F5 (tab Admin)
S5 Hoàn tất:                                   B6,B7,B9 ─ X2 (đồng thời) ;  mọi task ─ D1 (tài liệu repo) ─ X3 (kiểm tay, tổng kết)
```

Lát cắt giao được: **S2** là MVP (Bệnh nhân tự đổi lịch và gửi yêu cầu); **S3** cộng Lễ tân đổi hộ; **S4** hoàn thiện xử lý yêu cầu (đủ ba use case); **S1** và **S5** là nền và hoàn tất.

### 6.2 Danh sách task (mỗi task = một PR; người làm Đại `MaxTrann`, Trung review; giờ là `[đề xuất]`, giờ thật khi làm)

| ID | Việc (file chính) | Phụ thuộc | Truy vết | Test case | Thẻ | Giờ | Mức |
|---|---|---|---|---|---|---|---|
| **P1** | Migration (kể cả TẠO bảng `yeu_cau_doi_lich_ngoai_chinh_sach`, chưa có migration; sửa 24/11/2026), entity, DDL ba file: `lich_hen.so_lan_tu_doi_lich` + CHECK, `thong_bao.yeu_cau_doi_lich_ngoai_chinh_sach_id` + FK + UNIQUE, ENUM `DoiLichHo`; entity `YeuCauDoiLichNgoaiChinhSach`; `enums.ts`; đăng ký `entities.ts`, `migrations/index.ts`; `clinix.dbml`, `clinix_mysql.sql`, `clinix_quy_tac_nghiep_vu.md` | — | Q1, Q5, Q6; L4 | MDL-01…MDL-10 | `[ĐỒNG BỘ TL]` `[ĐỤNG admin]` `[ĐỤNG database]` `[CHỜ Trung]` | 10 (đã nâng từ 5, Đại chấp nhận 24/11/2026) | ĐẦY ĐỦ |
| **P2** | Luật kiểm Audit cho `XuLyDoiLichNgoaiChinhSach` và `DoiLichHo`: `audit-validation.ts`, `audit-entry.ts` (kiểu `chi_tiet`, ánh xạ đối tượng), test cạnh mã; sửa `audit-enum-parity` nếu cần | P1 | 2.4.70; 2.4.31 HĐK; Q6, Q9 | NDL-04 (phần luật), NDL-08 | `[ĐỤNG audit]` `[CHỜ Trung]` | 3,5 | GỌN |
| **X1** | Đo thật M1 đến M7 (5.14); tiêu chí đặt trước; spec đo tạm rồi xoá; ghi TRACKING mục 6 | P1 | R1, R2, R4 | — (số đo) | `[TIỀN ĐỀ]` | 4,5 | ĐẦY ĐỦ |
| **B1** | Nền ghi đổi lịch: actor `DoiLich` và `markReplaced`; `insertLichHen` thêm `lichHenTruocId`, `soLanTuDoiLich`, kết quả `DuplicateChain`; `claim-slot.ts` dùng chung với `create` (R8); `reschedule-locks.ts`; INV-7 đến INV-10; cập nhật AR-01, AR-06, AR-07 và ca ma trận | P1, X1 | 2.4.9 HĐK; quy tắc DB 2, 3, 27 | HDL-01, HDL-02, HDL-08, HDL-10, INV-7…INV-10 | `[ĐỤNG booking]` | 5 | ĐẦY ĐỦ |
| **B2** | Bộ luật `reschedulability.rules.ts`, `reschedule.reader.ts`; thêm `thayThe` vào `BookabilityFacts`, `BookabilityReader`, `findActiveAppointments`, `findOverlappingAppointments`; mã lỗi mới ở `appointments.constants.ts` | P1 | 2.4.9 b2, A1, A3; 2.4.30 A2; TECH_DEBT 260 (phần kiểm) | KDL-01…KDL-19 | | 5,5 | ĐẦY ĐỦ (reader dưới khoá) |
| **B3** | Bốn sự kiện thông báo, mẫu thư, hàng chờ email 17 loại (thêm bốn loại vào 13 loại hiện có), trường `doiLich` và `yeuCau` của `AppointmentEvent`, ghi `thong_bao.yeu_cau_…_id` | P1 | 2.4.68, 2.4.75; Q5, Q9, Q10 | NDL-01…NDL-03, NDL-06, NDL-07, BDL-04 | `[ĐỤNG booking]` | 5 | ĐẦY ĐỦ |
| **B4** | `AppointmentRescheduleService` (tự đổi, đổi hộ, duyệt dùng một thân giao dịch), gọi `findBlocking` cho khung giờ đích (**đóng TECH_DEBT 260**), `onSlotReleased` sau commit, `PaymentChain` làm trần chuỗi | B1, B2, B3, X1 | 2.4.9 b5 đến b9; 2.4.30 b5 đến b8; 2.4.31 b5, b6; 2.4.61 | DLH-01…DLH-03, DLH-06…DLH-08, DLH-12…DLH-14, DLH-16, DLH-18, DLH-19, DLH-21, HDL-03…HDL-07, HDL-09 | | 6,5 | ĐẦY ĐỦ |
| **B5** | Tạo yêu cầu ngoài chính sách (nhánh vượt hạn mức), repository, khoá "một `ChoDuyet` mỗi lịch", `yeuCauDoiLich` và `choPhepDoiLich` ở chi tiết lịch Bệnh nhân và `choPhepDoiLich`, `coYeuCauChoDuyet` ở chi tiết Lễ tân | B1, B2, B3 | 2.4.9 A2, HĐK vượt hạn; Q4, Q7 (f) | DLH-04, DLH-05, DLH-15, XDL-01, XDL-02, TDL-16 (smoke) | `[ĐỤNG booking]` | 5 | ĐẦY ĐỦ |
| **B6** | Route Bệnh nhân: `GET reschedule-preview`, `POST reschedule`, DTO, `@Roles('BenhNhan')`, mã lỗi | B4, B5 | 2.4.9 (mọi bước) | DLH-09…DLH-11, DLH-17, DLH-22, DLH-23, QDL-01, QDL-04, QDL-05, QDL-06 | | 5,5 | ĐẦY ĐỦ |
| **B7** | Route Lễ tân đổi hộ: preview, `POST` với `lyDo`, `ReceptionScopeService`, Audit `DoiLichHo`, thông báo | B4, B3, P2 | 2.4.30; Q6, Q9 | DLO-01…DLO-10, QDL-02, QDL-03 | | 4,5 | ĐẦY ĐỦ |
| **B8** | Danh sách và chi tiết yêu cầu cho Lễ tân và Quản trị viên: phạm vi, lọc, phân trang, danh sách trắng, `coTheDuyet` | B5 | 2.4.31 b1 đến b3; Q11 | XDL-03…XDL-05, XDL-13 (phần đọc), XDL-15, QDL-02 | `[ĐỤNG admin]` (dùng `BranchAccessPolicy`) | 5 | GỌN + EXPLAIN M3 |
| **B9** | Duyệt (gọi lõi, `khungGioId` thay thế) và từ chối: ghi chú, Audit, thông báo, 409 giữ `ChoDuyet` | B4, B5, B3, P2 | 2.4.31 b4 đến b7, A1, A2; Q7 (g), Q10 | XDL-06…XDL-12, XDL-14, NDL-04, NDL-05 | | 6 | ĐẦY ĐỦ |
| **F1** | Web Bệnh nhân (1/2): kiểu, API client, hook, bộ chọn khung giờ dùng chung (`onSelect` ở `SlotCell` và `DoctorSlotGrid`), route `…/doi-lich`, nút ở chi tiết | B6 (`[SOẠN TRƯỚC]` bằng API giả theo 5.8) | 2.4.9 b1, b3, b4 | WDH-01…WDH-03, WDH-07, WDH-08, WDH-10 | `[ĐỤNG search]` `[CHỜ Trung]` `[ĐỤNG router]` `[ĐỤNG shared]` | 5 | GỌN |
| **F2** | Web Bệnh nhân (2/2): màn xác nhận cũ → mới, ô lý do, kết quả, banner `yeuCauDoiLich` | F1 | 2.4.9 b6, b7, A1, A2, HĐK | WDH-04…WDH-06, WDH-09 | | 5 | GỌN |
| **F3** | Web Lễ tân đổi hộ: nút, hộp chọn (bộ chọn dùng chung), ô lý do bắt buộc | B7, F1 | 2.4.30 b1 đến b8 | WDO-01…WDO-06 | | 4,5 | GỌN |
| **F4** | Web Lễ tân: mục menu "Yêu cầu đổi lịch" có `to`, trang hai tab, chi tiết, hộp duyệt và từ chối, chọn khung giờ thay thế | B8, B9 (`[SOẠN TRƯỚC]`), F1 | 2.4.31 b1 đến b7, A1, A2; Q10, Q11 | WXD-01…WXD-10 | `[ĐỤNG router]` | 6,5 | GỌN |
| **F5** | Web Quản trị viên: tab "Yêu cầu đổi lịch" trong "Duyệt yêu cầu" (một dòng ở `doctor` + sửa ca WA-13), route con, tái dùng thành phần F4 | F4 | 2.4.31 (Quản trị viên) | WXD-11…WXD-14 | `[ĐỤNG doctor]` `[CHỜ Trung]` | 3,5 | GỌN |
| **D1** | Tài liệu của repo: booking PLAN (mục "Không làm", hàng `DaDoiLich` ở 5.2, hàng `markReplaced` ở 5.10, bảng cổng), booking TRACKING, một dòng `docs/TRACKING.md`; đóng nháp TECH_DEBT 260 (Đại ghi); tick PLAN này | mọi B và F | `[ĐỒNG BỘ TL]` | — | `[ĐỒNG BỘ TL]` | 2 | — |
| **X2** | Đồng thời và bất biến trên MySQL thật: bộ TDL-01…TDL-18, mỗi ca đồng thời chạy một mình, INV và IVT sau mỗi ca, đếm 1213/1205/503 | B6, B7, B9 | R1, R2 | TDL-01…TDL-18 | | 5,5 | ĐẦY ĐỦ |
| **X3** | Kiểm tay trình duyệt ba vai trò (KTD-01…KTD-12), đột biến lô (18 đột biến, 5.14), jscpd và gitleaks (CI đo), tổng kết TRACKING, seed demo | mọi task | mục 10 | KTD-01…KTD-12 | `[CHỜ Đại]` (seed, DB `clinix`) | 5 | ĐẦY ĐỦ |

**Tổng 103 giờ** (không tính D2 của Đại ngoài repo).

### 6.3 File của module khác và file dùng chung bị chạm, cách tránh xung đột

| File | Của | Task | Cách |
|---|---|---|---|
| `docs/database/clinix.dbml`, `clinix_mysql.sql`, `clinix_quy_tac_nghiep_vu.md` | chung | P1 | `git pull` trước, báo Trung, một PR nhỏ; ba file khớp nhau |
| `apps/api/src/admin/entities/{lich-hen,thong-bao}.entity.ts`, `enums.ts`, entity mới | Trung (admin) | P1 | `[CHỜ Trung]`; tiền lệ B19 |
| `apps/api/src/database/entities.ts`, `migrations/index.ts`, migration mới | chung | P1 | báo Trung; mốc thời gian migration lớn hơn mọi migration trên `main` lúc merge (kiểm lại) |
| `apps/api/src/audit/audit-validation.ts`, `audit-entry.ts` + test | Trung (audit) | P2 | `[CHỜ Trung]` |
| `apps/web/src/features/search/slots/{slot-cell,doctor-slot-grid}.tsx` | Trung (search) | F1 | thêm prop tuỳ chọn, mặc định giữ liên kết; ca K2 không đổi |
| `apps/web/src/features/doctor/admin/approvals/approvals-host-page.tsx`, `approvals-routes.tsx`, test WA-13 | Trung (doctor) | F5 | một dòng theo nếp D8; sửa ca WA-13 |
| `apps/web/src/router/role-nav.ts`, `role-routes.tsx` | chung | F1, F4 | `[ĐỤNG router]`, nếp patient Q21 |
| `apps/web/src/shared/routes/booking-paths.ts` | chung | F1, F4 | chỉ thêm hằng |
| `docs/TECH_DEBT.md`, `AI_USAGE_LOG.md` | Đại | D1 | **phiên lập kế hoạch này không sửa**; nháp ở TRACKING mục 4 |
| `docs/features/booking/PLAN.md`, `TRACKING.md`, `docs/features/doctor/*`, `docs/features/admin/*`, `docs/PLAN.md` | các module | D1 | **không sửa ở PR tài liệu của kế hoạch**; sửa ở D1 |
| `.env.example`, `docker-compose*.yml`, `.github/workflows/*`, `package.json` | chung | — | scope này **không** thêm cấu hình, biến môi trường, phụ thuộc |

### 6.4 Ước giờ và chia Iteration (`[đề xuất]`; Iteration một tuần; hạn mức giờ mỗi tuần của Đại `[cần điền]`, Q14; giả định 45 giờ cho bảng dưới)

| Lát cắt | Task (giờ) | Giờ |
|---|---|---|
| **S1 Nền** | P1 10 · P2 3,5 · X1 4,5 · B1 5 · B2 5,5 · B3 5 | **33,5** |
| **S2 Bệnh nhân tự đổi** | B4 6,5 · B5 5 · B6 5,5 · F1 5 · F2 5 | **27** |
| **S3 Lễ tân đổi hộ** | B7 4,5 · F3 4,5 | **9** |
| **S4 Xử lý yêu cầu** | B8 5 · B9 6 · F4 6,5 · F5 3,5 | **21** |
| **S5 Hoàn tất** | D1 2 · X2 5,5 · X3 5 | **12,5** |
| **Tổng** | | **103** |

| Iteration | Task | Giờ | Ghi chú |
|---|---|---|---|
| **8** (01/12 đến 07/12) | S1 trọn, B4, B5 | **45** | P1 và P2 cần Trung duyệt sớm; X1 chạy khi máy rảnh (lane nặng) |
| **9** (08/12 đến 14/12) | B6, F1, F2, B7, F3, B8, B9, F4 | **42** | F1, F4 `[SOẠN TRƯỚC]` được từ Iteration 8 nếu hợp đồng 5.8 đã duyệt |
| **10** (15/12 đến 21/12) `[đề xuất]`, chưa có trong Project | F5, D1, X2, X3 | **16** | Iteration 9 và 10 chưa có trong Project: việc của Đại |

**Giờ ước cho việc LẬP KẾ HOẠCH này:** `[đề xuất]` **4,5 giờ** (đọc nguồn 1,5; đối chiếu và hỏi 1; viết PLAN, TRACKING, nháp 2) cộng khoảng 1 giờ review của mỗi người. **Phương án cắt nếu thiếu giờ** (Đại quyết): (1) bỏ tab "Đã xử lý" (Q11): −1 giờ; (2) dồn F5 vào F4 trong một PR, chưa bật tab Admin (Quản trị viên xử lý qua API): −3,5 giờ nhưng thiếu một nửa tác nhân của 2.4.31; (3) bỏ đột biến lô ở X3 cho task web: −1,5 giờ (không khuyến nghị).

### 6.5 Việc nào bắt đầu ngay, việc nào phải chờ

- **Ngay (độc lập):** P1 (không phụ thuộc, nhưng chờ Trung duyệt các file chung); D2 (Đại sửa Word, ngoài repo).
- **Sau P1:** P2, X1, B2, B3 song song (P2 cần Trung duyệt).
- **Chờ X1:** B1 (thứ tự khoá), rồi B4.
- **`[SOẠN TRƯỚC]`:** F1 và F4 viết được bằng API giả theo 5.8 khi hợp đồng được duyệt, chưa merge trước B6, B8, B9.
- **Không chờ `waitlist`:** `WaitlistPort` là `Noop`; đổi lịch chạy đủ; ca DLH-13 và DLH-14 chạy với bản `Fake` và bản `Noop` (thẻ `[CHỜ waitlist]` chỉ cho việc chạy lại sau này).
- **Không chờ payment, wallet:** đã có bản thật; HDL-03, HDL-04 chạy với lớp thật.

### 6.6 Thông tin để sinh issue (**KHÔNG tạo issue lúc này**: Đại tự chạy script sau khi PR tài liệu merge và các `[CHỜ …]` có xác nhận)

Mỗi task một issue; nhãn `module:booking` cộng `backend`, `frontend` hay `docs` (task web: `frontend`); milestone `reschedule` `[đề xuất]` (Đại tạo); giao `MaxTrann` (P1, P2, F1, F5 gắn thêm người review `junUTE`); Epic `[reschedule] Đổi lịch hẹn (scope #9)` gom mọi task; Iteration theo 6.4. Tiêu đề issue dạng `[reschedule] <mã> · <tên> (<backend|frontend>)`, tiêu đề PR ≤ 100 ký tự và `Closes #<issue>` ở thân PR (Epic dùng `Refs`). Khuôn thân issue theo issue booking #249 (đọc bằng `gh issue view 249`): `## Mô tả`, `## Truy vết`, `## Phụ thuộc`, `## Lưu ý` (thẻ `[CHỜ …]` trong PLAN), `## Test case liên quan` (kèm "Danh sách đầy đủ ở `docs/features/reschedule/PLAN.md` mục 7"), `## Đóng khi` (bốn ô: PR được người còn lại review và squash merge và tiêu đề PR theo Conventional Commits; test case đã chạy và ghi vào `docs/features/reschedule/TRACKING.md`; tài liệu đồng bộ đã cập nhật trong cùng PR; đã ghi `AI_USAGE_LOG.md`, không `Co-Authored-By` của AI), nguồn `docs/features/reschedule/PLAN.md` task `<mã>`.

Nhãn `blocked` (gỡ khi điều kiện có): **P1, P2, F1, F5**: `[CHỜ Trung]`; **X3**: `[CHỜ Đại]` (seed, DB `clinix`); mọi câu Q1 đến Q7, Q9 đến Q12 đã được Đại trả lời trực tiếp 24/11/2026; **Q8, Q13 đến Q16 còn mở** (không chặn viết mã: Q8 chỉ cần khi chạy demo; Q13 duyệt ở PR).

| ID | Tiêu đề issue | Tiêu đề PR (`feat(<scope>): …`) | Iter. | "Đóng khi" (ngoài bốn ô chuẩn) |
|---|---|---|---|---|
| P1 | `[reschedule] P1 · Migration bộ đếm tự đổi lịch, cột thông báo yêu cầu, hành động DoiLichHo (backend)` | `feat(db): thêm bộ đếm tự đổi lịch, cột thông báo yêu cầu và hành động DoiLichHo (reschedule P1)` | 8 | Migration lên và xuống được; ba file `docs/database/*` khớp; `schema-parity` và `audit-enum-parity` xanh; MDL-01…MDL-10 Pass; entity khớp |
| P2 | `[reschedule] P2 · Luật kiểm Audit cho đổi lịch hộ và xử lý yêu cầu đổi lịch (backend)` | `feat(audit): thêm luật kiểm nhật ký đổi lịch hộ và xử lý yêu cầu đổi lịch (reschedule P2)` | 8 | NDL-04 (luật) và NDL-08 Pass; ca âm (thiếu khoá, khoá lạ, ghi chú quá dài, kết quả lạ) bị từ chối |
| X1 | `[reschedule] X1 · Đo thật khoá hai khung giờ, khoá ngầm khoá ngoại, chỉ mục (backend)` | `test(booking): đo thật khoá hai khung giờ, khoá ngầm khoá ngoại và chỉ mục yêu cầu (reschedule X1)` | 8 | M1 đến M7 có số đo ở TRACKING mục 6; tiêu chí đặt trước; spec đo tạm đã xoá |
| B1 | `[reschedule] B1 · Nền ghi đổi lịch: markReplaced, chèn lịch nối chuỗi, khoá (backend)` | `feat(booking): thêm markReplaced, chèn lịch nối chuỗi và khoá hai khung giờ (reschedule B1)` | 8 | HDL-01, HDL-02, HDL-08, HDL-10, INV-7…INV-10 Pass; AR-01, AR-06, AR-07 cập nhật; `create` không đổi hành vi (DL-* cũ Pass) |
| B2 | `[reschedule] B2 · Bộ luật đổi được không và bộ đọc dưới khoá (backend)` | `feat(booking): thêm bộ luật đổi lịch và tham số thayThe cho bộ luật đặt lịch (reschedule B2)` | 8 | KDL-01…KDL-19 Pass; `checks` và `create` không đổi hành vi |
| B3 | `[reschedule] B3 · Thông báo và thư cho đổi lịch và yêu cầu đổi lịch (backend)` | `feat(booking): thêm bốn sự kiện thông báo và thư cho đổi lịch (reschedule B3)` | 8 | NDL-01…NDL-03, NDL-06, NDL-07, BDL-04 Pass; chữ HDK-06 sửa cho khớp 17 loại |
| B4 | `[reschedule] B4 · Lõi giao dịch đổi lịch: tự đổi, đổi hộ, duyệt (backend)` | `feat(booking): thêm lõi giao dịch đổi lịch, chặn khung giờ đích thuộc vùng bị loại (reschedule B4)` | 8 | Ca ở 6.2 Pass; INV-1…INV-10 xanh; đột biến 1 đến 10, 16, 17 bị bắt; TECH_DEBT 260 có nháp đóng |
| B5 | `[reschedule] B5 · Tạo yêu cầu đổi lịch ngoài chính sách và chi tiết lịch (backend)` | `feat(booking): thêm tạo yêu cầu đổi lịch ngoài chính sách và banner trạng thái (reschedule B5)` | 8 | DLH-04, DLH-05, DLH-15, XDL-01, XDL-02 Pass; chi tiết lịch 19 khoá; đột biến 14 bị bắt |
| B6 | `[reschedule] B6 · Route đổi lịch của Bệnh nhân: xem trước và xác nhận (backend)` | `feat(booking): thêm route xem trước và đổi lịch của Bệnh nhân (reschedule B6)` | 9 | DLH-09…DLH-11, DLH-17, DLH-22, DLH-23, QDL-01, QDL-04…QDL-06 Pass |
| B7 | `[reschedule] B7 · Route Lễ tân đổi lịch hộ, Audit DoiLichHo (backend)` | `feat(booking): thêm route Lễ tân đổi lịch hộ bệnh nhân kèm nhật ký (reschedule B7)` | 9 | DLO-01…DLO-10, QDL-02, QDL-03 Pass |
| B8 | `[reschedule] B8 · Danh sách và chi tiết yêu cầu đổi lịch cho Lễ tân và Quản trị viên (backend)` | `feat(booking): thêm danh sách và chi tiết yêu cầu đổi lịch theo phạm vi (reschedule B8)` | 9 | XDL-03…XDL-05, XDL-13 (đọc), XDL-15, QDL-02 Pass; EXPLAIN M3 đạt |
| B9 | `[reschedule] B9 · Duyệt và từ chối yêu cầu đổi lịch ngoài chính sách (backend)` | `feat(booking): thêm duyệt và từ chối yêu cầu đổi lịch ngoài chính sách (reschedule B9)` | 9 | XDL-06…XDL-12, XDL-14, NDL-04, NDL-05 Pass; đột biến 11 đến 13, 15 bị bắt |
| F1 | `[reschedule] F1 · Bệnh nhân chọn khung giờ mới để đổi lịch (frontend)` | `feat(booking): thêm bộ chọn khung giờ và nút đổi lịch cho Bệnh nhân (reschedule F1)` | 9 | WDH-01…WDH-03, WDH-07, WDH-08, WDH-10 Pass; ca K2 của search không đổi |
| F2 | `[reschedule] F2 · Bệnh nhân xác nhận đổi lịch, gửi yêu cầu, xem trạng thái (frontend)` | `feat(booking): thêm màn xác nhận đổi lịch, gửi yêu cầu và banner trạng thái yêu cầu (reschedule F2)` | 9 | WDH-04…WDH-06, WDH-09 Pass |
| F3 | `[reschedule] F3 · Lễ tân đổi lịch hộ bệnh nhân (frontend)` | `feat(booking): thêm đổi lịch hộ bệnh nhân ở chi tiết lịch của Lễ tân (reschedule F3)` | 9 | WDO-01…WDO-06 Pass |
| F4 | `[reschedule] F4 · Lễ tân xử lý yêu cầu đổi lịch ngoài chính sách (frontend)` | `feat(booking): thêm trang xử lý yêu cầu đổi lịch ngoài chính sách cho Lễ tân (reschedule F4)` | 9 | WXD-01…WXD-10 Pass; mục menu có `to` |
| F5 | `[reschedule] F5 · Quản trị viên xử lý yêu cầu đổi lịch ở trang Duyệt yêu cầu (frontend)` | `feat(booking): bật tab yêu cầu đổi lịch ở trang Duyệt yêu cầu của Quản trị viên (reschedule F5)` | 10 | WXD-11…WXD-14 Pass; ca WA-13 của doctor đã sửa |
| D1 | `[reschedule] D1 · Đồng bộ tài liệu repo sau khi có mã đổi lịch (docs)` | `docs(booking): đồng bộ PLAN, TRACKING và nợ kỹ thuật sau khi có mã đổi lịch (reschedule D1)` | 10 | Mọi ô PLAN này đã tick; booking PLAN, TRACKING và `docs/TRACKING.md` khớp |
| X2 | `[reschedule] X2 · Đồng thời và bất biến của đổi lịch trên MySQL thật (backend)` | `test(booking): thêm bộ ca đồng thời và bất biến cho đổi lịch (reschedule X2)` | 10 | TDL-01…TDL-18 Pass một mình; 0 lần 503; INV và IVT xanh |
| X3 | `[reschedule] X3 · Kiểm tay ba vai trò, đột biến lô, tổng kết scope đổi lịch (docs)` | `docs(booking): tổng kết kiểm tay và đột biến của scope đổi lịch (reschedule X3)` | 10 | KTD-01…KTD-12 Pass; 18 đột biến bị bắt; CI xanh; mục 10 đạt |

**Nhãn Epic:** `[reschedule] Đổi lịch hẹn (scope #9)` (Epic gom 20 issue; không đóng khi chưa đạt mục 10).

## 7. Test case dự kiến

Loại: **U** đơn vị (không DB), **I** tích hợp trên MySQL thật (`*.int-spec.ts`), **E** e2e qua `AppModule` (`test:e2e`), **C** đồng thời (một mình), **W** giao diện (Vitest và happy-dom), **B** trình duyệt (kiểm tay). Mỗi test ghi mã ở tên ca (`it('DLH-01: …')`). Mọi ca đều có ca âm và ca biên; endpoint mới có ca đúng và sai vai trò, đúng và sai chi nhánh. Ca đồng thời chạy MỘT mình, sau mỗi ca chạy INV-1…INV-10 và IVT-01…IVT-07. Dữ liệu dựng bằng fixture (`appointments/testing/`), mỗi ca tự truyền cấu hình (không số cứng của mã). **Trạng thái: chưa chạy ca nào** (kế hoạch giai đoạn 1; mục "Kết quả test" ở TRACKING mục 2).

### 7.1 Bộ luật "đổi được không" và bộ đọc (KDL) — B2

| Mã | Loại | Điều kiện | Kết quả mong đợi | Truy vết |
|---|---|---|---|---|
| KDL-01 | U, I | lịch `DaXacNhan`, khung giờ mới cùng bác sĩ, trống, mọi điều kiện đủ | `ok` | 2.4.9 b2 |
| KDL-02 | U, I | trạng thái nguồn lần lượt `ChoThanhToan`, `DaTiepDon`, `HoanThanh`, `DaHuy`, `DaDoiLich`, `VangMat` | `LICH_HEN_KHONG_CHO_DOI` kèm `chiTiet.trangThai`; Bệnh nhân với `DaDoiLich` ⇒ `NotFound` cùng thân với "không có" | A3; Q7 (a); Q31 |
| KDL-03 | U | hạn giờ `TuDoi`: `thoi_gian = now`; `now + 1s`; `now − 1s` | `= now` ⇒ `LICH_HEN_DA_QUA_GIO` (nửa mở); `now + 1s` ⇒ ok; `now − 1s` ⇒ từ chối | Q3; H8 |
| KDL-04 | U | hạn giờ `DoiHo` và `DuyetYeuCau`: `thoi_gian + check_in_sau_phut = now`; `check_in_sau_phut = 0`; vượt 1 giây | biên nửa mở như KDL-03 cộng cửa sổ; `check_in_sau_phut = 0` ⇒ giống `TuDoi` | Q3 |
| KDL-05 | U, I | khung giờ mới = khung giờ cũ | `KHUNG_GIO_TRUNG_LICH_CU` trước mọi khoá | 2.4.9 b3 |
| KDL-06 | U, I | khung giờ của bác sĩ khác (cùng chi nhánh, cùng chuyên khoa) | `KHUNG_GIO_KHAC_BAC_SI` | 2.4.9 MT |
| KDL-07 | I | bác sĩ đã đổi dịch vụ chính so với lúc đặt (dữ liệu dựng bằng SQL: admin B13 chặn đổi khi còn lịch hoạt động) | `LICH_HEN_KHAC_DICH_VU_HIEN_TAI` | Q7 (c) |
| KDL-08 | I | bác sĩ đã đổi chi nhánh (dữ liệu dựng bằng SQL, như KDL-07) | `LICH_HEN_KHAC_CHI_NHANH_HIEN_TAI` | Q7 (c) |
| KDL-09 | U, I | cờ `khoa_dat_lich_do_no_show` bật | vẫn `ok` (không `DAT_LICH_BI_KHOA_NO_SHOW`) | Q7 (b) |
| KDL-10 | U, I | hồ sơ có đúng `toiDa` lịch đang hoạt động, một trong đó là lịch đang đổi; rồi `toiDa − 1` | biên: đếm không tính lịch cũ ⇒ `ok`; hồ sơ có `toiDa` lịch **khác** ⇒ `VUOT_SO_LICH_HEN_TOI_DA` | Q7 (e); L13 |
| KDL-11 | U, I | chồng giờ: khung giờ mới chồng chính lịch cũ (dịch 15 phút trong dịch vụ 30 phút); chồng lịch khác của cùng hồ sơ; chồng lịch của hồ sơ khác cùng tài khoản | cho; `LICH_HEN_TRUNG_THOI_GIAN`; cho (tính theo hồ sơ, so `<=>`) | Q7 (e) |
| KDL-12 | U | mỗi trong các mã còn lại của `evaluateBookability`: `KHUNG_GIO_DA_DAT`, `KHUNG_GIO_DANG_GIU`, `KHUNG_GIO_DA_QUA` (và `HetHan`), `BAC_SI_KHONG_KHA_DUNG`, `CHI_NHANH_NGHI`, `CHI_NHANH_CHUA_KHAI_BAO`, `CA_KHONG_TON_TAI`, `NGOAI_GIO_HOAT_DONG`, `BAC_SI_NGHI_PHEP`, `KHUNG_GIO_NGOAI_LICH_MOI` | đúng mã, đúng thứ tự (dừng ở lỗi đầu tiên) | 2.4.9 A1; 2.4.61 A1, A2 |
| KDL-13 | I | khung giờ mới `DangGiuCho` đã quá hạn (lịch giữ `ChoThanhToan` của người khác quá hạn) | coi là trống, hết hạn lười đúng một lần trong cùng giao dịch, lịch người kia `DaHuy` | booking 5.5 |
| KDL-14 | I | lịch của hồ sơ người thân đã ngừng (`trang_thai_hieu_luc = false`) | `HO_SO_NGUOI_THAN_DA_NGUNG` | Q7 (e) |
| KDL-15 | I | chưa có dòng cấu hình; có dòng nhưng `so_lan_tu_doi_lich_toi_da = 0` | `HE_THONG_CHUA_CAU_HINH` (409, không dùng số ngầm); `toiDa = 0` ⇒ mọi lần `TuDoi` là nhánh yêu cầu | quy tắc 35 |
| KDL-16 | I | chuỗi có `MAX_CHAIN_DEPTH − 1` lịch rồi đổi tiếp (Lễ tân); `− 2` thì đổi được | `CHUOI_DOI_LICH_QUA_DAI`, không 500, không ghi gì | R4 |
| KDL-17 | I | `PendingBranchChangesPort`: khung giờ **đích** trong vùng bị loại (một yêu cầu đã duyệt chưa áp dụng); khung giờ **nguồn** trong vùng bị loại, đích ngoài vùng | đích bị loại ⇒ `KHUNG_GIO_NGOAI_LICH_MOI`; nguồn bị loại, đích ngoài ⇒ đổi được; spy: `findBlocking` gọi đúng một lần với `ca` của khung giờ đích | TECH_DEBT 260; admin Q6, Q48; PBC-10 |
| KDL-18 | I | cùng dữ liệu qua chế độ `none` (preview) và `locked` (POST) | cùng kết luận (tham số hoá mọi mã ở KDL-02…KDL-17) | nếp `checks` |
| KDL-19 | I | `DoiHo` khi đang có yêu cầu `ChoDuyet` của chính lịch | được phép; yêu cầu thành tồn (không bị xoá) | 5.6 |

### 7.2 Bệnh nhân tự đổi và gửi yêu cầu (DLH) — B4, B5, B6

| Mã | Loại | Điều kiện | Kết quả mong đợi | Truy vết |
|---|---|---|---|---|
| DLH-01 | I, E | lịch `DaXacNhan` cọc 0đ, đổi sang khung giờ trống của cùng bác sĩ ngày khác | 201 `DaDoi`; lịch mới: mã mới, `DaXacNhan`, `lich_hen_truoc_id` = cũ, `han_thanh_toan` NULL, `thoi_diem_tao` và `thoi_diem_xac_nhan` = `now`, `so_lan_tu_doi_lich` = 1, **ba bản chụp, bác sĩ, chi nhánh, dịch vụ, hồ sơ, `ly_do_kham` bằng lịch cũ so từng cột**; lịch cũ `DaDoiLich` và mọi cột khác (kể cả ba mốc B19) nguyên; khung giờ cũ `ConTrong`, mới `DaDat`; INV-1…INV-10 | 2.4.9 b9, HĐK |
| DLH-02 | I | như DLH-01 với lịch cọc > 0 đã thanh toán bằng ví (lớp thật) | không hàng mới ở `giao_dich_thanh_toan`, `giao_dich_vi`, `lich_su_hoan_tien`; `amountPaid(lịch mới)` = cọc của lịch gốc; `remainingToCollect` đúng | HĐK; payment E13 |
| DLH-03 | I | đổi lần hai và ba (chuỗi 3 và 4 lịch) | `so_lan_tu_doi_lich` = 2, 3 (nếu `toiDa` đủ lớn); payment truy đúng lịch gốc | b2, b9 |
| DLH-04 | I, E | đã đạt `toiDa` (2): POST không `lyDoYeuCau`; rồi có `lyDoYeuCau` | 409 `VUOT_SO_LAN_TU_DOI` kèm `chiTiet`, không ghi gì; có lý do ⇒ 201 `DaGuiYeuCau`, yêu cầu `ChoDuyet`, lịch cũ và hai khung giờ **không đổi**, thông báo `YeuCauDoiLichDangCho` | A2 |
| DLH-05 | I | biên số lần: `toiDa = 2`: đổi ở số đếm 0, 1 tự đổi được; ở 2 ⇒ yêu cầu; `toiDa = 0` ⇒ yêu cầu ngay | đúng nhánh; số đếm lịch mới đúng | A2; Q1 |
| DLH-06 | I, C | khung giờ mới bị người khác đặt giữa preview và POST | 409 `KHUNG_GIO_DA_DAT`; lịch cũ giữ `DaXacNhan`, khung giờ cũ `DaDat`, không lịch mới | A1 |
| DLH-07 | I | chi nhánh nghỉ hôm đó / ngoài giờ / ca không nhận khám / vùng bị loại / bác sĩ nghỉ phép | đúng mã tương ứng (5.13), không ghi gì | A1 |
| DLH-08 | I | lịch ở sáu trạng thái còn lại | 409 `LICH_HEN_KHONG_CHO_DOI`; `ChoThanhToan` kèm gợi ý thanh toán hoặc huỷ | A3 |
| DLH-09 | I, E | lịch của người khác; không tồn tại; mã sai dạng; `DaDoiLich`; lịch của hồ sơ người thân do chính mình quản lý; lịch hồ sơ người thân của tài khoản khác | 404 cùng thân cho bốn ca đầu và ca cuối; hồ sơ người thân của mình ⇒ đổi được | TĐK; Q31; H10 |
| DLH-10 | E | Lễ tân, Bác sĩ, Quản trị viên, khách gọi route Bệnh nhân | 403 / 401 trước mọi kiểm tra khác (AR-02) | QB-07 |
| DLH-11 | U, E | DTO: thiếu `khungGioId`, sai dạng, id lớn hơn 2^53 (giữ nguyên chuỗi), khoá lạ, `lyDoYeuCau` quá ngắn (< 5) hoặc quá dài (> 500) chỉ khi dùng đến, `lyDoYeuCau` khi chưa vượt hạn | 400 `DU_LIEU_KHONG_HOP_LE`; lý do thừa bị bỏ qua khi còn lần tự đổi | DTO |
| DLH-12 | I | lỗi giả lập SAU khi chèn lịch mới: ở `hold`, `release`, `markReplaced`, `notify` | hoàn tác trọn: không lịch mồ côi, khung giờ cũ `DaDat`, mới `ConTrong`, lịch cũ `DaXacNhan`; INV | DL-27 nếp; 2.4.9 "Thất bại" |
| DLH-13 | I | bản `Fake` của `WaitlistPort` | gọi `onSlotReleased(khung giờ cũ)` đúng MỘT lần, SAU commit, khi giờ cũ > `now`; không gọi khi đổi thất bại hay giờ cũ ≤ `now`; cổng ném ⇒ chỉ log, kết quả vẫn `DaDoi` | 2.4.62; HĐK |
| DLH-14 | I | bản `Noop` (thật hiện nay) | đổi lịch chạy đủ; cảnh báo log đúng một lần; không phụ thuộc waitlist | 5.9 |
| DLH-15 | I, E | chi tiết lịch sau các ca | lịch cũ `DaDoiLich` ⇒ 404 cho Bệnh nhân; lịch mới ở "Sắp tới"; chi tiết có `choPhepDoiLich` và `yeuCauDoiLich` (19 khoá) | Q31; 5.8 |
| DLH-16 | I | huỷ lịch **mới** sau đổi (cọc > 0) | hoàn theo `chinh_sach_hoan_snapshot` và giờ hẹn MỚI, trên khoản thanh toán của lịch gốc; không hoàn hai lần; thông báo hoàn trỏ lịch cuối chuỗi | payment HCC-10; R3 |
| DLH-17 | E | thân phản hồi | chỉ danh sách trắng khoá; không `lich_hen_id`; `Cache-Control: no-store`; log không có lý do, ghi chú, tên | H10 |
| DLH-18 | I | thông báo của đổi lịch | một `thong_bao` `LichHenDaDoiLich` (`lich_hen_id` = lịch mới) và một `email_thong_bao` `ChoGui` cho tài khoản đặt; nội dung có mã mới, giờ cũ → mới, ≤ 500, không `ly_do_kham` | 2.4.68 |
| DLH-19 | I, C | bấm đúp: hai `POST` cùng lúc cùng khung giờ; lần hai sau khi lần một xong | đúng MỘT lịch mới; lần hai sau ⇒ 404 (lịch cũ là `DaDoiLich`) | H1 |
| DLH-20 | E | cùng bác sĩ, khung giờ ở quá khứ (`<= now`) | `KHUNG_GIO_DA_QUA` | Q5 booking |
| DLH-21 | I | đổi qua ngày và qua tuần; hết ca (khung giờ cuối ngày) | được | 2.4.9 b3 |
| DLH-22 | E | cờ no-show bật | đổi được (không bị khoá) | Q7 (b) |
| DLH-23 | I, E | `GET reschedule-preview` | đọc không khoá (đếm `FOR UPDATE` = 0), không ghi; có `loai` (`TuDoi` hoặc `GuiYeuCau`), `soLanDaDoi`, `soLanToiDa`; không `khungGioId` thì chỉ trả điều kiện | Q2 |

### 7.3 Lễ tân đổi hộ (DLO) — B7

| Mã | Loại | Điều kiện | Kết quả mong đợi | Truy vết |
|---|---|---|---|---|
| DLO-01 | I, E | Lễ tân đúng chi nhánh đổi hộ lịch `DaXacNhan` có `lyDo`; lặp 5 lần liên tiếp trên một chuỗi (dưới trần chuỗi) | 201; lịch mới như DLH-01 nhưng `so_lan_tu_doi_lich` **giữ nguyên**; không bị chặn bởi `toiDa` | 2.4.30 HĐK |
| DLO-02 | I | Audit | một dòng `DoiLichHo` cùng giao dịch: `ma_doi_tuong` = lịch cũ, `chi_nhanh_id` = chi nhánh lịch, `{ truoc, sau, ly_do }` đúng tập khoá, không tên, SĐT, email | Q6, Q9; 2.4.70 |
| DLO-03 | E | Lễ tân chi nhánh khác; Quản trị viên (hai phạm vi); Bệnh nhân; Bác sĩ | 404 cùng thân; 403 (không có route cho Quản trị viên) | A1; Q7 (i) |
| DLO-04 | U, I | lịch quá giờ hẹn nhưng trong `check_in_sau_phut`; quá cửa sổ | đổi được; `LICH_HEN_DA_QUA_GIO` | Q3 |
| DLO-05 | I, C | khung giờ bị tranh chấp | 409 `KHUNG_GIO_DA_DAT`, giữ nguyên, không audit, không thông báo | A1 |
| DLO-06 | I | thông báo | `LichHenDaDoiLich` ghi "Lễ tân đã đổi hộ" và lý do (≤ 500); email `ChoGui` | Q9 `[đề xuất]` |
| DLO-07 | U, E | thiếu `lyDo`, rỗng, toàn khoảng trắng, > 255, khoá lạ (`lyDoYeuCau`) | 400 | Q9 |
| DLO-08 | I | lỗi ghi Audit (giả lập) | hoàn tác cả đổi lịch | 2.4.70 A1 |
| DLO-09 | I | hồ sơ người thân đã ngừng | 409 `HO_SO_NGUOI_THAN_DA_NGUNG` | Q7 (e) |
| DLO-10 | I | chuỗi đã dài | `CHUOI_DOI_LICH_QUA_DAI` | R4 |

### 7.4 Yêu cầu ngoài chính sách: tạo, danh sách, chi tiết, duyệt, từ chối (XDL) — B5, B8, B9

| Mã | Loại | Điều kiện | Kết quả mong đợi | Truy vết |
|---|---|---|---|---|
| XDL-01 | I | tạo yêu cầu | bản ghi `ChoDuyet` đúng `ly_do_yeu_cau`, `khung_gio_mong_muon_id`, `thoi_diem_tao`; lịch và hai khung giờ không đổi; khung giờ mong muốn vẫn `ConTrong` và người khác đặt được ngay | 2.4.9 A2; Q7 (f) |
| XDL-02 | I, C | yêu cầu thứ hai khi đã có `ChoDuyet`; sau `TuChoi` gửi lại | 409 `DA_CO_YEU_CAU_DOI_LICH_CHO_DUYET`; gửi lại được và thông báo thứ hai KHÔNG bị nuốt | Q4; Q5 |
| XDL-03 | I, E | danh sách Lễ tân | chỉ chi nhánh của Lễ tân; mặc định `ChoDuyet`, cũ nhất trước; phân trang, `total` khớp; yêu cầu chi nhánh khác vắng; tab đã xử lý sắp giảm dần | 2.4.31 b1; Q11 |
| XDL-04 | I, E | danh sách Quản trị viên | Toàn hệ thống thấy mọi chi nhánh và lọc `chiNhanhId`; Chi nhánh chỉ chi nhánh được gán; `chiNhanhId` ngoài phạm vi theo nếp `admin/appointments` (kiểm lại ở B8) | TĐK |
| XDL-05 | I, E | chi tiết yêu cầu | đủ khoá 5.7 (lịch gốc, khung giờ mong muốn và trạng thái hiện tại, `soLanDaTuDoi`, `soLanToiDa`, lý do, `coTheDuyet`, `lyDoKhongDuyet`); không SĐT, email, `ly_do_kham`, giá; ngoài phạm vi hoặc không có ⇒ 404 cùng thân | b3; H10 |
| XDL-06 | I, E | duyệt, khung giờ mong muốn còn trống | 200; lịch mới (như DLH-01 nhưng `so_lan_tu_doi_lich` **không +1**), lịch cũ `DaDoiLich`, khung giờ cũ `ConTrong`; yêu cầu `DaDuyet` + `ghi_chu_xu_ly` + `nguoi_xu_ly_id` + `thoi_diem_xu_ly`; Audit `XuLyDoiLichNgoaiChinhSach` cùng giao dịch; thông báo `YeuCauDoiLichDaDuyet` kèm ghi chú; `onSlotReleased` sau commit | b5, b6 |
| XDL-07 | I, C | duyệt khi khung giờ đã bị chiếm; rồi duyệt lại với `khungGioId` thay thế còn trống | 409 `KHUNG_GIO_DA_DAT`, yêu cầu **vẫn** `ChoDuyet`, lịch không đổi, không audit, không thông báo; duyệt thay thế thành công, Audit ghi lịch mới (khung giờ thật), `khung_gio_mong_muon_id` giữ nguyên | A2 5a đến 5c |
| XDL-08 | I | từ chối | `TuChoi` + ghi chú; lịch và khung giờ không đổi; **không có câu khoá khung giờ nào** (đếm); Audit; thông báo `YeuCauDoiLichBiTuChoi` kèm ghi chú | b7 |
| XDL-09 | U, E | ghi chú thiếu, rỗng, toàn khoảng trắng, 256 ký tự (biên 255 đạt), ký tự điều khiển | 400; không ghi gì; (UI: giữ lựa chọn) | A1 |
| XDL-10 | I | duyệt hai lần; duyệt sau từ chối; từ chối sau duyệt | 409 `YEU_CAU_DA_XU_LY`; không ghi thêm | TĐK |
| XDL-11 | I | lịch gốc không còn `DaXacNhan` (đã huỷ, đã tiếp đón, Vắng mặt, đã đổi hộ) | duyệt 409 `LICH_HEN_KHONG_CHO_DOI`; từ chối vẫn được; `coTheDuyet = false` | Q7 (g); R6 |
| XDL-12 | U, I | lịch gốc quá `thoi_gian + check_in_sau_phut` | duyệt 409 `LICH_HEN_DA_QUA_GIO`; từ chối được | Q3 |
| XDL-13 | E | quyền: Bệnh nhân, Bác sĩ ⇒ 403; Lễ tân chi nhánh khác ⇒ 404; Quản trị viên Chi nhánh ngoài phạm vi ⇒ 404; Quản trị viên Toàn hệ thống mọi chi nhánh; Lễ tân bị khoá ⇒ 403 | đúng mã | TĐK; admin Q40 |
| XDL-14 | I | lỗi ghi Audit (giả lập) khi duyệt và khi từ chối | hoàn tác trọn (yêu cầu vẫn `ChoDuyet`, lịch không đổi) | 2.4.70 A1; 2.4.31 "Thất bại" |
| XDL-15 | E | rò dữ liệu ở danh sách và chi tiết | danh sách trắng; `no-store`; không `lich_hen_id` ở API Bệnh nhân; id yêu cầu chỉ ở API nhân sự | H10 |
| XDL-16 | I | chi tiết lịch của Bệnh nhân sau từ chối và duyệt | `yeuCauDoiLich` mới nhất: `TuChoi` kèm `ghiChuXuLy`; sau duyệt lịch cũ 404, lịch mới hiện (đường theo mã trong thông báo) | Q10 |

### 7.5 Đồng thời và bất biến (TDL) — X2 (chạy MỘT mình; ghi số vòng và số 1213/1205/503)

| Mã | Loại | Kịch bản | Kết quả mong đợi |
|---|---|---|---|
| TDL-01 | C | hai Bệnh nhân đổi hai lịch KHÁC vào CÙNG khung giờ trống | đúng một thắng; bên thua `KHUNG_GIO_DA_DAT`; INV |
| TDL-02 | C | hai tab cùng đổi MỘT lịch sang hai khung giờ khác nhau | đúng một thắng; bên thua 404 hoặc 409 có kiểu; không chuỗi rẽ nhánh; 1062 của `lich_hen_truoc_id` không lộ ra |
| TDL-03 | C | hoán vị: A (khung giờ X→Y) và B (Y→X), id 9 và 10 để bắt lỗi so chuỗi | 0 lần 1213; cả hai thành công hoặc cả hai `KHUNG_GIO_DA_DAT`, không lịch nào mất; INV |
| TDL-04 | C | đổi × huỷ cùng một lịch (100 vòng) | đúng một thắng; huỷ thắng ⇒ đổi nhận 409 hoặc 404, khung giờ mới không bị giữ; đổi thắng ⇒ huỷ nhận `NotFound`; hoàn cọc đúng một lần; **ghi số 1213 nội bộ** (rủi ro B12 Q chấp nhận); 0 lần 503 |
| TDL-05 | C | đổi × hết hạn giữ chỗ của khung giờ mới | hết hạn lười đúng một lần; không hai lịch giữ một khung giờ |
| TDL-06 | C | đổi × `markNoShow` hoặc job Vắng mặt cùng lịch | một thắng; không lịch vừa `DaDoiLich` vừa `VangMat` |
| TDL-07 | C | đổi × tiếp đón (Lễ tân, payment tiền mặt) cùng lịch | một thắng; INV |
| TDL-08 | C | đổi × Quản trị viên override cùng lịch | một thắng |
| TDL-09 | C | đổi × duyệt nghỉ phép của bác sĩ (khung giờ mới trong kỳ nghỉ) | đúng một nhánh; nếu đổi thắng, lịch mới bị `findAffectedByLeave` huỷ và hoàn cọc đúng một lần |
| TDL-10 | C | đổi × áp dụng hoặc duyệt thay đổi chi nhánh (khung giờ mới trong vùng bị loại) | đúng một nhánh; kết quả theo M6 |
| TDL-11 | C | đổi × `create` của cùng bệnh nhân vào giờ chồng khung giờ mới | không hai lịch chồng giờ |
| TDL-12 | C | hai nhân sự duyệt cùng một yêu cầu | đúng một thắng; một yêu cầu `DaDuyet`; đúng một lịch mới |
| TDL-13 | C | duyệt × từ chối cùng yêu cầu | một thắng; không vừa lịch mới vừa `TuChoi` |
| TDL-14 | C | duyệt × Bệnh nhân huỷ lịch gốc | một thắng; không lịch mới từ lịch đã huỷ |
| TDL-15 | C | duyệt × Lễ tân đổi hộ cùng lịch gốc | một thắng; bên thua 409 có kiểu |
| TDL-16 | C | mười yêu cầu cùng lúc cho MỘT lịch | đúng một `ChoDuyet`; chín `DA_CO_YEU_CAU_DOI_LICH_CHO_DUYET` |
| TDL-17 | C | 100 vòng hỗn hợp (đổi, huỷ, create, duyệt, từ chối, hết hạn) trên cùng tập lịch | INV-1…INV-10 và IVT-01…IVT-07 xanh; 0 lần 503; 1213/1205 chỉ ở mức chấp nhận B12 Q |
| TDL-18 | C | đối chứng R2: đảo cố ý thứ tự (xin `lich_hen` trước `khung_gio` rồi chèn yêu cầu) | có 1213 (chứng minh hợp đồng khoá cần); đúng thứ tự ⇒ 0 |

### 7.6 Quyền và phạm vi (QDL)

| Mã | Loại | Kịch bản | Kết quả mong đợi |
|---|---|---|---|
| QDL-01 | E | ma trận route × vai trò (Bệnh nhân, Lễ tân, Bác sĩ, Quản trị viên Toàn hệ thống, Quản trị viên Chi nhánh, khách) cho mọi route mới | đúng 200/201, 403, 401 |
| QDL-02 | E | tài nguyên ngoài chi nhánh (lịch, yêu cầu), kể cả khi thân sai dạng | 404 cùng thân, kiểm trước trạng thái |
| QDL-03 | E | tài khoản Lễ tân bị khoá hoặc thu hồi phiên | 401 hoặc 403 `KHONG_DU_QUYEN` |
| QDL-04 | U | AR-02: mọi route khai `@Roles` trên từng route; AR-01 và AR-06 giữ | Pass (quét `src/`) |
| QDL-05 | E | Bệnh nhân đọc `yeuCauDoiLich` của lịch người khác | 404 cùng thân |
| QDL-06 | E | hồ sơ người thân của chính mình đổi được; của tài khoản khác 404 | đúng |

### 7.7 Migration và schema (MDL) — P1

| Mã | Loại | Kịch bản | Kết quả mong đợi |
|---|---|---|---|
| MDL-01 | I | migration lên và xuống trên MySQL thật | `so_lan_tu_doi_lich` có, lịch cũ nhận 0, CHECK `>= 0` chặn âm; xuống bỏ cột, không mất dữ liệu khác |
| MDL-02 | I | UNIQUE `thong_bao_index_yeu_cau_doi_lich` | hai thông báo cùng (yêu cầu, tài khoản, loại) ⇒ 1062; khác yêu cầu ⇒ cho; nhiều dòng NULL cho thông báo không thuộc yêu cầu |
| MDL-03 | I | ENUM `hanh_dong` thêm `DoiLichHo` | mọi giá trị cũ giữ nguyên thứ tự; ghi được `DoiLichHo`; `audit-enum-parity` Pass |
| MDL-04 | U | `schema-parity`: ba file `docs/database/*` so với migration | khớp từng dòng (CHECK, UNIQUE, FK, index, ENUM) |
| MDL-05 | I | entity so với DB | không chênh (không `synchronize`) |
| MDL-06 | I | xuống migration khi còn dữ liệu mới (bộ đếm khác 0, thông báo gắn yêu cầu, nhật ký `DoiLichHo`, dòng của bảng yêu cầu) | `down` CHẶN trước mọi câu DDL (Đại duyệt 24/11/2026), báo SỐ dòng, DB nguyên vẹn; hết dữ liệu thì xuống được và không mất dòng nào khác; cảnh báo ở đầu file migration |
| MDL-07 | I | CHECK sẵn có của bảng yêu cầu qua entity | `ChoDuyet` mà có người xử lý ⇒ vi phạm; `DaDuyet` thiếu ghi chú ⇒ vi phạm |
| MDL-08 | U | hai mặt nạ test của migration cũ (`maskLichHenDoiLich`, `maskThongBaoDoiLich`) | bỏ đúng phần của P1, không che nhầm bảng khác (P1) |
| MDL-09 | U | `name` của migration trùng tên lớp, mốc 13 chữ số lớn hơn mọi migration trước, đã đăng ký | đúng (P1) |
| MDL-10 | U | `clinix.dbml` so với `clinix_mysql.sql` | cùng tên và thứ tự cột của `lich_hen`, `thong_bao`, `yeu_cau_doi_lich_ngoai_chinh_sach`, `nhat_ky_hanh_dong`; khối Enum `hanh_dong_nhay_cam_enum` 27 giá trị; các UNIQUE của `thong_bao` (P1) |

### 7.8 Thông báo và nhật ký (NDL) — B3, P2, B7, B9

| Mã | Loại | Kịch bản | Kết quả mong đợi |
|---|---|---|---|
| NDL-01 | I | bốn sự kiện mới | mỗi sự kiện một `thong_bao` và một `email_thong_bao` `ChoGui` cho tài khoản đặt; lỗi ghi ⇒ hoàn tác cả hành động gốc |
| NDL-02 | I | worker gửi thư | `EmailOutboxService` nhận đủ 17 loại (13 loại hiện có và bốn loại mới); mẫu thư qua `renderMailShell`, `toSingleLine`, `escapeHtml`; không `ly_do_kham`, không `ly_do_yeu_cau`; lỗi gửi không hoàn tác đổi lịch |
| NDL-03 | I | chạy lại / trùng UNIQUE | "đã có", không dòng email thứ hai; một lịch với hai yêu cầu theo thời gian có đủ thông báo cho cả hai |
| NDL-04 | U, I | luật Audit: `XuLyDoiLichNgoaiChinhSach` và `DoiLichHo` | đúng đối tượng, `chi_nhanh_id`, tập khoá; ca âm: thiếu khoá, khoá lạ, `ghi_chu` hoặc `ly_do` rỗng hay quá 255, kết quả lạ, `sau.trang_thai` không thuộc `DaDuyet`/`TuChoi` ⇒ từ chối |
| NDL-05 | I | không ghi Audit khi: Bệnh nhân tự đổi, tạo yêu cầu, đọc, 4xx | đếm `nhat_ky_hanh_dong` không đổi |
| NDL-06 | U | `noi_dung` ≤ 500 với ghi chú 255 ký tự và lý do 255 ký tự | vừa 500; cắt có chủ đích, không làm hỏng ký tự đa byte |
| NDL-07 | I | người nhận | chỉ tài khoản đặt; Lễ tân, Bác sĩ, Quản trị viên không nhận |
| NDL-08 | U | `audit-enum-parity` | `DoiLichHo` có ở ENUM DB, `enums.ts` và bảng luật |

### 7.9 Hợp đồng và cổng (HDL) — B1, B4

| Mã | Loại | Kịch bản | Kết quả mong đợi |
|---|---|---|---|
| HDL-01 | U, I | `markReplaced` | chỉ `DaXacNhan` → `DaDoiLich` (đúng 1 hàng); trạng thái khác ⇒ `InvalidState`, không ghi; không đổi cột nào khác |
| HDL-02 | U | ma trận 343 ô viết tay | đúng 23 ô được phép; `chuyenDuoc[]` của Lễ tân và override không bao giờ chứa `DaDoiLich` |
| HDL-03 | I | `PaymentSummaryPort` và thu tiền mặt trên chuỗi 2 và 3 lịch (lớp thật) | `amountPaid`, `remainingToCollect`, `amountRefundable` truy lịch gốc; thu tiền mặt ở lịch mới ghi `lich_hen_id` = lịch gốc; INV-10 |
| HDL-04 | I | huỷ lịch mới (lớp wallet thật) | khoản hoàn dưới lịch gốc; thông báo hoàn trỏ lịch cuối; IVT-05 đến IVT-07 xanh |
| HDL-05 | I | spy `PendingBranchChangesPort.findBlocking` | gọi một lần với khung giờ ĐÍCH, `ca` đúng, dưới khoá, bằng `em` của người gọi |
| HDL-06 | I | spy `WaitlistPort` | gọi sau commit, ngoài giao dịch, một lần (DLH-13) |
| HDL-07 | I | `DoctorLeavePort.findBlockingLeave` | gọi với ngày và ca của khung giờ đích dưới khoá `bac_si` |
| HDL-08 | I | `lich_hen_truoc_id` | dịch vụ từ chối tự trỏ chính nó trước khi ghi; 1062 trên `lich_hen_truoc_id` ⇒ `NotReschedulable`, không 500 |
| HDL-09 | I | chuỗi dài: 19 lịch rồi đổi | bị từ chối trước khi `PaymentChain` ném `CHAIN_TOO_DEEP` |
| HDL-10 | I | thông báo và Audit chạy TRONG giao dịch (spy `em`) | cùng `em` với `INSERT lich_hen` |
| HDL-11 | E | hợp đồng chi tiết lịch Bệnh nhân | 19 khoá (thêm `choPhepDoiLich`, `yeuCauDoiLich`); ca B2 cũ cập nhật |

### 7.10 Bảo mật dữ liệu và log (BDL)

| Mã | Loại | Kịch bản | Kết quả mong đợi |
|---|---|---|---|
| BDL-01 | I | log của mọi đường mới (thành công và lỗi) | không lý do yêu cầu, ghi chú, lý do đổi hộ, tên, SĐT, email; chỉ id nội bộ và tên lớp lỗi |
| BDL-02 | E | thân phản hồi | danh sách trắng; không `lich_hen_id` ở API Bệnh nhân |
| BDL-03 | E | `Cache-Control: no-store` | mọi route mới |
| BDL-04 | U, W | văn bản người dùng nhập (`ly_do_yeu_cau`, ghi chú, lý do) chứa `<script>`, `&`, dấu nháy | lưu nguyên; thư thoát HTML; web hiển thị dạng chữ, không `dangerouslySetInnerHTML` |
| BDL-05 | U | quét `src/appointments/reschedule/` | mọi câu SQL tham số hoá, không nối chuỗi giá trị |

### 7.11 Giao diện (WDH, WDO, WXD) — mức GỌN; đột biến web bốn loại (kho trình duyệt/URL, bấm đúp, tính toán ở client, chặn theo trạng thái)

| Mã | Task | Kịch bản | Kết quả mong đợi |
|---|---|---|---|
| WDH-01 | F1 | nút "Đổi lịch" ở chi tiết | hiện khi `choPhepDoiLich`; "Gửi yêu cầu đổi lịch" khi hết lần; vô hiệu có lý do khi đã có yêu cầu chờ hoặc lịch không đổi được |
| WDH-02 | F1 | trang chọn khung giờ | dải ngày, lưới của đúng bác sĩ; ô `ConTrong` chọn được; ô khung giờ cũ và ô không trống vô hiệu |
| WDH-03 | F1 | chọn ô | sang màn xác nhận; id khung giờ giữ chuỗi (id lớn hơn 2^53) |
| WDH-04 | F2 | nhánh yêu cầu | ô lý do bắt buộc 5 đến 500, đếm ký tự, lỗi cạnh ô, giữ nội dung khi lỗi |
| WDH-05 | F2 | xác nhận | đã đổi ⇒ sang chi tiết lịch mới kèm thông báo; đã gửi yêu cầu ⇒ về lịch cũ với banner chờ duyệt |
| WDH-06 | F2 | lỗi 409 từng mã | câu tiếng Việt theo `maLoi`; `KHUNG_GIO_DA_DAT` quay về lưới và tải lại |
| WDH-07 | F1, F2 | loading, rỗng, lỗi, mất mạng, timeout | đủ trạng thái; nút gửi khoá khi đang gửi (bấm đúp một lần) |
| WDH-08 | F1 | bàn phím và trình đọc màn hình | nhãn ô theo giờ và trạng thái; focus quản lý ở hộp và khi quay lại |
| WDH-09 | F2 | banner yêu cầu | `ChoDuyet`, `TuChoi` kèm ghi chú; chi tiết lịch đã đổi (404) có trang thân thiện |
| WDH-10 | F1 | kiến trúc | không `fetch` ngoài lớp client; đường dẫn từ `booking-paths`; không `dangerouslySetInnerHTML` |
| WDO-01…WDO-06 | F3 | nút theo `choPhepDoiLich`; hộp chọn; ô lý do bắt buộc 1 đến 255 và dòng nhắc; lỗi 409; 404 ngoài chi nhánh; nút khoá khi gửi | đúng |
| WXD-01…WXD-10 | F4 | menu có `to`; hai tab; bảng và phân trang; chi tiết; hộp duyệt và từ chối; ghi chú bắt buộc (giữ lựa chọn); chọn khung giờ thay thế; 409 giữ hộp; rỗng, lỗi, mất mạng; URL giữ tab | đúng |
| WXD-11…WXD-14 | F5 | tab Admin hết vô hiệu và là liên kết; route con; nội dung dùng chung với Lễ tân; ca WA-13 cập nhật | đúng |

### 7.12 Kiểm tay trình duyệt (KTD) — X3 (ba vai trò; 125 phần trăm và 375 px; không dùng DB `clinix` khi chưa được Đại đồng ý)

KTD-01 Bệnh nhân tự đổi (cọc 0đ), KTD-02 tự đổi (cọc > 0, kiểm không có giao dịch mới), KTD-03 hết lần tự đổi gửi yêu cầu, KTD-04 banner chờ duyệt rồi từ chối kèm ghi chú, KTD-05 tranh chấp khung giờ (hai trình duyệt), KTD-06 Lễ tân đổi hộ, KTD-07 Lễ tân duyệt, KTD-08 Lễ tân từ chối, KTD-09 Quản trị viên Toàn hệ thống duyệt, KTD-10 Quản trị viên Chi nhánh thấy đúng phạm vi, KTD-11 bàn phím và focus ở các hộp, KTD-12 tải lại và mất mạng ở màn xác nhận. Mỗi ca ghi kết quả thật vào TRACKING mục 2.

## 8. Đề xuất gom cụm (chỉ đề xuất — nhóm chốt)

Hai cụm giao được: **Cụm 1 = S1 + S2 (P1, P2, X1, B1 đến B6, F1, F2: 55,5 giờ)** cho Bệnh nhân tự đổi lịch và gửi yêu cầu; **Cụm 2 = S3 + S4 + S5 (B7, F3, B8, B9, F4, F5, D1, X2, X3: 42,5 giờ)** cho Lễ tân đổi hộ và xử lý yêu cầu. Nếu cần giao sớm hơn, B7 và F3 có thể đi trước B8, B9 (không phụ thuộc yêu cầu), nhưng đủ ba use case cần cả hai cụm.

## 9. Quy trình bắt buộc cho mỗi PR của scope

Theo `AGENTS.md` mục 5 và `CONTRIBUTING.md`: nhánh `feat/booking-…` do người dùng tạo, không làm trên `main`; viết test theo mã test case rồi code; chạy `lint`, `build`, `test` (và `test:int`, `test:e2e` cho task ĐẦY ĐỦ) ở máy và báo kết quả **thật**; task `[ĐỒNG BỘ TL]` sửa tài liệu trong **cùng PR**; cập nhật `docs/features/reschedule/TRACKING.md` (ngày, việc, mã test case, pass hay fail, vấn đề) và tick ô tương ứng ở PLAN này; cấu hình mới vào `.env.example` (scope này không có); lối tắt kỹ thuật vào `docs/TECH_DEBT.md` (Đại ghi); `AI_USAGE_LOG.md`: người dùng ghi một dòng cho mỗi lần dùng AI; **không** `git add`, `commit`, `push` do AI; tiêu đề PR là commit cuối (squash), Conventional Commits, scope `booking` (hạ tầng: `db`, `audit`), ≤ 100 ký tự; PR cần người còn lại approve và CI xanh (bảy check bắt buộc). Chạy lệnh đột biến ở lane nặng khi phiên kiểm báo "RẢNH".

## 10. Điều kiện hoàn thành scope

- [ ] Hai nhánh của 2.4.9 (tự đổi; vượt hạn mức gửi yêu cầu), 2.4.30 và 2.4.31 (duyệt, từ chối, tranh chấp, ghi chú bắt buộc) chạy đúng trên MySQL thật; mọi luồng thay thế A1, A2, A3 của ba use case có ca.
- [ ] Mọi mã test case ở mục 7 đã chạy hoặc ghi rõ lý do hoãn ở TRACKING mục 2 (KTD kiểm tay có kết quả thật).
- [ ] INV-1…INV-10 và IVT-01…IVT-07 xanh sau mọi ca đồng thời; 0 lần 503; số 1213 nội bộ ở TDL-04 và TDL-17 được ghi.
- [ ] 18 đột biến ở 5.14 đều bị ít nhất một ca bắt.
- [ ] Không còn thẻ `[CHỜ …]` trong PLAN này (trừ ghi chú `[CHỜ waitlist]` chạy lại), không còn `[cần điền]` chặn mã.
- [ ] Ba file `docs/database/*` khớp migration; booking PLAN, booking TRACKING, `docs/TRACKING.md` và TECH_DEBT (dòng 260 đóng, 266 trở đi) đã đồng bộ ở D1; D2 (Word) do Đại báo xong.
- [ ] TECH_DEBT dòng 260 đã đóng bằng ca KDL-17 và HDL-05; dòng 147 nhắc khung giờ giải phóng do đổi lịch.
- [ ] CI xanh (bảy check), jscpd ≤ 3% (CI đo), 0 lỗi lint.

## Phụ lục A. Nguyên văn 2.4.9, 2.4.30, 2.4.31 (sao chép bằng script từ `2.4_Dac_Ta_Use_Case_CLINIX.docx`, không diễn giải)

Nguồn: `D:\du_lieu\TLCN_CLINIX\2.4_Dac_Ta_Use_Case_CLINIX.docx`, đọc bằng `python-docx` ngày 24/11/2026; mỗi ô Word được tách dòng tại chỗ xuống dòng của ô. Dự án không dùng Use Case ID. Chữ trong ngoặc vuông `[đề xuất]`, `[cần điền]` là của tài liệu gốc.

### 2.4.9 Use case Đổi lịch hẹn

**Mô tả.** Cho phép Bệnh nhân đổi khung giờ của một lịch hẹn Đã xác nhận (giữ nguyên bác sĩ, dịch vụ), tối đa 2 lần tự đổi cho mỗi lịch hẹn (số lần do Quản trị viên Toàn hệ thống cấu hình); vượt giới hạn thì sinh yêu cầu ngoài chính sách chờ Lễ tân/Quản trị viên duyệt. Muốn đổi bác sĩ hoặc dịch vụ phải hủy và đặt lịch mới.

**Tác nhân kích hoạt.** Bệnh nhân.

**Tiền điều kiện.**
- Đã đăng nhập vai trò Bệnh nhân, sở hữu lịch hẹn muốn đổi (bản thân hoặc hồ sơ người thân do mình quản lý).
- Lịch hẹn đang ở trạng thái Đã xác nhận.

**Hậu điều kiện.**
- Thành công (còn hạn tự đổi): Hệ thống tạo lịch hẹn mới ở khung giờ mới, liên kết với lịch hẹn trước (giữ nguyên bác sĩ, dịch vụ; sao chép giá, tiền cọc, chính sách hoàn đã snapshot); lịch hẹn cũ chuyển Đã đổi lịch, không tạo giao dịch thanh toán mới (thanh toán và hoàn tiền truy về lịch hẹn gốc); khung giờ cũ được giải phóng (có thể mời waitlist); khung giờ mới chuyển Đã đặt/Đang giữ chỗ tương ứng trạng thái lịch hẹn; số lần tự đổi tăng thêm 1.
- Thành công (vượt hạn tự đổi): Không đổi lịch ngay; hệ thống tạo một yêu cầu đổi lịch ngoài chính sách ở trạng thái Chờ duyệt (use case "Xử lý yêu cầu đổi lịch ngoài chính sách"), lịch hẹn giữ nguyên khung giờ cũ cho đến khi có kết quả duyệt.
- Thất bại: Lịch hẹn không thay đổi khung giờ; không có khung giờ nào bị chiếm giữ thêm; hệ thống hiển thị lỗi tương ứng.

**Các bước thực hiện.**
- (1) Bệnh nhân chọn lịch hẹn muốn đổi từ danh sách lịch hẹn của mình.
- (2) Hệ thống kiểm tra lịch hẹn đang ở trạng thái Đã xác nhận và đếm số lần đã tự đổi trước đó.
- (3) Hệ thống hiển thị danh sách khung giờ còn trống khác của cùng bác sĩ, cùng dịch vụ (use case "Tính khung giờ khám còn trống").
- (4) Bệnh nhân chọn khung giờ mới.
- (5) Hệ thống giữ chỗ tạm thời cho khung giờ mới (use case "Giữ chỗ tạm thời & chống trùng lịch") trước khi đụng đến lịch hẹn cũ.
- (6) Hệ thống hiển thị màn hình xác nhận đổi lịch (khung giờ cũ → khung giờ mới).
- (7) Bệnh nhân xác nhận.
- (8) Hệ thống kiểm tra số lần tự đổi của lịch hẹn chưa đạt giới hạn cấu hình.
- (9) Hệ thống chuyển lịch hẹn sang khung giờ mới, giải phóng khung giờ cũ, tăng bộ đếm số lần tự đổi, gửi thông báo xác nhận đổi lịch thành công.

**Luồng thay thế.**
- A1. Khung giờ mới vừa chọn không còn trống (tranh chấp) hoặc ngoài ngày/khoảng nhận khám của chi nhánh
- 5a. Hệ thống phát hiện khung giờ mới đã bị người khác giữ/đặt trước khi giữ chỗ thành công, hoặc khung giờ mới không còn thuộc ngày, giờ hoạt động của chi nhánh (chi nhánh nghỉ ngày đó, hoặc khung giờ không còn nằm trọn trong một khoảng nhận khám của chi nhánh, kể cả xuyên giờ nghỉ trưa).
- 5b. Hệ thống từ chối giữ chỗ, thông báo lý do cụ thể (khung giờ vừa hết, hoặc chi nhánh nghỉ/ngoài giờ hoạt động), giữ nguyên lịch hẹn cũ không đổi.
- 5c. Bệnh nhân chọn lại khung giờ khác — quay lại bước 4.
- A2. Vượt số lần tự đổi cho phép
- 8a. Hệ thống phát hiện số lần tự đổi của lịch hẹn đã đạt giới hạn cấu hình (đề xuất 2 lần).
- 8b. Hệ thống không đổi lịch trực tiếp; giải phóng khung giờ mới vừa giữ tạm ở bước 5; tạo một yêu cầu đổi lịch ngoài chính sách (use case "Xử lý yêu cầu đổi lịch ngoài chính sách") kèm khung giờ mong muốn, chuyển cho Lễ tân/Quản trị viên duyệt.
- 8c. Hệ thống thông báo cho Bệnh nhân yêu cầu đang chờ duyệt; lịch hẹn giữ nguyên khung giờ cũ cho tới khi có kết quả — use case kết thúc.
- A3. Lịch hẹn không ở trạng thái Đã xác nhận
- 2a. Hệ thống phát hiện lịch hẹn không ở trạng thái Đã xác nhận (Chờ thanh toán, Đã tiếp đón, Hoàn thành, Đã hủy, Đã đổi lịch hoặc Vắng mặt).
- 2b. Hệ thống từ chối cho đổi lịch, thông báo lý do — use case kết thúc.

### 2.4.30 Use case Đổi lịch hẹn hộ bệnh nhân

**Mô tả.** Cho phép Lễ tân đổi khung giờ của một lịch hẹn hộ bệnh nhân (giữ nguyên bác sĩ, dịch vụ), áp dụng đúng chính sách chuẩn và cơ chế nguyên tử giữ khung giờ mới trước như khi bệnh nhân tự đổi lịch.

**Tác nhân kích hoạt.** Lễ tân.

**Tiền điều kiện.**
- Đã đăng nhập vai trò Lễ tân.
- Lịch hẹn thuộc chi nhánh Lễ tân được gán.
- Lịch hẹn đang ở trạng thái Đã xác nhận (cùng điều kiện với use case "Đổi lịch hẹn" của Bệnh nhân).

**Hậu điều kiện.**
- Thành công: Hệ thống tạo lịch hẹn mới ở khung giờ mới, liên kết với lịch hẹn trước (giữ nguyên bác sĩ, dịch vụ; sao chép giá, tiền cọc, chính sách hoàn đã snapshot); lịch hẹn cũ chuyển Đã đổi lịch, không tạo giao dịch thanh toán mới; khung giờ cũ được giải phóng (có thể mời waitlist); khung giờ mới chuyển Đã đặt/Đang giữ chỗ tương ứng trạng thái lịch hẹn. Lễ tân đổi hộ không giới hạn số lần, không tính vào số lần tự đổi của bệnh nhân
- Thất bại: Lịch hẹn không thay đổi khung giờ; không có khung giờ nào bị chiếm giữ thêm; hệ thống hiển thị lỗi tương ứng.

**Các bước thực hiện.**
- (1) Lễ tân tìm và chọn lịch hẹn của bệnh nhân cần đổi lịch (thuộc chi nhánh mình được gán).
- (2) Hệ thống kiểm tra lịch hẹn đang ở trạng thái Đã xác nhận.
- (3) Hệ thống hiển thị danh sách khung giờ còn trống khác của cùng bác sĩ, cùng dịch vụ.
- (4) Lễ tân chọn khung giờ mới.
- (5) Hệ thống giữ chỗ tạm thời cho khung giờ mới (use case "Giữ chỗ tạm thời & chống trùng lịch") trước khi đụng đến lịch hẹn cũ.
- (6) Hệ thống hiển thị màn hình xác nhận đổi lịch.
- (7) Lễ tân xác nhận.
- (8) Hệ thống chuyển lịch hẹn sang khung giờ mới, giải phóng khung giờ cũ, gửi thông báo cho bệnh nhân.

**Luồng thay thế.**
- A1. Khung giờ mới vừa chọn không còn trống (tranh chấp) hoặc ngoài ngày/khoảng nhận khám của chi nhánh
- 5a. Hệ thống phát hiện khung giờ mới đã bị giữ/đặt bởi giao dịch khác, hoặc không còn thuộc ngày, giờ hoạt động của chi nhánh (chi nhánh nghỉ ngày đó, hoặc khung giờ không còn nằm trọn trong một khoảng nhận khám của chi nhánh, kể cả xuyên giờ nghỉ trưa).
- 5b. Hệ thống từ chối giữ chỗ, thông báo lý do cụ thể (khung giờ vừa hết, hoặc chi nhánh nghỉ/ngoài giờ hoạt động), giữ nguyên lịch hẹn cũ.
- 5c. Lễ tân chọn lại khung giờ khác — quay lại bước 4.
- A2. Lịch hẹn không ở trạng thái Đã xác nhận
- 2a. Hệ thống phát hiện lịch hẹn không ở trạng thái Đã xác nhận (cùng điều kiện use case "Đổi lịch hẹn").
- 2b. Hệ thống từ chối, thông báo lý do — use case kết thúc.

### 2.4.31 Use case Xử lý yêu cầu đổi lịch ngoài chính sách

**Mô tả.** Cho phép Lễ tân (trong phạm vi chi nhánh được gán) và Quản trị viên (trong phạm vi quản trị của mình) xem danh sách yêu cầu đổi lịch ngoài chính sách đang chờ (phát sinh khi Bệnh nhân vượt số lần tự đổi cho phép), duyệt hoặc từ chối kèm ghi chú xử lý bắt buộc; khi duyệt, giữ khung giờ mới trước, chỉ chuyển lịch cũ sang Đã đổi lịch khi khung giờ mới chắc chắn thành công.

**Tác nhân kích hoạt.** Lễ tân, Quản trị viên.

**Tiền điều kiện.**
- Đã đăng nhập vai trò Lễ tân hoặc Quản trị viên.
- Với Lễ tân: yêu cầu thuộc chi nhánh mình được gán.
- Với Quản trị viên: yêu cầu thuộc phạm vi quản trị của mình (Toàn hệ thống xem tất cả; Chi nhánh chỉ xem chi nhánh được gán).
- Có ít nhất một yêu cầu đổi lịch ngoài chính sách đang ở trạng thái Chờ duyệt.

**Hậu điều kiện.**
- Thành công (duyệt): Khung giờ mới được giữ chỗ trước; nếu giữ chỗ thành công, hệ thống tạo lịch hẹn mới ở khung giờ mới liên kết với lịch hẹn cũ (không tạo giao dịch thanh toán mới), lịch hẹn cũ chuyển sang Đã đổi lịch, khung giờ cũ được giải phóng; yêu cầu chuyển Đã duyệt; hành động ghi vào Audit Log.
- Thành công (từ chối): Yêu cầu chuyển Từ chối kèm ghi chú lý do; lịch hẹn giữ nguyên khung giờ cũ; hành động ghi vào Audit Log.
- Thất bại: Yêu cầu giữ nguyên Chờ duyệt; không có thay đổi lịch hẹn nào; hệ thống hiển thị lỗi tương ứng.

**Các bước thực hiện.**
- (1) Lễ tân/Quản trị viên chọn chức năng "Xử lý yêu cầu đổi lịch ngoài chính sách", xem danh sách yêu cầu Chờ duyệt trong phạm vi của mình (chi nhánh được gán, hoặc toàn hệ thống nếu Quản trị viên Toàn hệ thống).
- (2) Người dùng chọn một yêu cầu để xử lý.
- (3) Hệ thống hiển thị chi tiết yêu cầu (lịch hẹn gốc, khung giờ mới mong muốn, số lần đã tự đổi trước đó, lý do).
- (4) Người dùng nhập ghi chú xử lý (bắt buộc) và chọn Duyệt hoặc Từ chối.
- (5) Nếu Duyệt: hệ thống giữ chỗ tạm thời cho khung giờ mới mong muốn (use case "Giữ chỗ tạm thời & chống trùng lịch", chỉ gọi khi Duyệt; Từ chối thì không giữ chỗ).
- (6) Nếu giữ chỗ thành công: hệ thống chuyển lịch hẹn cũ sang Đã đổi lịch với khung giờ mới, giải phóng khung giờ cũ, cập nhật yêu cầu sang Đã duyệt, ghi Audit Log, thông báo cho bệnh nhân.
- (7) Nếu Từ chối: hệ thống cập nhật yêu cầu sang Từ chối kèm ghi chú, ghi Audit Log, thông báo cho bệnh nhân; lịch hẹn giữ nguyên khung giờ cũ.

**Luồng thay thế.**
- A1. Chưa nhập ghi chú xử lý
- 4a. Hệ thống phát hiện chưa nhập ghi chú xử lý.
- 4b. Hệ thống thông báo ghi chú là bắt buộc, giữ nguyên lựa chọn Duyệt/Từ chối đã chọn.
- 4c. Người dùng nhập ghi chú và gửi lại — quay lại bước 4.
- A2. Khung giờ mới không còn trống khi duyệt
- 5a. Hệ thống phát hiện khung giờ mới mong muốn đã bị chiếm (Đã đặt/Đang giữ chỗ) bởi giao dịch khác.
- 5b. Hệ thống không chuyển lịch hẹn, thông báo khung giờ mới không còn khả dụng, yêu cầu vẫn ở trạng thái Chờ duyệt.
- 5c. Người dùng chọn khung giờ khác thay thế hoặc Từ chối yêu cầu — quay lại bước 3.

## Phụ lục B. Nguyên văn các use case hệ thống liên quan (chỉ phần Mô tả, Hậu điều kiện và luồng thay thế liên quan đổi lịch)

Cùng nguồn và cách trích như Phụ lục A. 2.4.60, 2.4.61, 2.4.62, 2.4.68, 2.4.70, 2.4.75 lấy Mô tả và Hậu điều kiện; 2.4.69 lấy Mô tả và luồng thay thế (A2 nói về đổi lịch); 2.4.36 lấy Mô tả.

### 2.4.60 Use case Tính khung giờ khám còn trống

**Mô tả.** Tác vụ tính toán dùng chung, xác định danh sách khung giờ khám còn trống của một bác sĩ theo dịch vụ đã chọn, dựa trên lịch làm việc theo chi nhánh và lịch hoạt động theo thứ của chi nhánh (chi nhánh nghỉ ngày nào thì không có khung giờ nào ngày đó; ca sáng chỉ có khung giờ trong khoảng nhận khám buổi sáng, ca chiều trong khoảng buổi chiều, mỗi khung giờ cộng thời lượng dịch vụ phải nằm trọn trong khoảng, không xuyên giờ nghỉ trưa; các khung giờ trong một khoảng nối liền nhau theo thời lượng dịch vụ (khung đầu bắt đầu đúng giờ bắt đầu khoảng, khung sau bắt đầu đúng lúc khung trước kết thúc), phần dư cuối khoảng không đủ một khung thì không có khung giờ); loại trừ khung giờ đã Đã đặt, Đang giữ chỗ, hoặc trùng lịch nghỉ đã duyệt. Dùng chung cho tra cứu, đặt lịch, và chạy thêm khi gợi ý AI cần hiển thị giờ trống.

**Hậu điều kiện.**
- Thành công: Trả về danh sách khung giờ với trạng thái tương ứng (Còn trống, Đã đặt, Đang giữ chỗ, Hết hạn) cho use case gọi sử dụng.
- Thất bại: Không trả được danh sách khung giờ (ví dụ dữ liệu lịch làm việc không hợp lệ); use case gọi nhận thông báo lỗi và tự xử lý.

### 2.4.61 Use case Giữ chỗ tạm thời & chống trùng lịch

**Mô tả.** Tác vụ khoá tạm một khung giờ được chọn trong thời gian giới hạn, ngăn đặt trùng (double-booking) khi nhiều kênh cùng thao tác đồng thời. Dùng chung cho đặt lịch, đổi lịch, đổi lịch hẹn hộ bệnh nhân, và mời danh sách chờ.

**Hậu điều kiện.**
- Thành công: Khung giờ chuyển sang Đang giữ chỗ, gắn với giao dịch gọi và thời hạn giữ chỗ (15 phút cho đặt lịch/đổi lịch; 1 giờ cho mời waitlist — dùng thời hạn phản hồi lời mời); use case gọi tiếp tục xử lý.
- Thất bại: Khung giờ không đổi trạng thái (đã bị giữ/đặt bởi giao dịch khác); use case gọi nhận báo tranh chấp và tự xử lý (thường là báo lỗi cho người dùng chọn khung giờ khác).

### 2.4.62 Use case Mời waitlist tuần tự & xử lý hết hạn

**Mô tả.** Khi có khung giờ trống phát sinh (do huỷ hoặc đổi lịch), hệ thống gửi lời mời cho ứng viên khớp tiêu chí theo thứ hạng đăng ký, mỗi thời điểm một ứng viên cho một khung giờ; giữ chỗ cho ứng viên trong suốt thời hạn phản hồi; từ chối hoặc hết hạn thì nhả chỗ và mời người kế tiếp.

**Hậu điều kiện.**
- Thành công (có ứng viên chấp nhận): Một ứng viên trong danh sách chờ đặt lịch thành công với khung giờ đó; mục chờ chuyển Đã chấp nhận.
- Thành công (không ai chấp nhận, hết danh sách chờ): Khung giờ vẫn ở trạng thái Còn trống, không còn ai được mời.
- Thất bại: Không áp dụng theo nghĩa giao dịch — đây là tác vụ nền, luôn kết thúc ở một trong các trạng thái trên.

### 2.4.68 Use case Gửi thông báo theo sự kiện nghiệp vụ

**Mô tả.** Gửi thông báo (trong ứng dụng và email) khi có các sự kiện nghiệp vụ: xác nhận đặt lịch; huỷ, đổi lịch, hoàn thành; thanh toán thất bại; hoàn tiền xong; kết quả yêu cầu rút tiền; đánh dấu vắng mặt; khoá do no-show; gửi lời mời và kết quả waitlist; nghỉ phép; thay đổi lịch hoạt động hoặc dịch vụ khả dụng của chi nhánh đã được duyệt và sắp có hiệu lực, ảnh hưởng lịch hẹn của bệnh nhân (gửi cho từng bệnh nhân bị ảnh hưởng, trước thời điểm có hiệu lực); kết quả yêu cầu thay đổi chi nhánh cho người đề xuất. Hai kênh: thông báo trong ứng dụng và email; "đẩy tức thời" chỉ là việc hiển thị ngay thông báo trong ứng dụng cho phiên đang hoạt động, không phải thông báo đẩy trên thiết bị di động.

**Hậu điều kiện.**
- Thành công: Thông báo trong ứng dụng được tạo cho (các) tài khoản liên quan; đồng thời một email tương ứng được gửi qua Dịch vụ Email (use case "Gửi email thông báo theo sự kiện").
- Thất bại (gửi email lỗi): Thông báo trong ứng dụng vẫn được tạo; việc gửi email được ghi nhận thất bại, không chặn luồng nghiệp vụ chính đã kích hoạt sự kiện. Email có thể được gửi lại; mỗi thông báo có tối đa một email đã gửi.

### 2.4.69 Use case Gửi nhắc lịch hẹn theo lịch trình

**Mô tả.** Tự tính thời điểm gửi nhắc lịch theo cấu hình (ví dụ trước 72, 24, 2 giờ), gửi qua email, không kèm phản hồi nhanh. Chạy theo lịch, dùng chung cơ chế lập lịch với hết hạn giữ chỗ và hết hạn lời mời.

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

### 2.4.70 Use case Ghi nhật ký hành động nhạy cảm

**Mô tả.** Ghi người thực hiện, hành động, đối tượng, thời điểm, kết quả cho các hành động nhạy cảm: đổi quyền, override lịch hẹn, hoàn tiền đặc biệt, xử lý thủ công nạp ví chưa cộng, đổi chi nhánh công tác của bác sĩ, chỉnh no-show, ẩn đánh giá, xử lý đổi lịch ngoài chính sách, sửa ghi chú khám bệnh, cập nhật cấu hình hệ thống (kèm giá trị trước – sau và lý do).

**Hậu điều kiện.**
- Thành công: Một bản ghi Audit Log mới được tạo, gồm người thực hiện, hành động, đối tượng, thời điểm, kết quả (và nội dung trước/sau nếu áp dụng); hành động nghiệp vụ gốc được chốt cùng lúc.
- Thất bại: Bản ghi không được tạo; hành động nghiệp vụ gốc bị hoàn tác (rollback) theo; hệ thống báo lỗi cho người thực hiện để thử lại

### 2.4.75 Use case Gửi email thông báo theo sự kiện

**Mô tả.** Gửi email cho các sự kiện nghiệp vụ mà hệ thống yêu cầu: xác nhận đặt lịch, thanh toán, hoàn tiền, lời mời và kết quả danh sách chờ, nhắc lịch hẹn theo lịch trình, thay đổi lịch hoạt động/dịch vụ khả dụng của chi nhánh ảnh hưởng lịch hẹn. Hệ thống CLINIX ghi nhận kết quả từng email (chờ gửi, đã gửi, thất bại kèm lỗi và số lần thử) để gửi lại được mà không gửi trùng.

**Hậu điều kiện.**
- Thành công: Email thông báo được gửi tới địa chỉ đích.
- Thất bại: Email không gửi được; hệ thống CLINIX ghi nhận thất bại (không chặn luồng nghiệp vụ gốc). Thông báo trong ứng dụng và quyết định nghiệp vụ đã duyệt không bị xóa hay hoàn tác.

### 2.4.36 Use case Xem hàng đợi danh sách chờ

**Mô tả.** Cho phép Lễ tân và Quản trị viên xem người đang trong danh sách chờ, thứ hạng, trạng thái lời mời theo bác sĩ/ngày/ca, trong phạm vi chi nhánh (Lễ tân, hoặc Quản trị viên phạm vi Chi nhánh) hoặc toàn hệ thống (Quản trị viên phạm vi Toàn hệ thống); phục vụ xử lý thủ công trường hợp ngoại lệ.
