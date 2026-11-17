import 'reflect-metadata';
import { ValidationPipe, type Type } from '@nestjs/common';
import type {
  AppException,
  ErrorBody,
} from '../../../common/errors/app.exception.js';
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
        giaMacDinh: '1',
      }),
    ).toMatchObject({
      nhomDichVuId: '9007199254740993',
      ten: 'Khám tổng quát',
      thoiLuong: 30,
      giaMacDinh: '1',
    });
    // PR3-A01: giá chỉ là số nguyên đồng; biên nhỏ nhất 1, biên lớn nhất 10 chữ số 9
    for (const giaMacDinh of ['1', '150000', '9999999999'])
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
    ['deposit field', { mucDatCoc: '0.00' }],
    ['refund policy field', { chinhSachHoan: [] }],
  ])('DV-08/09/10/11/18: từ chối %s', async (_label, extra) => {
    await expect(
      parse(CreateServiceDto, {
        nhomDichVuId: '1',
        ten: 'Mẫu',
        thoiLuong: 30,
        giaMacDinh: '100000',
        ...extra,
      }),
    ).rejects.toMatchObject({ maLoi: 'DU_LIEU_KHONG_HOP_LE' });
  });

  it('DV-09/10/11: PATCH chỉ kiểm trường có gửi và không ép kiểu', async () => {
    await expect(
      parse(UpdateServiceDto, { ten: ' Tên mới ', giaMacDinh: '250000' }),
    ).resolves.toMatchObject({ ten: 'Tên mới', giaMacDinh: '250000' });
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

  // PR3-A08 (bài học K3): MySQL tự ép chuỗi như '1abc' hay ' 2' về số, nên id phải bị DTO chặn TRƯỚC khi tới câu SQL
  it.each(['1abc', ' 2', '2 ', '1e0', '3.0', '1.5', 'x', '', '+1', '0x1'])(
    'PR3-A08: ID dịch vụ %j không qua DTO',
    async (id) => {
      await expect(parse(ServiceIdDto, { id })).rejects.toThrow();
    },
  );
});

// PR3-A01: giá chỉ là số nguyên đồng, kiểm bằng CÙNG một bảng cho tạo và sửa.
describe('PR3 DTO giá số nguyên — PR3-A01', () => {
  const body = { nhomDichVuId: '1', ten: 'Mẫu', thoiLuong: 30 };
  // Lỗi thật của DTO: maLoi cấp trên là DU_LIEU_KHONG_HOP_LE, mã của ô nằm ở loi[].ma (web đọc ở catalog-errors.ts)
  const failureOf = async (
    metatype: Type<CreateServiceDto | UpdateServiceDto>,
    giaMacDinh: unknown,
  ) => {
    try {
      await parse(metatype, { ...body, giaMacDinh });
    } catch (error) {
      return error as AppException;
    }
    return null;
  };

  it.each(['1', '9', '150000', '1000000', '9999999999'])(
    'PR3-A01: nhận giá %j ở cả tạo và sửa, giữ nguyên chuỗi',
    async (giaMacDinh) => {
      await expect(
        parse(CreateServiceDto, { ...body, giaMacDinh }),
      ).resolves.toMatchObject({ giaMacDinh });
      await expect(
        parse(UpdateServiceDto, { giaMacDinh }),
      ).resolves.toMatchObject({ giaMacDinh });
    },
  );

  it.each<[string, unknown]>([
    ['rỗng', ''],
    ['không', '0'],
    ['số 0 đứng đầu "007"', '007'],
    ['số 0 đứng đầu "0001"', '0001'],
    ['số 0 đứng đầu "0150000"', '0150000'],
    ['phần lẻ "1.5"', '1.5'],
    ['phần lẻ "1.50"', '1.50'],
    ['".00" ở cuối', '150000.00'],
    ['phần lẻ nhỏ nhất "0.01"', '0.01'],
    ['biên cũ "9999999999.99"', '9999999999.99'],
    ['dấu phẩy "1,5"', '1,5'],
    ['dấu chấm ngăn nghìn "150.000"', '150.000'],
    ['dấu cách đầu', ' 150000'],
    ['dấu cách cuối', '150000 '],
    ['xuống dòng cuối', '150000\n'],
    ['chữ đứng trước', 'x150000'],
    ['chữ đứng sau', '150000x'],
    ['dạng khoa học "1e5"', '1e5'],
    ['dấu cộng', '+5'],
    ['số âm', '-5'],
    ['chữ thuần', 'abc'],
    ['chữ số không phải ASCII', '١٢٣'],
    ['11 chữ số', '10000000000'],
    ['số JSON', 150000],
    ['null', null],
    ['mảng', ['150000']],
  ])('PR3-A01: từ chối giá %s ở cả tạo và sửa', async (_label, giaMacDinh) => {
    for (const metatype of [CreateServiceDto, UpdateServiceDto]) {
      const failure = await failureOf(metatype, giaMacDinh);
      expect(failure, metatype.name).not.toBeNull();
      expect(failure!.maLoi).toBe('DU_LIEU_KHONG_HOP_LE');
      expect((failure!.getResponse() as ErrorBody).loi).toContainEqual({
        truong: 'giaMacDinh',
        ma: 'GIA_MAC_DINH_KHONG_HOP_LE',
      });
    }
  });

  it('PR3-A01: sửa mà KHÔNG gửi giá thì hợp lệ (không bắt nhập lại giá)', async () => {
    await expect(
      parse(UpdateServiceDto, { ten: 'Tên mới' }),
    ).resolves.toMatchObject({ ten: 'Tên mới' });
  });
});
