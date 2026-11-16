// `tsconfig.app.json` giới hạn `types` (không có @types/node) nên `node:fs` và `node:url` không có kiểu. Chỉ khai báo đúng hai hàm
// mà `css-source.ts` (trợ giúp test hợp đồng CSS) dùng, thay vì thêm `node` vào `types` hay `/// <reference types="node" />`: cả hai
// đưa kiểu Node vào CẢ chương trình tsc của web và có thể che việc dùng nhầm API Node ở mã sản xuất. Lý do phải đọc bằng `node:fs`
// (thay vì `import.meta.glob` với `?raw` như booking/doctor): xem comment đầu `css-source.ts`.
declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string;
}

declare module 'node:url' {
  export function fileURLToPath(url: string | URL): string;
}
