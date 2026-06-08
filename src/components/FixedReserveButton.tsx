import { Link } from "react-router-dom";
import { buttonClass } from "../lib/ui";

export default function FixedReserveButton() {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t-2 border-workroom-ink bg-workroom-background/95 px-4 pt-3 pb-[max(0.875rem,env(safe-area-inset-bottom))] backdrop-blur sm:hidden">
      <Link className={buttonClass("accent", "lg", "w-full")} to="/reserve">
        예약하기 →
      </Link>
    </div>
  );
}
