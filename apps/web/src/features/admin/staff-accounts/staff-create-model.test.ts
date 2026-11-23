import { DEGREE_OF_TITLE } from '../doctor-profiles/doctor-profile-format';
import { DOCTOR_TITLES } from '../doctor-profiles/doctor-profile-types';
import {
  BLANK_MESSAGE,
  EXPERIENCE_MESSAGE,
  TITLE_DEGREE_MESSAGE,
  buildBody,
  fieldsOf,
  initialValues,
  roleOptions,
  servicesOf,
  validate,
  withBranch,
  withRole,
  withScope,
  withTitle,
  type BranchChoice,
  type CreateValues,
} from './staff-create-model';

// admin F8 PR2, mô hình của biểu mẫu "Tạo tài khoản nhân sự" (mã NSF8-67 đến 74 là [đề xuất], TRACKING admin 9A.21 mục 3). Phủ NS-04, 05, 06, 07, 08 (phía giao diện),
// NS-11 (lỗi bỏ trống theo từng vai trò), NS-14 (học vị điền sẵn), NS-18 (không có trường lạ) và NS-26. Hàm thuần: không React, không API.

const SYSTEM = { phamVi: 'ToanHeThong' } as const;
const BRANCH_ME = {
  phamVi: 'ChiNhanh',
  chiNhanh: { id: '5', ten: 'Chi nhánh Quận 1' },
} as const;

const BRANCHES: BranchChoice[] = [
  {
    chiNhanhId: '5',
    ten: 'Chi nhánh Quận 1',
    dichVuKham: [
      { dichVuKhamId: '11', ten: 'Khám tổng quát' },
      { dichVuKhamId: '12', ten: 'Khám tim mạch' },
    ],
  },
  {
    chiNhanhId: '6',
    ten: 'Chi nhánh Quận 3',
    dichVuKham: [{ dichVuKhamId: '12', ten: 'Khám tim mạch' }],
  },
];

const make = (overrides: Partial<CreateValues> = {}): CreateValues => ({
  ...initialValues(SYSTEM),
  hoTen: 'Lê Văn An',
  email: 'an@example.invalid',
  soDienThoai: '0912345678',
  ...overrides,
});

const doctor = (overrides: Partial<CreateValues> = {}) =>
  make({
    vaiTro: 'BacSi',
    chiNhanhId: '5',
    chucDanh: 'TS_BS',
    hocVi: 'TS',
    chuyenKhoaId: '1',
    dichVuKhamId: '11',
    soNamKinhNghiem: '12',
    ...overrides,
  });

describe('NSF8-67 giá trị đầu và vai trò được chọn theo phạm vi (NS-05, 07, 08)', () => {
  it('NSF8-67 Toàn hệ thống: mặc định Bác sĩ, mọi ô rỗng, chi nhánh chưa chọn', () => {
    expect(initialValues(SYSTEM)).toEqual({
      vaiTro: 'BacSi',
      hoTen: '',
      email: '',
      soDienThoai: '',
      phamVi: '',
      chiNhanhId: '',
      chuyenKhoaId: '',
      dichVuKhamId: '',
      chucDanh: '',
      hocVi: '',
      soNamKinhNghiem: '',
    });
  });

  it('NSF8-67 Chi nhánh: chi nhánh CỐ ĐỊNH là chi nhánh của người tạo (NS-05)', () => {
    expect(initialValues(BRANCH_ME).chiNhanhId).toBe('5');
  });

  it('NSF8-67 Toàn hệ thống chọn được cả ba vai trò (NS-08)', () => {
    expect(roleOptions('ToanHeThong')).toEqual([
      { value: 'BacSi', label: 'Bác sĩ', disabled: false },
      { value: 'LeTan', label: 'Lễ tân', disabled: false },
      { value: 'QuanTriVien', label: 'Quản trị viên', disabled: false },
    ]);
  });

  it('NSF8-67 Chi nhánh: Quản trị viên HIỆN nhưng vô hiệu (NS-07)', () => {
    expect(roleOptions('ChiNhanh')).toEqual([
      { value: 'BacSi', label: 'Bác sĩ', disabled: false },
      { value: 'LeTan', label: 'Lễ tân', disabled: false },
      { value: 'QuanTriVien', label: 'Quản trị viên', disabled: true },
    ]);
  });
});

