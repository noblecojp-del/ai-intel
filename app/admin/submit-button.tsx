"use client";
import { useFormStatus } from "react-dom";

export function SubmitButton({ children, pending, className }: { children: React.ReactNode; pending: string; className?: string }) {
  const s = useFormStatus();
  return <button type="submit" disabled={s.pending} className={className}>{s.pending ? pending : children}</button>;
}
