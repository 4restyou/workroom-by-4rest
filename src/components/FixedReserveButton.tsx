import { Link } from "react-router-dom";

export default function FixedReserveButton() {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t-2 border-workroom-line bg-workroom-background/95 p-3 backdrop-blur sm:hidden">
      <Link
        className="block rounded-full border-2 border-workroom-line bg-workroom-text px-5 py-4 text-center text-base font-black text-white"
        to="/reserve"
      >
        예약하기
      </Link>
    </div>
  );
}
