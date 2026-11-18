import {
  AUDIT_PAYMENT_LIMITS,
  validateAuditEntry,
} from '../audit-validation.js';
import {
  paymentAuditEntries,
  specialRefundEntry,
  topupCreditedEntry,
  topupUnprocessableEntry,
  withdrawalApprovedEntry,
  withdrawalRejectedEntry,
} from '../testing/payment-audit-entries.js';

// payment P5 — TDT-06, TDT-07 (phần `validateChanges`): danh sách trắng của nhật ký có thêm HoanTienDacBiet, XuLyNapViChuaCong, DuyetRutTien, TuChoiRutTien
// (PLAN payment 5.6, 5.8; Q17, L5). Hình payload và giới hạn `[đề xuất]` do Trung chốt 18/11/2026: chỉ số tiền, lý do, trạng thái; không dữ liệu cá nhân.

const invalid = (input: unknown) =>
  expect(() => validateAuditEntry(input)).toThrow('AUDIT_ENTRY_INVALID');
const withChanges = (
  entry: Record<string, unknown>,
  changes: Record<string, unknown>,
) => ({ ...entry, changes });

describe('P5 — hằng giới hạn xuất ra cho B12, B13, B15', () => {
  it('AUDIT_PAYMENT_LIMITS đúng 10 / 255 [đề xuất]', () => {
    expect({ ...AUDIT_PAYMENT_LIMITS }).toEqual({
      requiredReasonMin: 10,
      reasonMax: 255,
    });
  });
});

describe('TDT-06, TDT-07 — nhận đúng năm biến thể và trả bản sao', () => {
  it.each(paymentAuditEntries().map((entry) => [entry.action, entry]))(
    '%s hợp lệ',
    (_action, entry) => {
      expect(validateAuditEntry(entry)).toEqual(entry);
      expect(validateAuditEntry(entry)).not.toBe(entry);
    },
  );

  it.each(paymentAuditEntries().map((entry) => [entry.action, entry]))(
    '%s: đối tượng khác bảng đã chốt ⇒ AUDIT_ENTRY_INVALID',
    (_action, entry) => {
      for (const targetType of ['lich_hen', 'tai_khoan', 'benh_nhan'])
        invalid({ ...entry, targetType });
    },
  );

  it.each(paymentAuditEntries().map((entry) => [entry.action, entry]))(
    '%s: khoá lạ (dữ liệu cá nhân hay số tài khoản) ⇒ AUDIT_ENTRY_INVALID, thông điệp lỗi không chứa giá trị',
    (_action, entry) => {
      const marker = 'NGUYEN-VAN-A-0912345678';
      for (const key of ['ho_ten', 'so_dien_thoai', 'email', 'so_tai_khoan'])
        invalid(withChanges(entry, { ...entry.changes, [key]: marker }));
      let caught: unknown;
      try {
        validateAuditEntry(
          withChanges(entry, { ...entry.changes, ho_ten: marker }),
        );
      } catch (error) {
        caught = error;
      }
      expect(caught).toMatchObject({ code: 'AUDIT_ENTRY_INVALID' });
      expect(JSON.stringify(caught).includes(marker)).toBe(false);
    },
  );
});

describe('TDT-06 — số tiền: chuỗi decimal(12,2) dương', () => {
  it.each([
    ['0.01', true],
    ['150000.00', true],
    ['9999999999.99', true],
    ['0.00', false],
    ['-150000.00', false],
    ['150000', false],
    ['150000.5', false],
    ['150000.000', false],
    ['0150000.00', false],
    ['99999999999.00', false],
    [' 150000.00', false],
    [150000, false],
    [null, false],
  ] as const)('so_tien %j ⇒ hợp lệ: %s', (soTien, ok) => {
    for (const entry of paymentAuditEntries()) {
      const input = withChanges(entry, { ...entry.changes, so_tien: soTien });
      if (ok) expect(validateAuditEntry(input)).toEqual(input);
      else invalid(input);
    }
  });

  it('thiếu so_tien ở bất kỳ hành động nào ⇒ AUDIT_ENTRY_INVALID', () => {
    for (const entry of paymentAuditEntries()) {
      const { so_tien: _drop, ...rest } = entry.changes as Record<
        string,
        unknown
      >;
      invalid(withChanges(entry, rest));
    }
  });
});

describe('TDT-06 — HoanTienDacBiet: chi nhánh của lịch gốc và lý do bắt buộc 10–255', () => {
  it('branchId null hay sai dạng ⇒ AUDIT_ENTRY_INVALID', () => {
    invalid(specialRefundEntry({ branchId: null }));
    invalid({ ...specialRefundEntry(), branchId: 'abc' });
  });

  it.each([
    ['đúng 10 ký tự', 'x'.repeat(10), true],
    ['đúng 255 ký tự', 'x'.repeat(255), true],
    ['9 ký tự', 'x'.repeat(9), false],
    ['256 ký tự', 'x'.repeat(256), false],
    [
      '10 ký tự nhưng có khoảng trắng hai đầu (sau trim còn 8)',
      ' xxxxxxxx ',
      false,
    ],
    ['rỗng', '', false],
  ])('ly_do %s ⇒ hợp lệ: %s', (_name, lyDo, ok) => {
    const input = specialRefundEntry({
      changes: { so_tien: '150000.00', ly_do: lyDo },
    });
    if (ok) expect(validateAuditEntry(input)).toEqual(input);
    else invalid(input);
  });

  it('thiếu ly_do ⇒ AUDIT_ENTRY_INVALID', () => {
    invalid(withChanges(specialRefundEntry(), { so_tien: '150000.00' }));
  });
});