describe('NSF8-68 đổi vai trò, chức danh, chi nhánh, phạm vi giữ đúng các ô liên quan', () => {
  it('NSF8-68 đổi vai trò giữ họ tên, email, SĐT và xoá ô không thuộc vai trò mới', () => {
    const next = withRole(doctor(), 'LeTan');
    expect(next).toMatchObject({
      vaiTro: 'LeTan',
      hoTen: 'Lê Văn An',
      email: 'an@example.invalid',
      soDienThoai: '0912345678',
      chiNhanhId: '5',
    });
    expect(next.chuyenKhoaId).toBe('');
    expect(next.dichVuKhamId).toBe('');
    expect(next.chucDanh).toBe('');
    expect(next.hocVi).toBe('');
    expect(next.soNamKinhNghiem).toBe('');
  });

  it('NSF8-68 sang Quản trị viên: bỏ chi nhánh, hồ sơ bác sĩ và chưa chọn phạm vi; về lại Bác sĩ thì bỏ phạm vi', () => {
    const admin = withRole(doctor(), 'QuanTriVien');
    expect(admin.chiNhanhId).toBe('');
    expect(admin.phamVi).toBe('');
    expect(admin.chucDanh).toBe('');
    const back = withRole(withScope(admin, 'ChiNhanh'), 'BacSi');
    expect(back.phamVi).toBe('');
  });

  it.each(DOCTOR_TITLES)(
    'NSF8-68 chức danh %s điền sẵn đúng học vị (NS-14)',
    (title) => {
      const next = withTitle(doctor({ hocVi: '' }), title);
      expect(next.chucDanh).toBe(title);
      expect(next.hocVi).toBe(DEGREE_OF_TITLE[title]);
    },
  );

  it('NSF8-68 xoá chức danh thì xoá luôn học vị điền sẵn', () => {
    expect(withTitle(doctor(), '').hocVi).toBe('');
  });

  it('NSF8-68 đổi chi nhánh: giữ dịch vụ còn có ở chi nhánh mới, bỏ dịch vụ không còn (BS-08)', () => {
    expect(
      withBranch(doctor({ dichVuKhamId: '12' }), '6', BRANCHES).dichVuKhamId,
    ).toBe('12');
    expect(
      withBranch(doctor({ dichVuKhamId: '11' }), '6', BRANCHES).dichVuKhamId,
    ).toBe('');
    expect(withBranch(doctor(), '6', BRANCHES).chiNhanhId).toBe('6');
  });

  it('NSF8-68 dịch vụ của một chi nhánh; chi nhánh lạ hay chưa chọn thì rỗng (NS-13)', () => {
    expect(servicesOf('5', BRANCHES).map((s) => s.dichVuKhamId)).toEqual([
      '11',
      '12',
    ]);
    expect(servicesOf('6', BRANCHES).map((s) => s.dichVuKhamId)).toEqual([
      '12',
    ]);
    expect(servicesOf('99', BRANCHES)).toEqual([]);
    expect(servicesOf('', BRANCHES)).toEqual([]);
  });

  it('NSF8-68 Quản trị viên phạm vi Toàn hệ thống: bỏ chi nhánh (CHECK chk_qtv_pham_vi); phạm vi Chi nhánh thì giữ', () => {
    const base = withRole(make(), 'QuanTriVien');
    const withBranchChosen = { ...base, chiNhanhId: '6' };
    expect(withScope(withBranchChosen, 'ToanHeThong').chiNhanhId).toBe('');
    expect(withScope(withBranchChosen, 'ChiNhanh').chiNhanhId).toBe('6');
    expect(withScope(withBranchChosen, 'ToanHeThong').phamVi).toBe(
      'ToanHeThong',
    );
  });
});

