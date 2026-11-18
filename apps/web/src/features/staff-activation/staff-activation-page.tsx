import { useEffect, useState } from 'react';
import { AuthCard } from '../../shared/ui/auth-card';
import { ErrorState } from '../../shared/ui/error-state';
import { LoadingState } from '../../shared/ui/loading-state';
import { describeValidateError } from './activation-errors';
import { ActivationForm } from './activation-form';
import {
  clearActivationFragment,
  readActivationLink,
  type ActivationLink,
} from './activation-link';
import { ActivatedPanel, InvalidLinkPanel } from './activation-result-panels';
import { validateActivationLink } from './activation-service';

// Trang công khai `/kich-hoat` (admin F10; PLAN admin 5.5, Q25, NS b8 đến b12, A5, A6). Không đọc `useAuth` hay `useLocation`: người đã
// đăng nhập vẫn thấy trang bình thường (Đại chọn), và `useLocation` còn giữ fragment trong bộ nhớ của router sau khi URL đã được xoá.
//
// `link` (id và token) CHỈ nằm trong `stage` của trang, và chỉ ở những màn còn cần nó. Rời sang "không hợp lệ" hay "thành công" là mất token.
type Stage =
  | { kind: 'checking'; link: ActivationLink }
  | { kind: 'form'; link: ActivationLink }
  | { kind: 'unreachable'; link: ActivationLink; error: unknown }
  | { kind: 'invalid' }
  | { kind: 'done' };

// Đọc fragment MỘT LẦN, ở hàm khởi tạo của `useState`, rồi giữ trong bộ nhớ. Hàm này chỉ ĐỌC (không xoá), nên StrictMode gọi hai lần vẫn cho
// cùng kết quả. Việc xoá nằm ở effect: nếu đọc trong effect thì lần chạy lại thứ hai của StrictMode (dev) thấy hash đã rỗng và hiện nhầm
// "Liên kết không hợp lệ". Không có fragment (ví dụ tải lại trang) ⇒ "không hợp lệ" ngay, không gọi API.
function initialStage(): Stage {
  const link = readActivationLink(window.location.hash);
  return link === null ? { kind: 'invalid' } : { kind: 'checking', link };
}

export function StaffActivationPage() {
  const [stage, setStage] = useState<Stage>(initialStage);

  // Xoá fragment khỏi thanh địa chỉ ngay khi trang tải (Q25). Khai báo TRƯỚC effect gọi API nên chạy trước nó.
  useEffect(() => {
    clearActivationFragment();
  }, []);

  // `validate` đúng một lần cho mỗi lần vào trạng thái "đang kiểm tra" (lần đầu hoặc bấm Thử lại); không gọi lại khi quay lại tab.
  // StrictMode (dev) chạy effect hai lần: lần đầu bị huỷ bởi hàm dọn, lần hai gọi lại. `validate` chỉ đọc nên vô hại.
  const checkingLink = stage.kind === 'checking' ? stage.link : null;
  useEffect(() => {
    if (checkingLink === null) return;
    const controller = new AbortController();
    validateActivationLink(checkingLink, controller.signal).then(
      () => setStage({ kind: 'form', link: checkingLink }),
      (error: unknown) => {
        const failure = describeValidateError(error);
        if (failure.kind === 'ignored') return;
        setStage(
          failure.kind === 'invalid'
            ? { kind: 'invalid' }
            : { kind: 'unreachable', link: checkingLink, error: failure.error },
        );
      },
    );
    return () => controller.abort();
  }, [checkingLink]);

  let subtitle: string | undefined;
  let body;
  switch (stage.kind) {
    case 'checking':
      body = <LoadingState message="Đang kiểm tra liên kết..." />;
      break;
    case 'unreachable':
      body = (
        <ErrorState
          error={stage.error}
          onRetry={() => setStage({ kind: 'checking', link: stage.link })}
        />
      );
      break;
    case 'form':
      subtitle = 'Đặt mật khẩu để kích hoạt tài khoản của bạn';
      body = (
        <ActivationForm
          link={stage.link}
          onActivated={() => setStage({ kind: 'done' })}
          onInvalid={() => setStage({ kind: 'invalid' })}
        />
      );
      break;
    case 'invalid':
      body = <InvalidLinkPanel />;
      break;
    case 'done':
      body = <ActivatedPanel />;
      break;
  }

  return (
    <AuthCard title="Kích hoạt tài khoản" subtitle={subtitle}>
      {body}
    </AuthCard>
  );
}
