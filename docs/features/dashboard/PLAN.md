# Kế hoạch scope `dashboard`: Dashboard và báo cáo vận hành

> **Trạng thái: bản nháp 1 (26/11/2026). Đại đã trả lời trực tiếp 14 câu Q1 đến Q14** (bốn hộp câu hỏi trong phiên lập kế hoạch): 12 câu theo đề xuất; **hai câu chọn khác: Q9 (Lễ tân có dashboard rút gọn) và Q12 (tách theo trạng thái)**; Q14 xếp phần Lễ tân là **phần cắt được**. Điểm kỹ thuật T1 đến T13 (mục 4.3) **đã được phiên kiểm độc lập duyệt kỹ thuật** ngày 26/11/2026 theo ủy quyền của Đại (không phải quyết định sản phẩm hay schema). Chưa mở PR; **chưa tạo issue** (danh sách ở mục 6.6; Đại tự chạy script sau khi PR tài liệu merge).
> **Người LÀM scope này: Đại (`MaxTrann`), module `dashboard`; Trung (`junUTE`) review.** Điểm chạm file của module khác gắn thẻ `[ĐỤNG …]`; Trung approve PR tài liệu coi là xác nhận các điểm chạm đó.
> Kế hoạch lập theo [`docs/FEATURE_PLANNING_PROMPT.md`](../../FEATURE_PLANNING_PROMPT.md) và nếp PLAN [`chatbot`](../chatbot/PLAN.md). **Phiên lập kế hoạch này KHÔNG sửa `AI_USAGE_LOG.md` và `docs/TECH_DEBT.md`** (bản nháp ở [`TRACKING.md`](TRACKING.md) mục 4).
> Đã kiểm mã thật trên `origin/main` ở **`1cc0099`** (26/11/2026); đối chiếu lại tới **`c61d4f6`**: `f931e6e` (PR 744, đổi lịch X3, chỉ tài liệu) và `c61d4f6` (PR 743, chat B1: thêm `apps/api/src/chat/` và `ChatModule` ở `app.module.ts`; không đổi schema; trong các file kế hoạch chạm chỉ có `app.module.ts` đổi). Chỗ nào ghi **"chưa đo"** hay **"chưa kiểm"** là suy ra từ mã hay tài liệu, **chưa chạy thử**. Phiên này **không chạy** `npm`, test, build, Docker hay MySQL, **không đọc** `.env` thật, và chỉ tạo hai file mới `docs/features/dashboard/PLAN.md`, `TRACKING.md`.
> **Mã mới nằm trong `apps/api/src/dashboard/` và `apps/web/src/features/dashboard/`**; scope commit `dashboard` (thêm vào `commitlint.config.cjs` ở B1, T1).
>
> **Bốn điều phải đọc trước:**
> 1. **Chỉ số "tỉ lệ chấp nhận lời mời danh sách chờ" của đặc tả BỊ BỎ** vì danh sách chờ chuyển sang Khóa luận (văn bản Phạm vi nhóm F-4). Use case 2.4 vẫn ghi chỉ số đó (mục 3.3, L1).
> 2. **Cam kết F-5 là phần Quản trị viên: 6 task, 22 giờ, xong chậm nhất 21/12** (Q11, Q14). Phần Lễ tân (B3, F3; 4,5 giờ) **chỉ làm nếu còn giờ**.
> 3. **Lịch chặt:** Iteration 9 chỉ còn khoảng 3 giờ sau chatbot; Iteration 10 dư khoảng 1 giờ sau phần Quản trị viên và trùng với tuần dự phòng của chatbot (mục 6.4).
> 4. **Văn bản Phạm vi (hạn nộp 16:46 ngày 27/11/2026) đang ghi mốc nội bộ 14/12 cho nhóm F, gồm F-5.** Theo Q11 mốc của F-5 là chậm nhất 21/12: **phải sửa ở bản Phạm vi trước khi nộp** (phiên kiểm độc lập nhận sửa; mục 4.6).

## 0. Quy ước đọc

- Use case duy nhất: **Xem thống kê & báo cáo vận hành** (2.4.56 ở file gốc, 2.4.53 ở `Drive_Hien_Tai`; **tìm theo TÊN**, dự án không dùng Use Case ID). Nội dung bảng use case ở hai file **trùng từng chữ** (so bằng `diff` ngày 26/11/2026). Nguyên văn ở **Phụ lục A**, use case và tài liệu liên quan ở **Phụ lục B** (sao chép bằng script).
- **Chữ trong ngoặc kép cong “…” là trích nguyên văn từ 2.4.** Chữ giao diện đề xuất đặt trong ngoặc kép thẳng.
- `b4` = bước (4); `A1/4b` = luồng thay thế A1, mục 4b; "MT" = Mô tả; "TĐK" = tiền điều kiện; "HĐK" = hậu điều kiện.
- Tiền tố mã test (quét `git grep` trên `origin/main` ngày 26/11/2026: chưa ai dùng): **DQP** quyền và phạm vi; **DBL** bộ lọc; **DVM** vắng mặt; **DKG** khung giờ; **DHN** hôm nay và tổng trong khoảng; **DCD** chờ duyệt; **DCH** cọc và hoàn; **DXH** xu hướng; **DRG** rỗng, nhất quán, riêng tư; **DWB** web Quản trị viên; **DBD** biểu đồ; **DLT** API Lễ tân; **DLW** web Lễ tân; **DKT** kiểm tay. Không dùng `DSB` (booking đã dùng).
- Nguồn đúng khi lệch nhau: **schema DB (`docs/database/`) để code**; chỗ 2.4, 1.2.1, 1.3, Figma và mã lệch nhau ở mục 3.3. Figma chỉ là bản phác thảo: **không đề xuất đồng bộ lại**.
- Thẻ: `[ĐỒNG BỘ TL]` = hành vi khác chữ tài liệu gốc, trong PR cập nhật PLAN, TRACKING và nhắc việc sửa Word ở 4.6; `[CHỜ X1]` = chờ số đo; `[CHỜ Đại]` = cần Đại làm hay cho phép khi chạy; `[ĐỤNG x]` = sửa file thuộc module hay vùng x (`[ĐỤNG admin]`, `[ĐỤNG router]`, `[ĐỤNG database]` là `app.module.ts`, `[ĐỤNG docker]` là `commitlint.config.cjs`, `[ĐỤNG auth]`, `[ĐỤNG patient]` là test chuyển hướng); `[SOẠN TRƯỚC]` = viết được ngay nhưng **chưa merge** khi phụ thuộc chưa có; `[CẮT ĐƯỢC]` = ngoài cam kết, chỉ làm nếu còn giờ.
- Mỗi task = **một PR** nhỏ, **chỉ backend HOẶC chỉ frontend** (X là đo, kiểm, tài liệu). Mức kiểm: **ĐB** = đơn vị, tích hợp MySQL thật, e2e và **đột biến mục tiêu** (quyền, phạm vi, công thức, tiền); **THƯỜNG** = đơn vị, tích hợp, e2e; **GỌN** = web (đột biến bốn loại của 5.14; không chạy tay jscpd và gitleaks, CI đo).
- `[đề xuất]` = giá trị AI tự đề xuất, chưa chốt; `[cần điền]` = thiếu thông tin. **Mục 4.4 liệt kê lại cả hai loại.**
- **Mã task trùng** với mã của module khác (B1, F1, X1…): khi nhắc ngoài file này viết **"dashboard B1"**.

## 1. Phạm vi

**Làm:**

| Phần | Tác nhân | Việc chính | Đường vào | Mức cam kết |
|---|---|---|---|---|
| **Tổng quan của Quản trị viên** (use case 2.4) | Quản trị viên Toàn hệ thống, Chi nhánh | Bộ lọc khoảng ngày (và chi nhánh nếu Toàn hệ thống); tỉ lệ vắng mặt; tỉ lệ sử dụng khung giờ; cọc, đã hoàn, khoản hoàn đang lỗi; lịch khám và ca hoàn thành hôm nay và trong khoảng; biểu đồ xu hướng đăng ký khám; yêu cầu đang chờ duyệt; trạng thái rỗng (A1) | `/admin` (mục "Tổng quan" đã trỏ vào đây) | **Cam kết** (F-5) |
| **Tổng quan rút gọn của Lễ tân** (Q9, Q12, Q13) | Lễ tân | Hôm nay, chi nhánh của mình: lịch khám, chờ tiếp đón, đã tiếp đón, hoàn thành, vắng mặt; số yêu cầu đổi lịch đang chờ và liên kết | `/le-tan` thành trang mở đầu | **`[CẮT ĐƯỢC]`** |

**Không làm (ghi rõ):**
- Chỉ số **tỉ lệ chấp nhận lời mời danh sách chờ** (F-4).
- **Bảng mới, bảng tổng hợp sẵn, bộ nhớ đệm, tác vụ nền** tính số liệu; **chỉ mục mới** khi chưa đo (Q10).
- **Thư viện biểu đồ** (Q8).
- So sánh kỳ trước, xuất tệp (CSV, PDF), nút chọn nhanh kỳ, lọc theo dịch vụ, chuyên khoa hay bác sĩ, doanh thu, tiền mặt tại quầy, hàng đợi "nạp ví chưa cộng", số bệnh nhân bị khoá đặt lịch: **làm sau** (6.5), không tạo issue.
- Dashboard cho **Bác sĩ** và Bệnh nhân.
- Ghi bất kỳ bảng nào; thông báo, email, nhật ký hành động: **không đụng** (use case chỉ đọc).
- Sửa trang Duyệt yêu cầu, trang rút tiền, trang lịch hẹn (chỉ **liên kết**; ngoại lệ duy nhất là tham số mở tab Chi nhánh ở T10).
- Sửa `docs/features/{reschedule,chat,chatbot,notification}/*`, `docs/database/*`, `AI_USAGE_LOG.md`, `docs/TECH_DEBT.md` ở PR kế hoạch này.

### 1.1 Bảng use case → luồng, điều kiện, ngoại lệ → ĐÃ CÓ hay CÒN THIẾU → thành phần mã sẽ chạm

Cột "Nguyên văn" chép từ 2.4 (Phụ lục A). "Hiện trạng" là kết quả kiểm mã ở `1cc0099`. `api/` = `apps/api/src/dashboard/`; `web/` = `apps/web/src/features/dashboard/`.

| Mục | Nguyên văn | Hiện trạng | Thành phần mã sẽ chạm | Task |
|---|---|---|---|---|
| MT | “Cho phép Quản trị viên xem dashboard thống kê vận hành: tỷ lệ no-show, tỷ lệ sử dụng khung giờ, tỷ lệ chấp nhận lời mời waitlist, số liệu cọc/hoàn tiền, số lịch khám và ca hoàn thành trong ngày, biểu đồ xu hướng đăng ký khám, và danh sách yêu cầu đang chờ duyệt. Quản trị viên Toàn hệ thống xem toàn bộ; phạm vi Chi nhánh chỉ xem chi nhánh được gán.” | **CÒN THIẾU** toàn bộ API và trang. **ĐÃ CÓ** dữ liệu nguồn (bảng ở 3.1) và phạm vi Quản trị viên | `api/`, `web/` | B1, B2, F1, F2 |
| Tác nhân, TĐK | “Quản trị viên.” “Đã đăng nhập vai trò Quản trị viên.” | **ĐÃ CÓ** `@Roles`, `@RequireAdminScope`, `AdminScopeGuard`, khung Quản trị viên | controller; route web bọc `AdminScopeGuard` | B1, F1 |
| HĐK | “Thành công: Quản trị viên xem được dashboard/báo cáo phù hợp phạm vi quyền hạn và bộ lọc thời gian; không có thay đổi dữ liệu.” “Thất bại: Không áp dụng (use case chỉ đọc).” | **ĐÃ CÓ** `runReadOnly` (một ảnh chụp, MySQL từ chối ghi) | service trong `runReadOnly`; test kiến trúc cấm ghi | B1 |
| b1 | “(1) Quản trị viên chọn chức năng "Xem thống kê & báo cáo vận hành".” | **ĐÃ CÓ** mục "Tổng quan" trỏ `/admin`; trang là `AdminOverviewPage` trả `null`. **CÒN THIẾU** nội dung | `web/admin/overview-page.tsx`; `features/admin/admin-routes.tsx` `[ĐỤNG admin]`, `router/role-routes.tsx` `[ĐỤNG router]` | F1 |
| b2, b3 | “(2) Hệ thống hiển thị bộ lọc khoảng thời gian (và chi nhánh nếu Toàn hệ thống).” “(3) Quản trị viên chọn bộ lọc.” | **CÒN THIẾU**; danh sách chi nhánh **ĐÃ CÓ** (`GET /admin/branches`) | `api/filter/`, `web/admin/filter-bar.tsx` | B1, F1 |
| b4 | “tỷ lệ no-show” | **CÒN THIẾU** | `api/queries/appointment-metrics.query.ts` | B1, F1 |
| b4 | “tỷ lệ sử dụng khung giờ” | **CÒN THIẾU**; luật nghỉ phép phủ ca **ĐÃ CÓ** (`scheduling/leave/leave-overlap.rules.ts`) | `api/queries/slot-usage.query.ts` | B1, F1 |
| b4 | “tỷ lệ chấp nhận lời mời waitlist” | **BỎ** (F-4); bảng `muc_cho_danh_sach_cho` có DDL, không có mã | — | — |
| b4 | “số liệu cọc/hoàn tiền” | **ĐÃ CÓ** sổ `giao_dich_thanh_toan`, `lich_su_hoan_tien`; **CÒN THIẾU** tổng hợp | `api/queries/money.query.ts` | B2, F1 |
| b4 | “số lịch khám và ca hoàn thành” (MT: “trong ngày”) | **CÒN THIẾU** | `api/queries/appointment-metrics.query.ts` | B1, F1 |
| b4 | “biểu đồ xu hướng đăng ký khám” | **CÒN THIẾU**; `apps/web` **chưa có** thư viện biểu đồ | `api/queries/trend.query.ts`, `web/chart/` | B2, F2 |
| b4 | “danh sách yêu cầu đang chờ duyệt” | **ĐÃ CÓ** bốn trang duyệt riêng; **CÒN THIẾU** số tổng hợp một chỗ | `api/queries/pending.query.ts`, `web/admin/pending-list.tsx` | B2, F1 |
| A1/4a, 4b | “4a. Hệ thống không có giao dịch/lịch hẹn nào trong khoảng thời gian đã chọn.” “4b. Hệ thống hiển thị dashboard với giá trị 0/trống kèm thông báo tương ứng.” | **CÒN THIẾU**; **ĐÃ CÓ** `EmptyState`, `LoadingState`, `ErrorState` | cờ `coDuLieu`; thông báo trên trang | B2, F1 |

**Use case chạm vào (không gộp, chỉ đọc kết quả của chúng):**

| UC | Chỗ chạm | Hiện trạng và xử lý |
|---|---|---|
| Phê duyệt yêu cầu nghỉ phép | nguồn "chờ duyệt" và nghỉ đã duyệt | **ĐÃ CÓ** trang và API, cả hai phạm vi, theo chi nhánh **hiện tại** của bác sĩ; dashboard đếm cùng định nghĩa |
| Xử lý yêu cầu đổi lịch ngoài chính sách | nguồn "chờ duyệt"; Lễ tân và Quản trị viên | **ĐÃ CÓ** (scope đổi lịch), theo `lich_hen.chi_nhanh_id` |
| Xử lý rút tiền, hoàn tiền đặc biệt & nạp ví chưa cộng | nguồn "chờ duyệt" (rút tiền) và hoàn đặc biệt | **ĐÃ CÓ**, **chỉ Toàn hệ thống**; "nạp ví chưa cộng" không tính là yêu cầu chờ duyệt (MH3) |
| Quản lý chi nhánh / cơ sở | nguồn "chờ duyệt" (thay đổi chi nhánh) | **ĐÃ CÓ**; khối yêu cầu ở tab "Chi nhánh" của trang Thông tin phòng khám; cả hai phạm vi xem, chỉ Toàn hệ thống duyệt |
| Tự động đánh dấu vắng mặt; Cập nhật trạng thái lịch hẹn; Cộng dồn no-show & khóa đặt lịch | nguồn `VangMat` | **ĐÃ CÓ**; dashboard đọc trạng thái **hiện tại** (override làm đổi số của ngày cũ) |
| Cập nhật cấu hình hệ thống | ngưỡng no-show | Dashboard **không đọc** ngưỡng (tỉ lệ vắng mặt khác với khoá đặt lịch) |
| Tính khung giờ khám còn trống | khung giờ loại nghỉ phép đã duyệt, ngày chi nhánh nghỉ | Dashboard loại nghỉ **đã duyệt**; không loại ngày chi nhánh nghỉ (MH4) |
| Hoàn tiền tự động | nguồn số hoàn và khoản đang lỗi | **ĐÃ CÓ**; mỗi lần thử là một dòng |
| Tự hủy lịch quá hạn thanh toán | lịch hết hạn vẫn nằm trong xu hướng đăng ký (Q5) | **ĐÃ CÓ** |

