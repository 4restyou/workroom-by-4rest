import cat1 from "../../assets/cat1.svg";
import cat2 from "../../assets/cat2.svg";
import cat3 from "../../assets/cat3.svg";

type CatBlinkProps = {
  className?: string;
};

// The cat blinks: cat1 (eyes open) is the base; cat2 (half) and cat3 (closed)
// are stacked on top and flashed in sequence via CSS (see globals.css). The
// three frames share an identical body, so toggling opacity reads as a blink.
export default function CatBlink({ className = "" }: CatBlinkProps) {
  return (
    <span className={`relative inline-block ${className}`}>
      <img className="cat-blink-open block h-full w-auto" src={cat1} alt="WORKROOM 고양이" />
      <img className="cat-blink-half pointer-events-none absolute inset-0 h-full w-full" src={cat2} alt="" aria-hidden />
      <img className="cat-blink-closed pointer-events-none absolute inset-0 h-full w-full" src={cat3} alt="" aria-hidden />
    </span>
  );
}
