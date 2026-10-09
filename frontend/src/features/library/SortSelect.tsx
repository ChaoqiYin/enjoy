import { ArrowDownUp } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../shared/ui/select';
import { cn } from '../../shared/ui/cn';

export type SortOption = { value: string; label: string };

export type SortSelectProps = {
  value: string;
  /** The orders to offer, in the order to offer them. The words are the
   *  caller's: 最近播放 is one entry and not two directions (ADR 0016), and
   *  which words say that is not this control's to decide. */
  options: SortOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  'aria-label'?: string;
  className?: string;
};

/** How a listing is read: newest first, most recently played first, by name, or
 *  largest first. */
export function SortSelect({
  value,
  options,
  onChange,
  disabled,
  className,
  ...props
}: SortSelectProps) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger
        size="default"
        data-slot="sort-select"
        className={cn('w-full min-w-44 sm:w-56', className)}
        {...props}
      >
        <ArrowDownUp
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground"
        />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
