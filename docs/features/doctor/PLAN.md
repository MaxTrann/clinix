# Kế hoạch module `doctor` (phần lịch làm việc của bác sĩ)

> **Trạng thái: bản nháp 2 (08/11/2026).** Phiên kiểm độc lập bản nháp 1: **đạt**. Đại duyệt Q4–Q42 như đề xuất kèm các điều kiện ghi "Đã trả lời" cuối từng câu (quyết định cuối ở [`TRACKING.md`](TRACKING.md) mục 3). **Trung đã xác nhận ngày 08/11/2026: Q1, Q2, Q3, Q8, Q10, Q28, Q34, Q36 (kèm điều kiện ở `TRACKING.md` mục 3.1); M13 đọc mã thấy đúng sẵn (DH-04 còn chờ MySQL thật, không phải việc chờ Trung).** Còn mở: `[CHỜ Q5]` (chưa nêu với Trung, chỉ liên quan P3) và các thẻ `[CHỜ booking …]`, `[CHỜ notification]`, `[CHỜ search K1]`.
> Mục 5.10 **đã được phiên kiểm đối chiếu với PLAN `booking`** (08/11/2026): Khớp D1, D2, D4, D6 đến D12; Khác D3 (thêm `listMany`, `trangThaiNgay` 4 giá trị), D5 (thêm `now`); mới D13, D14. Phía `booking` sửa bằng PR riêng của phiên booking (PR này **không** sửa `docs/features/booking/*` và `docs/features/search/*`).
> **Người làm module: Trung (`junUTE`)**, full-stack. Bản kế hoạch này do Đại lập hộ (phiên Claude Code của Đại) rồi giao Trung. Câu hỏi "nhóm trả lời" thì hỏi Đại; riêng **Q1, Q2, Q3** và mọi chỗ chạm file của Trung (`admin/**`, `search/**`, `rbac/**`, `audit/**`, `docs/features/search/*`, `docs/database/*` phần admin) đã được **Trung xác nhận ngày 08/11/2026** (thẻ `[CHỜ Trung]` đã gỡ; xem `TRACKING.md` mục 3), trừ điểm chạm `rbac/` của P3 (Q5 chưa nêu với Trung).
> Kế hoạch do AI (Claude Code, Claude Sonnet 5.5) lập theo [`docs/FEATURE_PLANNING_PROMPT.md`](../../FEATURE_PLANNING_PROMPT.md) →
> **ghi nhật ký AI cho lần lập kế hoạch này (ở `AI_USAGE_LOG.md` của Đại) và cho mọi lần dùng AI sinh mã theo kế hoạch (người làm là Trung ⇒ `TRUNG_AI_USAGE_LOG.md`)** (CONTRIBUTING mục 4). Dòng của lần lập kế hoạch là **dòng 63** của `AI_USAGE_LOG.md` (dòng 62 giữ cho patient B7 ở PR của F8; nếu hai PR gộp khác thứ tự thì giữ cả hai dòng và sắp lại theo số; xem [`TRACKING.md`](TRACKING.md) mục 4 và mục 9.2).
> Đã kiểm mã thật ở commit `a621747` (= `origin/main` = PR 224, search F9; **không** tin ô tick của PLAN các module khác). Mọi chỗ ghi **"chưa đo"** là suy ra từ mã/tài liệu, **chưa chạy thử** trên MySQL thật; danh sách việc phải đo trước khi viết mã ở mục 5.15.
> PLAN `booking` đã merge (PR 223, `4b591b4`): **mục 5.10 của PLAN này đối chiếu từng điểm D1–D12 của `docs/features/booking/PLAN.md` mục 5.10**; chỗ nào khác đều ghi **"Khác với booking 5.10 ở …"** kèm lý do và đề xuất cụ thể (không im lặng đổi tên). Kết quả đối chiếu của phiên kiểm: xem ghi chú trạng thái ở đầu file.

## 0. Quy ước đọc

- Tên use case viết tắt trong cột "Truy vết": **PCLV** = Phân công lịch làm việc cho bác sĩ; **XLV** = Xem lịch làm việc; **TYN** = Tạo yêu cầu xin nghỉ phép; **PDN** = Phê duyệt yêu cầu nghỉ phép.
  `b4` = bước (4); `A1/4b` = luồng thay thế A1, mục 4b; "MT" = Mô tả; "TĐK" = tiền điều kiện; "HĐK" = hậu điều kiện. Số bước lấy đúng 2.4 bản Drive 03/11/2026 (nguyên văn trong prompt lập kế hoạch).
  PDN trong 2.4 **không đánh số luồng thay thế** (chỉ có A1 "không có yêu cầu Chờ duyệt"); luồng "Từ chối" của TYN A2 (`*a`, `*b`) thuộc PDN.
- Nguồn đúng khi lệch nhau: **schema DB (`docs/database/`) để code**; chỗ 2.4/schema/Figma lệch nhau ở mục 3.4 — đã hỏi ở mục 4.2. **Không tự chọn bên nào.**
- Thẻ: `[ĐỒNG BỘ TL]` = task phải cập nhật tài liệu (2.4, `docs/database/*`, Figma, sơ đồ) trong **cùng PR** (CONTRIBUTING mục 7); `[TIỀN ĐỀ]` = việc nền của module; `[CHỜ Qn]` = bị chặn bởi câu hỏi Qn;
  `[CHỜ Trung]` = cần Trung xác nhận (chạm file hay quyết định của Trung; các thẻ cũ đã gỡ 08/11/2026 vì Trung đã xác nhận, chỉ gắn lại nếu phát sinh điểm chạm mới); `[CHỜ booking Bn]`, `[CHỜ payment]`, `[CHỜ wallet]`, `[CHỜ notification]`, `[CHỜ search Kn]` = chờ module/task đó có mã;
  `[ĐỤNG x]` = sửa file thuộc module x (báo người sở hữu: `auth`, `patient`, `booking` là Đại; `admin`, `search`, `doctor` là Trung ⇒ với module này, `[ĐỤNG admin|search|rbac|audit]` là **Trung tự sửa file của mình**, vẫn ghi để hai PR không đụng nhau);
  `[ĐỤNG router]` = sửa `router/role-nav.ts`, `router/role-routes.tsx`, `router/routes.tsx` (dùng chung nhiều module, `booking` cũng sửa); `[ĐỤNG shared]` = sửa `shared/**`; `[ĐỤNG database]` = `database/entities.ts`, `database/migrations/index.ts`, `database/seeds/*`, `app.module.ts` (dùng chung);
  `[SOẠN TRƯỚC]` = viết/chạy test được ngay nhưng **chưa merge** khi phụ thuộc chưa có.
- Mỗi task = **một PR** nhỏ, **chỉ backend HOẶC chỉ frontend**, scope `doctor` (hạ tầng: `api`/`web`/`db`/`docs`; module khác bị chạm: `admin`, `search`, `rbac`, `audit`). Test đặt cạnh mã; mỗi test ghi mã test case ở mục 7.
- `[đề xuất]` = giá trị AI tự đề xuất, chưa chốt; `[cần điền]` = thiếu thông tin, chưa có đề xuất.
- Mã task: `P` nền, `B` backend, `F` frontend, `D` đồng bộ tài liệu, `X` kiểm tay và tổng kết (nếp của `patient`, `search`, `booking`).
- Tiền tố mã test case (đã kiểm bằng `grep` chưa dùng ở `apps` và `docs` ngày 08/11/2026): `PC` phân công, `SG` sinh khung giờ, `GC` luật giờ ca, `AV` khung giờ còn trống, `XL` xem lịch, `YN` tạo yêu cầu nghỉ, `PD` phê duyệt/từ chối, `QH` quyền và phạm vi, `MG` bảng và migration, `DH` đồng thời, `IV` bất biến, `HD` hợp đồng và cổng, `TD` thông báo và nhật ký, `BD` bảo mật dùng chung, `WK` khung Bác sĩ, `WL` web lịch, `WN` web nghỉ phép, `WA` web Admin.

## 1. Phạm vi

**Làm (4 use case của prompt):**
- **PCLV:** Quản trị viên phân công ca làm việc cho bác sĩ theo ngày và ca (theo Figma: **quy tắc lặp** khoảng ngày × thứ × ca × nhiều bác sĩ, được mở thành từng hàng `lich_lam_viec`; Q10) và gỡ ca (Q8); chi nhánh của ca **do hệ thống lấy** từ hồ sơ bác sĩ lúc phân công và lưu lại (không đổi theo hồ sơ về sau); kiểm A1 (quá khứ), A2 (trùng ca), A3 (chi nhánh nghỉ/chưa khai báo), A4 (ca không có khoảng nhận khám, Q6);
  "Xem trước" không ghi; **sinh `khung_gio`** cùng giao dịch (Q7); API đọc lịch cho Quản trị viên; frontend Admin ("Lịch làm việc bác sĩ", "Phân công ca").
- **XLV:** Bác sĩ xem lịch của **chính mình** (tuần/tháng, lọc ngày/ca/chi nhánh ghi trên ca, đánh dấu ngày nghỉ); Lễ tân xem bác sĩ thuộc phạm vi chi nhánh được gán và **chỉ các ca mang chi nhánh được gán**; phạm vi do backend kiểm trên từng yêu cầu; frontend Bác sĩ và Lễ tân.
- **TYN:** bảng + entity `yeu_cau_nghi_phep` (migration), Bác sĩ tạo yêu cầu (cả ngày nhiều ngày / theo ca một ngày, lý do), kiểm A1, xem danh sách/lịch sử/chi tiết yêu cầu của mình, thông báo tối thiểu; yêu cầu `ChoDuyet` **chặn khung giờ** (đọc, không đổi trạng thái khung giờ).
- **PDN:** Quản trị viên xem danh sách/chi tiết yêu cầu trong phạm vi, **Từ chối**, **Duyệt** (đổi trạng thái + gọi `booking` huỷ lịch hẹn bị ảnh hưởng) và cơ chế **chạy lại idempotent**. Phần Duyệt `[CHỜ booking B10, B11]`; Từ chối làm trước (Q26).
- **Nền dùng chung `apps/api/src/scheduling/`** (sở hữu của `doctor`, theo Q1): `SlotGeneratorService` (D1), luật giờ ca/khung giờ (D2), `AvailableSlotsReader` (D3), `LeaveReader` (D4), `ShiftQueries` (đọc ca dùng chung với `admin`); `booking` và `search` chỉ GỌI.
- **Khung Bác sĩ (web):** thay `RolePlaceholderPage` của `BacSi` bằng khung thật (`DoctorLayout`, dùng `RoleShell`), gắn trang "Lịch hẹn" của `booking` khi có (D8).
- **Dữ liệu mẫu:** lệnh seed `doctor-demo` (D9).

**Không làm (module khác; chỉ nêu cổng ở mục 5.10):** đặt lịch, giữ chỗ, **chuyển trạng thái `khung_gio`**, tạo/huỷ `lich_hen`, hoàn cọc (`booking`, `wallet`); đăng ký/mời danh sách chờ (`waitlist`); Trung tâm thông báo, email thật và worker gửi (`notification`/admin B9);
endpoint đọc khung giờ công khai và giao diện chọn khung giờ (`search` K1, K2); **phần khám bệnh của module `doctor`** (Xác nhận hoàn thành ca khám, Ghi hồ sơ khám: kế hoạch riêng sau, `booking` D6 `complete` do phần đó gọi); đổi chi nhánh công tác của bác sĩ và hồ sơ bác sĩ (`admin` B12–B13);
yêu cầu thay đổi chi nhánh (admin); khoá/mở khoá tài khoản bác sĩ (admin); lịch nghỉ lễ của chi nhánh (chưa có quyết định); **lệnh sinh lại khung giờ khi lịch hoạt động chi nhánh đổi** `[SAU]` (Q7);
Bác sĩ tự huỷ yêu cầu nghỉ (2.4 không có: Q23). Không có use case nào của module này **tải ảnh lên**, nên không có câu hỏi nơi lưu tệp.

## 2. Hiện trạng repo (đã kiểm ở `a621747`, 08/11/2026)

**API (`apps/api/src/`):**
- `auth` đủ A1–A15: guard toàn cục `JwtAuthGuard` + `RolesGuard`, `@Roles`, `@CurrentUser`, `@Public`; `AppException` + bộ lọc lỗi chuẩn (`COMMON_ERROR_CODES`, `loi[{truong, ma}]`); `MailService`. Vai trò đọc từ DB mỗi request.
- **Chưa có** thư mục `scheduling/` và `doctor/`. **Chưa có mã nào sinh `lich_lam_viec` hay `khung_gio`**: chỉ có `AdminFixtures.shift/slot` (test) và entity `LichLamViec`, `KhungGio` trong `admin/entities/` (comment ghi "Admin chỉ đọc… việc sinh và giữ chỗ thuộc service khác").
  **Chưa có** entity/migration `yeu_cau_nghi_phep` (kiểm bằng `grep` trong `database/migrations/*.ts`: 0 lần xuất hiện; bảng không nằm trong `tao-bang-van-hanh`). Có 5 migration (`1793001600000` … `1793188800000`) và `registry.spec.ts` bắt buộc đăng ký đúng thứ tự timestamp.
- `admin` (Trung): `admin/{branches, clinic-info, service-groups, services, specialties, system-config}`, `admin/entities/` (27 entity qua `database/entities.ts`), `rbac/` (`AdminScopeService`, `BranchAccessPolicy` có `branchFilter`/`assertCanSee`, `@RequireAdminScope('Any'|'ToanHeThong')`, `@AdminScopeCtx`: **chỉ phạm vi Quản trị viên, không có phạm vi Lễ tân**),
  `audit/` (`AuditService.record(manager, entry)`, buộc đang trong giao dịch; **whitelist đóng 11 hành động**, hành động khác bị `AUDIT_ACTION_UNSUPPORTED`), `pricing/`, `common/time` (`nowVN`, `todayVN`, `weekdayVN`, `toSecond`), `common/paging`, `database/mysql-errors.ts` (`isDuplicateKeyError` 1062, `isForeignKeyError`, `isDeadlockError` 1213, `isLockWaitTimeoutError` 1205).
  **Chưa có** API hồ sơ bác sĩ (PLAN `admin` B12, B13), tài khoản/nhân sự (B14–B20), yêu cầu thay đổi chi nhánh (B9–B11, B21, B22), `notification/`, `getPendingEffectiveChanges`. `admin/services` (B3) đã **chặn đổi `thoi_luong`** khi còn khung giờ tương lai/lịch hẹn hoạt động (`THOI_LUONG_DANG_DUNG`, Q16).
- `appointments/` (patient B5, hàm thuần nhận `EntityManager`): `ACTIVE_APPOINTMENT_STATES`, `findActiveAppointments`, `lockVisitProfile`, `isVisitProfileUsable`; **`booking` tiếp quản** (chưa có `AppointmentsModule`, chưa có `AppointmentCancellationService`, `AppointmentQueries`).
- `search` (Trung) 14/28 task: API công khai chi nhánh/chuyên khoa/nhóm dịch vụ/dịch vụ/bác sĩ/gợi ý/tổng quan; `search/common/weekly-schedule.view.ts` (`buildWeeklySchedule`, giờ dạng `'HH:MM'`) là **biểu diễn thứ ba** của lịch hoạt động nếu không thống nhất (mục 5.2). **Chưa có** K1 (khung giờ).
- `ScheduleModule.forRoot()` đã đăng ký **đúng một lần** ở `app.module.ts` (không gọi lần hai: mọi job sẽ chạy gấp đôi). `AppModule` import `SystemConfigModule`, `SpecialtyModule`, `ServiceGroupModule`, `ServiceModule`, `ClinicInfoModule`, `BranchModule`, `SearchModule`, `PatientModule`, `AuthModule`, `RbacModule`, `MailModule`, `UploadModule`.
- **Seed phát triển** (`database/seeds`, lệnh `catalog`, `dev-accounts`, `first-admin`, `config-dev`, `search-demo`; thêm lệnh = thêm vào `SEED_COMMANDS` ở `seed-config.ts` và script `package.json`): `catalog` có 3 nhóm × 1 dịch vụ (30 phút, 60 phút, 30 phút), 4 chi nhánh, lịch hoạt động T2–T7 08:00–12:00 + 13:00–17:00 (CN nghỉ); `search-demo`: 9 tài khoản bác sĩ (một người `ChoKichHoat`) trải trên 4 chi nhánh, thứ 7 chiều nghỉ ở chi nhánh 2, CN sáng ở chi nhánh 3, thứ 7 nghỉ ở chi nhánh 4; `dev-accounts`: `admin.system@`, `admin.branch@`, `doctor@`, `receptionist@`, `patient@example.invalid`
  (có hồ sơ vai trò, **mật khẩu do người chạy seed đưa vào qua biến môi trường**, không có trong repo). **Không có** `lich_lam_viec`, `khung_gio`, `yeu_cau_nghi_phep` trong mọi seed.
- Test: `AdminFixtures` (`admin/testing/admin-fixtures.ts`: `branch`, `weeklySchedule`, `catalog`, `patient`, `doctor`, `receptionist`, `admin`, `shift` — mặc định `ngay: '2026-11-02'`, `ca: 'CaSang'`, `chiNhanhId` của bác sĩ —, `slot` — mặc định 08:00 —, `appointment`), `database/testing/test-database.ts` (MySQL thật, DB `*_test`, tuần tự), `apps/api/test/*.e2e-spec.ts` qua `configureApp(app)` và `expectErrorResponse`.

**Web (`apps/web/src/`):**
- `router/role-routes.tsx`: khung **Bệnh nhân** (`PatientLayout`), **Lễ tân** (`ReceptionLayout`), **Quản trị viên** (`AdminLayout` + `ADMIN_ROUTES` bọc `AdminScopeGuard`) là khung thật; **`BacSi: { path: '/bac-si-portal', element: <RolePlaceholderPage /> }`** (đường dẫn `ROLE_HOME_PATHS.BacSi`).
  Module khác cắm trang cạnh `PATIENT_ROUTES`/`RECEPTION_ROUTES` và đặt `to` ở `router/role-nav.ts`. Menu Lễ tân "Lịch làm việc bác sĩ" **đang là nút vô hiệu**; menu Quản trị viên nằm ở **`features/admin/components/admin-sidebar.tsx`** (không ở `router/`): "Lịch làm việc bác sĩ" và "Duyệt yêu cầu" chưa có `to`.
