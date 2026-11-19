import type { EntityManager } from 'typeorm';
import { vi } from 'vitest';
import type { AuditEntry } from '../../../audit/audit-entry.js';
import { AuditError } from '../../../audit/audit-error.js';
import type { AuditService } from '../../../audit/audit.service.js';
import type { UnverifiedPatientCleaner } from '../../../auth/register/unverified-patient-cleaner.js';
import {
  T0,
  captureNestLogger,
} from '../../../auth/testing/otp-int-helpers.js';
import { AppException } from '../../../common/errors/app.exception.js';
import type { AdminScope } from '../../../rbac/admin-scope.js';
import { BranchAccessPolicy } from '../../../rbac/branch-access.policy.js';
import type { ActivationLinkService } from '../../staff-activation/activation-link.service.js';
import type {
  ActivationRecipient,
  DeliverActivationLinkResult,
  IssueActivationLinkInput,
  IssueActivationLinkResult,
} from '../../staff-activation/activation-link.types.js';
import { IssuedActivationLink } from '../../staff-activation/issued-activation-link.js';
import type {
  EmailOwner,
  NewAccountRow,
  StaffAccountRepository,
} from '../staff-account.repository.js';
import { StaffAccountService } from '../staff-account.service.js';
import type { StaffAccountInput } from '../staff-account.types.js';

// Task B15 (admin) — StaffAccountService ở mức đơn vị: kho, dịch vụ liên kết, audit, cleaner giả ghi lại THỨ TỰ lời gọi; giao dịch giả đếm số giao dịch đang mở và
// chỉ "commit" phần audit khi giao dịch thành công. Không DB, không SMTP. Phần cần MySQL thật (UNIQUE, khoá hàng, CHECK, đua) ở staff-account.int-spec.ts.
// Mã NSB15-nn là [đề xuất]; mã PLAN ghi kèm (NS-05…NS-25).

const HOUR_MS = 3_600_000;
const SYSTEM: AdminScope = { kind: 'ToanHeThong' };
const BRANCH: AdminScope = { kind: 'ChiNhanh', chiNhanhId: '1' };
const ACTOR = '99';
const NEW_ID = '501';
const SECRET_URL = 'https://web.test/kich-hoat#id=900&token=SECRETTOKEN';

const common = {
  hoTen: 'Lê Minh Quang',
  email: 'quang.le@example.com',
  soDienThoai: '0912345678',
};
const doctor: StaffAccountInput = {
  ...common,
  vaiTro: 'BacSi',
  chiNhanhId: '1',
  chuyenKhoaId: '2',
  dichVuKhamId: '3',
  chucDanh: 'BS_CKI',
  hocVi: 'BS',
  soNamKinhNghiem: 10,
};
const receptionist: StaffAccountInput = {
  ...common,
  vaiTro: 'LeTan',
  chiNhanhId: '1',
};
const systemAdmin: StaffAccountInput = {
  ...common,
  vaiTro: 'QuanTriVien',
  phamVi: 'ToanHeThong',
};
const branchAdmin: StaffAccountInput = {
  ...common,
  vaiTro: 'QuanTriVien',
  phamVi: 'ChiNhanh',
  chiNhanhId: '1',
};

const mysqlError = (errno: number, code: string): Error =>
  Object.assign(new Error(`lỗi MySQL giả ${code}`), { errno, code });
const deadlock = (): Error => mysqlError(1213, 'ER_LOCK_DEADLOCK');
const duplicate = (): Error => mysqlError(1062, 'ER_DUP_ENTRY');
const foreignKey = (): Error => mysqlError(1451, 'ER_ROW_IS_REFERENCED_2');

type StagedEm = EntityManager & { staged: string[] };

class World {
  readonly log: string[] = [];
  begun = 0;
  open = 0;
  committedAudit: string[] = [];
  auditEntries: AuditEntry[] = [];
  deliverCalls: { recipient: ActivationRecipient; openAtCall: number }[] = [];
  issueInputs: IssueActivationLinkInput[] = [];
  inserted: NewAccountRow[] = [];

