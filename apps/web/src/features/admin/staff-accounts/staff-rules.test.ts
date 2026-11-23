import { accountActions } from '../account-common/account-rules';
import type { AdminScopeKind } from '../account-common/account-types';
import {
  describeActivationLink,
  formatCreatedDate,
  formatAdminScope,
  formatAppointmentStatus,
  formatBranch,
  formatRole,
  formatShift,
  formatSlotTime,
  formatWait,
  hiddenCount,
  roleFilterOptions,
  rolesToQuery,
  staffActions,
  staffFields,
} from './staff-rules';
import { STAFF_ROLES, type StaffRole } from './staff-types';

// admin F8, hàm thuần của màn Nhân sự (mã NSF8-01 đến 06 là [đề xuất], TRACKING admin 9A.20 mục 3). Phủ ma trận nút của PLAN 5.6 (TK-12, TK-14, TK-22, TK-26, TK-44),
// danh sách vai trò theo phạm vi (L9, TK-02) và các định dạng chữ.

const SCOPES: AdminScopeKind[] = ['ToanHeThong', 'ChiNhanh'];
const STATUSES = ['ChoKichHoat', 'DangHoatDong', 'NgungHoatDong'] as const;

describe('NSF8-01 ma trận nút: phạm vi × vai trò × trạng thái (TK-12, 14, 22, 26, 44)', () => {
  const cases = SCOPES.flatMap((scope) =>
    STAFF_ROLES.flatMap((role) =>
      STATUSES.map((status) => ({ scope, role, status })),
    ),
  );

  it.each(cases)(
    'NSF8-01 $scope × $role × $status ra đúng nút',
    ({ scope, role, status }) => {
      const actions = staffActions(scope, {
        loaiTaiKhoan: role,
        trangThai: status,
      });
      // Chi nhánh KHÔNG thao tác được Quản trị viên (Q27: còn không thấy họ)
      const reachable = scope === 'ToanHeThong' || role !== 'QuanTriVien';
      expect(actions).toEqual({
        canLock: reachable && status === 'DangHoatDong',
        canUnlock: reachable && status === 'NgungHoatDong',
        canResend: reachable && status === 'ChoKichHoat',
      });
    },
  );

  it('NSF8-01 khoá và mở khoá lấy ĐÚNG từ ma trận chung của F9 (không có bản thứ hai)', () => {
    for (const { scope, role, status } of cases) {
      const shared = accountActions(scope, {
        loaiTaiKhoan: role,
        trangThai: status,
      });
      const mine = staffActions(scope, {
        loaiTaiKhoan: role,
        trangThai: status,
      });
      expect([mine.canLock, mine.canUnlock]).toEqual([
        shared.canLock,
        shared.canUnlock,
      ]);
    }
  });

  it('NSF8-01 chờ kích hoạt không có nút khoá hay mở khoá (A6), chỉ có gửi lại', () => {
    const actions = staffActions('ToanHeThong', {
      loaiTaiKhoan: 'QuanTriVien',
      trangThai: 'ChoKichHoat',
    });
    expect(actions).toEqual({
      canLock: false,
      canUnlock: false,
      canResend: true,
    });
  });
});

describe('NSF8-02 bộ lọc vai trò theo phạm vi (L9, TK-02)', () => {
  it('NSF8-02 Toàn hệ thống có đủ Tất cả, Bác sĩ, Lễ tân, Quản trị viên', () => {
    expect(roleFilterOptions('ToanHeThong')).toEqual([
      { value: 'all', label: 'Tất cả vai trò' },
      { value: 'BacSi', label: 'Bác sĩ' },
      { value: 'LeTan', label: 'Lễ tân' },
      { value: 'QuanTriVien', label: 'Quản trị viên' },
    ]);
  });

  it('NSF8-02 Chi nhánh KHÔNG có Quản trị viên', () => {
    expect(roleFilterOptions('ChiNhanh')).toEqual([
      { value: 'all', label: 'Tất cả vai trò' },
      { value: 'BacSi', label: 'Bác sĩ' },
      { value: 'LeTan', label: 'Lễ tân' },
    ]);
  });

  it.each<[AdminScopeKind, 'all' | StaffRole, StaffRole[]]>([
    ['ToanHeThong', 'all', ['BacSi', 'LeTan', 'QuanTriVien']],
    ['ToanHeThong', 'BacSi', ['BacSi']],
    ['ToanHeThong', 'LeTan', ['LeTan']],
    ['ToanHeThong', 'QuanTriVien', ['QuanTriVien']],
    ['ChiNhanh', 'all', ['BacSi', 'LeTan']],
    ['ChiNhanh', 'BacSi', ['BacSi']],
    ['ChiNhanh', 'LeTan', ['LeTan']],
    // Không bao giờ để trống (trống = bỏ tham số = lộ cả Bệnh nhân) và không bao giờ có Quản trị viên của Chi nhánh
    ['ChiNhanh', 'QuanTriVien', ['BacSi', 'LeTan']],
  ])('NSF8-02 %s chọn %s thì gửi vaiTro %j', (scope, filter, expected) => {
    expect(rolesToQuery(scope, filter)).toEqual(expected);
  });
});

