import type { EntityManager } from 'typeorm';
import { vi } from 'vitest';
import { captureNestLogger } from '../../../auth/testing/otp-int-helpers.js';
import { AppException } from '../../../common/errors/app.exception.js';
import type { AdminScope } from '../../../rbac/admin-scope.js';
import { BranchAccessPolicy } from '../../../rbac/branch-access.policy.js';
import { accountVisibility } from '../../accounts/account-visibility.js';
import type { ActivationLinkService } from '../../staff-activation/activation-link.service.js';
import type {
  DeliverActivationLinkResult,
  IssueActivationLinkResult,
} from '../../staff-activation/activation-link.types.js';
import { IssuedActivationLink } from '../../staff-activation/issued-activation-link.js';
import type { AccountResendRepository } from '../account-resend.repository.js';
import { AccountResendService } from '../account-resend.service.js';
import type { ResendTarget } from '../account-resend.types.js';

// Task B20 (admin) — AccountResendService ở mức đơn vị: kho giả và dịch vụ liên kết (B14) giả ghi lại THỨ TỰ lời gọi; giao dịch giả ghi "commit" hay
// "rollback". Không DB, không SMTP. Phần cần MySQL thật (khoá hàng, UNIQUE, đua) ở account-resend*.int-spec.ts.
// Mã TKB20-nn là [đề xuất]; mã PLAN ghi kèm (TK-40…48, NS-45).

const SYSTEM: AdminScope = { kind: 'ToanHeThong' };
const BRANCH: AdminScope = { kind: 'ChiNhanh', chiNhanhId: '7' };
const ID = '10';
const EXPIRES = new Date('2026-11-20T08:00:00.000Z');
const SECRET_URL = 'https://web.test/kich-hoat#id=900&token=SECRETTOKEN';
const TARGET_EMAIL = 'lan.pham@example.com';

const staff: ResendTarget = {
  taiKhoanId: ID,
  loaiTaiKhoan: 'LeTan',
  trangThai: 'ChoKichHoat',
  chiNhanhId: '7',
  hoTen: 'Phạm Thị Lan',
  email: TARGET_EMAIL,
};

const mysqlError = (errno: number, code: string): Error =>
  Object.assign(new Error(`lỗi MySQL giả ${code}`), { errno, code });
const deadlock = (): Error => mysqlError(1213, 'ER_LOCK_DEADLOCK');

const newIssued = (): IssuedActivationLink =>
  new IssuedActivationLink(
    {
      maXacThucId: '900',
      taiKhoanId: ID,
      kind: 'GuiLai',
      loaiTaiKhoan: 'LeTan',
      hetHanLuc: EXPIRES,
      ttlHours: 24,
    },
    SECRET_URL,
  );

class World {
  events: string[] = [];
  readonly manager = { tag: 'manager-giao-dich' } as unknown as EntityManager;
  target: ResendTarget | null = staff;
  /** Lỗi ném ở bước khoá, theo thứ tự (để bơm deadlock vào BÊN TRONG hàm giao dịch). */
  lockErrors: Error[] = [];
  issueResult: IssueActivationLinkResult = { ok: true, issued: newIssued() };
  deliverResult: DeliverActivationLinkResult | Error = {
    ok: true,
    maXacThucId: '900',
    hetHanLuc: EXPIRES,
  };
  transactions = 0;

  readonly repo = {
    lockAccount: vi.fn((_em: EntityManager, _id: string) => {
      this.events.push('khoa');
      const error = this.lockErrors.shift();
      return error ? Promise.reject(error) : Promise.resolve();
    }),
    findVisible: vi.fn(() => {
      this.events.push('doc');
      return Promise.resolve(this.target);
    }),
  };
  readonly links = {
    transaction: vi.fn(
      async (work: (em: EntityManager) => Promise<unknown>) => {
        this.transactions += 1;
        this.events.push('mo-giao-dich');
        try {
          const result = await work(this.manager);
          this.events.push('commit');
          return result;
        } catch (error) {
          this.events.push('rollback');
          throw error;
        }
      },
    ),
    issue: vi.fn(() => {
      this.events.push('issue');
      return Promise.resolve(this.issueResult);
    }),
    deliver: vi.fn(() => {
      this.events.push('gui-thu');
      return this.deliverResult instanceof Error
        ? Promise.reject(this.deliverResult)
        : Promise.resolve(this.deliverResult);
    }),
  };
  readonly policy = new BranchAccessPolicy();
  readonly service = new AccountResendService(
    this.links as unknown as ActivationLinkService,
    this.repo as unknown as AccountResendRepository,
    this.policy,
  );
}