  // Cấu hình kho
  branchExists = true;
  specialtyActive = true;
  serviceAtBranch = true;
  emailOwner: EmailOwner | null = null;
  lockedOwner: EmailOwner | null | 'same' = 'same';
  insertAccountErrors: Error[] = [];
  profileError: Error | null = null;
  // Cấu hình liên kết, audit, cleaner
  issueRefused = false;
  deliverResult: DeliverActivationLinkResult | Error = {
    ok: true,
    maXacThucId: '900',
    hetHanLuc: new Date(T0.getTime() + 24 * HOUR_MS),
  };
  auditErrors: Error[] = [];
  purgeResult: boolean | Error = true;

  readonly links = {
    transaction: <T>(work: (em: EntityManager) => Promise<T>): Promise<T> => {
      this.begun += 1;
      this.open += 1;
      this.log.push('tx:begin');
      const em = { staged: [] as string[] } as unknown as StagedEm;
      return work(em).then(
        (value) => {
          this.open -= 1;
          this.log.push('tx:commit');
          this.committedAudit.push(...em.staged);
          return value;
        },
        (error: unknown) => {
          this.open -= 1;
          this.log.push('tx:rollback');
          throw error;
        },
      );
    },
    issue: (
      input: IssueActivationLinkInput,
    ): Promise<IssueActivationLinkResult> => {
      this.log.push('issue');
      this.issueInputs.push(input);
      if (this.issueRefused) {
        return Promise.resolve({
          ok: false,
          failure: {
            code: 'TAI_KHOAN_KHONG_CHO_KICH_HOAT',
            reason: 'NOT_PENDING_STAFF',
          },
        });
      }
      return Promise.resolve({
        ok: true,
        issued: new IssuedActivationLink(
          {
            maXacThucId: '900',
            taiKhoanId: input.taiKhoanId,
            kind: input.kind,
            loaiTaiKhoan: 'LeTan',
            hetHanLuc: new Date(T0.getTime() + 24 * HOUR_MS),
            ttlHours: 24,
          },
          SECRET_URL,
        ),
      });
    },
    deliver: (
      _issued: IssuedActivationLink,
      recipient: ActivationRecipient,
    ): Promise<DeliverActivationLinkResult> => {
      this.log.push('deliver');
      this.deliverCalls.push({ recipient, openAtCall: this.open });
      return this.deliverResult instanceof Error
        ? Promise.reject(this.deliverResult)
        : Promise.resolve(this.deliverResult);
    },
  };

  readonly repo = {
    findByEmail: (): Promise<EmailOwner | null> => {
      this.log.push('findByEmail');
      return Promise.resolve(this.emailOwner);
    },
    findByEmailForUpdate: (): Promise<EmailOwner | null> => {
      this.log.push('findByEmailForUpdate');
      return Promise.resolve(
        this.lockedOwner === 'same' ? this.emailOwner : this.lockedOwner,
      );
    },
    branchExists: (): Promise<boolean> => {
      this.log.push('branchExists');
      return Promise.resolve(this.branchExists);
    },
    lockActiveSpecialty: (): Promise<boolean> => {
      this.log.push('lockActiveSpecialty');
      return Promise.resolve(this.specialtyActive);
    },
    lockServiceAtBranch: (): Promise<boolean> => {
      this.log.push('lockServiceAtBranch');
      return Promise.resolve(this.serviceAtBranch);
    },
    insertAccount: (
      _em: EntityManager,
      row: NewAccountRow,
    ): Promise<string> => {
      this.log.push('insertAccount');
      this.inserted.push(row);
      const failure = this.insertAccountErrors.shift();
      return failure ? Promise.reject(failure) : Promise.resolve(NEW_ID);
    },
    insertDoctor: (): Promise<void> => this.profile('insertDoctor'),
    insertReceptionist: (): Promise<void> => this.profile('insertReceptionist'),
    insertAdmin: (): Promise<void> => this.profile('insertAdmin'),
  };

  readonly audit = {
    record: (em: EntityManager, entry: AuditEntry): Promise<void> => {
      this.log.push('audit');
      const failure = this.auditErrors.shift();
      if (failure) return Promise.reject(failure);
      (em as StagedEm).staged.push(entry.action);
      this.auditEntries.push(entry);
      return Promise.resolve();
    },
  };

