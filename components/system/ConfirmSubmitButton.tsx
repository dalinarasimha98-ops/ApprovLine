'use client';

import { useFormStatus } from 'react-dom';

type ConfirmSubmitButtonProps = {
  children: React.ReactNode;
  pendingText?: string;
  confirmMessage: string;
  className?: string;
};

export function ConfirmSubmitButton({
  children,
  pendingText = 'Working...',
  confirmMessage,
  className,
}: ConfirmSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      onClick={(event) => {
        if (!window.confirm(confirmMessage)) event.preventDefault();
      }}
      className={`${className ?? ''} ${pending ? 'cursor-wait opacity-80' : ''}`}
    >
      {pending ? (
        <>
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
          {pendingText}
        </>
      ) : (
        children
      )}
    </button>
  );
}
