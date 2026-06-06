import { Link, NavLink } from "react-router-dom";
import logoSig from "../../assets/logo/logo_sig.png";

type HeaderProps = {
  isAdmin: boolean;
};

export default function Header({ isAdmin }: HeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-workroom-line bg-workroom-background/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3.5">
        <Link className="flex min-w-0 items-center gap-2" to="/">
          <img className="h-8 w-auto max-w-[124px] object-contain" src={logoSig} alt="WORKROOM by 4REST" />
        </Link>

        <nav className="flex items-center gap-3 text-xs font-bold text-workroom-muted sm:gap-5 sm:text-sm">
          {isAdmin ? (
            <>
              <NavLink to="/admin/reservations">예약관리</NavLink>
              <NavLink to="/admin/members">회원관리</NavLink>
              <NavLink to="/">사이트</NavLink>
            </>
          ) : (
            <>
              <a href="/#space">공간</a>
              <a href="/#pricing">이용권</a>
              <Link to="/reserve">예약</Link>
              <Link to="/account">내정보</Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