describe('NSF8-03 nhãn vai trò, phạm vi, chi nhánh', () => {
  it('NSF8-03 nhãn vai trò; giá trị lạ là dấu gạch, không in nguyên giá trị thô', () => {
    expect(formatRole('BacSi')).toBe('Bác sĩ');
    expect(formatRole('LeTan')).toBe('Lễ tân');
    expect(formatRole('QuanTriVien')).toBe('Quản trị viên');
    expect(formatRole('BenhNhan')).toBe('—');
    expect(formatRole('constructor')).toBe('—');
    expect(formatRole('__proto__')).toBe('—');
  });

  it('NSF8-03 phạm vi của Quản trị viên', () => {
    expect(formatAdminScope('ToanHeThong')).toBe('Toàn hệ thống');
    expect(formatAdminScope('ChiNhanh')).toBe('Chi nhánh');
    expect(formatAdminScope(null)).toBe('—');
    expect(formatAdminScope(undefined)).toBe('—');
    expect(formatAdminScope('khac')).toBe('—');
  });

  it('NSF8-03 chi nhánh: có tên thì in tên; Quản trị viên Toàn hệ thống là "Toàn hệ thống"; thiếu hồ sơ là "Chưa phân công"', () => {
    const branch = { chiNhanhId: '5', ten: 'Chi nhánh Quận 1' };
    expect(formatBranch({ loaiTaiKhoan: 'BacSi', chiNhanh: branch })).toBe(
      'Chi nhánh Quận 1',
    );
    expect(
      formatBranch({
        loaiTaiKhoan: 'QuanTriVien',
        chiNhanh: branch,
        phamViQuanTri: 'ChiNhanh',
      }),
    ).toBe('Chi nhánh Quận 1');
    expect(
      formatBranch({
        loaiTaiKhoan: 'QuanTriVien',
        chiNhanh: null,
        phamViQuanTri: 'ToanHeThong',
      }),
    ).toBe('Toàn hệ thống');
    // Dữ liệu hỏng: không bịa "Toàn hệ thống" cho Quản trị viên Chi nhánh thiếu chi nhánh, cũng không cho Bác sĩ
    expect(
      formatBranch({
        loaiTaiKhoan: 'QuanTriVien',
        chiNhanh: null,
        phamViQuanTri: 'ChiNhanh',
      }),
    ).toBe('Chưa phân công');
    expect(formatBranch({ loaiTaiKhoan: 'BacSi', chiNhanh: null })).toBe(
      'Chưa phân công',
    );
    expect(formatBranch({ loaiTaiKhoan: 'LeTan', chiNhanh: null })).toBe(
      'Chưa phân công',
    );
  });
});

