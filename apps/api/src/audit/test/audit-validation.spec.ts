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
  it('C2-03 action ngoài tập hành động của AuditEntry bị từ chối rõ (TD-06)', () => {
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

describe('TD-06 / P4 — 4 hành động phân công và nghỉ phép', () => {
  const entryOf = (action: string) =>
    auditEntries().find((entry) => entry.action === action)!;
  const withChanges = (action: string, patch: Record<string, unknown>) => ({
    ...entryOf(action),
    changes: { ...entryOf(action).changes, ...patch },
  });

  it.each([
    ['PhanCongLichLamViec', 'tai_khoan'],
    ['GoLichLamViec', 'lich_lam_viec'],
    ['DuyetNghiPhep', 'yeu_cau_nghi_phep'],
    ['TuChoiNghiPhep', 'yeu_cau_nghi_phep'],
  ])(
    '%s chỉ nhận đối tượng %s và cần chi nhánh của bác sĩ',
    (action, target) => {
      const entry = entryOf(action);
      expect(entry.targetType).toBe(target);
      expect(() => validateAuditEntry({ ...entry, branchId: null })).toThrow(
        'AUDIT_ENTRY_INVALID',
      );
      expect(() =>
        validateAuditEntry({
          ...entry,
          targetType: 'yeu_cau_thay_doi_chi_nhanh',
        }),
      ).toThrow('AUDIT_ENTRY_INVALID');
    },
  );

  it.each([
    ['tu_ngay sau den_ngay', { tu_ngay: '2027-01-01' }],
    ['ngày không có thật', { den_ngay: '2026-02-30' }],
    ['thứ ngoài 1–7', { thu_trong_tuan: [0, 1] }],
    ['thứ trùng', { thu_trong_tuan: [1, 1] }],
    ['thứ rỗng', { thu_trong_tuan: [] }],
    ['CaToi', { ca: ['CaToi'] }],
    ['ca trùng', { ca: ['CaSang', 'CaSang'] }],
    ['so_ca = 0', { so_ca: 0 }],
    ['so_ca không nguyên', { so_ca: 1.5 }],
  ])('PhanCongLichLamViec từ chối: %s', (_name, patch) => {
    expect(() =>
      validateAuditEntry(withChanges('PhanCongLichLamViec', patch)),
    ).toThrow('AUDIT_ENTRY_INVALID');
  });

  it.each([
    ['CaToi', { ca: 'CaToi' }],
    ['bac_si_id không phải id', { bac_si_id: '0' }],
    ['ngày sai định dạng', { ngay: '2026-12-2' }],
    ['so_khung_gio âm', { so_khung_gio: -1 }],
  ])('GoLichLamViec từ chối: %s', (_name, patch) => {
    expect(() =>
      validateAuditEntry(withChanges('GoLichLamViec', patch)),
    ).toThrow('AUDIT_ENTRY_INVALID');
  });

  it.each(['DuyetNghiPhep', 'TuChoiNghiPhep'])(
    '%s: ngày đảo ngược, nghỉ theo ca nhiều ngày, CaToi và lý do của Bác sĩ đều bị từ chối',
    (action) => {
      expect(() =>
        validateAuditEntry(
          withChanges(action, {
            ngay_bat_dau: '2026-12-20',
            ngay_ket_thuc: '2026-12-10',
            ca: null,
          }),
        ),
      ).toThrow('AUDIT_ENTRY_INVALID');
      expect(() =>
        validateAuditEntry(
          withChanges(action, {
            ngay_bat_dau: '2026-12-10',
            ngay_ket_thuc: '2026-12-11',
            ca: 'CaSang',
          }),
        ),
      ).toThrow('AUDIT_ENTRY_INVALID');
      expect(() =>
        validateAuditEntry(
          withChanges(action, {
            ngay_bat_dau: '2026-12-10',
            ngay_ket_thuc: '2026-12-10',
            ca: 'CaToi',
          }),
        ),
      ).toThrow('AUDIT_ENTRY_INVALID');
      // Lý do của Bác sĩ không được ghi vào nhật ký (Q34): khóa thừa bị từ chối.
      expect(() =>
        validateAuditEntry(withChanges(action, { ly_do: 'Bận việc gia đình' })),
      ).toThrow('AUDIT_ENTRY_INVALID');
    },
  );

  it('TuChoiNghiPhep: lý do của Admin 1–255 ký tự, không rỗng', () => {
    for (const reason of ['', '   ', 'a'.repeat(256)]) {
      expect(() =>
        validateAuditEntry(
          withChanges('TuChoiNghiPhep', { ly_do_tu_choi: reason }),
        ),
      ).toThrow('AUDIT_ENTRY_INVALID');
    }
    const ok = withChanges('TuChoiNghiPhep', {
      ly_do_tu_choi: 'a'.repeat(255),
    });
    expect(validateAuditEntry(ok)).toEqual(ok);
  });

  it('DuyetNghiPhep nhận nghỉ theo ca một ngày và nghỉ cả ngày nhiều ngày', () => {
    const byShift = withChanges('DuyetNghiPhep', {
      ngay_bat_dau: '2026-12-10',
      ngay_ket_thuc: '2026-12-10',
      ca: 'CaChieu',
    });
    expect(validateAuditEntry(byShift)).toEqual(byShift);
    const wholeDays = entryOf('DuyetNghiPhep');
    expect(validateAuditEntry(wholeDays)).toEqual(wholeDays);
  });
});

// Task B14 (booking, OVR-04 phần schema; PLAN booking 5.7, Q24; TRACKING 3.31 B14-F): hành động `OverrideLichHen`. Mẫu nằm TRONG describe này, KHÔNG thêm vào `auditEntries()`: ba ca chung của C2
// còn giả định mọi hành động có đối tượng khác `lich_hen` (ca "mapping action/target không được lệch" dùng `lich_hen` làm đối tượng SAI) và `audit.int-spec.ts` ghim số hành động, nên thêm vào fixture buộc đổi cả hai.
describe('B14 — OverrideLichHen: chi nhánh của lịch, hai trạng thái khác nhau, lý do 1–255', () => {
  const entry = () => ({
    actorId: '1',
    branchId: '2',
    action: 'OverrideLichHen' as const,
    targetType: 'lich_hen' as const,
    targetId: '3',
    result: 'ThanhCong' as const,
    changes: {
      truoc: { trang_thai: 'VangMat' },
      sau: { trang_thai: 'DaXacNhan' },
      ly_do: 'Bệnh nhân đã có mặt tại quầy',
    },
  });
  const withChanges = (patch: Record<string, unknown>) => ({
    ...entry(),
    changes: { ...entry().changes, ...patch },
  });

  it('nhận đúng schema và trả bản sao (không phải chính đối tượng vào)', () => {
    const valid = entry();
    expect(validateAuditEntry(valid)).toEqual(valid);
    expect(validateAuditEntry(valid)).not.toBe(valid);
  });

  it('từ chối field thừa và thiếu ở entry và ở changes', () => {
    expect(() => validateAuditEntry({ ...entry(), extra: 1 })).toThrow(
      'AUDIT_ENTRY_INVALID',
    );
    expect(() => validateAuditEntry(withChanges({ extra: 1 }))).toThrow(
      'AUDIT_ENTRY_INVALID',
    );
    for (const key of Object.keys(entry().changes)) {
      const changes: Record<string, unknown> = { ...entry().changes };
      delete changes[key];
      expect(() => validateAuditEntry({ ...entry(), changes })).toThrow(
        'AUDIT_ENTRY_INVALID',
      );
    }
  });

  it('chỉ nhận đối tượng lich_hen và BẮT BUỘC có chi nhánh của lịch (null bị từ chối)', () => {
    expect(() =>
      validateAuditEntry({ ...entry(), targetType: 'benh_nhan' }),
    ).toThrow('AUDIT_ENTRY_INVALID');
    expect(() => validateAuditEntry({ ...entry(), branchId: null })).toThrow(
      'AUDIT_ENTRY_INVALID',
    );
    expect(() => validateAuditEntry({ ...entry(), branchId: '0' })).toThrow(
      'AUDIT_ENTRY_INVALID',
    );
  });

  it.each([
    ['trạng thái trước ngoài enum', { truoc: { trang_thai: 'DaXong' } }],
    ['trạng thái sau ngoài enum', { sau: { trang_thai: 'DaXong' } }],
    ['trước bằng sau (không phải chuyển)', { sau: { trang_thai: 'VangMat' } }],
    ['trước thiếu khóa trang_thai', { truoc: {} }],
    ['sau thừa khóa', { sau: { trang_thai: 'DaXacNhan', them: 1 } }],
    ['trạng thái không phải chuỗi', { truoc: { trang_thai: 5 } }],
  ])('%s ⇒ AUDIT_ENTRY_INVALID', (_name, patch) => {
    expect(() => validateAuditEntry(withChanges(patch))).toThrow(
      'AUDIT_ENTRY_INVALID',
    );
  });

  it('mọi cặp trạng thái khác nhau trong TRANG_THAI_LICH_HEN đều nhận (audit không quyết ma trận: đó là việc của canTransition)', () => {
    const states = [
      'ChoThanhToan',
      'DaXacNhan',
      'DaTiepDon',
      'HoanThanh',
      'DaHuy',
      'VangMat',
      'DaDoiLich',
    ];
    for (const from of states)
      for (const to of states)
        if (from !== to)
          expect(() =>
            validateAuditEntry(
              withChanges({
                truoc: { trang_thai: from },
                sau: { trang_thai: to },
              }),
            ),
          ).not.toThrow();
  });

  it('lý do 1–255 ký tự, không rỗng, không chỉ khoảng trắng, phải là chuỗi', () => {
    for (const reason of ['', '   ', 'a'.repeat(256), 5, null]) {
      expect(() => validateAuditEntry(withChanges({ ly_do: reason }))).toThrow(
        'AUDIT_ENTRY_INVALID',
      );
    }
    const ok = withChanges({ ly_do: 'a'.repeat(255) });
    expect(validateAuditEntry(ok)).toEqual(ok);
  });

  it('lý do giống bí mật (token, băm, khóa=giá trị) bị từ chối là AUDIT_SENSITIVE_DATA và lỗi không chứa giá trị (cùng bộ kiểm với DTO của route override, OVR-05)', () => {
    const marker = randomBytes(8).toString('hex');
    for (const reason of [
      `token=${marker}`,
      `Bearer ${marker}${marker}`,
      `mã băm ${'a'.repeat(64)}`,
    ]) {
      let caught: unknown;
      try {
        validateAuditEntry(withChanges({ ly_do: reason }));
      } catch (error) {
        caught = error;
      }
      expect(caught).toMatchObject({ code: 'AUDIT_SENSITIVE_DATA' });
      expect(JSON.stringify(caught).includes(marker)).toBe(false);
    }
  });
});
