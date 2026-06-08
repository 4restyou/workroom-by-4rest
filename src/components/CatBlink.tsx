import cat1 from "../../assets/cat1.svg";
import cat2 from "../../assets/cat2.svg";
import cat3 from "../../assets/cat3.svg";

type CatBlinkProps = {
  className?: string;
};

// The cat blinks (and flicks its tail): cat1 (eyes open) is the base; cat2
// (half / tail moved) and cat3 (closed) are stacked on top and flashed in
// sequence via CSS (see globals.css). Frames share an identical head/body but
// cat2 has a slightly shorter canvas (the tail moves), so the images are
// width-sized and top-aligned — the eyes stay put while the tail animates.
// The parent (className) sets the width.
export default function CatBlink({ className = "" }: CatBlinkProps) {
  return (
    <span className={`relative inline-block ${className}`}>
      <img className="cat-blink-open block h-auto w-full" src={cat1} alt="WORKROOM 고양이" />
      <img className="cat-blink-half pointer-events-none absolute left-0 top-0 h-auto w-full" src={cat2} alt="" aria-hidden />
      <img className="cat-blink-closed pointer-events-none absolute left-0 top-0 h-auto w-full" src={cat3} alt="" aria-hidden />
    </span>
  );
}