  readonly cleaner = {
    purgeIfExpired: (_em: EntityManager, id: string): Promise<boolean> => {
      this.log.push(`purge:${id}`);
      return this.purgeResult instanceof Error
        ? Promise.reject(this.purgeResult)
        : Promise.resolve(this.purgeResult);
    },
  };

  private profile(name: string): Promise<void> {
    this.log.push(name);
    return this.profileError
      ? Promise.reject(this.profileError)
      : Promise.resolve();
  }

  service(): StaffAccountService {
    return new StaffAccountService(
      this.links as unknown as ActivationLinkService,
      this.repo as unknown as StaffAccountRepository,
      this.audit as unknown as AuditService,
      new BranchAccessPolicy(),
      this.cleaner as unknown as UnverifiedPatientCleaner,
    );
  }
}

let world: World;
let logs: string[];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
  world = new World();
  logs = captureNestLogger();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const WRITES = [
  'insertAccount',
  'insertDoctor',
  'insertReceptionist',
  'insertAdmin',
  'issue',
  'audit',
  'deliver',
];
const expectNoWrites = (): void => {
  for (const write of WRITES) expect(world.log).not.toContain(write);
};
const bodyOf = (error: unknown): unknown => {
  expect(error).toBeInstanceOf(AppException);
  return (error as AppException).getResponse();
};
const failureOf = async (
  scope: AdminScope,
  input: StaffAccountInput,
): Promise<unknown> => {
  try {
    await world.service().create(scope, ACTOR, input);
  } catch (error) {
    return error;
  }
  throw new Error('create phải bị từ chối');
};

