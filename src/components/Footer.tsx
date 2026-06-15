import { Link } from "react-router-dom";
import logoSig from "../../assets/logo/logo_sig.png";
import CatBlink from "./CatBlink";
import { SITE } from "../lib/site";

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t-2 border-workroom-ink bg-workroom-background">
      <div className="mx-auto max-w-5xl px-4 py-10 pb-24 sm:pb-10">
        <div className="grid gap-8 sm:grid-cols-[1.3fr_1fr_1fr]">
          <div>
            <img className="h-8 w-auto max-w-[140px] object-contain" src={logoSig} alt="WORKROOM by 4REST" />
            <p className="mt-3 max-w-xs text-sm font-medium leading-6 text-workroom-muted">
              필요한 시간만큼 머무는 조용한 작업 공간. 충장로에서 예약제로 운영합니다.
            </p>
          </div>

          <div>
            <p className="text-xs font-black uppercase tracking-[0.12em] text-workroom-muted">Contact</p>
            <p className="mt-3 text-sm font-medium leading-6 text-workroom-muted">{SITE.address}</p>
            <a href={`tel:${SITE.phone}`} className="mt-1 inline-block text-sm font-bold underline underline-offset-2">
              {SITE.phone}
            </a>
          </div>

          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.12em] text-workroom-muted">Follow</p>
              <div className="mt-3 grid gap-1.5 text-sm font-bold">
                <a className="transition-colors hover:text-workroom-muted" href={SITE.instagramUrl} rel="noreferrer" target="_blank">
                  Instagram
                </a>
                <a className="transition-colors hover:text-workroom-muted" href={SITE.threadsUrl} rel="noreferrer" target="_blank">
                  Threads
                </a>
              </div>
            </div>
            <CatBlink className="h-24 w-auto shrink-0" />
          </div>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t-2 border-workroom-line pt-5">
          <div className="flex flex-wrap gap-4 text-xs font-bold">
            <Link className="transition-colors hover:text-workroom-muted" to="/directory">
              명함첩
            </Link>
            <Link className="transition-colors hover:text-workroom-muted" to="/board">
              메모판
            </Link>
            <Link className="transition-colors hover:text-workroom-muted" to="/faq">
              이용안내
            </Link>
            <Link className="transition-colors hover:text-workroom-muted" to="/terms">
              이용약관
            </Link>
            <Link className="transition-colors hover:text-workroom-muted" to="/privacy">
              개인정보처리방침
            </Link>
          </div>
          <p className="text-xs font-medium text-workroom-muted">© {year} WORKROOM by 4REST</p>
        </div>
      </div>
    </footer>
  );
}
