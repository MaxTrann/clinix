# Kế hoạch module `booking`

> **Trạng thái: bản nháp 2 (08/11/2026).** Phiên kiểm độc lập bản nháp 1: **đạt**. Nhóm trả lời đủ **46 câu** Q1–Q46 (đồng ý 38 đề xuất nguyên văn, 8 câu kèm điều kiện: Q7, Q13, Q15, Q17, Q21, Q28, Q29, Q44; quyết định cuối ở [`TRACKING.md`](TRACKING.md) mục 3, ưu tiên hơn bảng đề xuất ở mục 4.2).
> **Còn chờ Trung (`[CHỜ Trung]`):** Q7 (`doctor` sở hữu "khung giờ còn trống": Đại đã đồng ý, Trung chưa xác nhận, PLAN `search` Q18 phải được Trung sửa), Q15 (Trung làm migration + entity `moc_hoan_tien`), Q29 (Trung đồng ý thêm `thong_bao.lich_hen_id` thì phương án A, không thì B). Mục 5.10 **chưa đối chiếu** với PLAN `doctor` (chưa có bản): làm khi có, ghi ở TRACKING mục 3 của cả hai module. Q42 chỉ chốt sau khi đo M3 ở X1.
> **Người làm module: Đại (`MaxTrann`)**, full-stack. Module `doctor` (Trung) được lập kế hoạch **song song**: mục **5.10 "Hợp đồng với module song song"** là phần phải đối chiếu hai bên TRƯỚC khi tạo issue.
> Kế hoạch do AI (Claude Code, Claude Sonnet 5.5) lập theo [`docs/FEATURE_PLANNING_PROMPT.md`](../../FEATURE_PLANNING_PROMPT.md) →
> **ghi `AI_USAGE_LOG.md` (bảng 1) cho lần lập kế hoạch này và cho mọi lần dùng AI sinh mã theo kế hoạch** (CONTRIBUTING mục 4).
> Đã kiểm mã thật ở commit `a3f26b1` (= `origin/main` = PR 220 khi lập bản nháp 1; **không** tin ô tick của PLAN các module khác) và đọc Figma CLINIX ngày 08/11/2026 (mục 4.4).
> Mọi chỗ ghi **"chưa đo"** là suy ra từ mã/tài liệu, **chưa chạy thử** trên MySQL thật; danh sách việc phải đo trước khi viết mã ở mục 5.15.

## 0. Quy ước đọc

- Tên use case viết tắt trong cột "Truy vết": **ĐLK** = Đặt lịch khám; **HLH** = Hủy lịch hẹn; **TCLS** = Tra cứu danh sách / lịch sử lịch hẹn (Bệnh nhân);
  **CNTT** = Cập nhật trạng thái lịch hẹn; **XDS** = Xem danh sách lịch hẹn (Lễ tân, Quản trị viên); **XDSPC** = Xem danh sách lịch hẹn được phân công (Bác sĩ).
  `b4` = bước (4); `A1/4b` = luồng thay thế A1, mục 4b; `A2/8a–8c`; "MT" = Mô tả; "TĐK" = tiền điều kiện; "HĐK" = hậu điều kiện.
  Số bước lấy đúng 2.4 bản Drive 03/11/2026 (nguyên văn trong prompt lập kế hoạch).
- Nguồn đúng khi lệch nhau: **schema DB (`docs/database/`) để code**; chỗ 2.4/schema/Figma lệch nhau ở mục 3.4 — đã hỏi ở mục 4.2.
- Thẻ: `[ĐỒNG BỘ TL]` = task phải cập nhật tài liệu (2.4, `docs/database/*`, Figma, sơ đồ) trong **cùng PR** (CONTRIBUTING mục 7); `[TIỀN ĐỀ]` = việc nền của module;
  `[CHỜ Qn]` = bị chặn bởi câu hỏi Qn; `[CHỜ doctor]`, `[CHỜ payment]`, `[CHỜ wallet]`, `[CHỜ waitlist]`, `[CHỜ notification]`, `[CHỜ admin Bn]` = chờ module/task đó có mã;
  `[ĐỤNG x]` = sửa file thuộc module x (báo người sở hữu: `auth`, `patient` là Đại; `admin`, `search`, `doctor` là Trung) ⇒ báo trước (AGENTS mục 6);
  `[ĐỤNG router]` = sửa `router/role-nav.ts`, `router/role-routes.tsx`, `router/routes.tsx`, `router/public-nav.ts` (dùng chung nhiều module).
- Mỗi task = **một PR** nhỏ, **chỉ backend HOẶC chỉ frontend**, scope `booking` (hạ tầng: `api`/`web`/`db`/`docs`). Test đặt cạnh mã; mỗi test ghi mã test case ở mục 7.
- `[đề xuất]` = giá trị AI tự đề xuất, chưa chốt; `[cần điền]` = thiếu thông tin, chưa có đề xuất.
- Mã task: `P` nền, `B` backend, `F` frontend, `D` đồng bộ tài liệu, `X` kiểm tay và tổng kết (nếp của `patient`, `search`).

## 1. Phạm vi

**Làm (6 use case của prompt):**
- **ĐLK:** kiểm tra khung giờ và điều kiện của hồ sơ đi khám (b8, b11, b12), giữ chỗ nguyên tử và tạo lịch hẹn `ChoThanhToan` (b14, b17–b18), giá snapshot, mã lịch hẹn, tự xác nhận khi cọc 0đ (b15–b16),
  hết hạn giữ chỗ (b19, A5), các luồng A2 (khung giờ vừa hết), A3 (hồ sơ không đủ điều kiện), A4 (khoá no-show), A6 (chi nhánh nghỉ/ngoài giờ); **frontend các bước 4–6** (Thông tin, Xác nhận, Thanh toán, Hoàn tất),
  khung của trang đặt lịch và điểm vào A1 (khung giờ chọn sẵn). Các bước 1–3 (nhóm dịch vụ, dịch vụ, bác sĩ) **đã có** ở `search` F5.
- **HLH:** huỷ lịch hẹn của Bệnh nhân (kể cả hồ sơ người thân), ước tính tiền hoàn, **một dịch vụ huỷ dùng chung** (Bệnh nhân, Lễ tân, Quản trị viên override, hệ thống hết hạn giữ chỗ, hệ thống huỷ khi duyệt nghỉ phép),
  giải phóng khung giờ, gọi cổng hoàn tiền và cổng mời danh sách chờ.
- **TCLS:** danh sách và chi tiết lịch hẹn của mọi hồ sơ đi khám thuộc tài khoản Bệnh nhân.
- **CNTT:** Lễ tân (Đã hủy, Vắng mặt, Đã tiếp đón có điều kiện), Quản trị viên override (lý do bắt buộc, Audit Log `OverrideLichHen`), **tự động đánh dấu Vắng mặt**, cộng dồn no-show và bật cờ khoá đặt lịch.
- **XDS, XDSPC:** API danh sách và chi tiết cho Lễ tân, Quản trị viên, Bác sĩ (trang Bác sĩ cắm vào khung Bác sĩ của `doctor`).
- **Nền dùng chung** `apps/api/src/appointments/`: ma trận trạng thái, **nơi DUY NHẤT ghi `lich_hen.trang_thai`** và `khung_gio.trang_thai`, khoá theo thứ tự cố định (mục 5.3), cổng sang module khác (mục 5.10).

**Không làm (module khác; chỉ nêu cổng giao tiếp ở mục 5.10):** bước 3 của đặt lịch (chọn bác sĩ và khung giờ): API ở `search` K1, giao diện `search` K2, phép tính "khung giờ còn trống" và **sinh `khung_gio`** ở `doctor`;
lịch làm việc, yêu cầu nghỉ phép và **duyệt nghỉ phép** (`doctor`; chỉ phần huỷ lịch hẹn do duyệt nghỉ gọi dịch vụ huỷ của module này); thanh toán cọc, nạp/rút ví, hoàn tiền vào ví, thanh toán offline tại quầy (`payment`, `wallet`);
đăng ký chờ và mời danh sách chờ (`waitlist`); đổi lịch hẹn; điều chỉnh số lần no-show và mở khoá no-show (module sau; **cộng** no-show và **kiểm** khoá thì thuộc module này); nhắc lịch (`nhac_lich_hen`, `notification`);
Trung tâm thông báo; xác nhận hoàn thành ca khám và hồ sơ khám (`doctor`; `HoanThanh` chỉ Bác sĩ chuyển); trang "Tổng quan" của Bệnh nhân; **đặt lịch hộ tại quầy cho Lễ tân** (use case đã bỏ 23/09: mục 3.4 L16 nêu chỗ Figma còn frame và hỏi, không tự thêm).
Không có use case nào của module này **tải ảnh lên**, nên không có câu hỏi nơi lưu tệp.

## 2. Hiện trạng repo (đã kiểm ở `a3f26b1`, 08/11/2026)

**API (`apps/api/src/`):**
- `auth` đủ A1–A15: guard toàn cục `JwtAuthGuard` + `RolesGuard`, `@Roles`, `@CurrentUser`, `@Public`; `AppException` + bộ lọc lỗi chuẩn; `MailService` + `renderMailShell`; `OtpService`. Vai trò đọc từ DB mỗi request (đổi vai trò/khoá tài khoản có hiệu lực ngay).
- **`appointments/` đã có (patient B5), chỉ là hàm thuần nhận `EntityManager`, chưa có module/controller:** `active-appointment-states.ts` (`ACTIVE_APPOINTMENT_STATES` = `ChoThanhToan`, `DaXacNhan`, `DaTiepDon`), `active-appointment.query.ts`
  (`findActiveAppointments(em, benhNhanId, hoSoNguoiThanId)`, câu đọc thường), `visit-profile.query.ts` (`lockVisitProfile`, `isVisitProfileUsable`: `FOR UPDATE` hàng `ho_so_nguoi_than`, trả `missing`/`inactive`/`active`), cùng spec và `appointments.int-spec.ts`.
  Comment trong mã ghi **hợp đồng khoá**; `booking` tiếp quản thư mục này.
- `patient` B1–B6 đã merge (hồ sơ cá nhân, người thân, ngừng sử dụng, tra cứu bệnh nhân của Lễ tân); B7 đang làm. `RelativesService.deactivate` chạy `REPEATABLE READ`, khoá `benh_nhan` → `ho_so_nguoi_than` → đọc `lich_hen`; mã `HO_SO_NGUOI_THAN_DA_NGUNG` (409) đã có ở `patient/relatives`.
- `search` (Trung) 14/28 task: API công khai chi nhánh, chuyên khoa, nhóm dịch vụ, dịch vụ, bác sĩ, gợi ý, tổng quan. `search/pricing/exam-price.reader.ts` (`ExamPriceReader.loadRules`, `priceFor`) — **`SearchModule` không có `exports`**, nên module khác chưa import được;
  `search/common/public-doctor.sql.ts` có hằng `PUBLIC_DOCTOR_CONDITION` ("bác sĩ công khai": tài khoản `DangHoatDong`, chuyên khoa `DangHoatDong`, cặp chi nhánh–dịch vụ còn trong `chi_nhanh_dich_vu_kham`).
- `pricing/` dùng chung: `surcharge.calculator.ts` (`computeSurcharge`, `computeExamPrice`, `pickApplicableRule`) và `money.ts` (`addMoney`, `toCents`, cộng bằng BigInt) — **đã có**, dùng lại, không viết phép tính thứ hai.
- `admin` (Trung): `admin/entities/` có entity và migration cho `lich_hen` (cột sinh `khung_gio_dang_giu` UNIQUE, khoá ngoại kép), `khung_gio`, `lich_lam_viec`, `ho_so_nguoi_than`, `bac_si`, `le_tan`, `quan_tri_vien`, `phu_phi_bac_si`, `cau_hinh_he_thong`, `thong_bao`, `email_thong_bao`, `nhat_ky_hanh_dong`
  (27 entity trong `database/entities.ts`). `system-config/` (`SystemConfigService.getOrThrow()` ném 409 `HE_THONG_CHUA_CAU_HINH`, không cache). `rbac/` (`AdminScopeService`, `BranchAccessPolicy`, `@RequireAdminScope`, `@AdminScopeCtx`: **chỉ có phạm vi Quản trị viên, không có phạm vi Lễ tân**).
  `audit/` (`AuditService.record(manager, entry)`, buộc đang trong giao dịch; `AuditEntry` là union theo hành động: **chưa có `OverrideLichHen`** dù enum DB và entity có).
- **CHƯA có migration/entity** cho: `moc_hoan_tien` (**kể cả bảng này**, dù PLAN `admin` coi "Đặt cọc & Hoàn tiền" là việc của admin), `yeu_cau_nghi_phep`, `giao_dich_thanh_toan`, `lich_su_hoan_tien`, `giao_dich_vi`, `muc_cho_danh_sach_cho`, `ho_so_kham`, `nhac_lich_hen`, `danh_gia_bac_si`. `vi_noi_bo` đã có (auth P3).
  Chưa có mã `NotificationService` (PLAN `admin` Q9 dự định ở `apps/api/src/notification/`, chưa làm), chưa có `getPendingEffectiveChanges` (PLAN `admin` B10, chưa làm), chưa có mã sinh `lich_lam_viec`/`khung_gio`.
- `ScheduleModule.forRoot()` đã đăng ký **đúng một lần** ở `app.module.ts` (không gọi lần hai: mọi job sẽ chạy gấp đôi; test E2E-J02 canh). Job mẫu: `auth/register/unverified-patient-cleanup.job.ts` (quét theo lô, giao dịch riêng mỗi hàng, cờ `running`, tắt ở `NODE_ENV=test`).
- Dùng chung: `common/time` (`nowVN`, `todayVN`, `weekdayVN`, `toSecond`), `common/paging` (`PageQueryDto`: `page` ≥ 1, `pageSize` 20, tối đa 100; `Paged<T>`; `escapeLikePattern`), `database/mysql-errors.ts` (`isDuplicateKeyError` 1062, `isForeignKeyError`, `isDeadlockError` 1213, `isLockWaitTimeoutError` 1205).
- **Seed phát triển:** `config-dev` tạo dòng `cau_hinh_he_thong` demo (`thoiGianGiuCho` 15, `soLichHenToiDaMoiHoSo` 3, `checkInTruocPhut` 30, `checkInSauPhut` 15, `nguongNoShow` 3, `thoiDiemNhacLich` [72, 24, 2]; **toàn bộ là minh hoạ**, không phải quyết định);
  `catalog`: 3 nhóm × 1 dịch vụ (30 phút 200.000; 60 phút 500.000; 30 phút 150.000), **`muc_dat_coc` đều 0**, 4 chi nhánh, lịch T2–T7 08:00–12:00 + 13:00–17:00; `search-demo`: 9 tài khoản bác sĩ (một người `ChoKichHoat`). **Không có** `lich_lam_viec`, `khung_gio`, `moc_hoan_tien`, phụ phí, hồ sơ người thân.
- Test: `AdminFixtures` (`admin/testing/admin-fixtures.ts`: `branch`, `weeklySchedule`, `catalog`, `patient`, `doctor`, `receptionist`, `admin`, `shift`, `slot`, `appointment`), `database/testing/test-database.ts` (MySQL thật, DB `*_test`, tuần tự), `apps/api/test/*.e2e-spec.ts` qua `configureApp(app)`.

**Web (`apps/web/src/`):**
- `router/role-routes.tsx`: khung **Bệnh nhân** (`PatientLayout`), **Lễ tân** (`ReceptionLayout`), **Quản trị viên** (`AdminLayout`) là khung thật; khung **Bác sĩ vẫn là `RolePlaceholderPage`** (việc của `doctor`). Module khác chỉ thêm route cạnh `PATIENT_ROUTES`/`RECEPTION_ROUTES` và đặt `to` ở `router/role-nav.ts`.
  Mục menu hiện là nút vô hiệu: Bệnh nhân "Lịch hẹn của tôi", "Danh sách chờ"; Lễ tân "Quản lý lịch hẹn", "Yêu cầu đổi lịch", "Danh sách chờ", "Lịch làm việc bác sĩ". Menu Quản trị viên nằm ở **`features/admin/components/admin-sidebar.tsx`** (không ở `router/`): "Lịch hẹn" chưa có `to`.
- **Bước 1–3 của đặt lịch đã có trong khung công khai** (`router/routes.tsx`, `PublicLayout`, search F5): `/dat-lich` (nhóm dịch vụ), `/dat-lich/nhom/:groupId` (dịch vụ), `/dat-lich/nhom/:groupId/dich-vu/:serviceId` (danh sách bác sĩ, **chưa có khung giờ**: thẻ bác sĩ hiện câu `SCHEDULE_PLACEHOLDER`, tab "Lịch khám" của chi tiết bác sĩ là chỗ chừa).
  `BOOKING_PATH = '/dat-lich'` nằm ở `features/search/search-paths.ts`; nút "Đặt lịch khám" của thanh điều hướng trỏ về đó. Chưa có `features/booking/`.
- `shared/api/client.ts` (`request`, `DEFAULT_TIMEOUT_MS` 15 giây), `shared/ui` (`empty-state`, `error-state`, `loading-state`, `offline-banner`, `role-shell`), `usePageActive` của auth, `features/` không import chéo nhau.

## 3. Phân tích ảnh hưởng

### 3.1 Bảng/cột module này chạm tới (đọc từ `docs/database/`)

| Bảng | Cột / ràng buộc quan trọng | Module này làm gì |
|---|---|---|
| `lich_hen` | `ma_lich_hen` UNIQUE (varchar 20); `khung_gio_id` (không unique); **`khung_gio_dang_giu`** = cột sinh STORED UNIQUE, bằng `khung_gio_id` khi `trang_thai` ∈ {`ChoThanhToan`, `DaXacNhan`, `DaTiepDon`, `HoanThanh`, `VangMat`}, NULL khi `DaHuy`/`DaDoiLich`; khoá ngoại kép `(ho_so_nguoi_than_id, benh_nhan_id)`; `gia_snapshot`, `tien_coc_snapshot`, `chinh_sach_hoan_snapshot` (json), `han_thanh_toan`, `thoi_diem_huy`, `ly_do_huy` (varchar 255), `ly_do_kham` (text) | **Ghi** (tạo, đổi trạng thái); chỗ DUY NHẤT ghi `trang_thai` |
| `khung_gio` | `trang_thai` (`ConTrong`, `DaDat`, `DangGiuCho`, `HetHan`), `giu_cho_den`; UNIQUE `(lich_lam_viec_id, ngay_gio)`; chỉ mục `(trang_thai, giu_cho_den)` | **Ghi trạng thái** (giữ chỗ, đặt, giải phóng); không sinh, không xoá |
| `benh_nhan` | `so_lan_no_show` (int, mặc định 0), `khoa_dat_lich_do_no_show` (boolean, mặc định false; "QTV mở khoá thủ công nên là trạng thái độc lập") | **Khoá** `FOR UPDATE` (hợp đồng patient); **ghi** hai cột khi Vắng mặt; **đọc** cờ khoá khi đặt |
| `ho_so_nguoi_than` | `trang_thai_hieu_luc`; UNIQUE `(ho_so_nguoi_than_id, benh_nhan_id)` | Khoá + kiểm hiệu lực dưới khoá (`lockVisitProfile`) |
| `bac_si` | `chi_nhanh_id`, `dich_vu_kham_id`, `chuc_danh`, `so_nam_kinh_nghiem`, `chuyen_khoa_id` | **Khoá `FOR SHARE`** khi tạo lịch hẹn (PLAN `admin` 3.3 b: để đổi chi nhánh bác sĩ không lọt chạy đua); đọc để lấy chi nhánh, dịch vụ, tính giá |
| `lich_lam_viec` | `chi_nhanh_id` = chi nhánh **lúc phân công**, `ngay`, `ca` (`CaSang`, `CaChieu`, `CaToi`) | Đọc (ca của khung giờ; ca kết thúc lúc nào cho job Vắng mặt) |
| `chi_nhanh_lich_hoat_dong` | khoảng sáng/chiều theo thứ ISO 1–7; thứ chưa có dòng = chưa khai báo | Đọc: khung giờ phải nằm **trọn** trong khoảng của ca (quy tắc 29); giờ kết thúc ca |
| `chi_nhanh_dich_vu_kham`, `dich_vu_kham`, `chuyen_khoa`, `chi_nhanh`, `tai_khoan` | giá mặc định, `thoi_luong`, `muc_dat_coc`; tên; `trang_thai` | Đọc (giá, cọc, thời lượng, tên hiển thị, điều kiện bác sĩ khả dụng) |
| `phu_phi_bac_si` | quy tắc phụ phí | Đọc, qua `computeSurcharge` (không công thức riêng) |
| `moc_hoan_tien` | `(dich_vu_kham_id, so_gio_truoc_toi_thieu)` UNIQUE, `ty_le_hoan` 0–100 | Đọc lúc đặt để **chụp** vào `chinh_sach_hoan_snapshot` (**bảng chưa có migration**: Q15) |
| `cau_hinh_he_thong` | `thoi_gian_giu_cho`, `so_lich_hen_toi_da_moi_ho_so`, `nguong_no_show`, `check_in_truoc_phut`, `check_in_sau_phut` | Đọc qua `SystemConfigService`; không có dòng ⇒ `HE_THONG_CHUA_CAU_HINH` (quy tắc 35) |
| `le_tan`, `quan_tri_vien` | `chi_nhanh_id`, `pham_vi_quan_tri` | Đọc phạm vi chi nhánh của Lễ tân và Quản trị viên |
| `nhat_ky_hanh_dong` | `hanh_dong` = `OverrideLichHen`, `loai_doi_tuong` = `lich_hen` | **Ghi** khi Quản trị viên override (qua `AuditService`) |
| `thong_bao`, `email_thong_bao` | `thong_bao` **không có cột `lich_hen_id`**; `email_thong_bao` không có tiêu đề/nội dung | Ghi thông báo tối thiểu (Q29; lệch L8) |

**Chỉ để hiểu ranh giới (module khác sở hữu):** `giao_dich_thanh_toan` (khoản cọc; `lich_hen_id` trỏ **lịch gốc**), `lich_su_hoan_tien` (mỗi dòng một lần thử), `vi_noi_bo`, `giao_dich_vi`, `muc_cho_danh_sach_cho` (`khung_gio_dang_moi` UNIQUE),
`yeu_cau_nghi_phep`, `ho_so_kham`, `nhac_lich_hen`; enum `trang_thai_giao_dich_enum`, `loai_giao_dich_enum`.

### 3.2 Bảng ngoài danh sách prompt đã mở thêm (và lý do)

- `lich_lam_viec`, `chi_nhanh_lich_hoat_dong`: bắt buộc để **kiểm lại** khung giờ lúc giữ chỗ (A6) và tính giờ kết thúc ca cho job Vắng mặt.
- `benh_nhan` (ghi): cột `so_lan_no_show` và `khoa_dat_lich_do_no_show` đều **thuộc `benh_nhan`**, không phải `tai_khoan`; module này là chủ sở hữu việc **cộng và bật cờ** (prompt mục "RANH GIỚI" điểm 6). Việc mở khoá và điều chỉnh số lần là module sau.
- `bac_si` (khoá `FOR SHARE`): yêu cầu của PLAN `admin` mục 3.3 (b) ghi sang `booking`.

### 3.3 API/hành vi đã có hoặc đã chốt bị chạm tới

| Module / thành phần | Điểm chạm | Cách xử lý (không phá thiết kế đã chốt) |
|---|---|---|
| `auth` A4 — guard, `@Roles` | Mọi endpoint cần đăng nhập, theo vai trò | `@Roles('BenhNhan')` / `@Roles('LeTan')` / `@Roles('BacSi')` ghi **trên từng route**; Quản trị viên dùng `@Roles('QuanTriVien')` + `@RequireAdminScope('Any')`. Chủ sở hữu **chỉ lấy từ access token** (`@CurrentUser`), không nhận `benhNhanId` từ thân hay query |
| `auth` P5 — lỗi chuẩn | Mã lỗi ổn định cho từng nhánh | `AppException(409, 'KHUNG_GIO_DA_DAT', …)`; lỗi UNIQUE/FK/deadlock đã lường trước không bao giờ ra 500 (mục 5.14) |
| `auth` — `MailService`, `renderMailShell` | Email xác nhận đặt lịch, huỷ lịch, hạn chế do no-show | Mẫu mới dựng trên `renderMailShell`, đúng quy ước `CODING_CONVENTION` (mọi chữ qua `toSingleLine` rồi `escapeHtml`); test dùng `FakeMailService` |
| `patient` B5 — **hợp đồng khoá** | Mục 5.3 | **Xác nhận nguyên văn** hợp đồng (mục 5.3) và mở rộng sau hai khoá patient bằng `bac_si` `FOR SHARE` rồi `khung_gio` `FOR UPDATE`; không chen câu đọc thường nào phía trước. Báo Đại (cùng người) trước X3 của `patient` |
| `patient` — `appointments/` | Thư mục đã có 3 file | `booking` **tiếp quản**: giữ nguyên ba file và spec (không sửa hành vi; patient NT-17, NT-24 vẫn xanh), thêm file mới cạnh chúng; thêm `AppointmentsModule` |
| `patient` F1, F2 — khung Bệnh nhân, Lễ tân, `role-nav.ts` | Menu "Lịch hẹn của tôi", "Quản lý lịch hẹn" | Chỉ thêm `to` ở `router/role-nav.ts` và route ở `router/role-routes.tsx` (`[ĐỤNG router]`); không sửa file của `features/patient/` |
| `patient` — danh sách lịch hẹn đang chặn khi ngừng hồ sơ | Link "Lịch hẹn của tôi" chờ `booking` (`relative-errors.ts`) | Sau F1 của module này: nối link (sửa một dòng ở `features/patient/relatives/`, `[ĐỤNG patient]`, cùng người) |
| `search` F5 — luồng bước 1–3 | Trang `/dat-lich/**` đã dựng | **Không dựng lại.** Bước 4–6 nối tiếp (Q36 chọn khung chứa); điểm vào A1 nhận `{ khungGioId, … }` qua URL (mục 5.13). `BOOKING_PATH` cần chuyển vào `shared/` để `features/booking` dùng được (cấm import chéo `features/`): sửa một file nhỏ của search `[ĐỤNG search]` |
| `search` Q18 (03/11) ↔ prompt 08/11 | Ai sở hữu "khung giờ còn trống" | **Lệch:** search Q18 (nhóm đã đồng ý) giao cho `booking`; prompt 08/11 mặc định giao cho `doctor` (`apps/api/src/scheduling/`). PLAN này **theo 08/11**: Q7 xin xác nhận và cần ghi cập nhật vào `docs/features/search/TRACKING.md` mục 3 (task D1) |
| `search` K1 — payload khung giờ | PLAN search 5.6: `{ batDau, ketThuc, ca, trangThai }` **không có `khungGioId`** | `booking` cần `khungGioId` để giữ chỗ: đề xuất K1 trả thêm trường này (Q8; ghi vào mục 5.10) |
| `search` — `ExamPriceReader`, `PUBLIC_DOCTOR_CONDITION` | Cần giá khám và điều kiện bác sĩ khả dụng | Giá: dùng `computeExamPrice` của `pricing/`; đọc quy tắc phụ phí: chuyển `ExamPriceReader` sang `apps/api/src/pricing/` (đề xuất P3, `[ĐỤNG search]`) thay vì import chéo module. Điều kiện bác sĩ: tái dùng hằng SQL `PUBLIC_DOCTOR_CONDITION` (một định nghĩa, quy tắc 49c) |
| `admin` Q41 — migration nền | `booking` **không tạo lại** bảng nền | Tuân theo. **Ngoại lệ phải hỏi:** `moc_hoan_tien` chưa có (Q15) và cột `thong_bao.lich_hen_id` (Q29) cần migration mới do admin/notification sở hữu |
| `admin` Q6, Q48, B10 — `getPendingEffectiveChanges(chiNhanhId)` | **`booking` chặn ĐẶT và ĐỔI lịch** vào vùng giờ sẽ bị loại bởi yêu cầu thay đổi chi nhánh đã duyệt chưa áp dụng (kể cả quá hạn) | Cổng `PendingBranchChangesPort` (mục 5.10); gọi trong bước giữ chỗ; `[CHỜ admin B10]`, mặc định rỗng có test cho tới khi B10 có |
| `admin` — chi nhánh công tác của bác sĩ | Đổi chi nhánh bác sĩ khoá `bac_si` `FOR UPDATE` | Booking khoá `FOR SHARE` cùng giao dịch tạo lịch (mục 5.3) |
| `admin` — `lich-hen.entity.ts` (cột sinh viết cứng danh sách trạng thái) và `service.repository.ts` (viết cứng tập "đang hoạt động") | Trung đã dặn: **không đổi entity theo hằng mới**; Trung tự chuyển `service.repository.ts` | Không đụng cả hai. Tập trạng thái của cột sinh (`ChoThanhToan, DaXacNhan, DaTiepDon, HoanThanh, VangMat`) khác `ACTIVE_APPOINTMENT_STATES` **có chủ đích** (mục 5.2) |
| `rbac` — phạm vi | Quản trị viên Chi nhánh chỉ thấy lịch hẹn ở chi nhánh mình (`lich_hen.chi_nhanh_id`, snapshot); ngoài phạm vi ⇒ **404** (admin Q40, đã đổi ở 4.2a) | Dùng `AdminScopeCtx` + `BranchAccessPolicy.branchFilter/assertCanSee`. **Chưa có phạm vi Lễ tân**: thêm một bộ phân giải nhỏ cạnh `rbac/` (`ReceptionScopeService`, đọc `le_tan.chi_nhanh_id` mỗi request) — `[ĐỤNG rbac]` (Q34) |
| `audit` | Override cần `OverrideLichHen` | Mở rộng `AuditEntry` thêm hành động này (`[ĐỤNG audit]`, Trung); ghi **cùng giao dịch** đổi trạng thái; không ghi lý do/tên bệnh nhân vào log ứng dụng |
| `doctor` (song song) | Sinh khung giờ, "khung giờ còn trống", duyệt nghỉ phép, khung Bác sĩ, "Xác nhận hoàn thành ca khám" | Mục 5.10 (bảng hợp đồng hai chiều) |
| `payment`, `wallet`, `waitlist`, `notification` (chưa có) | Giao dịch cọc, hoàn tiền, mời chờ, thông báo | Cổng + bản giả có test (mục 5.10); task gắn `[CHỜ …]` |
| `router/*` (dùng chung) | Thêm route và `to` | Ghi rõ từng chỗ sửa ở từng task F; `git pull` trước; báo Trung nếu `role-routes.tsx` đổi (Trung cũng sửa cho `doctor`) |

### 3.4 Chỗ 2.4, schema và Figma lệch hoặc mơ hồ — **nêu rõ, chưa chọn bên nào** (đề xuất ở cột "Hỏi")

