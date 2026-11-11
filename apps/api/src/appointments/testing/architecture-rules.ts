import { stripComments } from '../../doctor/testing/architecture-scan.js';
import { auditPatientControllers } from '../../patient/testing/patient-route-audit.js';
import { LICH_HEN_FORBIDDEN_LOCK_COLUMNS } from '../locking/lock-order.js';

// Luật quét mã nguồn cho test kiến trúc của booking (PLAN booking 7.11: AR-01, AR-04, AR-05; TRACKING 3.3 P1-I). Hàm THUẦN nhận danh sách `{ path, source }` để test được
// bằng dữ liệu tổng hợp; `architecture.spec.ts` nạp cây `src/` thật. Dùng `stripComments` của doctor (TECH_DEBT dòng 88), không sao chép.
//
// GIỚI HẠN ĐÃ BIẾT (heuristic trên văn bản, không phải trình phân tích SQL): không bắt SQL ghép chuỗi từ nhiều biến, ghi qua đối tượng repository đặt tên biến
// (`repo.save(x)`), hay `FOR UPDATE OF <bảng>` của MySQL 8; phần còn lại do review (H7). Chỉ cấm GHI, không cấm đọc (`SELECT`, `JOIN`, `FOR SHARE`).

export interface SourceFile {
  /** Đường dẫn tương đối so với `apps/api/src/`, dấu `/` (ví dụ `scheduling/slots/slot-generator.ts`) */
  path: string;
  source: string;
}

interface Rule {
  name: string;
  patterns: readonly RegExp[];
}

const ENTITY_WRITE_METHODS =
  'update|save|insert|delete|remove|softDelete|softRemove|upsert|increment|decrement';

// AR-01: câu ghi `lich_hen` và `khung_gio`. Tên bảng khớp theo ranh giới từ (`lich_hen_cho` KHÔNG bị bắt nhầm).
export const WRITE_RULES: readonly Rule[] = [
  {
    name: 'UPDATE lich_hen',
    patterns: [/\bUPDATE\s+(?:IGNORE\s+)?`?lich_hen`?(?!\w)/i],
  },
  {
    name: 'UPDATE khung_gio',
    patterns: [/\bUPDATE\s+(?:IGNORE\s+)?`?khung_gio`?(?!\w)/i],
  },
  {
    name: 'INSERT INTO lich_hen',
    patterns: [
      /\b(?:INSERT|REPLACE)\s+(?:IGNORE\s+)?INTO\s+`?lich_hen`?(?!\w)/i,
    ],
  },
  {
    name: 'DELETE FROM lich_hen',
    patterns: [/\bDELETE\s+(?:IGNORE\s+)?FROM\s+`?lich_hen`?(?!\w)/i],
  },
  {
    name: 'INSERT INTO khung_gio',
    patterns: [
      /\b(?:INSERT|REPLACE)\s+(?:IGNORE\s+)?INTO\s+`?khung_gio`?(?!\w)/i,
    ],
  },
  {
    name: 'DELETE FROM khung_gio',
    patterns: [/\bDELETE\s+(?:IGNORE\s+)?FROM\s+`?khung_gio`?(?!\w)/i],
  },
  {
    name: 'TRUNCATE lich_hen hoặc khung_gio',
    patterns: [/\bTRUNCATE\s+(?:TABLE\s+)?`?(?:lich_hen|khung_gio)`?(?!\w)/i],
  },
  {
    name: 'ghi thực thể LichHen hoặc KhungGio',
    patterns: [
      new RegExp(
        `\\.\\s*(?:${ENTITY_WRITE_METHODS})\\s*\\(\\s*(?:LichHen|KhungGio)\\b`,
      ),
      new RegExp(
        `getRepository\\s*(?:<[^>]*>)?\\s*\\(\\s*(?:LichHen|KhungGio)\\s*\\)\\s*\\.\\s*(?:${ENTITY_WRITE_METHODS})\\b`,
      ),
    ],
  },
];

