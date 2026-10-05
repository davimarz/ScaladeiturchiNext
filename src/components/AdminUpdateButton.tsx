"use client";

import { useFormStatus } from "react-dom";

export default function AdminUpdateButton({ idleLabel }: { idleLabel: string }) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending} aria-busy={pending}>
      {pending ? "Aggiornamento in corso…" : idleLabel}
    </button>
  );
}
