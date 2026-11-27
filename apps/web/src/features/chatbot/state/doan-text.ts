import type { Doan } from '../api/chatbot-types';

// Chữ do máy chủ dựng, ngắt đoạn nằm TRONG `chu` bằng `\n` hay `\n\n` (phiên kiểm, 27/11/2026): web nối các phần tử `doan` liền
// nhau và không tự thêm gì. Để khung không bị hở rộng, chuẩn hoá: không quá hai xuống dòng liên tiếp (kể cả khi chúng nằm ở
// hai phần tử kề nhau), không xuống dòng ở đầu và cuối. Phần tử chỉ còn xuống dòng thì bị bỏ.
export function normalizeDoan(doan: readonly Doan[]): Doan[] {
  const result: Doan[] = [];
  // Số xuống dòng đang nằm ở cuối chữ đã nối
  let trailing = 0;
  for (const part of doan) {
    if (part.kieu === 'thucThe') {
      result.push(part);
      trailing = 0;
      continue;
    }
    let text = part.chu.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n');
    // Phần xuống dòng ở đầu phần tử này cộng với phần ở cuối phần tử trước không được quá hai
    const leading = /^\n*/.exec(text)?.[0].length ?? 0;
    const allowed = Math.max(0, 2 - trailing);
    if (leading > allowed) text = text.slice(leading - allowed);
    if (text === '') continue;
    result.push({ kieu: 'chu', chu: text });
    const endLines = /\n*$/.exec(text)?.[0].length ?? 0;
    trailing = endLines === text.length ? trailing + endLines : endLines;
  }
  trimEdges(result);
  return result;
}

// Bỏ xuống dòng ở đầu phần tử chữ đầu tiên và cuối phần tử chữ cuối cùng (chỉ khi chúng nằm sát mép)
function trimEdges(parts: Doan[]): void {
  for (let first = parts[0]; first?.kieu === 'chu'; first = parts[0]) {
    const text = first.chu.replace(/^\n+/, '');
    if (text !== '') {
      parts[0] = { kieu: 'chu', chu: text };
      break;
    }
    parts.shift();
  }
  for (
    let last = parts[parts.length - 1];
    last?.kieu === 'chu';
    last = parts[parts.length - 1]
  ) {
    const text = last.chu.replace(/\n+$/, '');
    if (text !== '') {
      parts[parts.length - 1] = { kieu: 'chu', chu: text };
      break;
    }
    parts.pop();
  }
}

// Chữ thường của một phản hồi (dùng làm lượt `TroLy` của `lichSu`): tên thực thể là chữ của chính nó
export function doanPlainText(doan: readonly Doan[]): string {
  return normalizeDoan(doan)
    .map((part) => part.chu)
    .join('');
}
