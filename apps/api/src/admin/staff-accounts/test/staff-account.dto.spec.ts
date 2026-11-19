import { ValidationPipe } from '@nestjs/common';
import { AppException } from '../../../common/errors/app.exception.js';
import { validationExceptionFactory } from '../../../common/errors/validation-exception.js';
import { CHUC_DANH_BAC_SI, HOC_VI_BAC_SI } from '../../entities/enums.js';
import {
  CreateStaffAccountDto,
  isBigintId,
  toStaffAccountInput,
} from '../staff-account.dto.js';

// Task B15 (admin) — DTO của POST /admin/staff-accounts, kiểm bằng ĐÚNG cấu hình ValidationPipe của configureApp (PLAN admin 7.4: NS-04, 11, 12, 15, 18, 23).
// Quy tắc từng trường email, SĐT, họ tên đã có test riêng ở auth (A1, A5); ở đây chỉ kiểm chúng được NỐI đúng. Mã NSB15-03…10 là [đề xuất].

// Cùng tuỳ chọn với configureApp() trong app.setup.ts
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  validationError: { target: false, value: false },
  exceptionFactory: validationExceptionFactory,
});

const common = {
  hoTen: 'Lê Minh Quang',
  email: 'quang.le@example.com',
  soDienThoai: '0912345678',
};
const doctor = {
  ...common,
  vaiTro: 'BacSi',
  chiNhanhId: '1',
  chuyenKhoaId: '2',
  dichVuKhamId: '3',
  chucDanh: 'BS_CKI',
  hocVi: 'BS',
  soNamKinhNghiem: 10,
};
const receptionist = { ...common, vaiTro: 'LeTan', chiNhanhId: '1' };
const systemAdmin = {
  ...common,
  vaiTro: 'QuanTriVien',
  phamVi: 'ToanHeThong',
};
const branchAdmin = {
  ...common,
  vaiTro: 'QuanTriVien',
  phamVi: 'ChiNhanh',
  chiNhanhId: '1',
};

const parse = (body: unknown) =>
  pipe.transform(body, {
    type: 'body',
    metatype: CreateStaffAccountDto,
  }) as Promise<CreateStaffAccountDto>;

// Danh sách lỗi dạng "truong:ma", đã sắp xếp; [] khi hợp lệ
async function errorsOf(body: unknown): Promise<string[]> {
  try {
    await parse(body);
    return [];
  } catch (error) {
    if (!(error instanceof AppException)) throw error;
    expect(error.getStatus()).toBe(400);
    expect(error.maLoi).toBe('DU_LIEU_KHONG_HOP_LE');
    const response = error.getResponse() as {
      loi: { truong: string; ma: string }[];
    };
    return response.loi.map((item) => `${item.truong}:${item.ma}`).sort();
  }
}

const without = <T extends object>(body: T, key: keyof T): object => {
  const copy = { ...body } as Record<string, unknown>;
  delete copy[key as string];
  return copy;
};

describe('thân hợp lệ và chuẩn hoá (NS-15)', () => {
  it('NSB15-03 bốn thân hợp lệ (Bác sĩ, Lễ tân, Quản trị viên Toàn hệ thống, Quản trị viên Chi nhánh) đều qua kiểm và đổi thành đầu vào đúng vai trò', async () => {
    for (const body of [doctor, receptionist, systemAdmin, branchAdmin]) {
      expect(await errorsOf(body)).toEqual([]);
    }
    expect(toStaffAccountInput(await parse(doctor))).toEqual(doctor);
    expect(toStaffAccountInput(await parse(receptionist))).toEqual(
      receptionist,
    );
    expect(toStaffAccountInput(await parse(systemAdmin))).toEqual(systemAdmin);
    expect(toStaffAccountInput(await parse(branchAdmin))).toEqual(branchAdmin);
  });

  it('NSB15-03 (NS-15) email cắt khoảng trắng hai đầu và hạ chữ tên miền, họ tên chuẩn NFC và cắt hai đầu, SĐT về 10 số liền', async () => {
    const dto = await parse({
      ...receptionist,
      email: '  Quang.Le@Example.COM \t',
      hoTen: '  Lê Minh Quang  ',
      soDienThoai: ' 0912 345 678 ',
    });
    expect(dto.email).toBe('Quang.Le@example.com');
    expect(dto.hoTen).toBe('Lê Minh Quang');
    expect(dto.soDienThoai).toBe('0912345678');
  });

  it('NSB15-03 Quản trị viên Toàn hệ thống đổi thành đầu vào KHÔNG có chiNhanhId (không khoá nào thừa)', async () => {
    const input = toStaffAccountInput(await parse(systemAdmin));
    expect(Object.keys(input).sort()).toEqual(
      ['email', 'hoTen', 'phamVi', 'soDienThoai', 'vaiTro'].sort(),
    );
  });
});

