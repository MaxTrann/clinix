import { randomBytes } from 'node:crypto';
import { validateAuditEntry } from '../audit-validation.js';
import { auditEntries } from '../testing/audit-fixtures.js';

const configEntry = () =>
  auditEntries().find((entry) => entry.action === 'CapNhatCauHinh')!;

describe('C2-02/03/05 — whitelist payload và chặn bí mật', () => {
  it.each(auditEntries())('C2-03 nhận đúng schema $action', (entry) => {
    expect(validateAuditEntry(entry)).toEqual(entry);
    expect(validateAuditEntry(entry)).not.toBe(entry);
  });
  it.each(auditEntries())(
    'C2-03 từ chối field thừa và thiếu ở $action',
    (entry) => {
      expect(() => validateAuditEntry({ ...entry, extra: 1 })).toThrow(
        'AUDIT_ENTRY_INVALID',
      );
      expect(() =>
        validateAuditEntry({
          ...entry,
          changes: { ...entry.changes, extra: 1 },
        }),
      ).toThrow('AUDIT_ENTRY_INVALID');
      for (const key of Object.keys(entry.changes)) {
        const changes: Record<string, unknown> = { ...entry.changes };
        delete changes[key];
        expect(() => validateAuditEntry({ ...entry, changes })).toThrow(
          'AUDIT_ENTRY_INVALID',
        );
      }
    },
  );
  it.each([
    '0',
    '-1',
    '01',
    '1.2',
    '9223372036854775808',
    '',
    1,
    9007199254740992,
    null,
    undefined,
  ])('C2-02 từ chối ID không phải signed bigint string dương: %s', (id) => {
    const entry = configEntry();
    for (const key of ['actorId', 'targetId', 'branchId']) {
      if (key === 'branchId' && id === null) continue;
      expect(() => validateAuditEntry({ ...entry, [key]: id })).toThrow(
        'AUDIT_ENTRY_INVALID',
      );
    }
  });
  it('C2-02 giữ nguyên ID lớn hơn2^53 và result ThatBai không tự đổi', () => {
    const entry = {
      ...auditEntries()[0]!,
      actorId: '9223372036854775807',
      targetId: '9007199254740993',
      result: 'ThatBai',
    };
    expect(validateAuditEntry(entry)).toEqual(entry);
  });
  it.each(auditEntries())(
    'C2-03 mapping action/target không được lệch: $action',
    (entry) => {
      expect(() =>
        validateAuditEntry({ ...entry, targetType: 'lich_hen' }),
      ).toThrow('AUDIT_ENTRY_INVALID');
    },
  );
  it('C2-03 action ngoài 11 contract bị từ chối rõ', () => {
    expect(() =>
      validateAuditEntry({ ...configEntry(), action: 'DoiQuyen' }),
    ).toThrow('AUDIT_ACTION_UNSUPPORTED');
  });
  it('C2-03 role phải là string, không ép array thành tên role hợp lệ', () => {
    const entry = auditEntries()[0]!;
    expect(() =>
      validateAuditEntry({
        ...entry,
        changes: { ...entry.changes, loai_tai_khoan: ['LeTan'] },
      }),
    ).toThrow('AUDIT_ENTRY_INVALID');
  });
  it('C2-03 kiểm scope, branch và nested snapshot/count đúng kiểu', () => {
    const staff = auditEntries()[0]!;
    for (const changes of [
      { loai_tai_khoan: 'BenhNhan', chi_nhanh_id: '2' },
      {
        loai_tai_khoan: 'QuanTriVien',
        chi_nhanh_id: '2',
        pham_vi: 'ToanHeThong',
      },
      { loai_tai_khoan: 'LeTan', chi_nhanh_id: '5' },
      { loai_tai_khoan: 'LeTan', chi_nhanh_id: '2', pham_vi: 'ChiNhanh' },
    ])
      expect(() => validateAuditEntry({ ...staff, changes })).toThrow(
        'AUDIT_ENTRY_INVALID',
      );
    const locked = auditEntries().find((row) => row.action === 'KhoaTaiKhoan')!;
    for (const count of [-1, 0.5, '1', Number.MAX_SAFE_INTEGER + 1]) {
      expect(() =>
        validateAuditEntry({
          ...locked,
          changes: { ...locked.changes, phien_thu_hoi: count },
        }),
      ).toThrow('AUDIT_ENTRY_INVALID');
    }
    expect(() =>
      validateAuditEntry({
        ...locked,
        changes: { ...locked.changes, truoc: { trang_thai: 'Unknown' } },
      }),
    ).toThrow('AUDIT_ENTRY_INVALID');
    const moved = auditEntries().find(
      (row) => row.action === 'DoiChiNhanhBacSi',
    )!;
    expect(() =>
      validateAuditEntry({
        ...moved,
        changes: { truoc: { chi_nhanh_id: '2' }, sau: { chi_nhanh_id: '2' } },
      }),
    ).toThrow('AUDIT_ENTRY_INVALID');
    expect(() =>
      validateAuditEntry({
        ...moved,
        changes: { truoc: { chi_nhanh_id: '4' }, sau: { chi_nhanh_id: '5' } },
      }),
    ).toThrow('AUDIT_ENTRY_INVALID');
  });
  it('C2-03 config lần đầu null từng tham số, JSON số/array đúng kiểu', () => {
    const entry = configEntry();
    entry.changes = {
      truoc: { thoi_diem_nhac_lich: null, trong_so_w1: null },
      sau: { thoi_diem_nhac_lich: [72, 24, 2], trong_so_w1: 0.6 },
      ly_do: 'Thiết lập ban đầu',
    };
    expect(validateAuditEntry(entry)).toEqual(entry);
    expect(() =>
      validateAuditEntry({
        ...entry,
        changes: { ...entry.changes, truoc: null },
      }),
    ).toThrow('AUDIT_ENTRY_INVALID');
    expect(() =>
      validateAuditEntry({
        ...entry,
        changes: {
          ...entry.changes,
          sau: { thoi_diem_nhac_lich: [72], trong_so_w1: '0.60' },
        },
      }),
    ).toThrow('AUDIT_ENTRY_INVALID');
  });
  it('C2-03 config khác key/rỗng/không đổi/tham số lạ đều từ chối', () => {
    const entry = configEntry();
    for (const changes of [
      { truoc: {}, sau: {}, ly_do: 'Lý do' },
      {
        truoc: { check_in_truoc_phut: 30 },
        sau: { check_in_sau_phut: 45 },
        ly_do: 'Lý do',
      },
      {
        truoc: { check_in_truoc_phut: 30 },
        sau: { check_in_truoc_phut: 30 },
        ly_do: 'Lý do',
      },
      { truoc: { id: 1 }, sau: { id: 2 }, ly_do: 'Lý do' },
      { ...entry.changes, ly_do: '   ' },
    ])
      expect(() => validateAuditEntry({ ...entry, changes })).toThrow(
        'AUDIT_ENTRY_INVALID',
      );
  });
  it.each([
    'matKhau',
    'MAT_KHAU_BAM',
    'refresh_token',
    'OTP',
    'password',
    'authorization',
    'cookie',
    'apiKey',
    'hash',
  ])('C2-05 khóa nhạy cảm %s bị từ chối dù lồng sâu', (key) => {
    const entry = configEntry();
    expect(() =>
      validateAuditEntry({
        ...entry,
        changes: {
          ...entry.changes,
          truoc: { [key]: randomBytes(8).toString('hex') },
        },
      }),
    ).toThrow('AUDIT_SENSITIVE_DATA');
  });
  it('C2-05 chuỗi dạng token/hash trong lý do bị từ chối mà error không chứa giá trị', () => {
    const marker = randomBytes(32).toString('hex');
    try {
      validateAuditEntry({
        ...configEntry(),
        changes: { ...configEntry().changes, ly_do: marker },
      });
      expect.unreachable('phải từ chối');
    } catch (error) {
      expect(
        error instanceof Error && error.message === 'AUDIT_SENSITIVE_DATA',
      ).toBe(true);
      expect(String(error).includes(marker)).toBe(false);
    }
  });
  it('C2-05 không chạy getter/toJSON và từ chối cycle/symbol/undefined/nonJSON', () => {
    const getter = vi.fn(() => 'ignored');
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    const sparse = [1, 1];
    Reflect.deleteProperty(sparse, '0');
    const accessor = Object.defineProperty({}, 'value', {
      get: getter,
      enumerable: true,
    });
    for (const value of [
      cycle,
      accessor,
      { toJSON: getter },
      new Date(),
      new Map(),
      { [Symbol('x')]: 1 },
      { x: undefined },
      { x: 1n },
      { x: NaN },
      { x: Infinity },
      sparse,
      Object.create({ x: 1 }),
    ]) {
      expect(() =>
        validateAuditEntry({ ...configEntry(), changes: value }),
      ).toThrow('AUDIT_ENTRY_INVALID');
    }
    expect(getter).not.toHaveBeenCalled();
  });
  it('C2-03 ISO timestamp phải có timezone và ngày thật', () => {
    const entry = auditEntries().find(
      (row) => row.action === 'DuyetThayDoiChiNhanh',
    )!;
    for (const value of [
      '2026-11-04T08:00:00',
      '2026-02-30T08:00:00Z',
      'not-date',
    ]) {
      expect(() =>
        validateAuditEntry({
          ...entry,
          changes: { ...entry.changes, hieu_luc_tu: value },
        }),
      ).toThrow('AUDIT_ENTRY_INVALID');
    }
  });
});
