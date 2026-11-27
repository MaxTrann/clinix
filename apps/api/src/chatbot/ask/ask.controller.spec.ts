import type { Response } from 'express';
import { AppException } from '../../common/errors/app.exception.js';
import { AskController } from './ask.controller.js';
import type { AskMessageDto, AskResponse } from './ask.dto.js';
import { AskBusyError, AskRateLimitedError } from './ask.errors.js';
import type { AskInput, AskService } from './ask.service.js';

// chatbot B3 — controller chỉ nhận và trả; việc DUY NHẤT nó thêm là header `Retry-After` của 429 (TLA-13). Header `no-store`, mã 200 và `@Public` ở ask.wiring.spec.ts.
// Mã ca bổ sung `B3-Cnn`.

const BODY = { cauHoi: 'Xin chào' } as AskMessageDto;
const OK: AskResponse = {
  ketQua: 'TraLoi',
  doan: [{ kieu: 'chu', chu: 'Chào bạn' }],
  chuyenKhoaGoiY: [],
  lienKet: [],
  coTheGuiLai: false,
  tinhVaoLichSu: true,
};

function setup(behaviour: (input: AskInput) => Promise<AskResponse>) {
  const received: AskInput[] = [];
  const headers = new Map<string, string>();
  const service = {
    ask: (input: AskInput) => {
      received.push(input);
      return behaviour(input);
    },
  } as unknown as AskService;
  const res = {
    setHeader: (name: string, value: string) => headers.set(name, value),
  } as unknown as Response;
  return { controller: new AskController(service), received, headers, res };
}

describe('AskController', () => {
  it('B3-C01: chuyển nguyên thân và IP cho service, trả đúng kết quả của service, không đặt header nào', async () => {
    const { controller, received, headers, res } = setup(() =>
      Promise.resolve(OK),
    );
    await expect(controller.ask(BODY, '203.0.113.5', res)).resolves.toBe(OK);
    expect(received).toEqual([{ body: BODY, ip: '203.0.113.5' }]);
    expect(headers.size).toBe(0);
  });

  it('TLA-13: 429 ⇒ đặt Retry-After đúng số giây (chuỗi số nguyên) rồi ném LẠI đúng lỗi đó', async () => {
    const error = new AskRateLimitedError(37);
    const { controller, headers, res } = setup(() => Promise.reject(error));
    await expect(controller.ask(BODY, '1.1.1.1', res)).rejects.toBe(error);
    expect(headers.get('Retry-After')).toBe('37');
    expect(headers.size).toBe(1);
  });

  it.each([
    ['503', new AskBusyError()],
    ['400', new AppException(400, 'DU_LIEU_KHONG_HOP_LE')],
    ['500', new Error('lỗi lạ')],
  ])(
    'B3-C02: lỗi %s ⇒ ném lại nguyên vẹn, KHÔNG đặt Retry-After',
    async (_name, error) => {
      const { controller, headers, res } = setup(() => Promise.reject(error));
      await expect(controller.ask(BODY, '1.1.1.1', res)).rejects.toBe(error);
      expect(headers.has('Retry-After')).toBe(false);
    },
  );
});