describe('NSF8-69 tập ô theo vai trò và phạm vi (NS-26)', () => {
  const common = ['hoTen', 'email', 'soDienThoai'];
  it('NSF8-69 Bác sĩ: chín ô theo thứ tự hiển thị', () => {
    expect(fieldsOf(doctor())).toEqual([
      ...common,
      'chiNhanhId',
      'chucDanh',
      'hocVi',
      'chuyenKhoaId',
      'dichVuKhamId',
      'soNamKinhNghiem',
    ]);
  });

  it('NSF8-69 Lễ tân: chung và chi nhánh', () => {
    expect(fieldsOf(make({ vaiTro: 'LeTan' }))).toEqual([
      ...common,
      'chiNhanhId',
    ]);
  });

  it('NSF8-69 Quản trị viên: chung và phạm vi; chỉ phạm vi Chi nhánh mới có ô chi nhánh', () => {
    const admin = make({ vaiTro: 'QuanTriVien' });
    expect(fieldsOf(admin)).toEqual([...common, 'phamVi']);
    expect(fieldsOf({ ...admin, phamVi: 'ToanHeThong' })).toEqual([
      ...common,
      'phamVi',
    ]);
    expect(fieldsOf({ ...admin, phamVi: 'ChiNhanh' })).toEqual([
      ...common,
      'phamVi',
      'chiNhanhId',
    ]);
  });
});

describe('NSF8-70 bỏ trống từng ô: đúng một lỗi, đúng ô (NS-11, NS-26)', () => {
  const doctorFields = [
    'hoTen',
    'email',
    'soDienThoai',
    'chiNhanhId',
    'chucDanh',
    'hocVi',
    'chuyenKhoaId',
    'dichVuKhamId',
    'soNamKinhNghiem',
  ] as const;

  it('NSF8-70 biểu mẫu Bác sĩ đầy đủ thì không có lỗi', () => {
    expect(validate(doctor())).toEqual({});
  });

  it.each(doctorFields)('NSF8-70 Bác sĩ bỏ trống "%s"', (field) => {
    expect(validate(doctor({ [field]: '' }))).toEqual({
      [field]: BLANK_MESSAGE,
    });
  });

  it('NSF8-70 Bác sĩ bỏ trống MỌI ô: chín lỗi (Figma 524:2)', () => {
    const errors = validate(
      make({ vaiTro: 'BacSi', hoTen: '', email: '', soDienThoai: '' }),
    );
    expect(Object.keys(errors)).toEqual([...doctorFields]);
    for (const message of Object.values(errors))
      expect(message).toBe(BLANK_MESSAGE);
  });

  it.each(['hoTen', 'email', 'soDienThoai', 'chiNhanhId'] as const)(
    'NSF8-70 Lễ tân bỏ trống "%s" (Figma 525:2)',
    (field) => {
      const filled = make({ vaiTro: 'LeTan', chiNhanhId: '5' });
      expect(validate({ ...filled, [field]: '' })).toEqual({
        [field]: BLANK_MESSAGE,
      });
    },
  );

  it('NSF8-70 Lễ tân KHÔNG bị hỏi ô của Bác sĩ dù ô đó rỗng', () => {
    const errors = validate(make({ vaiTro: 'LeTan', chiNhanhId: '5' }));
    expect(errors).toEqual({});
  });

  it('NSF8-70 Quản trị viên chưa chọn phạm vi: lỗi ở phạm vi, không hỏi chi nhánh (NS-04)', () => {
    expect(validate(make({ vaiTro: 'QuanTriVien' }))).toEqual({
      phamVi: BLANK_MESSAGE,
    });
  });

  it('NSF8-70 Quản trị viên phạm vi Chi nhánh thiếu chi nhánh: lỗi ở chi nhánh (NS-04); phạm vi Toàn hệ thống thì không cần', () => {
    expect(
      validate(make({ vaiTro: 'QuanTriVien', phamVi: 'ChiNhanh' })),
    ).toEqual({ chiNhanhId: BLANK_MESSAGE });
    expect(
      validate(make({ vaiTro: 'QuanTriVien', phamVi: 'ToanHeThong' })),
    ).toEqual({});
  });

  it('NSF8-70 chỉ có khoảng trắng cũng là bỏ trống', () => {
    expect(validate(doctor({ hoTen: '   ', email: ' \t ' }))).toEqual({
      hoTen: BLANK_MESSAGE,
      email: BLANK_MESSAGE,
    });
  });
});

