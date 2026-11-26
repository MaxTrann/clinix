import {
  checkSendInput,
  codePointLength,
  contentError,
  normalizeContent,
  normalizeSendId,
} from './chat-content.rules.js';

const ID = '3f2b8c1e-9d4a-4b7e-8f21-0a1b2c3d4e5f';

describe('chat B1 — luật nội dung và mã gửi (hàm thuần)', () => {
  it('LOI-01: cắt khoảng trắng hai đầu, CRLF và CR thành LF, chuẩn hoá NFC; xuống dòng ở giữa giữ nguyên', () => {
    expect(normalizeContent('  \r\n Xin chào\r\nbác sĩ\rạ \t\n')).toBe(
      'Xin chào\nbác sĩ\nạ',
    );
    // "ệ" viết tổ hợp (e + dấu mũ + dấu nặng) thành MỘT điểm mã dựng sẵn
    const decomposed = 'Bệnh';
    expect(normalizeContent(decomposed)).toBe('Bệnh');
    expect(codePointLength(normalizeContent(decomposed))).toBe(4);
  });

  it.each([
    ['rỗng', ''],
    ['toàn khoảng trắng', '    \t  '],
    ['toàn xuống dòng', '\n\r\n\r\n'],
  ])('LOI-03: %s, không tệp ⇒ NOI_DUNG_TRONG', (_name, raw) => {
    expect(contentError(normalizeContent(raw))).toBe('NOI_DUNG_TRONG');
    expect(checkSendInput(raw, ID)).toEqual({
      ok: false,
      loi: [{ truong: 'noiDung', ma: 'NOI_DUNG_TRONG' }],
    });
  });

  it('LOI-03: nội dung không phải chuỗi ⇒ NOI_DUNG_TRONG; tin có tệp được phép không có chữ (B4)', () => {
    expect(checkSendInput(undefined, ID)).toEqual({
      ok: false,
      loi: [{ truong: 'noiDung', ma: 'NOI_DUNG_TRONG' }],
    });
    expect(checkSendInput(42, ID).ok).toBe(false);
    expect(contentError('', true)).toBeNull();
  });

  it('LOI-04: 2000 điểm mã nhận, 2001 thì NOI_DUNG_QUA_DAI; emoji ngoài BMP tính MỘT điểm mã', () => {
    expect(contentError('a'.repeat(2000))).toBeNull();
    expect(contentError('a'.repeat(2001))).toBe('NOI_DUNG_QUA_DAI');
    const emoji = '😀'.repeat(2000); // 4000 đơn vị UTF-16
    expect(emoji.length).toBe(4000);
    expect(contentError(emoji)).toBeNull();
    expect(contentError(`${emoji}a`)).toBe('NOI_DUNG_QUA_DAI');
  });

  it.each([
    ['NUL', 'a\u0000b'],
    ['BEL', 'a\u0007b'],
    ['ESC', 'a\u001Bb'],
    ['DEL', 'a\u007Fb'],
    ['C1', 'a\u0085b'],
  ])('LOI-05: ký tự điều khiển %s ⇒ NOI_DUNG_KY_TU_KHONG_HOP_LE', (_n, raw) => {
    expect(contentError(normalizeContent(raw))).toBe(
      'NOI_DUNG_KY_TU_KHONG_HOP_LE',
    );
  });

  it('LOI-05: `\\n` và `\\t` ở giữa được phép (ca biên)', () => {
    expect(contentError('dòng 1\n\tdòng 2')).toBeNull();
  });

  it.each([
    ['thiếu', undefined],
    ['rỗng', ''],
    ['không phải chuỗi', 123],
    ['thiếu một ký tự', ID.slice(1)],
    ['ký tự ngoài hex', ID.replace('3f', 'zz')],
    ['không gạch nối', ID.replaceAll('-', '')],
  ])('LOI-06: maGui %s ⇒ MA_GUI_KHONG_HOP_LE', (_n, value) => {
    expect(normalizeSendId(value)).toBeNull();
    expect(checkSendInput('Chào', value)).toEqual({
      ok: false,
      loi: [{ truong: 'maGui', ma: 'MA_GUI_KHONG_HOP_LE' }],
    });
  });

  it('LOI-06: maGui hợp lệ được đổi về chữ thường; hai trường sai thì trả cả hai lỗi', () => {
    expect(normalizeSendId(ID.toUpperCase())).toBe(ID);
    expect(checkSendInput('  Chào  ', ID.toUpperCase())).toEqual({
      ok: true,
      noiDung: 'Chào',
      maGui: ID,
    });
    expect(checkSendInput('', 'x')).toEqual({
      ok: false,
      loi: [
        { truong: 'noiDung', ma: 'NOI_DUNG_TRONG' },
        { truong: 'maGui', ma: 'MA_GUI_KHONG_HOP_LE' },
      ],
    });
  });
});
