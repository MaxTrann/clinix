export function LoadingState({
  message = 'Đang tải...',
}: {
  message?: string;
}) {
  return (
    <p
      role="status"
      className="my-2 rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-600"
    >
      {message}
    </p>
  );
}