describe('NSF8-71 định dạng họ tên, email, SĐT (NS-15; luật đăng ký của auth)', () => {
  it.each([
    ['trailing space', 'an@example.invalid '],
    ['leading space', ' an@example.invalid'],
  ])(
    'NSF8-71 email có khoảng trắng đầu hoặc cuối vẫn hợp lệ (%s): đã trim trước khi kiểm',
    (_name, email) => {
      expect(validate(doctor({ email }))).toEqual({});
    },
  );

  it.each([
    'an',
    'an@',
    '@example.invalid',
    'an@example',
    'an @example.invalid',
    'ân@example.invalid',
  ])('NSF8-71 email "%s" không hợp lệ', (email) => {
    expect(Object.keys(validate(doctor({ email })))).toEqual(['email']);
    expect(validate(doctor({ email })).email).toBe('Email không hợp lệ.');
  });

  it.each([
    '091234567',
    '09123456789',
    '1912345678',
    '09123x5678',
    '09-1234567',
  ])('NSF8-71 SĐT "%s" không hợp lệ', (soDienThoai) => {
    expect(validate(doctor({ soDienThoai })).soDienThoai).toBe(
      'Số điện thoại phải 10 số, bắt đầu bằng 0.',
    );
  });

  it.each(['0912345678', ' 0912345678 ', '0912 345 678', '0912.345.678'])(
    'NSF8-71 SĐT "%s" hợp lệ (luật đăng ký cho dấu cách và dấu chấm giữa các nhóm số; máy chủ chuẩn hoá)',
    (soDienThoai) => {
      expect(validate(doctor({ soDienThoai }))).toEqual({});
    },
  );

  it('NSF8-71 họ tên quá 100 ký tự hoặc không có chữ cái: lỗi họ tên', () => {
    expect(Object.keys(validate(doctor({ hoTen: 'a'.repeat(101) })))).toEqual([
      'hoTen',
    ]);
    expect(Object.keys(validate(doctor({ hoTen: '1234' })))).toEqual(['hoTen']);
    expect(validate(doctor({ hoTen: 'a'.repeat(100) }))).toEqual({});
  });
});

describe('NSF8-72 số năm kinh nghiệm và học vị (NS-12, NS-14)', () => {
  it.each(['0', '1', '12', '60', '05'])(
    'NSF8-72 số năm "%s" hợp lệ',
    (soNamKinhNghiem) => {
      expect(validate(doctor({ soNamKinhNghiem }))).toEqual({});
    },
  );

  it.each(['61', '-1', '1.5', '1,5', 'abc', '1e2', '007', '+3', ' '])(
    'NSF8-72 số năm "%s" không hợp lệ',
    (soNamKinhNghiem) => {
      const errors = validate(doctor({ soNamKinhNghiem }));
      expect(Object.keys(errors)).toEqual(['soNamKinhNghiem']);
      if (soNamKinhNghiem.trim() !== '')
        expect(errors.soNamKinhNghiem).toBe(EXPERIENCE_MESSAGE);
    },
  );

  it('NSF8-72 học vị khác học vị của chức danh: lỗi ở học vị với chữ PLAN 5.9, kiểm sớm (server vẫn kiểm lại)', () => {
    expect(TITLE_DEGREE_MESSAGE).toBe('Chức danh và học vị không tương thích.');
    expect(validate(doctor({ chucDanh: 'TS_BS', hocVi: 'GS' }))).toEqual({
      hocVi: TITLE_DEGREE_MESSAGE,
    });
  });

  it.each(DOCTOR_TITLES)(
    'NSF8-72 chức danh %s đi với học vị điền sẵn thì hợp lệ',
    (title) => {
      expect(
        validate(doctor({ chucDanh: title, hocVi: DEGREE_OF_TITLE[title] })),
      ).toEqual({});
    },
  );
});