| # | Lệch / mơ hồ | Ghi chú | Hỏi |
|---|---|---|---|
| L1 | **ĐLK: lúc nào giữ chỗ?** MT: "Việc chọn khung giờ chỉ lưu lựa chọn, chưa giữ chỗ… chỉ giữ chỗ khi Bệnh nhân bắt đầu thanh toán cọc"; b8: "chưa giữ chỗ và chưa bắt đầu đếm thời gian" **rồi** "…chuyển khung giờ sang Đang giữ chỗ"; b14: tạo lịch hẹn "(khung giờ **vẫn** Đang giữ chỗ)"; A5 "8-12a": hết thời gian giữ chỗ **trong** các bước 8–12; A1/1-8b: "chuyển trang không giữ chỗ", "kiểm tra lại trước khi xác nhận". HĐK thành công: lịch luôn tạo `ChoThanhToan`, khung giờ `DangGiuCho` | Câu b8 tự mâu thuẫn (giống một câu cũ và một câu mới bị ghép). Nếu giữ chỗ từ b8 thì người điền form (b9–b10) cũng chiếm chỗ 15 phút và A5 8-12 có nghĩa; nếu giữ lúc xác nhận thì A5 8-12 không có gì để giải phóng | Q1 |
| L2 | TCLS b2: bộ lọc trạng thái liệt kê **6** trạng thái (Chờ thanh toán, Đã xác nhận, Đã tiếp đón, Hoàn thành, Đã hủy, Vắng mặt) ↔ `trang_thai_lich_hen_enum` có **7** (thêm `DaDoiLich`) | Lịch đã đổi nằm ở đâu trong "Sắp tới/Lịch sử" | Q31 |
| L3 | ~~HLH: HĐK thành công và b3 kết thúc bằng "(vd:" (bản dán bị cắt)~~ **Đã giải quyết (08/11/2026):** hai đoạn nằm trong một khung nội dung (content control) của Word nên công cụ đọc bỏ sót, không phải do dán; đã đọc lại từ XML của 2.4. HĐK thành công: "số tiền hoàn về ví theo % tương ứng thời điểm hủy so với giờ khám (vd: ≥24 giờ: 100%; 2–24 giờ: 50%; <2 giờ: 0%)"; b3: "Hệ thống tính số tiền hoàn cọc dự kiến theo mốc thời gian còn lại tới giờ khám (vd: ≥24 giờ: 100%; 2–24 giờ: 50%; <2 giờ: 0%) và hiển thị cho Bệnh nhân xác nhận trước khi hủy." Chỉ hai đoạn này bị cắt trong toàn bộ 2.4 | Khớp cách tính ở Q16 (đúng 24 giờ được 100%, đúng 2 giờ được 50%); "(3 )" ở ĐLK A3/11a là **nguyên văn** 2.4, không phải bị cắt | Q44 (đã giải quyết) |
| L4 | Chủ sở hữu "khung giờ còn trống": PLAN `search` Q18 (nhóm đồng ý 03/11) = `booking`; prompt 08/11 = `doctor` | Ba nơi dùng (search, doctor, booking) | Q7 |
| L5 | ĐLK A3/11a: "…vượt số lịch hẹn đang hoạt động tối đa của riêng hồ sơ **(3 )**" ↔ DB: `so_lich_hen_toi_da_moi_ho_so` `[cần điền]`, theo cấu hình QTV | Seed demo 3 chỉ là minh hoạ | Q12 |
| L6 | HLH: hoàn theo bậc `moc_hoan_tien` (của admin) ↔ **bảng chưa có migration và entity**; menu "Đặt cọc & Hoàn tiền" của Admin còn là nút vô hiệu | Không chụp được `chinh_sach_hoan_snapshot` khi dịch vụ có cọc | Q15 |
| L7 | ĐLK b15: "tự động ghi nhận giao dịch thanh toán **0đ Thành công**" ↔ `giao_dich_thanh_toan`: `phuong_thuc` NOT NULL (`Vi`, `VNPay`, `MoMo`, `TienMatTaiQuay`), không có giá trị cho 0đ; `TienMatTaiQuay` có `chk` `so_tien > 0`; không rõ có ghi `giao_dich_vi` không | Bảng và quyết định thuộc `payment` | Q19 |
| L8 | Thông báo: `thong_bao` chỉ có khoá tham chiếu `yeu_cau_thay_doi_chi_nhanh_id` (**không có `lich_hen_id`**), `noi_dung` ≤ 500 ký tự; `email_thong_bao` **không có tiêu đề/nội dung** ↔ Figma "Email Preview" có thư giàu dữ liệu (mã, bác sĩ, giờ, chi nhánh…) | Worker gửi chỉ dựng được thư từ `noi_dung`; không chống trùng được theo lịch hẹn | Q29 |
| L9 | Audit: enum DB và entity có `OverrideLichHen` ↔ `AuditEntry` (`audit/audit-entry.ts`) chưa có | Không cần hỏi, task B14 làm | — |
| L10 | CNTT: QTV "hiển thị đầy đủ các trạng thái có thể (kể cả ngoài luồng chuẩn)" ↔ TĐK "không ở Hoàn thành" ↔ A1 "chọn Hoàn thành thì từ chối" (không phân biệt vai trò) | Ma trận override và khôi phục từ `DaHuy` (cần giữ lại khung giờ) | Q24 |
| L11 | CNTT TĐK: cửa sổ tiếp đón "từ số phút trước … đến số phút sau giờ hẹn" `[cần điền]`/`[đề xuất]` (quy tắc 40); b2: Vắng mặt "nếu đã **quá giờ hẹn** mà chưa tiếp đón" — quá giờ hẹn = sau `thoi_gian` hay sau hết cửa sổ? | Hai điều kiện có thể chồng hoặc hở nhau | Q22 |
| L12 | CNTT: Đã tiếp đón chỉ khi "đã đóng đủ 100%" ↔ `lich_hen` **không có cột trạng thái thanh toán**, phải tính từ `giao_dich_thanh_toan` (chưa có); dịch vụ cọc 0đ thì trước quầy luôn còn phải thu 100% | Hệ quả: cho tới khi `payment` có, check-in chỉ chạy được qua cổng giả | Q20 |
| L13 | CNTT b7: tự Vắng mặt khi "ca làm việc chứa giờ hẹn đã kết thúc" ↔ `lich_lam_viec` **không có cột giờ ca**; giờ ca = khoảng nhận khám của chi nhánh vào thứ đó `[đề xuất]` (quy tắc 39) | Dùng `chi_nhanh_lich_hoat_dong` hiện hành; đúng vì admin Q48 không áp dụng thay đổi khi còn ca bị ảnh hưởng | Q23 |
| L14 | XDS b2: lọc theo **chuyên khoa** ↔ `lich_hen` **không lưu chuyên khoa** (snapshot chỉ có chi nhánh, dịch vụ, bác sĩ) | Lọc qua `bac_si.chuyen_khoa_id` **hiện tại**: bác sĩ đổi chuyên khoa thì lịch cũ chuyển theo | Q32 |
| L15 | HLH nêu hoàn cọc cho **Bệnh nhân huỷ**; CNTT cho Lễ tân/QTV chuyển "Đã hủy" và hệ thống huỷ khi duyệt nghỉ phép: **không nói** có hoàn cọc, hoàn theo bậc nào | | Q17 |
| L16 | Prompt nói Figma có "Lễ tân - Đặt lịch khám - Bước 1…5"; 2.4 chỉ có Bệnh nhân là tác nhân ĐLK (đặt hộ tại quầy đã bỏ 23/09) | **Đã tìm ở Figma (08/11): không có frame nào tên đó** (tìm theo tên ở mọi cấp). Dấu vết còn lại: cột/nhãn **`Kênh` = `Tại quầy`** và nút `Thu tiền` trong danh sách Lễ tân (`479:2`) | Q37 |
| L17 | TCLS b6, HĐK: chi tiết "kèm trạng thái đặt cọc/thanh toán/hoàn tiền" ↔ các bảng đó chưa có | Trả `thanhToan: null`, `hoanTien: null` tới khi `payment`/`wallet` có | Q20 |
| L18 | **Mã lịch hẹn có BA định dạng trong Figma:** `CX20261018581` (Bước 5 Thanh toán, Bước 6), `CP20261018001` (mọi màn Lịch hẹn của tôi, Lễ tân, Admin, Bác sĩ; chú thích "mã của dữ liệu mẫu"), `CLX-20261015-0042` (email `573:2`); 2.4 chỉ nói "sinh mã lịch hẹn"; DB `varchar(20)` UNIQUE | Không có quy tắc sinh mã ở đâu trong repo | Q13 |
| L19 | ĐLK b10: "nhập lý do khám" ↔ Figma Bước 4 (`449:2`): **"Lý do khám (không bắt buộc)"** | Cột `ly_do_kham` là `text` NULL được | Q9 |
| L20 | HLH TĐK: huỷ được khi `ChoThanhToan` **hoặc** `DaXacNhan` ↔ Figma: nút `Hủy lịch hẹn` **chỉ có ở "Đã xác nhận"** (`420:2`, `421:2`); chi tiết "Chờ thanh toán" (`426:2`) không có nút huỷ | Chỉ ảnh hưởng giao diện; backend theo 2.4 | Q45 |
| L21 | CNTT: Lễ tân huỷ khi nào? Figma `495:2` ("Đã tiếp đón") có nút `Hủy lịch` ↔ HLH A1: lịch "Đã tiếp đón" **không** huỷ được; CNTT b2 chỉ nói "Đã hủy" mà không loại trạng thái nguồn | Hai cách hiểu: Lễ tân huỷ cả lịch đã tiếp đón, hay chỉ QTV override | Q21 |
| L22 | Figma có `Kênh` (`Online`/`Tại quầy`) ở danh sách Lễ tân/Admin và `Kênh đặt` (`Đặt trực tuyến`) ở chi tiết ↔ **`lich_hen` không có cột kênh**; "Tại quầy" thuộc use case đã bỏ | Hiển thị hằng "Online"/bỏ cột | Q37 |
| L23 | TCLS: 2.4 mặc định nhóm **Sắp tới / Lịch sử** + lọc trạng thái ↔ Figma `411:2`: **một bảng "Tất cả"** (`Hiển thị 11 / 11`), thẻ lọc trạng thái **kèm số đếm**, ô tìm, lọc người khám, bác sĩ, chuyên khoa, khoảng ngày; **không** có Sắp tới/Lịch sử, **không** phân trang | API phải có số đếm theo trạng thái và `q` | Q31, Q35 |
| L24 | XDS b2 liệt kê 5 bộ lọc ↔ Figma Lễ tân `479:2`: ô tìm, chip ngày (Hôm nay mặc định, Ngày mai, Tuần này, Khoảng ngày), chuyên khoa, bác sĩ, trạng thái, **không có chi nhánh**; Admin `511:2`: thêm **`Loại dịch vụ`** và cột/lọc **`Thanh toán`** (`Chưa thanh toán`/`Đã đặt cọc`/`Đã thanh toán đủ`) | `Thanh toán` suy ra từ bảng chưa có | Q32 |
| L25 | XDSPC: Figma Bác sĩ `457:2`/`458:2` hiện **SĐT, email, giá khám** của người khám; chip `Đã check-in`/`Đã hoàn thành` (nhãn khác trạng thái); danh sách có cả hàng `Chờ thanh toán`/`Đã hủy` nhưng chip không có `Chờ thanh toán`; lọc `Ca khám`, sắp `Mới nhất trước` | Quyền riêng tư (H10) | Q33 |
| L26 | Admin chi tiết `512:2` có panel **"Lịch sử trạng thái"** ↔ không có bảng lịch sử đổi trạng thái lịch hẹn (chỉ `nhat_ky_hanh_dong` khi QTV override; Lễ tân không ghi) | Chỉ dựng được từ `thoi_diem_tao`, `thoi_diem_huy`, `ly_do_huy` và audit override | Q28 |
| L27 | Email `573:2` hiện `Giá dịch vụ` **và** `Phụ phí bác sĩ chuyên gia` riêng ↔ `lich_hen` chỉ lưu `gia_snapshot` (tổng) | Tính lại từ giá hiện hành sẽ sai nếu giá/quy tắc đã đổi | Q46 |
| L28 | Figma Bước 3, 5, 6 không có dòng phụ phí (`Tổng giá khám` = giá dịch vụ) và Bước 5 không có chính sách huỷ/hoàn; Bước 2 báo "phụ phí … sẽ được cộng thêm" ↔ ĐLK b12: "giá áp dụng, chính sách đặt cọc nếu có" | Giá áp dụng của backend **có** phụ phí | Q46 |
| L29 | Figma `553:2`: chính sách hoàn **mặc định toàn hệ thống** (≥ 24 giờ 100%, ≥ 2 giờ 50%, ≥ 0 giờ 0%) + chính sách riêng theo dịch vụ ↔ `moc_hoan_tien` **chỉ theo `dich_vu_kham_id`**, không có bảng mặc định | Booking chỉ đọc hàng theo dịch vụ | Q15 |
| L30 | Figma Bước 5 Thanh toán (`452:2`): hai lựa chọn **"Thanh toán cọc" / "Thanh toán toàn bộ"** và `Số dư ví hiện tại` | Thuộc `payment`/`wallet`; ảnh hưởng `confirmPaid` và "còn phải thu" | Q20 |
| L31 | Figma ghi "Cọc … `Không cần cọc`" (Nội tổng quát) nhưng **không có frame** Bước 5/6 cho dịch vụ không cọc; nút luôn là "Xác nhận và thanh toán cọc" | Cọc 0đ xác nhận ngay (b15) | mục 4.5 |
| L32 | Email: chân thư có `[cần điền]` (hotline, email, địa chỉ) | Lấy từ `thong_tin_phong_kham` (`duong_day_nong`, `email`, `dia_chi_tru_so`); thiếu thì bỏ dòng | Q30 |
| L33 | Hộp huỷ của Bệnh nhân (`421:2`, `410:2`) **không có ô lý do**; hộp huỷ của Lễ tân (`490:2`) có **"Lý do hủy *" bắt buộc**; hộp "Vắng mặt" (`489:2`) không có lý do và không hiện số lần vắng/ngưỡng | | Q27 |

Không lệch (đã đối chiếu): khung giờ nối liền theo `thoi_luong`, phần dư cuối khoảng bỏ (b8 ↔ ghi chú `khung_gio`, quy tắc 29, 39); không giới hạn số ngày đặt trước (b11 ↔ quy tắc 38);
tập "đang hoạt động" = `ChoThanhToan`, `DaXacNhan`, `DaTiepDon` (b11 ↔ quy tắc 37, hằng `ACTIVE_APPOINTMENT_STATES`, patient Q12); Vắng mặt **không** giải phóng khung giờ (CNTT b8 ↔ cột sinh `khung_gio_dang_giu` vẫn giữ `VangMat`, khung giờ vẫn `DaDat`);
hồ sơ người thân phải cùng chủ (khoá ngoại kép); chi nhánh của lịch hẹn lấy theo chi nhánh công tác hiện tại của bác sĩ (b8 ↔ `lich_hen.chi_nhanh_id` snapshot); `ho_so_nguoi_than` đã ngừng thì từ chối đặt (quy tắc 52).

### 3.5 Bẫy/rủi ro (xử lý trong task)

- **H1 — Đặt trùng khung giờ (hai Bệnh nhân giữ cùng lúc).** Ba lớp: (1) khoá hàng `khung_gio` `FOR UPDATE` rồi kiểm trạng thái; (2) UNIQUE `khung_gio_dang_giu` là lưới an toàn cuối: lỗi 1062 ⇒ `KHUNG_GIO_DA_DAT`, không bao giờ 500; (3) test hai/mười yêu cầu đồng thời (DT-01, DT-02).
- **H2 — Deadlock giữa các luồng.** Một thứ tự khoá toàn cục cho mọi luồng ghi (mục 5.3); đọc thường để lấy `khung_gio_id`, `benh_nhan_id` **trước khi** khoá, rồi kiểm lại dưới khoá; thử lại tối đa 2 lần khi gặp 1213/1205 (bài học auth A5, A8); test nhiều luồng chéo nhau (DT-10…DT-14), đếm 1213/1205 bằng 0 trong kết quả cuối.
- **H3 — Hết hạn giữ chỗ đúng lúc thanh toán thành công.** Hai bên cùng khoá `lich_hen` rồi **kiểm lại trạng thái dưới khoá**; ai khoá trước thắng; bên thua nhận kết quả có kiểu (không ném trong giao dịch). Quy tắc thanh toán trễ ở Q4 (DT-03, DT-04).
- **H4 — Huỷ, tiếp đón, tự Vắng mặt, hết hạn chạy gần như đồng thời.** Mọi chuyển trạng thái đi qua `AppointmentTransitionService`, khoá `lich_hen` rồi kiểm lại điều kiện + trạng thái nguồn dưới khoá (CNTT A3); kết quả duy nhất, không ghi chồng (DT-05…DT-08).
- **H5 — Duyệt nghỉ phép cùng lúc đặt lịch.** Điểm đồng bộ là hàng `bac_si`: đặt lịch khoá `FOR SHARE` và **kiểm lại nghỉ phép dưới khoá**; duyệt nghỉ (module `doctor`) khoá `FOR UPDATE` trước khi đổi trạng thái yêu cầu. Hệ quả: hoặc lịch vừa tạo bị duyệt nghỉ thấy và huỷ, hoặc đặt lịch thấy nghỉ đã duyệt và từ chối (DT-09; hợp đồng ở 5.10).
- **H6 — Đổi chi nhánh bác sĩ / thay đổi lịch chi nhánh đã duyệt chưa áp dụng.** Khoá `bac_si` `FOR SHARE`; `PendingBranchChangesPort` chặn vùng bị loại (Q6, Q48 của admin). Đang chờ admin B10 thì cổng rỗng **có test** và có cảnh báo trong TRACKING.
- **H7 — Ghi `lich_hen.trang_thai` rải rác.** Nếu `doctor`, `payment`, `waitlist` tự `UPDATE lich_hen` thì ma trận và khoá bị bỏ qua. Quy tắc: **chỉ** `AppointmentTransitionService` ghi cột này (và `khung_gio.trang_thai`); test kiến trúc quét `src/` tìm `UPDATE lich_hen`/`UPDATE khung_gio` ngoài `appointments/` (AR-01).
- **H8 — Đồng hồ.** Mọi mốc từ `nowVN()` rồi `toSecond()`; truyền `:now` vào SQL, **không dùng `NOW()`** (test dùng đồng hồ giả; `DATETIME` làm tròn giây). Quy tắc nửa mở: đúng mốc hết hạn là hết (`han_thanh_toan <= now`).
- **H9 — Job chạy đôi / chạy chồng.** Không gọi `ScheduleModule.forRoot()`; cờ `running`; quét theo lô có trần; giao dịch riêng mỗi lịch hẹn; hai bản API cùng chạy vẫn đúng nhờ kiểm lại dưới khoá (như A7); tắt ở `NODE_ENV=test`, test gọi `run()` trực tiếp.
- **H10 — Lộ dữ liệu.** Danh sách cho Lễ tân/QTV/Bác sĩ trả đúng danh sách trắng trường (không `SELECT *`); lịch hẹn của người khác **và** ngoài phạm vi trả **404 cùng thân**; Bệnh nhân chỉ thấy lịch có `benh_nhan_id` = mình; `Cache-Control: no-store`; không đưa `ly_do_kham`, tên, SĐT vào log; không ghi nhật ký khi đọc (Q28).
- **H11 — Tiền.** `decimal` đọc ra là chuỗi; cộng/nhân tỷ lệ bằng BigInt đơn vị 0,01 (`toCents`); không `number` dấu phẩy động; quy tắc làm tròn tiền hoàn ở Q16.
- **H12 — Thông báo/email lỗi không được phá nghiệp vụ.** Ghi `thong_bao` cùng giao dịch (nếu chọn Q29-A) hoặc gửi sau commit; lỗi gửi chỉ ghi nhật ký loại lỗi, không hoàn tác lịch hẹn, không log địa chỉ/nội dung.
- **H13 — Kiểu dữ liệu qua SQL thô.** Id `BIGINT` giữ dạng chuỗi; cột `DATE` qua SQL thô phải `DATE_FORMAT` (bài học patient B6); `DATETIME` ra `Date` nhờ `DB_TIMEZONE` rồi `toISOString()` (như `findActiveAppointments`); JSON snapshot đọc ra object hay chuỗi **chưa đo** (M7).
- **H14 — Hồ sơ người thân ngừng giữa lúc đặt.** Khoá `ho_so_nguoi_than` trước khi kiểm hiệu lực (hợp đồng patient 5.3): hoặc đặt xong rồi ngừng bị 409, hoặc ngừng xong rồi đặt bị `HO_SO_NGUOI_THAN_DA_NGUNG` (KT-01, KT-02).
- **H15 — Cấu hình thiếu.** Không có dòng `cau_hinh_he_thong` ⇒ `HE_THONG_CHUA_CAU_HINH` (409) cho đặt lịch và tiếp đón; không bao giờ dùng số cứng 15, 3, 30 trong mã (quy tắc 35).
- **H16 — Thanh toán xong nhưng lịch không xác nhận được.** `payment` phải gọi `confirmPaid` **trong giao dịch của nó** (cùng giao dịch ghi giao dịch thanh toán `ThanhCong`); không có khe "đã trả tiền, lịch vẫn Chờ thanh toán" (mục 5.10, Q20).
- **H17 — Trùng mã lịch hẹn.** Mã sinh ngẫu nhiên chống đoán; UNIQUE bắt va chạm (1062 đúng tên khoá `ma_lich_hen`) ⇒ sinh lại, tối đa 5 lần (Q13). Collation `utf8mb4_unicode_ci` không phân biệt hoa/thường: tra cứu chuẩn hoá chữ hoa.
- **H18 — `jscpd` quét cả `*.int-spec.ts`, `*.e2e-spec.ts`:** hạ tầng test dùng chung (tạo khung giờ đặt được, tài khoản, hồ sơ) đặt ở `appointments/testing/`, không chép giữa các file test.

## 4. Câu hỏi và quyết định

### 4.1 Đã chốt ở module khác (kế thừa — **không bàn lại**)

- **auth** (`docs/features/auth/TRACKING.md` mục 3): TypeORM, migration viết tay đối chiếu schema; Gmail SMTP qua `MailService`; web và API cùng origin (`/api`); access JWT 15 phút trong bộ nhớ; mã lỗi ổn định, không 500 cho lỗi UNIQUE/FK/deadlock đã lường trước; khoá hàng theo thứ tự cố định, thử lại 1205/1213, test nhiều tài khoản đồng thời, đồng hồ giả.
- **patient** (`docs/features/patient/PLAN.md`): Q12 tập "đang hoạt động" = `ChoThanhToan`, `DaXacNhan`, `DaTiepDon` (một hằng); Q13 hợp đồng khoá (mục 5.3); Q10 ngừng hồ sơ idempotent; Q21 khung Bệnh nhân/Lễ tân nhận **cấu hình menu từ lớp `router/`**; Q27 hồ sơ của người khác trả 404 cùng thân; không lộ `lich_hen_id` ra API của patient.
- **admin** (`docs/features/admin/PLAN.md`, TRACKING mục 3): Q6/Q48 **`booking` chặn đặt và đổi lịch** vào vùng bị loại bởi yêu cầu thay đổi chi nhánh đã duyệt chưa áp dụng; Q40 (4.2a) tài nguyên ngoài phạm vi ⇒ **404**; Q41 admin sở hữu migration các bảng nền; Q15 không bật/tắt dịch vụ ("ngừng cung cấp" = bỏ khỏi `chi_nhanh_dich_vu_kham`);
  Q21 phép tính giá (`computeSurcharge`); Q39 audit tối thiểu; Q9 thông báo/email tối thiểu ở `apps/api/src/notification/`, worker nhận việc bằng `UPDATE` có điều kiện, thử lại 3 lần cách 5 phút; Q31 mở khoá no-show giữ nguyên `so_lan_no_show`; Q42 phân trang offset `common/paging`.
- **search**: Q13 điều kiện "bác sĩ công khai"; Q15 giá khám áp dụng; bước 1–3 của đặt lịch dựng ở `search` (F5); PLAN 5.6 hợp đồng chuyển sang đặt lịch `{ chiNhanhId, dichVuKhamId, bacSiId, ngayGio }`.
- **Quy tắc DB** (`clinix_quy_tac_nghiep_vu.md`): 29 (kiểm khung giờ trong khoảng nhận khám, mã `ChuaKhaiBao`/`NgayNghi`/`CaKhongTonTai`/`NgoaiGioHoatDong`), 35 (thiếu cấu hình thì từ chối), 37 (đếm và tạo trong một giao dịch, khoá `benh_nhan`), 38 (không giới hạn số ngày đặt trước), 39 (thời lượng khung giờ), 40 (cửa sổ tiếp đón `[đề xuất]`), 45–47 (thu tiền mặt và tiếp đón), 52 (ngừng hồ sơ).
- **Nhóm chốt 25/10/2026** (2.4 CNTT b8): tự Vắng mặt **không** giải phóng khung giờ và **không** mời danh sách chờ.
- **Phân ranh `doctor`/`booking`** (prompt cập nhật 08/11/2026, mặc định, chờ đối chiếu): `doctor` sở hữu sinh khung giờ và "khung giờ còn trống"; `booking` sở hữu chuyển trạng thái khung giờ, tạo/huỷ lịch hẹn và **một dịch vụ huỷ dùng chung**; duyệt nghỉ phép (đổi trạng thái yêu cầu, chặn khung giờ) do `doctor` làm trước, phần tự huỷ/hoàn cọc/thông báo chờ các module kia.

### 4.2 Câu hỏi gộp và đề xuất (**đã được nhóm trả lời ngày 08/11/2026 — đồng ý 38 câu nguyên văn, 8 câu kèm điều kiện; quyết định cuối ở [`TRACKING.md`](TRACKING.md) mục 3 và ghi chú "Đã trả lời" cuối từng câu có điều kiện**)

Cột "Chặn" ghi task bị chặn nếu chưa chốt. Câu có ★ nên chốt trước khi bắt đầu cụm 2.

**A. Giữ chỗ và khung giờ**

| Q | Câu hỏi | Đề xuất và lý do | Chặn |
|---|---|---|---|
| Q1★ | Giữ chỗ lúc nào (L1)? | **Giữ chỗ lúc Bệnh nhân bấm Xác nhận (b13–b14), trong cùng MỘT giao dịch với việc tạo lịch hẹn.** b8 và b11 chỉ **kiểm không khoá** (để A2, A3, A6 báo sớm; b12 hiện tóm tắt). Khớp MT ("chỉ lưu lựa chọn") và A1/1-8b ("kiểm tra lại trước khi xác nhận"); người đang điền form không chiếm chỗ; không cần bảng "giữ chỗ chưa có lịch". Khi đó A5 8-12 chỉ có nghĩa sau b14 (hết 15 phút chưa thanh toán). Phương án khác: giữ từ b8 (cần giữ chỗ không gắn lịch hẹn, thêm endpoint giữ và đếm giờ riêng, lịch hẹn tạo sau) | B6, B8, F3–F5 |
| Q2★ | Hạn giữ chỗ và `han_thanh_toan`? | Hạn = `cau_hinh_he_thong.thoi_gian_giu_cho` phút (seed demo 15, **không có số cứng trong mã**), tính từ lúc tạo lịch hẹn; `lich_hen.han_thanh_toan` = `khung_gio.giu_cho_den` = `toSecond(now) + n phút`, nửa mở (đúng mốc là hết). Cọc 0đ: xác nhận ngay trong cùng giao dịch, đặt `han_thanh_toan` = NULL khi `DaXacNhan` | B8 |
| Q3 | `HetHan` của khung giờ? | `booking` **không ghi** `HetHan`: chỉ ghi `ConTrong` ↔ `DangGiuCho` ↔ `DaDat`. "Hết hạn" = khung giờ đã qua giờ, **suy ra khi đọc** (`ngay_gio <= now`, như `search` KGI-02); `DangGiuCho` có `giu_cho_den <= now` đọc ra là `ConTrong` (hết hạn mà job chưa quét kịp). Giá trị `HetHan` của enum để dành | B6, D2 |
| Q4★ | Thanh toán thành công **sau** hạn giữ chỗ? | Hết hạn và xác nhận thanh toán cùng khoá hàng `lich_hen`, ai khoá trước thắng. `confirmPaid` **không tự kiểm đồng hồ**: lịch còn `ChoThanhToan` (job chưa quét, khung giờ chưa bị giữ lại) thì **vẫn xác nhận**; lịch đã `DaHuy` vì hết hạn thì trả `{ kind: 'HetHanGiuCho' }` và `payment` hoàn **toàn bộ** vào ví. Lý do: người đã trả tiền không mất chỗ chỉ vì job quét chậm; duy nhất vẫn do khoá + UNIQUE giữ. Phương án khác: từ chối cứng từ đúng mốc `han_thanh_toan` | B11 `[CHỜ payment]` |
| Q5 | "Ngày khám không ở quá khứ" là gì (b11, A3/11a)? | Giờ **bắt đầu** của khung giờ `> now` (giờ VN, nửa mở); không đệm tối thiểu trước giờ hẹn (2.4 không nêu). Lỗi `KHUNG_GIO_DA_QUA` | B6, B7 |
| Q6 | Lịch hết hạn giữ chỗ ghi gì, có thông báo không? | `DaHuy`, `ly_do_huy` = "Hết thời gian giữ chỗ" (hằng), khung giờ về `ConTrong`; **không** gửi thông báo/email (Bệnh nhân tự bỏ dở, A5 không nêu thông báo). Lịch nằm ở "Lịch sử" với nhãn Đã hủy | B9 |
| Q7★ | Ai sở hữu "khung giờ còn trống" (L4)? | **`doctor`** (prompt 08/11): MỘT hàm đọc và MỘT bộ luật "khung giờ nằm trọn trong khoảng nhận khám của ca" ở `apps/api/src/scheduling/`; `booking` và `search` chỉ GỌI; `booking` vẫn **kiểm lại dưới khoá** bằng đúng bộ luật đó (mục 5.10). Cập nhật ghi chú ở `docs/features/search/TRACKING.md` (Q18 đã đổi chủ). Phương án cũ: `booking` sở hữu. **Đã trả lời (08/11/2026): đồng ý, kèm điều kiện: Đại đồng ý, Trung chưa xác nhận; PLAN `search` Q18 (nhóm đã đồng ý 03/11 giao cho `booking`) phải được Trung sửa; đối chiếu khi có PLAN `doctor`** | B6, D1 `[CHỜ Trung]` |
| Q8★ | Mã khung giờ ở bước chuyển sang đặt lịch? | `search` K1 trả thêm **`khungGioId`** (chuỗi) cho mỗi khung giờ; API đặt lịch nhận `khungGioId`, `hoSoNguoiThanId`, `lyDoKham`; bác sĩ, dịch vụ, chi nhánh **suy ra từ khung giờ**, không tin trường nào từ client. URL điểm vào mang `khungGioId`. PLAN `search` 5.6 hiện chưa có trường này | B8, F3, `search` K1 |

**B. Điều kiện đặt lịch**

| Q | Câu hỏi | Đề xuất và lý do | Chặn |
|---|---|---|---|
| Q9 | "Lý do khám" (b10): bắt buộc? dài bao nhiêu? | **Không bắt buộc** (Figma `449:2` ghi "không bắt buộc"; cột `ly_do_kham` NULL được; sửa 2.4 b10 theo Figma, D2). Có nhập thì sau chuẩn hoá NFC và cắt khoảng trắng ASCII đầu/cuối dài 1–500 điểm mã, không ký tự điều khiển (cho phép xuống dòng); rỗng ⇒ `NULL`. 500 là quy tắc service `[đề xuất]` (Figma không có bộ đếm ký tự). Mã `LY_DO_KHAM_KHONG_HOP_LE` | B7, B8, F4 |
| Q10★ | "Trùng/chồng lấn lịch khác" (A3/11a) nghĩa là gì? | Cùng **hồ sơ đi khám** `(benh_nhan_id, ho_so_nguoi_than_id)` (so sánh `<=>`) đã có lịch **đang hoạt động** mà `[thoi_gian, thoi_gian + thoi_luong)` giao nhau với khung giờ mới (chạm đầu mút không tính). Hai hồ sơ khác nhau của cùng tài khoản đặt cùng giờ được. `chiTiet` chỉ trả mã và giờ của lịch trùng | B7 |
| Q11 | Khoá công khai của lịch hẹn trong API? | `maLichHen` (không lộ `lich_hen_id` tuần tự, nếp patient); không có, sai dạng, của người khác hoặc ngoài phạm vi ⇒ **404 cùng thân** | B1–B5, B10, B12, B14 |
| Q12★ | Số lịch tối đa mỗi hồ sơ (A3 ghi "(3 )")? | Lấy `so_lich_hen_toi_da_moi_ho_so` từ cấu hình, **PLAN không đặt số** (`[cần điền]` ở DB; seed 3 chỉ minh hoạ). Đếm lịch đang hoạt động **kể cả lịch `ChoThanhToan` của chính mình vừa giữ**. Vượt ⇒ `VUOT_SO_LICH_HEN_TOI_DA`. Thiếu cấu hình ⇒ 409 `HE_THONG_CHUA_CAU_HINH` | B7 |
| Q13★ | Định dạng mã lịch hẹn (`varchar(20)` UNIQUE) khi Figma có ba kiểu (L18)? | `CLX-yyyyMMdd-XXXXX`: tiền tố và ngày của mẫu email `573:2` (`CLX-20261015-0042`), thay bộ đếm 4 chữ số bằng **5 ký tự Crockford base32 chữ hoa từ CSPRNG** (ví dụ `CLX-20261108-7K3QD`, 18 ký tự ≤ 20); sinh lại khi trùng (≤ 5 lần). Không dùng bộ đếm theo ngày: cần bảng đếm hoặc `MAX` dưới khoá chung (nghẽn đặt lịch) và mã đoán được. Nhóm chọn một kiểu rồi **sửa hai kiểu còn lại ở Figma** (`CX…` Bước 5–6, `CP…` các màn danh sách). **Đã trả lời (08/11/2026): đồng ý `CLX-yyyyMMdd-XXXXX`** (5 ký tự Crockford base32 từ CSPRNG); nhóm sửa hai kiểu còn lại ở Figma | B8, F5–F7 |
| Q14 | Khoá no-show và đếm no-show tính theo ai? | Theo **tài khoản đặt** (`benh_nhan`): bị khoá thì không đặt được cả cho bản thân lẫn người thân; Vắng mặt của lịch người thân cộng vào `so_lan_no_show` của tài khoản đặt (schema không có cột đếm cho hồ sơ người thân; b9 chỉ nói "hồ sơ bệnh nhân liên quan") | B7, B12 |

**C. Giá, cọc, hoàn tiền**

