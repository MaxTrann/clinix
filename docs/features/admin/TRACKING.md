# Tracking — module `admin`

Nhật ký tiến độ riêng của module `admin` (phần đầu: quản trị danh mục, nhân sự và cấu hình). Kế hoạch, task, phụ thuộc, câu hỏi và danh sách test case nằm ở
[`PLAN.md`](PLAN.md); file này chỉ ghi việc **đã làm** để sau này giải thích lại được (luồng chạy, test nào pass,
chỗ nào phát sinh vấn đề). Giữ vĩnh viễn trong repo, không xoá sau khi merge.

**Cách ghi**
- Thêm một dòng mới **sau mỗi task** (mã task `P*`/`C*`/`B*`/`F*`/`D*`/`X*` theo PLAN.md), mới nhất ở cuối.
- "Test case": liệt kê mã test case ở mục 7 của PLAN.md (ví dụ `CK-01, CK-03`); "Kết quả": `Pass` / `Fail` / `Một phần` (ghi rõ
  ca nào ở cột cuối). Ca `Fail` phải có dòng sau ghi cách xử lý và lần chạy lại.
- Đổi kế hoạch khi đang làm thì sửa `PLAN.md`; ghi lý do ở cột cuối của dòng tương ứng.
- Task đã gỡ thẻ `[CHỜ Qn]` thì ghi câu trả lời vào mục 3 và ngày chốt, rồi mới bắt đầu task.
- Khi cả module xong: thêm **đúng một dòng** vào `docs/TRACKING.md` ở gốc, trỏ sang file này.

## 1. Nhật ký

