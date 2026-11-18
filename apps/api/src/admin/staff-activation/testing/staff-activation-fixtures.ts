// Hạ tầng dùng chung cho test TÍCH HỢP và ĐUA của kích hoạt công khai (task B16, MySQL thật). Chỉ dùng trong test (thư mục testing/ không vào bản build).
// Dựng trên fixture của B14: liên kết được cấp bằng ĐƯỜNG THẬT (`issue` + `deliver` qua thư giả), token chỉ đọc được từ thư như người nhận thật.
import { randomBytes } from 'node:crypto';
import type { DataSource } from 'typeorm';
import type { TaiKhoan } from '../../../auth/entities/tai-khoan.entity.js';
import { PasswordHasher } from '../../../auth/password/password-hasher.service.js';
import type { FakeMailService } from '../../../mail/testing/fake-mail.service.js';
import type { StaffLoaiTaiKhoan } from '../activation-link.types.js';
import { StaffActivationRepository } from '../staff-activation.repository.js';
import { StaffActivationService } from '../staff-activation.service.js';
import {
  createActivationFixture,
  issueAndDeliver,
  newPendingStaff,
  parseActivationMail,
  type ActivationFixture,
} from './activation-link-fixtures.js';

/** Mật khẩu hợp lệ sinh lúc chạy (không ghi cứng chuỗi trông như bí mật): 12 ký tự hex cộng đủ chữ số và ký tự đặc biệt. */
export const newCredential = (): string =>
  `${randomBytes(6).toString('hex')}Aa1!`;

export interface StaffActivationFixture {
  db: DataSource;
  /** Fixture của B14: dịch vụ cấp liên kết, thư giả, cấu hình (TTL 24 giờ) */
  links: ActivationFixture<FakeMailService>;
  hasher: PasswordHasher;
  repo: StaffActivationRepository;
  service: StaffActivationService;
}

export interface FixtureOptions {
  hasher?: PasswordHasher;
  repo?: StaffActivationRepository;
}

export function createStaffActivationFixture(
  db: DataSource,
  options: FixtureOptions = {},
): StaffActivationFixture {
  const links = createActivationFixture(db);
  const hasher = options.hasher ?? new PasswordHasher();
  const repo = options.repo ?? new StaffActivationRepository();
  return {
    db,
    links,
    hasher,
    repo,
    service: new StaffActivationService(db, repo, links.repo, hasher),
  };
}

export interface LiveLink {
  account: TaiKhoan;
  id: string;
  /** Token rõ đọc từ thư giả, giống người nhận thật */
  token: string;
}

/** Nhân sự `ChoKichHoat` mới cùng MỘT liên kết đã cấp và đã gửi thành công (thư giả) ở đồng hồ hiện tại. */
export async function newLiveLink(
  fx: Pick<StaffActivationFixture, 'db' | 'links'>,
  loaiTaiKhoan: StaffLoaiTaiKhoan = 'LeTan',
): Promise<LiveLink> {
  const account = await newPendingStaff(fx.db, loaiTaiKhoan);
  return linkFor(fx.links, account, 'TaoMoi');
}

/** Cấp và gửi thêm một liên kết cho tài khoản đã có (gửi lại phải cách ≥ 60 giây theo đồng hồ giả). */
export async function linkFor(
  links: ActivationFixture<FakeMailService>,
  account: TaiKhoan,
  kind: 'TaoMoi' | 'GuiLai',
): Promise<LiveLink> {
  const { id, result } = await issueAndDeliver(links, account, kind);
  if (!result.ok) throw new Error('thư giả không được phép gửi lỗi ở đây');
  const parsed = parseActivationMail(links.mail.sent.at(-1));
  if (parsed.id !== id) throw new Error('id trong thư khác id vừa cấp');
  return { account, id, token: parsed.token };
}

/** Bản chụp MỌI cột của hàng tài khoản và mọi hàng liên kết của nó (dạng chuỗi JSON) để so "y nguyên từng cột". */
export async function snapshotOf(
  db: DataSource,
  taiKhoanId: string,
): Promise<string> {
  const accountRows: unknown[] = await db.query(
    'SELECT * FROM tai_khoan WHERE tai_khoan_id = ?',
    [taiKhoanId],
  );
  const linkRows: unknown[] = await db.query(
    'SELECT * FROM ma_xac_thuc WHERE tai_khoan_id = ? ORDER BY ma_xac_thuc_id',
    [taiKhoanId],
  );
  return JSON.stringify({ accountRows, linkRows });
}

export interface LockSummary {
  /** Số khoá ĐÃ CẤP loại RECORD, chế độ X, theo tên bảng (chỉ DB đang dùng: các cửa sổ khác dùng DB khác) */
  grantedExclusive: Record<string, number>;
  /** Số khoá ĐANG CHỜ theo tên bảng */
  waiting: Record<string, number>;
}

/** ĐO THẬT khoá hàng của giao dịch đang mở bằng `performance_schema.data_locks`, lọc theo `OBJECT_SCHEMA = DATABASE()`. Không giả định thứ tự khoá. */
export async function locksHeld(db: DataSource): Promise<LockSummary> {
  const rows: {
    OBJECT_NAME: string;
    LOCK_MODE: string;
    LOCK_STATUS: string;
    n: string;
  }[] = await db.query(
    `SELECT OBJECT_NAME, LOCK_MODE, LOCK_STATUS, COUNT(*) AS n
       FROM performance_schema.data_locks
      WHERE OBJECT_SCHEMA = DATABASE() AND LOCK_TYPE = 'RECORD'
      GROUP BY OBJECT_NAME, LOCK_MODE, LOCK_STATUS`,
  );
  const summary: LockSummary = { grantedExclusive: {}, waiting: {} };
  for (const row of rows) {
    const count = Number(row.n);
    if (row.LOCK_STATUS === 'WAITING') {
      summary.waiting[row.OBJECT_NAME] =
        (summary.waiting[row.OBJECT_NAME] ?? 0) + count;
    } else if (row.LOCK_MODE.startsWith('X')) {
      summary.grantedExclusive[row.OBJECT_NAME] =
        (summary.grantedExclusive[row.OBJECT_NAME] ?? 0) + count;
    }
  }
  return summary;
}

/** Chờ tới khi `check` đúng (thăm dò ngắn); hết `timeoutMs` thì ném, để ca đỏ thay vì treo. */
export async function eventually(
  check: () => Promise<boolean>,
  what: string,
  timeoutMs = 8000,
): Promise<void> {
  // performance.now() chứ không Date.now(): test tích hợp giả đồng hồ `Date`, nên Date.now() đứng yên và vòng chờ không bao giờ hết hạn
  const started = performance.now();
  while (!(await check())) {
    if (performance.now() - started > timeoutMs) {
      throw new Error(`hết ${String(timeoutMs)} ms chờ: ${what}`);
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 25);
    });
  }
}
