import { Link } from "react-router-dom";

export default function FixedReserveButton() {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-workroom-line bg-workroom-background/95 p-3 backdrop-blur sm:hidden">
      <Link
        className="block rounded-full bg-workroom-text px-5 py-4 text-center text-base font-bold text-white transition active:scale-[0.99] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-workroom-yellow"
        to="/reserve"
      >
        예약하기
      </Link>
    </div>
  );
}