| Ngày | Việc đã làm | Test case | Kết quả | Vấn đề phát sinh / cách xử lý |
|---|---|---|---|---|
| 25/10/2026 | Lập `PLAN.md` bản nháp 1 (8 use case, 46 câu hỏi); nhận trả lời Q1–Q46 và cập nhật bản nháp 2 (thêm Q47, Q48; task B21; mục 4.2a, 5.10) | — | — | Tài liệu, chưa có test chạy. Dùng AI: **cần ghi `AI_USAGE_LOG.md`** (bảng 1). Còn mở: Q47, Q48, phần còn lại của Q45 |
| 25/10/2026 | Nhận trả lời Q47, Q48 (phương án B + quá hạn); cập nhật `PLAN.md` bản nháp 3: bỏ cổng chặn lúc duyệt, thêm quy trình quá hạn/dời hiệu lực (B22, 5.4), dừng email khi hủy/dời, test CN-100…CN-111 | — | — | Tài liệu. Việc còn lại: phần còn lại của Q45; xác nhận chi tiết schema khi viết migration |
| 26/10/2026 | P1 (#45): thêm sáu entity danh mục, migration có tiền kiểm tên chuẩn hóa, cập nhật registry và đồng bộ Q12/Q16 trong ba tài liệu schema | CK-18, DV-21 | Pass | Build, lint và unit 18/18 pass. `npm run test:int` trên MySQL 8.4: 4 file, 34/34 test pass, gồm CK-18/DV-21, migration up/down/up và `SHOW CREATE TABLE` khớp schema chuẩn cho 11 bảng auth + danh mục. Đã tạo lại ba DB test theo yêu cầu người dùng. Bảng P1 có sẵn thì dừng và liệt kê, không nâng cấp tại chỗ hoặc đổi dữ liệu. Làm rõ quy tắc 41–42: service chuẩn hóa trước khi lưu, UNIQUE kiểm giá trị đã lưu. Chờ người dùng commit/push, mở PR và người còn lại review/squash merge |
| 27/10/2026 | P2 (#46): thêm 8 entity nhân sự/bảng nền và migration 48 câu DDL từ schema chính thức; đăng ký entity/migration, bổ sung parity và vòng đời up/down | Không có mã test riêng; kiểm source migration và registry | Code và kiểm thử local hoàn tất; chờ PR | Lint, API/web build, Prettier trên TypeScript P2, unit API 210/210 và web 1/1 pass. `npm.cmd run test:int` 39/39 pass trên MySQL thật, gồm vòng đời up/down và so `SHOW CREATE TABLE` với SQL chính thức. Lỗi kiểm parity khi TypeORM tạo bảng nội bộ `typeorm_metadata` đã sửa (AI-BUG-006). Issue không yêu cầu đồng bộ `docs/database/*`. Chờ người dùng tự commit/push, mở PR và người còn lại review/squash merge |
| 27/10/2026 | P3 (#47): thêm 7 entity vận hành và migration 42 câu DDL; mở rộng enum audit theo toàn bộ PLAN 5.10, trạng thái rút/hủy/quá hạn, email `BoQua`; đồng bộ SQL, DBML và quy tắc nghiệp vụ | Không có mã riêng; kiểm nguồn DDL, registry, parity, up/down, CHECK/UNIQUE và không seed cấu hình | Pass | API lint/build pass; unit 212/212. `npm.cmd run test:int`: 5 file, 42/42 pass trên MySQL local, gồm `SHOW CREATE TABLE`, ràng buộc yêu cầu mở, `BoQua`, enum audit, singleton và không seed cấu hình. Không có thay đổi web. Chờ người dùng tự commit/push, mở PR và người còn lại review/squash merge |
| 27/10/2026 | P4 (#48): thêm `AdminFixtures` dùng lại auth fixture và DB test, tạo chi nhánh/7 thứ, danh mục, bốn vai trò/hai phạm vi admin, ca/khung giờ/lịch hẹn; helper Date, mock hàm gửi mail và chạy đồng thời chờ đủ kết quả | P4 không có mã riêng; 3 unit + 6 integration mới; CK-18 kiểm UNIQUE thật khi chạy đua | Code và kiểm thử local hoàn tất; chờ PR | API lint/build, unit 273/273; MySQL `test:int` 7 file, 101/101 pass (gồm 6 ca P4: DB test guard, 7 thứ/CHECK, vai trò/phạm vi, 7 trạng thái lịch hẹn, rollback, chạy đua UNIQUE); web lint/build và test 1/1 pass; Prettier mã P4 pass. Lần chạy test:int trong sandbox đã dừng do chờ lâu, lần ngoài sandbox hoàn tất. Mock mail chỉ là hàm Vitest có kiểu: auth chưa có `MailService` thật để ghép provider; không gửi thư. Không đổi schema/env/API. Nhật ký Trung mục 7; cách dùng tại `working-doc/P4/tracker.md`. Người dùng tự commit/push, mở PR để người còn lại review/squash merge |
| 27/10/2026 | P5 (#49): thêm helper `nowVN()`/`todayVN()`/`weekdayVN()` theo `Asia/Ho_Chi_Minh`, validate và áp dụng `TZ` cho tiến trình API; thêm unit và MySQL test qua hai phía nửa đêm | BS-37, SE-A14 | Pass | API unit 35/35, lint/build pass; MySQL integration 2/2 pass ở 23:59:59 và 00:00 trên session `+07:00`. Lần chạy đầu lộ việc mysql2 trả `WEEKDAY()+1` dạng chuỗi; test đã chuẩn hóa số và chạy lại pass. Harness chỉ dựng lại DB local `clinix_test`; không dùng DB Dev/Prod. Không đổi driver P3/schema/migration. Chi tiết tại `working-doc/P5/tracker.md`; nhật ký Trung mục 8 |
| 27/10/2026 | P6 (#50): thêm `PageQueryDto`, kiểu `Paged<T>`, helper escape LIKE, unit và MySQL integration spec | TK-05 (unit), TK-06 (unit + MySQL) | Một phần | Unit 11/11, MySQL SELECT integration 5/5, API lint/build pass. Test được chuyển vào `common/paging/test/`; imports resolve đúng. CK-17 và kiểm tìm kiếm đầy đủ qua endpoint còn phụ thuộc task danh sách. Chi tiết tại `working-doc/P6/tracker.md`; AI_USAGE_LOG.md chưa được thành viên cập nhật |

## 2. Kết quả test theo use case

Cập nhật lần chạy mới nhất; chi tiết từng ca xem mục 1.

| Nhóm test (PLAN.md mục 7) | Tổng số ca | Pass | Fail | Chưa chạy | Ngày chạy gần nhất |
|---|---|---|---|---|---|
| Quản lý chuyên khoa (`CK-*`) | 18 | 1 (CK-18) | 0 | 17 | 26/10/2026 |
| Quản lý loại dịch vụ khám (`DV-*`) | 21 | 1 (DV-21) | 0 | 20 | 26/10/2026 |
| Quản lý hồ sơ bác sĩ (`BS-*`) | | | | | |
| Tạo tài khoản nhân sự và kích hoạt (`NS-*`) | | | | | |
| Quản lý tài khoản người dùng (`TK-*`) | | | | | |
| Cập nhật thông tin phòng khám (`PK-*`) | | | | | |
| Cập nhật cấu hình hệ thống (`CH-*`) | | | | | |
| Quản lý chi nhánh / cơ sở (`CN-*`) | | | | | |
| Phân quyền theo phạm vi chi nhánh (`PQ-*`) | | | | | |
| Bảo mật dùng chung (`SE-A*`) | | | | | |
| Dữ liệu mẫu (`SD-*`) | | | | | |

## 3. Quyết định đã chốt trong lúc làm

Ghi câu trả lời cho các câu hỏi ở mục 4.2/4.2a của PLAN.md và ngày chốt, để PLAN.md có thể bỏ thẻ `[CHỜ …]`.
Chi tiết đề xuất và hệ quả của từng câu xem PLAN.md mục 4.2 (đề xuất ban đầu) và 4.2a (quyết định cuối). Quyết định kế thừa từ `auth` (không bàn lại) xem PLAN.md mục 4.1 và
`docs/features/auth/TRACKING.md` mục 3.

| Mã câu hỏi | Quyết định | Ngày chốt | Ghi chú |
|---|---|---|---|
| Q1 | Hai khoảng sáng/chiều; nhãn "giờ nhận khám" | 25/10/2026 | Khớp schema 19/10 và Figma |
| Q2 | Tên/địa chỉ/toạ độ áp dụng ngay; lịch + dịch vụ có ảnh hưởng vào yêu cầu duyệt; UI báo rõ phần đã lưu/đang chờ, kể cả khi yêu cầu bị từ chối | 25/10/2026 | PLAN 5.4; CN-27, CN-27b |
| Q3 | Mỗi chi nhánh một yêu cầu chưa hoàn tất (`ChoDuyet` hoặc `DaDuyet` chưa áp dụng); người gửi rút khi `ChoDuyet`; Toàn hệ thống hủy khi `DaDuyet` chưa có hiệu lực; trạng thái + audit riêng | 25/10/2026 | **Khác đề xuất.** Thiết kế schema: Q47 (chưa chốt); task B21 |
| Q4 | Cho phép tự duyệt; audit ghi người đề xuất và người duyệt | 25/10/2026 | TLCN; tránh kẹt khi chỉ có một Admin Toàn hệ thống |
| Q5 | Người duyệt chọn thời điểm; server ép `>=` thời điểm duyệt + số ngày báo trước | 25/10/2026 | Không được rút ngắn hạn báo trước |
| Q6 | Chặn đặt hoặc đổi lịch mới vào khung giờ không còn hợp lệ sau hiệu lực; kiểm tra ở `booking` | 25/10/2026 | **Mở rộng** (thêm "đổi lịch"). Admin cung cấp `getPendingEffectiveChanges`; ghi chú sang PLAN `booking` |
| Q7 | Không áp dụng rồi chỉ cảnh báo; mỗi lịch hẹn và ca tương lai bị ảnh hưởng phải được xử lý hoặc có quyết định rõ "vẫn tiếp nhận theo lịch cũ"; không tự hủy/hoàn tiền; TLCN chưa có luồng xử lý ⇒ chặn duyệt yêu cầu còn lịch/ca bị ảnh hưởng, cho xem danh sách cần xử lý | 25/10/2026 | **Không đồng ý đề xuất.** Ca tương lai bị ảnh hưởng cũng buộc tạo yêu cầu. Cách thực hiện chốt ở Q48 (phương án B: chặn **áp dụng**, không chặn duyệt) |
| Q8 | Chặn bỏ dịch vụ khi bác sĩ tại chi nhánh còn dùng làm dịch vụ khám chính; trả danh sách bác sĩ cần đổi trước | 25/10/2026 |  |
| Q9 | Thông báo tối thiểu; báo người đề xuất khi duyệt và từ chối; báo bệnh nhân khi có thay đổi ảnh hưởng; `[đề xuất]` 3 lần cách 5 phút; ghi và hiển thị trạng thái gửi thất bại | 25/10/2026 | SMTP nhận thư không bảo đảm đã đọc; bổ sung báo khi rút/hủy theo Q3 |
| Q10 | Toạ độ tùy chọn nhưng đủ cặp; kiểm miền; thiếu toạ độ vẫn hiển thị, không tham gia "gần nhất" | 25/10/2026 |  |
| Q11 | Admin Chi nhánh chỉ xem chuyên khoa, nhóm, dịch vụ; chỉ Toàn hệ thống sửa | 25/10/2026 | Danh mục dùng chung; sửa 2.4 (D2) |
| Q12 | `UNIQUE chuyen_khoa.ten` ở DB + chuẩn hoá bỏ khoảng trắng thừa trước khi lưu | 25/10/2026 | **Phải kiểm và xử lý dữ liệu trùng hiện có trước migration** (P1, CK-18) |
| Q13 | Docker volume; JPEG/PNG/WebP, giới hạn dung lượng, kiểm nội dung tệp, tên ngẫu nhiên | 25/10/2026 | Cần sao lưu volume; ghi `TECH_DEBT` |
| Q14 | Chỉ xoá nhóm rỗng; `thu_tu_hien_thi` nguyên không âm | 25/10/2026 |  |
| Q15 | Chưa làm bật/tắt toàn hệ thống; "chi nhánh ngừng cung cấp" = bỏ liên kết chi nhánh–dịch vụ | 25/10/2026 | Ngừng toàn hệ thống: chức năng/trạng thái riêng, sau này |
| Q16 | Chặn đổi thời lượng khi còn khung giờ tương lai/lịch hẹn hoạt động; giữ giá đã chốt; tên dịch vụ không trùng trong cùng nhóm, có UNIQUE `(nhom_dich_vu_id, ten)` sau chuẩn hoá | 25/10/2026 | **Bổ sung UNIQUE** giống Q12 (DV-20, DV-21) |
| Q17 | Chặn đổi dịch vụ khám chính khi còn lịch hẹn/ca tương lai bị ảnh hưởng, trả danh sách; kể cả hai dịch vụ cùng thời lượng | 25/10/2026 | BS-44 |
| Q18 | Mọi ca từ hôm nay theo giờ VN là còn chặn | 25/10/2026 | Chỉ nới khi dữ liệu giờ ca đáng tin cậy |
| Q19 | Chỉ gán mới chuyên khoa đang hoạt động; bác sĩ đã gán giữ khi không sửa trường này | 25/10/2026 |  |
| Q20 | Học vị điền sẵn, server vẫn kiểm; kinh nghiệm 0–60 là giới hạn nhập liệu | 25/10/2026 | **Việc nhóm:** xác nhận ánh xạ chức danh–học vị trước khi đưa vào báo cáo |
| Q21 | Module chỉ đọc và tính phụ phí; không mở màn cấu hình phụ phí; quy tắc "tắt mốc cao → dùng mốc thấp hơn còn hiệu lực, không về 0" | 25/10/2026 | **Là quyết định giá của nhóm**: ghi tường minh (D6), cài đặt thành quy tắc có tên + test, không tự suy từ truy vấn |
| Q22 | Liên kết kích hoạt hạn 24 giờ từ lúc tạo | 25/10/2026 | `STAFF_ACTIVATION_TTL_HOURS` |
| Q23 | ≥ 60 giây giữa hai lần, ≤ 5 lần/giờ/tài khoản; tính cả lần gửi đầu và lần lỗi | 25/10/2026 |  |
| Q24 | SĐT bắt buộc trong biểu mẫu (validator auth); kích hoạt thành công đặt `da_xac_minh_email = true` | 25/10/2026 | Sửa 2.4 (D3) |
| Q25 | Token 256 bit trong fragment `#`; DB chỉ lưu băm; xoá fragment khỏi thanh địa chỉ sau khi đọc | 25/10/2026 |  |
| Q26 | Admin Chi nhánh xem Bệnh nhân có lịch tại chi nhánh: họ tên, email, SĐT, ngày sinh, giới tính, trạng thái; không địa chỉ, thời điểm tạo, ví, no-show, hồ sơ khám | 25/10/2026 | **Ít hơn đề xuất** |
| Q27 | Không hiển thị Quản trị viên trong danh sách của Admin Chi nhánh, kể cả chính họ | 25/10/2026 | Sửa Figma (D7) |
| Q28 | Mở khoá xoá bộ đếm đăng nhập sai và khoá tạm; khoá bác sĩ có hiệu lực ngay, response nêu lịch hẹn/ca phụ thuộc | 25/10/2026 | **Bổ sung**: không coi "lọc bác sĩ khỏi tìm kiếm" là đã xử lý lịch cũ |
| Q29 | Thu hồi các phiên đang có **và** auth guard kiểm trạng thái mỗi request | 25/10/2026 |  |
| Q30 | Script tạo Admin Toàn hệ thống đầu tiên, chỉ chạy khi chưa có; email/mật khẩu từ môi trường; không log mật khẩu | 25/10/2026 |  |
| Q31 | Nút Mở khoá no-show chỉ hiện khi đang bị khoá, chỉ Toàn hệ thống; giữ `so_lan_no_show`; UI báo rõ no-show kế tiếp có thể khoá lại ngay | 25/10/2026 | Giảm số lần: use case điều chỉnh riêng |
| Q32 | Dùng hàm dọn tài khoản chưa xác minh quá hạn của auth A7 | 25/10/2026 | Chưa có ⇒ task phụ thuộc auth A7; không coi email hết hạn là đã dùng mãi |
| Q33 | Hotline quy tắc riêng (10 số hoặc 1800/1900); 4 trường bắt buộc ở service; lần lưu đầu tạo `id = 1` | 25/10/2026 |  |
| Q34 | Dùng cận trên ở PLAN 5.7; `w1 + w2 = 1`; mốc nhắc lịch không trùng, không rỗng; `so_ngay_bao_truoc_doi_gio_lam` 1–60 | 25/10/2026 | **Sửa:** không cho 0 (DB CHECK vẫn cho `>= 0`; service ép) |
| Q35 | Cấu hình lần đầu nhập qua biểu mẫu Admin có audit; seed chỉ dev/demo | 25/10/2026 |  |
| Q36 | Chỉ dùng dữ liệu demo có nhãn: ≤ 3 lịch/hồ sơ, tự đổi lịch 2 lần, check-in 30/15 phút, báo trước 3 ngày, w1 0,60 / w2 0,40 | 25/10/2026 | **Việc nhóm:** chốt từng số trước khi dùng trong báo cáo/demo như chính sách CLINIX |
| Q37 | Tab Lịch sử thay đổi: đọc audit `CapNhatCauHinh`, phân trang, chỉ Toàn hệ thống | 25/10/2026 | Màn nhật ký toàn hệ thống: use case audit riêng |
| Q38 | Lý do bắt buộc 1–500 ký tự sau trim; không đổi gì ⇒ "Không có thay đổi", không audit | 25/10/2026 |  |
| Q39 | Làm `AuditService` tối thiểu ngay và mở rộng enum: tạo nhân sự, khoá/mở khoá, duyệt/hủy/từ chối/rút/dời hiệu lực thay đổi chi nhánh, mở khoá no-show; không đưa mật khẩu/token vào audit | 25/10/2026 | **Khác đề xuất** (không chọn phương án i). Thêm hành động rút theo Q3. Trung xác nhận dùng toàn bộ tên giá trị PLAN 5.10 ngày 27/10/2026 khi làm P3 |
| Q40 | Tách `rbac` dùng chung; id ngoài chi nhánh người gọi ⇒ 404 như không tồn tại; 403 chỉ cho tài nguyên thấy được nhưng không có quyền hành động | 25/10/2026 | **Khác đề xuất.** Sửa 2.4 (D10); bỏ mã `NGOAI_PHAM_VI` |
| Q41 | Migration nền do task `db` của admin sở hữu (P2/P3); `booking`/`schedule` không tạo lại bảng | 25/10/2026 | Ghi rõ chủ sở hữu migration |
| Q42 | Offset, mặc định 20, tối đa 100; escape `%`/`_`; danh sách và `total` đều lọc theo phạm vi | 25/10/2026 |  |
| Q43 | Giờ VN thống nhất ở API, TypeORM **và session MySQL**; test 23:59/00:00 gồm `NOW()` phía DB | 25/10/2026 | **Bổ sung** so với đề xuất (P5, SE-A14) |
| Q44 | Seed idempotent cho dev/demo, từ chối ở production; tên/giá/giờ từ Figma ghi rõ dữ liệu minh họa | 25/10/2026 |  |
| Q45 | **Chốt một phần:** đồng ý lý do từ chối bắt buộc; không khoá tài khoản `ChoKichHoat`; phạm vi gửi lại liên kết | 25/10/2026 | Mục nghiệp vụ theo Q20, Q21, Q34, Q36. **Còn chờ:** thứ chưa khai báo, mã sự kiện thông báo, cách hiểu cửa sổ tiếp đón, mặc định `[đề xuất]` của cấu hình |
| Q46 | Tính lại danh sách ảnh hưởng khi xem và khi duyệt; lưu bản chụp lúc duyệt | 25/10/2026 | **Bổ sung:** kiểm lại lịch/ca chưa xử lý ngay trước khi job áp dụng (H19) |
| Q47 | Đồng ý thiết kế: `DaRut`/`DaHuy`, cột huỷ, ràng buộc một yêu cầu chưa hoàn tất mỗi chi nhánh (cột sinh UNIQUE `dang_mo_chi_nhanh`), audit, quyền thao tác. Người gửi chỉ rút khi `ChoDuyet`; Admin Toàn hệ thống từ chối yêu cầu `ChoDuyet` hoặc hủy yêu cầu `DaDuyet` khi `ap_dung_luc IS NULL` (kể cả khi `hieu_luc_tu` đã qua và yêu cầu đang bị hoãn theo Q48). Khi hủy: báo người đề xuất và bệnh nhân đã được thông báo; **dừng email thông báo thay đổi còn chờ gửi** | 25/10/2026 | Cần thêm giá trị `BoQua` cho `email_thong_bao.trang_thai` (đề xuất, xác nhận khi viết migration); email đang trên đường gửi không thu hồi được ⇒ luôn gửi thêm thông báo "hủy" |
| Q48 | **Phương án B** + xử lý quá hạn: cho duyệt và báo bệnh nhân trước N ngày; bệnh nhân/Lễ tân xử lý lịch hẹn, bộ phận phụ trách xử lý ca; `booking` chặn đặt/đổi vào vùng bị loại. Đến `hieu_luc_tu` job tính lại: sạch ⇒ áp dụng; còn ⇒ không áp dụng, không tự hủy/đổi/hoàn tiền, đánh dấu quá hạn/chờ xử lý, cảnh báo Admin. **Không tự áp dụng muộn** khi danh sách rỗng lại: Admin chọn thời điểm hiệu lực mới (đủ N ngày báo trước) và thông báo lại bệnh nhân, hoặc hủy theo Q47. `hieu_luc_tu` = thời điểm dự kiến; `ap_dung_luc` = lúc thực sự áp dụng | 25/10/2026 | Cập nhật 2.4 (D1), schema (D6), Figma (D7), test CN-100…CN-111. Chi tiết đề xuất cần xác nhận khi viết migration: cột `qua_han_luc`, `so_lan_doi_hieu_luc`, hành động audit `DoiHieuLucThayDoiChiNhanh`, mã sự kiện thông báo kèm phiên bản |

## 4. Ghi chú AI

Mỗi lần dùng AI sinh mã/tài liệu cho module này phải được ghi vào `AI_USAGE_LOG.md` (bảng 1); lỗi AI phát hiện (`AI-BUG-nnn`)
ghi ở bảng 2. Dòng nhật ký ở mục 1 nên trỏ tới số thứ tự tương ứng khi có dùng AI. **Lần lập kế hoạch này (25/10/2026) cũng cần một dòng ở bảng 1.**

| Ngày | Mục trong `AI_USAGE_LOG.md` (số thứ tự / `AI-BUG-nnn`) | Task liên quan |
|---|---|---|
| | | |
