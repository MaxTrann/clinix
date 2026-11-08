# Search F9 — Ô tìm tổng và hộp gợi ý (#176)

Ngày: 08/11/2026. Nhánh người dùng chuẩn bị: `feat/search-f9`.

## Phạm vi và thiết kế

- Người dùng xác nhận Search F9 #176, khác Admin F9. Đã kiểm tracker Admin; phần code của task chỉ thuộc Search.
- Phụ thuộc #175 (F8) và #166 (B8) đã đóng; trang chủ F8 và API suggestions có trong checkout hiện tại.
- Theo Q20/Q23, TCH-05: gõ chờ 300 ms, huỷ yêu cầu ngay khi đổi từ khoá/đóng hộp/rời trang, bỏ kết quả muộn; từ khoá rỗng không gọi API.
- Dùng API client duy nhất với `skipAuthToken`, chỉ query `q` theo đúng B8; không gửi chi nhánh hoặc thêm trường API.
- Combobox giữ focus trong input, listbox có option và nhãn loại; lên/xuống chọn gợi ý, Enter mở lựa chọn, Escape đóng. Gửi form khi chưa chọn mở `/bac-si?q=…`.
- Chuyên khoa mở `/chuyen-khoa/:id`, bác sĩ mở `/bac-si/:id`; dịch vụ mở `/bac-si?dichVuKhamId=…`. B8 không trả id nhóm nên tái dùng trang đội ngũ bác sĩ và bộ lọc dịch vụ có sẵn ở API; không suy diễn nhóm dịch vụ.
- Đã đọc Figma `1OsOfwD5myNNRv7FPCD9YC`: frame 258:2, context đầy đủ và screenshot HeroSearch 258:66. Hộp trắng nổi dưới ô tìm, cùng chiều rộng, tên bên trái/loại bên phải. Tái dùng icon search local và token F8, không sửa CSS chung.

## Kiểm chứng

- Web `npm.cmd test -- --reporter=default --reporter=json --outputFile.json=../../working-doc/search-F9/test-summary.json`: **85 file, 1698/1698 pass**. Báo cáo được rút gọn thành [test-summary.json](test-summary.json), giữ số đếm toàn bộ và tên/kết quả các ca F9 liên quan.
- 12 ca mới trong `global-search.test.tsx`: debounce/trim, stale response, rỗng/maxlength, phím và ARIA, ba loại điều hướng, tìm tự do, bộ gõ tiếng Việt, lỗi mạng/timeout và thử lại, blur/unmount. Một ca route/client trong `doctor-team.test.tsx` kiểm `dichVuKhamId` từ URL thực sự tới API và thay/loại bộ lọc khi điều hướng cùng trang. Test F8 đổi role searchbox thành combobox.
- `npm.cmd run lint`, `npm.cmd run build` (TypeScript + Vite), Prettier các file TypeScript thay đổi, `git diff --check`: pass. Full suite vẫn có cảnh báo React `act` của test khung/trang chủ đã ghi trong tracker F8; không có test fail.
- Chromium với request interception (API mock), không API/DB thật: chỉ một request cho gõ nhanh `t` → `ti` → `tim`; `q=tim`, không Authorization; chọn bằng bàn phím/chuột, Escape, tìm tự do sang `/bac-si?q=…`; không lỗi JavaScript.
- Đối chiếu [desktop](suggestions-desktop.png) với Figma 258:66: hộp trắng cùng chiều rộng ô tìm 630px, cách 7,5px, tên trái/nhãn loại phải. Giữ màu nút và focus theo token/ADR của F8. Tái dùng icon search local đã có: file 675 byte, root và Chromium đều 18,75 × 18,75px, tải thành công.
- 15 option tạo listbox cao 300px, nội dung 619px; option cuối cuộn vào vùng nhìn khi dùng bàn phím. Hộp xuống tới y=729,5 vượt đáy hero y=640,5 mà không bị cắt; chỉ lớp trang trí giữ overflow hidden. Desktop document width bằng viewport 1440px.
- [Mobile](suggestions-mobile.png): hộp từ x=29,125 đến 360,875 trong viewport 390px. Header mobile ngoài scope (F10); không coi đây là nghiệm thu F10. Chi tiết [preview-evidence.json](preview-evidence.json).
- Lượt browser đầu fail assertion `628 !== 630`: harness so chiều rộng ul bên trong với form mà chưa cộng 2px viền hộp. Đã sửa phép đo và chạy lại pass, không sửa ứng dụng vì lỗi đo này.
- Lệnh tải thêm screenshot Figma về TEMP báo `Unable to write data to the transport connection: An existing connection was forcibly closed by the remote host.`; vẫn đối chiếu được screenshot ảnh do `get_design_context` trả trực tiếp, không dùng URL tạm làm asset.

## Bàn giao

Giữ thay đổi `AGENTS.md` có sẵn. Không đổi backend/schema/dependency/auth production. Issue không yêu cầu đồng bộ tài liệu thiết kế gốc.


Chạy `npm.cmd run dev` trong `apps/web`, mở `/` và gõ từ khoá; cần API B8 cho dữ liệu thật. `useSuggestions` tạo AbortController theo từ khoá/hộp mở và kiểm `signal.aborted` trước cập nhật state, nên cả trường hợp transport trả chậm sau huỷ cũng không ghi đè kết quả mới.

Đã cập nhật PLAN/TRACKING Search và nhật ký Trung mục 59; giữ ô F9 chưa tick vì quy ước PLAN là chỉ tick khi đã merge; không sửa tracker Admin hay log của Đại vì task triển khai thuộc Search. Không cần đồng bộ Word/schema theo issue. Chưa kiểm API/DB thật, người dùng nghiệm thu, CI hoặc commit/push/PR/review/merge. Gợi ý commit/PR: `feat(web): thêm ô tìm tổng và gợi ý Search F9`; mô tả PR kèm `Closes #176`.