describe('thứ tự đúng và từ chối sớm (NS-01…NS-08, NS-13, NS-16, NS-17)', () => {
  it('NSB15-12 (NS-01) Bác sĩ: kiểm tham chiếu → email → chèn tài khoản → chèn hồ sơ → issue → audit → commit → deliver', async () => {
    const result = await world.service().create(SYSTEM, ACTOR, doctor);
    expect(world.log).toEqual([
      'tx:begin',
      'branchExists',
      'lockActiveSpecialty',
      'lockServiceAtBranch',
      'findByEmail',
      'insertAccount',
      'insertDoctor',
      'issue',
      'audit',
      'tx:commit',
      'deliver',
    ]);
    expect(result).toEqual({
      taiKhoanId: NEW_ID,
      loaiTaiKhoan: 'BacSi',
      trangThai: 'ChoKichHoat',
      guiEmail: { ketQua: 'DaGui' },
    });
    // Liên kết cấp cho ĐÚNG tài khoản vừa tạo, kiểu TaoMoi (thư 674:2, không phải thư gửi lại 675:2)
    expect(world.issueInputs).toEqual([{ taiKhoanId: NEW_ID, kind: 'TaoMoi' }]);
  });

  it('NSB15-12 (NS-02, NS-03, NS-04) Lễ tân và hai dạng Quản trị viên: bỏ các bước không thuộc vai trò (Toàn hệ thống không kiểm chi nhánh)', async () => {
    await world.service().create(SYSTEM, ACTOR, receptionist);
    expect(world.log).toEqual([
      'tx:begin',
      'branchExists',
      'findByEmail',
      'insertAccount',
      'insertReceptionist',
      'issue',
      'audit',
      'tx:commit',
      'deliver',
    ]);

    world = new World();
    await world.service().create(SYSTEM, ACTOR, systemAdmin);
    expect(world.log).toEqual([
      'tx:begin',
      'findByEmail',
      'insertAccount',
      'insertAdmin',
      'issue',
      'audit',
      'tx:commit',
      'deliver',
    ]);

    world = new World();
    await world.service().create(SYSTEM, ACTOR, branchAdmin);
    expect(world.log).toEqual([
      'tx:begin',
      'branchExists',
      'findByEmail',
      'insertAccount',
      'insertAdmin',
      'issue',
      'audit',
      'tx:commit',
      'deliver',
    ]);
  });

  it('NSB15-12 hàng tài khoản chèn đúng loại tài khoản và dùng đồng hồ ứng dụng (cắt giây), không DEFAULT của DB', async () => {
    await world.service().create(SYSTEM, ACTOR, doctor);
    expect(world.inserted).toEqual([
      {
        hoTen: 'Lê Minh Quang',
        email: 'quang.le@example.com',
        soDienThoai: '0912345678',
        loaiTaiKhoan: 'BacSi',
        createdAt: T0,
      },
    ]);
  });

  it('NSB15-12 (NS-05, NS-08) Quản trị viên Chi nhánh tạo Bác sĩ, Lễ tân ở chi nhánh MÌNH; Toàn hệ thống ở chi nhánh bất kỳ', async () => {
    await world.service().create(BRANCH, ACTOR, doctor);
    await world.service().create(BRANCH, ACTOR, receptionist);
    await world
      .service()
      .create(SYSTEM, ACTOR, { ...receptionist, chiNhanhId: '42' });
    expect(world.log.filter((entry) => entry === 'deliver')).toHaveLength(3);
  });

  it('NSB15-12 (NS-07) Quản trị viên Chi nhánh chọn vai trò Quản trị viên ⇒ 403 KHONG_DU_QUYEN, chưa mở giao dịch nào', async () => {
    for (const input of [systemAdmin, branchAdmin]) {
      const error = await failureOf(BRANCH, input);
      expect((error as AppException).getStatus()).toBe(403);
      expect((error as AppException).maLoi).toBe('KHONG_DU_QUYEN');
    }
    expect(world.log).toEqual([]);
  });

  it('NSB15-12 (NS-14) chức danh–học vị không tương thích ⇒ 400, chưa mở giao dịch nào (kiểm thuần trước mọi truy cập DB)', async () => {
    const error = await failureOf(SYSTEM, {
      ...doctor,
      chucDanh: 'TS_BS',
      hocVi: 'BS',
    });
    expect((error as AppException).getStatus()).toBe(400);
    expect((error as AppException).maLoi).toBe(
      'CHUC_DANH_HOC_VI_KHONG_TUONG_THICH',
    );
    expect(world.log).toEqual([]);
  });

  it('NSB15-12 (NS-06, Q40) chi nhánh NGOÀI phạm vi và chi nhánh KHÔNG TỒN TẠI cho CÙNG một thân; không chạm DB khi ngoài phạm vi; không ghi gì', async () => {
    const outOfScope = await failureOf(BRANCH, {
      ...doctor,
      chiNhanhId: '2',
    });
    expect(world.log).toEqual(['tx:begin', 'tx:rollback']);
    expectNoWrites();

    world = new World();
    world.branchExists = false;
    const missing = await failureOf(SYSTEM, { ...doctor, chiNhanhId: '2' });
    expect(world.log).toEqual(['tx:begin', 'branchExists', 'tx:rollback']);
    expectNoWrites();

    expect(bodyOf(outOfScope)).toEqual(bodyOf(missing));
    expect(bodyOf(missing)).toEqual({
      maLoi: 'DU_LIEU_KHONG_HOP_LE',
      thongBao: 'Dữ liệu không hợp lệ.',
      loi: [{ truong: 'chiNhanhId', ma: 'CHI_NHANH_KHONG_HOP_LE' }],
    });
  });

  it('NSB15-12 (NS-16) chuyên khoa không hoạt động hoặc không có ⇒ lỗi trên chuyenKhoaId, chưa kiểm dịch vụ, không ghi gì', async () => {
    world.specialtyActive = false;
    const error = await failureOf(SYSTEM, doctor);
    expect(bodyOf(error)).toEqual({
      maLoi: 'DU_LIEU_KHONG_HOP_LE',
      thongBao: 'Dữ liệu không hợp lệ.',
      loi: [{ truong: 'chuyenKhoaId', ma: 'CHUYEN_KHOA_KHONG_HOP_LE' }],
    });
    expect(world.log).not.toContain('lockServiceAtBranch');
    expectNoWrites();
  });

  it('NSB15-12 (NS-13) dịch vụ không có ở chi nhánh ⇒ DICH_VU_KHONG_O_CHI_NHANH, chưa đọc email, không ghi gì', async () => {
    world.serviceAtBranch = false;
    const error = await failureOf(SYSTEM, doctor);
    expect((error as AppException).getStatus()).toBe(400);
    expect((error as AppException).maLoi).toBe('DICH_VU_KHONG_O_CHI_NHANH');
    expect(world.log).not.toContain('findByEmail');
    expectNoWrites();
  });

  it('NSB15-12 (NS-09) email đã có ở loại không xoá được ⇒ EMAIL_DA_DUNG 409, không ghi gì', async () => {
    world.emailOwner = {
      taiKhoanId: '8',
      loaiTaiKhoan: 'LeTan',
      daXacMinhEmail: true,
      trangThai: 'ChoKichHoat',
      thoiDiemTao: new Date(T0.getTime() - 100 * HOUR_MS),
    };
    const error = await failureOf(SYSTEM, receptionist);
    expect((error as AppException).getStatus()).toBe(409);
    expect((error as AppException).maLoi).toBe('EMAIL_DA_DUNG');
    expectNoWrites();
  });

  it('NSB15-12 lỗi từ chối KHÔNG chứa email, họ tên hay SĐT của yêu cầu', async () => {
    world.emailOwner = {
      taiKhoanId: '8',
      loaiTaiKhoan: 'BacSi',
      daXacMinhEmail: true,
      trangThai: 'DangHoatDong',
      thoiDiemTao: T0,
    };
    const text = JSON.stringify(bodyOf(await failureOf(SYSTEM, receptionist)));
    for (const secret of [common.email, common.hoTen, common.soDienThoai]) {
      expect(text).not.toContain(secret);
    }
  });
});