describe('TDT-06 — XuLyNapViChuaCong: ket_qua quyết định có hay không có ly_do', () => {
  it('ThanhCong mà CÓ ly_do ⇒ AUDIT_ENTRY_INVALID', () => {
    invalid(
      withChanges(topupCreditedEntry(), {
        ket_qua: 'ThanhCong',
        so_tien: '200000.00',
        ly_do: 'Lý do không được có ở đây',
      }),
    );
  });

  it('KhongTheXuLy mà THIẾU ly_do, hoặc ly_do ngắn hơn 10 ký tự ⇒ AUDIT_ENTRY_INVALID', () => {
    invalid(
      withChanges(topupUnprocessableEntry(), {
        ket_qua: 'KhongTheXuLy',
        so_tien: '200000.00',
      }),
    );
    invalid(
      withChanges(topupUnprocessableEntry(), {
        ket_qua: 'KhongTheXuLy',
        so_tien: '200000.00',
        ly_do: 'quá ngắn',
      }),
    );
  });

  it.each(['ThatBai', 'DaDoiSoat', '', null])(
    'ket_qua %j (ThatBai là của job, không phải của Quản trị viên) ⇒ AUDIT_ENTRY_INVALID',
    (ketQua) => {
      invalid(
        withChanges(topupCreditedEntry(), {
          ket_qua: ketQua,
          so_tien: '200000.00',
        }),
      );
    },
  );

  it('có chi nhánh ⇒ AUDIT_ENTRY_INVALID (ví không thuộc chi nhánh)', () => {
    invalid(topupCreditedEntry({ branchId: '2' }));
    invalid(topupUnprocessableEntry({ branchId: '2' }));
  });
});

describe('TDT-07 — DuyetRutTien, TuChoiRutTien: trạng thái trước/sau đúng, ghi chú tuỳ chọn 1–255', () => {
  it('trạng thái sau phải khớp hành động; trước phải là ChoDuyet', () => {
    const approved = withdrawalApprovedEntry();
    const rejected = withdrawalRejectedEntry();
    invalid({
      ...approved,
      changes: { ...approved.changes, sau: { trang_thai: 'TuChoi' } },
    });
    invalid({
      ...rejected,
      changes: { ...rejected.changes, sau: { trang_thai: 'DaDuyet' } },
    });
    for (const truoc of ['DaDuyet', 'TuChoi', 'ChoXuLy'])
      invalid({
        ...approved,
        changes: { ...approved.changes, truoc: { trang_thai: truoc } },
      });
  });

  it('truoc hay sau thiếu, hoặc có khoá thừa ⇒ AUDIT_ENTRY_INVALID', () => {
    const entry = withdrawalApprovedEntry();
    const { truoc: _t, ...noBefore } = entry.changes;
    invalid(withChanges(entry, noBefore));
    invalid({
      ...entry,
      changes: {
        ...entry.changes,
        sau: { trang_thai: 'DaDuyet', so_du: '0.00' },
      },
    });
  });

  it.each([
    ['vắng hẳn khoá', undefined, true],
    ['1 ký tự', 'x', true],
    ['255 ký tự', 'x'.repeat(255), true],
    ['256 ký tự', 'x'.repeat(256), false],
    ['chuỗi rỗng', '', false],
    ['toàn khoảng trắng', '   ', false],
    ['null', null, false],
  ])('ly_do %s ⇒ hợp lệ: %s', (_name, lyDo, ok) => {
    for (const base of [withdrawalApprovedEntry(), withdrawalRejectedEntry()]) {
      const { ly_do: _drop, ...rest } = base.changes;
      const input = withChanges(
        base,
        lyDo === undefined ? rest : { ...rest, ly_do: lyDo },
      );
      if (ok) expect(validateAuditEntry(input)).toEqual(input);
      else invalid(input);
    }
  });

  it('có chi nhánh ⇒ AUDIT_ENTRY_INVALID', () => {
    invalid(withdrawalApprovedEntry({ branchId: '2' }));
    invalid(withdrawalRejectedEntry({ branchId: '2' }));
  });
});

describe('P5 — hành động gần giống vẫn bị từ chối rõ', () => {
  it.each(['HoanTien', 'DuyetRut', 'duyetruttien', 'XuLyNapVi', 'RutTien'])(
    'action %j ⇒ AUDIT_ACTION_UNSUPPORTED',
    (action) => {
      expect(() =>
        validateAuditEntry({ ...withdrawalApprovedEntry(), action }),
      ).toThrow('AUDIT_ACTION_UNSUPPORTED');
    },
  );
});
