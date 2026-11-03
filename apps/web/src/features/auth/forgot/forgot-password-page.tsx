import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { AuthCard } from '../../../shared/ui/auth-card';
import { LoadingState } from '../../../shared/ui/loading-state';
import { useAuth } from '../auth-store';
import { FORGOT_PASSWORD_PATH, homePathFor } from '../roles';
import { CodeStep } from './code-step';
import { DonePanel } from './done-panel';
import { EmailStep, type CodeSent } from './email-step';
import { PasswordStep } from './password-step';
import { flowFromState, routeStateFor, type Flow } from './forgot-state';
import { StepBar } from './step-bar';

const STEP_INDEX: Record<Flow['step'], number> = {
  email: 0,
  code: 1,
  password: 2,
  done: 3,
};

function subtitleFor(flow: Flow): string {
  switch (flow.step) {
    case 'email':
      return 'Nhập email để nhận mã OTP';
    case 'code':
      return `Nhập mã gửi đến ${flow.email}`;
    case 'password':
      return 'Đặt mật khẩu mới';
    case 'done':
      return 'Hoàn tất';
  }
}

// Một route, ba bước trong state của trang (D7). Mọi lần đổi bước dùng `replace`: Back rời trang, không quay giữa các bước,
// nên `resetToken` không bao giờ nằm trong một mục lịch sử nào.
function ForgotPasswordFlow({ initial }: { initial: Flow }) {
  const navigate = useNavigate();
  const [flow, setFlow] = useState(initial);

  // Mọi lần `go` đều đổi sang bước KHÁC, tức một component khác ở cùng chỗ, nên React gắn mới: biểu mẫu, bộ đếm và câu thông báo
  // bắt đầu lại từ dữ liệu của bước đó. Nếu sau này có chuyển trong cùng một bước thì phải thêm `key` để vẫn gắn mới.
  function go(next: Flow) {
    setFlow(next);
    navigate(FORGOT_PASSWORD_PATH, {
      replace: true,
      state: routeStateFor(next),
    });
  }

  function backToEmail(email: string, notice: string | null) {
    go({ step: 'email', email, notice });
  }

  function toCode(sent: CodeSent) {
    go({ step: 'code', ...sent });
  }

  let body;
  switch (flow.step) {
    case 'email':
      body = (
        <EmailStep
          initialEmail={flow.email}
          notice={flow.notice}
          onSent={toCode}
        />
      );
      break;
    case 'code':
      body = (
        <CodeStep
          email={flow.email}
          marks={flow.marks}
          fresh={flow.fresh}
          mailFailed={flow.mailFailed}
          onMarks={(marks) => {
            // Cùng một lần gắn: chỉ cập nhật mốc cho lần tải lại, không gắn lại bước
            setFlow({ ...flow, marks });
            navigate(FORGOT_PASSWORD_PATH, {
              replace: true,
              state: routeStateFor({ ...flow, marks }),
            });
          }}
          onVerified={(resetToken) =>
            go({
              step: 'password',
              email: flow.email,
              marks: flow.marks,
              resetToken,
            })
          }
          onBackToEmail={(notice) => backToEmail(flow.email, notice)}
        />
      );
      break;
    case 'password':
      body = (
        <PasswordStep
          resetToken={flow.resetToken}
          onDone={(result) =>
            go({
              step: 'done',
              email: flow.email,
              taiKhoanNgung: result.taiKhoanNgung === true,
              canDangKyLai: result.canDangKyLai === true,
            })
          }
          onBackToEmail={(notice) => backToEmail(flow.email, notice)}
          // Bỏ token: quay về nhập mã như sau khi tải lại, đếm theo đồng hồ máy
          onBackToCode={() =>
            go({
              step: 'code',
              email: flow.email,
              marks: flow.marks,
              fresh: false,
              mailFailed: false,
            })
          }
        />
      );
      break;
    case 'done':
      body = (
        <DonePanel
          email={flow.email}
          taiKhoanNgung={flow.taiKhoanNgung}
          canDangKyLai={flow.canDangKyLai}
        />
      );
      break;
  }

  return (
    <AuthCard title="Quên mật khẩu" subtitle={subtitleFor(flow)}>
      {flow.step !== 'done' && <StepBar current={STEP_INDEX[flow.step]} />}
      {body}
    </AuthCard>
  );
}

export function ForgotPasswordPage() {
  const { status, user } = useAuth();
  const location = useLocation();
  // Chỉ đọc lần đầu; về sau trang tự ghi `location.state` khi đổi bước
  const [initial] = useState(() => flowFromState(location.state));

  if (status === 'checking') return <LoadingState />;
  if (user) return <Navigate to={homePathFor(user.vaiTro)} replace />;
  return <ForgotPasswordFlow initial={initial} />;
}
