import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { vi } from 'vitest';
import type { AppException } from '../../../common/errors/app.exception.js';
import { validationExceptionFactory } from '../../../common/errors/validation-exception.js';
import { BranchAccessPolicy } from '../../../rbac/branch-access.policy.js';
import { CHUC_DANH_BAC_SI, HOC_VI_BAC_SI } from '../../entities/enums.js';
import { isCompatibleTitleDegree } from '../../staff-accounts/staff-account-rules.js';
import {
  DOCTOR_DESCRIPTION_MAX_LENGTH,
  UpdateDoctorProfileDto,
} from '../doctor.dto.js';
import type { DoctorRepository } from '../doctor.repository.js';
import type { DoctorUpdateRepository } from '../doctor-update.repository.js';
import { DoctorUpdateService } from '../doctor-update.service.js';
import type { AuditService } from '../../../audit/audit.service.js';

// Admin B13 — kiểm dữ liệu vào của sửa hồ sơ bác sĩ. Đơn vị, không DB. BS-03, BS-04, BS-05, BS-06; HSS-01 [đề xuất mã] (trường lạ, id sai).
const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
  exceptionFactory: validationExceptionFactory,
});
const parse = (body: unknown) =>
  pipe.transform(body, {
    type: 'body',
    metatype: UpdateDoctorProfileDto,
  }) as Promise<UpdateDoctorProfileDto>;
const valid = {
  chuyenKhoaId: '1',
  chiNhanhId: '2',
  dichVuKhamId: '3',
  chucDanh: 'ThS_BS',
  hocVi: 'ThS',
  soNamKinhNghiem: 5,
};
const fieldCodes = async (body: unknown) => {
  try {
    await parse(body);
  } catch (error) {
    const response = (error as { getResponse(): unknown }).getResponse() as {
      maLoi: string;
      loi: { truong: string; ma: string }[];
    };
    return response.loi.map((l) => `${l.truong}:${l.ma}`);
  }
  throw new Error('mong đợi lỗi kiểm dữ liệu');
};

describe('BS-04 trường bắt buộc', () => {
  it.each([
    ['chuyenKhoaId', 'CHUYEN_KHOA_KHONG_HOP_LE'],
    ['chiNhanhId', 'CHI_NHANH_KHONG_HOP_LE'],
    ['dichVuKhamId', 'DICH_VU_KHAM_ID_KHONG_HOP_LE'],
    ['chucDanh', 'CHUC_DANH_KHONG_HOP_LE'],
    ['hocVi', 'HOC_VI_KHONG_HOP_LE'],
    ['soNamKinhNghiem', 'SO_NAM_KINH_NGHIEM_KHONG_HOP_LE'],
  ])('thiếu %s ⇒ 400 %s (không tự thành BS hay 0, H8)', async (key, code) => {
    const body: Record<string, unknown> = { ...valid };
    delete body[key];
    expect(await fieldCodes(body)).toEqual([`${key}:${code}`]);
    expect(await fieldCodes({ ...valid, [key]: null })).toEqual([
      `${key}:${code}`,
    ]);
  });
});

describe('BS-05 số năm kinh nghiệm', () => {
  it('0 và 60 qua; âm, 1,5, chuỗi, 61 bị từ chối', async () => {
    await expect(
      parse({ ...valid, soNamKinhNghiem: 0 }),
    ).resolves.toBeDefined();
    await expect(
      parse({ ...valid, soNamKinhNghiem: 60 }),
    ).resolves.toBeDefined();
    for (const value of [-1, 1.5, '5', 61])
      expect(await fieldCodes({ ...valid, soNamKinhNghiem: value })).toEqual([
        'soNamKinhNghiem:SO_NAM_KINH_NGHIEM_KHONG_HOP_LE',
      ]);
  });
});

describe('BS-03 mô tả chuyên môn', () => {
  it('bỏ trường ⇒ undefined (giữ nguyên); null, rỗng, chỉ khoảng trắng ⇒ null (xoá); có chữ ⇒ trim', async () => {
    expect((await parse(valid)).moTaChuyenMon).toBeUndefined();
    for (const value of [null, '', '   '])
      expect(
        (await parse({ ...valid, moTaChuyenMon: value })).moTaChuyenMon,
      ).toBeNull();
    expect(
      (await parse({ ...valid, moTaChuyenMon: '  Nội tổng quát  ' }))
        .moTaChuyenMon,
    ).toBe('Nội tổng quát');
  });

  it('biên 5.000 ký tự sau trim qua; 5.001 hay không phải chuỗi bị từ chối', async () => {
    const max = 'a'.repeat(DOCTOR_DESCRIPTION_MAX_LENGTH);
    await expect(
      parse({ ...valid, moTaChuyenMon: `  ${max}  ` }),
    ).resolves.toBeDefined();
    for (const value of [`${max}a`, 12])
      expect(await fieldCodes({ ...valid, moTaChuyenMon: value })).toEqual([
        'moTaChuyenMon:MO_TA_CHUYEN_MON_KHONG_HOP_LE',
      ]);
  });
});

describe('HSS-01 id sai và trường lạ', () => {
  it('id không phải chuỗi số dương ⇒ 400; họ tên, email, trạng thái gửi lên ⇒ 400 (không sửa ở đây)', async () => {
    expect(await fieldCodes({ ...valid, chiNhanhId: 2 })).toEqual([
      'chiNhanhId:CHI_NHANH_KHONG_HOP_LE',
    ]);
    expect(await fieldCodes({ ...valid, dichVuKhamId: '0' })).toEqual([
      'dichVuKhamId:DICH_VU_KHAM_ID_KHONG_HOP_LE',
    ]);
    for (const extra of [
      { hoTen: 'X' },
      { email: 'a@b.c' },
      { trangThai: 'NgungHoatDong' },
    ])
      expect((await fieldCodes({ ...valid, ...extra })).length).toBe(1);
  });
});

describe('BS-06 ma trận 7 chức danh × 5 học vị', () => {
  it('đúng 7 tổ hợp tương thích', () => {
    const ok = CHUC_DANH_BAC_SI.flatMap((t) =>
      HOC_VI_BAC_SI.filter((d) => isCompatibleTitleDegree(t, d)).map(
        (d) => `${t}/${d}`,
      ),
    );
    expect(ok).toEqual([
      'BS/BS',
      'BS_CKI/BS',
      'BS_CKII/BS',
      'ThS_BS/ThS',
      'TS_BS/TS',
      'PGS_TS_BS/PGS',
      'GS_TS_BS/GS',
    ]);
  });

  it('không tương thích ⇒ 400 CHUC_DANH_HOC_VI_KHONG_TUONG_THICH trước khi mở giao dịch', async () => {
    const transaction = vi.fn();
    const service = new DoctorUpdateService(
      { transaction } as unknown as DoctorUpdateRepository,
      {} as DoctorRepository,
      new BranchAccessPolicy(),
      {} as AuditService,
    );
    const dto = Object.assign(new UpdateDoctorProfileDto(), {
      ...valid,
      chucDanh: 'GS_TS_BS',
      hocVi: 'BS',
    });
    const error = (await service
      .update({ kind: 'ToanHeThong' }, '1', '9', dto)
      .catch((e: unknown) => e)) as AppException;
    expect(error.maLoi).toBe('CHUC_DANH_HOC_VI_KHONG_TUONG_THICH');
    expect(transaction).not.toHaveBeenCalled();
  });
});
