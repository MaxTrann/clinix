# ADR 0003: Styling system cho frontend Clinix

Status: Accepted  
Date: 2026-10-28  
Updated: 2026-11-02  
Scope: `apps/web`; bắt đầu áp dụng ở Admin F3.

## Bối cảnh

Clinix cần một cách dựng UI mới bám Figma mà vẫn dùng được token dùng chung. F1/F2 hiện dùng CSS Modules; F3 là điểm bắt đầu cho bộ styling mới. Tailwind chưa có trong manifest trước F3.

## Quyết định

- Dùng Tailwind CSS `4.3.3` và `@tailwindcss/vite` `4.3.3`.
- Dùng `lucide-react` `1.59.0` cho icon code-native.
- Tự host Inter qua `@fontsource-variable/inter` `5.3.0`; font-size gốc của `html` là `15px`.
- Đặt token ngữ nghĩa trong stylesheet gốc bằng màu đã đọc từ design context Figma/Make. UI mới ưu tiên token; arbitrary values dùng khi cần khớp kích thước cụ thể từ thiết kế.
- F3 không tạo CSS Module mới. Có thể tiếp tục tái sử dụng CSS Module/component Admin hiện có nếu phù hợp.
- Không chuyển toàn bộ CSS Modules Admin trong F3. Tailwind nạp theme/utilities nhưng bỏ preflight để không reset giao diện F1/F2 hiện có. Sau khi F3 hoàn tất, Admin F1 sẽ được rebase/migrate theo bộ token, rồi build lại web image trong task riêng.

## Hệ quả

- Vite dùng `@tailwindcss/vite`; `src/styles.css` là entry CSS dùng chung và import tại `main.tsx`. Không bật Tailwind preflight toàn app trước khi migration F1/F2.
- Dependency được pin đúng các phiên bản đã được nhóm chốt.
- Không thay đổi API/backend hoặc dữ liệu.

## Xác minh

- Màu nền, brand, chữ, viền, info/success/danger được trích từ code/design context của Figma F3; variable definitions trả về chỉ chứa trắng surface và trắng on-brand.
- Figma Code Connect không khả dụng trên seat hiện tại (Figma yêu cầu Dev/Full seat); component Admin hiện hữu được ưu tiên tái sử dụng.