describe('thư gửi SAU commit, đúng một lần (NS-01, NS-19, NS-21)', () => {
  it('NSB15-13 `deliver` chạy sau commit, đúng 1 lần, lúc đó KHÔNG có giao dịch nào mở; người nhận là email đã chuẩn hoá và họ tên', async () => {
    await world.service().create(SYSTEM, ACTOR, doctor);
    expect(world.deliverCalls).toEqual([
      {
        recipient: { email: 'quang.le@example.com', fullName: 'Lê Minh Quang' },
        openAtCall: 0,
      },
    ]);
    expect(world.log.indexOf('deliver')).toBeGreaterThan(
      world.log.indexOf('tx:commit'),
    );
    expect(world.log.filter((entry) => entry === 'deliver')).toHaveLength(1);
  });

  it('NSB15-13 mọi từ chối và mọi lần hoàn tác KHÔNG bao giờ gửi thư', async () => {
    world.serviceAtBranch = false;
    await failureOf(SYSTEM, doctor);
    world = new World();
    world.profileError = new Error('lỗi chèn hồ sơ giả');
    await expect(world.service().create(SYSTEM, ACTOR, doctor)).rejects.toThrow(
      'lỗi chèn hồ sơ giả',
    );
    expect(world.deliverCalls).toEqual([]);
  });
});

describe('kết quả gửi email (NS-19, NS-21)', () => {
  it('NSB15-14 (NS-19) `deliver` báo ok:false ⇒ 201 logic với guiEmail ThatBai + GUI_MAIL_LOI; tài khoản và audit đã commit', async () => {
    world.deliverResult = {
      ok: false,
      maLoi: 'GUI_MAIL_LOI',
      maXacThucId: '900',
    };
    const result = await world.service().create(SYSTEM, ACTOR, receptionist);
    expect(result).toEqual({
      taiKhoanId: NEW_ID,
      loaiTaiKhoan: 'LeTan',
      trangThai: 'ChoKichHoat',
      guiEmail: { ketQua: 'ThatBai', maLoi: 'GUI_MAIL_LOI' },
    });
    expect(world.committedAudit).toEqual(['TaoTaiKhoanNhanSu']);
  });

  it('NSB15-14 (NS-19) `deliver` NÉM lỗi ngoài dự kiến (dựng thư hay ghi sau gửi): không ném ra ngoài, trả ThatBai, log chỉ có mã tài khoản và TÊN lỗi', async () => {
    world.deliverResult = new TypeError(
      `không dựng được thư tới ${common.email} với ${SECRET_URL}`,
    );
    const result = await world.service().create(SYSTEM, ACTOR, doctor);
    expect(result.guiEmail).toEqual({
      ketQua: 'ThatBai',
      maLoi: 'GUI_MAIL_LOI',
    });
    const text = logs.join('\n');
    expect(text).toContain(NEW_ID);
    expect(text).toContain('TypeError');
    for (const secret of [
      'SECRETTOKEN',
      'kich-hoat',
      common.email,
      'không dựng được',
    ]) {
      expect(text).not.toContain(secret);
    }
  });

  it('NSB15-14 (NS-21) phản hồi và log của đường thành công không có token, URL, email', async () => {
    const result = await world.service().create(SYSTEM, ACTOR, doctor);
    const text = `${JSON.stringify(result)}\n${logs.join('\n')}`;
    for (const secret of ['SECRETTOKEN', 'kich-hoat', common.email, 'token']) {
      expect(text).not.toContain(secret);
    }
  });
});

