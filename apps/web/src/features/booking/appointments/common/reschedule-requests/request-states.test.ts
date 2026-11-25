import { describe, expect, it } from 'vitest';
import { notApprovableMessage, slotStateMessage } from './request-states';

// reschedule F4, WXD-49…WXD-51 (`[đề xuất]`; PLAN reschedule 5.7, 5.13; chữ `[đề xuất]`, Q13): câu hiển thị chọn theo MÃ (`lyDoKhongDuyet`, `khungGioMongMuon.trangThai`), KHÔNG theo `thongBao` và KHÔNG
// bao giờ in mã thô ra màn hình. Hàm thuần.
const KNOWN_CODES = [
  'LICH_HEN_KHONG_CHO_DOI',
  'LICH_HEN_DA_QUA_GIO',
  'HO_SO_NGUOI_THAN_DA_NGUNG',
  'CHUOI_DOI_LICH_QUA_DAI',
  'HE_THONG_CHUA_CAU_HINH',
] as const;

describe('câu cho yêu cầu không duyệt được', () => {
  it('WXD-49 mỗi mã trong năm mã có câu RIÊNG, không in mã thô và nhắc "vẫn có thể từ chối" (R6: từ chối luôn được)', () => {
    const sentences = KNOWN_CODES.map(notApprovableMessage);
    expect(new Set(sentences).size).toBe(KNOWN_CODES.length);
    KNOWN_CODES.forEach((code, index) => {
      expect(sentences[index]).not.toContain(code);
      expect(sentences[index]).toMatch(/không thể duyệt|chưa thể duyệt/);
      expect(sentences[index]).toContain('Bạn vẫn có thể từ chối.');
    });
  });

  it.each([
    'YEU_CAU_DA_XU_LY',
    'KHONG_TIM_THAY',
    'MA_MOI_CUA_TUONG_LAI',
    '',
    'constructor',
    '__proto__',
    'toString',
    'hasOwnProperty',
  ])('WXD-50 mã %j không có câu riêng ⇒ câu chung, không in mã', (code) => {
    const sentence = notApprovableMessage(code);
    expect(sentence).toBe(
      'Chưa thể duyệt yêu cầu này. Bạn vẫn có thể từ chối.',
    );
    if (code !== '') expect(sentence).not.toContain(code);
  });
});

describe('câu cho trạng thái khung giờ mong muốn', () => {
  it('WXD-51 bốn trạng thái, bốn câu khác nhau, không in mã thô', () => {
    const states = ['ConTrong', 'DangGiuCho', 'DaDat', 'HetHan'] as const;
    const sentences = states.map(slotStateMessage);
    expect(new Set(sentences).size).toBe(4);
    states.forEach((state, index) => {
      expect(sentences[index]).not.toContain(state);
    });
    expect(slotStateMessage('ConTrong')).toBe(
      'Khung giờ mong muốn hiện còn trống.',
    );
    expect(slotStateMessage('DaDat')).toContain(
      'chọn khung giờ khác hoặc từ chối',
    );
  });
});
