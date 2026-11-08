# Search F10 — Ngăn kéo điều hướng công khai (#177)

Ngày 08/11/2026; nhánh người dùng chuẩn bị `feat/search-f10`. Người dùng xác nhận Search F10 sau khi đọc tracker Admin và issue #177. #168/F1 và #169/F2 đã đóng, mã phụ thuộc có trong HEAD. Không sửa Git hoặc thay đổi AGENTS.md đang có sẵn.

## Cách chạy và thiết kế

Chạy `npm.cmd run dev` trong `apps/web`, mở `/`, thu viewport dưới 1024px và bấm Mở menu. Menu gồm các mục điều hướng hiện có, bộ chọn chi nhánh F2, nút đặt lịch và đăng nhập/menu tài khoản. Không cần endpoint mới.

`PublicShell` nối `useMediaQuery` và `useModalDialog` đã có. Khóa đường dẫn lúc mở giúp đóng khi điều hướng/Back; xóa khóa lúc lên màn rộng để thu hẹp không tự mở lại. Chọn liên kết hiện tại cũng đóng bằng xử lý click; chọn chi nhánh không điều hướng nên giữ ngăn kéo. Nền header/nội dung/footer inert, khóa cuộn và trả focus khi đóng. Chỉ một bộ menu được gắn tại mỗi thời điểm, tránh trùng id của picker/tài khoản/dịch vụ.

Màn hẹp chưa có frame Figma theo PLAN 4.5: dùng Q25, token và hành vi modal sẵn có của patient F11. Không sửa CSS chung, auth, API, schema hoặc dependency. Menu con trong ngăn kéo nằm trong luồng bố cục để không tràn ở 320px; desktop giữ menu thả xuống.

## Kiểm chứng

- `npm.cmd test`: 86 file, 1704/1704 pass, gồm sáu ca mới trong `public-shell.test.tsx` (KC-08 và phần liên quan KC-01/02/09).
- `npm.cmd run lint`, `npm.cmd run build`: pass; TypeScript strict và Vite production build.
- Chromium dùng API mock: 320/390/1023/1024/1440px, không tràn ngang; dưới 1024 có ngăn kéo, từ 1024 có nav desktop; focus đầu vào nút đóng, Tab/Shift+Tab tuần hoàn, Esc trả focus, chọn chi nhánh giữ ngăn kéo, chọn Bác sĩ điều hướng và đóng. Không lỗi JavaScript. `preview-evidence.json` và `drawer-*.png` là bằng chứng; ảnh 320px đã xem bằng mắt.
- Harness browser đầu chặn nhầm đường dẫn module có `/api/`, gây timeout; giới hạn interceptor vào `/api/public/` và `/api/auth/`. Lượt tiếp theo phát hiện popup chi nhánh tràn màn 320px: sửa bố cục và chạy lại pass (AI-BUG-049).
- Chưa API/DB thật, nghiệm thu người dùng, CI hoặc commit/push/PR/review/merge. KC-09 ở đây chỉ xác minh bàn phím vùng ngăn kéo, không tuyên bố nghiệm thu WCAG toàn trang.

## Bàn giao

PLAN/TRACKING Search và nhật ký Trung #60 đã cập nhật; F10 chưa tick vì chờ merge. Issue không yêu cầu đồng bộ tài liệu thiết kế gốc. Không cập nhật tracker Admin hoặc nhật ký Đại.

Gợi ý commit/PR: `feat(web): thêm ngăn kéo điều hướng Search F10` (commit sửa lỗi kèm `AI-BUG-049`); mô tả PR có `Closes #177`. Thành viên tự thực hiện Git/PR theo AGENTS.md.
