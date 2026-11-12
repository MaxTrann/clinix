import { stripComments } from '../../doctor/testing/architecture-scan.js';
import type { SourceFile } from './architecture-rules.js';

// Luật AR-07 (task B11; TRACKING 3.24.1, 3.24.2): `AppointmentsModule` xuất CẢ `AppointmentTransitionService`, nhưng NGOÀI `appointments/` chỉ được gọi `confirmPaid` (payment) và `complete` (doctor). Mọi phương
// thức khác của lớp đó (hết hạn, và sau này `cancel`, `checkIn`, `markNoShow`, override…) là phần GHI của luồng nghiệp vụ trọn vẹn: module khác gọi thẳng sẽ BỎ QUA hoàn tiền, thông báo, mời danh sách chờ.
// Huỷ phải qua `AppointmentCancellationService` (B10). Danh sách phương thức cấm ĐỌC TỪ NGUỒN LỚP (mọi phương thức công khai trừ hai tên được phép), nên B10, B12, B14 thêm phương thức là tự được phủ.
// Hàm THUẦN nhận `{ path, source }[]` như `architecture-rules.ts`. GIỚI HẠN ĐÃ BIẾT: khớp theo TÊN phương thức trong file có nhắc `AppointmentTransitionService`; file dùng cả hai dịch vụ và gọi `.cancel(` của
// `AppointmentCancellationService` sẽ bị bắt nhầm (hiện không có file nào): khi đó tách file hay thêm ngoại lệ có lý do.

/** Phương thức module khác được gọi (hợp đồng D6 và Q20). */
export const ALLOWED_OUTSIDE_METHODS: readonly string[] = [
  'confirmPaid',
  'complete',
];

const CLASS_HEADER = 'export class AppointmentTransitionService';
const NOT_METHODS = new Set([
  'constructor',
  'if',
  'for',
  'while',
  'switch',
  'return',
  'catch',
]);
// Thành viên lớp ở cột 2 (Prettier): `name(`, `async name(`; `private` và `protected` đứng trước tên nên KHÔNG khớp
const MEMBER = /^ {2}(?:async\s+)?([a-z]\w*)\s*(?:<[^>]*>)?\(/gm;

/** Tên các phương thức CÔNG KHAI của `AppointmentTransitionService`, đọc từ nguồn của lớp (không `private`, không `constructor`). */
export function publicMethodsOf(serviceSource: string): string[] {
  const code = stripComments(serviceSource);
  const start = code.indexOf(CLASS_HEADER);
  if (start < 0) throw new Error(`không thấy "${CLASS_HEADER}" trong nguồn`);
  const names = new Set<string>();
  for (const match of code.slice(start).matchAll(MEMBER)) {
    const name = match[1];
    if (name !== undefined && !NOT_METHODS.has(name)) names.add(name);
  }
  return [...names];
}

/**
 * AR-07: file NGOÀI `appointments/` có nhắc `AppointmentTransitionService` mà gọi một phương thức công khai ngoài `ALLOWED_OUTSIDE_METHODS`. `methods` là kết quả của `publicMethodsOf`. Trả danh sách thông
 * điệp (rỗng = đạt).
 */
export function findTransitionSurfaceViolations(
  files: readonly SourceFile[],
  methods: readonly string[],
): string[] {
  const forbidden = methods.filter(
    (method) => !ALLOWED_OUTSIDE_METHODS.includes(method),
  );
  const found: string[] = [];
  for (const file of files) {
    if (file.path.startsWith('appointments/')) continue;
    const code = stripComments(file.source);
    if (!/\bAppointmentTransitionService\b/.test(code)) continue;
    for (const method of forbidden)
      if (new RegExp(`\\.\\s*${method}\\s*\\(`).test(code))
        found.push(
          `${file.path}: gọi .${method}() của AppointmentTransitionService từ ngoài appointments/ — ngoài module chỉ được gọi ${ALLOWED_OUTSIDE_METHODS.join(' và ')}; huỷ phải qua AppointmentCancellationService (B10)`,
        );
  }
  return found;
}
