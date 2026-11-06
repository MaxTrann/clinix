import { lowestStartingPrice } from './starting-price.js';

// B2 — TCK-07: giá khám từ + cọc của dịch vụ đó.
const opt = (giaKham: string, mucDatCoc: string) => ({
  price: { phuPhi: '0.00', giaKham },
  mucDatCoc,
});

describe('B2 — lowestStartingPrice', () => {
  it('TCK-07: 300.000 và 350.000 ⇒ 300.000 kèm cọc của đúng dịch vụ đó', () => {
    expect(
      lowestStartingPrice([
        opt('350000.00', '70000.00'),
        opt('300000.00', '50000.00'),
      ]),
    ).toEqual({ giaKham: '300000.00', mucDatCoc: '50000.00' });
  });

  it('không có bác sĩ ⇒ null', () => {
    expect(lowestStartingPrice([])).toBeNull();
  });

  it('trùng giá ⇒ lấy cọc thấp hơn, không phụ thuộc thứ tự', () => {
    const a = opt('300000.00', '80000.00');
    const b = opt('300000.00', '20000.00');
    const expected = { giaKham: '300000.00', mucDatCoc: '20000.00' };
    expect(lowestStartingPrice([a, b])).toEqual(expected);
    expect(lowestStartingPrice([b, a])).toEqual(expected);
  });

  it('so tiền bằng số nguyên: 99999.99 nhỏ hơn 100000.00', () => {
    expect(
      lowestStartingPrice([opt('100000.00', '0.00'), opt('99999.99', '0.00')])
        ?.giaKham,
    ).toBe('99999.99');
  });
});
