import 'reflect-metadata';
import { ValidationPipe, type Type } from '@nestjs/common';
import { validationExceptionFactory } from '../../../common/errors/validation-exception.js';
import { DoctorIdDto, DoctorListDto } from '../doctor.dto.js';

// Admin B12 — HSB-02: kiểm dữ liệu vào của danh sách và chi tiết hồ sơ bác sĩ. Đơn vị, không DB.
const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
  exceptionFactory: validationExceptionFactory,
});
const parse = <T>(metatype: Type<T>, value: unknown) =>
  pipe.transform(value, { type: 'query', metatype }) as Promise<T>;

describe('HSB-02 DoctorListDto', () => {
  it('mặc định trang 1, 20 dòng; id giữ dạng chuỗi (không mất chính xác bigint)', async () => {
    const dto = await parse(DoctorListDto, {
      chuyenKhoaId: '9007199254740993',
      chiNhanhId: '7',
    });
    expect(dto).toMatchObject({
      page: 1,
      pageSize: 20,
      chuyenKhoaId: '9007199254740993',
      chiNhanhId: '7',
    });
  });

  it('từ khoá được trim; rỗng hay toàn khoảng trắng coi như không lọc', async () => {
    expect((await parse(DoctorListDto, { q: '  Nguyễn  ' })).q).toBe('Nguyễn');
    expect((await parse(DoctorListDto, { q: '   ' })).q).toBeUndefined();
    expect((await parse(DoctorListDto, { q: '' })).q).toBeUndefined();
  });

  it('biên: từ khoá 100 ký tự qua, 101 ký tự bị từ chối', async () => {
    await expect(
      parse(DoctorListDto, { q: 'a'.repeat(100) }),
    ).resolves.toBeDefined();
    await expect(
      parse(DoctorListDto, { q: 'a'.repeat(101) }),
    ).rejects.toMatchObject({
      status: 400,
    });
  });

  it('biên: pageSize 100 qua, 101 và 0 bị từ chối; page 0 bị từ chối', async () => {
    await expect(
      parse(DoctorListDto, { pageSize: '100' }),
    ).resolves.toMatchObject({
      pageSize: 100,
    });
    for (const query of [{ pageSize: '101' }, { pageSize: '0' }, { page: '0' }])
      await expect(parse(DoctorListDto, query)).rejects.toMatchObject({
        status: 400,
      });
  });

  it.each(['0', '-1', '1.5', 'abc', '9223372036854775808', '01'])(
    'ca âm: chuyenKhoaId / chiNhanhId = %s bị từ chối',
    async (bad) => {
      await expect(
        parse(DoctorListDto, { chuyenKhoaId: bad }),
      ).rejects.toMatchObject({
        status: 400,
      });
      await expect(
        parse(DoctorListDto, { chiNhanhId: bad }),
      ).rejects.toMatchObject({
        status: 400,
      });
    },
  );

  it('tham số lạ bị từ chối (không lọc ngầm theo trạng thái)', async () => {
    await expect(
      parse(DoctorListDto, { trangThai: 'DangHoatDong' }),
    ).rejects.toMatchObject({
      status: 400,
    });
  });
});

describe('HSB-02 DoctorIdDto', () => {
  it('id hợp lệ qua; biên bigint lớn nhất qua, vượt thì bị từ chối', async () => {
    expect((await parse(DoctorIdDto, { id: '12' })).id).toBe('12');
    await expect(
      parse(DoctorIdDto, { id: '9223372036854775807' }),
    ).resolves.toBeDefined();
    for (const id of ['0', 'x', '9223372036854775808'])
      await expect(parse(DoctorIdDto, { id })).rejects.toMatchObject({
        status: 400,
      });
  });
});