- `shared/ui/role-shell.tsx` (`RoleShell`, `RoleNavItem { label, icon, to?, end? }`): thuần hiển thị, dùng cho Bệnh nhân/Lễ tân/**Bác sĩ**. Phần nối `useAuth()` + `useLogout()` nằm ở `features/patient/shell/role-layout.tsx` (**chỉ dùng trong module patient, không xuất qua `index.ts`**).
- `features/admin/index.ts` xuất `AdminConfirmationDialog`, `AdminDetailPanel`, `AdminSearchInput`, `AdminTable`, `AdminTableColumn` (kiểu), `AdminMe` (kiểu) (bề mặt công khai cho trang Admin); `AdminScopeGuard` (`admin-scope-guard.tsx`) và `useAdminScope` (`use-admin-scope.ts`) **có sẵn nhưng chưa xuất**; **chưa module nào** ngoài `admin` import. `features/` không import chéo nhau (CODING_CONVENTION mục 50); `router/` ghép các module.
- `shared/api/client.ts` (`request`, `DEFAULT_TIMEOUT_MS` 15 giây), `shared/ui` (`empty-state`, `error-state`, `loading-state`, `offline-banner`, `shell-content-error`), `usePageActive` của auth.
- ESLint của `apps/web` **không** có quy tắc chặn import chéo `features/` (kiểm `eslint.config.js`): chỉ là quy ước.

## 3. Phân tích ảnh hưởng

### 3.1 Bảng/cột module này chạm tới (đọc từ `docs/database/`, bản 20/10/2026 + các ghi chú đã cập nhật)

| Bảng | Cột / ràng buộc quan trọng | Module này làm gì |
|---|---|---|
| `lich_lam_viec` | `bac_si_id`, `chi_nhanh_id` (**chi nhánh lúc phân công, giữ nguyên khi bác sĩ đổi chi nhánh**), `ngay` (DATE), `ca` (`CaSang`, `CaChieu`, `CaToi`); UNIQUE `(bac_si_id, ngay, ca)`; chỉ mục `(chi_nhanh_id, ngay)`; **DB không chặn** phân công ngoài khoảng nhận khám (service kiểm) | **Ghi** (`INSERT`; `DELETE` theo Q8); đọc |
| `khung_gio` | `lich_lam_viec_id`, `ngay_gio` (DATETIME), `trang_thai` (`ConTrong`, `DaDat`, `DangGiuCho`, `HetHan`), `giu_cho_den`; UNIQUE `(lich_lam_viec_id, ngay_gio)`; chỉ mục `(trang_thai, ngay_gio)`, `(trang_thai, giu_cho_den)`; **khoá ngoại từ `lich_hen`, `yeu_cau_doi_lich_ngoai_chinh_sach`, `muc_cho_danh_sach_cho`** | **Ghi `INSERT`** (sinh); `DELETE` chỉ khi `ConTrong` và không bị tham chiếu (D7); **không `UPDATE` trạng thái** |
| `yeu_cau_nghi_phep` | `bac_si_id`, `hinh_thuc_nghi` (`CaNgay`, `TheoCa`), `ngay_bat_dau`, `ngay_ket_thuc`, `ca` (NULL khi `CaNgay`), `ly_do` text NOT NULL, `trang_thai` (`ChoDuyet`, `DaDuyet`, `TuChoi`), `nguoi_xu_ly_id` (→ `quan_tri_vien`), `thoi_diem_xu_ly`, `thoi_diem_tao` NOT NULL (không mặc định); CHECK `chk_nghi_phep_hinh_thuc`, `chk_nghi_phep_xu_ly`; chỉ mục `(bac_si_id, ngay_bat_dau, trang_thai)`. **Không có cột chi nhánh, không có lý do từ chối** | **Sở hữu** (migration + entity); ghi, đọc |
| `bac_si` | `chi_nhanh_id` (chi nhánh công tác **hiện tại**), `dich_vu_kham_id` (→ `thoi_luong`), `chuyen_khoa_id` | **Khoá `FOR UPDATE`** khi phân công/xoá ca/tạo và duyệt yêu cầu (tầng 4, D11); đọc chi nhánh và dịch vụ |
| `chi_nhanh_lich_hoat_dong` | PK `(chi_nhanh_id, thu_trong_tuan)` thứ ISO 1–7; `hoat_dong`; hai khoảng `gio_bat_dau_sang`/`gio_ket_thuc_sang`, `gio_bat_dau_chieu`/`gio_ket_thuc_chieu` (TIME); thứ **chưa có dòng = chưa khai báo** | Đọc: giờ ca = khoảng của chi nhánh trên ca (quy tắc 29, 39) |
| `dich_vu_kham` | `thoi_luong` (phút) | Đọc: độ dài khung giờ (`FOR SHARE` lúc sinh: mục 3.5 H4) |
| `chi_nhanh`, `tai_khoan`, `chuyen_khoa` | tên, trạng thái, họ tên | Đọc (hiển thị, người nhận thông báo) |
| `quan_tri_vien`, `le_tan` | `pham_vi_quan_tri`, `chi_nhanh_id` | Đọc phạm vi chi nhánh; chọn người nhận thông báo |
| `lich_hen` | `khung_gio_id` (FK, **lịch đã huỷ vẫn giữ**), `bac_si_id`, `trang_thai`, `thoi_gian` | **Không ghi, không đọc trực tiếp ở luồng duyệt** (đi qua `booking` D5/D13); FK chặn xoá khung giờ đã từng có lịch |
| `thong_bao` | `tai_khoan_id`, `noi_dung` ≤ 500, `loai_su_kien` (≤ 100), `trang_thai_doc`; chỉ có FK tham chiếu `yeu_cau_thay_doi_chi_nhanh_id`, **không có khoá cho nghỉ phép** | **Ghi** thông báo trong ứng dụng, cùng giao dịch (Q33) |
| `email_thong_bao` | một dòng/thông báo, `ChoGui`… | **Không ghi đợt này** (chưa có worker gửi: `[CHỜ notification]`) |
| `nhat_ky_hanh_dong` | `hanh_dong` (enum 20 giá trị, **không có giá trị cho phân công/nghỉ phép**), `loai_doi_tuong` (enum 9 giá trị, **không có `lich_lam_viec`, `yeu_cau_nghi_phep`**) | **Ghi** qua `AuditService` sau khi mở rộng enum (Q34, P4) |

### 3.2 Bảng ngoài danh sách prompt đã mở thêm (và lý do)

- `quan_tri_vien`, `le_tan`: phạm vi chi nhánh (Lễ tân xem lịch; Admin Chi nhánh phân công/duyệt) và danh sách người nhận thông báo "Quản trị viên có thẩm quyền".
- `thong_bao`: ghi thông báo trong ứng dụng cho bước (6) của TYN và kết quả duyệt/từ chối (prompt chỉ nêu `thong_bao`, `email_thong_bao`, `nhat_ky_hanh_dong` để hiểu; ở đây `thong_bao` được **ghi**).
- `dich_vu_kham`, `chi_nhanh_lich_hoat_dong`, `chi_nhanh`, `tai_khoan`, `chuyen_khoa`: đọc.
- `lich_hen` chỉ được nêu để hiểu ranh giới huỷ hàng loạt (prompt) và rủi ro khoá ngoại khi xoá khung giờ; **không viết SQL trực tiếp trên `lich_hen`** (mục 5.10, H6).

### 3.3 API/hành vi đã có hoặc đã chốt bị chạm tới

| Module / thành phần | Điểm chạm | Cách xử lý (không phá thiết kế đã chốt) |
|---|---|---|
| `auth` A4 — guard, `@Roles` | Mọi endpoint cần đăng nhập, theo vai trò | `@Roles('BacSi')`, `@Roles('LeTan')`, `@Roles('QuanTriVien')` ghi **trên từng route**; Quản trị viên thêm `@RequireAdminScope('Any')`. Chủ sở hữu **chỉ lấy từ access token** (`@CurrentUser`): Bác sĩ **không bao giờ gửi `bacSiId`** khi xem lịch/xin nghỉ của mình |
| `auth` P5 — lỗi chuẩn | Mã lỗi ổn định cho từng nhánh; lỗi theo trường `loi[{truong, ma}]` | `AppException(409, 'CA_DA_PHAN_CONG', …)`; UNIQUE/FK/deadlock đã lường trước không bao giờ ra 500 (mục 5.14) |
| `admin` Q41 — migration nền | Admin sở hữu migration các bảng nền; module khác không tạo lại | `lich_lam_viec`, `khung_gio` **đã có**, không tạo lại. **Ngoại lệ có chủ đích:** `yeu_cau_nghi_phep` chưa có ⇒ **module này sở hữu** migration + entity (P1) |
| `admin` — hồ sơ bác sĩ, chi nhánh công tác (B12, B13) | Điều kiện đổi chi nhánh: không còn `lich_lam_viec` có `ngay >= hôm nay` ở chi nhánh cũ (ca hôm nay tính là còn); chưa có mã | **Một cách đọc dùng chung:** `scheduling/shifts/shift-queries.ts` → `ShiftQueries.findFutureShiftsAtBranch` (mục 5.10 E); `SchedulingModule` xuất; admin B13 gọi. Trung là chủ cả hai nên không có xung đột file |
| `admin` — `services` (B3) | Chặn đổi `thoi_luong` khi còn khung giờ tương lai/lịch hẹn hoạt động | Phân công/sinh khung giờ **đọc `thoi_luong` dưới `FOR SHARE` của `dich_vu_kham`** (H4); **M13 đúng sẵn (đọc mã 08/11/2026, không phải số đo):** `ServiceService.update` (`admin/services/service.service.ts` dòng 65) khoá hàng `dich_vu_kham` `FOR UPDATE` (`service.repository.ts` dòng 77) **trước** khi kiểm khung giờ (`hasFutureSlots`, dòng 79 trở đi) và không xin `bac_si` ở đâu (chỗ khoá khác duy nhất là `lockGroup` trên `nhom_dich_vu`) ⇒ không tạo vòng với `bac_si` X → `dich_vu_kham` S của phân công. **DH-04 chờ chạy trên MySQL thật ở X1/B3** |
| `admin` — `rbac` | Phạm vi Quản trị viên (`ToanHeThong`/`ChiNhanh`); ngoài phạm vi ⇒ 404 (Q40) | Dùng `AdminScopeCtx` + `BranchAccessPolicy`. **Chưa có phạm vi Lễ tân**: `ReceptionScopeService` (booking P4, cùng chữ ký) — ai tới trước làm (Q5) |
| `admin` — `audit` | Whitelist đóng 11 hành động; `AuditEntry` là union theo hành động | Mở rộng thêm 4 hành động + 2 loại đối tượng (Q34, P4; Trung xác nhận 08/11/2026): sửa **cả ba** file `docs/database/*`, migration `MODIFY` enum, `audit-entry.ts`, test audit (`[ĐỤNG audit]`). **`TargetFor` hiện rơi mặc định về `yeu_cau_thay_doi_chi_nhanh`** nên phải viết lại nhánh điều kiện; `booking` B14 cũng thêm `OverrideLichHen` ở đây (xem P4) |
| `admin` — notification Q9 (`apps/api/src/notification/`, **chưa làm**) | Thông báo + email + worker | Module này **tự ghi `thong_bao`** (trong ứng dụng) bằng `LeaveNotifier` nhỏ ở `doctor/notifications/` cho đến khi `notification` có `NotificationService`; email `[CHỜ notification]` (Q33) |
| `search` Q18 (03/11, nhóm đồng ý) ↔ prompt 08/11 | Ai sở hữu "khung giờ còn trống" | **Lệch:** search Q18 = `booking`; prompt 08/11 và booking Q7 = `doctor`. PLAN này **theo 08/11** (Q1★: Trung xác nhận 08/11/2026); task D1 (Trung sửa) đổi `docs/features/search/TRACKING.md` mục 3 (dòng 89 và 124), PLAN `search` 5.6 và ca KGI-03 (7.10) |
| `search` PLAN 5.6/7.10 **KGI-03** | "Nghỉ phép **chờ duyệt không ảnh hưởng**" khung giờ | **Mâu thuẫn trực tiếp với 2.4 TYN (MT, b5, HĐK)** và booking D4 (cả `ChoDuyet` và `DaDuyet` chặn). Sửa KGI-03 ở D1 (`[ĐỤNG search]`, Trung sửa; phiên kiểm đã đối chiếu 2.4.24 bản Drive: hậu điều kiện và bước (5) ghi nghỉ phép `ChoDuyet` đã chặn khung giờ) |
| `search` K1 | Payload khung giờ `{ batDau, ketThuc, ca, trangThai }` **không có `khungGioId`** | Reader D3 trả thêm `khungGioId` (booking Q8); K1 chỉ chuyển tiếp. Sửa PLAN `search` 5.6 (D1) |
| `booking` (Đại) — 5.10 D1–D12 | Hợp đồng hai chiều | Mục 5.10 (đối chiếu từng điểm); thêm D13 (`listAffectedByLeave`) `[CHỜ booking]` |
| `patient` F1, F2 — khung Bệnh nhân/Lễ tân, `role-nav.ts` | Menu Lễ tân "Lịch làm việc bác sĩ" | Chỉ đặt `to` ở `router/role-nav.ts` và route ở `router/role-routes.tsx` (`[ĐỤNG router]`); không sửa `features/patient/` (`DoctorLayout` tự nối `RoleShell`: Q35) |
| `router/*`, `admin-sidebar.tsx`, `features/admin/index.ts` (dùng chung) | Thêm route, `to`, thêm hai dòng `export` (`AdminScopeGuard`, `useAdminScope`) ở `features/admin/index.ts` | Ghi rõ từng chỗ sửa ở từng task F; `git pull` trước; báo Đại nếu `role-routes.tsx` đổi (booking F1, F8, F10, F11 cũng sửa) |
| `database/entities.ts`, `database/migrations/index.ts` (dùng chung) | Đăng ký entity, migration | Mỗi migration mới có **timestamp lớn hơn mọi migration đã merge**; `registry.spec.ts` báo lỗi nếu sai thứ tự; hai PR migration song song (doctor P1, P4; booking P6, P7) phải **merge theo thứ tự timestamp** (H15) |

### 3.4 Chỗ 2.4, schema và Figma lệch hoặc mơ hồ — **nêu rõ, chưa chọn bên nào** (đề xuất ở cột "Hỏi")

| # | Lệch / mơ hồ | Ghi chú | Hỏi |
|---|---|---|---|
| L1 | **PCLV A4 "ca đề xuất nằm ngoài giờ mở–đóng"** ↔ DB/quy tắc 29, 39: giờ ca = khoảng nhận khám tương ứng của chi nhánh (CaSang→khoảng sáng, CaChieu→khoảng chiều), **không có cột giờ riêng** | Với dữ liệu đã chốt, ca **không thể** "ngoài giờ" so với chính khoảng của nó: chỉ còn `ChuaKhaiBao`, `NgayNghi`, `CaKhongTonTai` (khoảng của ca không tồn tại, kể cả `CaToi`). `NgoaiGioHoatDong` chỉ xảy ra ở **khung giờ** (đặt lịch, sinh khung giờ). A4 thành "ca không có khoảng nhận khám" kèm giờ nhận khám của ngày | Q6 |
| L2 | PCLV: "tạo, cập nhật" ↔ **không nêu xoá/huỷ ca**; khoá `(bác sĩ, ngày, ca)` không có cột "ghi chú" nên "cập nhật" không có trường nào để sửa ngoài ngày/ca | "Sửa" = đổi ngày/ca = xoá + tạo; khung giờ đã từng có `lich_hen` (kể cả `DaHuy`) **không xoá được** (khoá ngoại `lich_hen.khung_gio_id`) ⇒ ca đó không xoá được | Q8 |
| L3 | PCLV b4 "ngày không ở quá khứ" ↔ quy tắc 13, 29: ca của **hôm nay** tính là còn nhưng "ca đã kết thúc trong ngày có được coi là đã qua không" `[cần điền]` | Đề xuất: ngày ≥ hôm nay (giờ VN); hôm nay chỉ nhận ca **chưa kết thúc** | Q9 |
| L4 | **XLV A2 "thông báo không đủ quyền"** (403) ↔ admin Q40 (4.2a): tài nguyên ngoài phạm vi ⇒ **404** như không tồn tại | id bác sĩ là thông tin công khai (danh sách `search`), nên 403 không lộ gì thêm; 2.4 nói rõ "thông báo không đủ quyền" | Q13 |
| L5 | XLV: Lễ tân thấy "bác sĩ có **hồ sơ thuộc chi nhánh** được gán **hoặc có ca mang chi nhánh** được gán (kể cả ca đã qua)" và chỉ **ca mang chi nhánh được gán**; Bác sĩ đổi chi nhánh thấy mọi ca của mình | Cần một vị từ SQL dùng chung (Lễ tân, Admin Chi nhánh) — mục 5.6 | Q14 |
| L6 | TYN b4 "chi nhánh liên quan xác định qua lịch làm việc đó" ↔ `yeu_cau_nghi_phep` **không có cột chi nhánh** | Không lưu; phạm vi duyệt tính từ chi nhánh **hiện tại** của bác sĩ (bất biến I-1, mục 5.8) | Q28 |
| L7 | TYN TĐK "có lịch làm việc đã phân công **trong khoảng**" ↔ A1 "ngày/ca **không thuộc** lịch làm việc đã phân công" ⇒ khoảng nhiều ngày chỉ một phần là ngày có ca: hai cách đọc | Đề xuất: chấp nhận khi có **ít nhất một ca** trong khoảng; ngày không có ca vô hại (chặn theo `(ngày, ca)`) | Q20 |
| L8 | TYN: không nêu **hạn tối thiểu/tối đa**, số yêu cầu chờ đồng thời, yêu cầu **chồng nhau**, nghỉ vào ca **đang có lịch hẹn** | Prompt bắt hỏi | Q19, Q21, Q22, Q25 |
| L9 | **Figma có "Chi tiết yêu cầu nghỉ - Xác nhận hủy yêu cầu" của Bác sĩ** ↔ 2.4 **không có luồng Bác sĩ tự huỷ**; `trang_thai_yeu_cau_enum` chỉ có `ChoDuyet`, `DaDuyet`, `TuChoi` (không có `DaHuy`/`DaRut`), và enum **dùng chung** với `yeu_cau_doi_lich_ngoai_chinh_sach` | Thêm giá trị hay xoá hàng đều là đổi thiết kế | Q23 |
| L10 | PDN A2/`*b` "chuyển Từ chối, thông báo cho Bác sĩ" ↔ bảng **không có cột lý do từ chối**; 2.4 không nói lý do | Nếu Figma "Từ chối yêu cầu" có ô lý do ⇒ nơi lưu | Q27 |
| L11 | PDN b4 hoàn tiền "theo các bước (9)–(10) và A3 của Hủy lịch hẹn" ↔ 2.4 HLH hoàn **theo bậc**, còn PDN nói **100%** | Đã chốt ở booking Q17 (duyệt nghỉ phép hoàn 100%, không mời danh sách chờ, quyết định chính sách của nhóm); module này không tính tiền | — |
| L12 | PDN: lịch hẹn **đã tiếp đón/hoàn thành/vắng mặt** trong khoảng nghỉ (ngày nghỉ đã qua một phần) không được nêu | Chỉ `ChoThanhToan`/`DaXacNhan` có `thoi_gian > now` bị huỷ; còn lại báo Admin (`NotCancellable`) | Q30 |
| L13 | **search KGI-03** "chờ duyệt không ảnh hưởng" ↔ 2.4 TYN và booking D4 | Sửa PLAN `search` (D1) | Q1 |
| L14 | SOW 3.2 "thao tác nhạy cảm ghi nhật ký hành động" ↔ `hanh_dong_nhay_cam_enum` **không có** giá trị cho phân công/duyệt/từ chối nghỉ phép; `loai_doi_tuong_enum` không có `lich_lam_viec`, `yeu_cau_nghi_phep` | Đổi schema (3 file `docs/database/*` + migration) hoặc bỏ ghi nhật ký | Q34 |
| L15 | `yeu_cau_nghi_phep.ca` là `ca_lam_viec_enum` (có `CaToi`), `chk_nghi_phep_hinh_thuc` không loại | Service từ chối `CaToi` (quy tắc 44); chưa bỏ `CaToi` khỏi enum (chờ nhóm, mục 8 bước 7) | — |
| L16 | `thong_bao` không có khoá tham chiếu nghỉ phép; `email_thong_bao` không có tiêu đề/nội dung | Ghi `thong_bao` một lần trong giao dịch tạo/xử lý (exactly-once nhờ giao dịch), email để `notification` | Q33 |
| L17 | PDN b2 "danh sách lịch hẹn bị ảnh hưởng" cần dữ liệu `lich_hen` ↔ D5 của booking chỉ trả `{ lichHenId, maLichHen }` | Đề xuất D13 `listAffectedByLeave` (cùng điều kiện với `findAffectedByLeave`) | Q4 |
| L18 | TYN HĐK "được duyệt: khung giờ thuộc khoảng nghỉ không còn được tính là còn trống" ↔ `khung_gio.trang_thai` **không đổi** | Suy ra khi đọc từ `yeu_cau_nghi_phep` (D3, D4), **không** ghi trạng thái khung giờ | — |
| L19 | `khung_gio.trang_thai = 'HetHan'` có trong enum | `booking` Q3 không ghi; `AvailableSlotsReader` suy ra khi đọc (`ngay_gio <= now`) | — |
| L20 | **Phân công (Figma `516:2`) là QUY TẮC LẶP nhiều bác sĩ:** Từ ngày – Đến ngày + Thứ trong tuần + Ca (Sáng/Chiều/Cả ngày) + Ghi chú + chọn nhiều bác sĩ + khung "Xem trước"; Chi tiết ca (`519:2`) hiện "QUY TẮC LỊCH LÀM VIỆC … 2026-01-01 → 2026-12-31 · Lịch làm việc tiêu chuẩn" ↔ 2.4 b3 "thêm/sửa ca (chọn ngày và ca)" từng ngày; schema `lich_lam_viec` chỉ có hàng đơn, **không có bảng quy tắc, không có cột ghi chú** | Khoảng một năm × 5 thứ × "Cả ngày" ≈ 520 ca/bác sĩ ≈ 4.000 khung giờ/bác sĩ nếu sinh sẵn (Q7) | Q10 |
| L21 | **Lưới lịch hiện số lịch hẹn và drawer liệt kê lịch hẹn** (Bác sĩ "Có 5 lịch khám"; Lễ tân/Admin "1 lịch hẹn", tên bệnh nhân, mã `CP…`, trạng thái) ↔ 2.4 XLV chỉ có ngày, ca, chi nhánh, ngày nghỉ | Dữ liệu của `booking`; Bác sĩ chỉ nên thấy số lượng | Q18 |
| L22 | **Lễ tân (Figma `486:2`):** lưới tuần của **tất cả bác sĩ** cùng lúc, chỉ tuần (không có tháng), chú giải có **"Chờ duyệt"** ↔ 2.4 XLV b3 "Lễ tân chọn **một** bác sĩ và khoảng thời gian" và chỉ "ngày nghỉ **đã duyệt**" | Cần sửa một bên | Q15, Q16 |
| L23 | **Bác sĩ (Figma `466:2`):** bộ lọc "trạng thái" và "ca"; chi nhánh chỉ là dòng chữ "Chi nhánh công tác" cố định; không lọc ngày ↔ 2.4 XLV b2 "bộ lọc theo ngày/ca/chi nhánh (chi nhánh ghi trên từng ca; có nhiều chi nhánh khi đã đổi chi nhánh công tác)" | Bác sĩ đã đổi chi nhánh vẫn có ca cũ ở chi nhánh khác | Q15 |
| L24 | **Form "Yêu cầu nghỉ lịch làm việc" (`468:2`) chỉ vẽ "Cả ngày (có thể nhiều ngày)"**, không có frame "Theo ca" (một ngày + chọn ca); không nêu giới hạn ký tự của lý do | | Q25, Q37 |
| L25 | Chi tiết yêu cầu của Bác sĩ (`471:2`) **không hiện lý do từ chối, người xử lý, thời điểm xử lý**, không có thông báo "bị từ chối" ↔ TYN A2 "thông báo cho Bác sĩ" | | Q27 |
| L26 | **Hộp "Xác nhận duyệt" (`585:2`) không nói gì về huỷ lịch hẹn/hoàn cọc**, giá trị "Bác sĩ" để trống, chỉ "Bệnh nhân nhận thông báo: N"; banner kết quả (`586:2`) chỉ "Đã hủy N lịch hẹn" ↔ PDN b4 (huỷ + hoàn 100% + thông báo); không có frame với N > 0, không có số lịch huỷ lỗi/hoàn tiền lỗi | | Q29, Q32 |
| L27 | Danh sách duyệt (`582:2`): thẻ "Chờ duyệt/Đã duyệt/Từ chối/Tổng", lọc trạng thái dạng dropdown, **không có dòng/chip "Từ chối"**, cột "LỊCH HẸN BỊ ẢNH HƯỞNG" là số; chi tiết (`583:2`) chỉ vẽ N = 0 | Danh sách lịch hẹn bị ảnh hưởng (PDN b2) khi N > 0 chưa có frame | Q32 |
| L28 | Admin Chi nhánh (`622:2`, `623:2`): chip chi nhánh chỉ đọc, **vẫn có nút "+ Phân công ca"**, banner "Có 1 yêu cầu nghỉ chờ duyệt trong phạm vi của bạn" + link; chưa có hộp Phân công/Từ chối riêng | | Q28 |
| L29 | Trang "Duyệt yêu cầu" có hai tab "Yêu cầu nghỉ phép", "Yêu cầu đổi lịch" (module khác) | Trang host dùng chung | Q36 |
| L30 | Dữ liệu minh hoạ mâu thuẫn, chuỗi mô phỏng, tương phản thấp: mục 4.4 | | — |

Không lệch (đã đối chiếu): khung giờ nối liền theo `thoi_luong`, phần dư cuối khoảng bỏ (quy tắc 29(b), 39, ghi chú `khung_gio`); "Cả ngày" = `CaSang` + `CaChieu`, chỉ hợp lệ khi cả hai khoảng tồn tại (quy tắc 29(a)); `CaToi` không phân công/nghỉ (quy tắc 44);
chi nhánh của ca = chi nhánh công tác lúc phân công, không đổi sau (ghi chú `lich_lam_viec`, quy tắc 13); nghỉ theo ca đúng một ngày + bắt buộc ca, nghỉ cả ngày nhiều ngày không ca (CHECK `chk_nghi_phep_hinh_thuc`, quy tắc 7); `ChoDuyet` chưa có người xử lý, `DaDuyet`/`TuChoi` phải có cả hai (CHECK `chk_nghi_phep_xu_ly`, quy tắc 9);
nghỉ phép chặn khung giờ nhưng không đổi trạng thái khung giờ (TYN MT); Bác sĩ không tự phân công (PCLV MT).

### 3.5 Bẫy/rủi ro (xử lý trong task)

- **H1 — Sinh khung giờ sai (xuyên giờ nghỉ trưa, thừa/thiếu ô cuối, lệch giờ).** Một hàm thuần `generateSlotStarts` (số giây từ 00:00, không dùng `Date` để cộng giờ), ví dụ cố định của quy tắc 29 (07:30–11:00, 50 phút ⇒ 07:30, 08:20, 09:10, 10:00) thành test; ghi `ngay_gio` bằng **chuỗi `YYYY-MM-DD HH:MM:SS`** (không qua `Date`), đọc lại bằng `DATE_FORMAT` để so (SG-11); múi giờ driver **chưa đo** (M4).
- **H2 — Hai Quản trị viên cùng phân công một ca.** `bac_si` `FOR UPDATE` (tuần tự hoá theo bác sĩ) **và** UNIQUE `(bac_si_id, ngay, ca)` là lưới an toàn: 1062 ⇒ `CA_DA_PHAN_CONG`, không bao giờ 500 (PC-13, DH-01).
- **H3 — Phân công đua với admin đổi chi nhánh bác sĩ.** Admin khoá `bac_si` `FOR UPDATE`, đọc ca từ hôm nay ở chi nhánh cũ, rồi mới ghi; phân công **đọc chi nhánh dưới cùng khoá** rồi ghi `lich_lam_viec.chi_nhanh_id`: hoặc ca được ghi trước (admin chặn đổi), hoặc đổi trước (ca mới mang chi nhánh mới). Không bao giờ có ca tương lai ở chi nhánh cũ sau khi đổi (bất biến I-1; DH-03).
- **H4 — Phân công đua với đổi `thoi_luong` dịch vụ.** Admin Q16 chặn đổi khi *đã có* khung giờ tương lai, nhưng lệnh đổi không khoá `bac_si`: có thể đọc "chưa có khung giờ" ngay trước khi phân công commit ⇒ khung giờ 30 phút mà dịch vụ thành 45 phút. Phân công khoá `dich_vu_kham` `FOR SHARE` khi đọc `thoi_luong`; **M13 đúng sẵn (đọc mã 08/11/2026, không phải số đo): lệnh sửa dịch vụ khoá `dich_vu_kham` `FOR UPDATE` trước khi kiểm và không xin `bac_si` sau đó, nên không tạo vòng với `bac_si` X → `dich_vu_kham` S của phân công** (`service.service.ts` dòng 65, `service.repository.ts` dòng 77; **DH-04 chờ chạy trên MySQL thật** ở X1/B3).
- **H5 — Xoá ca đua với đặt lịch.** Xoá: `bac_si` X → `khung_gio` của ca `FOR UPDATE` (mọi ô) → kiểm trạng thái → `DELETE`; đặt lịch khoá `khung_gio` `FOR UPDATE` sau `bac_si` S ⇒ hoặc đặt trước (ta thấy `DangGiuCho/DaDat`, từ chối `CA_DANG_CO_LICH_HEN`) hoặc xoá trước (đặt báo không có khung giờ). Khoá ngoại 1451 là lưới an toàn ⇒ cùng mã lỗi (DH-05).
- **H6 — Duyệt nghỉ đua với đặt lịch; huỷ hàng loạt không nguyên tử.** (a) Điểm đồng bộ là hàng `bac_si`: duyệt khoá X rồi đặt `DaDuyet` rồi commit; đặt lịch khoá S và kiểm lại nghỉ phép dưới khoá (D4, D5; DH-06). (b) Huỷ hàng loạt là **N giao dịch riêng** của `booking`; tiến trình chết giữa chừng sau khi `DaDuyet` đã commit ⇒ sweeper chạy lại idempotent (mục 5.8, DH-07; DT-17 của booking). (c) Không bao giờ viết SQL `UPDATE lich_hen`/`khung_gio` ở module này (AR-01 của booking, `HD-08`).
- **H7 — Hai yêu cầu nghỉ chồng nhau tạo đồng thời (bấm đúp, hai thiết bị).** Tạo khoá `bac_si` `FOR UPDATE` rồi kiểm chồng lấn rồi chèn (DH-02); không dựa vào kiểm đọc-rồi-ghi.
- **H8 — Kiểu dữ liệu qua SQL thô.** Id `BIGINT` giữ dạng chuỗi; cột `DATE` qua SQL thô phải `DATE_FORMAT` (bài học patient B6); `TIME` ra chuỗi `'HH:MM:SS'`; `DATETIME` ra `Date` nhờ `DB_TIMEZONE` rồi `toISOString()`; so sánh ngày bằng chuỗi `YYYY-MM-DD` (đúng thứ tự từ điển); mọi mốc từ `nowVN()`/`todayVN()` **một lần mỗi request** (H18). `NOW()`/`CURDATE()` không dùng trong SQL của module (truyền `:now`; test dùng đồng hồ giả).
- **H9 — Job chạy đôi / chạy chồng.** Không gọi `ScheduleModule.forRoot()`; cờ `running`; quét theo lô có trần; mỗi yêu cầu một lần chạy; hai bản API cùng chạy vẫn đúng vì `cancel` idempotent; tắt ở `NODE_ENV=test`, test gọi `run()` trực tiếp (như `unverified-patient-cleanup.job.ts`).
- **H10 — Lộ dữ liệu.** Lễ tân chỉ nhận các ca mang chi nhánh được gán (vị từ nằm **trong SQL**, không lọc sau); không trả `ly_do` nghỉ phép cho Lễ tân (chỉ "Nghỉ phép"); không trả email/SĐT bác sĩ; `Cache-Control: no-store`; không đưa `ly_do` vào log/audit/thông báo của người khác; không `SELECT *`.
- **H11 — Yêu cầu nghỉ liên quan ca của nhiều chi nhánh.** Với bất biến I-1 (mọi ca `ngay >= hôm nay` của một bác sĩ nằm ở chi nhánh hiện tại của họ) chỉ có thể xảy ra với ca **đã qua**, không xử lý; vẫn phòng thủ: duyệt xử lý theo `(bác sĩ, ngày, ca)`, không theo chi nhánh (mục 5.8).
- **H12 — Thông báo lỗi không được phá nghiệp vụ.** Ghi `thong_bao` **trong giao dịch** (thất bại ghi ⇒ cả giao dịch hoàn tác: chấp nhận vì cùng DB; khác với email sau commit); email để sau (`[CHỜ notification]`).
- **H13 — `jscpd` quét cả `*.int-spec.ts`, `*.e2e-spec.ts`:** hạ tầng test dùng chung (bác sĩ + chi nhánh + lịch hoạt động + ca + yêu cầu nghỉ) đặt ở `doctor/testing/` (không chép giữa các file test).
- **H14 — Hiệu năng khung giờ còn trống (N+1).** `AvailableSlotsReader.listMany` ≤ 4 truy vấn cho cả trang bác sĩ (ca+khung, nghỉ phép, giờ chi nhánh, bác sĩ); test đếm số truy vấn (AV-12).
- **H15 — Thứ tự migration.** TypeORM coi migration mới có timestamp nhỏ hơn migration đã chạy là lỗi; doctor P1/P4 và booking P6/P7 lấy timestamp lúc tạo (lớn hơn mọi migration đã merge) và merge theo thứ tự; `schema-parity.int-spec.ts` so DDL migration với `clinix_mysql.sql` từng dòng.
- **H16 — "Cả ngày" phải nguyên tử.** Phân công hai ca trong **một** giao dịch, thiếu một khoảng thì từ chối cả hai (quy tắc 29(a)); không để lại một ca (PC-09).
- **H17 — Ca không đủ một khung giờ.** Khoảng ngắn hơn `thoi_luong` ⇒ sinh 0 ô: từ chối `CA_KHONG_DU_MOT_KHUNG_GIO` thay vì tạo ca rỗng (SG-04, PC-20).
- **H18 — Đồng hồ.** Mỗi request chốt `now = nowVN()` và `today = todayVN(now)` một lần, truyền xuống mọi hàm; không đọc đồng hồ lần hai giữa kiểm và ghi (test đồng hồ giả qua nửa đêm: PC-21).
- **H19 — Yêu cầu `ChoDuyet` mà ngày đã qua.** Yêu cầu tồn tại lâu, tới lúc duyệt `ngay_ket_thuc < hôm nay`: Q30.
- **H20 — Sai tầng module.** `SchedulingModule` **không** phụ thuộc `AppointmentsModule`; `AppointmentsModule` phụ thuộc `SchedulingModule`; duyệt nghỉ (`doctor`) phụ thuộc cả hai ⇒ **không có chu trình** (kiểm bằng AR-03).

## 4. Câu hỏi và quyết định

### 4.1 Đã chốt ở module khác (kế thừa — **không bàn lại**)

- **auth** (`docs/features/auth/TRACKING.md` mục 3): TypeORM, migration viết tay đối chiếu schema; Gmail SMTP qua `MailService`; web và API cùng origin (`/api`); access JWT 15 phút trong bộ nhớ; mã lỗi ổn định, không 500 cho lỗi UNIQUE/FK/deadlock đã lường trước; khoá hàng theo thứ tự cố định, thử lại 1205/1213, test nhiều tài khoản đồng thời, đồng hồ giả; `ScheduleModule.forRoot()` đúng một lần.
- **patient** (`docs/features/patient/PLAN.md`): Q21 khung Bệnh nhân/Lễ tân nhận **cấu hình menu từ lớp `router/`**, mục chưa có trang là nút vô hiệu "Chưa được triển khai"; module khác chỉ thêm `to` và route; Q13 hợp đồng khoá; `GET/PUT /profile` dùng chung bốn vai trò.
- **admin** (`docs/features/admin/PLAN.md`, TRACKING mục 3): Q40 tài nguyên ngoài phạm vi Quản trị viên ⇒ **404**; Q41 admin sở hữu migration các bảng nền (module khác không tạo lại); Q16/Q17 chặn đổi `thoi_luong` và dịch vụ chính khi còn khung giờ/ca tương lai; quy tắc 13 chặn đổi chi nhánh bác sĩ khi còn ca từ hôm nay (ca hôm nay tính là còn); Q48 thay đổi chi nhánh còn ca tương lai bị ảnh hưởng **không áp dụng**, "bộ phận phụ trách xử lý ca"; Q39 audit whitelist đóng; Q9 thông báo/email tối thiểu ở `apps/api/src/notification/`, worker thử lại 3 lần cách 5 phút; Q42 phân trang offset `common/paging`.
- **search** (`docs/features/search/`): Q4 thứ chưa khai báo xử lý như nghỉ; PLAN 5.6 hợp đồng endpoint khung giờ `[SAU]` (sửa ở D1 của PLAN này); `search/common/weekly-schedule.view.ts`.
- **booking** (`docs/features/booking/`, đã merge): mục 5.3 thứ tự khoá toàn cục; mục 5.10 điểm giao tiếp D1–D12; Q3 `booking` không ghi `HetHan`; Q8 K1 trả `khungGioId`; Q17 duyệt nghỉ phép hoàn 100%, không mời danh sách chờ; Q41 `doctor` seed lịch và khung giờ; DT-09, DT-17.
- **Quy tắc DB** (`clinix_quy_tac_nghiep_vu.md`): 7, 9 (CHECK nghỉ phép), 13, 28, 29, 30, 38, 39, 44 (và 36 khi nhắc tới audit cấu hình).
- **Nhóm chốt 03/11/2026:** PHẠM VI ĐỢT ĐẦU làm trọn PCLV, XLV, TYN; PDN lập kế hoạch đầy đủ, gắn `[CHỜ booking]`, `[CHỜ wallet]`, `[CHỜ notification]`; module này làm khung Bác sĩ.

### 4.2 Câu hỏi gộp và đề xuất (**đã trả lời 08/11/2026**: Đại duyệt Q4–Q42 như đề xuất kèm điều kiện ghi cuối từng câu; Trung xác nhận Q1, Q2, Q3, Q8, Q10, Q28, Q34, Q36 cùng ngày; **quyết định cuối ở [`TRACKING.md`](TRACKING.md) mục 3, ưu tiên hơn bảng dưới**; ★ = nên chốt trước khi bắt đầu cụm 2)

Cột "Chặn" ghi task bị chặn nếu chưa chốt. Hỏi Đại với câu "nhóm trả lời"; Q1, Q2, Q3, Q8, Q10, Q28, Q34, Q36 chạm file/quyết định của Trung (đã được Trung xác nhận 08/11/2026).

**A. Ranh giới với module khác**

| Q | Câu hỏi | Đề xuất và lý do | Chặn |
|---|---|---|---|
| Q1★ | **(= booking Q7)** Ai sở hữu việc sinh `khung_gio` và hàm "khung giờ còn trống"? | **`doctor`**, ở `apps/api/src/scheduling/`: MỘT bộ luật giờ ca/khung giờ (D2), MỘT bộ sinh (D1), MỘT hàm đọc "khung giờ còn trống" (D3); `booking` và `search` chỉ GỌI, `booking` vẫn kiểm lại dưới khoá bằng đúng D2. Đại đã đồng ý 08/11/2026. Hệ quả cho `search`: `docs/features/search/TRACKING.md` mục 3 (Q18 đổi chủ), PLAN `search` 5.6 (K1 trả `khungGioId`) và **7.10 KGI-03** ("chờ duyệt không ảnh hưởng" sai so với 2.4 TYN) do task D1, người sửa là Trung. Phương án cũ (search Q18): `booking` sở hữu **Đã trả lời (08/11/2026): Đại đồng ý, Trung xác nhận. D1 do Trung sửa 3 chỗ: `docs/features/search/TRACKING.md` mục 3 (dòng 89 và 124), PLAN `search` 5.6, ca KGI-03 (dòng 683). KGI-03 phải sửa: theo phiên kiểm đối chiếu 2.4 bản Drive, 2.4.24 (hậu điều kiện và bước (5)) ghi khung giờ liên quan "tạm không nhận lịch hẹn mới (suy ra từ yêu cầu Chờ duyệt, không đổi trạng thái khung giờ)" ⇒ nghỉ phép `ChoDuyet` đã chặn khung giờ.** | P2, B1, B5, D1 |
| Q2★ | **(= booking Q15)** Ai làm migration + entity `moc_hoan_tien`? | Không thuộc `doctor`. Đề xuất giữ như booking: **Trung** trong task admin "Đặt cọc & Hoàn tiền" (hoặc `booking` P6 nếu Trung chưa xong lúc cần cọc > 0). PLAN này **không có task** cho bảng đó **Đã trả lời (08/11/2026): Trung làm** migration + entity `moc_hoan_tien` trong task admin "Đặt cọc & Hoàn tiền" (bảng đã có ở `clinix_mysql.sql` dòng 251, repo chưa có migration/entity). `booking` P6 chỉ làm tạm nếu tới B8 (cọc > 0) mà Trung chưa xong; Trung báo Đại trước để không viết trùng. `doctor` không có task cho bảng này.** | — |
| Q3★ | **(= booking Q29)** Có thêm `thong_bao.lich_hen_id` + UNIQUE (phương án A của booking)? | Quyết định của Trung (bảng của admin). **Không chặn `doctor`:** thông báo nghỉ phép ghi `thong_bao` đúng một lần trong giao dịch tạo/xử lý, không cần khoá tham chiếu (Q33). Chỉ cần: nếu Trung đồng ý thì migration của booking P7 và của `doctor` P1/P4 xếp **theo thứ tự timestamp** (H15) **Đã trả lời (08/11/2026): Trung đồng ý phương án A** (thêm `thong_bao.lich_hen_id` và UNIQUE `(lich_hen_id, tai_khoan_id, loai_su_kien)`; đã có mẫu `thong_bao_index_yeu_cau_chi_nhanh`); `booking` P7 làm, sửa cả ba file `docs/database/*` cộng migration, xếp theo timestamp với booking P7 và doctor P1, P4 (H15); vẫn không chặn `doctor`.** | — |
| Q4★ | Đồng ý các điểm D1–D12 của booking 5.10 và ba bổ sung của mục 5.10 (D13 `listAffectedByLeave`, D14 `countActiveByShifts`, điều kiện `thoi_gian > now` của `findAffectedByLeave`) | **Đồng ý có sửa:** bảng "Khác với booking 5.10" ở mục 5.10 mục A. Sau khi Đại/Trung đối chiếu thì ghi vào `TRACKING.md` mục 3 của **cả hai** module **Đã trả lời (08/11/2026): đồng ý D1–D12 và D13, D14, `now` của D5; bảng "Khác với booking 5.10" là đúng và đủ; phía booking sửa bằng PR riêng của phiên booking.** | Tạo issue; B5, B11, B13 |
| Q5 | `ReceptionScopeService` (booking P4: `rbac/reception-scope.service.ts`, `resolve(accountId): Promise<{ chiNhanhId: string }>`, đọc `le_tan.chi_nhanh_id` mỗi request): ai làm? | **Ai tới trước làm, người sau import**, cùng chữ ký. `doctor` cần cho XLV Lễ tân (B8); P3 của PLAN này chỉ làm nếu `booking` P4 chưa merge lúc tới B8 **Đã trả lời (08/11/2026): đồng ý; trước B8 phải `git fetch` và nhìn `origin/main` xem `reception-scope.service.ts` đã có chưa — có rồi thì import, không viết lần hai. Q5 **chưa nêu với Trung**: P3 sửa `rbac/` (của Trung) nên báo Trung trước khi làm.** | B8 `[ĐỤNG rbac]` |

**B. Phân công lịch làm việc (PCLV)**

| Q | Câu hỏi | Đề xuất và lý do | Chặn |
|---|---|---|---|
| Q6★ | Giờ của ca ("giờ của từng ca chưa được quy định: [cần điền]") và luồng A4 "ngoài giờ mở–đóng" (L1)? | **Giờ ca = khoảng nhận khám tương ứng của chi nhánh trên ca vào thứ của ngày** (CaSang→sáng, CaChieu→chiều), không lưu giờ riêng, **tính khi đọc** (quy tắc 29, 39; Figma `516:2` không có ô giờ ca, khớp). `CaToi` không phân công (quy tắc 44). Hệ quả: **A4 không còn nhánh riêng** — "ca nằm ngoài giờ" thành `CA_KHONG_TON_TAI` (ca không có khoảng nhận khám ở ngày đó), thông báo **kèm giờ nhận khám của ngày** để giữ ý "giờ mở–đóng của ngày đó" của A4b; `NGOAI_GIO_HOAT_DONG` chỉ dùng cho khung giờ. Sửa 2.4 (D2): bước (4), A4. Giờ ca hiển thị tính theo lịch hoạt động **hiện hành**, nên giờ trong `Chi tiết ca` có thể khác lưới nếu hai chỗ dùng nguồn khác nhau (Figma đang lệch 08:00/08:30: Q17) **Đã trả lời: đồng ý; sửa 2.4 ở D2 (bước 4, A4) và ghi lệch Figma 08:00/08:30 vào danh sách lệch.** | P2, B2 |
| Q7★ | Ai sinh `khung_gio`, vào lúc nào, sinh lại thế nào? | **Sinh ngay trong cùng giao dịch phân công** (`SlotGeneratorService.syncShift`): mỗi ca ⇒ toàn bộ khung giờ nối liền theo `dich_vu_kham.thoi_luong` của bác sĩ trong khoảng của ca, phần dư cuối bỏ (quy tắc 29(b)); `INSERT … ON DUPLICATE KEY UPDATE` nên **chạy lại không đổi gì** (idempotent, không đụng ô `DaDat`/`DangGiuCho`). Lý do: `lich_hen.khung_gio_id` là khoá ngoại nên khung giờ phải **có hàng** trước khi đặt; sinh lười/nền làm khung giờ xuất hiện chậm và mâu thuẫn quy tắc 38 ("đặt được tới ngày bác sĩ đã có khung giờ"). **Không tự sinh lại** khi lịch hoạt động chi nhánh đổi: admin Q48 không áp dụng thay đổi khi còn ca bị ảnh hưởng; khoảng mở rộng thì ca cũ giữ khung cũ (hợp lệ); khoảng thu hẹp/dời ⇒ D3 ẩn khung ngoài giờ (kiểm D2 từng hàng). Đổi `thoi_luong` bị admin Q16 chặn khi còn khung giờ tương lai. Lệnh "đồng bộ khung giờ ca" `[SAU]`. Quy mô: xem Q10 **Đã trả lời: đồng ý, kèm: (i) `INSERT` nhiều hàng một lệnh, lô tối đa 500 `[đề xuất]`; (ii) phần `ON DUPLICATE KEY UPDATE` chỉ được là phép gán không đổi (`lich_lam_viec_id = lich_lam_viec_id`), có ca "đột biến" (SG-07) chứng minh chạy lại KHÔNG đổi `trang_thai`, `giu_cho_den` của ô `DaDat`/`DangGiuCho`; (iii) thời gian giữ khoá của giao dịch lớn (≈ 8.000 ô) là "chưa đo", đo ở M6 trước khi chốt trần 1.000 ca.** | P2, B1, B2 |
| Q8★ | "Cập nhật" và **xoá/gỡ ca** (2.4 không nêu xoá; Figma `515:2`, `519:2`, `580:2` **không có nút Sửa/Xoá**, chỉ cảnh báo "Không thể chỉnh sửa quy tắc khi còn lịch hẹn chưa xử lý")? | Cần có **gỡ ca** vì quy tắc 13 chặn đổi chi nhánh bác sĩ khi còn ca từ hôm nay ("Không có thao tác hủy hay chuyển ca tự động" ⇒ Admin phải gỡ thủ công). Đề xuất `DELETE /admin/doctor-shifts/:id`: ca có `ngay >= hôm nay`; mọi khung giờ của ca `ConTrong` (đúng D7: `DangGiuCho` dù đã hết hạn chưa quét cũng chặn, thử lại sau) **và không bị `lich_hen` nào tham chiếu, kể cả `DaHuy`** (khoá ngoại); ngược lại 409 `CA_DANG_CO_LICH_HEN` kèm tối đa 50 mã lịch hẹn. "Sửa ca" = gỡ + phân công lại (không có PATCH). **Giới hạn đã biết:** ca đã từng có lịch hẹn (kể cả đã huỷ) **không gỡ được** ⇒ bác sĩ có ca như vậy ở ngày tương lai chưa đổi chi nhánh được cho tới khi ngày đó qua (ghi `TECH_DEBT`; muốn khác thì cần cờ "đã gỡ" = đổi schema). Figma cần thêm nút Gỡ ca ở `Chi tiết ca` (nhóm bổ sung). Sửa 2.4: thêm "gỡ ca" **Đã trả lời: đồng ý `DELETE` và "sửa ca = gỡ + phân công lại"; Trung xác nhận 08/11/2026, kể cả việc khớp thứ tự khoá chung (booking 5.3). Giới hạn "ca từng có lịch hẹn (kể cả đã huỷ) không gỡ được ⇒ chưa đổi chi nhánh được bác sĩ đó tới khi ngày đó qua" rất dễ gặp (đặt rồi huỷ là chuyện thường); chấp nhận ở đợt này, nhưng ghi `TECH_DEBT` ở PR của B3 nêu đúng hệ quả này và đưa vào "việc nhóm quyết" (mục 4.6) kèm hai hướng sửa, cả hai đổi schema: cờ `da_go` ở `lich_lam_viec`, hoặc cho phép xoá khung giờ chỉ bị lịch `DaHuy` tham chiếu.** | B3, F7 |
| Q9 | Phân công vào "hôm nay" và ca đang diễn ra/đã kết thúc (L3; quy tắc 13, 29 `[cần điền]`)? | `ngày ≥ hôm nay (giờ VN)`; hôm nay chỉ nhận ca **chưa kết thúc** (`now < giờ kết thúc khoảng`), nếu không `CA_DA_KET_THUC`; ca đang diễn ra nhận được (khung giờ đã qua chỉ hiện `HetHan`). Gỡ ca hôm nay: chỉ khi mọi khung `ConTrong` và không bị tham chiếu (như Q8). Khớp quy tắc 13 ("ca hôm nay tính là còn") | B2, B3 |
| Q10★ | **Mô hình phân công: quy tắc lặp nhiều bác sĩ (Figma `516:2`) hay từng ngày × ca (2.4 b3) (L20)?** Ghi chú? Giới hạn? | **Làm theo Figma nhưng mở quy tắc thành từng hàng `lich_lam_viec`** (không lưu "quy tắc", vì schema không có bảng): `POST /admin/doctor-shifts { bacSiIds[1..20], tuNgay, denNgay, thuTrongTuan[1..7], cas[CaSang|CaChieu] }`, "Cả ngày" = hai ca; **một giao dịch, all-or-none** cho cả yêu cầu (2.4: "thất bại thì không có thay đổi nào"), khoá `bac_si` theo id tăng dần; vi phạm A1/A2/A3/A4 ở **bất kỳ** hàng nào ⇒ từ chối cả yêu cầu, trả `viPham[]` (≤ 50: bác sĩ, ngày, ca, mã). Khung "Xem trước" = `POST /admin/doctor-shifts/preview` (cùng bộ kiểm, không ghi). Giới hạn `[đề xuất]`: `tuNgay ≥ hôm nay`, khoảng ≤ 92 ngày, tổng ca ≤ 1.000 (≈ 8.000 khung giờ; **chưa đo**, M6). **Ô "Ghi chú" không lưu** (không có cột; bỏ ô hoặc nhóm quyết thêm cột), panel "QUY TẮC LỊCH LÀM VIỆC" ở Chi tiết ca bỏ (không có dữ liệu). Phương án khác: chỉ từng ngày (khớp 2.4, Figma sửa) hoặc bỏ qua ca đã có thay vì từ chối (A2 nói từ chối). Sửa 2.4: bước (1), (3) **Đã trả lời: đồng ý; Trung xác nhận 08/11/2026 và lưu ý giao dịch lớn giữ khoá `bac_si` lâu ⇒ đo M3 và M6, giữ giới hạn 1.000 ca mỗi lần. Các trần (20 bác sĩ, 92 ngày, 1.000 ca) giữ `[đề xuất]` và "chưa đo" tới M6. Điều kiện: có ca (PC-17) chứng minh `preview` và `POST` thật cho cùng yêu cầu ra CÙNG danh sách `viPham` (cùng một hàm kiểm; `preview` không ghi gì).** | B2, B3, F7 |
| Q11 | Bác sĩ nào được phân công? | `DangHoatDong` và `ChoKichHoat` (phân công trước khi kích hoạt hợp lý; `search` đã ẩn họ); `NgungHoatDong` ⇒ 409 `BAC_SI_KHONG_PHAN_CONG_DUOC`. Khi bác sĩ bị khoá mà còn ca: ca giữ nguyên (việc của admin B-khoá; `booking` từ chối `BAC_SI_KHONG_KHA_DUNG`) | B2 |
| Q12 | Chi nhánh của ca lấy ở đâu? | `bac_si.chi_nhanh_id` đọc **dưới khoá `FOR UPDATE` của chính giao dịch phân công**; không nhận từ client (booking D12). Admin Chi nhánh: bác sĩ phải có `chi_nhanh_id` = chi nhánh mình, ngoài ⇒ 404 (admin Q40). Admin Toàn hệ thống: bất kỳ | B2 |

**C. Xem lịch làm việc (XLV)**

| Q | Câu hỏi | Đề xuất và lý do | Chặn |
|---|---|---|---|
| Q13★ | Yêu cầu của Lễ tân nhắm bác sĩ ngoài phạm vi: 403 hay 404 (L4)? | **403 `KHONG_DU_QUYEN`, cùng thân cho "không tồn tại" và "ngoài phạm vi"** (2.4 A2: "thông báo không đủ quyền"; id bác sĩ vốn công khai ở `search`, nên không lộ gì). Khác admin Q40 (404) có chủ đích; Admin Chi nhánh vẫn theo Q40 (404). Ghi vào 2.4/`TRACKING` **Đã trả lời: đồng ý 403 cùng thân cho "không tồn tại" và "ngoài phạm vi" (có ca khoá, XL-11). `bacSiId` SAI DẠNG (không phải số nguyên dương vừa BIGINT) đi qua pipe cùng luật `ParseRelativeIdPipe`/`parsePublicId` ⇒ 404 `KHONG_TIM_THAY`, khác với 403 (ghi rõ để khỏi tranh cãi sau). `doctor` dùng **pipe mỏng của riêng mình** (`doctor/common/parse-record-id.pipe.ts`, tên `[đề xuất]`) gọi `parsePublicId` của `search/common/id-param.ts`, **KHÔNG import pipe của patient** (`ParseRelativeIdPipe` chỉ là pipe mỏng gọi đúng hàm đó). **Pipe chạy SAU guard:** người không có quyền nhận 401/403 trước, chỉ người có quyền mới thấy 404 vì id sai dạng. Admin Chi nhánh vẫn 404 (admin Q40).** | B7, B8 |
| Q14 | "Bác sĩ thuộc phạm vi" của Lễ tân và Admin Chi nhánh | Hồ sơ `bac_si.chi_nhanh_id` = chi nhánh **hoặc** có ca `lich_lam_viec.chi_nhanh_id` = chi nhánh (kể cả ca đã qua); **một vị từ SQL dùng chung** (mục 5.6); chỉ trả ca mang chi nhánh được gán; bác sĩ `NgungHoatDong` vẫn hiện kèm cờ để xem lịch cũ | B4, B8 |
| Q15 | Khoảng ngày, tuần/tháng, bộ lọc (L22, L23) | API `tuNgay`/`denNgay` bắt buộc, `denNgay ≥ tuNgay`, **≤ 42 ngày** (tháng 6 tuần); tuần bắt đầu **thứ Hai**; lọc `ca`, `chiNhanhId` (Bác sĩ), `chuyenKhoaId`, `bacSiId`, `ca` (Lễ tân/Admin). **Lọc "trạng thái" làm ở giao diện** trên dữ liệu đã tải (trạng thái là suy ra). Figma Bác sĩ **thiếu lọc chi nhánh** (2.4 b2 có) và nút "Hôm nay"; Figma Lễ tân/Admin chỉ có tuần ⇒ nhóm bổ sung Figma. Lễ tân: 2.4 "chọn **một** bác sĩ" sửa thành "lưới mọi bác sĩ trong phạm vi, lọc được một bác sĩ" (Figma) | B6, B7, B8 |
| Q16 | Ngày nghỉ nào hiện cho ai? | Mỗi ca mang trạng thái nghỉ ưu tiên `DaDuyet` > `ChoDuyet` > (`TuChoi` mới nhất, **chỉ Bác sĩ**, để vẽ "Yêu cầu bị từ chối" của chú giải). Lễ tân/Admin: `DaDuyet` + `ChoDuyet` (Figma có "Chờ duyệt"; khung giờ đã bị chặn nên Lễ tân cần thấy lý do) — **2.4 XLV chỉ nói "đã duyệt" ⇒ sửa 2.4 hoặc bỏ "Chờ duyệt" khỏi Figma Lễ tân**. **Không trả lý do nghỉ** cho Lễ tân (H10) **Đã trả lời: đồng ý, chọn nhánh SỬA 2.4 ("Lễ tân thấy ngày nghỉ `ChoDuyet`, không thấy lý do") — thêm vào D2; KHÔNG bỏ "Chờ duyệt" khỏi Figma.** | B6, B7, B8 |
| Q17 | Giờ ca hiển thị | Tính từ lịch hoạt động **hiện hành** của chi nhánh ghi trên ca (một nguồn: `BranchHoursReader`); ca mà khoảng không còn tồn tại ⇒ `batDau/ketThuc: null` + cờ "giờ ca không còn". Figma đang lệch (`08:30–11:30` ở lưới, `08:00–11:30` ở drawer): chỉ là dữ liệu mẫu | B6 |
| Q18 | Số lịch hẹn trong ca (Figma: "Có 5 lịch khám"; drawer liệt kê bệnh nhân; L21) | Số lượng = `AppointmentQueries.countActiveByShifts` (D14, `[CHỜ booking B11]`: lịch `ChoThanhToan`/`DaXacNhan`/`DaTiepDon` của khung giờ thuộc ca). **Trước khi có: ẩn dòng** (không hiện "0 lịch" sai). Danh sách tên bệnh nhân/mã lịch hẹn trong drawer **là việc của `booking`** (XDS có lọc bác sĩ + ngày): nút "Xem trong Quản lý lịch hẹn"; Bác sĩ chỉ thấy số lượng | B6–B8 `[CHỜ booking]` |

**D. Tạo yêu cầu xin nghỉ phép (TYN)**

| Q | Câu hỏi | Đề xuất và lý do | Chặn |
|---|---|---|---|
| Q19★ | Hạn xin nghỉ tối thiểu/tối đa? | Không có hạn tối thiểu (ngày bắt đầu ≥ hôm nay, Q24); tối đa: `denNgay ≤ hôm nay + 90`, khoảng ≤ 31 ngày liên tiếp (`NGHI_QUA_XA`, `KHOANG_NGHI_QUA_DAI`). Các số là `[đề xuất]`, 2.4 không nêu; để hằng có tên trong mã, không trong `cau_hinh_he_thong` (không có cột) | B9 |
| Q20★ | Khoảng nhiều ngày mà **một phần** là ngày có ca (L7)? | **Chấp nhận khi có ít nhất một ca của bác sĩ trong khoảng**; ngày không có ca vô hại vì chặn theo `(ngày, ca)`; phản hồi liệt kê số ca bị ảnh hưởng. `TheoCa`: ca và ngày đó **phải** có ca (không thì `NGHI_NGOAI_LICH_LAM_VIEC`). Phương án khác (chặt theo chữ A1): từ chối nếu có ngày không có ca | B9 |
| Q21★ | Hai yêu cầu chồng nhau? | Từ chối `YEU_CAU_NGHI_TRUNG` (409) nếu cùng bác sĩ đã có yêu cầu `ChoDuyet`/`DaDuyet` giao nhau: `CaNgay` giao mọi thứ trong các ngày đó; `TheoCa` chỉ giao cùng ngày **cùng ca** hoặc với `CaNgay` phủ ngày đó; `TuChoi` không chặn. Kiểm **dưới khoá `bac_si` `FOR UPDATE`** (bấm đúp/hai thiết bị) | B9 |
| Q22 | Nghỉ vào ca đang có lịch hẹn? | Cho phép (2.4: không ảnh hưởng ở bước này). Phản hồi tạo và chi tiết có `soLichHenDangCo` (D14, `[CHỜ booking B11]`; ẩn khi chưa có) để Bác sĩ biết hệ quả; bệnh nhân chỉ bị ảnh hưởng khi Admin duyệt | B9 |
| Q23★ | **Bác sĩ tự huỷ yêu cầu `ChoDuyet`** — Figma có `471:2`/`472:2` ("Hủy yêu cầu", "Thao tác không thể hoàn tác"), 2.4 không có (L9)? | **Đợt này không làm** (2.4 là hợp đồng): ẩn nút ở giao diện. Nếu nhóm muốn: (B) `DELETE` hàng `ChoDuyet` của chính bác sĩ — **không đổi schema** nhưng mất lịch sử (khớp chữ "không thể hoàn tác"), cộng thông báo cho Admin; (C) thêm `DaHuy` vào `trang_thai_yeu_cau_enum` và sửa `chk_nghi_phep_xu_ly` (đổi schema 3 file `docs/database/*`; enum dùng chung với `yeu_cau_doi_lich_ngoai_chinh_sach`) — tốn kém. Dù chọn gì phải sửa 2.4 **Đã trả lời: đồng ý "đợt này không làm": ẩn nút "Hủy yêu cầu", ghi vào danh sách lệch Figma (`471:2`, `472:2`) và "việc nhóm quyết" (mục 4.6); KHÔNG sửa 2.4 vì chưa thêm tính năng. Hệ quả: Bác sĩ có yêu cầu `ChoDuyet` thì chỉ chờ Admin xử lý (trần 5 yêu cầu chờ của Q25 là giới hạn).** | B10, F4 |
| Q24 | Nghỉ vào hôm nay/ca đã kết thúc | Ngày bắt đầu ≥ hôm nay. `TheoCa` hôm nay chỉ khi ca **chưa kết thúc** (`CA_DA_KET_THUC`). `CaNgay` bắt đầu hôm nay được nhận; phần ca đã qua không có hiệu lực vì `findAffectedByLeave` chỉ lấy `thoi_gian > now` (D5) | B9 |
| Q25 | Độ dài lý do, số yêu cầu chờ | Lý do: NFC, cắt khoảng trắng ASCII hai đầu, **2–500 điểm mã**, không ký tự điều khiển (cột `text`; Figma không có bộ đếm) ⇒ field `lyDo` mã `LY_DO_KHONG_HOP_LE`/`LY_DO_BAT_BUOC`. Tối đa **5** yêu cầu `ChoDuyet` cùng lúc/bác sĩ (`QUA_NHIEU_YEU_CAU_CHO_DUYET`) `[đề xuất]` chống spam | B9 |

**E. Phê duyệt (PDN)**

| Q | Câu hỏi | Đề xuất và lý do | Chặn |
|---|---|---|---|
| Q26★ | Phần nào của duyệt/từ chối làm trước `booking`, `wallet`, `notification`? | **Làm trước (đúng ngữ nghĩa, không bản giả):** danh sách, chi tiết (không có mục lịch hẹn bị ảnh hưởng), **Từ chối** (chỉ đổi trạng thái + ghi nhật ký + thông báo Bác sĩ; không đụng lịch hẹn, khung giờ trở lại vì chỉ suy ra). **Không merge Duyệt** cho tới khi `booking` B10 (huỷ dùng chung) và B11 (`findAffectedByLeave`, D13) xong: Duyệt mà lịch hẹn trong khung vẫn còn là **sai ngữ nghĩa** (bác sĩ nghỉ, bệnh nhân vẫn có lịch, cọc không hoàn). Soạn trước test và cổng `AppointmentCancellationPort` với bản giả **chỉ trong test**, không có `Noop` ở production (`[SOẠN TRƯỚC]`). Hoàn tiền (`wallet`) và thông báo bệnh nhân là việc **sau commit của `cancel`** (booking Q17, 5.6): `doctor` không gọi trực tiếp. Phương án khác (không khuyến nghị): Duyệt có chốt chặn "không có lịch hẹn nào bị ảnh hưởng thì mới duyệt" **Đã trả lời: đồng ý. Điều kiện: giao diện không vẽ nút "Duyệt" chạy được cho tới khi Duyệt (B15) merge — F8 (danh sách, drawer, Từ chối) KHÔNG có nút Duyệt, F9 mới thêm; không để nút bấm ra lỗi hay 501 lúc chờ (WA-16).** | B11, B13 |
| Q27★ | **Lý do từ chối (Figma `584:2` bắt buộc; schema không có cột) (L10)?** | (a) bỏ ô lý do (2.4 không nêu); (b) thêm cột `ly_do_tu_choi varchar(255)` (đổi schema 3 file + migration của P1; CHECK mới); (c) nhận lý do bắt buộc (1–255) nhưng **chỉ ghi vào `nhat_ky_hanh_dong` và nội dung thông báo cho Bác sĩ**, không có cột. **Đề xuất (c)**: Figma được giữ, không đổi schema, Bác sĩ vẫn đọc được lý do ở thông báo; ghi `TECH_DEBT` (Chi tiết yêu cầu của Bác sĩ chưa hiện lý do từ chối vì chưa có cột). Nếu nhóm muốn hiện lại ở chi tiết ⇒ (b) **Đã trả lời: đồng ý (c); thêm nợ `TECH_DEBT` ở PR của B14 (lý do từ chối không có cột); nếu nhóm muốn hiện lại ở Chi tiết thì (b) và đổi schema `[CHỜ Trung]`.** | B12, F8 `[CHỜ Trung]` nếu (b) |
| Q28★ | Quản trị viên Chi nhánh duyệt theo chi nhánh **hiện tại của bác sĩ** hay **chi nhánh ghi trên ca**? Yêu cầu liên quan ca của nhiều chi nhánh? | **Theo chi nhánh hiện tại của bác sĩ** (`bac_si.chi_nhanh_id` = chi nhánh Admin; ngoài ⇒ 404 admin Q40): bảng không có cột chi nhánh (L6). **Bất biến I-1:** mọi ca `ngay >= hôm nay` của một bác sĩ mang đúng chi nhánh hiện tại của họ (phân công luôn lấy chi nhánh dưới khoá + quy tắc 13 chặn đổi chi nhánh khi còn ca), nên với phần chưa qua hai cách tính **trùng nhau**; ca đã qua ở chi nhánh cũ không bị xử lý (`thoi_gian > now`). Phòng thủ: duyệt xử lý theo `(bác sĩ, ngày, ca)`, không lọc theo chi nhánh ca. Chiều ngược lại — Lễ tân/Admin xem **lịch** — theo chi nhánh ghi trên ca (2.4 XLV) **Đã trả lời: đồng ý; Trung xác nhận 08/11/2026 (dựa vào bất biến I-1, đúng nhờ quy tắc 13 và khoá `bac_si`). Phải có ca đồng thời chứng minh phân công đua với đổi chi nhánh bác sĩ (cả hai khoá `bac_si` `FOR UPDATE` nên tuần tự): ca vừa phân công mang đúng chi nhánh mới hoặc cũ, không lẫn (DH-03, IV-01).** | B11, B12, B13 |
| Q29★ | Duyệt: ranh giới giao dịch, chạy lại idempotent, kết quả | **Hai giai đoạn (booking D5):** (1) giao dịch: `bac_si` X → hàng yêu cầu X → kiểm lại `ChoDuyet` → `DaDuyet` + `nguoi_xu_ly_id` + `thoi_diem_xu_ly` + nhật ký + thông báo Bác sĩ → commit; (2) sau commit: `findAffectedByLeave` rồi với mỗi lịch `cancel(…BacSiNghiPhep)` (giao dịch riêng mỗi lịch, tuần tự). **Chạy lại:** `LeaveCancellationSweeper` (`@Cron` mỗi 5 phút `[đề xuất]`, lô 50, trần 5 lô, cờ `running`) quét yêu cầu `DaDuyet` có `ngay_ket_thuc ≥ hôm nay` và chạy lại bước (2); nút "Xử lý lại" `POST …/retry-cancellations` gọi cùng hàm; `cancel` idempotent (`AlreadyCancelled` coi là thành công) nên không hoàn tiền hai lần. Vì đặt lịch bị chặn từ lúc `DaDuyet` nên tập "bị ảnh hưởng" chỉ **co lại**, quét hội tụ. Phản hồi: `{ daHuy, daHuyTruocDo, khongHuyDuoc[{maLichHen, trangThai}], loi }`; lỗi hoàn tiền là việc `wallet` (HLH A3), không làm hỏng việc duyệt. Đánh đổi: nhiều giao dịch nhỏ thay vì một giao dịch lớn (một lịch lỗi không kéo cả lô; đổi lại có khoảng trống ngắn lịch chưa huỷ — được che bằng chặn đặt lịch) **Đã trả lời: đồng ý; `[CHỜ booking B10, B11]`. Điều kiện: nêu điều kiện DỪNG của sweeper (yêu cầu qua `ngay_ket_thuc` hoặc `findAffectedByLeave` rỗng) và log KHÔNG có tên bệnh nhân, mã lịch hẹn đầy đủ hay lý do (PD-12).** | B13, B14 `[CHỜ booking B10, B11]` |
| Q30 | Duyệt khi ngày đã qua, lịch đã tiếp đón/hoàn thành/vắng mặt trong khoảng nghỉ (L12, H19)? | `ngay_ket_thuc < hôm nay` ⇒ 409 `YEU_CAU_NGHI_DA_QUA_HAN` (chỉ Từ chối được). Một phần đã qua: duyệt được, huỷ chỉ lịch `thoi_gian > now` (D5). Lịch `DaTiepDon`/`HoanThanh`/`VangMat` **không bị huỷ** (không nằm trong `findAffectedByLeave`); nếu đổi trạng thái đúng lúc huỷ ⇒ `NotCancellable`, đưa vào `khongHuyDuoc` cho Admin xử lý ở "Lịch hẹn" | B13 |
| Q31 | Hai Quản trị viên duyệt/từ chối cùng lúc? | Khoá hàng yêu cầu `FOR UPDATE` rồi kiểm lại `ChoDuyet`; người thua nhận 409 `YEU_CAU_DA_XU_LY` (DH-08) | B12, B13 |
| Q32 | Nội dung hộp "Xác nhận duyệt" (L26, L27)? | Hộp phải nói: "N lịch hẹn sẽ bị huỷ; M lịch đã đặt cọc sẽ được hoàn 100% vào ví; K bệnh nhân nhận thông báo" (số từ D13/D14, bệnh nhân đếm theo `benh_nhan_id` khác nhau); điền tên Bác sĩ (đang trống ở Figma); chi tiết yêu cầu có bảng lịch hẹn bị ảnh hưởng khi N > 0 (chưa có frame). **Nhóm sửa Figma**; thay đổi 2.4 PDN b4 nếu muốn nêu rõ | F9 |

**F. Thông báo và nhật ký**

| Q | Câu hỏi | Đề xuất và lý do | Chặn |
|---|---|---|---|
| Q33★ | Mức thông báo tối thiểu (TYN b6, A2; PDN) và schema (L16)? | Chưa có `notification`. **Ghi `thong_bao` (trong ứng dụng) cùng giao dịch** qua `LeaveNotifier` ở `doctor/notifications/`: Bác sĩ nhận "đã gửi/chờ duyệt", "đã duyệt", "bị từ chối" (kèm lý do nếu có); Quản trị viên có thẩm quyền (Toàn hệ thống đang hoạt động + Chi nhánh của chi nhánh bác sĩ) nhận "có yêu cầu mới". `loai_su_kien` `[đề xuất]`: `NghiPhepDaGui`, `NghiPhepChoDuyet`, `NghiPhepDaDuyet`, `NghiPhepTuChoi`; `noi_dung` ≤ 500, không chứa lý do của Bác sĩ cho Admin (chỉ tên và ngày). **Không ghi `email_thong_bao`** (chưa có worker; tích hàng `ChoGui` rồi gửi thư cũ về sau là sai) ⇒ email `[CHỜ notification]`. Bệnh nhân bị huỷ lịch: `booking` lo. Chuông thông báo vẫn ẩn tới khi `notification` có (patient Q21b) ⇒ các dòng này tạm chưa ai đọc: ghi `TECH_DEBT` **Đã trả lời: đồng ý; thêm nợ `TECH_DEBT` ở PR của B10 (thông báo trong ứng dụng chưa ai đọc vì chuông ẩn); email `[CHỜ notification]`.** | B6, B9, B12, B13 |
| Q34★ | Nhật ký hành động cho phân công/duyệt/từ chối (L14)? | **Có**, vì duyệt kéo theo huỷ lịch và hoàn tiền, phân công đổi lịch khám. Mở rộng: `hanh_dong_nhay_cam_enum` + `PhanCongLichLamViec`, `GoLichLamViec`, `DuyetNghiPhep`, `TuChoiNghiPhep`; `loai_doi_tuong_enum` + `lich_lam_viec`, `yeu_cau_nghi_phep` (đổi schema: **sửa cả ba file `docs/database/*`**, migration `MODIFY` enum, `audit-entry.ts` + whitelist, test audit; task P4 `[ĐỒNG BỘ TL]` `[ĐỤNG audit]`). Nội dung chỉ danh sách trắng (id, ngày, ca, số lượng), **không** copy lý do của Bác sĩ; lý do từ chối của Admin (≤ 255) nếu Q27 = (c). Ghi **cùng giao dịch** (lỗi ghi ⇒ hoàn tác). Phương án khác: chỉ ghi duyệt/từ chối, không ghi phân công **Đã trả lời: đồng ý; Trung xác nhận 08/11/2026 nhưng tốn công hơn vẻ ngoài: `audit-entry.ts` có 11 hành động trong `ChangeMap`; thêm 4 hành động và 2 loại đối tượng; kiểu `TargetFor` đang rơi mặc định về `yeu_cau_thay_doi_chi_nhanh` nên phải viết lại nhánh điều kiện (nếu không hành động mới bị gán sai đối tượng); sửa cả ba file `docs/database/*`, migration `MODIFY` ENUM, test audit; `booking` B14 cũng thêm `OverrideLichHen` vào đúng chỗ này (xem P4). Điều kiện: migration `MODIFY` ENUM phải dựa trên danh sách giá trị hiện có ở `docs/database/clinix.dbml` và migration trên `main` TẠI LÚC LÀM, không chép từ PLAN; hai PR cùng sửa một ENUM thì PR sau phải gộp `main` rồi mới viết lại danh sách. Hiện chưa có test nào đối chiếu bộ giá trị ENUM DB ↔ `HANH_DONG_NHAY_CAM`/`LOAI_DOI_TUONG_NHAT_KY` (`admin/entities/enums.ts`) ↔ `AuditEntry` ⇒ thêm MG-08 vào P4.** | P4, B2, B3, B12, B13 |

**G. Giao diện**

| Q | Câu hỏi | Đề xuất và lý do | Chặn |
|---|---|---|---|
| Q35 | Khung Bác sĩ nối `useAuth`/`useLogout` vào `RoleShell` thế nào? | `features/doctor/shell/doctor-layout.tsx` (~35 dòng, cùng khuôn `RoleLayout` của patient: `RoleShell` + `ROLE_LABELS` + `useLogout`), cấu hình menu `DOCTOR_NAV` ở `router/role-nav.ts`, `DOCTOR_PATHS` (gốc `ROLE_HOME_PATHS.BacSi` = `/bac-si-portal`). Mục menu Figma Bác sĩ: **Tổng quan, Lịch hẹn, Lịch làm việc, Tin nhắn, Thông báo, Thông tin cá nhân**; chỉ "Lịch làm việc" có `to` đợt này (nút vô hiệu cho phần còn lại; "Lịch hẹn" ← booking D8). Không import `features/patient/shell/role-layout.tsx` (cấm import chéo). Nếu `jscpd` báo trùng: đề xuất Đại xuất `RoleLayout` qua `features/auth` | F1 |
| Q36 | Màn Admin đặt ở đâu; trang host "Duyệt yêu cầu" (L29)? | Ở `features/doctor/admin/`, **chỉ import từ bề mặt công khai** `features/admin/index.ts` (`AdminTable`, `AdminDetailPanel`, `AdminSearchInput`, `AdminConfirmationDialog`; xuất thêm `AdminScopeGuard`/`useAdminScope`: `[ĐỤNG admin]`) — ngoại lệ có chủ đích với quy ước không import chéo, vì admin là khung; route bọc `AdminScopeGuard` ở `router/role-routes.tsx` (cùng cách booking F10). Trang host: `/admin/duyet-yeu-cau` chuyển tới tab nghỉ phép (`/admin/duyet-yeu-cau/nghi-phep`), tab "Yêu cầu đổi lịch" là nút vô hiệu cho module khác. `admin-sidebar.tsx` đặt `to` cho "Lịch làm việc bác sĩ" và "Duyệt yêu cầu". Phương án khác: đặt trong `features/admin/` (không import chéo, code của module nằm ở thư mục khác) **Đã trả lời: đồng ý; Trung xác nhận 08/11/2026. `features/admin/index.ts` đã xuất `AdminMe`, `AdminConfirmationDialog`, `AdminDetailPanel`, `AdminSearchInput`, `AdminTable`, `AdminTableColumn`; `AdminScopeGuard` (`admin-scope-guard.tsx`) và `useAdminScope` (`use-admin-scope.ts`) có sẵn nhưng chưa xuất ⇒ chỉ cần thêm hai dòng `export` vào `index.ts` khi làm F6 (`[ĐỤNG admin]`).** | F6–F9 |
| Q37 | Frame Figma còn thiếu (form "Theo ca", ô lịch ở trạng thái nghỉ/chờ/từ chối, lỗi nhập, rỗng/lỗi/mất mạng, dòng "Từ chối", lỗi phân công, hộp Phân công của Admin Chi nhánh) | Dùng `loading-state`, `error-state`, `empty-state`, `offline-banner`, thông báo lỗi dưới ô như màn auth; câu chữ ở mục 5.14; chú giải màu theo Figma (Làm việc xanh dương, Nghỉ đã duyệt đỏ nhạt, Chờ duyệt vàng, Đã hủy xám, Từ chối cam); không tự thiết kế bố cục mới; danh sách ở mục 4.5 gửi nhóm bổ sung Figma | F2–F9 |

**H. Hạ tầng và dữ liệu**

| Q | Câu hỏi | Đề xuất và lý do | Chặn |
|---|---|---|---|
| Q38 | Phân trang/tìm kiếm | `common/paging` offset (`page` ≥ 1, `pageSize` 20, tối đa 100, `Paged<T>`); danh sách bác sĩ có `q` 2–100 ký tự (NFC, `escapeLikePattern`); danh sách yêu cầu lọc `trangThai`, `bacSiId`, `chiNhanhId` (chỉ Toàn hệ thống), `tuNgayGui`/`denNgayGui`, `q` (tên bác sĩ hoặc chuyên khoa, như Figma); thẻ thống kê `thongKe { choDuyet, daDuyet, tuChoi, tong }` tính với **cùng bộ lọc trừ trạng thái** | B4, B8, B11 |
| Q39 | Dữ liệu mẫu | Lệnh `seed:doctor-demo` (idempotent): cho các bác sĩ `search-demo` đang hoạt động (và `doctor@example.invalid` của `dev-accounts`) phân công 14 ngày kể từ ngày mai, `CaSang` + `CaChieu` vào các thứ chi nhánh mở, bằng **đúng mã sản xuất** (`syncShiftSlots(em, …)`, không phụ thuộc DI); thêm 1–2 yêu cầu nghỉ mẫu (`ChoDuyet`, `DaDuyet`). `admin` chưa có seed nào của lịch/khung giờ/nghỉ phép nên không trùng. Test tự động **không dùng seed** | B15 |
| Q40★ | Mức cô lập và thử lại | Như booking Q42: mọi giao dịch ghi dùng `READ COMMITTED` mở tường minh, thử lại ≤ 2 lần khi 1213/1205 **chỉ trước commit**; **chỉ chốt sau khi đo M1, M2, M3 ở X1**, trước khi viết B3 (ghi) **Đã trả lời: đồng ý "chưa đo" tới X1 (M1, M2, M3); không viết B3 (ghi) trước khi có số đo. B2 (xem trước: đọc thường, không khoá, không ghi) vẫn phụ thuộc X1 chỉ vì cần đo M9 (mảng trong DTO).** | X1, B3 |
| Q41 | Tên endpoint | Chấp nhận danh sách `[đề xuất]` ở mục 5.11 | B-task |
| Q42 | Tệp ảnh | Không có use case nào tải ảnh lên; không có câu hỏi nơi lưu | — |

### 4.3 Mọi chỗ còn `[cần điền]` / `[đề xuất]` liên quan (và câu hỏi tương ứng)

| Chỗ | Nguồn | Giá trị/đề xuất | Hỏi |
|---|---|---|---|
| "Giờ của từng ca chưa được quy định: [cần điền]" | PCLV b4 | Khoảng nhận khám tương ứng của chi nhánh | Q6 |
| Thứ chưa khai báo xử lý như chưa nhận phân công `[đề xuất]` | PCLV TĐK; quy tắc 28, 29; search Q4 | `CHI_NHANH_CHUA_KHAI_BAO` (cùng nhóm với nghỉ); chờ admin Q45 | — (kế thừa) |
| Ca của hôm nay đã kết thúc có "đã qua" `[cần điền]` | Quy tắc 13, 29 | Hôm nay chỉ nhận ca chưa kết thúc | Q9 |
| Giờ ca = khoảng nhận khám `[đề xuất]` | Quy tắc 29, 39; ghi chú `lich_lam_viec` | Như trên | Q6 |
| `CaToi` giữ hay bỏ khỏi enum `[cần điền]` | Quy tắc 44; mục 8 bước 7 | Service từ chối; không đổi enum | — |
| Phạm vi thao tác nhiều ngày/nhiều bác sĩ | Figma `516:2` | Q10 | Q10 |
| Hạn tối thiểu/tối đa xin nghỉ; số yêu cầu chờ; độ dài lý do | Prompt; 2.4 không nêu | 90 ngày, 31 ngày, 5 yêu cầu, 2–500 ký tự `[đề xuất]` | Q19, Q25 |
| Chi nhánh của yêu cầu nghỉ | TYN b4 | Suy ra; không lưu | Q28 |
| Lý do từ chối | PDN; Figma `584:2` | Q27 | Q27 |
| Quy mô sinh khung giờ | Quy tắc 39 "thuật toán chưa có mã" | Sinh sẵn trong giao dịch; đo M6 | Q7, Q10 |
| Mã sự kiện thông báo `[đề xuất]`; chữ trong thông báo `[đề xuất]` | `thong_bao.loai_su_kien` chưa có danh mục chung | `NghiPhepDaGui`, `NghiPhepChoDuyet`, `NghiPhepDaDuyet`, `NghiPhepTuChoi` | Q33 |
| Chu kỳ sweeper 5 phút, lô 50, trần 5 lô `[đề xuất]` | — | Hằng có tên | Q29 |
| Ngưỡng tương phản của Figma (mục 4.4) | ADR 0004 | Dùng token có sẵn, không chép màu | — |

### 4.4 Đối chiếu Figma (đã đọc 08/11/2026 bởi một phiên riêng, file `1OsOfwD5myNNRv7FPCD9YC`, trang `63:2`, 252 frame cấp 1, toàn bộ 1440 px, **không có frame mobile**)

Nguồn: `get_metadata` (12 MB, phân tích bằng script) + `get_design_context` + 23 ảnh chụp 1440 px; chữ nhãn lấy nguyên văn. **Bố cục và khoảng cách chưa đối chiếu bằng mắt từng frame**; tỷ lệ tương phản bên dưới **ước tính tay, phải đo lại**. Khung điều hướng (thanh bên 225 px) không có frame riêng, nằm trong mỗi frame.

| Vai trò | Frame (nodeId), màn hình và nhãn chữ nguyên văn quan trọng | Task |
|---|---|---|
| Bác sĩ | `466:2` Lịch làm việc (lưới tuần: tiêu đề, "Chi nhánh công tác: …", nút "Yêu cầu nghỉ", "Tuần 12/10 – 18/10/2026", chuyển Tuần/Tháng, lọc "Tất cả trạng thái"/"Tất cả ca", thống kê "8 Ca làm việc / 0 Nghỉ đã duyệt / 0 Chờ duyệt", chú giải "Làm việc / Nghỉ đã duyệt / Chờ duyệt / Đã hủy / Yêu cầu bị từ chối", hàng "Sáng 08:30–11:30", "Chiều 13:30–17:00", ô "Làm việc" + "Có 5 lịch khám", ô "Không có ca", mục "Lịch sử yêu cầu nghỉ"); `467:2` chế độ tháng (ô ngày có chip "S · Làm việc", "C · Làm việc" hoặc "—"; hôm nay là vòng tròn đặc) | F2, F3 |
| Bác sĩ | `468:2` hộp "Yêu cầu nghỉ lịch làm việc" ("Loại nghỉ *" = "Cả ngày (có thể nhiều ngày)", "Từ ngày *", "Đến ngày *", "Lý do *" placeholder "Vui lòng nhập lý do nghỉ...", nút "Hủy"/"Gửi yêu cầu"); `470:2` sau khi gửi (toast "Yêu cầu nghỉ đã được gửi và đang chờ Admin duyệt.", dòng lịch sử "26/10 · Theo ca · Ca sáng · Việc gia đình" + chip "Chờ duyệt"); `471:2` chi tiết ("Loại: Theo ca", "Ngày", "Ca", "Lý do", "Gửi lúc", nút "Hủy yêu cầu"/"Đóng"); `472:2` xác nhận hủy ("Bạn có chắc chắn muốn hủy yêu cầu nghỉ này? Thao tác không thể hoàn tác.", "Không"/"Hủy yêu cầu", **không có ô lý do**, kết quả không vẽ); `469:2` chi tiết ca ("Chi tiết ca làm việc", chip "Làm việc", Ngày, "Ca: Ca sáng · 08:30 – 11:30", Chi nhánh, "Lịch hẹn: 5 lịch khám", nút "Xem lịch hẹn trong ca"/"Đóng") | F4 |
| Lễ tân | `486:2` Lịch làm việc bác sĩ (nhãn "Chỉ xem" + chip chi nhánh cố định; lọc "Tất cả chuyên khoa / bác sĩ / ca / trạng thái"; "12/10 – 18/10/2026" ‹ › + nút "Hôm nay"; chú giải "Làm việc / Nghỉ phép / Chờ duyệt / Không có lịch"; nhóm theo bác sĩ "ThS.BS. … – Tim mạch"; ô "• Làm việc" + "1 lịch hẹn"/"Chưa có lịch"; chân "Trang này chỉ để xem. Lễ tân không thể chỉnh sửa lịch làm việc bác sĩ."); `499:2` drawer chi tiết ca (liệt kê lịch hẹn: giờ, tên bệnh nhân, mã `CP…`, chip, nút "Quản lý lịch hẹn"); `500:2` "Hôm nay" và `501:2` "Chi tiết ngày" (**hai frame giống hệt nhau**, ghi "Không có ca làm việc" nhưng liệt kê 8 bác sĩ "Không có lịch") | F5 |
| Admin | `515:2` Lịch làm việc bác sĩ (lưới tuần mọi chi nhánh; nút "+ Phân công ca"; lọc chi nhánh/chuyên khoa/bác sĩ/ca/trạng thái; chi nhánh ghi bên phải hàng bác sĩ; **ô trống có dấu "+"**); `516:2` hộp "Phân công ca làm việc" ("Chi nhánh", "Chuyên khoa" chỉ để lọc danh sách bác sĩ; "Từ ngày *", "Đến ngày *", "Thứ trong tuần *" T2…CN, "Ca làm việc *" Sáng/Chiều/Cả ngày, "Ghi chú" tuỳ chọn, ô "Tìm tên bác sĩ...", danh sách theo chuyên khoa có checkbox, khung "Bác sĩ được phân công – 0 bác sĩ", khung "XEM TRƯỚC", nút "Hủy"/"Phân công"); `519:2` Chi tiết ca ("QUY TẮC LỊCH LÀM VIỆC", cảnh báo vàng "Có 1 lịch hẹn đang hoạt động trong ca này. Không thể chỉnh sửa quy tắc khi còn lịch hẹn chưa xử lý.", **không nút Sửa/Xoá**); `580:2` Ca chưa phân công (nút "+ Phân công ca này") | F6, F7 |
| Admin | `582:2` Duyệt yêu cầu - Yêu cầu nghỉ phép (hai tab "Yêu cầu nghỉ phép (2)", "Yêu cầu đổi lịch (2)"; thẻ Chờ duyệt/Đã duyệt/Từ chối/Tổng; lọc "Tìm kiếm", "Trạng thái", "Từ ngày gửi", "Đến ngày gửi", "Chi nhánh"; cột "Bác sĩ \| Loại nghỉ \| Thời gian \| Lý do \| Ngày gửi \| Lịch hẹn bị ảnh hưởng \| Trạng thái \| Thao tác"; nút "Từ chối"/"Duyệt"; phân trang "Hiển thị 1–2 của 2 yêu cầu"); `583:2` chi tiết (drawer; "LỊCH HẸN BỊ ẢNH HƯỞNG (0)" – "Không có lịch hẹn bị ảnh hưởng"); `584:2` "Từ chối yêu cầu nghỉ phép" ("Lý do từ chối *" bắt buộc, nút "Từ chối" vô hiệu khi trống); `585:2` "Xác nhận duyệt nghỉ phép" ("Hành động này không thể hoàn tác.", "Bác sĩ" trống, "Thời gian nghỉ", "Bệnh nhân nhận thông báo: 0 bệnh nhân"); `586:2` Đã duyệt (banner "Đã duyệt nghỉ phép. Đã hủy 0 lịch hẹn.", chip "Đã duyệt" + "Đã xử lý"); `517:2` rỗng ("Không có yêu cầu nào") | F8, F9 |
| Admin Chi nhánh | `622:2` (chip chi nhánh chỉ đọc, 8 bác sĩ Quận 3, vẫn có "+ Phân công ca", banner "Có 1 yêu cầu nghỉ chờ duyệt trong phạm vi của bạn" + "Xem yêu cầu"); `623:2` Duyệt yêu cầu (chip chi nhánh chỉ đọc); thanh bên không có Đặt cọc & Hoàn tiền, Email Preview, Phụ phí bác sĩ, Cài đặt hệ thống | F6, F8 |
| Email | `688:2` "[CLINIX] Cập nhật yêu cầu nghỉ phép" ba tab "Đã gửi · Chờ duyệt", "Được phê duyệt", "Bị từ chối" (**chỉ tab đầu có nội dung**); chân thư còn `[cần điền]` (hotline, email, địa chỉ); chuỗi mô phỏng "Xem trước · Dữ liệu minh họa …" phải bỏ | `[CHỜ notification]` |
| Ngoài module (tham khảo) | `454:2` Bác sĩ - Tổng quan ("Ca làm việc hôm nay", "Yêu cầu nghỉ gần nhất"), `456:2` thông báo "Yêu cầu nghỉ phép được duyệt", `507:2` Admin - Tổng quan | module sau |

**Danh sách lệch Figma cần nhóm sửa hoặc quyết** (đã đánh số L20–L30 ở mục 3.4): quy tắc lặp nhiều bác sĩ so với 2.4 từng ngày (Q10); ô Ghi chú và panel "QUY TẮC" không có chỗ lưu; không có nút Gỡ/Sửa ca (Q8); số lịch hẹn và danh sách bệnh nhân trong ô/drawer là dữ liệu `booking` (Q18); "Chờ duyệt" ở Lễ tân và lưới mọi bác sĩ (Q15, Q16); thiếu lọc chi nhánh/nút "Hôm nay" ở Bác sĩ; form "Theo ca" thiếu (Q37); nút "Hủy yêu cầu" của Bác sĩ (Q23); lý do từ chối bắt buộc không có cột (Q27); hộp "Xác nhận duyệt" không nêu huỷ/hoàn cọc, thiếu tên Bác sĩ (Q32); thiếu dòng "Từ chối" và danh sách lịch hẹn bị ảnh hưởng khi N > 0; `500:2`≡`501:2`; **dữ liệu mẫu mâu thuẫn** (giờ ca sáng 08:30 ở lưới và 08:00 ở drawer; hôm nay 18/10 mà thông báo ghi 19/10; ba bộ ngày nghỉ khác nhau cho cùng bác sĩ; Tổng quan Admin "Chờ duyệt 0" trong khi trang Duyệt có 2; Admin `580:2` liệt kê 2 lịch hẹn ở ca "chưa phân công"; Tổng quan Bác sĩ vừa có 2 lịch hẹn vừa "Hôm nay không có ca làm việc"; ngày ISO `2026-01-01 → 2026-12-31` lẫn dd/MM/yyyy; "Gửi lúc 07:06:06 18/10/2026" thứ tự giờ–ngày; nhãn không đồng nhất giữa các vai trò: "Nghỉ đã duyệt/Nghỉ phép", "Chưa có lịch khám/Chưa có lịch", "Loại/Loại nghỉ"; chip "Từ chối" cam ở Bác sĩ nhưng thẻ "Từ chối" đỏ ở Admin) — **dữ liệu minh hoạ, không phải quy tắc**; chuỗi mô phỏng/kỹ thuật phải bỏ khỏi bản chạy thật (`688:2`, và `507:2` có chữ "UC 56", "depositAmount").

**Tương phản (ADR 0004, WCAG 2.2 AA: chữ ≥ 4,5:1, viền/thành phần ≥ 3:1):** các cặp sau của Figma **không đạt (ước tính tay, phải đo lại)**; F-task dùng token có sẵn (`brand-strong`, token chữ phụ đạt 4,5:1), **không chép màu Figma**, và ghi vào danh sách lệch Figma: chữ `#99a1af` trên trắng ≈ 2,6:1 ("Không có ca", giờ ca, "0 yêu cầu", "Chưa có yêu cầu nghỉ nào."); nút "Duyệt" trong bảng Admin trắng trên `#00b8db` ≈ 2,4:1; nút "Duyệt"/"Xác nhận duyệt" trắng trên `#00a63e` ≈ 3,2:1; trắng trên `#0092b8` ≈ 3,6:1 (chip "Hôm nay", mục thanh bên đang chọn, nút "Yêu cầu nghỉ", "Phân công ca"); nhãn phụ trong ô Bác sĩ `#1a7a9c` trên `#ebf7fd` ≈ 3,2:1 ở cỡ 11,25 px. Các chip trạng thái chính đạt: "Chờ duyệt" `#bb4d00` trên `#fffbeb` ≈ 4,8:1, "Đã duyệt" `#008236` trên `#f0fdf4` ≈ 4,7:1. Màu chú giải (tên) lấy làm tham chiếu: Làm việc xanh dương nhạt (`#ebf7fd`/`#49bce2`), Nghỉ đã duyệt đỏ nhạt (`#fef2f2`/`#fca5a5`), Chờ duyệt vàng hổ phách (`#fffbeb`/`#fde68a`), Đã hủy xám (`#f5f5f5`/`#e5e5e5`), Yêu cầu bị từ chối cam (`#fff7ed`/`#fdba74`); **không có frame nào vẽ ô lịch ở trạng thái nghỉ đã duyệt, chờ duyệt, đã hủy hay bị từ chối**.

### 4.5 Trạng thái chưa có frame Figma (nhóm bổ sung; trong lúc chờ, FE theo cách của `patient` Q22)

Dùng thành phần có sẵn `loading-state`, `error-state`, `empty-state`, `offline-banner` và thông báo lỗi dưới ô như màn auth, câu chữ ở mục 5.14; không tự thiết kế bố cục mới (AGENTS mục 4: "thiếu thì hỏi"). Danh sách còn thiếu:
- **Bác sĩ:** form "Theo ca" (một ngày + chọn ca); lỗi nhập (A1: quá khứ, ngoài lịch phân công, thiếu lý do, nhiều ngày cho "Theo ca", chồng yêu cầu, quá hạn); ô lịch ở trạng thái nghỉ đã duyệt/chờ duyệt/bị từ chối; lọc chi nhánh và nút "Hôm nay"; lịch sử yêu cầu với trạng thái Đã duyệt/Từ chối (và Đã hủy nếu Q23), bộ lọc, phân trang; chi tiết có lý do từ chối/người xử lý; thông báo "bị từ chối"; trạng thái rỗng/lỗi/mất mạng của lưới; kết quả sau "Hủy yêu cầu" (nếu Q23).
- **Lễ tân:** chế độ tháng (nếu cần), trạng thái rỗng/lỗi/mất mạng, 403 khi mở bác sĩ ngoài phạm vi; `500:2`/`501:2` khác nhau chỗ nào.
- **Admin / Admin Chi nhánh:** lỗi phân công (A1–A4, trùng ca, vượt giới hạn, `viPham[]`), toast thành công, "Xem trước" khi đã điền đủ, hộp Phân công điền sẵn khi bấm ô "+", nút Gỡ ca và lỗi `CA_DANG_CO_LICH_HEN`, hộp Phân công của Admin Chi nhánh; dòng yêu cầu/ chip "Từ chối", danh sách lịch hẹn bị ảnh hưởng khi N > 0, banner kết quả có huỷ lỗi/hoàn tiền lỗi, nút "Xử lý lại", yêu cầu `YEU_CAU_DA_XU_LY`, lỗi tải, phân trang.
- **Email/thông báo:** các tab "Được phê duyệt", "Bị từ chối" của `688:2`; thông báo "bị từ chối" của Bác sĩ.
Các mục này gom vào task D3 (danh sách việc Figma cho nhóm).

### 4.6 Việc của nhóm (ngoài repo)

- Trả lời Q1–Q42 (mục 4.2). **Trung** đã đọc và xác nhận Q1, Q2, Q3 và các điểm chạm `admin/**`, `search/**`, `audit/**`, `docs/features/search/*` ngày 08/11/2026 (thẻ `[CHỜ Trung]` đã gỡ; riêng Q5, điểm chạm `rbac/` của P3, chưa nêu với Trung); **đối chiếu mục 5.10 với PLAN `booking`** (Đại) **trước khi tạo issue** và ghi vào `TRACKING.md` mục 3 của cả hai module.
- Cập nhật **2.4** (repo `TLCN_CLINIX`, người dùng làm): PCLV (quy tắc lặp nhiều bác sĩ, A4 hợp nhất vào "ca không tồn tại", gỡ ca, hôm nay); XLV (lưới mọi bác sĩ, Lễ tân thấy ngày nghỉ `ChoDuyet` không thấy lý do, 403 cho bác sĩ ngoài phạm vi, lọc chi nhánh); TYN (hạn, chồng nhau; **không** sửa 2.4 cho Hủy yêu cầu, Q23); PDN (lý do từ chối, nội dung hộp xác nhận) — chi tiết ở D2.
- **Việc nhóm quyết (đã hoãn, chưa làm đợt này):** (1) Bác sĩ tự huỷ yêu cầu `ChoDuyet` (Figma `471:2`, `472:2`; Q23: xoá hàng không đổi schema, hoặc thêm `DaHuy` đổi schema); (2) gỡ ca đã từng có lịch hẹn (Q8: cờ `da_go` ở `lich_lam_viec`, hoặc cho xoá khung giờ chỉ bị lịch `DaHuy` tham chiếu); (3) hiện lý do từ chối ở Chi tiết (Q27 phương án b, thêm cột); (4) bỏ `CaToi` khỏi enum (quy tắc 44); (5) lệnh đồng bộ khung giờ khi lịch hoạt động chi nhánh đổi.
- Figma: bổ sung các trạng thái chưa có (mục 4.5), sửa các lệch L20–L30 và tương phản (mục 4.4).
- Báo Trung các chỗ `[ĐỤNG admin]`, `[ĐỤNG search]`, `[ĐỤNG rbac]`, `[ĐỤNG audit]`, `router/*`, `database/*`; báo **Đại** các chỗ chạm `booking` (D13, D14, điều kiện `thoi_gian > now` của D5) và `router/role-routes.tsx` (booking F1, F8, F10, F11 cũng sửa).
- Ghi `AI_USAGE_LOG.md` bảng 1 cho lần lập kế hoạch này **sau khi Đại đồng ý** (công cụ: Claude Code, Claude Sonnet 5.5).

## 5. Thiết kế kỹ thuật

### 5.1 Cấu trúc thư mục (tạo thư mục khi có file đầu tiên; test cạnh mã)

```
apps/api/src/
  scheduling/                          # DÙNG CHUNG, sở hữu: doctor. KHÔNG phụ thuộc appointments/ (H20)
    scheduling.module.ts               # xuất: BranchHoursReader, SlotGeneratorService, AvailableSlotsReader, LeaveReader, ShiftQueries
    scheduling.constants.ts            # mã lý do, hằng giới hạn (92 ngày, 1.000 ca, 31/90 ngày nghỉ, 5 yêu cầu chờ)
    branch-hours/  branch-hours.types.ts · shift-window.rules.ts (D2, thuần) · branch-hours.reader.ts · time-of-day.ts
    slots/         slot-generator.rules.ts (thuần) · slot-generator.ts (syncShiftSlots + SlotGeneratorService, D1)
                   available-slots.reader.ts (D3) · slot-status.rules.ts (thuần)
    leave/         leave-overlap.rules.ts (thuần) · leave.reader.ts (D4)
    shifts/        shift-queries.ts (đọc ca dùng chung với admin)
  doctor/
    doctor.module.ts
    entities/      yeu-cau-nghi-phep.entity.ts · enums.ts
    common/        doctor-scope.sql.ts (vị từ phạm vi bác sĩ theo chi nhánh) · parse-record-id.pipe.ts (pipe mỏng gọi `parsePublicId` của `search`)
    shifts/        shift-assignment.{controller,service,repository,dto}.ts · shift-assignment.rules.ts (mở quy tắc, thuần) · shift-removal.service.ts · admin-shift-list.*
    schedule-view/ doctor-schedule.controller.ts · reception-schedule.controller.ts · schedule-view.{service,repository,dto}.ts
    leave-requests/doctor-leave.{controller,service,repository,dto}.ts · leave-request.rules.ts (thuần)
    leave-approval/admin-leave.{controller,service,repository,dto}.ts · leave-approval.service.ts (D5) · leave-cancellation.runner.ts
                   leave-cancellation.sweeper.job.ts · ports/appointment-cancellation.port.ts
    notifications/ leave-notifier.ts
    testing/       doctor-fixtures.ts · concurrency-harness.ts · invariants.ts (H13)
  database/migrations/17933xxxxxxxx-tao-bang-nghi-phep.ts       # P1 (timestamp = lúc tạo, lớn hơn mọi migration đã merge)
  database/seeds/doctor-demo-*.ts                               # B15 (+ SEED_COMMANDS, package.json)
apps/web/src/
  shared/schedule/                     # [ĐỤNG shared] hàm thuần: tuần/tháng theo giờ VN, nhãn ca, nhãn trạng thái nghỉ
  features/doctor/
    index.ts · doctor-paths.ts · doctor-routes.tsx
    shell/doctor-layout.tsx            # F1
    api/ (schedule-api.ts · leave-api.ts · admin-api.ts)           # chỉ qua shared/api/client
    schedule/ (Bác sĩ: lưới tuần, tháng, chi tiết ca) · leave/ (form, lịch sử, chi tiết) · reception/ (lưới Lễ tân)
    admin/ (lưới, phân công, duyệt)    # import duy nhất từ features/admin/index.ts (Q36)
```

### 5.2 Luật giờ ca và khung giờ (hàm thuần, D2) — **một chỗ định nghĩa**

```ts
// scheduling/branch-hours/branch-hours.types.ts [đề xuất]
type CaLamViec = 'CaSang' | 'CaChieu' | 'CaToi';
interface ShiftRange { tuGiay: number; denGiay: number }            // giây từ 00:00 giờ VN (TIME 'HH:MM:SS' → số), tránh Date
interface BranchDayHours { hoatDong: boolean; sang: ShiftRange | null; chieu: ShiftRange | null }  // `null` ở chỗ gọi = CHƯA KHAI BÁO (không có dòng)
type HoursViolation = 'ChuaKhaiBao' | 'NgayNghi' | 'CaKhongTonTai' | 'NgoaiGioHoatDong';        // = mã của quy tắc 29
```
- `shiftWindow(ca, ngayHoatDong): { ok: true; khoang: ShiftRange } | { ok: false; lyDo: 'ChuaKhaiBao' | 'NgayNghi' | 'CaKhongTonTai' }`: `null` ⇒ `ChuaKhaiBao`; `hoatDong = false` ⇒ `NgayNghi`; `CaSang` cần `sang`, `CaChieu` cần `chieu`, **`CaToi` luôn `CaKhongTonTai`**.
- `checkShiftAssignable({ ngay, ca, ngayHoatDong, thoiLuongPhut, now })` (PCLV A1, A3, A4): theo thứ tự `ngay < hôm nay` ⇒ `NGAY_PHAN_CONG_DA_QUA`; `shiftWindow`; hôm nay mà `giờ hiện tại ≥ khoang.denGiay` ⇒ `CA_DA_KET_THUC`; `sinh được 0 ô` ⇒ `CA_KHONG_DU_MOT_KHUNG_GIO`. Chi tiết lỗi `CA_KHONG_TON_TAI` kèm `khoang: { sang, chieu }` của ngày (giữ ý A4b).
- **`checkSlotWithinBranchHours({ ngayGio: Date, thoiLuongPhut: number, ca, ngayHoatDong }): { ok: true } | { ok: false, lyDo, chiTiet: { thuTrongTuan, gioMo?, gioDong?, khoang? } }`** — đúng chữ ký của booking 5.10 D2 (`khoang?` là trường **thêm tuỳ chọn**); khung giờ `[ngayGio, ngayGio + thoiLuong]` nằm TRỌN trong khoảng của ca, **biên hai đầu hợp lệ** (kết thúc đúng giờ kết thúc khoảng là hợp lệ); `gioMo`/`gioDong` = giờ bắt đầu sớm nhất/kết thúc muộn nhất của ngày (định dạng `HH:MM`).
- `generateSlotStarts(khoang, thoiLuongPhut): number[]` — `start = tuGiay; while (start + thoiLuongPhut*60 ≤ denGiay) { push; start += thoiLuongPhut*60 }`. Ví dụ cố định (quy tắc 29): 07:30–11:00 và 50 phút ⇒ 07:30, 08:20, 09:10, 10:00 (bỏ 10 phút cuối); 08:00–12:00 và 30 phút ⇒ 8 ô; 23:00–23:59:59 và 30 phút ⇒ chỉ 23:00.
- `BranchHoursReader.load(em, chiNhanhId, thuTrongTuan): Promise<BranchDayHours | null>` và `loadMany(em, pairs[])` (một truy vấn): `SELECT gio_*` từ `chi_nhanh_lich_hoat_dong`, `TIME` → giây. `thuTrongTuan` của một ngày `YYYY-MM-DD` tính bằng hàm thuần (`weekdayVN` trên `new Date(`${ngay}T00:00:00+07:00`)`), khớp `WEEKDAY(ngay)+1` của MySQL (test PC-26 so hai cách, M5).
- **Một biểu diễn:** `search/common/weekly-schedule.view.ts` giữ nguyên (hiển thị `'HH:MM'`); module này cung cấp thêm hàm `formatRange(ShiftRange)` để hai bên không tự chuyển đổi lần hai. Không sửa `search` trong phạm vi này.

### 5.3 Phân công (PCLV) — `POST /admin/doctor-shifts`

1. Ngoài giao dịch: DTO (`bacSiIds` 1–20 duy nhất, chữ số; `tuNgay`, `denNgay` ngày lịch hợp lệ, `denNgay ≥ tuNgay`, khoảng ≤ 92 ngày; `thuTrongTuan` 1–7 duy nhất không rỗng; `cas` ⊆ {`CaSang`, `CaChieu`} không rỗng, **`CaToi` bị `CA_KHONG_HOP_LE`**); chốt `now`, `today`; **mở quy tắc** (hàm thuần `expandRule`) thành tập `(bacSiId, ngay, ca)`; > 1.000 hàng ⇒ 400 `QUA_NHIEU_CA`.
2. Giao dịch `READ COMMITTED` (Q40): `SELECT … FROM bac_si b JOIN tai_khoan t … WHERE b.tai_khoan_id IN (…) ORDER BY b.tai_khoan_id FOR UPDATE` (một câu, khoá theo id tăng dần). Thiếu bác sĩ hoặc (Admin Chi nhánh) `chi_nhanh_id` ≠ chi nhánh Admin ⇒ **404 cùng thân** (admin Q40); `NgungHoatDong` ⇒ 409 `BAC_SI_KHONG_PHAN_CONG_DUOC` (Q11). **Chi nhánh của ca = `bac_si.chi_nhanh_id` đọc ở câu này** (D12).
3. `SELECT thoi_luong FROM dich_vu_kham WHERE dich_vu_kham_id IN (…) ORDER BY … FOR SHARE` (H4); `BranchHoursReader.loadMany` cho mọi cặp `(chi nhánh, thứ)`; một câu đọc ca đã có của các bác sĩ trong khoảng ngày (`lich_lam_viec`).
4. Với **mọi** hàng, `checkShiftAssignable` + trùng ca đã có (`CA_DA_PHAN_CONG`); thu thập **tất cả** vi phạm (tối đa 50 trong `viPham[]`: `{ bacSiId, ngay, ca, maLoi, chiTiet }`); có vi phạm ⇒ rollback, trả lỗi của vi phạm **đầu tiên** (thứ tự duyệt: bác sĩ, ngày, ca) kèm `viPham[]`. "Cả ngày" thiếu một khoảng ⇒ từ chối cả hai ca và nêu ca nào không tồn tại (quy tắc 29(a), H16).
5. `INSERT INTO lich_lam_viec (bac_si_id, chi_nhanh_id, ngay, ca) VALUES …` theo lô 500; 1062 ⇒ `CA_DA_PHAN_CONG` (lưới an toàn, H2); đọc lại id theo `(bac_si_id, ngay, ca)` (không dựa vào `insertId` liên tiếp: **chưa đo**, M7); `syncShiftSlots` cho từng ca (lô 500, `ON DUPLICATE KEY UPDATE`).
6. `AuditService.record` mỗi bác sĩ: `PhanCongLichLamViec`, đối tượng `tai_khoan` (bác sĩ), `chi_nhanh_id` = chi nhánh của bác sĩ, `{ tu_ngay, den_ngay, thu_trong_tuan[], ca[], so_ca }` (Q34).
7. Commit; `201 { soCa, soKhungGio, theoBacSi[{ bacSiId, soCa }] }`.
- **`POST /admin/doctor-shifts/preview`**: cùng DTO và cùng bước 1, 3, 4 **không ghi và không khoá** (đọc thường; có thể cũ); trả `{ soCa, soKhungGio, viPham[] }` cho khung "Xem trước" của Figma.
- **Gỡ ca (Q8) — `DELETE /admin/doctor-shifts/:id`:** đọc thường ca (404 nếu không có/ngoài phạm vi theo `lich_lam_viec.chi_nhanh_id`) → giao dịch: `bac_si` `FOR UPDATE` → kiểm lại ca còn đó → `SELECT khung_gio_id, trang_thai FROM khung_gio WHERE lich_lam_viec_id = ? FOR UPDATE` → mọi ô `ConTrong` (không thì `CA_DANG_CO_LICH_HEN`) → `DELETE` khung giờ (1451 ⇒ cùng mã) → `DELETE` ca → audit `GoLichLamViec` → commit. `ngay < hôm nay` ⇒ `CA_DA_QUA`.
- Bác sĩ **không** có endpoint ghi ca (PCLV MT); mọi route `@Roles('QuanTriVien')` + `@RequireAdminScope('Any')` (QH-01 và HD-09 quét).

### 5.4 Sinh khung giờ (D1)

`syncShiftSlots(em, { lichLamViecId, ngay, khoang, thoiLuongPhut })` (hàm, không phụ thuộc DI để seed và test gọi được) và `SlotGeneratorService` (bọc mỏng): `generateSlotStarts` rồi `INSERT INTO khung_gio (lich_lam_viec_id, ngay_gio, trang_thai) VALUES (?, 'YYYY-MM-DD HH:MM:SS', 'ConTrong'), … ON DUPLICATE KEY UPDATE lich_lam_viec_id = lich_lam_viec_id` (**chuỗi giờ, không qua `Date`**: H1, M4); trả `{ moi, daCo }`. Chạy lại **không đổi gì** và **không bao giờ ghi `trang_thai`/`giu_cho_den`** của ô đã có (D7). Lệnh "đồng bộ khung giờ" khi lịch hoạt động đổi `[SAU]`.

### 5.5 Khung giờ còn trống (D3)

`AvailableSlotsReader.list({ bacSiId, ngay }, em?)` và `listMany({ bacSiIds, ngay }, em?)` trả `{ bacSiId, ngay, trangThaiNgay, thuNghi?, khungGio: [{ khungGioId, batDau, ketThuc, ca, trangThai }] }` (id chuỗi; `batDau`/`ketThuc` ISO 8601 UTC từ `Date`; **≤ 4 truy vấn cho cả trang**: ca + khung giờ + thời lượng; giờ chi nhánh; nghỉ phép; chi nhánh hiện tại của bác sĩ). Trạng thái từng ô **suy ra khi đọc** (booking Q3; `now` truyền vào):
1. Ô bị **yêu cầu nghỉ `ChoDuyet`/`DaDuyet`** phủ `(ngày, ca)` ⇒ **loại khỏi danh sách** (TYN MT, b5).
2. Ô **ngoài giờ nhận khám hiện hành** (`checkSlotWithinBranchHours` ≠ ok) ⇒ loại.
3. `ngay_gio ≤ now` ⇒ `HetHan`; còn lại `DaDat` ⇒ `DaDat`; `DangGiuCho` có `giu_cho_den > now` ⇒ `DangGiuCho`, `≤ now` hoặc NULL ⇒ `ConTrong`; `ConTrong` ⇒ `ConTrong`; giá trị `HetHan` đã lưu ⇒ `HetHan`.
`trangThaiNgay` (`search` 5.6 + một giá trị thêm): có ca và còn ít nhất một ca không bị nghỉ phép ⇒ `CoLich`; có ca nhưng **mọi ca bị nghỉ phép phủ** ⇒ `NghiPhep` (**thêm so với search 5.6/booking D3**, cho giao diện "Bác sĩ không nhận lịch ngày này"); không có ca và chi nhánh hiện tại của bác sĩ nghỉ/chưa khai báo thứ đó ⇒ `ChiNhanhNghi` + `thuNghi` (thứ ISO); còn lại `KhongCoLich`. **Booking không gọi hàm này trong luồng ghi** (chỉ D2 + khoá). `search` K1 chỉ bọc và gắn endpoint công khai.

### 5.6 Xem lịch (XLV)

- **Bác sĩ** `GET /doctor/schedule?tuNgay&denNgay&ca&chiNhanhId`: `bac_si_id` = `@CurrentUser().accountId` (không nhận từ query; tham số `bacSiId` bị `forbidNonWhitelisted` ⇒ 400 `TRUONG_KHONG_DUOC_PHEP`). Trả `{ tuNgay, denNgay, ca: [{ lichLamViecId, ngay, ca, chiNhanh: {chiNhanhId, ten}, batDau, ketThuc, nghiPhep: 'ChoDuyet'|'DaDuyet'|'TuChoi'|null, soLichHen? }], nghiPhep: [{ yeuCauNghiPhepId, hinhThuc, tuNgay, denNgay, ca, trangThai }], chiNhanhLoc: [...] }`. `soLichHen` chỉ khi D14 có.
- **Lễ tân** `GET /reception/doctor-schedules?tuNgay&denNgay&bacSiId&chuyenKhoaId&ca&q&page` (danh sách bác sĩ **trong phạm vi** + ca của họ trong khoảng): phạm vi chi nhánh từ `ReceptionScopeService` (Q5). Vị từ phạm vi bác sĩ **một chỗ** (`doctor/common/doctor-scope.sql.ts`, bind tham số): `(b.chi_nhanh_id = :cn OR EXISTS (SELECT 1 FROM lich_lam_viec x WHERE x.bac_si_id = b.tai_khoan_id AND x.chi_nhanh_id = :cn))`; ca lấy **chỉ** `v.chi_nhanh_id = :cn` (nằm trong SQL, không lọc sau: H10). `bacSiId` gửi lên mà ngoài phạm vi hoặc không tồn tại ⇒ **403 `KHONG_DU_QUYEN` cùng thân** (Q13); `bacSiId` sai dạng ⇒ 404 `KHONG_TIM_THAY` qua `ParseRecordIdPipe` (chạy sau guard). Danh sách chọn bác sĩ `GET /reception/doctor-schedules/doctors?q&page`. Ngày nghỉ gắn trên từng ca (Q16), **không có `ly_do`**.
- **Admin** `GET /admin/doctor-shifts?tuNgay&denNgay&bacSiId&chiNhanhId&chuyenKhoaId&ca&q&page` và `GET /admin/doctor-shifts/doctors?…`: Toàn hệ thống mọi chi nhánh; Chi nhánh dùng cùng vị từ như Lễ tân với `scope.chiNhanhId` (`BranchAccessPolicy.branchFilter` ép chi nhánh), bác sĩ ngoài phạm vi ⇒ 404 (admin Q40).
- Mọi phản hồi `Cache-Control: no-store`; khoảng > 42 ngày ⇒ 400 `KHOANG_NGAY_KHONG_HOP_LE`; không có ca ⇒ 200 với `ca: []` (A1/5b "lịch trống").

### 5.7 Tạo yêu cầu xin nghỉ (TYN) — `POST /doctor/leave-requests { hinhThuc, tuNgay, denNgay, ca?, lyDo }`

1. DTO (kiểm theo trường, `loi[{truong, ma}]`): `hinhThuc` ∈ {`CaNgay`, `TheoCa`}; ngày hợp lệ; `TheoCa` ⇒ `ca` ∈ {`CaSang`, `CaChieu`} (thiếu ⇒ `ca: CA_BAT_BUOC`; `CaToi` ⇒ `CA_KHONG_HOP_LE`) và `tuNgay = denNgay` (không thì `denNgay: NGHI_THEO_CA_CHI_MOT_NGAY`); `CaNgay` ⇒ không gửi `ca` (`CA_KHONG_DUOC_CHON`) và `tuNgay ≤ denNgay`; `lyDo` theo Q25. `bacSiId` không có trong DTO.
2. Chốt `now`, `today`; `tuNgay < today` ⇒ `NGAY_NGHI_DA_QUA`; khoảng > 31 ngày ⇒ `KHOANG_NGHI_QUA_DAI`; `denNgay > today + 90` ⇒ `NGHI_QUA_XA`.
3. Giao dịch (`READ COMMITTED`): `bac_si` `FOR UPDATE` (serial hoá yêu cầu của chính bác sĩ và với duyệt/đặt lịch) → đếm yêu cầu `ChoDuyet` (< 5, `QUA_NHIEU_YEU_CAU_CHO_DUYET`) → **giao nhau** với yêu cầu `ChoDuyet`/`DaDuyet` (`leave-overlap.rules`, `YEU_CAU_NGHI_TRUNG`, `chiTiet` chỉ mã khoảng, không lộ lý do) → **ca thuộc lịch phân công** (`NGHI_NGOAI_LICH_LAM_VIEC`; Q20): `TheoCa` cần đúng `(ngày, ca)`, `CaNgay` cần ≥ 1 ca trong khoảng; `TheoCa` hôm nay mà ca đã kết thúc ⇒ `CA_DA_KET_THUC` → `INSERT yeu_cau_nghi_phep` (`ChoDuyet`, `thoi_diem_tao` = `toSecond(now)`) → `LeaveNotifier` (Bác sĩ + Admin có thẩm quyền, Q33) → commit.
4. `201 { yeuCauNghiPhepId, trangThai: 'ChoDuyet', hinhThuc, tuNgay, denNgay, ca, soCaBiAnhHuong, soLichHenDangCo? }`. Khung giờ **không đổi trạng thái**; việc chặn là suy ra (D3, D4).
- Bác sĩ xem: `GET /doctor/leave-requests?trangThai&page` (chỉ của mình, mới nhất trước), `GET /doctor/leave-requests/:id` (của người khác hoặc không có ⇒ 404 cùng thân). Huỷ yêu cầu: **không có** (Q23).

### 5.8 Phê duyệt và từ chối (PDN)

- **Danh sách/chi tiết** `GET /admin/leave-requests?trangThai&bacSiId&chiNhanhId&tuNgayGui&denNgayGui&q&page`, `GET /admin/leave-requests/:id`: phạm vi **theo chi nhánh hiện tại của bác sĩ** (`JOIN bac_si b … b.chi_nhanh_id = scope`), ngoài phạm vi ⇒ 404; `thongKe { choDuyet, daDuyet, tuChoi, tong }` (cùng bộ lọc trừ trạng thái); cột "lịch hẹn bị ảnh hưởng" = D13/D14 (`[CHỜ booking B11]`; ẩn khi chưa có); chi tiết thêm `lichHenBiAnhHuong` (D13). Không có yêu cầu `ChoDuyet` ⇒ 200 danh sách rỗng (PDN A1).
- **Bất biến I-1** (cơ sở của Q28): mọi `lich_lam_viec` có `ngay ≥ hôm nay` của một bác sĩ mang `chi_nhanh_id = bac_si.chi_nhanh_id`. Giữ nhờ (a) phân công luôn lấy chi nhánh dưới khoá `bac_si` `FOR UPDATE`, (b) quy tắc 13 chặn đổi chi nhánh khi còn ca từ hôm nay, kiểm dưới cùng khoá. Test bất biến sau mọi ca đồng thời (IV-1, mục 7.9).
- **Từ chối** `POST /admin/leave-requests/:id/reject { lyDo }` (lý do bắt buộc 1–255, Q27c): đọc thường (phạm vi, 404) → giao dịch: **chỉ khoá hàng yêu cầu** `FOR UPDATE` (từ chối không đổi gì mà `booking` quan tâm) → kiểm lại `ChoDuyet` (`YEU_CAU_DA_XU_LY`) → `TuChoi` + `nguoi_xu_ly_id` + `thoi_diem_xu_ly` → audit `TuChoiNghiPhep` → thông báo Bác sĩ (kèm lý do) → commit. Khung giờ "nhận lịch trở lại" là hệ quả của việc yêu cầu không còn `ChoDuyet`/`DaDuyet` (TYN A2, PDN HĐK).
- **Duyệt** `POST /admin/leave-requests/:id/approve` (`[CHỜ booking B10, B11]`):
  1. Đọc thường để lấy `bac_si_id`. Giao dịch `READ COMMITTED`: **`bac_si` `FOR UPDATE`** → khoá hàng yêu cầu `FOR UPDATE` (bất biến `bac_si_id` của yêu cầu) → kiểm lại `ChoDuyet` (`YEU_CAU_DA_XU_LY`) và `ngay_ket_thuc ≥ hôm nay` (`YEU_CAU_NGHI_DA_QUA_HAN`) → `DaDuyet` + người/thời điểm xử lý → audit `DuyetNghiPhep` → thông báo Bác sĩ → **commit** (khoá `bac_si` nhả ở đây).
  2. Sau commit: `LeaveCancellationRunner.run(yeuCau, now)`: `AppointmentQueries.findAffectedByLeave(em, { bacSiId, tuNgay, denNgay, ca?, now })` rồi **tuần tự** `AppointmentCancellationService.cancel({ maLichHen, actor: { kind: 'HeThong' }, reason: 'BacSiNghiPhep', lyDo })` (mỗi lịch một giao dịch riêng của `booking`); `Cancelled` ⇒ `daHuy++`; `AlreadyCancelled` ⇒ `daHuyTruocDo++` (thành công); `NotCancellable` ⇒ `khongHuyDuoc[]`; `NotFound` ⇒ bỏ qua. Ngoại lệ bất ngờ **không** làm hỏng việc duyệt: ghi log mức đếm (không PII), trả `huyLichHen.hoanTat = false`.
  3. `200 { trangThai: 'DaDuyet', huyLichHen: { hoanTat, daHuy, daHuyTruocDo, khongHuyDuoc[{ maLichHen, trangThai }] } }`.
- **Chạy lại idempotent (booking DT-17):** `LeaveCancellationSweeper` (`@Cron` mỗi 5 phút `[đề xuất]`, `NODE_ENV=test` tắt, cờ `running`, lô 50, trần 5 lô): `SELECT … FROM yeu_cau_nghi_phep WHERE trang_thai = 'DaDuyet' AND ngay_ket_thuc >= :today` rồi `LeaveCancellationRunner.run` cho từng yêu cầu — **một yêu cầu một lần chạy, lỗi một yêu cầu không dừng lượt**. Hội tụ vì từ lúc `DaDuyet` commit, đặt lịch bị chặn (D4 dưới khoá `bac_si`) nên tập "bị ảnh hưởng" chỉ co lại. `POST /admin/leave-requests/:id/retry-cancellations` (chỉ yêu cầu `DaDuyet`) gọi cùng hàm. Không đánh dấu "đã xử lý xong" (không có cột): bước (2) rẻ khi tập rỗng (chỉ mục `lich_hen (bac_si_id, thoi_gian)`, M10). **Điều kiện dừng:** yêu cầu qua `ngay_ket_thuc` (không còn được quét) hoặc `findAffectedByLeave` rỗng (chạy không làm gì); log chỉ có số đếm, **không** có tên bệnh nhân, mã lịch hẹn đầy đủ hay lý do.
- Hoàn tiền (`wallet`), thông báo/email bệnh nhân, mời danh sách chờ (**không** khi `BacSiNghiPhep`, booking Q17) nằm **trong `cancel`** của `booking`; module này không gọi `RefundPort`/`WaitlistPort`.

### 5.9 Thứ tự khoá, giao dịch, thử lại — **tầng 4 và 5 của bảng khoá toàn cục (booking 5.3), không thêm chu trình**

| Luồng của `doctor` | Khoá, theo thứ tự (tầng của booking 5.3) | Ghi chú |
|---|---|---|
| Phân công | `bac_si` `FOR UPDATE` (4, nhiều bác sĩ theo id tăng dần) → `dich_vu_kham` `FOR SHARE` (4b, id tăng dần) → ghi `lich_lam_viec` → ghi `khung_gio` (5, chỉ `INSERT`) | `booking` xin `bac_si` `FOR SHARE` ⇒ tuần tự hoá với đặt lịch; không xin `lich_hen` |
| Gỡ ca | `bac_si` `FOR UPDATE` (4) → `khung_gio` của ca `FOR UPDATE` (5) → `DELETE` (kiểm khoá ngoại ở `lich_hen`, 6, không khoá chủ động) | Hướng 4 → 5 → 6 đúng chiều |
| Tạo yêu cầu | `bac_si` `FOR UPDATE` (4) → `INSERT yeu_cau_nghi_phep` → `INSERT thong_bao` (7) | |
| Từ chối | hàng `yeu_cau_nghi_phep` `FOR UPDATE` → `INSERT nhat_ky_hanh_dong`, `thong_bao` (7) | không xin `bac_si` |
| Duyệt, bước 1 | `bac_si` `FOR UPDATE` (4) → hàng `yeu_cau_nghi_phep` `FOR UPDATE` → ghi nhật ký, thông báo (7) → **commit** | Từ chối giữ hàng yêu cầu mà không giữ `bac_si` ⇒ không có chu trình |
| Duyệt, bước 2 và sweeper | **không giữ khoá nào của module này**; gọi `cancel` của `booking` (5 → 6 → 7), mỗi lịch một giao dịch | Không bao giờ giữ `bac_si` X trong lúc gọi `booking` |

Quy tắc áp dụng: mọi giao dịch ghi mở `READ COMMITTED` tường minh (Q40, chốt sau X1); thử lại tối đa 2 lần (tổng 3) khi 1213/1205 **chỉ trước commit**, không bao giờ sau commit; luồng trả **kết quả có kiểu** thay vì ném `AppException` trong giao dịch (nếp `LoginService`); `now` chốt một lần (H18); job quét theo lô, mỗi yêu cầu một lần chạy, không giữ khoá giữa các yêu cầu.

### 5.10 **Hợp đồng với `booking` (mục 5.10 của booking, D1–D12) và các cổng khác** — `[đề xuất]`, đối chiếu hai PLAN TRƯỚC khi tạo issue

**A. Đối chiếu từng điểm** (Q4). Cột "Khớp?": **Khớp** = tên, chữ ký, chủ sở hữu trùng booking; **Khác** = nêu rõ khác chỗ nào, lý do và đề xuất cụ thể.

| # | Điểm giao tiếp | Ai làm / ai gọi | Tên và chữ ký (PLAN này) | Khớp? và ghi chú |
|---|---|---|---|---|
| D1 | Sinh `khung_gio` | `doctor` sở hữu; booking **không** gọi | `SlotGeneratorService` (`scheduling/slots/slot-generator.ts`) bọc hàm `syncShiftSlots(em, { lichLamViecId, ngay, khoang, thoiLuongPhut })` | **Khớp**; thêm hàm không DI cho seed; chỉ `INSERT … ON DUPLICATE KEY UPDATE`, idempotent (Q7) |
| D2 | Luật "khung giờ nằm trọn trong khoảng của ca" | `doctor` định nghĩa; `booking` và `search` GỌI | `checkSlotWithinBranchHours({ ngayGio: Date, thoiLuongPhut, ca, ngayHoatDong: BranchDayHours \| null }): { ok: true } \| { ok: false, lyDo, chiTiet: { thuTrongTuan, gioMo?, gioDong? } }` (hàm thuần) và `BranchHoursReader.load(em, chiNhanhId, thuTrongTuan): Promise<BranchDayHours \| null>` | **Khớp chữ ký.** Booking chưa định nghĩa `BranchDayHours`: **định nghĩa ở 5.2** (giây từ 00:00; `null` = chưa khai báo). **Bổ sung additive:** `chiTiet.khoang?`, `loadMany`, `shiftWindow`, `checkShiftAssignable`, `generateSlotStarts`. Mã `lyDo` = mã quy tắc 29 |
| D3 | "Khung giờ còn trống" | `doctor` sở hữu; `search` K1 gọi | `AvailableSlotsReader.list({ bacSiId, ngay }, em?)` ⇒ `{ trangThaiNgay, khungGio: [{ khungGioId, batDau, ketThuc, ca, trangThai }] }` | **Khớp.** **Khác với booking 5.10 ở:** (1) thêm `listMany({ bacSiIds, ngay })` (một trang bác sĩ, tránh N+1); (2) `trangThaiNgay` có **4 giá trị** `CoLich`/`KhongCoLich`/`ChiNhanhNghi`/`NghiPhep` (search 5.6 chỉ 3; lý do: bác sĩ có ca nhưng nghỉ phép phủ hết cần thông báo riêng) và `thuNghi?`; (3) quy tắc loại ô: nghỉ phép **cả `ChoDuyet`** và ô ngoài giờ hiện hành bị loại (không trả ô "bị chặn"). Đề xuất: Trung sửa PLAN `search` 5.6 theo đây (D1 của PLAN này) |
| D4 | Nghỉ phép chặn khung giờ | `doctor` sở hữu bảng; booking dùng qua cổng | `LeaveReader.findBlockingLeave(em, { bacSiId, ngay, ca }): Promise<{ yeuCauNghiPhepId: string, trangThai: 'ChoDuyet' \| 'DaDuyet' } \| null>` | **Khớp** (cả `ChoDuyet` và `DaDuyet` chặn; trùng `(ngày, ca)` hoặc `CaNgay` phủ ngày). Thêm `listBlocking(em, { bacSiIds, tuNgay, denNgay })` cho D3. `NoopDoctorLeavePort` của booking thay bằng `LeaveReader` ở booking B16 |
| D5 | Đồng bộ duyệt nghỉ ↔ đặt lịch | `doctor` gọi `booking` | Hai giai đoạn như booking: (1) `bac_si` X → đổi trạng thái → commit; (2) `AppointmentQueries.findAffectedByLeave(em, { bacSiId, tuNgay, denNgay, ca? }): Promise<{ lichHenId: string, maLichHen: string }[]>` rồi `cancel({ maLichHen, actor: { kind: 'HeThong' }, reason: 'BacSiNghiPhep', lyDo })` | **Khớp**, kèm hai **bổ sung yêu cầu cho `booking`:** (a) `findAffectedByLeave` thêm tham số `now: Date` và chỉ lấy lịch có **`thoi_gian > now`** (không huỷ lịch đã qua giờ: Q24, Q30); (b) `cancel` của booking phải **idempotent** (đã có `AlreadyCancelled`). Cơ chế chạy lại (yêu cầu của booking "ca DT-17") là sweeper ở 5.8 |
| D6 | Xác nhận hoàn thành ca khám | `doctor` (phần khám bệnh) gọi `booking` | `AppointmentTransitionService.complete(em, { lichHenId, bacSiId })` | **Ngoài phạm vi đợt này** (phần khám bệnh của `doctor` lập kế hoạch sau); ghi nhận chữ ký; `doctor` không bao giờ `UPDATE lich_hen` (HD-08) |
| D7 | Quy tắc ghi `khung_gio` | cả hai | `doctor`: chỉ `INSERT` khung giờ mới và chỉ `DELETE` khi `trang_thai = 'ConTrong'` sau `FOR UPDATE` đúng các hàng đó; **không** `UPDATE` `trang_thai`/`giu_cho_den` | **Khớp**, làm rõ: `DELETE` còn bị chặn khi khung giờ bị `lich_hen`/`muc_cho_danh_sach_cho`/`yeu_cau_doi_lich_ngoai_chinh_sach` tham chiếu (khoá ngoại 1451 ⇒ `CA_DANG_CO_LICH_HEN`); `DangGiuCho` đã hết hạn chưa quét **vẫn chặn** |
| D8 | Trang Bác sĩ "Lịch hẹn" | `booking` làm trang; `doctor` gắn vào khung | `features/booking/index.ts` xuất `DoctorAppointmentsPage` và `DOCTOR_APPOINTMENT_ROUTES: RouteObject[]` (đường dẫn tương đối `lich-hen`) | **Khớp.** Phân công sửa `router/role-routes.tsx` để hai người không đụng nhau: **`doctor` F1 tạo mục `BacSi` với `children: [{ errorElement, children: [ …index, ...DOCTOR_ROUTES ] }]`**; `booking` F11 chỉ **thêm một dòng** `...DOCTOR_APPOINTMENT_ROUTES` và `to` ở `DOCTOR_NAV`. F1 merge trước |
| D9 | Seed | `doctor` seed lịch + khung giờ (bằng D1) cho bác sĩ `search-demo`; booking seed `moc_hoan_tien` + dịch vụ cọc > 0 | lệnh `seed:doctor-demo`, idempotent | **Khớp** (Q39) |
| D10 | `khungGioId` ở K1 | `doctor` trả (D3); `search` chuyển tiếp | trường `khungGioId` (chuỗi) | **Khớp** |
| D11 | Khoá `bac_si` | cả ba | `doctor`: phân công, gỡ ca, **tạo yêu cầu** và **duyệt** khoá `FOR UPDATE`; **từ chối không khoá**; booking tạo lịch `FOR SHARE` | **Khớp, thêm:** tạo yêu cầu cũng `FOR UPDATE` (serial hoá yêu cầu của cùng bác sĩ); `dich_vu_kham` `FOR SHARE` ở phân công (tầng 4b, mới) |
| D12 | Chi nhánh của ca | `doctor` bảo đảm khi phân công | `lich_lam_viec.chi_nhanh_id` = `bac_si.chi_nhanh_id` đọc dưới `FOR UPDATE` | **Khớp**; bất biến I-1 và test IV-1 |
| **D13** | **Danh sách lịch hẹn bị ảnh hưởng (PDN b2, hộp xác nhận)** | `booking` sở hữu; `doctor` gọi (chỉ đọc) | `AppointmentQueries.listAffectedByLeave(em, { bacSiId, tuNgay, denNgay, ca?, now, limit }): Promise<{ tong: number, soBenhNhan: number, soCoCoc: number, items: { maLichHen, thoiGian, trangThai, nguoiKham: { hoTen }, tienCocSnapshot }[] }>` | **Mới, `[CHỜ booking B11]`.** **Cùng điều kiện lọc với `findAffectedByLeave`** (một định nghĩa "bị ảnh hưởng"); danh sách trắng trường; `soBenhNhan` đếm `benh_nhan_id` khác nhau |
| **D14** | **Đếm lịch hẹn theo ca** (lưới lịch, `soLichHenDangCo`) | `booking` sở hữu; `doctor` gọi | `AppointmentQueries.countActiveByShifts(em, { lichLamViecIds: string[] }): Promise<Record<string, number>>` (lịch `ChoThanhToan`/`DaXacNhan`/`DaTiepDon` của khung giờ thuộc ca) | **Mới, `[CHỜ booking B11]`**; chưa có ⇒ ẩn dòng "N lịch hẹn" (Q18) |

**B. Cổng và hàm `doctor` dùng của module khác**

| Module | Cổng / hàm | Chữ ký `[đề xuất]` | Hiện tại | Ghi chú |
|---|---|---|---|---|
| `booking` | `AppointmentCancellationPort` (bọc D5/D13/D14 + `cancel`) | `findAffected`, `listAffected`, `countByShifts`, `cancel` như bảng trên | **Không có `Noop` ở production** (Noop âm thầm "không có gì để huỷ" làm Duyệt sai nghĩa: Q26); bản giả **chỉ trong test** | Duyệt `[CHỜ booking B10, B11]` |
| `rbac` | `ReceptionScopeService` | `resolve(accountId): Promise<{ chiNhanhId: string }>` (booking P4) | chưa có | Q5 |
| `audit` | `AuditService` | `record(manager, entry)`; 4 hành động mới | chưa có hành động | P4 |
| `admin` | `AdminScopeCtx`, `BranchAccessPolicy`, `SystemConfigService` (không dùng), `common/paging`, `AdminFixtures` | dùng nguyên | có | |
| `notification` | `NotificationService` (admin Q9) | thay `LeaveNotifier` khi có | chưa có | Q33 |

**C. Cổng cho module khác dùng của `doctor`**

| Module | Hàm | Ai gọi |
|---|---|---|
| `search` K1 | `AvailableSlotsReader.listMany` | endpoint công khai khung giờ |
| `booking` B6, B16 | `checkSlotWithinBranchHours` + `BranchHoursReader`; `LeaveReader.findBlockingLeave` | giữ chỗ dưới khoá; thay `DoctorLeavePort` |
| `admin` B13 (đổi chi nhánh bác sĩ, quy tắc 13) | `ShiftQueries.findFutureShiftsAtBranch(em, { bacSiId, chiNhanhId, tuNgay }): Promise<{ lichLamViecId: string, ngay: string, ca: CaLamViec }[]>` (`ngay ≥ tuNgay`, ca hôm nay tính là còn) | dùng **đúng một cách đọc** với phân công; admin B13 gọi thay vì tự viết SQL |

**D. Việc chờ module khác — tóm tắt:** làm ngay không chờ ai: luật thuần, bảng + entity nghỉ phép, sinh khung giờ, phân công/gỡ ca/xem trước, xem lịch (Bác sĩ, Admin, Lễ tân nếu có `ReceptionScope`), tạo yêu cầu, danh sách/chi tiết/Từ chối, `AvailableSlotsReader`, `LeaveReader`, khung Bác sĩ và các trang web tương ứng, seed. Chờ `booking`: Duyệt, sweeper, cột/mục "lịch hẹn bị ảnh hưởng" (B10, B11), trang "Lịch hẹn" của Bác sĩ (F11). Chờ `wallet`/`notification`: hoàn tiền thật, thư/thông báo bệnh nhân (gián tiếp qua `cancel`), email Bác sĩ/Admin. Chờ `search` K1: endpoint công khai khung giờ (dùng reader của ta).

### 5.11 Endpoint (tên `[đề xuất]` — Q41; tiền tố `/api` qua proxy như mọi endpoint)

| Endpoint | Vai trò | Use case | Ghi chú |
|---|---|---|---|
| `GET /admin/doctor-shifts/doctors?q&chiNhanhId&chuyenKhoaId&page&pageSize` | Quản trị viên (cả hai phạm vi) | PCLV b1 | bác sĩ trong phạm vi, kèm chi nhánh và chuyên khoa |
| `GET /admin/doctor-shifts?tuNgay&denNgay&bacSiId&chiNhanhId&chuyenKhoaId&ca&q&page` | Quản trị viên | PCLV b2; XLV | lưới tuần; ≤ 42 ngày |
| `POST /admin/doctor-shifts/preview` | Quản trị viên | PCLV b4 ("Xem trước") | không ghi |
| `POST /admin/doctor-shifts` | Quản trị viên | PCLV b3–b5, A1–A4 | quy tắc lặp, all-or-none |
| `DELETE /admin/doctor-shifts/:id` | Quản trị viên | PCLV (gỡ ca, Q8) | |
| `GET /doctor/schedule?tuNgay&denNgay&ca&chiNhanhId` | Bác sĩ | XLV | của chính mình |
| `POST /doctor/leave-requests` | Bác sĩ | TYN | |
| `GET /doctor/leave-requests?trangThai&page`, `GET /doctor/leave-requests/:id` | Bác sĩ | TYN (lịch sử, chi tiết) | |
| `GET /reception/doctor-schedules/doctors?q&page`, `GET /reception/doctor-schedules?tuNgay&denNgay&bacSiId&chuyenKhoaId&ca&q&page` | Lễ tân | XLV | |
| `GET /admin/leave-requests?…`, `GET /admin/leave-requests/:id` | Quản trị viên | PDN b1–b2, A1 | |
| `POST /admin/leave-requests/:id/reject` | Quản trị viên | PDN (Từ chối), TYN A2 | `{ lyDo }` |
| `POST /admin/leave-requests/:id/approve` | Quản trị viên | PDN b3–b4 | `[CHỜ booking]` |
| `POST /admin/leave-requests/:id/retry-cancellations` | Quản trị viên | PDN (chạy lại) | yêu cầu `DaDuyet` |

**Id trên đường dẫn và query (`:id` của ca và yêu cầu, `bacSiId` của Lễ tân/Admin):** đi qua `ParseRecordIdPipe` của module (pipe mỏng gọi `parsePublicId` của `search/common/id-param.ts`; số nguyên dương vừa BIGINT, trả **chuỗi**); sai dạng ⇒ 404 `KHONG_TIM_THAY` cùng thân với "không có". **Pipe chạy SAU guard** (đăng nhập, vai trò, phạm vi Quản trị viên): người không có quyền nhận 401/403 trước, chỉ người có quyền mới thấy 404 vì id sai dạng. Không import pipe của `patient`.

### 5.12 Thông báo và nhật ký

- `LeaveNotifier` (`doctor/notifications/`): hàm thuần dựng nội dung (≤ 500 ký tự, `toSingleLine` rồi cắt; chỉ tên bác sĩ, khoảng ngày, ca; **không** chứa `ly_do` của Bác sĩ cho Admin) và `INSERT thong_bao` **trong giao dịch của thao tác** (`exactly-once` nhờ giao dịch, không cần khoá tham chiếu). Người nhận Admin: `quan_tri_vien` `ToanHeThong` + `ChiNhanh` của chi nhánh bác sĩ, tài khoản `DangHoatDong`. Sự kiện: `NghiPhepDaGui` (Bác sĩ), `NghiPhepChoDuyet` (Admin), `NghiPhepDaDuyet`, `NghiPhepTuChoi` (Bác sĩ). Email `[CHỜ notification]`.
- Nhật ký (Q34): `PhanCongLichLamViec` (`tai_khoan`, id bác sĩ, một dòng mỗi bác sĩ), `GoLichLamViec` (`lich_lam_viec`, id ca), `DuyetNghiPhep`, `TuChoiNghiPhep` (`yeu_cau_nghi_phep`, id yêu cầu); `chi_nhanh_id` = chi nhánh hiện tại của bác sĩ; `tai_khoan_id` (người thực hiện) từ **phiên**; nội dung danh sách trắng, không lý do của Bác sĩ, không tên bệnh nhân. Việc huỷ lịch hẹn do nghỉ phép có dấu vết ở `lich_hen.ly_do_huy`/`thoi_diem_huy` (booking) nên audit duyệt **không** chép danh sách lịch hẹn.
- Sweeper không có người thực hiện (`tai_khoan_id` NOT NULL) nên **không ghi audit**; dấu vết là `lich_hen` đã huỷ (giống admin `apply.job`). Không ghi nhật ký khi chỉ đọc.

### 5.13 Frontend: khung Bác sĩ, route, chỗ cắm

- **Khung Bác sĩ (F1):** `DoctorLayout` (Q35) thay `RolePlaceholderPage`; `DOCTOR_NAV` ở `router/role-nav.ts`: Tổng quan, Lịch hẹn (`to` bởi booking F11), **Lịch làm việc** (`to: DOCTOR_PATHS.schedule`), Tin nhắn, Thông báo, Thông tin cá nhân (nút vô hiệu "Chưa được triển khai" nếu chưa có trang); chưa có "Tổng quan" ⇒ route chỉ mục chuyển tới Lịch làm việc (như patient Q21e). `DOCTOR_PATHS` (gốc `/bac-si-portal`): `schedule` = `lich-lam-viec`, `leave` = `lich-lam-viec/nghi-phep`.
- **Lễ tân:** route `/le-tan/lich-lam-viec-bac-si`, cắm cạnh `RECEPTION_ROUTES` ở `router/role-routes.tsx` và đặt `to` cho mục "Lịch làm việc bác sĩ" ở `router/role-nav.ts` (`[ĐỤNG router]`).
- **Admin:** `/admin/lich-lam-viec-bac-si` (lưới), phân công là hộp thoại trên trang đó; `/admin/duyet-yeu-cau/nghi-phep` (trang host có tab; Q36); `admin-sidebar.tsx` đặt `to` cho hai mục (`[ĐỤNG admin]`); route bọc `AdminScopeGuard policy="Any"` ở `router/role-routes.tsx`.
- Mọi gọi API qua `shared/api/client.ts` (một lớp duy nhất); xử lý loading/rỗng/lỗi/mất mạng/timeout bằng thành phần có sẵn; `usePageActive` cho trang có hộp thoại gửi; chống bấm đúp; không `localStorage` cho lý do nghỉ (thông tin cá nhân của Bác sĩ); tuần bắt đầu thứ Hai, ngày hiện bằng giờ VN (`shared/schedule`); lọc trạng thái làm ở giao diện (Q15).
- Bố cục bám Figma mục 4.4; chỗ lệch/thiếu frame theo 4.5; tương phản dùng token có sẵn (4.4).

### 5.14 Mã lỗi → thông báo (câu chữ `[đề xuất]`; nhóm duyệt và đưa vào Figma)

| Mã lỗi | HTTP | Thông báo |
|---|---|---|
| `NGAY_PHAN_CONG_DA_QUA` | 409 | Không thể phân công vào ngày đã qua. |
| `CA_DA_KET_THUC` | 409 | Ca này đã kết thúc trong hôm nay. |
| `CA_DA_PHAN_CONG` | 409 | Bác sĩ đã có ca này trong ngày đó. |
| `CHI_NHANH_NGHI` (`thuTrongTuan`) | 409 | Chi nhánh nghỉ vào Thứ … |
| `CHI_NHANH_CHUA_KHAI_BAO` (`thuTrongTuan`) | 409 | Chi nhánh chưa khai báo lịch hoạt động ngày này. |
| `CA_KHONG_TON_TAI` (`khoang`) | 409 | Chi nhánh không nhận khám ca này vào Thứ … (giờ nhận khám: …). |
| `NGOAI_GIO_HOAT_DONG` (`chiTiet`) | 409 | Khung giờ nằm ngoài giờ nhận khám của chi nhánh (… – …). |
| `CA_KHONG_DU_MOT_KHUNG_GIO` | 409 | Ca này ngắn hơn một lượt khám nên không tạo được khung giờ. |
| `BAC_SI_KHONG_PHAN_CONG_DUOC` | 409 | Tài khoản bác sĩ đang ngừng hoạt động. |
| `QUA_NHIEU_CA` / `KHOANG_NGAY_KHONG_HOP_LE` | 400 | Quá nhiều ca trong một lần / Khoảng ngày không hợp lệ (tối đa … ngày). |
| `CA_DANG_CO_LICH_HEN` (`maLichHen[]`) | 409 | Ca đã có khung giờ được đặt hoặc từng có lịch hẹn nên không gỡ được. |
| `CA_DA_QUA` | 409 | Không thể gỡ ca đã qua. |
| `KHONG_TIM_THAY` | 404 | Không tìm thấy dữ liệu. |
| `KHONG_DU_QUYEN` | 403 | Bạn không có quyền xem lịch của bác sĩ này. |
| `NGAY_NGHI_DA_QUA` | 409 | Không thể xin nghỉ cho ngày đã qua. |
| `NGHI_NGOAI_LICH_LAM_VIEC` | 409 | Ngày/ca xin nghỉ không có trong lịch làm việc đã phân công của bạn. |
| `YEU_CAU_NGHI_TRUNG` | 409 | Bạn đã có yêu cầu nghỉ trùng thời gian này. |
| `QUA_NHIEU_YEU_CAU_CHO_DUYET` | 409 | Bạn đang có quá nhiều yêu cầu chờ duyệt. |
| `KHOANG_NGHI_QUA_DAI` / `NGHI_QUA_XA` | 409 | Khoảng nghỉ tối đa … ngày / chỉ xin nghỉ trong … ngày tới. |
| Trường: `ca: CA_BAT_BUOC`, `ca: CA_KHONG_HOP_LE`, `ca: CA_KHONG_DUOC_CHON`, `denNgay: NGHI_THEO_CA_CHI_MOT_NGAY`, `lyDo: LY_DO_BAT_BUOC`/`LY_DO_KHONG_HOP_LE` | 400 (`DU_LIEU_KHONG_HOP_LE` + `loi[]`) | Vui lòng chọn ca / Ca không hợp lệ / Nghỉ cả ngày không chọn ca / Nghỉ theo ca chỉ chọn một ngày / Vui lòng nhập lý do (2–500 ký tự). |
| `YEU_CAU_DA_XU_LY` | 409 | Yêu cầu đã được xử lý. |
| `YEU_CAU_NGHI_DA_QUA_HAN` | 409 | Yêu cầu đã quá hạn, chỉ có thể từ chối. |
| `LY_DO_TU_CHOI_KHONG_HOP_LE` | 400 | Vui lòng nhập lý do từ chối (tối đa 255 ký tự). |
| Mất mạng / timeout / 500 | — | Dùng `error-state`, `offline-banner` có sẵn, nút "Thử lại" |

### 5.15 Kiểm thử, việc phải **đo thật** trước khi viết mã, dữ liệu mẫu

**Tầng test** (mỗi test ghi mã ở mục 7): thuần (`*.spec.ts`: luật giờ ca, `generateSlotStarts`, `expandRule`, giao nhau nghỉ phép, suy trạng thái ô, DTO); tích hợp MySQL thật (`*.int-spec.ts`: sinh khung giờ, CHECK/UNIQUE, khoá, chạy đua, bất biến IV-1, sweeper); e2e qua `configureApp(app)` + `expectErrorResponse` (`apps/api/test/doctor-*.e2e-spec.ts`); web `*.test.tsx` (giả API qua lớp client; dựng `fetch` giả cho trang `lazy`). Hạ tầng test dùng chung ở `doctor/testing/` (H13): `doctor-fixtures.ts` (chi nhánh + lịch hoạt động + dịch vụ + bác sĩ + Lễ tân + Admin hai phạm vi + ca + yêu cầu, dựng bằng `AdminFixtures`; **không sửa `AdminFixtures`**), `concurrency-harness.ts`, `invariants.ts`. Đồng hồ giả của Vitest cho mọi ca thời gian; **không chạy hai vitest cùng lúc trên cùng DB test**; Node 22.x; `npm run dup` chạy trong container Linux (TECH_DEBT dòng 5).

**Việc phải đo thật (ghi "cần đo", chưa đo; kết quả vào TRACKING mục 6 và cập nhật PLAN):**

| # | Cần đo | Vì sao |
|---|---|---|
| M1 | Tỉ lệ 1213/1205 của phân công (nhiều bác sĩ khoá cùng lúc, hai yêu cầu chéo thứ tự) ở `READ COMMITTED` | Q40; khoá `bac_si` id tăng dần |
| M2 | Lỗi 1062 của UNIQUE `(bac_si_id, ngay, ca)` và `(lich_lam_viec_id, ngay_gio)`: `errno`, nội dung; 1451 khi xoá khung giờ bị `lich_hen` tham chiếu | Ánh xạ `CA_DA_PHAN_CONG`, `CA_DANG_CO_LICH_HEN` |
| M3 | `innodb_lock_wait_timeout` (mặc định 50 giây): giao dịch phân công lớn giữ `bac_si` X thì đặt lịch của bác sĩ đó chờ bao lâu rồi 1205 | Có cần giới hạn quy mô lô (Q10) |
| M4 | Múi giờ: ghi `ngay_gio` bằng chuỗi `YYYY-MM-DD HH:MM:SS` rồi đọc lại bằng `Date` (driver `+07:00`) và `DATE_FORMAT`; cột `DATE` qua SQL thô; tham số `Date` so với `DATETIME` | H1, H8 |
| M5 | `WEEKDAY(ngay) + 1` của MySQL so với hàm thuần theo `Intl` cho cả năm | `expandRule`, `BranchHoursReader` |
| M6 | Thời gian và số truy vấn của phân công 20 bác sĩ × 92 ngày × 2 ca (giới hạn 1.000 ca): sinh khung giờ theo lô 500 | Q7, Q10 |
| M7 | Id của `INSERT` nhiều hàng liên tiếp hay không (`innodb_autoinc_lock_mode`); đọc lại theo khoá tự nhiên | Bước 5 của 5.3 |
| M8 | `EXPLAIN` truy vấn giao nhau nghỉ phép `(bac_si_id, ngay_bat_dau, trang_thai)` và truy vấn quét sweeper | Chi phí sweeper, `listBlocking` |
| M9 | `ValidationPipe`: mảng `bacSiIds`/`thuTrongTuan`/`cas` (lặp khoá hay dấu phẩy), tham số lạ với `forbidNonWhitelisted`, `ca` rỗng | Hợp đồng DTO |
| M10 | `EXPLAIN` bước (2) của duyệt (`findAffectedByLeave`) khi tập rỗng, với ≥ 100.000 hàng `lich_hen` | Chi phí sweeper 5 phút |
| M11 | Truy vấn "vị từ phạm vi bác sĩ" (OR + EXISTS) có dùng chỉ mục `lich_lam_viec (bac_si_id, ngay, ca)` | Hiệu năng danh sách Lễ tân |
| M12 | `DELETE khung_gio` trên ô bị `lich_hen` tham chiếu: khoá nào được giữ và có tạo chu trình với `cancel` của booking | H5 |
| M13 | Lệnh sửa dịch vụ của admin B3 có khoá `dich_vu_kham` `FOR UPDATE` trước khi kiểm khung giờ (hay không) | H4. **Kết quả đọc mã 08/11/2026 (không phải số đo): có, đúng sẵn** (`service.service.ts` dòng 65, `service.repository.ts` dòng 77, rồi `hasFutureSlots` dòng 79 trở đi; không khoá `bac_si`); DH-04 chạy thật ở X1/B3 |

**Dữ liệu mẫu (Q39):** test tự động tự dựng bằng `doctor-fixtures`; demo dùng `seed:doctor-demo` sau `catalog` → `config-dev` (nếu cần) → `dev-accounts` → `search-demo`; **không ghi mật khẩu/khoá thật vào seed** (AGENTS mục 1.3; mật khẩu seed lấy từ biến môi trường như các seed khác).

## 6. Kế hoạch task

### 6.1 Sơ đồ phụ thuộc (cùng một hàng = làm song song được)

```
Nền đã có: auth A1–A15 + web F1–F5 · patient (khung Bệnh nhân/Lễ tân, hồ sơ, người thân) · search (API công khai + bước 1–3 web)
           admin (entity/migration lich_lam_viec, khung_gio, lich_hen…, rbac, audit, system-config, services B3) · common/time, paging · seed catalog/dev-accounts/search-demo

Cụm 0 (nền):       P1 (bảng nghỉ phép) ┐
                   P2 (luật giờ ca, D2) ┼─ P5 (hạ tầng test + module) ─ X1 (đo M1–M13: M9 trước B2; M1, M2, M3, M6, M7 trước B3)
                   P3 (ReceptionScope, nếu booking P4 chưa có) · P4 (mở rộng audit)
Cụm 1 (khung giờ + phân công): P2,P5 ─ B1 ─ B2 (xem trước) ─ B3 (tạo) ─ B4 (gỡ ca) · B18 (seed) [sau B1]
Cụm 2 (đọc):       P1,P2 ─ B5 (LeaveReader, D4) ─ B6 (AvailableSlotsReader, D3)   ← booking B6/B16 và search K1 chờ
                   B5,P5 ─ B7 (xem lịch Bác sĩ + ShiftQueries) ─ B8 (Lễ tân) · B9 (Admin lưới)
                   F1 (khung Bác sĩ) ─ F2 (lưới tuần) ─ F3 (tháng, lọc) · F5 (Lễ tân) · F6 (Admin lưới)
Cụm 3 (xin nghỉ):  P1,B5,B10 ─ B11 (tạo) ─ B12 (lịch sử/chi tiết) ─ F4
                   P5 ─ B10 (LeaveNotifier)
Cụm 4 (duyệt):     P1 ─ B13 (danh sách/chi tiết) ─ B14 (Từ chối) ─ F8
                   B14 ─ B15 (Duyệt) ─ B16 (sweeper, thử lại) ─ B17 (nối D13/D14) ─ F9      [CHỜ booking B10, B11]
                   F6 ─ F7 (Phân công ca, cần B2,B3,B4)
Tài liệu:          D1 (sau Q1) · D2 (đi cùng B3, B11, B14, P4) · D3 (cuối)
Hoàn tất:          X2 kiểm tay ─ X3 (cặp với booking B16: DH-06, DH-07 với cổng thật) ─ X4 tổng kết
```

Cột trạng thái: ☐ = chưa làm, ☑ = đã merge. Rà lại 08/11/2026: **chưa task nào làm**. Mọi task `[CHỜ Qn]`/`[CHỜ Trung]` làm được phần độc lập (giá trị tạm theo đề xuất) nhưng **không merge** khi câu hỏi chưa được trả lời.

### 6.2 Nhóm P — Tiền đề

| ☐ | ID | Việc (file; chạm ngoài module; việc phải đo) | Phụ thuộc | Truy vết | Thẻ / PR gợi ý |
|---|---|---|---|---|---|
| ☐ | P1 | **Migration + entity `yeu_cau_nghi_phep`**: `doctor/entities/yeu-cau-nghi-phep.entity.ts`, `doctor/entities/enums.ts` (`HINH_THUC_NGHI`, `TRANG_THAI_YEU_CAU_NGHI_PHEP`); migration viết tay `1793…-tao-bang-nghi-phep.ts` (DDL **nguyên văn** `clinix_mysql.sql` dòng 341–353, hai CHECK `chk_nghi_phep_hinh_thuc`, `chk_nghi_phep_xu_ly`, hai khoá ngoại, chỉ mục `yeu_cau_nghi_phep_index_8`); đăng ký `ENTITIES` và `MIGRATIONS` (`[ĐỤNG database]` hai dòng); `schema-parity.int-spec.ts` khớp từng dòng; **chọn timestamp lớn hơn mọi migration đã merge** (H15) | — (độc lập) | TYN b5; PDN; quy tắc 7, 9 | `[TIỀN ĐỀ]` `[ĐỤNG database]` · `feat(db)` · MG-01…MG-05, MG-07 |
| ☐ | P2 | **`SchedulingModule` + luật giờ ca (D2)**: `scheduling/branch-hours/` (`branch-hours.types.ts`, `shift-window.rules.ts`: `shiftWindow`, `checkShiftAssignable`, `checkSlotWithinBranchHours`; `time-of-day.ts`: giây trong ngày theo giờ VN, thứ ISO của `YYYY-MM-DD`; `branch-hours.reader.ts`: `load`, `loadMany`), `slots/slot-generator.rules.ts` (`generateSlotStarts`), `scheduling.module.ts`, `scheduling.constants.ts`; hàm thuần mỗi file ≤ 100 dòng; **cần đo** M5 (thứ ISO vs `WEEKDAY()+1`) | — (độc lập); **booking B6 và search K1 chờ task này** | PCLV b4, A1, A3, A4; quy tắc 29, 39, 44; booking A6 | `[TIỀN ĐỀ]` `[CHỜ Q6]` · `feat(doctor)` · GC-01…GC-14, SG-01…SG-05, SG-08, SG-10, SG-12, SG-14, PC-26 |
| ☐ | P3 | `[ĐỤNG rbac]` `rbac/reception-scope.service.ts` (+ provider, export `RbacModule`): `resolve(accountId): Promise<{ chiNhanhId: string }>` đọc `le_tan.chi_nhanh_id` **mỗi request** (không cache); Lễ tân không còn hoạt động ⇒ 403; **chỉ làm nếu `booking` P4 chưa merge khi tới B8** (cùng chữ ký, Q5) | — (độc lập) | XLV TĐK, b4; QH-03, QH-06 | `[ĐỤNG rbac]` `[CHỜ Q5]` (chưa nêu với Trung: báo Trung trước khi sửa `rbac/`) · `feat(rbac)` · QH-06, QH-11 (phần phạm vi) |
| ☐ | P4 | **Mở rộng nhật ký (Q34):** `hanh_dong_nhay_cam_enum` + `PhanCongLichLamViec`, `GoLichLamViec`, `DuyetNghiPhep`, `TuChoiNghiPhep`; `loai_doi_tuong_enum` + `lich_lam_viec`, `yeu_cau_nghi_phep`: **sửa cả ba file `docs/database/*` trước**, migration `MODIFY` enum (timestamp sau P1), `audit/audit-entry.ts` (`ChangeMap` hiện 11 hành động, thêm 4; **`TargetFor` hiện rơi mặc định về `yeu_cau_thay_doi_chi_nhanh`, nên phải viết lại nhánh điều kiện, nếu không 4 hành động mới bị gán sai đối tượng; `[đề xuất]` đổi `TargetFor` thành bảng tra theo hành động (mỗi hành động một dòng) để mỗi PR chỉ thêm dòng của mình: `booking` B14 cũng thêm `OverrideLichHen` (đối tượng `lich_hen`) vào đúng chỗ này, hai PR cùng sửa `TargetFor`; PR gộp sau phải gộp `main` rồi viết lại danh sách; phối hợp với B14 trước khi làm**), whitelist ở `audit-validation.ts`, `admin/entities/enums.ts` (`HANH_DONG_NHAY_CAM`, `LOAI_DOI_TUONG_NHAT_KY`), test audit (ca `C2-03` "action ngoài 11 contract bị từ chối" phải đọc từ tập hành động hiện có của `AuditEntry`, **không ghi số cứng**: booking B14 cũng thêm `OverrideLichHen` và sửa ca này, hai PR cùng đổi một con số sẽ xung đột); **danh sách giá trị ENUM của migration lấy từ `clinix.dbml` và migration trên `main` TẠI LÚC LÀM, không chép từ PLAN**; hai PR cùng sửa một ENUM thì PR sau gộp `main` rồi viết lại danh sách; đọc `schema-parity.int-spec.ts` để biết cách xử khi ENUM của `nhat_ky_hanh_dong` trong `clinix_mysql.sql` đổi (test này so các hằng `TAO_BANG_*_SQL` với câu `CREATE TABLE` chính thức nên có thể đỏ nếu không chỉnh: **chưa đo**); thêm test MG-08 vì chưa có test nào đối chiếu ENUM DB ↔ tuple TypeScript ↔ `AuditEntry` | — (độc lập; sau P1 về thứ tự migration) | SOW 3.2; PCLV; PDN; L14 | `[ĐỒNG BỘ TL]` `[ĐỤNG audit]` `[ĐỤNG database]` · `feat(audit)` · MG-06, MG-08, TD-05, TD-06 |
| ☐ | P5 | **`DoctorModule` khung + hạ tầng test:** `doctor/doctor.module.ts` (import `SchedulingModule`, `RbacModule`, `AuditModule`), đăng ký `AppModule` (`[ĐỤNG database]` một dòng; **không** `ScheduleModule.forRoot()`), `doctor/testing/` (`doctor-fixtures.ts`, `concurrency-harness.ts`, `invariants.ts` IV-01…IV-04), test kiến trúc (cây import không chu trình, không `UPDATE lich_hen`/`khung_gio`, không `NOW()`, một `ScheduleModule`) | P1, P2 | H13, H20 | `[TIỀN ĐỀ]` `[ĐỤNG database]` · `test(doctor)` · HD-01, HD-08, HD-10, IV-01…IV-04 |

### 6.3 Nhóm B — Backend

| ☐ | ID | Việc (file; chạm ngoài module; việc phải đo) | Phụ thuộc | Truy vết | Thẻ / PR gợi ý |
|---|---|---|---|---|---|
| ☐ | B1 | **Sinh khung giờ (D1):** `scheduling/slots/slot-generator.ts` (`syncShiftSlots(em, …)`, `SlotGeneratorService`), `INSERT … ON DUPLICATE KEY UPDATE` theo lô 500, ghi `ngay_gio` bằng chuỗi; chưa có HTTP. **Cần đo** M4, M7 | P2, P5 | PCLV b5; quy tắc 29(b), 39; booking D1 | `[CHỜ Q7]` · `feat(doctor)` · SG-06, SG-07, SG-09, SG-11, SG-13 |
| ☐ | B2 | **Xem trước phân công:** `doctor/shifts/shift-assignment.rules.ts` (`expandRule`, `collectViolations`: A1–A4, trùng ca, giới hạn), `shift-assignment.{controller,service,repository,dto}.ts`, `POST /admin/doctor-shifts/preview` (đọc thường, không khoá, không ghi); `@Roles('QuanTriVien')` + `@RequireAdminScope('Any')`; Admin Chi nhánh ngoài phạm vi ⇒ 404. **Cần đo** M9 (mảng trong DTO; B2 chỉ phụ thuộc X1 vì M9, không khoá gì) | P2, P5, X1 | PCLV b1–b4, A1–A4 | `[CHỜ Q6, Q9, Q11, Q12]` · `feat(doctor)` · PC-03…PC-12, PC-14…PC-18, PC-20, PC-21, PC-25 (phần), BD-01 |
| ☐ | B3 | **Phân công (ghi):** `POST /admin/doctor-shifts` trong `READ COMMITTED`: khoá `bac_si` (id tăng dần) → `dich_vu_kham` `FOR SHARE` → kiểm lại như B2 dưới khoá → `INSERT lich_lam_viec` (lô) → `syncShiftSlots` (B1) → `AuditService.record` `PhanCongLichLamViec` → commit; 1062 ⇒ `CA_DA_PHAN_CONG`. **Cần đo** M1, M2, M3, M6, M7 trước khi viết; chốt Q40 | B1, B2, P4, X1 | PCLV b3–b5, A1–A4; HĐK | `[ĐỒNG BỘ TL]` D2 · `[CHỜ Q7, Q40]` M13 đúng sẵn (đọc mã); DH-04 chờ chạy trên MySQL thật ở X1/B3 · `feat(doctor)` · PC-01, PC-02, PC-13, PC-18, PC-24, PC-27, PC-28, DH-01, DH-03, DH-04, DH-09 |
| ☐ | B4 | **Gỡ ca:** `DELETE /admin/doctor-shifts/:id` (Q8): `bac_si` X → khung giờ của ca `FOR UPDATE` → mọi ô `ConTrong` → `DELETE` khung giờ + ca → audit `GoLichLamViec`; 1451 ⇒ `CA_DANG_CO_LICH_HEN`; `ngay < hôm nay` ⇒ `CA_DA_QUA`. **Cần đo** M12 | B3 | PCLV (cập nhật/gỡ); quy tắc 13 | `feat(doctor)` · PC-19, PC-22, PC-23, DH-05 |
| ☐ | B5 | **`LeaveReader` (D4):** `scheduling/leave/leave-overlap.rules.ts` (thuần: `(ngày, ca)` thuộc yêu cầu), `leave.reader.ts` (`findBlockingLeave`, `listBlocking`), xuất từ `SchedulingModule`. **Cần đo** M8 | P1, P2 | TYN MT, b5; PDN HĐK; booking D4 | `feat(doctor)` · HD-03 |
| ☐ | B6 | **`AvailableSlotsReader` (D3):** `scheduling/slots/available-slots.reader.ts` (`list`, `listMany` ≤ 4 truy vấn), `slot-status.rules.ts` (thuần); không ghi, không khoá; trả `khungGioId`. **Cần đo** M4 | P2, B5 | TYN HĐK; search TCBS b8; booking Q3, D3, D10 | `[CHỜ search K1]` (người gọi) · `feat(doctor)` · AV-01…AV-16, HD-02, HD-04, HD-12 |
| ☐ | B7 | **Xem lịch Bác sĩ + `ShiftQueries`:** `scheduling/shifts/shift-queries.ts` (`findFutureShiftsAtBranch`), `doctor/schedule-view/` (read model dùng chung), `GET /doctor/schedule`; `bac_si_id` từ token; `forbidNonWhitelisted`; giờ ca từ `BranchHoursReader`; ngày nghỉ từ `LeaveReader.listBlocking` + `TuChoi` mới nhất. **Cần đo** M11 | B5, P5 | XLV b2–b5, A1, A2 | `[ĐỤNG admin]` (admin B13 gọi `ShiftQueries`; báo Trung) · `feat(doctor)` · XL-01…XL-07, XL-15, XL-16, XL-18, XL-20, HD-05, QH-04 |
| ☐ | B8 | **Xem lịch Lễ tân:** `GET /reception/doctor-schedules/doctors`, `GET /reception/doctor-schedules`; `ReceptionScopeService` (P3/booking P4); vị từ `doctor-scope.sql.ts`; ca lọc trong SQL; `bacSiId` ngoài phạm vi/không có ⇒ 403 cùng thân; ngày nghỉ không có `ly_do` | B7, P3 (hoặc booking P4) | XLV b2–b5, A1, A2 | `[CHỜ Q5, Q13, Q14, Q16]` · `feat(doctor)` · XL-08…XL-14, XL-17, QH-03, QH-11 |
| ☐ | B9 | **Admin xem lịch:** `GET /admin/doctor-shifts/doctors`, `GET /admin/doctor-shifts` (lưới ≤ 42 ngày; lọc chi nhánh/chuyên khoa/bác sĩ/ca/`q`; `BranchAccessPolicy.branchFilter`) | B7 | PCLV b1–b2 | `feat(doctor)` · XL-19, PC-29, PC-30, QH-02 (xem), QH-10 |
| ☐ | B10 | **`LeaveNotifier`:** `doctor/notifications/leave-notifier.ts` (hàm thuần dựng nội dung ≤ 500; ghi `thong_bao` trong giao dịch của người gọi; người nhận Admin có thẩm quyền; **không** `email_thong_bao`) | P5 | TYN b6, A2; PDN b5 | `[CHỜ Q33]` `[CHỜ notification]` (email) · `feat(doctor)` · TD-01…TD-04, TD-07 |
| ☐ | B11 | **Tạo yêu cầu nghỉ:** `doctor/leave-requests/` (`leave-request.rules.ts` thuần: kiểm, giao nhau, hạn; `doctor-leave.{controller,service,repository,dto}.ts`), `POST /doctor/leave-requests` (5.7); `bac_si` X → đếm → giao nhau → ca thuộc lịch → `INSERT` → `LeaveNotifier` | P1, B5, B10 | TYN b1–b6, A1; HĐK | `[ĐỒNG BỘ TL]` D2 · `[CHỜ Q19, Q20, Q21, Q22, Q24, Q25]` · `feat(doctor)` · YN-01…YN-14, YN-17…YN-19, YN-21…YN-23, DH-02, BD-02 |
| ☐ | B12 | **Lịch sử và chi tiết (Bác sĩ):** `GET /doctor/leave-requests`, `GET /doctor/leave-requests/:id` (chỉ của mình, 404 cùng thân); không có huỷ (Q23) | B11 | TYN (lịch sử); Figma `470:2`, `471:2` | `[CHỜ Q23]` · `feat(doctor)` · YN-15, YN-16, YN-20 |
| ☐ | B13 | **Admin danh sách/chi tiết yêu cầu:** `doctor/leave-approval/admin-leave.{controller,service,repository,dto}.ts`: lọc, `thongKe`, phạm vi theo chi nhánh hiện tại của bác sĩ (404 ngoài phạm vi); chi tiết chưa có mục lịch hẹn | P1, P5 | PDN b1–b2, A1 | `[CHỜ Q38]` · `feat(doctor)` · PD-01, PD-02, PD-14, PD-15, PD-16, PD-21, QH-02 (duyệt) |
| ☐ | B14 | **Từ chối:** `POST /admin/leave-requests/:id/reject` (5.8): khoá hàng yêu cầu → `TuChoi` → audit `TuChoiNghiPhep` → `LeaveNotifier` | B13, B10, P4 | PDN (Từ chối); TYN A2 | `[ĐỒNG BỘ TL]` D2 · `[CHỜ Q27, Q31]` · `feat(doctor)` · PD-03, PD-04, PD-05, PD-18, DH-08 (từ chối), TD-05 |
| ☐ | B15 | **Duyệt:** `POST /admin/leave-requests/:id/approve` (5.8): bước 1 (khoá `bac_si` X, `DaDuyet`, audit, thông báo, commit) và bước 2 (`LeaveCancellationRunner` qua `AppointmentCancellationPort`); soạn trước với bản giả **chỉ trong test** | B14; **booking B10 (`cancel`), B11 (`findAffectedByLeave`)** | PDN b3–b4; HĐK duyệt | `[SOẠN TRƯỚC]` `[CHỜ booking B10, B11]` `[CHỜ Q26, Q29, Q30]` · `feat(doctor)` · PD-06…PD-10, PD-17, PD-19, HD-07, DH-06 (cổng giả), DH-08 (duyệt) |
| ☐ | B16 | **Chạy lại idempotent:** `leave-cancellation.sweeper.job.ts` (`@Cron` mỗi 5 phút, lô 50, trần 5 lô, cờ `running`, tắt ở `NODE_ENV=test`, không `ScheduleModule.forRoot()`), `POST …/retry-cancellations` | B15 | PDN (booking DT-17, D5) | `[CHỜ booking B10, B11]` `[CHỜ Q29]` · `feat(doctor)` · PD-11, PD-12, PD-13, DH-07, DH-10, DH-11, IV-05 (giả), BD-05 |
| ☐ | B17 | **Nối D13/D14:** `listAffectedByLeave` vào chi tiết yêu cầu và hộp xác nhận (số lịch, số bệnh nhân, số đã cọc), `countActiveByShifts` vào lưới (`soLichHen`) và `soLichHenDangCo` | B13, B7; **booking B11** | PDN b2; XLV (số lịch hẹn); Q18, Q22 | `[CHỜ booking B11]` · `feat(doctor)` · HD-06, PD-20, PD-22, XL-18 (khi có) |
| ☐ | B18 | **Seed `doctor-demo` (D9):** `database/seeds/doctor-demo-*.ts`, thêm `'doctor-demo'` vào `SEED_COMMANDS`, script `seed:doctor-demo` (`[ĐỤNG database]`, `[ĐỤNG admin]`); 14 ngày kể từ ngày mai cho bác sĩ `search-demo` đang hoạt động và `doctor@example.invalid`; 1–2 yêu cầu nghỉ mẫu; dùng `syncShiftSlots`; idempotent | B1 | Q39; booking Q41 | `[ĐỤNG admin]` `[ĐỤNG database]` · `feat(db)` · HD-11 |

### 6.4 Nhóm F — Frontend (bám frame Figma mục 4.4; trạng thái chưa có frame theo mục 4.5)

| ☐ | ID | Việc (file; chạm ngoài module) | Phụ thuộc | Truy vết | Thẻ / PR gợi ý |
|---|---|---|---|---|---|
| ☐ | F1 | **Khung Bác sĩ:** `features/doctor/shell/doctor-layout.tsx`, `doctor-paths.ts`, `doctor-routes.tsx`, `index.ts`; thay `RolePlaceholderPage` ở `router/role-routes.tsx` (mục `BacSi` có `children` với `ShellContentError`, index chuyển tới Lịch làm việc) và thêm `DOCTOR_NAV` ở `router/role-nav.ts` (`[ĐỤNG router]`); mục chưa có trang là nút vô hiệu | — (độc lập) | Phạm vi; D8; Q35 | `[ĐỤNG router]` · `feat(web)` · WK-01…WK-07 |
| ☐ | F2 | **Bác sĩ "Lịch làm việc" (tuần):** `shared/schedule/` (`[ĐỤNG shared]`: tuần T2–CN theo giờ VN, nhãn ca/trạng thái), `features/doctor/api/schedule-api.ts`, `schedule/` (lưới, thống kê, chú giải, hộp "Chi tiết ca"); Figma `466:2`, `469:2` | F1, B7 | XLV b1–b5, A1 | `[ĐỤNG shared]` · `feat(doctor)` · WL-01, WL-02, WL-03, WL-07, WL-10, WL-11 |
| ☐ | F3 | **Chế độ tháng + bộ lọc:** lưới tháng (`467:2`), lọc ca/trạng thái (giao diện)/chi nhánh (2.4 b2; bổ sung Figma), nút "Hôm nay" | F2 | XLV b2–b3 | `[CHỜ Q15]` · `feat(doctor)` · WL-04, WL-05, WL-06 |
| ☐ | F4 | **Bác sĩ "Yêu cầu nghỉ":** hộp gửi (cả ngày + theo ca: frame "Theo ca" chưa có), lịch sử, chi tiết (`468:2`, `470:2`, `471:2`); **không có nút Hủy** (Q23); lỗi A1 theo `loi[]` | F2, B11, B12 | TYN b1–b6, A1 | `[CHỜ Q23, Q25, Q37]` · `feat(doctor)` · WN-01…WN-10 |
| ☐ | F5 | **Lễ tân "Lịch làm việc bác sĩ":** `features/doctor/reception/` (lưới tuần mọi bác sĩ trong phạm vi, lọc, chỉ xem, drawer chi tiết ca; nút "Xem trong Quản lý lịch hẹn" vô hiệu tới khi booking); route cạnh `RECEPTION_ROUTES` ở `router/role-routes.tsx` và `to` ở `RECEPTION_NAV` (`[ĐỤNG router]`); Figma `486:2`, `499:2`, `500:2` | B8, F2 | XLV b1–b5, A1, A2 | `[ĐỤNG router]` `[CHỜ Q15, Q16]` · `feat(doctor)` · WL-08, WL-09 |
| ☐ | F6 | **Admin "Lịch làm việc bác sĩ" (lưới):** `features/doctor/admin/schedule/` (lưới tuần, lọc chi nhánh/chuyên khoa/bác sĩ/ca/trạng thái, chip chi nhánh cố định cho Admin Chi nhánh, banner "yêu cầu chờ duyệt", drawer chi tiết ca, ô "+"); `admin-sidebar.tsx` đặt `to` (`[ĐỤNG admin]`); route bọc `AdminScopeGuard` ở `router/role-routes.tsx` (`[ĐỤNG router]`); `features/admin/index.ts` **thêm hai dòng `export`** (`AdminScopeGuard` từ `admin-scope-guard.tsx`, `useAdminScope` từ `use-admin-scope.ts`; `[ĐỤNG admin]`) rồi import từ đó | B9, F2 | PCLV b1–b2; Q36 | `[ĐỤNG admin]` `[ĐỤNG router]` · `feat(doctor)` · WA-01, WA-05, WA-14 |
| ☐ | F7 | **Admin "Phân công ca":** hộp thoại quy tắc (chi nhánh/chuyên khoa chỉ lọc danh sách; thứ; ca; chọn nhiều bác sĩ; **Xem trước**; không có ô Ghi chú: Q10), `viPham[]`, thành công, nút "Gỡ ca" ở Chi tiết ca; Figma `516:2`, `519:2`, `580:2` | F6, B2, B3, B4 | PCLV b3–b5, A1–A4 | `feat(doctor)` · WA-02, WA-03, WA-04, WA-06, WA-15 |
| ☐ | F8 | **Admin "Duyệt yêu cầu - Yêu cầu nghỉ phép":** trang host có tab (tab "Yêu cầu đổi lịch" vô hiệu), thẻ thống kê, lọc, bảng, phân trang, drawer chi tiết, hộp **Từ chối** (lý do bắt buộc), rỗng/lỗi; **KHÔNG có nút "Duyệt"** (cũng không nút vô hiệu bấm ra lỗi hay 501): nút Duyệt do F9 thêm sau khi B15 merge (Q26); Figma `582:2`, `583:2`, `584:2`, `517:2`, `623:2`; `admin-sidebar.tsx` `to` "Duyệt yêu cầu" | B13, B14, F6 | PDN b1–b2, A1; TYN A2 | `[ĐỤNG admin]` `[ĐỤNG router]` `[CHỜ Q27]` · `feat(doctor)` · WA-07, WA-08, WA-09, WA-13, WA-15, WA-16 |
| ☐ | F9 | **Admin duyệt (chỉ làm sau khi B15 merge):** nút Duyệt + hộp "Xác nhận duyệt" (nội dung huỷ lịch/hoàn cọc/số bệnh nhân: Q32), banner kết quả (`daHuy`, `khongHuyDuoc`), "Xử lý lại", bảng lịch hẹn bị ảnh hưởng; Figma `585:2`, `586:2` + frame chưa có (4.5) | F8, B15, B16, B17 | PDN b3–b4 | `[CHỜ booking B10, B11]` `[CHỜ Q29, Q32]` · `feat(doctor)` · WA-10, WA-11, WA-12, WA-15 |
| ☐ | F10 | **Gắn trang "Lịch hẹn" (D8):** thêm `...DOCTOR_APPOINTMENT_ROUTES` vào `children` của `BacSi` và `to` ở `DOCTOR_NAV` (do booking F11 làm một dòng nếu F1 đã merge; nếu booking xong trước, F1 nhận dòng đó) | F1; **booking F11** | Booking D8 | `[ĐỤNG router]` `[CHỜ booking F11]` · `feat(web)` · WK-08 |

### 6.5 Nhóm D — Đồng bộ tài liệu (đi cùng PR của task code tương ứng)

| ☐ | ID | Việc | Đi cùng | Truy vết |
|---|---|---|---|---|
| ☐ | D1 | **Trung sửa 3 chỗ** `[ĐỤNG search]`: (1) `docs/features/search/TRACKING.md` mục 3: hai dòng ghi chủ bộ tính khung giờ, dòng 89 (Q18) và dòng 124 (bảng việc chờ, hàng `booking`), đổi sang `doctor`; (2) PLAN `search` 5.6 (K1 trả `khungGioId`, `trangThaiNgay` thêm `NghiPhep`, bỏ qua ô trùng nghỉ phép **cả `ChoDuyet`**); (3) PLAN `search` 7.10 ca **KGI-03** (dòng 683, đang ghi "chờ duyệt không ảnh hưởng", sai so với 2.4.24 và booking D4). Số dòng tính ở `cb5b5b8`; PLAN `search` còn nhắc `booking` là chủ bộ tính khung giờ ở dòng 117 và 510, Trung rà khi sửa. Việc ghi kết quả đối chiếu 5.10 vào `docs/features/booking/TRACKING.md` mục 3 là của Đại (PR riêng của phiên booking), không thuộc D1 của Trung | Q1 đã xác nhận (Trung, 08/11/2026) và Q4 đã đối chiếu | L13, L17 |
| ☐ | D2 | `[ĐỒNG BỘ TL]` **sửa cả ba file `docs/database/*` cho khớp:** `clinix.dbml` + `clinix_mysql.sql` (chỉ comment/ghi chú, **không** sửa `CREATE TABLE` vì COMMENT được `schema-parity` so với migration — TECH_DEBT dòng 8; enum nhật ký cùng P4) + `clinix_quy_tac_nghiep_vu.md`: quy tắc mới (A4 hợp nhất vào `CaKhongTonTai`, sinh khung giờ cùng giao dịch phân công, gỡ ca, bất biến I-1, nghỉ phép chồng nhau, hạn, phạm vi duyệt theo chi nhánh hiện tại, thứ tự khoá bác sĩ, duyệt hai giai đoạn); ghi chú `yeu_cau_nghi_phep` (không có chi nhánh/lý do từ chối; `CaToi` bị service chặn); `khung_gio.trang_thai` (`HetHan` suy ra). **Nhắc người dùng sửa 2.4** (repo `TLCN_CLINIX`): PCLV b1, b3, b4, A4, gỡ ca, hôm nay; XLV b3, A2 (403), **Lễ tân thấy ngày nghỉ `ChoDuyet` (không thấy lý do; Q16)**, lọc chi nhánh; TYN (hạn, chồng nhau; **không** thêm Hủy yêu cầu, Q23); PDN (lý do từ chối, hộp xác nhận) | PR của B3, B11, B14, B15, P4 (mỗi PR một phần) | L1–L10, L20–L28 |
| ☐ | D3 | **Nợ kỹ thuật và việc cho nhóm.** **KHÔNG thêm dòng nào vào `docs/TECH_DEBT.md` ở PR kế hoạch này** (chưa có mã tạo ra nợ). Mỗi dòng nợ được thêm ở PR của task tạo ra nó, số = số lớn nhất trên `main` lúc ghi + 1 (lúc soạn là 84): **B3** (ca từng có lịch hẹn không gỡ được ⇒ chưa đổi chi nhánh bác sĩ được tới khi ngày đó qua; khung giờ sinh sẵn nhiều: quy mô; đồng bộ khung giờ khi lịch hoạt động đổi `[SAU]`), **B10** (thông báo nghỉ phép trong ứng dụng chưa ai đọc vì chuông ẩn; email chờ `notification`), **B14** (lý do từ chối không có cột, Q27c), **B16** (sweeper quét `DaDuyet` chưa tối ưu chỉ mục), **F1** (trùng nhẹ `DoctorLayout`/`RoleLayout` nếu `jscpd` báo). Phần còn lại của D3 là **danh sách việc cho nhóm** (không đổi repo): Figma (mục 4.4, 4.5) và "việc nhóm quyết" (mục 4.6) | Đi theo PR của B3, B10, B14, B16, F1 | Q7, Q8, Q27, Q33, Q35, mục 4.4–4.6 |

### 6.6 Nhóm X — Hoàn tất

| ☐ | ID | Việc | Phụ thuộc |
|---|---|---|---|
| ☐ | X1 | **Đo thật M1–M13** (mục 5.15) trên MySQL của compose bằng spec đo tạm (xoá sau khi đo, như nếp patient); ghi số vào TRACKING mục 6 và sửa PLAN nếu khác dự đoán; chốt Q40. Làm **trước B2 (M9) và B3 (M1, M2, M3, M6, M7)** | P1, P2, P5 |
| ☐ | X2 | Kiểm tay trên Chrome thật với tài khoản seed (`docker compose up --build`, `seed:catalog`, `dev-accounts`, `search-demo`, `doctor-demo`): Admin phân công quy tắc lặp (xem trước, lỗi A1–A4, gỡ ca), Bác sĩ xem tuần/tháng và xin nghỉ cả ngày/theo ca, Lễ tân xem lưới (và 403 khi sửa URL bác sĩ khác chi nhánh), Admin từ chối/duyệt, hai trình duyệt cùng phân công một ca | Cụm 1–4 |
| ☐ | X3 | **Cặp với booking B16:** chạy lại DH-06, DH-07, HD-06, HD-07, IV-05 với `AppointmentCancellationService`/`findAffectedByLeave` **thật**; xác nhận mục 5.10 bằng bằng chứng; điền TRACKING mục 5 của cả hai module | B15–B17; booking B10, B11, B16 |
| ☐ | X4 | Tổng kết: chạy `lint`, `build`, `test`, `test:int`, `test:e2e` (api), `lint`, `test` (web), `npm run dup` (container Linux); chạy bộ quét toàn module **QH-01, QH-05, QH-07, QH-08, QH-09, QH-12, HD-09, BD-03, BD-04** (các ca dùng chung cho mọi endpoint, không thuộc riêng task nào); điền TRACKING mục 2; thêm **đúng một dòng** vào `docs/TRACKING.md`; ghi `AI_USAGE_LOG.md` đủ | Mọi task |

### 6.7 Việc nào bắt đầu ngay, việc nào phải chờ

- **Bắt đầu ngay (bảng nền đã có trên `main`, không chờ module nào):** P1, P2 (độc lập; **P2 mở khoá booking B6 và search K1**), P5, X1; sau đó B1 → B2 → B3 → B4 (phân công và gỡ ca), B5 → B6 (hai reader), B7 → B9, B10 → B11 → B12, B13 → B14 (danh sách, chi tiết, **Từ chối**), B18 (seed); F1 ngay (không cần backend), rồi F2 → F3, F4, F6 → F7, F8 theo B-task tương ứng.
- **Đã trả lời, không còn chặn:** Q1, Q2, Q3, Q8, Q10, Q28, Q34 (P4, nên làm trước B3), Q36 do Trung xác nhận 08/11/2026 (Q1 từng chặn merge P2, B1, B5, B6, D1); M13 đúng sẵn theo đọc mã (DH-04 chờ MySQL thật ở X1/B3, không còn là việc chờ Trung); Q23, Q26, Q27 do Đại duyệt. **Còn chờ:** Q40 (chốt sau X1, trước B3); Q5 (chưa nêu với Trung, chỉ liên quan P3); đối chiếu mục 5.10 với PLAN `booking` **trước khi tạo issue** (phiên kiểm đã đối chiếu; phía `booking` ghi bằng PR riêng).
- **Chờ `booking`:** B15, B16, B17, F9 (cần `AppointmentCancellationService.cancel` B10 và `AppointmentQueries` B11); F10 (cần F11 của booking); số lịch hẹn ở lưới (D14). **Làm trước, ngữ nghĩa đúng:** danh sách, chi tiết, Từ chối. **Không làm trước:** Duyệt (Q26).
- **Chờ `patient`/`booking` P4:** `ReceptionScopeService` (B8, F5). **Chờ `notification`:** email Bác sĩ/Admin, chuông thông báo. **Chờ `wallet`:** không trực tiếp (qua `cancel`). **Chờ `search` K1/K2:** endpoint và giao diện khung giờ công khai dùng reader của ta.

## 7. Test case dự kiến

Loại: **U** = thuần (`*.spec.ts`), **I** = tích hợp MySQL thật (`*.int-spec.ts`), **E** = e2e qua `configureApp(app)` + `expectErrorResponse` (`apps/api/test/doctor-*.e2e-spec.ts`), **W** = web (`*.test.tsx`), **C** = kiểm tay (Chrome). Mỗi test trong mã ghi mã ở cột 1. Đồng hồ giả cho mọi ca thời gian; ca đồng thời chạy trên MySQL thật, lặp ≥ 15 vòng (ca nặng ≥ 100) và **sau mỗi ca đồng thời chạy IV-01…IV-04**. Cột "Phủ": bước/luồng thay thế của use case hoặc bẫy.

### 7.1 Phân công lịch làm việc (PC)

| ID | Kịch bản | Mong đợi | Phủ | Loại |
|---|---|---|---|---|
| PC-01 | Admin Toàn hệ thống phân công một bác sĩ, một ngày hợp lệ, `CaSang` | 201; có 1 `lich_lam_viec` mang **chi nhánh hiện tại của bác sĩ**; đủ khung giờ (SG) | b3–b5, HĐK | I, E |
| PC-02 | Gửi kèm `chiNhanhId` trong thân; bác sĩ đổi chi nhánh sau đó | 400 `TRUONG_KHONG_DUOC_PHEP`; ca cũ **giữ nguyên** chi nhánh cũ, ca mới mang chi nhánh mới | MT, D12, I-1 | I, E |
| PC-03 | A1: ngày hôm qua (đồng hồ giả) | 409 `NGAY_PHAN_CONG_DA_QUA`; không có hàng nào được tạo | A1 | U, E |
| PC-04 | Hôm nay: ca chưa kết thúc / đã kết thúc | Nhận / `CA_DA_KET_THUC` | A1, Q9 | U, I |
| PC-05 | A2: bác sĩ đã có `CaSang` ngày đó | 409 `CA_DA_PHAN_CONG`; không đổi gì | A2 | I, E |
| PC-06 | Đã có `CaSang`, thêm `CaChieu` cùng ngày | Thành công (hai ca không trùng) | A2 | I |
| PC-07 | A3: ngày Chủ nhật (chi nhánh nghỉ) | 409 `CHI_NHANH_NGHI`, `thuTrongTuan: 7` | A3 | I, E |
| PC-08 | A3: xoá dòng lịch hoạt động của thứ đó (chưa khai báo) | 409 `CHI_NHANH_CHUA_KHAI_BAO` | A3 | I |
| PC-09 | "Cả ngày" ở thứ 7 chiều nghỉ (`CaChieu` không tồn tại) | 409 `CA_KHONG_TON_TAI` nêu `CaChieu`; **không** tạo `CaSang` (nguyên tử) | A4, quy tắc 29(a), H16 | I |
| PC-10 | A4: thứ chỉ có khoảng sáng, chọn `CaChieu` | 409 `CA_KHONG_TON_TAI` kèm `khoang` (giờ nhận khám của ngày) | A4 | I, E |
| PC-11 | `CaToi` trong `cas` | 400 `CA_KHONG_HOP_LE`; service không bao giờ nhận `CaToi` | Quy tắc 44 | U, E |
| PC-12 | Quy tắc lặp: 3 tuần, T2–T6, "Cả ngày", 2 bác sĩ | Đúng 60 ca (2×15×2) và đúng số khung giờ; mọi ca chi nhánh đúng | Q10 | U, I |
| PC-13 | Đua giả lập: chèn thẳng ca trùng giữa kiểm và ghi | 409 `CA_DA_PHAN_CONG` (lưới UNIQUE), không 500 | H2, A2 | I |
| PC-14 | Vi phạm ở bác sĩ thứ 2, ngày thứ 10 trong 40 hàng | **Không** ca nào được tạo; `viPham[]` đúng; mã lỗi của vi phạm đầu tiên | HĐK thất bại, Q10 | I, E |
| PC-15 | Khoảng 93 ngày; > 1.000 ca; khoảng không chứa thứ nào đã chọn; `denNgay < tuNgay` | 400 `KHOANG_NGAY_KHONG_HOP_LE` / `QUA_NHIEU_CA` / `KHOANG_NGAY_KHONG_HOP_LE` | Giới hạn | U, E |
| PC-16 | Bác sĩ `NgungHoatDong` / `ChoKichHoat` | `BAC_SI_KHONG_PHAN_CONG_DUOC` / nhận | Q11 | I |
| PC-17 | Xem trước (preview) | Không ghi (đếm bảng không đổi); `soCa`, `soKhungGio`, `viPham[]` giống thực tế; **cùng một yêu cầu gửi `preview` rồi `POST` thật ra CÙNG danh sách `viPham`** (cùng một hàm kiểm) | b4, Q10 | I, E |
| PC-18 | Admin Chi nhánh: bác sĩ của chi nhánh mình / chi nhánh khác | Thành công / 404 cùng thân `KHONG_TIM_THAY` | TĐK, admin Q40 | I, E |
| PC-19 | Gỡ ca chưa có lịch hẹn | Ca và mọi khung giờ bị xoá | Q8 | I |
| PC-20 | Khoảng ngắn hơn thời lượng khám | 409 `CA_KHONG_DU_MOT_KHUNG_GIO`, không tạo ca rỗng | H17 | U, I |
| PC-21 | Đồng hồ giả qua nửa đêm giữa kiểm và ghi | Dùng `today` đã chốt một lần; kết quả nhất quán | H18 | I |
| PC-22 | Gỡ ca có ô `DaDat`/`DangGiuCho` hoặc từng có lịch hẹn (kể cả `DaHuy`) | 409 `CA_DANG_CO_LICH_HEN`; không xoá gì | Q8, D7 | I, E |
| PC-23 | Gỡ ca đã qua | 409 `CA_DA_QUA` | Q8 | I |
| PC-24 | Audit: phân công ghi `PhanCongLichLamViec` đúng payload; audit lỗi | Một dòng/bác sĩ cùng giao dịch; lỗi ⇒ hoàn tác ca và khung giờ | SOW 3.2 | I |
| PC-25 | Bác sĩ, Lễ tân, Bệnh nhân gọi POST/DELETE; không token | 403; 401 | Bác sĩ chỉ xem | E |
| PC-26 | Thứ ISO của mọi ngày 2026 | Hàm thuần = `WEEKDAY()+1` của MySQL | M5 | I |
| PC-27 | Bác sĩ đổi chi nhánh (giả admin) sau khi có ca | Ca cũ giữ; ca mới mang chi nhánh mới; I-1 | H3 | I |
| PC-28 | Phân công không đổi `trang_thai`/`giu_cho_den` của khung giờ đã có | Đúng (D7) | D7 | I |
| PC-29 | Danh sách bác sĩ để chọn: lọc `q`/chi nhánh/chuyên khoa, phân trang, escape `%`, `_` | Đúng; Admin Chi nhánh chỉ thấy trong phạm vi | b1 | I, E |
| PC-30 | Lưới Admin: ca trong khoảng; khoảng > 42 ngày | Đúng; 400 | b2 | I, E |

### 7.2 Sinh khung giờ (SG) và luật giờ ca (GC)

| ID | Kịch bản | Mong đợi | Phủ | Loại |
|---|---|---|---|---|
| SG-01 | Khoảng 07:30–11:00, 50 phút | 07:30, 08:20, 09:10, 10:00 (bỏ 10 phút cuối) | Quy tắc 29(b) | U |
| SG-02 | 08:00–12:00, 30 phút | 8 ô, ô cuối 11:30 | Quy tắc 39 | U |
| SG-03 | 13:00–17:00, 60 phút | 4 ô | | U |
| SG-04 | Thời lượng lớn hơn khoảng | Rỗng | H17 | U |
| SG-05 | 08:00–09:00, 30 phút (kết thúc đúng giờ kết thúc) | 08:00, 08:30 | Biên | U |
| SG-06 | `syncShiftSlots` chạy hai lần | Lần hai không thêm, không đổi hàng nào | D1, Q7 | I |
| SG-07 | Sync lại khi đã có ô `DaDat`/`DangGiuCho` (ca "đột biến": nếu `ON DUPLICATE KEY UPDATE` đổi `trang_thai` hay `giu_cho_den` thì test đỏ) | Không đụng `trang_thai`/`giu_cho_den`; chỉ phép gán không đổi | D7, Q7 | I |
| SG-08 | `CaChieu` | Dùng khoảng chiều, không xuyên giờ nghỉ trưa | Quy tắc 29 | U |
| SG-09 | Hai `syncShiftSlots` đồng thời cùng ca | Không trùng, không 500 | H2 | I |
| SG-10 | Dịch vụ 60 phút | Ô cách nhau đúng 60 phút | Quy tắc 39 | U, I |
| SG-11 | `ngay_gio` ghi chuỗi `YYYY-MM-DD HH:MM:SS` | Đọc lại bằng `DATE_FORMAT` và `Date` ra đúng giờ VN | H1, M4 | I |
| SG-12 | 23:00–23:59:59, 30 phút | Chỉ ô 23:00 | Biên | U |
| SG-13 | Mọi ô sinh ra | `checkSlotWithinBranchHours` đều `ok` (D1 và D2 nhất quán) | D1, D2 | I |
| SG-14 | Thời lượng ≤ 0 hoặc khoảng ngược | Ném lỗi lập trình, không vòng lặp vô hạn | An toàn | U |
| GC-01 | `shiftWindow('CaSang')` ngày có sáng | `ok` khoảng sáng | Quy tắc 29(a) | U |
| GC-02 | `shiftWindow('CaChieu')` ngày có chiều | `ok` khoảng chiều | | U |
| GC-03 | Thứ chưa khai báo (`null`) | `ChuaKhaiBao` | Quy tắc 28 | U |
| GC-04 | `hoatDong = false` | `NgayNghi` | | U |
| GC-05 | `CaChieu` khi không có khoảng chiều | `CaKhongTonTai` | | U |
| GC-06 | `CaToi` | `CaKhongTonTai` mọi trường hợp | Quy tắc 44 | U |
| GC-07 | `checkSlotWithinBranchHours` ô trong khoảng | `ok` | | U |
| GC-08 | Ô bắt đầu đúng giờ bắt đầu và kết thúc đúng giờ kết thúc | `ok` (biên hai đầu hợp lệ) | Quy tắc 29 | U |
| GC-09 | Ô vượt giờ kết thúc 1 giây | `NgoaiGioHoatDong` | | U |
| GC-10 | Ô xuyên giờ nghỉ trưa | `NgoaiGioHoatDong` | | U |
| GC-11 | Ô trước giờ bắt đầu | `NgoaiGioHoatDong` | | U |
| GC-12 | Ô thuộc khoảng chiều nhưng `ca = CaSang` | `NgoaiGioHoatDong` (đúng ca) | | U |
| GC-13 | `BranchHoursReader.load/loadMany` | 7 thứ, `TIME` → giây, thiếu dòng ⇒ `null`, nghỉ ⇒ `hoatDong=false`; `loadMany` một truy vấn | D2 | I |
| GC-14 | `chiTiet.gioMo/gioDong` | Sớm nhất/muộn nhất của ngày, `HH:MM` | D2 | U |

### 7.3 Khung giờ còn trống (AV)

| ID | Kịch bản | Mong đợi | Phủ | Loại |
|---|---|---|---|---|
| AV-01 | Ô `ConTrong`, `DaDat`, `DangGiuCho` còn hạn, `DangGiuCho` hết hạn, quá giờ (đồng hồ giả) | `ConTrong`, `DaDat`, `DangGiuCho`, `ConTrong`, `HetHan` | booking Q3 | U, I |
| AV-02 | Yêu cầu nghỉ `ChoDuyet` phủ ô | Ô bị **loại** | TYN MT, b5 | I |
| AV-03 | Yêu cầu `DaDuyet` phủ ô | Loại | TYN HĐK | I |
| AV-04 | Yêu cầu `TuChoi` | Không ảnh hưởng (ô hiện lại) | TYN A2, PDN HĐK | I |
| AV-05 | `TheoCa` `CaSang` | Chỉ ca sáng bị loại, ca chiều còn | | I |
| AV-06 | `CaNgay` nhiều ngày | Ngày giữa và hai biên bị loại, ngoài khoảng còn | | I |
| AV-07 | Lịch hoạt động đổi sau khi sinh (khoảng thu hẹp) | Ô ngoài giờ hiện hành bị ẩn | D2 | I |
| AV-08 | `trangThaiNgay`: có ca / không ca / chi nhánh nghỉ (+ `thuNghi`) / nghỉ phép phủ hết | `CoLich` / `KhongCoLich` / `ChiNhanhNghi` / `NghiPhep` | search 5.6 | I |
| AV-09 | Thứ chưa khai báo, bác sĩ không có ca | `ChiNhanhNghi` (search Q4) | | I |
| AV-10 | `khungGioId` chuỗi duy nhất; `ketThuc = batDau + thoi_luong` | Đúng | D10 | I |
| AV-11 | `listMany` nhiều bác sĩ cùng ngày | Bằng `list` từng người | D3 | I |
| AV-12 | `listMany` 20 bác sĩ | ≤ 4 truy vấn (đếm) | H14 | I |
| AV-13 | Reader không ghi, không khoá | Bảng không đổi; chạy trong `em` của người gọi | D3 | I |
| AV-14 | Ô `DaDat` đã quá giờ | `HetHan` (ưu tiên quá giờ) | Quy ước | U |
| AV-15 | Bác sĩ không có/không có ca | Rỗng, không ném | | I |
| AV-16 | Ca mang chi nhánh khác chi nhánh hiện tại của bác sĩ | Dùng giờ của **chi nhánh trên ca** | D12 | I |

### 7.4 Xem lịch làm việc (XL)

| ID | Kịch bản | Mong đợi | Phủ | Loại |
|---|---|---|---|---|
| XL-01 | Bác sĩ xem tuần có ca | Ca (ngày, ca, chi nhánh trên ca, giờ) trong khoảng | b2, b5 | I, E |
| XL-02 | Bác sĩ đã đổi chi nhánh | Thấy ca cũ (chi nhánh cũ) và mới; `chiNhanhLoc` có 2; lọc `chiNhanhId` đúng | b2 | I, E |
| XL-03 | Lọc `ca` | Đúng | b3 | I |
| XL-04 | Ngày nghỉ: `DaDuyet`, `ChoDuyet`, `TuChoi` mới nhất, ưu tiên | `DaDuyet` > `ChoDuyet` > `TuChoi` | b2, Q16 | I |
| XL-05 | A1: không có ca | 200 `ca: []` (lịch trống) | A1 | I, E |
| XL-06 | Gửi `bacSiId` hoặc tham số lạ | 400 `TRUONG_KHONG_DUOC_PHEP`; không thể xem bác sĩ khác | b4 | E |
| XL-07 | `denNgay < tuNgay`, > 42 ngày, sai định dạng | 400 `KHOANG_NGAY_KHONG_HOP_LE` | | U, E |
| XL-08 | Lễ tân: bác sĩ có ca ở hai chi nhánh | Chỉ ca mang chi nhánh Lễ tân; ca chi nhánh khác **lọc bỏ, không báo lỗi** | b5 | I, E |
| XL-09 | Lễ tân: bác sĩ đã chuyển sang chi nhánh khác | Ca cũ ở chi nhánh Lễ tân vẫn thấy; ca ở chi nhánh mới không thấy | MT | I |
| XL-10 | Danh sách bác sĩ của Lễ tân | Hồ sơ thuộc chi nhánh ∪ có ca (kể cả đã qua), không trùng lặp | b2 | I |
| XL-11 | Lễ tân gửi `bacSiId` ngoài phạm vi / không tồn tại / sai dạng | Hai ca đầu: 403 `KHONG_DU_QUYEN`, **cùng thân**; sai dạng (qua pipe mỏng gọi `parsePublicId`): 404 `KHONG_TIM_THAY`; người không có quyền gọi với id sai dạng nhận 401/403 trước (pipe chạy sau guard) | A2, Q13 | I, E |
| XL-12 | Ngày nghỉ của Lễ tân | Chỉ gắn trên ca nhìn thấy; không có `ly_do` | b5, H10 | I |
| XL-13 | Lễ tân gọi ghi/sửa | Không có route (404/405) hoặc 403 | Chỉ xem | E |
| XL-14 | Lễ tân không còn hồ sơ `le_tan` | 403 | TĐK | I |
| XL-15 | Giờ ca = khoảng hiện hành; ca "mồ côi" | Giờ đúng; `batDau/ketThuc: null` | Q17 | I |
| XL-16 | Phản hồi | `Cache-Control: no-store`; không email/SĐT | H10 | E |
| XL-17 | Danh sách bác sĩ Lễ tân: phân trang, `q` với `%`, `_`, `!` | Đúng | Q38 | I |
| XL-18 | Chưa có `booking` | Không có trường `soLichHen` (không hiện "0 lịch" sai); có D14 ⇒ số đúng | Q18 | I |
| XL-19 | Admin Chi nhánh xem lưới | Cùng vị từ như Lễ tân; bác sĩ ngoài phạm vi 404 | Q14 | I, E |
| XL-20 | Hai bác sĩ cùng chi nhánh | A không thấy ca của B | b4 | E |

### 7.5 Tạo yêu cầu xin nghỉ phép (YN)

| ID | Kịch bản | Mong đợi | Phủ | Loại |
|---|---|---|---|---|
| YN-01 | `TheoCa` một ngày có ca | 201 `ChoDuyet`; `thong_bao` cho Bác sĩ và Admin; trạng thái khung giờ **không đổi** | b4–b6 | I, E |
| YN-02 | `CaNgay` nhiều ngày có ca | 201 | b2 | I |
| YN-03 | A1: ngày quá khứ | 409 `NGAY_NGHI_DA_QUA` | A1 | U, E |
| YN-04 | A1: `TheoCa` nhiều ngày | 400 `denNgay: NGHI_THEO_CA_CHI_MOT_NGAY` | A1 | U, E |
| YN-05 | A1: `TheoCa` thiếu ca; `CaToi`; `CaNgay` có `ca` | `CA_BAT_BUOC`; `CA_KHONG_HOP_LE`; `CA_KHONG_DUOC_CHON` | A1 | U, E |
| YN-06 | A1: thiếu lý do; chỉ khoảng trắng; 1 ký tự; > 500 | Lỗi trường `lyDo` đúng mã | A1 | U, E |
| YN-07 | A1: ngày/ca không thuộc lịch phân công | 409 `NGHI_NGOAI_LICH_LAM_VIEC` | A1 | I |
| YN-08 | `CaNgay` nhiều ngày, chỉ một phần có ca | 201; `soCaBiAnhHuong` đúng (Q20) | L7 | I |
| YN-09 | Chồng nhau: `CaNgay`×`CaNgay`; `TheoCa`×`CaNgay` phủ; `TheoCa` cùng ca; `TheoCa` khác ca; yêu cầu `TuChoi` | 409 `YEU_CAU_NGHI_TRUNG` ba ca đầu; hai ca sau thành công | Q21 | U, I |
| YN-10 | Khoảng 32 ngày; > 90 ngày tới; 6 yêu cầu chờ | `KHOANG_NGHI_QUA_DAI`, `NGHI_QUA_XA`, `QUA_NHIEU_YEU_CAU_CHO_DUYET` | Q19, Q25 | I, E |
| YN-11 | `TheoCa` hôm nay: ca chưa/đã kết thúc | Nhận / `CA_DA_KET_THUC` | Q24 | I |
| YN-12 | Gửi `bacSiId` | 400 `TRUONG_KHONG_DUOC_PHEP`; chủ sở hữu lấy từ token | Chỉ cho chính mình | E |
| YN-13 | Lễ tân, Bệnh nhân, Quản trị viên gọi | 403 | Tác nhân | E |
| YN-14 | Hai lần gửi giống hệt liên tiếp | Lần hai `YEU_CAU_NGHI_TRUNG` | Q21 | I |
| YN-15 | Lịch sử: chỉ của mình, mới nhất trước, lọc trạng thái, phân trang; chi tiết người khác | Đúng; 404 cùng thân | | I, E |
| YN-16 | Chi tiết yêu cầu | Có trạng thái, thời điểm xử lý; không lộ id người xử lý | Q27 | I |
| YN-17 | Sau tạo `ChoDuyet` ⇒ AV loại ô; sau từ chối ⇒ ô trở lại | Đúng | HĐK, A2 | I |
| YN-18 | Lỗi ghi `thong_bao` | Hoàn tác yêu cầu | H12 | I |
| YN-19 | Log và phản hồi lỗi | Không chứa `ly_do` | H10 | E |
| YN-20 | Bác sĩ gọi huỷ yêu cầu (nếu Q23 = không làm) | Không có route (404/405) | Q23 | E |
| YN-22 | Chưa có `booking` | Không có `soLichHenDangCo`; có D14 ⇒ đúng | Q22 | I |
| YN-21 | Biên: 31 ngày, đúng ngày thứ 90, 5 yêu cầu chờ | Chấp nhận | Q19, Q25 | I |
| YN-23 | `lyDo` NFC, cắt khoảng trắng, ký tự điều khiển | Chuẩn hoá/từ chối đúng | Q25 | U |

### 7.6 Phê duyệt và từ chối (PD)

| ID | Kịch bản | Mong đợi | Phủ | Loại |
|---|---|---|---|---|
| PD-01 | Danh sách `ChoDuyet` trong phạm vi; không có yêu cầu nào | Đúng; 200 `items: []` (A1) | b1, A1 | I, E |
| PD-02 | Chi tiết; Admin Chi nhánh ngoài phạm vi | Đúng; 404 cùng thân | b2 | I, E |
| PD-03 | Từ chối | `TuChoi`, `nguoi_xu_ly_id`, `thoi_diem_xu_ly`, audit, thông báo Bác sĩ kèm lý do; khung giờ nhận lại | Từ chối, TYN A2 | I |
| PD-04 | Từ chối thiếu/quá dài lý do | 400 `LY_DO_TU_CHOI_KHONG_HOP_LE` | Q27 | U, E |
| PD-05 | Từ chối/duyệt yêu cầu đã xử lý | 409 `YEU_CAU_DA_XU_LY` | HĐK thất bại | I |
| PD-06 | Duyệt bước 1 | `DaDuyet`, người/thời điểm xử lý, audit, thông báo, đã khoá `bac_si` X | b3–b4 | I |
| PD-07 | Duyệt: cổng giả | `findAffectedByLeave` với đúng `{ bacSiId, tuNgay, denNgay, ca?, now }`; `cancel` với `actor: HeThong`, `reason: BacSiNghiPhep` cho từng lịch | D5 | I |
| PD-08 | `Cancelled`, `AlreadyCancelled`, `NotCancellable`, `NotFound` | Tổng hợp `daHuy`, `daHuyTruocDo`, `khongHuyDuoc`; `AlreadyCancelled` là thành công | D5 | I |
| PD-09 | `ngay_ket_thuc < hôm nay`; một phần đã qua | 409 `YEU_CAU_NGHI_DA_QUA_HAN`; duyệt được với `now` làm cận | Q30, H19 | I |
| PD-10 | Bước 2 ném lỗi | 200 `hoanTat: false`; `DaDuyet` vẫn còn | Q29 | I |
| PD-11 | `retry-cancellations` | Chỉ `DaDuyet`; chạy hai lần: lần hai `daHuy = 0` | D5, DT-17 | I, E |
| PD-12 | Sweeper: quét `DaDuyet` còn hiệu lực; bỏ yêu cầu quá khứ; lô/trần; cờ `running`; lỗi một yêu cầu không dừng lượt; tắt ở `NODE_ENV=test`; **điều kiện dừng** (yêu cầu qua `ngay_ket_thuc`, hoặc `findAffectedByLeave` rỗng ⇒ không làm gì); log chỉ có số đếm, **không** có tên bệnh nhân, mã lịch hẹn đầy đủ hay lý do | Đúng | H9, Q29 | I |
| PD-13 | Hai bản sweeper cùng lúc | Mỗi lịch huỷ **đúng một lần** (cổng giả đếm) | H9 | I |
| PD-14 | Bác sĩ, Lễ tân, Bệnh nhân gọi | 403 | Tác nhân | E |
| PD-15 | Admin Chi nhánh duyệt yêu cầu của bác sĩ chi nhánh khác; Toàn hệ thống | 404 cùng thân; thành công | TĐK | I, E |
| PD-16 | Bác sĩ đã đổi chi nhánh | Yêu cầu thuộc chi nhánh **hiện tại** (Q28) | L6 | I |
| PD-17 | Ca của yêu cầu mang chi nhánh khác (dữ liệu lệch) | Xử lý theo `(ngày, ca)`, không lọc chi nhánh | H11 | I |
| PD-18 | Audit lỗi khi từ chối/duyệt | Hoàn tác | SOW 3.2 | I |
| PD-19 | Duyệt không `UPDATE lich_hen`/`khung_gio`, không gọi `RefundPort`/`WaitlistPort` | Đúng (quét mã và cổng) | H6 | U |
| PD-20 | Phản hồi chi tiết khi có D13 | Danh sách trắng; không email/SĐT bệnh nhân | H10 | I |
| PD-21 | `thongKe` với bộ lọc | Cùng bộ lọc trừ trạng thái | Q38 | I |
| PD-22 | Chưa có `booking` | Cột/mục lịch hẹn bị ảnh hưởng ẩn; nút Duyệt không có | Q26 | I, W |

### 7.7 Quyền và phạm vi (QH)

| ID | Kịch bản | Mong đợi | Phủ | Loại |
|---|---|---|---|---|
| QH-01 | Quét mọi route của module | Có `@Roles`; route Admin có `@RequireAdminScope` | AR | U |
| QH-02 | Toàn hệ thống khác Chi nhánh (phân công, xem lưới, danh sách/duyệt) | Toàn hệ thống mọi chi nhánh; Chi nhánh chỉ phạm vi, ngoài phạm vi 404 | TĐK | I, E |
| QH-03 | Lễ tân chỉ ca mang chi nhánh được gán (kể cả ca cũ của bác sĩ đã chuyển) | Đúng | XLV MT | I, E |
| QH-04 | Hai tài khoản bác sĩ cùng chi nhánh | Mỗi người chỉ lịch/yêu cầu của mình | XLV b4, TYN | E |
| QH-05 | Không token / hết hạn / sai chữ ký | 401 mọi route | A4 | E |
| QH-06 | Lễ tân bị khoá hoặc đổi vai trò; hồ sơ `le_tan` bị xoá | Hiệu lực ngay (token cũ) | A4 | E |
| QH-07 | Danh sách trắng trường ở mọi phản hồi | Không email/SĐT/mật khẩu/`ly_do` sai người | H10 | E |
| QH-08 | `Cache-Control: no-store` | Có | H10 | E |
| QH-09 | Log không chứa lý do/token | Đúng | log-masking | E |
| QH-10 | Admin Chi nhánh: danh sách bác sĩ chọn | Chỉ trong phạm vi | Q14 | I |
| QH-11 | Hai Lễ tân hai chi nhánh | Thấy khác nhau, đúng chi nhánh của mình | b4 | E |
| QH-12 | Đổi phạm vi Quản trị viên | Hiệu lực request sau | rbac | I |

### 7.8 Bảng và migration (MG)

| ID | Kịch bản | Mong đợi | Phủ | Loại |
|---|---|---|---|---|
| MG-01 | `schema-parity` | DDL migration = `clinix_mysql.sql` từng dòng | Q41 admin | I |
| MG-02 | `chk_nghi_phep_hinh_thuc`: `CaNgay` có `ca`; `TheoCa` không `ca`; `TheoCa` nhiều ngày; `CaNgay` bắt đầu > kết thúc | DB từ chối cả bốn | Quy tắc 7 | I |
| MG-03 | `chk_nghi_phep_xu_ly`: `ChoDuyet` có người xử lý; `DaDuyet` thiếu thời điểm | DB từ chối | Quy tắc 9 | I |
| MG-04 | Khoá ngoại `bac_si`, `quan_tri_vien`; chỉ mục | Có | | I |
| MG-05 | `revert` rồi chạy lại | Xoá/tạo đúng | | I |
| MG-06 | Migration enum nhật ký (P4) | Giá trị mới nhận, cũ giữ nguyên, `revert` ghi chú | L14 | I |
| MG-07 | `registry.spec.ts` | Thứ tự và đăng ký đúng | H15 | U |
| MG-08 | Đối chiếu ENUM: `HANH_DONG_NHAY_CAM`, `LOAI_DOI_TUONG_NHAT_KY` (`admin/entities/enums.ts`) ↔ cột ENUM của `nhat_ky_hanh_dong` trong DB đã migrate (`information_schema`) ↔ mọi hành động/đối tượng của `AuditEntry` (⊆ bộ giá trị) | Ba nguồn khớp khi so bằng **tập hợp** (từng giá trị), không so số lượng, nên booking B14 thêm `OverrideLichHen` không gây xung đột; thêm giá trị ở một nơi mà quên nơi khác thì đỏ | Q34, L14 | I |

### 7.9 Đồng thời (DH) và bất biến (IV) — chạy trên MySQL thật; sau mỗi ca chạy IV-01…IV-04

| ID | Kịch bản | Mong đợi | Phủ | Loại |
|---|---|---|---|---|
| DH-01 | **Hai Admin cùng phân công một ca** (≥ 30 vòng) | Đúng một thành công; kia `CA_DA_PHAN_CONG`; không 500; 0 deadlock | H2, A2 | I |
| DH-02 | Hai yêu cầu nghỉ giống nhau đồng thời | Đúng một thành công | H7 | I |
| DH-03 | Phân công đua với đổi chi nhánh bác sĩ (giả admin khoá `bac_si` X) | Tuần tự; ca vừa phân công mang đúng chi nhánh mới hoặc cũ, **không lẫn**; IV-01 đúng | H3, Q28 | I |
| DH-04 | Phân công đua với đổi `thoi_luong` (giả dịch vụ khoá `FOR UPDATE`, không xin `bac_si` sau đó; **cần MySQL thật**, chưa chạy) | Khung giờ khớp thời lượng cuối; hoặc đổi bị chặn; không deadlock | H4 | I |
| DH-05 | Gỡ ca đua với đặt lịch (giả `booking`: `bac_si` S, `khung_gio` X, chèn `lich_hen`) | Đúng một bên; không ca mồ côi, không khung giờ mồ côi | H5 | I |
| DH-06 | **Duyệt nghỉ (bước 1 thật + huỷ giả) đua với đặt lịch giả** (≥ 30 vòng) | Mỗi vòng: lịch vừa tạo bị bước 2 thấy và huỷ, hoặc đặt bị chặn; không có lịch `DaXacNhan` trong khoảng nghỉ đã duyệt | H6 | I |
| DH-07 | **Mất tiến trình giữa hai bước:** commit `DaDuyet` rồi dừng sau khi huỷ một phần; chạy sweeper hai lần | Các lịch còn lại huỷ **đúng một lần**; không hoàn/huỷ hai lần | H6, DT-17 | I |
| DH-08 | Hai Admin duyệt/từ chối cùng một yêu cầu (hai biến thể) | Một thắng, một `YEU_CAU_DA_XU_LY` | Q31 | I |
| DH-09 | Phân công nhiều bác sĩ theo thứ tự chéo (A:[1,2], B:[2,1]) | 0 deadlock (khoá id tăng dần) | H2 | I |
| DH-10 | Stress: phân công + gỡ + tạo yêu cầu + duyệt + đặt lịch giả (≥ 100 vòng) | IV đúng; 0 deadlock còn sót | H2 | I |
| DH-11 | Hai bản sweeper cùng lúc | Mỗi lịch huỷ một lần | H9 | I |
| IV-01 | Mọi `lich_lam_viec` có `ngay ≥ hôm nay` mang chi nhánh = chi nhánh hiện tại của bác sĩ | Đúng (I-1) | H3 | I |
| IV-02 | Mọi ca có đủ khung giờ theo `generateSlotStarts` (không thiếu, không thừa) | Đúng | H1 | I |
| IV-03 | Mọi khung giờ do module sinh nằm trọn trong khoảng của ca tại lúc sinh | Đúng | H1 | I |
| IV-04 | Không có hai yêu cầu `ChoDuyet`/`DaDuyet` chồng nhau của một bác sĩ | Đúng | H7 | I |
| IV-05 | Sau sweeper (cổng thật ở X3): không có lịch `ChoThanhToan`/`DaXacNhan` có `thoi_gian > now` trong khoảng nghỉ `DaDuyet` | Đúng | H6 | I |

### 7.10 Hợp đồng và cổng (HD)

| ID | Kịch bản | Mong đợi | Phủ | Loại |
|---|---|---|---|---|
| HD-01 | Cây import | `SchedulingModule` không import `AppointmentsModule`; không chu trình | H20 | U |
| HD-02 | `AvailableSlotsReader` trong `em` của người gọi | Cùng ảnh chụp, không mở giao dịch riêng | D3 | I |
| HD-03 | `LeaveReader.findBlockingLeave`: `ChoDuyet`/`DaDuyet`/`TuChoi`, `TheoCa`/`CaNgay`, biên ngày | Đúng; chặn cả `ChoDuyet` | D4 | I |
| HD-04 | Người gọi giả như `booking` dùng `checkSlotWithinBranchHours` | Bốn mã lý do đúng | D2 | U |
| HD-05 | `ShiftQueries.findFutureShiftsAtBranch` | Ca hôm nay tính là còn; ca quá khứ và chi nhánh khác không | quy tắc 13 | I |
| HD-06 | `AppointmentCancellationPort` giả: tham số D5/D13/D14 | Đúng hình dạng | D5, D13, D14 | I |
| HD-07 | `AlreadyCancelled` coi là thành công | Đúng | D5 | I |
| HD-08 | Quét `src/doctor` và `src/scheduling` | Không có `UPDATE lich_hen`, `UPDATE khung_gio`, `NOW()`, `CURDATE()` | H6, H8 | U |
| HD-09 | Quét route | Mọi route có `@Roles` | QH-01 | U |
| HD-10 | Cây import | Đúng một `ScheduleModule` (E2E-J02 xanh) | H9 | E |
| HD-11 | `seed:doctor-demo` | Idempotent; khung giờ khớp D1; dữ liệu không dùng trong test tự động | D9 | I |
| HD-12 | Người gọi giả như `search` K1 | `listMany` trả `khungGioId`, đủ 4 `trangThaiNgay` | D3, D10 | I |

### 7.11 Thông báo và nhật ký (TD)

| ID | Kịch bản | Mong đợi | Phủ | Loại |
|---|---|---|---|---|
| TD-01 | Nội dung thông báo | ≤ 500; không ký tự điều khiển | Q33 | U |
| TD-02 | Người nhận Admin | `ToanHeThong` đang hoạt động + `ChiNhanh` đúng; tài khoản ngừng hoạt động không nhận | TYN b6 | I |
| TD-03 | Ghi cùng giao dịch | Lỗi ⇒ hoàn tác thao tác | H12 | I |
| TD-04 | Không ghi `email_thong_bao` | Đúng | Q33 | I |
| TD-05 | Nhật ký 4 hành động | Danh sách trắng, người thực hiện từ phiên, chi nhánh bác sĩ, không lý do của Bác sĩ | SOW 3.2 | I |
| TD-06 | `AuditEntry` mới (và ca `C2-03` cũ đổi thành "ngoài tập hành động của `AuditEntry` hiện có", đọc từ danh sách, không ghi số cứng) | Hành động mới được chấp nhận; hành động ngoài whitelist vẫn `AUDIT_ACTION_UNSUPPORTED`; khoá thừa/nhạy cảm bị từ chối | P4 | U |
| TD-07 | Mã sự kiện; không `ly_do` Bác sĩ trong thông báo cho Admin | Đúng | H10 | U |

### 7.12 Giao diện (WK, WL, WN, WA)

| ID | Kịch bản | Mong đợi | Phủ | Loại |
|---|---|---|---|---|
| WK-01 | Khung Bác sĩ: menu theo Figma | Tổng quan, Lịch hẹn, Lịch làm việc, Tin nhắn, Thông báo, Thông tin cá nhân; tên vùng "Điều hướng Bác sĩ" | Phạm vi | W |
| WK-02 | Mục chưa có trang | Nút vô hiệu "Chưa được triển khai" | patient Q21a | W |
| WK-03 | Route chỉ mục | Chuyển tới Lịch làm việc | | W |
| WK-04 | Vai trò khác vào `/bac-si-portal` | Bị cổng `RequireAuth` chuyển đi | | W |
| WK-05 | Đăng xuất lỗi, thử lại | Hộp lỗi + nút thử lại | | W |
| WK-06 | Màn hẹp | Ngăn kéo mở/đóng | patient F11 | W |
| WK-07 | Lỗi trang con | Hiện trong vùng nội dung, khung còn | | W |
| WK-08 | Gắn route "Lịch hẹn" của booking | Có mặt khi có; nút vô hiệu khi chưa | D8 | W |
| WL-01 | Lưới tuần Bác sĩ | Ca, giờ, chi nhánh, số ca; thống kê đúng | b2 | W |
| WL-02 | Chú giải và trạng thái nghỉ | Làm việc / Nghỉ đã duyệt / Chờ duyệt / Yêu cầu bị từ chối đúng màu token | b2 | W |
| WL-03 | Chuyển tuần, "Hôm nay" | Tuần T2–CN theo giờ VN | b3 | W |
| WL-04 | Chế độ tháng | Chip "S"/"C" hoặc "—" đúng | b2 | W |
| WL-05 | Lọc ca/trạng thái/chi nhánh | Đúng | b3 | W |
| WL-06 | Chi tiết ca | Ngày, ca, giờ, chi nhánh | | W |
| WL-07 | Rỗng, loading, lỗi, mất mạng, timeout | Thành phần có sẵn | A1 | W |
| WL-08 | Lễ tân: lưới, lọc, **không** có nút sửa/phân công | Đúng; chân trang "chỉ để xem" | MT | W |
| WL-09 | Lễ tân 403 khi sửa URL | Thông báo không đủ quyền | A2 | W |
| WL-10 | Chưa có số lịch hẹn | Không hiện "0 lịch" | Q18 | W |
| WL-11 | Biên tuần: chủ nhật, đổi tháng/năm | Đúng giờ VN | H8 | W |
| WN-01 | Form "Cả ngày": từ–đến, lý do | Gửi đúng thân | b2–b3 | W |
| WN-02 | Form "Theo ca": một ngày + ca | Gửi đúng thân; không cho chọn nhiều ngày | b2 | W |
| WN-03 | Lỗi A1 theo `loi[]` | Hiện dưới đúng ô | A1 | W |
| WN-04 | Thành công | Toast + dòng lịch sử "Chờ duyệt" | b5–b6 | W |
| WN-05 | Chống bấm đúp | Một yêu cầu | | W |
| WN-06 | Lỗi 409 nghiệp vụ (chồng, ngoài lịch, quá hạn) | Thông báo theo mã | | W |
| WN-07 | Lịch sử rỗng/lỗi/phân trang | Thành phần có sẵn | | W |
| WN-08 | Chi tiết | Loại, ngày, ca, lý do, gửi lúc, trạng thái | | W |
| WN-09 | Không có nút "Hủy yêu cầu" | Đúng (Q23) | Q23 | W |
| WN-10 | Mất mạng khi gửi | Giữ dữ liệu form, báo lỗi | | W |
| WA-01 | Lưới Admin: Toàn hệ thống / Chi nhánh | Lọc chi nhánh / chip cố định | L28 | W |
| WA-02 | Hộp Phân công: bác sĩ, thứ, ca, xem trước | Đúng; nút vô hiệu tới khi đủ | b3 | W |
| WA-03 | `viPham[]` | Liệt kê theo bác sĩ/ngày/ca với thông báo theo mã | A1–A4 | W |
| WA-04 | Thành công | Toast + làm mới lưới | b5 | W |
| WA-05 | Bấm ô "+" | Hộp mở điền sẵn | | W |
| WA-06 | Gỡ ca và lỗi `CA_DANG_CO_LICH_HEN` | Đúng | Q8 | W |
| WA-07 | Danh sách duyệt: thẻ, lọc, phân trang, rỗng | Đúng | b1, A1 | W |
| WA-08 | Chi tiết yêu cầu | Đúng | b2 | W |
| WA-09 | Hộp Từ chối | Lý do bắt buộc; nút vô hiệu khi trống | Q27 | W |
| WA-10 | Hộp "Xác nhận duyệt" | Nêu số lịch huỷ, số đã cọc hoàn 100%, số bệnh nhân | Q32 | W |
| WA-11 | Kết quả duyệt | `daHuy`, `khongHuyDuoc`, lỗi | Q29 | W |
| WA-12 | "Xử lý lại" | Gọi retry; kết quả cập nhật | Q29 | W |
| WA-13 | Tab "Yêu cầu đổi lịch" | Vô hiệu | Q36 | W |
| WA-14 | Banner Admin Chi nhánh | Số yêu cầu chờ duyệt + liên kết | L28 | W |
| WA-15 | Hộp thoại: tên truy cập, focus, Esc, tương phản token | Đạt | ADR 0004 | W |
| WA-16 | Danh sách/drawer của F8 (trước F9) | Không có nút "Duyệt" bấm được và không có lời gọi tới `approve` | Q26 | W |

### 7.13 Bảo mật dùng chung (BD)

| ID | Kịch bản | Mong đợi | Phủ | Loại |
|---|---|---|---|---|
| BD-01 | DTO whitelist (`forbidNonWhitelisted`) mọi endpoint có thân/query | Tham số lạ ⇒ 400 `TRUONG_KHONG_DUOC_PHEP` | M9 | E |
| BD-02 | Mọi mã lỗi ở 5.14 | Đúng HTTP và hình dạng chuẩn (`expectErrorResponse`) | | E |
| BD-03 | Không bí mật/PII trong log và phản hồi | Đúng | AGENTS 1.3 | E |
| BD-04 | Phản hồi danh sách trắng (snapshot khoá) | Không `SELECT *`, không thừa trường | H10 | E |
| BD-05 | Job tắt ở `NODE_ENV=test`; một `ScheduleModule` | Đúng | H9 | U |

## 8. Đề xuất gom cụm (chỉ đề xuất — nhóm chốt)

Một người làm full-stack trọn module (Trung); mỗi task một PR. Thứ tự theo phụ thuộc thật, **mở khoá module khác sớm nhất** (booking chờ D2, D4; search K1 chờ D3):

| Cụm | Task (thứ tự PR) | Điều kiện bắt đầu | Kết quả nhìn thấy được |
|---|---|---|---|
| 0 — Nền và đo | **P1, P2** (song song) → **P5** → **X1**; P3 (nếu booking P4 chưa có), P4 theo Q34 | Ngay (P1, P2) | Bảng nghỉ phép; luật giờ ca dùng chung (**booking B6, search K1 mở khoá**); số đo thật |
| 1 — Khung giờ và phân công | **B1 → B2 → B3 → B4**; **B18** (seed) | Cụm 0, Q1, Q6, Q7, Q10, Q34, Q40 | Admin phân công quy tắc lặp qua API; khung giờ thật cho demo/booking |
| 2 — Đọc | **B5 → B6**; **B7 → B8 → B9**; **F1 → F2 → F3**; **F5**; **F6** | Cụm 0; Q13–Q18 | Hai reader cho `booking`/`search`; Bác sĩ, Lễ tân, Admin xem được lịch |
| 3 — Xin nghỉ | **B10 → B11 → B12 → F4** | B5, P1 | Bác sĩ xin nghỉ, xem lịch sử; khung giờ bị chặn khi `ChoDuyet` |
| 4 — Duyệt | **B13 → B14 → F8**; **F7** (phân công, sau B2–B4, F6); **B15 → B16 → B17 → F9** | Cụm 3; Q26–Q32; **Duyệt chờ booking B10, B11** | Admin xem/Từ chối; Duyệt khi booking sẵn sàng |
| 5 — Hoàn tất | **X2 → X3 → X4**; D1–D3 đi theo từng cụm; **F10** khi booking F11 xong | Cụm 1–4 | Module đủ điều kiện mục 10 |

Nếu thiếu thời gian: cụm 0–3 (nền, phân công, đọc, xin nghỉ) là bản chạy được đầy đủ cho ba use case "đợt đầu" (PCLV, XLV, TYN); cụm 4 chỉ cần B13, B14 (xem + Từ chối) để demo phần "phê duyệt" trung thực, **Duyệt làm khi booking B10, B11 xong**. Nếu cần một người hỗ trợ, phần tách gọn nhất là cụm 2 (B7–B9, F2, F3, F5, F6) — người làm chính vẫn phải giải thích được toàn module (đặc biệt thứ tự khoá, nguyên tắc bất biến I-1, duyệt hai giai đoạn và vì sao không có `Noop` cho huỷ lịch hẹn) khi vấn đáp. **Mục 5.10 phải đối chiếu xong trước khi tạo issue của cụm 1, 2.**

**Gợi ý MVP cho demo (chỉ là gợi ý):** cụm 0–3 + B13, B14, F8: Admin phân công "Cả ngày T2–T6 trong 3 tuần" cho vài bác sĩ (có xem trước và lỗi A1–A4), Bác sĩ xem tuần/tháng và xin nghỉ, khung giờ hiện trong `search`/`booking` rồi biến mất khi có yêu cầu `ChoDuyet`, Lễ tân xem lưới đúng chi nhánh, Admin Từ chối và khung giờ hiện lại.

## 9. Quy trình bắt buộc cho mỗi PR của module

1. Nhánh `feat/doctor-<việc>` do thành viên tạo; tiêu đề PR theo Conventional Commits, scope `doctor` (hạ tầng: `api`/`web`/`db`/`docs`; module khác bị chạm: `admin`, `search`, `rbac`, `audit`), **không quá 100 ký tự** (đếm ký tự), ví dụ `feat(doctor): thêm phân công ca theo quy tắc lặp và sinh khung giờ (B3)`. Thân PR có `Closes #<issue>`; không viết `@Ten` hay `#số` trần ngoài chỗ cố ý. Commit/push/merge **do thành viên tự làm**; không có dòng `Co-Authored-By` hay chữ ký AI (AGENTS mục 1, CONTRIBUTING mục 9).
2. Dùng AI ⇒ ghi nhật ký AI **ngay**: task sinh mã do Trung làm ghi ở **`TRUNG_AI_USAGE_LOG.md`** (bảng 1, mục mới chèn ở đầu bảng; mã `AI-BUG-nnn` mới = số lớn nhất trong CẢ HAI nhật ký + 1; mỗi task một dòng, ghi ở PR kế tiếp nếu chưa có số); lỗi AI phát hiện ⇒ bảng 2 + `AI-BUG-nnn` trong commit sửa. **Dòng của lần lập kế hoạch này là dòng 63 của `AI_USAGE_LOG.md`** (của Đại; đã ghi ở bước tài liệu cuối sau khi kiểm `origin/main`: dòng lớn nhất vẫn 61). Dòng 62 giữ cho patient B7 ở PR của F8; nếu hai PR gộp khác thứ tự thì giữ cả hai dòng và sắp lại theo số.
3. Đổi thiết kế/DB ⇒ cập nhật tài liệu trong cùng PR (task `[ĐỒNG BỘ TL]`, mục 6.5); `docs/database/*` sửa **cả ba file**; 2.4/Figma thì nhắc người dùng làm.
4. Sửa file của module khác (`[ĐỤNG admin]`, `[ĐỤNG search]`, `[ĐỤNG rbac]`, `[ĐỤNG audit]`, `[ĐỤNG patient]`, `[ĐỤNG booking]`) hoặc file dùng chung (`docs/database/*`, `router/*`, `shared/**`, `app.module.ts`, `database/entities.ts`, `database/migrations/index.ts`, `package.json`) ⇒ báo người sở hữu trước, `git pull` bản mới trước khi bắt đầu, giữ PR nhỏ. Migration mới: timestamp lớn hơn mọi migration đã merge (H15).
5. Chạy thật `npm run lint`, `build`, `test`, `test:int`, `test:e2e` (api) và `lint`, `test` (web), báo đúng kết quả (kể cả đỏ); `npm run dup` (jscpd ≤ 3%, **chạy trong container Linux**); **không chạy hai vitest cùng lúc trên cùng DB test**; Node 22.x. Cập nhật `TRACKING.md` sau mỗi task; khi cả module xong thêm **đúng một dòng** vào `docs/TRACKING.md`.
6. Tự giải thích được mọi dòng — đặc biệt: vì sao giờ ca không lưu mà suy ra từ lịch hoạt động chi nhánh (Q6), vì sao sinh khung giờ cùng giao dịch phân công và vì sao idempotent (Q7), khoá `bac_si` theo id tăng dần và `dich_vu_kham` `FOR SHARE` (H3, H4), bất biến I-1 và vì sao duyệt theo chi nhánh hiện tại của bác sĩ (Q28), vì sao nghỉ phép chặn khung giờ bằng cách **suy ra** chứ không đổi trạng thái khung giờ (L18), duyệt hai giai đoạn + sweeper (Q29), vì sao không có `Noop` cho huỷ lịch hẹn (Q26), vì sao `doctor` không bao giờ `UPDATE lich_hen`/`khung_gio` (D7, H6).

## 10. Điều kiện hoàn thành module

- Mọi test case ở mục 7 (trừ ca của phương án không được chọn) đã chạy; kết quả ghi trong `TRACKING.md`; không còn Fail; IV-01…IV-04 đúng sau mọi ca đồng thời (IV-05 và DH-06, DH-07 với cổng `booking` **thật** ở X3); số đo X1 (M1–M13) đã ghi.
- Không còn thẻ `[CHỜ …]` (task bị hoãn theo quyết định nhóm ghi rõ ở `TRACKING.md` mục 3 và `TECH_DEBT`); mọi `[ĐỒNG BỘ TL]` đã làm; 2.4, `docs/database/*` và Figma khớp với mã; Q1, Q2, Q3 do Trung xác nhận (đã xác nhận 08/11/2026).
- PLAN `booking` và PLAN này **đã đối chiếu** mục 5.10 và ghi ở `TRACKING.md` mục 3 của cả hai; tên hàm hai bên trùng; D13, D14 và điều kiện `thoi_gian > now` của D5 đã có ở `booking`; `search` K1 có `khungGioId` và sửa KGI-03.
- `booking` B6 dùng `checkSlotWithinBranchHours` của module này (không viết lần hai); `search` K1 gọi `AvailableSlotsReader`; `admin` B13 gọi `ShiftQueries` (một cách đọc `lich_lam_viec`).
- Khung Bác sĩ thật; Lễ tân, Admin có trang; trang "Lịch hẹn" của Bác sĩ đã gắn (hoặc ghi nợ).
- `docker compose up --build` chạy; X2 đạt với tài khoản seed. Lint/build/test xanh; không secret; `AI_USAGE_LOG.md` đầy đủ.

