import type { Doan, SuggestedSpecialty } from '../answer/answer.types.js';
import { getCannedAnswer, type CannedKind } from '../safety/canned-answers.js';
import { ADDRESS_HEADING } from './ask.constants.js';
import type { AskResponse } from './ask.dto.js';
import type { BranchAddress } from './branch-directory.js';

// Dựng thân ra của `POST /chatbot/messages` (chatbot B3; PLAN chatbot 5.12; F1 TRACKING 3.7, K1). Hàm thuần.
// Câu dựng sẵn của B1 là MẢNG chuỗi; thân ra cần `doan`. Quy ước ngắt đoạn (K1): ngắt đoạn nằm TRONG `chu` bằng `\n\n`; web nối các phần tử `doan`, không tự thêm gì.
// Hai cờ và danh sách `lienKet` lấy nguyên từ câu dựng sẵn của B1, B3 không tự đặt lại.

export const PARAGRAPH_BREAK = '\n\n';

interface CannedExtras {
  /** Chỉ `KhanCap` dùng: địa chỉ chi nhánh đứng sau hai đoạn dựng sẵn (Q6, D3). */
  readonly addresses?: readonly BranchAddress[];
  /** `KhongKhopDuLieu` GIỮ thẻ chuyên khoa đã lọc (5.4 bước 13); các loại khác rỗng. */
  readonly chuyenKhoaGoiY?: readonly SuggestedSpecialty[];
}

function addressBlock(
  text: string,
  addresses: readonly BranchAddress[],
): Doan[] {
  // "<hai đoạn>\n\nĐịa chỉ chi nhánh:" rồi mỗi chi nhánh một dòng "- <tên (thực thể)>: <địa chỉ>"
  const parts: Doan[] = [];
  let buffer = `${text}${PARAGRAPH_BREAK}${ADDRESS_HEADING}`;
  for (const branch of addresses) {
    parts.push({ kieu: 'chu', chu: `${buffer}\n- ` });
    parts.push({
      kieu: 'thucThe',
      doiTuong: 'ChiNhanh',
      id: branch.id,
      chu: branch.ten,
    });
    buffer = `: ${branch.diaChi}`;
  }
  parts.push({ kieu: 'chu', chu: buffer });
  return parts;
}

/** Câu dựng sẵn thành thân ra. */
export function responseFromCanned(
  kind: CannedKind,
  extras: CannedExtras = {},
): AskResponse {
  const canned = getCannedAnswer(kind);
  const text = canned.doan.join(PARAGRAPH_BREAK);
  const addresses = kind === 'KhanCap' ? (extras.addresses ?? []) : [];
  const doan: Doan[] =
    addresses.length > 0
      ? addressBlock(text, addresses)
      : [{ kieu: 'chu', chu: text }];
  return {
    ketQua: canned.ketQua,
    doan,
    chuyenKhoaGoiY: [...(extras.chuyenKhoaGoiY ?? [])],
    lienKet: [...canned.lienKet],
    coTheGuiLai: canned.coTheGuiLai,
    tinhVaoLichSu: canned.tinhVaoLichSu,
  };
}

/** Câu trả lời đã đối chiếu và dựng đoạn (do B2): không có liên kết riêng, vào lịch sử, không cần gửi lại. */
export function responseFromAnswer(
  ketQua: 'TraLoi' | 'GoiY',
  doan: readonly Doan[],
  chuyenKhoaGoiY: readonly SuggestedSpecialty[],
): AskResponse {
  return {
    ketQua,
    doan: [...doan],
    chuyenKhoaGoiY: [...chuyenKhoaGoiY],
    lienKet: [],
    coTheGuiLai: false,
    tinhVaoLichSu: true,
  };
}
