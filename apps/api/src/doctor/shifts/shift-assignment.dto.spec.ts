import 'reflect-metadata';
import { ValidationPipe, type HttpException } from '@nestjs/common';
import { validationExceptionFactory } from '../../common/errors/validation-exception.js';
import type { ErrorBody } from '../../common/errors/app.exception.js';
import { ShiftRuleDto } from './shift-assignment.dto.js';

// Doctor B2 — DTO: PC-11 (CaToi), PC-15 (ngày không thật), BD-01 (trường lạ), M9 (mảng trong thân).
const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
  exceptionFactory: validationExceptionFactory,
});
const valid = {
  bacSiIds: ['1', '2'],
  tuNgay: '2026-12-07',
  denNgay: '2026-12-21',
  thuTrongTuan: [1, 3],
  cas: ['CaSang', 'CaChieu'],
};
const parse = (value: unknown) =>
  pipe.transform(value, { type: 'body', metatype: ShiftRuleDto });
async function errorsOf(value: unknown) {
  try {
    await parse(value);
  } catch (error) {
    const body = (error as HttpException).getResponse() as ErrorBody;
    expect(body.maLoi).toBe('DU_LIEU_KHONG_HOP_LE');
    // Một trường có thể có nhiều mã, thứ tự không có nghĩa ⇒ so như tập hợp (TRACKING M9).
    return new Set((body.loi ?? []).map((e) => `${e.truong}:${e.ma}`));
  }
  throw new Error('phải bị từ chối');
}

describe('ShiftRuleDto', () => {
  it('nhận thân hợp lệ', async () => {
    expect(await parse(valid)).toMatchObject(valid);
  });

  it('PC-11 CaToi bị từ chối bằng CA_KHONG_HOP_LE; cas rỗng/thiếu/trùng cũng vậy', async () => {
    for (const cas of [['CaToi'], ['CaSang', 'CaToi'], []])
      expect(await errorsOf({ ...valid, cas }), JSON.stringify(cas)).toContain(
        'cas:CA_KHONG_HOP_LE',
      );
    expect(await errorsOf({ ...valid, cas: ['CaSang', 'CaSang'] })).toContain(
      'cas:ARRAY_UNIQUE',
    );
    const { cas: _bo, ...thieu } = valid;
    expect(await errorsOf(thieu)).toContain('cas:CA_KHONG_HOP_LE');
  });

  it('bacSiIds: 1–20 chuỗi số dương duy nhất; số JSON, 0, số thập phân, trùng, 21 phần tử đều bị từ chối', async () => {
    const cases: unknown[] = [
      [],
      [1],
      ['0'],
      ['01'],
      ['1.5'],
      ['abc'],
      Array.from({ length: 21 }, (_, i) => String(i + 1)),
      '1',
    ];
    for (const bacSiIds of cases)
      expect(
        await errorsOf({ ...valid, bacSiIds }),
        JSON.stringify(bacSiIds),
      ).toContain('bacSiIds:BAC_SI_KHONG_HOP_LE');
    // Trùng lặp nhận mã ARRAY_UNIQUE của class-validator (đã ghi ở TRACKING M9).
    expect(await errorsOf({ ...valid, bacSiIds: ['1', '1'] })).toContain(
      'bacSiIds:ARRAY_UNIQUE',
    );
    expect(
      await parse({
        ...valid,
        bacSiIds: Array.from({ length: 20 }, (_, i) => String(i + 1)),
      }),
    ).toBeDefined();
  });

  it('ngày phải là ngày lịch có thật dạng YYYY-MM-DD', async () => {
    for (const tuNgay of [
      '2026-02-30',
      '2026-12-7',
      '07/12/2026',
      20261207,
      '',
    ])
      expect(await errorsOf({ ...valid, tuNgay })).toContain(
        'tuNgay:NGAY_KHONG_HOP_LE',
      );
    expect(await errorsOf({ ...valid, denNgay: undefined })).toContain(
      'denNgay:NGAY_KHONG_HOP_LE',
    );
  });

  it('thuTrongTuan: số nguyên 1–7, không rỗng, không trùng', async () => {
    for (const thuTrongTuan of [[], [0], [8], [1.5], ['1']])
      expect(
        await errorsOf({ ...valid, thuTrongTuan }),
        JSON.stringify(thuTrongTuan),
      ).toContain('thuTrongTuan:THU_KHONG_HOP_LE');
    expect(await errorsOf({ ...valid, thuTrongTuan: [1, 1] })).toContain(
      'thuTrongTuan:ARRAY_UNIQUE',
    );
  });

  it('BD-01 trường lạ (kể cả chiNhanhId, PC-02) ⇒ TRUONG_KHONG_DUOC_PHEP', async () => {
    expect(await errorsOf({ ...valid, chiNhanhId: '1' })).toContain(
      'chiNhanhId:TRUONG_KHONG_DUOC_PHEP',
    );
  });
});
