import type { ChatbotReply } from '../api/chatbot-types';
import {
  chu,
  duPhong,
  khanCap,
  reply,
  thucThe,
  traLoi,
} from '../testing/reply-fixtures';
import { buildHistory } from './build-history';
import type { Exchange } from './exchange';

// Chatbot F1. WTL-04: lượt `DuPhong` và lượt lỗi không vào `lichSu`; WTL-08: `lichSu` tối đa 6 phần tử, mỗi `noiDung` tối đa 800 điểm mã.
function answered(id: number, question: string, r: ChatbotReply): Exchange {
  return { id, question, outcome: { kind: 'reply', reply: r } };
}

describe('buildHistory', () => {
  it('WTL-08 chưa có lượt nào thì rỗng', () => {
    expect(buildHistory([])).toEqual([]);
  });

  it('WTL-08 một lượt có trả lời thành hai phần tử: câu hỏi `NguoiDung` rồi chữ trả lời `TroLy`', () => {
    expect(buildHistory([answered(1, 'Hỏi 1', traLoi('Đáp 1'))])).toEqual([
      { vai: 'NguoiDung', noiDung: 'Hỏi 1' },
      { vai: 'TroLy', noiDung: 'Đáp 1' },
    ]);
  });

  it('WTL-04 lớp cờ: lượt `DuPhong` (tinhVaoLichSu=false) không vào lịch sử', () => {
    const history = buildHistory([
      answered(1, 'Hỏi 1', traLoi('Đáp 1')),
      answered(2, 'Hỏi 2', duPhong()),
    ]);
    expect(history.map((turn) => turn.noiDung)).toEqual(['Hỏi 1', 'Đáp 1']);
  });

  it('WTL-04 lớp loại kết quả: `DuPhong` KHÔNG vào dù máy chủ gửi cờ sai (tinhVaoLichSu=true)', () => {
    const history = buildHistory([
      answered(1, 'Hỏi 1', duPhong({ tinhVaoLichSu: true })),
    ]);
    expect(history).toEqual([]);
  });

  it('WTL-04 lớp cờ: lượt có tinhVaoLichSu=false không vào dù không phải `DuPhong`', () => {
    expect(
      buildHistory([
        answered(1, 'Hỏi', traLoi('Đáp', { tinhVaoLichSu: false })),
      ]),
    ).toEqual([]);
  });

  it('WTL-04 lượt đang chờ và lượt lỗi không vào lịch sử', () => {
    const history = buildHistory([
      answered(1, 'Hỏi 1', traLoi('Đáp 1')),
      { id: 2, question: 'Hỏi 2', outcome: { kind: 'pending' } },
      {
        id: 3,
        question: 'Hỏi 3',
        outcome: { kind: 'error', text: 'Lỗi', canRetry: true },
      },
    ]);
    expect(history.map((turn) => turn.noiDung)).toEqual(['Hỏi 1', 'Đáp 1']);
  });

  it('WTL-04 lượt khẩn cấp, ngoài phạm vi… theo cờ của máy chủ (khẩn cấp mặc định có vào)', () => {
    const history = buildHistory([answered(1, 'Đau ngực', khanCap())]);
    expect(history).toHaveLength(2);
    expect(history[1]?.vai).toBe('TroLy');
  });

  it('WTL-08 năm lượt trả lời thì chỉ giữ 6 phần tử CUỐI (ba cặp), luôn bắt đầu bằng NguoiDung', () => {
    const exchanges = [1, 2, 3, 4, 5].map((n) =>
      answered(n, `Hỏi ${n}`, traLoi(`Đáp ${n}`)),
    );
    const history = buildHistory(exchanges);
    expect(history).toHaveLength(6);
    expect(history[0]).toEqual({ vai: 'NguoiDung', noiDung: 'Hỏi 3' });
    expect(history.map((turn) => turn.noiDung)).toEqual([
      'Hỏi 3',
      'Đáp 3',
      'Hỏi 4',
      'Đáp 4',
      'Hỏi 5',
      'Đáp 5',
    ]);
  });

  it('WTL-08 mỗi noiDung cắt ở 800 điểm mã (cặp thay thế không bị đứt); đúng 800 giữ nguyên', () => {
    const emoji = String.fromCodePoint(0x1f600);
    const history = buildHistory([
      answered(1, emoji.repeat(500), traLoi('x'.repeat(900))),
      answered(2, 'ngắn', traLoi('y'.repeat(800))),
    ]);
    expect(Array.from(history[0]!.noiDung)).toHaveLength(500);
    expect(Array.from(history[1]!.noiDung)).toHaveLength(800);
    expect(Array.from(history[3]!.noiDung)).toHaveLength(800);
    const longest = buildHistory([
      answered(1, 'Hỏi', reply({ doan: [chu(emoji.repeat(1000))] })),
    ]);
    expect(Array.from(longest[1]!.noiDung)).toHaveLength(800);
    expect(longest[1]!.noiDung).toBe(emoji.repeat(800));
  });

  it('F1-05 chữ trả lời là chữ thường của phản hồi: tên thực thể nằm trong câu', () => {
    const history = buildHistory([
      answered(
        1,
        'Hỏi',
        reply({
          doan: [
            chu('Bác sĩ '),
            thucThe('BacSi', '7', 'Nguyễn Mẫu'),
            chu(' khám.'),
          ],
        }),
      ),
    ]);
    expect(history[1]?.noiDung).toBe('Bác sĩ Nguyễn Mẫu khám.');
  });

  it('F1-06 phản hồi chỉ có xuống dòng (chữ rỗng) thì bỏ cả cặp, không gửi noiDung rỗng', () => {
    expect(
      buildHistory([answered(1, 'Hỏi', reply({ doan: [chu('\n\n')] }))]),
    ).toEqual([]);
  });
});
