import { describe, expect, it } from 'vitest';
import {
  ApiError,
  NetworkError,
  TimeoutError,
} from '../../../shared/api/errors';
import { describeSaveFailure } from './doctor-profile-errors';
import {
  displayName,
  formatDate,
  formatDateTime,
  initialsOf,
  parseBlockingList,
  statusLabel,
} from './doctor-profile-format';
import {
  initialValues,
  specialtyChoices,
  validate,
  withBranch,
  withTitle,
} from './doctor-profile-form-model';
import type { BranchOption, DoctorDetail } from './doctor-profile-types';

// Admin F7 — logic thuần của màn hồ sơ bác sĩ (không DOM, không API). BS-42 (học vị điền sẵn), BS-05/BS-06 phía giao diện (kiểm sớm),
// BS-08 (đổi chi nhánh thì dịch vụ không có ở chi nhánh mới bị bỏ chọn), BS-10 (chuyên khoa đã ngừng vẫn giữ được), HSF-01 [đề xuất mã] (định dạng, lỗi).

const doctor: DoctorDetail = {
  taiKhoanId: '7',
  hoTen: 'Nguyễn Minh Anh',
  email: 'bs7@example.test',
  soDienThoai: '0900000007',
  ngaySinh: '1990-11-08',
  anhDaiDien: null,
  trangThaiTaiKhoan: 'DangHoatDong',
  chucDanh: 'ThS_BS',
  hocVi: 'ThS',
  soNamKinhNghiem: 8,
  moTaChuyenMon: 'Giới thiệu',
  chuyenKhoa: {
    chuyenKhoaId: '1',
    ten: 'Tim mạch',
    trangThaiHoatDong: 'DangHoatDong',
  },
  chiNhanh: { chiNhanhId: '5', ten: 'Chi nhánh Quận 3' },
  dichVuKham: { dichVuKhamId: '11', ten: 'Khám tim mạch' },
  giaMacDinh: '300000.00',
  phuPhi: '0.00',
  giaKham: '300000.00',
};
const branches: BranchOption[] = [
  {
    chiNhanhId: '5',
    ten: 'Quận 3',
    dichVuKham: [{ dichVuKhamId: '11', ten: 'Tim', giaMacDinh: '300000.00' }],
  },
  {
    chiNhanhId: '6',
    ten: 'Quận 1',
    dichVuKham: [{ dichVuKhamId: '12', ten: 'Nhi', giaMacDinh: '250000.00' }],
  },
  {
    chiNhanhId: '8',
    ten: 'Quận 7',
    dichVuKham: [{ dichVuKhamId: '11', ten: 'Tim', giaMacDinh: '300000.00' }],
  },
];

describe('BS-42 học vị điền sẵn theo chức danh', () => {
  it.each([
    ['BS', 'BS'],
    ['BS_CKI', 'BS'],
    ['BS_CKII', 'BS'],
    ['ThS_BS', 'ThS'],
    ['TS_BS', 'TS'],
    ['PGS_TS_BS', 'PGS'],
    ['GS_TS_BS', 'GS'],
  ] as const)('%s ⇒ %s', (title, degree) => {
    expect(withTitle(initialValues(doctor), title).hocVi).toBe(degree);
  });
});

describe('BS-08 đổi chi nhánh', () => {
  it('chi nhánh mới không có dịch vụ đang chọn ⇒ bỏ chọn; có ⇒ giữ', () => {
    const start = initialValues(doctor);
    expect(withBranch(start, '6', branches).dichVuKhamId).toBe('');
    expect(withBranch(start, '8', branches).dichVuKhamId).toBe('11');
  });
});

describe('BS-10 chuyên khoa đã ngừng', () => {
  it('chuyên khoa hiện tại không còn trong danh sách đang hoạt động ⇒ vẫn có trong ô chọn, đánh dấu ngừng', () => {
    const stopped: DoctorDetail = {
      ...doctor,
      chuyenKhoa: { ...doctor.chuyenKhoa, trangThaiHoatDong: 'NgungHoatDong' },
    };
    expect(
      specialtyChoices(stopped, [{ chuyenKhoaId: '2', ten: 'Nhi' }]),
    ).toEqual([
      { chuyenKhoaId: '1', ten: 'Tim mạch', ngungHoatDong: true },
      { chuyenKhoaId: '2', ten: 'Nhi' },
    ]);
    expect(
      specialtyChoices(doctor, [{ chuyenKhoaId: '1', ten: 'Tim mạch' }]),
    ).toHaveLength(1);
  });
});

