# P7 — Kế hoạch tải ảnh chuyên khoa lên Cloudinary

Status: Backend local + live Cloudinary verified — B1/F2 UI acceptance pending  
Mode: IMPLEMENT  
Owner: Trung  
Updated: 2026-10-28

## 1. Goal and scope

- Goal: thay phương án Docker volume của Admin P7 (#51) bằng Cloudinary.
- In scope: triển khai P7 backend upload/tiền xử lý/Cloudinary adapter, ledger và migration bổ sung, cleanup, endpoint/kiểm quyền, test và tài liệu/nháp issue.
- Out of scope: source UI/consumer B1/F2, avatar/bài viết, sửa env thật hoặc gửi/xóa Cloudinary thật, áp dụng migration lên DB dev/chia sẻ, sửa issue GitHub, commit/push/PR.
- Người dùng đã duyệt phương án tổng hợp mới nhất trong chat ngày 28/10/2026: Cloudinary, policy dung lượng linh hoạt, tự chỉnh chiều EXIF, API/uploadId và vòng đời ảnh. Người dùng tiếp tục duyệt thông số kỹ thuật và yêu cầu triển khai; các giá trị tại mục 3f đã được triển khai. Chỉ còn Cloudinary thật và B1/F2/UI acceptance chưa kiểm chứng.
- Acceptance local: implementation đúng mục 3a–3f, các check phù hợp pass, schema/docs đồng bộ; Cloudinary thật và UI acceptance ghi pending, không trình bày như đã nghiệm thu.

## 2. Evidence and context

- Kiểm chứng local P7 ngày 28/10/2026: API unit 863/863, MySQL P7 7/7 trên container MySQL mới/cổng 33307, typecheck/lint/build pass; Docker production build + Sharp Linux smoke pass. Chưa có Cloudinary thật/F2 acceptance hoặc CI PR.
- Runtime nội bộ đã có POST /admin/uploads/specialty-image, guard JWT/role thật + scope DB trực tiếp. C1 dùng chung chưa có, không tạo stub C1; kiểm này chỉ phục vụ endpoint P7.

- VERIFIED: issue https://github.com/MaxTrann/clinix/issues/51 đã đọc trong lượt khảo sát; issue gốc yêu cầu Docker volume, CK-11/SE-A7, D8 và auth P1/P6(web).
- VERIFIED: Admin PLAN mục Q13, H15, P7, B1, D8, CK-11 và SE-A7; TRACKING dòng Q13. Auth TRACKING mục 5 đã được đọc trong phiên phối hợp.
- VERIFIED: `docs/database/clinix_mysql.sql` có `chuyen_khoa.anh_dai_dien varchar(255)`; chưa có cột public_id riêng cho chuyên khoa.
- VERIFIED: checkout main sạch trước sửa; chưa thấy module upload, cấu hình volume ảnh hoặc proxy ảnh trong source đã khảo sát. Không đồng nghĩa trạng thái remote/nhánh khác.
- Tài liệu provider: https://cloudinary.com/documentation/upload_images ; phản hồi upload có secure_url/public_id. Hạn mức: https://cloudinary.com/documentation/billing_and_plans .
- UNKNOWN: kết quả upload Cloudinary thật, chất lượng trên UI F2 và dữ liệu legacy thực tế. Các giá trị kỹ thuật triển khai đã duyệt tại mục 3f, không còn xem là câu hỏi nghiệp vụ mở.

## 3. Questions, assumptions and decisions

### Decisions

- Chốt hướng ngày 28/10/2026: Cloudinary thay Docker volume; không triển khai code ở lượt này.
- Đã duyệt thiết kế: frontend gửi file qua API; API kiểm quyền/nội dung rồi gọi Cloudinary qua adapter. Không cần volume ảnh hoặc Nginx `/uploads/`.
- ADR Accepted ghi quyết định người dùng tại docs/adr/0001-admin-specialty-cloudinary.md; đây là quyết định thiết kế, không phải acceptance runtime.

### Quyết định thiết kế (đã được người dùng duyệt)

| ID | Cần chốt | Đề xuất để duyệt |
|---|---|---|
| Q1 | Đã duyệt thiết kế | Bảng quản lý `anh_tai_len` lưu secure_url/public_id, ID nội bộ, người tải, mục đích, trạng thái và thời điểm; chuyên khoa tham chiếu bằng FK. Có thay đổi schema ở bước triển khai, xem mục 3a. |
| Q2 | Đã duyệt thiết kế | POST multipart trường `file`; 201 trả uploadId/url/expiresAt. B1 nhận imageUploadId; không gửi khi sửa = giữ, null = gỡ, ID = gắn/thay. Backend kiểm quyền và trạng thái trong giao dịch, xem mục 3b. |
| Q3 | Đã duyệt thiết kế | Chưa gắn / Đã gắn / Chờ xóa; hạn chờ gắn 24 giờ, dọn mỗi giờ. Thay ảnh commit DB trước khi xóa ảnh cũ, lỗi xóa được lưu để thử lại. Tạo bản ghi/public_id trước gọi provider, timeout được đối soát, không retry mù; xem mục 3c. |
| Q4 | Đã duyệt và triển khai | Dev/test thiếu credential vẫn khởi động, upload báo chưa sẵn sàng; staging/production yêu cầu đủ cấu hình. Không tự retry upload. Lỗi 5xx giữ convention LOI_HE_THONG + requestId; timeout cụ thể tại mục 3f đã được triển khai và kiểm bằng fake provider. |
| Q5 | Đã duyệt và triển khai policy | Ảnh ≤ 2 MB không chủ động resize/nén; > 2 đến 10 MB tối ưu ≤ 2 MB, mục tiêu mềm 700–800 KB, nén trước/resize khi cần; tự chỉnh EXIF. Sharp/Cloudinary SDK và thông số nén/resize đã pin theo mục 3f; kiểm local pass, chất lượng UI còn manual acceptance. Không thêm widget, AI, crop tương tác hoặc upload trực tiếp browser. |

### 3a. Dữ liệu — thiết kế được duyệt, chưa phải DDL

- Bảng `anh_tai_len`: ID nội bộ UUID, public_id, secure_url, người tải, mục đích ảnh chuyên khoa, trạng thái, thời điểm tạo/hết hạn chờ gắn, thời điểm xác nhận upload thành công, thông tin lần thử xóa/lỗi đã làm sạch. URL/public_id lưu riêng, không phân tích URL để lấy public_id.
- Chuyên khoa tham chiếu bản ghi ảnh bằng FK nullable; mỗi ảnh chỉ gắn một chuyên khoa. API đọc chuyên khoa vẫn trả URL hiển thị. Không tự chốt tên FK, kiểu/độ dài cột hoặc migration timestamp ở lượt này.
- `chuyen_khoa.anh_dai_dien varchar(255)` hiện tại cần phương án chuyển đổi được review trước triển khai; kiểm dữ liệu cũ, không xóa hoặc diễn giải lại dữ liệu âm thầm. Đồng bộ ba tài liệu schema, entity/registry và migration qua project-change-data.
- P7 sở hữu bản ghi upload/adapter/dọn ảnh; B1 sở hữu gắn/thay/gỡ trong giao dịch chuyên khoa; F2 sở hữu UX chọn ảnh và gửi uploadId. Cùng review phần FK/schema để tránh hai task sửa chồng.
- Invariant cần thể hiện bằng constraint/index và transaction: public_id duy nhất trong phạm vi provider/môi trường; một ảnh tối đa một chuyên khoa tham chiếu; ảnh Chờ xóa không thể gắn mới. Cần index phục vụ chọn ảnh hết hạn/chờ xóa; DDL cụ thể được review riêng.
- Chuyển đổi dữ liệu/rollback: kiểm đếm ảnh cũ trước backfill, bổ sung cấu trúc mới trước khi đổi consumer, chưa bỏ cột cũ cho đến khi readback được xác minh. Dữ liệu cũ không xác định được public_id không được đoán hoặc tự xóa. Chốt rollback về đường đọc cũ trước khi loại cột; rollback DB không thể phục hồi tài nguyên Cloudinary đã xóa, nên hoãn cleanup destructive đến khi kiểm chứng chuyển đổi xong và được phép. Không chạy migration trong lượt PLAN.

### 3b. API contract — thiết kế được duyệt

- `POST /admin/uploads/specialty-image` (theo tiền tố `/api` của plan), multipart/form-data, trường `file`, đúng một ảnh; chỉ Admin Toàn hệ thống.
- Thành công HTTP 201, dữ liệu `{ uploadId: string, url: string, expiresAt: string }`; thời gian ISO 8601 có timezone. Khi triển khai dùng envelope chung đã kiểm chứng nếu repo có; không tự tạo envelope mới.
- expiresAt là hạn gắn ảnh vào chuyên khoa, không phải hạn URL Cloudinary. Không trả public_id như quyền thao tác cho client.
- B1 nhận `imageUploadId`: bỏ trường khi PATCH = giữ ảnh; null = gỡ; UUID = gắn/thay. Khi tạo, bỏ trường/null = không có ảnh.
- Backend kiểm đúng người tải, đúng mục đích, còn hạn, chưa gắn nơi khác; khóa/kiểm lại trạng thái cùng giao dịch gắn ảnh. Không chấp nhận URL/public_id tùy ý của client.
- Lỗi file/tham chiếu/tiền xử lý dùng 4xx có mã ổn định và thông báo rõ. Mã cụ thể đối chiếu registry trước code; không dùng thông báo đầu vào chỉ 2 MB khi ảnh gốc được nhận đến 10 MB.
- Lỗi provider dùng HTTP 503/504, mã LOI_HE_THONG và requestId theo filter hiện tại; không mở rộng error framework để trả mã 5xx riêng của upload. Auth/permission theo convention chung; kiểm cả lỗi quá cỡ tại multipart/proxy.

### 3c. Vòng đời ảnh — thiết kế được duyệt

| Trạng thái | Ý nghĩa | Chuyển tiếp |
|---|---|---|
| Chưa gắn | Ảnh upload chưa được chuyên khoa sử dụng; bản ghi/định danh được tạo trước gọi provider để không mất dấu khi lỗi | Chỉ gắn sau khi provider xác nhận upload thành công; hết hạn chuyển Chờ xóa |
| Đã gắn | Đang được chuyên khoa tham chiếu | Thay/gỡ thành công trong DB chuyển ảnh cũ sang Chờ xóa |
| Chờ xóa | Không được gắn mới; cần xóa hoặc đối soát tài nguyên provider | Xóa Cloudinary thành công/đã xác minh không còn tài nguyên thì xóa bản ghi quản lý |

- Dùng thời điểm upload_xac_nhan_luc (tên DDL sẽ review) để phân biệt upload đã thành công với đang chạy/kết quả chưa rõ. Chưa gắn không tự chứng minh ảnh sẵn sàng; chỉ cho gắn khi đã được provider xác nhận, còn hạn và đúng quyền/mục đích. Không thêm trạng thái nghiệp vụ thứ tư.
- Hạn chờ gắn 24 giờ; dọn mỗi giờ, tối đa 50 ảnh/lượt, chạy trong API và nhận việc bằng DB; không thêm Redis/queue/container riêng. Scheduler @nestjs/schedule đã triển khai và có DB lease. Tác vụ dọn và thao tác gắn ảnh phải phối hợp khóa/trạng thái DB, không chỉ kiểm ở bộ nhớ. Không xóa ảnh còn tham chiếu.
- Thay A → B: B upload; trong cùng giao dịch B1 gắn B, chuyển A sang Chờ xóa; chỉ sau commit mới gọi Cloudinary xóa A. Lưu DB lỗi thì A giữ nguyên, B còn Chưa gắn.
- Xóa provider lỗi: giữ bản ghi Chờ xóa và thông tin thử lại đã làm sạch; thử lại trong đợt dọn sau, không làm thao tác lưu chuyên khoa đã commit thành thất bại.
- Mỗi upload có public_id mới, không ghi đè ảnh cũ; không đưa PII vào định danh. Khi hủy form/đóng tab, không phụ thuộc browser gửi yêu cầu xóa.
- Timeout/lỗi không chắc chắn: không báo thành công hoặc tự retry upload; giữ dấu theo public_id đã cấp để đối soát. Không xóa bản ghi chỉ vì một lần kiểm tra chưa thấy ảnh khi upload có thể vẫn đang chạy; phải giải quyết kết quả chưa rõ trước khi kết luận đã dọn xong. Trường hợp chưa rõ được giữ lại để kiểm tra thủ công, không xây cơ chế tự phục hồi phức tạp ở P7; ghi giới hạn này vào TECH_DEBT khi implementation, không tự xóa dấu vết.
- Xóa có thể yêu cầu invalidate cache CDN, không hứa ảnh biến mất tức thời khỏi mọi cache.

### 3d. Tiền xử lý ảnh chuyên khoa — phương án tổng hợp đã duyệt

Phạm vi P7 chỉ ảnh chuyên khoa công khai; phần kiểm tra/xử lý/upload có thể dùng lại qua policy riêng, chưa triển khai avatar, chân dung bác sĩ hoặc bài viết.

| Hạng mục | Quy tắc đã duyệt |
|---|---|
| Đầu vào | Một ảnh tĩnh JPEG/PNG/WebP, tối đa 10 MB và 25 megapixel; kiểm magic bytes và giải mã thực tế, từ chối SVG, ảnh động, tệp rỗng/hỏng và tên traversal |
| Quy ước byte | MB = 1024 × 1024 byte; KB = 1024 byte; kiểm biên chính xác tại 2 MB, 10 MB và 25.000.000 pixel, thống nhất thông báo UI/API |
| Ảnh ≤ 2 MB | Kiểm hợp lệ; không chủ động resize hoặc nén lại. Có thể phải mã hóa lại để chỉnh EXIF/loại metadata; không cam kết giữ nguyên từng byte |
| Ảnh > 2 MB đến 10 MB | Tối ưu xuống ≤ 2 MB; thử nén trước, chỉ giảm kích thước pixel khi cần; không áp dụng một khung pixel cố định cho mọi ảnh |
| Chất lượng | 700–800 KB là mục tiêu mềm, ảnh 1–2 MB vẫn hợp lệ; không ép dung lượng bằng chất lượng quá thấp. Chất lượng/bước resize tại mục 3f đã duyệt; ảnh mẫu kỹ thuật pass, acceptance UI chưa chạy |
| Định dạng | Ảnh cần tối ưu ưu tiên WebP, giữ nền trong suốt. Không bắt buộc WebP lossless nếu không đạt dung lượng; nén có mất dữ liệu phải tuân mức chất lượng tối thiểu được duyệt |
| Resize | Giữ tỷ lệ, không crop/kéo giãn/phóng to; bỏ khung 512 × 512 px và trần 300 KB của bản kế hoạch trước |
| Chiều ảnh | Tự chỉnh chiều theo EXIF khi cần trước resize/nén; không AI đoán chiều hoặc nút xoay tương tác. Sau chỉnh loại orientation cũ để tránh xoay lại; metadata sai vẫn có thể cho kết quả sai |
| Metadata | Loại metadata không cần thiết/riêng tư như GPS khi xuất ảnh; không giữ toàn bộ EXIF chỉ để giữ hướng |
| Đầu ra | Trần bắt buộc ≤ 2 MB kể cả ảnh nhỏ bị mã hóa lại khi chỉnh chiều/metadata; nếu vượt trần xử lý theo policy chất lượng đã duyệt hoặc báo lỗi rõ, không âm thầm upload quá giới hạn |
| Preview | F2 hiển thị URL ảnh kết quả sau upload để kiểm trước khi lưu chuyên khoa; contain giữ trọn minh họa. Không cam kết làm nét ảnh gốc nhỏ/mờ |

- Luồng: kiểm quyền → kiểm file/số pixel → giải mã, chỉnh EXIF khi cần → bỏ metadata riêng tư → chọn nhánh theo dung lượng gốc (≤ 2 MB hoặc > 2 MB) → nén trước/resize khi cần theo policy → kiểm kết quả ≤ 2 MB → tạo bản ghi/public_id trước gọi Cloudinary → upload → xác nhận thành công → trả uploadId/url/expiresAt. Lỗi trước provider không thay ảnh đang gắn.
- Nơi xử lý là API, trước khi gửi Cloudinary; không dựa vào incoming transformation để đạt giới hạn. Giới hạn request multipart phải tính overhead để nhận đủ file 10 MB; decoder/buffer/CPU/RAM cần giới hạn, không chỉ tin header/metadata kích thước.
- Không nén nhiều lần nối tiếp từ bản đã mất dữ liệu; thử các mức từ ảnh nguồn đã chuẩn hóa. Chỉ dùng thông số tại mục 3f đã được duyệt; không tự giảm ngoài policy.
- Kiểm EXIF orientation 1–8, ảnh không EXIF, alpha, màu và độ nét trên màn hình thường/HiDPI; preview cuối phải phản ánh ảnh đã chuẩn hóa, tránh xoay hai lần. Test Sharp xử lý byte ảnh thật/generate và EXIF đã pass; chất lượng UI cuối vẫn cần manual acceptance.
- Mục tiêu mềm không phải điều kiện từ chối ảnh hợp lệ. Nếu không đạt trần 2 MB với policy chất lượng được duyệt, trả lỗi rõ; không tự hạ chất lượng/độ phân giải ngoài policy.
- Cấu hình tách giới hạn file gốc 10 MB, ngưỡng tối ưu/trần output 2 MB và pixel 25 MP; tên biến cụ thể còn review, chưa sửa env thật hoặc .env.example.

### 3e. Cấu hình, dependency và nghiệm thu

- Đã duyệt hướng Sharp + Cloudinary SDK; version, tương thích Windows/Docker Alpine, timeout và giới hạn xử lý cần kiểm/chốt trước cài. Dependency đã cài pin theo mục 3f; không nâng ngoài scope.
- Dev/test thiếu credential vẫn khởi động, upload báo chưa sẵn sàng theo convention; cấu hình dở dang phải báo rõ tên biến, không in giá trị. Staging/production yêu cầu đủ cấu hình.
- Test tự động mock Cloudinary, kiểm provider thật chạy riêng trên tài nguyên thử nghiệm. Không tự upload/xóa tài nguyên thật trong CI.
- P7 chịu trách nhiệm kỹ thuật upload/metadata/dọn ảnh, B1 gắn/thay/gỡ trong giao dịch và F2 UX/preview. Local test P7 không thay cho acceptance B1/F2 hoặc nghiệm thu chất lượng UI chưa chạy.

### Assumptions

- Phạm vi chỉ ảnh minh họa chuyên khoa công khai, không phải hồ sơ/ảnh bệnh nhân.
- Giữ allowlist JPEG/PNG/WebP và kiểm nội dung; input ≤ 10 MB/25 MP, output ≤ 2 MB theo mục 3d; tối ưu có điều kiện, server tạo định danh không chứa PII.
- Chưa xác minh có dữ liệu ảnh cần di chuyển; phải kiểm trước triển khai, không tự xóa volume/tệp/dữ liệu cũ.

### 3f. Thông số triển khai đã duyệt ngày 28/10/2026

- Dependencies pin: sharp 0.35.5, cloudinary 2.11.0, @nestjs/schedule 12.0.2; kiểm bằng registry và smoke Windows/Docker khi khả dụng.
- Ảnh lớn: thử WebP lossless, quality 85 rồi 80; chỉ khi chưa đạt 2 MB mới giảm chiều rộng/cao mỗi bước còn 85%, tối đa 6 bước, không giảm cạnh dài dưới 1600 px, không phóng to. Mọi thử từ nguồn đã chuẩn hóa, alphaQuality 100; dừng ngay khi đạt 2 MB, không ép 700–800 KB.
- Ảnh nhỏ: không chủ động giảm chất lượng/kích thước; chuẩn hóa hướng và loại metadata, kiểm đầu ra. Nếu mã hóa lại vượt trần cần xử lý theo policy chất lượng hoặc lỗi rõ, không âm thầm upload quá 2 MB.
- Tiền xử lý 15 giây, Cloudinary 20 giây/lần, API sau nhận file 45 giây, frontend dự kiến 60 giây ở F2. Hai upload xử lý đồng thời mỗi instance, bận trả 503. Deadline phải ngừng pipeline/request khi có thể, không chỉ Promise.race.
- Schema bổ sung UUID char(36), public_id varchar(255) phân biệt hoa thường/UNIQUE, secure_url varchar(2048) nullable; FK người tải, mục đích, ba trạng thái, thời điểm xác nhận/hạn gắn/tạo, số lần/lịch xóa, khóa nhận việc 5 phút và mã lỗi cuối. Chuyên khoa thêm FK nullable UNIQUE RESTRICT, giữ URL cũ.
- Dọn mỗi giờ, tối đa 50 ảnh/lượt, khóa nhận việc bằng DB, network ngoài transaction. Năm lần xóa lỗi thì giữ để kiểm tra thủ công. Timeout upload chưa rõ không tự gắn/xóa dấu vết; kiểm tra thủ công, không retry mù.
- Cấu hình policy typed trong backend; env chỉ Cloudinary credential và tiền tố tài nguyên theo môi trường. Dev/test bỏ trống được, cấu hình dở dang báo lỗi; staging/production đủ cấu hình.
- Nếu C1 chưa có, chỉ triển khai phần độc lập; endpoint chỉ bật khi scope ToanHeThong được kiểm bằng DB thật trên guard auth hiện có, không dùng stub hoặc bypass.

## 4. Core-feature impact

- Ảnh phục vụ thẻ chuyên khoa B1/F2; quyền upload theo Q11: Admin Toàn hệ thống, kiểm ở backend.
- Bỏ đường dẫn tương đối `/uploads/...` trong thiết kế mới; thay bằng tham chiếu Cloudinary theo Q1/Q2.
- Rủi ro tương thích: kiểu/độ dài dữ liệu, consumer hiển thị, ảnh cũ và lỗi provider. Giữ ảnh cũ khi thay ảnh thất bại; không mở rộng sang loại ảnh khác.

## 5. Proposed approach

- Frontend: F2 hiển thị preview từ url, gửi imageUploadId khi lưu; xử lý hạn gắn/loading/lỗi, không giữ secret; contract tại mục 3b.
- Backend: controller mỏng → UploadService (validation + EXIF/tối ưu có điều kiện mục 3d) → interface adapter → Cloudinary client. Giới hạn request/buffer trước giải mã; không gọi network trong transaction DB. Sharp/Cloudinary SDK đã pin theo mục 3f và kiểm build Windows/Linux.
- Data: đã duyệt hướng bảng quản lý + FK theo mục 3a; dùng project-change-data cho thiết kế DDL/migration, đồng bộ schema và review chuyển đổi dữ liệu cũ trước code.
- Integration: định danh ngẫu nhiên có phạm vi môi trường; mock adapter cho unit/integration; không giả thành công khi lỗi. Timeout/dọn ảnh theo Q3/Q4.
- Cấu hình đề xuất: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET chỉ backend; tách giới hạn ảnh gốc/ảnh sau xử lý theo mục 3d. `.env.example` chỉ placeholder ở bước implementation.
- Security/privacy: chỉ ảnh công khai; không ghi secret/nội dung ảnh vào log. Kiểm quyền trước upload; controller cần guard thật auth A4 và policy C1. Không yêu cầu auth P6(web) chỉ để proxy `/uploads` nữa.

## 6. Work breakdown và phạm vi kết thúc

| ID | Outcome | Trạng thái | Evidence |
|---|---|---|---|
| T1 | Thiết kế/nháp issue đồng bộ | done | Q13, mục 3a–3f và mục 10 |
| T2 | Chốt kỹ thuật/ADR | done | Người dùng duyệt, ADR Accepted, policy/config typed |
| T3 | Processor/adapter/ledger/cleanup/migration | done locally | Unit, type/lint/build, MySQL P7, Docker smoke |
| T4 | Endpoint P7 và quyền thực tế | done locally | HTTP tests với guard thật, scope DB test; không bypass C1 |
| T5 | Tài liệu và kiểm chứng local | done locally | tracker.md, DEV_SETUP, ba tài liệu schema, TECH_DEBT |
| T6 | Cloudinary thật, B1/F2 và UI acceptance | pending — ngoài kết quả local | Không có credential thật, B1/F2 thuộc task sau |

## 7. File/module impact thực tế

- API: common/upload, entity FK chuyên khoa, database entities/migrations/registry và test parity/lifecycle, env validation/test-env, manifest/lock và config test:p7.
- Docs: Admin PLAN/TRACKING, ba tài liệu database, DEV_SETUP, TECH_DEBT, ADR, .env.example placeholder, plan/tracker P7. Không sửa .env thật, source web hoặc AI_USAGE_LOG.md.
- Không sửa Compose/Nginx/Vite: API nội bộ không thêm global prefix; proxy /api là phần auth P6, UI ảnh ở F2. Không commit/push/PR hoặc sửa issue GitHub.
- Migration chỉ chạy trong container MySQL mới dành cho test P7; không áp dụng DB dev/chia sẻ. Container test riêng được dừng sau kiểm chứng, không động container/volume cũ.

## 8. Verification

- API npm test: 47 file, 863/863 pass, gồm processor/EXIF/nén/resize thực, HTTP multipart/auth/capacity, provider fake/deadline và cleanup.
- npm run test:p7: 7/7 MySQL thật; chỉ CREATE DB mới timestamp và DB tham chiếu, không reset DB người dùng. Kiểm scope DB, gắn/rollback, gắn cùng ảnh, worker nhận việc, retry 5 lỗi, FK/CHECK và SHOW CREATE TABLE parity. Test gỡ URL legacy bằng null đã bổ sung.
- API lint, tsc --noEmit và build pass. Docker prod build và native Sharp Linux/Node 22 smoke pass; local Node có EBADENGINE từ Nest tooling cũ nhưng build thực tế pass, không tự nâng dependency ngoài scope.
- jscpd Linux: 131 file, trùng 0,91%, dưới ngưỡng 3%; không có clone mới trong module upload. Lệnh jscpd Windows trả 0 nhưng không phân tích file nên không dùng làm evidence.
- Gitleaks scan source API và test: không có leak. Scan rộng có phát hiện ở .env local đã tồn tại; không in/đổi giá trị và không xem là thay đổi P7. .env.example chỉ tên biến rỗng.
- Chưa chạy Cloudinary thật/F2/browser acceptance hoặc CI PR; không tuyên bố 7 required checks xanh. Không chạy standard test:int/test:e2e trên DB hiện có vì setup reset; dùng test:p7 trên container test mới.

## 9. Completion criteria

- [x] Thiết kế và thông số mới nhất được người dùng duyệt trước triển khai.
- [x] P7 backend, schema/migration và tài liệu đồng bộ; các kiểm local nêu trên pass.
- [x] Nháp issue #51 được cập nhật local; chưa đăng GitHub.
- [x] Không sửa secret/.env thật, không chạy migration DB dev/chia sẻ, không commit/push/PR.
- [x] Cloudinary thật upload/delivery/ledger/cleanup qua full backend harness đã pass sau khi cập nhật credential.
- [ ] B1/F2/preview và manual UI acceptance (được theo dõi riêng).
- [x] Người dùng đồng ý cập nhật AI_USAGE_LOG.md: dòng23 P7 và AI-BUG-008; commit/PR vẫn do thành viên thực hiện.

## 10. Nháp issue #51 — chưa đăng GitHub

**Tiêu đề:** `[admin] P7 · Tải ảnh chuyên khoa lên Cloudinary, tối ưu ảnh theo dung lượng`

### Mô tả

Chuyển P7 từ Docker volume sang Cloudinary theo phương án người dùng duyệt ngày 28/10/2026. Xây dựng UploadService, xử lý ảnh và adapter Cloudinary ở backend. Nhận đúng một ảnh tĩnh JPEG/PNG/WebP ≤ 10 MB/25 MP, kiểm magic bytes/giải mã; từ chối SVG, ảnh động, tệp rỗng/hỏng và tên traversal.

- Ảnh ≤ 2 MB: kiểm hợp lệ, không chủ động resize/nén; có thể mã hóa lại để chỉnh chiều/loại metadata.
- Ảnh > 2 MB đến 10 MB: nén trước, resize khi cần để output ≤ 2 MB. Mục tiêu mềm 700–800 KB; 1–2 MB vẫn hợp lệ. Không ép giảm chất lượng, không khung pixel cố định.
- Giữ tỷ lệ/alpha, không crop/kéo giãn/phóng to. Ảnh cần tối ưu ưu tiên WebP; không bắt buộc lossless. Tự chuẩn hóa EXIF khi cần trước xử lý, bỏ orientation cũ và metadata riêng tư; không AI/nút xoay tương tác.
- F2 dùng URL ảnh kết quả làm preview cuối trước lưu; metadata sai không được coi là tự sửa được bằng AI. Chất lượng nén tối thiểu/bước resize phải được duyệt qua ảnh mẫu.

Không cần volume ảnh hoặc proxy /uploads. Chỉ policy chuyên khoa trong P7; có thể tái sử dụng hạ tầng qua policy riêng sau này, chưa triển khai avatar/bài viết, widget, crop tương tác hay upload trực tiếp browser. Chi tiết và quy ước byte tại plan mục 3d.

### API và dữ liệu đã được duyệt

- POST /admin/uploads/specialty-image, multipart file; chỉ Admin Toàn hệ thống; 201 trả uploadId/url/expiresAt. expiresAt là hạn gắn, không phải hạn URL Cloudinary.
- B1 nhận imageUploadId: bỏ trường khi sửa = giữ, null = gỡ, UUID = gắn/thay. Backend kiểm người tải/mục đích/hạn/trạng thái trong giao dịch, không nhận URL/public_id tùy ý.
- Bảng anh_tai_len lưu URL/public_id, metadata và thời điểm xác nhận upload. Chuyên khoa tham chiếu FK; ảnh chỉ gắn khi provider xác nhận thành công. DDL/migration bổ sung đã review và kiểm MySQL riêng; không tự backfill dữ liệu thật hoặc áp dụng lên DB dev/chia sẻ.

### Vòng đời ảnh và xử lý lỗi

- Ba trạng thái Chưa gắn / Đã gắn / Chờ xóa; hạn chờ gắn 24 giờ, dọn mỗi giờ tối đa 50 ảnh/lượt, chạy trong API với nhận việc bằng DB; không Redis/queue/container riêng.
- Thay/gỡ: commit giao dịch lưu ảnh mới/đánh dấu ảnh cũ trước khi dọn Cloudinary. Lỗi DB giữ ảnh cũ; lỗi xóa giữ bản ghi để thử lại. Không xóa ảnh đang tham chiếu.
- Cấp bản ghi/public_id trước gọi provider. Timeout không tự retry upload, không cho gắn; giữ dấu để đối soát. Kết quả vẫn chưa rõ được giữ lại kiểm tra thủ công, ghi giới hạn vào TECH_DEBT khi implementation.
- Lỗi đầu vào/tiền xử lý trả 4xx có mã rõ; provider 503/504 dùng LOI_HE_THONG + requestId theo convention, không mở rộng error framework chung.

### Cấu hình và thông số triển khai đã duyệt

- Dev/test không bắt buộc credential, upload báo chưa sẵn sàng khi thiếu; staging/production yêu cầu đủ cấu hình. Không in secret; env mẫu chỉ placeholder.
- Dependency pin sharp 0.35.5/cloudinary 2.11.0/@nestjs/schedule 12.0.2; xử lý ảnh 15 giây, provider 20 giây, API sau nhận file 45 giây, tối đa 2 upload đồng thời/instance.
- Ảnh lớn thử lossless, quality 85/80 rồi resize hệ số 0,85 tối đa 6 bước, cạnh dài không giảm dưới 1600 px; dừng khi ≤2 MB. Schema/migration bổ sung và ADR theo mục 3a/3f; manual acceptance vẫn cần riêng.

### Truy vết, phụ thuộc và đồng bộ tài liệu

- CK b2; Q11/Q13; H15; CK-11/SE-A7 trong Admin PLAN mục 7.
- auth P1 cho API; auth A4 và policy C1 thật cho quyền endpoint. P7 upload/metadata/dọn ảnh; B1 gắn/thay/gỡ; F2 chọn ảnh/preview. Không dùng stub guard để vượt dependency.
- Bỏ phụ thuộc auth P6(web) chỉ dành cho proxy ảnh; không bỏ công việc proxy API của auth.
- Đồng bộ Admin PLAN/TRACKING, D8, .env.example/DEV_SETUP khi implementation; dữ liệu đồng bộ ba file schema, entity/registry/migration theo phạm vi duyệt. Người dùng tự ghi AI_USAGE_LOG.md hoặc cho phép sửa theo AGENTS.md.

### Kiểm thử và đóng khi

- CK-11/SE-A7: biên 2 MB/10 MB/25 MP, output ≤ 2 MB; ảnh nhỏ không chủ động resize/nén, ảnh lớn nén trước/resize khi cần. 700–800 KB không là điều kiện từ chối; không áp policy 512 px/300 KB cũ.
- Kiểm định dạng giả, SVG, ảnh động/hỏng/rỗng, traversal, không phóng to/crop, alpha; EXIF 1–8/không EXIF, loại GPS/orientation cũ, tránh xoay lại; kiểm độ nét/màu trên UI thường/HiDPI khi có F2.
- Kiểm guard/policy, error envelope, timeout và đồng thời gắn/dọn, lỗi DB/provider; ảnh chưa xác nhận không gắn được, không xóa ảnh đang dùng. Fake Cloudinary trong test tự động; manual provider thật tách riêng.
- Ghi evidence thật và phần chưa xác minh vào TRACKING; local P7 không thay acceptance B1/F2. Tài liệu đồng bộ, quyết định kỹ thuật còn mở được hoàn tất.
- PR do người dùng tự thao tác, người còn lại review và cả 7 check detect/pr-title/secrets/security/api/web/docker xanh. P7 đã triển khai và kiểm chứng local, chưa publish hoặc manual acceptance.
- Gợi ý PR: `feat(api): tải ảnh chuyên khoa lên Cloudinary`.


### Kết quả local để người dùng đính kèm issue/PR

API 863/863 unit; MySQL P7 7/7; lint/typecheck/build pass; Docker prod build/Sharp Linux smoke pass; jscpd Linux 0,91%; Gitleaks source/tests không có leak. Migration chưa chạy DB dev/chia sẻ; Cloudinary thật/B1/F2/UI và 7 CI check trên PR chưa xác minh. Không commit/push/mở PR trong phiên này.


### Bổ sung verification live mới nhất (28/10/2026)

Cloudinary thật đã pass với3 ảnh tự tạo: nhỏ giữ byte/alpha, EXIF đúng chiều, lớn6.794.268→2.004.184 byte/WebP1870×1870. Kiểm ledger/gắn/gỡ/cleanup và đọc lại cả3 cloud resource404, ledger0. Regression DATETIME làm tròn thời gian đã được tái hiện và sửa bằng toSecond trong upload repository; MySQL8/8, module42/42, build/lint pass sau sửa. Credential/token không in ra. Fixture nằm DB test riêng; migration dev đã được người dùng cho phép và áp dụng, không reset/ghi fixture lên DB dev. B1/F2/browser acceptance và PR/CI vẫn chưa xác minh. Chi tiết tracker.md.


### Cấu trúc test theo yêu cầu người dùng (28/10/2026)

- common/upload/test/: toàn bộ 6 file unit/HTTP *.spec.ts và upload.int-spec.ts; tách khỏi code runtime.
- common/upload/testing/: helper/setup kiểm thử (p7-global-setup.ts), không phải điều kiện để Vitest tự chạy. Discovery dựa pattern tên test/config; test:p7 đã trỏ đến test/upload.int-spec.ts.
- Cập nhật tất cả import tương đối sau khi di chuyển. Không đổi hành vi runtime, dependency hoặc schema. Kiểm type/build và test liên quan; không gọi Cloudinary thật chỉ vì đổi vị trí file.