| Q | Câu hỏi | Đề xuất và lý do | Chặn |
|---|---|---|---|
| Q15★ | Ai làm migration + entity `moc_hoan_tien` (L6) và dạng JSON snapshot? | **Trung** (task admin "Đặt cọc & Hoàn tiền") hoặc một PR nhỏ chỉ có migration + entity (`[ĐỤNG admin]`; DDL đã có trong `docs/database`). Snapshot = mảng `[{ "so_gio_truoc_toi_thieu": 24, "ty_le_hoan": 100 }, …]` sắp giảm dần theo giờ (khoá snake_case như các JSON khác của schema); `NULL` khi `muc_dat_coc = 0`; cọc > 0 mà **chưa có mốc nào** ⇒ `[]` (= không hoàn) và bước Xác nhận hiện "không hoàn cọc khi hủy". Ghi dạng JSON vào ghi chú cột ở `dbml` (D2). Figma `553:2` còn có **bảng mặc định toàn hệ thống** (≥ 24 giờ 100%, ≥ 2 giờ 50%, ≥ 0 giờ 0%) mà schema không có chỗ lưu (L29): đề xuất admin **ghi mốc theo từng dịch vụ** (bảng mặc định chỉ là cách nhập); booking chỉ đọc hàng theo dịch vụ. Chưa có bảng thì task B8 chỉ chạy được với dịch vụ cọc 0. Ví dụ mốc của 2.4 (đã khôi phục, Q44): `≥24 giờ: 100%; 2–24 giờ: 50%; <2 giờ: 0%`, tức mốc mẫu (24 → 100, 2 → 50, 0 → 0). **Đã trả lời (08/11/2026): giao cho TRUNG** (task admin "Đặt cọc & Hoàn tiền") làm migration + entity; P6 chỉ làm nếu tới B8 (cọc > 0) mà Trung chưa xong **và Trung đồng ý**; Đại sẽ hỏi Trung | B8 (cọc > 0), B10, P6 `[CHỜ Trung]` |
| Q16★ | Cách tính bậc và làm tròn? | Mốc có `so_gio_truoc_toi_thieu` **lớn nhất mà ≤ số giờ còn lại** (giờ thực = `(thoi_gian − now) / 3.600.000`, **không làm tròn**; còn đúng 24 giờ thì được mốc 24); không mốc nào hoặc đã quá giờ hẹn ⇒ 0%. Tiền hoàn = `tien_coc_da_thu × ty_le / 100` bằng BigInt đơn vị 0,01, **làm tròn xuống** 0,01. Lịch quá giờ nhưng còn `DaXacNhan` vẫn cho huỷ (hoàn 0%), không mời danh sách chờ. Chính sách lấy từ **snapshot** của lịch (không hồi tố), không đọc `moc_hoan_tien` hiện hành. Khớp ví dụ 2.4 (`≥24 giờ: 100%; 2–24 giờ: 50%; <2 giờ: 0%`): đúng 24 giờ được 100%, đúng 2 giờ được 50% | B10 |
| Q17★ | Hoàn cọc khi **Lễ tân huỷ, QTV override, hệ thống huỷ** (L15)? | Bệnh nhân huỷ: theo bậc. Lễ tân huỷ: **theo bậc cùng thời điểm** (huỷ theo yêu cầu bệnh nhân tại quầy). Hết hạn giữ chỗ: không có gì để hoàn. **Duyệt nghỉ phép của bác sĩ** và **QTV override sang Đã hủy**: hoàn **100%** cọc đã thu (lỗi không do bệnh nhân) và **không** mời danh sách chờ khi bác sĩ nghỉ. `[đề xuất]`, quyết định chính sách của nhóm. **Đã trả lời (08/11/2026): đồng ý; ghi rõ đây là QUYẾT ĐỊNH CHÍNH SÁCH của nhóm, đã có xác nhận của Đại** | B10, B12, B14 |
| Q18 | Số tiền hoàn "dự kiến" (b3) lệch số thật (b5)? | Server tính **lại lúc xác nhận**, kết quả huỷ trả số **thực tế**; giao diện ghi "dự kiến" ở hộp xác nhận và hiện số cuối ở kết quả | B10, F2 |
| Q19 | Giao dịch cọc 0đ (L7): ghi gì? | Thuộc `payment`. Đề xuất cho `payment` (ghi vào PLAN của họ): dòng `ThanhToanLichHen`, `phuong_thuc = 'Vi'`, `vi_noi_bo_id` = ví của Bệnh nhân, `so_tien = 0`, `trang_thai = 'ThanhCong'`, **không** ghi `giao_dich_vi` (không biến động số dư). `booking` gọi cổng `PaymentPort.recordZeroPayment(manager, …)`; cho tới khi `payment` có, bản giả **không ghi bảng nào** nhưng lịch vẫn xác nhận được | B8 `[CHỜ payment]` |
| Q20★ | Ai gọi ai khi thanh toán xong? "Đã đóng đủ 100%" tính ở đâu (L12, L17)? | `payment` gọi `AppointmentTransitionService.confirmPaid(manager, …)` **trong giao dịch của chính nó** (ghi `ThanhCong` và xác nhận lịch cùng commit; không có khe "đã trả tiền, lịch vẫn chờ"). Booking đọc "còn phải thu" qua `PaymentSummaryPort.remainingToCollect(manager, lichHenId)`. Cho tới khi `payment` có: bản giả trả `conPhaiThu = gia_snapshot` (nên mọi tiếp đón thật bị `CON_PHAN_CHUA_THANH_TOAN`), test dùng bản giả trả 0; chi tiết lịch hẹn trả `thanhToan: null`, `hoanTien: null`. Figma Bước 5 Thanh toán có **hai lựa chọn "cọc"/"toàn bộ"** và **số dư ví** (L30): `payment` quyết; `confirmPaid` nhận số tiền đã thu thật, "còn phải thu" = `gia_snapshot` − tổng đã thu; số dư ví hiển thị qua cổng của `wallet` (`null` tới khi có) | B11, B12 |
| Q46 | Phụ phí bác sĩ hiển thị ở đâu, email tách "Giá dịch vụ"/"Phụ phí" thế nào (L27, L28)? | Giá áp dụng (đã gồm phụ phí) là `gia_snapshot`: **Bước 3, 5, 6 hiện đúng `giaApDung`** (khớp thẻ bác sĩ của `search`); **Bước 5 thêm một dòng "Phụ phí bác sĩ"** (`phuPhi` tính lúc kiểm, chỉ để hiển thị) và một câu chính sách huỷ/hoàn từ snapshot (b12 "chính sách đặt cọc nếu có") — Figma chưa có hai dòng này, nhóm bổ sung. **Email `573:2` chỉ hiện `Tổng giá`, cọc đã thanh toán, còn lại** (bỏ hai dòng tách giá/phụ phí vì snapshot không đủ dữ liệu để tách đúng). Phương án khác: thêm cột `phu_phi_snapshot` (đổi schema, `[ĐỒNG BỘ TL]`) | B7, B15, F5 |

**D. Trạng thái lịch hẹn**

| Q | Câu hỏi | Đề xuất và lý do | Chặn |
|---|---|---|---|
| Q21★ | Ma trận chuyển trạng thái của Lễ tân? | Mục 5.2: `ChoThanhToan → DaHuy`; `DaXacNhan → DaHuy, VangMat, DaTiepDon`; mọi chuyển khác từ chối (`CHUYEN_TRANG_THAI_KHONG_HOP_LE`; chọn `HoanThanh` ⇒ `CHI_BAC_SI_HOAN_THANH`). **Lễ tân không huỷ lịch `DaTiepDon`** (khớp HLH A1; cần huỷ thì QTV override). Figma `495:2` đang có nút `Hủy lịch` ở "Đã tiếp đón" (L21) ⇒ nhóm sửa Figma, hoặc nếu muốn cho phép thì thêm `DaTiepDon → DaHuy` vào ma trận Lễ tân (kéo theo hoàn cọc). **Đã trả lời (08/11/2026): đồng ý theo 2.4, Lễ tân KHÔNG huỷ `DaTiepDon` (cần thì QTV override); nhóm sửa Figma `495:2` (bỏ nút `Hủy lịch` ở "Đã tiếp đón")** | P1, B12 |
| Q22★ | "Quá giờ hẹn" và cửa sổ tiếp đón (L11)? | Tiếp đón khi `thoi_gian − check_in_truoc_phut ≤ now ≤ thoi_gian + check_in_sau_phut` (đóng hai đầu). Lễ tân chỉ chọn **Vắng mặt** khi `now > thoi_gian + check_in_sau_phut`: hai khoảng liền nhau, không chồng, không hở. `DaHuy` bất cứ lúc nào lịch còn `ChoThanhToan`/`DaXacNhan`. Override QTV **không** bị cửa sổ giới hạn (quy tắc 40). Giá trị phút từ cấu hình (seed 30/15 chỉ minh hoạ) | B12 |
| Q23★ | Tự Vắng mặt: "ca đã kết thúc" (L13), tần suất? | Lịch `DaXacNhan` có giờ kết thúc ca `≤ now`; giờ kết thúc ca = `gio_ket_thuc_sang` (`CaSang`) hoặc `gio_ket_thuc_chieu` (`CaChieu`) của `chi_nhanh_lich_hoat_dong` của chi nhánh trong `lich_lam_viec.chi_nhanh_id`, vào thứ của `ngay`. Job mỗi **5 phút** (`[đề xuất]`), lô 100, trần 10 lô; chỉ `DaXacNhan`; **không** giải phóng khung giờ, **không** mời chờ; cộng no-show, bật cờ khi đạt ngưỡng, thông báo | B13 |
| Q24★ | Ma trận override của Quản trị viên (L10)? | Đích ∈ {`DaHuy`, `VangMat`, `DaTiepDon`, `DaXacNhan`}; nguồn ∈ {`ChoThanhToan`, `DaXacNhan`, `DaTiepDon`, `VangMat`}; từ `ChoThanhToan` chỉ đến `DaHuy`; **không** từ `HoanThanh`/`DaHuy`/`DaDoiLich`, **không** đến `HoanThanh`/`DaDoiLich`/`ChoThanhToan`. **Không khôi phục từ `DaHuy`** (phải giữ lại khung giờ và đảo hoàn tiền: để làm sau nếu nhóm cần). `VangMat → DaXacNhan` được (CNTT A3 "khôi phục") và **không** tự trừ `so_lan_no_show` (việc của use case "Điều chỉnh số lần no-show"). Lý do bắt buộc 1–255 ký tự; Audit `OverrideLichHen` (`truoc`, `sau`, `ly_do`) cùng giao dịch; thông báo Bệnh nhân | B14 |
| Q25 | Sau khi QTV mở khoá no-show, lần Vắng mặt kế tiếp? (admin Q31 chuyển sang đây) | Số mới ≥ ngưỡng ⇒ **khoá lại ngay** (đúng chữ "đạt hoặc vượt"); muốn đếm lại phải dùng "Điều chỉnh số lần no-show" (module sau). Cờ đã bật thì **không** gửi cảnh báo lặp (A4/10b) | B12 |
| Q26 | Kiểm khoá no-show ở đâu? | **Hai lần**: khi vào luồng (A4/1a–1b: `GET /booking/eligibility`, FE chặn từ bước 1) và lại **dưới khoá `benh_nhan`** lúc tạo lịch (bị khoá giữa chừng) ⇒ `DAT_LICH_BI_KHOA_NO_SHOW`. Lịch đã có không bị huỷ vì khoá | B7, F3 |
| Q27 | Lý do huỷ có bắt buộc không? | Theo Figma (L33): **Bệnh nhân không nhập lý do** (hộp `421:2`, `410:2` không có ô) ⇒ `ly_do_huy` = hằng "Bệnh nhân hủy lịch hẹn" (API vẫn nhận `lyDo` tuỳ chọn ≤ 255); **Lễ tân huỷ: bắt buộc**, ≤ 255 (`490:2` có `Lý do hủy *`; cũng cần cho truy vết vì không có Audit Log); **Vắng mặt của Lễ tân: không có lý do** (`489:2`); QTV override: bắt buộc (2.4; chưa có frame); hết hạn giữ chỗ và nghỉ phép: hằng | B10, B12 |
| Q28 | Thao tác của Lễ tân có ghi nhật ký hành động không? | **Không** (2.4 chỉ yêu cầu cho QTV override; enum không có giá trị riêng); dấu vết là `ly_do_huy`, `thoi_diem_huy`, `cap_nhat_lan_cuoi`; **không lưu người thực hiện** (không có cột). Ghi `TECH_DEBT` theo **số kế tiếp trên `main` lúc ghi** (lúc trả lời là 84; dòng 83 đã bị patient B7 dùng). Panel "Lịch sử trạng thái" của Admin (`512:2`, L26) dựng từ `thoi_diem_tao`, `thoi_diem_huy`, `ly_do_huy` và các dòng audit `OverrideLichHen` của lịch đó; **không** có lịch sử đủ mọi lần đổi trạng thái (không có bảng): nhóm chấp nhận, hoặc yêu cầu bảng lịch sử (đổi schema) | B12, B4, D3 |
| Q45 | Bệnh nhân huỷ lịch **`ChoThanhToan`** trên giao diện (L20)? | **Cho phép** (2.4 HLH TĐK; backend đã cho): chi tiết "Chờ thanh toán" (`426:2`) thêm nút `Hủy lịch hẹn` dùng cùng hộp xác nhận (cọc chưa thu ⇒ `Hoàn dự kiến` = `Không hoàn`); Figma cần bổ sung frame. Phương án khác: chỉ huỷ khi `DaXacNhan`, lịch chưa thanh toán để tự hết hạn (sửa 2.4 HLH TĐK) | F2 |

**E. Thông báo và email**

| Q | Câu hỏi | Đề xuất và lý do | Chặn |
|---|---|---|---|
| Q29★ | Mức thông báo tối thiểu và schema (L8)? | 4 sự kiện cho `tai_khoan` của Bệnh nhân **đặt** lịch: lịch đã xác nhận, lịch đã huỷ (Bệnh nhân/Lễ tân/QTV/nghỉ phép), Vắng mặt, khoá đặt lịch do no-show. **Phương án A (đề xuất):** thêm cột `thong_bao.lich_hen_id` (nullable, FK) + UNIQUE `(lich_hen_id, tai_khoan_id, loai_su_kien)` bằng migration và sửa cả ba file `docs/database/*` (task P7, `[ĐỒNG BỘ TL]`, `[ĐỤNG admin]`), để worker dựng thư giàu dữ liệu từ `lich_hen` và chống trùng; ghi `thong_bao` + `email_thong_bao(ChoGui)` **cùng giao dịch**; worker gửi là của `notification`/admin B9. **Phương án B (không đổi schema):** nhúng mã lịch hẹn vào `noi_dung` (≤ 500 ký tự), gửi email trực tiếp sau commit bằng `MailService`, mất thư nếu SMTP lỗi, không chống trùng bằng DB. Nhắc lịch (`nhac_lich_hen`) **không** thuộc module này. **Đã trả lời (08/11/2026): đồng ý phương án A CHỈ KHI TRUNG ĐỒNG Ý** (bảng của admin, có đổi `docs/database/*` và migration); không thì phương án B. P7 và B15 **chưa merge** khi chưa có câu trả lời của Trung | B15, P7 `[CHỜ Trung]` |
| Q30 | Email: mẫu nào, ai dựng? | **4 mẫu** thuộc module (Figma "Admin - Email Preview"): **Xác nhận đặt lịch** (`573:2`), **Hủy lịch hẹn** (`676:2`, ba biến thể: "Bệnh nhân yêu cầu hủy" ← `BenhNhanHuy`; "Phòng khám điều chỉnh" ← `LeTanHuy`, `QtvOverride`; "Bác sĩ nghỉ phép" ← `BacSiNghiPhep`; hết hạn giữ chỗ không gửi, Q6), **Ghi nhận vắng mặt** (`686:2`), **Hạn chế đặt lịch do no-show** (`687:2`); dựng trên `renderMailShell`, mọi dữ liệu qua `toSingleLine` rồi `escapeHtml`, không nút/liên kết (Figma không có). Chân thư Figma còn `[cần điền]` (L32): lấy hotline, email, địa chỉ từ `thong_tin_phong_kham`, thiếu thì bỏ dòng. Tách giá/phụ phí: Q46. "Nhắc lịch hẹn" (`681:2`) thuộc `notification`, "Hoàn tiền hoàn tất" (`680:2`) và "Thanh toán thất bại" (`679:2`) thuộc `wallet`/`payment`. Test dùng `FakeMailService` | B15 |

**F. Danh sách**

| Q | Câu hỏi | Đề xuất và lý do | Chặn |
|---|---|---|---|
| Q31 | TCLS: "Sắp tới"/"Lịch sử", `DaDoiLich` (L2), sắp xếp? | API hỗ trợ **cả hai cách nhìn**: `nhom` = `SapToi` (trạng thái ∈ `ACTIVE_APPOINTMENT_STATES`, `thoi_gian` tăng dần) hoặc `LichSu` (`HoanThanh`, `DaHuy`, `VangMat`, giảm dần); không `nhom` = "Tất cả" (giảm dần, đúng Figma `411:2`). Trả thêm **`demTheoTrangThai`** (số lịch theo từng trạng thái dưới cùng các bộ lọc khác, để vẽ thẻ lọc có số đếm như Figma). **Ẩn `DaDoiLich`**. Lọc `trangThai[]`, hồ sơ đi khám (tất cả/bản thân/từng người thân), `bacSiId`, `chuyenKhoaId`, `tuNgay`/`denNgay`, `q` (Q35); phân trang `common/paging` (Figma không có phân trang: FE thêm bộ chuyển trang). Figma thiếu "Sắp tới/Lịch sử" mà 2.4 mặc định (L23) ⇒ nhóm thêm vào Figma hoặc sửa 2.4 | B1, F1 |
| Q32 | XDS: bộ lọc, trường, sắp xếp (L14)? | Lọc: `chiNhanhId` (chỉ QTV Toàn hệ thống; Lễ tân và QTV Chi nhánh bị ép theo phạm vi, tham số gửi lên bị bỏ qua), `chuyenKhoaId` (qua `bac_si.chuyen_khoa_id` **hiện tại**), `bacSiId`, `trangThai` (nhiều giá trị), `tuNgay`/`denNgay` (theo `thoi_gian`, giờ VN, khoảng đóng; chip `Hôm nay`/`Ngày mai`/`Tuần này`/`Khoảng ngày` của Lễ tân là hai tham số này do FE tính theo giờ VN), **thêm theo Figma** (L24): `q` (Q35), `dichVuKhamId` (Admin có `Loại dịch vụ`), `thanhToan` (`Chưa thanh toán`/`Đã đặt cọc`/`Đã thanh toán đủ`: **`[CHỜ payment]`**, tới khi có thì ẩn cột và bộ lọc). Trường (danh sách trắng): `maLichHen`, `thoiGian`, `trangThai`, `nguoiKham { hoTen, laBanThan }`, `nguoiDat { hoTen, soDienThoai }`, `bacSi`, `chuyenKhoa`, `dichVu`, `chiNhanh`, `giaSnapshot`, `tienCoc`; chi tiết thêm `lyDoKham`, `lyDoHuy`, `hanThanhToan`. **Không** trả email, ngày sinh, địa chỉ. Sắp mặc định theo `thoi_gian` (Lễ tân: chip `Hôm nay` mặc định nên tăng dần trong ngày; Admin giảm dần) `[đề xuất]` | B3, B4 |
| Q33 | XDSPC: trường nào cho Bác sĩ? | `bac_si_id` = chính mình (không nhận từ query); lọc `tuNgay`/`denNgay`/`trangThai[]`/`ca` (Figma có `Ca khám`) và `q`; sắp theo `thoi_gian` (Figma có ô `Sắp xếp`, mặc định "Mới nhất trước": tham số `sapXep` = `MoiNhat`/`CuNhat`); trường: `maLichHen`, `thoiGian`, `ca`, `trangThai`, `nguoiKham { hoTen, quanHe, gioiTinh, ngaySinh }`, `dichVu`, `chuyenKhoa`, `lyDoKham`. Figma `458:2` hiện thêm **`Điện thoại`, `Email`, `Giá khám`** (L25): **đã chốt (08/11/2026): giữ SĐT; bỏ email, giá, cọc, thanh toán**. "Ghi chú khám" lấy từ `ho_so_kham` `[CHỜ doctor]`. Nhãn chip `Đã check-in`/`Đã hoàn thành` của Figma đổi về `Đã tiếp đón`/`Hoàn thành` (đúng 2.4); danh sách có hàng `Chờ thanh toán`/`Đã hủy` thì cần chip tương ứng | B5, F11 |
| Q34 | Phạm vi của Lễ tân? | `ReceptionScopeService` (cạnh `rbac/`, đọc `le_tan.chi_nhanh_id` mỗi request, không cache) + chính sách chi nhánh dùng lại `BranchAccessPolicy`; lịch ngoài chi nhánh ⇒ 404 (`[ĐỤNG rbac]`, Trung) | B3, B12 |
| Q35 | Tìm kiếm danh sách? | Phân trang offset `PageQueryDto` (`{ items, total, page, pageSize }`, Q42 admin); **có ô tìm `q`** vì Figma có ở mọi danh sách (Bệnh nhân: mã lịch, bác sĩ, người khám; Lễ tân/Admin: mã lịch, tên bệnh nhân, SĐT, bác sĩ; Bác sĩ: mã, tên, SĐT): `q` 2–100 ký tự, chuẩn hoá NFC, `escapeLikePattern` (ký tự thoát `!`), khớp chứa, một mã lỗi `TU_KHOA_KHONG_HOP_LE` như patient B6. 2.4 không nhắc ô tìm nên ghi vào D2 | B1, B3, B4, B5 |

**G. Giao diện**

| Q | Câu hỏi | Đề xuất và lý do | Chặn |
|---|---|---|---|
| Q36★ | Bước 4–6 nằm trong khung nào? | Cùng khung công khai với bước 1–3 (`/dat-lich/**`, `PublicLayout`), bọc `RequireAuth` chỉ `BenhNhan`; trang "Lịch hẹn của tôi" nằm trong khung Bệnh nhân. **Figma đã xác nhận (08/11):** mọi frame Bước 1–6 dùng bố cục công khai (header có chuông thông báo và tên người dùng, có footer), không có thanh bên Bệnh nhân | F3 |
| Q37 | Frame "Lễ tân - Đặt lịch khám - Bước 1…5" và cột `Kênh` (L16, L22)? | **Không làm.** Figma (08/11) **không có** frame đó; cột `Kênh` (`Online`/`Tại quầy`) và `Kênh đặt` **bỏ** (schema không có cột kênh; mọi lịch đều đặt trực tuyến); nút `Thu tiền` ở danh sách Lễ tân thuộc `payment` (nút vô hiệu tới khi có). Nhóm sửa Figma | F8 |
| Q38★ | Dữ liệu giữa các bước giữ ở đâu, tải lại thì sao? | Lựa chọn bước 1–3 (nhóm, dịch vụ, bác sĩ, khung giờ) nằm trên **URL** (id, không nhạy cảm) nên tải lại giữ nguyên; hồ sơ đi khám và lý do khám nằm trong **bộ nhớ của trang** (không `localStorage`/`sessionStorage`: lý do khám là thông tin sức khoẻ; AGENTS mục 4). Tải lại ở bước 4–5 ⇒ quay về bước 4 với ô trống nhưng giữ lựa chọn bước 1–3; bước Thanh toán/Hoàn tất tải lại từ `GET /patient/appointments/:maLichHen` (không lưu gì ở trình duyệt) | F3–F6 |
| Q39 | Điểm vào A1 và Khách vãng lai? | Khung giờ chọn sẵn từ trang bác sĩ/danh mục (search K3) mở `/dat-lich/thong-tin?khungGioId=…`; chưa đăng nhập ⇒ `RequireAuth` chuyển sang đăng nhập và quay lại đúng URL (cơ chế quay lại của auth **chưa đo**: kiểm ở F3). Không giữ chỗ khi chuyển trang | F3 |
| Q40 | Làm giao diện khi `doctor` chưa có khung giờ thật? | Cho phép: F3–F7 chạy trên API đặt lịch thật với **khung giờ dựng bằng seed/fixture**; bước 3 là K2 của `search` (không dựng lại ở module này) | F3–F7 |

**H. Hạ tầng và dữ liệu**

| Q | Câu hỏi | Đề xuất và lý do | Chặn |
|---|---|---|---|
| Q41 | Dữ liệu mẫu (bác sĩ, ca, khung giờ, dịch vụ cọc, mốc hoàn)? | `doctor` sở hữu seed `lich_lam_viec` + `khung_gio` (bằng bộ sinh của họ) cho các bác sĩ `search-demo`; `booking` thêm seed `moc_hoan_tien` minh hoạ + một dịch vụ cọc > 0 (số **`[cần điền]`**) để thử luồng cọc. Test tự động dùng fixture riêng ở `appointments/testing/`, **không** phụ thuộc seed | P2, X2 |
| Q42★ | Mức cô lập và thử lại? | Mọi giao dịch ghi của module dùng **`READ COMMITTED`** (không khoá khoảng, ít 1213: bài học auth A5, patient B4), mở tường minh; thử lại tối đa 2 lần (tổng 3) khi gặp 1213/1205 **chỉ trước commit**; `innodb_lock_wait_timeout` ngắn hơn mặc định cho giao dịch đặt lịch: **chưa đo** (M3). Hợp đồng patient vẫn đúng (mục 5.3). **Đã trả lời (08/11/2026): đồng ý, nhưng chỉ chốt SAU khi đo M3 (và M1) ở X1**, trước khi viết lõi | P1, B6 |
| Q43 | Tên endpoint (mục 5.9)? | Chấp nhận danh sách `[đề xuất]` ở mục 5.9 (tiền tố `/api` qua proxy như mọi endpoint) | B1–B14 |
| Q44 | Đoạn 2.4 HLH bị cắt (L3)? | **Đã giải quyết (08/11/2026):** nội dung khôi phục từ XML của 2.4 ghi ở L3; ví dụ mốc `≥24 giờ: 100%; 2–24 giờ: 50%; <2 giờ: 0%` khớp Q15, Q16 và `moc_hoan_tien` mẫu (24 → 100, 2 → 50, 0 → 0); không còn `[cần điền]` ở HLH | B10 |

### 4.3 Mọi chỗ còn `[cần điền]` / `[đề xuất]` liên quan (và câu hỏi tương ứng)

| Chỗ | Nguồn | Giá trị/đề xuất | Hỏi |
|---|---|---|---|
| Số lịch hẹn tối đa mỗi hồ sơ ("(3 )") `[cần điền]` | ĐLK A3/11a; `cau_hinh_he_thong`; quy tắc 37 | Từ cấu hình, không đặt số | Q12 |
| Thời gian giữ chỗ 15 phút `[đề xuất]` | ĐLK b15; `cau_hinh_he_thong.thoi_gian_giu_cho` | Từ cấu hình | Q2 |
| Ngưỡng no-show N (mức 3 `[đề xuất]`) | CNTT; `nguong_no_show` | Từ cấu hình (`>= N`) | Q25, Q26 |
| Khung giờ cho phép tiếp đón `[cần điền]`, cách hiểu `[đề xuất]` | CNTT TĐK; quy tắc 40 | Cách hiểu đóng hai đầu; số phút từ cấu hình | Q22 |
| Mốc hoàn tiền (ví dụ `[đề xuất]` 24 giờ → 100, 2 giờ → 50, 0 giờ → 0) | `moc_hoan_tien`; HLH | Do admin cấu hình; booking chỉ chụp và tính | Q15, Q16 |
| Thứ chưa khai báo xử lý như ngày nghỉ `[đề xuất]` | Quy tắc 28, 29 | Mã `CHI_NHANH_CHUA_KHAI_BAO` (cùng nhóm với nghỉ); dùng chung câu trả lời `search` Q4 / admin Q45 | — |
| Giờ ca = khoảng nhận khám của chi nhánh `[đề xuất]` | Quy tắc 39, ghi chú `lich_lam_viec` | Dùng cho tự Vắng mặt | Q23 |
| Bước "công bố lịch" riêng `[cần điền]` | Quy tắc 38 | Không có cờ: khung giờ `ConTrong` tồn tại là đặt được (thuộc `doctor`; booking không kiểm cờ nào) | Q7 |
| Ca của hôm nay đã kết thúc có "đã qua"? `[cần điền]` | Quy tắc 13, 29 | Khung giờ đã qua giờ bị từ chối ở Q5; phần đổi chi nhánh bác sĩ thuộc admin | Q5 |
| Override QTV không bị quy tắc 45–47 và cửa sổ tiếp đón `[đề xuất]` | Quy tắc 40, 47 | Theo 2.4 hiện hành | Q22, Q24 |
| Lễ tân có được đánh Vắng mặt sớm không (còn mở của quy tắc 40) | Quy tắc 40 | Chỉ sau hết cửa sổ tiếp đón | Q22 |
| Mã sự kiện thông báo `[đề xuất]`; chữ trong email `[đề xuất]` | `thong_bao.loai_su_kien`; Figma | `LichHenDaXacNhan`, `LichHenDaHuy`, `LichHenVangMat`, `KhoaDatLichNoShow`; chữ theo Figma | Q29, Q30 |
| `so_lan_tu_doi_lich_toi_da` `[cần điền]`, `thoi_han_phan_hoi_loi_moi` `[đề xuất]` | `cau_hinh_he_thong` | **Không thuộc module** (đổi lịch, danh sách chờ) | — |
| Giá trị phụ phí `[cần điền]`; ý nghĩa "tắt mốc cao" `[cần điền]` | `phu_phi_bac_si`; quy tắc 11 | Admin Q21 đã chốt cách tính; booking chỉ gọi `computeExamPrice`, không đặt số | — |
| ~~Ví dụ trong HLH b3 / HĐK (bị cắt)~~ | 2.4 HLH | **Đã khôi phục (08/11/2026)**: `≥24 giờ: 100%; 2–24 giờ: 50%; <2 giờ: 0%` (ví dụ `[đề xuất]` của 2.4; giá trị thật do admin cấu hình ở `moc_hoan_tien`) | Q44 |

### 4.4 Đối chiếu Figma (đã đọc 08/11/2026, file `1OsOfwD5myNNRv7FPCD9YC`, trang `63:2`, 252 frame cấp 1, toàn bộ 1440 px, **không có frame mobile**)

Nguồn: một phiên đọc riêng bằng `get_metadata` + `get_design_context` (36 lời gọi); nhãn chữ lấy nguyên văn từ mã `get_design_context`. **Bố cục và khoảng cách chưa đối chiếu bằng mắt.** Một số frame chỉ đọc qua `get_metadata` (chuỗi dài bị cắt khoảng 50 ký tự, không có màu): Admin danh sách `511:2`, Admin chi nhánh danh sách `621:2`, Lễ tân `494:2`, `495:2`–`497:2`, Bác sĩ `459:2`–`465:2`, `692:2`. Phải mở `get_design_context` lại ở task F tương ứng trước khi dựng.