### 1.2 Nơi đặt và ranh giới với module khác

- `apps/api/src/dashboard/` (module Nest `DashboardModule`, thêm **một** dòng ở `app.module.ts` `[ĐỤNG database]`) và `apps/web/src/features/dashboard/`.
- API **chỉ đọc**, **tự viết câu truy vấn của mình**; không import service của module khác (T4). Dùng lại: `RbacModule` (`AdminScopeGuard`, `BranchAccessPolicy`, `ReceptionScopeService`), `runReadOnly`, `common/time`, `scheduling/calendar-date`, `pricing/money`.
- Web chỉ import `shared/` và `features/auth`, `features/admin` **qua `index.ts`**; không import `features/booking`, `doctor`, `wallet`; `router/` ghép route.

## 2. Hiện trạng repo (đã kiểm ở `1cc0099`, đối chiếu lại `c61d4f6`, 26/11/2026)

| Chỗ | Tình trạng | Nguồn kiểm |
|---|---|---|
| API thống kê | **Không có** route hay module `dashboard`; không câu tổng hợp nào cho Quản trị viên | `apps/api/src` (`grep` `@Controller`, `GROUP BY`) |
| Trang Tổng quan Quản trị viên | `AdminOverviewPage` trả `null` ở route `index` của `/admin` (chú thích: “Dashboard KPI/biểu đồ thuộc phạm vi riêng”); thanh bên có liên kết "Tổng quan" | `features/admin/admin-overview-page.tsx`, `admin-routes.tsx`, `components/admin-sidebar.tsx` |
| Test khoá trang rỗng | `AF1-01 … không dựng dashboard mẫu` (`admin-layout.test.tsx`) và nhiều ca mở `/admin` trong test admin | phải chạy lại cả bộ web khi gắn trang |
| Trang Tổng quan Lễ tân | mục menu "Tổng quan" **vô hiệu**; `/le-tan` chuyển hướng tới Tra cứu bệnh nhân (Q21e của patient, "chưa có Tổng quan") | `router/role-nav.ts`, `router/role-routes.tsx` |
| Phạm vi Quản trị viên | `AdminScopeService.resolve` đọc DB mỗi request; `BranchAccessPolicy.branchFilter` (Chi nhánh bị ép chi nhánh mình), `assertCanSee` (404 `KHONG_TIM_THAY`) | `apps/api/src/rbac/` |
| Quy ước tham số chi nhánh ở danh sách | Chi nhánh gửi `chiNhanhId` thì **bị bỏ qua** (lịch hẹn, nghỉ phép, đổi lịch) | `operations-appointments.dto.ts`, `admin-leave.dto.ts` |
| Phạm vi Lễ tân | `ReceptionScopeService.resolve`; `resolveReceptionBranch` kiểm hình dạng | `rbac/`, `appointments/reception-branch.ts` |
| Giao dịch chỉ đọc | `runReadOnly` (`SET TRANSACTION READ ONLY`, REPEATABLE READ) | `common/transaction/read-only-tx.ts` |
| Trạng thái lịch và khung | lịch `ChoThanhToan` ⇒ khung `DangGiuCho`; `DaXacNhan`, `DaTiepDon`, `HoanThanh`, `VangMat` ⇒ khung `DaDat`; huỷ và đổi trả khung về `ConTrong`; booking **không ghi** `HetHan` | `appointments/testing/invariants.ts`, `slots/bookability.rules.ts` |
| Đổi lịch | tạo **dòng `lich_hen` mới** (`lich_hen_truoc_id`, `thoi_diem_tao` = lúc đổi), cùng bác sĩ và dịch vụ | `reschedule/appointment-reschedule.service.ts` |
| Tiền | cọc ví: `ThanhToanLichHen`, `Vi`, `ThanhCong`, `lich_hen_id` = **lịch gốc**; lịch cọc 0đ có dòng `so_tien = 0`; tiền mặt tại quầy là phần còn phải thu; hoàn: mỗi lần thử một dòng, `so_lan_thu` đếm chung | `payment/deposit/`, `payment/ports/`, `wallet/refund/` |
| Duyệt yêu cầu | nghỉ phép, đổi lịch: `RequireAdminScope('Any')`; rút tiền: `ToanHeThong`; thay đổi chi nhánh: xem `Any`, duyệt `ToanHeThong` | các controller tương ứng |
| Chỉ mục | `lich_hen` **không** có chỉ mục dẫn đầu bằng `thoi_gian` hay `thoi_diem_tao`; `lich_su_hoan_tien` chỉ có UNIQUE `(giao_dich_thanh_toan_id, so_lan_thu)`; chi tiết ở 5.10 | `docs/database/clinix_mysql.sql`, `apps/api/src/database/migrations/` |
| Web: biểu đồ, thẻ số | `package.json` **không** có thư viện biểu đồ; `shared/ui` **không** có thành phần biểu đồ hay thẻ số (có `leave-stats.tsx` riêng của doctor) | `apps/web/package.json`, `shared/ui/` |
| Web: dùng lại được | `request` (client duy nhất, quá giờ 15 giây), `useRemote`, `formatVnd` (`shared/money`), `LoadingState`, `ErrorState`, `EmptyState`, `OfflineBanner`, `useAdminScope` (qua `features/admin`) | `apps/web/src/shared/`, `features/admin/index.ts` |
| Nợ kỹ thuật liên quan | dòng 177 (hoàn tiền không có chỉ mục theo `(trang_thai, thoi_diem)`), dòng 233 (Lễ tân thống kê ở web); **không** dòng nào về dashboard | `docs/TECH_DEBT.md` |
| Figma (mã Make) | `AdminDashboard` trong `pages/admin/AdminPages.tsx`: thẻ số, nút kỳ "7 ngày, 30 ngày", khối "Việc cần xử lý", biểu đồ Recharts; có doanh thu, so sánh kỳ trước, lọc dịch vụ, danh sách chờ (**không làm**) | `THIET_KE_UI/Figma_Make_Sync/source_snapshot` |
| Module chat (mới ở `c61d4f6`) | `ChatModule` đã đăng ký ở `app.module.ts`; test kiến trúc của chat chỉ quét `apps/api/src/chat/` nên không ảnh hưởng `dashboard` | `git show c61d4f6`, `chat/architecture.spec.ts` |

## 3. Phân tích ảnh hưởng

### 3.1 Bảng và cột scope này chạm tới (**chỉ đọc**; không bảng mới, không migration)

| Bảng | Cột | Chỉ số |
|---|---|---|
| `lich_hen` | `thoi_gian`, `thoi_diem_tao`, `trang_thai`, `chi_nhanh_id`, `lich_hen_truoc_id`, `lich_hen_id` | vắng mặt, hôm nay, tổng khoảng, xu hướng; chi nhánh của giao dịch và yêu cầu đổi lịch |
| `lich_lam_viec` | `bac_si_id`, `chi_nhanh_id`, `ngay`, `ca` | khung giờ |
| `khung_gio` | `lich_lam_viec_id`, `trang_thai` | khung giờ |
| `yeu_cau_nghi_phep` | `bac_si_id`, `hinh_thuc_nghi`, `ngay_bat_dau`, `ngay_ket_thuc`, `ca`, `trang_thai` | khung giờ (đã duyệt), chờ duyệt |
| `bac_si` | `tai_khoan_id`, `chi_nhanh_id` | chi nhánh của yêu cầu nghỉ phép |
| `giao_dich_thanh_toan` | `lich_hen_id`, `loai`, `phuong_thuc`, `so_tien`, `trang_thai`, `thoi_diem_tao` | cọc; nối chi nhánh cho hoàn |
| `lich_su_hoan_tien` | `giao_dich_thanh_toan_id`, `so_tien`, `trang_thai`, `so_lan_thu`, `thoi_diem` | đã hoàn, khoản đang lỗi |
| `yeu_cau_doi_lich_ngoai_chinh_sach` | `lich_hen_id`, `trang_thai` | chờ duyệt |
| `yeu_cau_rut_tien` | `trang_thai` | chờ duyệt |
| `yeu_cau_thay_doi_chi_nhanh` | `chi_nhanh_id`, `trang_thai` | chờ duyệt |
| `chi_nhanh` | `chi_nhanh_id`, `ten` | kiểm chi nhánh tồn tại; tên chi nhánh của Lễ tân |
| `quan_tri_vien`, `le_tan`, `tai_khoan` | qua `rbac/` | phạm vi |

### 3.2 API và hành vi đã có bị chạm tới

| Cái đã có | Chạm thế nào | Rủi ro và cách giữ |
|---|---|---|
| Route `index` của `/admin` | thay `AdminOverviewPage` bằng trang của `dashboard` `[ĐỤNG admin]` `[ĐỤNG router]` | test admin mở `/admin` nay gọi API mới: chạy **cả bộ web**; cập nhật `AF1-01` |
| Route `index` của `/le-tan` và menu Lễ tân (F3) | bỏ chuyển hướng, bật "Tổng quan" (`end`) `[ĐỤNG router]` `[ĐỤNG auth]` `[ĐỤNG patient]` | test đăng nhập đang mong chuyển tới Tra cứu bệnh nhân phải sửa trong cùng PR |
| Trang Thông tin phòng khám | đọc `?tab=chi-nhanh` để mở thẳng tab Chi nhánh (T10) `[ĐỤNG admin]` | thêm đúng giá trị khởi tạo của tab; test admin có sẵn không đổi; **phương án lùi** (T10): đang có PR admin mở chạm trang này thì không sửa, liên kết không kèm tab |
| `app.module.ts` | thêm `DashboardModule` `[ĐỤNG database]` | một dòng import, một phần tử; chat đã thêm `ChatModule` (`c61d4f6`), chatbot cũng sẽ sửa file này |
| Luật kiến trúc `AR-05` (booking) | quét **mọi** file `src/`: cấm bọc `thoi_gian` bằng `DATE(` | dashboard lọc bằng khoảng nửa mở |
| Các API duyệt yêu cầu | **không đổi**; test dashboard đối chiếu số với danh sách của chúng (DCD-03, DLT-04) | định nghĩa đổi ở module kia thì test dashboard đỏ |

### 3.3 Đối chiếu với thiết kế đã chốt: KHỚP, LỆCH hay MÂU THUẪN

| # | Đặc tả hay tài liệu | Kế hoạch này | Loại | Nguồn quyết định | Việc đồng bộ |
|---|---|---|---|---|---|
| K1 | “Quản trị viên Toàn hệ thống xem toàn bộ; phạm vi Chi nhánh chỉ xem chi nhánh được gán.” | máy chủ cưỡng bức phạm vi | KHỚP | admin, rbac | — |
| K2 | “không có thay đổi dữ liệu” | `runReadOnly`, test cấm ghi | KHỚP | — | — |
| L1 | “tỷ lệ chấp nhận lời mời waitlist” (MT, b4; 1.2.1 hàng "Xem thống kê & báo cáo vận hành"; 1.3 đoạn Quản trị; Phân loại M24) | **bỏ** | LỆCH | Phạm vi nhóm F-4, F-5 | `[ĐỒNG BỘ TL]` 4.6 |
| L2 | Tác nhân kích hoạt: “Quản trị viên.” | thêm bản rút gọn cho Lễ tân `[CẮT ĐƯỢC]` | LỆCH (chỉ khi làm) | Q9, Q14 | `[ĐỒNG BỘ TL]` chỉ khi làm F3 |
| L3 | MT “trong ngày”, b4 không ghi "trong ngày" | thẻ "Hôm nay" **và** tổng trong khoảng | LÀM RÕ | Q4 | `[ĐỒNG BỘ TL]` |
| L4 | “số liệu cọc/hoàn tiền” không định nghĩa | cọc ví thành công; đã hoàn vào ví; khoản đang lỗi; theo ngày giao dịch; không tiền mặt | LÀM RÕ | Q3 | `[ĐỒNG BỘ TL]` |
| L5 | “danh sách yêu cầu đang chờ duyệt” | số lượng và liên kết theo bốn loại, không liệt kê từng yêu cầu; Chi nhánh không thấy rút tiền | LÀM RÕ | Q6 | `[ĐỒNG BỘ TL]` |
| L6 | b2 “bộ lọc khoảng thời gian” không giới hạn | mặc định 30 ngày, tối đa 366 | LÀM RÕ | Q7 | `[ĐỒNG BỘ TL]` |
| L7 | A1 “không có giao dịch/lịch hẹn nào” | cờ `coDuLieu` (5.6); danh sách chờ duyệt vẫn hiện | LÀM RÕ | MH2 | — |
| L8 | 1.2.1 xếp loại "Tra cứu, Tính toán, Kết xuất" | "Kết xuất" hiểu là hiển thị; không xuất tệp | LÀM RÕ `[đề xuất]` | 1.2.1, 2.4 không có bước xuất tệp | Đại xác nhận khi review |
| L9 | Phạm vi mục 8: mốc nội bộ nhóm F 14/12 | F-5 xong chậm nhất 21/12 | LỆCH | Q11 | Đại sửa văn bản Phạm vi (4.6) |
| L10 | Figma: doanh thu, so sánh kỳ trước, lọc dịch vụ, danh sách chờ, biểu đồ Recharts | không làm | LỆCH (Figma là phác thảo) | Q8, 6.5 | không đồng bộ Figma |

### 3.4 Chỗ mơ hồ còn lại (đã chọn mặc định `[đề xuất]`; Đại đổi được lúc review, không chặn task)

| Mã | Chỗ mơ hồ | Mặc định |
|---|---|---|
| MH1 | Toàn hệ thống lọc một chi nhánh: số rút tiền (không gắn chi nhánh) | vẫn hiện số **toàn hệ thống**, kèm chữ "toàn hệ thống" |
| MH2 | "Không có dữ liệu" (A1) | `coDuLieu = false` khi trong khoảng không có lịch theo ngày khám, không lịch đặt mới, không khoản cọc, không khoản hoàn; khung giờ phát ra không tính |
| MH3 | Hàng đợi "nạp ví chưa cộng" | không nằm trong "chờ duyệt" (không phải yêu cầu của người dùng) |
| MH4 | Khung giờ cũ rơi vào ngày chi nhánh nghỉ hay ngoài giờ mới | vẫn tính là đã phát ra (ghi nợ nháp) |
| MH5 | Nghỉ phép **chờ duyệt** đang chặn đặt lịch | không loại khỏi mẫu số (Q2 chỉ loại đã duyệt) |
| MH6 | Chi nhánh của khoản cọc, khoản hoàn | chi nhánh của **lịch gốc** (giao dịch trỏ lịch gốc; đổi lịch giữ bác sĩ nên cùng chi nhánh) |
| MH7 | Chi nhánh của yêu cầu nghỉ phép | chi nhánh **hiện tại** của bác sĩ, khớp trang duyệt |
| MH8 | Lễ tân: "Lịch khám hôm nay" không gồm lịch chờ thanh toán | khác danh sách "Quản lý lịch hẹn" (có hiện chờ thanh toán); ghi chú nhỏ dưới thẻ |
| MH9 | Chữ trên giao diện | bảng 5.8 |

### 3.5 Rủi ro

