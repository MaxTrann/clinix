import type { ResolvedValue } from './answer.types.js';
import { renderAnswer } from './answer-renderer.js';

// chatbot B2 — dựng đoạn (DCR-01 bản đơn vị, DCR-12). Hàm thuần: bản MySQL thật của DCR-01 ở answer-renderer.int-spec.ts.

const bacSi: ResolvedValue = {
  chu: 'ThS.BS. Nguyễn Minh Anh',
  entity: { doiTuong: 'BacSi', id: '12' },
};
const values = new Map<string, ResolvedValue>([
  ['BS:12', bacSi],
  ['CK:3', { chu: 'Tim mạch', entity: { doiTuong: 'ChuyenKhoa', id: '3' } }],
  ['CN:1', { chu: 'Chi nhánh Một', entity: { doiTuong: 'ChiNhanh', id: '1' } }],
  ['DV:5', { chu: 'Khám tổng quát', entity: { doiTuong: 'DichVu', id: '5' } }],
  ['GIA:12', { chu: '350.000 đồng' }],
  ['DC:1', { chu: '12 Đường A, Quận 1' }],
]);

describe('chatbot B2 — renderAnswer', () => {
  it('DCR-01: tên thành đoạn thucThe có doiTuong và id, giá trị thành đoạn chữ gộp vào chữ liền kề', () => {
    const doan = renderAnswer(
      'Chuyên khoa [[CK:3]] có [[BS:12]], giá khám [[GIA:12]] mỗi lượt.',
      values,
    );
    expect(doan).toEqual([
      { kieu: 'chu', chu: 'Chuyên khoa ' },
      { kieu: 'thucThe', doiTuong: 'ChuyenKhoa', id: '3', chu: 'Tim mạch' },
      { kieu: 'chu', chu: ' có ' },
      {
        kieu: 'thucThe',
        doiTuong: 'BacSi',
        id: '12',
        chu: 'ThS.BS. Nguyễn Minh Anh',
      },
      { kieu: 'chu', chu: ', giá khám 350.000 đồng mỗi lượt.' },
    ]);
  });

  it('DCR-01: đủ bốn đối tượng có liên kết; id luôn là chuỗi', () => {
    const doan = renderAnswer('[[CK:3]] [[BS:12]] [[CN:1]] [[DV:5]]', values);
    expect(
      doan
        ?.filter((piece) => piece.kieu === 'thucThe')
        .map((piece) => [piece.doiTuong, piece.id]),
    ).toEqual([
      ['ChuyenKhoa', '3'],
      ['BacSi', '12'],
      ['ChiNhanh', '1'],
      ['DichVu', '5'],
    ]);
  });

  it('B2-45: câu chỉ có chữ thành đúng một đoạn chữ', () => {
    expect(renderAnswer('Xin chào bạn.', values)).toEqual([
      { kieu: 'chu', chu: 'Xin chào bạn.' },
    ]);
  });

  it('B2-46: câu chỉ có một chỗ giữ tên thành đúng một đoạn thucThe', () => {
    expect(renderAnswer('[[BS:12]]', values)).toEqual([
      {
        kieu: 'thucThe',
        doiTuong: 'BacSi',
        id: '12',
        chu: 'ThS.BS. Nguyễn Minh Anh',
      },
    ]);
  });

  it('B2-47: GIỮ NGUYÊN ký tự xuống dòng của mô hình quanh chỗ giữ (web nối đoạn và hiển thị bằng pre-line)', () => {
    expect(
      renderAnswer('Mở đầu.\n\n[[BS:12]]\n\nĐịa chỉ: [[DC:1]]\n\nHết.', values),
    ).toEqual([
      { kieu: 'chu', chu: 'Mở đầu.\n\n' },
      {
        kieu: 'thucThe',
        doiTuong: 'BacSi',
        id: '12',
        chu: 'ThS.BS. Nguyễn Minh Anh',
      },
      { kieu: 'chu', chu: '\n\nĐịa chỉ: 12 Đường A, Quận 1\n\nHết.' },
    ]);
  });

  it('B2-48: khoảng trắng và xuống dòng ở đầu và cuối cả câu bị cắt; ở giữa không đụng', () => {
    expect(renderAnswer('\n  Xin chào  \n\n bạn \n', values)).toEqual([
      { kieu: 'chu', chu: 'Xin chào  \n\n bạn' },
    ]);
    expect(renderAnswer('  [[CK:3]]  ', values)).toEqual([
      { kieu: 'thucThe', doiTuong: 'ChuyenKhoa', id: '3', chu: 'Tim mạch' },
    ]);
  });

  it('DCR-12: `<` và `&` trong chữ của mô hình giữ nguyên là chữ, không thoát, không HTML', () => {
    const doan = renderAnswer('Tim & mạch, a < b, R&D <3', values);
    expect(doan).toEqual([{ kieu: 'chu', chu: 'Tim & mạch, a < b, R&D <3' }]);
  });

  it('DCR-12: tên từ DB có `<`, `&` hay thẻ giữ nguyên là chữ (React tự thoát khi in); đoạn không có trường html', () => {
    const lạ = new Map<string, ResolvedValue>([
      [
        'BS:12',
        {
          chu: 'BS. Lê <b>&amp; Trần</b>',
          entity: { doiTuong: 'BacSi', id: '12' },
        },
      ],
    ]);
    const doan = renderAnswer('Gặp [[BS:12]] nhé', lạ);
    expect(doan?.[1]).toEqual({
      kieu: 'thucThe',
      doiTuong: 'BacSi',
      id: '12',
      chu: 'BS. Lê <b>&amp; Trần</b>',
    });
    for (const piece of doan ?? []) {
      expect(Object.keys(piece)).not.toContain('html');
    }
  });

  it('B2-49: chỗ giữ lặp lại dùng chung một giá trị', () => {
    const doan = renderAnswer('[[GIA:12]] rồi lại [[GIA:12]]', values);
    expect(doan).toEqual([
      { kieu: 'chu', chu: '350.000 đồng rồi lại 350.000 đồng' },
    ]);
  });

  it('B2-50: thiếu giá trị cho một chỗ giữ, hay chỗ giữ sai dạng, thì trả null (không đoán)', () => {
    expect(renderAnswer('Gặp [[BS:99]]', values)).toBeNull();
    expect(renderAnswer('Gặp [[BS:12', values)).toBeNull();
    expect(renderAnswer('Gặp [[XX:1]]', values)).toBeNull();
  });
});
