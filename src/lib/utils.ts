import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function id(prefix = "id") {
  const cryptoId = globalThis.crypto?.randomUUID?.();
  return cryptoId ? `${prefix}_${cryptoId}` : `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function addDaysIso(dateIso: string, days: number) {
  const date = new Date(`${dateIso}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function daysBetween(startIso: string, endIso: string) {
  const start = new Date(`${startIso}T12:00:00`).getTime();
  const end = new Date(`${endIso}T12:00:00`).getTime();
  return Math.round((end - start) / 86_400_000);
}

export function formatCurrency(value: number, currency = "USD") {
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value || 0);
}

export function formatNumber(value: number, maximumFractionDigits = 1) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits }).format(value || 0);
}

export function downloadTextFile(fileName: string, text: string, mimeType = "text/plain") {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function titleCase(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}