- **R1 Lịch:** chatbot ưu tiên; chatbot trượt vào Iteration 10 thì dashboard trượt theo (6.4). Cắt trước: F3, B3; không cắt phần Quản trị viên (Phạm vi mục 9).
- **R2 Hiệu năng:** bốn câu có thể quét toàn bảng (5.10); X1 đo, không đạt thì hỏi Đại về chỉ mục (+ khoảng 2 giờ, chưa nằm trong 22 giờ).
- **R3 Test có sẵn đổ:** gắn trang vào `/admin` làm nhiều test admin gọi API giả chưa khai báo; chạy cả bộ web ở F1.
- **R4 Số liệu "lạ" khi demo:** dữ liệu mẫu ít, lịch tạo bằng seed có `thoi_diem_tao` dồn một ngày làm biểu đồ một cột. Cần dữ liệu demo trải ngày `[cần điền]` (6.3).
- **R5 Hiểu nhầm chỉ số:** mỗi thẻ có dòng giải thích mẫu số ("x trên y lịch đã có kết quả").
- **R6 Số lớn của tiền:** tổng đi qua chuỗi decimal, không qua `number` ở máy chủ (DCH-05).
- **R7 Lộ số cá thể:** chi nhánh ít dữ liệu thì tổng có thể là một giao dịch; chấp nhận vì Quản trị viên đã xem được từng giao dịch ở trang khác.
- **R8 Xung đột file:** `app.module.ts`, `commitlint.config.cjs`, `AGENTS.md` cùng bị chatbot, chat sửa (6.3).

## 4. Câu hỏi và quyết định

### 4.1 Đã chốt ở module khác (kế thừa, **không bàn lại**)

- **admin, rbac:** phạm vi đọc từ DB mỗi request; ngoài phạm vi là 404 `KHONG_TIM_THAY`; thiếu quyền là 403 `KHONG_DU_QUYEN`; `@Roles` và `@RequireAdminScope` ghi trên từng route.
- **auth:** mã lỗi ổn định; không ghi bí mật vào log.
- **booking, doctor-exam:** thời gian theo giờ Việt Nam; không dùng giờ của DB; lọc bằng khoảng nửa mở.
- **payment:** giao dịch cọc và hoàn trỏ lịch gốc; tiền là chuỗi decimal.
- **Phạm vi (26/11/2026, bản dự thảo):** F-5 là một màn hình chỉ đọc cho Quản trị viên; F-4 (danh sách chờ) ngoài phạm vi.

### 4.2 Câu hỏi và quyết định (**Đại trả lời trực tiếp ngày 26/11/2026** qua bốn hộp câu hỏi)

| Q | Câu hỏi | Quyết định | Hệ quả, truy vết |
|---|---|---|---|
| **Q1** | Tỉ lệ vắng mặt tính thế nào? | Theo đề xuất: **Vắng mặt chia (Vắng mặt + Đã tiếp đón + Hoàn thành)**, lịch theo ngày khám trong khoảng | 5.6 (1) |
| **Q2** | Tỉ lệ sử dụng khung giờ? | Theo đề xuất: **đã đặt chia mọi khung phát ra trong khoảng (đã qua và sắp tới), trừ khung trùng nghỉ phép đã duyệt** | 5.6 (2); khung giữ chỗ chưa tính là đã đặt |
| **Q3** | Số liệu cọc và hoàn tiền? | Theo đề xuất: **cọc ví thành công và đã hoàn vào ví theo ngày giao dịch, thêm số khoản hoàn đang lỗi** | 5.6 (4), (5) |
| **Q4** | "Trong ngày" hiểu thế nào? | Theo đề xuất: **thẻ Hôm nay và tổng trong khoảng** | 5.6 (3) |
| **Q5** | Biểu đồ xu hướng đếm gì? | Theo đề xuất: **lịch đặt mới theo ngày đặt, bỏ dòng do đổi lịch, gồm lịch đã huỷ hay hết hạn; cột theo ngày khi khoảng tối đa 62 ngày, theo tuần khi dài hơn** | 5.6 (6) |
| **Q6** | Chi nhánh thấy gì ở "chờ duyệt"? | Theo đề xuất: **ba loại xem được, ẩn rút tiền**; đếm mọi yêu cầu đang chờ, không theo bộ lọc ngày | 5.6 (7) |
| **Q7** | Bộ lọc thời gian? | Theo đề xuất: **mặc định 30 ngày tính cả hôm nay, gồm hai đầu, tối đa 366 ngày, cho ngày tương lai** | 5.5 |
| **Q8** | Vẽ biểu đồ bằng gì? | Theo đề xuất: **SVG hay CSS tự vẽ, không thêm thư viện**, kèm bảng số | 5.11 |
| **Q9** | Lễ tân có dashboard không? | **KHÁC đề xuất: có bản rút gọn** (đề xuất là không làm) | L2; B3, F3 |
| **Q10** | Chỉ mục? | Theo đề xuất: **đo trước, không đạt thì nêu đúng cột và hỏi** | 5.10, 5.14 |
| **Q11** | Lịch làm? | Theo đề xuất: **xong ở Iteration 10**, chậm nhất 21/12; sửa mốc F-5 ở văn bản Phạm vi | L9; 6.4 |
| **Q12** | Lễ tân hiện số nào? | **KHÁC đề xuất: tách theo trạng thái** (lịch khám, chờ tiếp đón, đã tiếp đón, hoàn thành, vắng mặt) cùng yêu cầu đổi lịch đang chờ (đề xuất là ba số) | 5.12 |
| **Q13** | Trang Lễ tân đặt ở đâu? | Theo đề xuất: **`/le-tan` thành "Tổng quan" và là trang mở đầu** | 5.12 |
| **Q14** | Cỡ và hạn khi có Lễ tân? | Theo đề xuất: **Lễ tân là phần cắt được**: cam kết F-5 chỉ phần Quản trị viên; B3, F3 là task cuối, có issue | 6.4, 6.5 |

### 4.3 Điểm kỹ thuật: **đã duyệt kỹ thuật (phiên kiểm độc lập, theo ủy quyền của Đại, 26/11/2026)**; không phải quyết định sản phẩm hay schema

| T | Đề xuất đã duyệt | Lý do, điều kiện |
|---|---|---|
| T1 | Thư mục `dashboard` ở API và web; thêm scope commit `dashboard` vào `commitlint.config.cjs` và `AGENTS.md` ở B1 (scope `report` đã có nhưng không khớp tên module) | một tên cho thư mục, nhãn, milestone |
| T2 | Một route cho mỗi vai: `GET /admin/dashboard`, `GET /reception/dashboard`; mọi số của một lần gọi trong **một** `runReadOnly` | một ảnh chụp, một lượt tải |
| T3 | `chiNhanhId`: Chi nhánh gửi chi nhánh **khác** hoặc không tồn tại ⇒ **404** cùng thân; Toàn hệ thống gửi chi nhánh không tồn tại ⇒ 404; sai dạng ⇒ 400. **Khác** các danh sách có sẵn (bỏ qua tham số của Chi nhánh) | theo chỉ dẫn của task: ngoài phạm vi là 404; không trả số của chi nhánh mình khi người gọi hỏi chi nhánh khác |
| T4 | `dashboard` tự viết SQL đọc, không import service module khác; chỉ dùng lại `rbac`, `common`, `scheduling/calendar-date`, `pricing/money` | tránh kéo phụ thuộc ghi; test đối chiếu giữ định nghĩa khớp |
| T5 | Máy chủ trả tử số, mẫu số và `phanTram` (một chữ số thập phân, làm tròn nửa lên bằng phép tính số nguyên; mẫu 0 ⇒ `null`); tiền là chuỗi decimal; số đếm là số nguyên | test tính tay được; web không tự tính |
| T6 | `tuNgay`, `denNgay`: gửi cả hai hoặc không gửi | không phải đoán đầu còn lại |
| T7 | "Khoản hoàn đang lỗi" = khoản thanh toán có dòng hoàn **mới nhất, mọi loại** (`so_lan_thu` lớn nhất) là `ThatBai` | thử lại hay hoàn đặc biệt thành công sau đó thì hết lỗi. Đối chiếu mã ở `c61d4f6`: `wallet/refund/refund.rules.ts` dòng 33 (`so_lan_thu` đếm chung mọi dòng của khoản, tự động và đặc biệt); `wallet/refund/refund.queries.ts` dòng 125 đến 132 (`latestAttempt` lấy dòng mới nhất mọi loại, HDT-05). **Cảnh báo cho B2:** dòng 195 cùng file (`findRetryCandidates`, của job thử lại) lấy `MAX` riêng `loai = 'TuDong'`: **không** dùng định nghĩa đó cho "đang lỗi" (DCH-04) |
| T8 | Tuần bắt đầu thứ Hai; tuần đầu và cuối cắt theo khoảng; máy chủ trả đủ điểm kể cả 0 | web chỉ vẽ |
| T9 | `no-store` ở mọi phản hồi đi qua handler; không đệm, không tự làm mới; nút "Tải lại" | chỉ đọc, số theo yêu cầu |
| T10 | Liên kết: đổi lịch và rút tiền dùng hằng ở `shared/routes`; nghỉ phép viết đường dẫn trong `dashboard` kèm test khoá (nếp thanh bên); thay đổi chi nhánh thêm `?tab=chi-nhanh` ở trang Thông tin phòng khám `[ĐỤNG admin]`. **Phương án lùi:** lúc làm F1 mà có PR admin đang mở chạm trang đó thì không sửa, liên kết tới `/admin/thong-tin-phong-kham` không kèm tab | web không import chéo `features/`; tránh xung đột với việc đang làm ở module admin |
| T11 | Bộ lọc giữ ở tham số URL (`tuNgay`, `denNgay`, `chiNhanhId`) làm nguồn duy nhất | tải lại và quay lại không mất; tránh hai nguồn state |
| T12 | Test kiến trúc cho `dashboard/`: không câu ghi, không khoá, không giờ của DB; mọi route có `@Roles`, route Quản trị viên có `@RequireAdminScope('Any')`, có `@Header` `no-store` | chặn lỗi lặp |
| T13 | Tiêu chí đo X1 ở 5.14, **đặt trước, không đổi sau khi thấy số** | nếp đo thật |

### 4.4 Mọi chỗ còn `[cần điền]` và `[đề xuất]`

| Giá trị | Ở đâu | Loại |
|---|---|---|
| Dữ liệu demo trải nhiều ngày cho kiểm tay và demo (seed nào, DB nào) | R4, X2 | `[cần điền]` |
| Số issue Epic; nhãn `module:dashboard`, milestone `dashboard`; Iteration 9, 10 trong GitHub Project | 6.6 | `[cần điền]` (Đại tạo bằng script) |
| Số PR và commit ở nháp AI log | TRACKING 4.1 | `[cần điền]` |
| Sơ đồ tuần tự hay sơ đồ lớp cho dashboard nếu SRS/SDD cần | 4.6 | `[cần điền]` |
| MH1 đến MH9, L8 | 3.3, 3.4 | `[đề xuất]` |
| T1 đến T13 | 4.3 | `[đề xuất]`, đã duyệt kỹ thuật 26/11/2026 |
| Tên đường dẫn API, khoá JSON, mã lỗi, tên file | 5.1, 5.7, 5.8 | `[đề xuất]` |
| Câu chữ giao diện | 5.8 | `[đề xuất]` |
| Cỡ dữ liệu đo, ngưỡng M1 đến M5 | 5.14 | `[đề xuất]` (đặt trước; **không đổi sau khi thấy số**; T13 đã duyệt kỹ thuật) |
| Giờ ước, Iteration, mức kiểm | 6.2, 6.4 | `[đề xuất]` |
| Giả định 20 giờ mỗi tuần cho mọi việc, chatbot ưu tiên | 6.4 | Đại đã xác nhận qua Q11 |

### 4.5 Figma

Chỉ tham khảo **chữ và bố cục** của `AdminDashboard` trong mã Make: tiêu đề "Tổng quan", dãy thẻ số hai hàng, biểu đồ cạnh khối "Việc cần xử lý" (dòng "Nghỉ phép bác sĩ", "Đổi lịch hẹn", "Yêu cầu rút tiền"). Khác có chủ đích: ô ngày thay cho nút kỳ, không doanh thu, không so sánh, không danh sách chờ, biểu đồ tự vẽ. Phiên lập kế hoạch **không mở Figma Design**.

### 4.6 Việc của nhóm (ngoài repo; không sửa file Word hay Figma từ repo này)

- **Trước 16:46 ngày 27/11/2026:** văn bản Phạm vi mục 8 và 10: mốc của F-5 là **21/12** (Q11), tách khỏi mốc 14/12 của F-1 đến F-3. Dòng F-5 mục 3 **không cần** thêm Lễ tân (Q14). Phiên kiểm độc lập nhận tự sửa (26/11/2026); phiên lập kế hoạch này chưa kiểm file đó.
- **`[ĐỒNG BỘ TL]` sửa file Word ở repo `TLCN_CLINIX`:** use case "Xem thống kê & báo cáo vận hành" ở cả hai bản 2.4 (bỏ chỉ số danh sách chờ; "hôm nay và trong khoảng"; định nghĩa cọc, hoàn; bốn loại chờ duyệt và phạm vi; bộ lọc 30 và 366 ngày); 1.2.1 hàng cùng tên; 1.3 đoạn giám sát vận hành của Quản trị viên; bảng Phân loại M24. Chỉ khi làm F3: thêm tác nhân Lễ tân ở 2.4 và 2.1_2.2.
- Mục tiêu đề tài: không đổi vì dashboard (Phạm vi mục 3 đã nêu phần danh sách chờ).
- Đại tạo nhãn `module:dashboard`, milestone `dashboard`, Epic và sinh issue bằng script từ 6.6 sau khi PR tài liệu merge.

## 5. Thiết kế kỹ thuật

### 5.1 Cấu trúc thư mục (tạo thư mục khi có file đầu tiên; test cạnh mã; `[đề xuất]`)

```
apps/api/src/dashboard/
  dashboard.module.ts
  filter/        dashboard-filter.dto.ts · date-range.rules.ts (hàm thuần: mặc định, giới hạn, gom tuần)
  queries/       appointment-metrics.query.ts · slot-usage.query.ts · money.query.ts · trend.query.ts · pending.query.ts
  admin/         admin-dashboard.controller.ts · admin-dashboard.service.ts · admin-dashboard.dto.ts
  reception/     reception-dashboard.controller.ts · reception-dashboard.service.ts   (B3)
  testing/       dashboard-fixtures.ts (bộ D0 ở 7.0)
  architecture.spec.ts
apps/web/src/features/dashboard/
  index.ts (mảng route cho router/) · api/dashboard-api.ts · format.ts
  admin/         overview-page.tsx · filter-bar.tsx · metric-cards.tsx · pending-list.tsx
  chart/         trend-chart.tsx · trend-table.tsx                                   (F2)
  reception/     reception-overview-page.tsx                                          (F3)
  architecture.test.ts
```

Web **không thêm CSS Module** (dùng Tailwind; test hiện hành đếm số CSS Module).

### 5.2 Dữ liệu

Không bảng, không cột, không migration, không entity mới. Câu truy vấn viết bằng SQL thô có tham số (nếp `*.query.ts`), trả id `BIGINT` và tiền dưới dạng chuỗi.

### 5.3 Quyền và phạm vi

| Route | Khách | Bệnh nhân, Bác sĩ | Lễ tân | Quản trị viên Chi nhánh | Quản trị viên Toàn hệ thống |
|---|---|---|---|---|---|
| `GET /admin/dashboard` | 401 | 403 | 403 | 200, chỉ chi nhánh được gán | 200, tất cả hoặc một chi nhánh |
| `GET /reception/dashboard` | 401 | 403 | 200, chỉ chi nhánh của mình | 403 | 403 |

- Controller ghi `@Roles('QuanTriVien')` và `@RequireAdminScope('Any')` **trên từng route**.
- Phạm vi giải ở máy chủ, đọc DB mỗi request; service kiểm lại **hình dạng** phạm vi (nếp `admin-appointments.service.ts`): phạm vi hỏng ⇒ 403, không bao giờ thành "toàn hệ thống".
- Quy tắc `chiNhanhId` (T3):

