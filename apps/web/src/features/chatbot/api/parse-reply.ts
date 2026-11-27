import { UnexpectedResponseError } from '../../../shared/api/errors';
import {
  KET_QUA,
  LIEN_KET_MA,
  type ChatbotReply,
  type ChuyenKhoaGoiY,
  type Doan,
  type KetQua,
  type LienKetMa,
} from './chatbot-types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseDoan(value: unknown): Doan {
  if (!isRecord(value) || typeof value.chu !== 'string') {
    throw new UnexpectedResponseError(200);
  }
  if (value.kieu === 'chu') return { kieu: 'chu', chu: value.chu };
  if (
    value.kieu === 'thucThe' &&
    typeof value.doiTuong === 'string' &&
    typeof value.id === 'string'
  ) {
    return {
      kieu: 'thucThe',
      doiTuong: value.doiTuong,
      id: value.id,
      chu: value.chu,
    };
  }
  throw new UnexpectedResponseError(200);
}

function parseSuggestions(value: unknown): ChuyenKhoaGoiY[] {
  if (!Array.isArray(value)) return [];
  const found: ChuyenKhoaGoiY[] = [];
  for (const item of value) {
    if (
      isRecord(item) &&
      typeof item.chuyenKhoaId === 'string' &&
      typeof item.ten === 'string'
    ) {
      found.push({ chuyenKhoaId: item.chuyenKhoaId, ten: item.ten });
    }
  }
  return found;
}

// Mã liên kết lạ bị bỏ, mã trùng chỉ giữ một, thứ tự của máy chủ được giữ
function parseLinks(value: unknown): LienKetMa[] {
  if (!Array.isArray(value)) return [];
  const known = new Set<string>(LIEN_KET_MA);
  const found: LienKetMa[] = [];
  for (const item of value) {
    if (typeof item === 'string' && known.has(item)) {
      const code = item as LienKetMa;
      if (!found.includes(code)) found.push(code);
    }
  }
  return found;
}

// Kiểm hình dạng thân 200 của API hỏi đáp. Sai hình dạng (thiếu `doan`, `ketQua` lạ…) là phản hồi không dùng được:
// ném `UnexpectedResponseError`, khung chat hiện chữ lỗi hệ thống và cho gửi lại. Cờ thiếu thì coi là `false`
// (không cho gửi lại, không đưa vào lịch sử): thiên về an toàn.
export function parseReply(raw: unknown): ChatbotReply {
  if (!isRecord(raw)) throw new UnexpectedResponseError(200);
  const { ketQua, doan } = raw;
  if (
    typeof ketQua !== 'string' ||
    !(KET_QUA as readonly string[]).includes(ketQua)
  ) {
    throw new UnexpectedResponseError(200);
  }
  if (!Array.isArray(doan) || doan.length === 0) {
    throw new UnexpectedResponseError(200);
  }
  return {
    ketQua: ketQua as KetQua,
    doan: doan.map(parseDoan),
    chuyenKhoaGoiY: parseSuggestions(raw.chuyenKhoaGoiY),
    lienKet: parseLinks(raw.lienKet),
    coTheGuiLai: raw.coTheGuiLai === true,
    tinhVaoLichSu: raw.tinhVaoLichSu === true,
  };
}