/** Ngoại lệ có chủ đích: THƯ MỤC được dùng một số mẫu ghi, kèm lý do. Thêm dòng ở đây là cách DUY NHẤT để module khác có SQL ghi hợp lệ; báo chủ module booking. */
export interface AllowedWrite {
  /** Tiền tố đường dẫn (kết thúc bằng `/`) */
  dir: string;
  /** Tên các mẫu của `WRITE_RULES` được phép, hoặc 'ALL' */
  rules: readonly string[] | 'ALL';
  lyDo: string;
}

export const ALLOWED_WRITES: readonly AllowedWrite[] = [
  {
    dir: 'scheduling/',
    rules: ['INSERT INTO khung_gio', 'DELETE FROM khung_gio'],
    lyDo: 'doctor D1, D7: bộ sinh `khung_gio` chèn ô `ConTrong` (slot-generator.ts); không có ngoại lệ nào cho UPDATE',
  },
  {
    dir: 'doctor/',
    rules: ['INSERT INTO khung_gio', 'DELETE FROM khung_gio'],
    lyDo: 'doctor D7: gỡ ca chỉ xoá ô `ConTrong` sau `FOR UPDATE` đúng hàng đó (B4 của doctor); không có ngoại lệ nào cho UPDATE',
  },
  {
    dir: 'database/migrations/',
    rules: 'ALL',
    lyDo: 'lịch sử schema: migration không phải đường ghi nghiệp vụ',
  },
  {
    dir: 'database/seeds/',
    rules: ['INSERT INTO lich_hen', 'INSERT INTO khung_gio'],
    lyDo: 'dữ liệu mẫu chỉ chèn, không đổi trạng thái',
  },
];

const OWN_DIR = 'appointments/';

const isAllowed = (
  path: string,
  ruleName: string,
  allowed: readonly AllowedWrite[],
) =>
  allowed.some(
    (entry) =>
      path.startsWith(entry.dir) &&
      (entry.rules === 'ALL' || entry.rules.includes(ruleName)),
  );

/**
 * AR-01 (H7): câu ghi `lich_hen` và `khung_gio` NGOÀI `appointments/`, trừ ngoại lệ trong `allowed`. Trả danh sách thông điệp (rỗng = đạt), mỗi dòng nói
 * file, mẫu bị bắt và cách xử lý.
 */
export function findWriteViolations(
  files: readonly SourceFile[],
  allowed: readonly AllowedWrite[] = ALLOWED_WRITES,
): string[] {
  const found: string[] = [];
  for (const file of files) {
    if (file.path.startsWith(OWN_DIR)) continue;
    const code = stripComments(file.source);
    for (const rule of WRITE_RULES) {
      if (!rule.patterns.some((pattern) => pattern.test(code))) continue;
      if (isAllowed(file.path, rule.name, allowed)) continue;
      found.push(
        `${file.path}: ${rule.name} — chỉ module booking (appointments/) được ghi lich_hen và khung_gio. Nếu hợp lệ, thêm dòng vào ALLOWED_WRITES ở appointments/testing/architecture-rules.ts kèm lý do và báo chủ module booking`,
      );
    }
  }
  return found;
}

/**
 * AR-02 và QB-07 (task B1; PLAN booking 5.9, 7.9, 7.11): mọi route của các controller đã đăng ký trong `AppointmentsModule` phải có `@Roles` hợp lệ (đọc cùng cách `RolesGuard`:
 * method thay thế class) và không có `@Public`; không có `@Roles` thì mọi vai trò đã đăng nhập đi qua. DÙNG LẠI bộ quét metadata của patient (QP-08: hàm không có gì riêng của patient,
 * đã có test riêng), không chép. Khác các luật AR-01, AR-04, AR-05 ở trên (quét VĂN BẢN nguồn), luật này đọc metadata của lớp controller nên nhận danh sách lớp, không nhận `SourceFile`.
 * Controller lấy từ metadata của module nên không phải giữ danh sách route viết tay: controller mới đăng ký là tự bị quét. Trả danh sách vi phạm, rỗng = đạt.
 */
export function findRouteRoleViolations(
  controllers: Parameters<typeof auditPatientControllers>[0],
): string[] {
  return auditPatientControllers(controllers);
}

