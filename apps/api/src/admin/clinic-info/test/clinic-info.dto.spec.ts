import 'reflect-metadata';
import { ValidationPipe, type Type } from '@nestjs/common';
import { validationExceptionFactory } from '../../../common/errors/validation-exception.js';
import { UpdateClinicInfoDto } from '../clinic-info.dto.js';

const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
  exceptionFactory: validationExceptionFactory,
});
const parse = <T>(metatype: Type<T>, value: unknown) =>
  pipe.transform(value, { type: 'body', metatype });

const valid = {
  tenThuongHieu: 'CLINIX',
  diaChiTruSo: '12 Đường Mẫu, TP. Hồ Chí Minh',
  duongDayNong: '1900 1234',
  email: 'Support@example.com',
};
const maxLengthEmail = `${'a'.repeat(64)}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(58)}.com`;
const overMaxLengthEmail = `${'a'.repeat(64)}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(63)}.com`;

describe('B4 DTO — PK-03…PK-06', () => {
  it('PK-03: chuẩn hóa email theo auth S5 và từ chối email sai', async () => {
    await expect(
      parse(UpdateClinicInfoDto, {
        ...valid,
        email: ' \tSupport@EXAMPLE.COM\r\n',
      }),
    ).resolves.toMatchObject({ email: 'Support@example.com' });
    expect(maxLengthEmail).toHaveLength(255);
    await expect(
      parse(UpdateClinicInfoDto, { ...valid, email: maxLengthEmail }),
    ).resolves.toMatchObject({ email: maxLengthEmail });

    for (const email of [
      'support desk@example.com',
      'hỗtrợ@example.com',
      overMaxLengthEmail,
      'not-an-email',
    ]) {
      await expect(
        parse(UpdateClinicInfoDto, { ...valid, email }),
      ).rejects.toMatchObject({ maLoi: 'DU_LIEU_KHONG_HOP_LE' });
    }
  });

  it('PK-04: chuẩn hóa hotline và nhận cả số di động lẫn tổng đài', async () => {
    for (const [duongDayNong, normalized] of [
      ['1900 1234', '19001234'],
      ['1800.1234', '18001234'],
      ['0901234567', '0901234567'],
      ['090 123 4567', '0901234567'],
      ['090-123-4567', '0901234567'],
    ]) {
      await expect(
        parse(UpdateClinicInfoDto, { ...valid, duongDayNong }),
      ).resolves.toMatchObject({ duongDayNong: normalized });
    }

    for (const duongDayNong of ['12345', '0123', 'abc', '1'.repeat(21)]) {
      await expect(
        parse(UpdateClinicInfoDto, { ...valid, duongDayNong }),
      ).rejects.toMatchObject({ maLoi: 'DU_LIEU_KHONG_HOP_LE' });
    }
  });

  it('PK-05/06: yêu cầu đủ bốn trường và giới hạn tên/địa chỉ', async () => {
    for (const [field, value] of [
      ['tenThuongHieu', '   '],
      ['diaChiTruSo', ''],
      ['duongDayNong', ''],
      ['email', ''],
      ['tenThuongHieu', 'x'.repeat(101)],
      ['diaChiTruSo', 'x'.repeat(256)],
    ] as const) {
      await expect(
        parse(UpdateClinicInfoDto, { ...valid, [field]: value }),
      ).rejects.toMatchObject({ maLoi: 'DU_LIEU_KHONG_HOP_LE' });
    }

    await expect(
      parse(UpdateClinicInfoDto, {
        ...valid,
        tenThuongHieu: ` ${'x'.repeat(100)} `,
        diaChiTruSo: ` ${'y'.repeat(255)} `,
      }),
    ).resolves.toMatchObject({
      tenThuongHieu: 'x'.repeat(100),
      diaChiTruSo: 'y'.repeat(255),
    });
  });

  it('PK-05: từ chối thiếu trường và field ngoài contract', async () => {
    for (const field of Object.keys(valid) as (keyof typeof valid)[]) {
      const missing = { ...valid } as Record<string, string>;
      delete missing[field];
      await expect(parse(UpdateClinicInfoDto, missing)).rejects.toThrow();
    }
    await expect(
      parse(UpdateClinicInfoDto, { ...valid, id: 1 }),
    ).rejects.toThrow();
  });
});
