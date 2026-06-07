import type { ReactNode } from "react";
import { badge, type TintColor } from "../lib/ui";

type SectionProps = {
  id?: string;
  eyebrow?: string;
  title: string;
  accent?: TintColor;
  action?: ReactNode;
  children: ReactNode;
};

export default function Section({ id, eyebrow, title, accent = "yellow", action, children }: SectionProps) {
  return (
    <section id={id} className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          {eyebrow ? <span className={`${badge(accent)} mb-3 uppercase tracking-[0.12em]`}>{eyebrow}</span> : null}
          <h2 className="max-w-2xl text-3xl font-black leading-[1.1] tracking-tight sm:text-4xl">{title}</h2>
        </div>
        {action ? <div className="flex flex-wrap items-center gap-2">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}