describe('vai trò (NS-23)', () => {
  it('NSB15-04 (NS-23) vaiTro thiếu, rỗng, BenhNhan, sai hoa thường, số, mảng, null ⇒ lỗi trên vaiTro và KHÔNG dội thêm lỗi theo vai trò', async () => {
    const fieldsOfDoctor = without(doctor, 'vaiTro');
    for (const vaiTro of [
      undefined,
      '',
      'BenhNhan',
      'bacsi',
      'BACSI',
      ' BacSi',
      1,
      ['BacSi'],
      null,
    ]) {
      expect(await errorsOf({ ...fieldsOfDoctor, vaiTro })).toEqual([
        'vaiTro:VAI_TRO_KHONG_HOP_LE',
      ]);
    }
  });
});

describe('trường bắt buộc theo vai trò (NS-04, NS-11)', () => {
  const required: [string, object, Record<string, string>][] = [
    [
      'Bác sĩ',
      doctor,
      {
        chiNhanhId: 'CHI_NHANH_KHONG_HOP_LE',
        chuyenKhoaId: 'CHUYEN_KHOA_KHONG_HOP_LE',
        dichVuKhamId: 'DICH_VU_KHAM_ID_KHONG_HOP_LE',
        chucDanh: 'CHUC_DANH_KHONG_HOP_LE',
        hocVi: 'HOC_VI_KHONG_HOP_LE',
        soNamKinhNghiem: 'SO_NAM_KINH_NGHIEM_KHONG_HOP_LE',
        hoTen: 'HO_TEN_KHONG_HOP_LE',
        email: 'EMAIL_KHONG_HOP_LE',
        soDienThoai: 'SDT_KHONG_HOP_LE',
      },
    ],
    [
      'Lễ tân',
      receptionist,
      {
        chiNhanhId: 'CHI_NHANH_KHONG_HOP_LE',
        hoTen: 'HO_TEN_KHONG_HOP_LE',
        email: 'EMAIL_KHONG_HOP_LE',
        soDienThoai: 'SDT_KHONG_HOP_LE',
      },
    ],
    [
      'Quản trị viên Chi nhánh',
      branchAdmin,
      {
        phamVi: 'PHAM_VI_KHONG_HOP_LE',
        chiNhanhId: 'CHI_NHANH_KHONG_HOP_LE',
        hoTen: 'HO_TEN_KHONG_HOP_LE',
        email: 'EMAIL_KHONG_HOP_LE',
        soDienThoai: 'SDT_KHONG_HOP_LE',
      },
    ],
    [
      'Quản trị viên Toàn hệ thống',
      systemAdmin,
      {
        phamVi: 'PHAM_VI_KHONG_HOP_LE',
        hoTen: 'HO_TEN_KHONG_HOP_LE',
        email: 'EMAIL_KHONG_HOP_LE',
        soDienThoai: 'SDT_KHONG_HOP_LE',
      },
    ],
  ];

  it.each(required)(
    'NSB15-05 (NS-11) %s: thiếu TỪNG trường bắt buộc (mỗi trường một ca) ⇒ đúng một lỗi trên đúng trường, đúng mã',
    async (_label, body, expected) => {
      for (const [field, code] of Object.entries(expected)) {
        // Thiếu phamVi thì chiNhanhId của Quản trị viên không còn phán được (skip): lỗi duy nhất là của phamVi
        expect(
          await errorsOf(without(body as Record<string, unknown>, field)),
        ).toEqual([`${field}:${code}`]);
      }
    },
  );

  it('NSB15-05 (NS-04) Quản trị viên Chi nhánh thiếu chiNhanhId ⇒ lỗi; Toàn hệ thống không cần chiNhanhId', async () => {
    expect(await errorsOf(without(branchAdmin, 'chiNhanhId'))).toEqual([
      'chiNhanhId:CHI_NHANH_KHONG_HOP_LE',
    ]);
    expect(await errorsOf(systemAdmin)).toEqual([]);
  });
});