| Phạm vi | Không gửi | Gửi chi nhánh của mình hoặc chi nhánh có thật | Gửi chi nhánh khác hay không tồn tại | Sai dạng |
|---|---|---|---|---|
| Chi nhánh | chi nhánh được gán | chi nhánh của mình ⇒ 200 | **404** `KHONG_TIM_THAY` | 400 |
| Toàn hệ thống | tất cả | chi nhánh có thật ⇒ 200 | **404** (không tồn tại) | 400 |

  Hai 404 (ngoài phạm vi và không tồn tại) ra **cùng một thân**, ném ở một chỗ sau khi giao dịch đóng.
- Lễ tân: `ReceptionScopeService` (khoá tài khoản hay đổi chi nhánh có hiệu lực ở request sau); route **không nhận tham số nào** (khoá lạ ⇒ 400).

### 5.4 Khoá, đồng thời và nhất quán

- Chỉ đọc. **Không khoá mới**, không `FOR SHARE`, không `FOR UPDATE`: dưới REPEATABLE READ các `SELECT` thường đọc theo ảnh chụp, không chặn và không bị chặn bởi đặt lịch, thanh toán, duyệt yêu cầu.
- Mọi chỉ số của một lần gọi nằm trong **một** `runReadOnly` nên **cùng một ảnh chụp** (ví dụ số hoàn thành hôm nay không lớn hơn số lịch hôm nay). Giữa hai lần gọi số có thể khác nhau: chấp nhận.
- "Hôm nay" lấy từ **một** giá trị `nowVN()` đầu yêu cầu, dùng cho mặc định bộ lọc và thẻ hôm nay.
- Giao dịch đọc giữ ảnh chụp trong thời gian chạy các câu (mục tiêu dưới 2 giây, 5.14); không gọi mạng hay làm việc nặng trong giao dịch.

### 5.5 Bộ lọc thời gian (Q7; T6)

- `tuNgay`, `denNgay`: ngày lịch `YYYY-MM-DD` theo giờ Việt Nam, **gồm hai đầu**. Cột `DATETIME` lọc nửa mở `[tuNgay 00:00:00, ngày kế của denNgay 00:00:00)`; cột `DATE` (`lich_lam_viec.ngay`) lọc `>= tuNgay AND <= denNgay`.
- Không gửi: `denNgay` = hôm nay, `tuNgay` = hôm nay trừ 29 ngày.
- Chỉ gửi một đầu, hoặc `denNgay` trước `tuNgay` ⇒ 400 `KHOANG_NGAY_KHONG_HOP_LE`. Quá **366** ngày (tính cả hai đầu) ⇒ 400 `KHOANG_NGAY_QUA_DAI`. Ngày không có thật ⇒ 400 `NGAY_KHONG_HOP_LE`.
- Ngày tương lai được phép (khung giờ sắp tới và lịch đã đặt trước).
- Cấm bọc cột bằng `DATE(...)` trong `WHERE`; không dùng `NOW()`.

### 5.6 Định nghĩa chỉ số (công thức và nguồn)

`[kn]` = điều kiện chi nhánh (bỏ khi xem tất cả). `:tu`, `:denKe` = hai mốc nửa mở ở 5.5. Câu SQL là phác hoạ để review; X1 được đổi **hình dạng câu** (không đổi kết quả) để dùng chỉ mục.

**(1) Tỉ lệ vắng mặt (Q1).** Lịch theo **ngày khám** `lich_hen.thoi_gian` trong khoảng.
`mẫu` = số lịch `trang_thai` trong (`VangMat`, `DaTiepDon`, `HoanThanh`); `tử` = số lịch `VangMat`. Không tính `ChoThanhToan`, `DaXacNhan`, `DaHuy`, `DaDoiLich`. `[kn]` theo `lich_hen.chi_nhanh_id`.

**(2) Tỉ lệ sử dụng khung giờ (Q2).** Khung giờ thuộc ca có `lich_lam_viec.ngay` trong khoảng (khung luôn nằm trong ngày của ca).
`mẫu` = mọi khung **không** thuộc ca bị yêu cầu nghỉ **`DaDuyet`** phủ; `tử` = số khung đó có `khung_gio.trang_thai = 'DaDat'` (gồm lịch vắng mặt; **không** gồm `DangGiuCho`). `[kn]` theo `lich_lam_viec.chi_nhanh_id`.

```sql
SELECT COUNT(*) AS phatRa, COALESCE(SUM(kg.trang_thai = 'DaDat'), 0) AS daDat
FROM lich_lam_viec llv
JOIN khung_gio kg ON kg.lich_lam_viec_id = llv.lich_lam_viec_id
WHERE llv.ngay >= :tuNgay AND llv.ngay <= :denNgay [AND llv.chi_nhanh_id = :cn]
  AND NOT EXISTS (SELECT 1 FROM yeu_cau_nghi_phep y
        WHERE y.bac_si_id = llv.bac_si_id AND y.trang_thai = 'DaDuyet'
          AND y.ngay_bat_dau <= llv.ngay AND y.ngay_ket_thuc >= llv.ngay
          AND (y.hinh_thuc_nghi = 'CaNgay' OR y.ca = llv.ca))
```

Điều kiện phủ ca khớp `leaveCoversShift` (cả ngày, hoặc đúng ca ở mọi ngày trong khoảng nghỉ).

**(3) Lịch khám và ca hoàn thành (Q4).** "Lịch khám" = lịch theo `thoi_gian` có `trang_thai` trong (`DaXacNhan`, `DaTiepDon`, `HoanThanh`, `VangMat`). "Ca hoàn thành" = `HoanThanh` trong tập đó. Hai bộ số: **Hôm nay** (`thoi_gian` trong ngày hôm nay, **không** theo bộ lọc ngày, **có** theo chi nhánh) và **Trong khoảng**.

**(4) Cọc (Q3).** `giao_dich_thanh_toan` có `loai = 'ThanhToanLichHen'`, `phuong_thuc = 'Vi'`, `trang_thai = 'ThanhCong'`, `so_tien > 0`, `thoi_diem_tao` trong khoảng: **số khoản** và **tổng tiền** (VND). Loại: dòng 0đ, tiền mặt tại quầy, nạp ví. `[kn]` theo chi nhánh của lịch gốc (`giao_dich_thanh_toan.lich_hen_id`). Lịch bị huỷ vẫn tính vì tiền đã thu (hoàn đếm riêng).

**(5) Đã hoàn và khoản đang lỗi (Q3; T7).** Đã hoàn: `lich_su_hoan_tien.trang_thai = 'ThanhCong'` (cả `TuDong` và `DacBiet`), `thoi_diem` trong khoảng: số khoản và tổng tiền **đã vào ví**. Khoản đang lỗi: số khoản thanh toán có dòng hoàn mới nhất là `ThatBai`, **tại thời điểm xem** (không theo bộ lọc ngày), có theo chi nhánh:

```sql
SELECT COUNT(*) FROM lich_su_hoan_tien h  -- [JOIN giao_dich_thanh_toan, lich_hen khi lọc chi nhánh]
WHERE h.trang_thai = 'ThatBai' AND NOT EXISTS (SELECT 1 FROM lich_su_hoan_tien s
      WHERE s.giao_dich_thanh_toan_id = h.giao_dich_thanh_toan_id AND s.so_lan_thu > h.so_lan_thu)
```

**Cảnh báo cho B2 (T7):** không dùng lại câu chọn ứng viên của job thử lại (`findRetryCandidates` lấy `MAX` riêng loại `TuDong`): khoản đã được hoàn đặc biệt thành công sau lần tự động thất bại sẽ vẫn bị đếm là lỗi (DCH-04).

**(6) Xu hướng đăng ký khám (Q5; T8).** Đếm `lich_hen` có `lich_hen_truoc_id IS NULL` (bỏ dòng sinh do đổi lịch), **mọi trạng thái**, theo ngày của `thoi_diem_tao` trong khoảng; `[kn]` theo `chi_nhanh_id`. Khoảng tối đa **62** ngày: một điểm mỗi ngày; dài hơn: một điểm mỗi tuần (thứ Hai đến Chủ nhật, cắt theo hai đầu khoảng). Trả đủ điểm kể cả 0.

**(7) Yêu cầu đang chờ duyệt (Q6).** `trang_thai = 'ChoDuyet'`, mọi thời điểm:

| Loại | Bảng | Chi nhánh theo | Toàn hệ thống | Chi nhánh | Liên kết |
|---|---|---|---|---|---|
| Nghỉ phép | `yeu_cau_nghi_phep` | `bac_si.chi_nhanh_id` hiện tại | có | có | `/admin/duyet-yeu-cau/nghi-phep` |
| Đổi lịch ngoài chính sách | `yeu_cau_doi_lich_ngoai_chinh_sach` | `lich_hen.chi_nhanh_id` | có | có | `/admin/duyet-yeu-cau/doi-lich` |
| Thay đổi chi nhánh | `yeu_cau_thay_doi_chi_nhanh` | `chi_nhanh_id` | có | có (ghi chú "Quản trị viên Toàn hệ thống duyệt") | `/admin/thong-tin-phong-kham?tab=chi-nhanh` (phương án lùi ở T10) |
| Rút tiền | `yeu_cau_rut_tien` | không có | có (MH1) | **ẩn** (`null`) | `/admin/yeu-cau-rut-tien` |

**(8) Không có dữ liệu (A1; MH2).** `coDuLieu = false` khi trong khoảng: không lịch nào theo `thoi_gian`, không điểm xu hướng nào lớn hơn 0, không khoản cọc, không khoản hoàn.

### 5.7 Hợp đồng API (tiền tố `/api` qua proxy; `Cache-Control: no-store`; id `BIGINT` là chuỗi; tên `[đề xuất]`)

**`GET /admin/dashboard`** · query `tuNgay?`, `denNgay?`, `chiNhanhId?` (khoá lạ ⇒ 400 `TRUONG_KHONG_DUOC_PHEP`). B1 trả `boLoc`, `capNhatLuc`, `homNay`, `trongKhoang`, `vangMat`, `khungGio`; **B2 thêm** `tienCoc`, `hoanTien`, `xuHuong`, `choDuyet`, `coDuLieu`. Ví dụ với bộ D0 (7.0), xem tất cả:

```json
{
  "boLoc": { "tuNgay": "2026-12-01", "denNgay": "2026-12-07", "chiNhanhId": null },
  "capNhatLuc": "2026-12-04T03:00:00.000Z",
  "homNay": { "ngay": "2026-12-04", "lichKham": 3, "hoanThanh": 1 },
  "trongKhoang": { "lichKham": 7, "hoanThanh": 3 },
  "vangMat": { "tuSo": 2, "mauSo": 6, "phanTram": 33.3 },
  "khungGio": { "tuSo": 7, "mauSo": 12, "phanTram": 58.3 },
  "tienCoc": { "soKhoan": 6, "tongTien": "710000.00" },
  "hoanTien": { "soKhoan": 3, "tongTien": "230000.00", "soKhoanDangLoi": 1 },
  "xuHuong": { "donVi": "Ngay", "diem": [ { "tuNgay": "2026-12-01", "denNgay": "2026-12-01", "soLuong": 3 } ] },
  "choDuyet": { "nghiPhep": 2, "doiLich": 3, "thayDoiChiNhanh": 1, "rutTien": 2 },
  "coDuLieu": true
}
```

(`diem` thật có đủ bảy phần tử.) Chi nhánh: `boLoc.chiNhanhId` là chi nhánh được gán, `choDuyet.rutTien = null`.

**`GET /reception/dashboard`** (B3) · không query. `{ "ngay", "chiNhanh": { "id", "ten" }, "lichKham", "choTiepDon", "daTiepDon", "hoanThanh", "vangMat", "yeuCauDoiLichChoDuyet" }` với `lichKham = choTiepDon + daTiepDon + hoanThanh + vangMat` (`choTiepDon` là `DaXacNhan`).

### 5.8 Mã lỗi và câu chữ (web chọn theo `maLoi`; chữ `[đề xuất]`)

| `maLoi` / tình huống | HTTP | Khi | Chữ hiện |
|---|---|---|---|
| `DU_LIEU_KHONG_HOP_LE` + `NGAY_KHONG_HOP_LE` | 400 | ngày sai | "Ngày không hợp lệ." |
| … + `KHOANG_NGAY_KHONG_HOP_LE` | 400 | thiếu một đầu hay đảo ngược | "Chọn đủ hai ngày; \"Đến ngày\" không được trước \"Từ ngày\"." |
| … + `KHOANG_NGAY_QUA_DAI` (**mã mới**) | 400 | quá 366 ngày | "Khoảng thời gian tối đa 366 ngày." |
| … + `TRUONG_KHONG_DUOC_PHEP` hay `chiNhanhId` sai dạng | 400 | tham số lạ | "Bộ lọc không hợp lệ." |
| `KHONG_TIM_THAY` | 404 | chi nhánh ngoài phạm vi hay không có | "Không tìm thấy chi nhánh." kèm nút "Xem phạm vi của tôi" (bỏ bộ lọc chi nhánh) |
| `KHONG_DU_QUYEN` | 403 | sai vai hay phạm vi hỏng | trang không đủ quyền có sẵn |
| `LOI_HE_THONG`, mất mạng, quá giờ | 500, — | | câu lỗi chung sẵn có và nút "Thử lại" |
| (rỗng, A1) | 200 | `coDuLieu = false` | "Không có dữ liệu trong khoảng thời gian đã chọn." |
| Dòng giải thích thẻ | — | — | "x trên y lịch đã có kết quả" · "x trên y khung giờ đã phát ra (trừ nghỉ phép đã duyệt)" · "N khoản hoàn đang lỗi, chưa vào ví" · "Chưa đủ dữ liệu" khi mẫu 0 |

### 5.9 Quyền riêng tư và log

- Phản hồi **chỉ có số tổng hợp**, ngày, tên chi nhánh: không họ tên, SĐT, email, mã lịch, mã giao dịch, id tài khoản, lý do hay nội dung nào (DRG-04 kiểm theo danh sách khoá cho phép).
- `dashboard` **không ghi log nào của riêng mình** (không tham số lọc, không số tiền). Tham số bộ lọc (ngày, id chi nhánh) không phải dữ liệu cá nhân nhưng nằm trong URL nên có trong log truy cập của proxy như mọi truy vấn `GET`.
- `no-store` vì có tổng tiền; web không lưu số liệu vào kho trình duyệt.
- Không ghi nhật ký hành động (xem thống kê không thuộc danh sách hành động nhạy cảm).

### 5.10 Hiệu năng: phân tích chỉ mục (**suy từ DDL, chưa đo**)

| Câu | Chỉ mục sẵn có | Dự đoán | Chỉ mục ứng viên (**chỉ khi X1 không đạt, phải hỏi Đại**) |
|---|---|---|---|
| (1), (3) theo `thoi_gian` | không có chỉ mục dẫn đầu `thoi_gian`; `(chi_nhanh_id, benh_nhan_id)` chỉ lọc chi nhánh. Đường khác dùng chỉ mục sẵn có: `lich_lam_viec (chi_nhanh_id, ngay)` → `khung_gio (lich_lam_viec_id, ngay_gio)` → `lich_hen` theo khoá ngoại `khung_gio_id` | câu thẳng quét toàn bảng; thẻ "hôm nay" cũng vậy | `lich_hen (thoi_gian, chi_nhanh_id, trang_thai)` |
| (2) khung giờ | `lich_lam_viec_index_4`, `khung_gio_index_5`, `yeu_cau_nghi_phep_index_8` | dùng chỉ mục; xem tất cả có thể quét `lich_lam_viec` | — |
| (4) cọc | `giao_dich_thanh_toan_index_18 (trang_thai, thoi_diem_tao)` | khoảng theo chỉ mục | — |
| (5) đã hoàn, đang lỗi | chỉ UNIQUE `(giao_dich_thanh_toan_id, so_lan_thu)` | quét toàn bảng hoàn | `lich_su_hoan_tien (trang_thai, thoi_diem)` (đỡ luôn nợ dòng 177) |
| (6) xu hướng | không chỉ mục theo `thoi_diem_tao` | quét toàn bảng | `lich_hen (thoi_diem_tao, chi_nhanh_id, lich_hen_truoc_id)` |
| (7) chờ duyệt | `(trang_thai, …)` ở đổi lịch, rút tiền, thay đổi chi nhánh; `(bac_si_id, …)` ở nghỉ phép | đủ | — |

