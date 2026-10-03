import type { ReactNode } from "react";

export function StepHeading({ step, title }: { step: string; title: string }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <span className="grid h-8 w-8 place-items-center rounded-pill border border-workroom-line bg-workroom-yellow text-sm font-bold">
        {step}
      </span>
      <h2 className="text-xl font-bold">{title}</h2>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-2 text-sm font-bold">
      <span>{label}</span>
      {children}
    </label>
  );
}
