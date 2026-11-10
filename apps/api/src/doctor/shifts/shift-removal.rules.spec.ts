import { checkRemovable } from './shift-removal.rules.js';

// Doctor B4 — luật thuần của gỡ ca: PC-23 (ca đã qua), PC-22 (đã/từng có lịch hẹn), PC-19 (gỡ được).
const TODAY = '2026-12-07';
const base = {
  ngay: TODAY,
  today: TODAY,
  slots: ['ConTrong', 'ConTrong'] as const,
  soLichHenThamChieu: 0,
};

describe('checkRemovable', () => {
  it('PC-19 mọi ô ConTrong và chưa lịch hẹn nào tham chiếu ⇒ gỡ được', () => {
    expect(checkRemovable(base)).toEqual({ ok: true });
  });

  it('PC-19 ca chưa có khung giờ nào (ca rỗng) vẫn gỡ được', () => {
    expect(checkRemovable({ ...base, slots: [] })).toEqual({ ok: true });
  });

  it('PC-23 biên: ca HÔM NAY gỡ được; ca hôm qua ⇒ CA_DA_QUA', () => {
    expect(checkRemovable({ ...base, ngay: TODAY })).toEqual({ ok: true });
    expect(checkRemovable({ ...base, ngay: '2026-12-06' })).toEqual({
      ok: false,
      maLoi: 'CA_DA_QUA',
    });
  });

  it('PC-23 ca đã qua được báo trước (ca đã qua và có lịch hẹn vẫn là CA_DA_QUA)', () => {
    expect(
      checkRemovable({
        ...base,
        ngay: '2026-12-01',
        slots: ['DaDat'],
        soLichHenThamChieu: 1,
      }),
    ).toEqual({ ok: false, maLoi: 'CA_DA_QUA' });
  });

  it('PC-22 ô DaDat, DangGiuCho (kể cả đã hết hạn chưa quét), HetHan ⇒ CA_DANG_CO_LICH_HEN', () => {
    for (const state of ['DaDat', 'DangGiuCho', 'HetHan'] as const)
      expect(checkRemovable({ ...base, slots: ['ConTrong', state] })).toEqual({
        ok: false,
        maLoi: 'CA_DANG_CO_LICH_HEN',
      });
  });

  it('PC-22 mọi ô ConTrong nhưng từng có lịch hẹn (kể cả đã huỷ) tham chiếu ⇒ CA_DANG_CO_LICH_HEN', () => {
    expect(checkRemovable({ ...base, soLichHenThamChieu: 1 })).toEqual({
      ok: false,
      maLoi: 'CA_DANG_CO_LICH_HEN',
    });
  });
});
