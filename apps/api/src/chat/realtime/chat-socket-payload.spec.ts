import { parseSendPayload } from './chat-socket-payload.js';

// chat B5 — SOC-05 (phần đọc gói, PLAN chat 5.7): cùng luật DTO của REST (trường lạ bị từ chối), đúng một đích kiểu chuỗi. Luật nội dung do lõi kiểm (ca e2e).
describe('chat B5 — đọc gói chat:gui', () => {
  it('SOC-05: gói đúng với từng loại đích ⇒ lấy đúng đích, chuyển nguyên `noiDung`, `maGui` cho lõi', () => {
    expect(
      parseSendPayload({ hoiThoaiId: '7', noiDung: 'x', maGui: 'm' }),
    ).toEqual({
      ok: true,
      target: { hoiThoaiId: '7' },
      noiDung: 'x',
      maGui: 'm',
    });
    expect(parseSendPayload({ bacSiId: '3', noiDung: 1 })).toEqual({
      ok: true,
      target: { bacSiId: '3' },
      noiDung: 1,
      maGui: undefined,
    });
    expect(parseSendPayload({ chiNhanhId: '2' })).toMatchObject({
      ok: true,
      target: { chiNhanhId: '2' },
    });
  });

  it('SOC-05: trường lạ (kể cả `taiKhoanId`, `nguoiGuiId`) ⇒ TRUONG_KHONG_DUOC_PHEP cho từng trường', () => {
    expect(
      parseSendPayload({
        hoiThoaiId: '7',
        noiDung: 'x',
        maGui: 'm',
        taiKhoanId: '1',
        nguoiGuiId: '2',
      }),
    ).toEqual({
      ok: false,
      loi: [
        { truong: 'taiKhoanId', ma: 'TRUONG_KHONG_DUOC_PHEP' },
        { truong: 'nguoiGuiId', ma: 'TRUONG_KHONG_DUOC_PHEP' },
      ],
    });
  });

  it('SOC-05 (biên): không đích, hai đích, đích không phải chuỗi ⇒ DICH_KHONG_HOP_LE', () => {
    const bad = {
      ok: false,
      loi: [{ truong: 'dich', ma: 'DICH_KHONG_HOP_LE' }],
    };
    expect(parseSendPayload({ noiDung: 'x' })).toEqual(bad);
    expect(parseSendPayload({ hoiThoaiId: '1', bacSiId: '2' })).toEqual(bad);
    expect(parseSendPayload({ hoiThoaiId: 7 })).toEqual(bad);
    expect(parseSendPayload({ hoiThoaiId: null })).toEqual(bad);
    // Khoá có mà giá trị `undefined` coi như không gửi
    expect(
      parseSendPayload({ hoiThoaiId: '1', bacSiId: undefined }),
    ).toMatchObject({ ok: true, target: { hoiThoaiId: '1' } });
  });

  it('SOC-05 (âm): gói không phải đối tượng thuần (null, mảng, chuỗi, số, đối tượng có prototype lạ) ⇒ GOI_TIN_KHONG_HOP_LE', () => {
    const bad = {
      ok: false,
      loi: [{ truong: 'goiTin', ma: 'GOI_TIN_KHONG_HOP_LE' }],
    };
    for (const payload of [
      undefined,
      null,
      [],
      'chuoi',
      42,
      new Date(),
      Object.create({ hoiThoaiId: '1' }) as unknown,
    ])
      expect(parseSendPayload(payload)).toEqual(bad);
  });
});
