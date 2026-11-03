# Tracking — module `patient`

Nhật ký tiến độ riêng của module `patient` (Cập nhật hồ sơ cá nhân, Quản lý hồ sơ người thân, Tra cứu hồ sơ bệnh nhân, khung giao diện Bệnh nhân và Lễ tân).
Kế hoạch, task, phụ thuộc và danh sách test case nằm ở [`PLAN.md`](PLAN.md); file này chỉ ghi việc **đã làm** để sau này giải thích lại được (luồng chạy, test nào pass,
chỗ nào phát sinh vấn đề). Giữ vĩnh viễn trong repo, không xoá sau khi merge.

**Cách ghi**
- Thêm một dòng mới **sau mỗi task** (mã task `P*`/`B*`/`F*`/`D*`/`X*` theo PLAN.md mục 6), mới nhất ở cuối.
- "Test case": liệt kê mã test case ở mục 7 của PLAN.md (ví dụ `HS-01, HS-04`); "Kết quả": `Pass` / `Fail` / `Một phần` (ghi rõ ca nào ở cột cuối).
  Ca `Fail` phải có dòng sau ghi cách xử lý và lần chạy lại.
- Đổi kế hoạch khi đang làm thì sửa `PLAN.md`; ghi lý do ở cột cuối của dòng tương ứng.
- Câu hỏi Q1–Q27 (PLAN.md mục 4.2) được trả lời thì ghi vào mục 3 rồi bỏ thẻ `[CHỜ Qn]` trong PLAN.md.
- Khi cả module xong: thêm **đúng một dòng** vào `docs/TRACKING.md` ở gốc, trỏ sang file này.

## 1. Nhật ký

| Ngày | Việc đã làm | Test case | Kết quả | Vấn đề phát sinh / cách xử lý |
|---|---|---|---|---|
| 03/11/2026 | Lập `PLAN.md` bản nháp 1 (27 câu hỏi Q1–Q27); nhóm duyệt độc lập "đạt, duyệt có chỉnh" và trả lời đủ 27 câu ⇒ cập nhật PLAN thành bản nháp 2 (mục 4.2a), ghi quyết định ở mục 3 | Không áp dụng (chỉ tài liệu) | n/a | Q1 khác đề xuất (Bác sĩ được dùng `/profile`) ⇒ sửa B1, B2, HS-16, QP-02, QP-03, D1, thêm H14. Q21c ⇒ thêm task F11. Mục 5.3 bỏ phương án READ COMMITTED. Không còn thẻ `[CHỜ Qn]`; B8, F10 hoãn, B9, D5 không làm |
| 03/11/2026 | Phiên kiểm độc lập bản nháp 2: **đạt**, sửa 4 chỗ nhỏ trong `PLAN.md` — bỏ câu thừa về câu hỏi cụm 4 (mục 8); X1 phụ thuộc thêm F11; B6 (và Q19) ghi "phân trang theo `common/paging` (Q42 của PLAN admin)"; ghi bất biến "không câu đọc thường nào chạy trước hai câu đọc có khoá" ở mục 5.3, B5, NT-17 và thêm ca tất định NT-24 | Không áp dụng (chỉ tài liệu) | n/a | Phiên kiểm đã thử trên MySQL thật: `SELECT` thường trước khoá thấy 0 lịch hẹn mới commit, sau khoá thấy 1 ⇒ bất biến là bắt buộc. Chốt frame `475:2`: khối "Thông tin chuyên môn" không vào `/profile` (mục 3). `AI_USAGE_LOG.md`: chưa thêm, người dùng gộp khi mở PR plan sau khi PR F4 merge |

## 2. Kết quả test theo use case

Cập nhật lần chạy mới nhất; chi tiết từng ca xem mục 1.

| Nhóm test (PLAN.md mục 7) | Tổng số ca | Pass | Fail | Chưa chạy | Ngày chạy gần nhất |
|---|---|---|---|---|---|
| Cập nhật hồ sơ cá nhân (`HS-*`) | 24 | | | | |
| Quản lý hồ sơ người thân (`NT-*`) | 24 | | | | |
| Tra cứu hồ sơ bệnh nhân (`TC-*`) | 18 | | | | |
| Phân quyền và sở hữu (`QP-*`) | 8 | | | | |
| Khung giao diện Bệnh nhân / Lễ tân (`KG-*`) | 9 | | | | |
| Bảo mật dùng chung (`BM-*`) | 4 | | | | |

