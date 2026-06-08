import { useEffect } from "react";
import { useLocation } from "react-router-dom";

// On every route change, jump to the top of the page. Anchor links (e.g.
// /#pricing) keep their own scroll target, so we skip when a hash is present.
export default function ScrollToTop() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (hash) return;
    window.scrollTo(0, 0);
  }, [pathname, hash]);

  return null;
}