/**
 * Luật NỘI BỘ của AR-06 (task B6b; TRACKING 3.14 B6-G; CG-10 là phần `khung_gio`): AR-01 chỉ cấm ghi NGOÀI `appointments/`; trong `appointments/` mỗi bảng chỉ có MỘT nơi ghi: `UPDATE khung_gio`
 * chỉ ở `slots/` (`SlotHoldService`), `UPDATE lich_hen` chỉ ở `state/` (`cancelLapsedHold`, B9 thêm lớp cạnh nó), `INSERT INTO lich_hen` chỉ ở `create/` (B8), và `INSERT INTO khung_gio`,
 * `DELETE FROM khung_gio` KHÔNG ở đâu cả (D7: booking không chèn, không xoá khung giờ). Tên mẫu lấy từ `WRITE_RULES` (một chỗ định nghĩa mẫu); thêm ngoại lệ là sửa mảng này kèm lý do.
 */
export interface InternalWriteRule {
  /** Tên mẫu trong `WRITE_RULES` */
  rule: string;
  /** Thư mục (kết thúc bằng `/`, tính từ `src/`) được dùng mẫu này; rỗng = không nơi nào */
  allowedDirs: readonly string[];
  /** Vì sao, và nếu hợp lệ thì làm gì */
  lyDo: string;
}

export const INTERNAL_WRITE_RULES: readonly InternalWriteRule[] = [
  {
    rule: 'UPDATE khung_gio',
    allowedDirs: ['appointments/slots/'],
    lyDo: 'mọi ghi khung_gio đi qua SlotHoldService (CG-10, doctor D7, PLAN 5.10 W3)',
  },
  {
    rule: 'UPDATE lich_hen',
    allowedDirs: ['appointments/state/'],
    lyDo: 'chỉ lớp trạng thái (appointments/state/) ghi lich_hen.trang_thai (H7)',
  },
  {
    rule: 'INSERT INTO lich_hen',
    allowedDirs: ['appointments/create/'],
    lyDo: 'chỉ luồng tạo lịch (appointments/create/, task B8) chèn lich_hen',
  },
  {
    rule: 'INSERT INTO khung_gio',
    allowedDirs: [],
    lyDo: 'booking không chèn khung_gio (doctor D1: chỉ bộ sinh khung giờ của scheduling/ chèn ô ConTrong)',
  },
  {
    rule: 'DELETE FROM khung_gio',
    allowedDirs: [],
    lyDo: 'booking không xoá khung_gio (doctor D7: chỉ gỡ ca của doctor/ xoá ô ConTrong)',
  },
];

/**
 * AR-06: câu ghi SAI CHỖ trong `appointments/` (code, không phải `testing/` hay file test: bộ nạp đã bỏ). Trả danh sách thông điệp (rỗng = đạt). Cùng giới hạn đã biết của AR-01 (văn bản, không bắt SQL ghép chuỗi).
 */
export function findInternalWriteViolations(
  files: readonly SourceFile[],
  rules: readonly InternalWriteRule[] = INTERNAL_WRITE_RULES,
): string[] {
  const found: string[] = [];
  for (const file of files) {
    if (!file.path.startsWith(OWN_DIR)) continue;
    const code = stripComments(file.source);
    for (const entry of rules) {
      const write = WRITE_RULES.find(
        (candidate) => candidate.name === entry.rule,
      );
      if (write === undefined)
        throw new Error(
          `INTERNAL_WRITE_RULES: không có mẫu "${entry.rule}" trong WRITE_RULES`,
        );
      if (!write.patterns.some((pattern) => pattern.test(code))) continue;
      if (entry.allowedDirs.some((dir) => file.path.startsWith(dir))) continue;
      found.push(
        `${file.path}: ${entry.rule} — ${entry.lyDo}. Chỗ được phép: ${entry.allowedDirs.length === 0 ? 'không nơi nào' : entry.allowedDirs.join(', ')}`,
      );
    }
  }
  return found;
}

