# Search F8 — Trang chủ thật (#175)

Ngày: 08/11/2026. Nhánh người dùng chuẩn bị: `feat/search-f8`.

## Phạm vi và thiết kế

- Issue #175 thuộc Search; đã xác nhận với người dùng sau khi phát hiện khác F8 của Admin.
- Đã đọc PLAN/TRACKING Search, Q19–Q26, TCH-01…05. F8 phủ TCH-02; TCH-01 thuộc B9, TCH-03/04 thuộc B8, TCH-05 thuộc F9.
- F1, F4, F5, B9 có trong ancestry hiện tại; B9 đã merge ở #203, F5 ở #215. Đọc Figma file `1OsOfwD5myNNRv7FPCD9YC`, screenshot `257:2` và context các phần `257:52/109/185/380/849`.
- Từng phần tải độc lập bằng `useRemote`; lỗi overview không hiển thị số 0 giả, lỗi một khối không làm mất khối khác. Đổi chi nhánh hoặc sắp xếp huỷ yêu cầu cũ và bỏ kết quả về muộn.
- Overview toàn hệ thống theo B9. Các danh sách theo chi nhánh đang chọn; chuyên khoa/bác sĩ dùng trang đầu tối đa 8 phần tử. Giá dùng contract có sẵn, không tính phụ phí tại FE.
- Ô tìm gửi Enter/nút sang `/bac-si?q=…`; trang bác sĩ nhận từ khoá từ URL, khởi tạo lại khi URL đổi. Gợi ý sau 300 ms/combobox là F9, chưa đánh dấu xong.
- Giữ hành vi trang công khai cho mọi vai trò. `pages/home-page.tsx` đã xoá; `router/routes.tsx` lấy `HomePage` từ bề mặt công khai Search.

## Đối chiếu Figma

- Hero, nhóm dịch vụ, 8 chuyên khoa, dải bác sĩ cuộn ngang (bốn thẻ ở desktop), hai cách sắp, quy trình bốn bước. Các liên kết đi vào trang đã có.
- Q14: bác sĩ dùng chữ viết tắt, ảnh chuyên khoa lấy API hoặc component fallback F4; không gán ảnh bác sĩ minh hoạ của Figma vào dữ liệu API.
- API nhóm dịch vụ không có mô tả; không hiển thị mô tả minh hoạ hoặc gán id nhóm theo tên Figma. Nút gợi ý dẫn vào trang chọn dịch vụ/chuyên khoa có sẵn.
- Q21: ẩn khối Cẩm nang, bỏ số "15 phút" khỏi bước giữ chỗ. Nút bác sĩ mở hồ sơ vì khung giờ thuộc phần `[SAU]`.
- Q26: nền hero và nút theo `brand-strong`; trắng/nền đo RGB thực `255,255,255` / `0,117,149` = 5,278:1. Tiêu đề lớn vàng/nền = 3,648:1, vượt ngưỡng 3:1 của chữ lớn. Giữ token chung, không sửa CSS toàn cục.
- 10 SVG trong `apps/web/public/assets/search/home/`: search, arrow, ba icon nhóm, bốn icon bước, calendar. Kiểm XML/size khác 0; Chromium kiểm 14 callsite, mọi ảnh tải được và có kích thước hiển thị. Root SVG giữ nguyên kích thước Figma 15 / 18,75 / 26,25 px.
- Ảnh [desktop](home-desktop.png) và [mobile phần nội dung](home-mobile.png) là API mock. Header mobile tràn ngang thuộc F10 chưa triển khai; không tính ảnh này là acceptance F10.

## Kiểm chứng

- Web `npm.cmd test`: 84 file, 1685/1685 pass; 6 ca mới TCH-02.
- `npm.cmd run lint`, `npm.cmd run build` (TypeScript + Vite), `git diff --check`: pass.
- Lượt full đầu 1665 pass / 20 fail: test App/router/auth còn kỳ vọng tiêu đề CLINIX cũ, mock khung/chi nhánh trả chung response cho endpoint mới. Đã cập nhật đúng hợp đồng từng endpoint và thu hẹp truy vấn nút header; không đổi nghiệp vụ để thoả mock sai. Một số test khung đồng bộ vẫn phát cảnh báo React `act` khi request trang chủ hoàn tất; kết quả kiểm thử xanh.
- Chromium thật với request interception, không API/DB thật: nội dung đúng dữ liệu mock, đổi sắp xếp gọi `sapXep=danhGiaCao`, cuộn bác sĩ hoạt động, không lỗi JavaScript. Bằng chứng DOM/asset/contrast tại [preview-evidence.json](preview-evidence.json).
- AI-BUG-048: ảnh desktop đầu rộng 2311 px do `sr-only` trong thẻ cuộn định vị theo ngoài vùng cuộn; thêm `relative` vào thẻ, kiểm lại `documentElement.scrollWidth=1440` ở viewport 1440.

## Bàn giao

Chạy `npm.cmd run dev` trong `apps/web`, mở `/`; cần API tương ứng cho dữ liệu thật. Các lần preview ở phiên này dùng dữ liệu giả qua Chromium.

Không đổi API/schema/migration/package/auth production. Đã cập nhật PLAN/TRACKING Search và nhật ký Trung mục 58; không sửa nhật ký của Đại. Giữ thay đổi AGENTS.md có sẵn của người dùng.

Chưa có xác nhận người dùng, kiểm API/DB thật, CI, commit/push/PR/review/merge. Không có tài liệu Word/schema phải đồng bộ trong issue #175. Gợi ý commit/PR: `feat(web): thêm trang chủ Search F8 [AI-BUG-048]`; mô tả PR kèm `Closes #175`.