| Use case | Frame (nodeId) | Dùng cho | Task |
|---|---|---|---|
| ĐLK | Bước 1 `444:2`, Bước 2 `445:2`, Bước 3 `446:2`/`447:2`/`448:2` | **Đã làm ở `search` F5** (nhóm dịch vụ, dịch vụ, bác sĩ); khung giờ là K2 của `search`. Nhãn Bước 3 cần biết: banner "Chọn giờ chỉ ghi nhận lựa chọn của bạn. Khung giờ chỉ được giữ 15 phút khi bạn bắt đầu thanh toán cọc ở bước cuối." và thanh "Chưa giữ chỗ — khung giờ chỉ được giữ khi thanh toán" (**khớp Q1**) | — |
| ĐLK | Bước 4 `449:2`, chọn người thân `450:2` | Người đi khám (bản thân `Đang chọn` + nút `Chọn người thân khác`), ô "Lý do khám (không bắt buộc)", khối "Lịch hẹn đang chọn"; hộp chọn liệt kê bản thân + người thân, nút `Đóng, giữ lựa chọn hiện tại` | F4 |
| ĐLK | Bước 5 Xác nhận `451:2` | Chi tiết (dịch vụ, bác sĩ, chi nhánh + địa chỉ, ngày giờ, người khám, lý do), "Chi phí" (giá dịch vụ, tổng giá khám, cọc cần thanh toán, số dư ví, còn lại tại quầy), nút `Xác nhận và thanh toán cọc`, ghi chú "Khi bấm thanh toán, khung giờ được giữ 15 phút" | F5 |
| ĐLK | Bước 5 Thanh toán `452:2` | Đếm ngược "Thời gian giữ chỗ còn lại" `14:58` (mm:ss) đầu cột trái; hai lựa chọn "Thanh toán cọc"/"Thanh toán toàn bộ"; "Mã lịch hẹn" đã cấp ở bước này (**lịch `ChoThanhToan` được tạo khi bấm Xác nhận: khớp Q1**); nút `Thanh toán 100.000đ từ ví` | F6 `[CHỜ payment]` |
| ĐLK | Bước 6 `453:2` | Phiếu: mã lịch hẹn, chi tiết, chi phí (`Cọc đã thanh toán`, `Thu tại quầy`); chỉ hai nút `Về trang chủ`, `Xem lịch hẹn của tôi`; **không** QR, in, tải | F7 |
| TCLS, HLH | `411:2` (danh sách), `420:2` (chi tiết Đã xác nhận), `421:2` (huỷ), `426:2` (Chờ thanh toán), `691:2` (Đã hủy), `422:2`–`425:2` (Hoàn thành, thuộc `doctor`/đánh giá), `410:2` (modal huỷ ở Tổng quan, chỉ tham khảo) | Bảng "Tất cả" + thẻ lọc trạng thái có số đếm + ô tìm + 5 bộ lọc; chi tiết kèm khối "Chi phí & Thanh toán" và dòng thời gian; hộp huỷ nội tuyến "Xác nhận hủy lịch hẹn?" (`Cọc đã thanh toán`, `Hoàn dự kiến`, nút `Giữ lịch`/`Xác nhận hủy`) | F1, F2 |
| CNTT, XDS | Lễ tân `479:2` (danh sách), `488:2` (chi tiết cần thu), `489:2` (Vắng mặt), `490:2` (Hủy), `492:2` (Thu tiền và tiếp đón, chỉ tham khảo), `494:2`–`497:2`, `493:2` (đổi lịch hộ: ngoài phạm vi) | Danh sách có chip ngày, bộ lọc, nút `Chi tiết`/`Thu tiền`/`Tiếp đón`; khung chi tiết cạnh danh sách với nút `Thu tiền & tiếp đón`, `Vắng mặt`, `Hủy lịch`, `Đổi lịch hộ bệnh nhân`; hộp "Đánh dấu vắng mặt"; hộp "Hủy lịch hẹn" với `Lý do hủy *` | F8, F9 |
| CNTT, XDS | Admin `511:2` (danh sách), `512:2` (chi tiết, **chỉ trạng thái Chờ thanh toán**), Admin chi nhánh `621:2` | Bộ lọc, cột, panel "Thông tin lịch hẹn/bệnh nhân/Lịch sử trạng thái/Thanh toán"; **không có nút override, không có ô lý do** | F10 |
| XDSPC | Bác sĩ `457:2` (danh sách), `458:2` (chi tiết Đã xác nhận), `459:2`–`465:2`, `692:2` | Chip ngày, bộ lọc, chip trạng thái có số đếm; chi tiết "Thông tin người khám/lịch hẹn/Trạng thái ca khám". Nút `Hoàn thành ca khám`, `Ghi hồ sơ khám`, `Chỉnh sửa ghi chú` thuộc `doctor` | F11 `[CHỜ doctor]` |
| Email | `573:2` Xác nhận đặt lịch, `676:2` Hủy lịch hẹn (3 biến thể), `686:2` Ghi nhận vắng mặt, `687:2` Hạn chế đặt lịch do no-show | Thân thư là bảng thông tin, ô lưu ý, **không nút/liên kết**; chân thư chung (`[cần điền]`) | B15 |
| Ngoài module (chỉ tham khảo) | `553:2`/`569:2` Đặt cọc và hoàn tiền (bảng mốc), `556:2`–`558:2` Cài đặt hệ thống, `680:2` Hoàn tiền hoàn tất, `681:2` Nhắc lịch hẹn, `679:2` Thanh toán thất bại | Số liệu minh hoạ: giữ chỗ 15 phút (5–120), ngưỡng no-show 3 (1–10), tối đa 3 lịch/hồ sơ (1–20); **check-in sớm/muộn "Chưa chốt/Chưa kết nối"** (giá trị cửa sổ tiếp đón chưa có giao diện cấu hình, Q22) | — |

**Danh sách lệch Figma cần nhóm sửa hoặc quyết** (đã đánh số L18–L33 ở mục 3.4): ba định dạng mã lịch hẹn; "Lý do khám" không bắt buộc; nút huỷ ở "Chờ thanh toán" và ở "Đã tiếp đón"; `Kênh`/`Tại quầy`; thiếu "Sắp tới/Lịch sử" và phân trang; bộ lọc Admin thừa so với 2.4; SĐT, email, giá của Bác sĩ; panel "Lịch sử trạng thái" không có dữ liệu; phụ phí và chính sách hoàn không hiện ở Bước 3/5/6; bảng chính sách hoàn mặc định không có chỗ lưu; hộp huỷ của Bệnh nhân không có lý do; chân thư `[cần điền]`; các chuỗi mô phỏng còn trong giao diện ("Chính sách cọc là giá trị đề xuất mô phỏng…", "Tỷ lệ hoàn là chính sách đề xuất trong bản demo", "Giới hạn lịch đang hoạt động là giá trị đề xuất", `1900 1234 (số demo)`): **bỏ khỏi bản chạy thật**, nhóm quyết giữ hay bỏ. Dữ liệu minh hoạ mâu thuẫn giữa các vai trò (cùng mã `CP20261018001` Bệnh nhân thấy "Chưa ghi nhận qua ví", Lễ tân thấy "Đã đặt cọc 100.000đ") chỉ là dữ liệu mẫu, không phải quy tắc.

**Tương phản (ADR 0004, WCAG 2.2 AA: chữ ≥ 4,5:1, viền/thành phần ≥ 3:1):** các cặp sau của Figma **không đạt**, F-task dùng token có sẵn (`brand-strong`, token chữ phụ đạt 4,5:1), **không chép màu Figma**, và ghi vào danh sách lệch Figma; tỷ lệ dưới đây do phiên đọc Figma tự tính, **phải đo lại** trước khi dùng: chữ `#99a1af` trên trắng 2,60:1 (nhãn trường, dòng phụ `Chưa ghi nhận`/`Chưa đến`, chú thích, SĐT/mã ở danh sách Lễ tân); `#0092b8` 3,62:1 (liên kết `Chi tiết` của Lễ tân); `#fb2c36` 3,81:1 (nút `Hủy lịch` của Lễ tân; bên Bệnh nhân dùng `#c10007` đạt 6,42:1); nhãn trạng thái `Hoàn thành` 4,50:1 và `Chờ thanh toán` 4,56:1 (sát ngưỡng). Màu nhãn trạng thái lấy làm tham chiếu: Chờ thanh toán cam, Đã xác nhận xanh dương, Đã tiếp đón xanh ngọc, Hoàn thành xanh lá, Đã hủy xám; **`Vắng mặt` không có hàng nào hiển thị** nên chưa có màu tham chiếu.

### 4.5 Trạng thái chưa có frame Figma (nhóm bổ sung; trong lúc chờ, FE theo cách của `patient` Q22)

Dùng thành phần có sẵn `loading-state`, `error-state`, `empty-state`, `offline-banner` và thông báo lỗi dưới ô như màn auth, câu chữ ở mục 5.14; không tự thiết kế bố cục mới. Danh sách còn thiếu (AGENTS mục 4: "thiếu thì hỏi"):
- **ĐLK:** khung giờ vừa hết (A2); hồ sơ không đủ điều kiện: trùng giờ, vượt số lịch tối đa, hồ sơ người thân đã ngừng (A3); tài khoản bị khoá đặt lịch do no-show (A4; **chỉ có email `687:2`**); chi nhánh nghỉ/ngoài giờ (A6); dịch vụ **cọc 0đ** (nút và Bước 5/6 không có biến thể: L31); Bước 5 Thanh toán khi hết giờ giữ chỗ, thanh toán thất bại, thiếu số dư/nạp ví (thuộc `payment`/`wallet`).
- **Bệnh nhân:** hộp huỷ với ví dụ hoàn 100%/50%/0% (chỉ có "Không hoàn"); nút huỷ ở "Chờ thanh toán" (Q45); chi tiết "Đã tiếp đón" và "Vắng mặt"; chi tiết "Đã hủy" thiếu lý do, thời điểm, số tiền hoàn; danh sách rỗng, lỗi, đang tải, phân trang, "Sắp tới/Lịch sử".
- **Lễ tân:** chi tiết "Đã hủy", "Vắng mặt", "Chờ thanh toán"; hộp huỷ hiện hoàn dự kiến; hộp Vắng mặt hiện số lần vắng/ngưỡng khoá; danh sách rỗng, lỗi, phân trang.
- **Admin / Admin chi nhánh:** **override trạng thái (nút, chọn đích, ô lý do bắt buộc)** — không có frame; chi tiết mọi trạng thái ngoài "Chờ thanh toán"; chi tiết của Admin chi nhánh; phân trang.
- **Bác sĩ:** chi tiết "Vắng mặt"; danh sách rỗng, lỗi, phân trang.
- **Email:** hai biến thể huỷ "Phòng khám điều chỉnh", "Bác sĩ nghỉ phép" và huỷ có hoàn tiền theo % (frame chỉ hiện biến thể "Bệnh nhân yêu cầu hủy" không hoàn).
Các mục này gom vào task D3 (danh sách việc Figma cho nhóm).

### 4.6 Việc của nhóm (ngoài repo)

- Trả lời Q1–Q46 (mục 4.2); đối chiếu mục **5.10** với PLAN `doctor` (Trung) **trước khi tạo issue**; xác nhận chuyển chủ "khung giờ còn trống" (Q7) và `khungGioId` ở K1 (Q8) với PLAN `search`.
- Hỏi Trung Q7, Q15, Q29 (`[CHỜ Trung]`) và đối chiếu mục 5.10 với PLAN `doctor` khi có. Cập nhật **2.4** (repo `TLCN_CLINIX`): sửa b8 của ĐLK theo Q1; ghi Hoàn thành không thuộc override (Q24); định nghĩa "quá giờ hẹn" (Q22); danh sách bộ lọc Lễ tân/QTV (Q32) — chi tiết ở task D2.
- Figma: thống nhất mã lịch hẹn (Q13) và bỏ `Kênh`/`Tại quầy` (Q37); bổ sung các trạng thái chưa có frame (mục 4.5); sửa các chỗ lệch tương phản (mục 4.4) và các lệch L18–L33.
- Báo Trung các chỗ `[ĐỤNG admin]`, `[ĐỤNG search]`, `[ĐỤNG rbac]`, `[ĐỤNG audit]`, `router/role-routes.tsx` (mục 6); cho phép `moc_hoan_tien` và `thong_bao.lich_hen_id` đi cùng một đợt migration (Q15, Q29).
- Ghi `AI_USAGE_LOG.md` bảng 1 cho lần lập kế hoạch này (công cụ ghi đúng tên kèm model).

## 5. Thiết kế kỹ thuật

### 5.1 Cấu trúc thư mục (tạo thư mục khi có file đầu tiên; test cạnh mã)

```
apps/api/src/appointments/            # module AppointmentsModule (scope commit `booking`); tiếp quản 3 file của patient B5, giữ nguyên hành vi
  active-appointment-states.ts        # (đã có) ACTIVE_APPOINTMENT_STATES
  active-appointment.query.ts         # (đã có) findActiveAppointments
  visit-profile.query.ts              # (đã có) lockVisitProfile, isVisitProfileUsable
  appointments.module.ts              # P1: export các dịch vụ DÙNG CHUNG cho doctor/payment/wallet/waitlist (mục 5.10)
  appointments.constants.ts           # mã lỗi (5.14), mã sự kiện thông báo, hằng job (cron, cỡ lô, trần lô)
  state/                              # appointment-state.matrix.ts (thuần), appointment-transition.service.ts (NƠI DUY NHẤT ghi trang_thai)
  slots/                              # slot-hold.service.ts (giữ chỗ, đặt, giải phóng dưới khoá), bookability.rules.ts (thuần), bookability.reader.ts
  locking/                            # booking-transaction.ts (READ COMMITTED + thử lại 1213/1205), lock-order.ts (hằng + ghi chú thứ tự khoá)
  create/                             # booking-checks.controller|service (POST /booking/checks), create-appointment.controller|service, appointment-code.ts (thuần)
  cancel/                             # appointment-cancellation.service.ts, refund-calculator.ts (thuần), patient-cancel.controller.ts
  status/                             # reception-status.controller|service, admin-override.controller|service, check-in.service.ts, no-show.service.ts
  expiry/                             # hold-expiry.job.ts
  no-show/                            # no-show.job.ts
  lists/                              # patient-*, operations-* (Lễ tân và QTV dùng chung), doctor-*: controller + service + repository + dto
  ports/                              # payment.port.ts, refund.port.ts, waitlist.port.ts, doctor-leave.port.ts, pending-branch-changes.port.ts, appointment-notifier.port.ts (+ bản Noop và Fake)
  notifications/                      # mẫu thư (renderBookingConfirmationMail, …) và AppointmentNotifier thật khi Q29 chốt
  testing/                            # booking-fixtures.ts, concurrency-harness.ts, invariants.ts, fake-ports.ts (dùng chung int-spec/e2e-spec; chống jscpd)
apps/api/src/rbac/reception-scope.service.ts   # [ĐỤNG rbac] (Q34)
apps/api/src/audit/audit-entry.ts              # [ĐỤNG audit] thêm OverrideLichHen (B14)
apps/api/src/pricing/exam-price.reader.ts      # [ĐỤNG search] chuyển ExamPriceReader từ search/pricing/ (P3), search import lại
apps/web/src/features/booking/                 # api/, wizard/, appointments/{patient,reception,admin,doctor}/, testing/, index.ts
```

Controller chỉ nhận/trả, DTO + `class-validator`, import tương đối có đuôi `.js`; thứ tự `controller → service → repository`; entity dùng lại `admin/entities/` (không tạo entity mới cho bảng đã có); SQL thô cho các câu cần khoá hoặc ghép nhiều bảng (nếp patient/search).

### 5.2 Máy trạng thái (ma trận) và bất biến khung giờ ↔ lịch hẹn

**Bảng chuyển trạng thái** (✔ = được; điều kiện ở cột sau; mọi ô trống là từ chối `CHUYEN_TRANG_THAI_KHONG_HOP_LE`; chọn `HoanThanh` ngoài Bác sĩ là `CHI_BAC_SI_HOAN_THANH`):

| Chuyển | Ai | Điều kiện (kiểm LẠI dưới khoá) | Khung giờ |
|---|---|---|---|
| (tạo) → `ChoThanhToan` | Bệnh nhân | Mọi kiểm tra ở 5.4 | `ConTrong` → `DangGiuCho`, `giu_cho_den` = `han_thanh_toan` |
| `ChoThanhToan` → `DaXacNhan` | `payment` (`confirmPaid`); chính `create` khi cọc 0đ | Lịch còn `ChoThanhToan` (Q4) | `DangGiuCho` → `DaDat`, `giu_cho_den` NULL; `han_thanh_toan` NULL |
| `ChoThanhToan` → `DaHuy` | Bệnh nhân, Lễ tân, QTV override, hệ thống (hết hạn) | Sở hữu/phạm vi; hết hạn: `han_thanh_toan <= now` | → `ConTrong`, `giu_cho_den` NULL |
| `DaXacNhan` → `DaHuy` | Bệnh nhân, Lễ tân, QTV override, hệ thống (duyệt nghỉ phép) | Sở hữu/phạm vi | `DaDat` → `ConTrong` |
| `DaXacNhan` → `DaTiepDon` | Lễ tân (có điều kiện), QTV override, `payment` offline (qua `checkIn`) | Lễ tân: `conPhaiThu = 0` và trong cửa sổ tiếp đón (Q22) | giữ `DaDat` |
| `DaXacNhan` → `VangMat` | Lễ tân (sau hết cửa sổ), QTV override, hệ thống (job, ca đã kết thúc) | Q22, Q23 | giữ `DaDat` (**không** giải phóng, **không** mời chờ) |
| `DaTiepDon` → `HoanThanh` | **chỉ Bác sĩ** phụ trách (`complete`, do `doctor` gọi) | `bac_si_id` khớp | giữ `DaDat` |
| `VangMat` → `DaXacNhan` | QTV override (khôi phục) | Q24 | giữ `DaDat` |
| `DaXacNhan`/`DaTiepDon`/`VangMat` → `DaHuy` hoặc → nhau | QTV override | Ma trận override ở Q24 | → `ConTrong` khi sang `DaHuy` |
| → `DaDoiLich` | module đổi lịch (sau) | ngoài phạm vi | ngoài phạm vi |

**Bất biến** (viết thành truy vấn kiểm trong `appointments/testing/invariants.ts`; chạy sau mọi test đồng thời, INV-01…INV-05):
- INV-1: mỗi khung giờ có tối đa một lịch giữ nó (`khung_gio_dang_giu` UNIQUE, DB bảo đảm; INV kiểm lại bằng `GROUP BY`).
- INV-2: lịch `ChoThanhToan` ⇒ khung giờ `DangGiuCho` và `giu_cho_den` = `han_thanh_toan`.
- INV-3: lịch ∈ {`DaXacNhan`, `DaTiepDon`, `HoanThanh`, `VangMat`} ⇒ khung giờ `DaDat`, `giu_cho_den` NULL.
- INV-4: khung giờ `DaDat` ⇒ có **đúng một** lịch thuộc tập INV-3 giữ nó.
- INV-5: khung giờ `DangGiuCho` không có lịch `ChoThanhToan` giữ nó ⇒ chỉ khi đang giữ cho lời mời danh sách chờ (`waitlist`); module này **không bao giờ** tự tạo trạng thái đó.
Cột sinh `khung_gio_dang_giu` của DB gồm `HoanThanh`, `VangMat` (khác `ACTIVE_APPOINTMENT_STATES`): đúng ý đồ — lịch đã kết thúc vẫn giữ khung giờ, lịch hủy/đổi thì thả. **Không sửa** entity admin (Trung đã dặn) và không dùng cột sinh để đếm "đang hoạt động".

### 5.3 Thứ tự khoá, giao dịch, thử lại — **xác nhận hợp đồng khoá với `patient`**

**Xác nhận (trả lời yêu cầu của PLAN patient 5.3 và Q13):** luồng TẠO lịch hẹn khoá đúng thứ tự `benh_nhan` → `ho_so_nguoi_than` → chèn `lich_hen`; kiểm `trang_thai_hieu_luc = true` **dưới khoá** bằng `lockVisitProfile`; đếm bằng `findActiveAppointments` và hằng `ACTIVE_APPOINTMENT_STATES`; không câu đọc thường nào của giao dịch tạo lịch chạy trước hai câu đọc có khoá. Hợp đồng được **mở rộng, không đảo**: giữa `ho_so_nguoi_than` và lúc chèn có thêm hai khoá (`bac_si` `FOR SHARE`, `khung_gio` `FOR UPDATE`). Khoá `tai_khoan` (nếu có luồng cần) vẫn đứng trước `benh_nhan`. Patient X3 phải chạy các ca KT-01…KT-05 (mục 7.12). Giao dịch ngừng hồ sơ không bao giờ xin `bac_si`, `khung_gio` nên không có chu trình chờ với luồng tạo.

**Thứ tự khoá toàn cục** (từ ngoài vào trong; mọi luồng ghi của module chỉ được xin khoá THEO CHIỀU này, bỏ qua tầng không cần):

| Tầng | Hàng khoá | Luồng xin |
|---|---|---|
| 1 | `tai_khoan` | (module này không xin; auth/admin xin trước `benh_nhan`) |
| 2 | `benh_nhan` `FOR UPDATE` | tạo lịch hẹn; tự/Lễ tân/QTV đánh Vắng mặt (cộng no-show) |
| 3 | `ho_so_nguoi_than` `FOR UPDATE` | tạo lịch hẹn (hồ sơ người thân) |
| 4 | `bac_si` `FOR SHARE` (admin/doctor xin `FOR UPDATE`) | tạo lịch hẹn |
| 5 | `khung_gio` `FOR UPDATE` | tạo, huỷ, hết hạn, xác nhận thanh toán |
| 6 | `lich_hen` `FOR UPDATE` theo khoá chính | mọi luồng đổi trạng thái |
| 7 | `giao_dich_thanh_toan` → `vi_noi_bo` → bảng chỉ-thêm (`lich_su_hoan_tien`, `giao_dich_vi`, `thong_bao`, `nhat_ky_hanh_dong`) | `payment`, `wallet`, thông báo, audit (**sau** `lich_hen`; `payment` phải khoá `lich_hen` trước `vi_noi_bo`: ghi ở 5.10) |

Quy tắc áp dụng: (1) luồng chỉ biết `lich_hen` (huỷ, hết hạn, xác nhận, tiếp đón, Vắng mặt) **đọc thường một lần** để lấy `khung_gio_id` và `benh_nhan_id` (cả hai **bất biến** sau khi chèn: lịch đổi/huỷ vẫn giữ `khung_gio_id`), rồi khoá theo thứ tự trên, rồi **kiểm lại trạng thái, sở hữu và điều kiện dưới khoá**; (2) kiểm quyền/phạm vi (404) làm ở lần đọc thường **và** kiểm lại dưới khoá; (3) mọi giao dịch ghi mở `READ COMMITTED` (Q42; không khoá khoảng chỉ mục, tránh 1213 chéo giữa các lịch khác nhau); (4) luồng trả **kết quả có kiểu** thay vì ném `AppException` bên trong giao dịch, controller đổi sang lỗi API sau commit (nếp `LoginService` A8); (5) `withBookingTransaction` thử lại tối đa 2 lần (tổng 3) khi gặp 1213/1205 **trước commit**, không bao giờ thử lại sau commit; tác dụng phụ (hoàn tiền, mời danh sách chờ, gửi thư trực tiếp) chỉ chạy **sau commit, đúng một lần**; (6) job quét theo lô, **một giao dịch riêng cho mỗi lịch hẹn**, không khoá nhiều lịch cùng lúc.
Không có khoá `tai_khoan` trong luồng đặt lịch: guard đã đọc `trang_thai` tài khoản mỗi request; một tài khoản bị khoá đúng lúc đang đặt chỉ tạo thêm một lịch hợp lệ (vô hại).

### 5.4 Đặt lịch khám (ĐLK b8–b18)

**Kiểm không khoá — `POST /booking/checks` (b8, b11, b12; A2, A3, A4, A6):** đọc thường, **không** đổi dữ liệu. Dùng đúng **bộ luật thuần** `evaluateBookability` mà bước tạo cũng dùng (một chỗ định nghĩa; `BookabilityReader` đọc hàng ở hai chế độ `none`/`locked`), trả `200 { tomTat }` (dịch vụ, chuyên khoa, bác sĩ, chi nhánh, giờ, hồ sơ đi khám, `giaApDung`, `tienCoc`, `chinhSachHoan`) hoặc lỗi đầu tiên theo thứ tự dưới. Đây là kết quả **thông tin** (có thể cũ), quyết định thật nằm ở bước tạo.

**Tạo — `POST /booking/appointments` `{ khungGioId, hoSoNguoiThanId | null, lyDoKham }` (b13–b18):**
1. Ngoài giao dịch: DTO; `SystemConfigService.getOrThrow()`; đọc thường khung giờ ⋈ ca để biết `bac_si_id`. Không có khung giờ ⇒ 404 `KHUNG_GIO_KHONG_TON_TAI`.
2. Giao dịch `READ COMMITTED`: (a) `SELECT khoa_dat_lich_do_no_show FROM benh_nhan WHERE tai_khoan_id = ? FOR UPDATE` (không có hàng ⇒ 403); (b) `lockVisitProfile(em, benhNhanId, hoSoNguoiThanId)`: `missing` ⇒ 404 cùng thân, `inactive` ⇒ 409 `HO_SO_NGUOI_THAN_DA_NGUNG`; (c) `bac_si` `FOR SHARE`; (d) `khung_gio` `FOR UPDATE`.
3. Kiểm, **dừng ở lỗi đầu tiên**, theo thứ tự (mã ở 5.14): khoá no-show (`DAT_LICH_BI_KHOA_NO_SHOW`, A4) → trạng thái khung giờ (`KHUNG_GIO_DA_DAT`/`KHUNG_GIO_DANG_GIU`, A2; hạn giữ chỗ đã qua thì **hết hạn lười**, mục 5.5) → giờ bắt đầu `> now` (`KHUNG_GIO_DA_QUA`, Q5) → bác sĩ khả dụng (`PUBLIC_DOCTOR_CONDITION`: tài khoản đang hoạt động, chuyên khoa đang hoạt động, cặp chi nhánh–dịch vụ còn có; `BAC_SI_KHONG_KHA_DUNG`) và `lich_lam_viec.chi_nhanh_id` = `bac_si.chi_nhanh_id` → khoảng nhận khám của chi nhánh (hàm thuần của `doctor`: `CHI_NHANH_CHUA_KHAI_BAO`/`CHI_NHANH_NGHI`/`CA_KHONG_TON_TAI`/`NGOAI_GIO_HOAT_DONG`, A6) → nghỉ phép (`DoctorLeavePort`, **dưới khoá `bac_si`**: `BAC_SI_NGHI_PHEP`) → vùng bị loại bởi thay đổi chi nhánh đã duyệt (`PendingBranchChangesPort`: `KHUNG_GIO_NGOAI_LICH_MOI`) → hồ sơ đi khám: số lịch đang hoạt động (`VUOT_SO_LICH_HEN_TOI_DA`, Q12), trùng/chồng lấn (`LICH_HEN_TRUNG_THOI_GIAN`, Q10; câu mới `findOverlappingAppointments` trong `appointments/`, so sánh `<=>`, dùng `dich_vu_kham.thoi_luong` **hiện hành** vì `lich_hen` không lưu thời lượng).
4. Giá: `ExamPriceReader.loadRules(em)` → `computeExamPrice(gia_mac_dinh, rules, { chucDanh, soNamKinhNghiem })` (chuỗi decimal; không công thức thứ hai). `tien_coc_snapshot` = `dich_vu_kham.muc_dat_coc`; `chinh_sach_hoan_snapshot` theo Q15.
5. `INSERT lich_hen` (`ChoThanhToan`, `han_thanh_toan` = `toSecond(now)` + `thoi_gian_giu_cho` phút, `chi_nhanh_id` = chi nhánh hiện tại của bác sĩ, `dich_vu_kham_id` = dịch vụ của bác sĩ, `thoi_gian` = `ngay_gio`, `ma_lich_hen` theo Q13); lỗi 1062 trên `khung_gio_dang_giu` ⇒ `KHUNG_GIO_DA_DAT` (lưới an toàn), 1062 trên `ma_lich_hen` ⇒ sinh lại; `UPDATE khung_gio SET trang_thai = 'DangGiuCho', giu_cho_den = :han WHERE khung_gio_id = ? AND trang_thai = 'ConTrong'` phải ảnh hưởng đúng 1 hàng.
6. **Cọc 0đ:** trong cùng giao dịch gọi `PaymentPort.recordZeroPayment` rồi `confirmPaid` nội bộ ⇒ `DaXacNhan`, khung giờ `DaDat`; ghi thông báo xác nhận. **Cọc > 0:** dừng ở `ChoThanhToan`.
7. Commit, trả `201 { maLichHen, trangThai, hanThanhToan, giaApDung, tienCoc, canThanhToan }` (không có `lich_hen_id`). Idempotent theo nghĩa: bấm đúp lần hai bị `LICH_HEN_TRUNG_THOI_GIAN` (cùng hồ sơ, cùng giờ).

### 5.5 Hết hạn giữ chỗ và thanh toán trễ (ĐLK b19, A5)

- **`HoldExpiryJob`** (`@Cron` mỗi phút, `[đề xuất]`; tắt ở `NODE_ENV=test`; test gọi `run(now)`): quét `lich_hen` `ChoThanhToan` có `han_thanh_toan <= :now` theo lô 100 (trần 10 lô, chỉ mục `(trang_thai, han_thanh_toan)`), mỗi lịch **một giao dịch riêng** qua `AppointmentTransitionService.expire`: đọc thường `khung_gio_id` → khoá khung giờ → khoá lịch → kiểm lại `ChoThanhToan` **và** `han_thanh_toan <= now` dưới khoá → `DaHuy` (`ly_do_huy` = hằng, Q6), khung giờ `ConTrong` → sau commit `WaitlistPort.onSlotReleased`. Kết quả có kiểu `Expired` / `NotDue` (đã thanh toán hay đã huỷ giữa chừng) / `Failed`; lỗi một lịch không dừng lượt; con trỏ để lịch lỗi vĩnh viễn không chặn các lịch sau. Hai bản API cùng chạy vẫn đúng (kiểm lại dưới khoá).
- **Hết hạn lười** trong bước tạo: khung giờ `DangGiuCho` có `giu_cho_den <= now` được coi là trống với mọi người; dưới khoá khung giờ, tìm lịch giữ nó (`WHERE khung_gio_dang_giu = ? FOR UPDATE`, thứ tự khung giờ → lịch đúng bảng 5.3) và hết hạn nó **trong cùng giao dịch** rồi giữ lại cho người mới. Nếu hết hạn nhưng **không có lịch** giữ (lời mời danh sách chờ hết hạn mà `waitlist` chưa quét): `booking` đặt lại khung giờ và `waitlist` phải thả có điều kiện (mục 5.10, W3).
- **Thanh toán trễ (Q4):** `confirmPaid` khoá khung giờ rồi lịch, kiểm trạng thái: `ChoThanhToan` ⇒ xác nhận (kể cả quá `han_thanh_toan` khi chưa ai đụng), `DaXacNhan` ⇒ `AlreadyConfirmed` (idempotent), `DaHuy` do hết hạn ⇒ `HetHanGiuCho` (payment hoàn toàn bộ), khác ⇒ `InvalidState`. **Không** bao giờ tin đồng hồ của `payment`.

### 5.6 Huỷ lịch hẹn dùng chung và hoàn cọc (HLH)

**Một dịch vụ** `AppointmentCancellationService.cancel(input): Promise<CancelOutcome>` (xuất từ `AppointmentsModule`; mở giao dịch riêng, **không** nhận `manager` của người gọi vì thứ tự khoá ở 5.3):

```ts
// [đề xuất] — doctor (duyệt nghỉ phép) gọi với actor 'HeThong', reason 'BacSiNghiPhep'
interface CancelInput {
  maLichHen: string;                                  // hoặc lichHenId cho lời gọi nội bộ (job)
  actor:
    | { kind: 'BenhNhan'; accountId: string }
    | { kind: 'LeTan'; accountId: string; chiNhanhId: string }
    | { kind: 'QuanTriVien'; accountId: string; scope: AdminScope }
    | { kind: 'HeThong' };
  reason: 'BenhNhanHuy' | 'LeTanHuy' | 'QtvOverride' | 'HetHanGiuCho' | 'BacSiNghiPhep';
  lyDo?: string;                                      // <= 255, vào `ly_do_huy`
}
type CancelOutcome =
  | { kind: 'Cancelled'; maLichHen: string; hoanCoc: { tyLe: number; soTien: string } | null; khungGioGiaiPhong: boolean }
  | { kind: 'AlreadyCancelled' }                      // idempotent cho batch của doctor
  | { kind: 'NotCancellable'; trangThai: TrangThaiLichHen }   // HLH A1
  | { kind: 'NotFound' };                             // không có / của người khác / ngoài phạm vi: cùng thân 404
```

Luồng: đọc thường (sở hữu/phạm vi, `khung_gio_id`) → khoá khung giờ, khoá lịch → kiểm lại sở hữu + trạng thái ∈ {`ChoThanhToan`, `DaXacNhan`} → tính hoàn (`RefundCalculator`, hàm thuần: **snapshot** chính sách, `thoi_gian`, `now`, tiền cọc đã thu từ `PaymentPort.amountPaid`; Q16, Q17) → `UPDATE lich_hen` (`DaHuy`, `thoi_diem_huy`, `ly_do_huy`) → khung giờ `ConTrong` → ghi thông báo → commit. **Sau commit:** `RefundPort.refund(...)` (wallet cộng ví, ghi `lich_su_hoan_tien`, thử lại tối đa 3 lần cách 5 phút rồi giao Quản trị viên; **lỗi hoàn không hoàn tác việc huỷ**, HLH A3) và `WaitlistPort.onSlotReleased(khungGioId)` (bỏ qua khi lý do là `BacSiNghiPhep`, khi giờ hẹn đã qua, hoặc khi lịch chưa từng chiếm khung giờ). `lich_hen` giữ đủ `thoi_diem_huy`, `tien_coc_snapshot`, `chinh_sach_hoan_snapshot` để `wallet` **tính lại đúng số tiền** nếu tiến trình chết giữa commit và hoàn (`RefundCalculator` xuất ra để dùng chung). Chưa có `payment`/`wallet`: `amountPaid` giả = 0 ⇒ `hoanCoc = null`, huỷ lịch cọc 0đ chạy đủ.

**Ước tính trước khi xác nhận (b3):** `GET /patient/appointments/:maLichHen/cancel-preview` trả `{ choPhepHuy, lyDoKhongHuy?, hoanCoc: { tyLe, soTien, mocApDung } | null }` từ **cùng** `RefundCalculator` (đọc thường, không khoá, kết quả "dự kiến", Q18). Đóng hộp xác nhận không gọi gì (A2).

### 5.7 Cập nhật trạng thái (Lễ tân, QTV), no-show và tự Vắng mặt (CNTT)

