# Kế hoạch module `doctor` (phần khám bệnh: ghi hồ sơ khám, hoàn thành ca khám, xem hồ sơ khám, đánh giá bác sĩ, kiểm duyệt đánh giá)

> **Trạng thái: bản nháp 1 (14/11/2026).** **Mới có Q20 và phần Iteration của Q13 được trả lời** (14/11/2026, Đại chọn trực tiếp tại cửa sổ của phiên kiểm: Q20 = **Phương án C**; Iteration giữ một tuần, 6 là 17/11 đến 23/11, 7 là 24/11 đến 30/11, 8 là 01/12 đến 07/12; số giờ/tuần chưa nêu nên dùng mặc định 45 `[đề xuất]`; ghi ở [`TRACKING.md`](TRACKING.md) mục 3.1); **Q10 và Q11 đã ghi nhận 14/11/2026** (Trung approve PR 389, không bình luận riêng; Đại coi đó là xác nhận theo tin đã gửi; xem [`TRACKING.md`](TRACKING.md) mục 3.1); các câu còn lại chưa trả lời (mục 4.2 còn `[CHỜ …]`); chưa qua phiên kiểm độc lập; chưa mở PR. Mọi quyết định khác ở đây là `[đề xuất]` cho tới khi ghi vào [`TRACKING.md`](TRACKING.md) mục 3.
> **Người LÀM scope này là Đại (`MaxTrann`)**; mã nằm trong module `doctor` do **Trung (`junUTE`)** sở hữu và chạm `admin` (màn kiểm duyệt đánh giá), `search` (điểm đánh giá ở danh sách và chi tiết bác sĩ). Mọi file của Trung gắn `[ĐỤNG doctor]`, `[ĐỤNG admin]`, `[ĐỤNG search]`, `[ĐỤNG audit]`; **báo Trung trước và để Trung review PR** (mục 6.7 liệt kê từng file và cách tránh xung đột).
> Kế hoạch do AI (Claude Code, model Claude Sonnet 5.5) lập theo [`docs/FEATURE_PLANNING_PROMPT.md`](../../FEATURE_PLANNING_PROMPT.md) trong phiên của Đại ngày 14/11/2026 → **ghi nhật ký AI cho lần lập kế hoạch này ở `AI_USAGE_LOG.md` (của Đại): dòng `[đề xuất]` 110** (kiểm lại số lớn nhất trên `main` lúc ghi; lúc soạn: lớn nhất 107, booking B16a và B18 giữ 108 và 109; bản nháp dòng ở [`TRACKING.md`](TRACKING.md) mục 4). **Phiên này KHÔNG sửa `AI_USAGE_LOG.md`**: hỏi Đại trước khi ghi.
> Đã kiểm mã thật trên `origin/main` ở **`cb8bf46`** (PR 386, booking F11; **không** tin ô tick của PLAN các module khác). Mọi chỗ ghi **"chưa đo"** là suy ra từ mã hay tài liệu, **chưa chạy thử** trên MySQL thật; danh sách việc phải đo trước khi viết mã ở mục 5.15 (M1 đến M14). Phiên lập kế hoạch này **không chạy** `test:int`, `test:e2e`, `npm test` hay `build` (dùng chung MySQL và máy với hai cửa sổ làm booking B16a, B18) và **không sửa** `docs/features/booking/*`, `docs/features/doctor/*`, `docs/features/admin/*`, `docs/features/search/*`, `docs/PLAN.md`, `docs/database/*`, `docs/TECH_DEBT.md`, `AI_USAGE_LOG.md` (mọi chỉnh sửa cần ở đó nằm ở mục 6.5, task D2).
> Scope này là **#8** trong lộ trình 15 scope; **KHÔNG phụ thuộc #7** (payment + wallet, Trung làm song song). Scope #9 (`booking` đổi lịch, Đại, sau #7) và #11 (waitlist) làm sau; điểm nối cho #9 ở mục 5.10 (E9).

## 0. Quy ước đọc

- Tên use case viết tắt, **trùng tiền tố mã test**: **HSK** = Ghi hồ sơ khám bệnh; **HTK** = Xác nhận hoàn thành ca khám; **XHS** = Xem hồ sơ khám bệnh; **DGB** = Đánh giá bác sĩ; **KDD** = Kiểm duyệt đánh giá. `b4` = bước (4); `A1/4b` = luồng thay thế A1, mục 4b; "MT" = Mô tả; "TĐK" = tiền điều kiện; "HĐK" = hậu điều kiện. Số bước lấy đúng 2.4 bản Drive (nguyên văn trong prompt lập kế hoạch 14/11/2026; **dự án không dùng Use Case ID**, chỉ gọi bằng tên).
- Nguồn đúng khi lệch nhau: **schema DB (`docs/database/`) để code**; chỗ 2.4, schema, Figma và mã lệch nhau ở mục 3.4, đã hỏi ở mục 4.2. **Không tự chọn bên nào** (AGENTS mục 1.6).
- Thẻ: `[ĐỒNG BỘ TL]` = task phải sửa tài liệu (2.4, `docs/database/*`, Figma) trong **cùng PR**; `[TIỀN ĐỀ]` = việc nền; `[CHỜ Qn]` = chờ câu hỏi Qn; `[CHỜ Trung]` = cần Trung xác nhận; `[ĐỤNG x]` = sửa file thuộc module x (báo người sở hữu: `auth`, `patient`, `booking` là Đại; `admin`, `search`, `doctor` là Trung ⇒ **với scope này, mọi `[ĐỤNG doctor|admin|search|audit]` là file của Trung**; `[ĐỤNG booking]` là file của chính Đại nhưng vẫn ghi để PR không đụng cửa sổ khác); `[ĐỤNG router]` = `router/role-nav.ts`, `router/role-routes.tsx` (dùng chung nhiều module); `[ĐỤNG shared]` = `shared/**`; `[ĐỤNG database]` = `database/entities.ts`, `database/migrations/index.ts`, `app.module.ts`; `[SOẠN TRƯỚC]` = viết được ngay nhưng **chưa merge** khi phụ thuộc chưa có; `[SAU]` = ngoài scope này, ghi để không quên.
- Mỗi task = **một PR** nhỏ, **chỉ backend HOẶC chỉ frontend**, khoảng 3 đến 5 giờ làm; scope commit `doctor` (hạ tầng: `api`/`web`/`db`/`docs`; module khác bị chạm: `search`, `admin`, `audit`, `booking`). Test đặt cạnh mã; mỗi test ghi mã test case ở mục 7.
- `[đề xuất]` = giá trị AI tự đề xuất, chưa chốt; `[cần điền]` = thiếu thông tin, chưa có đề xuất. **Cuối mục 4.3 liệt kê lại cả hai loại.**
- Mã task: `P` nền, `B` backend, `F` frontend, `D` đồng bộ tài liệu, `X` kiểm tay và tổng kết (nếp của `patient`, `search`, `booking`, `doctor`). Task có khoá, giao dịch hay đồng thời gắn mức kiểm **ĐẦY ĐỦ** (đột biến, `test:int` và `test:e2e`, ca đồng thời chạy một mình, EXPLAIN cho câu SQL mới); task web gắn mức **GỌN** (đột biến web đủ bốn loại: kho trình duyệt/URL/log, bấm đúp, tính tiền ở client (ở scope này: đếm ký tự và định dạng ngày), chặn theo trạng thái).
- **Tiền tố mã test case** (đã kiểm bằng script quét toàn bộ `docs/` và `apps/` ngày 14/11/2026: chưa ai dùng): `HSK` ghi hồ sơ khám, `HTK` hoàn thành ca khám, `XHS` xem hồ sơ khám, `DGB` đánh giá bác sĩ, `KDD` kiểm duyệt đánh giá, `DTB` điểm trung bình (đọc cho `search`), `QHK` quyền và phạm vi, `DHK` đồng thời, `IVK` bất biến, `HDK` hợp đồng và cổng, `TDK` thông báo và nhật ký, `BDK` bảo mật dữ liệu sức khoẻ, `MGK` bảng và migration; web: `WHT` hoàn thành (Bác sĩ), `WHS` ghi hồ sơ (Bác sĩ), `WXH` xem hồ sơ (Bệnh nhân), `WDG` đánh giá, `WKD` kiểm duyệt. (`HS`, `HT`, `RV`, `RT`… đã có chủ khác nên không dùng làm tiền tố trần.)

## 1. Phạm vi

**Làm (5 use case của prompt):**
- **HSK (Ghi hồ sơ khám bệnh):** Bác sĩ phụ trách ghi và sửa hồ sơ khám của lịch hẹn **Đã tiếp đón hoặc Hoàn thành** (4 trường: triệu chứng, chẩn đoán sơ bộ, hướng xử lý/lời khuyên là bắt buộc; ngày tái khám dự kiến tuỳ chọn); sửa lại sau Hoàn thành ghi nhật ký `SuaGhiChuKham`; thời điểm cập nhật lần cuối; API ghi + thẻ và hộp ghi/sửa ở trang chi tiết ca khám của Bác sĩ.
- **HTK (Xác nhận hoàn thành ca khám):** `POST` của `doctor` gọi `AppointmentTransitionService.complete` (booking D6) trong giao dịch của `doctor`, ghi thông báo "kết quả khám" cho tài khoản đặt, nút và hộp xác nhận ở trang chi tiết ca khám. **Không bắt buộc có hồ sơ trước** (quyết định 17/10/2026).
- **XHS (Xem hồ sơ khám bệnh):** Bệnh nhân xem hồ sơ của các lịch **Hoàn thành** thuộc tài khoản mình (bản thân và người thân): trang "Hồ sơ khám bệnh" (Figma `414:2`, `415:2`, `443:2`) và thẻ hồ sơ ở chi tiết lịch hẹn (Figma `422:2` đến `425:2`); trạng thái "Chưa có hồ sơ khám" khi chưa có.
- **DGB (Đánh giá bác sĩ):** Bệnh nhân chấm 1 đến 5 sao và viết nhận xét cho lịch Hoàn thành, mỗi lịch một lần; điểm trung bình và số lượt của bác sĩ cập nhật ngay.
- **KDD (Kiểm duyệt đánh giá):** Quản trị viên (cả hai phạm vi) xem danh sách đánh giá trong phạm vi, **ẩn** đánh giá vi phạm với lý do bắt buộc, ghi nhật ký `AnDanhGia`, điểm trung bình tính lại (loại đánh giá ẩn).
- **Nối `search` (task K5 của PLAN `search`):** `DoctorRatingReader` đọc dữ liệu thật (chỉ `bi_an = false`), hợp đồng `danhGia { diemTrungBinh, soDanhGia }` không đổi.
- **Bảng mới:** migration và entity `ho_so_kham`, `danh_gia_bac_si` (chưa có; câu hỏi Q10: ai sở hữu theo admin Q41).