describe('hoàn tác khi lỗi giữa chừng (NS-17, NS-24)', () => {
  it('NSB15-15 (NS-17) `issue` bị từ chối (không thể xảy ra với tài khoản vừa tạo) ⇒ ném Error lập trình (không phải AppException), hoàn tác, không audit, không thư', async () => {
    world.issueRefused = true;
    const attempt = world.service().create(SYSTEM, ACTOR, doctor);
    await expect(attempt).rejects.toThrow(
      'ActivationLinkService từ chối cấp liên kết',
    );
    await expect(attempt).rejects.not.toBeInstanceOf(AppException);
    expect(world.log).toContain('tx:rollback');
    expect(world.log).not.toContain('audit');
    expect(world.log).not.toContain('deliver');
    expect(world.committedAudit).toEqual([]);
  });

  it('NSB15-15 (NS-24) lỗi ghi audit ⇒ ném ra, hoàn tác cả giao dịch, KHÔNG gửi thư, không dòng audit nào được commit', async () => {
    world.auditErrors = [new AuditError('AUDIT_WRITE_FAILED')];
    await expect(
      world.service().create(SYSTEM, ACTOR, doctor),
    ).rejects.toBeInstanceOf(AuditError);
    expect(world.log).toContain('tx:rollback');
    expect(world.log).not.toContain('tx:commit');
    expect(world.log).not.toContain('deliver');
    expect(world.committedAudit).toEqual([]);
  });

  it('NSB15-15 (NS-17) lỗi chèn hồ sơ (cả ba vai trò) ⇒ hoàn tác, không `issue`, không audit, không thư', async () => {
    for (const input of [doctor, receptionist, systemAdmin]) {
      world = new World();
      world.profileError = new Error('lỗi chèn hồ sơ giả');
      await expect(
        world.service().create(SYSTEM, ACTOR, input),
      ).rejects.toThrow('lỗi chèn hồ sơ giả');
      expect(world.log).toContain('tx:rollback');
      for (const step of ['issue', 'audit', 'deliver', 'tx:commit']) {
        expect(world.log).not.toContain(step);
      }
    }
  });

  it('NSB15-15 audit nhận đúng entry TaoTaiKhoanNhanSu với người thực hiện từ tham số (phiên) và mã tài khoản mới', async () => {
    await world.service().create(BRANCH, ACTOR, receptionist);
    expect(world.auditEntries).toEqual([
      {
        actorId: ACTOR,
        branchId: '1',
        action: 'TaoTaiKhoanNhanSu',
        targetType: 'tai_khoan',
        targetId: NEW_ID,
        result: 'ThanhCong',
        changes: { loai_tai_khoan: 'LeTan', chi_nhanh_id: '1' },
      },
    ]);
  });
});

