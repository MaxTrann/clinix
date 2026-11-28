# Kế hoạch scope `dashboard`: Dashboard và báo cáo vận hành

> **Trạng thái: bản nháp 1 (26/11/2026). Đại đã trả lời trực tiếp 14 câu Q1 đến Q14** (bốn hộp câu hỏi trong phiên lập kế hoạch): 12 câu theo đề xuất; **hai câu chọn khác: Q9 (Lễ tân có dashboard rút gọn) và Q12 (tách theo trạng thái)**; Q14 xếp phần Lễ tân là **phần cắt được**. Điểm kỹ thuật T1 đến T13 (mục 4.3) **đã được phiên kiểm độc lập duyệt kỹ thuật** ngày 26/11/2026 theo ủy quyền của Đại (không phải quyết định sản phẩm hay schema). PR kế hoạch đã merge (#745, squash `8e2d91b`); **issue đã tạo** (Epic #746, #747 đến #754; mục 6.6).
> **Bản nháp 2 (28/11/2026): MỞ RỘNG thêm trang "Tổng quan" cho Lễ tân, Bác sĩ và Bệnh nhân.** Văn bản Phạm vi nộp ngày 27/11/2026 ghi nhóm F-5 là "Trang Tổng quan cho từng vai trò (chỉ đọc)", **Cam kết**, và đặt ba trang này **đứng đầu danh sách cắt** (mục 9 của văn bản đó). **Đại trả lời trực tiếp Q15 đến Q21 ngày 28/11/2026 qua hai hộp câu hỏi: cả bảy câu theo đề xuất** (mục 4.2). Phần Quản trị viên (B1, B2, X1, F1, F2, X2) **không đổi về nội dung và giờ, chỉ đổi người làm** (Q22, 28/11/2026: Đại giao CẢ scope cho Trung, Đại chỉ review). Phần mở rộng: **5 task, 11,5 giờ** (B3 và F3 đã có issue #753, #754; F4, F5, X3 cần tạo) ở mục 5.15 đến 5.19, 6, 7.10 đến 7.12, 10 và Phụ lục C (nháp use case để Đại chép vào Word 2.4 trước 01/12/2026). T14 đến T21 (4.3) **đã được phiên kiểm độc lập duyệt kỹ thuật ngày 28/11/2026** (theo ủy quyền của Đại), kèm một chỗ sửa chữ về B1 (**B1 chưa merge**, B3 phụ thuộc B1 giữa hai người) và hai lưu ý. Số `Q`, `T`, `L`, `MH`, `R` cũ giữ nguyên.
> **Người LÀM: cả scope (11 task: B1, B2, X1, F1, F2, X2, B3, F3, F4, F5, X3) do Trung (`junUTE`) làm, Đại (`MaxTrann`) review** (Q22, 28/11/2026; bản nháp 1 ghi Đại làm, Trung review; Đại chuyển sang bài viết và cẩm nang F-6). Điểm chạm file của module khác gắn thẻ `[ĐỤNG …]`; người review approve PR tài liệu coi là xác nhận các điểm chạm đó.
> Kế hoạch lập theo [`docs/FEATURE_PLANNING_PROMPT.md`](../../FEATURE_PLANNING_PROMPT.md) và nếp PLAN [`chatbot`](../chatbot/PLAN.md). **Phiên lập kế hoạch này KHÔNG sửa `AI_USAGE_LOG.md` và `docs/TECH_DEBT.md`** (bản nháp ở [`TRACKING.md`](TRACKING.md) mục 4).
> Đã kiểm mã thật trên `origin/main` ở **`1cc0099`** (26/11/2026); đối chiếu lại tới **`c61d4f6`**: `f931e6e` (PR 744, đổi lịch X3, chỉ tài liệu) và `c61d4f6` (PR 743, chat B1: thêm `apps/api/src/chat/` và `ChatModule` ở `app.module.ts`; không đổi schema; trong các file kế hoạch chạm chỉ có `app.module.ts` đổi). Chỗ nào ghi **"chưa đo"** hay **"chưa kiểm"** là suy ra từ mã hay tài liệu, **chưa chạy thử**. Phiên này **không chạy** `npm`, test, build, Docker hay MySQL, **không đọc** `.env` thật, và chỉ tạo hai file mới `docs/features/dashboard/PLAN.md`, `TRACKING.md`. **Bản nháp 2 (28/11/2026)** đối chiếu thêm `origin/main` ở **`4c80486`** (đọc `apps/web/src/{router,features,shared}`, `apps/api/src/{appointments,doctor,wallet,notification,chat,rbac}`, mã Figma Make, use case 2.4 ở hai file Word bằng `python-docx`); cũng **chưa chạy thử**, không `npm`, test, build, Docker, MySQL, không đọc `.env`; chỉ sửa hai file này.
> **Mã mới nằm trong `apps/api/src/dashboard/` và `apps/web/src/features/dashboard/`**; scope commit `dashboard` (thêm vào `commitlint.config.cjs` ở B1, T1).
>
> **Bốn điều phải đọc trước:**
> 1. **Chỉ số "tỉ lệ chấp nhận lời mời danh sách chờ" của đặc tả BỊ BỎ** vì danh sách chờ chuyển sang Khóa luận (văn bản Phạm vi nhóm F-4). Use case 2.4 vẫn ghi chỉ số đó (mục 3.3, L1).
> 2. **Cam kết F-5: phần Quản trị viên (6 task, 22 giờ) và, từ bản nháp 2, ba trang Tổng quan Lễ tân, Bác sĩ, Bệnh nhân (5 task, 11,5 giờ)**, **cả hai do Trung làm (Q22; tổng 33,5 giờ)**, xong chậm nhất 21/12 (Q11). Phạm vi 27/11 xếp ba trang này **đứng đầu danh sách cắt**: trượt giờ thì cắt trước, theo thứ tự Bệnh nhân, Bác sĩ, Lễ tân (Q21). Q14 cũ ("Lễ tân cắt được, ngoài cam kết") **được thay** (L11).
> 3. **Lịch chặt:** từ Q22, **Trung làm cả scope 33,5 giờ** trước hạn 21/12 trong khi còn chat X1 đến X3, thông báo X3 và vài việc payment; giờ rảnh của Trung ở Iteration 9 và 10 `[cần điền]` (R14, mục 6.4). Đại chỉ review (khoảng 5,5 giờ cho 11 PR). Các câu của bản nháp 1 về giờ của Đại và chatbot không còn áp dụng cho scope này.
> 4. **Văn bản Phạm vi (hạn nộp 16:46 ngày 27/11/2026) đang ghi mốc nội bộ 14/12 cho nhóm F, gồm F-5.** Theo Q11 mốc của F-5 là chậm nhất 21/12: **phải sửa ở bản Phạm vi trước khi nộp** (phiên kiểm độc lập nhận sửa; mục 4.6).

## 0. Quy ước đọc

- Use case duy nhất: **Xem thống kê & báo cáo vận hành** (2.4.56 ở file gốc, 2.4.53 ở `Drive_Hien_Tai`; **tìm theo TÊN**, dự án không dùng Use Case ID). Nội dung bảng use case ở hai file **trùng từng chữ** (so bằng `diff` ngày 26/11/2026). Nguyên văn ở **Phụ lục A**, use case và tài liệu liên quan ở **Phụ lục B** (sao chép bằng script).
- **Chữ trong ngoặc kép cong “…” là trích nguyên văn từ 2.4.** Chữ giao diện đề xuất đặt trong ngoặc kép thẳng.
- `b4` = bước (4); `A1/4b` = luồng thay thế A1, mục 4b; "MT" = Mô tả; "TĐK" = tiền điều kiện; "HĐK" = hậu điều kiện.
- Tiền tố mã test (quét `git grep` trên `origin/main` ngày 26/11/2026: chưa ai dùng): **DQP** quyền và phạm vi; **DBL** bộ lọc; **DVM** vắng mặt; **DKG** khung giờ; **DHN** hôm nay và tổng trong khoảng; **DCD** chờ duyệt; **DCH** cọc và hoàn; **DXH** xu hướng; **DRG** rỗng, nhất quán, riêng tư; **DWB** web Quản trị viên; **DBD** biểu đồ; **DLT** API Lễ tân; **DLW** web Lễ tân; **DKT** kiểm tay; **DNV** điều hướng và trang mở đầu của ba vai trò, **DBS** web Bác sĩ, **DBN** web Bệnh nhân (ba tiền tố mới của bản nháp 2; quét `git grep` trên `origin/main` ngày 28/11/2026: chưa ai dùng). Không dùng `DSB` (booking đã dùng).
- Nguồn đúng khi lệch nhau: **schema DB (`docs/database/`) để code**; chỗ 2.4, 1.2.1, 1.3, Figma và mã lệch nhau ở mục 3.3. Figma chỉ là bản phác thảo: **không đề xuất đồng bộ lại**.
- Thẻ: `[ĐỒNG BỘ TL]` = hành vi khác chữ tài liệu gốc, trong PR cập nhật PLAN, TRACKING và nhắc việc sửa Word ở 4.6; `[CHỜ X1]` = chờ số đo; `[CHỜ Đại]` = cần Đại làm hay cho phép khi chạy; `[ĐỤNG x]` = sửa file thuộc module hay vùng x (`[ĐỤNG admin]`, `[ĐỤNG router]`, `[ĐỤNG database]` là `app.module.ts`, `[ĐỤNG docker]` là `commitlint.config.cjs`, `[ĐỤNG auth]`, `[ĐỤNG patient]` là test chuyển hướng); `[SOẠN TRƯỚC]` = viết được ngay nhưng **chưa merge** khi phụ thuộc chưa có; `[CẮT ĐƯỢC]` = **nằm trong cam kết nhưng đứng đầu danh sách cắt** (Phạm vi 27/11, mục 9; thứ tự cắt ở Q21). Bản nháp 1 ghi "ngoài cam kết, chỉ làm nếu còn giờ": đã đổi ở L11.
- Mỗi task = **một PR** nhỏ, **chỉ backend HOẶC chỉ frontend** (X là đo, kiểm, tài liệu). Mức kiểm: **ĐB** = đơn vị, tích hợp MySQL thật, e2e và **đột biến mục tiêu** (quyền, phạm vi, công thức, tiền); **THƯỜNG** = đơn vị, tích hợp, e2e; **GỌN** = web (đột biến bốn loại của 5.14; không chạy tay jscpd và gitleaks, CI đo).
- `[đề xuất]` = giá trị AI tự đề xuất, chưa chốt; `[cần điền]` = thiếu thông tin. **Mục 4.4 liệt kê lại cả hai loại.**
- **Mã task trùng** với mã của module khác (B1, F1, X1…): khi nhắc ngoài file này viết **"dashboard B1"**.

## 1. Phạm vi

**Làm:**

| Phần | Tác nhân | Việc chính | Đường vào | Mức cam kết |
|---|---|---|---|---|
| **Tổng quan của Quản trị viên** (use case 2.4) | Quản trị viên Toàn hệ thống, Chi nhánh | Bộ lọc khoảng ngày (và chi nhánh nếu Toàn hệ thống); tỉ lệ vắng mặt; tỉ lệ sử dụng khung giờ; cọc, đã hoàn, khoản hoàn đang lỗi; lịch khám và ca hoàn thành hôm nay và trong khoảng; biểu đồ xu hướng đăng ký khám; yêu cầu đang chờ duyệt; trạng thái rỗng (A1) | `/admin` (mục "Tổng quan" đã trỏ vào đây) | **Cam kết** (F-5) |
| **Tổng quan rút gọn của Lễ tân** (Q9, Q12, Q13, Q15) | Lễ tân | Hôm nay, chi nhánh của mình: lịch khám, chờ tiếp đón, đã tiếp đón, hoàn thành, vắng mặt; số yêu cầu đổi lịch đang chờ và liên kết | `/le-tan` thành trang mở đầu | **Cam kết, đứng đầu danh sách cắt** (`[CẮT ĐƯỢC]`, L11; cắt sau cùng trong ba trang) |
| **Tổng quan của Bác sĩ** (Q16, Q18) | Bác sĩ | Hôm nay, chỉ lịch của chính mình: lịch hôm nay tách trạng thái, ca kế tiếp, ca làm việc hôm nay, yêu cầu nghỉ phép đang chờ; đường vào Lịch hẹn và Lịch làm việc | `/bac-si-portal` thành trang mở đầu | **Cam kết, đứng đầu danh sách cắt** (`[CẮT ĐƯỢC]`; cắt thứ hai trong ba trang) |
| **Tổng quan của Bệnh nhân** (Q17, Q18) | Bệnh nhân | Chỉ lịch và ví của mình: lịch sắp tới (số và tối đa 3 lịch gần nhất, nhắc chờ thanh toán), số dư ví khả dụng và đang giữ; nút "Đặt lịch khám" | `/benh-nhan` thành trang mở đầu | **Cam kết, đứng đầu danh sách cắt** (`[CẮT ĐƯỢC]`; cắt **đầu tiên** trong ba trang) |

**Không làm (ghi rõ):**
- Chỉ số **tỉ lệ chấp nhận lời mời danh sách chờ** (F-4).
- **Bảng mới, bảng tổng hợp sẵn, bộ nhớ đệm, tác vụ nền** tính số liệu; **chỉ mục mới** khi chưa đo (Q10).
- **Thư viện biểu đồ** (Q8).
- So sánh kỳ trước, xuất tệp (CSV, PDF), nút chọn nhanh kỳ, lọc theo dịch vụ, chuyên khoa hay bác sĩ, doanh thu, tiền mặt tại quầy, hàng đợi "nạp ví chưa cộng", số bệnh nhân bị khoá đặt lịch: **làm sau** (6.5), không tạo issue.
- Cho ba trang Tổng quan của **Lễ tân, Bác sĩ, Bệnh nhân**: biểu đồ, bộ lọc ngày, so sánh kỳ trước, xuất tệp, lịch sử khám, thẻ tin nhắn hay thông báo chưa đọc (đã có huy hiệu ở menu, Q20), lịch của người khác, ghi dữ liệu, **API mới cho Bác sĩ và Bệnh nhân** (chỉ ghép API đã có, Q19; mục 5.15 đến 5.19). Bản nháp 1 ghi "không làm dashboard cho Bác sĩ và Bệnh nhân": đổi theo Phạm vi 27/11 (L11).
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
- Web chỉ import `shared/` và `features/auth`, `features/admin` **qua `index.ts`**; không import `features/booking`, `doctor`, `wallet`; `router/` ghép route. **Ba trang Tổng quan Lễ tân, Bác sĩ, Bệnh nhân (bản nháp 2) chỉ import `shared/` và `features/auth`** (không `features/admin`, `booking`, `doctor`, `wallet`, `patient`, `chat`, `notification`; T15).

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
| Mở rộng (28/11/2026): trang mở đầu ba vai trò | `index` của ba khung là **chuyển hướng tạm** (`<Navigate replace>`): Bệnh nhân tới Hồ sơ người khám, Bác sĩ tới Lịch làm việc, Lễ tân tới Tra cứu bệnh nhân; chú thích trong mã ghi "Chưa có Tổng quan" (Q21e của patient: "cho tới khi có Tổng quan") | `router/role-routes.tsx` dòng 56 đến 59, 84 đến 88, 108 đến 112; `docs/features/patient/PLAN.md` Q21e |
| Mở rộng: menu "Tổng quan" | mục đầu của `PATIENT_NAV`, `RECEPTION_NAV`, `DOCTOR_NAV` **không có `to`** nên là nút vô hiệu "Chưa được triển khai"; `RoleNavItem` có sẵn `end` (chỉ sáng ở đúng đường dẫn) cho đúng việc này | `router/role-nav.ts`, `shared/ui/role-shell.tsx` (ca `role-shell.test.tsx` đã khoá mục "Tổng quan" có `end`) |
| Mở rộng: test đang khoá chuyển hướng cũ | `PL-01`, `PL-09` (`router/role-routes.test.tsx`), `WK-01`, `WK-02` (`router/doctor-shell.test.tsx`), `DAR-06` (`router/doctor-appointments-route.test.tsx`), `LANDING_PATHS`, `LP-107` và bước đợi nút "Chỉnh sửa" (`features/auth/login/login-page.test.tsx`), `AU-65` và một ca ở dòng 328 (`features/auth/auth-routes.test.tsx`); danh sách dự kiến, **kiểm lại bằng `git grep` lúc làm** | `apps/web/src/router`, `features/auth` |
| Mở rộng: API đã có cho Lễ tân | `GET /reception/appointments` chỉ trả `{ items, total, page, pageSize }`; ca `DSV-13` khoá **đúng bốn khoá, không `demTheoTrangThai`**; `GET /reception/reschedule-requests` trả `total` (mặc định `ChoDuyet`) | `appointments/lists/operations-appointments.dto.ts`, `appointments/reschedule/reschedule-request-list.dto.ts` |
| Mở rộng: API đã có cho Bác sĩ | `GET /doctor/appointments` nhận `tuNgay`, `denNgay`, `trangThai[]`, `sapXep` (`MoiNhat`, `CuNhat`), `pageSize` tới 100, trả thêm **`demTheoTrangThai` đủ sáu khoá, tính trên mọi bộ lọc TRỪ `trangThai[]`**; `GET /doctor/schedule?tuNgay&denNgay` trả `ca[]` có `soLichHen`, `batDau`, `ketThuc`, `nghiPhep`; `GET /doctor/leave-requests?trangThai=ChoDuyet` trả `total`. Cả ba `@Roles('BacSi')`, `bac_si_id` từ token, `no-store` | `appointments/lists/doctor-appointments.*`, `doctor/schedule-view/`, `doctor/leave-requests/` |
| Mở rộng: API đã có cho Bệnh nhân | `GET /patient/appointments?nhom=SapToi` (sắp theo `thoi_gian` tăng; `SapToi` = `ChoThanhToan`, `DaXacNhan`, `DaTiepDon`) trả `total`, `items` có `hanThanhToan` và `demTheoTrangThai`; `GET /patient/wallet` trả `soDuKhaDung`, `soTienDangGiu`. Cả hai `@Roles('BenhNhan')`, chủ sở hữu từ token, `no-store` | `appointments/lists/patient-appointments.*`, `wallet/balance/` |
| Mở rộng: chỉ mục cho các câu hôm nay | `lich_hen_index_9 (benh_nhan_id, trang_thai, thoi_gian)` và `lich_hen_index_10 (bac_si_id, thoi_gian)` phục vụ hai danh sách trên; **Lễ tân chỉ có `lich_hen_index_chi_nhanh_benh_nhan (chi_nhanh_id, benh_nhan_id)`**, không dẫn đầu bằng `thoi_gian` (cùng điểm với 5.10 dòng (1), (3)) | `docs/database/clinix_mysql.sql` dòng 687 đến 697 |
| Mở rộng: quy tắc import ở web | `features/*` **không import chéo** nhau (mỗi module có `architecture.test.ts` và `index.ts` là bề mặt công khai: chỉ xuất mảng route và vài hằng); đường dẫn dùng chung nằm ở `shared/routes/` (`booking-paths`, `wallet-paths`, `chat-paths`, `notification-paths`); số chưa đọc do `router/role-shells.tsx` thăm dò một lần rồi điền huy hiệu menu | `apps/web/src/features/*/index.ts`, `shared/routes/` |
| Mở rộng: module chat, thông báo | trên `origin/main` `4c80486` chat F1 đến F6, B1 đến B6 và D1 **đã merge**; còn X1, X2, X3 (đo, kiểm, tài liệu) và thông báo X3: **không còn task sửa `router/`** của hai module này (kiểm bằng `gh pr list` và `docs/features/chat/TRACKING.md` mục 7) | `gh pr list --state all`, chat TRACKING |
| Mở rộng: Figma Make của ba vai trò | `ReceptionistDashboard` (bốn thẻ, danh sách lịch hôm nay, việc cần làm), `DoctorDashboard` (bốn thẻ, ca hôm nay, "Yêu cầu nghỉ gần nhất", "Việc cần chú ý"), `PatientDashboard` (bốn thẻ, lịch sắp tới, biểu đồ lịch sử khám 6 tháng); dữ liệu giả cục bộ, **không có doanh thu** ở ba vai trò | `THIET_KE_UI/Figma_Make_Sync/source_snapshot/src/app/pages/{receptionist,doctor,patient}` |

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
| Route `index` của `/bac-si-portal`, `/benh-nhan` và menu Bác sĩ, Bệnh nhân (F4, F5; bản nháp 2) | bỏ hai chuyển hướng tạm, bật "Tổng quan" (`end`) `[ĐỤNG router]` `[ĐỤNG auth]` `[ĐỤNG patient]` | test đăng nhập, khung Bác sĩ, danh sách lịch hẹn Bác sĩ đang mong chuyển hướng cũ phải sửa trong cùng PR của vai đó |
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
| L2 | Tác nhân kích hoạt: “Quản trị viên.” | thêm bản rút gọn cho Lễ tân (nay **Cam kết**, đứng đầu danh sách cắt; L11) | LỆCH | Q9, Q14 (thay bởi Phạm vi 27/11), Q21 | `[ĐỒNG BỘ TL]` Phụ lục C |
| L3 | MT “trong ngày”, b4 không ghi "trong ngày" | thẻ "Hôm nay" **và** tổng trong khoảng | LÀM RÕ | Q4 | `[ĐỒNG BỘ TL]` |
| L4 | “số liệu cọc/hoàn tiền” không định nghĩa | cọc ví thành công; đã hoàn vào ví; khoản đang lỗi; theo ngày giao dịch; không tiền mặt | LÀM RÕ | Q3 | `[ĐỒNG BỘ TL]` |
| L5 | “danh sách yêu cầu đang chờ duyệt” | số lượng và liên kết theo bốn loại, không liệt kê từng yêu cầu; Chi nhánh không thấy rút tiền | LÀM RÕ | Q6 | `[ĐỒNG BỘ TL]` |
| L6 | b2 “bộ lọc khoảng thời gian” không giới hạn | mặc định 30 ngày, tối đa 366 | LÀM RÕ | Q7 | `[ĐỒNG BỘ TL]` |
| L7 | A1 “không có giao dịch/lịch hẹn nào” | cờ `coDuLieu` (5.6); danh sách chờ duyệt vẫn hiện | LÀM RÕ | MH2 | — |
| L8 | 1.2.1 xếp loại "Tra cứu, Tính toán, Kết xuất" | "Kết xuất" hiểu là hiển thị; không xuất tệp | LÀM RÕ `[đề xuất]` | 1.2.1, 2.4 không có bước xuất tệp | Đại xác nhận khi review |
| L9 | Phạm vi mục 8: mốc nội bộ nhóm F 14/12 | F-5 xong chậm nhất 21/12 | LỆCH | Q11 | Đại sửa văn bản Phạm vi (4.6) |
| L10 | Figma: doanh thu, so sánh kỳ trước, lọc dịch vụ, danh sách chờ, biểu đồ Recharts | không làm | LỆCH (Figma là phác thảo) | Q8, 6.5 | không đồng bộ Figma |
| L11 | Phạm vi 27/11, nhóm F-5: "Trang Tổng quan cho từng vai trò (chỉ đọc)", **Cam kết**; mục 9: ba trang đứng đầu danh sách cắt | PLAN bản nháp 1: Lễ tân "cắt được, ngoài cam kết" (Q14), Bác sĩ và Bệnh nhân "không làm". Bản nháp 2: cả ba **Cam kết, đứng đầu danh sách cắt**, 5 task 11,5 giờ | LỆCH (với PLAN cũ; KHỚP với Phạm vi) | Phạm vi 27/11; Q15 đến Q21 | Q14 thay (4.2); mục 6, 10 |
| L12 | 2.4 (hai file Word) **không có use case "Tổng quan"** cho Lễ tân, Bác sĩ, Bệnh nhân (tìm "Tổng quan" ở mọi đoạn và ô bảng: 0 kết quả; 76 use case, số 2.4.1 đến 2.4.78) | thêm ba use case chỉ đọc | THIẾU Ở TÀI LIỆU | Phạm vi 27/11 | `[ĐỒNG BỘ TL]` **trước 01/12/2026** (Đại): nháp ở Phụ lục C |
| L13 | patient Q21e: "chuyển hướng tới Hồ sơ người khám (BN) và Tra cứu bệnh nhân (LT) **cho tới khi có Tổng quan**"; doctor Q35: "chưa có Tổng quan ⇒ chuyển tới Lịch làm việc" | bỏ ba chuyển hướng, Tổng quan là trang mở đầu (Q18) | KHỚP với ý của hai Q (chúng ghi rõ "tạm") | patient Q21e, doctor Q35, Q18 | sửa test cùng PR (`[ĐỤNG auth]` `[ĐỤNG patient]`); **báo Đại** để sửa Q21e ở PLAN patient (PR này không sửa) |
| L14 | Figma Make của ba vai trò: lịch sử khám 6 tháng và theo chuyên khoa (Bệnh nhân), hồ sơ người thân và lượt hoàn thành (Bệnh nhân), "Việc cần chú ý" và lịch 7 ngày tới (Bác sĩ), danh sách lịch hôm nay có nút tiếp đón (Lễ tân) | không làm; chỉ thẻ số, danh sách ngắn, liên kết | LỆCH (Figma là phác thảo) | Q15 đến Q17, 6.5 | không đồng bộ Figma |
| L15 | Phạm vi 27/11 mục 8: F-5 xong "kế hoạch nội bộ 21/12/2026" | cả scope do Trung làm (Q22): phần Quản trị viên chủ yếu ở Iteration 9, phần ba vai trò ở Iteration 10; hạn 21/12 | KHỚP | Q11, Q21 | — |

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
| MH10 | "Ca kế tiếp" của Bác sĩ | lịch **hôm nay** (giờ Việt Nam) có `DaTiepDon` (luôn đủ điều kiện: bệnh nhân đã đến, đang chờ) hoặc `DaXacNhan` có `thoiGian` **không trước bây giờ**; chọn sớm nhất theo `thoiGian`, hoà thì giữ thứ tự máy chủ trả; không có thì "Hôm nay không còn ca nào" (**phiên kiểm duyệt quy tắc này 28/11/2026**; giữ nhãn `[đề xuất]` vì là quy tắc hiển thị, Đại xem lúc review PR) |
| MH11 | "Lịch hôm nay" của Bác sĩ | tổng bốn trạng thái `DaXacNhan`, `DaTiepDon`, `HoanThanh`, `VangMat` (cùng cách tính Q4 và B3); **không** gồm `ChoThanhToan` và `DaHuy`; ghi chú nhỏ dưới thẻ "chưa gồm lịch chờ thanh toán" |
| MH12 | "Lịch sắp tới" của Bệnh nhân | đúng nhóm `SapToi` của "Lịch hẹn của tôi" (gồm `ChoThanhToan`, `DaXacNhan`, `DaTiepDon`; lịch của cả người thân do mình quản lý) để hai trang khớp nhau |
| MH13 | Chữ trạng thái trên ba trang | dùng đúng nhãn của `APPOINTMENT_STATE_LABELS` (Đã xác nhận, Đã tiếp đón, Hoàn thành, Vắng mặt, Chờ thanh toán); riêng thẻ Lễ tân giữ chữ Q12 ("Chờ tiếp đón" cho `DaXacNhan`) |
| MH14 | Số do nhiều lời gọi ghép ở web (Bác sĩ, Bệnh nhân) | không cùng một ảnh chụp: giữa hai thẻ có thể lệch một nhịp; chấp nhận, mỗi lần "Tải lại" gọi lại tất cả (R12) |

### 3.5 Rủi ro

- **R1 Lịch:** một người (Trung) làm cả scope 33,5 giờ; chat X1 đến X3, thông báo X3, payment trượt thì dashboard trượt theo (6.4, R14). Cắt trước (Q21): F5, rồi F4, rồi F3 và B3 (ba trang Tổng quan, Phạm vi mục 9); không cắt phần Quản trị viên.
- **R2 Hiệu năng:** bốn câu có thể quét toàn bảng (5.10); X1 đo, không đạt thì hỏi Đại về chỉ mục (+ khoảng 2 giờ, chưa nằm trong 22 giờ).
- **R3 Test có sẵn đổ:** gắn trang vào `/admin` làm nhiều test admin gọi API giả chưa khai báo; chạy cả bộ web ở F1.
- **R4 Số liệu "lạ" khi demo:** dữ liệu mẫu ít, lịch tạo bằng seed có `thoi_diem_tao` dồn một ngày làm biểu đồ một cột. Cần dữ liệu demo trải ngày `[cần điền]` (6.3).
- **R5 Hiểu nhầm chỉ số:** mỗi thẻ có dòng giải thích mẫu số ("x trên y lịch đã có kết quả").
- **R6 Số lớn của tiền:** tổng đi qua chuỗi decimal, không qua `number` ở máy chủ (DCH-05).
- **R7 Lộ số cá thể:** chi nhánh ít dữ liệu thì tổng có thể là một giao dịch; chấp nhận vì Quản trị viên đã xem được từng giao dịch ở trang khác.
- **R8 Xung đột file:** `app.module.ts`, `commitlint.config.cjs`, `AGENTS.md` cùng bị chatbot, chat sửa (6.3).
- **R9 Giờ review của Đại:** 11 PR của Trung, khoảng 5,5 giờ review (0,5 mỗi PR `[đề xuất]`) trải Iteration 9 và 10; Đại chuyển sang bài viết và cẩm nang (F-6) nên review phải xen vào việc đó. Giảm: review PR nhỏ trong 24 giờ; gộp review F4, F5 nếu cùng ngày.
- **R10 Test chuyển hướng cũ đổ:** gắn Tổng quan làm trang mở đầu làm đổi ít nhất **năm** file test đã xác định (mục 2, dòng "test đang khoá chuyển hướng cũ"; có thể thêm vài file chưa kiểm); mỗi task sửa **đúng ca của vai mình** trong cùng PR và chạy cả bộ web.
- **R11 Chỗ chung giữa task Quản trị viên và task ba vai trò:** cùng một người (Trung) làm nên không còn xung đột giữa hai người; vẫn chung `features/dashboard/index.ts`, dòng `import … from '../features/dashboard'` ở `router/role-routes.tsx` và phần dùng chung (thẻ số). Giảm: 5.19 (task nào làm trước dựng `common/`, task sau tái dùng).
- **R12 Số ghép ở web không cùng ảnh chụp** (MH14) và "hôm nay" của Bác sĩ tính ở trình duyệt bằng `todayVn` (giờ Việt Nam, T16): máy người dùng sai đồng hồ thì "hôm nay" lệch; Lễ tân không bị (B3 do máy chủ tính).
- **R13 Dữ liệu demo cho ba vai trò:** kiểm tay cần tài khoản mỗi vai có lịch hôm nay và lịch sắp tới `[cần điền]` (dùng chung với X2; không chạy `seed:*` lên `clinix` khi chưa được Đại đồng ý).
- **R14 MỘT người làm cả scope (Q22):** tải 33,5 giờ trước hạn 21/12 của F-5, trong khi Trung còn chat X1 đến X3, thông báo X3 và vài việc payment; giờ rảnh của Trung ở Iteration 9 và 10 `[cần điền]`. B1 chưa merge ở 28/11/2026 và là task ĐẦU. Giảm: thứ tự đề xuất ở 6.1 (phần Quản trị viên trước, rồi Lễ tân, Bác sĩ, Bệnh nhân, X3); trượt giờ thì cắt theo Q21 (Bệnh nhân, Bác sĩ, rồi Lễ tân); báo Đại sớm.

## 4. Câu hỏi và quyết định

### 4.1 Đã chốt ở module khác (kế thừa, **không bàn lại**)

- **admin, rbac:** phạm vi đọc từ DB mỗi request; ngoài phạm vi là 404 `KHONG_TIM_THAY`; thiếu quyền là 403 `KHONG_DU_QUYEN`; `@Roles` và `@RequireAdminScope` ghi trên từng route.
- **auth:** mã lỗi ổn định; không ghi bí mật vào log.
- **booking, doctor-exam:** thời gian theo giờ Việt Nam; không dùng giờ của DB; lọc bằng khoảng nửa mở.
- **payment:** giao dịch cọc và hoàn trỏ lịch gốc; tiền là chuỗi decimal.
- **Phạm vi (26/11/2026, bản dự thảo):** F-5 là một màn hình chỉ đọc cho Quản trị viên; F-4 (danh sách chờ) ngoài phạm vi.

### 4.2 Câu hỏi và quyết định (**Đại trả lời trực tiếp: Q1 đến Q14 ngày 26/11/2026 qua bốn hộp câu hỏi; Q15 đến Q21 ngày 28/11/2026 qua hai hộp câu hỏi, cả bảy theo đề xuất; Q22 (người làm) cũng ngày 28/11/2026, qua hộp câu hỏi của phiên kiểm**)

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
| **Q14** | Cỡ và hạn khi có Lễ tân? | Theo đề xuất: **Lễ tân là phần cắt được**: cam kết F-5 chỉ phần Quản trị viên; B3, F3 là task cuối, có issue. **(28/11/2026: phần "ngoài cam kết" được thay bởi Phạm vi 27/11 và Q21: Lễ tân là Cam kết, đứng đầu danh sách cắt; L11)** | 6.4, 6.5 |
| **Q15** | Trang Tổng quan Lễ tân hiện gì? | Theo đề xuất: **năm thẻ (lịch khám, chờ tiếp đón, đã tiếp đón, hoàn thành, vắng mặt) cộng dòng "Yêu cầu đổi lịch đang chờ" có liên kết**, tối đa 6 mục (giữ Q12) | 5.16 |
| **Q16** | Trang Tổng quan Bác sĩ hiện gì? | Theo đề xuất: **bốn mục**: lịch hôm nay tách trạng thái; ca kế tiếp; ca làm việc hôm nay; yêu cầu nghỉ phép đang chờ duyệt; kèm đường vào Lịch hẹn, Lịch làm việc | 5.17 |
| **Q17** | Trang Tổng quan Bệnh nhân hiện gì? | Theo đề xuất: **ba mục**: lịch sắp tới (số và tối đa 3 lịch, nhắc chờ thanh toán); số dư ví khả dụng và đang giữ; nút "Đặt lịch khám" và liên kết Lịch hẹn của tôi | 5.18 |
| **Q18** | Tổng quan có là trang mở đầu sau đăng nhập không? | Theo đề xuất: **có, cả ba vai trò** (bỏ ba chuyển hướng tạm; Q13 mở rộng cho Bác sĩ và Bệnh nhân) | L13; 5.19 |
| **Q19** | Có API tổng hợp mới hay ghép API cũ? | Theo đề xuất: **Lễ tân giữ B3 (một route gộp mới); Bác sĩ và Bệnh nhân chỉ ghép API đã có ở web** | 5.15; T14, T15 |
| **Q20** | Tin nhắn và thông báo chưa đọc có thành thẻ riêng không? | Theo đề xuất: **không**, giữ huy hiệu ở menu (cùng nguồn thăm dò 30 giây; không chạm `features/chat`, `features/notification`) | 5.19 |
| **Q21** | Thứ tự làm và thứ tự cắt khi trượt giờ? | Theo đề xuất: **làm Lễ tân (B3, F3), rồi Bác sĩ (F4), rồi Bệnh nhân (F5), rồi X3; cắt từ cuối**: Bệnh nhân trước, Bác sĩ sau, Lễ tân sau cùng; mục tiêu Iteration 10 | 6.2, 6.4, 6.5 |
| **Q22** | Ai làm scope này? | **Giao CẢ dashboard (11 task, 33,5 giờ: phần Quản trị viên 22 giờ và ba vai trò 11,5 giờ) cho Trung (`junUTE`); Đại (`MaxTrann`) chỉ review**; Đại chuyển sang scope bài viết và cẩm nang (F-6). Nội dung kỹ thuật và giờ của phần Quản trị viên **không đổi**, chỉ đổi người làm. Nguồn: Đại trả lời trực tiếp ở hộp câu hỏi của phiên kiểm (28/11/2026); phiên lập kế hoạch nhận qua tin của phiên kiểm (không thấy hộp), **Đại xác nhận lại khi review PR** | 6.1 đến 6.6b; R14 |

### 4.3 Điểm kỹ thuật: **đã duyệt kỹ thuật (phiên kiểm độc lập, theo ủy quyền của Đại, 26/11/2026)**; không phải quyết định sản phẩm hay schema (T1 đến T13 duyệt 26/11/2026; **T14 đến T21 của bản nháp 2 duyệt 28/11/2026**, cùng phiên kiểm, theo ủy quyền của Đại, kèm điều kiện ở T14 và T15)

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
| T14 | `GET /reception/dashboard` (B3) nằm trong `DashboardModule` của B1, dùng `ReceptionScopeService` và `resolveReceptionBranch`, tự viết SQL (T4), `@Roles('LeTan')` trên route, `no-store`, một `runReadOnly`; hợp đồng giữ nguyên 5.7. **B3 phụ thuộc B1, không còn phụ thuộc X2. B1 CHƯA merge ở 28/11/2026** (`apps/api/src/dashboard/` chưa có file nào trên `origin/main`): B3 chỉ làm sau khi B1 merge, trước đó chỉ `[SOẠN TRƯỚC]`. **Từ Q22, B1 và B3 cùng một người làm (Trung): B1 là task ĐẦU ngay khi xong chat, B3 làm sau B1**; nếu B1 trượt thì làm F4 và F5 (không cần B1) trước B3 và F3 | tránh hai module Nest; test kiến trúc T12 của B1 phủ luôn route này. Phiên kiểm duyệt 28/11/2026, kèm sửa chữ này (việc đổi người làm sau đó do Q22 chưa qua phiên kiểm) |
| T15 | Bác sĩ và Bệnh nhân **không thêm route**; web gọi API đã có bằng client chung `request` trong `features/dashboard/api/overview-api.ts`, **mỗi nguồn một `useRemote`** (lỗi và "Thử lại" từng khối, trang không trắng); chỉ đọc đúng các khoá cần (thiếu hay sai kiểu một khoá cần ⇒ lỗi của khối đó; khoá thừa bị bỏ qua, **khác nếp đọc nghiêm của module gốc** vì chỉ mượn vài số; phiên kiểm chấp nhận); **mỗi khối có ca kiểm "thiếu hay sai kiểu khoá cần ⇒ lỗi của khối đó, khoá thừa không làm vỡ"** (DBS-05, DBN-06, DLW-03) và nợ nhỏ ghi ở TRACKING 4.2 (dòng 358); không import `features/booking`, `doctor`, `wallet`, `patient`, `chat`, `notification` | tôn trọng quy tắc không import chéo; lỗi cục bộ; tránh viết SQL lần hai. Đổi giá cho khoá lạ: nếu module gốc thêm khoá thì trang Tổng quan không vỡ |
| T16 | "Hôm nay" ở web của Bác sĩ dùng **`todayVn()` đã có ở `shared/schedule/week.ts`** (giờ Việt Nam cố định bằng `Intl`, nhận `now` để test dùng đồng hồ giả; đã có `week.test.ts`) và `formatWeekdayDate` cho dòng "Hôm nay, Thứ …, dd/MM/yyyy"; **không** `getDate()` hay `toISOString().slice(0, 10)`; **không viết hàm ngày mới** | dùng lại `shared/` (không import chéo `features/`); ca `DBS-07` kiểm trang gọi đúng hàm dưới đồng hồ giả ở 23:59:59 và 00:00:00, `TZ=UTC`; Lễ tân lấy `ngay` từ máy chủ nên không cần |
| T17 | Liên kết dùng hằng ở `shared/routes/*` (`DOCTOR_APPOINTMENTS_PATH`, `PATIENT_APPOINTMENTS_PATH`, `RECEPTION_APPOINTMENTS_PATH`, `RECEPTION_RESCHEDULE_REQUESTS_PATH`, `PATIENT_WALLET_PATH`, `BOOKING_PATH`); riêng hai đường dẫn của Bác sĩ (`/bac-si-portal/lich-lam-viec`, `/bac-si-portal/lich-lam-viec/nghi-phep`) viết trong `features/dashboard/common/overview-paths.ts` kèm ca `DNV-08` ở `router/` khoá bằng `DOCTOR_PATHS` (nếp T10) | không sửa `features/doctor` hay thêm file vào `shared/routes/` (chạm module khác) |
| T18 | Menu: `to: ROLE_HOME_PATHS.<vai>` và `end: true` cho mục "Tổng quan" ở `PATIENT_NAV`, `RECEPTION_NAV`, `DOCTOR_NAV` (`router/role-nav.ts`, import `ROLE_HOME_PATHS` từ `features/auth` qua `index.ts`) | `end` để mục không sáng ở mọi trang con (đã có ca khoá ở `role-shell.test.tsx`) |
| T19 | Route: `features/dashboard/index.ts` xuất `RECEPTION_OVERVIEW_ROUTES`, `DOCTOR_OVERVIEW_ROUTES`, `PATIENT_OVERVIEW_ROUTES` (mỗi mảng một route `index: true` dùng `lazy`, nếp `admin-routes.tsx`); `router/role-routes.tsx` **thay** ba `<Navigate>` bằng ba mảng này, giữ nguyên mọi route khác của khối | đổi đúng một dòng mỗi khối, ít xung đột |
| T20 | Mỗi trang có **một `<h1>` "Tổng quan"**, dòng "Hôm nay, {thứ, ngày}", mỗi khối là một vùng có tiêu đề (`<section aria-labelledby>`), thẻ số dạng danh sách có tiêu đề (như 5.11), `OfflineBanner` ở đầu, nút "Tải lại" gọi lại **mọi** nguồn; **không tự làm mới, không `setInterval`**; web không lưu số liệu vào kho trình duyệt | nhất quán T9 của Quản trị viên |
| T21 | Mức kiểm F3, F4, F5: **GỌN** (đột biến web bốn loại ở 5.20, không chạy tay jscpd và gitleaks: CI đo); B3: THƯỜNG cộng đột biến 12; X3 chạy kiểm tay và đột biến lô là **lane nặng, xin phiên kiểm trước** | nếp đã chốt ở 5.14 |

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
| Giả định 20 giờ mỗi tuần cho mọi việc, chatbot ưu tiên (của Đại) | 6.4 | Đại đã xác nhận qua Q11; **không còn áp dụng cho scope này từ Q22** (Trung làm cả scope, giờ rảnh `[cần điền]`) |
| Dữ liệu demo ba vai trò: tài khoản Lễ tân, Bác sĩ, Bệnh nhân có lịch hôm nay, lịch sắp tới, ví có số dư (seed nào, DB nào) | R13, X3 | `[cần điền]` (Đại) |
| Số Word của ba use case "Tổng quan"; có gộp 1.2.1 một hàng hay ba hàng | Phụ lục C | `[cần điền]` (Đại) |
| Số giờ còn rảnh của Trung ở Iteration 9 và 10 cho cả scope 33,5 giờ (chat X1 đến X3, thông báo X3, vài việc payment) | 6.4 | `[cần điền]` (Trung, Đại) |
| Chữ giao diện của ba trang (5.16 đến 5.18), nhãn nút | 5.16 đến 5.18 | `[đề xuất]` |
| MH10 đến MH14, T14 đến T21 | 3.4, 4.3 | `[đề xuất]`; T14 đến T21 **đã được phiên kiểm duyệt kỹ thuật 28/11/2026** |
| Giờ ước 33,5 (22 Quản trị viên + 11,5 ba vai trò), giờ review của Đại 0,5 mỗi PR (11 PR, 5,5 giờ), thứ tự làm và chia Iteration 9, 10 | 6.2, 6.4 | `[đề xuất]` |
| Ngưỡng M5 cho B3 (đã đặt ở 5.14); **M5 đo ở X3, không ở X1** | 5.14, 6.2 | ngưỡng `[đề xuất]`; chỗ đo **ĐÃ QUYẾT** (phiên kiểm, theo ủy quyền của Đại, 28/11/2026) |

### 4.5 Figma

Chỉ tham khảo **chữ và bố cục** của `AdminDashboard` trong mã Make: tiêu đề "Tổng quan", dãy thẻ số hai hàng, biểu đồ cạnh khối "Việc cần xử lý" (dòng "Nghỉ phép bác sĩ", "Đổi lịch hẹn", "Yêu cầu rút tiền"). Khác có chủ đích: ô ngày thay cho nút kỳ, không doanh thu, không so sánh, không danh sách chờ, biểu đồ tự vẽ. Phiên lập kế hoạch **không mở Figma Design**.

**Ba trang Tổng quan (bản nháp 2):** chỉ tham khảo chữ và bố cục của `ReceptionistDashboard`, `DoctorDashboard`, `PatientDashboard` ở mã Make: tiêu đề "Tổng quan", dãy bốn thẻ số, danh sách bên cạnh. Khác có chủ đích: không biểu đồ lịch sử khám, không "Việc cần chú ý" của Bác sĩ, không hồ sơ người thân hay lượt hoàn thành của Bệnh nhân, không danh sách lịch hôm nay của Lễ tân, không thẻ tin nhắn chưa đọc (L14). Phiên lập kế hoạch **không mở Figma Design**.

### 4.6 Việc của nhóm (ngoài repo; không sửa file Word hay Figma từ repo này)

- **Trước 16:46 ngày 27/11/2026:** văn bản Phạm vi mục 8 và 10: mốc của F-5 là **21/12** (Q11), tách khỏi mốc 14/12 của F-1 đến F-3. Dòng F-5 mục 3 **không cần** thêm Lễ tân (Q14). Phiên kiểm độc lập nhận tự sửa (26/11/2026); phiên lập kế hoạch này chưa kiểm file đó. **Đã kiểm 28/11/2026:** `Pham_Vi_Thuc_Hien_2026-11-27.md` mục 8 ghi F-5 "kế hoạch nội bộ 21/12/2026" và dòng F-5 mục 3 đã là "Trang Tổng quan cho từng vai trò (chỉ đọc)", Cam kết.
- **`[ĐỒNG BỘ TL]` sửa file Word ở repo `TLCN_CLINIX`:** use case "Xem thống kê & báo cáo vận hành" ở cả hai bản 2.4 (bỏ chỉ số danh sách chờ; "hôm nay và trong khoảng"; định nghĩa cọc, hoàn; bốn loại chờ duyệt và phạm vi; bộ lọc 30 và 366 ngày); 1.2.1 hàng cùng tên; 1.3 đoạn giám sát vận hành của Quản trị viên; bảng Phân loại M24. Chỉ khi làm F3: thêm tác nhân Lễ tân ở 2.4 và 2.1_2.2.
- Mục tiêu đề tài: không đổi vì dashboard (Phạm vi mục 3 đã nêu phần danh sách chờ).
- Đại tạo nhãn `module:dashboard`, milestone `dashboard`, Epic và sinh issue bằng script từ 6.6 sau khi PR tài liệu merge. **Đã làm (kiểm 28/11/2026):** Epic #746, issue #747 đến #754, nhãn và milestone đã có.
- **Trước 01/12/2026 (hạn nộp SRS/SDD), việc của Đại:** thêm vào hai bản Word 2.4 **ba use case "Tổng quan"** (Lễ tân, Bác sĩ, Bệnh nhân) từ nháp ở **Phụ lục C**; quyết định có thêm hàng ở 1.2.1 hay không và có thêm vào bảng Phân loại phạm vi (cạnh M24) hay không `[cần điền]`. Phiên lập kế hoạch này **không sửa file Word**.
- **Sau khi PR kế hoạch này merge, Đại và phiên kiểm chạy script (6.6b):** đổi người làm sang `junUTE` và người review sang `MaxTrann` ở #747 đến #754 (giữ số, tiêu đề, Epic); sửa thân #749, #753, #754; tạo F4, F5, X3 (làm `junUTE`); cập nhật Epic #746. Phiên này **không tạo hay sửa issue**.
- **Báo Đại:** PLAN patient Q21e và doctor Q35 ghi "chuyển hướng cho tới khi có Tổng quan" sẽ lỗi thời khi F3, F4, F5 merge (PR kế hoạch này không sửa `docs/features/{patient,doctor}/*`).

## 5. Thiết kế kỹ thuật

### 5.1 Cấu trúc thư mục (tạo thư mục khi có file đầu tiên; test cạnh mã; `[đề xuất]`)

```
apps/api/src/dashboard/
  dashboard.module.ts
  filter/        dashboard-filter.dto.ts · date-range.rules.ts (hàm thuần: mặc định, giới hạn, gom tuần)
  queries/       appointment-metrics.query.ts · slot-usage.query.ts · money.query.ts · trend.query.ts · pending.query.ts
  admin/         admin-dashboard.controller.ts · admin-dashboard.service.ts · admin-dashboard.dto.ts · ratio.rules.ts (B1: phần trăm T5)
  reception/     reception-dashboard.controller.ts · reception-dashboard.service.ts   (B3)
  testing/       dashboard-fixtures.ts (bộ D0 ở 7.0)
  architecture.spec.ts
apps/web/src/features/dashboard/
  index.ts (mảng route cho router/) · api/dashboard-api.ts · api/overview-api.ts (F3, F4, F5: ghép API đã có) · format.ts
  admin/         overview-page.tsx · filter-bar.tsx · metric-cards.tsx · pending-list.tsx
  chart/         trend-chart.tsx · trend-table.tsx                                   (F2)
  reception/     reception-overview-page.tsx                                          (F3)
  doctor/        doctor-overview-page.tsx · next-appointment.ts                       (F4, bản nháp 2)
  patient/       patient-overview-page.tsx                                            (F5, bản nháp 2)
  common/        stat-card.tsx · overview-block.tsx · overview-paths.ts               (F3 dựng, dùng chung)
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
| … + `TRUONG_KHONG_DUOC_PHEP` hay `chiNhanhId` sai dạng (mã trường `CHI_NHANH_KHONG_HOP_LE` `[đề xuất]`, chọn ở B1) | 400 | tham số lạ | "Bộ lọc không hợp lệ." |
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

### 5.12 Giao diện Lễ tân (F3, `[CẮT ĐƯỢC]`; Q12, Q13, Q15; **bản nháp 2: chi tiết ở 5.16**)

`/le-tan` hiện "Tổng quan" (không còn chuyển tới Tra cứu bệnh nhân); mục menu "Tổng quan" bật. Dòng "Hôm nay, {ngày} · {chi nhánh}"; năm thẻ (lịch khám, chờ tiếp đón, đã tiếp đón, hoàn thành, vắng mặt) kèm liên kết "Quản lý lịch hẹn"; dòng "Yêu cầu đổi lịch đang chờ: N" liên kết tới trang Yêu cầu đổi lịch; nút "Tải lại"; đang tải, lỗi, 375 px, bàn phím như 5.11. Không bộ lọc. **Bản nháp 2:** cùng nội dung nhưng nay là Cam kết (đứng đầu danh sách cắt, L11); hiển thị chi tiết, trạng thái biên và đột biến ở 5.16, 5.19, 5.20.

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
| M5 (**đo ở X3**, không ở X1) | các câu "hôm nay" và đổi lịch chờ của Lễ tân: cả service của `GET /reception/dashboard` (B3), cùng cỡ dữ liệu 100.000 lịch | p95 cả service ≤ 200 ms | như M1 |

**Phân công đo (phiên kiểm quyết, theo ủy quyền của Đại, 28/11/2026): X1 chỉ đo M1 đến M4; M5 thuộc X3 (cùng một người làm, Trung).** X1 chạy trước B3 nên chưa có gì để đo. X3 đo M5 trên B3 với dữ liệu 100.000 lịch (cùng cỡ dữ liệu ở trên), là **lane nặng, xin phiên kiểm trước**; tiêu chí M5 đã đặt, **không đổi sau khi thấy số**. `[đề xuất]` dùng lại bộ nạp của X1 để không tăng giờ; nếu phải dựng lại bộ nạp thì X3 thêm khoảng 1 giờ (tổng phần ba vai trò 12,5 giờ, vượt khoảng 8 đến 12 của chỉ dẫn: báo Đại).

Cần chỉ mục: nêu **đúng cột**, số trước và sau, hỏi Đại; được đồng ý thì làm PR riêng "dashboard P1" (migration viết tay và **ba** file `docs/database/*`, `[ĐỒNG BỘ TL]`, khoảng 2 giờ, ngoài 22 giờ); không được thì ghi nợ.

**Kiểm thử.** Đơn vị cho hàm thuần (bộ lọc, gom tuần, làm tròn); tích hợp trên MySQL thật với bộ **D0** (7.0) và kết quả tính tay; e2e qua `AppModule` cho quyền, phạm vi, mã lỗi, header; ca ngày giờ chạy dưới cả `TZ=UTC` và `TZ=Asia/Ho_Chi_Minh` với đồng hồ giả.

**Đột biến mục tiêu** (lane nặng, hỏi phiên kiểm trước): (1) Chi nhánh dùng `chiNhanhId` của client (DQP-03); (2) không kiểm chi nhánh tồn tại (DQP-04); (3) thêm `DaXacNhan` vào mẫu số vắng mặt (DVM-02); (4) không trừ nghỉ đã duyệt, hoặc trừ cả chờ duyệt (DKG-02); (5) tính `DangGiuCho` là đã đặt (DKG-03); (6) tính tiền mặt hay 0đ vào cọc (DCH-02); (7) cộng dòng hoàn thất bại (DCH-03); (8) biên cuối khoảng thành `<=` mốc 00:00 hôm sau (DCH-02, DXH-04); (9) đếm cả dòng đổi lịch trong xu hướng (DXH-02); (10) trả số rút tiền cho Chi nhánh (DCD-02); (11) bỏ `runReadOnly` (DRG-02, DRG-03); (12) Lễ tân không lọc chi nhánh (DLT-02). Web (GỌN, bốn loại): web tự tính lại phần trăm (DWB-06); không huỷ kết quả cũ (DWB-08); gửi `chiNhanhId` khi là Chi nhánh (DWB-05); hiện dòng rút tiền cho Chi nhánh (DWB-07).

### 5.15 Mở rộng (bản nháp 2, 28/11/2026): bảng chỉ số của ba vai trò → nguồn → quyền → đủ hay thiếu

Nguyên tắc (Q15 đến Q20): **chỉ đọc**; mỗi trang **tối đa 4 đến 6 mục**; chỉ ghi chỉ số mà dữ liệu **có sẵn**; Bác sĩ và Bệnh nhân **ghép API đã có**, Lễ tân dùng **một route gộp mới** (B3) vì danh sách lịch hẹn của Lễ tân không trả số theo trạng thái; mỗi người chỉ thấy dữ liệu của chính mình hay chi nhánh mình, **do máy chủ cưỡng bức** (API gốc đã có `@Roles` và phạm vi trong SQL; web không gửi khoá chủ sở hữu hay chi nhánh). `H` = ngày hôm nay theo giờ Việt Nam (`YYYY-MM-DD`).

| # | Vai | Chỉ số | Công thức và nguồn dữ liệu | API | Quyền, phạm vi | Đủ chưa |
|---|---|---|---|---|---|---|
| 1 | Lễ tân | Lịch khám hôm nay | `choTiepDon + daTiepDon + hoanThanh + vangMat` (MH8: không gồm `ChoThanhToan`, `DaHuy`, `DaDoiLich`); `lich_hen.thoi_gian` trong hôm nay, `lich_hen.chi_nhanh_id` = chi nhánh của Lễ tân | **`GET /reception/dashboard` (B3, MỚI)** | `@Roles('LeTan')`; chi nhánh đọc từ `le_tan.chi_nhanh_id` ở DB mỗi request (`ReceptionScopeService`); route **không nhận tham số** (khoá lạ ⇒ 400) | **THIẾU**: `GET /reception/appointments` chỉ trả `total` (ca `DSV-13`); đủ năm số phải gọi nhiều lần |
| 2 đến 5 | Lễ tân | Chờ tiếp đón (`DaXacNhan`), Đã tiếp đón (`DaTiepDon`), Hoàn thành, Vắng mặt | đếm theo `trang_thai`, cùng điều kiện ngày và chi nhánh | cùng B3 | cùng | **THIẾU**, cùng một route |
| 6 | Lễ tân | Yêu cầu đổi lịch đang chờ | `yeu_cau_doi_lich_ngoai_chinh_sach.trang_thai = 'ChoDuyet'`, chi nhánh theo `lich_hen.chi_nhanh_id` của lịch (cùng định nghĩa danh sách của Lễ tân) | cùng B3 (đã có `GET /reception/reschedule-requests` trả `total`; **gộp vào B3** để cùng ảnh chụp, một lời gọi) | cùng | ĐÃ CÓ nguồn; gộp |
| 7 | Bác sĩ | Lịch hôm nay (tổng và bốn số: Đã xác nhận, Đã tiếp đón, Hoàn thành, Vắng mặt) | `demTheoTrangThai` của lời gọi; tổng = bốn trạng thái (MH11) | `GET /doctor/appointments?tuNgay=H&denNgay=H&trangThai=DaTiepDon,DaXacNhan&sapXep=CuNhat&pageSize=100` (**ĐÃ CÓ**; `demTheoTrangThai` tính trên mọi bộ lọc TRỪ `trangThai[]` nên một lời gọi cho đủ số) | `@Roles('BacSi')`; `bac_si_id` từ token; `bacSiId` gửi lên bị bỏ qua; `no-store`; chỉ mục `lich_hen_index_10` | **ĐỦ** |
| 8 | Bác sĩ | Ca kế tiếp | MH10, từ `items` của cùng lời gọi (giờ, trạng thái, dịch vụ, tên người khám) | cùng | cùng; không hiện SĐT, ngày sinh, lý do khám | **ĐỦ** |
| 9 | Bác sĩ | Ca làm việc hôm nay | `ca[]`: ca (Sáng, Chiều), chi nhánh, `batDau`–`ketThuc`, `soLichHen`, `nghiPhep` | `GET /doctor/schedule?tuNgay=H&denNgay=H` (**ĐÃ CÓ**) | `@Roles('BacSi')` ở lớp; `bac_si_id` từ token; khoá lạ ⇒ 400 | **ĐỦ** |
| 10 | Bác sĩ | Yêu cầu nghỉ phép đang chờ duyệt | `total` | `GET /doctor/leave-requests?trangThai=ChoDuyet&pageSize=1` (**ĐÃ CÓ**) | `@Roles('BacSi')`; chỉ yêu cầu của mình | **ĐỦ** |
| 11 | Bác sĩ | Đường vào Lịch hẹn, Lịch làm việc, Nghỉ phép | liên kết | — | — | — |
| 12 | Bệnh nhân | Lịch hẹn sắp tới (số, tối đa 3 lịch gần nhất) | `total` và `items` (tăng dần theo `thoi_gian`; gồm lịch của người thân do mình quản lý, MH12) | `GET /patient/appointments?nhom=SapToi&pageSize=3` (**ĐÃ CÓ**) | `@Roles('BenhNhan')`; chủ sở hữu từ token; `benhNhanId` gửi lên ⇒ 400; chỉ mục `lich_hen_index_9` | **ĐỦ** |
| 13 | Bệnh nhân | Nhắc chờ thanh toán | item `ChoThanhToan` có `hanThanhToan`; số lịch chờ thanh toán từ `demTheoTrangThai.ChoThanhToan` | cùng lời gọi | cùng | **ĐỦ** |
| 14 | Bệnh nhân | Số dư ví khả dụng và đang giữ | `soDuKhaDung`, `soTienDangGiu` (chuỗi decimal) | `GET /patient/wallet` (**ĐÃ CÓ**) | `@Roles('BenhNhan')`; ví của chính mình | **ĐỦ** |
| 15 | Bệnh nhân | "Đặt lịch khám", "Lịch hẹn của tôi", "Ví của tôi" | liên kết | — | — | — |

**Số lời gọi mỗi lần tải:** Lễ tân 1; Bác sĩ 3; Bệnh nhân 2. **Không** có chỉ số nào cần API mới ngoài B3. Tin nhắn và thông báo chưa đọc **không thành thẻ** (Q20; đã có ở huy hiệu menu).

**Use case có sẵn mà ba trang dùng lại** (tìm theo TÊN; dự án không dùng Use Case ID; số là của file gốc): Lễ tân: "Xem danh sách lịch hẹn" (2.4.35), "Cập nhật trạng thái lịch hẹn" (2.4.34), "Xử lý yêu cầu đổi lịch ngoài chính sách" (2.4.31), "Trung tâm thông báo" (2.4.59), "Nhắn tin với bệnh nhân" (2.4.29). Bác sĩ: "Xem danh sách lịch hẹn được phân công" (2.4.26), "Xem lịch làm việc bác sĩ" (2.4.24), "Tạo yêu cầu xin nghỉ phép" (2.4.25), "Trung tâm thông báo", "Nhắn tin với bệnh nhân". Bệnh nhân: "Tra cứu danh sách / lịch sử lịch hẹn" (2.4.12), "Đặt lịch khám" (2.4.8), "Nạp tiền vào ví" (2.4.13), "Thanh toán lịch khám" (2.4.14), "Trung tâm thông báo", "Nhắn tin với bác sĩ" và "Nhắn tin với lễ tân" (2.4.20, 2.4.21). Hiện **chưa có use case "Tổng quan"** cho ba vai trò (L12): nháp ở Phụ lục C.

### 5.16 Tổng quan Lễ tân (B3 máy chủ, F3 web)

**B3: `GET /reception/dashboard`.** Hợp đồng giữ **đúng 5.7** (không query; thân `{ ngay, chiNhanh: { id, ten }, lichKham, choTiepDon, daTiepDon, hoanThanh, vangMat, yeuCauDoiLichChoDuyet }`, `lichKham = choTiepDon + daTiepDon + hoanThanh + vangMat`; id là chuỗi; `Cache-Control: no-store` bằng `@Header`). Quyền ở 5.3 (khách 401; Bệnh nhân, Bác sĩ, Quản trị viên 403 `KHONG_DU_QUYEN`; Lễ tân bị khoá hay đổi chi nhánh có hiệu lực ở request sau; khoá lạ 400 `TRUONG_KHONG_DUOC_PHEP`). **Tên route nằm trong `DashboardModule` của B1** (T14). Hai câu chỉ đọc trong **một** `runReadOnly`, `H` từ **một** `nowVN()` (T14; không `NOW()`, không `DATE(` bọc cột):

```sql
SELECT lh.trang_thai AS trangThai, COUNT(*) AS soLuong FROM lich_hen lh
WHERE lh.chi_nhanh_id = :chiNhanhCuaLeTan
  AND lh.thoi_gian >= :homNay00h AND lh.thoi_gian < :ngayMai00h
  AND lh.trang_thai IN ('DaXacNhan', 'DaTiepDon', 'HoanThanh', 'VangMat')
GROUP BY lh.trang_thai

SELECT COUNT(*) FROM yeu_cau_doi_lich_ngoai_chinh_sach y
JOIN lich_hen lh ON lh.lich_hen_id = y.lich_hen_id
WHERE y.trang_thai = 'ChoDuyet' AND lh.chi_nhanh_id = :chiNhanhCuaLeTan
```

Phác hoạ để review; hiệu năng ở 5.20 (không chỉ mục mới khi chưa đo, Q10).

**F3: giao diện** (mục "Tổng quan" bật, `/le-tan` là trang mở đầu, Q13 và Q18). Một `<h1>` "Tổng quan"; dòng "Hôm nay, {thứ}, {dd/MM/yyyy} · {tên chi nhánh}" (ngày và tên lấy từ `ngay`, `chiNhanh.ten` của máy chủ); năm thẻ "Lịch khám hôm nay", "Chờ tiếp đón", "Đã tiếp đón", "Hoàn thành", "Vắng mặt" (ghi chú nhỏ: "Chưa gồm lịch chờ thanh toán và lịch đã hủy", MH8) cùng liên kết "Quản lý lịch hẹn"; dòng "Yêu cầu đổi lịch đang chờ: N" kèm liên kết "Xem yêu cầu" tới trang Yêu cầu đổi lịch (số 0 vẫn hiện); nút "Tải lại". **Rỗng:** năm thẻ `0` và dòng "Hôm nay chưa có lịch khám nào tại chi nhánh." (dòng đổi lịch vẫn hiện). **Lỗi:** một nguồn duy nhất nên khối số hiện `ErrorState` kèm "Thử lại"; khung trang (tiêu đề, nút "Tải lại", menu) vẫn còn.

### 5.17 Tổng quan Bác sĩ (F4)

Mỗi khối một nguồn, `useRemote` riêng (T15); `H` tính bằng `todayVn()` của `shared/schedule/week.ts` (T16); dòng ngày bằng `formatWeekdayDate`. Một `<h1>` "Tổng quan" và dòng "Hôm nay, {thứ}, {dd/MM/yyyy}".

1. **"Lịch hôm nay"** (nguồn: `GET /doctor/appointments`, bảng 5.15 dòng 7): số lớn = tổng bốn trạng thái; bốn số nhỏ "Đã xác nhận", "Đã tiếp đón", "Hoàn thành", "Vắng mặt" (MH13); ghi chú "Chưa gồm lịch chờ thanh toán và lịch đã hủy" (MH11); liên kết "Mở Lịch hẹn". Rỗng: số `0` và "Hôm nay bạn chưa có lịch hẹn nào."
2. **"Ca kế tiếp"** (cùng lời gọi, MH10): giờ (`HH:mm` giờ Việt Nam), nhãn trạng thái, dịch vụ, tên người khám (kèm quan hệ khi không phải bản thân); liên kết "Mở Lịch hẹn". Rỗng: "Hôm nay không còn ca nào." (Lỗi khối 1 thì khối 2 cũng báo lỗi vì cùng nguồn.)
3. **"Ca làm việc hôm nay"** (nguồn: `GET /doctor/schedule`): mỗi ca một dòng: ca (`SHIFT_LABELS`: Ca sáng, Ca chiều), chi nhánh, giờ `formatShiftHours`, "N lịch hẹn", và nhãn `SHIFT_STATUS_LABELS` khi `nghiPhep` khác `null` ("Nghỉ đã duyệt", "Chờ duyệt", "Yêu cầu bị từ chối"); liên kết "Mở Lịch làm việc". Rỗng: "Hôm nay bạn không có ca làm việc."
4. **"Yêu cầu nghỉ phép"** (nguồn: `GET /doctor/leave-requests`): "N yêu cầu đang chờ duyệt" (`0`: "Không có yêu cầu nào đang chờ"); liên kết "Xem nghỉ phép".

Ba nguồn độc lập: một nguồn lỗi thì chỉ khối của nó hiện lỗi và "Thử lại" (chỉ gọi lại nguồn đó); "Tải lại" ở đầu trang gọi lại cả ba.

### 5.18 Tổng quan Bệnh nhân (F5)

Hai nguồn, `useRemote` riêng. Một `<h1>` "Tổng quan", dòng "Hôm nay, {thứ}, {dd/MM/yyyy}", nút chính **"Đặt lịch khám"** (liên kết tới `BOOKING_PATH`).

1. **"Lịch hẹn sắp tới"** (nguồn: `GET /patient/appointments?nhom=SapToi&pageSize=3`): "N lịch sắp tới" và tối đa 3 mục (ngày giờ `dd/MM/yyyy HH:mm` giờ Việt Nam, "Bác sĩ {tên} · {chuyên khoa}", người khám ("Bản thân" hay họ tên), nhãn trạng thái theo MH13; mỗi mục là liên kết tới chi tiết lịch bằng `patientAppointmentDetailPath`). Lịch `ChoThanhToan` có `hanThanhToan`: dòng "Chờ thanh toán trước {HH:mm dd/MM}" (**không đếm ngược**, không `setInterval`). `total` lớn hơn 3: liên kết "Xem tất cả" tới Lịch hẹn của tôi. Rỗng: "Bạn chưa có lịch hẹn sắp tới." kèm nút "Đặt lịch khám".
2. **"Ví của tôi"** (nguồn: `GET /patient/wallet`): "Số dư khả dụng" và "Đang giữ cho lịch chờ thanh toán" bằng `formatVnd`; liên kết "Mở ví". Ví chưa có tiền hiện `0 ₫`.

Lỗi từng khối riêng như 5.17 (lỗi ví không làm mất danh sách lịch và ngược lại).

### 5.19 Điểm nối: router, menu, trang mở đầu, xung đột (`[ĐỤNG router]` `[ĐỤNG auth]` `[ĐỤNG patient]`)

- **Menu** (T18): `router/role-nav.ts`, mục đầu của `PATIENT_NAV`, `RECEPTION_NAV`, `DOCTOR_NAV` thêm `to: ROLE_HOME_PATHS.<vai>` và `end: true` (nay là nút vô hiệu "Chưa được triển khai").
- **Route** (T19): `features/dashboard/index.ts` xuất `RECEPTION_OVERVIEW_ROUTES`, `DOCTOR_OVERVIEW_ROUTES`, `PATIENT_OVERVIEW_ROUTES`; `router/role-routes.tsx` **thay ba `<Navigate replace>`** bằng ba mảng này (dòng 56 đến 59, 84 đến 88, 108 đến 112 ở `4c80486`). Các trang cũ (Hồ sơ người khám, Lịch làm việc, Tra cứu bệnh nhân) **giữ nguyên** đường dẫn và menu.
- **Trang mở đầu** (Q18): `homePathFor` và `return-to.ts` **không đổi** (vẫn trả `/benh-nhan`, `/bac-si-portal`, `/le-tan`); chỉ nội dung tại các đường dẫn đó đổi. Có `from` hợp lệ thì vẫn về `from`.
- **Test cũ phải sửa trong cùng PR của vai tương ứng** (danh sách dự kiến ở mục 2; kiểm lại bằng `git grep` lúc làm): F3: `PL-09` và dòng Lễ tân của `LANDING_PATHS`; F4: `WK-01`, `WK-02`, `DAR-06`, dòng Bác sĩ của `LANDING_PATHS`; F5: `PL-01`, dòng Bệnh nhân của `LANDING_PATHS`, bước đợi nút "Chỉnh sửa" của helper đăng nhập ở `login-page.test.tsx`, `AU-65` và ca ở dòng 328 của `auth-routes.test.tsx`; mọi test khác mở `/benh-nhan` hay `/le-tan` rồi chờ chuyển hướng (chạy **cả bộ web**).
- **Tránh xung đột** (R11): (a) **không chạm** `router/role-shells.tsx`, `shared/routes/*`, `features/chat/*`, `features/notification/*` (Q20, T17); (b) `features/dashboard/index.ts` và dòng `import … from '../features/dashboard'` ở `role-routes.tsx` là chỗ chung của mọi task web của scope (cùng một người làm nên không xung đột giữa hai người): mỗi PR chỉ **thêm** một tên, task nào merge sau thì rebase; (c) trước khi mở PR F3: `git fetch`, xem `features/dashboard/` trên `origin/main`; nếu F1 đã có thẻ số dùng được thì **tái dùng**, nếu chưa thì F3 (hay F4 khi B1 trượt) dựng `features/dashboard/common/` (thẻ số, khối có tải-lỗi-rỗng, `overview-paths.ts`) và ghi rõ ở PR để F1 dùng lại, tránh viết hai lần (jscpd ≤ 3%); (d) `[ĐỤNG patient]` chỉ **sửa test và harness**, không sửa PLAN, TRACKING của patient (Đại sửa Q21e).

### 5.20 Trạng thái biên, hiệu năng, riêng tư, đột biến của phần mở rộng

**Ba trường hợp biên:**

| Trường hợp | Lễ tân | Bác sĩ | Bệnh nhân |
|---|---|---|---|
| **Chưa có dữ liệu** | năm thẻ `0` và câu "Hôm nay chưa có lịch khám nào tại chi nhánh." | "Hôm nay bạn chưa có lịch hẹn nào.", "Hôm nay không còn ca nào.", "Hôm nay bạn không có ca làm việc." | "Bạn chưa có lịch hẹn sắp tới." và nút "Đặt lịch khám"; ví `0 ₫` |
| **Bị khoá, chưa xác minh** | chưa xác minh không đăng nhập được (OTP) nên không tới trang; khoá hay ngưng **giữa phiên**: máy chủ kiểm trạng thái tài khoản ở **mỗi request** (`jwt-auth.guard`) ⇒ 401 ở mọi nguồn ⇒ client chung phục hồi phiên một lần rồi đưa về đăng nhập, **trang không tự xử lý riêng**; 403 `KHONG_DU_QUYEN` (Lễ tân không còn chi nhánh hiệu lực) ⇒ khối hiện lỗi cục bộ, **không lộ số** | như Lễ tân; Bác sĩ đổi chi nhánh vẫn xem được ca cũ (use case 2.4.24) | như Lễ tân; **khoá quyền tự đặt lịch** (vắng mặt vượt ngưỡng) **không** là khoá tài khoản: Tổng quan vẫn hiện, nút "Đặt lịch khám" dẫn tới luồng đặt lịch nơi quy tắc khoá có sẵn chặn; Tổng quan **không tự kiểm** |
| **Mất mạng, API lỗi, quá giờ** | `OfflineBanner`; khối số hiện `ErrorState` kèm "Thử lại"; khung trang còn | từng khối: lỗi và "Thử lại" riêng; khối khác vẫn hiện | như Bác sĩ |

**Hiệu năng.** Bác sĩ, Bệnh nhân: **không câu truy vấn mới** (API đã có và đã có chỉ mục `lich_hen_index_10`, `lich_hen_index_9`; chưa đo riêng, dùng số đo của booking `[cần điền]`). **B3** là câu **mới duy nhất**: đếm `lich_hen` hôm nay theo chi nhánh, chỉ có chỉ mục `(chi_nhanh_id, benh_nhan_id)` (không dẫn đầu bằng `thoi_gian`, cùng điểm với 5.10): **đo M5** (p95 cả service ≤ 200 ms, tiêu chí đã đặt ở 5.14, **không đổi sau khi thấy số**) **ở X3** (không ở X1: X1 chạy trước B3; **đã quyết** bởi phiên kiểm 28/11/2026) bằng bộ nạp 100.000 lịch của X1, lane nặng, xin phiên kiểm trước; không đạt thì hỏi Đại về chỉ mục (Q10), không tự thêm. `pageSize=100` của Bác sĩ chỉ là trần: một bác sĩ có vài chục lịch mỗi ngày.

**Riêng tư và log.** Mọi nguồn của Bác sĩ, Bệnh nhân đã `no-store`. Web **không** lưu số liệu vào kho trình duyệt (`localStorage`, `sessionStorage`), **không** ghi `console`, **không** đưa số hay tên vào URL; tên người khám chỉ hiện ở khối "Ca kế tiếp" (Bác sĩ đã xem được ở danh sách lịch hẹn của mình) và họ tên người khám của lịch sắp tới (Bệnh nhân xem lịch của chính mình hay người thân do mình quản lý). B3 chỉ trả số tổng hợp, tên chi nhánh, ngày (DRG-04 áp dụng cho route này); không ghi log của riêng mình. Đăng xuất: các khối bỏ số cũ (không giữ ở module-level).

**Đột biến web của phần mở rộng (mức GỌN; X3 chạy, lane nặng, xin phiên kiểm):** W1 web tự cộng lại tổng thay vì dùng số máy chủ (DBS-01, DLW-02); W2 một nguồn lỗi làm hỏng khối khác hay cả trang (DBS-05, DBN-06); W3 "hôm nay" theo múi giờ của trình duyệt (DBS-07); W4 "ca kế tiếp" bỏ điều kiện giờ của `DaXacNhan` hoặc không ưu tiên `DaTiepDon` (DBS-02); W5 gửi khoá chủ sở hữu hay chi nhánh lên máy chủ (DBS-08, DBN-07); W6 không huỷ kết quả cũ khi tải lại liên tiếp (DBS-05, DBN-06, DLW-03). Máy chủ: **đột biến 12** (Lễ tân không lọc chi nhánh, DLT-02) như 5.14.

## 6. Kế hoạch task

**Cách gọi mã task:** `B1`, `B2`, `X1`, `F1`, `F2`, `X2`, `B3`, `F3`, `F4`, `F5`, `X3`; ngoài file này viết "dashboard B1".

### 6.1 Sơ đồ phụ thuộc, việc bắt đầu ngay và việc phải chờ (`→` = phải xong trước)

```
Nền đã có: rbac (phạm vi) · booking, doctor, payment, wallet (dữ liệu) · admin web (khung, mục "Tổng quan")
Máy chủ       : B1 → B2 → X1 (đo thật)
Giao diện     : B1 → F1 ([SOẠN TRƯỚC] bằng API giả; merge sau B2) → F2 (cần cả B2)
Tổng kết      : F1, F2, X1 → X2
Ba vai trò    : B1 (CHƯA merge; task ĐẦU của Trung) → B3 → F3 (Lễ tân; [SOẠN TRƯỚC] bằng API giả, merge sau B3)
                F4 (Bác sĩ), F5 (Bệnh nhân): không cần B1, B3; cần phần dùng chung `common/` (F1 hay F3 dựng, task nào làm trước; F3 chưa merge được vì B1 trượt thì F4 dựng)
                X3 sau F3, F4, F5
Thứ tự làm đề xuất cho MỘT người (Q22): B1 → B2 → F1 → X1 (M1 đến M4) → F2 → X2 (Quản trị viên, 22 giờ), rồi B3 → F3 → F4 → F5 → X3 (ba vai trò, 11,5 giờ)
```

- **Ngay:** B1 (không phụ thuộc scope đang làm dở nào). **Sau B1:** B2; F1 viết trước được. **Sau B2:** X1. F2 sau F1 và B2, không chờ X1.
- **Một người làm cả scope (Trung, Q22; Đại review):** **B1 CHƯA merge ở 28/11/2026** (`apps/api/src/dashboard/` chưa có file nào) và là **task ĐẦU của Trung ngay khi xong chat**. Thứ tự làm đề xuất `[đề xuất]`: phần Quản trị viên trước (B1, B2, F1 `[SOẠN TRƯỚC]` bằng API giả rồi merge sau B2, X1 chỉ đo M1 đến M4, F2, X2: 22 giờ), rồi phần ba vai trò (B3 sau B1; F3 `[SOẠN TRƯỚC]` bằng API giả từ khi hợp đồng 5.7 đã chốt, merge sau B3; F4, F5 không cần B1 và B3, dùng `common/` do F1 hay F3 dựng; X3 sau F3, F4, F5: 11,5 giờ). Ba trang vẫn **đứng đầu danh sách cắt** theo văn bản Phạm vi: trượt giờ thì cắt F5, rồi F4, rồi F3 và B3 (Q21), nên làm phần Quản trị viên trước **không đổi thứ tự cắt**. B1 trượt thì làm F4, F5 trước B3, F3 (F4 dựng `common/` nếu F3 chưa merge được).
- **Chặn bên ngoài:** giờ rảnh của Trung (chat X1 đến X3, thông báo X3, vài việc payment) `[cần điền]`. X2 và X3 cần dữ liệu demo `[CHỜ Đại]`; giờ review của Đại cho 11 PR (6.4).

### 6.2 Danh sách task (mỗi task = một PR; **mọi task (B1, B2, X1, F1, F2, X2, B3, F3, F4, F5, X3): người làm Trung `junUTE`, người review Đại `MaxTrann`** (Q22; bản nháp 1 ghi Đại làm các task Quản trị viên); giờ là `[đề xuất]`)

| ID | Việc (file chính) | Phụ thuộc | Truy vết | Test case | Thẻ | Giờ | Mức |
|---|---|---|---|---|---|---|---|
| **B1** | `DashboardModule`, scope commit `dashboard`, bộ lọc và phạm vi, `GET /admin/dashboard` phần lịch hẹn: hôm nay, trong khoảng, vắng mặt, khung giờ; test kiến trúc, bộ dữ liệu D0 | — | b2 đến b4, TĐK, HĐK; Q1, Q2, Q4, Q7; T1 đến T6, T9, T12 | DQP-01…DQP-06, DBL-01…DBL-07, DVM-01…DVM-04, DKG-01…DKG-04, DHN-01…DHN-03, DRG-02, DRG-04 | `[ĐỤNG database]` `[ĐỤNG docker]` `[ĐỒNG BỘ TL]` | 4,5 | ĐB |
| **B2** | Cọc, đã hoàn, khoản đang lỗi, xu hướng ngày và tuần, yêu cầu chờ duyệt, cờ không có dữ liệu | B1 | b4, A1; Q3, Q5, Q6; T7, T8 | DCH-01…DCH-05, DXH-01…DXH-04, DCD-01…DCD-04, DRG-01, DRG-03 | `[ĐỒNG BỘ TL]` | 4 | ĐB |
| **X1** | Đo M1 đến M4 trên 100.000 lịch và giao dịch (M5 của Lễ tân đo ở X3); chọn hình dạng câu; đề xuất chỉ mục nếu cần | B1, B2 | R2; Q10; T13 | — (số đo) | `[CHỜ Đại]` | 3 | — |
| **F1** | Trang Tổng quan Quản trị viên: route `/admin`, bộ lọc, thẻ số, việc cần xử lý, tải, lỗi, rỗng, 375 px; tham số mở tab Chi nhánh | B1; B2 (`[SOẠN TRƯỚC]`) | b1 đến b4, A1; Q4, Q6, Q7; T10, T11 | DWB-01…DWB-11 | `[ĐỤNG admin]` `[ĐỤNG router]` | 5 | GỌN |
| **F2** | Biểu đồ xu hướng SVG và bảng số | F1, B2 | b4 (biểu đồ); Q5, Q8 | DBD-01…DBD-04 | — | 3 | GỌN |
| **X2** | Kiểm tay trình duyệt, đột biến lô, đồng bộ PLAN, TRACKING, `docs/TRACKING.md`, nháp nợ, tổng kết phần cam kết | F1, F2, X1 | mục 10 | DKT-01…DKT-04 | `[CHỜ Đại]` `[ĐỒNG BỘ TL]` | 2,5 | THƯỜNG |
| **B3** | `GET /reception/dashboard` (hợp đồng 5.7, SQL 5.16), người làm **Trung** | **B1** (cùng người làm; **chưa merge ở 28/11/2026**, task ĐẦU của Trung; chưa merge thì `[SOẠN TRƯỚC]`); không còn chờ X2 | Q9, Q12, Q15, Q19; T14 | DLT-01…DLT-06 | `[CẮT ĐƯỢC]` | 1,5 | THƯỜNG |
| **F3** | Trang Tổng quan Lễ tân làm trang mở đầu; menu; sửa test chuyển hướng của Lễ tân; **dựng phần dùng chung** `features/dashboard/common/` (thẻ số, khối tải-lỗi-rỗng, `overview-paths.ts`) cho F4, F5 nếu F1 chưa dựng; người làm **Trung** | B3 (`[SOẠN TRƯỚC]` bằng API giả; merge sau B3); xem F1 (5.19) | Q12, Q13, Q15, Q18, Q20; T15 đến T21 | DLW-01…DLW-04, DNV-01, DNV-04…DNV-08 (Lễ tân) | `[CẮT ĐƯỢC]` `[ĐỤNG router]` `[ĐỤNG auth]` `[ĐỤNG patient]` `[ĐỒNG BỘ TL]` | 3 | GỌN |
| **F4** | Trang Tổng quan Bác sĩ làm trang mở đầu: lịch hôm nay, ca kế tiếp, ca làm việc hôm nay, yêu cầu nghỉ phép chờ; menu; sửa test chuyển hướng của Bác sĩ; chỉ ghép API đã có | F3 (dùng chung `common/`; F3 chưa merge được vì B1 trượt thì **F4 dựng `common/`** và làm trước) | Q16, Q18, Q19, Q20; MH10, MH11; T15 đến T21 | DBS-01…DBS-09, DNV-02, DNV-04…DNV-08 (Bác sĩ) | `[CẮT ĐƯỢC]` `[ĐỤNG router]` `[ĐỤNG auth]` `[ĐỒNG BỘ TL]` | 3 | GỌN |
| **F5** | Trang Tổng quan Bệnh nhân làm trang mở đầu: lịch sắp tới, số dư ví, đặt lịch khám; menu; sửa test chuyển hướng và helper đăng nhập của Bệnh nhân; chỉ ghép API đã có | F3 hay F4 (dùng chung `common/`) | Q17, Q18, Q19, Q20; MH12; T15 đến T21 | DBN-01…DBN-08, DNV-03, DNV-04…DNV-08 (Bệnh nhân) | `[CẮT ĐƯỢC]` `[ĐỤNG router]` `[ĐỤNG auth]` `[ĐỤNG patient]` `[ĐỒNG BỘ TL]` | 2,5 | GỌN |
| **X3** | Kiểm tay ba trang ở 125 phần trăm và 375 px, đột biến web W1 đến W6 và đột biến 12, **đo M5 trên B3 với dữ liệu 100.000 lịch (cùng cỡ dữ liệu 5.14; lane nặng, xin phiên kiểm trước)**, đồng bộ PLAN, TRACKING, một dòng `docs/TRACKING.md` (nếu X2 chưa thêm), nháp nợ gửi Đại; nhắc việc Word 2.4 (Phụ lục C) | B3, F3, F4, F5 (phần chưa bị cắt) | mục 10 | DKT-05…DKT-10 | `[CHỜ Đại]` `[ĐỒNG BỘ TL]` | 1,5 | THƯỜNG |

**Phần Quản trị viên 22 giờ** (B1, B2, X1, F1, F2, X2; nội dung và giờ **không đổi**, chỉ đổi người làm sang Trung). **Phần Tổng quan ba vai trò 11,5 giờ** (B3 1,5 · F3 3 · F4 3 · F5 2,5 · X3 1,5; Cam kết, đứng đầu danh sách cắt `[CẮT ĐƯỢC]`). **Tổng 33,5 giờ, MỘT người làm (Trung, Q22)** (không kể review của Đại, khoảng 5,5 giờ cho 11 PR). Nếu cắt theo Q21: bỏ F5 còn 9 giờ; bỏ cả F4 còn 6 giờ (X3 thu nhỏ theo phần còn lại). Giờ F3 gồm phần dùng chung; nếu F1 đã dựng thẻ số dùng được thì F3 nhẹ hơn khoảng 0,5 giờ `[đề xuất]`.

### 6.3 File dùng chung và file của module khác, cách tránh xung đột

| File | Ai cùng chạm | Task | Cách |
|---|---|---|---|
| `apps/api/src/app.module.ts` | chat (`ChatModule` đã vào `main` ở `c61d4f6`), chatbot | B1 | một dòng `import`, một phần tử; tạo nhánh từ `main` mới; rebase khi trùng |
| `commitlint.config.cjs`, `AGENTS.md` (danh sách scope) | chatbot P1 | B1 | thêm đúng một từ; gộp sau PR chatbot P1 |
| `apps/web/src/features/admin/admin-routes.tsx`, `admin-overview-page.tsx`, `admin-layout.test.tsx` | module admin (Trung, Đại) | F1 | bỏ route `index` và trang rỗng, cập nhật `AF1-01`; kiểm PR admin đang mở trước khi mở PR |
| `apps/web/src/features/admin/clinic-info/clinic-info-page.tsx` | module admin | F1 | chỉ giá trị khởi tạo của tab; **phương án lùi** (T10): có PR admin đang mở chạm file này thì không sửa, liên kết không kèm tab, ghi nợ |
| `apps/web/src/router/role-routes.tsx` | chatbot (`root-layout`); chat đã xong phần router (`4c80486`) | F1, F3, F4, F5 | thêm mảng route của `dashboard`; F3, F4, F5 **thay** `<Navigate>` của khối mình; rebase khi trùng (5.19) |
| `apps/web/src/router/role-nav.ts`, test đăng nhập và chuyển hướng của ba vai trò | auth, patient (Đại) | F3, F4, F5 | mỗi task một mục "Tổng quan" (`to`, `end`); sửa đúng ca mong chuyển hướng của vai mình |
| `apps/web/src/features/dashboard/index.ts`, `features/dashboard/common/*` | F1, F2 | F3, F4, F5 | chỗ chung của mọi task web (cùng người làm): mỗi PR chỉ **thêm**; task nào làm trước dựng `common/` (F1 trước theo thứ tự đề xuất) (5.19) |
| `apps/api/src/dashboard/reception/*`, `dashboard.module.ts` | B1, B2 | B3 | B3 sau khi B1 merge (B1 chưa merge ở 28/11/2026); chỉ thêm thư mục `reception/` và một dòng ở `dashboard.module.ts` |
| `features/auth/*` test, `features/patient/testing/*` | auth, patient (Đại) | F3, F4, F5 | **chỉ sửa test và harness**, không PLAN hay TRACKING của hai module (Đại sửa Q21e) |
| `docs/database/*` | cửa sổ khác | — | **không sửa**, trừ khi Đại đồng ý chỉ mục sau X1 |
| `docs/features/{reschedule,chat,chatbot,notification}/*` | cửa sổ khác | — | **không sửa** |
| `docs/TECH_DEBT.md`, `AI_USAGE_LOG.md` | mọi người | mỗi PR | **phiên lập kế hoạch này không sửa**; đối chiếu số trên `origin/main` lúc ghi |

Dữ liệu demo cho kiểm tay và bảo vệ: seed hiện có tạo lịch dồn ít ngày; cách bổ sung dữ liệu trải ngày `[cần điền]` (không chạy `seed:*` lên `clinix` khi chưa được Đại đồng ý).

### 6.4 Ước giờ, Iteration và metric P1 (bản nháp 2 cập nhật Q22: **một người làm cả scope, Trung**; hạn mức giờ của Trung `[cần điền]`)

> Bản nháp 1 giả định Đại làm 20 giờ mỗi tuần cho mọi việc, chatbot ưu tiên (Q11). **Từ Q22 (28/11/2026) giả định đó không còn áp dụng cho scope này**: Đại giao cả scope cho Trung và chuyển sang bài viết và cẩm nang (F-6), chỉ review. Q20 của chat giả định Trung 40 giờ mỗi tuần, **chưa phải số thật**; Trung còn chat X1 đến X3, thông báo X3 và vài việc payment.

Thứ tự làm và chia Iteration `[đề xuất]` (một người; phần Quản trị viên trước, rồi ba vai trò theo thứ tự ưu tiên giữ, Q21):

| Iteration | Việc (Trung) | Giờ | Ghi chú |
|---|---|---|---|
| **8** (01/12 đến 07/12) | B1, **chỉ nếu** chat X1 đến X3 và thông báo X3 xong sớm | 4,5 | tuỳ chọn; B1 là task ĐẦU của Trung ngay khi xong chat |
| **9** (08/12 đến 14/12) | B1 (nếu chưa làm) 4,5 · B2 4 · F1 5 (`[SOẠN TRƯỚC]` bằng API giả, merge sau B2) | **13,5** | phần Quản trị viên, 13,5 trong 22 giờ |
| **10** (15/12 đến 21/12) | X1 3 (chỉ M1 đến M4) · F2 3 · X2 2,5, rồi B3 1,5 · F3 3 · F4 3 · F5 2,5 · X3 1,5 | **20** (8,5 Quản trị viên và 11,5 ba vai trò) | hạn 21/12; trượt thì cắt F5, rồi F4, rồi F3 và B3 (Q21); phần Quản trị viên không cắt |

**Tổng 33,5 giờ** (22 Quản trị viên và 11,5 ba vai trò) trong Iteration 9 và 10: 13,5 và 20. Giờ rảnh của Trung ở Iteration 9 và 10 `[cần điền]`; nếu Trung chỉ rảnh từ Iteration 10 thì cắt theo thứ tự đã ghi (Bệnh nhân, Bác sĩ, Lễ tân) trước khi cắt phần Quản trị viên; báo Đại sớm.

- **Review của Đại:** 11 PR, khoảng **5,5 giờ** (0,5 mỗi PR `[đề xuất]`) trải Iteration 9 và 10; Đại chuyển sang F-6 nên review xen vào việc đó (R9).
- **Rủi ro lịch (R14):** một người làm 33,5 giờ trước 21/12. **Chat X1 đến X3, thông báo X3, payment trượt bao nhiêu giờ vào Iteration 9 và 10 thì dashboard thiếu bấy nhiêu.** Khi đó: báo Đại sớm; phương án là cắt theo Q21 (ba trang Tổng quan, Bệnh nhân trước), thêm giờ hoặc lùi mốc, **không cắt chỉ số** của phần Quản trị viên.
- Chưa tính trong 22 giờ: PR chỉ mục nếu X1 không đạt (khoảng 2 giờ), sửa theo review.
- **Giờ ước cho việc LẬP KẾ HOẠCH này:** khoảng **3 giờ** `[đề xuất]` (đọc nguồn và mã 1,5; hỏi và đối chiếu 0,5; viết PLAN, TRACKING, nháp 1), cộng khoảng 0,5 giờ review mỗi người.
- **Giờ ước cho việc LẬP KẾ HOẠCH phần mở rộng (bản nháp 2):** khoảng **2,5 giờ** `[đề xuất]` (đọc nguồn, mã, use case, Figma Make 1,25; hỏi Đại và đối chiếu 0,25; viết PLAN, TRACKING, nháp 1), cộng khoảng 0,5 giờ review mỗi người. **Giờ làm mã: 33,5 giờ** (Trung); **giờ review: khoảng 5,5 giờ** (Đại).
- **Metric P1 của bản cam kết** (ngưỡng 90 phần trăm tại 07/12): dashboard hoàn thành sau mốc đó nên **đề xuất không đưa vào mẫu số ngày 07/12** (như chatbot, mốc riêng 21/12). Các issue `[CẮT ĐƯỢC]` (B3, F3, F4, F5) **thuộc cam kết F-5 nhưng đứng đầu danh sách cắt** (Phạm vi 27/11, mục 9); nếu cắt theo Q21 thì đóng với lý do "not planned" **kèm quyết định của Đại**; có tính vào mẫu số của metric P1 hay không `[cần điền]` (Đại).

### 6.5 Phương án tối thiểu khả thi (CHÍNH) và việc "làm sau nếu còn giờ"

**Phương án tối thiểu khả thi — đủ để demo và cam kết:**

| Mục | Nội dung |
|---|---|
| Task | B1, B2, X1, F1, F2, X2 (6 task) |
| Giờ | **22** |
| Có | đủ sáu chỉ số còn lại của đặc tả, bộ lọc ngày và chi nhánh, phạm vi hai loại Quản trị viên, A1, biểu đồ kèm bảng số, số đo thật ở 100.000 lịch và giao dịch |
| Bị cắt | mọi mục "làm sau" dưới đây (phần Tổng quan ba vai trò tách riêng ở bảng kế tiếp) |
| Rủi ro chính | R1 (lịch), R2 (hiệu năng), R3 (test cũ), R4 (dữ liệu demo) |
| Cam kết đề xuất | số trên dashboard khớp dữ liệu tính tay (bộ D0) 100 phần trăm; đúng phạm vi chi nhánh 100 phần trăm; M3 đạt hoặc có quyết định của Đại; mốc 21/12 |

**Phương án tối thiểu khả thi của phần Tổng quan ba vai trò (bản nháp 2; Trung làm) — Cam kết nhưng đứng đầu danh sách cắt:**

| Mục | Nội dung |
|---|---|
| Task | B3, F3, F4, F5, X3 (5 task) |
| Giờ | **11,5** (+ khoảng 2,5 giờ review của Đại cho 5 PR) |
| Có | ba trang chỉ đọc đúng 5.16 đến 5.18; mỗi người chỉ thấy dữ liệu của mình hay chi nhánh mình; Tổng quan là trang mở đầu (Q18); lỗi cục bộ; 125 phần trăm và 375 px |
| Bị cắt | mọi mục "làm sau" của bảng dưới |
| Thứ tự cắt khi trượt giờ (Q21) | **F5** (Bệnh nhân) trước, rồi **F4** (Bác sĩ), rồi F3 và B3 (Lễ tân). Cắt trang nào thì menu "Tổng quan" của vai đó **vẫn là nút vô hiệu** và chuyển hướng tạm **giữ nguyên** (không sửa test của vai đó) |
| Rủi ro chính | R9 (giờ review của Đại), R10 (test chuyển hướng), R11 (chỗ chung với F1, cùng người làm), R13 (dữ liệu demo) |
| Cam kết đề xuất | số trên ba trang khớp dữ liệu nguồn (so với danh sách và ví) 100 phần trăm; đúng chủ sở hữu và chi nhánh 100 phần trăm; không lộ dữ liệu vai khác; M5 đạt hoặc có quyết định của Đại; mốc 21/12 |

**"Làm sau" của ba trang, KHÔNG tạo issue** (giờ `[đề xuất]`): thẻ tin nhắn và thông báo chưa đọc (+1 giờ, Q20); Bệnh nhân: lượt khám hoàn thành, hồ sơ người thân, biểu đồ lịch sử khám (+1 đến 1,5), đếm ngược hạn thanh toán (+0,5); Bác sĩ: lịch 7 ngày tới, hoàn thành trong tuần, "Việc cần chú ý" (hồ sơ khám còn thiếu) (+2); Lễ tân: danh sách lịch chờ tiếp đón hôm nay có liên kết (+1,5); "Cập nhật lúc hh:mm" và tự làm mới (+0,5); API gộp riêng cho Bác sĩ và Bệnh nhân (+3, đảo Q19).

**Thứ tự làm thêm của phần Quản trị viên khi còn giờ:** (không còn mục nào: B3, F3 đã chuyển sang phần ba vai trò ở trên).

**"Làm sau", KHÔNG tạo issue:** so sánh với kỳ trước (+3 giờ); xuất CSV (+3); nút chọn nhanh kỳ (+1); lọc theo chuyên khoa, dịch vụ, bác sĩ (+4); thu tiền mặt tại quầy và doanh thu (+2); hàng đợi "nạp ví chưa cộng" và số bệnh nhân bị khoá đặt lịch (+2); tự làm mới (+1); tỉ lệ chấp nhận lời mời khi có module danh sách chờ (Khóa luận). Giờ là `[đề xuất]`.

### 6.6 Thông tin để sinh issue (**KHÔNG tạo issue lúc này**: Đại tự chạy script sau khi PR tài liệu merge)

> **Bản nháp 2 (cập nhật Q22, 28/11/2026):** **mọi task (11) do `junUTE` làm, `MaxTrann` review**; các chữ "giao `MaxTrann`", "review `junUTE`" ở đoạn và bảng dưới là của bản nháp 1 và **đã đổi**. Hành động với #747 đến #754 và issue cần tạo ở **6.6b**. Chia Iteration mới `[đề xuất]`: B2 và F1 chuyển từ 10 sang 9 (6.4).

Mỗi task một issue; nhãn `module:dashboard` (đã có, kiểm 28/11/2026) cộng `backend`, `frontend` (task web: `frontend`; task cần đồng bộ tài liệu thêm `docs-sync`; X1, X2, X3 thêm `testing` và không gắn `backend`); milestone `dashboard` (đã có); giao `junUTE` (người làm; Q22), review `MaxTrann` (Đại review mọi PR của scope); Epic `[dashboard] Epic · Dashboard và báo cáo vận hành` (nhãn `epic`, `module:dashboard`) gom mọi task; Iteration theo 6.4 (bản nháp 1: B3, F3 không gán Iteration; **bản nháp 2: B3, F3, F4, F5, X3 gán Iteration 10**, xem 6.6b); phụ thuộc theo cột "Phụ thuộc" ở 6.2. Tiêu đề issue dạng `[dashboard] <mã> · <tên> (<backend|frontend|docs|testing>)` (≤ 100 ký tự), tiêu đề PR ≤ 100 ký tự và `Closes #<issue>` ở thân PR (Epic dùng `Refs`). Khuôn thân issue theo issue chatbot #734 (đọc bằng `gh issue view 734`): `## Mô tả`, `## Truy vết`, `## Phụ thuộc`, `## Lưu ý` (thẻ trong PLAN; Iteration, giờ, mức kiểm; **Người làm: `junUTE`; người review: `MaxTrann`**; tiêu đề PR gợi ý; "Mã task trùng tên với task của module khác: khi nhắc ngoài PLAN này, viết dashboard B1"; "Figma chỉ là bản phác thảo"; "Chỉ đọc: không ghi bảng nào"; riêng B3, F3 (bản nháp 1) thêm "Phần cắt được, ngoài cam kết F-5 (Q14); không làm thì đóng với lý do not planned"; **bản nháp 2: B3, F3, F4, F5 thay bằng "Cam kết F-5 nhưng đứng ĐẦU danh sách cắt (Phạm vi 27/11/2026, mục 9; Q21: cắt từ cuối)"; người làm `junUTE`, người review `MaxTrann`**), `## Test case liên quan` (kèm "Danh sách đầy đủ và kết quả mong đợi: `docs/features/dashboard/PLAN.md` mục 7."), `## Đóng khi` (ô riêng ở bảng dưới, rồi bốn ô chuẩn: PR được người còn lại review và squash merge, tiêu đề theo Conventional Commits ≤ 100 ký tự, `Closes #<issue>`; test case đã chạy và ghi vào `docs/features/dashboard/TRACKING.md`; tài liệu đồng bộ đã cập nhật trong cùng PR; nếu có dùng AI đã ghi `AI_USAGE_LOG.md` hay `TRUNG_AI_USAGE_LOG.md`, không dòng `Co-Authored-By` của AI), dòng cuối: nguồn `docs/features/dashboard/PLAN.md`, task `<mã>`; thuộc Epic.

Nhãn `blocked` (gỡ khi điều kiện có): **X2** và **X3**: `[CHỜ Đại]` (dữ liệu demo và cho phép chạy kiểm tay). Q1 đến Q14 đã được Đại trả lời trực tiếp 26/11/2026; T1 đến T13 (4.3) đã được phiên kiểm duyệt kỹ thuật cùng ngày.

| ID | Tiêu đề issue | Tiêu đề PR (`<loại>(<scope>): …`) | Iter. | "Đóng khi" (ngoài bốn ô chuẩn) |
|---|---|---|---|---|
| B1 | `[dashboard] B1 · API tổng quan: bộ lọc, phạm vi, lịch khám, vắng mặt, khung giờ (backend)` | `feat(dashboard): thêm API tổng quan lịch khám, vắng mặt và khung giờ (dashboard B1)` | 9 | DQP-01…DQP-06, DBL-01…DBL-07, DVM-01…DVM-04, DKG-01…DKG-04, DHN-01…DHN-03, DRG-02, DRG-04 Pass; đột biến 1 đến 5 bị bắt |
| B2 | `[dashboard] B2 · Cọc, hoàn tiền, xu hướng đăng ký và yêu cầu chờ duyệt (backend)` | `feat(dashboard): thêm số liệu cọc, hoàn, xu hướng và yêu cầu chờ duyệt (dashboard B2)` | 9 | DCH-01…DCH-05, DXH-01…DXH-04, DCD-01…DCD-04, DRG-01, DRG-03 Pass; đột biến 6 đến 11 bị bắt |
| X1 | `[dashboard] X1 · Đo thật truy vấn tổng hợp ở 100.000 lịch và giao dịch (testing)` | `test(dashboard): đo thật truy vấn tổng hợp ở 100.000 lịch và giao dịch (dashboard X1)` | 10 | M1 đến M4 có số ở TRACKING mục 6 (M5 đo ở X3); tiêu chí không đổi sau khi thấy số; Đại đã xem số; nếu cần chỉ mục thì có câu trả lời của Đại |
| F1 | `[dashboard] F1 · Trang Tổng quan Quản trị viên: bộ lọc, thẻ số, việc cần xử lý (frontend)` | `feat(web): thêm trang Tổng quan Quản trị viên với bộ lọc và thẻ số (dashboard F1)` | 9 | DWB-01…DWB-11 Pass; cả bộ web xanh; đột biến web bốn loại bị bắt |
| F2 | `[dashboard] F2 · Biểu đồ xu hướng đăng ký khám và bảng số thay thế (frontend)` | `feat(web): thêm biểu đồ xu hướng đăng ký khám ở trang Tổng quan (dashboard F2)` | 10 | DBD-01…DBD-04 Pass; không thêm phụ thuộc; 375 px không tràn ngang |
| X2 | `[dashboard] X2 · Kiểm tay, đột biến và tổng kết dashboard (testing)` | `test(dashboard): kiểm tay, đột biến và đồng bộ tài liệu dashboard (dashboard X2)` | 10 | DKT-01…DKT-04 có kết quả thật; đột biến 1 đến 11 và bốn loại web bị bắt; `docs/TRACKING.md` một dòng; nháp nợ gửi Đại; mục 10 phần cam kết đạt |
| B3 | `[dashboard] B3 · API tổng quan rút gọn cho Lễ tân (backend)` (**giữ nguyên**) | `feat(dashboard): thêm API tổng quan trong ngày cho Lễ tân (dashboard B3)` | 10 (sớm hơn ở 9 khi B1 đã merge) | DLT-01…DLT-06 Pass; đột biến 12 bị bắt (M5 đo ở X3, không đòi ở issue này) |
| F3 | `[dashboard] F3 · Trang Tổng quan Lễ tân làm trang mở đầu (frontend)` (**giữ nguyên**) | `feat(web): thêm trang Tổng quan Lễ tân làm trang mở đầu (dashboard F3)` | 10 | DLW-01…DLW-04, DNV-01, DNV-04…DNV-08 (Lễ tân) Pass; cả bộ web xanh; đột biến web W1, W6 (phần Lễ tân) bị bắt; việc sửa 2.4 đã nhắc ở TRACKING; **không còn DKT-05 (chuyển sang X3)** |
| F4 | `[dashboard] F4 · Trang Tổng quan Bác sĩ: lịch hôm nay, ca kế tiếp, ca làm việc (frontend)` | `feat(web): thêm trang Tổng quan Bác sĩ làm trang mở đầu (dashboard F4)` | 10 | DBS-01…DBS-09, DNV-02, DNV-04…DNV-08 (Bác sĩ) Pass; cả bộ web xanh; W1 đến W6 (phần Bác sĩ) bị bắt; không thêm route API |
| F5 | `[dashboard] F5 · Trang Tổng quan Bệnh nhân: lịch sắp tới, số dư ví, đặt lịch (frontend)` | `feat(web): thêm trang Tổng quan Bệnh nhân làm trang mở đầu (dashboard F5)` | 10 | DBN-01…DBN-08, DNV-03, DNV-04…DNV-08 (Bệnh nhân) Pass; cả bộ web xanh; W2, W5, W6 (phần Bệnh nhân) bị bắt; không thêm route API |
| X3 | `[dashboard] X3 · Kiểm tay, đột biến và tổng kết Tổng quan ba vai trò (testing)` | `test(dashboard): kiểm tay, đột biến và đồng bộ Tổng quan ba vai trò (dashboard X3)` | 10 | DKT-05…DKT-10 có kết quả thật; W1 đến W6 và đột biến 12 bị bắt; **M5 có số đo trên B3 với dữ liệu 100.000 lịch, tiêu chí không đổi sau khi thấy số**; `docs/TRACKING.md` đủ **một** dòng; nháp nợ gửi Đại; mục 10 (phần ba vai trò) đạt |

**Nhãn Epic:** `[dashboard] Epic · Dashboard và báo cáo vận hành` gom **11** issue (8 cũ và F4, F5, X3); đóng khi phần cam kết đạt mục 10 (B3, F3, F4, F5 đã đóng bằng "Done", hoặc "not planned" kèm quyết định của Đại khi bị cắt theo Q21).

### 6.6b Mở rộng ba vai trò: hành động với #753, #754 và issue cần TẠO MỚI (Đại và phiên kiểm chạy script sau khi PR kế hoạch merge; phiên lập kế hoạch này KHÔNG tạo hay sửa issue)

Đọc bằng `gh issue view 753`, `754`, `750` (ngày 28/11/2026): cả hai đang giao `MaxTrann`, review `junUTE`, nhãn `module:dashboard` cùng `backend` hay `frontend` (và `docs-sync` ở #754), milestone `dashboard`, **chưa có Iteration**, thuộc Epic #746; #753 phụ thuộc #752 (X2), #754 phụ thuộc #753; thân có dòng "Phần cắt được, ngoài cam kết F-5 (Q14); không làm thì đóng với lý do not planned".

| Issue | Hành động | Lý do | Nội dung sửa hay tạo |
|---|---|---|---|
| **#747 đến #752** (B1, B2, X1, F1, F2, X2) | **GIỮ số, tiêu đề, Epic; SỬA người làm, người review, Iteration** (Q22) | Đại giao cả scope cho Trung; nội dung kỹ thuật và giờ không đổi | (1) bỏ người giao `MaxTrann`, giao `junUTE`; `## Lưu ý` ghi "Người làm: `junUTE`; người review: `MaxTrann`"; (2) ô `## Đóng khi` "PR được người còn lại (Trung) review và squash merge" đổi "(Trung)" thành "(Đại)"; (3) #747 (B1) `## Lưu ý` thêm "task ĐẦU của Trung ngay khi xong chat"; (4) Iteration `[đề xuất]`: B1 giữ 9, **B2 và F1 chuyển 10 sang 9**, X1, F2, X2 giữ 10; (5) #749 sửa thân thêm theo dòng #749 dưới; (6) nhãn không đổi |
| **#753** B3 | **GIỮ số issue; SỬA nội dung, người, phụ thuộc** (tiêu đề **giữ nguyên**) | API và test case vẫn đúng; chỉ đổi người làm, chỗ phụ thuộc và vị thế "cam kết" | (1) bỏ người giao `MaxTrann`, giao `junUTE`; `## Lưu ý` ghi "Người làm: `junUTE`; người review: `MaxTrann`". (2) `## Phụ thuộc`: **bỏ #752**, thêm **#747** (B1) kèm "`[SOẠN TRƯỚC]` khi B1 chưa merge". (3) `## Lưu ý`: thay dòng "Phần cắt được, ngoài cam kết F-5 (Q14); không làm thì đóng với lý do not planned." bằng "Cam kết F-5 nhưng đứng ĐẦU danh sách cắt (Phạm vi 27/11/2026, mục 9); thứ tự cắt Q21: F5, F4, rồi F3 và B3. Không làm thì đóng 'not planned' kèm quyết định của Đại."; dòng Iteration: "Iteration 10 (15/12 đến 21/12/2026 `[đề xuất]`), có thể làm ở Iteration 9 khi B1 đã merge". (4) `## Truy vết`: `Q9, Q12, Q15, Q19; T14`. (5) `## Test case liên quan`: `DLT-01…DLT-06`. (6) `## Đóng khi`: `DLT-01…DLT-06 Pass`, `đột biến 12 bị bắt`; **M5 không còn ở issue này: đo ở X3**. (7) gán Iteration 10 trong Project |
| **#754** F3 | **GIỮ số issue; SỬA nội dung, người, phụ thuộc** (tiêu đề **giữ nguyên**) | trang Lễ tân vẫn đúng như Q12, Q13; thêm vai trò dựng phần dùng chung | (1) người làm, review như #753. (2) `## Phụ thuộc`: giữ #753, ghi "`[SOẠN TRƯỚC]` bằng API giả; merge sau #753". (3) `## Lưu ý`: như (3) của #753; thêm "Dựng `features/dashboard/common/` cho F4, F5 (hoặc tái dùng của F1 nếu đã merge; báo Đại)"; giữ thẻ `[ĐỤNG router]` `[ĐỤNG auth]` `[ĐỤNG patient]` `[ĐỒNG BỘ TL]`; Iteration 10. (4) `## Mô tả`: thêm "bỏ chuyển hướng tạm tới Tra cứu bệnh nhân; sửa test `PL-09` và dòng Lễ tân của `LANDING_PATHS`". (5) `## Truy vết`: `Q12, Q13, Q15, Q18, Q20; T15 đến T21`. (6) `## Test case liên quan`: `DLW-01…DLW-04, DNV-01, DNV-04…DNV-08 (Lễ tân)`; **bỏ DKT-05** (chuyển sang X3). (7) `## Đóng khi`: như bảng 6.6 dòng F3 (bản nháp 2); bỏ ô "DKT-05 Pass" |
| **F4** | **TẠO MỚI** (phụ thuộc #754; B1 trượt thì F4 dựng `common/` và làm trước F3, ghi ở issue) | trang mới, người làm Trung | khuôn `gh issue view 750`; nhãn `module:dashboard`, `frontend`, `docs-sync`; milestone `dashboard`; giao `junUTE`; Iteration 10; phụ thuộc #754; thân theo hàng F4 ở 6.6 (tiêu đề, PR, Đóng khi) và 6.2 (thẻ, giờ 3, mức GỌN); Truy vết `Q16, Q18, Q19, Q20; MH10, MH11; T15 đến T21`; Test case `DBS-01…DBS-09, DNV-02, DNV-04…DNV-08` |
| **F5** | **TẠO MỚI** (phụ thuộc #754 hay F4 khi F4 dựng `common/`) | như F4 | như F4; giờ 2,5; Truy vết `Q17, Q18, Q19, Q20; MH12; T15 đến T21`; Test case `DBN-01…DBN-08, DNV-03, DNV-04…DNV-08` |
| **X3** | **TẠO MỚI** (phụ thuộc #753, #754 và F4, F5) | tổng kết và kiểm tay riêng cho ba trang, tách khỏi X2 (kiểm tay phần Quản trị viên) | nhãn `module:dashboard`, `testing`, `docs-sync`, `blocked`; **không** gắn `backend` hay `frontend`; giao `junUTE`; Iteration 10; giờ 1,5; Test case `DKT-05…DKT-10`; thẻ `[CHỜ Đại]` (dữ liệu demo); `## Mô tả` và `## Đóng khi` thêm "đo M5 trên B3 với dữ liệu 100.000 lịch (cùng cỡ dữ liệu PLAN 5.14), lane nặng xin phiên kiểm trước"; Truy vết thêm `Q10, T13` |
| **Epic #746** | **SỬA thân** | thêm ba task, đổi nhóm "Phần cắt được" | mô tả: thay "Phần cắt được: bản rút gọn cho Lễ tân." bằng "Cũng gồm trang Tổng quan chỉ đọc cho Lễ tân, Bác sĩ, Bệnh nhân (Cam kết F-5, đứng đầu danh sách cắt; Trung làm, Đại review)."; thay khối "Phần cắt được" bằng khối "**Tổng quan Lễ tân, Bác sĩ, Bệnh nhân (Iteration 10)**: #753 B3, #754 F3, F4, F5, X3"; sửa dòng "Epic đóng khi…" và "Chuỗi chính" (thêm `B1 → B3 → F3 → F4 → F5 → X3`); tổng giờ 33,5 (22 và 11,5) |
| **#749** X1 | **SỬA thân** (tiêu đề **giữ nguyên**: không ghi M1 đến M5) | M5 chuyển sang X3 (phiên kiểm, 28/11/2026): X1 chạy trước B3 nên không có gì để đo | ở `## Mô tả` ("Đo M1 đến M5 …"), ở dòng "không có test case riêng: số đo M1 đến M5 ở PLAN 5.14" và ở `## Đóng khi` ("M1 đến M5 có số ở TRACKING mục 6"): đổi **M1 đến M5 thành M1 đến M4**; thêm "M5 của Lễ tân đo ở X3 (dashboard X3)". Đã hiện ở hàng X1 của 6.2 và 6.6 |

**Thứ tự chạy script:** (1) sửa #753, #754; (2) tạo F4, F5, X3 (có số #754 để ghi phụ thuộc); (3) sửa Epic với số mới; (4) gán Iteration 10 (và 9 cho B3 nếu đã thống nhất). Không cần tạo nhãn hay milestone mới. Đóng #753, #754 "not planned" **chỉ khi** Đại quyết bỏ trang Lễ tân.

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

### 7.8 Lễ tân (DLT, DLW) — B3, F3 `[CẮT ĐƯỢC]` (Cam kết, đứng đầu danh sách cắt; người làm Trung)

| Mã | Loại | Kịch bản | Kết quả mong đợi |
|---|---|---|---|
| DLT-01 | E | mọi vai; Lễ tân bị khoá | 200 chỉ Lễ tân đang hoạt động; còn lại 401 hay 403 |
| DLT-02 | I | bộ D0 cho Lễ tân A, B | theo bảng 7.0 |
| DLT-03 | E | gửi `chiNhanhId` hay khoá khác; header | 400 `TRUONG_KHONG_DUOC_PHEP`; `no-store` |
| DLT-04 | I | đối chiếu với danh sách lịch hẹn hôm nay (lọc bốn trạng thái) và danh sách yêu cầu đổi lịch chờ của Lễ tân | bằng nhau |
| DLT-05 | I | đồng hồ giả qua nửa đêm, `TZ=UTC` | đổi ngày đúng |
| DLT-06 | I, E | Lễ tân A đổi sang chi nhánh B giữa hai request; Lễ tân bị khoá giữa hai request (cặp DQP-06) | request sau trả số của B; bị khoá: 401 hay 403 `KHONG_DU_QUYEN` (theo lớp chặn đầu tiên, như DLT-01), không trả số nào |
| DLW-01 | W | đăng nhập Lễ tân | ở `/le-tan` (không còn chuyển tới Tra cứu bệnh nhân; cặp DNV-01), "Tổng quan" sáng |
| DLW-02 | W | số và liên kết | đủ năm số, hai liên kết đúng đích |
| DLW-03 | W | đang tải, lỗi, "Tải lại", toàn 0; thiếu một khoá cần, thêm một khoá thừa | đúng trạng thái; thiếu khoá cần ⇒ lỗi, khoá thừa không làm vỡ |
| DLW-04 | W | 375 px, bàn phím | không tràn ngang; tới được mọi liên kết |

### 7.9 Kiểm tay trình duyệt (DKT) — X2 (DKT-01 đến DKT-04), X3 (DKT-05 đến DKT-10) (125 phần trăm và 375 px; không dùng DB `clinix` khi chưa được Đại đồng ý)

DKT-01 Toàn hệ thống: đối chiếu ba số (lịch khám hôm nay, nghỉ phép chờ, rút tiền chờ) với trang lịch hẹn và trang duyệt; DKT-02 Quản trị viên Chi nhánh: không ô chi nhánh, không dòng rút tiền, số khớp trang lịch hẹn; DKT-03 125 phần trăm, 375 px, chỉ bàn phím, trình đọc màn hình đọc thẻ và bảng số; DKT-04 mất mạng rồi "Thử lại", đổi bộ lọc nhanh, tải lại trang giữ bộ lọc; DKT-05 (X3) Lễ tân đăng nhập: vào thẳng Tổng quan, đối chiếu năm số với "Quản lý lịch hẹn" (lọc đúng trạng thái và ngày hôm nay) và số yêu cầu với "Yêu cầu đổi lịch"; DKT-06 (X3) Bác sĩ đăng nhập: đối chiếu số theo trạng thái và "Ca kế tiếp" với "Lịch hẹn", "Ca làm việc hôm nay" với "Lịch làm việc", số nghỉ phép chờ với trang nghỉ phép; DKT-07 (X3) Bệnh nhân đăng nhập: đối chiếu lịch sắp tới với "Lịch hẹn của tôi" (nhóm Sắp tới) và số dư với "Ví của tôi"; DKT-08 (X3) ba vai trò ở 125 phần trăm, 375 px, chỉ bàn phím, trình đọc màn hình đọc được thẻ và danh sách; DKT-09 (X3) mất mạng một nguồn rồi "Thử lại", bấm "Tải lại" liên tiếp, đăng nhập chéo hai tài khoản cùng vai (số khác nhau), đăng xuất rồi vai khác đăng nhập không còn số cũ; DKT-10 (X3) vào bằng liên kết có `from`, mở thẳng đường dẫn cũ (Hồ sơ người khám, Lịch làm việc, Tra cứu bệnh nhân) vẫn đúng, vai khác mở gốc khu vai trò kia bị chặn. Mỗi ca ghi kết quả thật vào TRACKING mục 2.

### 7.10 Điều hướng và trang mở đầu của ba vai trò (DNV) — F3 (Lễ tân), F4 (Bác sĩ), F5 (Bệnh nhân); mỗi task chạy ca cho **vai của mình** (mức GỌN)

| Mã | Kịch bản | Kết quả mong đợi |
|---|---|---|
| DNV-01 | Lễ tân đã đăng nhập vào `/le-tan` (F3) | ở lại `/le-tan`, không `replace` sang đâu; "Tổng quan" là liên kết có `aria-current="page"`; menu vẫn chín mục đúng thứ tự; không còn chuyển hướng tới Tra cứu bệnh nhân |
| DNV-02 | Bác sĩ đã đăng nhập vào `/bac-si-portal` (F4) | như DNV-01; menu sáu mục; không còn chuyển hướng tới Lịch làm việc |
| DNV-03 | Bệnh nhân đã đăng nhập vào `/benh-nhan` (F5) | như DNV-01; menu tám mục và "Về trang chủ"; không còn chuyển hướng tới Hồ sơ người khám |
| DNV-04 | mở một trang con của vai (`/le-tan/quan-ly-lich-hen`, `/bac-si-portal/lich-hen`, `/benh-nhan/lich-hen-cua-toi`) | "Tổng quan" **không** sáng (có `end`); mục của trang con sáng |
| DNV-05 | đăng nhập đúng vai không có `from`; có `from` hợp lệ; đã có phiên rồi mở `/dang-nhap` hay `/dang-ky` | vào Tổng quan; về `from`; chuyển về Tổng quan bằng `replace`; hành vi `return-to` không đổi |
| DNV-06 | vai khác mở gốc khu của vai này (Bác sĩ vào `/le-tan`, Bệnh nhân vào `/bac-si-portal`, Quản trị viên vào `/benh-nhan`) | cổng chặn như cũ; không dựng trang Tổng quan; **không có lời gọi API nào** của Tổng quan |
| DNV-07 | mở thẳng đường dẫn cũ của vai (Tra cứu bệnh nhân; Lịch làm việc; Hồ sơ người khám) và bấm liên kết menu của chúng | đúng trang, không chuyển hướng; `href` của menu không đổi |
| DNV-08 | khoá đường dẫn: mọi liên kết của Tổng quan so với hằng `shared/routes/*`; hai đường dẫn Bác sĩ viết trong `dashboard` so với `DOCTOR_PATHS` (ca đặt ở `router/`) | bằng nhau từng chữ |

### 7.11 Web Bác sĩ (DBS) — F4 (mức GỌN; dữ liệu giả theo đúng hình dạng thật, **tự viết trong `dashboard`**, không import fixture của module khác)

| Mã | Loại | Kịch bản | Kết quả mong đợi |
|---|---|---|---|
| DBS-01 | U, W | Lịch hôm nay: `demTheoTrangThai` đủ sáu khoá, có số ở `ChoThanhToan` và `DaHuy` | tổng = Đã xác nhận + Đã tiếp đón + Hoàn thành + Vắng mặt; hai trạng thái kia **không** vào; bốn số nhỏ đúng; lời gọi có `tuNgay` = `denNgay` = hôm nay Việt Nam, `trangThai=DaTiepDon,DaXacNhan`, `sapXep=CuNhat`, `pageSize=100` |
| DBS-02 | U, W | Ca kế tiếp: (a) `DaTiepDon` lúc 08:30 đã quá giờ và `DaXacNhan` lúc 09:00 chưa tới; (b) chỉ `DaXacNhan` lúc 08:00 đã qua; (c) `DaXacNhan` đúng bằng giờ hiện tại; (d) hai lịch cùng giờ; (e) không lịch | (a) chọn `DaTiepDon` (sớm hơn); (b) "Hôm nay không còn ca nào."; (c) chọn (không trước bây giờ); (d) giữ thứ tự máy chủ trả; (e) như (b); hiện giờ giờ Việt Nam, nhãn, dịch vụ, tên người khám; **không** SĐT, ngày sinh, lý do khám |
| DBS-03 | W | Ca làm việc: hai ca (sáng ở chi nhánh A, chiều ở B) với `nghiPhep` là `null`, `DaDuyet`, `ChoDuyet`, `TuChoi`; `batDau` là `null` | mỗi ca một dòng đúng chữ (`SHIFT_LABELS`, `formatShiftHours`, "N lịch hẹn", `SHIFT_STATUS_LABELS`); giờ không xác định không làm vỡ trang; không ca: "Hôm nay bạn không có ca làm việc." |
| DBS-04 | W | Nghỉ phép chờ: `total` là 0, 1, nhiều | "N yêu cầu đang chờ duyệt"; `0` hiện "Không có yêu cầu nào đang chờ"; lời gọi `trangThai=ChoDuyet`, `pageSize=1` |
| DBS-05 | W | từng nguồn lỗi (500, mất mạng, quá giờ, 403) khi hai nguồn còn lại tốt; "Thử lại" từng khối; "Tải lại" liên tiếp, phản hồi cũ về sau; thiếu một khoá cần, sai kiểu một khoá cần, thêm một khoá thừa | chỉ khối của nguồn đó hiện lỗi, khối khác giữ số; thiếu hay sai kiểu khoá cần ⇒ lỗi của khối đó, khoá thừa không làm vỡ; "Thử lại" chỉ gọi lại nguồn đó; kết quả cũ không đè mới; `OfflineBanner` khi mất mạng; không trắng trang |
| DBS-06 | W | cả ba nguồn rỗng | ba câu rỗng đúng chữ; số `0`; không lỗi |
| DBS-07 | U, W | đồng hồ giả 23:59:59 và 00:00:00 giờ Việt Nam dưới `TZ=UTC` và `TZ=Asia/Ho_Chi_Minh`; mở trang trước nửa đêm, "Tải lại" sau nửa đêm | "hôm nay" đúng ngày Việt Nam ở cả hai múi giờ; "Tải lại" dùng ngày mới; không tự làm mới |
| DBS-08 | W | quét các lời gọi và kho trình duyệt; đăng xuất rồi vai khác đăng nhập | chỉ ba route của Bác sĩ; **không** `bacSiId`, `benhNhanId`, `chiNhanhId`; không `localStorage`, `sessionStorage`, `console`; không còn số cũ |
| DBS-09 | W | 375 px; bàn phím | không tràn ngang; mọi liên kết tới được bằng Tab, vùng bấm tối thiểu 44 px; thẻ là danh sách có tiêu đề; mỗi khối có tên truy cập |

### 7.12 Web Bệnh nhân (DBN) — F5 (mức GỌN; dữ liệu giả theo hình dạng thật, tự viết trong `dashboard`)

| Mã | Loại | Kịch bản | Kết quả mong đợi |
|---|---|---|---|
| DBN-01 | W | Lịch sắp tới với `total` là 0, 2, 3, 7 | lời gọi `nhom=SapToi&pageSize=3`, không `benhNhanId`; hiện `total` và tối đa 3 mục (giờ Việt Nam, bác sĩ, chuyên khoa, người khám, nhãn trạng thái); `total` lớn hơn 3: liên kết "Xem tất cả"; mỗi mục là liên kết tới chi tiết đúng mã lịch |
| DBN-02 | W | lịch `ChoThanhToan` có và không có `hanThanhToan` | có: "Chờ thanh toán trước hh:mm dd/MM", **không** `setInterval`; không có: không dòng đó |
| DBN-03 | W | ví: `soDuKhaDung`, `soTienDangGiu` nhỏ, `0.00`, rất lớn | `formatVnd`; `0 ₫`; đủ chữ số, không đổi qua `number` làm lệch |
| DBN-04 | W | không lịch sắp tới; ví 0 | "Bạn chưa có lịch hẹn sắp tới." và nút "Đặt lịch khám"; ví `0 ₫` |
| DBN-05 | W | các liên kết | "Đặt lịch khám" tới `BOOKING_PATH`; "Xem tất cả" tới Lịch hẹn của tôi; "Mở ví" tới Ví của tôi (so với hằng `shared/routes`) |
| DBN-06 | W | một nguồn lỗi (lịch hay ví); "Thử lại"; "Tải lại" liên tiếp | như DBS-05 |
| DBN-07 | W | quét các lời gọi và kho trình duyệt | không `benhNhanId`; không lưu; không còn số cũ sau đăng xuất |
| DBN-08 | W | 375 px; bàn phím | như DBS-09 |

**Tổng mã test case sau bản nháp 2: 101** (70 của bản nháp 1, thêm DLT-06, DNV-01…DNV-08, DBS-01…DBS-09, DBN-01…DBN-08, DKT-06…DKT-10). Chưa chạy ca nào.

## 8. Đề xuất gom cụm (chỉ đề xuất — nhóm chốt)

**Cụm 1:** B1, B2, X1 (máy chủ đã đo thật, 11,5 giờ). **Cụm 2:** F1, F2, X2 (dùng được và tổng kết, 10,5 giờ). **Cụm 3 (Cam kết nhưng đứng đầu danh sách cắt; bản nháp 2):** B3, F3, F4, F5, X3 (11,5 giờ); Lễ tân (B3, F3: 4,5 giờ) cắt sau cùng, Bác sĩ (F4: 3) và Bệnh nhân (F5: 2,5) cắt trước (Q21). Muốn thấy giao diện sớm thì làm F1 bằng API giả ngay sau B1. **Cả ba cụm do Trung làm (Q22); thứ tự đề xuất: cụm 1, cụm 2, rồi cụm 3 (6.1, 6.4).**

## 9. Quy trình bắt buộc cho mỗi PR của scope

Theo `AGENTS.md` mục 5 và `CONTRIBUTING.md`: nhánh `feat/dashboard-…` do người dùng tạo, không làm trên `main`; viết test theo mã test case rồi code; chạy `lint`, `build`, `test` (và `test:int`, `test:e2e` cho task backend) ở máy và báo kết quả **thật**; task `[ĐỒNG BỘ TL]` cập nhật tài liệu trong **cùng PR** và nhắc việc Word ở 4.6; cập nhật `docs/features/dashboard/TRACKING.md` và tick ô; lối tắt vào `docs/TECH_DEBT.md`; ghi AI log theo người dùng; **không** `git add`, `commit`, `push` do AI; tiêu đề PR là commit cuối (squash), Conventional Commits, scope `dashboard` (hoặc `web`), ≤ 100 ký tự; PR cần người còn lại approve (phần Quản trị viên: Trung; **phần Tổng quan ba vai trò B3, F3, F4, F5, X3: Đại**) và CI xanh (bảy check bắt buộc). **Không đọc, in hay chép `.env` thật.**

## 10. Điều kiện hoàn thành scope (phần Quản trị viên: các dòng đầu; **phần Tổng quan ba vai trò (bản nháp 2): năm dòng cuối**; trang bị cắt theo Q21 thì bỏ dòng của trang đó và ghi quyết định của Đại)

- [ ] Use case chạy đúng b1 đến b4 và A1 trên dữ liệu mẫu, trừ chỉ số danh sách chờ (L1).
- [ ] Mọi mã test case DQP đến DBD đã chạy hoặc ghi rõ lý do hoãn ở TRACKING mục 2; DKT-01 đến DKT-04 có kết quả thật.
- [ ] Số trên dashboard khớp bảng tính tay của bộ D0 ở cả ba phạm vi.
- [ ] Đột biến 1 đến 11 và bốn loại web đều bị ít nhất một ca bắt.
- [ ] M1 đến M4 có số đo thật và kết luận; tiêu chí không đổi sau khi thấy số; chỉ mục (nếu thêm) có đồng ý của Đại và đồng bộ ba file `docs/database/*`.
- [ ] Không phụ thuộc mới, không bảng mới; không dữ liệu cá nhân trong phản hồi và log.
- [ ] `docs/TRACKING.md` có một dòng; nháp nợ gửi Đại; việc sửa văn bản (4.6) do Đại báo xong.
- [ ] CI xanh (bảy check), jscpd ≤ 3% (CI đo), 0 lỗi lint.
- [ ] (Ba vai trò) DLT-01…DLT-06, DLW-01…DLW-04, DNV-01…DNV-08, DBS-01…DBS-09, DBN-01…DBN-08 đã chạy hoặc ghi rõ lý do hoãn ở TRACKING mục 2; DKT-05…DKT-10 có kết quả thật.
- [ ] (Ba vai trò) đột biến 12 và W1 đến W6 đều bị ít nhất một ca bắt; M5 có số đo thật và kết luận; tiêu chí không đổi sau khi thấy số; chỉ mục (nếu thêm) có đồng ý của Đại.
- [ ] (Ba vai trò) mỗi vai chỉ thấy dữ liệu của mình hay chi nhánh mình; không thêm route API nào ngoài B3; không bảng mới, không phụ thuộc mới; web không lưu số liệu vào kho trình duyệt.
- [ ] (Ba vai trò) Tổng quan là trang mở đầu của vai đã làm; mọi test chuyển hướng cũ đã sửa trong cùng PR; cả bộ web xanh; vai bị cắt giữ nguyên chuyển hướng tạm và menu vô hiệu.
- [ ] (Ba vai trò) `docs/TRACKING.md` có **đúng một** dòng cho cả scope (X2 hoặc X3, task xong sau thêm); ba use case "Tổng quan" (Phụ lục C) đã được Đại thêm vào Word 2.4 và, nếu cần, 2.1_2.2, Đại báo xong.

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

## Phụ lục C. Nháp use case "Tổng quan" của Lễ tân, Bác sĩ, Bệnh nhân (bản nháp 2, 28/11/2026): để Đại chép vào Word 2.4 **trước 01/12/2026**; phiên này KHÔNG sửa file Word

**Nguồn.** Văn bản Phạm vi 27/11/2026 (`D:\du_lieu\TLCN_CLINIX\HO_SO_NOP_TRANG\Pham_Vi_Thuc_Hien_2026-11-27.md`), chép nguyên văn bằng script:

- Dòng F-5 ở mục 3: “F-5 · Trang Tổng quan cho từng vai trò (chỉ đọc); Quản trị viên có thêm thống kê và báo cáo vận hành: tỉ lệ vắng mặt (no-show), tỉ lệ sử dụng khung giờ, cọc và hoàn tiền, xu hướng đăng ký khám. · **Cam kết** · 3” (các cột nối bằng dấu chấm giữa)
- Mục 9, thứ tự cắt: “**Khối lượng nhóm F** lớn so với nguồn lực hai thành viên. Thứ tự cắt khi thiếu thời gian: Tùy chọn (bài viết và cẩm nang F-6, nạp ví MoMo, màn Nhân sự và Tài khoản), rồi trang Tổng quan của Lễ tân, Bác sĩ và Bệnh nhân (F-5, giữ trang của Quản trị viên), rồi tệp đính kèm và WebSocket của chat (F-3), rồi phần gợi ý bác sĩ chọn ngày và ca của chatbot (F-1); thống kê và báo cáo vận hành của Quản trị viên (F-5), luật an toàn của chatbot và luồng nhóm A đến E không cắt.”

**Cách dùng.** Khuôn theo bảng 2.4 (Mô tả; Tác nhân kích hoạt; Tiền điều kiện; Hậu điều kiện; Các bước thực hiện; Luồng thay thế). Tên use case là `[đề xuất]`; số use case trong Word `[cần điền]` (Đại gán; hai file có đánh số khác nhau). Số liệu khớp 5.15 đến 5.18 (chỉnh ở đây thì chỉnh cả hai). **"Tiêu chí chấp nhận" không có trong khuôn Word**: dùng để kiểm thử, không chép vào Word. Hiện hai file Word 2.4 **không có** use case "Tổng quan" (L12).

### 2.4.[cần điền]. Use case Xem trang Tổng quan của Lễ tân (tên `[đề xuất]`)

**Mô tả.**

Cho phép Lễ tân xem trang Tổng quan, là trang mở đầu sau khi đăng nhập, tóm tắt tình hình trong ngày hôm nay (giờ Việt Nam) của chi nhánh mình được gán: số lịch khám, số lịch chờ tiếp đón, đã tiếp đón, hoàn thành, vắng mặt, và số yêu cầu đổi lịch ngoài chính sách đang chờ xử lý; kèm đường vào các chức năng "Xem danh sách lịch hẹn" và "Xử lý yêu cầu đổi lịch ngoài chính sách". Lịch khám tính các lịch đã xác nhận, đã tiếp đón, hoàn thành và vắng mặt; không tính lịch chờ thanh toán và lịch đã hủy. Chỉ xem, không có thao tác ghi. Lễ tân chỉ thấy số của chi nhánh được gán; phạm vi do hệ thống kiểm tra trên từng yêu cầu dữ liệu, không chỉ bằng cách ẩn trên giao diện.

**Tác nhân kích hoạt.**

Lễ tân.

**Tiền điều kiện.**

Đã đăng nhập vai trò Lễ tân; tài khoản đang hoạt động và được gán chi nhánh.

**Hậu điều kiện.**

Thành công: Lễ tân xem được các số liệu của ngày hôm nay thuộc chi nhánh mình; không có thay đổi dữ liệu.

Thất bại: Không áp dụng (use case chỉ đọc); khi không đọc được dữ liệu, hệ thống thông báo lỗi và cho phép tải lại, không hiển thị số của chi nhánh khác hay số cũ.

**Các bước thực hiện.**

(1) Lễ tân đăng nhập (hệ thống chuyển tới trang Tổng quan) hoặc chọn mục "Tổng quan" trên menu.

(2) Hệ thống xác định chi nhánh của Lễ tân từ tài khoản (không nhận chi nhánh từ yêu cầu).

(3) Hệ thống tính số liệu của ngày hôm nay cho chi nhánh đó và hiển thị: số lịch khám, chờ tiếp đón, đã tiếp đón, hoàn thành, vắng mặt và số yêu cầu đổi lịch đang chờ xử lý.

(4) Lễ tân bấm "Tải lại" để cập nhật số liệu (hệ thống không tự làm mới) hoặc chọn một liên kết để sang "Xem danh sách lịch hẹn" hay "Xử lý yêu cầu đổi lịch ngoài chính sách".

**Luồng thay thế.**

A1. Không có lịch khám nào trong ngày hôm nay

3a. Hệ thống không có lịch khám nào của chi nhánh trong ngày hôm nay.

3b. Hệ thống hiển thị các số bằng 0 kèm thông báo "Hôm nay chưa có lịch khám nào tại chi nhánh."; số yêu cầu đổi lịch đang chờ vẫn hiển thị.

A2. Không đọc được dữ liệu (mất kết nối hoặc lỗi hệ thống)

3a. Hệ thống không lấy được số liệu.

3b. Hệ thống giữ khung trang, hiển thị thông báo lỗi và nút "Thử lại"; không hiển thị số nào.

A3. Tài khoản không còn hiệu lực hoặc không còn chi nhánh được gán

2a. Hệ thống phát hiện tài khoản bị khoá hay không còn chi nhánh hiệu lực.

2b. Hệ thống từ chối, không trả số liệu nào, thông báo không đủ quyền hoặc yêu cầu đăng nhập lại.

**Tiêu chí chấp nhận (để kiểm thử).** Số năm thẻ khớp danh sách "Xem danh sách lịch hẹn" lọc hôm nay và đúng trạng thái; số yêu cầu đổi lịch khớp danh sách yêu cầu đang chờ của Lễ tân (DLT-04); chỉ chi nhánh của mình (DQP, DLT-02, DLT-06); đổi ngày đúng giờ Việt Nam qua nửa đêm (DLT-05); sau đăng nhập vào Tổng quan, không còn chuyển tới Tra cứu bệnh nhân (DNV-01); lỗi, rỗng, 375 px (DLW-02 đến DLW-04).

### 2.4.[cần điền]. Use case Xem trang Tổng quan của Bác sĩ (tên `[đề xuất]`)

**Mô tả.**

Cho phép Bác sĩ xem trang Tổng quan, là trang mở đầu sau khi đăng nhập, tóm tắt công việc trong ngày hôm nay (giờ Việt Nam) của chính mình: số lịch hẹn hôm nay theo trạng thái (đã xác nhận, đã tiếp đón, hoàn thành, vắng mặt), ca khám kế tiếp, các ca làm việc hôm nay (chi nhánh, giờ, số lịch hẹn, nghỉ phép) và số yêu cầu nghỉ phép đang chờ duyệt; kèm đường vào "Xem danh sách lịch hẹn được phân công" và "Xem lịch làm việc bác sĩ". Ca khám kế tiếp là lịch hôm nay đã tiếp đón, hoặc đã xác nhận mà giờ hẹn chưa qua, sớm nhất. Lịch hôm nay không tính lịch chờ thanh toán và lịch đã hủy. Chỉ xem; Bác sĩ chỉ thấy dữ liệu của chính mình.

**Tác nhân kích hoạt.**

Bác sĩ.

**Tiền điều kiện.**

Đã đăng nhập vai trò Bác sĩ; tài khoản đang hoạt động.

**Hậu điều kiện.**

Thành công: Bác sĩ xem được số liệu hôm nay của chính mình; không có thay đổi dữ liệu.

Thất bại: Không áp dụng (use case chỉ đọc); khi một phần dữ liệu không đọc được, hệ thống chỉ báo lỗi ở phần đó và cho phép tải lại, các phần còn lại vẫn hiển thị.

**Các bước thực hiện.**

(1) Bác sĩ đăng nhập (hệ thống chuyển tới trang Tổng quan) hoặc chọn mục "Tổng quan" trên menu.

(2) Hệ thống xác định Bác sĩ từ tài khoản đăng nhập (không nhận mã bác sĩ từ yêu cầu).

(3) Hệ thống lấy lịch hẹn hôm nay, ca làm việc hôm nay và số yêu cầu nghỉ phép đang chờ duyệt của Bác sĩ.

(4) Hệ thống hiển thị bốn khối: lịch hôm nay theo trạng thái, ca khám kế tiếp, ca làm việc hôm nay, yêu cầu nghỉ phép đang chờ duyệt.

(5) Bác sĩ bấm "Tải lại" để cập nhật (hệ thống không tự làm mới) hoặc chọn liên kết sang "Xem danh sách lịch hẹn được phân công", "Xem lịch làm việc bác sĩ" hay trang nghỉ phép.

**Luồng thay thế.**

A1. Không có lịch hẹn hôm nay

4a. Hệ thống không có lịch hẹn nào của Bác sĩ trong ngày hôm nay (hoặc không còn ca nào chưa khám).

4b. Hệ thống hiển thị số 0 kèm thông báo "Hôm nay bạn chưa có lịch hẹn nào." hoặc "Hôm nay không còn ca nào."

A2. Không có ca làm việc hôm nay

4a. Hệ thống không có ca làm việc nào của Bác sĩ trong ngày hôm nay.

4b. Hệ thống hiển thị thông báo "Hôm nay bạn không có ca làm việc."

A3. Một phần dữ liệu không đọc được (mất kết nối hoặc lỗi hệ thống)

3a. Hệ thống không lấy được một trong ba nguồn dữ liệu.

3b. Hệ thống chỉ báo lỗi và nút "Thử lại" ở khối dùng nguồn đó; các khối khác vẫn hiển thị.

A4. Tài khoản không còn hiệu lực

2a. Hệ thống phát hiện tài khoản bị khoá hay bị ngưng hoạt động.

2b. Hệ thống từ chối, không trả số liệu nào, yêu cầu đăng nhập lại.

**Tiêu chí chấp nhận (để kiểm thử).** Số theo trạng thái và tổng khớp danh sách "Lịch hẹn" của Bác sĩ lọc hôm nay (DBS-01); ca kế tiếp đúng quy tắc (DBS-02); ca làm việc khớp "Lịch làm việc" (DBS-03); số nghỉ phép chờ khớp trang nghỉ phép (DBS-04); một khối lỗi không làm hỏng khối khác (DBS-05); "hôm nay" đúng giờ Việt Nam (DBS-07); chỉ dữ liệu của chính mình (DBS-08); sau đăng nhập vào Tổng quan, không còn chuyển tới Lịch làm việc (DNV-02).

### 2.4.[cần điền]. Use case Xem trang Tổng quan của Bệnh nhân (tên `[đề xuất]`)

**Mô tả.**

Cho phép Bệnh nhân xem trang Tổng quan, là trang mở đầu sau khi đăng nhập, tóm tắt lịch hẹn sắp tới và ví của chính mình: số lịch hẹn sắp tới và tối đa ba lịch gần nhất của bản thân và của người thân mình quản lý (kèm nhắc hạn thanh toán với lịch đang chờ thanh toán), số dư ví khả dụng và số tiền đang giữ; kèm đường vào "Đặt lịch khám", "Tra cứu danh sách / lịch sử lịch hẹn" và ví. Chỉ xem, không có thao tác ghi; Bệnh nhân chỉ thấy lịch và ví của chính mình.

**Tác nhân kích hoạt.**

Bệnh nhân.

**Tiền điều kiện.**

Đã đăng nhập vai trò Bệnh nhân (tài khoản đã xác minh và đang hoạt động).

**Hậu điều kiện.**

Thành công: Bệnh nhân xem được lịch hẹn sắp tới và số dư ví của chính mình; không có thay đổi dữ liệu.

Thất bại: Không áp dụng (use case chỉ đọc); khi một phần dữ liệu không đọc được, hệ thống chỉ báo lỗi ở phần đó và cho phép tải lại.

**Các bước thực hiện.**

(1) Bệnh nhân đăng nhập (hệ thống chuyển tới trang Tổng quan) hoặc chọn mục "Tổng quan" trên menu.

(2) Hệ thống xác định Bệnh nhân từ tài khoản đăng nhập (không nhận mã bệnh nhân từ yêu cầu).

(3) Hệ thống lấy các lịch hẹn sắp tới và tổng quan ví của Bệnh nhân.

(4) Hệ thống hiển thị: số lịch sắp tới và tối đa ba lịch gần nhất (ngày giờ, bác sĩ, chuyên khoa, người khám, trạng thái; lịch chờ thanh toán kèm hạn thanh toán), số dư ví khả dụng và đang giữ, nút "Đặt lịch khám".

(5) Bệnh nhân bấm "Tải lại" để cập nhật (hệ thống không tự làm mới), chọn một lịch để xem chi tiết, hoặc chọn "Đặt lịch khám" hay ví.

**Luồng thay thế.**

A1. Chưa có lịch hẹn sắp tới

4a. Hệ thống không có lịch hẹn sắp tới nào của Bệnh nhân.

4b. Hệ thống hiển thị thông báo "Bạn chưa có lịch hẹn sắp tới." kèm nút "Đặt lịch khám"; ví hiển thị bình thường (có thể 0 đ).

A2. Một phần dữ liệu không đọc được (mất kết nối hoặc lỗi hệ thống)

3a. Hệ thống không lấy được lịch hẹn hoặc không lấy được ví.

3b. Hệ thống chỉ báo lỗi và nút "Thử lại" ở khối tương ứng; khối còn lại vẫn hiển thị.

A3. Tài khoản không còn hiệu lực

2a. Hệ thống phát hiện tài khoản bị khoá hay bị ngưng hoạt động.

2b. Hệ thống từ chối, không trả số liệu nào, yêu cầu đăng nhập lại.

**Lưu ý.** Bệnh nhân bị khoá quyền tự đặt lịch trực tuyến (vắng mặt vượt ngưỡng) vẫn xem được Tổng quan; việc chặn đặt lịch do use case "Đặt lịch khám" và "Cộng dồn no-show & khóa đặt lịch" thực hiện.

**Tiêu chí chấp nhận (để kiểm thử).** Số lịch và ba lịch gần nhất khớp "Lịch hẹn của tôi" nhóm Sắp tới (DBN-01); nhắc hạn thanh toán đúng (DBN-02); số dư khớp "Ví của tôi" (DBN-03); chỉ dữ liệu của chính mình (DBN-07); sau đăng nhập vào Tổng quan, không còn chuyển tới Hồ sơ người khám (DNV-03).