Không bảng tổng hợp, không bộ nhớ đệm ở bản đầu. Khoảng tối đa 366 ngày. Web dùng thời gian chờ mặc định 15 giây.

### 5.11 Giao diện Quản trị viên (F1, F2)

- Tiêu đề "Tổng quan"; dòng phạm vi (Chi nhánh: tên chi nhánh).
- **Bộ lọc:** "Từ ngày", "Đến ngày" (`input type="date"`), "Chi nhánh" chỉ khi Toàn hệ thống (mặc định "Tất cả chi nhánh"), nút "Áp dụng" và "Tải lại". Kiểm tại chỗ trước khi gọi (thiếu, đảo ngược, quá 366 ngày). Giá trị ở URL (T11). Chi nhánh: **không** gửi `chiNhanhId`.
- **Khối "Hôm nay":** hai thẻ (lịch khám, ca hoàn thành).
- **Khối "Trong khoảng đã chọn":** thẻ lịch khám, ca hoàn thành, tỉ lệ vắng mặt, tỉ lệ sử dụng khung giờ (phần trăm lớn, dòng "x trên y"; mẫu 0 hiện "—" và "Chưa đủ dữ liệu"), cọc (tổng, số khoản), đã hoàn (tổng, số khoản, số khoản đang lỗi). Thẻ là danh sách có tiêu đề để trình đọc màn hình đọc được.
- **Biểu đồ "Xu hướng đăng ký khám" (F2):** cột bằng SVG co theo khung, trục ghi ngày hay tuần, số lớn nhất ở trục; `role="img"` kèm tên tóm tắt (tổng số, ngày cao nhất); **bảng số** cùng dữ liệu mở bằng nút "Xem bảng số" (bàn phím tới được). Mọi giá trị bằng 0: không chia cho 0, hiện trục và thông báo. Không chỉ dùng màu để phân biệt.
- **Khối "Việc cần xử lý":** một dòng mỗi loại (tên, số, liên kết "Mở"); số 0 vẫn hiện; ghi "không phụ thuộc bộ lọc ngày".
- **Trạng thái:** đang tải ("Đang tải số liệu…"); lỗi và "Thử lại"; mất mạng (`OfflineBanner`); rỗng A1 (thông báo, thẻ 0 hay "—", biểu đồ trống, khối chờ duyệt vẫn hiện); đổi bộ lọc liên tiếp thì kết quả cũ không đè kết quả mới (`useRemote`).
- **375 px:** bộ lọc xếp dọc, thẻ một cột, biểu đồ không làm trang tràn ngang, vùng bấm tối thiểu 44 px.

### 5.12 Giao diện Lễ tân (F3, `[CẮT ĐƯỢC]`; Q12, Q13)

`/le-tan` hiện "Tổng quan" (không còn chuyển tới Tra cứu bệnh nhân); mục menu "Tổng quan" bật. Dòng "Hôm nay, {ngày} · {chi nhánh}"; năm thẻ (lịch khám, chờ tiếp đón, đã tiếp đón, hoàn thành, vắng mặt) kèm liên kết "Quản lý lịch hẹn"; dòng "Yêu cầu đổi lịch đang chờ: N" liên kết tới trang Yêu cầu đổi lịch; nút "Tải lại"; đang tải, lỗi, 375 px, bàn phím như 5.11. Không bộ lọc.

### 5.13 Cấu hình và điểm nối

Không biến môi trường mới, không phụ thuộc mới, không đổi proxy hay compose.

### 5.14 Việc phải **đo thật** trước khi chốt, kiểm thử và đột biến

**X1** (tiêu chí đặt **TRƯỚC** khi chạy, **không đổi sau khi thấy số**; DB tạm tên `*_test` riêng, **không** dùng `clinix` hay `clinix_test`; xoá DB tạm chỉ khi Đại đồng ý hoặc theo nếp bộ test tích hợp; báo số cho Đại trước khi ghi "ĐÃ CHỐT"; ghi TRACKING mục 6).

**Dữ liệu (`[đề xuất]`):** 5 chi nhánh, 60 bác sĩ, khoảng 420 ngày (gồm khoảng 55 ngày tương lai), khoảng 300.000 `khung_gio`, **100.000 `lich_hen`**, **100.000 `giao_dich_thanh_toan`** (cọc ví, tiền mặt, nạp ví), 20.000 `lich_su_hoan_tien` (khoảng 5 phần trăm thất bại), 2.000 yêu cầu nghỉ phép, 5.000 yêu cầu đổi lịch, 2.000 yêu cầu rút tiền; `ANALYZE TABLE`; mỗi phép đo làm nóng 5 lần, đo 30 lần, lấy p95; MySQL 8.4 trong Docker ở máy dev (ghi cấu hình máy).

| Mã | Đo | Tiêu chí đạt (`[đề xuất]`) | Không đạt thì |
|---|---|---|---|
| M1 | từng câu, khoảng 30 ngày, tất cả và một chi nhánh; ghi `EXPLAIN ANALYZE` | p95 mỗi câu ≤ 150 ms | đổi hình dạng câu; vẫn không đạt thì hỏi Đại về chỉ mục ứng viên |
| M2 | từng câu, khoảng 366 ngày | p95 mỗi câu ≤ 700 ms | như M1 |
| M3 | cả service của `GET /admin/dashboard` (một giao dịch) | 30 ngày p95 ≤ 600 ms; 366 ngày p95 ≤ 2.000 ms | như M1; hoặc đề xuất hạ trần khoảng ngày |
| M4 | 5 lời gọi song song khoảng 366 ngày, pool 10 kết nối | 0 lỗi, p95 ≤ 5.000 ms | báo Đại; xét giảm số câu hay giới hạn |
| M5 | các câu "hôm nay" và đổi lịch chờ của Lễ tân | p95 cả service ≤ 200 ms | như M1 |

Cần chỉ mục: nêu **đúng cột**, số trước và sau, hỏi Đại; được đồng ý thì làm PR riêng "dashboard P1" (migration viết tay và **ba** file `docs/database/*`, `[ĐỒNG BỘ TL]`, khoảng 2 giờ, ngoài 22 giờ); không được thì ghi nợ.

**Kiểm thử.** Đơn vị cho hàm thuần (bộ lọc, gom tuần, làm tròn); tích hợp trên MySQL thật với bộ **D0** (7.0) và kết quả tính tay; e2e qua `AppModule` cho quyền, phạm vi, mã lỗi, header; ca ngày giờ chạy dưới cả `TZ=UTC` và `TZ=Asia/Ho_Chi_Minh` với đồng hồ giả.

**Đột biến mục tiêu** (lane nặng, hỏi phiên kiểm trước): (1) Chi nhánh dùng `chiNhanhId` của client (DQP-03); (2) không kiểm chi nhánh tồn tại (DQP-04); (3) thêm `DaXacNhan` vào mẫu số vắng mặt (DVM-02); (4) không trừ nghỉ đã duyệt, hoặc trừ cả chờ duyệt (DKG-02); (5) tính `DangGiuCho` là đã đặt (DKG-03); (6) tính tiền mặt hay 0đ vào cọc (DCH-02); (7) cộng dòng hoàn thất bại (DCH-03); (8) biên cuối khoảng thành `<=` mốc 00:00 hôm sau (DCH-02, DXH-04); (9) đếm cả dòng đổi lịch trong xu hướng (DXH-02); (10) trả số rút tiền cho Chi nhánh (DCD-02); (11) bỏ `runReadOnly` (DRG-02, DRG-03); (12) Lễ tân không lọc chi nhánh (DLT-02). Web (GỌN, bốn loại): web tự tính lại phần trăm (DWB-06); không huỷ kết quả cũ (DWB-08); gửi `chiNhanhId` khi là Chi nhánh (DWB-05); hiện dòng rút tiền cho Chi nhánh (DWB-07).

## 6. Kế hoạch task

**Cách gọi mã task:** `B1`, `B2`, `X1`, `F1`, `F2`, `X2`, `B3`, `F3`; ngoài file này viết "dashboard B1".

### 6.1 Sơ đồ phụ thuộc, việc bắt đầu ngay và việc phải chờ (`→` = phải xong trước)

```
Nền đã có: rbac (phạm vi) · booking, doctor, payment, wallet (dữ liệu) · admin web (khung, mục "Tổng quan")
Máy chủ       : B1 → B2 → X1 (đo thật)
Giao diện     : B1 → F1 ([SOẠN TRƯỚC] bằng API giả; merge sau B2) → F2 (cần cả B2)
Tổng kết      : F1, F2, X1 → X2
Phần cắt được : X2 → B3 → F3
```

- **Ngay:** B1 (không phụ thuộc scope đang làm dở nào). **Sau B1:** B2; F1 viết trước được. **Sau B2:** X1. F2 sau F1 và B2, không chờ X1.
- **Chặn bên ngoài:** chỉ giờ của Đại (chatbot trước). X2 cần dữ liệu demo `[CHỜ Đại]`.

### 6.2 Danh sách task (mỗi task = một PR; người làm Đại `MaxTrann`, Trung review; giờ là `[đề xuất]`)

| ID | Việc (file chính) | Phụ thuộc | Truy vết | Test case | Thẻ | Giờ | Mức |
|---|---|---|---|---|---|---|---|
| **B1** | `DashboardModule`, scope commit `dashboard`, bộ lọc và phạm vi, `GET /admin/dashboard` phần lịch hẹn: hôm nay, trong khoảng, vắng mặt, khung giờ; test kiến trúc, bộ dữ liệu D0 | — | b2 đến b4, TĐK, HĐK; Q1, Q2, Q4, Q7; T1 đến T6, T9, T12 | DQP-01…DQP-06, DBL-01…DBL-07, DVM-01…DVM-04, DKG-01…DKG-04, DHN-01…DHN-03, DRG-02, DRG-04 | `[ĐỤNG database]` `[ĐỤNG docker]` `[ĐỒNG BỘ TL]` | 4,5 | ĐB |
| **B2** | Cọc, đã hoàn, khoản đang lỗi, xu hướng ngày và tuần, yêu cầu chờ duyệt, cờ không có dữ liệu | B1 | b4, A1; Q3, Q5, Q6; T7, T8 | DCH-01…DCH-05, DXH-01…DXH-04, DCD-01…DCD-04, DRG-01, DRG-03 | `[ĐỒNG BỘ TL]` | 4 | ĐB |
| **X1** | Đo M1 đến M5 trên 100.000 lịch và giao dịch; chọn hình dạng câu; đề xuất chỉ mục nếu cần | B1, B2 | R2; Q10; T13 | — (số đo) | `[CHỜ Đại]` | 3 | — |
| **F1** | Trang Tổng quan Quản trị viên: route `/admin`, bộ lọc, thẻ số, việc cần xử lý, tải, lỗi, rỗng, 375 px; tham số mở tab Chi nhánh | B1; B2 (`[SOẠN TRƯỚC]`) | b1 đến b4, A1; Q4, Q6, Q7; T10, T11 | DWB-01…DWB-11 | `[ĐỤNG admin]` `[ĐỤNG router]` | 5 | GỌN |
| **F2** | Biểu đồ xu hướng SVG và bảng số | F1, B2 | b4 (biểu đồ); Q5, Q8 | DBD-01…DBD-04 | — | 3 | GỌN |
| **X2** | Kiểm tay trình duyệt, đột biến lô, đồng bộ PLAN, TRACKING, `docs/TRACKING.md`, nháp nợ, tổng kết phần cam kết | F1, F2, X1 | mục 10 | DKT-01…DKT-04 | `[CHỜ Đại]` `[ĐỒNG BỘ TL]` | 2,5 | THƯỜNG |
| **B3** | `GET /reception/dashboard` | X2 | Q9, Q12 | DLT-01…DLT-05 | `[CẮT ĐƯỢC]` | 1,5 | THƯỜNG |
| **F3** | Trang Tổng quan Lễ tân làm trang mở đầu; menu; sửa test chuyển hướng; kiểm tay | B3 | Q12, Q13 | DLW-01…DLW-04, DKT-05 | `[CẮT ĐƯỢC]` `[ĐỤNG router]` `[ĐỤNG auth]` `[ĐỤNG patient]` `[ĐỒNG BỘ TL]` | 3 | GỌN |

**Phần cam kết 22 giờ** (B1, B2, X1, F1, F2, X2). **Phần cắt được 4,5 giờ** (B3, F3). **Tổng 26,5 giờ.**

### 6.3 File dùng chung và file của module khác, cách tránh xung đột

| File | Ai cùng chạm | Task | Cách |
|---|---|---|---|
| `apps/api/src/app.module.ts` | chat (`ChatModule` đã vào `main` ở `c61d4f6`), chatbot | B1 | một dòng `import`, một phần tử; tạo nhánh từ `main` mới; rebase khi trùng |
| `commitlint.config.cjs`, `AGENTS.md` (danh sách scope) | chatbot P1 | B1 | thêm đúng một từ; gộp sau PR chatbot P1 |
| `apps/web/src/features/admin/admin-routes.tsx`, `admin-overview-page.tsx`, `admin-layout.test.tsx` | module admin (Trung, Đại) | F1 | bỏ route `index` và trang rỗng, cập nhật `AF1-01`; báo Trung trước |
| `apps/web/src/features/admin/clinic-info/clinic-info-page.tsx` | module admin | F1 | chỉ giá trị khởi tạo của tab; **phương án lùi** (T10): có PR admin đang mở chạm file này thì không sửa, liên kết không kèm tab, ghi nợ |
| `apps/web/src/router/role-routes.tsx` | chatbot (`root-layout`), chat (`role-nav`, `role-routes`) | F1, F3 | thêm mảng route của `dashboard`; rebase khi trùng |
| `apps/web/src/router/role-nav.ts`, test đăng nhập và chuyển hướng Lễ tân | chat, auth, patient | F3 | một thuộc tính `to`, `end`; sửa đúng ca mong chuyển hướng |
| `docs/database/*` | cửa sổ khác | — | **không sửa**, trừ khi Đại đồng ý chỉ mục sau X1 |
| `docs/features/{reschedule,chat,chatbot,notification}/*` | cửa sổ khác | — | **không sửa** |
| `docs/TECH_DEBT.md`, `AI_USAGE_LOG.md` | mọi người | mỗi PR | **phiên lập kế hoạch này không sửa**; đối chiếu số trên `origin/main` lúc ghi |

Dữ liệu demo cho kiểm tay và bảo vệ: seed hiện có tạo lịch dồn ít ngày; cách bổ sung dữ liệu trải ngày `[cần điền]` (không chạy `seed:*` lên `clinix` khi chưa được Đại đồng ý).

### 6.4 Ước giờ, Iteration và metric P1 (giả định **20 giờ mỗi tuần cho mọi việc**, chatbot ưu tiên trước; Q11)

| Iteration | Chatbot (PLAN chatbot 6.4) | Dashboard (giờ) | Cộng | Ghi chú |
|---|---|---|---|---|
| **9** (08/12 đến 14/12) | 17 | B1: khoảng 3 trong 4,5 | 20 | dashboard chỉ khởi công khi chatbot đúng tiến độ |
| **10** (15/12 đến 21/12) | dự phòng cho phần trượt | B1 còn 1,5 · B2 4 · X1 3 · F1 5 · F2 3 · X2 2,5 = **19** | 19 + phần trượt | **dư khoảng 1 giờ**; hạn 21/12 |
| Sau đó hoặc giờ dư | — | B3 1,5 · F3 3 = 4,5 `[CẮT ĐƯỢC]` | — | chỉ làm khi phần cam kết đã xong |

- **Chatbot trượt bao nhiêu giờ vào Iteration 10 thì dashboard thiếu bấy nhiêu** (trừ 1 giờ dư). Khi đó: báo Đại sớm; phương án là thêm giờ hoặc lùi mốc, **không cắt chỉ số** của đặc tả.
- Chưa tính trong 22 giờ: PR chỉ mục nếu X1 không đạt (khoảng 2 giờ), sửa theo review.
- **Giờ ước cho việc LẬP KẾ HOẠCH này:** khoảng **3 giờ** `[đề xuất]` (đọc nguồn và mã 1,5; hỏi và đối chiếu 0,5; viết PLAN, TRACKING, nháp 1), cộng khoảng 0,5 giờ review mỗi người.
- **Metric P1 của bản cam kết** (ngưỡng 90 phần trăm tại 07/12): dashboard hoàn thành sau mốc đó nên **đề xuất không đưa vào mẫu số ngày 07/12** (như chatbot, mốc riêng 21/12). Hai issue `[CẮT ĐƯỢC]` không thuộc cam kết; nếu cắt thì đóng với lý do "not planned" và không tính vào mẫu số.