- **Lễ tân** `POST /reception/appointments/:maLichHen/status` `{ trangThai: 'DaHuy' | 'VangMat' | 'DaTiepDon', lyDo? }`. Phạm vi: `le_tan.chi_nhanh_id` = `lich_hen.chi_nhanh_id` (ngoài ⇒ 404). Chi tiết lịch hẹn của Lễ tân kèm `chuyenDuoc[]` tính bằng **cùng** hàm ma trận (b2: giao diện chỉ hiện đích hợp lệ, backend vẫn kiểm lại).
  `DaHuy` ⇒ `AppointmentCancellationService` (reason `LeTanHuy`). `DaTiepDon` ⇒ `checkIn`: trạng thái `DaXacNhan`, **`PaymentSummaryPort.remainingToCollect = 0`** (A2: `CON_PHAN_CHUA_THANH_TOAN` kèm số còn phải thu), trong cửa sổ tiếp đón (`NGOAI_KHUNG_GIO_TIEP_DON` kèm khoảng được phép); `payment` (offline) gọi **cùng** `checkIn` với `requireFullyPaid: false` vì nó tự ghi tiền trong giao dịch của nó (quy tắc 46). `VangMat` ⇒ `markNoShow` (sau hết cửa sổ: `CHUA_QUA_GIO_HEN`).
- **`markNoShow`** (cho Lễ tân, QTV, job): đọc thường → khoá `benh_nhan` → khoá `lich_hen` → kiểm lại `DaXacNhan` + điều kiện → `VangMat` → `UPDATE benh_nhan SET so_lan_no_show = so_lan_no_show + 1` rồi đọc lại → nếu số mới `>= nguong_no_show` **và** cờ đang `false` thì đặt `khoa_dat_lich_do_no_show = true` và ghi thông báo khoá (cờ đã bật ⇒ chỉ tăng số lần, không cảnh báo lặp, A4/10b) → thông báo Vắng mặt. Khung giờ **giữ nguyên** `DaDat`; không gọi `WaitlistPort`. `HE_THONG_CHUA_CAU_HINH` ⇒ không đánh (lượt job bỏ qua và ghi cảnh báo, không đoán ngưỡng).
- **Quản trị viên override** `POST /admin/appointments/:maLichHen/override-status` `{ trangThai, lyDo }`: `@RequireAdminScope('Any')`, ngoài phạm vi 404, ma trận Q24, `lyDo` bắt buộc; một giao dịch gồm đổi trạng thái + khung giờ + `AuditService.record(manager, { action: 'OverrideLichHen', targetType: 'lich_hen', targetId, branchId: lich_hen.chi_nhanh_id, changes: { truoc, sau, ly_do } })` + thông báo; audit lỗi ⇒ hoàn tác tất cả. Sang `DaHuy` dùng cùng lõi huỷ (reason `QtvOverride`). Sang `VangMat` cộng no-show như mọi đường khác.
- **`HoanThanh`** không có endpoint ở module này: `doctor` gọi `AppointmentTransitionService.complete(manager, …)` (5.10, D3).
- **`NoShowJob`** (`@Cron` mỗi 5 phút, Q23): câu chọn ứng viên và kiểm lại dưới khoá dùng **cùng một mệnh đề** (hằng SQL): lịch `DaXacNhan` ⋈ `khung_gio` ⋈ `lich_lam_viec` ⋈ `chi_nhanh_lich_hoat_dong` (thứ = `WEEKDAY(ngay) + 1`) với `TIMESTAMP(ngay, giờ kết thúc ca) <= :now` (`:now` truyền vào, **không** `NOW()`). Ca không có khoảng (giờ kết thúc NULL, `CaToi`) ⇒ không tự đánh và đếm vào nhật ký cảnh báo. Câu truy vấn và chỉ mục **chưa đo** (M6).

### 5.8 Ba use case danh sách (TCLS, XDS, XDSPC)

Chỉ đọc; hai câu (`COUNT`, trang) chạy trong **một giao dịch chỉ đọc `REPEATABLE READ`** để `total` và `items` cùng ảnh chụp (nếp `search/common/read-only-tx.ts`; chuyển lên `common/` hoặc viết lại: quyết định ở P1); phân trang `PageQueryDto`/`Paged<T>`; `Cache-Control: no-store`; **danh sách trắng cột**, không `SELECT *`; không log lọc hay kết quả; cột `DATE` qua `DATE_FORMAT`, id BIGINT là chuỗi; `thoi_gian` ra `Date` rồi `toISOString()`.

| | Bệnh nhân (TCLS) | Lễ tân / Quản trị viên (XDS) | Bác sĩ (XDSPC) |
|---|---|---|---|
| Phạm vi (**trong SQL**, không nhận từ client) | `lich_hen.benh_nhan_id = user.accountId` (bản thân + mọi hồ sơ người thân của mình) | Lễ tân: `lich_hen.chi_nhanh_id = le_tan.chi_nhanh_id`; QTV Chi nhánh: chi nhánh được gán; QTV Toàn hệ thống: tuỳ `chiNhanhId` | `lich_hen.bac_si_id = user.accountId` |
| Bộ lọc | `trangThai[]`, `nhom` (`SapToi`/`LichSu`), `hoSoNguoiThanId` (hoặc `BanThan`), `bacSiId`, `chuyenKhoaId`, `tuNgay`, `denNgay`, `q`; trả thêm `demTheoTrangThai` | `chiNhanhId` (chỉ QTV Toàn hệ thống), `chuyenKhoaId`, `bacSiId`, `trangThai[]`, `tuNgay`, `denNgay` | `tuNgay`, `denNgay` (FE tính ngày/tuần/tháng), `trangThai[]` |
| Sắp xếp | Sắp tới: `thoi_gian` tăng; Lịch sử: giảm; rồi `lich_hen_id` | `thoi_gian` (chiều theo Figma), rồi `lich_hen_id` | `thoi_gian` tăng |
| Trường | Q31/B2: mã, trạng thái, giờ, bác sĩ, chuyên khoa, chi nhánh, dịch vụ, người khám, giá, cọc, hạn thanh toán, `choPhepHuy`; chi tiết thêm lý do khám, `thanhToan`/`hoanTien` (null khi chưa có module) | Q32 (danh sách trắng; không email, ngày sinh, địa chỉ) | Q33 (không giá, cọc, SĐT) |
| Ghép từ module khác | `thanhToan`, `hoanTien` từ `payment`/`wallet` qua cổng `[CHỜ payment]` | `conPhaiThu` từ `PaymentSummaryPort` ở chi tiết | "ghi chú khám" từ `ho_so_kham` `[CHỜ doctor]` |

Tên chuyên khoa lấy qua `bac_si.chuyen_khoa_id` hiện tại (L14). `DaDoiLich` ẩn khỏi danh sách Bệnh nhân (Q31) nhưng **hiện** ở Lễ tân/QTV khi lọc đúng trạng thái đó. Tham số mảng (`trangThai`) cách `ValidationPipe` xử lý (lặp khoá hay dấu phẩy) **chưa đo** (M8).

### 5.9 Endpoint (tên `[đề xuất]` — Q43; tiền tố `/api` qua proxy như mọi endpoint)

Mọi route khai `@Roles(...)` **ngay trên từng route** (quét route AR-02 như `QP-08` của patient); chủ sở hữu/phạm vi chỉ từ access token và bảng (`@CurrentUser`, `AdminScopeCtx`, `ReceptionScopeService`), **không có tham số `benhNhanId`/`bacSiId`/`chiNhanhId` nào được tin từ client** (riêng `chiNhanhId` của QTV Toàn hệ thống là bộ lọc, không phải quyền); `Cache-Control: no-store` cho mọi route; lỗi theo mục 5.14.

| Vai trò | Route | Việc | Thân / query | Kết quả | Task |
|---|---|---|---|---|---|
| BN | `GET /booking/eligibility` | Cổng vào luồng (A4/1a–1b) | — | 200 `{ choPhepDatLich, lyDo?, soLichHenToiDaMoiHoSo }` | B7 |
| BN | `POST /booking/checks` | Kiểm không khoá + tóm tắt Bước 5 (b8, b11, b12) | `{ khungGioId, hoSoNguoiThanId? }` | 200 `{ tomTat: { dichVu, chuyenKhoa, bacSi, chiNhanh, thoiGian, nguoiKham, giaApDung, phuPhi, tienCoc, chinhSachHoan, soDuVi? }, thoiGianMayChu }` hoặc lỗi 5.14 | B7 |
| BN | `POST /booking/appointments` | Tạo lịch hẹn + giữ chỗ (b13–b18) | `{ khungGioId, hoSoNguoiThanId?, lyDoKham? }` | 201 `{ maLichHen, trangThai, hanThanhToan, giaApDung, tienCoc, canThanhToan, thoiGianMayChu }` | B8 |
| BN | `GET /patient/appointments` | TCLS | `trangThai[]`, `nhom`, `hoSoNguoiThanId`, `bacSiId`, `chuyenKhoaId`, `tuNgay`, `denNgay`, `q`, `page`, `pageSize` | 200 `{ items, total, page, pageSize, demTheoTrangThai }` | B1 |
| BN | `GET /patient/appointments/:maLichHen` | Chi tiết (kèm `thanhToan`, `hoanTien` = `null` tới khi có module) | — | 200 | B2 |
| BN | `GET /patient/appointments/:maLichHen/cancel-preview` | Ước tính hoàn (b3) | — | 200 `{ choPhepHuy, lyDoKhongHuy?, hoanCoc }` | B10 |
| BN | `POST /patient/appointments/:maLichHen/cancel` | Huỷ (b4–b8), `@HttpCode(200)` | `{ lyDo? }` | 200 `{ maLichHen, trangThai: 'DaHuy', hoanCoc }` | B10 |
| LT | `GET /reception/appointments` | XDS (chi nhánh của Lễ tân) | Q32 | 200 `Paged` | B3 |
| LT | `GET /reception/appointments/:maLichHen` | Chi tiết + `chuyenDuoc[]` + `conPhaiThu` | — | 200 | B3 |
| LT | `POST /reception/appointments/:maLichHen/status` | CNTT (`DaHuy`/`VangMat`/`DaTiepDon`), `@HttpCode(200)` | `{ trangThai, lyDo? }` | 200 `{ maLichHen, trangThai }` | B12 |
| QTV | `GET /admin/appointments`, `GET /admin/appointments/:maLichHen` | XDS (`@RequireAdminScope('Any')`) | Q32 | 200 | B4 |
| QTV | `POST /admin/appointments/:maLichHen/override-status` | CNTT override, `@HttpCode(200)` | `{ trangThai, lyDo }` | 200 `{ maLichHen, trangThai }` | B14 |
| BS | `GET /doctor/appointments`, `GET /doctor/appointments/:maLichHen` | XDSPC | Q33 | 200 | B5 |

Tham số `:maLichHen` đi qua một `Pipe` chuẩn hoá chữ hoa (collation không phân biệt hoa/thường, H17) và kiểm dạng; sai dạng ⇒ 404 cùng thân (patient Q27). Thân yêu cầu chỉ nhận đúng khoá khai (`forbidNonWhitelisted`).

### 5.10 **Hợp đồng với module song song `doctor` (và cổng với các module khác)** — `[đề xuất]`, đối chiếu hai PLAN TRƯỚC khi tạo issue

**A. Với `doctor` (Trung).** Tên và hình dạng ở hai PLAN phải **trùng**; chỗ nào doctor đề xuất khác thì sửa một bên rồi ghi vào TRACKING mục 3 của cả hai module.

| # | Điểm giao tiếp | Ai làm / ai gọi | Tên và chữ ký | Kết quả, lỗi | Ghi chú |
|---|---|---|---|---|---|
| D1 | **Sinh `khung_gio`** từ `lich_lam_viec` (nối liền theo `dich_vu_kham.thoi_luong`, phần dư cuối khoảng bỏ) | `doctor` sở hữu; booking **không** gọi | `SlotGeneratorService` (`apps/api/src/scheduling/`) | Chỉ `INSERT` khung giờ `ConTrong` | Quy tắc 29, 39. Phải dùng đúng D2 để sinh và để kiểm |
| D2 | **Bộ luật "khung giờ nằm trọn trong một khoảng nhận khám của ca"** | `doctor` định nghĩa; `booking` và `search` GỌI | `checkSlotWithinBranchHours({ ngayGio: Date, thoiLuongPhut: number, ca: CaLamViec, ngayHoatDong: BranchDayHours \| null }): { ok: true } \| { ok: false, lyDo: 'ChuaKhaiBao' \| 'NgayNghi' \| 'CaKhongTonTai' \| 'NgoaiGioHoatDong', chiTiet: { thuTrongTuan: number, gioMo?: string, gioDong?: string } }` (hàm thuần) và `BranchHoursReader.load(em, chiNhanhId, thuTrongTuan): Promise<BranchDayHours \| null>` | Mã lý do = mã quy tắc 29; booking đổi sang mã API ở 5.14 | Booking **kiểm lại dưới khoá** bằng đúng hàm này (A6); không tự viết lần hai |
| D3 | **Đọc "khung giờ còn trống"** cho giao diện | `doctor` sở hữu; `search` K1 gọi | `AvailableSlotsReader.list({ bacSiId, ngay }, em?)`: `{ trangThaiNgay, khungGio: [{ khungGioId, batDau, ketThuc, ca, trangThai }] }` | Trạng thái suy ra theo Q3 (`HetHan` khi quá giờ; hết hạn giữ chỗ coi là `ConTrong`); **có `khungGioId`** (Q8) | Booking **không** gọi hàm này trong luồng ghi (chỉ D2 + khoá) |
| D4 | **Nghỉ phép chặn khung giờ** | `doctor` sở hữu bảng `yeu_cau_nghi_phep` (migration, entity); booking dùng qua cổng | `LeaveReader.findBlockingLeave(em, { bacSiId, ngay, ca }): Promise<{ yeuCauNghiPhepId: string, trangThai: 'ChoDuyet' \| 'DaDuyet' } \| null>`; booking bọc bằng `DoctorLeavePort.findBlocking` | Cả `ChoDuyet` và `DaDuyet` chặn (cùng định nghĩa "còn trống") ⇒ `BAC_SI_NGHI_PHEP` | Tới khi doctor có: `NoopDoctorLeavePort` (không chặn) **có test và có cảnh báo trong TRACKING** |
| D5 | **Đồng bộ duyệt nghỉ ↔ đặt lịch** (H5) | `doctor` gọi `booking` | `DoctorLeaveApprovalService.approve`: (1) giao dịch: **`bac_si` `FOR UPDATE`**, kiểm lại yêu cầu, đặt `DaDuyet`, commit; (2) sau commit: `AppointmentQueries.findAffectedByLeave(em, { bacSiId, tuNgay, denNgay, ca? }): Promise<{ lichHenId: string, maLichHen: string }[]>` (lịch `ChoThanhToan`/`DaXacNhan` có khung giờ rơi vào khoảng nghỉ, `ca` lấy từ `lich_lam_viec` của khung giờ) rồi với mỗi lịch `AppointmentCancellationService.cancel({ maLichHen, actor: { kind: 'HeThong' }, reason: 'BacSiNghiPhep', lyDo })` (giao dịch riêng mỗi lịch) | `Cancelled` / `AlreadyCancelled` (coi là thành công) / `NotCancellable` (đã tiếp đón…: báo Admin) / `NotFound` | **Bắt buộc** doctor khoá X `bac_si` TRƯỚC khi đổi trạng thái yêu cầu; booking khoá `FOR SHARE` và kiểm lại D4 dưới khoá. Hệ quả: lịch vừa tạo hoặc bị thấy và huỷ ở bước (2), hoặc đặt lịch thấy nghỉ đã duyệt và từ chối (DT-09). Hoàn cọc 100% và không mời danh sách chờ (Q17). **Yêu cầu thêm cho `doctor` (phiên kiểm 08/11/2026):** bước (2) (huỷ hàng loạt sau commit duyệt) có thể bị dừng giữa chừng, ví dụ tiến trình chết sau khi `DaDuyet` đã commit; `doctor` PHẢI có cách **chạy lại idempotent** (ví dụ job quét yêu cầu `DaDuyet` còn lịch bị ảnh hưởng, hoặc gọi lại `findAffectedByLeave` khi quản trị viên bấm lại); `cancel` đã idempotent (`AlreadyCancelled`) nên chạy lại không hoàn tiền hai lần (DT-17). Mục này vào danh sách đối chiếu với PLAN `doctor` |
| D6 | **Xác nhận hoàn thành ca khám** | `doctor` gọi `booking` (booking là chủ máy trạng thái) | `AppointmentTransitionService.complete(em, { lichHenId, bacSiId }): Promise<{ kind: 'Completed' } \| { kind: 'NotAssigned' } \| { kind: 'InvalidState', trangThai }>` chạy trong giao dịch của doctor (khoá `lich_hen` trước khi ghi hồ sơ khám; không đụng khung giờ) | `HoanThanh` chỉ qua hàm này; test AR-01 cấm `UPDATE lich_hen` nơi khác | Doctor nhận `maLichHen`/`lichHenId` từ `AppointmentQueries.findForDoctor` |
| D7 | **Quy tắc ghi `khung_gio`** | cả hai | `doctor`: chỉ `INSERT` khung giờ mới và chỉ `DELETE` khi `trang_thai = 'ConTrong'` (sau `FOR UPDATE` đúng hàng đó); **không** `UPDATE` `trang_thai`/`giu_cho_den`. `booking`: không `INSERT`/`DELETE`, chỉ `UPDATE` trạng thái qua `SlotHoldService` | Khoá ngoại `lich_hen.khung_gio_id` chặn xoá khung giờ đã có lịch | Cùng thứ tự khoá 5.3 |
| D8 | **Trang Bác sĩ "Lịch hẹn"** | `booking` làm trang, `doctor` gắn vào khung Bác sĩ | `DoctorAppointmentsPage` và `DOCTOR_APPOINTMENT_ROUTES` xuất từ `features/booking/index.ts`; doctor thêm route vào khung Bác sĩ (`router/role-routes.tsx`) và đặt `to` ở menu Bác sĩ | | `[PHỤ THUỘC doctor shell]`; ghi vào cả hai PLAN chỗ sửa `router/` để hai người không đụng nhau |
| D9 | **Seed** | `doctor` seed `lich_lam_viec` + `khung_gio` (bằng D1) cho các bác sĩ `search-demo`; `booking` seed `moc_hoan_tien` minh hoạ và một dịch vụ cọc > 0 | lệnh seed riêng, idempotent như `search-demo` | | Q41; test tự động không dùng seed |
| D10 | **`khungGioId` trong K1 và handoff** | `doctor`/`search` trả; `booking` nhận | trường `khungGioId` (chuỗi) cho mỗi khung giờ; URL điểm vào `?khungGioId=` | | Q8; sửa PLAN `search` 5.6 |
| D11 | **Khoá `bac_si`** | cả ba (admin, doctor, booking) | admin đổi chi nhánh bác sĩ và doctor duyệt nghỉ: `FOR UPDATE`; booking tạo lịch: `FOR SHARE` | | Một thứ tự: tầng 4 của bảng 5.3 |
| D12 | **Ca và chi nhánh của khung giờ** | doctor bảo đảm khi phân công | `lich_lam_viec.chi_nhanh_id` = `bac_si.chi_nhanh_id` tại lúc đặt; lệch ⇒ booking từ chối `KHUNG_GIO_KHONG_HOP_LE` | | Admin đã chặn đổi chi nhánh khi còn ca tương lai (quy tắc 13) |

**B. Cổng với các module khác** (đặt ở `appointments/ports/`, mỗi cổng có token DI, bản `Noop`/`Fake` **có test**; module thật override bằng `useExisting` khi có):

| Module | Cổng / hàm | Chữ ký `[đề xuất]` | Hiện tại (mặc định) | Ghi chú cho PLAN của module đó |
|---|---|---|---|---|
| `payment` | `PaymentPort`, `PaymentSummaryPort` | `recordZeroPayment(em, { lichHenId, benhNhanId }): Promise<void>`; `amountPaid(em, lichHenId): Promise<string>` (tiền cọc đã thu `ThanhCong` của **lịch gốc** chuỗi đổi lịch); `remainingToCollect(em, lichHenId): Promise<string>` (≥ 0) | `recordZeroPayment` không ghi gì; `amountPaid` = `"0.00"`; `remainingToCollect` = `gia_snapshot` | `payment` gọi **`AppointmentTransitionService.confirmPaid(em, { lichHenId, soTienDaThu })`** trong giao dịch của nó; **khoá `lich_hen` TRƯỚC `vi_noi_bo`** (tầng 6 trước tầng 7); thanh toán offline gọi `AppointmentTransitionService.checkIn(em, …, { requireFullyPaid: false })` trong giao dịch tiền mặt (quy tắc 46); `confirmPaid` trả `{ kind: 'Confirmed' } \| { kind: 'AlreadyConfirmed' } \| { kind: 'HetHanGiuCho' } \| { kind: 'InvalidState', trangThai }`: `HetHanGiuCho` ⇒ hoàn toàn bộ vào ví (Q4); trang Bước 5 Thanh toán là việc của payment (F6 chỉ dựng chỗ gắn) |
| `wallet` | `RefundPort`, `WalletBalancePort` | `refund({ lichHenId, soTien, lyDo }): Promise<{ kind: 'Refunded' \| 'Failed' \| 'NotNeeded' }>` (**sau commit**); `available(benhNhanId): Promise<string \| null>` (hiển thị Bước 5) | `refund` trả `NotNeeded`; `available` trả `null` | `wallet` cộng ví, ghi `lich_su_hoan_tien` (mỗi lần thử một dòng), thử lại tối đa 3 lần cách 5 phút rồi giao Quản trị viên (HLH A3); cần quét "lịch `DaHuy` có cọc đã thu mà chưa có hoàn `ThanhCong`" và **dùng `RefundCalculator` + `thoi_diem_huy` để tính lại đúng số tiền** nếu tiến trình chết giữa commit và hoàn |
| `waitlist` | `WaitlistPort`, `SlotHoldService` | `onSlotReleased(khungGioId): Promise<void>` (sau commit; chỉ khi khung giờ còn ở tương lai và lý do ≠ `BacSiNghiPhep`); `holdForInvitation(em, { khungGioId, den })`, `releaseInvitationHold(em, { khungGioId, den })` (thả **có điều kiện** `giu_cho_den = den`) | `onSlotReleased` không làm gì | W3: mọi ghi `khung_gio` đi qua `SlotHoldService`; lời mời hết hạn mà `waitlist` chưa quét thì booking vẫn đặt lại khung giờ được (mục 5.5), nên `waitlist` thả có điều kiện, **không** thả mù. Việc đổi lời mời thành lịch hẹn để PLAN `waitlist` thiết kế |
| `notification` / admin B9 | `AppointmentNotifier` | `notify(em, event: AppointmentEvent): Promise<void>` (ghi trong giao dịch) | Ghi `thong_bao` (+ `email_thong_bao`) theo Q29 khi quyết xong; trước đó `Noop` | Worker gửi và thử lại 3 lần/5 phút là của `notification`/admin B9; mã sự kiện ở 5.12 |
| `admin` B10 | `PendingBranchChangesPort` | `findBlocking(em, { chiNhanhId, ngayGio, thoiLuongPhut, dichVuKhamId }): Promise<{ yeuCauThayDoiChiNhanhId: string } \| null>` (bọc `getPendingEffectiveChanges`, kể cả yêu cầu **quá hạn**) | `Noop` (không chặn) có test, cảnh báo ở TRACKING | Chặn **đặt và đổi lịch** (admin Q6, Q48); đổi lịch để lần sau |
| `admin` | `moc_hoan_tien`, `ExamPriceReader`, `SystemConfigService`, `AuditService` | đọc mốc hoàn lúc đặt (Q15); `ExamPriceReader` chuyển sang `pricing/` (P3); `OverrideLichHen` (B14) | | `[ĐỤNG admin]`, `[ĐỤNG search]`, `[ĐỤNG audit]` |
| `rbac` | `ReceptionScopeService` | `resolve(accountId): Promise<{ chiNhanhId: string }>` | | `[ĐỤNG rbac]` (Q34) |
| `patient` | Hợp đồng khoá, `appointments/` | Mục 5.3; X3 chạy KT-01…KT-05 | | Báo Đại; không đổi hành vi ba file đã có |
| module đổi lịch (sau) | `markReplaced` | `AppointmentTransitionService.markReplaced` (`DaXacNhan` → `DaDoiLich` cùng giao dịch tạo lịch mới) | chưa có | Ghi để module sau không viết `UPDATE` riêng (H7) |

**C. Việc chờ module khác — tóm tắt:** làm ngay không chờ ai: ma trận, ba use case danh sách (dữ liệu tự dựng/seed), huỷ lịch cọc 0, tạo lịch với cọc 0 (khung giờ từ fixture/seed), hết hạn giữ chỗ, cập nhật trạng thái của Lễ tân trừ tiếp đón, Vắng mặt tự động, override (cần `OverrideLichHen` ở audit). Chờ `doctor`: khung giờ thật, nghỉ phép (D4, D5), `khungGioId` ở K1, trang Bác sĩ. Chờ `payment`: cọc > 0, tiếp đón (còn phải thu), `thanhToan` ở chi tiết, trang Thanh toán. Chờ `wallet`: hoàn cọc, số dư ví. Chờ `waitlist`: mời danh sách chờ. Chờ `notification`: thư và thông báo thật. Chờ `admin` B10 và `moc_hoan_tien`: chặn vùng bị loại; cọc > 0 có chính sách.

### 5.11 Giá, snapshot, mã lịch hẹn

- **Giá:** `giaApDung = computeExamPrice(dich_vu_kham.gia_mac_dinh, rules, { chucDanh, soNamKinhNghiem })` (chuỗi decimal, BigInt, `pricing/`); lưu `gia_snapshot` = `giaApDung`, `tien_coc_snapshot` = `muc_dat_coc`; **không** lưu riêng phụ phí (Q46). Tính **một lần** lúc tạo; sửa giá, phụ phí, chức danh sau đó không đổi lịch đã đặt (quy tắc 11).
- **`chinh_sach_hoan_snapshot`:** `NULL` khi `muc_dat_coc = 0`; ngược lại mảng `[{ "so_gio_truoc_toi_thieu": 24, "ty_le_hoan": 100 }, …]` sắp theo `so_gio_truoc_toi_thieu` giảm dần, đọc từ `moc_hoan_tien` cùng giao dịch (Q15). `RefundCalculator` đọc **chỉ** snapshot.
- **Mã lịch hẹn:** `generateAppointmentCode(now: Date, random: (n: number) => string)` (hàm thuần, nhận bộ sinh ngẫu nhiên để test): `CLX-` + `yyyyMMdd` của `todayVN(now)` + `-` + 5 ký tự Crockford base32 chữ hoa (bỏ I, L, O, U) từ `crypto.randomInt`; sinh lại tối đa 5 lần khi `ma_lich_hen` trùng (1062); hết 5 lần ⇒ 500 `LOI_HE_THONG` (không thể xảy ra thực tế: 32^5 ≈ 33,5 triệu mã mỗi ngày).
- **Thời gian:** mọi `now` từ `nowVN()` rồi `toSecond()`; `han_thanh_toan`/`giu_cho_den` cùng một giá trị; so sánh nửa mở.

### 5.12 Thông báo và email (mức tối thiểu của module; Q29, Q30)

| Sự kiện (`loai_su_kien` `[đề xuất]`) | Khi nào (ghi **trong** giao dịch đổi trạng thái) | Gửi cho | Mẫu Figma | Ghi chú |
|---|---|---|---|---|
| `LichHenDaXacNhan` | `confirmPaid`, hoặc cọc 0đ lúc tạo | tài khoản đặt | `573:2` Xác nhận đặt lịch | `Người được khám` hiện "(đặt hộ)" khi là hồ sơ người thân; chỉ `Tổng giá`, cọc, còn lại (Q46) |
| `LichHenDaHuy` | huỷ, trừ hết hạn giữ chỗ (Q6) | tài khoản đặt | `676:2` Hủy lịch hẹn (3 biến thể theo `reason`) | kèm "hoàn dự kiến" (Q18); email hoàn tiền thực tế (`680:2`) do `wallet` gửi |
| `LichHenVangMat` | `markNoShow` | tài khoản đặt | `686:2` Ghi nhận vắng mặt | |
| `KhoaDatLichNoShow` | cờ chuyển `false` → `true` | tài khoản đặt | `687:2` Hạn chế đặt lịch do no-show | **không lặp** khi cờ đã bật (A4/10b) |

`thong_bao.noi_dung` ≤ 500 ký tự, không chứa lý do khám; thư dựng trên `renderMailShell` (không script, ảnh, font ngoài, liên kết, thẻ `style`), mọi dữ liệu qua `toSingleLine` rồi `escapeHtml`; không log địa chỉ, tiêu đề, nội dung. Lỗi gửi **không** hoàn tác lịch hẹn (H12). Nhắc lịch (`nhac_lich_hen`), Trung tâm thông báo (màn xem) **không** thuộc module này.

### 5.13 Frontend: luồng 6 bước, dữ liệu giữa bước, chỗ cắm

**Cấu trúc:** `apps/web/src/features/booking/` (`index.ts` là bề mặt duy nhất; `features/` không import chéo, chỉ import `features/auth` qua `index.ts`): `api/` (client gọi `request()`, kiểu dữ liệu), `wizard/` (khung, thanh bước, context, Bước 4–6), `appointments/{patient,reception,admin,doctor}/`, `testing/` (`fake-booking-api.ts`). Đường dẫn định nghĩa một chỗ (`booking-paths.ts`): gốc `BOOKING_PATH` hiện ở `features/search/search-paths.ts` ⇒ **P5 chuyển hằng này vào `shared/`** (`[ĐỤNG search]`, một file nhỏ) để `features/booking` dùng được.

**Luồng (khung công khai, Q36):** Bước 1–3 đã có (search). Bước 4 `/dat-lich/thong-tin?khungGioId=…` (cần `RequireAuth` vai `BenhNhan`; `GET /booking/eligibility` chặn từ đầu nếu khoá no-show: A4), Bước 5 `/dat-lich/xac-nhan?khungGioId=…` (`POST /booking/checks` lấy tóm tắt; nút gọi `POST /booking/appointments`; cọc 0đ đi thẳng Bước 6), Bước 5 Thanh toán `/dat-lich/thanh-toan/:maLichHen` (đếm ngược; thân trang là của `payment`), Bước 6 `/dat-lich/hoan-tat/:maLichHen`. Tên đường dẫn `[đề xuất]`. **Không trang nào giữ chỗ khi vừa chuyển trang** (A1/1-8b).

**Dữ liệu giữa các bước (Q38):** lựa chọn Bước 1–3 nằm trên URL (id); hồ sơ đi khám và lý do khám nằm trong context của trang (bộ nhớ, **không** `localStorage`/`sessionStorage`); Bước 5 mở thẳng không có context ⇒ chuyển về Bước 4. Bước Thanh toán/Hoàn tất luôn tải từ `GET /patient/appointments/:maLichHen` (tải lại an toàn, không lưu gì ở trình duyệt).

**Đếm ngược:** tính từ `hanThanhToan` và `thoiGianMayChu` trong phản hồi (bù lệch đồng hồ máy khách), cập nhật mỗi giây nhưng chỉ đọc cho trình đọc màn hình ở các mốc (`aria-live="polite"`, không đọc từng giây); về 0 thì tải lại chi tiết và hiện trạng thái đã hết hạn (lịch `DaHuy` hoặc đã xác nhận nếu thanh toán vừa xong). Hết hạn ở phía server là quyết định cuối: giao diện **không** tự coi lịch đã huỷ.

**Chỗ cắm (ghi rõ để không đụng nhau):** `router/routes.tsx` (route Bước 4–6 trong `PublicLayout`, bọc `RequireAuth` `BenhNhan`) `[ĐỤNG router]`; `router/role-routes.tsx` (thêm route con của `BenhNhan` và `LeTan` cạnh `PATIENT_ROUTES`/`RECEPTION_ROUTES`; thêm route Admin bọc `AdminScopeGuard` ở lớp router, không import chéo trong `features/admin`) `[ĐỤNG router]`; `router/role-nav.ts` (`to` cho "Lịch hẹn của tôi", "Quản lý lịch hẹn") `[ĐỤNG router]`; `features/admin/components/admin-sidebar.tsx` (`to` cho "Lịch hẹn") `[ĐỤNG admin]`; `features/patient/relatives/relative-errors.ts` (nối liên kết "Lịch hẹn của tôi" khi huỷ lịch chặn ngừng hồ sơ) `[ĐỤNG patient]`. Menu Bác sĩ do `doctor`.

**Làm được trước khi `doctor`/`search` xong:** F1, F2 (Lịch hẹn của tôi), F8–F10 (Lễ tân, Admin) chỉ cần API đọc và dữ liệu tự dựng; F3–F7 chạy trên API đặt lịch thật với khung giờ dựng bằng seed/fixture (Q40) — chỉ **chọn khung giờ** (Bước 3) phải chờ K2 của `search`.

