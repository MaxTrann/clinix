# ADR — Web Clinix dùng Tailwind CSS 4, lucide-react và Inter tự host

Status: Accepted  
Date: 2026-11-01  
Scope: `apps/web`; áp dụng từ auth F3 (#37), gồm mọi màn của Admin  

## Quyết định và căn cứ

Đại và Trung thống nhất ngày 01/11/2026: `apps/web` dùng Tailwind CSS 4.3.3 (plugin `@tailwindcss/vite` 4.3.3), biểu tượng `lucide-react` 1.59.0, phông Inter tự host qua `@fontsource-variable/inter` 5.3.0. Cả bốn gói ghim đúng phiên bản. Quyết định này thay lựa chọn tạm "CSS Modules, không thêm gói" của P6, lúc chưa có màn thật.

- Mã Figma Make (nguồn giao diện) viết bằng Tailwind: 101 file `.tsx`, 6.522 chỗ `className`, 912 class khác nhau. Giữ Tailwind thì port gần như giữ nguyên `className`.
- Số trong Figma chính là thang Tailwind trên gốc 15px: 13,125px = `text-sm`, 13,375px = `rounded-xl`. Đo trong Chrome: `cyan-600` ra `#0092b8`, `cyan-700` ra `#007595`, `red-700` ra `#c10007`, đúng mã màu trong frame.
- lucide-react: Make dùng 107 biểu tượng ở các trang, tự viết SVG không đáng.
- Inter tự host: Figma dùng Inter; không gọi Google Fonts để demo không phụ thuộc mạng ngoài.

## Token màu

Thống kê class màu trong Make (54 file, bỏ `components/ui`): 6.297 lượt, 15 họ màu. gray 58,0%, cyan 19,1%, red 9,4%, amber 6,2%, green 3,9%; mười họ còn lại mỗi họ từ 1,1% trở xuống. Năm frame đăng nhập dùng cyan, red và xám.

Khai 13 token trong `@theme` ở `src/styles/index.css`, trỏ về thang Tailwind (ví dụ `--color-brand: var(--color-cyan-600)`), không chép mã màu:

| Token | Thang | Màu đo | Dùng cho | Nguồn | Lượt trong Make |
|---|---|---|---|---|---|
| `brand` | cyan-600 | `#0092b8` | CHỈ nền trang trí (logo, ô biểu tượng) và viền focus | logo `635:9` | bg 141 |
| `brand-strong` | cyan-700 | `#007595` | Chữ, liên kết, nền nút có chữ trắng | `637:66` | bg 78, text 161 |
| `brand-soft` | cyan-50 | `#ecfeff` | Nền nhạt | gradient `635:5` | bg 139 |
| `danger` | red-600 | `#e7000b` | Chữ lỗi trên nền trắng | `637:34` | text 75 |
| `danger-strong` | red-700 | `#c10007` | Chữ trong hộp nền nhạt | `637:34` | text 53 |
| `danger-soft` | red-50 | `#fef2f2` | Nền hộp lỗi | `637:29` | bg 90 |
| `danger-line` | red-200 | `#ffc9c9` | Viền hộp lỗi | `637:29` | border 51 |
| `warning` | amber-700 | `#bb4d00` | Chữ cảnh báo | chỉ từ Make | text 54 |
| `warning-soft` | amber-50 | `#fffbeb` | Nền cảnh báo | chỉ từ Make | bg 87 |
| `warning-line` | amber-200 | `#fee685` | Viền cảnh báo | chỉ từ Make | border 60 |
| `success` | green-700 | `#008236` | Chữ thành công | chỉ từ Make | text 67 |
| `success-soft` | green-50 | `#f0fdf4` | Nền thành công | chỉ từ Make | bg 55 |
| `success-line` | green-200 | `#b9f8cf` | Viền thành công | chỉ từ Make | border 39 |

Bảng đổi khi port từ Make (bước thay thế cơ học):

- `text-cyan-600`, `text-cyan-700`, `bg-cyan-600`, `bg-cyan-700` ⇒ `text-brand-strong`, `bg-brand-strong`. Trừ logo và ô biểu tượng: `bg-brand`.
- `hover:bg-cyan-700` trên nút ⇒ `hover:bg-cyan-800`. Hover dùng thang chuẩn, không có token riêng.
- `text-red-500` (139 lượt) và `text-red-600` ⇒ `text-danger`. Lý do gộp là tương phản: red-500 trên trắng 3,81:1, red-600 4,77:1. Chữ đỏ trong hộp nền nhạt ⇒ `text-danger-strong`.
- `focus:outline-none focus:ring-2 focus:ring-cyan-500` ⇒ bỏ, lớp base đã có viền focus.
- Các sắc khác của cyan, red, amber, green và các họ còn lại giữ thang chuẩn.

Màu trung tính (`gray`) dùng thang chuẩn, không tạo token, để port không phải dịch thêm. Token mới chỉ thêm khi có số đếm và nguồn Figma hoặc Make, cả hai người đồng ý.

## Tương phản

Theo WCAG 2.2 AA, là quy tắc cứng: chữ thường tối thiểu 4,5:1; viền focus và thành phần giao diện tối thiểu 3:1. Màu cũ của Figma không đạt: chữ trắng trên `cyan-600` và chữ `cyan-600` trên trắng 3,62:1; viền focus `cyan-500` 2,37:1; `red-600` trên `red-50` 4,36:1; placeholder `rgba(15, 23, 42, 0.5)` 3,41:1.

Số dưới đây tính bằng script từ màu đo thật trong Chrome: computed style của class Tailwind biên dịch từ chính `src/styles/index.css`, vẽ lên canvas để ra sRGB, rồi áp công thức WCAG.

| Cặp | Màu | Tỉ lệ | Tối thiểu | Kết quả |
|---|---|---|---|---|
| Chữ nút trên `brand-strong` | #ffffff / #007595 | 5,28:1 | 4,5:1 | Đạt |
| Chữ nút trên hover cyan-800 | #ffffff / #005f78 | 7,22:1 | 4,5:1 | Đạt |
| Liên kết `brand-strong` trên trắng | #007595 / #ffffff | 5,28:1 | 4,5:1 | Đạt |
| Liên kết `brand-strong` trên `brand-soft` | #007595 / #ecfeff | 5,07:1 | 4,5:1 | Đạt |
| Viền focus `brand` trên trắng | #0092b8 / #ffffff | 3,62:1 | 3:1 | Đạt |
| Chữ lỗi `danger` trên trắng | #e7000b / #ffffff | 4,77:1 | 4,5:1 | Đạt |
| Chữ `danger-strong` trên `danger-soft` | #c10007 / #fef2f2 | 5,87:1 | 4,5:1 | Đạt |
| Chữ `warning` trên trắng | #bb4d00 / #ffffff | 5,03:1 | 4,5:1 | Đạt |
| Chữ `warning` trên `warning-soft` | #bb4d00 / #fffbeb | 4,85:1 | 4,5:1 | Đạt |
| Chữ `success` trên trắng | #008236 / #ffffff | 4,95:1 | 4,5:1 | Đạt |
| Chữ `success` trên `success-soft` | #008236 / #f0fdf4 | 4,72:1 | 4,5:1 | Đạt |
| Placeholder gray-500 trên trắng | #6a7282 / #ffffff | 4,84:1 | 4,5:1 | Đạt |
| Nhãn gray-600 trên trắng | #4a5565 / #ffffff | 7,56:1 | 4,5:1 | Đạt |
| Phụ đề gray-500 trên `brand-soft` | #6a7282 / #ecfeff | 4,65:1 | 4,5:1 | Đạt |
| Tiêu đề gray-900 trên `brand-soft` | #101828 / #ecfeff | 17,06:1 | 4,5:1 | Đạt |
| Viền ô nhập gray-200 trên trắng | #e5e7eb / #ffffff | 1,24:1 | 3:1 | Không đạt |

`amber` và `green` đo ra đạt ở sắc 700 trên nền nhạt nên không cần sắc đậm hơn. Viền ô nhập giữ theo Figma là khoảng trống đã biết (`docs/TECH_DEBT.md` dòng 51): ô nhập vẫn nhận ra được nhờ nhãn và placeholder, nhưng chưa đạt 3:1. Cặp màu mới trong mã phải tính theo cách trên trước khi dùng.

## Việc nhóm cần sửa trong Figma

Mã đã đậm hơn Figma ở các chỗ sau, Figma phải sửa theo: nút chính và liên kết `#0092b8` thành `#007595`, hover nút thành `#005f78`; chữ trong hộp lỗi `#e7000b` thành `#c10007`; viền focus thành `#0092b8`, Figma chưa có frame focus; placeholder thành `#6a7282`. Khoảng trống còn mở: viền ô nhập `#e5e7eb` chỉ đạt 1,24:1, nhóm cần chọn màu đạt 3:1.

## Giá trị `[...]`

Mặc định không dùng. Được dùng khi thang chuẩn không biểu diễn đúng Figma, hoặc khi là giá trị kỹ thuật không có trong thang (ví dụ `z-[60]`). Lý do ghi ngay cạnh, một lần cho mỗi thành phần: `{/* [...]: lý do */}` trong TSX, `/* lý do */` trong CSS. Make có 472 lượt `[...]` (97 giá trị), nhiều nhất `text-[10px]` 119 và `text-[11px]` 95; khi port phải đổi sang thang nếu lệch không nhìn thấy, không thì giữ kèm lý do. Không dùng `[...]` cho màu đã có token.

## Control dùng chung

Preflight xoá kiểu mặc định, nên lớp `base` trong `src/styles/index.css` định nghĩa các control sau. Lớp `base` thua utility, nên `className` chép từ Make vẫn thắng.

- Gốc: `html { font-size: 15px }`.
- Nút: `cursor: pointer`; `:disabled` là `not-allowed`. Nút không có class (`button:not([class])`) có viền và đệm tối thiểu để trang giữ chỗ dùng được. Nút chính theo `635:58` (cao 45px, `rounded-xl`, `font-medium`, vô hiệu `opacity-50` theo `637:66`) nhưng nền `brand-strong`, hover cyan-800, viết bằng utility ở thành phần, không ở base.
- Ô nhập (`input`, `textarea`, `select`): viền `gray-200`, `rounded-xl`, `text-sm`, placeholder `gray-500`, vô hiệu `opacity-60`, theo `635:37`, `637:45`. Viền `0.8px` của Figma là sản phẩm xuất khung nên dùng `1px` như Make.
- Liên kết không có class (`a:not([class])`): màu `brand-strong`, gạch chân. Liên kết có class giữ nguyên.
- Focus: `:focus-visible` viền 2px `brand`, lệch 2px. Figma không có frame focus.

## Chuyển CSS Modules đang có

- Trong PR F3 đã chuyển cả bốn thành phần `LoadingState`, `ErrorState`, `EmptyState`, `OfflineBanner` sang Tailwind và xoá `status.module.css`. Màn đăng nhập dùng ba thành phần; thành phần thứ tư dùng chung file đó, để lại chỉ kéo dài tình trạng hai cách. Chưa có frame riêng (PLAN auth 4.4), nên dùng kiểu hộp lỗi `637:29`.
- Mã mới không thêm CSS Modules. Không trộn hai cách trong MỘT thành phần.
- `docs/CODING_CONVENTION.md`: đổi "không dựa vào tên class của CSS Modules" thành "không dựa vào tên class CSS".
- Nhánh Admin F1 của Trung đang có CSS Modules phải chuyển sang Tailwind sau khi F3 merge.

## Đánh đổi

- Cần trình duyệt hiện đại tối thiểu theo tài liệu Tailwind 4: Chrome 111, Safari 16.4, Firefox 128. Trình duyệt cũ hơn hiển thị sai, không có bản dự phòng.
- Gốc 15px làm mọi `rem` nhỏ hơn mặc định; bỏ dòng đó thì mọi kích thước lệch Figma. Thư viện ngoài tính theo `rem` cũng co theo.
- Preflight xoá kiểu mặc định; thành phần không có class trông trơn nếu không qua lớp base.
- Không dùng plugin sắp xếp class: giảm một gói, đổi lại thứ tự class không đồng nhất và do người giữ.
- `className` dài, và mọi quy tắc trên do người giữ khi review, không có công cụ ép.
- Giao diện đậm hơn Figma một bậc ở nút và liên kết cho tới khi Figma sửa theo.
- Cài trên Windows bằng npm làm mất trường `libc` trong lockfile: sau mỗi lần đổi gói ở `apps/web` phải kiểm và khôi phục (`docs/TECH_DEBT.md` dòng 50).

## Khi nào xem lại

Xem lại nếu phải hỗ trợ trình duyệt dưới mức tối thiểu; nếu nhóm dừng port từ Make và thiết kế riêng; nếu Figma chuyển sang biến đầy đủ thì token lấy từ biến thay vì bảng trên; nếu `[...]` trong mã mới tăng không kiểm soát. Nâng Tailwind bản lớn phải đo lại màu, cỡ và tương phản.

## Tương thích và xác minh

Đổi `package.json`, lockfile, `vite.config.ts`, `src/styles/index.css`, `main.tsx`. Không đổi `eslint.config.js`, Dockerfile, nginx. Sau khi kéo về phải dựng lại ảnh web và làm mới volume `node_modules` ẩn danh: `docker compose up -d --build -V --no-deps web`; chỉ `--build` thì container thoát vì không thấy gói mới (đo thật ở F3, `docs/DEV_SETUP.md`).

Đo ngày 01/11/2026 trên Node v22.23.4, Chrome thật:

- `docker build --no-cache --target prod --build-arg VITE_API_URL=/api`: `npm ci` thêm 243 gói trên alpine, build xong.
- Lockfile có đủ 18 mục `libc` cho các gói nhị phân Linux (`oxide`, `lightningcss`, `rolldown`).
- Cú pháp `var(--color-cyan-600)` trong `@theme` chạy đúng, 13 token ra đúng màu ở bảng trên.
- Gốc 15px, `h1` dùng `Inter Variable`; trình duyệt nạp `inter-latin`, `inter-latin-ext`, `inter-vietnamese`; không có yêu cầu nào tới máy chủ ngoài.
- Bản build: CSS 17,39 kB (gzip 4,55 kB), chunk đăng nhập 15,07 kB (gzip 5,93 kB).
- Không tràn ngang ở 1440px, 390px, 320px.
