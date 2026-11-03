import { RefreshCw } from 'lucide-react';

interface ResendButtonProps {
  // Số giây còn phải chờ; 0 là bấm được
  remaining: number;
  disabled?: boolean;
  onClick: () => void;
}

// Giữ một nút duy nhất để focus không mất khi đếm xong. Tên đọc được cố định, số đếm không được đọc lại mỗi giây.
export function ResendButton({
  remaining,
  disabled,
  onClick,
}: ResendButtonProps) {
  const waiting = remaining > 0;
  return (
    <button
      type="button"
      aria-label="Gửi lại mã"
      disabled={waiting || disabled}
      onClick={onClick}
      className={
        waiting || disabled
          ? 'text-gray-500'
          : 'inline-flex items-center gap-1 text-brand-strong hover:underline'
      }
    >
      {waiting ? (
        `Gửi lại sau ${remaining}s`
      ) : (
        <>
          <RefreshCw className="size-3.5" aria-hidden="true" />
          Gửi lại mã
        </>
      )}
    </button>
  );
}
