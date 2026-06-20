import type { ReactNode } from "react";
import Reveal from "./Reveal";
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
    <section id={id} className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-20">
      <Reveal>
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4 border-t border-workroom-ink pt-4 sm:mb-10">
          <div>
            {eyebrow ? <span className={`${badge(accent)} mb-3 uppercase tracking-[0.14em]`}>{eyebrow}</span> : null}
            <h2 className="max-w-3xl font-display text-2xl font-bold leading-[1.2] tracking-[-0.025em] sm:text-[2.5rem]">{title}</h2>
          </div>
          {action ? <div className="flex flex-wrap items-center gap-2">{action}</div> : null}
        </div>
        {children}
      </Reveal>
    </section>
  );
}
