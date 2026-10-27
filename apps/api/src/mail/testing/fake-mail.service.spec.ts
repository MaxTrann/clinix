import { MailSendError } from '../mail-send.error.js';
import type { MailMessage } from '../mail.service.js';
import { FakeMailService } from './fake-mail.service.js';

// Task P4. Công cụ test dùng chung cho A2, A5, A11 và admin. Mã nội bộ MAIL-22 là [đề xuất].
const MESSAGE: MailMessage = {
  to: 'a@example.test',
  subject: 'Tiêu đề',
  text: 'Nội dung',
};

describe('FakeMailService (MAIL-22)', () => {
  it('ghi lại lần gửi thành công vào cả attempts và sent', async () => {
    const fake = new FakeMailService();
    await fake.send(MESSAGE);
    expect(fake.attempts).toEqual([MESSAGE]);
    expect(fake.sent).toEqual([MESSAGE]);
  });

  it('failNextWith: chỉ lần kế tiếp lỗi (reject MailSendError), lần sau thành công; attempts đếm cả lần lỗi', async () => {
    const fake = new FakeMailService().failNextWith('TIMEOUT');
    await expect(fake.send(MESSAGE)).rejects.toMatchObject({
      name: 'MailSendError',
      kind: 'TIMEOUT',
    });
    await expect(fake.send(MESSAGE)).resolves.toBeUndefined();
    expect(fake.attempts).toHaveLength(2);
    expect(fake.sent).toHaveLength(1);
  });

  it('failNextWith nhiều lần xếp hàng theo thứ tự', async () => {
    const fake = new FakeMailService().failNextWith('AUTH').failNextWith('TLS');
    await expect(fake.send(MESSAGE)).rejects.toMatchObject({ kind: 'AUTH' });
    await expect(fake.send(MESSAGE)).rejects.toMatchObject({ kind: 'TLS' });
    await expect(fake.send(MESSAGE)).resolves.toBeUndefined();
  });

  it('failAllWith: mọi lần lỗi tới khi reset()', async () => {
    const fake = new FakeMailService().failAllWith('CONNECTION');
    await expect(fake.send(MESSAGE)).rejects.toBeInstanceOf(MailSendError);
    await expect(fake.send(MESSAGE)).rejects.toBeInstanceOf(MailSendError);
    expect(fake.sent).toHaveLength(0);

    fake.reset();
    expect(fake.attempts).toHaveLength(0);
    await expect(fake.send(MESSAGE)).resolves.toBeUndefined();
  });
});
