import type { ReactNode } from "react";

export default function AdminPage({
  actions,
  children,
  description,
  title,
}: {
  actions?: ReactNode;
  children: ReactNode;
  description?: ReactNode;
  title: string;
}) {
  return (
    <main className="pb-10 sm:pb-14">
      <section className="mx-auto max-w-6xl px-4 pt-7 sm:px-6 sm:pt-10">
        <header className="mb-5 flex flex-col gap-4 border-b border-workroom-ink pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
            {description ? <div className="mt-1.5 text-sm font-medium leading-6 text-workroom-muted">{description}</div> : null}
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
        </header>
        {children}
      </section>
    </main>
  );
}

export function AdminTabs<T extends string>({
  items,
  onChange,
  value,
}: {
  items: Array<{ value: T; label: string; count?: number }>;
  onChange: (value: T) => void;
  value: T;
}) {
  return (
    <div className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto border-b border-workroom-line px-1" role="tablist">
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            aria-selected={active}
            className={`relative shrink-0 px-3 py-3 text-sm font-semibold transition-colors ${active ? "text-workroom-ink" : "text-workroom-muted hover:text-workroom-ink"}`}
            key={item.value}
            onClick={() => onChange(item.value)}
            role="tab"
            type="button"
          >
            {item.label}
            {typeof item.count === "number" ? <span className="ml-1.5 text-xs tabular-nums">{item.count}</span> : null}
            {active ? <span className="absolute inset-x-0 bottom-[-1px] h-0.5 bg-workroom-ink" /> : null}
          </button>
        );
      })}
    </div>
  );
}

export function AdminFeedback({ error, success }: { error?: string; success?: string }) {
  if (!error && !success) return null;
  return (
    <div
      className={`mb-4 border px-4 py-3 text-sm font-semibold ${error ? "border-red-400 bg-workroom-danger/35" : "border-workroom-line bg-white"}`}
      role={error ? "alert" : "status"}
    >
      {error || success}
    </div>
  );
}

export function AdminEmpty({ children }: { children: ReactNode }) {
  return <p className="border border-dashed border-workroom-line bg-white/40 px-4 py-8 text-center text-sm font-medium text-workroom-muted">{children}</p>;
}