describe('BS-05, BS-06 kiểm sớm trước khi gửi', () => {
  it('hợp lệ ⇒ thân gửi đúng kiểu; mô tả chỉ khoảng trắng ⇒ null (xoá)', () => {
    const result = validate({
      ...initialValues(doctor),
      moTaChuyenMon: '   ',
      soNamKinhNghiem: ' 12 ',
    });
    expect(result).toEqual({
      ok: true,
      input: {
        chucDanh: 'ThS_BS',
        hocVi: 'ThS',
        chuyenKhoaId: '1',
        dichVuKhamId: '11',
        soNamKinhNghiem: 12,
        moTaChuyenMon: null,
        chiNhanhId: '5',
      },
    });
  });

  it('kinh nghiệm 0 và 60 qua; -1, 1.5, 61, chữ, rỗng bị chặn', () => {
    for (const ok of ['0', '60'])
      expect(
        validate({ ...initialValues(doctor), soNamKinhNghiem: ok }).ok,
      ).toBe(true);
    for (const bad of ['-1', '1.5', '61', 'abc', ''])
      expect(
        validate({ ...initialValues(doctor), soNamKinhNghiem: bad }),
      ).toEqual({
        ok: false,
        fields: {
          soNamKinhNghiem: 'Số năm kinh nghiệm là số nguyên từ 0 đến 60.',
        },
      });
  });

  it('học vị lệch chức danh, chưa chọn học vị, chưa chọn dịch vụ, mô tả 5.001 ký tự ⇒ lỗi đúng ô', () => {
    const base = initialValues(doctor);
    expect(validate({ ...base, hocVi: 'GS' })).toMatchObject({
      ok: false,
      fields: { hocVi: 'Chức danh và học vị không tương thích.' },
    });
    expect(validate({ ...base, hocVi: '' })).toMatchObject({
      ok: false,
      fields: { hocVi: 'Vui lòng chọn học vị.' },
    });
    expect(validate({ ...base, dichVuKhamId: '' })).toMatchObject({
      ok: false,
      fields: { dichVuKhamId: 'Vui lòng chọn dịch vụ khám chính.' },
    });
    expect(
      validate({ ...base, moTaChuyenMon: 'a'.repeat(5001) }),
    ).toMatchObject({
      ok: false,
      fields: { moTaChuyenMon: 'Giới thiệu tối đa 5.000 ký tự.' },
    });
    expect(
      validate({ ...base, moTaChuyenMon: ` ${'a'.repeat(5000)} ` }).ok,
    ).toBe(true);
  });
});

describe('HSF-01 định dạng', () => {
  it('tên kèm chức danh, ngày, giờ, chữ cái đầu, trạng thái', () => {
    expect(displayName('ThS_BS', 'Nguyễn Minh Anh')).toBe(
      'ThS.BS. Nguyễn Minh Anh',
    );
    expect(displayName('BS_CKII', 'Trần Quốc Huy')).toBe(
      'BS.CKII Trần Quốc Huy',
    );
    expect(formatDate('1990-11-08')).toBe('08/11/1990');
    expect(formatDate(null)).toBe('—');
    expect(formatDateTime('2026-11-10 08:30:00')).toBe('08:30 10/11/2026');
    expect(initialsOf('Nguyễn Minh Anh')).toBe('MA');
    expect([
      statusLabel('DangHoatDong'),
      statusLabel('DangHoatDong', true),
      statusLabel('NgungHoatDong'),
      statusLabel('ChoKichHoat'),
    ]).toEqual(['Hoạt động', 'Đang hoạt động', 'Vô hiệu', 'Chờ kích hoạt']);
    expect(parseBlockingList({ lichHen: { items: [], tong: 0 } })).toBeNull();
  });
});

describe('HSF-01 lỗi khi lưu', () => {
  const blocking = {
    lichHen: {
      items: [
        {
          lichHenId: '1',
          maLichHen: 'LH1',
          thoiGian: '2026-11-10 08:30:00',
          trangThai: 'DaXacNhan',
        },
      ],
      tong: 1,
    },
    ca: { items: [], tong: 0 },
  };
  it('409 chặn ⇒ câu theo mã và danh sách; mã chặn dịch vụ có câu riêng', () => {
    const branch = describeSaveFailure(
      new ApiError(409, {
        maLoi: 'DOI_CHI_NHANH_BI_CHAN',
        thongBao: 'x',
        chiTiet: blocking,
      }),
    );
    expect(branch.message).toMatch(/^Không thể đổi chi nhánh/);
    expect(branch.blocking).toEqual(blocking);
    const service = describeSaveFailure(
      new ApiError(409, {
        maLoi: 'DOI_DICH_VU_CHINH_BI_CHAN',
        thongBao: 'x',
        chiTiet: blocking,
      }),
    );
    expect(service.message).toMatch(/^Không thể đổi dịch vụ khám chính/);
  });

  it('lỗi trường và lỗi nghiệp vụ gắn ô gắn đúng ô; 404 ⇒ notFound; mạng, hết hạn ⇒ chưa rõ kết quả', () => {
    expect(
      describeSaveFailure(
        new ApiError(400, {
          maLoi: 'DU_LIEU_KHONG_HOP_LE',
          thongBao: 'x',
          loi: [{ truong: 'chuyenKhoaId', ma: 'CHUYEN_KHOA_KHONG_HOP_LE' }],
        }),
      ).fields,
    ).toEqual({
      chuyenKhoaId: 'Chuyên khoa không tồn tại hoặc đã ngừng hoạt động.',
    });
    expect(
      describeSaveFailure(
        new ApiError(400, {
          maLoi: 'DICH_VU_KHONG_O_CHI_NHANH',
          thongBao: 'x',
        }),
      ).fields,
    ).toHaveProperty('dichVuKhamId');
    expect(
      describeSaveFailure(
        new ApiError(400, { maLoi: 'KHONG_CO_THAY_DOI', thongBao: 'x' }),
      ).message,
    ).toBe('Không có thay đổi nào để lưu.');
    expect(
      describeSaveFailure(
        new ApiError(404, { maLoi: 'KHONG_TIM_THAY', thongBao: 'x' }),
      ).notFound,
    ).toBe(true);
    for (const error of [new NetworkError(), new TimeoutError()])
      expect(describeSaveFailure(error).unknownResult).toBe(true);
  });
});