Trạng thái loading/rỗng/lỗi/mất mạng/timeout: dùng `loading-state`, `error-state`, `empty-state`, `offline-banner`; `POST` đặt lịch và huỷ vô hiệu hoá nút khi đang gửi (chống bấm đúp), kiểm `usePageActive()` sau mỗi `await` trước khi chuyển trang; thông báo chọn theo **`maLoi`**, không theo mã HTTP. Màu theo token (ADR 0004), không chép màu Figma lệch tương phản (mục 4.4).

### 5.14 Mã lỗi → thông báo (câu chữ `[đề xuất]`; nhóm duyệt và đưa vào Figma)

Mã viết `HOA_GACH_DUOI`, chỉ 4xx (503 chỉ cho lỗi dịch vụ phía sau tạm thời); lỗi UNIQUE/FK/deadlock đã lường trước **không** ra 500. Mã chung đã có: `KHONG_TIM_THAY` (404), `KHONG_DU_QUYEN` (403), `HE_THONG_CHUA_CAU_HINH` (409), `HO_SO_NGUOI_THAN_DA_NGUNG` (409, của patient).

| Mã | HTTP | Nhánh | Thông báo cho người dùng |
|---|---|---|---|
| `KHUNG_GIO_KHONG_TON_TAI` | 404 | khung giờ không có | Không tìm thấy khung giờ này. |
| `KHUNG_GIO_DA_DAT` | 409 | A2 (đã đặt; cả lỗi 1062) | Khung giờ này vừa có người đặt. Vui lòng chọn khung giờ khác. |
| `KHUNG_GIO_DANG_GIU` | 409 | A2 (đang giữ chỗ) | Khung giờ này đang được người khác giữ chỗ. Vui lòng chọn khung giờ khác hoặc thử lại sau ít phút. |
| `KHUNG_GIO_DA_QUA` | 409 | A3/11a | Khung giờ này đã qua. Vui lòng chọn khung giờ khác. |
| `KHUNG_GIO_KHONG_HOP_LE` | 409 | ca/chi nhánh lệch bác sĩ (D12) | Khung giờ này không còn hợp lệ. Vui lòng chọn lại. |
| `CHI_NHANH_CHUA_KHAI_BAO` | 409 | A6 | Chi nhánh chưa công bố giờ nhận khám vào ngày này. |
| `CHI_NHANH_NGHI` | 409 | A6 | Chi nhánh nghỉ vào Thứ {thứ}. |
| `CA_KHONG_TON_TAI` | 409 | A6 | Chi nhánh không nhận khám vào buổi này. |
| `NGOAI_GIO_HOAT_DONG` | 409 | A6 | Ngoài giờ hoạt động, chi nhánh mở cửa từ {giờ mở} đến {giờ đóng}. |
| `BAC_SI_NGHI_PHEP` | 409 | nghỉ phép (D4) | Bác sĩ nghỉ vào thời gian này. Vui lòng chọn khung giờ khác. |
| `BAC_SI_KHONG_KHA_DUNG` | 409 | tài khoản/chuyên khoa/dịch vụ không khả dụng | Bác sĩ hiện không nhận đặt lịch. |
| `KHUNG_GIO_NGOAI_LICH_MOI` | 409 | thay đổi chi nhánh đã duyệt (H6) | Chi nhánh sắp thay đổi lịch nhận khám nên không nhận đặt vào khung giờ này. |
| `DAT_LICH_BI_KHOA_NO_SHOW` | 403 | A4 | Tài khoản đang bị khoá đặt lịch trực tuyến do vắng mặt nhiều lần. Vui lòng liên hệ Lễ tân hoặc Quản trị viên. |
| `VUOT_SO_LICH_HEN_TOI_DA` | 409 | A3/11a (`chiTiet.toiDa`) | Hồ sơ này đã có {n} lịch hẹn đang hoạt động, là mức tối đa. |
| `LICH_HEN_TRUNG_THOI_GIAN` | 409 | A3/11a (`chiTiet.maLichHen`, `thoiGian`) | Hồ sơ này đã có lịch hẹn {mã} trùng thời gian. |
| `LY_DO_KHAM_KHONG_HOP_LE` | 400 | b10 | Lý do khám không hợp lệ (tối đa 500 ký tự). |
| `LICH_HEN_KHONG_CHO_HUY` | 409 | HLH A1 (`chiTiet.trangThai`) | Lịch hẹn đang ở trạng thái {…} nên không thể hủy. |
| `CHUYEN_TRANG_THAI_KHONG_HOP_LE` | 409 | CNTT, override | Không thể chuyển lịch hẹn từ {…} sang {…}. |
| `CHI_BAC_SI_HOAN_THANH` | 409 | CNTT A1 | Trạng thái Hoàn thành chỉ do Bác sĩ chuyển sau khi hoàn tất ca khám. |
| `CON_PHAN_CHUA_THANH_TOAN` | 409 | CNTT A2 (`chiTiet.conPhaiThu`) | Lịch hẹn còn {số tiền} chưa thanh toán. Vui lòng thu tiền tại quầy trước khi tiếp đón. |
| `NGOAI_KHUNG_GIO_TIEP_DON` | 409 | cửa sổ tiếp đón (`chiTiet.tu`, `den`) | Chỉ tiếp đón từ {…} đến {…}. |
| `CHUA_QUA_GIO_HEN` | 409 | Vắng mặt sớm | Chưa hết thời gian tiếp đón nên chưa thể đánh dấu vắng mặt. |
| `LY_DO_BAT_BUOC` | 400 | Lễ tân huỷ, QTV override | Vui lòng nhập lý do (tối đa 255 ký tự). |
| `TU_KHOA_KHONG_HOP_LE` | 400 | `q` | Từ khoá tìm kiếm không hợp lệ. |

Mã nội bộ không ra HTTP: `HetHanGiuCho` (kết quả `confirmPaid`). Lỗi DTO dùng `VALIDATION_CODES` của auth P5.

### 5.15 Kiểm thử, việc phải **đo thật** trước khi viết mã, dữ liệu mẫu

**Tầng test** (mỗi test ghi mã ở mục 7): thuần (`*.spec.ts`: ma trận, `RefundCalculator`, `generateAppointmentCode`, `evaluateBookability`, bộ lọc DTO); tích hợp MySQL thật (`*.int-spec.ts`: khoá, chạy đua, bất biến INV-1…INV-5, job); e2e qua `configureApp(app)` + `expectErrorResponse` (`apps/api/test/booking-*.e2e-spec.ts`); web `*.test.tsx` (dùng `fake-booking-api`, dựng `fetch` giả cho trang `lazy`). Hạ tầng test dùng chung ở `appointments/testing/` (H18): `booking-fixtures.ts` (dựng bác sĩ + ca + khung giờ đặt được + bệnh nhân + hồ sơ người thân + cấu hình bằng `AdminFixtures`), `concurrency-harness.ts` (chạy N giao dịch song song có rào đồng bộ), `invariants.ts` (INV-1…INV-5), `fake-ports.ts`. Đồng hồ giả của Vitest cho mọi ca thời gian; **không chạy hai vitest cùng lúc trên cùng DB test**; Node 22.x.

**Việc phải đo thật (ghi "cần đo", chưa đo; kết quả vào TRACKING và cập nhật PLAN):**

| # | Cần đo | Vì sao |
|---|---|---|
| M1 | Tỉ lệ 1213/1205 của luồng tạo với 2/5/10 yêu cầu cùng khung giờ, và nhiều bệnh nhân khác nhau cùng bác sĩ, ở `READ COMMITTED` so với `REPEATABLE READ` | Q42; thứ tự khoá 5.3 |
| M2 | Lỗi 1062 của cột sinh `khung_gio_dang_giu` và của `ma_lich_hen`: `errno`, nội dung phân biệt hai khoá | Ánh xạ `KHUNG_GIO_DA_DAT` và sinh lại mã |
| M3 | `innodb_lock_wait_timeout` (mặc định 50 giây) so với trải nghiệm: một giao dịch giữ khoá khung giờ thì giao dịch kia chờ bao lâu rồi 1205 | Có cần `SET SESSION innodb_lock_wait_timeout` ngắn cho giao dịch đặt lịch |
| M4 | Múi giờ: tham số `Date` (`:now`) so với cột `datetime` qua driver (`DB_TIMEZONE` +07:00, `SET time_zone` mỗi kết nối); biên nửa mở `han_thanh_toan = now` | H8 |
| M5 | `EXPLAIN` truy vấn quét hết hạn `(trang_thai, han_thanh_toan)` với ≥ 100.000 hàng | Chi phí job mỗi phút |
| M6 | `EXPLAIN` và đúng/sai của truy vấn Vắng mặt (4 bảng, `WEEKDAY(ngay) + 1`, giờ kết thúc NULL) | Q23 |
| M7 | Cột JSON `chinh_sach_hoan_snapshot` đọc qua SQL thô ra object hay chuỗi; ghi bằng tham số | H13 |
| M8 | `ValidationPipe`: `trangThai` lặp khoá hay dấu phẩy, query lạ với `forbidNonWhitelisted`, `maLichHen` chữ thường | Hợp đồng DTO |
| M9 | Collation `ma_lich_hen` không phân biệt hoa/thường khi tra cứu | H17 |
| M10 | Cơ chế "quay lại trang trước sau đăng nhập" của auth F3 (`from` trong state?) | Q39 |
| M11 | Chỉ mục có được dùng khi `ho_so_nguoi_than_id <=> ?` với hồ sơ bản thân (`NULL`) trong câu kiểm chồng lấn | Chi phí khoá `benh_nhan` giữ lâu |

**Dữ liệu mẫu (Q41):** test tự động tự dựng bằng `booking-fixtures`; demo dùng seed của `doctor` (lịch + khung giờ cho bác sĩ `search-demo`) cộng seed `booking` (mốc hoàn minh hoạ, một dịch vụ cọc > 0 với số `[cần điền]`). Không ghi mật khẩu/khoá thật vào seed (AGENTS mục 1.3).

## 6. Kế hoạch task

### 6.1 Sơ đồ phụ thuộc (cùng một hàng = làm song song được)

```
Nền đã có: auth A1–A15 + web F1–F5 · patient B1–B6, F1–F4, F6, F7 (khung Bệnh nhân/Lễ tân, appointments/ của B5) · search (API công khai + bước 1–3 web)
           admin (entity/migration lich_hen…, system-config, rbac, audit) · pricing/ · ScheduleModule (1 lần) · seed catalog/config-dev/search-demo

Cụm 0 (đo + nền):    X1 đo M1–M11 (trước khi viết lõi) ┐
                     P1 ── P2 ──┬── P3 (ExamPriceReader) · P4 (ReceptionScope) · P5 (web paths) · P6 (moc_hoan_tien) · P7 (thong_bao.lich_hen_id) · P8 (D2, nếu doctor chưa làm)
Cụm 1 (đọc):         B1 ─ B2 ─ F1 ─ (F2 phần đọc)          [P1, P2, P5]
                     B3 ─ B4 ─ F8 ─ F10 (phần đọc)         [P1, P2, P4]
                     B5 ─ F11                              [PHỤ THUỘC doctor shell]
Cụm 2 (lõi):         B6 ── B7 ── B8 (tạo lịch, cọc 0 xác nhận ngay)
                     B6 ── B9 (hết hạn giữ chỗ + khung AppointmentTransitionService) ── B10 (huỷ dùng chung + hoàn) ── F2 (huỷ)
                     B9 ── B11 (confirmPaid, complete, findAffectedByLeave)
Cụm 3 (đặt lịch FE): P5 ─ F3 ─ F4 ─ F5 ─ F7 ;  F6 [CHỜ payment]
Cụm 4 (vận hành):    B12 ─ B13 ;  B12 ─ B14 ─ F9 ─ F10 (override)
Cụm 5 (thông báo):   P7 ─ B15
Cụm 6 (chờ module):  B16 [CHỜ doctor D4/D5, admin B10] · B17 [CHỜ payment, wallet, waitlist]
Tài liệu:            D1 (sau Q7, Q8) · D2 (đi cùng B8, B10, B12, B14) · D3 (cuối)
Hoàn tất:            X2 kiểm tay ─ X3 (cặp với patient X3) ─ X4 tổng kết
```

Cột trạng thái: ☐ = chưa làm, ☑ = đã merge. Rà lại 08/11/2026: **chưa task nào làm**. Mọi task `[CHỜ Qn]` làm được phần độc lập (giá trị tạm theo đề xuất) nhưng **không merge** khi câu hỏi chưa được trả lời.

### 6.2 Nhóm P — Tiền đề

| ☐ | ID | Việc (file; chạm ngoài module; việc phải đo) | Phụ thuộc | Truy vết | Thẻ / PR gợi ý |
|---|---|---|---|---|---|
| ☐ | P1 | **Khung `AppointmentsModule`** (`appointments/appointments.module.ts`, đăng ký `AppModule` một dòng — file dùng chung), `appointments.constants.ts` (mã lỗi 5.14, mã sự kiện 5.12, hằng job: cron, cỡ lô, trần lô), `state/appointment-state.matrix.ts` (hàm thuần `canTransition`, `allowedTargets` dùng chung cho API và `chuyenDuoc[]`), `locking/booking-transaction.ts` (`READ COMMITTED` + thử lại ≤ 2 lần 1213/1205 **chỉ trước commit**, kết quả có kiểu) và `locking/lock-order.ts` (hằng + ghi chú bảng 5.3); test kiến trúc AR-01, AR-03, AR-04; một dòng TRACKING quyết định `read-only-tx.ts` chuyển lên `common/` hay viết lại | patient B5 (đã có), auth A4 | ĐLK b17; CNTT b2, A1; HLH A1; H2, H7, H8 | `[TIỀN ĐỀ]` `[CHỜ Q21, Q24, Q42]` · `feat(booking)` · MT-01…MT-04, AR-01, AR-03, AR-04 |
| ☐ | P2 | **Cổng, bản giả và hạ tầng test:** `ports/` (`PaymentPort`, `PaymentSummaryPort`, `RefundPort`, `WalletBalancePort`, `WaitlistPort`, `DoctorLeavePort`, `PendingBranchChangesPort`, `AppointmentNotifier`; token DI; `Noop` mặc định có cảnh báo log một lần), `testing/booking-fixtures.ts` (bác sĩ + ca + khung giờ đặt được + bệnh nhân + hồ sơ người thân + cấu hình, dựng bằng `AdminFixtures`), `concurrency-harness.ts`, `invariants.ts` (INV-1…INV-5), `fake-ports.ts`; seed `booking-demo` (mốc hoàn minh hoạ + một dịch vụ cọc > 0, số `[cần điền]`) thêm vào `seed-cli` `[ĐỤNG admin]` (chỉ thêm lệnh mới, báo Trung). Có thể tách thành hai PR nếu quá lớn | P1 | Nền cho mọi test; Q41 | `[TIỀN ĐỀ]` `[ĐỤNG admin]` · `test(booking)` · CP-01…CP-10, INV-01…INV-05 |
| ☐ | P3 | `[ĐỤNG search]` chuyển `ExamPriceReader` từ `search/pricing/` sang `apps/api/src/pricing/` (`git mv`, sửa import ở `search.module.ts` và test, **không đổi hành vi**); chạy lại toàn bộ test giá của `search` | — (độc lập) | ĐLK b12; H3 | `[ĐỤNG search]` — báo Trung · `refactor(search)` |
| ☐ | P4 | `[ĐỤNG rbac]` `rbac/reception-scope.service.ts` (+ provider, export): `resolve(accountId)` đọc `le_tan.chi_nhanh_id` mỗi request (không cache); không còn là Lễ tân đang hoạt động ⇒ 403; test tích hợp | — (độc lập) | XDS TĐK; CNTT TĐK; QB-04 | `[ĐỤNG rbac]` `[CHỜ Q34]` — báo Trung · `feat(rbac)` |
| ☐ | P5 | (web) `[ĐỤNG search]` chuyển `BOOKING_PATH` (và hằng đường dẫn luồng đặt lịch) sang `shared/routes/booking-paths.ts`; `features/search/search-paths.ts` re-export; chuyển `use-remote.ts` lên `shared/hooks/` nếu F-task cần; test của search giữ xanh | — (độc lập) | ĐLK A1; Q36 | `[ĐỤNG search]` — báo Trung · `refactor(web)` |
| ☐ | P6 | Migration viết tay + entity `moc_hoan_tien` (DDL nguyên văn từ `clinix_mysql.sql`, đăng ký `ENTITIES` và `MIGRATIONS`, `schema-parity.int-spec.ts` khớp từng dòng), **chỉ khi tới B8 (cọc > 0) mà Trung chưa xong task admin "Đặt cọc & Hoàn tiền" và Trung đồng ý** (Q15: Trung là người làm migration + entity; Trung xong thì bỏ task này) | — | HLH b3; L6, L29 | `[CHỜ Q15]` `[CHỜ Trung]` `[ĐỤNG admin]` · `feat(db)` |
| ☐ | P7 | Migration thêm `thong_bao.lich_hen_id` (nullable, khoá ngoại `lich_hen`) + UNIQUE `(lich_hen_id, tai_khoan_id, loai_su_kien)`: **sửa cả ba file `docs/database/*` trước**, rồi migration khớp từng dòng (`schema-parity`), entity `ThongBao` thêm cột; **chỉ khi Q29 chọn phương án A** | — | CNTT b5, b13; HLH b8; L8 | `[ĐỒNG BỘ TL]` `[CHỜ Q29]` `[CHỜ Trung]` `[ĐỤNG admin]` · `feat(db)` |
| ☐ | P8 | `scheduling/slot-window.rules.ts` (D2: `checkSlotWithinBranchHours` + `BranchHoursReader`), hàm thuần ≤ 100 dòng, dùng chung bảng ca với `search` KGI-01…KGI-05. **Chỉ làm nếu `doctor` chưa có khi tới B6**; ai tới trước làm, người kia import (thoả thuận khi đối chiếu 5.10) | — | ĐLK b8, A6; quy tắc 29 | `[ĐỤNG doctor]` `[CHỜ doctor D2]` · `feat(booking)` hoặc `feat(doctor)` |

### 6.3 Nhóm B — Backend

| ☐ | ID | Việc (file; chạm ngoài module; việc phải đo) | Phụ thuộc | Truy vết | Thẻ / PR gợi ý |
|---|---|---|---|---|---|
| ☐ | B1 | `GET /patient/appointments` (TCLS): `lists/patient-appointments.{controller,service,repository,dto}.ts`; SQL thô, **phạm vi `benh_nhan_id` nằm trong SQL**, bộ lọc Q31, `q` (Q35), `demTheoTrangThai` (một câu `GROUP BY` cùng bộ lọc trừ trạng thái), giao dịch chỉ đọc cho `total`/`items`/đếm, `no-store`, trang vượt cuối ⇒ 200 rỗng. **Cần đo** M8 (mảng `trangThai`), M9 (`maLichHen`) | P1, P2 | TCLS b2–b4, A1 | `feat(booking)` · LS-01…LS-09, LS-12…LS-14, QB-01, QB-02, QB-08, QB-09 |
| ☐ | B2 | `GET /patient/appointments/:maLichHen` (chi tiết): `choPhepHuy` từ ma trận, `thanhToan`/`hoanTien` = `null` qua cổng, `thoiGianMayChu`, `Pipe` chuẩn hoá `maLichHen` | B1 | TCLS b5–b6; L17 | `feat(booking)` · LS-10, LS-11, LS-13, QB-01, QB-09 |
| ☐ | B3 | `GET /reception/appointments` và `/:maLichHen` (XDS cho Lễ tân): `lists/operations-appointments.*` dùng chung với B4; ép chi nhánh bằng `ReceptionScopeService`; bộ lọc Q32; `chuyenDuoc[]` bằng ma trận P1; `conPhaiThu` qua `PaymentSummaryPort`; danh sách trắng trường | P1, P2, P4 | XDS b2–b4, A1; CNTT b1–b2 | `feat(booking)` `[CHỜ Q32]` · DSV-01, DSV-04…DSV-12, CT-11, QB-02, QB-04 |
| ☐ | B4 | `GET /admin/appointments` và `/:maLichHen`: `@Roles('QuanTriVien')` + `@RequireAdminScope('Any')`, `AdminScopeCtx`, `BranchAccessPolicy.branchFilter`/`assertCanSee` (ngoài phạm vi ⇒ 404); panel "Lịch sử trạng thái" dựng từ `thoi_diem_tao`, `thoi_diem_huy`, `ly_do_huy` + audit `OverrideLichHen`; cột/lọc `thanhToan` ẩn tới khi có `payment` | B3 | XDS TĐK, b2–b4 | `feat(booking)` · DSV-02, DSV-03, QB-05 |
| ☐ | B5 | `GET /doctor/appointments` và `/:maLichHen` (XDSPC): `@Roles('BacSi')`, `bac_si_id = user.accountId`, lọc ngày/ca/trạng thái/`q`, `sapXep`; không giá, cọc, email; "ghi chú khám" `null` tới khi `doctor` có `ho_so_kham` | P1, P2 | XDSPC b2–b5, A1 | `feat(booking)` `[CHỜ Q33]` `[CHỜ doctor]` (ghi chú khám) · DSB-01…DSB-09, QB-06 |
| ☐ | B6 | **Giữ chỗ nguyên tử:** `slots/slot-hold.service.ts` (`hold`, `markBooked`, `release`, `holdForInvitation`, `releaseInvitationHold`, dưới khoá theo bảng 5.3), `slots/bookability.rules.ts` (`evaluateBookability` thuần: mọi kiểm tra 5.4 bước 3, trả lỗi đầu tiên), `slots/bookability.reader.ts` (đọc ở chế độ `none`/`locked`), hết hạn lười (5.5); chưa có HTTP. **Cần đo trước khi viết:** M1, M2, M3, M4 | P1, P2, P8 hoặc `doctor` D2 | ĐLK b8, b17–b18, A2, A6 | `[CHỜ Q1, Q3, Q5, Q7, Q42]` `[CHỜ Trung: Q7]` `[CHỜ doctor D2]` · `feat(booking)` · DL-03…DL-05, DL-10, DL-15, DL-16, DT-01, DT-02, DT-13, HG-14, INV-01…INV-05 |
| ☐ | B7 | `GET /booking/eligibility` (A4) và `POST /booking/checks` (b8, b11, b12): dùng `BookabilityReader` chế độ `none`; câu mới `findOverlappingAppointments` và đếm bằng `findActiveAppointments` (mở rộng `appointments/`, **không sửa hành vi** hàm cũ); `tomTat` kèm `phuPhi`, `chinhSachHoan`, `soDuVi` (cổng) | B6, P3 | ĐLK b8, b11, b12, A2–A4, A6 | `[CHỜ Q9, Q10, Q12, Q14, Q26, Q46]` · `feat(booking)` · DL-06…DL-14, DL-19, DL-23, DL-24, QB-03 |
| ☐ | B8 | **`POST /booking/appointments`:** `create/create-appointment.{controller,service}.ts`, `create/appointment-code.ts` (thuần), giao dịch 5.4 (khoá `benh_nhan` → `lockVisitProfile` → `bac_si` `FOR SHARE` → `khung_gio`), giá + snapshot, `INSERT lich_hen`, cọc 0đ xác nhận ngay (`PaymentPort.recordZeroPayment` + `confirmPaid` nội bộ), `no-store`. Cọc > 0 chỉ chạy được khi có `moc_hoan_tien` (P6). **Cần đo** M2, M7, M9, M11 | B6, B7, P2, P3, (P6 cho cọc > 0) | ĐLK b13–b18, A2; HĐK thành công/thất bại | `[ĐỒNG BỘ TL]` D2 · `[CHỜ Q1, Q2, Q13, Q15]` `[CHỜ Trung: Q15, cọc > 0]` · `feat(booking)` · DL-01, DL-02, DL-20…DL-22, DL-25…DL-29, DT-10, DT-11, KT-01…KT-05 |
| ☐ | B9 | **Hết hạn giữ chỗ:** `state/appointment-transition.service.ts` (khung + `expire`), `expiry/hold-expiry.job.ts` (`@Cron` mỗi phút; quét theo lô; một giao dịch riêng mỗi lịch; cờ `running`; tắt ở `NODE_ENV=test`; không `ScheduleModule.forRoot()`), kết quả có kiểu `Expired`/`NotDue`/`Failed`. **Cần đo** M4, M5 | B6 | ĐLK b19, A5 | `[CHỜ Q2, Q6]` · `feat(booking)` · HG-01…HG-10, DT-08, DT-16 |
| ☐ | B10 | **Huỷ dùng chung:** `cancel/appointment-cancellation.service.ts` (`cancel` + `CancelOutcome`, 5.6), `cancel/refund-calculator.ts` (thuần), `cancel/patient-cancel.controller.ts` (`GET …/cancel-preview`, `POST …/cancel`); gọi `RefundPort` và `WaitlistPort` **sau commit một lần**; thêm `cancel` vào `AppointmentTransitionService` | B9 | HLH b1–b8, A1–A3 | `[ĐỒNG BỘ TL]` D2 · `[CHỜ Q16, Q17, Q18, Q27, Q44]` · `feat(booking)` · HL-01…HL-17, DT-05…DT-07 |
| ☐ | B11 | **Hàm gọi vào cho module khác:** `AppointmentTransitionService.confirmPaid` (Q4, Q20), `complete` (D6), `AppointmentQueries.findAffectedByLeave` (D5); chạy với `payment`/`doctor` giả; xuất từ `AppointmentsModule` | B9 | ĐLK b16; CNTT (`HoanThanh` chỉ Bác sĩ); HĐK nghỉ phép | `[CHỜ Q4, Q20]` `[CHỜ payment]` (tích hợp thật ở B17) · `feat(booking)` · HG-11…HG-13, CP-02, CP-07, CP-08, DT-03, DT-04 |
| ☐ | B12 | **Cập nhật trạng thái của Lễ tân:** `status/reception-status.{controller,service}.ts`, `check-in.service.ts` (cửa sổ tiếp đón, `remainingToCollect`), `no-show.service.ts` (`markNoShow`: khoá `benh_nhan` → `lich_hen`, cộng `so_lan_no_show`, bật cờ khi đạt ngưỡng, không cảnh báo lặp), huỷ qua B10; thêm `checkIn`, `markNoShow` vào `AppointmentTransitionService`; thông báo qua `AppointmentNotifier` | B10, B11, B3, P4 | CNTT b1–b5, b9–b13, A1–A4 | `[ĐỒNG BỘ TL]` D2 · `[CHỜ Q14, Q21, Q22, Q25, Q27, Q28]` · `feat(booking)` · CT-01…CT-13, CT-22, MT-01…MT-04, VM-05…VM-09, VM-14, VM-15, DT-05, DT-06, DT-15 |
| ☐ | B13 | **`NoShowJob`** (`@Cron` mỗi 5 phút): câu ứng viên và kiểm lại dưới khoá dùng **cùng** hằng SQL (4 bảng, `:now`), không giải phóng khung giờ, không `WaitlistPort`, bỏ qua ca không có khoảng (cảnh báo log), thiếu cấu hình ⇒ bỏ lượt. **Cần đo** M6 | B12 | CNTT b7–b8, A3 | `[CHỜ Q23]` · `feat(booking)` · VM-01…VM-13, VM-16, DT-06 |
| ☐ | B14 | **Override của Quản trị viên:** `status/admin-override.{controller,service}.ts`; ma trận Q24; `[ĐỤNG audit]` mở rộng `audit/audit-entry.ts` thêm `OverrideLichHen` (`targetType: 'lich_hen'`, `truoc`, `sau`, `ly_do`) và test của audit; ghi audit **cùng giao dịch** (lỗi ⇒ hoàn tác tất cả) | B12 | CNTT b6; HĐK override; L9, L10 | `[ĐỤNG audit]` — báo Trung · `[CHỜ Q24]` · `feat(booking)` · CT-14…CT-21 |
| ☐ | B15 | **Thông báo và email tối thiểu:** `notifications/` (`renderBookingConfirmationMail`, `renderCancellationMail` 3 biến thể, `renderNoShowMail`, `renderNoShowRestrictionMail` trên `renderMailShell`), `AppointmentNotifier` thật ghi `thong_bao` (+ `email_thong_bao`) cùng giao dịch (phương án A) hoặc gửi sau commit (B); chân thư từ `thong_tin_phong_kham` | B10, B12, P7 | ĐLK b16; HLH b8, b10; CNTT b5, b11, b13 | `[CHỜ Q29, Q30, Q46]` `[CHỜ Trung: Q29]` `[CHỜ notification]` · `feat(booking)` · TB-01…TB-08 |
| ☐ | B16 | **Tích hợp cổng thật của `doctor` và `admin`:** thay `Noop` bằng `LeaveReader` (D4) và `getPendingEffectiveChanges` (admin B10); chạy lại DT-09 với cổng thật; bỏ cảnh báo TRACKING | B8, `doctor` D4/D5, `admin` B10 | ĐLK A6; H5, H6; admin Q6, Q48 | `[CHỜ doctor]` `[CHỜ admin B10]` · `feat(booking)` · DT-09, DT-17, CP-05, CP-06, DL-17, DL-18 |
| ☐ | B17 | **Tích hợp `payment`, `wallet`, `waitlist`:** thay bản giả bằng thật; chạy lại HG-11…HG-13, HL-10…HL-12, CT-05, CT-06, DL-02 với thanh toán thật, ca hết hạn đúng lúc thanh toán thật | B10, B11, `payment`, `wallet`, `waitlist` | ĐLK b15–b16; HLH b6, b7, A3 | `[CHỜ payment]` `[CHỜ wallet]` `[CHỜ waitlist]` · `feat(booking)` · CP-02…CP-04 (thật), DT-03, DT-04 |

### 6.4 Nhóm F — Frontend (bám frame Figma mục 4.4; trạng thái chưa có frame theo mục 4.5)

| ☐ | ID | Việc (file; chạm ngoài module) | Phụ thuộc | Truy vết | Thẻ / PR gợi ý |
|---|---|---|---|---|---|
| ☐ | F1 | "Lịch hẹn của tôi" — danh sách (Figma `411:2`): `features/booking/appointments/patient/` (trang, `api/`, kiểu), thẻ lọc có số đếm, ô tìm, bộ lọc, chuyển trang, rỗng/lỗi/loading; `router/role-nav.ts` (`to`) và `router/role-routes.tsx` (route con `BenhNhan`) `[ĐỤNG router]` | B1, P5 | TCLS b1–b4, A1 | `[CHỜ Q31, Q35]` `[ĐỤNG router]` · `feat(booking)` · LH-01, LH-05 |
| ☐ | F2 | Chi tiết lịch hẹn theo trạng thái (Figma `420:2`, `426:2`, `691:2`) + **hộp huỷ** (`421:2`: hoàn dự kiến từ `cancel-preview`, `Giữ lịch`/`Xác nhận hủy`, kết quả số thực tế; nút huỷ cả ở `ChoThanhToan` theo Q45); nối liên kết "Lịch hẹn của tôi" trong `relative-errors.ts` `[ĐỤNG patient]` (một dòng) | F1, B2, B10 | TCLS b5–b6; HLH b1–b8, A2 | `[CHỜ Q18, Q27, Q45]` `[ĐỤNG patient]` · `feat(booking)` · LH-02, LH-03, LH-04 |
| ☐ | F3 | **Khung trang đặt lịch:** `wizard/` (khung, `BookingStepper` 6 nhãn Figma, context bộ nhớ, đọc `khungGioId` từ URL), cổng A4 bằng `GET /booking/eligibility`, `RequireAuth` `BenhNhan` và quay lại sau đăng nhập (**đo M10**); route Bước 4–6 trong `PublicLayout` `[ĐỤNG router]` | B7, P5 | ĐLK b1, A1, A4 | `[CHỜ Q36, Q38, Q39]` `[ĐỤNG router]` · `feat(booking)` · WZ-01, WZ-08, WZ-09, WZ-14 |
| ☐ | F4 | **Bước 4 "Thông tin"** (Figma `449:2`, `450:2`): chọn hồ sơ đi khám (bản thân + người thân đang hiệu lực; gọi `GET /patient/relatives` bằng API client của module, không import `features/patient`), "Lý do khám (không bắt buộc)", khối "Lịch hẹn đang chọn" | F3 | ĐLK b9–b11, A3 | `[CHỜ Q9]` · `feat(booking)` · WZ-02, WZ-03 |
| ☐ | F5 | **Bước 5 "Xác nhận"** (Figma `451:2`): tóm tắt từ `POST /booking/checks` (giá, phụ phí, cọc, chính sách hoàn: dòng bổ sung theo Q46), nút gọi `POST /booking/appointments`, xử lý A2/A3/A6 bằng `maLoi`, chống bấm đúp, `usePageActive` | F4, B8 | ĐLK b12–b14, A2, A3, A6 | `[CHỜ Q46]` · `feat(booking)` · WZ-04…WZ-07, WZ-12, WZ-13 |
| ☐ | F6 | **Bước 5 "Thanh toán"** (Figma `452:2`): route, đếm ngược theo giờ máy chủ (5.13), trạng thái hết hạn; **thân thanh toán là của `payment`** | F5, B8 | ĐLK b15, A5 | `[CHỜ payment]` · `feat(booking)` · WZ-10 |
| ☐ | F7 | **Bước 6 "Hoàn tất"** (Figma `453:2`): phiếu từ `GET /patient/appointments/:maLichHen`; cọc 0đ đi thẳng từ Bước 5 | F5, B8 | ĐLK b16 | `feat(booking)` · WZ-11 |
| ☐ | F8 | **Lễ tân "Quản lý lịch hẹn"** (Figma `479:2`, `488:2`, `494:2`–`497:2`): danh sách + khung chi tiết, chip ngày, ô tìm, lọc, nút theo `chuyenDuoc[]`; `Thu tiền` là nút vô hiệu "Chưa được triển khai"; `router/role-nav.ts`, `role-routes.tsx` `[ĐỤNG router]`. Mở lại `get_design_context` cho các frame chỉ đọc bằng metadata | B3 | XDS b1–b4, A1; CNTT b1–b2 | `[CHỜ Q32, Q35, Q37]` `[ĐỤNG router]` · `feat(booking)` · LT-01, LT-05 |
| ☐ | F9 | **Hộp của Lễ tân:** "Hủy lịch hẹn" (`490:2`, `Lý do hủy *`), "Đánh dấu vắng mặt" (`489:2`), lỗi `CON_PHAN_CHUA_THANH_TOAN`/`NGOAI_KHUNG_GIO_TIEP_DON`; "Thu tiền & tiếp đón" thuộc `payment` | F8, B12 | CNTT b3–b5, A1–A3 | `[CHỜ Q27]` `[CHỜ payment]` (thu tiền) · `feat(booking)` · LT-02…LT-04 |
| ☐ | F10 | **Admin "Lịch hẹn"** (Figma `511:2`, `512:2`, `621:2`): danh sách, lọc (chi nhánh chỉ Toàn hệ thống), chi tiết; **hộp override** (chưa có frame: dựng theo `489:2`/`490:2` + ô lý do bắt buộc, nhóm bổ sung Figma); `admin-sidebar.tsx` thêm `to` `[ĐỤNG admin]`; route Admin bọc `AdminScopeGuard` ở lớp router `[ĐỤNG router]` | B4, B14, F8 | XDS b1–b4; CNTT b6 | `[ĐỤNG admin]` `[ĐỤNG router]` · `feat(booking)` · QT-01…QT-03 |
| ☐ | F11 | **Bác sĩ "Lịch hẹn"** (Figma `457:2`, `458:2`): xuất `DoctorAppointmentsPage`, `DOCTOR_APPOINTMENT_ROUTES` từ `features/booking/index.ts`; `doctor` gắn vào khung Bác sĩ | B5 | XDSPC b1–b5 | `[PHỤ THUỘC doctor shell]` · `feat(booking)` · BSI-01, BSI-02 |

