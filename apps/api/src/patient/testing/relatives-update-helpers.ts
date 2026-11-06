import type { DataSource, EntityManager } from 'typeorm';
import { afterAll, beforeAll, expect, vi } from 'vitest';
import type { TrangThaiLichHen } from '../../admin/entities/enums.js';
import type { LichHen } from '../../admin/entities/lich-hen.entity.js';
import { AdminFixtures } from '../../admin/testing/admin-fixtures.js';
import { AppException } from '../../common/errors/app.exception.js';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import {
  deferred,
  sleep,
} from '../../auth/testing/verification-int-helpers.js';
import type {
  NewRelative,
  RelativesRepository,
} from '../relatives/relatives.repository.js';
import { RelativesService } from '../relatives/relatives.service.js';
import { storedRows, type StoredRelative } from './relatives-helpers.js';

// Hàm trợ giúp DÙNG CHUNG của test sửa hồ sơ người thân (task B4; TRACKING patient B4-A, B4-F, B4-G). Gom một chỗ để các file int, concurrency và e2e mới
// (relatives.service.update.int-spec.ts, ...concurrency.int-spec.ts, test/patient-relatives-update.e2e-spec.ts) không chép nhau: CI chỉ bỏ `**/*.spec.ts`
// khỏi jscpd nên `*.int-spec.ts` và `*.e2e-spec.ts` vẫn bị quét. B5 (ngừng sử dụng) dùng lại. Dữ liệu cá nhân trong test là giả.

// Hai bộ năm giá trị sửa KHÁC NHAU ở cả năm trường, và khác hồ sơ do `insertRelativeRow` chèn (Con, Nam, 2000-01-01, SĐT NULL)
export const UPDATE_A: NewRelative = {
  hoTen: 'Nguyễn Thị Bộ Một',
  moiQuanHe: 'Cha',
  gioiTinh: 'Nu',
  ngaySinh: '2001-02-03',
  soDienThoai: '0911000001',
};
export const UPDATE_B: NewRelative = {
  hoTen: 'Trần Văn Bộ Hai',
  moiQuanHe: 'Me',
  gioiTinh: 'Khac',
  ngaySinh: '1999-12-31',
  soDienThoai: '0922000002',
};

/** Đúng năm cột mà `PUT /patient/relatives/:id` được ghi (tên cột DB, đã sắp xếp). */
export const UPDATED_COLUMNS = [
  'gioi_tinh',
  'ho_ten',
  'moi_quan_he',
  'ngay_sinh',
  'so_dien_thoai',
];

/** Thân JSON gửi lên của một bộ năm giá trị (SĐT `null` thì bỏ khoá, như form để trống). */
export const bodyOf = (input: NewRelative) => ({
  ...input,
  soDienThoai: input.soDienThoai ?? undefined,
});

/** Việc đó phải ném `AppException` đúng trạng thái HTTP và đúng mã lỗi ổn định (dùng chung của các file int B4). */
export function expectAppException(
  error: unknown,
  status: number,
  maLoi: string,
): void {
  expect(error).toBeInstanceOf(AppException);
  expect((error as AppException).getStatus()).toBe(status);
  expect((error as AppException).maLoi).toBe(maLoi);
}

/** Những thứ mà mọi file int của B4 cần: kết nối, fixture, dịch vụ dùng đúng `repository` truyền vào (để file test có thể `vi.spyOn` nó), và tạo Bệnh nhân mới. */
export interface RelativesIntegration {
  db: DataSource;
  fx: AdminFixtures;
  service: RelativesService;
  newPatient: () => Promise<string>;
}

/**
 * Dựng hạ tầng chung của test tích hợp B4 (mở kết nối, xoá bảng, giả đồng hồ trước mỗi test qua `useIntegrationHooks` của auth) và trả về MỘT đối tượng được gán lại
 * trước mỗi test. Gom một chỗ để hai file int không chép nhau và không chép phần dựng của relatives.service.int-spec.ts (B3): `jscpd` quét cả `*.int-spec.ts`.
 */
export function useRelativesIntegration(
  repository: RelativesRepository,
): RelativesIntegration {
  const context = {} as RelativesIntegration;
  useIntegrationHooks((db) => {
    context.db = db;
    context.fx = new AdminFixtures(db);
    context.service = new RelativesService(db, repository);
    context.newPatient = async () =>
      (await context.fx.patient()).account.taiKhoanId;
  });
  return context;
}

/** Hàng `ho_so_nguoi_than` nguyên văn trong DB của MỘT hồ sơ; ném lỗi nếu không có (ca test sai dữ liệu, không phải hành vi cần đo). */
export async function storedRow(
  db: DataSource,
  id: string,
): Promise<StoredRelative> {
  const row = (await storedRows(db)).find((r) => r.ho_so_nguoi_than_id === id);
  if (row === undefined) throw new Error(`Không có hồ sơ ${id} trong DB`);
  return row;
}

/** Tên các cột có giá trị khác nhau giữa hai hàng (đã sắp xếp). */
export function changedStoredColumns(
  before: StoredRelative,
  after: StoredRelative,
): string[] {
  return (Object.keys(before) as (keyof StoredRelative)[])
    .filter((column) => before[column] !== after[column])
    .sort();
}