describe('NSF8-73 thân gửi API: TẬP KHOÁ CHÍNH XÁC theo từng dạng (NS-18; TRUONG_KHONG_DUOC_PHEP)', () => {
  const keys = (body: object) => Object.keys(body).sort();

  it('NSF8-73 Bác sĩ: đúng 10 khoá, kiểu đúng (id là chuỗi, số năm là SỐ)', () => {
    const body = buildBody(doctor({ soNamKinhNghiem: '12' }));
    expect(keys(body)).toEqual(
      [
        'chiNhanhId',
        'chucDanh',
        'chuyenKhoaId',
        'dichVuKhamId',
        'email',
        'hoTen',
        'hocVi',
        'soDienThoai',
        'soNamKinhNghiem',
        'vaiTro',
      ].sort(),
    );
    expect(body).toEqual({
      vaiTro: 'BacSi',
      hoTen: 'Lê Văn An',
      email: 'an@example.invalid',
      soDienThoai: '0912345678',
      chiNhanhId: '5',
      chuyenKhoaId: '1',
      dichVuKhamId: '11',
      chucDanh: 'TS_BS',
      hocVi: 'TS',
      soNamKinhNghiem: 12,
    });
    expect(typeof (body as { soNamKinhNghiem: unknown }).soNamKinhNghiem).toBe(
      'number',
    );
  });

  it('NSF8-73 Lễ tân: đúng 5 khoá, KHÔNG có ô của Bác sĩ dù giá trị còn sót trong state', () => {
    const stale = make({
      vaiTro: 'LeTan',
      chiNhanhId: '5',
      chuyenKhoaId: '1',
      dichVuKhamId: '11',
      chucDanh: 'TS_BS',
      hocVi: 'TS',
      soNamKinhNghiem: '9',
      phamVi: 'ChiNhanh',
    });
    expect(keys(buildBody(stale))).toEqual(
      ['chiNhanhId', 'email', 'hoTen', 'soDienThoai', 'vaiTro'].sort(),
    );
  });

  it('NSF8-73 Quản trị viên Toàn hệ thống: đúng 5 khoá và KHÔNG có chiNhanhId dù state còn sót (CHECK chk_qtv_pham_vi)', () => {
    const body = buildBody(
      make({ vaiTro: 'QuanTriVien', phamVi: 'ToanHeThong', chiNhanhId: '5' }),
    );
    expect(keys(body)).toEqual(
      ['email', 'hoTen', 'phamVi', 'soDienThoai', 'vaiTro'].sort(),
    );
    expect(body).toMatchObject({ phamVi: 'ToanHeThong' });
  });

  it('NSF8-73 Quản trị viên Chi nhánh: đúng 6 khoá, có chiNhanhId', () => {
    const body = buildBody(
      make({ vaiTro: 'QuanTriVien', phamVi: 'ChiNhanh', chiNhanhId: '6' }),
    );
    expect(keys(body)).toEqual(
      [
        'chiNhanhId',
        'email',
        'hoTen',
        'phamVi',
        'soDienThoai',
        'vaiTro',
      ].sort(),
    );
    expect(body).toMatchObject({ phamVi: 'ChiNhanh', chiNhanhId: '6' });
  });

  it('NSF8-73 không bao giờ có matKhau, trangThai, daXacMinhEmail, moTaChuyenMon hay loaiTaiKhoan (NS-18)', () => {
    for (const values of [
      doctor(),
      make({ vaiTro: 'LeTan', chiNhanhId: '5' }),
      make({ vaiTro: 'QuanTriVien', phamVi: 'ToanHeThong' }),
    ]) {
      const body = buildBody(values) as unknown as Record<string, unknown>;
      for (const forbidden of [
        'matKhau',
        'trangThai',
        'daXacMinhEmail',
        'moTaChuyenMon',
        'loaiTaiKhoan',
      ])
        expect(body).not.toHaveProperty(forbidden);
    }
  });

  it('NSF8-73 họ tên và email được trim; SĐT giữ nguyên chữ số', () => {
    const body = buildBody(
      doctor({ hoTen: '  Lê Văn An  ', email: '  an@example.invalid  ' }),
    );
    expect(body).toMatchObject({
      hoTen: 'Lê Văn An',
      email: 'an@example.invalid',
    });
  });
});

describe('NSF8-74 thân chưa hợp lệ là lỗi lập trình, không gửi bậy', () => {
  it('NSF8-74 buildBody ném khi ô bắt buộc của vai trò còn rỗng (validate phải chạy trước)', () => {
    expect(() => buildBody(doctor({ chucDanh: '' }))).toThrow();
    expect(() => buildBody(make({ vaiTro: 'QuanTriVien' }))).toThrow();
    expect(() =>
      buildBody(make({ vaiTro: 'QuanTriVien', phamVi: 'ChiNhanh' })),
    ).toThrow();
  });
});