async function failure(work: Promise<unknown>): Promise<AppException> {
  const error = await work.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(AppException);
  return error as AppException;
}

let world: World;
let logs: string[];

beforeEach(() => {
  world = new World();
  logs = captureNestLogger();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('TKB20-01 (TK-44, TK-40, PQ-13) — thứ tự kiểm: khoá → đọc theo tầm nhìn (404) → quyền (403) → issue', () => {
  it('KHÔNG thấy đích (không tồn tại hoặc ngoài tầm nhìn) ⇒ 404 KHONG_TIM_THAY với cả hai phạm vi; có khoá và đọc, KHÔNG issue, KHÔNG gửi thư; giao dịch hoàn tác', async () => {
    for (const scope of [SYSTEM, BRANCH]) {
      world = new World();
      world.target = null;
      const error = await failure(world.service.resend(scope, ID));
      expect(error.getStatus()).toBe(404);
      expect(error.getResponse()).toMatchObject({ maLoi: 'KHONG_TIM_THAY' });
      expect(world.events).toEqual(['mo-giao-dich', 'khoa', 'doc', 'rollback']);
    }
  });

  it('Chi nhánh + Bệnh nhân THẤY được ⇒ 403 KHONG_DU_QUYEN, không issue, không gửi thư', async () => {
    world.target = {
      ...staff,
      loaiTaiKhoan: 'BenhNhan',
      chiNhanhId: null,
      trangThai: 'DangHoatDong',
    };
    const error = await failure(world.service.resend(BRANCH, ID));
    expect(error.getStatus()).toBe(403);
    expect(error.getResponse()).toMatchObject({ maLoi: 'KHONG_DU_QUYEN' });
    expect(world.events).toEqual(['mo-giao-dich', 'khoa', 'doc', 'rollback']);
  });

  it('phòng thủ: kho (lỗi) trả nhân sự chi nhánh khác hoặc Quản trị viên cho Chi nhánh ⇒ vẫn 404, không issue', async () => {
    for (const target of [
      { ...staff, chiNhanhId: '8' },
      { ...staff, loaiTaiKhoan: 'QuanTriVien' as const, chiNhanhId: '7' },
    ]) {
      world = new World();
      world.target = target;
      const error = await failure(world.service.resend(BRANCH, ID));
      expect(error.getStatus()).toBe(404);
      expect(world.events).not.toContain('issue');
    }
  });

  it('Toàn hệ thống + Bệnh nhân KHÔNG bị ma trận chặn: đi tới issue (B14 trả 409 sau đó, TK-43)', async () => {
    world.target = { ...staff, loaiTaiKhoan: 'BenhNhan', chiNhanhId: null };
    await world.service.resend(SYSTEM, ID);
    expect(world.events).toContain('issue');
  });

  it('repository nhận ĐÚNG điều kiện accountVisibility(policy, scope) của người gọi và cùng manager của giao dịch', async () => {
    for (const scope of [SYSTEM, BRANCH]) {
      world = new World();
      await world.service.resend(scope, ID);
      expect(world.repo.lockAccount).toHaveBeenCalledWith(world.manager, ID);
      expect(world.repo.findVisible).toHaveBeenCalledWith(
        world.manager,
        accountVisibility(world.policy, scope),
        ID,
      );
    }
  });

  it('THỨ TỰ: khoá TRƯỚC đọc (đọc phải thấy mọi thay đổi đã commit của người giữ khoá trước), đọc trước issue', async () => {
    await world.service.resend(SYSTEM, ID);
    expect(world.events.slice(0, 4)).toEqual([
      'mo-giao-dich',
      'khoa',
      'doc',
      'issue',
    ]);
  });

  it('issue nhận id THẬT của hàng đọc được, kind GuiLai (thư mẫu 675:2) và manager CỦA GIAO DỊCH (không mở giao dịch thứ hai)', async () => {
    await world.service.resend(SYSTEM, ID);
    expect(world.links.issue).toHaveBeenCalledTimes(1);
    expect(world.links.issue).toHaveBeenCalledWith(
      { taiKhoanId: ID, kind: 'GuiLai' },
      { manager: world.manager },
    );
    expect(world.transactions).toBe(1);
  });
});

describe('TKB20-03 (TK-40, TK-48) — thành công: gửi thư SAU commit, người nhận là tài khoản đích, phản hồi đúng ba khoá', () => {
  it('thứ tự đầy đủ: mở giao dịch → khoá → đọc → issue → COMMIT → gửi thư (thư gửi NGOÀI giao dịch, không giữ khoá lúc gọi SMTP)', async () => {
    await world.service.resend(SYSTEM, ID);
    expect(world.events).toEqual([
      'mo-giao-dich',
      'khoa',
      'doc',
      'issue',
      'commit',
      'gui-thu',
    ]);
  });

  it('người nhận là email và họ tên của TÀI KHOẢN ĐÍCH (đọc dưới khoá), đối tượng liên kết là chính đối tượng issue trả về', async () => {
    const issued = newIssued();
    world.issueResult = { ok: true, issued };
    await world.service.resend(BRANCH, ID);
    expect(world.links.deliver).toHaveBeenCalledTimes(1);
    expect(world.links.deliver).toHaveBeenCalledWith(issued, {
      email: TARGET_EMAIL,
      fullName: 'Phạm Thị Lan',
    });
  });

  it('phản hồi toEqual ĐÚNG ba khoá: taiKhoanId, guiEmail DaGui, hanLienKet = hạn của liên kết MỚI; không token hay URL ở bất kỳ đâu', async () => {
    const response = await world.service.resend(SYSTEM, ID);
    expect(response).toEqual({
      taiKhoanId: ID,
      guiEmail: { ketQua: 'DaGui' },
      hanLienKet: EXPIRES,
    });
    expect(Object.keys(response).sort()).toEqual([
      'guiEmail',
      'hanLienKet',
      'taiKhoanId',
    ]);
    const text = JSON.stringify(response);
    expect(text).not.toContain('SECRETTOKEN');
    expect(text).not.toContain('kich-hoat');
    expect(text).not.toContain(TARGET_EMAIL);
  });
});

describe('TKB20-04 (TK-43, TK-47, NS-45) — issue thất bại: 409 và 429 ném trong giao dịch, không gửi thư', () => {
  it('GUI_LAI_QUA_SOM ⇒ 429 kèm chiTiet.soGiayCho đúng số giây B14 báo; chữ PLAN 5.9; giao dịch hoàn tác; KHÔNG gửi thư', async () => {
    world.issueResult = {
      ok: false,
      failure: {
        code: 'GUI_LAI_QUA_SOM',
        reason: 'TOO_SOON',
        retryAfterSeconds: 42,
      },
    };
    const error = await failure(world.service.resend(SYSTEM, ID));
    expect(error.getStatus()).toBe(429);
    expect(error.getResponse()).toEqual({
      maLoi: 'GUI_LAI_QUA_SOM',
      thongBao: 'Vui lòng thử lại sau.',
      chiTiet: { soGiayCho: 42 },
    });
    expect(world.events).toEqual([
      'mo-giao-dich',
      'khoa',
      'doc',
      'issue',
      'rollback',
    ]);
    expect(world.links.deliver).not.toHaveBeenCalled();
  });

  it('TAI_KHOAN_KHONG_CHO_KICH_HOAT ⇒ 409, chữ PLAN 5.9, KHÔNG có chiTiet; không gửi thư', async () => {
    world.issueResult = {
      ok: false,
      failure: {
        code: 'TAI_KHOAN_KHONG_CHO_KICH_HOAT',
        reason: 'NOT_PENDING_STAFF',
      },
    };
    const error = await failure(world.service.resend(SYSTEM, ID));
    expect(error.getStatus()).toBe(409);
    expect(error.getResponse()).toEqual({
      maLoi: 'TAI_KHOAN_KHONG_CHO_KICH_HOAT',
      thongBao:
        'Tài khoản không còn chờ kích hoạt. Nếu cần đặt lại mật khẩu, dùng "Quên mật khẩu".',
    });
    expect(world.links.deliver).not.toHaveBeenCalled();
  });
});

describe('TKB20-05 (TK-41) — gửi thư lỗi: 200 với ThatBai, không hạn mới, log không có email, URL, token', () => {
  it('deliver trả ok: false ⇒ guiEmail ThatBai + GUI_MAIL_LOI, hanLienKet null (liên kết cũ còn hạn vẫn dùng được; F8 đọc hạn ở chi tiết B17)', async () => {
    world.deliverResult = {
      ok: false,
      maLoi: 'GUI_MAIL_LOI',
      maXacThucId: '900',
    };
    await expect(world.service.resend(SYSTEM, ID)).resolves.toEqual({
      taiKhoanId: ID,
      guiEmail: { ketQua: 'ThatBai', maLoi: 'GUI_MAIL_LOI' },
      hanLienKet: null,
    });
    // Giao dịch 1 ĐÃ commit trước khi gửi: lỗi thư không làm hoàn tác hàng liên kết (B14 tự thu hồi hàng mới ở pha hậu gửi)
    expect(world.events.slice(-2)).toEqual(['commit', 'gui-thu']);
  });

  it('deliver ném lỗi lạ (không phải MailSendError: lỗi dựng thư, DB lỗi ở pha hậu gửi) ⇒ vẫn 200 ThatBai, KHÔNG 500; log chỉ có mã tài khoản và TÊN lỗi', async () => {
    world.deliverResult = new TypeError(
      `bí mật: ${TARGET_EMAIL} ${SECRET_URL}`,
    );
    await expect(world.service.resend(SYSTEM, ID)).resolves.toEqual({
      taiKhoanId: ID,
      guiEmail: { ketQua: 'ThatBai', maLoi: 'GUI_MAIL_LOI' },
      hanLienKet: null,
    });
    const text = logs.join('\n');
    expect(text).toContain(`tài khoản ${ID}`);
    expect(text).toContain('TypeError');
    expect(text).not.toContain(TARGET_EMAIL);
    expect(text).not.toContain('SECRETTOKEN');
    expect(text).not.toContain('kich-hoat');
  });

  it('một giá trị ném không phải Error ⇒ vẫn ThatBai, log ghi "không rõ", không lộ nội dung', async () => {
    // Giá trị bị từ chối là một chuỗi (không phải Error): `error instanceof Error` sai ⇒ log ghi "không rõ"
    world.links.deliver.mockImplementationOnce(() =>
      Promise.reject('chuỗi bí mật' as unknown as Error),
    );
    await expect(world.service.resend(SYSTEM, ID)).resolves.toMatchObject({
      guiEmail: { ketQua: 'ThatBai' },
      hanLienKet: null,
    });
    const text = logs.join('\n');
    expect(text).toContain('không rõ');
    expect(text).not.toContain('chuỗi bí mật');
  });
});

describe('TKB20-06 (H4) — thử lại deadlock (1213): làm lại cả giao dịch 1, gửi thư đúng MỘT lần', () => {
  it('deadlock hai lần rồi thành công ⇒ 3 giao dịch, mỗi lần hỏng đều hoàn tác, thư đúng MỘT lần (không gửi trong các lần làm lại)', async () => {
    world.lockErrors = [deadlock(), deadlock()];
    const response = await world.service.resend(SYSTEM, ID);
    expect(response.guiEmail).toEqual({ ketQua: 'DaGui' });
    expect(world.transactions).toBe(3);
    expect(world.links.deliver).toHaveBeenCalledTimes(1);
    expect(world.links.issue).toHaveBeenCalledTimes(1);
    expect(world.events.filter((event) => event === 'rollback')).toHaveLength(
      2,
    );
    expect(world.events.at(-1)).toBe('gui-thu');
  });

  it('deadlock cả ba lần ⇒ ném NGUYÊN lỗi 1213, KHÔNG gửi thư, mỗi lần làm lại có cảnh báo không chứa email hay URL', async () => {
    world.lockErrors = [deadlock(), deadlock(), deadlock()];
    await expect(world.service.resend(SYSTEM, ID)).rejects.toMatchObject({
      errno: 1213,
    });
    expect(world.transactions).toBe(3);
    expect(world.links.deliver).not.toHaveBeenCalled();
    const warnings = logs.filter((line) => line.includes('deadlock (1213)'));
    expect(warnings).toHaveLength(2);
    expect(warnings.join('\n')).not.toContain(TARGET_EMAIL);
    expect(warnings.join('\n')).not.toContain('kich-hoat');
  });

  it('lỗi KHÁC (không phải 1213) ⇒ ném ngay, KHÔNG làm lại: đúng một giao dịch', async () => {
    world.lockErrors = [mysqlError(1062, 'ER_DUP_ENTRY'), deadlock()];
    await expect(world.service.resend(SYSTEM, ID)).rejects.toMatchObject({
      errno: 1062,
    });
    expect(world.transactions).toBe(1);
  });

  it('AppException (404, 403, 409, 429) KHÔNG bị làm lại: đúng một giao dịch', async () => {
    world.target = null;
    await failure(world.service.resend(SYSTEM, ID));
    expect(world.transactions).toBe(1);

    world = new World();
    world.issueResult = {
      ok: false,
      failure: {
        code: 'GUI_LAI_QUA_SOM',
        reason: 'HOURLY_LIMIT',
        retryAfterSeconds: 5,
      },
    };
    await failure(world.service.resend(SYSTEM, ID));
    expect(world.transactions).toBe(1);
  });
});
