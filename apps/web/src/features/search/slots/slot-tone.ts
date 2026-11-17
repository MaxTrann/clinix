import type { SlotStatus } from '../api/slot-types';

// Màu theo trạng thái, dùng chung cho ô khung giờ và chú giải để hai nơi không lệch nhau (Figma 446:257, 446:367). Chữ đạt 4,5:1 (ADR 0004):
// chữ "Hết hạn" của Figma/Make là gray-400 (≈ 2,5:1) nên dùng gray-600 (đo bằng script ở Chromium).
export const CELL_TONE: Record<SlotStatus, string> = {
  ConTrong: 'border-cyan-400 bg-white text-cyan-800',
  DangGiuCho: 'border-amber-300 bg-amber-50 text-amber-800',
  DaDat: 'border-gray-200 bg-gray-100 text-gray-600',
  HetHan: 'border-dashed border-gray-200 bg-gray-50 text-gray-600',
};