### 6.5 Nhóm D — Đồng bộ tài liệu (đi cùng PR của task code tương ứng)

| ☐ | ID | Việc | Đi cùng | Truy vết |
|---|---|---|---|---|
| ☐ | D1 | `[ĐỤNG search]` ghi vào `docs/features/search/TRACKING.md` mục 3 việc **đổi chủ** "khung giờ còn trống" (Q18 → `doctor`) và vào PLAN `search` 5.6 việc K1 trả `khungGioId` (Q8); cùng người sửa với PLAN `doctor` | Sau Q7, Q8 `[CHỜ Trung]` | L4, L17 |
| ☐ | D2 | `[ĐỒNG BỘ TL]` `docs/database/clinix.dbml` và `clinix_quy_tac_nghiep_vu.md` (**sửa cả ba file `docs/database/*` cho khớp**; `clinix_mysql.sql` chỉ thêm truy vấn mẫu, không sửa `CREATE TABLE` vì COMMENT được `schema-parity` so với migration, TECH_DEBT dòng 8): ghi chú cột `chinh_sach_hoan_snapshot` (dạng JSON, Q15), `ma_lich_hen` (định dạng Q13), `han_thanh_toan` (NULL khi `DaXacNhan`), `khung_gio.trang_thai` (`HetHan` suy ra khi đọc, Q3); quy tắc mới: thứ tự khoá toàn cục và luồng tạo lịch, huỷ dùng chung và hoàn cọc theo bậc, Vắng mặt/no-show/khoá và mở khoá lại, override, quy tắc 37, 40 bỏ `[đề xuất]` theo Q22. **Nhắc người dùng sửa 2.4** (repo `TLCN_CLINIX`): ĐLK b8 theo Q1 và b10 ("không bắt buộc"), A5; CNTT (Hoàn thành không thuộc override, "quá giờ hẹn", cửa sổ tiếp đón); XDS (ô tìm, bộ lọc); TCLS (Sắp tới/Lịch sử và số đếm); HLH (lý do) | PR của B8, B10, B12, B14 (mỗi PR một phần) | L1, L5, L10, L11, L19, L23, L24 |
| ☐ | D3 | `docs/TECH_DEBT.md` (từ **số kế tiếp trên `main` lúc ghi**, hiện 84: Lễ tân không ghi nhật ký và không lưu người thực hiện, Q28; kiểm chồng lấn dùng thời lượng dịch vụ hiện hành; `HetHan` không ghi; hết hạn lười; cổng `Noop` chưa thay; bước thanh toán/tiếp đón chờ `payment`); danh sách việc Figma cho nhóm (mục 4.4, 4.5) | Cuối cụm 2 và 4 | Q28, mục 4.4–4.5 |

### 6.6 Nhóm X — Hoàn tất

| ☐ | ID | Việc | Phụ thuộc |
|---|---|---|---|
| ☐ | X1 | **Đo thật M1–M11** (mục 5.15) trên MySQL của compose bằng spec đo tạm (xoá sau khi đo, như nếp patient); ghi số vào TRACKING và sửa PLAN nếu khác dự đoán. Làm **trước B6** | P1, P2 |
| ☐ | X2 | Kiểm tay trên Chrome thật với tài khoản seed: đặt lịch cọc 0đ (bước 4–6), tạo hai lịch cùng khung giờ từ hai trình duyệt, huỷ, Lễ tân Vắng mặt/Hủy, Admin override, job hết hạn và Vắng mặt (đổi đồng hồ giả/dữ liệu), `docker compose up --build` | Cụm 1–4 |
| ☐ | X3 | **Cặp với `patient` X3:** chạy lại NT-10…NT-17, NT-24 với lịch hẹn tạo qua API thật và KT-01…KT-05 (mục 7.12); xác nhận hợp đồng khoá bằng bằng chứng | B8, X2, patient X3 |
| ☐ | X4 | Tổng kết: chạy `lint`, `build`, `test`, `test:int`, `test:e2e` (api), `lint`, `test` (web); điền TRACKING mục 2; thêm **đúng một dòng** vào `docs/TRACKING.md`; ghi `AI_USAGE_LOG.md` đủ | Mọi task | 

### 6.7 Việc nào bắt đầu ngay, việc nào phải chờ

- **Bắt đầu ngay (bảng nền đã có trên `main`, không chờ module nào):** P1 → P2 (cổng, fixtures), P3, P5; B1 → B2 (danh sách và chi tiết Bệnh nhân), B3, B4, B5 (dữ liệu tự dựng); sau X1: B6 → B7 → B8 (khung giờ từ fixture, **cọc 0đ**), B9 → B10 (hết hạn giữ chỗ, huỷ không cọc), B11 (với `payment` giả), B12 → B13 → B14; F1, F2 (phần đọc), F8, F10 (phần đọc) ngay sau B-task tương ứng; F3 → F5, F7 (trên khung giờ seed/fixture, Q40).
- **Đã trả lời 08/11/2026** (mục 4.2, TRACKING mục 3). **Còn chặn merge:** `[CHỜ Trung]` Q7 (B6, D1), Q15 (B8 cọc > 0, B10, P6), Q29 (B15, P7); Q42 chỉ chốt sau khi đo M1, M3 ở X1 (trước B6); đối chiếu mục 5.10 với PLAN `doctor` (chưa có bản).
- **Chờ `doctor`:** khung giờ thật và K1/K2 (chọn khung giờ), D2 nếu P8 không tự làm (B6), D4/D5 (B16), trang Bác sĩ (F11), ghi chú khám (B5). **Chờ `payment`:** cọc > 0 trọn vẹn, `confirmPaid` thật, tiếp đón (còn phải thu), `thanhToan` ở chi tiết, trang Thanh toán (F6, B17). **Chờ `wallet`:** hoàn cọc, số dư ví (B17). **Chờ `waitlist`:** mời danh sách chờ (B17). **Chờ `notification`/admin B9:** thư và thông báo thật (B15). **Chờ `admin`:** B10 (B16), `moc_hoan_tien` hoặc P6 (cọc > 0, B8, B10).

## 7. Test case dự kiến

Loại: **U** = thuần (`*.spec.ts`), **I** = tích hợp MySQL thật (`*.int-spec.ts`), **E** = e2e qua `configureApp(app)` + `expectErrorResponse` (`apps/api/test/booking-*.e2e-spec.ts`), **W** = web (`*.test.tsx`), **M** = kiểm tay. Mỗi test trong mã ghi mã ở cột 1. Đồng hồ giả cho mọi ca thời gian; ca đồng thời chạy trên MySQL thật, lặp ≥ 15 vòng (ca nặng ≥ 100), và **sau mỗi ca đồng thời chạy INV-01…INV-05**.

### 7.1 Đặt lịch khám (DL)

| ID | Kịch bản | Mong đợi | Phủ | Loại |
|---|---|---|---|---|
| DL-01 | Bệnh nhân đặt khung giờ `ConTrong`, dịch vụ cọc 0đ | 201; lịch `DaXacNhan`, `han_thanh_toan` NULL; khung giờ `DaDat`, `giu_cho_den` NULL; `ma_lich_hen` đúng dạng; `chi_nhanh_id`, `dich_vu_kham_id`, `thoi_gian` suy từ khung giờ/bác sĩ; thông báo xác nhận ghi cùng giao dịch | b14–b16, HĐK | I, E |
| DL-02 | Cọc > 0 | 201; lịch `ChoThanhToan`, `han_thanh_toan` = now + `thoi_gian_giu_cho`; khung giờ `DangGiuCho`, `giu_cho_den` = `han_thanh_toan`; `canThanhToan = true`; chưa gọi `recordZeroPayment` | b14–b15 | I |
| DL-03 | A2: khung giờ đã `DaDat` | 409 `KHUNG_GIO_DA_DAT`; không ghi gì | A2 | I, E |
| DL-04 | A2: khung giờ `DangGiuCho` còn hạn (người khác giữ) | 409 `KHUNG_GIO_DANG_GIU`; không ghi gì | A2 | I, E |
| DL-05 | Hết hạn lười: khung giờ `DangGiuCho` đã quá `giu_cho_den`, job chưa quét | Tạo được; lịch cũ `DaHuy` (`ly_do_huy` hằng), khung giờ giữ lại cho người mới, trong **một** giao dịch; INV | b17, A5 | I |
| DL-06 | A3: cùng hồ sơ có lịch đang hoạt động chồng khoảng `[thoi_gian, + thoi_luong)` | 409 `LICH_HEN_TRUNG_THOI_GIAN`, `chiTiet` chỉ có mã + giờ lịch trùng | A3/11a | I, E |
| DL-07 | Biên: lịch kia kết thúc đúng lúc khung giờ mới bắt đầu (chạm đầu mút) | Đặt được | A3 (biên) | I |
| DL-08 | Hai hồ sơ khác nhau của cùng tài khoản (bản thân và người thân) đặt cùng giờ; cùng bác sĩ khác giờ | Đặt được cả hai | A3 (không trùng chéo hồ sơ) | I |
| DL-09 | A3: hồ sơ đã có đúng `so_lich_hen_toi_da` lịch đang hoạt động; biên: còn thiếu 1 | 409 `VUOT_SO_LICH_HEN_TOI_DA` (`chiTiet.toiDa`); thiếu 1 thì đặt được; `DaHuy`/`HoanThanh`/`VangMat`/`DaDoiLich` không tính; lịch `ChoThanhToan` của chính mình có tính | A3/11a, quy tắc 37 | I |
| DL-10 | A3: khung giờ ở quá khứ; biên: `ngay_gio` đúng bằng `now`, `now + 1s` | Quá khứ và bằng `now`: 409 `KHUNG_GIO_DA_QUA`; `now + 1s` đặt được | A3/11a, Q5 | I |
| DL-11 | A3: hồ sơ người thân `trang_thai_hieu_luc = false` | 409 `HO_SO_NGUOI_THAN_DA_NGUNG`; không ghi gì | A3, quy tắc 52 | I, E |
| DL-12 | Hồ sơ người thân của **bệnh nhân khác** hoặc id không tồn tại/sai dạng | 404 cùng thân | QB, H14 | I, E |
| DL-13 | A4: `khoa_dat_lich_do_no_show = true` (cả `GET /booking/eligibility` và `POST /booking/appointments`); biên: đúng ngưỡng | `eligibility` ⇒ `choPhepDatLich = false`, lý do; tạo ⇒ 403 `DAT_LICH_BI_KHOA_NO_SHOW`; không ghi gì; khoá áp dụng cả khi đặt cho người thân (Q14) | A4/1a–1b | I, E |
| DL-14 | A4 giữa chừng: `checks` ok, rồi cờ bật, rồi tạo | Tạo bị 403 (kiểm lại dưới khoá `benh_nhan`); lịch đã có không bị huỷ | A4, Q26 | I |
| DL-15 | A6: ngày nghỉ (`hoat_dong = false`); thứ chưa khai báo; ca không có khoảng; khung giờ vượt/nằm ngoài khoảng; biên: bắt đầu đúng giờ bắt đầu khoảng, kết thúc đúng giờ kết thúc khoảng | Lần lượt `CHI_NHANH_NGHI` (kèm thứ), `CHI_NHANH_CHUA_KHAI_BAO`, `CA_KHONG_TON_TAI`, `NGOAI_GIO_HOAT_DONG` (kèm giờ mở/đóng); hai biên đặt được | A6/8a–8b, quy tắc 29 | I, E |
| DL-16 | Bác sĩ `NgungHoatDong`/`ChoKichHoat`; chuyên khoa `NgungHoatDong`; cặp (chi nhánh, dịch vụ) bị bỏ khỏi `chi_nhanh_dich_vu_kham` | 409 `BAC_SI_KHONG_KHA_DUNG`; không ghi gì | admin Q28, quy tắc 1, 49 | I |
| DL-17 | Cổng nghỉ phép giả báo `DaDuyet` và `ChoDuyet` | 409 `BAC_SI_NGHI_PHEP` (kiểm **dưới khoá `bac_si`**) | H5 | I |
| DL-18 | Cổng thay đổi chi nhánh giả báo khung giờ nằm vùng bị loại | 409 `KHUNG_GIO_NGOAI_LICH_MOI` | admin Q6, Q48 | I |
| DL-19 | Không có dòng `cau_hinh_he_thong` | 409 `HE_THONG_CHUA_CAU_HINH` cho `checks` và tạo; không ghi gì | quy tắc 35, H15 | I, E |
| DL-20 | Giá: có và không có quy tắc phụ phí; đổi giá dịch vụ/quy tắc **sau** khi đặt | `gia_snapshot` = `computeExamPrice` (chuỗi decimal chính xác); lịch đã đặt không đổi; không số thực | b14, quy tắc 11 | I |
| DL-21 | `chinh_sach_hoan_snapshot`: cọc 0 ⇒ NULL; cọc > 0 có mốc ⇒ mảng giảm dần; cọc > 0 không mốc ⇒ `[]`; đổi `moc_hoan_tien` sau đó không đổi lịch | Đúng dạng JSON `so_gio_truoc_toi_thieu`, `ty_le_hoan` | HĐK, Q15 | I |
| DL-22 | Mã lịch hẹn: định dạng `CLX-yyyyMMdd-XXXXX` (ngày giờ VN, không I L O U); va chạm 1062 sinh lại; hết 5 lần | Đúng dạng, duy nhất, không đoán được; hết 5 lần ⇒ 500 `LOI_HE_THONG` có `requestId` | b14, Q13 | U, I |
| DL-23 | Lý do khám: không gửi/rỗng; 500 và 501 ký tự; ký tự điều khiển; NFC | Rỗng ⇒ `NULL`; 501 và ký tự điều khiển ⇒ 400 `LY_DO_KHAM_KHONG_HOP_LE` | b10, Q9 | U, E |
| DL-24 | `POST /booking/checks` trả tóm tắt đủ trường; lỗi đầu tiên theo đúng thứ tự 5.4; **không đổi dữ liệu** (đếm hàng `lich_hen`, trạng thái `khung_gio` trước/sau) | Tóm tắt có `giaApDung`, `phuPhi`, `tienCoc`, `chinhSachHoan`, `soDuVi: null` | b8, b11, b12 | I, E |
| DL-25 | Client gửi `bacSiId`, `chiNhanhId`, `dichVuKhamId`, `benhNhanId`, `trangThai` trong thân | 400 (không nhận); lịch tạo luôn lấy bác sĩ/chi nhánh/dịch vụ từ khung giờ | b8, QB-03 | E |
| DL-26 | `lich_lam_viec.chi_nhanh_id` lệch `bac_si.chi_nhanh_id` | 409 `KHUNG_GIO_KHONG_HOP_LE` | D12 | I |
| DL-27 | Hỏng giữa giao dịch: lỗi ở `INSERT lich_hen`; ở `UPDATE khung_gio`; ở ghi thông báo; ở `recordZeroPayment` | Hoàn tác trọn: khung giờ vẫn `ConTrong`, không lịch, không thông báo (mỗi bước cho chạy thật rồi mới ném) | HĐK thất bại | I |
| DL-28 | 1062 trên `khung_gio_dang_giu` (ép bằng cách bỏ qua kiểm trạng thái) | `KHUNG_GIO_DA_DAT`, không 500 | H1 | I |
| DL-29 | Bấm đúp: hai `POST` giống hệt gần như cùng lúc | Một 201 và một 409 (`LICH_HEN_TRUNG_THOI_GIAN` hoặc `KHUNG_GIO_DA_DAT`); một lịch duy nhất | b13 | I, E |

### 7.2 Hết hạn giữ chỗ, xác nhận thanh toán (HG)

| ID | Kịch bản | Mong đợi | Phủ | Loại |
|---|---|---|---|---|
| HG-01 | Job: lịch `ChoThanhToan` có `han_thanh_toan <= now` | `DaHuy`, `thoi_diem_huy`, `ly_do_huy` hằng; khung giờ `ConTrong`, `giu_cho_den` NULL; `WaitlistPort.onSlotReleased` gọi 1 lần **sau** commit; **không** thông báo (Q6) | b19, A5/8-12b | I |
| HG-02 | Biên nửa mở: `han_thanh_toan = now` (hết), `= now + 1s` (chưa) | Đúng nửa mở | H8 | I |
| HG-03 | Lịch đã `DaXacNhan`/`DaHuy` (job đọc cũ rồi trạng thái đổi) | `NotDue`, không đụng gì | H3 | I |
| HG-04 | Chạy job hai lần liên tiếp | Lần hai không ghi gì (idempotent) | H9 | I |
| HG-05 | > 100 lịch quá hạn; vượt trần số lô | Xử lý hết theo lô; còn dư thì lượt sau; con trỏ không lặp vô hạn | H9 | I |
| HG-06 | Một lịch lỗi (ép 1213 hoặc ném) giữa lượt | Hoàn tác riêng lịch đó; các lịch khác vẫn xử lý; job không ném ra ngoài | H9 | I |
| HG-07 | Hai bản job chạy cùng lúc trên cùng tập lịch | Mỗi lịch hết hạn đúng một lần; 0 lỗi 1213/1205 | H9, DT-16 | I |
| HG-08 | Giờ hẹn khung giờ đã qua khi hết hạn | Khung giờ về `ConTrong`, **không** gọi `WaitlistPort` | A5 | I |
| HG-09 | `NODE_ENV=test` | Job không tự chạy; test gọi `run(now)` | H9 | I |
| HG-10 | Đọc khung giờ `DangGiuCho` quá `giu_cho_den` | Đọc ra `ConTrong` (hết hạn lười, Q3) | Q3 | I |
| HG-11 | `confirmPaid` khi lịch còn `ChoThanhToan` nhưng đã quá `han_thanh_toan` (job chưa quét, khung giờ chưa bị ai giữ) | `Confirmed`: lịch `DaXacNhan`, khung giờ `DaDat` | Q4 | I |
| HG-12 | `confirmPaid` khi lịch đã `DaHuy` do hết hạn | `{ kind: 'HetHanGiuCho' }`, không đổi gì | Q4 | I |
| HG-13 | `confirmPaid` hai lần; khi lịch `DaTiepDon`/`DaHuy` do người dùng | `AlreadyConfirmed`; `InvalidState` kèm trạng thái | Q4, Q20 | I |
| HG-14 | Đồng hồ giả: khung giờ `giu_cho_den` đúng bằng `now` | Coi là trống (nửa mở) | H8 | U, I |

### 7.3 Hủy lịch hẹn (HL)

| ID | Kịch bản | Mong đợi | Phủ | Loại |
|---|---|---|---|---|
| HL-01 | Bệnh nhân huỷ lịch `DaXacNhan` cọc 0 | 200; `DaHuy`, `thoi_diem_huy`, `ly_do_huy` hằng; khung giờ `ConTrong`; `hoanCoc = null`; thông báo ghi | b2–b8 | I, E |
| HL-02 | Huỷ lịch `ChoThanhToan` (chưa thu cọc) | `DaHuy`, khung giờ `ConTrong`, `hoanCoc = null` | TĐK, Q45 | I |
| HL-03 | A1: lịch `DaTiepDon`, `HoanThanh`, `DaHuy`, `VangMat`, `DaDoiLich` | 409 `LICH_HEN_KHONG_CHO_HUY` kèm `chiTiet.trangThai`; không đổi gì | A1/2a–2b | I, E |
| HL-04 | Huỷ lịch của hồ sơ **người thân** của mình | Được | TĐK ("kể cả người thân") | I |
| HL-05 | Huỷ lịch của bệnh nhân khác | 404 cùng thân | QB-01 | E |
| HL-06 | Bấm đúp huỷ | Lần hai 409 (`DaHuy`); một lần hoàn tiền/mời chờ duy nhất | b4 | I |
| HL-07 | `cancel-preview`: còn đúng 24 giờ, 24 giờ − 1s, đúng 2 giờ, 2 giờ − 1s, 0, đã quá giờ (snapshot 24→100, 2→50, 0→0; cọc đã thu 100.000 giả) | 100.000; 50.000; 50.000; 0; 0; 0 (nửa đóng `≥`) | b3, Q16 | U, I |
| HL-08 | `cancel-preview` không đổi dữ liệu; đóng hộp xác nhận không gọi gì | Hàng không đổi | A2 | I, W |
| HL-09 | `RefundCalculator` thuần: snapshot NULL/`[]`/nhiều mốc/không sắp; tỷ lệ 0 và 100; tiền lẻ (làm tròn **xuống** 0,01); cọc đã thu 0 | Đúng bảng; không `number` dấu phẩy động | Q16, H11 | U |
| HL-10 | Cọc đã thu > 0 (cổng giả): `RefundPort.refund` | Gọi **một lần sau commit**; `hoanCoc.soTien` đúng bậc | b6, b9 | I |
| HL-11 | `RefundPort.refund` ném/`Failed` | Huỷ **vẫn thành công**, khung giờ đã `ConTrong` (không hoàn tác) | A3/9a–9c | I |
| HL-12 | `WaitlistPort.onSlotReleased`: giờ tương lai gọi 1 lần; giờ đã qua, `BacSiNghiPhep` không gọi | Đúng | b7 | I |
| HL-13 | `lyDo` > 255; không gửi `lyDo` | 400; không gửi ⇒ hằng "Bệnh nhân hủy lịch hẹn" | Q27 | E |
| HL-14 | Hệ thống huỷ (`HeThong`, `BacSiNghiPhep`) lịch `DaXacNhan` cọc > 0 | `DaHuy`, hoàn 100%, không mời chờ; lịch `DaTiepDon` ⇒ `NotCancellable`; lịch đã `DaHuy` ⇒ `AlreadyCancelled` | Q17, D5 | I |
| HL-15 | Lễ tân huỷ (reason `LeTanHuy`) và QTV override sang `DaHuy` | Lễ tân theo bậc; QTV 100% | Q17 | I |
| HL-16 | Hoàn tác trọn khi lỗi ở từng bước ghi (lịch, khung giờ, thông báo) | Lịch giữ trạng thái cũ, khung giờ giữ nguyên, **không** gọi `RefundPort`/`WaitlistPort` | HĐK thất bại | I |
| HL-17 | Hết hạn giữ chỗ (`HetHanGiuCho`) | Không hoàn, không thông báo | Q6 | I |

### 7.4 Tra cứu danh sách / lịch sử của Bệnh nhân (LS)

| ID | Kịch bản | Mong đợi | Phủ | Loại |
|---|---|---|---|---|
| LS-01 | Bệnh nhân có lịch bản thân + người thân; có thêm lịch của bệnh nhân khác | Chỉ thấy lịch có `benh_nhan_id` = mình | HĐK, QB-01 | I, E |
| LS-02 | `nhom = SapToi` / `LichSu` / không `nhom` | Đúng tập (3 trạng thái hoạt động / 3 trạng thái kết thúc / tất cả trừ `DaDoiLich`) và thứ tự (tăng/giảm/giảm), rồi `lich_hen_id` | b2, Q31 | I |
| LS-03 | Lọc `trangThai[]` một và nhiều giá trị; giá trị ngoài enum | Lọc đúng; ngoài enum ⇒ 400 | b3–b4 | I, E |
| LS-04 | Lọc hồ sơ: `BanThan`, id người thân của mình, id người thân của người khác | Đúng; của người khác ⇒ danh sách rỗng hoặc 400 (một hành vi, không lộ tồn tại) | b3 | I |
| LS-05 | `demTheoTrangThai` | Đúng từng trạng thái dưới các bộ lọc khác; **không** đổi khi đổi `trangThai` | Figma `411:2` | I |
| LS-06 | Có lịch `DaDoiLich` | Không xuất hiện; không tính vào đếm | Q31 | I |
| LS-07 | Phân trang: `page`/`pageSize` (tối đa 100); trang vượt cuối; `total` và `items` cùng ảnh chụp khi có ghi đồng thời | 200 `items` rỗng ở trang vượt cuối (không 500); `total` khớp | Q35 | I |
| LS-08 | `q`: mã lịch, tên bác sĩ, tên người khám; `%`, `_`, `!`; 1 và 101 ký tự; điều khiển | Khớp chứa không phân biệt hoa thường/dấu; ký tự đặc biệt là ký tự thường; sai ⇒ 400 `TU_KHOA_KHONG_HOP_LE` | Q35 | I, U |
| LS-09 | A1: không có lịch phù hợp bộ lọc | 200 `items: []`, `total: 0` | A1/4a–4b | I, E |
| LS-10 | Chi tiết: đủ trường; `thanhToan`, `hoanTien` = `null` (chưa có module); `choPhepHuy` | Đúng theo trạng thái | b6, L17 | I |
| LS-11 | Chi tiết lịch của người khác / mã sai dạng / chữ thường | 404 cùng thân; chữ thường được chuẩn hoá | QB-01, H17 | E |
| LS-12 | `tuNgay`/`denNgay` (giờ VN, khoảng đóng); `denNgay` < `tuNgay` | Biên đúng; đảo ngược ⇒ 400 | b3 | I |
| LS-13 | `choPhepHuy` theo trạng thái (hai trạng thái được huỷ) | `true` chỉ ở `ChoThanhToan`, `DaXacNhan` | HLH TĐK | I |
| LS-14 | Quét JSON mọi route Bệnh nhân | Không có `lich_hen_id`, `benh_nhan_id`, email/SĐT bác sĩ, băm | H10 | E |

### 7.5 Cập nhật trạng thái lịch hẹn: ma trận, Lễ tân, Quản trị viên (MT, CT)

| ID | Kịch bản | Mong đợi | Phủ | Loại |
|---|---|---|---|---|
| MT-01 | `canTransition`/`allowedTargets` cho mọi (vai trò × nguồn × đích) | Khớp bảng 5.2 và Q21, Q24, không còn ô thừa | b2, A1 | U |
| MT-02 | `allowedTargets` Lễ tân theo thời điểm: trước cửa sổ, trong cửa sổ, sau cửa sổ; còn phải thu / đủ | `DaHuy` luôn (nguồn hợp lệ); `DaTiepDon` chỉ trong cửa sổ và đủ tiền; `VangMat` chỉ sau cửa sổ | b2, Q22 | U |
| MT-03 | Chọn `HoanThanh` (mọi vai trò trừ Bác sĩ) | `CHI_BAC_SI_HOAN_THANH` | A1/2a–2b | U, E |
| MT-04 | `complete` bởi bác sĩ khác / sai trạng thái | `NotAssigned` / `InvalidState` | D6 | I |
| CT-01 | Lễ tân `DaXacNhan → DaHuy` kèm `lyDo` | 200; khung giờ `ConTrong`; hoàn theo bậc; thông báo | b3–b5 | I, E |
| CT-02 | Lễ tân `ChoThanhToan → DaHuy`; thiếu `lyDo` | 200; thiếu lý do ⇒ 400 `LY_DO_BAT_BUOC` | Q27 | E |
| CT-03 | Lễ tân `DaXacNhan → VangMat` sau hết cửa sổ | `VangMat`; `so_lan_no_show` + 1 (tài khoản đặt); khung giờ giữ `DaDat`; không `WaitlistPort` | b3–b4, b9 | I |
| CT-04 | Lễ tân `VangMat` trước/trong cửa sổ tiếp đón; biên `thoi_gian + check_in_sau_phut` | 409 `CHUA_QUA_GIO_HEN`; biên: đúng mốc còn trong cửa sổ (chưa được), +1s được | Q22 | I |
| CT-05 | Lễ tân `DaXacNhan → DaTiepDon`, đủ tiền (cổng giả 0), trong cửa sổ | `DaTiepDon`; khung giờ giữ `DaDat` | b2–b4 | I |
| CT-06 | A2: còn phải thu | 409 `CON_PHAN_CHUA_THANH_TOAN` kèm số tiền; không đổi gì | A2/2a–2b | I, E |
| CT-07 | Ngoài cửa sổ: trước `thoi_gian − check_in_truoc_phut`, sau `thoi_gian + check_in_sau_phut`; hai biên | 409 `NGOAI_KHUNG_GIO_TIEP_DON` kèm khoảng; hai biên đúng được | TĐK, Q22 | I |
| CT-08 | Chuyển không hợp lệ: `DaTiepDon → DaHuy`, `DaHuy → *`, `VangMat → *`, `HoanThanh → *` | 409 `CHUYEN_TRANG_THAI_KHONG_HOP_LE` | b2 | I, E |
| CT-09 | Lịch ở chi nhánh khác / không tồn tại | 404 cùng thân | TĐK, QB-04 | E |
| CT-10 | Thiếu `cau_hinh_he_thong` | `DaTiepDon`/`VangMat`: 409 `HE_THONG_CHUA_CAU_HINH`; `DaHuy` vẫn chạy | quy tắc 35 | I |
| CT-11 | `chuyenDuoc[]` ở chi tiết Lễ tân khớp ma trận cho mọi trạng thái × thời điểm | Khớp MT-02 | b2 | I |
| CT-12 | Thông báo cho Bệnh nhân: `LichHenDaHuy`, `LichHenVangMat` ghi đúng tài khoản đặt (không phải người thân) | Đúng | b5, b13 | I |
| CT-13 | Hai Lễ tân cùng đổi một lịch (hủy và vắng mặt) | Đúng một kết quả; bên thua nhận kết quả có kiểu (409), INV | A3, H4 | I |
| CT-14 | QTV override từng cặp hợp lệ của Q24 | Trạng thái, khung giờ, audit `OverrideLichHen` (`truoc`, `sau`, `ly_do`) cùng giao dịch; thông báo | b6 | I |
| CT-15 | Override thiếu/rỗng `lyDo`; > 255 | 400 `LY_DO_BAT_BUOC` | b6 | E |
| CT-16 | Override cặp không hợp lệ: nguồn `HoanThanh`/`DaHuy`/`DaDoiLich`; đích `HoanThanh`/`DaDoiLich`/`ChoThanhToan`; cùng trạng thái | 409 `CHUYEN_TRANG_THAI_KHONG_HOP_LE` | A1, Q24 | I |
| CT-17 | QTV Chi nhánh override lịch chi nhánh khác; QTV Toàn hệ thống mọi chi nhánh | 404 cùng thân; Toàn hệ thống ok | QB-05 | E |
| CT-18 | Audit lỗi (`AuditError`) | Hoàn tác **toàn bộ** (trạng thái, khung giờ, thông báo) | H12 | I |
| CT-19 | Override sang `VangMat` | Cộng no-show như mọi đường khác; bật cờ khi đạt ngưỡng | b9 | I |
| CT-20 | Override `VangMat → DaXacNhan` | Không trừ `so_lan_no_show` | A3, Q24 | I |
| CT-21 | Override `DaTiepDon` ngoài cửa sổ và còn phải thu | Được (không bị quy tắc 40, 45–47) | Q22, quy tắc 47 | I |
| CT-22 | Sai vai trò: Bệnh nhân/Bác sĩ gọi route Lễ tân; Lễ tân/Bác sĩ gọi route QTV | 403 | QB-02 | E |

