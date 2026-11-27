import { fireEvent, screen, waitFor } from '@testing-library/react';
import { createFakeChatbotApi } from '../testing/fake-chatbot-api';
import { traLoi } from '../testing/reply-fixtures';
import {
  acceptConsent,
  askQuestion,
  composer,
  launcher,
  openWidget,
  pressKey,
  renderWidget,
  resetWidgetTest,
  sendButton,
  typeQuestion,
} from '../testing/render-widget';

// Chatbot F1, WTL-02: lần đầu mở khung: banner, rồi thông báo quyền riêng tư và độ tuổi với nút "Tôi hiểu", rồi ô nhập (khoá tới khi bấm).
const BANNER_1 =
  'Trợ lý AI chỉ tư vấn sơ bộ, không chẩn đoán, không kê đơn, không thay thế khám trực tiếp.';
const CONSENT =
  'Nội dung bạn nhập được gửi tới dịch vụ AI bên thứ ba (Groq, Google). Đừng nhập họ tên, số điện thoại, CCCD hay hồ sơ bệnh. Trợ lý dành cho người từ 18 tuổi.';
const QUICK = [
  'Phòng khám có những chuyên khoa nào?',
  'Giờ nhận khám của phòng khám là mấy giờ?',
  'Tôi muốn khám tổng quát, nên chọn chuyên khoa nào?',
];

afterEach(resetWidgetTest);

describe('khung chat: lần đầu mở', () => {
  it('WTL-02 khung đóng thì chỉ có nút nổi; mở ra thấy hộp thoại có tên "Trợ lý AI"', () => {
    renderWidget();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(launcher()).toHaveAttribute('aria-expanded', 'false');

    openWidget();

    expect(
      screen.getByRole('dialog', { name: 'Trợ lý AI' }),
    ).toBeInTheDocument();
    expect(launcher()).toHaveAttribute('aria-expanded', 'true');
    expect(
      screen.getByRole('heading', { name: 'Trợ lý AI CLINIX' }),
    ).toBeInTheDocument();
  });

  it('WTL-02 banner đúng chữ (2.4.7 b1 và "Cấp cứu: gọi 115."), thông báo đúng chữ Q5, nút "Tôi hiểu"', () => {
    renderWidget();
    openWidget();

    expect(screen.getByText(BANNER_1)).toBeInTheDocument();
    expect(screen.getByText('Cấp cứu: gọi 115.')).toBeInTheDocument();
    expect(screen.getByText(CONSENT)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tôi hiểu' })).toBeEnabled();
    expect(
      screen.getByText(
        'Xin chào! Tôi là trợ lý AI của CLINIX. Bạn cần tư vấn về chuyên khoa, bác sĩ hay lịch khám?',
      ),
    ).toBeInTheDocument();
  });

  it('WTL-02 ô nhập, nút gửi và cả ba câu gợi ý nhanh bị KHOÁ tới khi bấm "Tôi hiểu"; tiêu điểm đầu ở "Tôi hiểu"', () => {
    renderWidget();
    openWidget();

    expect(composer()).toBeDisabled();
    expect(sendButton()).toBeDisabled();
    for (const question of QUICK) {
      expect(screen.getByRole('button', { name: question })).toBeDisabled();
    }
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Tôi hiểu' }),
    );
  });

  it('WTL-02 chưa đồng ý thì không gửi được bằng cách nào: Enter, nút gửi, câu gợi ý đều không gọi máy chủ', () => {
    const fake = createFakeChatbotApi();
    renderWidget({ fake });
    openWidget();

    typeQuestion('Hỏi khi chưa đồng ý');
    pressKey(composer(), 'Enter');
    fireEvent.click(sendButton());
    fireEvent.click(screen.getByRole('button', { name: QUICK[0]! }));

    expect(fake.calls).toHaveLength(0);
  });

  it('WTL-02 bấm "Tôi hiểu": khối thông báo biến mất, ô nhập và câu gợi ý mở khoá, tiêu điểm vào ô nhập, banner vẫn còn', () => {
    renderWidget();
    openWidget();

    acceptConsent();

    expect(screen.queryByText(CONSENT)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Tôi hiểu' })).toBeNull();
    expect(composer()).toBeEnabled();
    for (const question of QUICK) {
      expect(screen.getByRole('button', { name: question })).toBeEnabled();
    }
    expect(document.activeElement).toBe(composer());
    expect(screen.getByText(BANNER_1)).toBeInTheDocument();
    expect(screen.getByText('Cấp cứu: gọi 115.')).toBeInTheDocument();
  });

  it('WTL-02 đóng rồi mở lại, và "Xoá hội thoại", đều KHÔNG hỏi lại "Tôi hiểu"', async () => {
    renderWidget({
      fake: createFakeChatbotApi({ answers: [traLoi('Đáp 1')] }),
    });
    openWidget();
    acceptConsent();
    askQuestion('Hỏi 1');
    await screen.findByText('Đáp 1');

    fireEvent.click(screen.getByRole('button', { name: 'Đóng Trợ lý AI' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    openWidget();
    expect(screen.queryByRole('button', { name: 'Tôi hiểu' })).toBeNull();
    expect(composer()).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Xoá hội thoại' }));
    await waitFor(() => expect(screen.queryByText('Đáp 1')).toBeNull());
    expect(screen.queryByRole('button', { name: 'Tôi hiểu' })).toBeNull();
    expect(composer()).toBeEnabled();
  });

  it('WTL-02 gợi ý nhanh: bấm là gửi ngay đúng câu đó, rồi các nút gợi ý biến mất', async () => {
    const fake = createFakeChatbotApi({
      answers: [traLoi('Có nhiều chuyên khoa.')],
    });
    renderWidget({ fake });
    openWidget();
    acceptConsent();

    fireEvent.click(screen.getByRole('button', { name: QUICK[0]! }));

    await screen.findByText('Có nhiều chuyên khoa.');
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]!.body.cauHoi).toBe(QUICK[0]);
    for (const question of QUICK) {
      expect(screen.queryByRole('button', { name: question })).toBeNull();
    }
  });
});
