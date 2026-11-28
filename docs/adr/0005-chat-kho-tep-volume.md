# ADR — Tệp đính kèm của chat lưu trên volume Docker riêng

Status: Accepted  
Date: 2026-11-26  
Scope: chat P3, issue #708; consumer chat B4 (#714), F6 (#722)

## Bối cảnh

Scope "Nhắn tin" cho Bệnh nhân gửi ảnh (JPEG, PNG, WebP) và PDF cho Bác sĩ, Lễ tân (Q1, Q6). Đây là **dữ liệu sức khỏe của bệnh nhân**, chỉ người tham gia hội thoại được tải. ADR 0001 chọn Cloudinary cho ảnh chuyên khoa **công khai** và ghi rõ "không dùng cho ảnh bệnh nhân", nên kho tệp chat cần một quyết định riêng.

## Quyết định

Đại chọn **volume Docker riêng** (Q5, trả lời 26/11/2026). Phần kỹ thuật dưới đây theo PLAN chat 5.8:

- **Cổng `ChatFileStore`** (`apps/api/src/chat/attachments/`): ghi, đọc luồng, xoá, liệt kê. B4 chỉ dùng cổng này; bản hiện có là `LocalDiskChatFileStore` ghi vào thư mục `CHAT_FILES_DIR`. Chỉ `chat/attachments/` được nhập `node:fs` (HCH-05).
- **Khoá lưu** `yyyy/mm/<uuid v4>.<đuôi>`: tháng theo giờ Việt Nam, UUID do máy chủ sinh, đuôi theo loại tệp máy chủ nhận ra từ nội dung. Khoá **không bao giờ** lấy từ tên tệp người dùng; tên gốc chỉ là dữ liệu hiển thị ở `tin_nhan.tep_ten_goc`. Khoá dài 49 ký tự, vừa cột `tep_dinh_kem varchar(255)`.
- **Ghi an toàn:** ghi ra tệp tạm (tên bắt đầu bằng dấu chấm, không khớp mẫu khoá) trong cùng thư mục, cờ `wx` (không ghi đè), rồi đổi tên. Nhờ vậy người đọc và job dọn không bao giờ thấy tệp ghi dở.
- **Chặn đi ngược thư mục, hai lớp:** đọc và xoá chỉ nhận khoá đúng mẫu, và đường dẫn sau khi ghép phải nằm trong thư mục gốc. Lỗi khoá sai không lặp lại khoá.
- **Cấu hình:** `CHAT_FILES_DIR` là đường dẫn tuyệt đối. Container dùng `/data/chat`, do hai file compose đặt bằng `environment` (đè `env_file`). Staging/production thiếu biến thì API không khởi động. Development/test bỏ trống thì dùng `.chat-files` ở thư mục chạy API (đã có trong `.gitignore`); test tích hợp và e2e dùng thư mục tạm của hệ điều hành. Lúc khởi động, API tạo thư mục nếu chưa có rồi ghi thử một tệp; không ghi được thì dừng, lỗi nêu tên biến và mã lỗi hệ điều hành (TEP-14).
- **Hạ tầng:** volume `chat-files` ở `docker-compose.yml` và `docker-compose.staging.yml`, gắn `/data/chat`. Stage `prod` của `apps/api/Dockerfile` tạo `/data/chat` thuộc người dùng `node`, nên volume trống gắn vào lần đầu nhận đúng quyền đó.

## Phương án đã cân nhắc

- **Cloudinary hay dịch vụ lưu trữ ngoài:** ADR 0001 đã loại cho ảnh bệnh nhân. Dùng dịch vụ ngoài thì dữ liệu sức khỏe rời máy chủ của đồ án và cần thêm thoả thuận, khoá truy cập.
- **Lưu tệp trong MySQL (BLOB):** sao lưu cùng DB, nhưng tăng kích thước DB và buffer pool, và mỗi lần tải lại đi qua kết nối DB. Schema đã chốt cột `tep_dinh_kem` là khoá lưu trữ, không phải nội dung.

## Đánh đổi và hệ quả

- Volume tách khỏi DB nên **phải sao lưu và khôi phục cùng `db-data`**: khôi phục DB mà thiếu volume thì tin trỏ tới tệp đã mất (tải xuống trả 404, B4 ghi log id tin). Đồ án chưa có quy trình sao lưu tự động; khoản nợ này đã ghi ở `docs/TECH_DEBT.md` dòng 323 khi B4 merge (Q5, Q6; kiểm lại ở chat D1, 28/11/2026).
- Không quét virus (Q6). Bù lại, B4 chỉ nhận bốn loại theo nội dung, mã hoá lại ảnh và chỉ cho tải PDF xuống.
- Một máy chủ một volume: chưa chạy được nhiều bản API trên nhiều máy. Muốn mở rộng thì viết bản `ChatFileStore` mới (ví dụ kho đối tượng tự quản lý), B4 không đổi.
- Tiến trình chết giữa lúc ghi và đổi tên có thể để lại tệp tạm `.<uuid>.tmp`. `list()` bỏ qua tệp tạm. Job dọn mồ côi của B4 chỉ xoá tệp đúng mẫu khoá, nên tệp tạm sót lại nằm ngoài phạm vi job đó (hiếm gặp, kiểm tay).

## Xác minh

Ở P3: TEP-07 (khoá, chặn đi ngược thư mục, ghi, đọc, xoá, liệt kê), TEP-14 (biến thiếu hay sai, thư mục không ghi được, không ghi ra ngoài thư mục gốc) và HCH-05 (quét mã) chạy bằng test đơn vị; `docker compose config` của hai file compose hợp lệ; image `prod` có `/data/chat` thuộc `node` và ghi được. Phần gửi, tải xuống và dọn mồ côi được nghiệm thu ở B4, không suy ra từ P3.