### 6.5 Phương án tối thiểu khả thi (CHÍNH) và việc "làm sau nếu còn giờ"

**Phương án tối thiểu khả thi — đủ để demo và cam kết:**

| Mục | Nội dung |
|---|---|
| Task | B1, B2, X1, F1, F2, X2 (6 task) |
| Giờ | **22** |
| Có | đủ sáu chỉ số còn lại của đặc tả, bộ lọc ngày và chi nhánh, phạm vi hai loại Quản trị viên, A1, biểu đồ kèm bảng số, số đo thật ở 100.000 lịch và giao dịch |
| Bị cắt | mọi mục "làm sau" dưới đây và phần Lễ tân |
| Rủi ro chính | R1 (lịch), R2 (hiệu năng), R3 (test cũ), R4 (dữ liệu demo) |
| Cam kết đề xuất | số trên dashboard khớp dữ liệu tính tay (bộ D0) 100 phần trăm; đúng phạm vi chi nhánh 100 phần trăm; M3 đạt hoặc có quyết định của Đại; mốc 21/12 |

**Thứ tự làm thêm khi còn giờ:** (1) B3, F3 dashboard rút gọn của Lễ tân, 4,5 giờ, **có issue**.

**"Làm sau", KHÔNG tạo issue:** so sánh với kỳ trước (+3 giờ); xuất CSV (+3); nút chọn nhanh kỳ (+1); lọc theo chuyên khoa, dịch vụ, bác sĩ (+4); thu tiền mặt tại quầy và doanh thu (+2); hàng đợi "nạp ví chưa cộng" và số bệnh nhân bị khoá đặt lịch (+2); tự làm mới (+1); tỉ lệ chấp nhận lời mời khi có module danh sách chờ (Khóa luận). Giờ là `[đề xuất]`.

### 6.6 Thông tin để sinh issue (**KHÔNG tạo issue lúc này**: Đại tự chạy script sau khi PR tài liệu merge)

Mỗi task một issue; nhãn `module:dashboard` (**chưa có** trong repo; script tạo) cộng `backend`, `frontend` (task web: `frontend`; task cần đồng bộ tài liệu thêm `docs-sync`; X1, X2 thêm `testing` và không gắn `backend`); milestone `dashboard` (**chưa có**; script tạo); giao `MaxTrann` (người làm), review `junUTE` (Trung review mọi PR của scope); Epic `[dashboard] Epic · Dashboard và báo cáo vận hành` (nhãn `epic`, `module:dashboard`) gom mọi task; Iteration theo 6.4 (B3, F3 **không gán Iteration**); phụ thuộc theo cột "Phụ thuộc" ở 6.2. Tiêu đề issue dạng `[dashboard] <mã> · <tên> (<backend|frontend|docs|testing>)` (≤ 100 ký tự), tiêu đề PR ≤ 100 ký tự và `Closes #<issue>` ở thân PR (Epic dùng `Refs`). Khuôn thân issue theo issue chatbot #734 (đọc bằng `gh issue view 734`): `## Mô tả`, `## Truy vết`, `## Phụ thuộc`, `## Lưu ý` (thẻ trong PLAN; Iteration, giờ, mức kiểm; **Người làm: `MaxTrann`; người review: `junUTE`**; tiêu đề PR gợi ý; "Mã task trùng tên với task của module khác: khi nhắc ngoài PLAN này, viết dashboard B1"; "Figma chỉ là bản phác thảo"; "Chỉ đọc: không ghi bảng nào"; riêng B3, F3 thêm "Phần cắt được, ngoài cam kết F-5 (Q14); không làm thì đóng với lý do not planned"), `## Test case liên quan` (kèm "Danh sách đầy đủ và kết quả mong đợi: `docs/features/dashboard/PLAN.md` mục 7."), `## Đóng khi` (ô riêng ở bảng dưới, rồi bốn ô chuẩn: PR được người còn lại review và squash merge, tiêu đề theo Conventional Commits ≤ 100 ký tự, `Closes #<issue>`; test case đã chạy và ghi vào `docs/features/dashboard/TRACKING.md`; tài liệu đồng bộ đã cập nhật trong cùng PR; nếu có dùng AI đã ghi `AI_USAGE_LOG.md` hay `TRUNG_AI_USAGE_LOG.md`, không dòng `Co-Authored-By` của AI), dòng cuối: nguồn `docs/features/dashboard/PLAN.md`, task `<mã>`; thuộc Epic.

Nhãn `blocked` (gỡ khi điều kiện có): **X2**: `[CHỜ Đại]` (dữ liệu demo và cho phép chạy kiểm tay). Q1 đến Q14 đã được Đại trả lời trực tiếp 26/11/2026; T1 đến T13 (4.3) đã được phiên kiểm duyệt kỹ thuật cùng ngày.

| ID | Tiêu đề issue | Tiêu đề PR (`<loại>(<scope>): …`) | Iter. | "Đóng khi" (ngoài bốn ô chuẩn) |
|---|---|---|---|---|
| B1 | `[dashboard] B1 · API tổng quan: bộ lọc, phạm vi, lịch khám, vắng mặt, khung giờ (backend)` | `feat(dashboard): thêm API tổng quan lịch khám, vắng mặt và khung giờ (dashboard B1)` | 9 | DQP-01…DQP-06, DBL-01…DBL-07, DVM-01…DVM-04, DKG-01…DKG-04, DHN-01…DHN-03, DRG-02, DRG-04 Pass; đột biến 1 đến 5 bị bắt |
| B2 | `[dashboard] B2 · Cọc, hoàn tiền, xu hướng đăng ký và yêu cầu chờ duyệt (backend)` | `feat(dashboard): thêm số liệu cọc, hoàn, xu hướng và yêu cầu chờ duyệt (dashboard B2)` | 10 | DCH-01…DCH-05, DXH-01…DXH-04, DCD-01…DCD-04, DRG-01, DRG-03 Pass; đột biến 6 đến 11 bị bắt |
| X1 | `[dashboard] X1 · Đo thật truy vấn tổng hợp ở 100.000 lịch và giao dịch (testing)` | `test(dashboard): đo thật truy vấn tổng hợp ở 100.000 lịch và giao dịch (dashboard X1)` | 10 | M1 đến M5 có số ở TRACKING mục 6; tiêu chí không đổi sau khi thấy số; Đại đã xem số; nếu cần chỉ mục thì có câu trả lời của Đại |
| F1 | `[dashboard] F1 · Trang Tổng quan Quản trị viên: bộ lọc, thẻ số, việc cần xử lý (frontend)` | `feat(web): thêm trang Tổng quan Quản trị viên với bộ lọc và thẻ số (dashboard F1)` | 10 | DWB-01…DWB-11 Pass; cả bộ web xanh; đột biến web bốn loại bị bắt |
| F2 | `[dashboard] F2 · Biểu đồ xu hướng đăng ký khám và bảng số thay thế (frontend)` | `feat(web): thêm biểu đồ xu hướng đăng ký khám ở trang Tổng quan (dashboard F2)` | 10 | DBD-01…DBD-04 Pass; không thêm phụ thuộc; 375 px không tràn ngang |
| X2 | `[dashboard] X2 · Kiểm tay, đột biến và tổng kết dashboard (testing)` | `test(dashboard): kiểm tay, đột biến và đồng bộ tài liệu dashboard (dashboard X2)` | 10 | DKT-01…DKT-04 có kết quả thật; đột biến 1 đến 11 và bốn loại web bị bắt; `docs/TRACKING.md` một dòng; nháp nợ gửi Đại; mục 10 phần cam kết đạt |
| B3 | `[dashboard] B3 · API tổng quan rút gọn cho Lễ tân (backend)` | `feat(dashboard): thêm API tổng quan trong ngày cho Lễ tân (dashboard B3)` | — | DLT-01…DLT-05 Pass; đột biến 12 bị bắt |
| F3 | `[dashboard] F3 · Trang Tổng quan Lễ tân làm trang mở đầu (frontend)` | `feat(web): thêm trang Tổng quan Lễ tân làm trang mở đầu (dashboard F3)` | — | DLW-01…DLW-04, DKT-05 Pass; cả bộ web xanh; việc sửa 2.4 đã nhắc ở TRACKING |

**Nhãn Epic:** `[dashboard] Epic · Dashboard và báo cáo vận hành` gom 8 issue; đóng khi phần cam kết đạt mục 10 (B3, F3 đã đóng bằng "Done" hoặc "not planned").

## 7. Test case dự kiến

Loại: **U** đơn vị (không DB), **I** tích hợp trên MySQL thật (`*.int-spec.ts`), **E** e2e qua `AppModule`, **W** giao diện (Vitest và happy-dom), **B** trình duyệt (kiểm tay). Mỗi test ghi mã ở tên ca (`it('DVM-01: …')`). Đồng hồ giả cho ca thời gian; ca ngày giờ chạy dưới cả `TZ=UTC` và `TZ=Asia/Ho_Chi_Minh`. **Trạng thái: chưa chạy ca nào** (kế hoạch).

### 7.0 Bộ dữ liệu dựng sẵn D0 và kết quả tính tay

`now` giả = **04/12/2026 10:00** giờ Việt Nam. Bộ lọc chuẩn **01/12 đến 07/12/2026**. Hai chi nhánh A, B; bác sĩ D1 ở A, D2 ở B. Số kỳ vọng đã kiểm bằng một script độc lập ngoài repo (26/11/2026), **chưa** chạy trên MySQL.

| Ca làm việc | Khung | Ghi chú |
|---|---|---|
| A, D1, 02/12 sáng | s1 đến s4 | |
| A, D1, 03/12 sáng | s5 đến s8 | nghỉ **đã duyệt** theo ca sáng 03/12 |
| A, D1, 04/12 sáng | s9 đến s12 (s12 lúc 11:00) | hôm nay |
| A, D1, 08/12 sáng | s13 đến s16 | ngoài khoảng |
| B, D2, 02/12 chiều | t1 đến t4 | |
| B, D2, 09/12 chiều | u1 đến u4 | ngoài khoảng |

Giờ khung: ca sáng s1 = 08:00, mỗi khung 30 phút (riêng s12 = 11:00); ca chiều t1 = 13:30, mỗi khung 30 phút.

Nghỉ khác (không loại khung): D1 chờ duyệt 10/12, D1 từ chối 11/12, D2 chờ duyệt 12/12.

| Lịch | Khung | Trạng thái | `thoi_diem_tao` | Ghi chú |
|---|---|---|---|---|
| L1 | s1 | `HoanThanh` | 28/11 10:00 | |
| L2 | s2 | `VangMat` | 01/12 08:00 | |
| L3 | s3 | `DaHuy` | 01/12 09:00 | khung `ConTrong` |
| L4 | s4 | `DaDoiLich` | 02/12 00:00:00 | khung `ConTrong` |
| L6 | s5 | `DaHuy` | 02/12 23:59:59 | huỷ do nghỉ phép |
| L5 | s9 | `DaXacNhan` | 02/12 12:00 | `lich_hen_truoc_id` = L4 |
| L7 | s10 | `DaTiepDon` | 03/12 15:00 | |
| L8 | s11 | `HoanThanh` | 04/12 07:00 | |
| L9 | s12 | `ChoThanhToan` | 04/12 09:55 | khung `DangGiuCho` |
| L10 | s13 | `DaXacNhan` | 07/12 23:59:59 | khám ngoài khoảng, đặt trong khoảng |
| M1 | t1 | `VangMat` | 01/12 10:00 | |
| M2 | t2 | `HoanThanh` | 30/11 23:59:59 | |
| M3 | t3 | `DaHuy` | 29/11 23:00 | khung `ConTrong` |
| N1 | u1 | `DaXacNhan` | 08/12 00:00:00 | ngoài khoảng |

| Giao dịch | Lịch gốc | Loại, phương thức | Số tiền | Lúc | Tính vào cọc? |
|---|---|---|---|---|---|
| P1 | L1 | cọc ví | 100.000 | 28/11 10:05 | không (ngoài khoảng) |
| P2 | L2 | cọc ví | 150.000 | 01/12 08:05 | có |
| P3 | L3 | cọc ví | 200.000 | 01/12 09:05 | có |
| P4 | L4 | cọc ví | 120.000 | 02/12 00:05 | có |
| P5 | L6 | cọc ví | 100.000 | 02/12 23:59:59 | có |
| P6 | L7 | cọc ví | 0 | 03/12 15:00 | không (0đ) |
| P7 | L7 | tiền mặt tại quầy | 80.000 | 04/12 08:40 | không |
| P8 | — | nạp ví (`VNPay`) | 500.000 | 02/12 10:00 | không |
| P9 | M2 | cọc ví | 60.000 | 30/11 23:59:59 | không |
| P10 | M1 | cọc ví | 90.000 | 01/12 10:05 | có |
| P11 | L10 | cọc ví | 50.000 | 07/12 23:59:59 | có |
| P12 | N1 | cọc ví | 70.000 | 08/12 00:00:00 | không |
| P13 | M3 | cọc ví | 40.000 | 29/11 23:05 | không (ngoài khoảng) |

| Dòng hoàn | Khoản | Loại, kết quả | Số tiền | `so_lan_thu` | Lúc |
|---|---|---|---|---|---|
| R1 | P3 | tự động, thành công | 100.000 | 1 | 01/12 12:00 |
| R2 | P5 | tự động, **thất bại** | 100.000 | 1 | 03/12 09:00 |
| R3 | P5 | tự động, thành công | 100.000 | 2 | 03/12 09:05 |
| R4 | P2 | đặc biệt, thành công | 30.000 | 1 | 05/12 10:00 |
| R5 | P13 | tự động, **thất bại** | 40.000 | 1 | 02/12 16:00 |
| R6 | P1 | đặc biệt, thành công | 10.000 | 1 | 08/12 00:00:00 |

Yêu cầu: đổi lịch chờ duyệt cho L5, L10, N1 và một yêu cầu từ chối cho L8; rút tiền 2 chờ duyệt, 1 đã duyệt; thay đổi chi nhánh: A chờ duyệt, B đã duyệt chưa áp dụng. Mọi dòng đủ khoá ngoại (ví, bệnh nhân, bác sĩ, dịch vụ); fixture đặt ở `dashboard/testing/` (bộ quét luật kiến trúc bỏ qua thư mục `testing/`).

**Kết quả mong đợi:**

| Chỉ số | Tất cả | A | B |
|---|---|---|---|
| Vắng mặt | 2/6 = 33,3 | 1/4 = 25,0 | 1/2 = 50,0 |
| Khung giờ | 7/12 = 58,3 | 5/8 = 62,5 | 2/4 = 50,0 |
| Hôm nay (lịch khám, hoàn thành) | 3, 1 | 3, 1 | 0, 0 |
| Trong khoảng (lịch khám, hoàn thành) | 7, 3 | 5, 2 | 2, 1 |
| Cọc (số khoản, tổng) | 6, 710.000 | 5, 620.000 | 1, 90.000 |
| Đã hoàn (số khoản, tổng) | 3, 230.000 | 3, 230.000 | 0, 0 |
| Khoản hoàn đang lỗi | 1 | 0 | 1 |
| Xu hướng 01/12 → 07/12 | 3, 2, 1, 2, 0, 0, 1 | 2, 2, 1, 2, 0, 0, 1 | 1, 0, 0, 0, 0, 0, 0 |
| Chờ duyệt: nghỉ phép, đổi lịch, thay đổi chi nhánh | 2, 3, 1 | 1, 2, 1 | 1, 1, 0 |
| Chờ duyệt: rút tiền | 2 | Toàn hệ thống lọc A: 2; Quản trị viên A: `null` | Toàn hệ thống lọc B: 2; Quản trị viên B: `null` |
| Lễ tân hôm nay (khám, chờ, tiếp đón, xong, vắng; đổi lịch chờ) | — | 3, 1, 1, 1, 0; 2 | 0, 0, 0, 0, 0; 1 |