describe('trường không thuộc vai trò (NSB15-06)', () => {
  it('NSB15-06 Lễ tân gửi trường của Bác sĩ hay Quản trị viên ⇒ TRUONG_KHONG_DUOC_PHEP trên đúng trường (kể cả null)', async () => {
    const extras: Record<string, unknown> = {
      chuyenKhoaId: '2',
      dichVuKhamId: '3',
      chucDanh: 'BS',
      hocVi: 'BS',
      soNamKinhNghiem: 1,
      phamVi: 'ChiNhanh',
    };
    for (const [field, value] of Object.entries(extras)) {
      for (const sent of [value, null]) {
        expect(await errorsOf({ ...receptionist, [field]: sent })).toEqual([
          `${field}:TRUONG_KHONG_DUOC_PHEP`,
        ]);
      }
    }
  });

  it('NSB15-06 (NS-04) Quản trị viên Toàn hệ thống gửi chiNhanhId ⇒ TRUONG_KHONG_DUOC_PHEP (không để CHECK của DB phải chặn)', async () => {
    expect(await errorsOf({ ...systemAdmin, chiNhanhId: '1' })).toEqual([
      'chiNhanhId:TRUONG_KHONG_DUOC_PHEP',
    ]);
  });

  it('NSB15-06 Bác sĩ gửi phamVi, Quản trị viên gửi trường hồ sơ bác sĩ ⇒ TRUONG_KHONG_DUOC_PHEP', async () => {
    expect(await errorsOf({ ...doctor, phamVi: 'ToanHeThong' })).toEqual([
      'phamVi:TRUONG_KHONG_DUOC_PHEP',
    ]);
    expect(await errorsOf({ ...branchAdmin, chucDanh: 'BS' })).toEqual([
      'chucDanh:TRUONG_KHONG_DUOC_PHEP',
    ]);
  });
});

describe('trường lạ (NS-18)', () => {
  it('NSB15-07 (NS-18) matKhau, xacNhan, trangThai, daXacMinhEmail, loaiTaiKhoan, taiKhoanId, moTaChuyenMon ⇒ TRUONG_KHONG_DUOC_PHEP, ở cả bốn dạng thân', async () => {
    for (const base of [doctor, receptionist, systemAdmin, branchAdmin]) {
      for (const field of [
        'matKhau',
        'xacNhan',
        'trangThai',
        'daXacMinhEmail',
        'loaiTaiKhoan',
        'taiKhoanId',
        'moTaChuyenMon',
      ]) {
        expect(await errorsOf({ ...base, [field]: 'x' })).toEqual([
          `${field}:TRUONG_KHONG_DUOC_PHEP`,
        ]);
      }
    }
  });

  it('NSB15-07 (NS-18) thông báo lỗi không chép lại giá trị mật khẩu đã gửi', async () => {
    const sentValue = 'Tam-thoi-1!-khong-duoc-lo';
    try {
      await parse({ ...receptionist, matKhau: sentValue });
      throw new Error('phải bị từ chối');
    } catch (error) {
      expect(
        JSON.stringify((error as AppException).getResponse()),
      ).not.toContain(sentValue);
    }
  });
});

describe('số năm kinh nghiệm (NS-12)', () => {
  it('NSB15-08 (NS-12) 0, 1 và 60 qua kiểm', async () => {
    for (const soNamKinhNghiem of [0, 1, 60]) {
      expect(await errorsOf({ ...doctor, soNamKinhNghiem })).toEqual([]);
    }
  });

  it('NSB15-08 (NS-12) −1, 61, 1,5, 1e2, NaN, chuỗi, null, boolean, mảng ⇒ SO_NAM_KINH_NGHIEM_KHONG_HOP_LE', async () => {
    for (const soNamKinhNghiem of [
      -1,
      61,
      1.5,
      1e2,
      Number.NaN,
      '5',
      null,
      true,
      [5],
    ]) {
      expect(await errorsOf({ ...doctor, soNamKinhNghiem })).toEqual([
        'soNamKinhNghiem:SO_NAM_KINH_NGHIEM_KHONG_HOP_LE',
      ]);
    }
  });
});

