import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import type { Suggestion } from '../api/chatbot-types';
import { NetworkError } from '../../../shared/api/errors';
import { deferred } from '../testing/fake-chatbot-api';
import { openWidget, resetWidgetTest } from '../testing/render-widget';
import { doctor, suggestion } from '../testing/suggestion-fixtures';
import {
  chooseSpecialty,
  dayButtons,
  shiftButton,
  showCard,
} from '../testing/suggest-harness';

// Chatbot F2, WTL-12 (đồng thời): mỗi thay đổi của người dùng đúng MỘT lời gọi; kết quả muộn của lời gọi cũ bị bỏ; bấm đúp không gọi hai lần;
// đóng khung huỷ lời gọi đang chờ. Cờ `ignoreAbort` của lớp giả cho câu trả lời vẫn về sau khi bị huỷ, mô phỏng đua ở lớp client thật.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-27T03:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
  resetWidgetTest();
});

const withDoctor = (name: string, ngay: string): Suggestion =>
  suggestion({ ngay, bacSi: [doctor({ hoTen: name })] });

describe('một lời gọi mỗi thay đổi (WTL-12)', () => {
  it('WTL-12 bấm đúp "Chọn chuyên khoa này" trong cùng một nhịp: ĐÚNG một lời gọi', async () => {
    const { fake } = await showCard();
    const button = screen.getByRole('button', { name: 'Chọn chuyên khoa này' });

    act(() => {
      fireEvent.click(button);
      fireEvent.click(button);
    });
    await screen.findByText(/Có 2 bác sĩ/);

    expect(fake.suggestCalls).toHaveLength(1);
  });

  it('WTL-12 bấm lại chuyên khoa đã chọn ("Đã chọn") không gọi thêm', async () => {
    const { fake } = await showCard();
    chooseSpecialty();
    await screen.findByText(/Có 2 bác sĩ/);

    fireEvent.click(screen.getByRole('button', { name: 'Đã chọn' }));

    expect(fake.suggestCalls).toHaveLength(1);
  });

  it('WTL-12 bấm đúp cùng một ngày trong lúc chờ: một lời gọi; xong rồi bấm lại mới là "bỏ chọn" (lời gọi thứ ba)', async () => {
    const pending = deferred<Suggestion>();
    const { fake } = await showCard({
      suggestAnswers: [suggestion(), pending.promise, suggestion()],
    });
    chooseSpecialty();
    await screen.findByText(/Có 2 bác sĩ/);

    act(() => {
      fireEvent.click(dayButtons()[1]!);
      fireEvent.click(dayButtons()[1]!);
    });
    expect(fake.suggestCalls).toHaveLength(2);
    expect(fake.suggestCalls[1]!.params.ngay).toBe('2026-11-28');

    await act(async () => pending.resolve(suggestion()));
    await screen.findByText(/có 2 bác sĩ còn giờ trống/);
    expect(dayButtons()[1]).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(dayButtons()[1]!);
    await waitFor(() => expect(fake.suggestCalls).toHaveLength(3));
    expect('ngay' in fake.suggestCalls[2]!.params).toBe(false);
  });

  it('WTL-12 bấm đúp cùng một ca trong lúc chờ: một lời gọi', async () => {
    const pending = deferred<Suggestion>();
    const { fake } = await showCard({
      suggestAnswers: [suggestion(), pending.promise],
    });
    chooseSpecialty();
    await screen.findByText(/Có 2 bác sĩ/);

    act(() => {
      fireEvent.click(shiftButton('Sáng'));
      fireEvent.click(shiftButton('Sáng'));
    });

    expect(fake.suggestCalls).toHaveLength(2);
    expect(fake.suggestCalls[1]!.params.ca).toBe('CaSang');
  });

  it('WTL-12 hai ô KHÁC nhau liên tiếp là hai thay đổi: lời gọi cũ bị huỷ và KẾT QUẢ MUỘN của nó bị bỏ', async () => {
    const older = deferred<Suggestion>();
    const newer = deferred<Suggestion>();
    const { fake } = await showCard({
      ignoreAbort: true,
      suggestAnswers: [suggestion(), older.promise, newer.promise],
    });
    chooseSpecialty();
    await screen.findByText(/Có 2 bác sĩ/);

    fireEvent.click(dayButtons()[1]!);
    fireEvent.click(dayButtons()[2]!);
    expect(fake.suggestCalls).toHaveLength(3);
    expect(fake.suggestCalls[1]!.signal.aborted).toBe(true);
    expect(fake.suggestCalls[2]!.signal.aborted).toBe(false);

    // Lời gọi mới về TRƯỚC, lời gọi cũ (đã huỷ) về SAU: màn hình phải là kết quả của lời gọi mới
    await act(async () => newer.resolve(withDoctor('Người mới', '2026-11-29')));
    await screen.findByText('CN 29/11: có 1 bác sĩ còn giờ trống.');
    await act(async () => older.resolve(withDoctor('Người cũ', '2026-11-28')));

    expect(
      screen.getByRole('link', { name: 'TS.BS. Người mới' }),
    ).toBeInTheDocument();
    expect(screen.queryAllByRole('link', { name: /Người cũ/ })).toHaveLength(0);
    expect(
      screen.getByText('CN 29/11: có 1 bác sĩ còn giờ trống.'),
    ).toBeInTheDocument();
    expect(dayButtons()[2]).toHaveAttribute('aria-pressed', 'true');
    expect(dayButtons()[1]).toHaveAttribute('aria-pressed', 'false');
  });

  it('WTL-12 lỗi của lời gọi cũ (đã huỷ) về muộn không đè lên kết quả của lời gọi mới', async () => {
    const older = deferred<Suggestion>();
    const { fake } = await showCard({
      ignoreAbort: true,
      suggestAnswers: [suggestion(), older.promise, suggestion()],
    });
    chooseSpecialty();
    await screen.findByText(/Có 2 bác sĩ/);

    fireEvent.click(dayButtons()[1]!);
    fireEvent.click(shiftButton('Chiều'));
    await screen.findByText(/có 2 bác sĩ còn giờ trống/);
    await act(async () => older.reject(new NetworkError()));

    expect(fake.suggestCalls).toHaveLength(3);
    expect(
      screen.queryByText('Trợ lý AI hiện không phản hồi, vui lòng thử lại sau'),
    ).toBeNull();
    expect(screen.getByText(/có 2 bác sĩ còn giờ trống/)).toBeInTheDocument();
  });

  it('WTL-12 bấm đúp "Thử lại": một lời gọi thêm', async () => {
    const pending = deferred<Suggestion>();
    const { fake } = await showCard({
      suggestAnswers: [new NetworkError(), pending.promise],
    });
    chooseSpecialty();
    await screen.findByRole('button', { name: 'Thử lại' });

    const retry = screen.getByRole('button', { name: 'Thử lại' });
    act(() => {
      fireEvent.click(retry);
      fireEvent.click(retry);
    });

    expect(fake.suggestCalls).toHaveLength(2);
    await act(async () => pending.resolve(suggestion()));
    await screen.findByText(/Có 2 bác sĩ/);
  });

  it('WTL-11 bấm đúp "Chọn chuyên khoa khác": danh sách chỉ được tải MỘT lần', async () => {
    const { fake } = await showCard();
    const button = screen.getByRole('button', {
      name: 'Chọn chuyên khoa khác',
    });

    act(() => {
      fireEvent.click(button);
      fireEvent.click(button);
    });
    fireEvent.click(button);
    await screen.findByRole('combobox', { name: 'Chuyên khoa' });

    expect(fake.specialtyCalls).toHaveLength(1);
  });
});