### 7.1 Quyền và phạm vi (DQP) — B1

| Mã | Loại | Kịch bản | Kết quả mong đợi |
|---|---|---|---|
| DQP-01 | E | `GET /admin/dashboard` bằng khách, Bệnh nhân, Bác sĩ, Lễ tân (kể cả query sai), hai loại Quản trị viên | 401; 403 `KHONG_DU_QUYEN`; 200 |
| DQP-02 | E | Quản trị viên A không gửi `chiNhanhId` | số của A; `boLoc.chiNhanhId` = A |
| DQP-03 | E | Quản trị viên A gửi A; gửi B; gửi id không tồn tại | 200; 404; 404 **cùng thân** với trường hợp gửi B (trừ `requestId`) |
| DQP-04 | E | Toàn hệ thống: không gửi; gửi B; gửi id không tồn tại | tất cả; số của B; 404 |
| DQP-05 | U | test kiến trúc `dashboard/` | không câu ghi, không khoá, không giờ của DB; mọi route đủ `@Roles`, phạm vi, `no-store`; controller giả thiếu thì bị bắt |
| DQP-06 | I | phạm vi hỏng (`kind` lạ, `ChiNhanh` thiếu id) đưa vào service; đổi phạm vi giữa hai request | 403, không trả số toàn hệ thống; request sau theo phạm vi mới |

### 7.2 Bộ lọc (DBL) — B1

| Mã | Loại | Kịch bản | Kết quả mong đợi |
|---|---|---|---|
| DBL-01 | U, E | không gửi ngày, đồng hồ giả ở 23:59:59 và 00:00:00 giờ Việt Nam, hai múi giờ | 30 ngày kết thúc đúng "hôm nay" |
| DBL-02 | E | chỉ `tuNgay` hoặc chỉ `denNgay` | 400 `KHOANG_NGAY_KHONG_HOP_LE` |
| DBL-03 | E | `2026-02-30`, chữ, `denNgay` trước `tuNgay` | 400 đúng mã |
| DBL-04 | U, E | 366 ngày; 367 ngày; khoảng chứa 29/02/2028 | nhận; 400 `KHOANG_NGAY_QUA_DAI`; đếm đúng |
| DBL-05 | E | khoá lạ; `chiNhanhId` là chữ, số âm, quá `BIGINT` | 400 |
| DBL-06 | E | khoảng toàn tương lai | 200 |
| DBL-07 | E | header của 200, 400, 404 | `Cache-Control: no-store` |

### 7.3 Vắng mặt (DVM), khung giờ (DKG), hôm nay (DHN) — B1

| Mã | Loại | Kịch bản | Kết quả mong đợi |
|---|---|---|---|
| DVM-01 | I | bộ D0: tất cả, A, B | theo bảng 7.0 |
| DVM-02 | I | thêm lịch ở mỗi trạng thái không có kết quả | mẫu số không đổi |
| DVM-03 | I | khoảng không có lịch có kết quả | `mauSo` 0, `phanTram` `null` |
| DVM-04 | U | 1/3, 2/3, 1/8, 1/16, 0/5, 5/5 | 33,3; 66,7; 12,5; 6,3; 0; 100 |
| DKG-01 | I | bộ D0: tất cả, A, B | theo bảng 7.0 |
| DKG-02 | I | nghỉ đã duyệt cả ngày, theo ca, nhiều ngày; chờ duyệt; từ chối | chỉ nghỉ **đã duyệt** loại đúng ca bị phủ |
| DKG-03 | I | khung `DangGiuCho`, lịch `VangMat`, khung đã trả sau huỷ | không tính; tính; không tính |
| DKG-04 | I | không ca nào trong khoảng | 0/0, `null` |
| DHN-01 | I | bộ D0: hôm nay và trong khoảng | theo bảng 7.0 |
| DHN-02 | I | lịch lúc 00:00:00 và 23:59:59 hôm nay, 00:00:00 ngày mai; `TZ=UTC` | đếm đúng ngày Việt Nam |
| DHN-03 | I | đổi bộ lọc ngày; đổi chi nhánh | thẻ hôm nay không đổi theo ngày, đổi theo chi nhánh |

### 7.4 Cọc, hoàn (DCH), xu hướng (DXH), chờ duyệt (DCD) — B2

| Mã | Loại | Kịch bản | Kết quả mong đợi |
|---|---|---|---|
| DCH-01 | I | bộ D0 cọc: tất cả, A, B | theo bảng 7.0, chuỗi hai số lẻ |
| DCH-02 | I | 0đ, tiền mặt, nạp ví, giao dịch chưa thành công; mốc 23:59:59 và 00:00:00 | bị loại; biên đúng |
| DCH-03 | I | dòng thất bại, đặc biệt, biên ngày | thất bại không cộng; đặc biệt cộng |
| DCH-04 | I | (a) bộ D0: P13 chỉ có dòng `TuDong` `ThatBai`; (b) thêm cho P13 dòng `DacBiet` `ThanhCong` 40.000, `so_lan_thu` 2, lúc 04/12 09:00 (chuỗi tự động thất bại rồi đặc biệt thành công); (c) như (b) nhưng dòng thêm là `TuDong`; (d) đổi bộ lọc ngày trên (a) | khoản đang lỗi của B: (a) 1; (b) **0** (câu lấy `MAX` riêng `TuDong` ra 1: ca này bắt lỗi đó); (c) 0; (d) vẫn 1. Đã hoàn của B ở (b) và (c), khoảng chuẩn: 1 khoản, 40.000 |
| DCH-05 | I | tổng rất lớn (nhiều dòng `9999999999.99`); không dòng nào | chuỗi đúng từng chữ số; `"0.00"` |
| DXH-01 | I | bộ D0 chuỗi ngày | theo bảng 7.0, đủ bảy điểm |
| DXH-02 | I | dòng đổi lịch; lịch huỷ, hết hạn | không đếm dòng đổi; đếm lịch huỷ |
| DXH-03 | U | 62 ngày; 63 ngày; khoảng bắt đầu giữa tuần; tuần không có lịch | theo ngày; theo tuần thứ Hai, cắt hai đầu, điểm 0 |
| DXH-04 | I | mốc nửa đêm, `TZ=UTC` | gom theo ngày Việt Nam; 00:00:00 ngày kế không vào |
| DCD-01 | I | bộ D0: tất cả, A, B | theo bảng 7.0 |
| DCD-02 | E | Quản trị viên Chi nhánh | `rutTien` là `null`, không phải 0 |
| DCD-03 | I | đối chiếu tổng của bốn danh sách duyệt hiện có, cùng phạm vi, trạng thái chờ | bằng nhau |
| DCD-04 | I | đổi bộ lọc ngày | số chờ duyệt không đổi |

### 7.5 Rỗng, nhất quán, riêng tư (DRG) — B1, B2

| Mã | Loại | Kịch bản | Kết quả mong đợi |
|---|---|---|---|
| DRG-01 | E | khoảng không dữ liệu (03/2027) | số 0, tỉ lệ `null`, `coDuLieu` `false`, xu hướng đủ điểm 0, chờ duyệt và khoản lỗi vẫn đúng |
| DRG-02 | I | ghi lại mọi câu SQL của một lần gọi | một giao dịch `READ ONLY`; chỉ `SELECT`; không mệnh đề khoá |
| DRG-03 | I | kết nối khác thêm lịch và giao dịch, commit giữa hai câu (cổng) | kết quả theo cùng một ảnh chụp |
| DRG-04 | E | quét khoá và chuỗi của phản hồi, log | chỉ khoá cho phép; không họ tên, SĐT, email, mã lịch; log không có số liệu |

### 7.6 Web Quản trị viên (DWB) — F1 (mức GỌN)

| Mã | Kịch bản | Kết quả mong đợi |
|---|---|---|
| DWB-01 | mở `/admin` | "Tổng quan"; một lời gọi với khoảng mặc định; mục thanh bên sáng |
| DWB-02 | đang tải; 500; mất mạng; quá giờ; bấm "Thử lại" | trạng thái đúng; gọi lại |
| DWB-03 | `coDuLieu` `false` | thông báo A1; số 0 và "—"; khối chờ duyệt còn |
| DWB-04 | đổi ngày rồi "Áp dụng"; thiếu, đảo, quá 366 ngày | gọi đúng tham số; lỗi tại chỗ, không gọi |
| DWB-05 | Toàn hệ thống và Chi nhánh | ô chi nhánh chỉ ở Toàn hệ thống; Chi nhánh không gửi `chiNhanhId` |
| DWB-06 | thẻ số với `phanTram` có và `null`; tiền lớn | hiện đúng số máy chủ trả, "x trên y", "—"; định dạng VND |
| DWB-07 | việc cần xử lý, hai loại Quản trị viên | đủ dòng, liên kết đúng đích (test khoá đường dẫn); Chi nhánh không có dòng rút tiền |
| DWB-08 | đổi bộ lọc liên tiếp, phản hồi cũ về sau | không đè kết quả mới |
| DWB-09 | 404 chi nhánh; 403 | thông báo và đường về; trang không đủ quyền |
| DWB-10 | mở URL có tham số; tải lại | bộ lọc khôi phục từ URL; tham số hỏng thì dùng mặc định |
| DWB-11 | bấm liên kết thay đổi chi nhánh | trang Thông tin phòng khám mở tab Chi nhánh; mở không tham số vẫn ở tab chung. Nếu dùng phương án lùi (T10): chỉ khẳng định liên kết tới trang, không tham số |

### 7.7 Biểu đồ (DBD) — F2

| Mã | Kịch bản | Kết quả mong đợi |
|---|---|---|
| DBD-01 | chuỗi D0; toàn 0; một điểm; 62 và 53 điểm | số cột đúng, chiều cao tỉ lệ, không chia cho 0 |
| DBD-02 | trình đọc màn hình và "Xem bảng số" | tên truy cập của biểu đồ; bảng đủ hàng, tiêu đề cột; mở đóng bằng bàn phím |
| DBD-03 | đơn vị ngày và tuần | nhãn đúng |
| DBD-04 | 375 px | trang không tràn ngang; bảng cuộn trong khung |

### 7.8 Lễ tân (DLT, DLW) — B3, F3 `[CẮT ĐƯỢC]`

| Mã | Loại | Kịch bản | Kết quả mong đợi |
|---|---|---|---|
| DLT-01 | E | mọi vai; Lễ tân bị khoá | 200 chỉ Lễ tân đang hoạt động; còn lại 401 hay 403 |
| DLT-02 | I | bộ D0 cho Lễ tân A, B | theo bảng 7.0 |
| DLT-03 | E | gửi `chiNhanhId` hay khoá khác; header | 400 `TRUONG_KHONG_DUOC_PHEP`; `no-store` |
| DLT-04 | I | đối chiếu với danh sách lịch hẹn hôm nay (lọc bốn trạng thái) và danh sách yêu cầu đổi lịch chờ của Lễ tân | bằng nhau |
| DLT-05 | I | đồng hồ giả qua nửa đêm, `TZ=UTC` | đổi ngày đúng |
| DLW-01 | W | đăng nhập Lễ tân | ở `/le-tan`, "Tổng quan" sáng |
| DLW-02 | W | số và liên kết | đủ năm số, hai liên kết đúng đích |
| DLW-03 | W | đang tải, lỗi, "Tải lại", toàn 0 | đúng trạng thái |
| DLW-04 | W | 375 px, bàn phím | không tràn ngang; tới được mọi liên kết |

### 7.9 Kiểm tay trình duyệt (DKT) — X2, F3 (125 phần trăm và 375 px; không dùng DB `clinix` khi chưa được Đại đồng ý)

DKT-01 Toàn hệ thống: đối chiếu ba số (lịch khám hôm nay, nghỉ phép chờ, rút tiền chờ) với trang lịch hẹn và trang duyệt; DKT-02 Quản trị viên Chi nhánh: không ô chi nhánh, không dòng rút tiền, số khớp trang lịch hẹn; DKT-03 125 phần trăm, 375 px, chỉ bàn phím, trình đọc màn hình đọc thẻ và bảng số; DKT-04 mất mạng rồi "Thử lại", đổi bộ lọc nhanh, tải lại trang giữ bộ lọc; DKT-05 (F3) Lễ tân đăng nhập, đối chiếu số với "Quản lý lịch hẹn" và "Yêu cầu đổi lịch". Mỗi ca ghi kết quả thật vào TRACKING mục 2.

## 8. Đề xuất gom cụm (chỉ đề xuất — nhóm chốt)

**Cụm 1:** B1, B2, X1 (máy chủ đã đo thật, 11,5 giờ). **Cụm 2:** F1, F2, X2 (dùng được và tổng kết, 10,5 giờ). **Cụm 3 (cắt được):** B3, F3 (4,5 giờ). Muốn thấy giao diện sớm thì làm F1 bằng API giả ngay sau B1.

## 9. Quy trình bắt buộc cho mỗi PR của scope

Theo `AGENTS.md` mục 5 và `CONTRIBUTING.md`: nhánh `feat/dashboard-…` do người dùng tạo, không làm trên `main`; viết test theo mã test case rồi code; chạy `lint`, `build`, `test` (và `test:int`, `test:e2e` cho task backend) ở máy và báo kết quả **thật**; task `[ĐỒNG BỘ TL]` cập nhật tài liệu trong **cùng PR** và nhắc việc Word ở 4.6; cập nhật `docs/features/dashboard/TRACKING.md` và tick ô; lối tắt vào `docs/TECH_DEBT.md`; ghi AI log theo người dùng; **không** `git add`, `commit`, `push` do AI; tiêu đề PR là commit cuối (squash), Conventional Commits, scope `dashboard` (hoặc `web`), ≤ 100 ký tự; PR cần Trung approve và CI xanh (bảy check bắt buộc). **Không đọc, in hay chép `.env` thật.**

## 10. Điều kiện hoàn thành scope (phần cam kết; hai dòng cuối chỉ khi làm phần Lễ tân)

- [ ] Use case chạy đúng b1 đến b4 và A1 trên dữ liệu mẫu, trừ chỉ số danh sách chờ (L1).
- [ ] Mọi mã test case DQP đến DBD đã chạy hoặc ghi rõ lý do hoãn ở TRACKING mục 2; DKT-01 đến DKT-04 có kết quả thật.
- [ ] Số trên dashboard khớp bảng tính tay của bộ D0 ở cả ba phạm vi.
- [ ] Đột biến 1 đến 11 và bốn loại web đều bị ít nhất một ca bắt.
- [ ] M1 đến M4 có số đo thật và kết luận; tiêu chí không đổi sau khi thấy số; chỉ mục (nếu thêm) có đồng ý của Đại và đồng bộ ba file `docs/database/*`.
- [ ] Không phụ thuộc mới, không bảng mới; không dữ liệu cá nhân trong phản hồi và log.
- [ ] `docs/TRACKING.md` có một dòng; nháp nợ gửi Đại; việc sửa văn bản (4.6) do Đại báo xong.
- [ ] CI xanh (bảy check), jscpd ≤ 3% (CI đo), 0 lỗi lint.
- [ ] (Lễ tân) DLT, DLW, DKT-05 Pass; đột biến 12 bị bắt; M5 đạt.
- [ ] (Lễ tân) 2.4 và 2.1_2.2 đã thêm tác nhân Lễ tân.

## Phụ lục A. Nguyên văn use case Xem thống kê & báo cáo vận hành (sao chép bằng script, không diễn giải)

Nguồn: `D:\du_lieu\TLCN_CLINIX\2.4_Dac_Ta_Use_Case_CLINIX.docx` (file gốc) và bản cùng tên trong `Drive_Hien_Tai`, đọc bằng `python-docx` ngày 26/11/2026; mỗi dòng trong ô Word giữ thành một đoạn. **Nội dung bảng ở hai bản trùng từng chữ; chỉ khác số use case.**

### 2.4.56. Use case Xem thống kê & báo cáo vận hành (bản `Drive_Hien_Tai`: 2.4.53)

**Mô tả.**

