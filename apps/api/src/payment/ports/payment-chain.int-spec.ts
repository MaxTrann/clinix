import type { DataSource } from 'typeorm';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { paymentWorld } from '../testing/payment-world.js';
import { PaymentChain, PaymentChainError } from './payment-chain.js';

// payment P4 — PaymentChain.rootOf trên MySQL 8.4 THẬT (E13). Mã PCH-nn là `[đề xuất]` (xem payment-chain.spec.ts).
let db: DataSource;
useIntegrationHooks((d) => {
  db = d;
});
const chain = new PaymentChain();

describe('PCH-02 rootOf trên dữ liệu thật', () => {
  it('lịch không đổi lần nào ⇒ chính nó', async () => {
    const w = await paymentWorld(db);
    const lich = await w.appointment(0);
    expect(await chain.rootOf(db.manager, lich.lichHenId)).toBe(lich.lichHenId);
  });

  it('chuỗi hai lịch: hỏi lịch mới hay lịch cũ đều ra lịch gốc', async () => {
    const w = await paymentWorld(db);
    const [goc, moi] = await w.chain(2);
    expect(await chain.rootOf(db.manager, moi!.lichHenId)).toBe(goc!.lichHenId);
    expect(await chain.rootOf(db.manager, goc!.lichHenId)).toBe(goc!.lichHenId);
  });

  it('chuỗi ba lịch: hỏi lịch giữa và lịch cuối đều ra lịch gốc', async () => {
    const w = await paymentWorld(db);
    const [goc, giua, cuoi] = await w.chain(3);
    expect(await chain.rootOf(db.manager, cuoi!.lichHenId)).toBe(
      goc!.lichHenId,
    );
    expect(await chain.rootOf(db.manager, giua!.lichHenId)).toBe(
      goc!.lichHenId,
    );
  });

  it('lịch không tồn tại ⇒ null (không ném lỗi)', async () => {
    await paymentWorld(db);
    expect(await chain.rootOf(db.manager, '987654321')).toBeNull();
  });

  it('chuỗi của hai Bệnh nhân khác nhau không lẫn: mỗi chuỗi ra gốc của chính nó', async () => {
    const w = await paymentWorld(db);
    const [gocA, moiA] = await w.chain(2);
    const lichB = await w.appointment(5);
    expect(await chain.rootOf(db.manager, moiA!.lichHenId)).toBe(
      gocA!.lichHenId,
    );
    expect(await chain.rootOf(db.manager, lichB.lichHenId)).toBe(
      lichB.lichHenId,
    );
  });

  it('vòng dữ liệu hỏng (cũ ↔ mới) ⇒ ném PaymentChainError, không treo', async () => {
    const w = await paymentWorld(db);
    const [goc, moi] = await w.chain(2);
    await w.fixtures.linkPrevious(goc!.lichHenId, moi!.lichHenId);
    await expect(chain.rootOf(db.manager, moi!.lichHenId)).rejects.toThrow(
      PaymentChainError,
    );
  });

  it('lịch tự trỏ chính nó ⇒ ném PaymentChainError', async () => {
    const w = await paymentWorld(db);
    const lich = await w.appointment(0);
    await w.fixtures.linkPrevious(lich.lichHenId, lich.lichHenId);
    await expect(chain.rootOf(db.manager, lich.lichHenId)).rejects.toThrow(
      /vòng/,
    );
  });

  it('chạy trong giao dịch của người gọi: thấy dữ liệu chưa commit của chính giao dịch đó', async () => {
    const w = await paymentWorld(db);
    const [, moi] = await w.chain(2);
    await db.transaction(async (em) => {
      await em.query(
        'UPDATE lich_hen SET lich_hen_truoc_id = NULL WHERE lich_hen_id = ?',
        [moi!.lichHenId],
      );
      // trong giao dịch, `moi` đã tách khỏi chuỗi nên là gốc của chính nó
      expect(await chain.rootOf(em, moi!.lichHenId)).toBe(moi!.lichHenId);
    });
  });
});
