// Khung nội dung của các trang công khai theo Figma (khung 1440 px). Gốc `html` là 15 px nên 1 đơn vị Tailwind = 3,75 px:
// `max-w-320` = 1200 px và `px-8` = 30 px. Viết số đơn vị theo gốc 16 px (300 và 7,5, như thể 1 đơn vị là 4 px) chỉ ra 1125 px và 28,1 px,
// hẹp hơn Figma 6,25% (search F14, UIS-01; ADR 0003 gốc 15 px). `layout.test.ts` cấm các lớp viết sai kiểu đó trong `features/search`.
export const PUBLIC_CONTAINER = 'mx-auto max-w-320 px-8';

// Đặt lịch bước 1–3 (Figma 444:66, 445:66, 446:66): khung 840 px, đệm 15 px (nội dung 810 px), đệm dọc 37,5 px;
// cùng khung với wizard bước 4–6 của booking (`max-w-4xl px-4`).
export const PUBLIC_STEP_CONTAINER = 'mx-auto max-w-4xl px-4 py-10';
