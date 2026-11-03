import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Merge conditional classes so a caller's override wins over a base style. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
