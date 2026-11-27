import { fireEvent, screen, within } from '@testing-library/react';
import type { ChuyenKhoaGoiY } from '../api/chatbot-types';
import {
  createFakeChatbotApi,
  type FakeSpecialtiesAnswer,
  type FakeSuggestAnswer,
} from './fake-chatbot-api';
import { goiY } from './reply-fixtures';
import { openAndAsk, renderWidget, type TestRole } from './render-widget';

// CHỈ DÙNG TRONG TEST (chatbot F2). Dựng khung chat thật với lớp API giả, hỏi một câu để nhận phản hồi `GoiY`, rồi trả về thẻ gợi ý.
// Đi qua `ChatbotWidget` nên cũng chứng minh lớp giả tới được thẻ qua `ChatbotApiContext`.
export const ONE_SPECIALTY: ChuyenKhoaGoiY[] = [
  { chuyenKhoaId: '3', ten: 'Nội tổng quát' },
];

export const THREE_SPECIALTIES: ChuyenKhoaGoiY[] = [
  { chuyenKhoaId: '3', ten: 'Nội tổng quát' },
  { chuyenKhoaId: '1', ten: 'Tim mạch' },
  { chuyenKhoaId: '5', ten: 'Da liễu' },
];

export interface ShowCardOptions {
  suggestions?: ChuyenKhoaGoiY[];
  role?: TestRole;
  suggestAnswers?: FakeSuggestAnswer[];
  specialtyAnswers?: FakeSpecialtiesAnswer[];
  ignoreAbort?: boolean;
  width?: number;
}

export const CARD_NAME = 'Gợi ý đặt lịch khám';

export async function showCard(options: ShowCardOptions = {}) {
  const fake = createFakeChatbotApi({
    answers: [goiY({ chuyenKhoaGoiY: options.suggestions ?? ONE_SPECIALTY })],
    suggestAnswers: options.suggestAnswers,
    specialtyAnswers: options.specialtyAnswers,
    ignoreAbort: options.ignoreAbort,
  });
  const view = renderWidget({
    fake,
    role: options.role,
    width: options.width,
  });
  openAndAsk('Tôi muốn khám tổng quát');
  const card = await screen.findByRole('region', { name: CARD_NAME });
  return { ...view, fake, card };
}

// Bấm "Chọn chuyên khoa này" ở thẻ thứ `index` (các thẻ đã chọn đổi chữ thành "Đã chọn" nên chỉ còn các thẻ chưa chọn)
export function chooseSpecialty(index = 0): void {
  fireEvent.click(
    screen.getAllByRole('button', { name: 'Chọn chuyên khoa này' })[index]!,
  );
}

export const dayButtons = (): HTMLElement[] =>
  within(screen.getByRole('group', { name: 'Ngày khám' })).getAllByRole(
    'button',
  );

export const shiftButton = (label: 'Sáng' | 'Chiều' | 'Tối'): HTMLElement =>
  within(screen.getByRole('group', { name: 'Ca khám' })).getByRole('button', {
    name: label,
  });

// Chờ kết quả có bác sĩ của lời gọi gần nhất (tóm tắt có chữ "bác sĩ")
export const findSummary = (pattern: RegExp): Promise<HTMLElement> =>
  screen.findByText(pattern);
