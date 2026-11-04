import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { flattenValidationErrors } from '../../common/errors/validation-exception.js';
import { PublicQueryDto } from './public-query.dto.js';

const parse = (plain: Record<string, unknown>) =>
  plainToInstance(PublicQueryDto, plain);
const errorsOf = (dto: PublicQueryDto) =>
  flattenValidationErrors(validateSync(dto));

describe('P1 — PublicQueryDto (q 0–100, escape)', () => {
  it('không có q: hợp lệ, không có mẫu LIKE', () => {
    const dto = parse({});
    expect(errorsOf(dto)).toEqual([]);
    expect(dto.likePattern).toBeNull();
  });

  it('biên: q đúng 100 ký tự hợp lệ, 101 ký tự bị từ chối', () => {
    expect(errorsOf(parse({ q: 'a'.repeat(100) }))).toEqual([]);
    expect(errorsOf(parse({ q: 'a'.repeat(101) }))).toEqual([
      { truong: 'q', ma: 'TU_KHOA_KHONG_HOP_LE' },
    ]);
  });

  it('cắt khoảng trắng hai đầu trước khi đếm; chuỗi toàn khoảng trắng coi như không có từ khoá', () => {
    expect(parse({ q: `  ${'a'.repeat(100)}  ` }).q).toHaveLength(100);
    expect(parse({ q: '   ' }).likePattern).toBeNull();
  });

  it('q không phải chuỗi (mảng) bị từ chối', () => {
    expect(errorsOf(parse({ q: ['a', 'b'] }))).toEqual([
      { truong: 'q', ma: 'TU_KHOA_KHONG_HOP_LE' },
    ]);
  });

  it('BMS-03: ký tự đặc biệt của LIKE được escape, SQL injection chỉ là chữ thường', () => {
    expect(parse({ q: '50%_!' }).likePattern).toBe('%50!%!_!!%');
    expect(parse({ q: "' OR 1=1 --" }).likePattern).toBe("%' OR 1=1 --%");
  });

  it('kế thừa phân trang: mặc định trang 1, cỡ 20; cỡ trang 101 bị từ chối', () => {
    const dto = parse({});
    expect([dto.page, dto.pageSize, dto.offset]).toEqual([1, 20, 0]);
    expect(errorsOf(parse({ pageSize: '101' })).map((e) => e.truong)).toEqual([
      'pageSize',
    ]);
  });
});
