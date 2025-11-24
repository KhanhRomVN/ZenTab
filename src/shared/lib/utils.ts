import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Hàm trừ hai số nguyên
 * @param a Số nguyên thứ nhất
 * @param b Số nguyên thứ hai
 * @returns Kết quả phép trừ a - b
 */
export function subtract(a: number, b: number): number {
  return a - b;
}