describe('ID và danh sách giá trị (NSB15-09)', () => {
  it('NSB15-09 isBigintId: chuỗi số nguyên dương không số 0 đứng đầu, tối đa BIGINT', () => {
    for (const ok of ['1', '12', '9223372036854775807']) {
      expect(isBigintId(ok)).toBe(true);
    }
    for (const bad of [
      '0',
      '01',
      ' 1',
      '1 ',
      '',
      '-1',
      '1.5',
      '1e3',
      '9223372036854775808',
      '12345678901234567890',
      1,
      null,
      undefined,
      ['1'],
    ]) {
      expect(isBigintId(bad)).toBe(false);
    }
  });

  it('NSB15-09 chiNhanhId, chuyenKhoaId, dichVuKhamId sai dạng ⇒ lỗi đúng mã của từng trường (số JSON cũng bị từ chối)', async () => {
    const cases: [string, string][] = [
      ['chiNhanhId', 'CHI_NHANH_KHONG_HOP_LE'],
      ['chuyenKhoaId', 'CHUYEN_KHOA_KHONG_HOP_LE'],
      ['dichVuKhamId', 'DICH_VU_KHAM_ID_KHONG_HOP_LE'],
    ];
    for (const [field, code] of cases) {
      for (const bad of ['0', '01', ' 1', 1, '9223372036854775808', '', null]) {
        expect(await errorsOf({ ...doctor, [field]: bad })).toEqual([
          `${field}:${code}`,
        ]);
      }
    }
  });

  it('NSB15-09 chucDanh và hocVi nhận đúng giá trị liệt kê; sai hoa thường hay ngoài danh sách ⇒ lỗi (35 tổ hợp đều QUA DTO, chỉ dịch vụ mới kiểm tương thích)', async () => {
    for (const chucDanh of CHUC_DANH_BAC_SI) {
      for (const hocVi of HOC_VI_BAC_SI) {
        expect(await errorsOf({ ...doctor, chucDanh, hocVi })).toEqual([]);
      }
    }
    expect(await errorsOf({ ...doctor, chucDanh: 'bs' })).toEqual([
      'chucDanh:CHUC_DANH_KHONG_HOP_LE',
    ]);
    expect(await errorsOf({ ...doctor, chucDanh: 'BS_CKIII' })).toEqual([
      'chucDanh:CHUC_DANH_KHONG_HOP_LE',
    ]);
    expect(await errorsOf({ ...doctor, hocVi: 'bs' })).toEqual([
      'hocVi:HOC_VI_KHONG_HOP_LE',
    ]);
    expect(await errorsOf({ ...doctor, hocVi: 'TS_BS' })).toEqual([
      'hocVi:HOC_VI_KHONG_HOP_LE',
    ]);
    expect(await errorsOf({ ...branchAdmin, phamVi: 'toanhethong' })).toEqual([
      'phamVi:PHAM_VI_KHONG_HOP_LE',
    ]);
  });
});

describe('họ tên, email, SĐT (NS-15)', () => {
  it('NSB15-10 (NS-15) họ tên rỗng, chỉ khoảng trắng, 101 ký tự, ký tự điều khiển ⇒ HO_TEN_KHONG_HOP_LE', async () => {
    for (const hoTen of [
      '',
      '   ',
      'A'.repeat(101),
      'Lê\u0000Quang',
      '12345',
    ]) {
      expect(await errorsOf({ ...receptionist, hoTen })).toEqual([
        'hoTen:HO_TEN_KHONG_HOP_LE',
      ]);
    }
    expect(await errorsOf({ ...receptionist, hoTen: 'A'.repeat(100) })).toEqual(
      [],
    );
  });

  it('NSB15-10 (NS-15) email sai dạng, không ASCII, quá dài, rỗng ⇒ EMAIL_KHONG_HOP_LE', async () => {
    for (const email of [
      '',
      'khong-co-a-còng',
      'a@',
      '@example.com',
      'tên@example.com',
      `${'a'.repeat(250)}@example.com`,
      'a b@example.com',
    ]) {
      expect(await errorsOf({ ...receptionist, email })).toEqual([
        'email:EMAIL_KHONG_HOP_LE',
      ]);
    }
  });

  it('NSB15-10 (NS-15) SĐT 9 hoặc 11 số, +84, có gạch, không bắt đầu bằng 0 ⇒ SDT_KHONG_HOP_LE', async () => {
    for (const soDienThoai of [
      '091234567',
      '09123456789',
      '+84912345678',
      '0912-345-678',
      '1912345678',
      '',
    ]) {
      expect(await errorsOf({ ...receptionist, soDienThoai })).toEqual([
        'soDienThoai:SDT_KHONG_HOP_LE',
      ]);
    }
  });
});