describe('NSF8-04 hiển thị liên kết kích hoạt (TK-41, TK-42, TK-48)', () => {
  it('NSF8-04 còn hiệu lực: in hạn theo giờ Việt Nam (UTC+7)', () => {
    expect(
      describeActivationLink({
        trangThai: 'HOP_LE',
        hetHanLuc: '2026-11-24T10:30:00.000Z',
      }),
    ).toEqual({
      kind: 'valid',
      text: 'Liên kết kích hoạt còn hiệu lực đến 24/11/2026 17:30.',
    });
  });

  it('NSF8-04 đã hết hạn: dạng riêng, KHÔNG như còn hiệu lực', () => {
    expect(
      describeActivationLink({
        trangThai: 'HET_HAN',
        hetHanLuc: '2026-11-22T10:30:00.000Z',
      }),
    ).toEqual({
      kind: 'expired',
      text: 'Liên kết kích hoạt đã hết hạn lúc 22/11/2026 17:30.',
    });
  });

  it('NSF8-04 biên giờ Việt Nam: 16:59 UTC vẫn cùng ngày, 17:00 UTC sang 00:00 hôm sau', () => {
    const at = (iso: string) =>
      describeActivationLink({ trangThai: 'HOP_LE', hetHanLuc: iso }).text;
    expect(at('2026-11-24T16:59:00.000Z')).toContain('24/11/2026 23:59');
    expect(at('2026-11-24T17:00:00.000Z')).toContain('25/11/2026 00:00');
  });

  it.each([null, undefined])(
    'NSF8-04 %s: chưa có liên kết còn hiệu lực',
    (link) => {
      expect(describeActivationLink(link)).toEqual({
        kind: 'none',
        text: 'Chưa có liên kết kích hoạt còn hiệu lực.',
      });
    },
  );

  it('NSF8-04 trạng thái lạ hay hạn không đọc được: coi là chưa có, KHÔNG bịa một mốc giờ', () => {
    const none = {
      kind: 'none',
      text: 'Chưa có liên kết kích hoạt còn hiệu lực.',
    };
    expect(
      describeActivationLink({
        trangThai: 'DA_DUNG' as never,
        hetHanLuc: '2026-11-24T10:30:00.000Z',
      }),
    ).toEqual(none);
    expect(
      describeActivationLink({
        trangThai: 'HOP_LE',
        hetHanLuc: 'không phải ngày',
      }),
    ).toEqual(none);
    expect(
      describeActivationLink({ trangThai: 'HET_HAN', hetHanLuc: '' }),
    ).toEqual(none);
  });
});

describe('NSF8-05 thời gian chờ của 429 (TK-47, NS-45)', () => {
  it.each<[number, string]>([
    [1, '1 giây'],
    [2, '2 giây'],
    [59, '59 giây'],
    [60, '1 phút'],
    [61, '2 phút'],
    [119, '2 phút'],
    [120, '2 phút'],
    [121, '3 phút'],
    [3599, '60 phút'],
    [3600, '60 phút'],
    [0.4, '1 giây'],
    [1.2, '2 giây'],
  ])(
    'NSF8-05 %d giây thành %s (từ 60 giây đổi sang phút, làm tròn LÊN)',
    (seconds, text) => {
      expect(formatWait(seconds)).toBe(text);
    },
  );

  it.each([
    0,
    -5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    '30',
    null,
    undefined,
    {},
  ])(
    'NSF8-05 giá trị %j không dùng được: trả null để nơi gọi về đúng câu của PLAN',
    (value) => {
      expect(formatWait(value)).toBeNull();
    },
  );
});

describe('NSF8-06 số mục bị cắt của danh sách phụ thuộc (Q28)', () => {
  it('NSF8-06 tổng lớn hơn số mục trả về thì báo phần còn lại', () => {
    expect(hiddenCount({ tong: 73, muc: new Array<unknown>(50) })).toBe(23);
    expect(hiddenCount({ tong: 50, muc: new Array<unknown>(50) })).toBe(0);
    expect(hiddenCount({ tong: 0, muc: [] })).toBe(0);
  });

  it('NSF8-06 tổng nhỏ hơn số mục (API sai) không bao giờ ra số âm', () => {
    expect(hiddenCount({ tong: 3, muc: new Array<unknown>(5) })).toBe(0);
  });
});

