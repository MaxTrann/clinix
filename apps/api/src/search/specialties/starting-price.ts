import { toCents } from '../../pricing/money.js';
import type { ExamPrice } from '../pricing/exam-price.reader.js';

/** "Giá khám từ X · cọc Y" của chuyên khoa (Q9). */
export interface StartingPrice {
  giaKham: string;
  mucDatCoc: string;
}

/**
 * Giá áp dụng THẤP NHẤT trong các bác sĩ công khai, kèm mức cọc của dịch vụ của bác sĩ đó (Q9, TCK-07).
 * Trùng giá thì lấy cọc thấp hơn để kết quả không phụ thuộc thứ tự đọc. Không có bác sĩ ⇒ `null`.
 * So sánh bằng số nguyên (BigInt, đơn vị 0,01), không dùng số thực (H4).
 */
export function lowestStartingPrice(
  options: readonly { price: ExamPrice; mucDatCoc: string }[],
): StartingPrice | null {
  let best: { cents: bigint; coc: bigint; value: StartingPrice } | null = null;
  for (const { price, mucDatCoc } of options) {
    const cents = toCents(price.giaKham);
    const coc = toCents(mucDatCoc);
    if (
      !best ||
      cents < best.cents ||
      (cents === best.cents && coc < best.coc)
    ) {
      best = { cents, coc, value: { giaKham: price.giaKham, mucDatCoc } };
    }
  }
  return best ? best.value : null;
}