describe('vòng đời của thẻ (WTL-12, F2-14)', () => {
  it('F2-14 đóng khung huỷ lời gọi đang chờ; kết quả về sau không làm gì; mở lại thì thẻ trở về chưa chọn nhưng lịch sử vẫn còn', async () => {
    const pending = deferred<Suggestion>();
    const { fake } = await showCard({
      ignoreAbort: true,
      suggestAnswers: [pending.promise],
    });
    chooseSpecialty();
    expect(fake.suggestCalls[0]!.signal.aborted).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Đóng Trợ lý AI' }));
    expect(fake.suggestCalls[0]!.signal.aborted).toBe(true);
    await act(async () => pending.resolve(suggestion()));

    openWidget();
    // Lịch sử hội thoại còn (câu hỏi và thẻ), nhưng lựa chọn của thẻ không được giữ (giới hạn đã biết, TRACKING 3.9)
    expect(screen.getByText('Tôi muốn khám tổng quát')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Chọn chuyên khoa này' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Ngày khám' })).toBeNull();
    expect(fake.suggestCalls).toHaveLength(1);
  });

  it('F2-14 danh sách chuyên khoa đang tải cũng bị huỷ khi đóng khung', async () => {
    const { fake } = await showCard({
      ignoreAbort: true,
      specialtyAnswers: [new Promise(() => undefined)],
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Chọn chuyên khoa khác' }),
    );
    expect(fake.specialtyCalls[0]!.signal.aborted).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Đóng Trợ lý AI' }));

    expect(fake.specialtyCalls[0]!.signal.aborted).toBe(true);
  });

  it('WTL-12 "Xoá hội thoại" gỡ thẻ và huỷ lời gọi đang chờ', async () => {
    const pending = deferred<Suggestion>();
    const { fake } = await showCard({
      ignoreAbort: true,
      suggestAnswers: [pending.promise],
    });
    chooseSpecialty();

    fireEvent.click(screen.getByRole('button', { name: 'Xoá hội thoại' }));

    expect(fake.suggestCalls[0]!.signal.aborted).toBe(true);
    expect(
      screen.queryByRole('region', { name: 'Gợi ý đặt lịch khám' }),
    ).toBeNull();
    await act(async () => pending.resolve(suggestion()));
    expect(screen.queryByText(/Có 2 bác sĩ/)).toBeNull();
  });
});