describe('trùng email khi đua và deadlock (NS-22)', () => {
  it('NSB15-16 (NS-22) 1062 ở INSERT tài khoản ⇒ EMAIL_DA_DUNG ngay, KHÔNG làm lại, thân lỗi không chứa email', async () => {
    world.insertAccountErrors = [duplicate()];
    const error = await failureOf(SYSTEM, receptionist);
    expect((error as AppException).getStatus()).toBe(409);
    expect((error as AppException).maLoi).toBe('EMAIL_DA_DUNG');
    expect(JSON.stringify(bodyOf(error))).not.toContain(common.email);
    expect(world.begun).toBe(1);
    // INSERT tài khoản đã được THỬ (và bị 1062); mọi bước sau nó không được chạy
    for (const step of [
      'insertReceptionist',
      'issue',
      'audit',
      'deliver',
      'tx:commit',
    ]) {
      expect(world.log).not.toContain(step);
    }
    expect(world.log).toContain('tx:rollback');
  });

  it('NSB15-16 (NS-22) deadlock 1213 một lần ⇒ làm lại CẢ giao dịch và thành công: đúng 1 thư và đúng 1 dòng audit được commit', async () => {
    world.insertAccountErrors = [deadlock()];
    const result = await world.service().create(SYSTEM, ACTOR, doctor);
    expect(result.guiEmail).toEqual({ ketQua: 'DaGui' });
    expect(world.begun).toBe(2);
    expect(world.log.filter((entry) => entry === 'tx:rollback')).toHaveLength(
      1,
    );
    expect(world.log.filter((entry) => entry === 'deliver')).toHaveLength(1);
    expect(world.committedAudit).toEqual(['TaoTaiKhoanNhanSu']);
  });

  it('NSB15-16 (NS-22) deadlock ở bước audit (sau khi đã chèn) ⇒ lần bị hoàn tác không để lại audit; lần làm lại ghi đúng một dòng', async () => {
    world.auditErrors = [deadlock()];
    await world.service().create(SYSTEM, ACTOR, doctor);
    expect(world.begun).toBe(2);
    expect(world.committedAudit).toEqual(['TaoTaiKhoanNhanSu']);
    expect(world.log.filter((entry) => entry === 'deliver')).toHaveLength(1);
  });

  it('NSB15-16 deadlock liên tiếp: thử tối đa 3 lần rồi ném NGUYÊN lỗi, không thư, không audit; mỗi lần làm lại có cảnh báo không chứa email', async () => {
    world.insertAccountErrors = [deadlock(), deadlock(), deadlock()];
    await expect(
      world.service().create(SYSTEM, ACTOR, receptionist),
    ).rejects.toMatchObject({ errno: 1213 });
    expect(world.begun).toBe(3);
    expect(world.deliverCalls).toEqual([]);
    expect(world.committedAudit).toEqual([]);
    const warnings = logs.filter((line) => line.includes('deadlock'));
    expect(warnings).toHaveLength(2);
    for (const line of warnings) expect(line).not.toContain(common.email);
  });

  it('NSB15-16 lỗi khác (không phải 1062, 1213) ⇒ ném ngay, KHÔNG làm lại', async () => {
    world.insertAccountErrors = [new Error('lỗi lạ')];
    await expect(
      world.service().create(SYSTEM, ACTOR, receptionist),
    ).rejects.toThrow('lỗi lạ');
    expect(world.begun).toBe(1);
  });
});

