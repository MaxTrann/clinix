import type {
  AppException,
  ErrorBody,
} from '../common/errors/app.exception.js';
import { parsePublicId } from '../search/common/id-param.js';
import {
  chatFailureException,
  type ChatSendFailure,
} from './chat.constants.js';

describe('chat B1 — lỗi có kiểu sang lỗi API (PLAN 5.14)', () => {
  it.each<[ChatSendFailure, number, string]>([
    [{ kind: 'NotFound' }, 404, 'KHONG_TIM_THAY'],
    [{ kind: 'Forbidden' }, 403, 'KHONG_DU_QUYEN'],
    [{ kind: 'RecipientInactive' }, 409, 'CHAT_NGUOI_NHAN_KHONG_HOAT_DONG'],
    [{ kind: 'SendIdUsed' }, 409, 'CHAT_MA_GUI_DA_DUNG'],
    [{ kind: 'RateLimited' }, 429, 'CHAT_GUI_QUA_NHANH'],
  ])('%o ⇒ %i %s', (failure, status, maLoi) => {
    const error = chatFailureException(failure);
    expect(error.getStatus()).toBe(status);
    expect((error.getResponse() as ErrorBody).maLoi).toBe(maLoi);
  });

  it('chat B2 QCH-07: 404 của chat CÙNG thân với 404 do id sai dạng (pipe `parsePublicId`), không lộ "sai dạng" khác "không thấy"', () => {
    let pipeBody: unknown;
    try {
      parsePublicId('abc');
    } catch (error) {
      pipeBody = (error as AppException).getResponse();
    }
    expect(chatFailureException({ kind: 'NotFound' }).getResponse()).toEqual(
      pipeBody,
    );
  });

  it('dữ liệu sai ⇒ 400 DU_LIEU_KHONG_HOP_LE kèm loi[{truong, ma}]; thân lỗi không có nội dung tin (BCH-06)', () => {
    const error = chatFailureException({
      kind: 'Invalid',
      loi: [{ truong: 'noiDung', ma: 'NOI_DUNG_QUA_DAI' }],
    });
    expect(error.getStatus()).toBe(400);
    expect(error.getResponse()).toEqual({
      maLoi: 'DU_LIEU_KHONG_HOP_LE',
      thongBao: expect.any(String) as string,
      loi: [{ truong: 'noiDung', ma: 'NOI_DUNG_QUA_DAI' }],
    });
  });
});