describe('NSF8-06 chữ của danh sách việc phụ thuộc (TK-10, Q28)', () => {
  it('NSF8-06 giờ của lịch hẹn là giờ Việt Nam sẵn (không đổi múi giờ), đổi sang dd/MM/yyyy HH:mm', () => {
    expect(formatSlotTime('2026-11-25 08:30:00')).toBe('25/11/2026 08:30');
    expect(formatSlotTime('2026-11-25 00:00:00')).toBe('25/11/2026 00:00');
    expect(formatSlotTime('2026-12-31 23:59:59')).toBe('31/12/2026 23:59');
  });

  it.each([
    '',
    'không phải ngày',
    '2026-02-30 08:30:00',
    '2026-11-25 24:00:00',
    '2026-11-25 08:60:00',
    '2026-11-25',
  ])('NSF8-06 giờ %j không đọc được là dấu gạch, không bịa', (value) => {
    expect(formatSlotTime(value)).toBe('—');
  });

  it('NSF8-06 nhãn ca và trạng thái lịch hẹn; giá trị lạ là dấu gạch', () => {
    expect(formatShift('CaSang')).toBe('Ca sáng');
    expect(formatShift('CaChieu')).toBe('Ca chiều');
    expect(formatShift('CaToi')).toBe('Ca tối');
    expect(formatShift('constructor')).toBe('—');
    expect(formatAppointmentStatus('ChoThanhToan')).toBe('Chờ thanh toán');
    expect(formatAppointmentStatus('DaXacNhan')).toBe('Đã xác nhận');
    expect(formatAppointmentStatus('DaTiepDon')).toBe('Đã tiếp đón');
    expect(formatAppointmentStatus('__proto__')).toBe('—');
  });
});

describe('NSF8-03 các dòng chi tiết và ngày tạo', () => {
  const doctor = {
    taiKhoanId: '1',
    loaiTaiKhoan: 'BacSi' as const,
    hoTen: 'Lê Văn An',
    email: 'an@example.invalid',
    soDienThoai: '0912345678',
    trangThai: 'ChoKichHoat' as const,
    thoiDiemTao: '2026-11-18T17:30:00.000Z',
    chiNhanh: { chiNhanhId: '5', ten: 'Chi nhánh Quận 1' },
  };

  it('NSF8-03 Bác sĩ: bảy dòng theo thứ tự, không có "Phạm vi"; ngày tạo giờ Việt Nam', () => {
    expect(
      staffFields(doctor).map((row) => [row.id, row.label, row.value]),
    ).toEqual([
      ['hoTen', 'Họ tên', 'Lê Văn An'],
      ['email', 'Email', 'an@example.invalid'],
      ['soDienThoai', 'Số điện thoại', '0912345678'],
      ['vaiTro', 'Vai trò', 'Bác sĩ'],
      ['chiNhanh', 'Chi nhánh', 'Chi nhánh Quận 1'],
      ['trangThai', 'Trạng thái', 'Chờ kích hoạt'],
      ['thoiDiemTao', 'Ngày tạo', '19/11/2026 00:30'],
    ]);
  });

  it('NSF8-03 Quản trị viên có thêm dòng "Phạm vi" ngay sau vai trò', () => {
    const rows = staffFields({
      ...doctor,
      loaiTaiKhoan: 'QuanTriVien',
      chiNhanh: null,
      phamViQuanTri: 'ToanHeThong',
    });
    expect(rows.map((row) => row.id)).toEqual([
      'hoTen',
      'email',
      'soDienThoai',
      'vaiTro',
      'phamVi',
      'chiNhanh',
      'trangThai',
      'thoiDiemTao',
    ]);
    expect(rows.find((row) => row.id === 'phamVi')?.value).toBe(
      'Toàn hệ thống',
    );
    expect(rows.find((row) => row.id === 'chiNhanh')?.value).toBe(
      'Toàn hệ thống',
    );
  });

  it('NSF8-03 chữ tự do được giữ nguyên văn (không đổi, không cắt)', () => {
    const rows = staffFields({ ...doctor, hoTen: '<b>x</b> & "y"' });
    expect(rows[0].value).toBe('<b>x</b> & "y"');
  });

  it('NSF8-03 ngày tạo ở danh sách chỉ có ngày theo giờ Việt Nam (17:30 UTC đã sang hôm sau)', () => {
    expect(formatCreatedDate('2026-11-18T17:30:00.000Z')).toBe('19/11/2026');
    expect(formatCreatedDate('2026-11-18T16:59:59.000Z')).toBe('18/11/2026');
    expect(formatCreatedDate('không phải ngày')).toBe('—');
    expect(formatCreatedDate(undefined)).toBe('Chưa có');
  });
});