describe('Q32: email của Bệnh nhân chưa xác minh quá 24 giờ (NS-09, NS-10)', () => {
  const owner = (over: Partial<EmailOwner> = {}): EmailOwner => ({
    taiKhoanId: '77',
    loaiTaiKhoan: 'BenhNhan',
    daXacMinhEmail: false,
    trangThai: 'DangHoatDong',
    thoiDiemTao: new Date(T0.getTime() - 24 * HOUR_MS),
    ...over,
  });

  it('NSB15-17 (NS-10) Bệnh nhân chưa xác minh đang hoạt động ĐÚNG 24:00:00: khoá hàng rồi xoá (purgeIfExpired) rồi chèn nhân sự, cùng giao dịch', async () => {
    world.emailOwner = owner();
    const result = await world.service().create(SYSTEM, ACTOR, receptionist);
    expect(result.guiEmail).toEqual({ ketQua: 'DaGui' });
    expect(world.log).toEqual([
      'tx:begin',
      'branchExists',
      'findByEmail',
      'findByEmailForUpdate',
      'purge:77',
      'insertAccount',
      'insertReceptionist',
      'issue',
      'audit',
      'tx:commit',
      'deliver',
    ]);
  });

  it('NSB15-17 (NS-10) còn 1 giây nữa mới đủ 24 giờ ⇒ EMAIL_DA_DUNG, KHÔNG khoá hàng, KHÔNG gọi purge', async () => {
    world.emailOwner = owner({
      thoiDiemTao: new Date(T0.getTime() - 24 * HOUR_MS + 1000),
    });
    const error = await failureOf(SYSTEM, receptionist);
    expect((error as AppException).maLoi).toBe('EMAIL_DA_DUNG');
    expect(world.log).not.toContain('findByEmailForUpdate');
    expect(world.log.some((entry) => entry.startsWith('purge'))).toBe(false);
  });

  it('NSB15-17 (NS-09, NS-10) mọi loại còn lại giữ email dù quá 24 giờ: Bệnh nhân đã xác minh, Bệnh nhân NgungHoatDong, nhân sự (ba vai trò, hai trạng thái) ⇒ EMAIL_DA_DUNG, KHÔNG gọi purge', async () => {
    const old = new Date(T0.getTime() - 100 * HOUR_MS);
    const keepers: EmailOwner[] = [
      owner({ daXacMinhEmail: true, thoiDiemTao: old }),
      owner({ trangThai: 'NgungHoatDong', thoiDiemTao: old }),
      ...(['BacSi', 'LeTan', 'QuanTriVien'] as const).flatMap((loaiTaiKhoan) =>
        (['ChoKichHoat', 'DangHoatDong', 'NgungHoatDong'] as const).map(
          (trangThai) =>
            owner({
              loaiTaiKhoan,
              trangThai,
              daXacMinhEmail: false,
              thoiDiemTao: old,
            }),
        ),
      ),
    ];
    for (const keeper of keepers) {
      world = new World();
      world.emailOwner = keeper;
      const error = await failureOf(SYSTEM, receptionist);
      expect((error as AppException).maLoi).toBe('EMAIL_DA_DUNG');
      expect(world.log.some((entry) => entry.startsWith('purge'))).toBe(false);
      expectNoWrites();
    }
  });

  it('NSB15-17 dưới khoá thấy người đó vừa xác minh ⇒ EMAIL_DA_DUNG, không purge; thấy hàng đã biến mất ⇒ chèn bình thường, không purge', async () => {
    world.emailOwner = owner();
    world.lockedOwner = owner({ daXacMinhEmail: true });
    const error = await failureOf(SYSTEM, receptionist);
    expect((error as AppException).maLoi).toBe('EMAIL_DA_DUNG');
    expect(world.log.some((entry) => entry.startsWith('purge'))).toBe(false);

    world = new World();
    world.emailOwner = owner();
    world.lockedOwner = null;
    const result = await world.service().create(SYSTEM, ACTOR, receptionist);
    expect(result.guiEmail).toEqual({ ketQua: 'DaGui' });
    expect(world.log.some((entry) => entry.startsWith('purge'))).toBe(false);
    expect(world.log).toContain('insertAccount');
  });

  it('NSB15-17 purge bị khoá ngoại chặn ⇒ EMAIL_DA_DUNG (không 500), không chèn gì', async () => {
    world.emailOwner = owner();
    world.purgeResult = foreignKey();
    const error = await failureOf(SYSTEM, receptionist);
    expect((error as AppException).getStatus()).toBe(409);
    expect((error as AppException).maLoi).toBe('EMAIL_DA_DUNG');
    expect(world.log).toContain('purge:77');
    expectNoWrites();
  });

  it('NSB15-17 purge ném lỗi khác ⇒ lan ra nguyên vẹn (không đổi thành EMAIL_DA_DUNG); purge trả false dù đã khoá ⇒ Error lập trình', async () => {
    world.emailOwner = owner();
    world.purgeResult = new Error('lỗi lạ khi xoá');
    await expect(
      world.service().create(SYSTEM, ACTOR, receptionist),
    ).rejects.toThrow('lỗi lạ khi xoá');

    world = new World();
    world.emailOwner = owner();
    world.purgeResult = false;
    const attempt = world.service().create(SYSTEM, ACTOR, receptionist);
    await expect(attempt).rejects.toThrow('không xoá được dù đã khoá hàng');
    await expect(attempt).rejects.not.toBeInstanceOf(AppException);
    expectNoWrites();
  });
});