## 3. Quyết định đã chốt

Ghi câu trả lời cho các câu hỏi ở PLAN.md mục 4.2 và ngày chốt, để PLAN.md có thể bỏ thẻ `[CHỜ …]`. Quyết định ở đây là **quyết định cuối**, ưu tiên hơn đề xuất trong PLAN.md.

| Mã câu hỏi | Quyết định | Ngày chốt | Ghi chú (khác đề xuất? hệ quả cho task) |
|---|---|---|---|
| Q1 | **Có.** Bác sĩ được `GET/PUT /profile` (thêm `BacSi` vào `@Roles` của B1, B2); `GET /profile` của Bác sĩ trả thêm chi nhánh công tác chỉ đọc, lấy từ `bac_si.chi_nhanh_id` (nhóm đồng ý 03/11/2026, bỏ thẻ `[đề xuất]`). Trang Bác sĩ làm ở `doctor`. Bác sĩ vẫn 403 ở `/patient/relatives*` và `/reception/patients*` | 03/11/2026 | **Khác đề xuất.** Lý do: nhóm đã chốt 20/10/2026 gộp use case của Bác sĩ vào "Cập nhật hồ sơ cá nhân"; 2.4 bản Drive sót Bác sĩ ở dòng tác nhân; Figma có trang Bác sĩ. D1: thêm Bác sĩ vào tác nhân trong 2.4. HS-16, QP-02, QP-03 đổi; thêm H14 |
| Q2 | Cho sửa giới tính (tuỳ chọn); sửa 2.4 thêm giới tính | 03/11/2026 | Như đề xuất. D1 |
| Q3 | Lưu `Nam`, `Nu`, `Khac`; FE hiện "Nam", "Nữ", "Khác"; kiểm ở service, ghi chú dbml | 03/11/2026 | Như đề xuất. **Chỉnh:** báo Trung các mã này để trang xem Bệnh nhân của admin ánh xạ nhãn (mục 5). D2 |
| Q4 | A — **hoãn** ảnh đại diện; `GET /profile` trả `anhDaiDien: null` | 03/11/2026 | Như đề xuất. B8, F10 ⏸; `TECH_DEBT` (D6) |
| Q5 | A — Quét QR CCCD làm sau cùng (F9), chỉ ở giao diện, không gửi/lưu CCCD; cần nhóm cung cấp frame + mẫu chuỗi QR giả | 03/11/2026 | Như đề xuất |
| Q6 | Trang QTV dùng bố cục xem/sửa như Lễ tân + "Phạm vi quản trị" chỉ đọc; nhóm bổ sung frame | 03/11/2026 | Như đề xuất. F5 |
| Q7 | Ngày sinh `YYYY-MM-DD`, ngày có thật, 1900-01-01 ≤ x ≤ hôm nay (giờ VN); bản thân được để trống/xoá, người thân bắt buộc; hiển thị `dd/mm/yyyy` | 03/11/2026 | Như đề xuất. P1 |
| Q8 | Địa chỉ bản thân tuỳ chọn, ≤ 255, không ký tự điều khiển, rỗng ⇒ `NULL`; người thân không có địa chỉ | 03/11/2026 | Như đề xuất. P1, B3 |
| Q9 | Sửa đủ 5 trường; hồ sơ đã ngừng không sửa được (409 `HO_SO_NGUOI_THAN_DA_NGUNG`); được sửa khi có lịch hẹn | 03/11/2026 | Như đề xuất. B4, F6, D4 |
| Q10 | Nút "Ngừng sử dụng" trong khung sửa, có hộp xác nhận; hồ sơ đã ngừng vẫn hiện kèm nhãn; không có "sử dụng lại"; ngừng lần hai trả 200 không đổi | 03/11/2026 | Như đề xuất. B5, F7, D4 |
| Q11 | 409 `HO_SO_NGUOI_THAN_DANG_CO_LICH_HEN`, `chiTiet` là mảng `{maLichHen, thoiGian, trangThai, bacSi, chiNhanh}` sắp theo thời gian; gợi ý huỷ bằng câu chữ (liên kết khi `booking` có trang) | 03/11/2026 | Như đề xuất |
| Q12 | Tập "đang hoạt động" = `ChoThanhToan`, `DaXacNhan`, `DaTiepDon`, một hằng dùng chung; bỏ `[cần điền]` ở quy tắc 37 | 03/11/2026 | Như đề xuất. D3 (báo người làm `booking`) |
| Q13 | B — thư mục dùng chung `apps/api/src/appointments/` (hằng `ACTIVE_APPOINTMENT_STATES` + truy vấn đọc `lich_hen`), `booking` tiếp quản; hợp đồng khoá `benh_nhan` → `ho_so_nguoi_than` → `lich_hen` | 03/11/2026 | Như đề xuất. **Chỉnh:** (1) `TECH_DEBT` cho truy vấn viết cứng ở `admin/services/service.repository.ts` (nên chuyển sang hằng mới); (2) PLAN `booking` phải xác nhận hợp đồng khoá trước khi làm X3 |
| Q14 | Không giới hạn số hồ sơ người thân, không chặn trùng | 03/11/2026 | Như đề xuất. `TECH_DEBT` |
| Q15 | Chốt 8 giá trị mối quan hệ, bỏ `[đề xuất]` ở 2.4 và ghi chú dbml | 03/11/2026 | Như đề xuất. D2 |
| Q16 | Lễ tân tra cứu toàn hệ thống | 03/11/2026 | Như đề xuất. D4 |
| Q17 | Chỉ BN đã xác minh; tài khoản `NgungHoatDong` vẫn hiện kèm nhãn; người thân đã ngừng vẫn hiện kèm nhãn | 03/11/2026 | Như đề xuất |
| Q18 | Danh sách: họ tên, SĐT, email (+ mã tài khoản không hiển thị). Chi tiết: họ tên, email, SĐT, giới tính, ngày sinh, địa chỉ, ngày tạo, trạng thái, số lần vắng khám + người thân. Không có "Lịch sử lịch hẹn" (để `booking`), không mã nội bộ | 03/11/2026 | Như đề xuất |
| Q19 | `q` 2–100 ký tự; khớp chứa họ tên/email, SĐT khi `q` toàn chữ số; phân trang 20/100; GET `?q=`; FE tự tìm sau 300 ms + Enter | 03/11/2026 | Như đề xuất. `TECH_DEBT` (log truy cập proxy) |
| Q20 | A — không ghi nhật ký khi tra cứu/xem; không ghi khi sửa hồ sơ | 03/11/2026 | Như đề xuất. B9, D5 ✕; `TECH_DEBT` |
| Q21 | Mục chưa có trang vô hiệu; ẩn chuông; màn hẹp dùng ngăn kéo; cấu hình menu ở lớp router; trang mặc định chuyển tới "Hồ sơ người khám"/"Tra cứu bệnh nhân"; nút Đăng xuất trong khung; đường dẫn theo đề xuất | 03/11/2026 | Như đề xuất. **Chỉnh Q21c:** ngăn kéo màn hẹp tách thành task **F11** cuối cụm 1, không chặn merge F1, F2 |
| Q22 | Trạng thái chưa có frame dùng thành phần `shared/ui` có sẵn + câu chữ mục 5.9 | 03/11/2026 | Như đề xuất |
| Q23 | Một nguồn dữ liệu `tai_khoan`, không sao chép; `/auth/me` giữ nguyên; sửa câu HĐK 2.4; chấp nhận lịch hẹn cũ hiện tên mới | 03/11/2026 | Như đề xuất. D1 |
| Q24 | Hai lần lưu đồng thời: lần sau thắng, không khoá lạc quan | 03/11/2026 | Như đề xuất. `TECH_DEBT` |
| Q25 | Màu không đạt WCAG dùng token ADR 0004; ghi danh sách lệch Figma | 03/11/2026 | Như đề xuất |
| Q26 | Tên endpoint như PLAN mục 5.7 | 03/11/2026 | Như đề xuất |
| Q27 | Id sai dạng trên đường dẫn ⇒ 404 `KHONG_TIM_THAY` cùng thân với không tồn tại | 03/11/2026 | Như đề xuất |
| Mục 5.3 (H1) | Ngừng hồ sơ chạy dưới REPEATABLE READ: hai câu đầu là đọc có khoá, `SELECT` thường đầu tiên (đọc `lich_hen`) nằm sau khoá nên đã thấy mọi lịch hẹn đã commit; chỉ thêm `FOR SHARE` nếu NT-17 chứng minh cần | 03/11/2026 | Chỉnh của người duyệt; bỏ phương án READ COMMITTED |
| Mục 5.3 (bất biến) | **Không câu đọc thường nào** (`SELECT` không khoá, kể cả `findOne` qua repository) được chạy trước hai câu đọc có khoá trong giao dịch ngừng hồ sơ; không dùng `START TRANSACTION WITH CONSISTENT SNAPSHOT` | 03/11/2026 | Phiên kiểm độc lập thử trên MySQL thật (trước khoá thấy 0, sau khoá thấy 1). B5 phải có comment bắt buộc; ca tất định **NT-24** giữ bất biến |
| Frame `475:2` | Khối "Thông tin chuyên môn" của Bác sĩ **không** đưa vào `/profile`; module `doctor` lấy từ API hồ sơ bác sĩ (admin B12 hoặc `search`) | 03/11/2026 | Như PLAN. Lý do: chuyên môn do Quản trị viên sửa ở UC 47; đưa vào sẽ kéo `bac_si`, chuyên khoa, phụ phí vào module này và nhân rủi ro H14 |