/**
 * Đổi múi giờ CỦA TIẾN TRÌNH trong `describe` đang gọi (không chỉ của MySQL) và trả lại khi xong: một cách chuyển ngày bằng `Date` sẽ lệch một ngày ở
 * New York dù đúng ở +07:00 hay UTC. Đặt ở đây (không chép khối `beforeAll`, `afterAll` của RLI-07) để `jscpd` không thấy bản sao.
 * Ca dùng nó nên khẳng định `getTimezoneOffset()` thật sự khác của máy để không xanh giả.
 */
export function useProcessTimeZone(timeZone: string): void {
  let original: string | undefined;
  beforeAll(() => {
    original = process.env['TZ'];
    process.env['TZ'] = timeZone;
  });
  afterAll(() => {
    if (original === undefined) delete process.env['TZ'];
    else process.env['TZ'] = original;
  });
}

/** Gom mọi thứ ghi ra stdout và stderr (log của Nest) vào một mảng, tới khi `vi.restoreAllMocks()`. */
export function captureProcessOutput(): string[] {
  const chunks: string[] = [];
  const sink = (chunk: unknown): boolean => {
    chunks.push(String(chunk));
    return true;
  };
  vi.spyOn(process.stderr, 'write').mockImplementation(sink);
  vi.spyOn(process.stdout, 'write').mockImplementation(sink);
  return chunks;
}

/**
 * Dựng MỘT lịch hẹn thật ở trạng thái `trangThai` cho hồ sơ người thân `relativeId` của Bệnh nhân `ownerId`. Mỗi lần gọi dựng riêng chi nhánh, bác sĩ, ca
 * và khung giờ (nên hai lịch không tranh nhau cột sinh UNIQUE `khung_gio_dang_giu`). `lich_hen` có khoá ngoại ghép (ho_so_nguoi_than_id, benh_nhan_id).
 */
export async function appointmentForRelative(
  fx: AdminFixtures,
  ownerId: string,
  relativeId: string,
  trangThai: TrangThaiLichHen,
): Promise<LichHen> {
  const doctor = await fx.doctor(await fx.branch());
  const slot = await fx.slot(await fx.shift(doctor.profile));
  return fx.appointment(doctor.profile, slot, ownerId, {
    hoSoNguoiThanId: relativeId,
    trangThai,
  });
}

/** Số giao dịch đang CHỜ khoá của InnoDB (toàn máy chủ; DB test chạy tuần tự nên chỉ là của ca đang chạy). */
export async function lockWaiters(db: DataSource): Promise<number> {
  const rows = await db.query<{ n: string }[]>(
    'SELECT CAST(COUNT(*) AS CHAR) AS n FROM performance_schema.data_lock_waits',
  );
  return Number(rows[0]?.n ?? 0);
}

/** Chờ tới khi có ÍT NHẤT một giao dịch đang chờ khoá (kiểm bằng `data_lock_waits`, không `sleep` cố định); quá hạn thì ném lỗi. */
export async function waitForLockWaiter(
  db: DataSource,
  timeoutMs = 5000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await lockWaiters(db)) > 0) return;
    await sleep(20);
  }
  throw new Error('Không thấy giao dịch nào chờ khoá trong hạn');
}

/**
 * Làm lần gọi `findRelativeById` KẾ TIẾP (bước đọc lại của `service.update`, ngay sau câu UPDATE) DỪNG lại tới khi gọi `resume()`: giao dịch của `update`
 * còn MỞ và vẫn giữ khoá của câu UPDATE trong lúc test chen việc khác vào. `entered` xong khi lời gọi đó đã tới. LUÔN gọi `resume()` trong `finally`
 * để không bao giờ để giao dịch mở treo DB dùng chung.
 */
export function pauseNextRead(repository: RelativesRepository): {
  entered: Promise<void>;
  resume: () => void;
} {
  const entered = deferred();
  const gate = deferred();
  const original = repository.findRelativeById.bind(repository);
  vi.spyOn(repository, 'findRelativeById').mockImplementationOnce(
    async (em, benhNhanId, id) => {
      entered.resolve();
      await gate.promise;
      return original(em, benhNhanId, id);
    },
  );
  return { entered: entered.promise, resume: gate.resolve };
}

/**
 * Ép thứ tự bằng chờ khoá THẬT: `hold` chạy trong một giao dịch và GIỮ khoá (giao dịch còn mở); `queued` bắt đầu khi đó và phải xếp hàng chờ khoá (đợi tới khi
 * `data_lock_waits` thấy bên chờ); rồi nhả `hold` (commit) để `queued` chạy tiếp. Trả kết quả của `queued`. Nhả luôn nằm trong `finally`, kể cả khi `hold`,
 * `queued` hay việc chờ thất bại, để không bao giờ để giao dịch mở treo DB dùng chung.
 */
export async function queueBehindLock<T>(
  db: DataSource,
  hold: (em: EntityManager) => Promise<unknown>,
  queued: () => Promise<T>,
): Promise<T> {
  const locked = deferred();
  const release = deferred();
  const holder = db.transaction('READ COMMITTED', async (em) => {
    await hold(em);
    locked.resolve();
    await release.promise;
  });
  let waiting: Promise<T> | undefined;
  try {
    await Promise.race([locked.promise, holder]);
    waiting = queued();
    waiting.catch(() => undefined); // lỗi của `queued` được trả ở dưới; tránh cảnh báo "unhandled" nếu việc chờ thất bại trước
    await waitForLockWaiter(db);
    release.resolve();
    await holder;
    return await waiting;
  } finally {
    release.resolve();
    await holder.catch(() => undefined);
    await waiting?.catch(() => undefined);
  }
}
