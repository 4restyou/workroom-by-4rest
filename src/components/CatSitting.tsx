type CatSittingProps = {
  className?: string;
};

// Minimal black-line sitting cat for the footer. Eyes blink via the
// `animate-cat-blink` keyframe (transform-box keeps the scale centered).
export default function CatSitting({ className }: CatSittingProps) {
  return (
    <svg viewBox="0 0 100 122" className={className} role="img" aria-label="WORKROOM 고양이" fill="none">
      <g stroke="#141414" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
        {/* tail */}
        <path d="M68 104 C92 102 90 70 75 76 C68 79 69 88 75 89" fill="#F4EEE1" />
        {/* body */}
        <path d="M34 62 C24 82 27 108 50 110 C73 108 76 82 66 62 Z" fill="#fff" />
        {/* front paws */}
        <ellipse cx="40" cy="105" rx="8" ry="6.5" fill="#fff" />
        <ellipse cx="60" cy="105" rx="8" ry="6.5" fill="#fff" />
        <path d="M40 100 L40 109 M60 100 L60 109" strokeWidth="2.2" />
        {/* head */}
        <circle cx="50" cy="42" r="24" fill="#fff" />
        {/* ears */}
        <path d="M33 27 L30 7 L50 23 Z" fill="#fff" />
        <path d="M67 27 L70 7 L50 23 Z" fill="#fff" />
        {/* nose + mouth */}
        <path d="M50 49 L47 52 L53 52 Z" fill="#141414" stroke="none" />
        <path d="M50 52 C50 56 46 57 43 55 M50 52 C50 56 54 57 57 55" strokeWidth="2.4" />
        {/* whiskers */}
        <g strokeWidth="2">
          <path d="M22 45 L36 47 M22 51 L36 50" />
          <path d="M78 45 L64 47 M78 51 L64 50" />
        </g>
      </g>
      {/* eyes (blink) */}
      <g className="origin-center animate-cat-blink [transform-box:fill-box]">
        <circle cx="41" cy="42" r="5.6" fill="#141414" />
        <circle cx="59" cy="42" r="5.6" fill="#141414" />
        <circle cx="43" cy="40" r="1.6" fill="#fff" />
        <circle cx="61" cy="40" r="1.6" fill="#fff" />
      </g>
    </svg>
  );
}