**Không làm (module khác hoặc sau; chỉ nêu cổng ở mục 5.10):** máy trạng thái lịch hẹn, `complete` (thân hàm) và mọi `UPDATE lich_hen` (`booking`; scope này **chỉ gọi**); danh sách lịch hẹn và chi tiết của Bác sĩ (`booking` B5, F11: **chỉ nối** `ghiChuKham` và cờ `coHoSoKham`); trang chi tiết lịch hẹn của Bệnh nhân (`booking` F2: chỉ cắm thẻ hồ sơ và khối đánh giá); **nhắc đánh giá, email "Hoàn thành lịch khám" (Figma `678:2`) và worker gửi thư** (`notification`, chờ scope sau); màn xem nhật ký hành động và **ẩn nội dung nhạy cảm khi xem nhật ký** (`admin`, `[SAU]`); **hiện lại đánh giá đã ẩn** (2.4 không có; mục 4.2 Q8); tab "Đánh giá" công khai của bác sĩ kèm danh sách nhận xét (`search` K5 phần hai, `[SAU]`); đề xuất tái khám bác sĩ → bệnh nhân (`followup`: **đọc** `ngay_tai_kham_du_kien`, scope sau); tin nhắn, Tổng quan, Thông báo (chuông) của Bác sĩ và Bệnh nhân; xoá hồ sơ khám hay xoá/sửa đánh giá (2.4 không có); đơn thuốc và chỉ định cận lâm sàng (2.4 nói rõ **không lưu**); chuỗi đổi lịch (#9, chỉ nêu điểm nối). Không có use case nào của scope này **tải ảnh lên**.

## 2. Hiện trạng repo (đã kiểm ở `cb8bf46`, 14/11/2026)

**API (`apps/api/src/`):**
- `appointments/` (booking, đã xong phần lõi): ma trận trạng thái `state/appointment-state.matrix.ts` (22 ô được phép; **`HoanThanh` chỉ tới từ `DaTiepDon` và chỉ bởi `BacSi`**; đích `HoanThanh` mà không phải `BacSi` ⇒ `ChiBacSiHoanThanh` bất kể nguồn, kể cả Quản trị viên override; **không trạng thái nào đi ra khỏi `HoanThanh`**). `AppointmentTransitionService.complete(em, { lichHenId, bacSiId })` ở `state/complete-appointment.ts` (đã đọc): nhận `em` của người gọi, **không mở giao dịch, không bắt lỗi DB, không ném `AppException`**; khoá `lich_hen` theo khoá chính `FOR UPDATE` (tầng 6); **kiểm sở hữu TRƯỚC trạng thái** (`NotAssigned` gộp "không có" và "của bác sĩ khác"), rồi `InvalidState { trangThai }`, rồi `UPDATE … WHERE trang_thai = 'DaTiepDon'`; **không có điều kiện thời gian** (đọc mã; điều kiện cửa sổ giờ chỉ ở tiếp đón); không đụng `khung_gio`; không thông báo. Điều kiện người gọi ghi ở chú thích đầu file: (1) gọi qua `withBookingTransaction`, thân chạy lại được; (2) **gọi TRƯỚC khi ghi `ho_so_kham`** (ghi trước rồi mới khoá X là tự nâng khoá chia sẻ lên X ⇒ deadlock); (3) `bacSiId` lấy từ access token. `AppointmentsModule` xuất đúng ba thứ: `AppointmentTransitionService`, `AppointmentQueries`, `AppointmentCancellationService`.
- `appointments/lists/doctor-appointment.mapper.ts` và `doctor-appointments.dto.ts` (B5): chi tiết đúng **11 khoá**, `ghiChuKham` **hằng `null`** (kiểu TypeScript `ghiChuKham: null`); dòng danh sách đúng **8 khoá**, không cờ hồ sơ. Câu SQL ở `doctor-appointments.repository.ts` (danh sách trắng cột, không `SELECT *`).
- **Chưa có** entity hay migration `ho_so_kham`, `danh_gia_bac_si` (kiểm bằng `grep` trong `apps/api/src/database/`: hai tên chỉ xuất hiện trong danh sách giá trị ENUM của `nhat_ky_hanh_dong`). 9 migration hiện có, mới nhất `1793534400000-tao-bang-moc-hoan-tien.ts`; `registry.spec.ts` buộc đăng ký đúng thứ tự timestamp; `schema-parity.int-spec.ts` đối chiếu migration với `clinix_mysql.sql`.
- `audit/` (`AuditService.record(manager, entry)`, buộc đang trong giao dịch): `AuditEntry` là union của **16 hành động** (`audit-entry.ts`: `TaoTaiKhoanNhanSu`…`OverrideLichHen`), danh sách trắng **đóng** trong `audit-validation.ts` (hành động khác ⇒ `AUDIT_ACTION_UNSUPPORTED`). **Giá trị ENUM của DB đã có sẵn** `SuaGhiChuKham`, `AnDanhGia` (hanh_dong) và `ho_so_kham`, `danh_gia_bac_si` (loai_doi_tuong) từ migration vận hành `1793090000000` và `1793361600000` ⇒ **không cần migration ENUM**, chỉ cần thêm hai hành động vào `ChangeMap`, `TargetMap` và `validateChanges` (task P2).
- `thong_bao` có `lich_hen_id` và UNIQUE `(lich_hen_id, tai_khoan_id, loai_su_kien)` (`thong_bao_index_lich_hen`); booking có đúng **4 sự kiện** (`LichHenDaXacNhan`, `LichHenDaHuy`, `LichHenVangMat`, `KhoaDatLichNoShow`) và worker thư `EmailOutboxService` **chỉ xử lý bốn loại đó**; `complete` **không thông báo** (chú thích đầu file); `doctor/notifications/leave-notifier.ts` là tiền lệ module `doctor` tự ghi `thong_bao` (không ghi `email_thong_bao`).
- `doctor/` (Trung; phần lịch làm việc đã xong): `doctor.module.ts` import `SchedulingModule`, `RbacModule`, `AuditModule`, `AppointmentsModule`; **`doctor/architecture.spec.ts` PD-19 cấm token `AppointmentTransitionService` ở mọi file của `doctor/`** (hoàn tiền, mời chờ, đổi trạng thái lịch đều nằm trong `cancel` của booking) ⇒ **task P3 phải sửa PD-19 cho thư mục `examination/completion/`** (xem mục 5.10 E8); HD-08 cấm `UPDATE lich_hen`, `UPDATE khung_gio`, `NOW()`, `CURDATE()` ở `doctor/` (scope này không vi phạm).
- `search/ratings/doctor-rating.reader.ts`: **bản tạm** `readMany` trả `{ diemTrungBinh: null, soDanhGia: 0 }` cho mọi id (chú thích: "Task K5 sẽ đổi thân hàm sang một câu `GROUP BY` (chỉ `bi_an = false`) mà không đổi chữ ký"); `public-doctor.service.ts` gọi nó; `doctor-list.rules.ts` lọc `diemTu` và sắp `danhGiaCao` **trong bộ nhớ** theo giá trị reader trả (PLAN `search` Q16: chỉ `bi_an = false`, làm tròn 1 chữ số thập phân, chuỗi `"4.3"`, 0 lượt ⇒ `null`).
- Các cổng đã dùng: `withBookingTransaction` (`appointments/locking/booking-transaction.ts`: `READ COMMITTED`, thử lại ≤ 2 cho 1213 và 1205, `innodb_lock_wait_timeout` = 3 giây), `ParseAppointmentCodePipe`, `@Roles`, `@RequireAdminScope('Any')`, `@AdminScopeCtx`, `BranchAccessPolicy` (`branchFilter`, `assertCanSee`: ngoài phạm vi ⇒ 404), `ParseRecordIdPipe` (`doctor/common/`), `nowVN`, `toSecond`, `isDuplicateKeyError`. `ValidationPipe` toàn cục (`app.setup.ts`): `whitelist`, `forbidNonWhitelisted`, `transform`, `validationError: { target: false, value: false }` (**đã đọc: lỗi không mang giá trị người dùng gửi**; hành vi với `null`/chuỗi dài/mảng: chưa đo, M9).
- Test: `AdminFixtures`, `appointments/testing/*` (`concurrency-harness.ts`, `invariants.ts`, `lock-chain.ts`, `booking-flow.ts`), `database/testing/test-database.ts` (MySQL thật, DB `*_test`, tuần tự), `apps/api/test/*.e2e-spec.ts`, `appointments/testing/response-keys.ts` (danh sách khoá cấm theo vai trò).

**Web (`apps/web/src/`):**
- **Trang chi tiết ca khám của Bác sĩ** (booking F11, 14/11/2026): `features/booking/appointments/doctor/detail/doctor-detail-page.tsx` (chú thích: chỗ thêm nút `Hoàn thành ca khám`, `Ghi hồ sơ khám`, `Chỉnh sửa ghi chú` là cột phải của hàng tiêu đề và thẻ `RecordCard`); `record-card.tsx` chỉ **một câu** theo trạng thái (`detail-messages.ts`: bốn câu `RECORD_*`); bộ đọc `api/doctor-appointment-detail-api.ts` nhận **đúng `null`** cho `ghiChuKham` (khác `null` ⇒ `unusableResponse`: **phải sửa MỘT chỗ khi API đổi**); danh sách `doctor-table.tsx` **không** nhãn con "Đã có hồ sơ khám"/"Chưa ghi hồ sơ" (Figma `457:2`).
- **Trang chi tiết lịch hẹn của Bệnh nhân** (booking F2): `features/booking/appointments/patient/detail/detail-info.tsx` có thẻ "Hồ sơ khám bệnh" chữ tĩnh ("Hồ sơ khám bệnh sẽ xuất hiện khi bác sĩ hoàn tất và ghi chú buổi khám."); **bỏ** khối "Đánh giá bác sĩ" của Figma (ghi ở TRACKING booking F2-F).
- **`features/booking/architecture.test.ts` (BWZ-08)** khoá: mọi file của `features/booking/` chỉ import trong chính booking, `shared/`, `features/auth` và `features/admin` **qua `index.ts`**; ca đối chứng khẳng định `../../../doctor` bị cấm ⇒ cắm giao diện `doctor` vào trang của booking cần đổi luật: **Đại đã duyệt ngày 14/11/2026 (Q20, Phương án C; mục 5.13)**, đúng tiền lệ F10 (`admin`, Đại duyệt 13/11/2026).
- Khung Bác sĩ (`DoctorLayout`, `DOCTOR_NAV`: "Lịch hẹn" và "Lịch làm việc" có `to`; "Tổng quan", "Tin nhắn", "Thông báo", "Thông tin cá nhân" vô hiệu); `features/doctor/index.ts` là bề mặt công khai duy nhất của `features/doctor` (router chỉ import từ đó). **`PATIENT_NAV` có mục "Hồ sơ khám bệnh" vô hiệu** (không `to`); **`MENU_GROUPS` của `features/admin/components/admin-sidebar.tsx` có "Kiểm duyệt đánh giá" (biểu tượng `reviews`) chưa có `to`**, không `systemOnly` (cả hai phạm vi thấy). Admin: `AdminScopeGuard` và `useAdminScope` có sẵn ở `features/admin` (xuất qua `index.ts` từ doctor F6).
- `shared/api/client.ts` (một lớp API client duy nhất, timeout 15 giây), `shared/hooks/use-remote.ts`, `use-modal-dialog.ts`, `shared/routes/booking-paths.ts` (`PATIENT_APPOINTMENTS_PATH`, `DOCTOR_APPOINTMENTS_PATH`, hàm dựng đường dẫn chi tiết), `shared/ui` (`empty-state`, `error-state`, `loading-state`, `offline-banner`).

**Figma** (file `1OsOfwD5myNNRv7FPCD9YC`, trang `63:2`; đọc 14/11/2026 từ siêu dữ liệu toàn trang): xem mục 4.4; **ghi chú: chữ trong siêu dữ liệu bị cắt ở khoảng 50 ký tự**, các câu dài (lời nhắc, chú thích) chưa đọc đủ.

## 3. Phân tích ảnh hưởng

### 3.1 Bảng/cột scope này chạm tới (đọc từ `docs/database/clinix_mysql.sql`, bản 27/10/2026 + ghi chú đã cập nhật)

| Bảng | Cột / ràng buộc quan trọng | Scope này làm gì |
|---|---|---|
| `ho_so_kham` | `ho_so_kham_id` PK AUTO_INCREMENT; `lich_hen_id` **UNIQUE NOT NULL**, FK → `lich_hen`; `trieu_chung`, `chan_doan_so_bo`, `huong_xu_ly` `text` **NULL được** (DB cho NULL; **bắt buộc có nội dung chỉ ở service**); `ngay_tai_kham_du_kien` `date` NULL; `cap_nhat_lan_cuoi` `datetime` **NOT NULL, không mặc định**; **không có cột người ghi** (người ghi luôn là bác sĩ của lịch) | **Sở hữu** (migration + entity, P1); `INSERT`/`UPDATE` (HSK); đọc (B5, Bệnh nhân) |
| `danh_gia_bac_si` | `danh_gia_bac_si_id` PK; `lich_hen_id` **UNIQUE NOT NULL**, FK → `lich_hen`; `so_sao` tinyint NOT NULL, CHECK `chk_danh_gia_so_sao` 1 đến 5; `nhan_xet` text NULL; `bi_an` boolean NOT NULL mặc định false; `ly_do_an` varchar(255) NULL, CHECK `chk_danh_gia_an` (`bi_an = 0` ⇒ `ly_do_an` NULL; `bi_an = 1` ⇒ `ly_do_an` NOT NULL); `thoi_diem_tao` datetime NOT NULL. **Không có** `bac_si_id`, `benh_nhan_id` (suy qua `lich_hen`), **không có** `thoi_diem_an`, `nguoi_an` (nằm trong `nhat_ky_hanh_dong`) | **Sở hữu** (migration + entity, P1); `INSERT` (DGB); `UPDATE bi_an, ly_do_an` (KDD); đọc (`search`, Admin, Bệnh nhân) |
| `lich_hen` | `lich_hen_id`, `ma_lich_hen`, `bac_si_id`, `benh_nhan_id` (tài khoản ĐẶT = chủ sở hữu), `ho_so_nguoi_than_id` (NULL = bản thân; FK kép buộc cùng chủ), `chi_nhanh_id` (**snapshot lúc đặt**), `thoi_gian`, `trang_thai` | **Khoá `FOR UPDATE` theo khoá chính** (HSK; tầng 6) và đọc; **KHÔNG BAO GIỜ `UPDATE`** (HD-08, AR-01): `HoanThanh` chỉ qua `complete` |
| `bac_si`, `tai_khoan`, `ho_so_nguoi_than`, `chuyen_khoa`, `dich_vu_kham`, `chi_nhanh` | tên, chức danh, quan hệ, tên dịch vụ, tên chi nhánh | Đọc (hiển thị) |
| `thong_bao` | `tai_khoan_id`, `noi_dung` ≤ 500, `loai_su_kien` ≤ 100, `lich_hen_id` (FK), UNIQUE `(lich_hen_id, tai_khoan_id, loai_su_kien)`, `trang_thai_doc` | **Ghi** một dòng `LichHenHoanThanh` trong giao dịch của HTK (Q17) |
| `email_thong_bao` | một dòng `ChoGui` cho mỗi `thong_bao` mà **worker booking chỉ gửi bốn loại của booking** | **Không ghi** (`[CHỜ notification]`; mẫu thư Figma `678:2` đã có) |
| `nhat_ky_hanh_dong` | `hanh_dong` ENUM đã có `SuaGhiChuKham`, `AnDanhGia`; `loai_doi_tuong` đã có `ho_so_kham`, `danh_gia_bac_si`; `chi_nhanh_id` (để Admin chi nhánh lọc), `ma_doi_tuong`, `ket_qua`, `chi_tiet_thay_doi` json | **Ghi** qua `AuditService` sau khi mở rộng `audit-entry.ts` (P2) |
| `khung_gio`, `lich_lam_viec`, `yeu_cau_nghi_phep` | — | **Không đụng** (HTK không đổi khung giờ: vẫn `DaDat`; B5 chỉ đọc `ca` như đã có) |

### 3.2 Bảng ngoài danh sách prompt đã mở thêm (và lý do)

- `ho_so_nguoi_than`, `tai_khoan`: tên người khám, tên người đánh giá (đọc), `trang_thai_hieu_luc` (hồ sơ ngừng dùng vẫn xem được lịch sử: Q18).
- `thong_bao`: HTK ghi một dòng (prompt chỉ nêu để hiểu hợp đồng).
- `quan_tri_vien`: phạm vi Quản trị viên qua `AdminScopeCtx` (không đọc trực tiếp).

### 3.3 API/hành vi đã có hoặc đã chốt bị chạm tới

| Module / thành phần | Điểm chạm | Cách xử lý (không phá thiết kế đã chốt) |
|---|---|---|
| `booking` D6 / B11 — `complete` | Gọi `AppointmentTransitionService.complete` từ `doctor` | Đúng hợp đồng đã đọc ở mục 2; thứ tự khoá và điều kiện người gọi ở 5.3 và 5.4; **sửa PD-19** của `doctor/architecture.spec.ts` (`[ĐỤNG doctor]`) để cho phép đúng thư mục `examination/completion/`; AR-07 của booking đã cho phép `complete` |
| `booking` B5 — danh sách và chi tiết Bác sĩ | `ghiChuKham` hằng `null`; không cờ hồ sơ | **Task B3 `[ĐỤNG booking]`**: `LEFT JOIN ho_so_kham` ở MỘT chỗ (câu chi tiết) và một cờ `coHoSoKham` ở danh sách; cập nhật DTO, mapper, `response-keys.ts`, DSB-06/08; **web F2 (bộ đọc) merge TRƯỚC B3** (mục 3.5 H6) |
| `booking` F11 — trang chi tiết/danh sách Bác sĩ | Chỗ chừa cho nút và hộp | F1, F2, F3, F4 `[ĐỤNG booking]` ở `doctor-detail-page.tsx`, `record-card.tsx`, `detail-messages.ts`, `doctor-table.tsx`, bộ đọc; **luật BWZ-08 đổi theo Q20 (Phương án C, Đại duyệt 14/11/2026)** |
| `booking` F2 — chi tiết lịch hẹn Bệnh nhân | Thẻ hồ sơ tĩnh; khối đánh giá bị bỏ | F6 `[ĐỤNG booking]` cắm thẻ hồ sơ thật và khối đánh giá; **B2 (API chi tiết Bệnh nhân, 16 khoá) KHÔNG đổi** (Q21 chọn endpoint riêng) |
| `booking` 5.3 — thứ tự khoá | Chưa có `ho_so_kham`, `danh_gia_bac_si` | Thêm **tầng 6b** (sau `lich_hen`, trước tầng 7) ở `locking/lock-order.ts` và `lock-order.spec.ts` (P2, `[ĐỤNG booking]`); `LockTierId` thêm `'6b'`; PLAN booking 5.3 sửa ở D2 |
| `audit` — whitelist đóng | `SuaGhiChuKham`, `AnDanhGia` chưa có trong `ChangeMap`, `TargetMap`, `validateChanges` | P2 `[ĐỤNG audit]` (Trung): thêm hai hành động; **không** migration ENUM (đã có); mỗi hành động một dòng ở `TargetMap` (đúng ý định "bảng tra theo hành động") |
| `search` — `DoctorRatingReader` | Bản tạm `{null, 0}` | B9 `[ĐỤNG search]` (Trung): đổi thân hàm, **giữ chữ ký**; TBS-14 phải cập nhật (đang khẳng định `{null, 0}` mà không có DB) |
| `admin` — sidebar, `AdminScopeGuard` | "Kiểm duyệt đánh giá" chưa có `to` | F7 `[ĐỤNG admin]`: một dòng `to` ở `admin-sidebar.tsx`; route bọc `AdminScopeGuard` (đã xuất qua `features/admin/index.ts`) |
| `admin` Q41 — chủ migration bảng nền | `ho_so_kham`, `danh_gia_bac_si` chưa ai tạo | **Tiền lệ doctor P1** (`yeu_cau_nghi_phep`: module nào làm use case sở hữu migration + entity) ⇒ scope này làm P1; **hỏi Trung (Q10)** |
| `patient` — `PATIENT_NAV`, khung Bệnh nhân | "Hồ sơ khám bệnh" vô hiệu | F5 `[ĐỤNG router]`: đặt `to` ở `router/role-nav.ts`, thêm route ở `router/role-routes.tsx`; sửa số mục vô hiệu ở `role-routes.test.tsx` (PL-01) và `reception-profile-routing.test.tsx` nếu cần (như F1, F8, F11 đã làm) |
| `router/*`, `features/doctor/index.ts` | Thêm route, xuất component | Ghi từng dòng sửa ở từng task; **một dòng `export * from './examination'`** ở `features/doctor/index.ts` (F1) để các task sau không sửa lại file Trung đang sửa (mục 6.7) |
| `database/entities.ts`, `database/migrations/index.ts` | Đăng ký entity, migration | Mỗi migration mới có **timestamp lớn hơn mọi migration đã merge lúc viết** (`git fetch` rồi xem `migrations/index.ts`); booking B16a, B18 đang làm có thể thêm migration (chưa kiểm) |

### 3.4 Chỗ 2.4, schema, Figma và mã lệch hoặc mơ hồ — **nêu rõ, chưa chọn bên nào** (đề xuất ở cột "Hỏi")

| # | Lệch / mơ hồ | Ghi chú | Hỏi |
|---|---|---|---|
| L1 | **DGB b4 "nhập nhận xét (nếu có)"** ↔ Figma `423:2`: ô **"Nhận xét *" bắt buộc**, gợi ý "tối thiểu 10 ký tự", bộ đếm "0/1000"; schema `nhan_xet` NULL được | 2.4 và schema cho nhận xét tuỳ chọn; Figma bắt buộc. Cũng chưa rõ giới hạn trên (Figma 1000, DB `text`) | Q7 |
| L2 | **KDD b3 "lý do ẩn (bắt buộc)"** ↔ Figma `571:2` "Lý do ẩn *" "(tối thiểu 10 ký tự)" ↔ DB `ly_do_an` `varchar(255)` | 2.4 không nêu độ dài tối thiểu | Q8 |
| L3 | **HSK b6 "Audit Log: nội dung trước/sau"** ↔ quy ước booking B14 (nhật ký override "không tên, SĐT, email bệnh nhân") ↔ dữ liệu SỨC KHOẺ vào cột JSON `chi_tiet_thay_doi` mà Admin (có `@RequireAdminScope`) có thể đọc qua màn nhật ký sau này | Lưu đúng "nội dung trước/sau" thì triệu chứng và chẩn đoán nằm trong nhật ký. Đề xuất: chỉ lưu **các trường có đổi** và che khi hiển thị `[SAU]` | Q15 |
| L4 | **HSK MT "mỗi lần sửa được ghi vào Audit Log"** ↔ b6 và HĐK "nếu đây là lần sửa lại **sau khi lịch hẹn đã Hoàn thành**" | Sửa khi lịch còn `DaTiepDon` (bệnh nhân chưa thấy) có ghi nhật ký không? Ghi lần đầu sau Hoàn thành có ghi không (là "ghi", không phải "sửa")? | Q3 |
| L5 | **HSK A2 / HTK A1 "thông báo lý do"** ↔ booking `complete` (`NotAssigned` gộp "không có" và "của bác sĩ khác" ⇒ 404 cùng thân) ↔ admin Q40 (ngoài phạm vi ⇒ 404) ↔ doctor Q13 (XLV A2 có tiền lệ 403) | Mã lịch hẹn không công khai; 404 cùng thân không lộ lịch của bác sĩ khác. Đề xuất: 404 `KHONG_TIM_THAY` cùng thân; trạng thái sai ⇒ 409 kèm mã và trạng thái | Q23 |
| L6 | **XHS A1 "không tìm thấy lịch hẹn Hoàn thành nào có ghi chú khám"** ↔ b2 và A2 (danh sách gồm cả ca **chưa có** ghi chú, kèm tình trạng) | Hai chỗ trong cùng use case không khớp: danh sách rỗng khi không có lịch Hoàn thành nào (đề xuất), không phải khi không có ghi chú | Q6 |
| L7 | **Figma Bác sĩ `459:2`–`461:2`** chỉ có trạng thái "Đã tiếp đón" **chưa có hồ sơ**; thiếu frame "Đã tiếp đón **đã có hồ sơ**" (cần nút `Chỉnh sửa ghi chú` và `Hoàn thành ca khám` cùng lúc); không frame nào cho lỗi (thiếu trường, 409 sửa chồng, mất mạng), đang tải, bộ đếm ký tự, lịch Vắng mặt | Mục 4.5 | D2 |
| L8 | **Figma Bệnh nhân `422:2`–`425:2`**: có "Đánh giá ngay", form, "Đã đánh giá"; **thiếu** frame "đánh giá bị ẩn" (Bệnh nhân có thấy không?), lỗi `DA_DANH_GIA`, đang gửi, nhãn các mức sao ngoài "Xuất sắc" | Q19 | D2 |
| L9 | **Figma Admin `514:2`, `570:2`, `571:2`, `633:2`**: cột "Bệnh nhân" **thiếu tên ở một số hàng** (dữ liệu mẫu hỏng); ô tìm "Tên bệnh nhân hoặc nội dung"; tên hiển thị là người ĐẶT hay người KHÁM (hồ sơ người thân)? | `[cần điền]` | Q8 |
| L10 | **KDD TĐK "đánh giá thuộc phạm vi quản trị"** ↔ schema (đánh giá không có chi nhánh) | Phạm vi suy qua `lich_hen.chi_nhanh_id` (snapshot lúc đặt, bất biến) hay chi nhánh HIỆN TẠI của bác sĩ? Đề xuất snapshot của lịch (cùng cách booking B4) | Q8 |
| L11 | **Mã lịch hẹn Figma `CP2026…`** ↔ mã thật `CLX-yyyyMMdd-xxxxx` (booking đã ghi nhận) và Email Preview `678:2` dùng `CLX-` | Chỉ nhắc; không đổi | — |
| L12 | **HTK HĐK "gửi thông báo kết quả khám"** ↔ booking 5.12 không có sự kiện hoàn thành ↔ worker thư chỉ bốn loại ↔ Figma có mẫu thư `678:2` | Thông báo trong ứng dụng làm được ngay; thư `[CHỜ notification]` | Q17 |
| L13 | **HSK MT "Có thể sửa lại bất kỳ lúc nào sau khi Hoàn thành"** | Không giới hạn thời gian sửa (dữ liệu y tế có thể bị sửa vô thời hạn); chỉ có nhật ký | Q3 |
| L14 | **Quyết định 17/10/2026 (hồ sơ độc lập với Hoàn thành)** ↔ Admin override đưa lịch `DaTiepDon` về `DaXacNhan`/`VangMat`/`DaHuy` (Q24 booking) khi **đã có hồ sơ**: dòng `ho_so_kham` còn mà lịch không còn Đã tiếp đón/Hoàn thành | Không có use case xoá hồ sơ. Đề xuất: giữ dòng, **ẩn** (chỉ trả khi lịch ở `DaTiepDon` hoặc `HoanThanh`) | Q16 |
| L15 | **Ngày tái khám dự kiến** (không bắt buộc) ↔ chưa có quy tắc miền giá trị | Đề xuất: từ ngày khám đến +365 ngày | Q2 |

### 3.5 Bẫy/rủi ro (xử lý trong task)

- **H1 — Thứ tự khoá `ho_so_kham` ↔ `lich_hen` (deadlock tự nâng khoá):** `INSERT` vào bảng có khoá ngoại tới `lich_hen` xin khoá chia sẻ trên hàng cha; nếu sau đó giao dịch xin X trên cùng hàng (ví dụ `complete`) thì hai giao dịch cùng ca deadlock (chú thích đầu `complete-appointment.ts`). **Luật cho scope này:** mọi luồng ghi **khoá `lich_hen` `FOR UPDATE` theo khoá chính TRƯỚC** mọi `INSERT`/`UPDATE` `ho_so_kham`/`thong_bao`/`nhat_ky_hanh_dong` (5.3).
- **H2 — So sánh "không đổi" bằng SQL sai do collation:** cột `utf8mb4_unicode_ci` coi `a`, `A`, `á` bằng nhau; phát hiện "hồ sơ không thay đổi" (HSK-12) **phải so ở ứng dụng bằng `===` trên chuỗi đã chuẩn hoá**, không bằng `WHERE col = ?` hay `ON DUPLICATE KEY`. Chưa đo (M10).
- **H3 — Dữ liệu sức khoẻ lộ ra ngoài DB:** nhật ký ứng dụng (log), URL/query, `localStorage`/`location.state`, thông báo và thư, nhật ký hành động, bộ nhớ đệm trình duyệt/proxy, lỗi 400 lặp lại giá trị. Xử lý: BDK-01…BDK-09 (mục 7.13); `Cache-Control: no-store` trên mọi route mới; DTO lỗi không mang giá trị (đã đọc `app.setup.ts`).
- **H4 — PD-19 của `doctor/architecture.spec.ts` cấm `AppointmentTransitionService`** ở mọi file của `doctor/`: gọi `complete` làm test này đỏ. Sửa có điều kiện (chỉ thư mục `examination/completion/`, chỉ phương thức `complete`), kèm ca đột biến chứng minh luật vẫn bắt được chỗ khác (P3).
- **H5 — BWZ-08 chặn import chéo `features/`:** cắm giao diện `doctor` vào trang của booking: **đã chọn đổi luật (Q20, Phương án C, Đại duyệt 14/11/2026)**, booking import `doctor` chỉ qua `index.ts`; không dùng "chỗ cắm" qua router (Phương án A, không chọn). Không được `import` chui (đi sâu vào file của `doctor`).
- **H6 — Hợp đồng `ghiChuKham: null` nằm ở nhiều chỗ:** DTO/mapper B5, kiểu `DoctorAppointmentDetail`, bộ đọc web F11 (`!== null ⇒ unusableResponse`), ca DSB-08 và DAD-02, DAD-08. Đổi một lượt theo thứ tự **F2 (bộ đọc nhận object) → B3 (API trả object) → F3 (hộp ghi)**; B2 (API ghi) có thể merge trước F2 vì chưa có giao diện ghi, nhưng **không được có dòng `ho_so_kham` thật** trên môi trường đã chạy F11 cho tới khi F2 merge (dữ liệu mẫu chỉ ở B10 và sau F2).
- **H7 — Điểm trung bình tính khi đọc có thể chậm:** `GROUP BY` qua `lich_hen` cho danh sách bác sĩ công khai (trang đầu của hệ thống). Nếu chậm ở 100.000 lịch, phương án dự phòng thêm cột/chỉ mục là **đổi schema** (ba file `docs/database/*`): chỉ làm sau khi đo (M6) và hỏi nhóm (Q9).
- **H8 — `HoanThanh` là trạng thái cuối:** không luồng nào đi ra (ma trận), nên kiểm "lịch đã Hoàn thành" ở DGB không cần khoá `lich_hen`; **nhưng** kiểm lại sở hữu và trạng thái phải **trong câu `INSERT … SELECT` hoặc sau khoá** để không dựa vào bản đọc cũ (5.7).
- **H9 — Ngày/giờ:** `cap_nhat_lan_cuoi`, `thoi_diem_tao` ghi `toSecond(nowVN())` (không `NOW()`: HD-08, H8 của booking); `ngay_tai_kham_du_kien` (`DATE`) đọc bằng `DATE_FORMAT(…, '%Y-%m-%d')` (booking M4); gom theo tháng bằng **khoảng nửa mở trên `thoi_gian`**, không bọc `MONTH()`/`DATE()` quanh cột (booking AR-05).
- **H10 — Lễ tân và Quản trị viên KHÔNG đọc nội dung hồ sơ khám** (dữ liệu sức khoẻ; booking H10): không route nào của họ trả nội dung; thêm hằng `HEALTH_RECORD_KEY` ở `appointments/testing/response-keys.ts` để e2e của hai vai trò đó cấm các khoá `trieuChung`, `chanDoanSoBo`, `huongXuLy`, `ghiChuKham` (QHK-08, BDK-06).
- **H11 — Điểm trung bình và `AuditError` mang dữ liệu:** `AuditService` đã bỏ `cause` của driver; **không** đưa nội dung hồ sơ vào thông điệp lỗi ném ra; `validateAuditEntry` ném `AUDIT_ENTRY_INVALID` không kèm giá trị (đã đọc).
- **H12 — Nhận xét đánh giá là văn bản tự do của người dùng, hiển thị cho Admin (và công khai `[SAU]`):** Figma có mẫu nội dung spam ("Click vào đây nhận ngay iPhone…") và lăng mạ; React escape mặc định, **không** `dangerouslySetInnerHTML`; không biến thành liên kết (WKD-10).
- **H13 — Hai PR migration/entity cùng lúc** (P1 của scope này, booking B16a/B18 nếu có migration): **merge theo thứ tự timestamp** (nếp H15 của doctor); `registry.spec.ts` báo sai thứ tự.
- **H14 — Bác sĩ phụ trách ≠ bác sĩ hiện tại của hồ sơ:** `lich_hen.bac_si_id` bất biến sau khi chèn; bác sĩ đổi chi nhánh/ngừng hoạt động **không** đổi quyền ghi hồ sơ của lịch cũ (kiểm bằng `bac_si_id` của lịch, không bằng chi nhánh hiện tại). Bác sĩ **bị khoá tài khoản** thì guard toàn cục đã chặn (đọc DB mỗi request).

## 4. Câu hỏi và quyết định

### 4.1 Đã chốt ở module khác (kế thừa — **không bàn lại**)

- **Hồ sơ khám độc lập với Hoàn thành** (quyết định 17/10/2026; `clinix_mysql.sql` ghi chú `ho_so_kham`, quy tắc nghiệp vụ số 9): không cần có hồ sơ trước khi Hoàn thành; ghi trước hay sau Hoàn thành đều được; chưa có thì Bệnh nhân thấy "Chưa có hồ sơ khám", **không tạo nội dung giả**.
- **booking Q21, Q22, Q24:** `HoanThanh` chỉ Bác sĩ chuyển, từ `DaTiepDon`; Quản trị viên override **không** tới được `HoanThanh`; mọi nơi khác ngoài `complete` không được `UPDATE lich_hen` (AR-01, AR-06, AR-07).
- **booking Q33, L25, H10:** Bác sĩ chỉ thấy lịch của chính mình (`bac_si_id` từ token, `bacSiId` ở query bị bỏ qua); mọi 404 cùng một thân; `Cache-Control: no-store`; không đưa dữ liệu cá nhân vào log; "Ghi chú khám lấy từ `ho_so_kham` `[CHỜ doctor]`".
- **search Q16:** điểm trung bình chỉ tính `bi_an = false`, làm tròn 1 chữ số (chuỗi `"4.3"`), 0 lượt ⇒ `null`; hợp đồng `danhGia { diemTrungBinh, soDanhGia }` không đổi (K5 chỉ đổi phần đọc).
- **admin Q40:** tài nguyên ngoài phạm vi Quản trị viên ⇒ 404 cùng thân với không tồn tại; **admin Q41:** Admin sở hữu migration các bảng nền (tiền lệ ngoại lệ: doctor P1 `yeu_cau_nghi_phep`).
- **doctor Q34, Q33:** whitelist đóng của nhật ký, mỗi hành động mới là một dòng ở `TargetMap`; thông báo trong ứng dụng do chính module ghi, email chờ `notification`.
- **auth/patient:** vai trò đọc từ DB mỗi request; chủ sở hữu chỉ lấy từ access token (`@CurrentUser`); mã lỗi ổn định cho từng nhánh, không 500 cho lỗi UNIQUE/FK đã lường trước; giờ nghiệp vụ theo giờ Việt Nam (`nowVN()`, `toSecond`).
- **patient Q22:** trạng thái chưa có frame Figma (rỗng, lỗi, đang tải, mất mạng) làm theo nếp đã có và ghi ở mục 4.5.

### 4.2 Câu hỏi gộp và đề xuất (**mới trả lời Q20 và phần Iteration của Q13, ghi nhận Q10 và Q11 (14/11/2026, Đại); các câu còn lại chưa trả lời**; ★ = nên chốt trước khi bắt đầu cụm 1; người trả lời: Đại và nhóm; câu chạm file của Trung ghi `[CHỜ Trung]`)

| # | Câu hỏi | Đề xuất | Hệ quả / task |
|---|---|---|---|
| Q1★ **(a)** | Tên module, thư mục kế hoạch, thư mục mã mới trong `doctor` | Tên commitlint **`doctor`** (đúng scope-enum; `feat(search)` cho K5, `feat(db)` cho P1, `feat(docs)`… như quy ước); kế hoạch ở **`docs/features/doctor-exam/`**; mã API ở **`apps/api/src/doctor/examination/`** (module Nest riêng `ExaminationModule`, nhập vào `DoctorModule` bằng MỘT dòng); mã web ở **`apps/web/src/features/doctor/examination/`**; entity cạnh `yeu-cau-nghi-phep.entity.ts` ở `doctor/entities/` | Mọi task; giữ `doctor.module.ts` và `features/doctor/index.ts` gần như nguyên (mục 6.7) |
| Q2★ **(b1)** | Hồ sơ khám: trường tối thiểu, độ dài, ngày tái khám, chuẩn hoá | 4 trường đúng 2.4: `trieuChung`, `chanDoanSoBo`, `huongXuLy` **bắt buộc** (sau `trim` không rỗng), `ngayTaiKhamDuKien` tuỳ chọn. Độ dài **1 đến 2.000** đơn vị UTF-16 mỗi trường `[đề xuất]` (DB `text` 65.535 byte; Figma `460:2` không có bộ đếm: D2). Ngày tái khám: `YYYY-MM-DD` có thật, **không trước ngày khám** (`DATE(lich_hen.thoi_gian)`) và **không quá 365 ngày sau** `[đề xuất]` (L15). Chuẩn hoá: `trim`, `CRLF` ⇒ `LF`, bỏ ký tự điều khiển trừ xuống dòng và tab; giữ xuống dòng. **Không** lưu đơn thuốc, chỉ định cận lâm sàng (2.4) | HSK-05…HSK-08, HSK-16; B2, F3 |
| Q3★ **(b2)** | Sửa sau Hoàn thành; nhật ký; sửa chồng; không đổi | (i) Sửa **không giới hạn thời gian** sau Hoàn thành (2.4 "bất kỳ lúc nào"). (ii) **Ghi nhật ký `SuaGhiChuKham` khi và chỉ khi** lịch đang `HoanThanh` **và đã có dòng hồ sơ** (đây là "sửa lại sau khi Hoàn thành"); ghi **lần đầu** (kể cả sau Hoàn thành) và sửa khi còn `DaTiepDon` (Bệnh nhân chưa thấy) **không** ghi nhật ký (L4: nêu rõ để nhóm xác nhận). (iii) **Sửa chồng:** thân yêu cầu mang `capNhatLanCuoi` đã thấy (`null` = chưa thấy hồ sơ); lệch ⇒ 409 `HO_SO_KHAM_DA_THAY_DOI`, giao diện tải lại. (iv) Gửi y hệt nội dung hiện có (so ở ứng dụng, H2) ⇒ 200, **không** ghi nhật ký, **không** đổi `cap_nhat_lan_cuoi` | HSK-01…HSK-04, HSK-12, HSK-13; B2 |
| Q4★ **(b3)** | Ai được ghi, ai được xem hồ sơ | **Ghi và sửa:** chỉ Bác sĩ phụ trách của lịch (`lich_hen.bac_si_id` = token), lịch `DaTiepDon` hoặc `HoanThanh`. **Đọc nội dung:** Bác sĩ phụ trách (khi lịch `DaTiepDon`/`HoanThanh`) và Bệnh nhân chủ sở hữu (`lich_hen.benh_nhan_id` = token, **chỉ khi `HoanThanh`**). **Lễ tân: KHÔNG** (dữ liệu sức khoẻ; khớp H10 và 2.4 không giao). **Quản trị viên: KHÔNG** đọc nội dung (nhật ký `SuaGhiChuKham` có nội dung: Q15). Không ai xoá được | QHK-01…QHK-12; mục 5.10 E4 |
| Q5★ **(c)** | Hoàn thành ca khám: điều kiện, nút ở đâu | Route riêng của `doctor`: `POST /doctor/appointments/:maLichHen/complete`, thân rỗng; **điều kiện duy nhất** là của `complete` (đúng bác sĩ, đang `DaTiepDon`; **không điều kiện thời gian**, đã đọc mã) và **không** cần hồ sơ. Nút `Hoàn thành ca khám` + hộp "Xác nhận hoàn thành?" (Figma `459:2`, `461:2`) đặt ở **trang chi tiết ca khám của booking F11** (cột phải hàng tiêu đề), giao diện do `features/doctor/examination` làm và cắm vào (Q20). **Không** đặt nút ở danh sách | HTK-01…HTK-12; B1, F1 |
| Q6★ **(d)** | Hồ sơ độc lập với Hoàn thành: hệ quả giao diện | (1) Thẻ "Hồ sơ khám bệnh" của Bác sĩ có **ba trạng thái theo cặp (trạng thái lịch, có hồ sơ)**: `DaTiepDon` chưa có ⇒ "Chưa ghi hồ sơ khám. Có thể ghi hồ sơ trước hoặc sau khi hoàn thành ca." + `Ghi hồ sơ khám`; `DaTiepDon` đã có ⇒ nội dung + `Chỉnh sửa ghi chú` (**Figma thiếu frame này**); `HoanThanh` chưa có ⇒ "Ca khám đã hoàn thành nhưng chưa có hồ sơ khám." + `Ghi hồ sơ khám`; `HoanThanh` đã có ⇒ nội dung + `Chỉnh sửa ghi chú`. (2) Nút `Hoàn thành ca khám` **không phụ thuộc** hồ sơ (không vô hiệu khi chưa có hồ sơ). (3) Bệnh nhân: lịch `HoanThanh` chưa có hồ sơ ⇒ "Chưa có hồ sơ khám" (trạng thái rỗng, không nội dung bịa); danh sách "Hồ sơ khám bệnh" liệt kê **mọi lịch Hoàn thành** kèm nhãn "Đã có hồ sơ"/"Chưa có hồ sơ" (L6: danh sách rỗng chỉ khi không có lịch Hoàn thành nào). (4) Danh sách Bác sĩ: nhãn con "Đã có hồ sơ khám"/"Chưa ghi hồ sơ" dưới chip `Hoàn thành` (Figma `457:2`) theo cờ `coHoSoKham` | HSK-14, XHS-02, WHS-01, WXH-05; B3, F2, F4, F5 |
| Q7★ **(e)** | Đánh giá: ai, khi nào, sửa/xoá, nhận xét | **Ai:** Bệnh nhân là chủ sở hữu lịch (`lich_hen.benh_nhan_id` = token; gồm lịch của hồ sơ người thân do mình quản lý). **Khi nào:** lịch `HoanThanh`, **không giới hạn thời hạn** sau đó `[đề xuất]`, **một lần mỗi lịch** (UNIQUE). **Không sửa, không xoá** (2.4 không có; ẩn là việc của Admin). **Số sao** 1 đến 5 bắt buộc (nguyên). **Nhận xét: tuỳ chọn** theo 2.4 và schema, tối đa **1.000** đơn vị UTF-16 (khớp bộ đếm Figma), chỉ khoảng trắng ⇒ lưu NULL; **Figma `423:2` đang bắt buộc và tối thiểu 10 ký tự: lệch L1, nhóm sửa Figma hoặc đổi 2.4** (AGENTS mục 1.6: không tự chọn) | DGB-01…DGB-15, WDG-*; B6, F6 |
| Q8★ **(f)** | Kiểm duyệt: ẩn, hiện lại, lý do, nhật ký, phạm vi, tên hiển thị | **Chỉ ẩn, KHÔNG hiện lại** (2.4 không có; Figma hàng đã ẩn chỉ có nút `Xem`); hiện lại là `[SAU]` (cần giá trị `HienDanhGia` ở ENUM nhật ký ⇒ đổi schema). **Lý do ẩn:** bắt buộc, `trim`, **10 đến 255** đơn vị UTF-16 (Figma `571:2` "tối thiểu 10"; 2.4 chỉ "bắt buộc", DB 255: L2). **Nhật ký:** `AnDanhGia` cùng giao dịch, `branchId` = `lich_hen.chi_nhanh_id`, `targetId` = `danh_gia_bac_si_id`, nội dung `{ truoc: { bi_an: false }, sau: { bi_an: true }, ly_do, bac_si_id }` (không tên, SĐT, nhận xét). **Phạm vi:** Toàn hệ thống thấy hết; Chi nhánh chỉ đánh giá của lịch có `lich_hen.chi_nhanh_id` = chi nhánh mình (L10), ngoài phạm vi ⇒ 404. **Tên hiển thị "Bệnh nhân":** tên **người đặt** (tài khoản gửi đánh giá) `[cần điền]` nếu nhóm muốn tên người khám. Đã ẩn lần hai ⇒ 409 `DANH_GIA_DA_AN` | KDD-01…KDD-15, WKD-*; B7, B8, F7, F8 |
| Q9★ **(g)** | Điểm trung bình và `search`: tính khi đọc hay lưu sẵn; loại đánh giá ẩn; sắp xếp | **Tính khi đọc** bằng một câu `GROUP BY` ở `DoctorRatingReader.readMany` (không cột lưu sẵn, không cache): luôn đúng ngay sau khi gửi hoặc ẩn. Loại `bi_an = 1`. Sắp xếp `danhGiaCao` và lọc `diemTu` **giữ nguyên trong bộ nhớ** của `search` (chỉ đổi nguồn dữ liệu, K5). **Điều kiện:** đo EXPLAIN ở 100.000 lịch (M6) trước khi merge B9; **phương án dự phòng** nếu chậm (cột `bac_si_id` trên `danh_gia_bac_si`, hay bảng tổng hợp) là **đổi schema**: dừng và hỏi nhóm | DTB-01…DTB-10; B9; mục 5.9 |
| Q10★ **(h)** | Migration và entity `ho_so_kham`, `danh_gia_bac_si`: ai làm, thứ tự | **Scope này làm** (P1), theo tiền lệ doctor P1 (`yeu_cau_nghi_phep`): migration viết tay `1793…-tao-bang-ho-so-kham.ts` (một file cho cả hai bảng) đúng DDL `clinix_mysql.sql` dòng 395 và 472, hai CHECK dòng 952 và 955, hai khoá ngoại dòng 814 và 846; entity ở `doctor/entities/`; đăng ký `ENTITIES`, `MIGRATIONS`. **P1 làm đầu tiên** (mọi task khác cần bảng). **Đã ghi nhận 14/11/2026:** Trung approve PR 389 (không bình luận riêng), Đại coi là xác nhận ngoại lệ Q41 và tự nhắn Trung một câu riêng trước khi mở PR P1 (TRACKING mục 3.1, 5) | MGK-01…MGK-09; P1 |
| Q11★ **(i)** | Điểm chạm Trung và cách review | Danh sách và cách tránh xung đột ở **mục 6.7**; mỗi PR có file của Trung ghi `[ĐỤNG …]` trong mô tả, Đại báo Trung trước khi mở PR và **Trung là người review/approve** (PR cần người còn lại approve, AGENTS mục 5). Mã mới ở thư mục mới; sửa `doctor.module.ts` một dòng, `features/doctor/index.ts` một dòng (`export *`), `architecture.spec.ts` PD-19, hai file `audit/`, một file `search/`, một dòng `admin-sidebar.tsx` | 6.7; Q11 **đã ghi nhận 14/11/2026** (Trung approve PR 389, không bình luận riêng): hết chặn P2, P3, B9, F7 |
| Q12 **(j)** | Mã test và thứ tự task | Tiền tố ở mục 0 (đã kiểm chưa ai dùng); thứ tự ở mục 6.1; **P1 → P2 → P3 → X1 (đo) → B1, B2** là lõi; **F2 trước B3** (H6) | Mục 6, 7 |
| Q13★ **(k)** | Hạn mức giờ làm và chia Iteration | **Một phần đã trả lời (14/11/2026, Đại qua phiên kiểm): Iteration giữ MỘT tuần** (6: 17/11 đến 23/11, đã có trong Project; 7: 24/11 đến 30/11; 8: 01/12 đến 07/12, chưa thêm). Đại **chưa nêu số giờ/tuần** ⇒ dùng **mặc định 45 giờ/tuần `[đề xuất]`**, chờ Đại đổi. Tổng ước **≈ 95 giờ** (98 giờ với B10) `[đề xuất]` (mục 6.8) ⇒ **Iteration 6 ≈ 39 giờ** (P1, P2, P3, X1, B1, B2, B3, F1, F2, F3), **Iteration 7 ≈ 37 giờ** (F4, B4 đến B9, F5, F6, D1; chừa ≈ 8 giờ đệm), **Iteration 8 ≈ 22 giờ** (F7, F8, B10, D2, X2, X3) | 6.8 |
| Q14★ **(l)** | Điểm nối cho #9 (đổi lịch) | Hồ sơ khám và đánh giá **chỉ gắn lịch ở `DaTiepDon`/`HoanThanh`**; `DaDoiLich` chỉ tới từ `DaXacNhan` (ma trận) nên **không bao giờ** có hồ sơ hay đánh giá mới; đổi lịch **không sao chép, không di chuyển, không xoá** hồ sơ. Chuỗi đổi lịch (`lich_hen_truoc_id`) có tối đa MỘT lịch `HoanThanh` (lịch cuối) ⇒ mọi đánh giá và hồ sơ của chuỗi nằm ở lịch cuối. Ca đặc biệt: Admin override `DaTiepDon → DaXacNhan` rồi Bệnh nhân đổi lịch: hồ sơ cũ nằm ở lịch `DaDoiLich`, **ẩn** (Q16). **#9 không cần đổi gì ở scope này**; chỉ cần `markReplaced` không xoá dòng nào (E9) | HDK-11; mục 5.10 E9 |
| Q15 | Nhật ký `SuaGhiChuKham`: lưu nội dung nào; ai xem | Theo 2.4 ("nội dung trước/sau"): lưu **chỉ các trường có đổi** (cùng tập khoá ở `truoc` và `sau`, tối đa 4 khoá: `trieu_chung`, `chan_doan_so_bo`, `huong_xu_ly`, `ngay_tai_kham_du_kien`, giá trị chuỗi hoặc `null`), cộng `branchId` của lịch; **không** tên, SĐT, email. Ghi nhận là **dữ liệu sức khoẻ nằm trong nhật ký** (L3): màn "Nhật ký hành động" (`admin`, `[SAU]`) **phải che** nội dung `SuaGhiChuKham` hoặc chỉ cho Toàn hệ thống; chưa có màn nên chưa ai đọc được qua giao diện. Đưa thành dòng nợ `TECH_DEBT` ở B2 | TDK-04; B2; mục 5.12 |
| Q16 | Admin override đưa lịch `DaTiepDon` về trạng thái khác khi đã có hồ sơ (L14) | **Không chặn override** (booking B14 là việc đã xong của Đại; chặn thì Admin không sửa được nhầm lẫn); **giữ dòng** `ho_so_kham`, **ẩn**: `ghiChuKham` ở B5 chỉ trả khi lịch `DaTiepDon`/`HoanThanh`; ghi hồ sơ chỉ khi `DaTiepDon`/`HoanThanh` (409 `KHONG_THE_GHI_HO_SO_KHAM` ở trạng thái khác). Lịch quay lại `DaTiepDon` thì hồ sơ **hiện lại** (bác sĩ thấy nội dung đã ghi) | HSK-09, DHK-10, HDK-01 |
| Q17 | Thông báo và email của HTK/HSK/DGB | HTK ghi **một** `thong_bao` `LichHenHoanThanh` cho **tài khoản đặt** trong giao dịch của `complete` (ngay sau `complete`, H1); nội dung ≤ 500, một dòng, **không** dữ liệu khám; **không** ghi `email_thong_bao` (worker chỉ bốn loại; mẫu `678:2` chờ `notification`). **Không** thông báo khi bác sĩ ghi/sửa hồ sơ (2.4 không nêu) và khi gửi hoặc ẩn đánh giá. **Nhắc đánh giá** `[SAU]` (scope `notification`). Lỗi ghi thông báo ⇒ hoàn tác cả HTK (nếp B15: không có "hoàn thành mà không báo") | HTK-01, HTK-07, TDK-01…TDK-03; B1 |
| Q18 | Hồ sơ người thân đã ngừng dùng (`trang_thai_hieu_luc = false`) | Bệnh nhân **vẫn xem** hồ sơ khám và **vẫn đánh giá** lịch cũ (lịch sử y tế của chính họ; khoá ngoại kép vẫn đúng chủ). Bộ lọc "người khám" hiển thị cả hồ sơ ngừng dùng có lịch Hoàn thành | XHS-08 |
| Q19 | Bệnh nhân có thấy đánh giá của mình bị ẩn? | **Giữ nguyên hiển thị** như chưa bị ẩn, không thông báo, không lộ lý do (2.4 không nêu; tránh tranh chấp); không cho đánh giá lại (UNIQUE). Nếu nhóm muốn báo thì thêm frame Figma (L8) | WDG-08; D2 |
| Q20★ | Cắm giao diện `doctor` vào trang của booking (BWZ-08 cấm import chéo) | **ĐÃ TRẢ LỜI (14/11/2026, Đại chọn trực tiếp tại cửa sổ của phiên kiểm): Phương án C.** `features/booking` import `features/doctor` **CHỈ qua `index.ts`** (thêm `'doctor'` vào `THROUGH_INDEX_ONLY` của `architecture.test.ts` và sửa ca đối chứng `allowed('../../../doctor')` thành đúng, giữ cấm đi sâu vào file của `doctor`), đúng tiền lệ F10 (`admin`); `features/doctor` **không** import `features/booking` (không vòng); component nhận dữ liệu và hàm tải lại qua props (`onChanged`; không dùng kiểu của booking). Phương án A (booking xuất hàm tạo route nhận "chỗ cắm") **không chọn** | F1 (đổi BWZ-08), F2, F3, F6; hết chặn |
| Q21 | Bệnh nhân đọc hồ sơ và đánh giá qua đâu | **Endpoint riêng của `doctor`** (danh sách, chi tiết, gửi đánh giá), **không** thêm khoá vào `GET /patient/appointments/:maLichHen` (B2: 16 khoá và danh sách trắng không đổi). Trang chi tiết lịch hẹn của Bệnh nhân (F2) gọi thêm MỘT lần `GET /patient/exam-records/:maLichHen` khi lịch `HoanThanh` | XHS-06, HDK-10; B4, B5, F6 |
| Q22 | Tên endpoint và đường dẫn web (`[đề xuất]`) | Mục 5.11 và 5.13: `PUT /doctor/appointments/:maLichHen/exam-record`, `POST /doctor/appointments/:maLichHen/complete`, `GET /patient/exam-records`, `GET /patient/exam-records/:maLichHen`, `POST /patient/exam-records/:maLichHen/rating`, `GET /admin/doctor-ratings`, `GET /admin/doctor-ratings/:id`, `POST /admin/doctor-ratings/:id/hide`; web `/benh-nhan/ho-so-kham-benh` và `/admin/kiem-duyet-danh-gia` | 5.11, 5.13 |
| Q23 | Mã trạng thái cho "không phải của tôi" và trạng thái sai (L5) | 404 `KHONG_TIM_THAY` **cùng thân** cho: không tồn tại, sai dạng mã, lịch của bác sĩ/bệnh nhân khác, ngoài phạm vi; kiểm sở hữu **trước** trạng thái. Trạng thái sai: 409 (`CHUYEN_TRANG_THAI_KHONG_HOP_LE`, `KHONG_THE_GHI_HO_SO_KHAM`, `LICH_HEN_CHUA_HOAN_THANH`). Sai vai trò: 403 `KHONG_DU_QUYEN` (guard chạy trước pipe) | HSK-09, HSK-10, HTK-04, HTK-05 |
| Q24 | Cờ "có hồ sơ khám" và chỗ đọc `ghiChuKham` ở booking | `GET /doctor/appointments/:maLichHen`: `ghiChuKham` là `null` **hoặc** đối tượng `{ trieuChung, chanDoanSoBo, huongXuLy, ngayTaiKhamDuKien, capNhatLanCuoi }`; **vẫn 11 khoá**. Danh sách: **thêm đúng một khoá `coHoSoKham: boolean`** (9 khoá mỗi dòng), **không** nội dung. Đọc bằng `LEFT JOIN ho_so_kham ON lich_hen_id` ở MỘT chỗ mỗi câu (không câu thứ hai). Task B3 do Đại (chủ B5) | HDK-01…HDK-03; B3 |
| Q25 | Dữ liệu mẫu cho demo và kiểm tay | Tuỳ chọn `seed:exam-demo` (B10, `[SAU]` nếu thiếu giờ): vài lịch `DaTiepDon`/`HoanThanh` kèm hồ sơ và đánh giá cho tài khoản `dev-accounts`/`search-demo`. Nếu không làm: X2 tạo lịch bằng luồng đặt lịch, rồi Admin override `DaXacNhan → DaTiepDon` (Quản trị viên **không** bị cửa sổ giờ tiếp đón: đã đọc `checkCondition`) | B10, X2 |

### 4.3 Mọi chỗ còn `[cần điền]` / `[đề xuất]` liên quan (và câu hỏi tương ứng)

**`[cần điền]`:** tên hiển thị "Bệnh nhân" ở Admin là người đặt hay người khám (Q8); nhãn các mức sao ngoài "Xuất sắc" của Figma `424:2` (L8); văn bản đầy đủ các câu dài trong Figma bị cắt ở 50 ký tự (đọc lại bằng `get_design_context` trước các task F); quyết định của nhóm về Q1 đến Q25; xác nhận của Trung cho Q10 và Q11 (và Q21 nếu đụng file của Trung; Q20 đã được Đại trả lời 14/11/2026).

**`[đề xuất]` (toàn bộ nội dung mục 4.2 và các giá trị sau):** độ dài tối đa 2.000 ký tự cho ba trường hồ sơ, 1.000 ký tự cho nhận xét, 10 đến 255 ký tự cho lý do ẩn (Q2, Q7, Q8); khoảng ngày tái khám (Q2); loại sự kiện `LichHenHoanThanh` và nội dung thông báo (Q17); mã lỗi mới `KHONG_THE_GHI_HO_SO_KHAM`, `HO_SO_KHAM_DA_THAY_DOI`, `LICH_HEN_CHUA_HOAN_THANH`, `DA_DANH_GIA`, `DANH_GIA_DA_AN` và mã trường `loi[]` (mục 5.14); tên endpoint và đường dẫn web (Q22); tầng khoá `6b` (5.3); thư mục mã (Q1); ước giờ từng task và cả scope, hạn mức mặc định 45 giờ/tuần của Đại (chưa nêu) và cách chia ba Iteration (mục 6.8); số vòng chạy ca đồng thời (40) và ngưỡng EXPLAIN (mục 5.15); dòng `AI_USAGE_LOG.md` số 110 và dòng nợ `TECH_DEBT` (TRACKING mục 4); mức cắt chữ của nhận xét ở bảng Admin; mặc định bộ lọc và phân trang của ba danh sách (5.6, 5.8).

### 4.4 Đối chiếu Figma (đọc 14/11/2026 từ siêu dữ liệu toàn trang `63:2` của file `1OsOfwD5myNNRv7FPCD9YC`, 252 frame cấp 1, toàn bộ 1440 px, **không có frame mobile**; chữ dài bị cắt ở 50 ký tự)

| Use case | Frame | Nội dung đã đọc | Task |
|---|---|---|---|
| HTK, HSK (Bác sĩ) | `459:2` "Chi tiết lịch hẹn - Đã tiếp đón" | Tiêu đề "Chi tiết ca khám", nút `Hoàn thành ca khám` (cột phải hàng tiêu đề); thẻ "Hồ sơ khám bệnh": "Chưa ghi hồ sơ khám." + "Có thể ghi hồ sơ trước hoặc sau khi hoàn thành ca." + nút `Ghi hồ sơ khám`; "Trạng thái ca khám": Đã xác nhận / Đã tiếp đón / Hoàn thành ("Chưa đến") | F1, F2, F3 |
| HSK | `460:2` "… - Ghi hồ sơ khám" | Hộp **"Ghi chú khám"** (tiêu đề phụ: mã lịch + họ tên người khám): "Triệu chứng *", "Chẩn đoán sơ bộ *", "Hướng xử lý / Lời khuyên *" (chữ mờ gợi ý), "Ngày tái khám dự kiến (tùy chọn)"; nút `Hủy`, `Lưu ghi chú` | F3 |
| HTK | `461:2` "… - Xác nhận hoàn thành ca khám" | Hộp **"Xác nhận hoàn thành?"** với `Xác nhận` và `Hủy` | F1 |
| HSK, XHS (Bác sĩ) | `462:2` "Hoàn thành - Đã có hồ sơ" | Thẻ có nút `Chỉnh sửa ghi chú`; bốn nhãn (Triệu chứng, Chẩn đoán sơ bộ, Hướng xử lý / Lời khuyên, Ngày tái khám dự kiến `10/07/2026`); "Cập nhật lúc 17:30 ngày 10/06/2026" | F2, F3 |
| HSK | `463:2` "… - Chỉnh sửa ghi chú" | Hộp **"Chỉnh sửa ghi chú khám"** (điền sẵn nội dung); `Hủy`, `Lưu ghi chú` | F3 |
| HSK | `464:2` "Hoàn thành - Chưa có hồ sơ" | "Ca khám đã hoàn thành nhưng chưa có hồ sơ khám." + lời nhắc bổ sung + nút `Ghi hồ sơ khám` | F2 |
| (nối booking) | `457:2` danh sách Bác sĩ | Nhãn con "Đã có hồ sơ khám"/"Chưa ghi hồ sơ" dưới chip `Hoàn thành` (booking F11 chưa vẽ vì thiếu cờ) | F4 |
| XHS | `414:2`, `415:2`, `443:2` "Bệnh nhân - Hồ sơ khám bệnh" | Mục menu "Hồ sơ khám bệnh"; tiêu đề + mô tả "Lịch sử khám và ghi chú của bác sĩ cho các ca đã h…"; bộ lọc "Tất cả người đi khám" (danh sách người: bản thân và người thân); lưới **12 tháng của năm** (số ca mỗi tháng hoặc "–"); danh sách ca theo tháng: ngày, thứ, giờ, chuyên khoa, người khám · quan hệ, bác sĩ, nhãn "Chưa có hồ sơ"/"Đã có hồ sơ"; ngăn phải: "Chọn một ca khám để xem hồ sơ" (`414:2`); chi tiết: mã (Figma `CP…`), chip Hoàn thành, bác sĩ, ngày khám, chi nhánh, người khám, "Nội dung hồ sơ khám": bốn trường + "Cập nhật lần cuối: 17:30 10/6/26 · bởi <bác sĩ>" + liên kết "Xem chi tiết lịch hẹn →"; `415:2`: "Chưa có hồ sơ khám" + câu "Ca khám đã hoàn thành nhưng bác sĩ chưa ghi nội du…" | F5 |
| XHS, DGB | `422:2` "Chi tiết lịch hẹn - Hoàn thành - Chưa đánh giá" | Thẻ "Hồ sơ khám bệnh" ("Chưa có hồ sơ khám. Ca khám đã hoàn thành nhưng bá…"); khối **"Đánh giá bác sĩ"**: "Bạn chưa đánh giá bác sĩ cho buổi khám này." + nút `Đánh giá ngay` | F6 |
| DGB | `423:2` "… - Đánh giá bác sĩ" | Form: "Số sao *", "Nhận xét *" (chữ mờ "Chia sẻ trải nghiệm của bạn (tối thiểu 10 ký tự)", bộ đếm "0/1000"); `Huỷ`, `Gửi đánh giá` (**lệch L1**) | F6 |
| XHS, DGB | `424:2` "… - Đã có hồ sơ và đánh giá" | Thẻ hồ sơ có nội dung + liên kết "Xem trong sổ khám bệnh →"; khối đánh giá đã gửi: nhãn mức sao ("Xuất sắc"), ngày gửi, nhận xét | F6 |
| XHS, DGB | `425:2` "… - Đã đánh giá, chưa có hồ sơ" | Hồ sơ rỗng + đánh giá đã gửi | F6 |
| KDD | `514:2` "Admin - Kiểm duyệt đánh giá" (và `633:2` "Admin chi nhánh") | Chip đếm "hiển thị / đã ẩn"; ô "Tìm kiếm" ("Tên bệnh nhân hoặc nội dung…"); lọc "Chi nhánh" (**chỉ Toàn hệ thống**), "Bác sĩ", "Số sao", "Trạng thái"; bảng: Bác sĩ, Chi nhánh (**không có ở Admin chi nhánh**), Bệnh nhân, Sao, Nội dung (cắt), Ngày gửi, Trạng thái (Hiển thị/Đã ẩn), hành động `Xem`, `Ẩn` (hàng đã ẩn chỉ có `Xem`) | F7 |
| KDD | `570:2` "… - Xem đánh giá" | Ngăn **"Chi tiết đánh giá"**: bác sĩ, chi nhánh, bệnh nhân, "mã lịch · giờ khám", ngày gửi, trạng thái, số sao "(4/5)", nội dung; nút `Ẩn đánh giá`, `Đóng` | F7 |
| KDD | `571:2` "… - Ẩn đánh giá" | Hộp **"Ẩn đánh giá"**: tóm tắt đánh giá, câu "Đánh giá sẽ không còn hiển thị công khai nhưng vẫn …", "Lý do ẩn *" (gợi ý "tối thiểu 10 ký tự"); `Hủy`, `Xác nhận ẩn` | F8 |
| (hoãn) | `678:2` "Email Preview - Hoàn thành lịch khám" | Mẫu thư "[CLINIX] Lịch khám đã hoàn thành" (mã lịch, bác sĩ, ngày giờ, chi nhánh); **thuộc `notification`**, không làm ở đây | — |
| (hoãn) | `657:2` (search, chi tiết bác sĩ, tab Đánh giá) | Phân bố sao và nhận xét kèm tên: `[SAU]` | — |

### 4.5 Trạng thái chưa có frame Figma (nhóm bổ sung; trong lúc chờ, FE theo cách của `patient` Q22)

Bác sĩ: lịch **Đã tiếp đón đã có hồ sơ** (nút `Chỉnh sửa ghi chú` cùng `Hoàn thành ca khám`); lỗi theo trường của hộp ghi (A1) và bộ đếm ký tự; 409 sửa chồng ("hồ sơ vừa được cập nhật ở nơi khác"); 409 "ca đã hoàn thành" khi bấm đúp; đang lưu; mất mạng/hết giờ; `Vắng mặt`, `Đã hủy` có hồ sơ cũ (Q16: ẩn). Bệnh nhân: trang Hồ sơ khám bệnh **đang tải, lỗi, rỗng ("chưa có lịch Hoàn thành nào")**, lọc không có kết quả; năm không có ca; gửi đánh giá **thành công, đang gửi, lỗi, `DA_DANH_GIA`**; nhãn các mức sao; đánh giá bị ẩn (Q19). Admin: danh sách **rỗng, lỗi, đang tải**; lọc không có kết quả; `Ẩn` thành công và lỗi (lý do trống, 409 đã ẩn, 404 ngoài phạm vi). Câu chữ các trạng thái trên là `[đề xuất]`, nhóm duyệt rồi đưa vào Figma (D2).

### 4.6 Việc của nhóm (ngoài repo)

- Sửa **2.4** (repo `TLCN_CLINIX`, người dùng làm): HSK (A2 nêu mã trạng thái, sửa khi `DaTiepDon` có ghi nhật ký không: Q3), HTK (không điều kiện thời gian), XHS A1 (L6), DGB b4 (nhận xét: L1), KDD (lý do tối thiểu, phạm vi theo chi nhánh của lịch: L2, L10), DGB: Bệnh nhân có thấy đánh giá bị ẩn (Q19). Liệt kê trong task D2.
- Sửa **Figma** theo L1, L7, L8, L9 và mục 4.5; nhắc mã lịch `CP…` còn lệch `CLX-…` (đã ghi ở booking).
- Duyệt Q1 đến Q25; Trung xác nhận Q10, Q11 (đã ghi nhận 14/11/2026: Trung approve PR 389; Đại nhắn riêng về Q10 trước khi mở PR P1).

## 5. Thiết kế kỹ thuật

### 5.1 Cấu trúc thư mục (tạo thư mục khi có file đầu tiên; test cạnh mã; hàm thuần mỗi file ≤ 100 dòng theo nếp doctor)

```
apps/api/src/doctor/
  entities/ho-so-kham.entity.ts, danh-gia-bac-si.entity.ts     (P1; cạnh yeu-cau-nghi-phep.entity.ts)
  examination/                                                  (MỚI: toàn bộ mã scope này, trừ chỗ cắm ở mục 6.7)
    examination.module.ts           imports: AppointmentsModule, AuditModule, RbacModule; DoctorModule nhập bằng MỘT dòng
    examination.constants.ts        mã lỗi, giới hạn độ dài, tên sự kiện thông báo (hằng, không logic)
    exam-record/                    HSK: exam-record.rules.ts (thuần), .dto.ts, .controller.ts, .service.ts, .repository.ts
    completion/                     HTK: exam-completion.controller.ts, .service.ts   (CHỖ DUY NHẤT trong doctor/ nhắc AppointmentTransitionService)
    patient-view/                   XHS: patient-exam-records.{controller,service,repository,dto,mapper}.ts
    rating/                         DGB: rating.rules.ts (thuần), .dto.ts, .controller.ts, .service.ts, .repository.ts
    moderation/                     KDD: admin-ratings.{controller,service,repository,dto}.ts, rating-hide.service.ts
    notifications/exam-notifier.ts  ghi thong_bao (tiền lệ leave-notifier.ts)
    testing/                        exam-fixtures.ts, exam-world.ts, exam-invariants.ts (IVK), exam-concurrency.ts
apps/api/src/search/ratings/doctor-rating.reader.ts              (B9 [ĐỤNG search]: đổi thân hàm, giữ chữ ký)
apps/api/src/audit/audit-entry.ts, audit-validation.ts           (P2 [ĐỤNG audit]: +SuaGhiChuKham, +AnDanhGia)
apps/api/src/appointments/…                                      (B3, P2 [ĐỤNG booking]: lists/doctor-appointments.*, locking/lock-order.*, testing/response-keys.ts)
apps/web/src/features/doctor/examination/
  index.ts                       bề mặt công khai (features/doctor/index.ts chỉ `export * from './examination'`)
  api/                           exam-api.ts (MỘT lớp gọi qua shared/api/client): hoàn thành, ghi hồ sơ, danh sách/chi tiết Bệnh nhân, đánh giá, Admin
  doctor/                        complete-action.tsx, complete-dialog.tsx, use-complete.ts, exam-record-card.tsx, exam-record-dialog.tsx, exam-record-form.ts (kiểm trường, đếm ký tự), use-save-record.ts, exam-messages.ts
  patient/                       exam-records-page.tsx, record-list.tsx, month-grid.tsx, person-filter.tsx, record-pane.tsx, patient-exam-sections.tsx (thẻ hồ sơ + khối đánh giá cho F2), rating-form.tsx, star-input.tsx, use-*.ts, patient-exam-routes.tsx
  admin/                         reviews-page.tsx, review-filters.tsx, review-table.tsx, review-drawer.tsx, hide-dialog.tsx, use-*.ts, reviews-routes.tsx, reviews-paths.ts
apps/web/src/features/booking/…  (F1 đến F4, F6 [ĐỤNG booking]: doctor-detail-page.tsx, record-card.tsx, detail-messages.ts, doctor-table.tsx, bộ đọc, appointment-detail (F2), architecture.test.ts)
```

### 5.2 Quy tắc hồ sơ khám (hàm thuần `exam-record.rules.ts`, MỘT chỗ định nghĩa; web dùng bản TS riêng cùng ca test vì `features/` không import mã `apps/api`)

- **Chuẩn hoá** từng trường chữ: `CRLF`/`CR` ⇒ `LF`; bỏ ký tự điều khiển trừ `LF` và `TAB`; `trim` hai đầu. Rỗng sau chuẩn hoá ⇒ lỗi `BAT_BUOC` với ba trường bắt buộc; `ngayTaiKhamDuKien` rỗng hoặc `null` ⇒ `null`.
- **Độ dài:** 1 đến 2.000 đơn vị UTF-16 (`string.length`; cùng cách đếm với booking F9 `cancel-reason`: một chữ có dấu dựng sẵn là 1, emoji là 2) `[đề xuất]`; vượt ⇒ `QUA_DAI`.
- **Ngày tái khám:** chuỗi `YYYY-MM-DD` có thật (so bằng UTC như `calendarDate` của `audit-validation`), `>= DATE(lich_hen.thoi_gian)` và `<= ngày khám + 365 ngày` `[đề xuất]`; sai ⇒ `NGAY_KHONG_HOP_LE`. Ngày khám tính từ `thoi_gian` theo **giờ VN** (cột đã là giờ VN; không đổi múi giờ).
- **Không đổi:** `sameContent(hienCo, moi)` so từng trường bằng `===` sau chuẩn hoá (H2); không đổi ⇒ trả bản hiện có, không ghi, không nhật ký.
- **Diff cho nhật ký:** `diffForAudit(hienCo, moi)` trả `{ truoc, sau }` chỉ chứa khoá có đổi (tập khoá bằng nhau, ≥ 1 khoá); khoá snake_case (`trieu_chung`, `chan_doan_so_bo`, `huong_xu_ly`, `ngay_tai_kham_du_kien`).
- **Quyền ghi theo trạng thái:** `canWriteRecord(trangThai) = trangThai ∈ { DaTiepDon, HoanThanh }`; `isAuditedEdit(trangThai, daCoHoSo) = trangThai === HoanThanh && daCoHoSo` (Q3).

### 5.3 Thứ tự khoá, giao dịch, thử lại — **mở rộng bảng khoá toàn cục (booking 5.3) bằng tầng `6b`, không thêm chu trình**

Thứ tự (từ ngoài vào trong; bỏ tầng không cần): 1 `tai_khoan` → 2 `benh_nhan` → 3 `ho_so_nguoi_than` → 4 `bac_si` → 4b `dich_vu_kham` → 5 `khung_gio` → 6 `lich_hen` (theo `lich_hen_id` hoặc `ma_lich_hen`) → **6b `ho_so_kham`, `danh_gia_bac_si`** (khoá hàng theo khoá duy nhất `lich_hen_id` hoặc khoá chính) → 7 `giao_dich_thanh_toan` → `vi_noi_bo` → bảng chỉ-thêm (`thong_bao`, `nhat_ky_hanh_dong`, …). `6b` đứng sau `6` vì hai bảng này có khoá ngoại tới `lich_hen` (hàng con khoá sau hàng cha) và trước `7` vì thông báo/nhật ký được ghi sau khi đã đổi dữ liệu. **Scope này không bao giờ xin tầng 1 đến 5.**

| Luồng | Chuỗi (đúng thứ tự) | Ghi chú |
|---|---|---|
| **HTK** | (1) đọc thường `lich_hen_id` theo `ma_lich_hen` **và `bac_si_id` = token**; (2) `withBookingTransaction`: `complete` (khoá `lich_hen` X theo PK, kiểm sở hữu, trạng thái, `UPDATE`); (3) chỉ khi `Completed`: `INSERT thong_bao` | `complete` **TRƯỚC** mọi ghi bảng có khoá ngoại tới `lich_hen` (H1); thử lại 1213/1205 ≤ 2 do `withBookingTransaction`; 1062 của `thong_bao` (chạy lại) ⇒ "đã có", không lỗi |
| **HSK** | (1) đọc thường `lich_hen_id` như trên; (2) `withBookingTransaction`: `lich_hen` X theo PK → kiểm lại `bac_si_id`, `trang_thai` dưới khoá → `ho_so_kham` `SELECT … FOR UPDATE` theo `lich_hen_id` → kiểm token `capNhatLanCuoi` → `INSERT` hoặc `UPDATE` → (nếu `isAuditedEdit`) `AuditService.record` `SuaGhiChuKham` | Khoá `lich_hen` X trước nên **tuần tự hoá với `complete`, override, huỷ** cùng lịch; không đụng `khung_gio` (không cần tầng 5) |
| **DGB** | (1) đọc thường: lịch theo `ma_lich_hen` **và `benh_nhan_id` = token** (sở hữu TRƯỚC), kiểm `trang_thai = HoanThanh`; (2) `INSERT danh_gia_bac_si` (UNIQUE `lich_hen_id`) | Không khoá tường minh: `HoanThanh` là trạng thái cuối, chủ sở hữu bất biến (H8); đua hai lần gửi do UNIQUE giải quyết (1062 ⇒ `DA_DANH_GIA`); khoá chia sẻ ngầm trên hàng cha `lich_hen` (M3) |
| **KDD (ẩn)** | (1) đọc thường: đánh giá + `lich_hen.chi_nhanh_id`; kiểm phạm vi (404); (2) `withBookingTransaction`: `SELECT … FROM danh_gia_bac_si WHERE id = ? FOR UPDATE` → kiểm `bi_an = 0` → `UPDATE bi_an = 1, ly_do_an = ?` → `AuditService.record` `AnDanhGia` | Chi nhánh của lịch **bất biến** nên bản đọc thường đủ cho phạm vi; không khoá `lich_hen` (không chặn các luồng lịch hẹn) |
| **Đọc** (B5, Bệnh nhân, Admin, `search`) | Không khoá: mỗi lần đọc hồ sơ là **một câu `SELECT`** (nhất quán từng câu dưới `READ COMMITTED`); điểm trung bình là một câu | Bệnh nhân đọc trong lúc Bác sĩ sửa thấy trọn bản cũ hoặc trọn bản mới, không bị chặn (DHK-05) |

Lỗi 1213/1205 chỉ gặp ở HTK và HSK (có khoá); `withBookingTransaction` thử lại ≤ 2 rồi 503 `HE_THONG_DANG_BAN` (không 500). Mọi `now` từ `nowVN()` rồi `toSecond()`; hàm thuần nhận `now`.

### 5.4 Xác nhận hoàn thành ca khám (HTK b1–b5, A1)

`POST /doctor/appointments/:maLichHen/complete` (thân rỗng, `forbidNonWhitelisted`): `@Roles('BacSi')` trên route; `ParseAppointmentCodePipe`; `bacSiId` **chỉ từ token**.
1. Đọc thường `lich_hen_id`, `benh_nhan_id`, `chi_nhanh_id` theo `ma_lich_hen` **và** `bac_si_id = token`; không có ⇒ 404 `KHONG_TIM_THAY` (cùng thân với mã sai dạng và lịch của bác sĩ khác).
2. `withBookingTransaction` (nhãn `exam-complete`): `AppointmentTransitionService.complete(em, { lichHenId, bacSiId })`. `Completed` ⇒ `ExamNotifier.notifyCompleted(em, …)` (một `thong_bao` `LichHenHoanThanh` cho `benh_nhan_id`, bằng đúng `em` này) ⇒ trả kết quả. `NotAssigned` ⇒ trả kết quả (404). `InvalidState` ⇒ trả kết quả (409). **Không ném `AppException` trong thân.**
3. Sau giao dịch đổi kết quả sang lỗi API: `Completed` ⇒ 200 `{ maLichHen, trangThai: 'HoanThanh' }`; `NotAssigned` ⇒ 404 `KHONG_TIM_THAY`; `InvalidState` ⇒ 409 `CHUYEN_TRANG_THAI_KHONG_HOP_LE` kèm `{ tuTrangThai, denTrangThai: 'HoanThanh' }` (cùng mã và hình dạng với route override của booking, để một câu chữ dùng chung).
- **Không** kiểm hồ sơ khám (HTK b2; quyết định 17/10), **không** kiểm thời gian (`complete` không có; HTK-06), **không** ghi nhật ký (không nằm trong whitelist; 2.4 không yêu cầu), **không** đụng `khung_gio` (vẫn `DaDat`).
- **Bấm đúp / hai tab:** lần hai thấy `HoanThanh` ⇒ 409; giao diện coi `tuTrangThai === 'HoanThanh'` là "ca đã hoàn thành" và tải lại (không báo lỗi đỏ). API **không** idempotent 200 (đúng 2.4 A1: không ở `DaTiepDon` ⇒ từ chối).

### 5.5 Ghi và sửa hồ sơ khám (HSK b1–b6, A1, A2)

`PUT /doctor/appointments/:maLichHen/exam-record`, thân `{ trieuChung, chanDoanSoBo, huongXuLy, ngayTaiKhamDuKien?, capNhatLanCuoi }` (`capNhatLanCuoi`: chuỗi ISO đã thấy hoặc `null` nếu chưa có hồ sơ). `@Roles('BacSi')`; khoá lạ (`lichHenId`, `bacSiId`, `benhNhanId`…) ⇒ 400 `TRUONG_KHONG_DUOC_PHEP`. **Không idempotent vì có token:** nếu lần gửi đầu đã lưu mà phản hồi mất (lỗi mạng), gửi lại cùng thân (token cũ) nhận 409 `HO_SO_KHAM_DA_THAY_DOI`; giao diện xử lý bằng cách tải lại rồi so nội dung (trùng thì coi là đã lưu; WHS-09).
1. DTO + `exam-record.rules.ts` (chuẩn hoá, `BAT_BUOC`, `QUA_DAI`; ngày tái khám cần `thoi_gian` nên kiểm ở bước 3). Lỗi ⇒ 400 `DU_LIEU_KHONG_HOP_LE` kèm `loi[{ truong, ma }]` (**không** giá trị).
2. Đọc thường `lich_hen_id` theo `ma_lich_hen` và `bac_si_id = token`; không có ⇒ 404.
3. `withBookingTransaction` (`exam-record`): khoá `lich_hen` `FOR UPDATE` theo PK ⇒ **kiểm lại** `bac_si_id` (≠ ⇒ `NotFound`) rồi `canWriteRecord(trang_thai)` (sai ⇒ `WrongState { trangThai }`) rồi ngày tái khám so `thoi_gian` (sai ⇒ `InvalidDate`) ⇒ `SELECT … FROM ho_so_kham WHERE lich_hen_id = ? FOR UPDATE` (cột `DATE` đọc bằng `DATE_FORMAT`) ⇒ **kiểm token**: chưa có dòng mà thân mang token ≠ `null`, hoặc có dòng mà token ≠ `cap_nhat_lan_cuoi` (so chuỗi ISO), ⇒ `Conflict` ⇒ không có dòng ⇒ `INSERT` (`cap_nhat_lan_cuoi = toSecond(nowVN())`); có dòng và `sameContent` ⇒ trả nguyên, không ghi; có dòng và khác ⇒ `UPDATE` (`cap_nhat_lan_cuoi` mới) ⇒ nếu `isAuditedEdit(trang_thai, true)` ⇒ `AuditService.record` `SuaGhiChuKham` (`branchId` = `lich_hen.chi_nhanh_id`, `targetId` = `ho_so_kham_id`, `diffForAudit`) ⇒ trả bản mới đọc lại bằng `SELECT`. 1062 ở `INSERT` (không thể xảy ra khi đã khoá `lich_hen`; lưới an toàn) ⇒ `Conflict`.
4. Kết quả có kiểu ⇒ 200 `{ trieuChung, chanDoanSoBo, huongXuLy, ngayTaiKhamDuKien, capNhatLanCuoi }`; `NotFound` ⇒ 404; `WrongState` ⇒ 409 `KHONG_THE_GHI_HO_SO_KHAM` kèm `{ trangThai }`; `InvalidDate` ⇒ 400 `loi[{ truong: 'ngayTaiKhamDuKien', ma: 'NGAY_KHONG_HOP_LE' }]`; `Conflict` ⇒ 409 `HO_SO_KHAM_DA_THAY_DOI`.
- Mã trạng thái 200 cho cả ghi lần đầu và sửa (không phân biệt 201/200) `[đề xuất]`. Nhật ký lỗi (`AuditError`) ⇒ cả giao dịch hoàn tác (HSK-18). **Không** thông báo (Q17).

### 5.6 Xem hồ sơ khám của Bệnh nhân (XHS b1–b4, A1, A2)

Tất cả `@Roles('BenhNhan')`, `Cache-Control: no-store`, `benh_nhan_id` **chỉ từ token** (query có `benhNhanId` ⇒ 400 `TRUONG_KHONG_DUOC_PHEP`).
- **`GET /patient/exam-records?nguoiKham=&nam=&thang=&page=&pageSize=`** `[đề xuất]`: `nguoiKham` = `banThan` hoặc id hồ sơ người thân (id không thuộc mình ⇒ danh sách rỗng, không 404); `nam` mặc định năm hiện tại (giờ VN); `thang` 1 đến 12 tuỳ chọn; `pageSize` mặc định 20, tối đa 50. Trả `{ items, total, page, pageSize, demTheoThang, nguoiKham }`: `items[]` = `{ maLichHen, thoiGian (ISO UTC), chuyenKhoa, bacSi { hoTen, chucDanh }, nguoiKham { hoTen, quanHe }, coHoSoKham, daDanhGia }`; `demTheoThang` đủ 12 khoá `"1"…"12"` (số lịch `HoanThanh` của năm, áp lọc `nguoiKham`, **không** áp lọc `thang`); `nguoiKham` = các lựa chọn bộ lọc `[{ id (null = bản thân), hoTen, quanHe }]` suy từ lịch `HoanThanh` (gồm hồ sơ ngừng dùng: Q18). Sắp `thoi_gian` giảm dần rồi `lich_hen_id` giảm dần. **Không** nội dung hồ sơ trong danh sách.
- Khung thời gian: `thoi_gian >= :dauNam/:dauThang AND thoi_gian < :cuoiNam/:cuoiThang` (nửa mở, giờ VN, **không** bọc cột: AR-05). Bộ lọc dùng chỉ mục `lich_hen_index_9 (benh_nhan_id, trang_thai, thoi_gian)` (chưa đo, M7). Hồ sơ người khám bản thân: `ho_so_nguoi_than_id IS NULL` (NULL-safe `<=>` như DB ghi chú).
- **`GET /patient/exam-records/:maLichHen`**: lịch `HoanThanh` của mình, **một câu `SELECT`** nối `lich_hen`, `bac_si`/`tai_khoan` (bác sĩ), `chuyen_khoa`, `chi_nhanh`, `ho_so_nguoi_than` (LEFT), `ho_so_kham` (LEFT), `danh_gia_bac_si` (LEFT). Trả `{ maLichHen, thoiGian, chuyenKhoa, chiNhanh, bacSi { hoTen, chucDanh }, nguoiKham { hoTen, quanHe }, hoSoKham: { trieuChung, chanDoanSoBo, huongXuLy, ngayTaiKhamDuKien, capNhatLanCuoi, capNhatBoi (họ tên bác sĩ của lịch) } | null, danhGia: { soSao, nhanXet, thoiDiemTao } | null, coTheDanhGia: boolean }`; `hoSoKham: null` khi không có dòng (**không** nội dung giả: "Chưa có hồ sơ khám"); `danhGia` trả nguyên cả khi `bi_an = 1` (Q19; **không** `biAn`, `lyDoAn`); `coTheDanhGia = (danhGia === null)`. Lịch không phải của mình, chưa `HoanThanh`, không có, mã sai dạng ⇒ 404 `KHONG_TIM_THAY` **cùng thân**.
- **Ghi chú NULL ở DB:** cột chữ của `ho_so_kham` cho NULL; mapper đổi NULL thành chuỗi rỗng, giao diện hiện "Chưa ghi" cho trường trống (XHS-14), không lỗi.

### 5.7 Đánh giá bác sĩ (DGB b1–b5, A1, A2)

`POST /patient/exam-records/:maLichHen/rating`, thân `{ soSao, nhanXet? }`; `@Roles('BenhNhan')`; khoá lạ (`bacSiId`, `biAn`, `lichHenId`) ⇒ 400.
1. DTO + `rating.rules.ts`: `soSao` bắt buộc, nguyên 1 đến 5 (thiếu ⇒ `SO_SAO_BAT_BUOC`; 0, 6, 3.5, chuỗi ⇒ `SO_SAO_KHONG_HOP_LE`); `nhanXet` tuỳ chọn, chuẩn hoá như 5.2, tối đa 1.000 (`QUA_DAI`), rỗng sau chuẩn hoá ⇒ `NULL`.
2. Đọc thường lịch theo `ma_lich_hen` và `benh_nhan_id = token` (không có ⇒ 404 **trước** mọi kiểm trạng thái); `trang_thai ≠ HoanThanh` ⇒ 409 `LICH_HEN_CHUA_HOAN_THANH` kèm `{ trangThai }`.
3. `INSERT INTO danh_gia_bac_si (lich_hen_id, so_sao, nhan_xet, bi_an, ly_do_an, thoi_diem_tao) VALUES (?, ?, ?, 0, NULL, :now)` (`now` = `toSecond(nowVN())`); 1062 trên `lich_hen_id` ⇒ 409 `DA_DANH_GIA` (`isDuplicateKeyError`, không 500); CHECK không bao giờ vi phạm vì giá trị do service đặt.
4. 201 `{ soSao, nhanXet, thoiDiemTao }`. Điểm trung bình của bác sĩ đổi ngay vì tính khi đọc (5.9). **Không** thông báo, **không** nhật ký (2.4 không yêu cầu).
- Đánh giá **không phụ thuộc** hồ sơ khám (DGB-15) và không giới hạn thời hạn sau Hoàn thành (Q7). Bác sĩ nhận đánh giá được suy qua `lich_hen.bac_si_id`.

### 5.8 Kiểm duyệt đánh giá (KDD b1–b5, A1)

Tất cả `@Roles('QuanTriVien')` và `@RequireAdminScope('Any')` **trên từng route**; phạm vi từ `@AdminScopeCtx()` (đọc DB mỗi request); `Cache-Control: no-store`; ngoài phạm vi ⇒ 404 cùng thân.
- **`GET /admin/doctor-ratings?trangThai=&soSao=&bacSiId=&chiNhanhId=&q=&page=&pageSize=`**: `trangThai` ∈ `HienThi`, `DaAn`; `chiNhanhId` chỉ có tác dụng với Toàn hệ thống (`BranchAccessPolicy.branchFilter` ép Chi nhánh theo chi nhánh được gán; giá trị khác bị bỏ qua, như DSV-02 của booking); `q` khớp tên người đặt (`tai_khoan.ho_ten`) hoặc `nhan_xet` bằng `LIKE` **đã thoát `%`, `_`, `\`**; sắp `thoi_diem_tao` giảm dần rồi id giảm dần; `pageSize` mặc định 20, tối đa 50. Trả `{ items, total, page, pageSize, demTheoTrangThai: { HienThi, DaAn } }` (đếm áp mọi lọc **trừ** `trangThai`); `items[]` = `{ danhGiaId, bacSi { bacSiId, hoTen }, chiNhanh { chiNhanhId, ten }, nguoiDanhGia { hoTen }, soSao, nhanXet (cắt ≤ 200 ký tự ở máy chủ; nội dung đầy đủ ở chi tiết), thoiDiemTao, biAn }`. `danhGiaId` là BIGINT dạng **chuỗi**. Phạm vi SQL: `lich_hen.chi_nhanh_id = :chiNhanh` khi Chi nhánh.
- **`GET /admin/doctor-ratings/:id`** (`ParseRecordIdPipe`): thêm `maLichHen`, `thoiGianKham`, `nhanXet` đầy đủ, `lyDoAn` (chỉ khi đã ẩn). **Không** SĐT, email, `ly_do_kham`.
- **`POST /admin/doctor-ratings/:id/hide`**, thân `{ lyDo }` (bắt buộc, chuẩn hoá `trim`, 10 đến 255 đơn vị UTF-16; trống ⇒ `LY_DO_BAT_BUOC`, ngắn/dài ⇒ `LY_DO_QUA_NGAN`/`LY_DO_QUA_DAI`): theo bảng 5.3; `UPDATE danh_gia_bac_si SET bi_an = 1, ly_do_an = ? WHERE danh_gia_bac_si_id = ? AND bi_an = 0` phải trúng đúng 1 hàng; đã ẩn ⇒ 409 `DANH_GIA_DA_AN`; nhật ký `AnDanhGia` (`branchId` = chi nhánh của lịch, `targetId` = id đánh giá, `{ truoc: { bi_an: false }, sau: { bi_an: true }, ly_do, bac_si_id }`). 200 `{ danhGiaId, biAn: true }`. Điểm trung bình tính lại tự động (5.9). **Không** có route hiện lại (Q8).

### 5.9 Điểm trung bình và `search` (task B9, `[ĐỤNG search]`)

`DoctorRatingReader.readMany(doctorIds)` đổi thân hàm, **giữ chữ ký và kiểu `Map<string, DoctorRating>` đủ MỌI id truyền vào** (id không có đánh giá ⇒ `NO_RATING`; danh sách rỗng ⇒ Map rỗng, không chạy SQL):
```
SELECT CAST(lh.bac_si_id AS CHAR) AS bacSiId, ROUND(AVG(dg.so_sao), 1) AS diem, COUNT(*) AS soDanhGia
FROM danh_gia_bac_si dg JOIN lich_hen lh ON lh.lich_hen_id = dg.lich_hen_id
WHERE dg.bi_an = 0 AND lh.bac_si_id IN (?) GROUP BY lh.bac_si_id
```
(`[đề xuất]`; kiểu trả về của `ROUND(AVG(...), 1)` và `COUNT(*)` qua driver: **chưa đo**, M5; `diemTrungBinh` phải là chuỗi một chữ số thập phân, ví dụ `"4.0"`; `soDanhGia` là `number`). Nửa làm tròn theo `ROUND` của MySQL trên DECIMAL (chưa đo): ca DTB-02 chốt. Không cache (kết quả luôn đúng sau khi gửi hoặc ẩn). `public-doctor.service.ts`, `doctor-list.rules.ts` (lọc `diemTu`, sắp `danhGiaCao`) **không đổi**. Kế hoạch thực thi (bắt đầu từ `lich_hen` theo `bac_si_id`, hay từ `danh_gia_bac_si`) và thời gian ở 100.000 lịch: **đo ở M6 trước khi merge**; không đạt ngưỡng `[đề xuất]` ⇒ dừng và hỏi nhóm (đổi schema).

### 5.10 **Hợp đồng với module song song `booking` và các cổng khác** — `[đề xuất]`, đối chiếu hai PLAN TRƯỚC khi tạo issue (Đại là chủ cả hai bên `booking` và scope này)

| # | Điểm giao tiếp | Ai làm / ai gọi | Tên, chữ ký, kết quả, lỗi | Ghi chú / thứ tự khoá |
|---|---|---|---|---|
| E1 | **Hoàn thành ca khám** (booking D6) | `doctor` gọi `booking` | `AppointmentTransitionService.complete(em, { lichHenId, bacSiId }): Promise<{ kind: 'Completed' } \| { kind: 'NotAssigned' } \| { kind: 'InvalidState', trangThai }>`; mã API: 404 `KHONG_TIM_THAY`; 409 `CHUYEN_TRANG_THAI_KHONG_HOP_LE` (`tuTrangThai`, `denTrangThai`); `CHI_BAC_SI_HOAN_THANH` chỉ ở route của Lễ tân/Admin (đã có, scope này chạy lại HTK-10) | Gọi qua `withBookingTransaction`; **TRƯỚC** mọi ghi bảng có khoá ngoại tới `lich_hen` (kể cả `thong_bao`); `bacSiId` từ token; kiểm sở hữu TRƯỚC trạng thái; **không điều kiện thời gian** (đã đọc); import kiểu từ `appointments/state/appointment-transition.service.ts`, `withBookingTransaction` từ `appointments/locking/` |
| E2 | **`ghiChuKham` và cờ "đã có hồ sơ khám" ở B5** | `booking` (Đại) đọc; scope này định hình dạng | Chi tiết `GET /doctor/appointments/:maLichHen`: `ghiChuKham: null \| { trieuChung, chanDoanSoBo, huongXuLy, ngayTaiKhamDuKien: string \| null, capNhatLanCuoi: string }`, **vẫn 11 khoá cấp một**; `null` khi không có dòng **hoặc** lịch không ở `DaTiepDon`/`HoanThanh` (Q16). Danh sách `GET /doctor/appointments`: **thêm đúng một khoá `coHoSoKham: boolean`** (9 khoá mỗi dòng; `true` khi có dòng và lịch ở `DaTiepDon`/`HoanThanh`), **không** nội dung | `LEFT JOIN ho_so_kham ON lich_hen_id` ở MỘT chỗ mỗi câu; B3 sửa `doctor-appointments.repository.ts`, `.mapper.ts`, `.dto.ts` (kiểu `ghiChuKham`), `testing/response-keys.ts` (**thêm hằng `HEALTH_RECORD_KEY`** cho e2e của Lễ tân và Quản trị viên; `DOCTOR_FORBIDDEN_KEY` giữ nguyên, các khoá mới của hồ sơ không khớp mẫu của nó: đã đối chiếu), DSB-06, DSB-08; **web: sửa MỘT chỗ ở bộ đọc `doctor-appointment-detail-api.ts` (F2) trước B3** |
| E3 | **Chi tiết lịch hẹn của Bệnh nhân (B2, F2)** | `booking` (Đại); scope này không đổi B2 | `GET /patient/appointments/:maLichHen` **giữ 16 khoá, không thêm khoá hồ sơ/đánh giá** (Q21). Trang F2, khi lịch `HoanThanh`, gọi thêm `GET /patient/exam-records/:maLichHen` (5.6) | Hai lần gọi độc lập; lỗi lần hai chỉ làm hỏng hai thẻ (hồ sơ, đánh giá), không làm hỏng trang |
| E4 | **Quyền đọc/ghi hồ sơ và đánh giá** | scope này | Bảng quyền: **ghi hồ sơ:** Bác sĩ phụ trách; **đọc nội dung hồ sơ:** Bác sĩ phụ trách (lịch `DaTiepDon`/`HoanThanh`), Bệnh nhân chủ (chỉ `HoanThanh`); **Lễ tân, Quản trị viên: không**; **gửi đánh giá:** Bệnh nhân chủ; **ẩn đánh giá:** Quản trị viên trong phạm vi; **xem đánh giá:** Admin trong phạm vi, Bệnh nhân chủ (của mình), công khai chỉ điểm và số lượt | `@Roles` trên từng route (AR-02 của booking quét `appointments/`; scope này thêm bộ quét cho `doctor/examination/` ở P3, QHK-09); chủ sở hữu **chỉ từ token** |
| E5 | **Nhật ký và thứ tự khoá** | `audit` (Trung), `booking` (Đại) | Thêm `SuaGhiChuKham` (`ho_so_kham`) và `AnDanhGia` (`danh_gia_bac_si`) vào `ChangeMap`, `TargetMap`, `validateChanges` (P2; **không** migration: ENUM đã có); thêm tầng `6b` vào `lock-order.ts` (`LockTierId` có `'6b'`, `LOCK_ORDER` thêm `{ tang: '6b', bang: ['ho_so_kham', 'danh_gia_bac_si'] }` giữa `lich_hen` và `giao_dich_thanh_toan`) và `lock-order.spec.ts` (LOK) | `findLockOrderViolation` bỏ qua bảng ngoài danh sách; sau P2 các chuỗi khoá của scope này được kiểm bằng `lock-chain.ts` |
| E6 | **Thông báo** | scope này ghi; `notification` gửi sau | `ExamNotifier` ghi `thong_bao` `LichHenHoanThanh` (hằng ở `examination.constants.ts`) cho `lich_hen.benh_nhan_id`, `lich_hen_id` gắn, trong giao dịch HTK; **không** `email_thong_bao`; `EmailOutboxService` của booking chỉ quét bốn loại của booking nên bỏ qua loại mới (HDK-06) | Khi `notification` có worker: đăng ký thêm loại và mẫu `678:2`; PLAN booking 5.12 thêm một dòng "sự kiện của doctor" (D2) |
| E7 | **Web: cắm giao diện vào trang của booking** | Đại duyệt 14/11/2026 (Q20) | Phương án C (**đã chọn**): `features/booking` import `../../../../doctor` **chỉ qua `index.ts`**: `ExamHeaderActions`, `ExamRecordCard` (Bác sĩ), `PatientExamSections` (Bệnh nhân); đổi `architecture.test.ts` (BWZ-08): thêm `'doctor'` vào `THROUGH_INDEX_ONLY` và đổi ca đối chứng `allowed('../../../doctor')` thành đúng, giữ cấm đi sâu vào `doctor` | `features/doctor/**` **không** import `features/booking` (chỉ `shared/routes/booking-paths`); props thuần (không kiểu của booking) |
| E8 | **Luật kiến trúc** | `doctor` (Trung) và `booking` (Đại) | **PD-19** của `doctor/architecture.spec.ts`: ngoại lệ **đúng một file** `doctor/examination/completion/exam-completion.service.ts` được nhắc `AppointmentTransitionService`, và chỉ gọi `complete` (AR-07 của booking vẫn Pass: `ALLOWED_OUTSIDE_METHODS` đã có `complete`); HD-08 (không `UPDATE lich_hen`, `UPDATE khung_gio`, `NOW()`) giữ nguyên và phủ cả thư mục mới | Kèm ca đột biến: đặt tên đó vào file khác của `doctor/` ⇒ test đỏ; sửa chỗ ngoại lệ ⇒ đỏ |
| E9 | **Điểm nối cho #9 (đổi lịch)** | `booking` (Đại, sau #7) | `ho_so_kham` và `danh_gia_bac_si` chỉ gắn lịch ở `DaTiepDon`/`HoanThanh`; `DaDoiLich` chỉ tới từ `DaXacNhan` ⇒ không bao giờ có hồ sơ/đánh giá mới; đổi lịch **không** sao chép, di chuyển, xoá; chuỗi `lich_hen_truoc_id` có tối đa MỘT lịch `HoanThanh`; `markReplaced` chỉ đổi trạng thái | HDK-11; ca biên Q16 (override rồi đổi lịch ⇒ hồ sơ mồ côi, **ẩn**, vô hại) |
| E10 | **`search`: điểm đánh giá** | scope này (B9) đổi; Trung duyệt | `DoctorRatingReader.readMany` giữ chữ ký (5.9); TBS-14 cập nhật; chi tiết công khai `GET /public/doctors/:id` đọc cùng reader | Tab "Đánh giá" công khai (nhận xét kèm tên) `[SAU]`: phải che tên người đánh giá khi làm |
| E11 | **`admin`** | Trung | `to` "Kiểm duyệt đánh giá" ở `admin-sidebar.tsx`; route bọc `AdminScopeGuard`; màn "Nhật ký hành động" `[SAU]` phải che nội dung `SuaGhiChuKham` (Q15); mã `AdminScope` đã có | Q41: ngoại lệ migration (Q10) |
| E12 | **`notification`** (sau) | — | Nhắc đánh giá; email "Hoàn thành lịch khám" (`678:2`); chuông thông báo hiển thị `LichHenHoanThanh` | Ghi vào TRACKING mục 7 |
| E13 | **`followup`** (Tái khám, sau) | — | Đọc `ho_so_kham.ngay_tai_kham_du_kien`; scope này chỉ lưu | Quy tắc ngày ở 5.2 |

### 5.11 Endpoint (tên `[đề xuất]` — Q22; tiền tố `/api` qua proxy)

| Vai trò | Endpoint | Use case | Thành công | Lỗi chính | Task |
|---|---|---|---|---|---|
| Bác sĩ | `POST /doctor/appointments/:maLichHen/complete` | HTK | 200 `{ maLichHen, trangThai }` | 404, 409 `CHUYEN_TRANG_THAI_KHONG_HOP_LE`, 503 | B1 |
| Bác sĩ | `PUT /doctor/appointments/:maLichHen/exam-record` | HSK | 200 hồ sơ | 400 `loi[]`, 404, 409 `KHONG_THE_GHI_HO_SO_KHAM`, 409 `HO_SO_KHAM_DA_THAY_DOI`, 503 | B2 |
| Bác sĩ | `GET /doctor/appointments[/:maLichHen]` (đã có; thêm `coHoSoKham`, `ghiChuKham` thật) | XHS (phía Bác sĩ) | 200 | (như B5) | B3 |
| Bệnh nhân | `GET /patient/exam-records` | XHS b1–b2, A1 | 200 | 400 | B4 |
| Bệnh nhân | `GET /patient/exam-records/:maLichHen` | XHS b3–b4, A2 | 200 | 404 | B5 |
| Bệnh nhân | `POST /patient/exam-records/:maLichHen/rating` | DGB | 201 | 400 `loi[]`, 404, 409 `LICH_HEN_CHUA_HOAN_THANH`, 409 `DA_DANH_GIA` | B6 |
| Quản trị viên | `GET /admin/doctor-ratings` | KDD b1 | 200 | 400 | B7 |
| Quản trị viên | `GET /admin/doctor-ratings/:id` | KDD b2 | 200 | 404 | B7 |
| Quản trị viên | `POST /admin/doctor-ratings/:id/hide` | KDD b2–b5, A1 | 200 | 400 `LY_DO_*`, 404, 409 `DANH_GIA_DA_AN`, 503 | B8 |
| Công khai | `GET /public/doctors`, `/public/doctors/:id` (đã có; `danhGia` thật) | DGB (hậu điều kiện) | 200 | — | B9 |

Mọi route mới: `@Roles(...)` ghi **trên từng route** (khách ⇒ 401, sai vai trò ⇒ 403; guard chạy trước pipe); không `@Public`; `Cache-Control: no-store`; id BIGINT dạng chuỗi; mã lịch qua `ParseAppointmentCodePipe`; không `OriginGuard` (xác thực bằng header `Authorization`, không cookie ⇒ không CSRF; như các route booking).

### 5.12 Thông báo và nhật ký

| Sự kiện | Khi nào | Gửi cho | Nội dung (`[đề xuất]`, ≤ 500, một dòng, không dữ liệu khám) | Ghi chú |
|---|---|---|---|---|
| `thong_bao` `LichHenHoanThanh` | HTK `Completed`, trong giao dịch | tài khoản đặt (`lich_hen.benh_nhan_id`) | "Lịch hẹn `<mã>` đã hoàn thành. Bạn có thể xem hồ sơ khám bệnh và đánh giá bác sĩ trong mục Hồ sơ khám bệnh." (mã qua `toSingleLine`) | Gắn `lich_hen_id`; UNIQUE chống ghi kép; **không** email (E6) |
| `nhat_ky_hanh_dong` `SuaGhiChuKham` | HSK sửa khi lịch `HoanThanh` và đã có hồ sơ | — | `{ truoc: {…các trường có đổi}, sau: {…cùng khoá} }`, `branchId` = chi nhánh của lịch, `targetId` = `ho_so_kham_id` | **Có nội dung khám** (Q15, L3): dòng nợ TECH_DEBT; màn nhật ký phải che |
| `nhat_ky_hanh_dong` `AnDanhGia` | KDD ẩn | — | `{ truoc: { bi_an: false }, sau: { bi_an: true }, ly_do, bac_si_id }`, `branchId` = chi nhánh của lịch, `targetId` = `danh_gia_bac_si_id` | Không tên, SĐT, nhận xét |

Không nhật ký cho: hoàn thành ca khám, ghi lần đầu, sửa khi `DaTiepDon`, gửi đánh giá, mọi lần đọc (booking Q28).

### 5.13 Frontend: cắm vào, route, chỗ cắm

- **Phương án C (Q20, Đại duyệt 14/11/2026).** `features/booking` chỉ import `features/doctor` qua `index.ts`; `features/doctor` không import `features/booking`; component nhận dữ liệu và hàm tải lại qua props, không dùng kiểu của booking. Trang chi tiết ca khám của Bác sĩ (`doctor-detail-page.tsx`): cột phải hàng tiêu đề đặt `<ExamHeaderActions maLichHen trangThai onChanged={reload} />`; thẻ `RecordCard` được thay bằng `<ExamRecordCard maLichHen trangThai nguoiKham={…} ghiChuKham={…} onChanged={reload} />` (cả hai từ `features/doctor`); `reload` là hàm tải lại của `useDoctorDetail`. Chip và bước "Hoàn thành" của timeline tự đổi theo dữ liệu tải lại. Trang chi tiết lịch hẹn của Bệnh nhân (F2): thay thẻ chữ tĩnh bằng `<PatientExamSections maLichHen trangThai />` **chỉ khi `HoanThanh`**; trạng thái khác giữ câu cũ.
- **Trang "Hồ sơ khám bệnh" của Bệnh nhân** (`/benh-nhan/ho-so-kham-benh`, `[đề xuất]`; hằng đường dẫn ở `features/doctor/examination/patient/`): bố cục hai cột như `414:2` (trái: bộ lọc người khám, lưới 12 tháng, danh sách; phải: ngăn chi tiết), bộ lọc người khám/năm/tháng **trong state của trang** (không lên URL), ca đang chọn lưu bằng `?ca=<maLichHen>` (mã lịch hẹn không phải dữ liệu sức khoẻ: booking đã đặt mã trên đường dẫn); route cắm ở khối `BenhNhan` của `router/role-routes.tsx`, `to` ở `PATIENT_NAV` ("Hồ sơ khám bệnh", `[ĐỤNG router]`); liên kết "Xem chi tiết lịch hẹn →" dùng `patientAppointmentDetailPath` của `shared/routes/booking-paths`.
- **Admin** (`/admin/kiem-duyet-danh-gia`): route bọc `AdminScopeGuard`, cắm ở khối `QuanTriVien`; `admin-sidebar.tsx` đặt `to` (một dòng, chuỗi viết tay như hai mục của doctor, để không import chéo). Cột "Chi nhánh" và lọc chi nhánh **chỉ khi `useAdminScope` là Toàn hệ thống**. Ô tìm `q` **không lên URL** (nếp F11), 300 ms.
- **Chung:** một lớp `exam-api.ts` gọi qua `shared/api/client`; bộ đọc phản hồi kiểm hình dạng (khoá thừa bị bỏ, khoá thiếu ⇒ phản hồi không dùng được); đủ trạng thái đang tải, rỗng, lỗi (thử lại), mất mạng (`OfflineBanner`), hết giờ (15 giây); **không tự gửi lại** `POST`/`PUT` khi lỗi mạng (có thể đã ghi): báo "chưa rõ đã lưu" và cho tải lại; chống bấm đúp (một lời gọi mỗi lần, nút vô hiệu khi đang gửi); hộp thoại qua `useModalDialog` (tiêu điểm, `Esc`, `inert` nền); huỷ yêu cầu cũ khi đổi bộ lọc hoặc rời trang (`AbortController`); **không** lưu nội dung hồ sơ, nhận xét vào `localStorage`/`sessionStorage`/`location.state`/URL; đếm ký tự bằng `string.length` (khớp máy chủ); chữ hiển thị qua React (không `dangerouslySetInnerHTML`; xuống dòng bằng `white-space: pre-wrap`). Chặn theo trạng thái: nút `Hoàn thành ca khám` chỉ khi `DaTiepDon`; `Ghi hồ sơ khám` khi `DaTiepDon`/`HoanThanh` chưa có hồ sơ; `Chỉnh sửa ghi chú` khi có hồ sơ và lịch ở hai trạng thái đó; `Đánh giá ngay` chỉ khi `coTheDanhGia`; `Ẩn` chỉ ở hàng `HienThi`. Backend vẫn kiểm lại tất cả.

### 5.14 Mã lỗi → thông báo (câu chữ `[đề xuất]`; nhóm duyệt và đưa vào Figma; Frontend chọn theo `maLoi`, không theo câu chữ)

| Mã | HTTP | Khi nào | Câu hiển thị |
|---|---|---|---|
| `KHONG_TIM_THAY` | 404 | không có / không phải của mình / ngoài phạm vi / mã sai dạng | "Không tìm thấy." (dùng chung) |
| `CHUYEN_TRANG_THAI_KHONG_HOP_LE` | 409 | HTK khi không ở `DaTiepDon` (`tuTrangThai`) | `HoanThanh`: "Ca khám này đã được hoàn thành." (tải lại, không đỏ); khác: "Chỉ hoàn thành được ca khám đã tiếp đón." |
| `KHONG_THE_GHI_HO_SO_KHAM` | 409 | HSK khi lịch không ở `DaTiepDon`/`HoanThanh` | "Chỉ ghi được hồ sơ khám khi bệnh nhân đã được tiếp đón hoặc ca khám đã hoàn thành." |
| `HO_SO_KHAM_DA_THAY_DOI` | 409 | HSK sửa chồng | "Hồ sơ khám vừa được cập nhật ở nơi khác. Hãy tải lại để xem bản mới nhất." (giữ nội dung đang nhập) |
| `DU_LIEU_KHONG_HOP_LE` + `loi[].ma` | 400 | thiếu/quá dài/sai ngày; thiếu sao; lý do ẩn | `BAT_BUOC`: "Vui lòng nhập …"; `QUA_DAI`: "Tối đa N ký tự."; `NGAY_KHONG_HOP_LE`: "Ngày tái khám không hợp lệ."; `SO_SAO_BAT_BUOC`: "Vui lòng chọn số sao."; `SO_SAO_KHONG_HOP_LE`; `LY_DO_BAT_BUOC`: "Vui lòng nhập lý do ẩn."; `LY_DO_QUA_NGAN`/`LY_DO_QUA_DAI` |
| `LICH_HEN_CHUA_HOAN_THANH` | 409 | DGB khi lịch chưa `HoanThanh` | "Chỉ đánh giá được ca khám đã hoàn thành." |
| `DA_DANH_GIA` | 409 | DGB lần hai | "Bạn đã đánh giá buổi khám này." (tải lại, hiện đánh giá đã gửi) |
| `DANH_GIA_DA_AN` | 409 | KDD ẩn lần hai | "Đánh giá này đã được ẩn." (tải lại) |
| `TRUONG_KHONG_DUOC_PHEP` | 400 | khoá lạ ở thân/query | (lỗi lập trình; thông báo chung) |
| `KHONG_DU_QUYEN` / 401 | 403/401 | sai vai trò / chưa đăng nhập | như toàn hệ thống |
| `HE_THONG_DANG_BAN` | 503 | hết lượt thử lại khoá | "Hệ thống đang bận, thử lại sau ít phút." |

### 5.15 Kiểm thử, việc phải **đo thật** trước khi viết mã, dữ liệu mẫu

**Nền test:** MySQL thật cho mọi ca có khoá, UNIQUE, CHECK, khoá hàng, chạy đua (`test:int`, `test:e2e`, DB riêng `clinix_exam_<task>_test`; **không** động DB `clinix` và `clinix_test`; **không** chạy hai vitest cùng lúc trên cùng DB); đồng hồ giả cho mọi ca giờ (`nowVN()`); `MailService` giả; Node 22.x. `jscpd` của CI quét cả `*.int-spec.ts` và `*.e2e-spec.ts`: dữ liệu và bước dùng chung đặt ở `doctor/examination/testing/` (`exam-world.ts` dựng lịch `DaTiepDon`/`HoanThanh` qua `AdminFixtures.appointment` và `booking-flow`). Cột `DATE` qua SQL thô phải `DATE_FORMAT`; id BIGINT giữ dạng chuỗi; **không có tiền** ở scope này (không `Number` cho tiền: không áp dụng). Mức kiểm: **ĐẦY ĐỦ** cho P1, B1, B2, B6, B8, B9 (đột biến, `test:int`, `test:e2e`, ca đồng thời chạy một mình, EXPLAIN cho câu mới); B3, B4, B5, B7 mức ĐẦY ĐỦ nhưng không có ca đồng thời riêng (int, e2e, EXPLAIN, đột biến); task web mức GỌN (đột biến bốn loại).

**Việc phải ĐO THẬT ở task X1 (chưa đo; spec đo tạm trong DB riêng, xoá sau khi đo; ghi số vào TRACKING mục 6):**

| M | Giả định cần đo | Cách đo | Trước task | Ngưỡng/Kỳ vọng `[đề xuất]` |
|---|---|---|---|---|
| M1 | `complete` đua `PUT exam-record` cùng lịch `DaTiepDon`: khoá `lich_hen` X tuần tự hoá, không deadlock chưa thử lại được | 40 vòng hai giao dịch song song; đếm 1213/1205, kết quả cuối | B1, B2 | 0 lỗi lọt ra; ghi số lần thử lại |
| M2 | `SELECT … FROM ho_so_kham WHERE lich_hen_id = ? FOR UPDATE` khi **chưa có dòng** dưới `READ COMMITTED`: không khoá khoảng chặn `INSERT` của lịch khác | hai giao dịch, hai `lich_hen_id` khác nhau | B2 | không chờ nhau |
| M3 | Khoá chia sẻ ngầm của khoá ngoại: `INSERT ho_so_kham`/`danh_gia_bac_si`/`thong_bao`/`nhat_ky_hanh_dong` xin S trên hàng cha (`lich_hen`, `tai_khoan`, `chi_nhanh`); `INSERT danh_gia_bac_si` chờ `PUT` đang giữ X trên `lich_hen` (ngắn) và không tạo chu trình | `SHOW ENGINE INNODB STATUS` / `performance_schema.data_locks` | B2, B6, B8 | không chu trình; thời gian chờ ≤ vài chục ms |
| M4 | `complete` đua **override** `DaTiepDon → VangMat` (khoá `benh_nhan` X rồi `lich_hen` X, so với `UPDATE lich_hen` xin S ngầm trên `benh_nhan`): có 1213, thử lại ≤ 2 đủ không | 40 vòng; đếm 1213, bên thua, 503 | B1 | không 500; 503 hiếm hoặc 0 |
| M5 | `ROUND(AVG(so_sao), 1)`: kiểu driver trả (chuỗi hay số), nửa làm tròn (4.25, 4.35, 4.45…), `"4.0"`; `COUNT(*)` kiểu | spec đo với 1 đến 7 đánh giá | B9 | chuỗi một chữ số thập phân; `Number(count)` |
| M6 | **EXPLAIN ANALYZE** câu điểm trung bình ở **100.000 lịch** (bộ nạp ở `reference_explain_loader_lich_hen`) và `[cần điền]` đánh giá (đề xuất 20.000), cho 1 bác sĩ và **50 bác sĩ**; hai kế hoạch (từ `lich_hen` theo `bac_si_id`, từ `danh_gia_bac_si`) | `EXPLAIN ANALYZE` | B9 | không quét toàn bộ `lich_hen` mà không lọc; ≤ 50 ms cho 50 bác sĩ; không đạt ⇒ dừng, Q9 |
| M7 | EXPLAIN danh sách Bệnh nhân (`lich_hen_index_9`, LEFT JOIN hai bảng, đếm 12 tháng bằng khoảng nửa mở, lựa chọn người khám `GROUP BY`) ở 100.000 lịch | `EXPLAIN ANALYZE` | B4 | dùng chỉ mục `(benh_nhan_id, trang_thai, thoi_gian)`; không filesort lớn |
| M8 | EXPLAIN danh sách kiểm duyệt (JOIN bốn bảng, `LIKE`, sắp `thoi_diem_tao DESC`, hai `COUNT`) ở 20.000 đánh giá; có cần chỉ mục mới không (đổi DDL: ba file docs) | `EXPLAIN ANALYZE` | B7 | ≤ 100 ms; cần chỉ mục ⇒ hỏi nhóm |
| M9 | `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`) với DTO của scope: chuỗi thiếu/`null`/số/mảng/rất dài; `@IsOptional` với `null` (xoá ngày tái khám); giới hạn kích thước thân JSON mặc định; **lỗi 400 không mang giá trị** | spec trên `configureApp` | B2, B6, B8 | `null` của `ngayTaiKhamDuKien` được nhận; thân 3 × 2.000 ký tự vào được |
| M10 | Khứ hồi UTF-8 (chữ có dấu, emoji 4 byte, xuống dòng) qua `text` `utf8mb4_unicode_ci` và qua `json` của nhật ký; xác nhận H2: `'a' = 'Á'` đúng ở collation này ⇒ so "không đổi" ở ứng dụng | spec đo | B2 | giữ nguyên từng ký tự |
| M11 | Múi giờ: `cap_nhat_lan_cuoi` ghi `toSecond(nowVN())` (đồng hồ giả 23:59:59 ngày cuối tháng) đọc lại ISO UTC; `DATE_FORMAT(ngay_tai_kham_du_kien)`; gom tháng theo `thoi_gian` (23:30 ngày cuối tháng) bằng khoảng nửa mở | spec đo | B2, B4 | đúng ngày/tháng giờ VN |
| M12 | `INSERT thong_bao` ngay sau `complete` không deadlock với `cancel`/override cùng lịch; chạy lại thân sau 1213 không ghi kép (UNIQUE) | 40 vòng | B1 | 0 thông báo kép |
| M13 | Luật kiến trúc: HD-08 (doctor) và AR-01/05/06/07 (booking) **không** bắt `SELECT … FROM lich_hen … FOR UPDATE` theo `lich_hen_id` ở `doctor/examination/`; PD-19 sau khi sửa | chạy `architecture.spec.ts` của hai module | P3 | Pass cả hai |
| M14 | Một câu `SELECT` nối ba bảng của `GET /patient/exam-records/:maLichHen` và kích thước phản hồi trang 50 dòng ở 100.000 lịch | `EXPLAIN ANALYZE` + đo | B5 | dùng PK/UNIQUE; < 20 ms |

**Dữ liệu mẫu:** test tự động **không** dùng seed. `seed:exam-demo` (B10, tuỳ chọn, Q25) idempotent, dùng `SEED_COMMANDS` như `doctor-demo`: vài lịch `DaTiepDon`/`HoanThanh` (có và không có hồ sơ, có và không có đánh giá, một đánh giá đã ẩn) cho tài khoản `dev-accounts` và bác sĩ `search-demo`; không chứa nội dung y tế thật (chỉ câu mẫu).

## 6. Kế hoạch task

### 6.1 Sơ đồ phụ thuộc (cùng một hàng = làm song song được)

```
Nền đã có: booking (ma trận + complete B11, B5 danh sách/chi tiết Bác sĩ, B15 thông báo, F11 trang Bác sĩ, F2 chi tiết Bệnh nhân) · admin (rbac, audit, entity lich_hen…)
           doctor phần lịch (DoctorModule, kiểm kiến trúc) · search (PublicDoctor*, DoctorRatingReader bản tạm) · auth, patient (khung Bệnh nhân)

Cụm 0 (nền):        P1 (bảng) ─┬─ P3 (module khung + hạ tầng test + PD-19) ─ X1 (đo M1–M14: M1, M3, M4, M9, M10, M12 trước B1/B2; M5, M6 trước B9; M7 trước B4; M8 trước B7)
                     P2 (nhật ký + tầng khoá 6b) ┘
Cụm 1 (Bác sĩ):     P3,X1 ─ B1 (hoàn thành) ─ F1 (nút + hộp)            [Q20 đã chọn: Phương án C]
                     P1,P2,P3,X1 ─ B2 (ghi/sửa hồ sơ) ─ F3 (hộp ghi)
                     F2 (thẻ hồ sơ chỉ đọc + bộ đọc) ─ B3 (B5 trả hồ sơ + cờ) ─ F4 (nhãn danh sách)    ← F2 TRƯỚC B3 (H6)
Cụm 2 (Bệnh nhân):  P1,P3 ─ B4 (danh sách) ─ B5 (chi tiết) ─ F5 (trang Hồ sơ khám bệnh)
                     P1,P3 ─ B6 (gửi đánh giá) ; B5,B6 ─ F6 (thẻ hồ sơ + đánh giá ở chi tiết lịch hẹn)
Cụm 3 (Admin, search): P1,P3 ─ B7 (danh sách/chi tiết) ─ B8 (ẩn) ; B7 ─ F7 (trang) ─ F8 (hộp ẩn, cần B8)
                     P1 ─ B9 (search K5) ; P1 ─ B10 (seed, tuỳ chọn)
Cụm 4 (hoàn tất):   D1 (cùng P1/B2/B8) · D2 (cuối) · X2 (kiểm tay) ─ X3 (tổng kết, chạy lại HDK/DHK với booking thật)
```

Cột trạng thái: ☐ = chưa làm, ☑ = đã merge. Rà lại 14/11/2026: **chỉ P1 đã làm xong** (tick ☑ trong PR của task, chờ merge; kết quả ở TRACKING mục 1, 2, 8.8); các task khác chưa làm. Mọi task `[CHỜ Qn]`/`[CHỜ Trung]` làm được phần độc lập (giá trị tạm theo đề xuất) nhưng **không merge** khi câu hỏi chưa được trả lời. Cột "Giờ" là ước `[đề xuất]` cho một phiên 3 đến 5 giờ; cột "Iter." là Iteration (6: 17/11 đến 23/11; 7: 24/11 đến 30/11; 8: 01/12 đến 07/12; mục 6.8); cột "Mức" là mức kiểm.

### 6.2 Nhóm P — Tiền đề

| ☐ | ID | Việc (file; chạm ngoài module; việc phải đo) | Phụ thuộc | Truy vết | Giờ | Iter. | Mức | Thẻ · PR gợi ý · test case |
|---|---|---|---|---|---|---|---|---|
| ☑ | P1 | **Migration + entity `ho_so_kham`, `danh_gia_bac_si`:** `doctor/entities/ho-so-kham.entity.ts`, `danh-gia-bac-si.entity.ts`; migration viết tay `1793…-tao-bang-ho-so-kham.ts` (DDL **nguyên văn** `clinix_mysql.sql` dòng 395–403 và 472–480, UNIQUE `lich_hen_id` mỗi bảng, hai khoá ngoại dòng 814 và 846, hai CHECK dòng 952 và 955); `down` xoá hai bảng; đăng ký `ENTITIES` và `MIGRATIONS` (`[ĐỤNG database]`: hai file, thực tế 6 dòng thêm); `schema-parity.int-spec.ts` khớp từng dòng; **chọn timestamp lớn hơn mọi migration đã merge lúc viết** (H13); **không** sửa `docs/database/*` (DDL đã có) | — (độc lập) | Q10; quy tắc 14, 15 | 3 | 6 | ĐẦY ĐỦ | `[TIỀN ĐỀ]` `[ĐỤNG database]` · `feat(db)` · MGK-01…MGK-09 (Pass 14/11/2026) |
| ☐ | P2 | **Nhật ký + tầng khoá `6b`:** `audit/audit-entry.ts` (`ChangeMap` + `SuaGhiChuKham`, `AnDanhGia`; `TargetMap` + `ho_so_kham`, `danh_gia_bac_si`), `audit/audit-validation.ts` (`validateChanges`: tập khoá `truoc`/`sau` bằng nhau và ⊂ bốn trường, giá trị `string \| null` ≤ 2.000; `AnDanhGia`: `truoc.bi_an=false`, `sau.bi_an=true`, `ly_do` 10–255, `bac_si_id` BIGINT), test audit (`[ĐỤNG audit]`, Trung); `appointments/locking/lock-order.ts` + `lock-order.spec.ts` (`[ĐỤNG booking]`: `LockTierId` + `'6b'`, `LOCK_ORDER` thêm hạng `6b`); **ENUM DB đã có, không migration**; kiểm lại ENUM thật bằng `SHOW COLUMNS` ở MGK-09 | — (độc lập) | Q15; booking 5.3 | 3 | 6 | ĐẦY ĐỦ | `[ĐỤNG audit]` `[ĐỤNG booking]` · `feat(audit)` · HDK-05, HDK-09, TDK-04, TDK-05 |
| ☐ | P3 | **`ExaminationModule` khung + hạ tầng test + PD-19:** `doctor/examination/examination.module.ts` (imports `AppointmentsModule`, `AuditModule`, `RbacModule`), `examination.constants.ts` (mã lỗi, giới hạn, sự kiện); **`doctor/doctor.module.ts` thêm MỘT dòng import `ExaminationModule`** (`[ĐỤNG doctor]`); `doctor/examination/testing/` (`exam-fixtures.ts`, `exam-world.ts`, `exam-concurrency.ts` dùng lại `appointments/testing/concurrency-harness.ts`, `exam-invariants.ts` IVK-01…IVK-05); test kiến trúc: bộ quét `@Roles` trên `doctor/examination/` (không route thiếu `@Roles`, không `@Public`), cây import không chu trình, không `UPDATE lich_hen`, không `NOW()`; **sửa PD-19** (`doctor/architecture.spec.ts`, `[ĐỤNG doctor]`): ngoại lệ đúng một file `examination/completion/exam-completion.service.ts`, kèm ca đột biến (E8). **Cần đo** M13 | P1 | E8; QHK-09 | 4 | 6 | ĐẦY ĐỦ | `[TIỀN ĐỀ]` `[ĐỤNG doctor]` `[CHỜ Q1]` · `test(doctor)` · QHK-09, HDK-04, IVK-01…IVK-05 |

### 6.3 Nhóm B — Backend

| ☐ | ID | Việc (file; chạm ngoài module; việc phải đo) | Phụ thuộc | Truy vết | Giờ | Iter. | Mức | Thẻ · PR gợi ý · test case |
|---|---|---|---|---|---|---|---|---|
| ☐ | B1 | **Hoàn thành ca khám:** `doctor/examination/completion/` (`exam-completion.controller.ts`, `.service.ts`), `notifications/exam-notifier.ts` (hàm thuần dựng nội dung ≤ 500 + ghi `thong_bao`, nhận `em`); `POST /doctor/appointments/:maLichHen/complete` (5.4): đọc thường → `withBookingTransaction` → `complete` → `ExamNotifier` → ánh xạ kết quả; chạy lại thân an toàn; **cần đo** M1, M4, M12 | P3, X1; booking B11 ✓ | HTK b1–b5, A1; HĐK | 4 | 6 | ĐẦY ĐỦ | `[CHỜ Q5, Q17]` · `feat(doctor)` · HTK-01…HTK-12, DHK-01, DHK-09, TDK-01…TDK-03, TDK-06 |
| ☐ | B2 | **Ghi và sửa hồ sơ khám:** `doctor/examination/exam-record/` (`exam-record.rules.ts` thuần: chuẩn hoá, kiểm, `sameContent`, `diffForAudit`; `.dto.ts`, `.controller.ts`, `.service.ts`, `.repository.ts`); `PUT /doctor/appointments/:maLichHen/exam-record` (5.5): khoá `lich_hen` X → kiểm lại → `ho_so_kham` X → token → `INSERT`/`UPDATE` → nhật ký `SuaGhiChuKham`; **dòng nợ TECH_DEBT** (nhật ký chứa nội dung khám: Q15); **cần đo** M1, M2, M3, M9, M10, M11 | P1, P2, P3, X1 | HSK b1–b6, A1, A2; HĐK; quyết định 17/10 | 5 | 6 | ĐẦY ĐỦ | `[CHỜ Q2, Q3, Q4, Q15, Q16]` · `feat(doctor)` · HSK-01…HSK-20, DHK-02…DHK-05, DHK-10, DHK-11, TDK-04 |
| ☐ | B3 | **Booking B5 trả hồ sơ và cờ** `[ĐỤNG booking]`: `appointments/lists/doctor-appointments.repository.ts` (`LEFT JOIN ho_so_kham` ở câu chi tiết; `EXISTS` hoặc JOIN cho `coHoSoKham` ở câu trang, `DATE_FORMAT` cho `ngay_tai_kham_du_kien`), `doctor-appointment.mapper.ts` (`toDoctorDetail`, `toDoctorItem`), `doctor-appointments.dto.ts` (kiểu `ghiChuKham`, `coHoSoKham`), `testing/response-keys.ts` (thêm hằng `HEALTH_RECORD_KEY`); cập nhật DSB-06, DSB-08 (đang "Một phần") và `doctor-appointments.int-spec.ts`; **F2 phải merge trước**; EXPLAIN câu danh sách (không mất chỉ mục `(bac_si_id, thoi_gian)`) | P1, **F2** (H6); B2 (để có dữ liệu thật) | XDSPC; booking Q33; E2 | 4 | 6 | ĐẦY ĐỦ (không ca đồng thời riêng) | `[ĐỤNG booking]` `[CHỜ Q24]` · `feat(booking)` · HDK-01, HDK-02, QHK-08, XHS-14 |
| ☐ | B4 | **Bệnh nhân: danh sách hồ sơ khám:** `doctor/examination/patient-view/` (`patient-exam-records.{controller,service,repository,dto,mapper}.ts`); `GET /patient/exam-records` (5.6): lọc người khám/năm/tháng, `demTheoThang`, `nguoiKham`, sắp, phân trang; **cần đo** M7, M11 | P1, P3, X1 | XHS b1–b2, A1, A2 | 4 | 7 | ĐẦY ĐỦ (không ca đồng thời riêng) | `[CHỜ Q6, Q18, Q21]` · `feat(doctor)` · XHS-01…XHS-05, XHS-08, XHS-11…XHS-13, QHK-03, QHK-05 |
| ☐ | B5 | **Bệnh nhân: chi tiết hồ sơ và đánh giá:** `GET /patient/exam-records/:maLichHen` (5.6): một câu `SELECT` nối; `hoSoKham`, `danhGia`, `coTheDanhGia`; 404 cùng thân; **cần đo** M14 | B4 | XHS b3–b4, A2; DGB (đọc) | 3 | 7 | ĐẦY ĐỦ (không ca đồng thời riêng) | `[CHỜ Q19, Q21]` · `feat(doctor)` · XHS-06, XHS-07, XHS-09, XHS-10, XHS-14, DHK-05 |
| ☐ | B6 | **Gửi đánh giá:** `doctor/examination/rating/` (`rating.rules.ts` thuần, `.dto.ts`, `.controller.ts`, `.service.ts`, `.repository.ts`); `POST /patient/exam-records/:maLichHen/rating` (5.7): sở hữu trước trạng thái, `INSERT`, 1062 ⇒ `DA_DANH_GIA` | P1, P3, X1 | DGB b1–b5, A1, A2 | 4 | 7 | ĐẦY ĐỦ | `[CHỜ Q7]` · `feat(doctor)` · DGB-01…DGB-15, DHK-06, DHK-11, DTB-06 |
| ☐ | B7 | **Admin: danh sách và chi tiết đánh giá:** `doctor/examination/moderation/` (`admin-ratings.{controller,service,repository,dto}.ts`); `GET /admin/doctor-ratings`, `GET /admin/doctor-ratings/:id` (5.8): `AdminScopeCtx`, `BranchAccessPolicy.branchFilter`, `LIKE` thoát ký tự, `demTheoTrangThai`; **cần đo** M8 | P1, P3, X1 | KDD b1–b2 | 4 | 7 | ĐẦY ĐỦ (không ca đồng thời riêng) | `[CHỜ Q8]` · `feat(doctor)` · KDD-01…KDD-03, KDD-11, KDD-12, QHK-06, QHK-07, QHK-11 |
| ☐ | B8 | **Admin: ẩn đánh giá:** `rating-hide.service.ts`, route `POST /admin/doctor-ratings/:id/hide` (5.8): `danh_gia_bac_si` X → `UPDATE … AND bi_an = 0` → nhật ký `AnDanhGia`; lý do 10–255; không route hiện lại | B7, P2 | KDD b2–b5, A1; HĐK | 4 | 7 | ĐẦY ĐỦ | `[CHỜ Q8]` · `feat(doctor)` · KDD-04…KDD-10, KDD-13…KDD-15, DHK-07, DHK-08, TDK-05, DTB-03 |
| ☐ | B9 | **`search` K5: điểm đánh giá thật** `[ĐỤNG search]`: `search/ratings/doctor-rating.reader.ts` (đổi thân hàm, giữ chữ ký, 5.9), `doctor-rating.reader.spec.ts` (TBS-14 đổi sang int-spec + thêm ca); chạy lại TBS-07 và các ca `diemTu`, `danhGiaCao`; **cần đo** M5, M6 (dừng nếu không đạt) | P1, X1 | PLAN `search` K5, Q16; DGB HĐK | 4 | 7 | ĐẦY ĐỦ | `[ĐỤNG search]` `[CHỜ Q9, Trung]` · `feat(search)` · DTB-01…DTB-10, HDK-08 |
| ☐ | B10 | **Seed `exam-demo` (tuỳ chọn, `[SAU]` nếu thiếu giờ):** `database/seeds/exam-demo-*.ts`, thêm vào `SEED_COMMANDS`, script `seed:exam-demo` (`[ĐỤNG database]`); idempotent; lịch hẹn chèn trực tiếp đúng hình dạng `booking-fixtures` (khung giờ `DaDat`, `khung_gio_dang_giu`); dòng `ho_so_kham`, `danh_gia_bac_si` (một đã ẩn) | P1, B2, B6 | Q25 | 3 | 8 | GỌN | `[ĐỤNG database]` `[CHỜ Q25]` · `feat(db)` · (int-spec seed như `doctor-demo.int-spec.ts`) |

### 6.4 Nhóm F — Frontend (bám frame Figma mục 4.4; trạng thái chưa có frame theo mục 4.5)

| ☐ | ID | Việc (file; chạm ngoài module) | Phụ thuộc | Truy vết | Giờ | Iter. | Mức | Thẻ · PR gợi ý · test case |
|---|---|---|---|---|---|---|---|---|
| ☐ | F1 | **Bác sĩ: `Hoàn thành ca khám`:** `features/doctor/examination/` (`index.ts`, `api/exam-api.ts` phần hoàn thành, `doctor/complete-action.tsx`, `complete-dialog.tsx`, `use-complete.ts`, `exam-messages.ts`); `features/doctor/index.ts` **thêm MỘT dòng `export * from './examination'`** (`[ĐỤNG doctor]`); `features/booking/appointments/doctor/detail/doctor-detail-page.tsx` đặt `<ExamHeaderActions>` (`[ĐỤNG booking]`); `features/booking/architecture.test.ts` đổi BWZ-08 (Q20 = Phương án C: thêm `'doctor'` vào `THROUGH_INDEX_ONLY`, sửa ca đối chứng `allowed('../../../doctor')` thành đúng, giữ cấm đi sâu vào `doctor`) | B1 (Q20 đã chọn Phương án C, 14/11/2026) | HTK b1, b3–b5, A1; Figma `459:2`, `461:2` | 4 | 6 | GỌN | `[ĐỤNG doctor]` `[ĐỤNG booking]` `[CHỜ Q5]` · `feat(doctor)` · WHT-01…WHT-09 |
| ☐ | F2 | **Bác sĩ: thẻ hồ sơ chỉ đọc + bộ đọc `ghiChuKham`:** `features/booking/appointments/doctor/api/doctor-appointment-detail-api.ts` (nhận `null` **hoặc** đối tượng; sai hình dạng ⇒ không dùng được), `doctor-appointment-types.ts`, `detail/record-card.tsx` (hiển thị bốn trường, "Cập nhật lúc …", bốn trạng thái của Q6, **chưa có nút ghi**), `detail-messages.ts`; sửa DAD-02, DAD-08 (`[ĐỤNG booking]`); `features/doctor/examination/doctor/exam-record-card.tsx` (phần chỉ đọc) + `index.ts` xuất | F1 (cần `index.ts` và luật BWZ-08 đã đổi ở F1, Q20) | XHS (phía Bác sĩ); Figma `462:2`, `464:2`, `459:2`; **merge TRƯỚC B3** | 2.5 | 6 | GỌN | `[ĐỤNG booking]` `[CHỜ Q6]` · `feat(doctor)` · WHS-01, WHS-08, WHS-10, BDK-09 |
| ☐ | F3 | **Bác sĩ: hộp `Ghi hồ sơ khám` và `Chỉnh sửa ghi chú`:** `doctor/exam-record-dialog.tsx`, `exam-record-form.ts` (kiểm ba trường, đếm ký tự, ngày), `use-save-record.ts`, nút trong `exam-record-card.tsx` (hộp nhận `maLichHen`, nội dung hiện có và `onChanged` qua props từ `ExamRecordCard`, không import `features/booking`: Q20); lỗi theo `loi[]` giữ nguyên nội dung; 409 `HO_SO_KHAM_DA_THAY_DOI`; gửi `capNhatLanCuoi`; Figma `460:2`, `463:2` | F2, B2, B3 | HSK b1–b5, A1, A2 | 5 | 6 | GỌN | `[CHỜ Q2, Q3]` · `feat(doctor)` · WHS-02…WHS-07, WHS-09 |
| ☐ | F4 | **Danh sách Bác sĩ: nhãn con theo `coHoSoKham`:** `features/booking/appointments/doctor/doctor-table.tsx`, bộ đọc dòng (nhận khoá mới, bỏ khoá lạ), `list-messages.ts` (`[ĐỤNG booking]`); Figma `457:2` | B3 | XDSPC; Q6 | 2 | 7 | GỌN | `[ĐỤNG booking]` · `feat(doctor)` · WHS-08 (phần danh sách) |
| ☐ | F5 | **Bệnh nhân: trang "Hồ sơ khám bệnh":** `features/doctor/examination/patient/` (trang, bộ lọc người khám, lưới 12 tháng, danh sách, ngăn chi tiết, đang tải/rỗng/lỗi/mất mạng, `patient-exam-routes.tsx` xuất `PATIENT_EXAM_ROUTES`), `api/exam-api.ts` phần Bệnh nhân; `router/role-routes.tsx` (route ở khối `BenhNhan`) và `router/role-nav.ts` (`to` của "Hồ sơ khám bệnh") **`[ĐỤNG router]`**; sửa `role-routes.test.tsx` PL-01 (số mục vô hiệu); Figma `414:2`, `415:2`, `443:2` | B4, B5 | XHS b1–b4, A1, A2 | 5 | 7 | GỌN | `[ĐỤNG router]` `[CHỜ Q6, Q22]` · `feat(doctor)` · WXH-01…WXH-09 |
| ☐ | F6 | **Bệnh nhân: thẻ hồ sơ và đánh giá ở chi tiết lịch hẹn:** `features/doctor/examination/patient/patient-exam-sections.tsx`, `rating-form.tsx`, `star-input.tsx`, `use-rating.ts`; `features/booking/appointments/patient/detail/` thay thẻ tĩnh khi `HoanThanh` (`[ĐỤNG booking]`; import `features/doctor` chỉ qua `index.ts`, Q20); lỗi `DA_DANH_GIA`; Figma `422:2`…`425:2` | B5, B6, F5 (dùng chung `exam-api`) | XHS b3–b4; DGB b1–b5, A1, A2 | 5 | 7 | GỌN | `[ĐỤNG booking]` `[CHỜ Q7, Q19]` · `feat(doctor)` · WDG-01…WDG-10, WXH-09 |
| ☐ | F7 | **Admin: trang "Kiểm duyệt đánh giá":** `features/doctor/examination/admin/` (trang, lọc, bảng, ngăn "Chi tiết đánh giá", rỗng/lỗi/đang tải, `reviews-routes.tsx` bọc `AdminScopeGuard`, `reviews-paths.ts`); `features/admin/components/admin-sidebar.tsx` đặt `to` (`[ĐỤNG admin]`); route ở khối `QuanTriVien` (`[ĐỤNG router]`); Figma `514:2`, `570:2`, `633:2` | B7 | KDD b1–b2 | 5 | 8 | GỌN | `[ĐỤNG admin]` `[ĐỤNG router]` `[CHỜ Q8, Trung]` · `feat(doctor)` · WKD-01…WKD-06, WKD-09, WKD-10 |
| ☐ | F8 | **Admin: hộp "Ẩn đánh giá":** `admin/hide-dialog.tsx`, `use-hide.ts`; lý do 10–255; lỗi theo `loi[]`; 409 `DANH_GIA_DA_AN`, 404; cập nhật hàng và `demTheoTrangThai`; Figma `571:2` | B8, F7 | KDD b2–b5, A1 | 3 | 8 | GỌN | `[CHỜ Q8]` · `feat(doctor)` · WKD-05…WKD-08 |

### 6.5 Nhóm D — Đồng bộ tài liệu (đi cùng PR của task code tương ứng; **phiên lập kế hoạch này không sửa các file dưới đây**)

| ☐ | ID | Việc | Đi cùng | Giờ | Iter. | Truy vết |
|---|---|---|---|---|---|---|
| ☐ | D1 | `[ĐỒNG BỘ TL]` **`docs/database/*` (cả ba file, chỉ ghi chú, KHÔNG sửa `CREATE TABLE`)** (nhớ: COMMENT của `CREATE TABLE` được `schema-parity` so với migration): `clinix_quy_tac_nghiep_vu.md` thêm quy tắc "Hồ sơ khám và đánh giá" (khoá `lich_hen` X trước ghi hồ sơ; ẩn đánh giá một chiều; điểm trung bình tính khi đọc loại `bi_an`; chỉ ghi hồ sơ khi `DaTiepDon`/`HoanThanh`; Lễ tân/Quản trị viên không đọc nội dung); `clinix_mysql.sql`, `clinix.dbml` thêm dòng lịch sử và ghi chú truy vấn mẫu; cập nhật ghi chú `ho_so_kham` ("chưa có mã triển khai" ⇒ đã có) | P1, B2, B8 | 2 | 7 | MGK; quy tắc 9, 14, 15 |
| ☐ | D2 | **Danh sách "Tài liệu cần đồng bộ" (làm ở PR sau, không ở PR kế hoạch):** (a) **2.4** (repo `TLCN_CLINIX`, người dùng làm): HSK (A2: 404 cùng thân vs "thông báo lý do"; sửa khi `DaTiepDon` có nhật ký không; giới hạn độ dài; khoảng ngày tái khám), HTK (không điều kiện thời gian), XHS A1 (L6), DGB b4 (nhận xét tuỳ chọn hay bắt buộc: L1; Bệnh nhân có thấy đánh giá bị ẩn: Q19), KDD (lý do tối thiểu: L2; phạm vi theo chi nhánh của lịch: L10; tên hiển thị); (b) **Figma** (nhóm): mục 4.5 và L1, L7, L8, L9; (c) **PLAN và TRACKING `booking`** (`[ĐỤNG booking]`, Đại; **hai cửa sổ B16a, B18 đang sửa các file này: làm sau khi hai PR đó vào `main`**): mục 5.10 D6 (đã gọi), 5.3 (tầng `6b`), 5.12 (một dòng "sự kiện của `doctor`"), 5.9/5.10 (B5: `ghiChuKham` và `coHoSoKham` đã có), 6.4 F11 và F2 (hộp, thẻ), 7.8 DSB-08, 7.44 DAD-02/DAD-08, TRACKING mục 5 (các hàng gửi `doctor` về B5 và F11, ở dòng 3724 và 3799 của `docs/features/booking/TRACKING.md` tại `cb8bf46` ⇒ "đã làm"), BWZ-08 (cho phép `doctor` qua `index.ts`); (d) **PLAN và TRACKING `doctor`** (`[ĐỤNG doctor]`, Trung): mục 1 "Không làm" trỏ sang `docs/features/doctor-exam/`, 5.10 D6 "đã có người gọi", `architecture.spec.ts` PD-19 (ngoại lệ), TRACKING mục 5 một hàng cho scope này; (e) **PLAN và TRACKING `search`** (`[ĐỤNG search]`, Trung): K5 xong (Q16), tab "Đánh giá" công khai `[SAU]`; (f) **PLAN `admin`** (`[ĐỤNG admin]`): "kiểm duyệt đánh giá" bỏ khỏi danh sách "không làm" (dòng 42), màn "Nhật ký hành động" phải che nội dung `SuaGhiChuKham`; (g) `docs/PLAN.md` (Phase 2 hoặc 3: dòng "Hồ sơ khám và đánh giá"), `docs/TRACKING.md` **đúng một dòng** khi cả scope xong; (h) `docs/TECH_DEBT.md` các dòng ở TRACKING mục 4 (số tiếp theo kiểm lại trên `main`); (i) `AI_USAGE_LOG.md` dòng 110 (hỏi Đại) và một dòng mỗi task | cuối cụm 3, trước X2 | 3 | 8 | Mọi task |

### 6.6 Nhóm X — Hoàn tất

| ☐ | ID | Việc | Phụ thuộc | Giờ | Iter. |
|---|---|---|---|---|---|
| ☐ | X1 | **Đo thật M1–M14** (mục 5.15) trên MySQL của compose bằng spec đo tạm (xoá sau khi đo, như nếp patient); ghi số vào TRACKING mục 6, sửa PLAN nếu khác dự đoán, chốt ngưỡng M6/M8; làm **trước B1, B2 (M1, M3, M4, M9, M10, M11, M12), B4 (M7), B5 (M14), B7 (M8), B9 (M5, M6)**; cần máy rảnh một lần (nhiều cửa sổ dùng chung MySQL) | P1, P3 | 4.5 | 6 |
| ☐ | X2 | **Kiểm tay trên Chrome thật** với tài khoản seed (`docker compose up --build`, `seed:catalog`, `dev-accounts`, `search-demo`, `doctor-demo`, `exam-demo` nếu có): tạo lịch, Admin override `DaXacNhan → DaTiepDon`; Bác sĩ ghi hồ sơ trước, hoàn thành, sửa sau (xem nhật ký bằng SQL), hai tab sửa chồng; Bệnh nhân xem hồ sơ (bản thân, người thân), "Chưa có hồ sơ khám", gửi đánh giá, điểm của bác sĩ đổi ở danh sách công khai; Admin lọc, ẩn, điểm đổi lại; Lễ tân không thấy nội dung; bố cục 1440 và 390 px; tương phản thật; trình đọc màn hình (sao là `radiogroup`) | Cụm 1–3 | 4 | 8 |
| ☐ | X3 | **Tổng kết:** chạy `lint`, `build`, `test`, `test:int`, `test:e2e` (api), `lint`, `test` (web), `npm run dup` (container Linux, theo CI); bộ quét toàn module **QHK-01, QHK-09, QHK-12, BDK-01…BDK-09, HDK-04, IVK-01…IVK-05**; chạy lại HDK/DHK với booking thật (B5, F2, F11 nối); điền TRACKING mục 2, 5; thêm **đúng một dòng** vào `docs/TRACKING.md`; thêm các dòng TECH_DEBT; ghi `AI_USAGE_LOG.md` đủ | Mọi task | 4 | 8 |

### 6.7 File của Trung (và file dùng chung) bị chạm, và cách tránh xung đột

Trung còn việc mở ở phần lịch làm việc: **F9** (nút Duyệt, `features/doctor/admin/approvals/*`, sau booking), **X2, X3, X4** (kiểm tay, tổng kết, `docs/TRACKING.md`); **F10 sẽ hết việc** vì booking F11 đã cắm route Lịch hẹn (đã nhắc ở TRACKING booking mục 5: Trung tick WK-08 và đóng #302 sau khi F11 vào `main`).

| File | Task | Sửa gì | Nguy cơ | Cách tránh / báo |
|---|---|---|---|---|
| `apps/api/src/doctor/doctor.module.ts` | P3 | **+1 dòng import** và **+1 phần tử** `ExaminationModule` ở `imports` | Trung thêm provider cho F9/B-task nếu có | Mã mới ở `ExaminationModule` riêng nên `providers` của Trung không đổi; `git pull` ngay trước khi sửa; báo Trung khi mở PR |
| `apps/api/src/doctor/architecture.spec.ts` | P3 | PD-19: ngoại lệ **một file** + ca đột biến | X4 của Trung chạy bộ quét này | Thêm mảng `ALLOWED_TRANSITION_FILES` (một dòng) thay vì sửa regex; **báo Trung trước** |
| `apps/api/src/audit/audit-entry.ts`, `audit-validation.ts`, `audit/test/*` | P2 | `ChangeMap`, `TargetMap`, `validateChanges`: +2 hành động | Hai PR cùng thêm hành động (booking B14 đã xong) | Mỗi hành động một khối riêng ở cuối `switch`; gộp `main` rồi chạy lại test audit |
| `apps/api/src/search/ratings/doctor-rating.reader.ts`, `.spec.ts` | B9 | đổi thân hàm, đổi TBS-14 | Trung sửa `search` K1/K2 song song | Chỉ **một** file mã và **một** spec; không đụng `public-doctor.*`, `doctor-list.rules.ts` |
| `apps/web/src/features/doctor/index.ts` | F1 | **+1 dòng** `export * from './examination'` | Trung thêm `export` khi làm F9 | Làm **một lần duy nhất** ở F1; các task sau chỉ sửa `examination/index.ts`; báo Trung |
| `apps/web/src/features/admin/components/admin-sidebar.tsx` | F7 | **+1 dòng** `to` ở mục "Kiểm duyệt đánh giá" | Trung sửa cùng file (hai mục của doctor đã sửa) | Một dòng; chuỗi viết tay như hai mục đã có |
| `apps/web/src/router/role-routes.tsx`, `role-nav.ts`, `role-routes.test.tsx` (PL-01) | F5, F7 | route ở khối `BenhNhan` và `QuanTriVien`; `to` ở `PATIENT_NAV`; số mục vô hiệu | **booking F8, F10, F11 cũng sửa** các file này | Mỗi PR một dòng route và một dòng `to`; gộp `main` rồi chạy lại PL-01, PL-09, PL-15, TT-63; ghi rõ ở mô tả PR |
| `apps/api/src/database/entities.ts`, `database/migrations/index.ts` | P1 | đăng ký hai entity, một migration | booking B16a, B18 nếu có migration | **Timestamp lớn hơn mọi migration đã merge**; merge theo thứ tự timestamp (H13) |
| `apps/api/src/appointments/**` (Đại) | P2, B3 | `lock-order.*`; `lists/doctor-appointments.*`, `testing/response-keys.ts` | Hai cửa sổ B16a, B18 sửa `appointments/` | `git log -- <file>` trước khi sửa; chỉ đụng các file kể trên; PR nhỏ |
| `apps/web/src/features/booking/**` (Đại) | F1, F2, F4, F6 | `doctor-detail-page.tsx`, `record-card.tsx`, `detail-messages.ts`, `doctor-table.tsx`, bộ đọc, chi tiết F2, `architecture.test.ts` | Đang yên (F11 đã merge) | Chỉ đụng các file kể trên |
| `docs/database/*` | D1 | chỉ ghi chú (không DDL) | B16a, B18 sửa docs? (chưa kiểm) | Làm ở PR riêng, `git pull` ngay trước |

**Nguyên tắc:** mọi mã mới ở thư mục mới (`doctor/examination/`, `features/doctor/examination/`); mỗi PR có file của Trung ghi `[ĐỤNG …]` ở mô tả; Đại **báo Trung trước khi mở PR** và Trung là người review/approve; sửa tối thiểu một dòng mỗi file dùng chung; `git fetch` và xem `git log origin/main -- <file>` đầu mỗi phiên.

### 6.8 Ước giờ và chia Iteration (`[đề xuất]`; Iteration một tuần, hạn mức mặc định 45 giờ/tuần `[đề xuất]`, Q13)

| Cụm | Task | Giờ |
|---|---|---|
| 0 — Nền | P1 3 · P2 3 · P3 4 · X1 4,5 | **14,5** |
| 1 — Bác sĩ | B1 4 · B2 5 · B3 4 · F1 4 · F2 2,5 · F3 5 · F4 2 | **26,5** |
| 2 — Bệnh nhân | B4 4 · B5 3 · B6 4 · F5 5 · F6 5 | **21** |
| 3 — Admin, search | B7 4 · B8 4 · B9 4 · F7 5 · F8 3 · (B10 3, tuỳ chọn) | **20** (23 với B10) |
| 4 — Tài liệu, hoàn tất | D1 2 · D2 3 · X2 4 · X3 4 | **13** |
| **Tổng** | | **95 giờ** (98 với B10) |

**Lịch Iteration và hạn mức giờ (Đại xác nhận 14/11/2026 qua phiên kiểm):** mỗi Iteration **một tuần**: **Iteration 6 = 17/11 đến 23/11** (đã có trong Project "CLINIX Sprint Board"), **Iteration 7 = 24/11 đến 30/11** và **Iteration 8 = 01/12 đến 07/12** (**chưa thêm vào Project**: việc của người dùng). Đại **chưa nêu số giờ mỗi tuần**, nên dùng **mặc định 45 giờ/tuần `[đề xuất]`**, chờ Đại đổi nếu muốn (đổi thì chia lại theo bảng dưới).

| Iteration | Task | Giờ | Ghi chú |
|---|---|---|---|
| **6** (17/11 đến 23/11) | P1, P2, P3, X1, B1, B2, B3, F1, F2, F3 | **39** | Nền và lõi Bác sĩ dùng được ngay (hoàn thành, ghi hồ sơ, hiển thị); ≤ 45 |
| **7** (24/11 đến 30/11) | F4, B4, B5, B6, B7, B8, B9, F5, F6, D1 | **37** | Bệnh nhân xem hồ sơ và đánh giá, backend kiểm duyệt, điểm đánh giá thật ở `search`; còn ≈ 8 giờ đệm cho rủi ro X1 (M6, M8 không đạt ⇒ đổi schema, cộng 4 đến 6 giờ) và hai cửa sổ booking |
| **8** (01/12 đến 07/12) | F7, F8, B10 (tuỳ chọn), D2, X2, X3 | **22** (19 nếu bỏ B10) | Giao diện Admin, seed, đồng bộ tài liệu, kiểm tay, tổng kết |

- **Iteration 6:** điều kiện: Q1, Q2, Q3, Q4, Q5 trả lời trước khi bắt đầu cụm 1 (Q10, Q11 đã ghi nhận 14/11/2026) (Q20 đã trả lời 14/11/2026); X1 cần máy rảnh một lần.
- **Iteration 7:** B7, B8, B9 (backend và `search`) ở đây để điểm đánh giá hiện ra sớm; giao diện Admin (F7, F8) để Iteration 8. Nếu Đại muốn dùng hết 45 giờ, kéo **F7 (5 giờ)** sang Iteration 7 (≈ 42 giờ).
- **Iteration 8:** D2 làm **sau khi** booking B16a và B18 đã vào `main` (hai PR đó đang sửa `docs/features/booking/*`, `docs/TECH_DEBT.md`, `AI_USAGE_LOG.md`); X2 cần F7, F8 xong.
- Không có task nào phụ thuộc scope #7. Rủi ro lệch: X1 (M6, M8 không đạt ngưỡng ⇒ đổi schema, cộng 4 đến 6 giờ và cần nhóm duyệt), hai cửa sổ booking B16a và B18 đang sửa `appointments/` và docs.

### 6.9 Thông tin để sinh issue (mỗi task một issue, nhãn `module:doctor`, milestone `doctor-exam` `[đề xuất]`, giao `MaxTrann`, Iteration theo mục 6.8; tiêu đề PR ≤ 100 ký tự và `Closes #<issue>` ở thân PR)

| ID | Tiêu đề PR (`feat(<scope>): …`) | Iteration | "Đóng khi" |
|---|---|---|---|
| P1 | `feat(db): thêm bảng hồ sơ khám và đánh giá bác sĩ (doctor-exam P1)` | 6 | Migration chạy lên/xuống được; `schema-parity` khớp DDL; MGK-01…MGK-09 Pass; entity đăng ký |
| P2 | `feat(audit): thêm nhật ký sửa hồ sơ khám và ẩn đánh giá (doctor-exam P2)` | 6 | Hai hành động ghi được, payload sai bị từ chối; tầng `6b` có trong `lock-order`; HDK-05, HDK-09, TDK-04, TDK-05 Pass |
| P3 | `test(doctor): dựng module khám bệnh và hạ tầng test (doctor-exam P3)` | 6 | `ExaminationModule` nạp được trong `AppModule`; PD-19 sửa kèm đột biến; QHK-09, HDK-04, IVK-01…IVK-05 Pass; M13 ghi |
| X1 | `test(doctor): đo khoá, chỉ mục và làm tròn phần khám bệnh (doctor-exam X1)` | 6 | M1–M14 có số đo ghi TRACKING mục 6; ngưỡng M6, M8 chốt; spec đo tạm đã xoá |
| B1 | `feat(doctor): xác nhận hoàn thành ca khám và thông báo kết quả (doctor-exam B1)` | 6 | HTK-01…HTK-12, DHK-01, DHK-09, TDK-01…TDK-03, TDK-06 Pass; đột biến bị bắt; `complete` là chỗ gọi duy nhất |
| B2 | `feat(doctor): ghi và sửa hồ sơ khám bệnh của bác sĩ (doctor-exam B2)` | 6 | HSK-01…HSK-20, DHK-02…DHK-05, DHK-10, DHK-11, TDK-04 Pass; dòng TECH_DEBT nhật ký chứa nội dung khám |
| B3 | `feat(booking): trả hồ sơ khám và cờ có hồ sơ ở lịch hẹn của bác sĩ (doctor-exam B3)` | 6 | HDK-01, HDK-02, QHK-08, XHS-14 Pass; DSB-06, DSB-08 cập nhật; EXPLAIN không mất chỉ mục |
| B4 | `feat(doctor): danh sách hồ sơ khám của bệnh nhân (doctor-exam B4)` | 7 | XHS-01…XHS-05, XHS-08, XHS-11…XHS-13 Pass; EXPLAIN M7 đạt |
| B5 | `feat(doctor): chi tiết hồ sơ khám và đánh giá của bệnh nhân (doctor-exam B5)` | 7 | XHS-06, XHS-07, XHS-09, XHS-10, XHS-14, DHK-05 Pass |
| B6 | `feat(doctor): bệnh nhân đánh giá bác sĩ sau ca khám (doctor-exam B6)` | 7 | DGB-01…DGB-15, DHK-06, DHK-11 Pass |
| B7 | `feat(doctor): danh sách và chi tiết đánh giá cho quản trị viên (doctor-exam B7)` | 7 | KDD-01…KDD-03, KDD-11, KDD-12, QHK-06, QHK-07, QHK-11 Pass; EXPLAIN M8 đạt |
| B8 | `feat(doctor): quản trị viên ẩn đánh giá kèm nhật ký (doctor-exam B8)` | 7 | KDD-04…KDD-10, KDD-13…KDD-15, DHK-07, DHK-08, TDK-05, DTB-03 Pass |
| B9 | `feat(search): điểm đánh giá bác sĩ đọc từ dữ liệu thật (doctor-exam B9)` | 7 | DTB-01…DTB-10, HDK-08 Pass; TBS-07 chạy lại Pass; M6 đạt ngưỡng |
| B10 | `feat(db): thêm seed exam-demo cho hồ sơ khám và đánh giá (doctor-exam B10)` | 8 | Lệnh chạy hai lần không trùng; int-spec seed Pass |
| F1 | `feat(doctor): nút và hộp xác nhận hoàn thành ca khám (doctor-exam F1)` | 6 | WHT-01…WHT-09 Pass; BWZ-08 đổi theo Q20 và ca đối chứng Pass; đột biến web đủ bốn loại bị bắt |
| F2 | `feat(doctor): thẻ hồ sơ khám chỉ đọc ở chi tiết ca khám (doctor-exam F2)` | 6 | WHS-01, WHS-08, WHS-10, BDK-09 Pass; DAD-02, DAD-08 cập nhật; merge trước B3 |
| F3 | `feat(doctor): hộp ghi và sửa hồ sơ khám của bác sĩ (doctor-exam F3)` | 6 | WHS-02…WHS-07, WHS-09 Pass |
| F4 | `feat(doctor): nhãn đã có hồ sơ khám ở danh sách lịch hẹn của bác sĩ (doctor-exam F4)` | 7 | Nhãn đúng cờ; WHS-08 (danh sách) Pass |
| F5 | `feat(doctor): trang Hồ sơ khám bệnh của bệnh nhân (doctor-exam F5)` | 7 | WXH-01…WXH-09 Pass; PL-01 cập nhật; menu "Hồ sơ khám bệnh" sáng |
| F6 | `feat(doctor): thẻ hồ sơ và đánh giá ở chi tiết lịch hẹn của bệnh nhân (doctor-exam F6)` | 7 | WDG-01…WDG-10 Pass; trang F2 không hỏng khi lỗi hai thẻ |
| F7 | `feat(doctor): trang Kiểm duyệt đánh giá của quản trị viên (doctor-exam F7)` | 8 | WKD-01…WKD-06, WKD-09, WKD-10 Pass; menu có `to`; Admin Chi nhánh không thấy cột/lọc chi nhánh |
| F8 | `feat(doctor): hộp ẩn đánh giá của quản trị viên (doctor-exam F8)` | 8 | WKD-05…WKD-08 Pass |
| D1 | `docs(db): đồng bộ quy tắc hồ sơ khám và đánh giá (doctor-exam D1)` | 7 | Ba file `docs/database/*` khớp nhau; không đổi `CREATE TABLE` |
| D2 | `docs(repo): đồng bộ kế hoạch khám bệnh với booking, doctor, search (doctor-exam D2)` | 8 | Mọi mục (a)–(i) của 6.5 xong hoặc có người nhận |
| X2 | `docs(doctor): kiểm tay phần khám bệnh trên Chrome (doctor-exam X2)` | 8 | Kịch bản 6.6 chạy hết; lỗi phát hiện có issue |
| X3 | `docs(doctor): tổng kết module khám bệnh (doctor-exam X3)` | 8 | Mọi lệnh ở 6.6 xanh; TRACKING mục 2, 5 điền; một dòng `docs/TRACKING.md` |

### 6.10 Việc nào bắt đầu ngay, việc nào phải chờ

- **Bắt đầu ngay (không chờ ai; Q10 và Q11 đã ghi nhận 14/11/2026):** P1, P2 (độc lập), P3, rồi X1; **F2** có thể soạn sớm (chỉ đọc, độc lập backend; Q20 đã chọn Phương án C nên import qua `index.ts` làm được ngay).
- **Chờ câu hỏi:** F1 (Q5), B2 (Q2, Q3, Q15), B6 (Q7), B8 (Q8), B9 (Q9 và kết quả M6), F7 (Trung xác nhận).
- **Chờ task trong scope:** B3 (F2), F3 (F2, B2, B3), F6 (B5, B6), F8 (B8).
- **Chờ module khác:** không có (booking B11 `complete` đã xong; B5, F11 đã xong). Nhớ **kiểm lại `origin/main` đầu mỗi phiên** (B16a, B18 đang vào `appointments/`).

## 7. Test case dự kiến

Loại: **U** đơn vị, **I** tích hợp (MySQL thật), **E** e2e qua `AppModule`, **W** web (Vitest + happy-dom). Mỗi test ghi mã ở tên. Mọi ca có đồng hồ giả; ca lỗi kiểm **thân** phản hồi (không chỉ mã HTTP) và **không có giá trị người dùng nhập**.

### 7.1 Ghi hồ sơ khám bệnh (HSK) — B2

| Mã | Ca | Kỳ vọng | Truy vết | Loại |
|---|---|---|---|---|
| HSK-01 | Ghi lần đầu khi lịch `DaTiepDon`, đủ ba trường | 200, một dòng `ho_so_kham`, `capNhatLanCuoi` = `toSecond(nowVN())`, **không** nhật ký, lịch vẫn `DaTiepDon` | b1–b5 | I, E |
| HSK-02 | Ghi lần đầu khi lịch `HoanThanh` | 200; **không** nhật ký (ghi lần đầu, Q3) | TĐK, HĐK | I |
| HSK-03 | Sửa khi `HoanThanh` và đã có hồ sơ | 200; một dòng nhật ký `SuaGhiChuKham` cùng giao dịch, `truoc`/`sau` chỉ có trường đổi, `branchId` = chi nhánh của lịch, `capNhatLanCuoi` mới | b6, HĐK | I, E |
| HSK-04 | Sửa khi lịch còn `DaTiepDon` | 200; **không** nhật ký | L4, Q3 | I |
| HSK-05 | Thiếu từng trường bắt buộc, và cả ba; chuỗi rỗng, chỉ khoảng trắng, chỉ xuống dòng, `null` | 400 `DU_LIEU_KHONG_HOP_LE`, `loi[{ truong, ma: BAT_BUOC }]` đủ từng trường; DB không đổi; thân không có giá trị | A1 | U, I, E |
| HSK-06 | `ngayTaiKhamDuKien` bỏ trống hoặc `null` | 200; lưu `NULL`; sửa gửi `null` xoá ngày cũ | MT | I |
| HSK-07 | Ngày tái khám sai: định dạng, ngày không có thật (2026-02-30), trước ngày khám, sau +365 ngày; đúng ở hai biên | 400 `NGAY_KHONG_HOP_LE`; hai biên được | L15 | U, I |
| HSK-08 | Độ dài: 2.000 đúng biên, 2.001; chữ có dấu, emoji | 2.000 được; 2.001 ⇒ `QUA_DAI`; đếm UTF-16 như máy chủ | Q2 | U, I |
| HSK-09 | Lịch ở `ChoThanhToan`, `DaXacNhan`, `DaHuy`, `VangMat`, `DaDoiLich` | 409 `KHONG_THE_GHI_HO_SO_KHAM` kèm `trangThai`; không dòng mới; **sau** kiểm sở hữu | A2, Q16 | I, E |
| HSK-10 | Lịch của bác sĩ khác / không tồn tại / mã sai dạng | 404 `KHONG_TIM_THAY` **cùng thân** ở cả ba; kiểm sở hữu trước trạng thái (lịch bác sĩ khác ở `DaXacNhan` vẫn 404, không 409) | A2, Q23 | I, E |
| HSK-11 | Hồ sơ còn khi Admin override đưa lịch khỏi `DaTiepDon`, rồi lịch quay lại `DaTiepDon` | dòng giữ nguyên; B5 không trả khi lịch ngoài hai trạng thái; trả lại khi quay về `DaTiepDon` | Q16 | I |
| HSK-12 | Gửi y hệt nội dung hiện có; khác chỉ hoa/thường hoặc dấu | y hệt ⇒ 200, **không** ghi, không nhật ký, `capNhatLanCuoi` không đổi; khác hoa/thường hoặc dấu ⇒ **được coi là đổi** (so `===`, không theo collation, H2) | Q3 | U, I |
| HSK-13 | Sửa chồng: token cũ; token `null` khi đã có hồ sơ; token khác `null` khi chưa có | 409 `HO_SO_KHAM_DA_THAY_DOI` cả ba; token khớp ⇒ 200 | Q3 | I, E |
| HSK-14 | **Độc lập với Hoàn thành:** (a) ghi → hoàn thành; (b) hoàn thành → ghi; (c) hoàn thành khi chưa có hồ sơ | (a) hồ sơ giữ nguyên; (b) Bệnh nhân thấy hồ sơ; (c) thành công, Bệnh nhân thấy "Chưa có hồ sơ khám", không có dòng `ho_so_kham` | quyết định 17/10 | I, E |
| HSK-15 | Khoá lạ ở thân (`lichHenId`, `bacSiId`, `benhNhanId`, khoá tuỳ ý) | 400 `TRUONG_KHONG_DUOC_PHEP`; `bacSiId` luôn từ token | AGENTS 4 | U, E |
| HSK-16 | Chuẩn hoá: `CRLF` ⇒ `LF`, ký tự điều khiển, tab, xuống dòng giữa chữ | lưu đúng; ký tự điều khiển bị bỏ; xuống dòng giữ | 5.2 | U, I |
| HSK-17 | Hàm thuần `canWriteRecord`, `isAuditedEdit` cho 7 trạng thái × (có, chưa có) | bảng đúng | Q3 | U |
| HSK-18 | `AuditService` lỗi (giả) khi sửa sau Hoàn thành | giao dịch hoàn tác: nội dung và `capNhatLanCuoi` cũ; 500 `LOI_HE_THONG` có `requestId`, không lộ nội dung | b6 | I |
| HSK-19 | Đồng hồ giả 23:59:59 ngày cuối tháng; đọc lại | `capNhatLanCuoi` đúng ISO của giờ VN; `ngayTaiKhamDuKien` đúng ngày (`DATE_FORMAT`) | H9, M11 | I |
| HSK-20 | 1062 giả ở `INSERT` (lưới an toàn) | 409 `HO_SO_KHAM_DA_THAY_DOI`, không 500 | 5.5 | U, I |

### 7.2 Xác nhận hoàn thành ca khám (HTK) — B1

| Mã | Ca | Kỳ vọng | Truy vết | Loại |
|---|---|---|---|---|
| HTK-01 | `DaTiepDon` của đúng bác sĩ | 200 `{ maLichHen, trangThai: 'HoanThanh' }`; lịch `HoanThanh`; khung giờ vẫn `DaDat`; **một** `thong_bao` `LichHenHoanThanh` cho `benh_nhan_id` (không cho bác sĩ, không cho người khác) | b1–b5 | I, E |
| HTK-02 | Hoàn thành khi **chưa có** hồ sơ | thành công; **không** tạo dòng `ho_so_kham` | quyết định 17/10 | I |
| HTK-03 | Hoàn thành khi đã có hồ sơ | hồ sơ và `cap_nhat_lan_cuoi` giữ nguyên | HĐK | I |
| HTK-04 | Lịch ở `ChoThanhToan`, `DaXacNhan`, `DaHuy`, `VangMat`, `DaDoiLich` **và `HoanThanh` (bấm lần hai)** | 409 `CHUYEN_TRANG_THAI_KHONG_HOP_LE` kèm `tuTrangThai`, `denTrangThai`; không ghi gì | A1 | I, E |
| HTK-05 | Lịch của bác sĩ khác / không tồn tại / mã sai dạng | 404 cùng thân; sở hữu trước trạng thái | A1, Q23 | I, E |
| HTK-06 | **Không điều kiện thời gian:** lịch `DaTiepDon` có `thoi_gian` ở tương lai và rất xa quá khứ | cả hai hoàn thành được (khớp `complete`); nếu nhóm đổi Q5 thì ca này đổi theo | Q5 | I |
| HTK-07 | Ghi `thong_bao` lỗi (giả) | **hoàn tác cả lần hoàn thành** (lịch còn `DaTiepDon`) | Q17 | I |
| HTK-08 | Thân chạy lại sau 1213 (giả lập) | một thông báo (UNIQUE), kết quả đúng | M12 | I |
| HTK-09 | Nội dung thông báo | ≤ 500, một dòng, không ký tự điều khiển, không triệu chứng, chẩn đoán, lý do khám, SĐT; mã lịch qua `toSingleLine` | H10 | U |
| HTK-10 | Lễ tân và Quản trị viên (override) chọn đích `HoanThanh` qua route của booking | 409 `CHI_BAC_SI_HOAN_THANH`; lịch không đổi (chạy lại ca của booking với module thật) | MT-03 | E |
| HTK-11 | Chuỗi khoá của HTK qua `lock-chain` | `lich_hen` (khoá) trước mọi `INSERT` bảng con; `findLockOrderViolation` = `null` | H1, E5 | I |
| HTK-12 | HTK không ghi `nhat_ky_hanh_dong`, không đụng `khung_gio`, không ghi `email_thong_bao` | số dòng ba bảng không đổi | 5.4 | I |

### 7.3 Xem hồ sơ khám bệnh (XHS) — B4, B5

| Mã | Ca | Kỳ vọng | Truy vết | Loại |
|---|---|---|---|---|
| XHS-01 | Danh sách chỉ lịch `HoanThanh` của `benh_nhan_id` = token (bản thân và người thân); `DaTiepDon`, `DaHuy`, lịch người khác không lọt | đúng tập; thứ tự `thoi_gian` giảm dần rồi id | b2, TĐK | I, E |
| XHS-02 | Mỗi dòng `coHoSoKham`, `daDanhGia` đúng; không nội dung hồ sơ trong danh sách | đúng cờ; không khoá `trieuChung`… | A2 | I |
| XHS-03 | Không có lịch `HoanThanh` nào | 200 `items: []`, `total: 0` (không 404) | A1 | I |
| XHS-04 | Lọc người khám (bản thân, người thân, id không thuộc mình), năm, tháng; `demTheoThang` | đủ 12 khoá; không phụ thuộc `thang`; lịch 23:30 ngày cuối tháng vào đúng tháng giờ VN | b1–b2, M11 | I |
| XHS-05 | Phân trang: `pageSize` 50 và 51; trang vượt cuối | 51 ⇒ 400; vượt cuối ⇒ rỗng; thứ tự ổn định | 5.6 | I |
| XHS-06 | Chi tiết: bốn trường, `capNhatLanCuoi`, `capNhatBoi`; chưa có hồ sơ | đủ nội dung; `hoSoKham: null` (không nội dung giả) | b4, A2 | I, E |
| XHS-07 | Chi tiết lịch người khác / chưa `HoanThanh` / không có / mã sai dạng | 404 `KHONG_TIM_THAY` cùng thân (cả bốn) | QHK | I, E |
| XHS-08 | Hồ sơ người thân đã ngừng dùng | vẫn xem được; bộ lọc có hồ sơ đó | Q18 | I |
| XHS-09 | Bác sĩ sửa hồ sơ rồi Bệnh nhân đọc | thấy bản mới và `capNhatLanCuoi` mới | b4 | I |
| XHS-10 | Phản hồi `Cache-Control: no-store`; không khoá thừa (id nội bộ, giá, SĐT/email người khác, `lyDoAn`, `biAn`) | đúng danh sách trắng | H3, H10 | I, E |
| XHS-11 | Bác sĩ, Lễ tân, Quản trị viên, khách gọi route Bệnh nhân | 403/401; guard trước pipe | QHK | E |
| XHS-12 | Query khoá lạ (`benhNhanId`, `bacSiId`) | 400 `TRUONG_KHONG_DUOC_PHEP` | AGENTS 4 | E |
| XHS-13 | `nam`, `thang` ngoài miền; `nguoiKham` sai dạng | 400 | 5.6 | U, E |
| XHS-14 | Hàng `ho_so_kham` có cột chữ `NULL` (dữ liệu từ nguồn khác) | không lỗi; trường trống hiển thị "Chưa ghi" | DB cho NULL | I, W |

### 7.4 Đánh giá bác sĩ (DGB) — B6

| Mã | Ca | Kỳ vọng | Truy vết | Loại |
|---|---|---|---|---|
| DGB-01 | Đánh giá 1, 3, 5 sao của lịch `HoanThanh` của mình | 201; một dòng; `bi_an = 0`, `ly_do_an` NULL; `thoi_diem_tao` giờ VN; điểm của bác sĩ đổi ngay (DTB-06) | b1–b5 | I, E |
| DGB-02 | Số sao thiếu, `null`, 0, 6, 3.5, `"3"`, âm | 400 `SO_SAO_BAT_BUOC`/`SO_SAO_KHONG_HOP_LE`; không dòng; thân không có giá trị | A2 | U, E |
| DGB-03 | Nhận xét tuỳ chọn: bỏ trống, chỉ khoảng trắng; 1.000 và 1.001 ký tự | rỗng ⇒ lưu `NULL`; 1.001 ⇒ `QUA_DAI` | L1, Q7 | U, I |
| DGB-04 | Lịch `DaTiepDon`, `DaXacNhan`, `DaHuy`, `VangMat` | 409 `LICH_HEN_CHUA_HOAN_THANH` kèm `trangThai` | A1 | I, E |
| DGB-05 | Đã có đánh giá | 409 `DA_DANH_GIA`; đánh giá cũ không đổi | A1 | I, E |
| DGB-06 | Lịch người khác / không có / mã sai dạng | 404 cùng thân; sở hữu **trước** trạng thái (lịch người khác ở `DaXacNhan` vẫn 404) | Q23 | I, E |
| DGB-07 | Lịch của hồ sơ người thân do mình quản lý | được | TĐK | I |
| DGB-08 | Bác sĩ (kể cả của lịch), Lễ tân, Quản trị viên, khách | 403/401 | QHK | E |
| DGB-09 | Hai lần gửi cùng lúc | một 201, một 409 `DA_DANH_GIA`; **một** dòng; không 500 (1062 ánh xạ) | DHK-06 | I |
| DGB-10 | Khoá lạ (`bacSiId`, `biAn`, `lichHenId`) | 400 `TRUONG_KHONG_DUOC_PHEP` | AGENTS 4 | E |
| DGB-11 | Đánh giá lâu sau Hoàn thành (đồng hồ giả +400 ngày) | được (không giới hạn thời hạn) | Q7 | I |
| DGB-12 | Ký tự điều khiển trong nhận xét; xuống dòng; emoji | điều khiển bị bỏ; xuống dòng và emoji giữ | 5.2 | U, I |
| DGB-13 | Lịch `HoanThanh` **không có hồ sơ** | vẫn đánh giá được (độc lập) | Q6 | I |
| DGB-14 | Hồ sơ người thân đã ngừng dùng | vẫn đánh giá được | Q18 | I |
| DGB-15 | CHECK của DB: ghi trực tiếp `so_sao` 0/6; `(bi_an, ly_do_an)` bốn tổ hợp | MySQL từ chối trái, nhận đúng (kiểm DB, không qua service) | MGK-03 | I |

### 7.5 Kiểm duyệt đánh giá (KDD) — B7, B8

| Mã | Ca | Kỳ vọng | Truy vết | Loại |
|---|---|---|---|---|
| KDD-01 | Danh sách: Toàn hệ thống thấy hết; Chi nhánh chỉ đánh giá của lịch có `chi_nhanh_id` = chi nhánh mình | đúng tập; `total` và `demTheoTrangThai` cũng chỉ trong phạm vi | b1, L10 | I, E |
| KDD-02 | Lọc `trangThai`, `soSao`, `bacSiId`, `chiNhanhId`, `q` (tên người đặt, nhận xét; ký tự `%`, `_`, `\` thoát; tiếng Việt không dấu khớp có dấu theo collation) | đúng; `demTheoTrangThai` áp mọi lọc **trừ** `trangThai`; sắp mới nhất trước | b1 | I |
| KDD-03 | Chi tiết: đủ trường, `lyDoAn` chỉ khi đã ẩn; ngoài phạm vi / không có / id sai dạng | đúng; ba loại lỗi ⇒ 404 cùng thân; không SĐT, email, `ly_do_kham` | b2 | I, E |
| KDD-04 | Ẩn đánh giá `HienThi` với lý do hợp lệ | 200; `bi_an = 1`, `ly_do_an` = lý do đã `trim`; **một** nhật ký `AnDanhGia` cùng giao dịch (`branchId` của lịch, `targetId`, trước/sau, `ly_do`, `bac_si_id`); điểm của bác sĩ loại đánh giá đó (DTB-03) | b5, HĐK | I, E |
| KDD-05 | Lý do thiếu, `null`, rỗng, chỉ khoảng trắng | 400 `LY_DO_BAT_BUOC`; `bi_an` giữ 0; không nhật ký | A1 | U, E |
| KDD-06 | Lý do 9, 10, 255, 256 ký tự | 9 và 256 ⇒ `LY_DO_QUA_NGAN`/`LY_DO_QUA_DAI`; 10 và 255 được | Q8 | U, I |
| KDD-07 | Ẩn lần hai | 409 `DANH_GIA_DA_AN`; **không** nhật ký thứ hai | Q8 | I, E |
| KDD-08 | Admin Chi nhánh ẩn đánh giá của chi nhánh khác | 404 cùng thân; không ghi | Q40 | I, E |
| KDD-09 | Hai Quản trị viên ẩn cùng lúc | một 200, một 409; **một** nhật ký | DHK-07 | I |
| KDD-10 | `AuditService` lỗi (giả) | hoàn tác `bi_an` | HĐK | I |
| KDD-11 | Bệnh nhân, Bác sĩ, Lễ tân, khách gọi route Admin | 403/401 (guard trước pipe, kể cả id sai dạng) | QHK | E |
| KDD-12 | `id` âm, 0, chữ, vượt BIGINT | 404 `KHONG_TIM_THAY` (theo `ParseRecordIdPipe`) | QHK | U, E |
| KDD-13 | **Không có** route hiện lại | `POST …/show`, `DELETE`, `PUT` ⇒ 404/405 | Q8 | E |
| KDD-14 | Ẩn không đổi `thoi_diem_tao`, `so_sao`, `nhan_xet` | giữ nguyên | b5 | I |
| KDD-15 | Bác sĩ có đánh giá 5, 4, 1: ẩn đánh giá 1 | `soDanhGia` 3 ⇒ 2, điểm `"3.3"` ⇒ `"4.5"` | b5 | I |

### 7.6 Điểm trung bình đọc cho `search` (DTB) — B9

| Mã | Ca | Kỳ vọng | Truy vết | Loại |
|---|---|---|---|---|
| DTB-01 | Bác sĩ không có đánh giá | `{ diemTrungBinh: null, soDanhGia: 0 }` | Q16 search | I |
| DTB-02 | Làm tròn một chữ số: (5+4)/2, (5+5+4)/3, 4.25, 3.35, số nguyên | `"4.5"`, `"4.7"`, nửa làm tròn theo `ROUND` đã đo ở M5, `"4.0"` (chuỗi có `.0`) | M5 | I |
| DTB-03 | Loại `bi_an = 1`; tất cả ẩn | trung bình và số lượt không tính; tất cả ẩn ⇒ `null`/0 | Q16 | I |
| DTB-04 | `readMany`: đủ mọi id đầu vào (kể cả không đánh giá), danh sách rỗng, id trùng | Map đủ khoá; rỗng ⇒ Map rỗng không SQL | chữ ký | U, I |
| DTB-05 | Đánh giá của bác sĩ khác không lẫn | nhóm đúng theo `lich_hen.bac_si_id` | 5.9 | I |
| DTB-06 | Gửi đánh giá rồi `GET /public/doctors` | điểm và số lượt mới ngay (không cache) | DGB HĐK | E |
| DTB-07 | Lọc `diemTu` và sắp `danhGiaCao` trên dữ liệu thật (chạy lại TBS-07) | đúng như hợp đồng cũ | search Q12 | E |
| DTB-08 | `GET /public/doctors/:id` | cùng số với danh sách | search B6 | E |
| DTB-09 | EXPLAIN ở 100.000 lịch và `[cần điền]` đánh giá, 1 và 50 bác sĩ | đạt ngưỡng M6 | M6 | I |
| DTB-10 | Phản hồi công khai không lộ `bi_an`, `ly_do_an`, nhận xét, tên người đánh giá | danh sách trắng | H3 | E |

### 7.7 Quyền và phạm vi (QHK)

| Mã | Ca | Kỳ vọng | Truy vết | Loại |
|---|---|---|---|---|
| QHK-01 | Mọi route mới × {Bệnh nhân, Bác sĩ, Lễ tân, QTV Toàn hệ thống, QTV Chi nhánh, khách} | đúng ma trận 2xx/403/401; guard **trước** pipe (mã sai dạng, thân sai vẫn 403) | E4 | E |
| QHK-02 | `bacSiId` ở thân/query của route Bác sĩ | 400 `TRUONG_KHONG_DUOC_PHEP` ở thân; danh sách của booking vẫn bỏ qua query (hành vi cũ) | AGENTS 4 | E |
| QHK-03 | `benhNhanId` ở query/thân của route Bệnh nhân | 400 | AGENTS 4 | E |
| QHK-04 | Bác sĩ B ghi hồ sơ/hoàn thành lịch của Bác sĩ A | 404 cùng thân với lịch không tồn tại | Q23 | I, E |
| QHK-05 | Bệnh nhân B đọc/đánh giá lịch của Bệnh nhân A (kể cả hồ sơ người thân của A) | 404 cùng thân | Q23 | I, E |
| QHK-06 | Admin Chi nhánh X xem/ẩn đánh giá của chi nhánh Y; Toàn hệ thống thấy cả hai | 404 cùng thân; Toàn hệ thống đúng | Q40 | I, E |
| QHK-07 | `chiNhanhId` ở query của Admin Chi nhánh | bị ép theo chi nhánh được gán | DSV-02 | I |
| QHK-08 | **Lễ tân và Quản trị viên không đọc nội dung hồ sơ:** quét phản hồi mọi route của hai vai trò (kể cả `GET /reception/appointments/:ma`, `GET /admin/appointments/:ma`) tìm khoá `trieuChung`, `chanDoanSoBo`, `huongXuLy`, `ghiChuKham` | không có; `HEALTH_RECORD_KEY` cấm | H10 | I, E |
| QHK-09 | Bộ quét `@Roles` trên `doctor/examination/` | không route thiếu `@Roles`, không `@Public`; **ca đột biến** (controller giả thiếu `@Roles`) bị bắt | AR-02 | U |
| QHK-10 | Bác sĩ đổi chi nhánh hoặc ngừng hoạt động (lịch cũ); bác sĩ bị khoá | ghi được hồ sơ lịch cũ của mình; bị khoá ⇒ guard chặn | H14 | I, E |
| QHK-11 | Admin ngoài phạm vi: `total`, `demTheoTrangThai`, danh sách | không rò số liệu của chi nhánh khác | L10 | I |
| QHK-12 | `Cache-Control: no-store` trên mọi 200, 400, 404, 409 của route mới | có | H3 | E |

### 7.8 Đồng thời (DHK) — chạy trên MySQL thật, **một mình**, mỗi ca 40 vòng `[đề xuất]`; sau mỗi ca chạy IVK-01…IVK-05

| Mã | Ca | Kỳ vọng | Truy vết | Loại |
|---|---|---|---|---|
| DHK-01 | Hai `complete` cùng lịch | một `Completed`, một 409; **một** thông báo; không 500 | M12 | I |
| DHK-02 | `complete` ‖ `PUT exam-record` cùng lịch `DaTiepDon` | cả hai thành công theo một thứ tự nào đó; cuối cùng `HoanThanh` và một hồ sơ; nhật ký có **iff** ghi sau Hoàn thành và đã tồn tại; 1213/1205 được thử lại, không lọt | M1 | I |
| DHK-03 | Hai `PUT` cùng token (hai tab) | một thắng, một `HO_SO_KHAM_DA_THAY_DOI`; một dòng; một nhật ký tối đa | HSK-13 | I |
| DHK-04 | Hai `PUT` lần đầu (token `null`) cùng lúc | một `INSERT`, một 409; không 500, không 1062 lộ | HSK-20 | I |
| DHK-05 | Bệnh nhân đọc ‖ Bác sĩ sửa | đọc thấy trọn bản cũ hoặc trọn bản mới (không lẫn trường); không bị chặn khoá | XHS-09 | I |
| DHK-06 | Hai lần gửi đánh giá cùng lịch | một dòng; một 201, một 409 | DGB-09 | I |
| DHK-07 | Hai lần ẩn cùng đánh giá | một nhật ký; một 200, một 409 | KDD-09 | I |
| DHK-08 | Ẩn ‖ đọc điểm trung bình liên tục | mỗi lần đọc thấy trước hoặc sau; **sau commit mọi lần đọc thấy sau** | b5 | I |
| DHK-09 | `complete` ‖ override Admin `DaTiepDon → VangMat` | đúng một kết quả hợp lệ; 1213 thử lại được, không lọt; không 503 trừ khi hết lượt | M4 | I |
| DHK-10 | `PUT exam-record` ‖ override Admin `DaTiepDon → DaXacNhan` | nếu `PUT` thắng: dòng tồn tại, lịch `DaXacNhan`, B5 không trả `ghiChuKham`; nếu override thắng: `PUT` 409 | Q16 | I |
| DHK-11 | Gửi đánh giá ‖ `PUT` hồ sơ cùng lịch `HoanThanh` | không deadlock; đánh giá chờ ngắn rồi thành công | M3 | I |

### 7.9 Bất biến (IVK)

| Mã | Bất biến | Truy vết | Loại |
|---|---|---|---|
| IVK-01 | Mỗi `lich_hen` có ≤ 1 `ho_so_kham` và ≤ 1 `danh_gia_bac_si` | quy tắc 15 | I |
| IVK-02 | Mọi `danh_gia_bac_si` thuộc lịch `HoanThanh` | quy tắc 8 | I |
| IVK-03 | `bi_an = 1` ⇔ `ly_do_an IS NOT NULL` | `chk_danh_gia_an` | I |
| IVK-04 | Số dòng `AnDanhGia` = số đánh giá `bi_an = 1`; mỗi `SuaGhiChuKham` thuộc một `ho_so_kham` tồn tại | 5.12 | I |
| IVK-05 | Mọi lịch `HoanThanh` đến từ `complete` (khoá khung giờ không đổi; `khung_gio` giữ `DaDat`) | AR-01, AR-07 | I |

### 7.10 Hợp đồng và cổng (HDK)

| Mã | Ca | Kỳ vọng | Truy vết | Loại |
|---|---|---|---|---|
| HDK-01 | B5 chi tiết: `ghiChuKham` `null` khi không có dòng **hoặc** lịch ngoài `DaTiepDon`/`HoanThanh`; đối tượng năm khoá khi có | **vẫn 11 khoá** cấp một | E2 | I, E |
| HDK-02 | B5 danh sách: `coHoSoKham` đúng cho `DaTiepDon` có hồ sơ, `HoanThanh` chưa có, trạng thái khác | 9 khoá mỗi dòng; **không** nội dung | E2 | I, E |
| HDK-03 | Bộ đọc web `parseDoctorAppointmentDetail` | nhận `null` và đối tượng đúng hình dạng; khác hình dạng ⇒ không dùng được | E2, H6 | W |
| HDK-04 | `complete` là chỗ DUY NHẤT: AR-07 và HD-08 Pass; PD-19 sau sửa chỉ cho phép đúng một file; đặt tên ở file khác ⇒ đỏ | Pass; ca đột biến đỏ | E8 | U |
| HDK-05 | `lock-order`: hạng `6b` có; chuỗi khoá HSK/DGB/KDD qua `findLockOrderViolation` = `null`; đảo thứ tự ⇒ có vi phạm | LOK | E5 | U, I |
| HDK-06 | `EmailOutboxService` với một `thong_bao` `LichHenHoanThanh` | bỏ qua (không gửi, không lỗi); số `email_thong_bao` không đổi | E6 | I |
| HDK-07 | AR-01/05/06 của booking không bắt `SELECT … FOR UPDATE` theo `lich_hen_id` ở `doctor/examination/` | Pass | M13 | U |
| HDK-08 | `DoctorRatingReader` giữ chữ ký `readMany(ids): Promise<Map>`; chỗ gọi của `search` không đổi | biên dịch và test cũ Pass | E10 | U |
| HDK-09 | Whitelist nhật ký: `SuaGhiChuKham`, `AnDanhGia` hợp lệ; payload sai (khoá thừa, `truoc`/`sau` lệch khoá, chuỗi quá dài, lý do ngắn) ⇒ `AUDIT_ENTRY_INVALID`; hành động khác vẫn `AUDIT_ACTION_UNSUPPORTED` | audit | E5 | U |
| HDK-10 | `GET /patient/appointments/:maLichHen` (B2) **không đổi**: đúng 16 khoá, không khoá hồ sơ/đánh giá | Q21 | E3 | E |
| HDK-11 | **Điểm nối #9:** lịch `DaDoiLich` thử ghi hồ sơ và gửi đánh giá; lịch có hồ sơ rồi đổi trạng thái | `DaDoiLich` bị từ chối (HSK-09, DGB-04: 409); hồ sơ không bị xoá khi lịch đổi trạng thái | E9 | I |
| HDK-12 | Số liệu: cùng một lịch, B5 (Bác sĩ), `GET /patient/exam-records/:ma` (Bệnh nhân), nhật ký thấy cùng nội dung hồ sơ | nhất quán | E2 | E |

### 7.11 Thông báo và nhật ký (TDK), bảo mật dữ liệu sức khoẻ (BDK), bảng và migration (MGK)

| Mã | Ca | Kỳ vọng | Truy vết | Loại |
|---|---|---|---|---|
| TDK-01 | `thong_bao` `LichHenHoanThanh`: người nhận, `lich_hen_id`, `loai_su_kien`, `trang_thai_doc = false` | đúng | Q17 | I |
| TDK-02 | Ghi hai lần cùng `(lich_hen, tai_khoan, loai)` | "đã có", không lỗi, một dòng | UNIQUE | I |
| TDK-03 | `noi_dung` ≤ 500, một dòng, không dữ liệu khám | đúng | H10 | U |
| TDK-04 | Nhật ký `SuaGhiChuKham`: chỉ trường đổi; không tên, SĐT, email; `branchId` của lịch | đúng; payload ≤ 4 khoá | Q15 | I |
| TDK-05 | Nhật ký `AnDanhGia`: `truoc`/`sau`/`ly_do`/`bac_si_id`; không nhận xét, không tên | đúng | Q8 | I |
| TDK-06 | HTK không ghi `email_thong_bao` | số dòng không đổi | E6 | I |
| TDK-07 | Không nhật ký cho: hoàn thành, ghi lần đầu, sửa khi `DaTiepDon`, gửi đánh giá, đọc | số dòng `nhat_ky_hanh_dong` không đổi | 5.12 | I |
| BDK-01 | Quét log toàn luồng (nếp `test/log-masking.e2e-spec.ts`): ghi hồ sơ, sửa, gửi đánh giá, ẩn, kể cả nhánh lỗi 400/409/500 | không chứa triệu chứng, chẩn đoán, hướng xử lý, nhận xét, lý do ẩn (chuỗi mẫu duy nhất) | H3 | E |
| BDK-02 | Không nội dung hồ sơ/nhận xét trong URL, query, tiêu đề | đúng (mọi nội dung ở thân) | H3 | E, W |
| BDK-03 | `Cache-Control: no-store` mọi route đọc/ghi mới | có (cùng QHK-12) | H3 | E |
| BDK-04 | Lỗi 400 không lặp lại giá trị người dùng nhập | chỉ `truong`, `ma` | `app.setup.ts` | E |
| BDK-05 | Danh sách (B5 Bác sĩ, Bệnh nhân, Admin) không có nội dung hồ sơ | đúng | H3 | I |
| BDK-06 | Lễ tân, Quản trị viên: không route nào trả nội dung hồ sơ (cùng QHK-08) | đúng | H10 | E |
| BDK-07 | Thông báo và thư không có nội dung khám | đúng (TDK-03) | H10 | U |
| BDK-08 | Nhận xét hiển thị bằng chữ thuần ở Admin (`<script>`, liên kết, HTML) | không thực thi, không thành liên kết | H12 | W |
| BDK-09 | Web không ghi nội dung hồ sơ/nhận xét vào `localStorage`, `sessionStorage`, `location.state`, URL, `document.title` | đúng | H3 | W |
| MGK-01 | `ho_so_kham` khớp DDL: cột, kiểu, NULL, UNIQUE `lich_hen_id`, FK | khớp từng dòng | quy tắc 15 | I |
| MGK-02 | `danh_gia_bac_si` khớp DDL: cột, kiểu, mặc định `bi_an`, UNIQUE, FK, hai CHECK | khớp | quy tắc 14, 15 | I |
| MGK-03 | CHECK thật: `so_sao` 0 và 6 bị từ chối, 1…5 nhận; `(bi_an, ly_do_an)` bốn tổ hợp | đúng | `chk_danh_gia_*` | I |
| MGK-04 | UNIQUE thật: hai dòng cùng `lich_hen_id` ở mỗi bảng ⇒ 1062 | đúng | quy tắc 15 | I |
| MGK-05 | `schema-parity.int-spec.ts` | Pass | TECH_DEBT dòng 8 | I |
| MGK-06 | `up` → `down` → `up`; `down` không để lại bảng | đúng | — | I |
| MGK-07 | `registry.spec.ts`: timestamp lớn hơn mọi migration; đăng ký đúng thứ tự | Pass | H13 | U |
| MGK-08 | Entity đăng ký ở `ENTITIES`; `registry.spec.ts` | Pass | — | U |
| MGK-09 | ENUM `nhat_ky_hanh_dong` thật có `SuaGhiChuKham`, `AnDanhGia`, `ho_so_kham`, `danh_gia_bac_si`; `admin/entities/enums.ts` khớp | Pass (không cần migration ENUM) | P2 | I |

### 7.12 Giao diện (WHT, WHS, WXH, WDG, WKD) — mức GỌN; đột biến bốn loại cho mỗi task

| Mã | Ca | Kỳ vọng | Truy vết | Loại |
|---|---|---|---|---|
| WHT-01 | Nút `Hoàn thành ca khám` **chỉ** khi `DaTiepDon` (bảy trạng thái; đột biến bỏ điều kiện) | đúng | HTK | W |
| WHT-02 | Hộp "Xác nhận hoàn thành?": `Xác nhận`, `Hủy`, `Esc`, tiêu điểm, nền `inert` | đúng | 461:2 | W |
| WHT-03 | Thành công: tải lại chi tiết; chip `Hoàn thành`; nút biến mất | đúng | b5 | W |
| WHT-04 | **Bấm đúp** `Xác nhận` | MỘT `POST` (đột biến bỏ khoá) | H3 | W |
| WHT-05 | 409 `CHUYEN_TRANG_THAI_KHONG_HOP_LE` với `tuTrangThai = HoanThanh` | thông báo "đã hoàn thành", tải lại, không đỏ | A1 | W |
| WHT-06 | 404, 403, 503, lỗi mạng, hết giờ | câu theo mã; **không tự gửi lại**; "chưa rõ" khi mạng | 5.13 | W |
| WHT-07 | Không nút khi `HoanThanh`, `DaXacNhan`, `DaHuy`, `VangMat`, `ChoThanhToan` | đúng | HTK | W |
| WHT-08 | Dữ liệu: không lưu gì vào storage/URL | đúng | BDK-09 | W |
| WHT-09 | Nhãn truy cập: nút và hộp có tên, vai trò `dialog`, trả tiêu điểm | đúng | a11y | W |
| WHS-01 | Thẻ hồ sơ: bốn trạng thái (trạng thái × có hồ sơ): câu và nút đúng | đúng Q6 | 459:2, 462:2, 464:2 | W |
| WHS-02 | Hộp ghi: ba trường `*`, ngày tuỳ chọn; thiếu ⇒ lỗi theo trường, **giữ nguyên nội dung** | đúng | A1 | W |
| WHS-03 | Hộp sửa tải sẵn nội dung và `capNhatLanCuoi` | đúng | 463:2 | W |
| WHS-04 | Gửi đúng thân, đúng `capNhatLanCuoi` (`null` khi chưa có) | đúng | Q3 | W |
| WHS-05 | 409 `HO_SO_KHAM_DA_THAY_DOI` | thông báo, **giữ nội dung đang nhập**, nút tải lại | Q3 | W |
| WHS-06 | **Bấm đúp** `Lưu ghi chú` | MỘT `PUT` | H3 | W |
| WHS-07 | Đếm ký tự bằng `length`; quá 2.000 ⇒ chặn gửi; ngày ngoài khoảng | khớp máy chủ | Q2 | W |
| WHS-08 | Bộ đọc: `ghiChuKham` đối tượng đúng hình dạng; nhãn con ở danh sách theo `coHoSoKham` | đúng | H6 | W |
| WHS-09 | Lỗi mạng khi lưu; sau khi tải lại, nội dung đã trùng với nội dung vừa nhập | "chưa rõ đã lưu", **không** tự gửi lại, giữ nội dung, cho tải lại; tải lại thấy trùng ⇒ báo đã lưu | 5.5, 5.13 | W |
| WHS-10 | Chặn theo trạng thái: `Ghi hồ sơ khám`/`Chỉnh sửa ghi chú` chỉ khi `DaTiepDon`/`HoanThanh` | đúng (đột biến) | Q16 | W |
| WXH-01 | Menu "Hồ sơ khám bệnh" có `to` và sáng; PL-01 cập nhật | đúng | 414:2 | W |
| WXH-02 | Danh sách theo tháng; lưới 12 tháng có số; chọn tháng/năm lọc | đúng | 443:2 | W |
| WXH-03 | Lọc người khám (bản thân, người thân, ngừng dùng) | đúng | Q18 | W |
| WXH-04 | Chọn ca ⇒ ngăn phải: bốn trường, "Cập nhật lần cuối … bởi …", liên kết "Xem chi tiết lịch hẹn" | đúng | 443:2 | W |
| WXH-05 | "Chưa có hồ sơ khám" (không nội dung); nhãn danh sách "Chưa có hồ sơ"/"Đã có hồ sơ" | đúng | A2 | W |
| WXH-06 | Đang tải, rỗng ("chưa có lịch hoàn thành"), lỗi + thử lại, mất mạng, hết giờ; đổi bộ lọc huỷ yêu cầu cũ | đúng | patient Q22 | W |
| WXH-07 | Liên kết sang `patientAppointmentDetailPath(ma)` đúng và mã được mã hoá | đúng | 5.13 | W |
| WXH-08 | Bộ lọc không lên URL; `?ca=` chỉ chứa mã lịch hẹn | đúng | BDK-02 | W |
| WXH-09 | Trang chi tiết F2: khi `HoanThanh` hiện thẻ hồ sơ thật và khối đánh giá; trạng thái khác giữ câu cũ; lỗi gọi `exam-records` chỉ hỏng hai thẻ | đúng | E3 | W |
| WDG-01 | `Đánh giá ngay` chỉ khi `coTheDanhGia` (đột biến) | đúng | 422:2 | W |
| WDG-02 | Form: năm sao là `radiogroup` (phím mũi tên), nhận xét tuỳ chọn, đếm `0/1000` | đúng | 423:2 | W |
| WDG-03 | Chưa chọn sao ⇒ lỗi, **giữ nhận xét** | đúng | A2 | W |
| WDG-04 | Gửi thành công ⇒ hiển thị "đã đánh giá" (sao, nhãn, ngày, nhận xét) | đúng | 424:2 | W |
| WDG-05 | 409 `DA_DANH_GIA` ⇒ tải lại, hiện đánh giá đã gửi; 409 `LICH_HEN_CHUA_HOAN_THANH`; 404 | đúng | A1 | W |
| WDG-06 | **Bấm đúp** `Gửi đánh giá` | MỘT `POST` | H3 | W |
| WDG-07 | Mất mạng: giữ nội dung, "chưa rõ", không tự gửi lại | đúng | 5.13 | W |
| WDG-08 | Đã đánh giá: không còn form; đánh giá bị ẩn vẫn hiển thị như cũ (Q19) | đúng | Q19 | W |
| WDG-09 | Nhận xét hiển thị chữ thuần, xuống dòng giữ | đúng | H12 | W |
| WDG-10 | Đếm 1.000 ký tự bằng `length` khớp máy chủ; chặn quá giới hạn | đúng | Q7 | W |
| WKD-01 | Menu "Kiểm duyệt đánh giá" có `to`; route bọc `AdminScopeGuard`; vai trò khác bị chặn | đúng | 514:2 | W |
| WKD-02 | Bảng: cột và lọc "Chi nhánh" **chỉ** Toàn hệ thống; Chi nhánh không thấy | đúng | 633:2 | W |
| WKD-03 | Chip đếm `HienThi`/`DaAn`; lọc sao, bác sĩ, trạng thái; ô tìm 300 ms, **không** lên URL | đúng | 514:2 | W |
| WKD-04 | `Xem` mở ngăn "Chi tiết đánh giá"; hàng `HienThi` có `Ẩn`, hàng `DaAn` chỉ `Xem` (đột biến) | đúng | 570:2 | W |
| WKD-05 | Hộp ẩn: lý do bắt buộc, 10–255, lỗi theo `loi[]`, giữ nội dung | đúng | 571:2 | W |
| WKD-06 | Ẩn thành công ⇒ hàng đổi, chip đếm đổi | đúng | b5 | W |
| WKD-07 | 409 `DANH_GIA_DA_AN` ⇒ tải lại; 404 ngoài phạm vi | đúng | A1 | W |
| WKD-08 | **Bấm đúp** `Xác nhận ẩn` | MỘT `POST` | H3 | W |
| WKD-09 | Đang tải, rỗng, lỗi + thử lại, mất mạng, hết giờ | đúng | patient Q22 | W |
| WKD-10 | Nhận xét chứa `<script>`, liên kết spam, HTML: hiển thị thuần, không thành liên kết | đúng | H12 | W |

## 8. Đề xuất gom cụm (chỉ đề xuất — nhóm chốt)

- **Cụm 0 — Nền:** P1, P2, P3, X1 (≈ 14,5 giờ). **Cụm 1 — Bác sĩ:** B1, B2, B3, F1, F2, F3, F4 (≈ 26,5 giờ; thứ tự F2 → B3). **Cụm 2 — Bệnh nhân:** B4, B5, B6, F5, F6 (≈ 21 giờ). **Cụm 3 — Admin và `search`:** B7, B8, B9, F7, F8, B10 (≈ 20 giờ, 23 với B10). **Cụm 4 — Tài liệu và hoàn tất:** D1, D2, X2, X3 (≈ 13 giờ).
- Cụm 1 đứng một mình đã cho Bác sĩ dùng được (hoàn thành, ghi hồ sơ, xem lại); cụm 2 mở cho Bệnh nhân; cụm 3 đóng vòng đánh giá (điểm ở danh sách công khai và kiểm duyệt).

## 9. Quy trình bắt buộc cho mỗi PR của scope

Theo AGENTS mục 5 và CONTRIBUTING: nhánh `feat/doctor-exam-<việc>` do Đại tạo (không làm trên `main`); viết test theo mã test case → code → chạy `lint`, `build`, `test` (và `test:int`, `test:e2e` khi task có DB) ở máy, báo kết quả **thật**; cập nhật `docs/features/doctor-exam/TRACKING.md` (ngày, việc, mã test case, pass/fail, vấn đề) và tick ☑ ở bảng task của PLAN này; cấu hình mới vào `.env.example` (scope này không có); lối tắt kỹ thuật vào `docs/TECH_DEBT.md` (số tiếp theo = số lớn nhất trên `main` lúc ghi + 1); một dòng `AI_USAGE_LOG.md` cho mỗi lần dùng AI có ảnh hưởng repo (ghi ở PR kế tiếp nếu chưa có số); tiêu đề PR `feat(<scope>): …` ≤ 100 ký tự và `Closes #<issue>` ở thân; **không** `@Ten` trần trong PR, issue, comment (dùng backtick); **người dùng tự** commit, push, mở PR (AI chỉ gợi ý nội dung); PR cần **người còn lại (Trung) approve** khi có file của Trung và CI xanh (7 check). Task web: `jscpd` và gitleaks do CI đo (không chạy tay Docker).

## 10. Điều kiện hoàn thành scope

- 5 use case chạy trọn trên môi trường `docker compose` với tài khoản seed (X2): Bác sĩ hoàn thành và ghi hồ sơ (trước và sau Hoàn thành), Bệnh nhân xem hồ sơ và đánh giá, Quản trị viên ẩn đánh giá, điểm đánh giá đổi đúng ở danh sách công khai.
- Mọi test case ở mục 7 có kết quả ở TRACKING mục 2 (Pass, hoặc `Fail`/`Một phần` kèm lý do); **không còn `[CHỜ …]`** ở PLAN; Q1 đến Q25 đã ghi ở TRACKING mục 3.
- `lint`, `build`, `test`, `test:int`, `test:e2e` (api) và `lint`, `build`, `test` (web) xanh; `jscpd` ≤ 3% và gitleaks do CI đo; bộ quét QHK, BDK, HDK, IVK xanh; mọi `[ĐỒNG BỘ TL]` và danh sách D2 xong hoặc có người nhận.
- Số đo M1–M14 ghi ở TRACKING mục 6; ngưỡng M6 và M8 đạt (hoặc nhóm đã duyệt đổi schema); `ghiChuKham` hết hằng `null` ở mọi nơi (API và web).
- Thêm **đúng một dòng** vào `docs/TRACKING.md`; thêm dòng `docs/TECH_DEBT.md`; `AI_USAGE_LOG.md` đủ.
