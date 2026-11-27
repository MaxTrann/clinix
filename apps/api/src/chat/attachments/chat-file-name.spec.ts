import {
  FALLBACK_FILE_NAME,
  attachmentDisposition,
  cleanFileName,
} from './chat-file-name.js';

// chat B4 — TEP-06 (PLAN chat 7.7, 5.8): làm sạch tên hiển thị và header tải xuống. Phần qua HTTP thật (multipart UTF-8) ở test/chat-attachment.e2e-spec.ts.

const codePoints = (s: string) => Array.from(s).length;

describe('chat B4 — tên tệp đính kèm (TEP-06)', () => {
  it('TEP-06: tên tiếng Việt giữ đúng dấu (chuẩn hoá NFC)', () => {
    // "ả" viết dạng tách (a + dấu hỏi kết hợp) thành một điểm mã
    expect(cleanFileName('Kết quả xét nghiệm.pdf', 'pdf')).toBe(
      'Kết quả xét nghiệm.pdf',
    );
    expect(cleanFileName('a\u0309nh.jpg', 'jpg')).toBe('ảnh.jpg');
  });

  it.each([
    ['C:\\Users\\bn\\Desktop\\don-thuoc.pdf', 'don-thuoc.pdf'],
    ['/etc/../../anh.png', 'anh.png'],
    ['..\\..\\anh.png', 'anh.png'],
  ])('TEP-06: có đường dẫn (%s) ⇒ chỉ giữ tên cuối', (raw, expected) => {
    expect(cleanFileName(raw, raw.endsWith('.pdf') ? 'pdf' : 'png')).toBe(
      expected,
    );
  });

  it('TEP-06: ký tự đổi chiều chữ, ký tự rộng 0 và ký tự điều khiển bị bỏ (tên "anh‮fdp.exe" không thể giả làm .pdf)', () => {
    expect(cleanFileName('anh\u202Egpj.exe', 'jpg')).toBe('anhgpj.jpg');
    expect(cleanFileName('a\u200Bb\u2066c\u0000d\u0007e.pdf', 'pdf')).toBe(
      'abcde.pdf',
    );
    expect(cleanFileName('dòng 1\ndòng 2.pdf', 'pdf')).toBe('dòng 1dòng 2.pdf');
  });

  it('TEP-06: dài 300 điểm mã ⇒ cắt còn ≤ 255 (kể cả đuôi), không cắt đôi emoji ngoài BMP', () => {
    const long = `${'ệ'.repeat(300)}.pdf`;
    const cleaned = cleanFileName(long, 'pdf');
    expect(codePoints(cleaned)).toBe(255);
    expect(cleaned.endsWith('ệ.pdf')).toBe(true);
    const emoji = cleanFileName(`${'😀'.repeat(300)}.png`, 'png');
    expect(codePoints(emoji)).toBe(255);
    expect(emoji).toBe(`${'😀'.repeat(251)}.png`);
  });

  it('TEP-06: đuôi theo loại máy chủ nhận ra, không theo client (ảnh nén sang WebP; tệp không đuôi; đuôi giả)', () => {
    expect(cleanFileName('anh.jpg', 'webp')).toBe('anh.webp');
    expect(cleanFileName('scan', 'pdf')).toBe('scan.pdf');
    expect(cleanFileName('virus.exe', 'png')).toBe('virus.png');
    expect(cleanFileName('ban.sao.cuoi.PDF', 'pdf')).toBe('ban.sao.cuoi.pdf');
  });

  it.each(['', '   ', '...', '.pdf', '\u202E', '/duong/dan/'])(
    'TEP-06: rỗng sau khi làm sạch (%j) ⇒ "tep-dinh-kem" kèm đuôi',
    (raw) => {
      expect(cleanFileName(raw, 'pdf')).toBe(`${FALLBACK_FILE_NAME}.pdf`);
    },
  );

  it('TEP-09: Content-Disposition luôn attachment; filename ASCII thay thế, filename* UTF-8 giữ dấu; dấu nháy kép không phá header', () => {
    expect(attachmentDisposition('Kết quả.pdf')).toBe(
      `attachment; filename="Ket qua.pdf"; filename*=UTF-8''K%E1%BA%BFt%20qu%E1%BA%A3.pdf`,
    );
    expect(attachmentDisposition('Đơn "thuốc".pdf')).toBe(
      `attachment; filename="Don _thuoc_.pdf"; filename*=UTF-8''%C4%90%C6%A1n%20%22thu%E1%BB%91c%22.pdf`,
    );
    expect(attachmentDisposition("a'(b).png")).toContain(
      "filename*=UTF-8''a%27%28b%29.png",
    );
  });
});
