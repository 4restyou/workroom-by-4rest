import catImage from "../../assets/cat.svg";

// The cat is a single-colour SVG with 600+ halftone paths, so its eyes can't be
// isolated. Instead we overlay a matching-viewBox SVG with two "eyelids" that
// drop down over the eyes (the cat's eye centres are ~133/238 x, ~135 y).
const EYES = [133, 238];

export default function CatBlink({ className = "h-28" }: { className?: string }) {
  return (
    <div className={`relative inline-block ${className}`}>
      <img className="block h-full w-auto" src={catImage} alt="WORKROOM 고양이" />
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox="0 0 360.64 482.85"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden
      >
        {EYES.map((cx) => (
          <g key={cx} className="origin-top animate-cat-lid [transform-box:fill-box]">
            <ellipse cx={cx} cy={135} rx={31} ry={42} fill="#F4EEE1" />
            <path d={`M${cx - 23} 135 q23 9 46 0`} fill="none" stroke="#101112" strokeWidth="5" strokeLinecap="round" />
          </g>
        ))}
      </svg>
    </div>
  );
}
