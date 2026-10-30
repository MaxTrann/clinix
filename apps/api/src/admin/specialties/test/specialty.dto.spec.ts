import 'reflect-metadata';
import { ValidationPipe, type Type } from '@nestjs/common';
import { validationExceptionFactory } from '../../../common/errors/validation-exception.js';
import {
  CreateSpecialtyDto,
  UpdateSpecialtyDto,
  SpecialtyListDto,
  SpecialtySearchDto,
  SpecialtyStatusDto,
  SpecialtyIdDto,
} from '../specialty.dto.js';

const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
  exceptionFactory: validationExceptionFactory,
});
const parse = <T>(metatype: Type<T>, value: unknown) =>
  pipe.transform(value, { type: 'body', metatype });

describe('B1 DTO — CK-02/12/17, SE-A10', () => {
  it('CK-02: trim/gộp khoảng trắng trước kiểm tên và giữ dấu', async () => {
    expect(
      await parse(CreateSpecialtyDto, { ten: '  Tim\t mạch\n ' }),
    ).toMatchObject({ ten: 'Tim mạch' });
    expect(
      await parse(CreateSpecialtyDto, { ten: ` ${'a'.repeat(100)} ` }),
    ).toMatchObject({ ten: 'a'.repeat(100) });
  });
  it.each(['', '   ', 'a'.repeat(101), null, 123, ['Tim mạch']])(
    'CK-02: từ chối tên không hợp lệ %#',
    async (ten) => {
      await expect(parse(CreateSpecialtyDto, { ten })).rejects.toMatchObject({
        maLoi: 'DU_LIEU_KHONG_HOP_LE',
      });
    },
  );
  it('CK-02: tạo thiếu tên và sửa tên null đều bị từ chối, bỏ tên khi sửa được', async () => {
    await expect(parse(CreateSpecialtyDto, {})).rejects.toThrow();
    await expect(parse(UpdateSpecialtyDto, { ten: null })).rejects.toThrow();
    expect(await parse(UpdateSpecialtyDto, { moTa: null })).toMatchObject({
      moTa: null,
    });
  });
  it('CK-12: mô tả rỗng/null/5000 hợp lệ, 5001 hoặc sai kiểu bị từ chối', async () => {
    for (const moTa of ['', null, 'ạ'.repeat(5000)])
      await expect(
        parse(CreateSpecialtyDto, { ten: 'Mẫu', moTa }),
      ).resolves.toMatchObject({ moTa });
    for (const moTa of ['ạ'.repeat(5001), 1, []])
      await expect(parse(UpdateSpecialtyDto, { moTa })).rejects.toThrow();
  });
  it('CK-11/13: không nhận URL, scope/actor hoặc trạng thái ngoài route status', async () => {
    for (const extra of [
      { anhDaiDien: 'https://example.test/x' },
      { accountId: '2' },
      { phamVi: 'ToanHeThong' },
      { trangThaiHoatDong: 'NgungHoatDong' },
    ])
      await expect(
        parse(CreateSpecialtyDto, { ten: 'Mẫu', ...extra }),
      ).rejects.toThrow();
    for (const imageUploadId of [null, 'b68ea783-f8bf-4abd-8074-4303941036c8'])
      await expect(
        parse(UpdateSpecialtyDto, { imageUploadId }),
      ).resolves.toMatchObject({ imageUploadId });
    await expect(
      parse(UpdateSpecialtyDto, { imageUploadId: 'x' }),
    ).rejects.toThrow();
  });
  it('CK-08/09: status bắt buộc enum đúng, không nhận toggle/null', async () => {
    for (const trangThaiHoatDong of ['DangHoatDong', 'NgungHoatDong'])
      await expect(
        parse(SpecialtyStatusDto, { trangThaiHoatDong }),
      ).resolves.toBeDefined();
    for (const value of [
      {},
      { trangThaiHoatDong: null },
      { trangThaiHoatDong: true },
    ])
      await expect(parse(SpecialtyStatusDto, value)).rejects.toThrow();
  });
  it('CK-17: paging mặc định, q trim; kiểm enum, giới hạn q và trường lạ', async () => {
    expect(await parse(SpecialtyListDto, { q: ' Tim ' })).toMatchObject({
      q: 'Tim',
      page: 1,
      pageSize: 20,
    });
    for (const value of [
      { q: 'a'.repeat(201) },
      { q: ['x', 'y'] },
      { trangThaiHoatDong: 'x' },
      { page: 0 },
      { pageSize: 101 },
      { chiNhanhId: '1' },
    ])
      await expect(parse(SpecialtyListDto, value)).rejects.toThrow();
    await expect(
      parse(SpecialtySearchDto, { trangThaiHoatDong: 'NgungHoatDong' }),
    ).rejects.toThrow();
  });
  it('CK-13/14: id bigint string đúng miền, không ép Number làm mất độ chính xác', async () => {
    for (const id of ['1', '9007199254740993', '9223372036854775807'])
      expect(await parse(SpecialtyIdDto, { id })).toMatchObject({ id });
    for (const id of [
      '0',
      '-1',
      '1.2',
      '1e3',
      '01',
      '9223372036854775808',
      'x',
      1,
    ])
      await expect(parse(SpecialtyIdDto, { id })).rejects.toThrow();
  });
});
