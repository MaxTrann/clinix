import {
  MAX_CHAIN_DEPTH,
  PaymentChainError,
  resolveRoot,
} from './payment-chain.js';

// payment P4 — PaymentChain (E13). Mã PCH-nn là `[đề xuất]`: PLAN payment chưa gán mã riêng cho truy vấn lịch gốc (ca "chuỗi 2 lịch" của HDT-02 làm ở B2).
// Phần hàm thuần: chọn lịch gốc từ các hàng truy vấn đệ quy (từ lịch hỏi đi NGƯỢC về lịch cũ). Phần SQL thật: payment-chain.int-spec.ts.
const row = (id: string, truoc: string | null) => ({
  lichHenId: id,
  lichHenTruocId: truoc,
});

describe('PCH-01 resolveRoot', () => {
  it('không có hàng nào (lịch không tồn tại) ⇒ null', () => {
    expect(resolveRoot([])).toBeNull();
  });

  it('một lịch không có lịch trước ⇒ chính nó là gốc', () => {
    expect(resolveRoot([row('7', null)])).toBe('7');
  });

  it('chuỗi ba lịch (hỏi lịch cuối) ⇒ lịch cũ nhất', () => {
    expect(resolveRoot([row('9', '8'), row('8', '7'), row('7', null)])).toBe(
      '7',
    );
  });

  it('vòng dữ liệu hỏng (a → b → a) ⇒ ném lỗi CYCLE, không lặp vô hạn', () => {
    const run = () =>
      resolveRoot([row('1', '2'), row('2', '1'), row('1', '2')]);
    expect(run).toThrow(PaymentChainError);
    expect(run).toThrow(/vòng/);
  });

  it('lịch tự trỏ chính nó ⇒ lỗi CYCLE', () => {
    expect(() => resolveRoot([row('5', '5'), row('5', '5')])).toThrow(/vòng/);
  });

  it('chuỗi vượt giới hạn độ sâu mà vẫn chưa tới gốc ⇒ lỗi TOO_DEEP', () => {
    const rows = Array.from({ length: MAX_CHAIN_DEPTH + 1 }, (_unused, i) =>
      row(String(i + 1), String(i + 2)),
    );
    expect(() => resolveRoot(rows)).toThrow(PaymentChainError);
    expect(() => resolveRoot(rows)).toThrow(/sâu/);
  });

  it('biên: chuỗi dài đúng giới hạn và có gốc ⇒ vẫn trả gốc', () => {
    const rows = Array.from({ length: MAX_CHAIN_DEPTH + 1 }, (_unused, i) =>
      row(String(i + 1), i === MAX_CHAIN_DEPTH ? null : String(i + 2)),
    );
    expect(resolveRoot(rows)).toBe(String(MAX_CHAIN_DEPTH + 1));
  });

  it('lỗi mang mã ổn định để nơi gọi phân biệt', () => {
    try {
      resolveRoot([row('1', '1'), row('1', '1')]);
    } catch (error) {
      expect(error).toBeInstanceOf(PaymentChainError);
      expect((error as PaymentChainError).code).toBe('CHAIN_CYCLE');
    }
  });
});
