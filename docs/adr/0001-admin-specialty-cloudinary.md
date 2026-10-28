# ADR — Ảnh chuyên khoa dùng Cloudinary

Status: Accepted  
Date: 2026-10-28  
Scope: Admin P7, issue #51; consumer B1/F2

## Quyết định và căn cứ

Người dùng đã chọn Cloudinary thay Docker volume, duyệt thiết kế dữ liệu/API/vòng đời ảnh, policy tối ưu có điều kiện và yêu cầu triển khai trong chat ngày 28/10/2026. ADR này ghi quyết định đó, không phải bằng chứng nghiệm thu.

- Frontend gửi đúng một file qua API; guard auth thật và kiểm scope ToanHeThong từ DB trước xử lý multipart. Không nhận URL/public_id tùy ý từ client.
- Input ảnh tĩnh JPEG/PNG/WebP ≤10 MB/25 MP. ≤2 MB không chủ động resize/nén; >2 MB nén trước rồi resize khi cần, output ≤2 MB, mục tiêu mềm 700–800 KB. Chuẩn hóa EXIF, bỏ metadata riêng tư, giữ alpha/tỷ lệ, không crop/phóng to.
- Sharp 0.35.5 và Cloudinary SDK 2.11.0 nằm sau adapter; @nestjs/schedule 12.0.2 chạy cleanup trong API. Không thêm Redis/queue/container ứng dụng riêng.
- Bảng anh_tai_len lưu UUID/public_id/URL, người tải, mục đích, xác nhận và ba trạng thái. Chuyên khoa thêm FK nullable UNIQUE RESTRICT, giữ URL cũ cho chuyển đổi; không tự suy public_id từ dữ liệu cũ.
- Gắn/thay/gỡ trong giao dịch B1; side effect provider sau commit. Ảnh chờ gắn 24 giờ, cleanup mỗi giờ tối đa 50 ảnh, lease DB 5 phút, tối đa 5 lỗi xóa rồi kiểm tra thủ công.
- Upload timeout không retry mù; ledger chưa xác nhận được giữ để kiểm tra thủ công. API không cho gắn ảnh chưa xác nhận. Lỗi 5xx giữ LOI_HE_THONG + requestId theo convention hiện có.

## Đánh đổi

Cloudinary giảm việc phục vụ/sao lưu ảnh trên server, đổi lại cần credential, hạn mức và xử lý kết quả mạng chưa rõ. P7 giữ dấu để kiểm tra thủ công thay vì xây tự phục hồi đầy đủ. Dữ liệu ảnh chuyên khoa là công khai, không dùng cho ảnh bệnh nhân.

## Tương thích và xác minh

Migration bổ sung 1793188800000, không sửa lịch sử. Chặn down khi ledger còn dữ liệu để không mất dấu tài nguyên provider. Entity/registry và cả ba tài liệu schema phải đồng bộ. P7 kiểm kỹ thuật riêng; Cloudinary thật, chất lượng trên giao diện và B1/F2 acceptance được ghi riêng, không suy ra từ unit/integration test.
