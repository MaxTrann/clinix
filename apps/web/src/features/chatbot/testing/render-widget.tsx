import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { createMemoryRouter, Outlet } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { resetSelectedBranchForTest } from '../../../shared/branch-selection';
import { fakeMatchMedia } from '../../../test/fake-match-media';
import { resetAuthForTest } from '../../auth/auth-session';
import { setAuthState } from '../../auth/auth-store';
import type { VaiTro } from '../../auth';
import { ChatbotWidget } from '../widget/chatbot-widget';
import { createFakeChatbotApi, type FakeChatbot } from './fake-chatbot-api';

// CHỈ DÙNG TRONG TEST. Dựng khung chat trong một router thật (MemoryRouter dạng data router) với phiên giả và lớp API giả.
export type TestRole = 'guest' | VaiTro | 'checking' | 'error';

export function setTestAuth(role: TestRole): void {
  if (role === 'guest') {
    setAuthState({ status: 'unauthenticated', user: null });
  } else if (role === 'checking') {
    setAuthState({ status: 'checking', user: null });
  } else if (role === 'error') {
    setAuthState({ status: 'error', user: null, error: new Error('x') });
  } else {
    setAuthState({
      status: 'authenticated',
      user: { vaiTro: role, hoTen: 'Người dùng thử', daXacMinhEmail: true },
    });
  }
}

export interface RenderWidgetOptions {
  fake?: FakeChatbot;
  role?: TestRole;
  path?: string;
  // Bề ngang cửa sổ giả: dưới 640 là màn hẹp
  width?: number;
  messagesPath?: string | null;
}

export function renderWidget(options: RenderWidgetOptions = {}) {
  const media = fakeMatchMedia(options.width ?? 1024);
  setTestAuth(options.role ?? 'guest');
  const fake = options.fake ?? createFakeChatbotApi();
  const api = fake.api;
  const messagesPath = options.messagesPath;

  function Host() {
    return (
      <>
        <ChatbotWidget
          api={api}
          {...(messagesPath === undefined ? {} : { messagesPath })}
        />
        <Outlet />
      </>
    );
  }
  const router = createMemoryRouter(
    [
      {
        element: <Host />,
        children: [{ path: '*', element: <p>Trang thử</p> }],
      },
    ],
    { initialEntries: [options.path ?? '/'] },
  );
  const view = render(<RouterProvider router={router} />);
  return { router, fake, media, ...view };
}

// Dọn mọi thứ mà `renderWidget` và các ca đổi: gọi trong `afterEach`
export function resetWidgetTest(): void {
  // Gỡ component TRƯỚC khi đặt lại phiên, kẻo đổi store làm component đang gắn cập nhật ngoài `act`
  cleanup();
  resetAuthForTest();
  resetSelectedBranchForTest();
  window.localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
}

export async function navigate(
  router: ReturnType<typeof renderWidget>['router'],
  to: string,
): Promise<void> {
  await act(async () => {
    await router.navigate(to);
  });
}

export const launcher = () => screen.getByRole('button', { name: 'Trợ lý AI' });
export const queryLauncher = () =>
  screen.queryByRole('button', { name: 'Trợ lý AI' });
export const composer = () =>
  screen.getByRole('textbox', { name: 'Nhập câu hỏi của bạn' });
export const sendButton = () => screen.getByRole('button', { name: 'Gửi' });

export function openWidget(): void {
  fireEvent.click(launcher());
}

export function acceptConsent(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Tôi hiểu' }));
}

export function typeQuestion(text: string): void {
  fireEvent.change(composer(), { target: { value: text } });
}

export function pressKey(
  element: Element,
  key: string,
  init: KeyboardEventInit = {},
): void {
  fireEvent.keyDown(element, { key, ...init });
}

// Mở khung, bấm "Tôi hiểu", gõ và gửi một câu
export function openAndAsk(text: string): void {
  openWidget();
  acceptConsent();
  askQuestion(text);
}

export function askQuestion(text: string): void {
  typeQuestion(text);
  fireEvent.click(sendButton());
}