Cho phép Quản trị viên xem dashboard thống kê vận hành: tỷ lệ no-show, tỷ lệ sử dụng khung giờ, tỷ lệ chấp nhận lời mời waitlist, số liệu cọc/hoàn tiền, số lịch khám và ca hoàn thành trong ngày, biểu đồ xu hướng đăng ký khám, và danh sách yêu cầu đang chờ duyệt. Quản trị viên Toàn hệ thống xem toàn bộ; phạm vi Chi nhánh chỉ xem chi nhánh được gán.

**Tác nhân kích hoạt.**

Quản trị viên.

**Tiền điều kiện.**

Đã đăng nhập vai trò Quản trị viên.

**Hậu điều kiện.**

Thành công: Quản trị viên xem được dashboard/báo cáo phù hợp phạm vi quyền hạn và bộ lọc thời gian; không có thay đổi dữ liệu.

Thất bại: Không áp dụng (use case chỉ đọc).

**Các bước thực hiện.**

(1) Quản trị viên chọn chức năng "Xem thống kê & báo cáo vận hành".

(2) Hệ thống hiển thị bộ lọc khoảng thời gian (và chi nhánh nếu Toàn hệ thống).

(3) Quản trị viên chọn bộ lọc.

(4) Hệ thống tính toán và hiển thị dashboard: tỷ lệ no-show, tỷ lệ sử dụng khung giờ, tỷ lệ chấp nhận lời mời waitlist, số liệu cọc/hoàn tiền, số lịch khám và ca hoàn thành, biểu đồ xu hướng đăng ký khám, danh sách yêu cầu đang chờ duyệt.

**Luồng thay thế.**

A1. Không có dữ liệu trong khoảng thời gian đã chọn

4a. Hệ thống không có giao dịch/lịch hẹn nào trong khoảng thời gian đã chọn.

4b. Hệ thống hiển thị dashboard với giá trị 0/trống kèm thông báo tương ứng.

## Phụ lục B. Nguyên văn các use case và tài liệu chạm tới (chỉ phần liên quan; sao chép bằng script)

### 2.4.51. Use case Phê duyệt yêu cầu nghỉ phép (bản `Drive_Hien_Tai`: 2.4.48)

**Mô tả.**

Cho phép Quản trị viên duyệt hoặc từ chối yêu cầu nghỉ phép của bác sĩ. Nếu duyệt: mọi lịch hẹn trong khung giờ nghỉ đều tự động huỷ; Chờ thanh toán không hoàn tiền (chưa thanh toán), Đã xác nhận hoàn 100% số tiền đã cọc vào ví (lỗi không thuộc về bệnh nhân); bệnh nhân liên quan được thông báo.

**Tiền điều kiện.**

Đã đăng nhập vai trò Quản trị viên, có thẩm quyền phê duyệt yêu cầu của bác sĩ đó (thuộc phạm vi quản trị).

Có ít nhất một yêu cầu nghỉ phép đang ở trạng thái Chờ duyệt.

**Luồng thay thế.**

A1. Không có yêu cầu nào đang Chờ duyệt

1a. Hệ thống không tìm thấy yêu cầu nào Chờ duyệt trong phạm vi quản trị.

1b. Hệ thống hiển thị danh sách trống.

### 2.4.31. Use case Xử lý yêu cầu đổi lịch ngoài chính sách (bản `Drive_Hien_Tai`: 2.4.30)

**Mô tả.**

Cho phép Lễ tân (trong phạm vi chi nhánh được gán) và Quản trị viên (trong phạm vi quản trị của mình) xem danh sách yêu cầu đổi lịch ngoài chính sách đang chờ (phát sinh khi Bệnh nhân vượt số lần tự đổi cho phép), duyệt hoặc từ chối kèm ghi chú xử lý bắt buộc; khi duyệt, giữ khung giờ mới trước, chỉ chuyển lịch cũ sang Đã đổi lịch khi khung giờ mới chắc chắn thành công.

**Tiền điều kiện.**

Đã đăng nhập vai trò Lễ tân hoặc Quản trị viên.

Với Lễ tân: yêu cầu thuộc chi nhánh mình được gán.

Với Quản trị viên: yêu cầu thuộc phạm vi quản trị của mình (Toàn hệ thống xem tất cả; Chi nhánh chỉ xem chi nhánh được gán).

Có ít nhất một yêu cầu đổi lịch ngoài chính sách đang ở trạng thái Chờ duyệt.

### 2.4.53. Use case Xử lý rút tiền, hoàn tiền đặc biệt & nạp ví chưa cộng (bản `Drive_Hien_Tai`: 2.4.50)

**Mô tả.**

Cho phép Quản trị viên hoàn tiền cho trường hợp đặc biệt ngoài luồng tự động, bao gồm duyệt hoặc từ chối yêu cầu rút tiền từ ví của Bệnh nhân (use case "Yêu cầu rút tiền từ ví"); không tự động chuyển khoản ra ngân hàng thật. Ngoài ra cho phép Quản trị viên xử lý thủ công giao dịch nạp tiền vào ví đã được CLINIX xác minh Thành công nhưng chưa cộng vào ví và đã hết số lần tự động thử lại của đối soát (use case "Đối soát giao dịch thanh toán"): xem giao dịch, kiểm tra chưa được cộng trước đó, rồi cộng ví đúng một lần hoặc ghi nhận lý do chưa thể xử lý; thao tác này không phải hoàn tiền và không phải duyệt rút tiền. Mọi thao tác đều bắt buộc ghi Audit Log.

**Tiền điều kiện.**

Đã đăng nhập vai trò Quản trị viên.

Có ít nhất một yêu cầu rút tiền đang ở trạng thái Chờ duyệt, một trường hợp cần hoàn tiền ngoài luồng tự động, hoặc một giao dịch nạp ví đã xác minh Thành công nhưng chưa cộng ví và đã hết số lần tự động thử lại của đối soát.

### 2.4.45. Use case Quản lý chi nhánh / cơ sở (bản `Drive_Hien_Tai`: 2.4.42)

**Mô tả.**

Cho phép Quản trị viên thêm chi nhánh mới (chỉ phạm vi Toàn hệ thống) hoặc cập nhật chi nhánh: tên, địa chỉ, toạ độ, lịch hoạt động theo từng thứ trong tuần (mỗi thứ là ngày hoạt động với tối đa hai khoảng nhận khám là buổi sáng và buổi chiều, mỗi khoảng có giờ bắt đầu – giờ kết thúc và có thể không tồn tại, hoặc ngày nghỉ không có khoảng nào; giờ mở – đóng chung chỉ để hiển thị, suy ra từ các khoảng; chưa có lịch nghỉ lễ), dịch vụ khả dụng. Thay đổi lịch hoạt động hoặc bỏ một dịch vụ khả dụng mà ảnh hưởng lịch hẹn Chờ thanh toán/Đã xác nhận đã đặt phải đi đúng thứ tự: đề xuất → hệ thống kiểm tra lịch hẹn bị ảnh hưởng → Quản trị viên Toàn hệ thống phê duyệt → thông báo (trong ứng dụng và email) cho bệnh nhân bị ảnh hưởng, trước thời điểm có hiệu lực → thay đổi chỉ được áp dụng tại thời điểm có hiệu lực, không áp dụng ngay khi gửi hay khi duyệt. Số ngày thông báo trước do Quản trị viên Toàn hệ thống cấu hình (use case "Cập nhật cấu hình hệ thống").

### 2.4.42. Use case Cập nhật cấu hình hệ thống (bản `Drive_Hien_Tai`: 2.4.39)

**Mô tả.**

Cho phép Quản trị viên phạm vi Toàn hệ thống thiết lập các thông số cấu hình vận hành của hệ thống: thời gian giữ chỗ, thời điểm nhắc lịch (các mốc số giờ trước giờ hẹn), khung giờ cho phép tiếp đón (check-in: số phút trước và số phút sau giờ hẹn mà Lễ tân còn được chuyển lịch hẹn sang Đã tiếp đón; giá trị: [cần điền]), số lịch hẹn đang hoạt động tối đa của mỗi hồ sơ đi khám (bản thân hoặc từng hồ sơ người thân được tính riêng; giá trị: [cần điền]), số lần tự đổi lịch tối đa cho mỗi lịch hẹn, thời hạn phản hồi lời mời danh sách chờ, số mục chờ tối đa mỗi bệnh nhân, ngưỡng no-show (số lần no-show mới đạt hoặc vượt ngưỡng thì khoá quyền tự đặt lịch trực tuyến; mức 3 lần là [đề xuất]), số ngày thông báo trước cho bệnh nhân bị ảnh hưởng khi thay đổi lịch hoạt động hoặc dịch vụ khả dụng của chi nhánh có hiệu lực (giá trị: [cần điền]), trọng số w1/w2 khi gợi ý bác sĩ. Thời lượng khung giờ không cấu hình riêng mà lấy theo thời lượng của dịch vụ khám; thời gian đặt trước không bị giới hạn bởi một số ngày cố định mà do lịch làm việc bác sĩ đã được công bố tới đâu. Mọi thay đổi cấu hình được ghi vào Audit Log (giá trị trước – sau và lý do) trong cùng một giao dịch.

### 2.4.33. Use case Tự động đánh dấu vắng mặt quá giờ hẹn (bản `Drive_Hien_Tai` không có use case riêng cùng tên)

**Mô tả.**

Tác vụ nền: khi ca làm việc chứa giờ hẹn đã kết thúc mà lịch hẹn vẫn Đã xác nhận (chưa chuyển Đã tiếp đón — do bệnh nhân chưa tới, hoặc có tới nhưng chưa hoàn tất "Thanh toán offline tại quầy"/"Cập nhật trạng thái lịch hẹn"), hệ thống tự động chuyển lịch hẹn sang Vắng mặt, không phân biệt dịch vụ có cọc hay không.

### 2.4.67. Use case Cộng dồn no-show & khóa đặt lịch (bản `Drive_Hien_Tai` không có use case riêng cùng tên)

**Mô tả.**

Cộng dồn số lần vắng mặt (no-show); khoá quyền tự đặt lịch trực tuyến khi số lần no-show mới đạt hoặc vượt ngưỡng cấu hình (≥ N; mức 3 lần là [đề xuất]) (không ảnh hưởng trạng thái tài khoản, không chặn đăng nhập); gửi cảnh báo khi khoá.

### 2.4.60. Use case Tính khung giờ khám còn trống (bản `Drive_Hien_Tai` không có use case riêng cùng tên)

**Mô tả.**

Tác vụ tính toán dùng chung, xác định danh sách khung giờ khám còn trống của một bác sĩ theo dịch vụ đã chọn, dựa trên lịch làm việc theo chi nhánh và lịch hoạt động theo thứ của chi nhánh (chi nhánh nghỉ ngày nào thì không có khung giờ nào ngày đó; ca sáng chỉ có khung giờ trong khoảng nhận khám buổi sáng, ca chiều trong khoảng buổi chiều, mỗi khung giờ cộng thời lượng dịch vụ phải nằm trọn trong khoảng, không xuyên giờ nghỉ trưa; các khung giờ trong một khoảng nối liền nhau theo thời lượng dịch vụ (khung đầu bắt đầu đúng giờ bắt đầu khoảng, khung sau bắt đầu đúng lúc khung trước kết thúc), phần dư cuối khoảng không đủ một khung thì không có khung giờ); loại trừ khung giờ đã Đã đặt, Đang giữ chỗ, hoặc trùng lịch nghỉ đã duyệt. Dùng chung cho tra cứu, đặt lịch, và chạy thêm khi gợi ý AI cần hiển thị giờ trống.

**Các bước thực hiện.** (trích)

(3) Hệ thống loại trừ các khung giờ đã Đã đặt, Đang giữ chỗ, trùng thời gian nghỉ phép đã duyệt, rơi vào ngày chi nhánh nghỉ, hoặc không nằm trọn (từ giờ bắt đầu đến hết thời lượng dịch vụ) trong khoảng nhận khám tương ứng với ca của chi nhánh vào ngày đó (ngoài khoảng, xuyên giờ nghỉ trưa hoặc kết thúc sau giờ kết thúc của khoảng).

### 2.4.66. Use case Hoàn tiền tự động (bản `Drive_Hien_Tai` không có use case riêng cùng tên)

**Mô tả.**

Hoàn cọc về ví theo chính sách khi hủy hợp lệ (% giảm dần theo thời điểm hủy) hoặc theo quyết định nghỉ phép của bác sĩ (hoàn 100%); không hoàn tiền mặt. Lưu lịch sử mọi lần hoàn tiền kể cả thất bại và thử lại; thông báo khi xong, thất bại thì ghi nhận cho Quản trị viên.

**Luồng thay thế.**

A1. Cộng tiền vào ví thất bại (lỗi hệ thống tạm thời)

2a. Hệ thống gặp lỗi khi cố cộng tiền vào ví.

2b. Hệ thống ghi lịch sử hoàn tiền Thất bại, tự động thử lại tối đa 3 lần, cách nhau 5 phút mỗi lần.

2c. Nếu vẫn thất bại sau 3 lần thử lại: hệ thống ghi nhận cho Quản trị viên xử lý thủ công (use case "Xử lý rút tiền, hoàn tiền đặc biệt & nạp ví chưa cộng").

### 1.2.1 Yêu cầu chức năng (`1.2.1_Yeu_Cau_Chuc_Nang.docx`)

Hàng 26, use case "Xem thống kê & báo cáo vận hành", loại "Tra cứu, Tính toán, Kết xuất":

- Dashboard: tỷ lệ no-show, tỷ lệ sử dụng khung giờ, tỷ lệ chấp nhận lời mời, số liệu cọc/hoàn tiền, số lịch khám và ca hoàn thành trong ngày.

- Biểu đồ xu hướng đăng ký khám và danh sách yêu cầu đang chờ duyệt.

Ghi chú: Toàn hệ thống xem toàn bộ; phạm vi Chi nhánh chỉ xem chi nhánh được gán.

### 1.3 Quy trình tác nghiệp (`1.3_Quy_Trinh_Tac_Nghiep_CLINIX.docx`, câu cuối đoạn quản trị)

Quản trị viên tra cứu nhật ký theo người thực hiện, loại hành động, đối tượng và khoảng thời gian, đồng thời xem bảng thống kê vận hành (tỷ lệ no-show, tỷ lệ sử dụng khung giờ, tỷ lệ chấp nhận lời mời danh sách chờ, số liệu cọc và hoàn tiền, số lịch khám và ca hoàn thành, xu hướng đăng ký khám); Quản trị viên Toàn hệ thống xem toàn bộ, còn Quản trị viên phạm vi Chi nhánh chỉ xem chi nhánh được gán.

### Bảng phân loại phạm vi (`Phan_Loai_Pham_Vi_Chuc_Nang_TLCN_KLTN_v1.docx`, M24)

M24. Dashboard & Báo cáo vận hành (TLCN CORE): Tổng hợp tỷ lệ no-show, tỷ lệ sử dụng khung giờ, tỷ lệ chấp nhận lời mời waitlist, số liệu cọc/hoàn tiền, số ca trong ngày, biểu đồ xu hướng đăng ký khám và danh sách yêu cầu đang chờ duyệt, theo phạm vi quản trị.

### Phạm vi thực hiện (bản dự thảo 26/11/2026, `Pham_Vi_Thuc_Hien_CLINIX_2026-11-26.md`, nhóm F-4 và F-5)

**F-4** (**Ngoài phạm vi** [đề xuất: để dành Khóa luận]; mục tiêu 2): Danh sách chờ (mời tuần tự khi có khung giờ trống).

**F-5** (**Cam kết** [đề xuất]; mục tiêu 3): **Xem thống kê và báo cáo vận hành (dashboard):** một màn hình chỉ đọc cho Quản trị viên, có bộ lọc khoảng thời gian (và chi nhánh nếu là Toàn hệ thống): tỉ lệ vắng mặt (no-show), tỉ lệ sử dụng khung giờ, số liệu cọc và hoàn tiền, số lịch khám và ca hoàn thành trong ngày, biểu đồ xu hướng đăng ký khám, danh sách yêu cầu đang chờ duyệt. Chỉ số "tỉ lệ chấp nhận lời mời danh sách chờ" của đặc tả bị bỏ cùng F-4.
