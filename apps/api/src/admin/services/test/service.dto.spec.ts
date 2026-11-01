import 'reflect-metadata';
import { ValidationPipe, type Type } from '@nestjs/common';
import { validationExceptionFactory } from '../../../common/errors/validation-exception.js';
import {
  CreateServiceDto,
  ServiceIdDto,
  ServiceListDto,
  UpdateServiceDto,
} from '../service.dto.js';

const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
  exceptionFactory: validationExceptionFactory,
});
const parse = <T>(metatype: Type<T>, value: unknown) =>
  pipe.transform(value, { type: 'body', metatype });

describe('B3 DTO — DV-07…11, DV-18', () => {
  it('DV-07/09/10/11: chuẩn hóa tên và giữ bigint/decimal dạng chuỗi', async () => {
    expect(
      await parse(CreateServiceDto, {
        nhomDichVuId: '9007199254740993',
        ten: '  Khám\t tổng\nquát ',
        thoiLuong: 30,
        giaMacDinh: '0.01',
      }),
    ).toMatchObject({
      nhomDichVuId: '9007199254740993',
      ten: 'Khám tổng quát',
      thoiLuong: 30,
      giaMacDinh: '0.01',
    });
    for (const giaMacDinh of ['9999999999.99', '100', '100.5', '0001.20'])
      await expect(
        parse(CreateServiceDto, {
          nhomDichVuId: '1',
          ten: 'Mẫu',
          thoiLuong: 1,
          giaMacDinh,
        }),
      ).resolves.toMatchObject({ giaMacDinh });
  });

  it.each([
    ['group id number', { nhomDichVuId: 1 }],
    ['group id zero', { nhomDichVuId: '0' }],
    ['group id overflow', { nhomDichVuId: '9223372036854775808' }],
    ['empty name', { ten: '  ' }],
    ['long name', { ten: 'a'.repeat(101) }],
    ['duration zero', { thoiLuong: 0 }],
    ['duration fraction', { thoiLuong: 30.5 }],
    ['duration string', { thoiLuong: '30' }],
    ['duration overflow', { thoiLuong: 2147483648 }],
    ['price zero', { giaMacDinh: '0.00' }],
    ['price negative', { giaMacDinh: '-1.00' }],
    ['price too large', { giaMacDinh: '10000000000.00' }],
    ['price scale', { giaMacDinh: '100.001' }],
    ['price number', { giaMacDinh: 100 }],
    ['deposit field', { mucDatCoc: '0.00' }],
    ['refund policy field', { chinhSachHoan: [] }],
  ])('DV-08/09/10/11/18: từ chối %s', async (_label, extra) => {
    await expect(
      parse(CreateServiceDto, {
        nhomDichVuId: '1',
        ten: 'Mẫu',
        thoiLuong: 30,
        giaMacDinh: '100.00',
        ...extra,
      }),
    ).rejects.toMatchObject({ maLoi: 'DU_LIEU_KHONG_HOP_LE' });
  });

  it('DV-09/10/11: PATCH chỉ kiểm trường có gửi và không ép kiểu', async () => {
    await expect(
      parse(UpdateServiceDto, { ten: ' Tên mới ', giaMacDinh: '250.00' }),
    ).resolves.toMatchObject({ ten: 'Tên mới', giaMacDinh: '250.00' });
    for (const body of [
      { ten: null },
      { nhomDichVuId: null },
      { thoiLuong: null },
      { giaMacDinh: null },
      { mucDatCoc: '0.00' },
      { chinhSachHoan: {} },
    ])
      await expect(parse(UpdateServiceDto, body)).rejects.toMatchObject({
        maLoi: 'DU_LIEU_KHONG_HOP_LE',
      });
  });

  it('DV-07/16: kiểm phân trang, query và ID bigint', async () => {
    await expect(
      parse(ServiceListDto, { q: '  Khám  ' }),
    ).resolves.toMatchObject({ page: 1, pageSize: 20, q: 'Khám' });
    for (const query of [
      { page: 0 },
      { pageSize: 101 },
      { q: 'a'.repeat(201) },
      { q: null },
      { chiNhanhId: '1' },
    ])
      await expect(parse(ServiceListDto, query)).rejects.toThrow();
    for (const id of ['1', '9007199254740993', '9223372036854775807'])
      await expect(parse(ServiceIdDto, { id })).resolves.toMatchObject({ id });
    for (const id of ['0', '-1', '01', '9223372036854775808', 1])
      await expect(parse(ServiceIdDto, { id })).rejects.toThrow();
  });
});
