import type { Type } from '@nestjs/common';
import { METHOD_METADATA } from '@nestjs/common/constants.js';
import { MetadataScanner, Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../../auth/decorators/public.decorator.js';
import { ROLES_KEY } from '../../auth/decorators/roles.decorator.js';
import { LOAI_TAI_KHOAN } from '../../auth/entities/enums.js';
import type { SourceFile } from '../../appointments/testing/architecture-rules.js';
import { stripComments } from '../../doctor/testing/architecture-scan.js';

// Luật quét cho test kiến trúc của `payment/` và `wallet/` (payment P4; PLAN payment 5.3, 5.10 E10; QTT-01, QTT-08, QTT-09, QTT-11, QTT-14). Hàm THUẦN nhận `{ path, source }`
// (đường dẫn tương đối so với `apps/api/src/`) hoặc danh sách lớp controller, nên test được bằng dữ liệu tổng hợp ("đột biến"); `payment/architecture.spec.ts` nạp cây `src/` thật.
// Dùng lại, không chép: `findWriteViolations` (AR-01) và `findForbiddenSql` (doctor) cho "không UPDATE lich_hen/khung_gio, không NOW()"; `stripComments` của doctor.
// GIỚI HẠN ĐÃ BIẾT (heuristic trên văn bản như các luật của booking): không bắt tên bảng ghép chuỗi từ nhiều biến; phần còn lại do review.

/** Hai thư mục của scope này; mọi luật ở đây chỉ xét file nằm trong đó. */
export const SCOPE_DIRS = ['payment/', 'wallet/'] as const;

export const inScope = (path: string): boolean =>
  SCOPE_DIRS.some((dir) => path.startsWith(dir));

/** Chỉ các file nguồn của scope (đã loại `testing/` và test bởi `listSourceFiles`). */
export const scopeFiles = (files: readonly SourceFile[]): SourceFile[] =>
  files.filter((file) => inScope(file.path));

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
// QTT-09: mọi lời gọi `checkIn` ở `payment/` chỉ truyền `actor: 'ThanhToan'` (quy tắc 46: tiếp đón do thanh toán tiền mặt là một đường riêng, không mượn quyền Lễ tân hay Quản trị viên).
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------

/** Lấy phần trong cặp ngoặc tròn bắt đầu tại `open` (vị trí dấu `(`), kể cả ngoặc lồng nhau. Không đóng được ⇒ lấy đến hết văn bản (an toàn: coi như thiếu `actor`). */
function argumentsText(code: string, open: number): string {
  let depth = 0;
  for (let i = open; i < code.length; i += 1) {
    const char = code[i];
    if (char === '(') depth += 1;
    if (char === ')') {
      depth -= 1;
      if (depth === 0) return code.slice(open, i + 1);
    }
  }
  return code.slice(open);
}

const CHECK_IN_CALL = /\.\s*checkIn\s*\(/g;
const ACTOR_THANH_TOAN = /\bactor\s*:\s*'ThanhToan'/;

/** Mỗi `.checkIn(…)` trong `payment/` phải có `actor: 'ThanhToan'` trong đối số; `'LeTan'`, `'QuanTriVien'` hay thiếu `actor` đều là vi phạm. */
export function findCheckInActorViolations(
  files: readonly SourceFile[],
): string[] {
  const found: string[] = [];
  for (const file of files) {
    if (!file.path.startsWith('payment/')) continue;
    const code = stripComments(file.source);
    for (const match of code.matchAll(CHECK_IN_CALL)) {
      const open = match.index + match[0].length - 1;
      if (ACTOR_THANH_TOAN.test(argumentsText(code, open))) continue;
      found.push(
        `${file.path}: gọi checkIn không truyền actor: 'ThanhToan' — thu tiền mặt chỉ được tiếp đón bằng actor 'ThanhToan' (PLAN payment E7)`,
      );
    }
  }
  return found;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
// QTT-11: hướng import giữa các module. `AppointmentsModule → WalletModule, PaymentPortsModule`; `WalletModule → PaymentPortsModule`; `PaymentModule → AppointmentsModule, WalletModule,
// PaymentPortsModule`. Hai module lá (`PaymentPortsModule`, `WalletModule`) không bao giờ nhập `AppointmentsModule` hay `PaymentModule`; `PaymentPortsModule` cũng không nhập `WalletModule`
// (lá nhập lá một chiều, Q22). Không `forwardRef` ở bất kỳ file nào của scope: vòng import phải được tháo bằng thiết kế, không bằng `forwardRef` (HDT-11, M16).
// Chỉ cấm import FILE MODULE; wallet/ được nhập hàm thuần như `appointments/locking/booking-transaction.ts` (PLAN M16).
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------

interface ForbiddenImport {
  /** Thư mục (tiền tố) của file bị kiểm */
  from: string;
  /** Mẫu đường dẫn import bị cấm */
  pattern: RegExp;
  /** Lý do ngắn, in ra trong thông điệp */
  lyDo: string;
}

const FORBIDDEN_IMPORTS: readonly ForbiddenImport[] = [
  {
    from: 'payment/ports/',
    pattern: /appointments\/appointments\.module/,
    lyDo: 'PaymentPortsModule là lá, không nhập AppointmentsModule',
  },
  {
    from: 'payment/ports/',
    pattern: /(?:^|\/)payment\.module(?:\.js)?$/,
    lyDo: 'PaymentPortsModule là lá, không nhập PaymentModule',
  },
  {
    from: 'payment/ports/',
    pattern: /wallet\/wallet\.module/,
    lyDo: 'PaymentPortsModule không nhập WalletModule (WalletModule nhập PaymentPortsModule, một chiều, Q22)',
  },
  {
    from: 'wallet/',
    pattern: /appointments\/appointments\.module/,
    lyDo: 'WalletModule là lá, không nhập AppointmentsModule',
  },
  {
    from: 'wallet/',
    pattern: /(?:^|\/)payment\.module(?:\.js)?$/,
    lyDo: 'WalletModule không nhập PaymentModule (chỉ PaymentPortsModule)',
  },
];

const IMPORT_SPECIFIER = /\bfrom\s+['"]([^'"]+)['"]/g;

export function findModuleImportViolations(
  files: readonly SourceFile[],
): string[] {
  const found: string[] = [];
  for (const file of scopeFiles(files)) {
    const code = stripComments(file.source);
    const specifiers = [...code.matchAll(IMPORT_SPECIFIER)].map(
      (match) => match[1] ?? '',
    );
    for (const rule of FORBIDDEN_IMPORTS) {
      if (!file.path.startsWith(rule.from)) continue;
      const hit = specifiers.find((specifier) => rule.pattern.test(specifier));
      if (hit !== undefined)
        found.push(`${file.path}: import "${hit}" — ${rule.lyDo}`);
    }
    if (/\bforwardRef\b/.test(code))
      found.push(
        `${file.path}: dùng forwardRef — vòng import module phải được tháo bằng thiết kế (cổng trong module lá), không bằng forwardRef (HDT-11)`,
      );
  }
  return found;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
// QTT-14: `nguoi_thu_id` và `nguoi_xu_ly_id` chỉ lấy từ token (người đang đăng nhập), không bao giờ từ dữ liệu client gửi lên (PLAN 5.7, 5.8).
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------

const IDENTITY_FIELD = '(?:nguoiThuId|nguoiXuLyId|nguoi_thu_id|nguoi_xu_ly_id)';
// Thuộc tính DTO mang tên đó, hoặc lấy thẳng từ `@Body('…')`, `@Query('…')`, `@Param('…')`
const DECLARED_IN_DTO = new RegExp(`\\b${IDENTITY_FIELD}\\s*[?!]?\\s*:`);
const READ_FROM_REQUEST = new RegExp(
  `@(?:Body|Query|Param)\\s*\\(\\s*['"]${IDENTITY_FIELD}['"]`,
);

export function findRequestIdentityViolations(
  files: readonly SourceFile[],
): string[] {
  const found: string[] = [];
  for (const file of scopeFiles(files)) {
    const code = stripComments(file.source);
    if (file.path.endsWith('.dto.ts') && DECLARED_IN_DTO.test(code))
      found.push(
        `${file.path}: DTO khai báo người thu hoặc người xử lý — các id này chỉ lấy từ token (QTT-14), không nhận từ client`,
      );
    if (READ_FROM_REQUEST.test(code))
      found.push(
        `${file.path}: đọc người thu hoặc người xử lý từ @Body/@Query/@Param — chỉ lấy từ token (QTT-14)`,
      );
  }
  return found;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
// QTT-01: mọi route có `@Roles` hợp lệ; `@Public` chỉ ở các route trong danh sách cho phép (hai route IPN: VNPAY và MoMo, do task B của chúng thêm vào).
// Đọc metadata CÙNG cách `RolesGuard` (method thay thế class), như `auditPatientControllers` của patient; khác ở chỗ cho phép MỘT danh sách `@Public` có tên.
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------

/** Tên `Controller.method` của các route được phép `@Public`. Hiện rỗng: hai route IPN chưa tồn tại; B-task thêm đúng hai dòng khi làm (kèm chữ ký ở `@Public`). */
export const PUBLIC_ROUTE_ALLOWLIST: readonly string[] = [];

/** Số route `@Public` tối đa của cả scope (PLAN 5.6: chỉ IPN của hai cổng). */
export const MAX_PUBLIC_ROUTES = 2;

export function findPaymentRouteViolations(
  controllers: Iterable<Type<unknown> | Function>,
  publicAllowlist: readonly string[] = PUBLIC_ROUTE_ALLOWLIST,
): string[] {
  const failures: string[] = [];
  const reflector = new Reflector();
  const scanner = new MetadataScanner();
  const knownRoles: readonly unknown[] = LOAI_TAI_KHOAN;
  let publicCount = 0;
  for (const controller of controllers) {
    const prototype = controller.prototype as Record<string, unknown>;
    for (const name of scanner.getAllMethodNames(prototype)) {
      const handler = prototype[name];
      if (
        typeof handler !== 'function' ||
        Reflect.getMetadata(METHOD_METADATA, handler) === undefined
      )
        continue;
      const route = `${controller.name}.${name}`;
      const targets = [handler, controller];
      const isPublic =
        reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets) === true;
      const problems: string[] = [];
      if (isPublic) {
        publicCount += 1;
        if (!publicAllowlist.includes(route))
          problems.push('có @Public nhưng không thuộc PUBLIC_ROUTE_ALLOWLIST');
      } else {
        const roles = reflector.getAllAndOverride<unknown>(ROLES_KEY, targets);
        if (!Array.isArray(roles) || roles.length === 0)
          problems.push('thiếu @Roles (hoặc rỗng)');
        else if (roles.some((role) => !knownRoles.includes(role)))
          problems.push('@Roles có vai trò không thuộc LOAI_TAI_KHOAN');
      }
      if (problems.length > 0)
        failures.push(`${route}: ${problems.join('; ')}`);
    }
  }
  if (publicCount > MAX_PUBLIC_ROUTES)
    failures.push(
      `có ${publicCount} route @Public, tối đa ${MAX_PUBLIC_ROUTES} (chỉ hai route IPN)`,
    );
  return failures;
}
