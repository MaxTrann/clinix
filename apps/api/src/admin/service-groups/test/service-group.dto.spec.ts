import 'reflect-metadata';
import { ValidationPipe, type Type } from '@nestjs/common';
import { validationExceptionFactory } from '../../../common/errors/validation-exception.js';
import {
  CreateServiceGroupDto,
  UpdateServiceGroupDto,
  ServiceGroupIdDto,
  ServiceGroupListDto,
} from '../service-group.dto.js';

const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
  exceptionFactory: validationExceptionFactory,
});
const parse = <T>(metatype: Type<T>, value: unknown) =>
  pipe.transform(value, { type: 'body', metatype });

describe('B2 DTO — DV-01/02/04/16', () => {
  it('DV-01/02: chuẩn hóa trước giới hạn tên, giữ dấu', async () => {
    expect(
      await parse(CreateServiceGroupDto, { ten: '  Khám\t chuyên\n khoa ' }),
    ).toMatchObject({ ten: 'Khám chuyên khoa' });
    expect(
      await parse(CreateServiceGroupDto, { ten: ` ${'a'.repeat(100)} ` }),
    ).toMatchObject({ ten: 'a'.repeat(100) });
  });
  it.each(['', '  ', 'a'.repeat(101), null, 123, [], undefined])(
    'DV-02: tên sai %#',
    async (ten) => {
      await expect(parse(CreateServiceGroupDto, { ten })).rejects.toMatchObject(
        { maLoi: 'DU_LIEU_KHONG_HOP_LE' },
      );
      if (ten !== undefined)
        await expect(parse(UpdateServiceGroupDto, { ten })).rejects.toThrow();
    },
  );
  it.each([-1, 1.5, 2147483648, null, '0', true, []])(
    'DV-01/04: thứ tự sai %#',
    async (thuTuHienThi) => {
      await expect(
        parse(CreateServiceGroupDto, { ten: 'Mẫu', thuTuHienThi }),
      ).rejects.toThrow();
      await expect(
        parse(UpdateServiceGroupDto, { thuTuHienThi }),
      ).rejects.toThrow();
    },
  );
  it('DV-01/04: thứ tự biên và bỏ trường PATCH', async () => {
    for (const thuTuHienThi of [0, 2147483647])
      expect(
        await parse(UpdateServiceGroupDto, { thuTuHienThi }),
      ).toMatchObject({ thuTuHienThi });
    expect(
      await parse(UpdateServiceGroupDto, { ten: 'Giữ thứ tự' }),
    ).toMatchObject({ ten: 'Giữ thứ tự' });
  });
  it('DV-16: từ chối trường ngoài contract ở cả create/update/query', async () => {
    for (const extra of [
      { trangThaiHoatDong: 'DangHoatDong' },
      { nhomDichVuId: '1' },
      { phamVi: 'ToanHeThong' },
      { mucDatCoc: 0 },
    ]) {
      await expect(
        parse(CreateServiceGroupDto, { ten: 'Mẫu', ...extra }),
      ).rejects.toThrow();
      await expect(
        parse(UpdateServiceGroupDto, { ...extra }),
      ).rejects.toThrow();
    }
    await expect(
      parse(ServiceGroupListDto, { chiNhanhId: '1' }),
    ).rejects.toThrow();
  });
  it('DV-16: paging, q trim/giới hạn/kiểu', async () => {
    expect(await parse(ServiceGroupListDto, { q: ' Mẫu ' })).toMatchObject({
      page: 1,
      pageSize: 20,
      q: 'Mẫu',
    });
    for (const value of [
      { page: 0 },
      { pageSize: 101 },
      { q: 'a'.repeat(201) },
      { q: ['a', 'b'] },
      { q: null },
    ])
      await expect(parse(ServiceGroupListDto, value)).rejects.toThrow();
  });
  it('DV-04/05: ID bigint đúng miền, không chuyển number', async () => {
    for (const id of ['1', '9007199254740993', '9223372036854775807'])
      expect(await parse(ServiceGroupIdDto, { id })).toMatchObject({ id });
    for (const id of ['0', '-1', '01', '1.5', 'x', '9223372036854775808', 1])
      await expect(parse(ServiceGroupIdDto, { id })).rejects.toThrow();
  });
});