### 7.6 Vắng mặt tự động và no-show (VM)

| ID | Kịch bản | Mong đợi | Phủ | Loại |
|---|---|---|---|---|
| VM-01 | Lịch `DaXacNhan` có ca đã kết thúc (`CaSang` hoặc `CaChieu`) | `VangMat`; `so_lan_no_show` + 1; khung giờ giữ `DaDat`; thông báo `LichHenVangMat` | b7–b9, b13 | I |
| VM-02 | Ca chưa kết thúc; biên: `now` đúng giờ kết thúc, +1s | Đúng giờ kết thúc coi là đã kết thúc (nửa mở: `<= now`); trước đó không đụng | b7 | I |
| VM-03 | Thứ ISO (T2…CN), Chủ nhật nghỉ, khoảng sáng/chiều khác nhau theo chi nhánh | Giờ kết thúc ca lấy đúng khoảng; ánh xạ `WEEKDAY + 1` | Q23, M6 | I |
| VM-04 | Lịch `ChoThanhToan`, `DaTiepDon`, `DaHuy`, `HoanThanh`, `VangMat` | Không đụng | b7 | I |
| VM-05 | Số mới đạt ngưỡng; chưa đạt | Đạt: `khoa_dat_lich_do_no_show = true` + thông báo khoá **một lần**; chưa đạt: không khoá, không thông báo khoá | b10–b12 | I |
| VM-06 | Cờ đã bật từ trước | Chỉ tăng số lần; không cảnh báo lặp | A4/10a–10b | I |
| VM-07 | Sau QTV mở khoá (cờ `false`, số lần ≥ ngưỡng), thêm một lần Vắng mặt | Khoá lại ngay | Q25 | I |
| VM-08 | Không giải phóng khung giờ, không gọi `WaitlistPort` | Khung giờ `DaDat`, cổng không gọi | b8 | I |
| VM-09 | Chạy job hai lần; hai bản job cùng lúc | Mỗi lịch đúng một lần; số lần no-show đúng; 0 lỗi 1213/1205 | H9 | I |
| VM-10 | Check-in (Lễ tân) và job đồng thời (A3) | Đúng một kết quả: `DaTiepDon` (job thấy và bỏ qua) hoặc `VangMat` (check-in bị 409); INV | A3/8a–8b | I |
| VM-11 | Ca không có khoảng (`CaToi`, giờ kết thúc NULL) | Không tự đánh; ghi cảnh báo log (không nội dung riêng tư) | quy tắc 44 | I |
| VM-12 | Thiếu cấu hình | Bỏ lượt, cảnh báo, không đoán ngưỡng | quy tắc 35 | I |
| VM-13 | Nhiều lịch > 100; trần lô; một lịch lỗi | Như HG-05, HG-06 | H9 | I |
| VM-14 | Lịch của hồ sơ người thân | Cộng vào `so_lan_no_show` của **tài khoản đặt** | Q14 | I |
| VM-15 | Hai lịch của cùng một tài khoản bị đánh Vắng mặt đồng thời | `so_lan_no_show` + 2, cờ đúng (khoá `benh_nhan`) | DT-15 | I |
| VM-16 | Đồng hồ giả, `NODE_ENV=test` | Job không tự chạy | H9 | I |

### 7.7 Danh sách của Lễ tân và Quản trị viên (DSV)

| ID | Kịch bản | Mong đợi | Phủ | Loại |
|---|---|---|---|---|
| DSV-01 | Lễ tân gọi danh sách | Chỉ lịch `lich_hen.chi_nhanh_id = le_tan.chi_nhanh_id`; `chiNhanhId` trong query bị bỏ qua | XDS b2, b4 | I, E |
| DSV-02 | QTV Chi nhánh | Ép theo chi nhánh được gán; `chiNhanhId` khác bị bỏ qua | XDS b2 | I, E |
| DSV-03 | QTV Toàn hệ thống: có và không `chiNhanhId` | Lọc đúng / tất cả | XDS b2 | I |
| DSV-04 | Lọc `chuyenKhoaId`, `bacSiId`, `trangThai[]`, `tuNgay`, `denNgay` (biên khoảng đóng), kết hợp | Đúng | XDS b3–b4 | I |
| DSV-05 | A1: không có kết quả | 200 `items: []` | A1/4a–4b | I, E |
| DSV-06 | Phân trang, sắp xếp ổn định (`thoi_gian`, `lich_hen_id`); trang vượt cuối | Đúng; không 500 | Q35 | I |
| DSV-07 | `q`: mã, tên, SĐT, bác sĩ; escape; độ dài | Như LS-08 | Q35 | I |
| DSV-08 | Danh sách trắng trường | Không email, ngày sinh, địa chỉ, băm; có `nguoiKham` và `nguoiDat` | H10 | E |
| DSV-09 | Chi tiết lịch ngoài phạm vi / không tồn tại | 404 cùng thân | QB | E |
| DSV-10 | `conPhaiThu` ở chi tiết (cổng giả) | Đúng | b2 | I |
| DSV-11 | Chuyên khoa theo bác sĩ **hiện tại** (đổi chuyên khoa bác sĩ rồi lọc lịch cũ) | Lịch cũ chuyển theo (ghi nhận đúng L14) | L14 | I |
| DSV-12 | Lọc đúng `DaDoiLich` | Hiện ở Lễ tân/QTV (khác Bệnh nhân) | Q31 | I |

### 7.8 Danh sách của Bác sĩ (DSB)

| ID | Kịch bản | Mong đợi | Phủ | Loại |
|---|---|---|---|---|
| DSB-01 | Bác sĩ A gọi | Chỉ lịch `bac_si_id = A`; `bacSiId` trong query bị bỏ qua | XDSPC, QB-06 | I, E |
| DSB-02 | Lọc ngày/tuần/tháng (biên đầu/cuối, giờ VN) | Đúng | b2–b4 | I |
| DSB-03 | Lọc `trangThai[]`, `ca`, `q` | Đúng | b3 | I |
| DSB-04 | Sắp `MoiNhat`/`CuNhat`; mặc định | Đúng | Q33 | I |
| DSB-05 | A1: rỗng | 200 `items: []` | A1/4a–4b | I, E |
| DSB-06 | Trường: không giá, cọc, thanh toán, email | Đúng danh sách trắng | H10 | E |
| DSB-07 | Chi tiết lịch của bác sĩ khác | 404 cùng thân | QB-06 | E |
| DSB-08 | Ghi chú khám khi chưa có `ho_so_kham` | `null` (không tạo nội dung giả) | b5 | I |
| DSB-09 | Sai vai trò gọi route Bác sĩ | 403 | QB-02 | E |

### 7.9 Phân quyền và sở hữu (QB)

| ID | Kịch bản | Mong đợi | Phủ | Loại |
|---|---|---|---|---|
| QB-01 | Bệnh nhân A xem/huỷ/tạo (cho người thân của B) lịch của B | 404 cùng thân (kể cả hồ sơ người thân của B) | SOW 3.2 | E |
| QB-02 | Ma trận route × vai trò (BN, BS, LT, QTV chi nhánh, QTV toàn hệ thống, chưa đăng nhập) | Đúng 401/403/200 theo 5.9 | SOW 3.2 | E |
| QB-03 | Gửi `benhNhanId`, `bacSiId`, `chiNhanhId` trong thân/query ở mọi route chủ sở hữu | Bỏ qua (query) hoặc 400 (thân); quyền không đổi | H10 | E |
| QB-04 | Lễ tân ngoài chi nhánh: danh sách, chi tiết, đổi trạng thái | Không thấy; 404 | CNTT TĐK | E |
| QB-05 | QTV Chi nhánh ngoài phạm vi: xem, override | 404 | admin Q40 | E |
| QB-06 | Bác sĩ chỉ thấy lịch của mình | Đúng | XDSPC | E |
| QB-07 | Quét route (AR-02) | Không route nào thiếu `@Roles`; route `@Public` không có | CODING_CONVENTION | U |
| QB-08 | `Cache-Control: no-store` ở mọi route của module | Đúng | H10 | E |
| QB-09 | `maLichHen` sai dạng, chữ thường, dài quá | 404 cùng thân; chuẩn hoá chữ hoa | H17 | E |
| QB-10 | Tài khoản bị khoá/đổi vai trò giữa các request | Bị chặn ngay (guard đọc DB mỗi request) | auth A4 | E |

### 7.10 Đồng thời (DT) — chạy trên MySQL thật, sau mỗi ca chạy INV-01…INV-05

| ID | Kịch bản | Mong đợi | Phủ | Loại |
|---|---|---|---|---|
| DT-01 | **Hai Bệnh nhân khác nhau cùng giữ một khung giờ** (≥ 30 vòng) | Đúng một 201; người kia `KHUNG_GIO_DA_DAT`/`KHUNG_GIO_DANG_GIU`; không 500; 0 deadlock | H1, A2 | I |
| DT-02 | Mười yêu cầu cùng một khung giờ | Đúng một thắng; chín lỗi có mã; thời gian chờ tối đa hợp lý | H1 | I |
| DT-03 | **Hết hạn (job) đúng lúc thanh toán thành công** | Đúng một bên thắng: (lịch `DaXacNhan`, khung giờ `DaDat`) hoặc (lịch `DaHuy`, `confirmPaid` ⇒ `HetHanGiuCho`); không bao giờ "đã xác nhận mà khung giờ `ConTrong`" | H3, Q4 | I |
| DT-04 | Hết hạn **lười** (người mới đặt đúng khung giờ) đúng lúc `confirmPaid` của người cũ | Như DT-03; người mới chỉ thắng nếu người cũ thua | H3 | I |
| DT-05 | **Huỷ (Bệnh nhân) cùng lúc tiếp đón (Lễ tân)** | Một kết quả duy nhất (`DaHuy` + khung giờ `ConTrong`, hoặc `DaTiepDon` và huỷ nhận `LICH_HEN_KHONG_CHO_HUY`) | H4 | I |
| DT-06 | Huỷ cùng lúc job Vắng mặt | Đúng một kết quả; không giải phóng sai | H4 | I |
| DT-07 | Hai huỷ cùng lúc (Bệnh nhân và Lễ tân) | Một `Cancelled`, một `AlreadyCancelled`/409; hoàn tiền/mời chờ **một lần** | H4 | I |
| DT-08 | Job hết hạn cùng lúc Bệnh nhân huỷ | Một kết quả; `WaitlistPort` một lần | H4 | I |
| DT-09 | **Duyệt nghỉ phép (cổng giả khoá `bac_si` `FOR UPDATE`, đổi trạng thái, commit, rồi huỷ các lịch bị ảnh hưởng) cùng lúc với đặt lịch** (≥ 30 vòng) | Mỗi vòng đúng một: lịch vừa tạo bị bước huỷ thấy và huỷ (`BacSiNghiPhep`), hoặc đặt lịch bị `BAC_SI_NGHI_PHEP`; không có lịch `DaXacNhan` trong khoảng nghỉ đã duyệt | H5, D5 | I |
| DT-10 | Hai yêu cầu đặt cùng tài khoản/hồ sơ khi chỉ còn 1 chỗ trong giới hạn | Đúng một thắng; hai khung giờ khác nhau cũng chỉ một thắng | quy tắc 37 | I |
| DT-11 | **Tạo lịch với ngừng sử dụng hồ sơ người thân** (NT-17 thật; 2 biến thể đọc kiểm hiệu lực) ≥ 30 vòng | Hoặc (hồ sơ ngừng, không lịch mới) hoặc (có lịch, ngừng bị 409); không deadlock | H14, patient NT-17 | I |
| DT-12 | Tạo lịch với admin đổi chi nhánh bác sĩ (`bac_si` X giả lập) | Khoá `FOR SHARE` chờ; kết quả nhất quán (chi nhánh lịch = chi nhánh bác sĩ lúc commit) | H6 | I |
| DT-13 | Nhiều Bệnh nhân khác nhau đặt nhiều khung giờ khác nhau của cùng một bác sĩ (≥ 20 người) | Tất cả thành công; sau thử lại **0** lỗi 1213/1205 | H2 | I |
| DT-14 | Stress chéo: tạo + huỷ + hết hạn + Vắng mặt + `confirmPaid` trên cùng tập khung giờ (≥ 100 vòng) | INV-01…INV-05 đúng ở cuối; 0 deadlock còn sót | H2 | I |
| DT-15 | Hai lịch cùng tài khoản bị Vắng mặt đồng thời | `so_lan_no_show` đúng + 2; cờ khoá đúng | H2 | I |
| DT-16 | Hai bản job hết hạn cùng lúc | Mỗi lịch hết hạn đúng một lần | H9 | I |
| DT-17 | **Mất tiến trình giữa hai bước của duyệt nghỉ phép (D5):** cổng giả commit `DaDuyet` rồi dừng sau khi mới huỷ một phần lịch bị ảnh hưởng; chạy lại bước (2) (và chạy lại lần nữa) | Các lịch còn lại được huỷ **đúng một lần** (`AlreadyCancelled` cho lịch đã huỷ, không hoàn tiền/mời chờ lần hai); không có lịch `DaXacNhan` trong khoảng nghỉ đã duyệt; INV | H5, D5 | I |

### 7.11 Bất biến và kiến trúc (INV, AR)

| ID | Kịch bản | Mong đợi | Phủ | Loại |
|---|---|---|---|---|
| INV-01…INV-05 | Chạy sau mọi ca ghi/đồng thời | INV-1 đến INV-5 của mục 5.2 | H1 | I |
| AR-01 | Quét `src/` tìm `UPDATE lich_hen`/`UPDATE khung_gio` ngoài `appointments/` (kể cả tên bảng trong chuỗi SQL, query builder) | Không có; có ngoại lệ ghi rõ (`seed`, `testing/`) | H7 | U |
| AR-02 | Quét route của module | Mọi route có `@Roles` | QB-07 | U |
| AR-03 | Cây import chỉ có đúng một `ScheduleModule` | Đúng (E2E-J02 vẫn xanh) | H9 | E |
| AR-04 | Quét SQL của module tìm `NOW()`/`CURDATE()` | Không có (dùng `:now`) | H8 | U |

### 7.12 Hợp đồng khoá với `patient` (KT) — patient X3 chạy lại

| ID | Kịch bản | Mong đợi | Phủ | Loại |
|---|---|---|---|---|
| KT-01 | Ngừng hồ sơ song song với **`POST /booking/appointments` thật** (hai biến thể, ≥ 30 vòng) | Mỗi vòng đúng một trong hai; không deadlock, không 500 | patient NT-17 | I |
| KT-02 | Đặt lịch vào hồ sơ vừa ngừng | 409 `HO_SO_NGUOI_THAN_DA_NGUNG` | NT-18 | I, E |
| KT-03 | Tất định: giao dịch giả giữ `benh_nhan` `FOR UPDATE`; tạo lịch phải **chờ** rồi (sau commit của giao dịch giả đã ngừng hồ sơ) báo `HO_SO_NGUOI_THAN_DA_NGUNG` | Đúng; chứng minh thứ tự khoá `benh_nhan` → `ho_so_nguoi_than` | patient 5.3 | I |
| KT-04 | NT-24 (không câu đọc thường trước hai khoá) chạy lại với lịch tạo qua API thật | Xanh | patient NT-24 | I |
| KT-05 | `isVisitProfileUsable` dùng trong tạo lịch với hồ sơ ngừng/của người khác/đang hiệu lực | `false`/`false`/`true` | patient NT-18 | I |

### 7.13 Cổng với module khác (CP)

| ID | Kịch bản | Mong đợi | Phủ | Loại |
|---|---|---|---|---|
| CP-01 | Cổng `Noop` mặc định: không chặn, không ghi; có cảnh báo log một lần (không nội dung riêng tư) | Đúng; không ảnh hưởng nghiệp vụ | 5.10 | U |
| CP-02 | `payment` giả gọi `confirmPaid` trong giao dịch của nó rồi lỗi sau đó | Hoàn tác **cả hai** (không "trả tiền mà lịch chờ") | H16 | I |
| CP-03 | `RefundPort` gọi sau commit, một lần; ném lỗi không ảnh hưởng | Đúng | HL-10, HL-11 | I |
| CP-04 | `WaitlistPort.onSlotReleased` một lần, đúng điều kiện | Đúng | HL-12 | I |
| CP-05 | `DoctorLeavePort` giả chặn/không chặn | Đúng mã `BAC_SI_NGHI_PHEP` | DL-17 | I |
| CP-06 | `PendingBranchChangesPort` giả chặn/không chặn | Đúng mã | DL-18 | I |
| CP-07 | `complete` bởi doctor giả: thành công, bác sĩ khác, sai trạng thái | `Completed`/`NotAssigned`/`InvalidState` | D6 | I |
| CP-08 | `findAffectedByLeave`: khoảng ngày, `TheoCa`/`CaNgay`, chỉ `ChoThanhToan`/`DaXacNhan`, của đúng bác sĩ | Đúng tập | D5 | I |
| CP-09 | `holdForInvitation`/`releaseInvitationHold` thả có điều kiện `giu_cho_den = den`; khung giờ đã bị người khác giữ lại | Không thả nhầm | W3 | I |
| CP-10 | Mọi ghi `khung_gio` đi qua `SlotHoldService` | AR-01 | D7 | U |

### 7.14 Thông báo và email (TB)

| ID | Kịch bản | Mong đợi | Phủ | Loại |
|---|---|---|---|---|
| TB-01 | 4 sự kiện (xác nhận, huỷ, vắng mặt, khoá) | Ghi đúng tài khoản **đặt** (không phải người thân), đúng `loai_su_kien`, cùng giao dịch | Q29 | I |
| TB-02 | `noi_dung` | ≤ 500 ký tự; không lý do khám, không SĐT | H10 | U |
| TB-03 | Cờ khoá đã bật | Không thông báo khoá lặp | A4 | I |
| TB-04 | Mẫu thư: HTML escape (tên bác sĩ chứa `<script>`), không script/ảnh/liên kết/`style`; chân thư từ `thong_tin_phong_kham`, thiếu ⇒ bỏ dòng | Đúng | Q30 | U |
| TB-05 | Lỗi gửi thư | Không hoàn tác lịch hẹn; log không địa chỉ/nội dung | H12 | I |
| TB-06 | Hết hạn giữ chỗ | Không thông báo | Q6 | I |
| TB-07 | Ba biến thể huỷ theo `reason` | Đúng chữ biến thể | Figma `676:2` | U |
| TB-08 | `FakeMailService` | Không gửi thật (test không có thư thật) | AGENTS mục 3 | U |

### 7.15 Giao diện (WZ, LH, LT, QT, BSI)

| ID | Kịch bản | Mong đợi | Phủ | Loại |
|---|---|---|---|---|
| WZ-01 | Vào luồng khi bị khoá no-show | Thông báo A4, không vào Bước 4 | A4 | W |
| WZ-02 | Bước 4: bản thân `Đang chọn`; hộp chọn liệt kê bản thân + người thân **đang hiệu lực** (ẩn hồ sơ ngừng) | Đúng | b9–b10 | W |
| WZ-03 | "Lý do khám (không bắt buộc)": để trống tiếp tục được; 501 ký tự | Đúng | Q9 | W |
| WZ-04 | Bước 5: tóm tắt đủ trường (giá, phụ phí, cọc, chính sách hoàn, số dư ví khi có) | Theo `checks` | b12 | W |
| WZ-05 | Xác nhận: cọc 0 ⇒ Bước 6; cọc > 0 ⇒ Bước Thanh toán | Điều hướng đúng | b13–b16 | W |
| WZ-06 | A2: `KHUNG_GIO_DA_DAT`/`DANG_GIU` | Thông báo đúng `maLoi`; nút chọn lại khung giờ | A2/8b–8c | W |
| WZ-07 | A3, A6: các mã tương ứng | Thông báo đúng từng mã; A6 hiện thứ/giờ | A3, A6 | W |
| WZ-08 | Điểm vào A1 (`?khungGioId=`) khi đã đăng nhập; khi chưa (đăng nhập rồi quay lại đúng URL) | Điền sẵn; không giữ chỗ khi chuyển trang | A1/1-8a–8c | W |
| WZ-09 | Tải lại Bước 5; quét storage | Về Bước 4; `localStorage`/`sessionStorage` không chứa lý do khám/hồ sơ | Q38 | W |
| WZ-10 | Đếm ngược theo giờ máy chủ (lệch đồng hồ máy khách); về 0 | Đúng; tải lại chi tiết; trạng thái hết hạn do server quyết | b15, A5 | W |
| WZ-11 | Bước 6: phiếu đủ trường; hai nút | Đúng | b16 | W |
| WZ-12 | Bấm đúp "Xác nhận" | Một lời gọi | b13 | W |
| WZ-13 | Mất mạng/timeout/lỗi lạ khi tạo | Thông báo, không chuyển bước, `usePageActive` | CODING_CONVENTION | W |
| WZ-14 | Truy cập bàn phím, thứ tự Tab, `aria-live` theo mốc, nhãn bước | Đạt | WCAG 2.2 AA | W, M |
| LH-01 | Danh sách Bệnh nhân: thẻ lọc có số đếm, ô tìm, bộ lọc, chuyển trang, rỗng/lỗi/loading/mất mạng | Đúng | TCLS A1 | W |
| LH-02 | Chi tiết theo từng trạng thái (Chờ thanh toán, Đã xác nhận, Hoàn thành, Đã hủy); `thanhToan` null | Đúng khối | TCLS b6 | W |
| LH-03 | Hộp huỷ: hoàn dự kiến, `Giữ lịch`, `Xác nhận hủy`, kết quả số thực tế, lỗi 409 | Đúng | HLH b3–b5 | W |
| LH-04 | Nút huỷ ở `ChoThanhToan` | Có (Q45) | HLH TĐK | W |
| LH-05 | Đóng hộp xác nhận không gọi API | 0 lời gọi | HLH A2 | W |
| LT-01 | Danh sách Lễ tân: chip ngày, lọc, nút theo `chuyenDuoc[]` | Đúng | CNTT b2 | W |
| LT-02 | Hộp Hủy: `Lý do hủy *` bắt buộc | Chặn khi rỗng | Q27 | W |
| LT-03 | Hộp Vắng mặt: xác nhận | Gọi đúng | CNTT b3 | W |
| LT-04 | Lỗi `CON_PHAN_CHUA_THANH_TOAN`, `NGOAI_KHUNG_GIO_TIEP_DON` | Thông báo đúng | A2 | W |
| LT-05 | `Thu tiền` là nút vô hiệu "Chưa được triển khai" khi chưa có `payment` | Đúng | mục 5.13 | W |
| QT-01 | Admin danh sách: bộ lọc chi nhánh chỉ cho Toàn hệ thống; Chi nhánh cố định | Đúng | XDS b2 | W |
| QT-02 | Admin chi tiết (panel lịch sử từ cột + audit) | Đúng | L26 | W |
| QT-03 | Override: đích chỉ trong ma trận, lý do bắt buộc | Đúng | CNTT b6 | W |
| BSI-01 | Bác sĩ danh sách/chi tiết, lọc ngày/tuần/tháng | Đúng | XDSPC | W |
| BSI-02 | Không hiện giá/cọc/email | Đúng | H10 | W |

### 7.16 Bảo mật dùng chung (BB)

| ID | Kịch bản | Mong đợi | Phủ | Loại |
|---|---|---|---|---|
| BB-01 | Chạy đủ luồng đặt, huỷ, vắng mặt với log bắt | Log không có lý do khám, tên, SĐT, `maLichHen` kèm dữ liệu cá nhân | SOW 3.2 | E |
| BB-02 | Lỗi 5xx | Chỉ `maLoi`, `thongBao`, `requestId`; không stack/SQL | P5 auth | E |
| BB-03 | Mã lịch hẹn: không tuần tự; entropy 5 ký tự/ngày | Không đoán được kế tiếp | H17 | U |
| BB-04 | Lỗi UNIQUE/FK/deadlock/1205 đã lường trước | 4xx có mã, **không** 500 | H1, H2 | I |
| BB-05 | Quét web: không `localStorage`/`sessionStorage` chứa dữ liệu lịch hẹn/lý do khám | Đúng | Q38 | W |

## 8. Đề xuất gom cụm (chỉ đề xuất — nhóm chốt)

Một người làm full-stack trọn module; mỗi task một PR. Thứ tự cụm theo phụ thuộc thật và theo mức "đã đủ thông tin":

| Cụm | Task (thứ tự PR) | Điều kiện bắt đầu | Kết quả nhìn thấy được |
|---|---|---|---|
| 0 — Nền và đo | **X1 (sau P1) · P1 → P2**, P3, P5 (độc lập); P4 sau Q34; P6/P7/P8 theo Q15/Q29/doctor | Ngay (P1, P3, P5) | Module khung, cổng và hạ tầng test; số đo thật cho khoá và thời gian |
| 1 — Đọc | **B1 → B2 → F1**; **B3 → B4 → F8**; B5 | Cụm 0 (P1, P2; P4 cho B3) | "Lịch hẹn của tôi", "Quản lý lịch hẹn" (Lễ tân), "Lịch hẹn" (Admin) xem được dữ liệu tự dựng; TCLS, XDS, XDSPC (API) xong |
| 2 — Lõi giữ chỗ | **B6 → B7 → B8** · **B9 → B10 → F2** · **B11** | Cụm 0, X1, Q1, Q2, Q7, Q8 | Đặt lịch cọc 0đ trọn vẹn ở API; hết hạn giữ chỗ; huỷ không cọc; hàm cho `payment`/`doctor` |
| 3 — Đặt lịch (web) | **F3 → F4 → F5 → F7**; F6 sau `payment` | B7, B8, P5, Q36, Q38 | Bước 4–6 chạy trên khung giờ seed |
| 4 — Vận hành | **B12 → B13 → B14 → F9 → F10** | B10, B11, Q21–Q25, Q27 | Lễ tân Hủy/Vắng mặt, tự Vắng mặt và khoá no-show, Admin override |
| 5 — Thông báo | **P7 → B15** | Q29, Q30; `notification` | Thư và thông báo thật |
| 6 — Chờ module khác | **B16**, **B17**, F6, F11 | `doctor`, `admin` B10, `payment`, `wallet`, `waitlist` | Tích hợp thật; chạy lại các ca đồng thời với cổng thật |
| 7 — Hoàn tất | **X2 → X3 → X4**; D1–D3 đi theo từng cụm | Cụm 1–4 | Module đủ điều kiện mục 10; patient X3 đóng |

Cụm 1 độc lập cụm 2 sau P1, P2: nếu thiếu thời gian thì làm B1 → F1 (nhìn thấy được sớm) song song X1. Cụm 3 chỉ cần B7, B8: làm F3–F5 ngay khi cụm 2 xong. Nếu cần một người hỗ trợ, phần tách gọn nhất là cụm 1 (B3–B5, F8, F10 phần đọc), nhưng người làm chính vẫn phải giải thích được toàn module (đặc biệt thứ tự khoá và các ca đồng thời) khi vấn đáp. **Mục 5.10 (đối chiếu với `doctor`) phải xong trước khi tạo issue của cụm 2** (hiện chưa có PLAN `doctor`: làm khi có và ghi ở TRACKING mục 3 của cả hai module); các câu ★ đã trả lời, còn Q7, Q15, Q29 chờ Trung và Q42 chờ số đo X1.

**Gợi ý MVP cho demo (chỉ là gợi ý, nhóm chốt):** cụm 0, 1, 2 và 3 (đọc; tạo lịch cọc 0đ; hết hạn giữ chỗ; huỷ không cọc; luồng đặt lịch trên web) là bản chạy được trọn vẹn: Bệnh nhân đặt lịch (dịch vụ không cọc) → xem "Lịch hẹn của tôi" → huỷ, khung giờ được trả lại, lịch chưa thanh toán tự hết hạn; Lễ tân/Admin xem danh sách. Cụm 4 (Lễ tân Hủy/Vắng mặt, tự Vắng mặt và khoá no-show, override) làm tiếp theo thời gian; cụm 5, 6 (thông báo thật, cổng của `doctor`/`admin`/`payment`/`wallet`/`waitlist`) làm khi các module đó có mã. Khung giờ cho demo lấy từ seed/fixture (Q40) tới khi `doctor` có bộ sinh.

## 9. Quy trình bắt buộc cho mỗi PR của module

1. Nhánh `feat/booking-<việc>` do thành viên tạo; tiêu đề PR theo Conventional Commits, scope `booking` (hạ tầng: `api`/`web`/`db`/`docs`; module khác bị chạm: `search`, `rbac`, `audit`), **không quá 100 ký tự** (đếm ký tự), ví dụ `feat(booking): thêm giữ chỗ nguyên tử và tạo lịch hẹn (B8)`. Thân PR có `Closes #<issue>`; không viết `@Ten` hay `#số` trần ngoài chỗ cố ý. Commit/push/merge **do thành viên tự làm**; không có dòng `Co-Authored-By` hay chữ ký AI (AGENTS mục 1, CONTRIBUTING mục 9).
2. Dùng AI ⇒ ghi `AI_USAGE_LOG.md` bảng 1 **ngay** (công cụ ghi đúng tên kèm model; mỗi task một dòng, ghi ở PR kế tiếp nếu chưa có số); lỗi AI phát hiện ⇒ bảng 2 + `AI-BUG-nnn` trong commit sửa. **Lần lập kế hoạch này cũng cần một dòng** (công cụ: Claude Code, model Claude Sonnet 5.5).
3. Đổi thiết kế/DB ⇒ cập nhật tài liệu trong cùng PR (task `[ĐỒNG BỘ TL]`, mục 6.5); `docs/database/*` sửa **cả ba file**; 2.4/Figma thì nhắc người dùng làm.
4. Sửa file của module khác (`[ĐỤNG admin]`, `[ĐỤNG search]`, `[ĐỤNG rbac]`, `[ĐỤNG audit]`, `[ĐỤNG patient]`, `[ĐỤNG doctor]`) hoặc file dùng chung (`docs/database/*`, `router/*`, `shared/**`, `app.module.ts`, `package.json`) ⇒ báo người sở hữu trước, `git pull` bản mới trước khi bắt đầu, giữ PR nhỏ.
5. Chạy thật `npm run lint`, `build`, `test`, `test:int`, `test:e2e` (api) và `lint`, `test` (web), báo đúng kết quả (kể cả đỏ); `npm run dup` (jscpd ≤ 3%, **chạy trong container Linux** vì bản Windows quét 0 file: TECH_DEBT dòng 5); **không chạy hai vitest cùng lúc trên cùng DB test**; Node 22.x. Cập nhật `TRACKING.md` sau mỗi task; khi cả module xong thêm **đúng một dòng** vào `docs/TRACKING.md`.
6. Tự giải thích được mọi dòng — đặc biệt: thứ tự khoá và vì sao một thứ tự toàn cục (5.3), ba lớp chống đặt trùng (H1), vì sao giữ chỗ lúc bấm Xác nhận (Q1), vì sao chỉ một nơi ghi `trang_thai` (H7), hết hạn lười và đua với thanh toán (5.5, Q4), vì sao `READ COMMITTED` và thử lại chỉ trước commit, vì sao tự Vắng mặt không giải phóng khung giờ, vì sao hoàn tiền chạy sau commit.

## 10. Điều kiện hoàn thành module

- Mọi test case ở mục 7 (trừ ca của phương án không được chọn) đã chạy; kết quả ghi trong `TRACKING.md`; không còn Fail; INV-01…INV-05 đúng sau mọi ca đồng thời; số đo X1 (M1–M11) đã ghi.
- Không còn thẻ `[CHỜ …]` (task bị hoãn theo quyết định nhóm ghi rõ ở `TRACKING.md` mục 3 và `TECH_DEBT`); mọi `[ĐỒNG BỘ TL]` đã làm; 2.4, `docs/database/*` và Figma khớp với mã; cổng `Noop` còn lại (nếu module kia chưa có) được ghi ở `TECH_DEBT` kèm điều kiện thay.
- PLAN `doctor` và PLAN này **đã đối chiếu** mục 5.10; tên hàm hai bên trùng; `search` K1 có `khungGioId`.
- Hợp đồng khoá với `patient` được chứng minh bằng KT-01…KT-05; patient X3 đã đóng.
- Khung Bệnh nhân, Lễ tân, Quản trị viên đã có trang lịch hẹn; trang Bác sĩ đã xuất cho `doctor` gắn.
- `docker compose up --build` chạy; X2 đạt với tài khoản seed. Lint/build/test xanh; không secret; `AI_USAGE_LOG.md` đầy đủ.
