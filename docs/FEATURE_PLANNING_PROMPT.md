# Prompt lập kế hoạch tính năng mới

Dùng khi bắt đầu một tính năng/module mới (đã tới lượt trong `PLAN.md` Phase 2–3). Mục tiêu: có
kế hoạch chia nhỏ task rõ ràng để hai người chia việc, và một file theo dõi để sau này tự giải
thích lại được "đã code gì, luồng chạy ra sao, test nào pass, chỗ nào phát sinh vấn đề" — phục vụ
cả việc chia việc lẫn ôn vấn đáp (rubric Mục 6).

Phỏng theo một prompt dùng để fix bug (học từ thực tập HQSOFT) — khác biệt chính: bug-fix có sẵn
code/pattern để đọc, còn tính năng mới thì nguồn sự thật là **đặc tả use case + thiết kế đã chốt**
trong repo `TLCN_CLINIX`, không phải code cũ. Bảng đối chiếu đầy đủ: xem `docs/TRACKING.md` ngày
13/10/2026 (hoặc hỏi lại agent nếu cần).

## Cách dùng

1. Xác định TOÀN BỘ use case thuộc module này — một module thường gồm nhiều UC rải ở nhiều
   actor khác nhau. Tra theo tên trong `2.1_2.2_Actor_UseCase_CLINIX.docx` (dự án không dùng
   Use Case ID, chỉ có tên). Ví dụ `auth`: Đăng ký tài khoản, Đăng nhập, Quên mật khẩu (Khách
   vãng lai), Đổi mật khẩu + Đăng xuất (dùng chung mọi vai trò đã đăng nhập), «include» Gửi
   email mã OTP (Dịch vụ Email). Không gộp UC thuộc module khác (ví dụ "Tạo tài khoản nhân sự",
   "Quản lý tài khoản người dùng" là việc của Quản trị viên — để dành cho module `admin` sau).
2. Mở `2.4_Dac_Ta_Use_Case_CLINIX.docx`, copy đúng acceptance criteria của TỪNG UC vừa liệt kê
   — **không diễn giải lại bằng trí nhớ**.
3. Điền các chỗ `<...>` trong prompt bên dưới.
4. Dán vào Claude Code (hoặc công cụ AI khác), chạy ở thư mục gốc repo `clinix-app`.
5. Đọc kỹ kế hoạch AI đưa ra trước khi đồng ý — đặc biệt mục 2 (có đụng thiết kế đã chốt không).
6. Hai người cùng xem `docs/features/<module>/PLAN.md` để chia task theo đúng các bước đã đánh dấu
   phụ thuộc/độc lập.

## Prompt

```
Bạn là Senior Software Engineer. Lập kế hoạch triển khai tính năng dưới đây cho CLINIX, theo
đúng quy ước đã có trong repo.

Đọc trước:
- CONTRIBUTING.md, docs/CODING_CONVENTION.md
- docs/PLAN.md — tính năng này thuộc Phase nào
- <đường dẫn đặc tả use case liên quan trong repo TLCN_CLINIX — dự án KHÔNG dùng Use Case ID,
  chỉ nhắc bằng TÊN use case>
- docs/database/clinix.dbml (schema DB chính thức, MySQL), docs/database/clinix_mysql.sql (DDL),
  docs/database/clinix_quy_tac_nghiep_vu.md (quy tắc DB vs quy tắc phải kiểm ở service). Class
  Diagram ở TLCN_CLINIX chỉ ở mức khái niệm và chưa đồng bộ với schema này — khi lệch, schema DB
  là nguồn đúng cho việc code; nếu schema lệch với acceptance criteria ở 2.4 thì NÊU RÕ chỗ lệch
  trong PLAN.md và hỏi lại, đừng tự chọn một bên.

Tên module: <ví dụ: auth — dùng đúng tên trong scope-enum của commitlint.config.cjs>

Danh sách use case cần hiện thực (một module thường gồm NHIỀU use case — liệt kê hết, mỗi
use case dán nguyên văn acceptance criteria từ 2.4, không diễn giải lại bằng trí nhớ):
- <Tên use case 1>: <acceptance criteria>
- <Tên use case 2>: <acceptance criteria>
- ...

Phạm vi: <trong scope / ngoài scope, nếu biết — ví dụ use case thuộc module khác nhưng liên
quan thì ghi rõ KHÔNG làm ở đây để AI không tự ý gộp vào>

Yêu cầu:
1. Chia kế hoạch thành các bước cụ thể; mỗi bước ghi rõ PHỤ THUỘC bước nào (làm tuần tự) hay
   ĐỘC LẬP (làm song song được) — để hai người chia việc dựa vào đây.
2. Phân tích: tính năng này có đụng bảng/API/hành vi của tính năng nào đã có không? Nêu cách
   xử lý để không phá vỡ thiết kế đã chốt.
3. Chỉ tạo đúng 2 file, không tạo thêm:
   - docs/features/<module>/PLAN.md
   - docs/features/<module>/TRACKING.md — tự cập nhật sau mỗi bước: ngày, việc đã làm, test
     case nào pass/fail, vấn đề phát sinh và cách xử lý.
4. Mỗi task truy vết được tới UC/acceptance criteria nào (phục vụ rubric TC2.1 — hội đồng đối
   chiếu sơ đồ/yêu cầu với mã nguồn).
5. Thiếu thông tin (acceptance criteria chưa rõ, DB chưa chốt...) → HỎI LẠI, không tự suy đoán
   hay bịa.
6. Nếu dùng AI sinh code theo kế hoạch này, nhắc ghi vào AI_USAGE_LOG.md theo quy ước đã có.
```

## Quy ước file kết quả

**`docs/features/<module>/PLAN.md`** — kế hoạch chi tiết: danh sách task, phụ thuộc/song song,
phân tích ảnh hưởng, liên kết UC. Sửa trực tiếp nếu kế hoạch đổi khi đang làm (giống `docs/PLAN.md`
ở gốc, chỉ khác là ở mức một module).

**`docs/features/<module>/TRACKING.md`** — nhật ký tiến độ của riêng module này:

| Ngày | Việc đã làm | Test case | Kết quả | Vấn đề phát sinh / cách xử lý |
|---|---|---|---|---|
| | | | Pass / Fail | |

**Sau khi merge:** giữ lại 2 file này vĩnh viễn trong repo — không xoá. Nó trở thành tài liệu kỹ
thuật của module, hữu ích khi hội đồng hỏi "giải thích luồng hoạt động của tính năng này" và khi
sửa lỗi/mở rộng về sau. Thêm **đúng 1 dòng tóm tắt** vào `docs/TRACKING.md` ở gốc, trỏ sang file
chi tiết — không chép lại toàn bộ nội dung.

**Commit cùng nhánh feature đó** (ví dụ `feat/auth`), review cùng PR với code — Trung đọc được kế
hoạch và tiến độ ngay trong lúc review, không cần hỏi lại ngoài lề.
