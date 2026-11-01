import 'reflect-metadata';
import { ValidationPipe, type Type } from '@nestjs/common';
import { validationExceptionFactory } from '../../../common/errors/validation-exception.js';
import { BranchIdDto, BranchListDto, CreateBranchDto } from '../branch.dto.js';

const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
  exceptionFactory: validationExceptionFactory,
});
const parse = <T>(metatype: Type<T>, value: unknown) =>
  pipe.transform(value, { type: 'body', metatype });
const validSchedule = () =>
  Array.from({ length: 7 }, (_, index) => ({
    thuTrongTuan: index + 1,
    hoatDong: true,
    sang: { batDau: '08:00', ketThuc: '12:00' },
  }));

describe('B7 DTO — CN-11/12, PQ', () => {
  it('chuẩn hóa tên/địa chỉ, giữ ID và toạ độ dạng chuỗi', async () => {
    const dto = (await parse(CreateBranchDto, {
      ten: '  Chi nhánh\tA ',
      diaChi: ' Đường 1  ',
      toaDoLat: '-90.0000000',
      toaDoLng: '+180',
      lichHoatDong: validSchedule(),
      dichVuKhamIds: ['9007199254740993'],
    })) as CreateBranchDto;
    expect(dto).toMatchObject({
      ten: 'Chi nhánh A',
      diaChi: 'Đường 1',
      toaDoLat: '-90.0000000',
      toaDoLng: '+180',
      dichVuKhamIds: ['9007199254740993'],
    });
  });

  it.each([
    { toaDoLat: 10, toaDoLng: '20' },
    { toaDoLat: '90.00000001', toaDoLng: '0' },
    { toaDoLat: '0', toaDoLng: '180.0000001' },
    { toaDoLat: '1.12345678', toaDoLng: '2' },
    { toaDoLat: null, toaDoLng: '2' },
  ])('CN-11: từ chối toạ độ sai %#', async (coordinates) => {
    await expect(
      parse(CreateBranchDto, {
        ten: 'Chi nhánh',
        diaChi: 'Địa chỉ',
        ...coordinates,
        lichHoatDong: validSchedule(),
        dichVuKhamIds: [],
      }),
    ).rejects.toMatchObject({ maLoi: 'DU_LIEU_KHONG_HOP_LE' });
  });

  it('CN-11/12: từ chối tên/địa chỉ rỗng, quá dài và ID dịch vụ sai', async () => {
    for (const body of [
      { ten: '', diaChi: 'Địa chỉ' },
      { ten: 'a'.repeat(101), diaChi: 'Địa chỉ' },
      { ten: 'Chi nhánh', diaChi: ' '.repeat(256) },
      { ten: 'Chi nhánh', diaChi: 'a'.repeat(256) },
    ])
      await expect(
        parse(CreateBranchDto, {
          ...body,
          lichHoatDong: validSchedule(),
          dichVuKhamIds: [],
        }),
      ).rejects.toMatchObject({ maLoi: 'DU_LIEU_KHONG_HOP_LE' });
    for (const id of ['0', '01', '-1', '9223372036854775808', 1])
      await expect(
        parse(CreateBranchDto, {
          ten: 'Chi nhánh',
          diaChi: 'Địa chỉ',
          lichHoatDong: validSchedule(),
          dichVuKhamIds: [id],
        }),
      ).rejects.toMatchObject({ maLoi: 'DU_LIEU_KHONG_HOP_LE' });
  });

  it('từ chối field lạ ở body, lịch, khoảng giờ và query', async () => {
    const base = {
      ten: 'Chi nhánh',
      diaChi: 'Địa chỉ',
      lichHoatDong: validSchedule(),
      dichVuKhamIds: [],
    };
    for (const body of [
      { ...base, phamVi: 'ToanHeThong' },
      {
        ...base,
        lichHoatDong: [
          { ...validSchedule()[0], unknown: true },
          ...validSchedule().slice(1),
        ],
      },
      {
        ...base,
        lichHoatDong: [
          {
            ...validSchedule()[0],
            sang: { batDau: '08:00', ketThuc: '12:00', unknown: true },
          },
          ...validSchedule().slice(1),
        ],
      },
    ])
      await expect(parse(CreateBranchDto, body)).rejects.toMatchObject({
        maLoi: 'DU_LIEU_KHONG_HOP_LE',
      });
    for (const query of [
      { page: 0 },
      { pageSize: 101 },
      { q: 'x'.repeat(201) },
      { q: null },
      { chiNhanhId: '1' },
    ])
      await expect(parse(BranchListDto, query)).rejects.toMatchObject({
        maLoi: 'DU_LIEU_KHONG_HOP_LE',
      });
  });

  it('PQ: cắt khoảng trắng từ q và kiểm ID bigint dạng chuỗi', async () => {
    expect(await parse(BranchListDto, { q: ' Chi nhánh ' })).toMatchObject({
      page: 1,
      pageSize: 20,
      q: 'Chi nhánh',
    });
    for (const id of ['1', '9007199254740993', '9223372036854775807'])
      expect(await parse(BranchIdDto, { id })).toMatchObject({ id });
    for (const id of ['0', '01', 'x', '9223372036854775808'])
      await expect(parse(BranchIdDto, { id })).rejects.toMatchObject({
        maLoi: 'DU_LIEU_KHONG_HOP_LE',
      });
  });
});