// AR-04 (H8): giờ của DB. Mọi mốc từ `nowVN()` rồi `toSecond()` và truyền `:now` vào SQL (test dùng đồng hồ giả).
const CLOCK_RULES: readonly Rule[] = [
  { name: 'NOW()', patterns: [/\bNOW\s*\(/i] },
  { name: 'CURDATE()', patterns: [/\bCURDATE\s*\(/i] },
  { name: 'CURTIME()', patterns: [/\bCURTIME\s*\(/i] },
  { name: 'SYSDATE()', patterns: [/\bSYSDATE\s*\(/i] },
  { name: 'UTC_TIMESTAMP()', patterns: [/\bUTC_TIMESTAMP\s*\(/i] },
  { name: 'CURRENT_DATE', patterns: [/\bCURRENT_DATE\b/i] },
  { name: 'CURRENT_TIMESTAMP', patterns: [/\bCURRENT_TIMESTAMP\b/i] },
];

/** AR-04: hàm giờ của DB trong mã của `appointments/` (không quét cả `src/`: entity có `default: () => 'CURRENT_TIMESTAMP'`). */
export function findClockViolations(files: readonly SourceFile[]): string[] {
  return files
    .filter((file) => file.path.startsWith(OWN_DIR))
    .flatMap((file) => {
      const code = stripComments(file.source);
      return CLOCK_RULES.filter((rule) =>
        rule.patterns.some((pattern) => pattern.test(code)),
      ).map(
        (rule) =>
          `${file.path}: ${rule.name} — dùng \`nowVN()\` rồi \`toSecond()\` và truyền :now vào SQL (H8)`,
      );
    });
}

// AR-05 (doctor M10, M12; PLAN 5.3 quy tắc 7).
const DATE_AROUND_TIME =
  /\bDATE\s*\(\s*(?:`?\w+`?\s*\.\s*)?`?thoi_gian`?\s*\)/i;
const STRING_LITERAL =
  /`(?:[^`\\]|\\[\s\S])*`|'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"/g;
const LOCKING_CLAUSE = /\bFOR\s+(?:UPDATE|SHARE)\b/i;
const READS_LICH_HEN = /\b(?:FROM|JOIN)\s+`?lich_hen`?(?!\w)/i;

/**
 * AR-05: (i) `DATE(` bao quanh cột `thoi_gian` (mất chỉ mục `(bac_si_id, thoi_gian)`: dùng khoảng nửa mở); (ii) câu SQL có mệnh đề khoá đọc `lich_hen` mà ĐIỀU KIỆN
 * (sau `WHERE`) dùng `khung_gio_id` hay `khung_gio_dang_giu` (quy tắc 7: chỉ khoá bằng `lich_hen_id` hoặc `ma_lich_hen`; doctor M12: deadlock 1213). Câu khoá
 * `khung_gio` theo `khung_gio_id` (khoá chính của khung giờ) là HỢP LỆ. Quét MỌI file nguồn của `src/`, vì nguy cơ M12 đến cả từ doctor.
 */
export function findIndexAndLockViolations(
  files: readonly SourceFile[],
): string[] {
  const found: string[] = [];
  for (const file of files) {
    const code = stripComments(file.source);
    if (DATE_AROUND_TIME.test(code))
      found.push(
        `${file.path}: DATE(thoi_gian) — bọc cột chỉ mục làm mất chỉ mục; dùng khoảng nửa mở trên thoi_gian (doctor M10)`,
      );
    for (const literal of code.match(STRING_LITERAL) ?? []) {
      if (!LOCKING_CLAUSE.test(literal) || !READS_LICH_HEN.test(literal))
        continue;
      const where = literal
        .split(/\bWHERE\b/i)
        .slice(1)
        .join(' ');
      for (const column of LICH_HEN_FORBIDDEN_LOCK_COLUMNS) {
        if (new RegExp(`\\b${column}\\b`, 'i').test(where))
          found.push(
            `${file.path}: khoá lich_hen theo ${column} — chỉ khoá bằng lich_hen_id hoặc ma_lich_hen (PLAN 5.3 quy tắc 7, doctor M12)`,
          );
      }
    }
  }
  return found;
}