## 4. Ghi chú AI

Mỗi lần dùng AI sinh mã/tài liệu cho module này phải được ghi vào `AI_USAGE_LOG.md` (bảng 1); lỗi AI phát hiện (`AI-BUG-nnn`) ghi ở bảng 2.
Dòng nhật ký ở mục 1 nên trỏ tới số thứ tự tương ứng khi có dùng AI.

| Ngày | Mục trong `AI_USAGE_LOG.md` (số thứ tự / `AI-BUG-nnn`) | Task liên quan |
|---|---|---|
| | | |

## 5. Phối hợp với module khác

Điểm cần báo người làm module khác khi task tương ứng merge (PLAN.md mục 3.3). Ghi ngày đã báo và phản hồi.

| Module / người | Điểm cần báo | Task | Ngày báo | Phản hồi |
|---|---|---|---|---|
| `auth` | Export hàm kiểm họ tên/SĐT và hàm làm mới `hoTen` qua `features/auth/index.ts`; nút Đăng xuất nằm trong khung BN/LT, F5 chỉ còn form đổi mật khẩu (Q21f) | P2, F1 | | |
| `admin` (Trung) | Sửa `to` của mục "Thông tin cá nhân" trong `admin-sidebar.tsx`; ghép route hồ sơ QTV ở `router/role-routes.tsx`; ghi `ho_so_nguoi_than` qua repository của `patient` trên entity của admin | F5, B3 | | |
| `admin` (Trung) | Mã giới tính `Nam`/`Nu`/`Khac` (Q3) để trang xem Bệnh nhân của admin (B17) ánh xạ nhãn "Nam"/"Nữ"/"Khác" | P1 | | |
| `admin` (Trung) | Truy vấn viết cứng tập "đang hoạt động" ở `admin/services/service.repository.ts` nên chuyển sang hằng `ACTIVE_APPOINTMENT_STATES` của `apps/api/src/appointments/` (Q13; đã ghi `TECH_DEBT`) | B5 | | |
| `admin` (Trung) | Bác sĩ tự sửa 5 cột hồ sơ ở `tai_khoan` qua `/profile` (Q1): thống nhất màn hồ sơ bác sĩ của admin có ghi các cột này không (H14) | B2 | | |
| `booking` | Hợp đồng khoá `benh_nhan` → `ho_so_nguoi_than` → `lich_hen`; kiểm `trang_thai_hieu_luc` dưới khoá; hằng `ACTIVE_APPOINTMENT_STATES` và hàm kiểm ở `apps/api/src/appointments/` (Q13 = B, `booking` tiếp quản); **PLAN `booking` phải xác nhận hợp đồng khoá trước X3**; cách cắm trang vào khung BN/LT | B5, F1, F2, X3 | | |
| `doctor` | Cách cắm trang Lễ tân (xem lịch bác sĩ) vào khung LT; trang "Thông tin cá nhân" Bác sĩ gọi `GET/PUT /profile` (Q1), khối "Thông tin chuyên môn" lấy từ API khác | F2, B1, B2 | | |
