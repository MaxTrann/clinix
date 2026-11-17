import { describe, expect, it } from 'vitest';
import { UnexpectedResponseError } from '../../../shared/api/errors';
import { day, NGAY, rawResponse, slot } from '../slots/testing/slot-fixtures';
import { parseDoctorSlots } from './slot-readers';

// search PR-C2, mã ca SLT-10 đến SLT-19: bộ đọc chặt của `GET /public/doctor-slots`. Hình dạng đúng như e2e KGC-43 của PR-C1.
const ok = (raw: unknown, ids = ['12']) => parseDoctorSlots(raw, NGAY, ids);
const reject = (raw: unknown, ids = ['12']) =>
  expect(() => parseDoctorSlots(raw, NGAY, ids)).toThrow(
    UnexpectedResponseError,
  );

describe('parseDoctorSlots', () => {
  it('SLT-10 phản hồi hợp lệ: đủ ba trạng thái ngày, bốn trạng thái ô, ba ca', () => {
    const raw = rawResponse(NGAY, [
      day('12', [
        slot('901', '08:00', 'ConTrong', 'CaSang'),
        slot('902', '08:30', 'DangGiuCho', 'CaSang'),
        slot('903', '13:30', 'DaDat', 'CaChieu'),
        slot('904', '14:00', 'HetHan', 'CaChieu'),
        slot('905', '18:00', 'ConTrong', 'CaToi'),
      ]),
      day('13', [], 'ChiNhanhNghi', 7),
      day('14', [], 'KhongCoLich'),
    ]);
    const result = ok(raw, ['12', '13', '14']);
    expect([...result.keys()]).toEqual(['12', '13', '14']);
    expect(result.get('12')?.khungGio.map((s) => s.trangThai)).toEqual([
      'ConTrong',
      'DangGiuCho',
      'DaDat',
      'HetHan',
      'ConTrong',
    ]);
    expect(result.get('12')?.khungGio.map((s) => s.ca)).toEqual([
      'CaSang',
      'CaSang',
      'CaChieu',
      'CaChieu',
      'CaToi',
    ]);
    expect(result.get('13')).toMatchObject({
      trangThaiNgay: 'ChiNhanhNghi',
      thuNghi: 7,
    });
    expect(result.get('14')?.trangThaiNgay).toBe('KhongCoLich');
  });

  it('SLT-11 thân không phải object, `items` không phải mảng, thiếu `ngay` ⇒ UnexpectedResponseError', () => {
    for (const raw of [
      null,
      undefined,
      'x',
      42,
      [],
      { ngay: NGAY },
      { ngay: NGAY, items: {} },
      { items: [day('12')] },
    ])
      reject(raw);
  });

  it('SLT-12 `ngay` của phản hồi khác ngày đã hỏi ⇒ lỗi (phản hồi muộn của ngày cũ không dùng được)', () => {
    reject(rawResponse('2026-11-19', [day('12')]));
    reject(rawResponse('2026-11-18T00:00:00Z', [day('12')]));
  });

  it('SLT-13 id là `number` ⇒ lỗi; id lớn hơn 2^53 giữ nguyên chuỗi', () => {
    reject({ ngay: NGAY, items: [{ ...day('12'), bacSiId: 12 }] });
    reject({
      ngay: NGAY,
      items: [
        day('12', [{ ...slot('901', '08:00'), khungGioId: 901 as never }]),
      ],
    });
    const big = '9223372036854775807';
    const result = ok(
      rawResponse(NGAY, [day('9007199254740993', [slot(big, '08:00')])]),
      ['9007199254740993'],
    );
    expect(result.get('9007199254740993')?.khungGio[0].khungGioId).toBe(big);
  });

  it('SLT-13 id sai dạng (số 0 đứng đầu, rỗng, chữ, âm, quá 19 chữ số) ⇒ lỗi', () => {
    for (const bad of ['012', '', 'abc', '-1', '12345678901234567890'])
      reject({ ngay: NGAY, items: [{ ...day('12'), bacSiId: bad }] }, [bad]);
    reject(
      rawResponse(NGAY, [
        day('12', [{ ...slot('901', '08:00'), khungGioId: '0' }]),
      ]),
    );
  });

  it('SLT-14 giá trị lạ của `trangThaiNgay`, `trangThai`, `ca` ⇒ lỗi (kể cả `NghiPhep`, đã gộp ở máy chủ)', () => {
    reject(
      rawResponse(NGAY, [{ ...day('12'), trangThaiNgay: 'NghiPhep' } as never]),
    );
    reject(
      rawResponse(NGAY, [
        day('12', [{ ...slot('901', '08:00'), trangThai: 'Khoa' } as never]),
      ]),
    );
    reject(
      rawResponse(NGAY, [
        day('12', [{ ...slot('901', '08:00'), ca: 'CaDem' } as never]),
      ]),
    );
  });

  it('SLT-15 `khungGio` thiếu hoặc không phải mảng ⇒ lỗi', () => {
    reject({ ngay: NGAY, items: [{ bacSiId: '12', trangThaiNgay: 'CoLich' }] });
    reject({ ngay: NGAY, items: [{ ...day('12'), khungGio: null }] });
  });

  it('SLT-16 `ChiNhanhNghi` thiếu hoặc `thuNghi` ngoài 1 đến 7 / không nguyên ⇒ lỗi; `thuNghi` của trạng thái khác bị bỏ', () => {
    reject(rawResponse(NGAY, [day('12', [], 'ChiNhanhNghi')]));
    for (const bad of [0, 8, 1.5, '7', null])
      reject({
        ngay: NGAY,
        items: [{ ...day('12', [], 'ChiNhanhNghi'), thuNghi: bad }],
      });
    const result = ok({
      ngay: NGAY,
      items: [{ ...day('12', [], 'KhongCoLich'), thuNghi: 7 }],
    });
    expect(result.get('12')).not.toHaveProperty('thuNghi');
  });

  it('SLT-17 `batDau`, `ketThuc` không phải ISO UTC ⇒ lỗi', () => {
    for (const bad of [
      '2026-11-18 09:30',
      '09:30',
      'khong',
      1790000000000,
      null,
    ])
      reject(
        rawResponse(NGAY, [
          day('12', [{ ...slot('901', '08:00'), batDau: bad } as never]),
        ]),
      );
    reject(
      rawResponse(NGAY, [
        day('12', [
          { ...slot('901', '08:00'), ketThuc: '2026-13-45T00:00:00.000Z' },
        ]),
      ]),
    );
  });

  it('SLT-18 khoá thừa (ví dụ `giuChoDen`, `lichHenId`) bị BỎ, không lọt vào kết quả', () => {
    // Thân thô có khoá mà kiểu `PublicSlot` không có: viết thẳng, không đi qua `day()`
    const raw: unknown = {
      ngay: NGAY,
      items: [
        {
          ...day('12'),
          khungGio: [
            {
              ...slot('901', '08:00'),
              giuChoDen: '2026-11-18T00:15:00Z',
              lichHenId: '5',
            },
          ],
          lyDo: 'Việc gia đình',
        },
      ],
    };
    const result = ok(raw);
    expect(JSON.stringify([...result.values()])).not.toMatch(
      /giuChoDen|lichHenId|lyDo|Việc gia đình/,
    );
    expect(Object.keys(result.get('12')?.khungGio[0] ?? {}).sort()).toEqual([
      'batDau',
      'ca',
      'ketThuc',
      'khungGioId',
      'trangThai',
    ]);
  });

  it('SLT-19 mỗi id đã hỏi đúng MỘT phần tử: thiếu, thừa, trùng ⇒ lỗi; thứ tự phần tử không quan trọng', () => {
    reject(rawResponse(NGAY, [day('12')]), ['12', '13']);
    reject(rawResponse(NGAY, [day('12'), day('13')]), ['12']);
    reject(rawResponse(NGAY, [day('12'), day('12')]), ['12']);
    expect([
      ...ok(rawResponse(NGAY, [day('13'), day('12')]), ['12', '13']).keys(),
    ]).toEqual(['13', '12']);
  });
});
