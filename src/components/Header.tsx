import { Link, NavLink } from "react-router-dom";

type HeaderProps = {
  isAdmin: boolean;
};

export default function Header({ isAdmin }: HeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b-2 border-workroom-line bg-workroom-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
        <Link className="flex min-w-0 items-center gap-2" to="/">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border-2 border-workroom-line bg-workroom-yellow font-black">
            4
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-black tracking-tight">WORKROOM</span>
            <span className="block text-[11px] font-black uppercase text-workroom-muted">by 4REST</span>
          </span>
        </Link>

        <nav className="flex items-center gap-3 text-xs font-black sm:text-sm">
          {isAdmin ? (
            <>
              <NavLink to="/admin/reservations">예약관리</NavLink>
              <NavLink to="/">사이트</NavLink>
            </>
          ) : (
            <>
              <a href="/#space">공간</a>
              <a href="/#pricing">이용권</a>
              <Link to="/reserve">예약</Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
