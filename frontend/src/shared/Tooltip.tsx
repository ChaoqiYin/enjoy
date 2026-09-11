import type { ReactNode } from 'react';

type TooltipProps = {
  text: string;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
};

export function Tooltip({
  text,
  children,
  className = '',
  disabled = false,
}: TooltipProps) {
  if (disabled) return <>{children}</>;
  return (
    <span
      className={`tooltip tooltip-top tooltip-end ${className}`}
      data-tip={text}
    >
      {children}
    </span>
  );
}
