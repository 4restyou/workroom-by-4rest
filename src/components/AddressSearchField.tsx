import { useEffect, useRef, useState } from "react";
import { buttonClass } from "../lib/ui";

type PostcodeData = {
  userSelectedType: "R" | "J";
  roadAddress: string;
  jibunAddress: string;
};

type PostcodeInstance = {
  embed: (element: HTMLElement) => void;
};

type PostcodeConstructor = new (options: {
  oncomplete: (data: PostcodeData) => void;
  onresize?: (size: { height: number }) => void;
  width?: string;
  height?: string;
}) => PostcodeInstance;

declare global {
  interface Window {
    kakao?: {
      Postcode?: PostcodeConstructor;
    };
  }
}

const SCRIPT_ID = "kakao-postcode-script";
const SCRIPT_SRC = "https://t1.kakaocdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";

let scriptPromise: Promise<void> | null = null;

function loadPostcodeScript() {
  if (window.kakao?.Postcode) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    const script = existing ?? document.createElement("script");

    const handleLoad = () => {
      if (window.kakao?.Postcode) resolve();
      else reject(new Error("주소검색 서비스를 불러오지 못했습니다."));
    };
    const handleError = () => reject(new Error("주소검색 서비스를 불러오지 못했습니다."));

    script.addEventListener("load", handleLoad, { once: true });
    script.addEventListener("error", handleError, { once: true });

    if (!existing) {
      script.id = SCRIPT_ID;
      script.src = SCRIPT_SRC;
      script.async = true;
      document.head.appendChild(script);
    }
  }).catch((error) => {
    scriptPromise = null;
    throw error;
  });

  return scriptPromise;
}

type AddressSearchFieldProps = {
  address: string;
  detailAddress: string;
  onAddressChange: (value: string) => void;
  onDetailAddressChange: (value: string) => void;
};

export default function AddressSearchField({
  address,
  detailAddress,
  onAddressChange,
  onDetailAddressChange,
}: AddressSearchFieldProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState("");
  const postcodeHostRef = useRef<HTMLDivElement>(null);
  const detailInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    let canceled = false;

    void loadPostcodeScript()
      .then(() => {
        if (canceled || !postcodeHostRef.current || !window.kakao?.Postcode) return;
        const host = postcodeHostRef.current;
        host.replaceChildren();
        const postcode = new window.kakao.Postcode({
          oncomplete: (data) => {
            const selectedAddress = data.userSelectedType === "R" ? data.roadAddress : data.jibunAddress;
            onAddressChange(selectedAddress || data.roadAddress || data.jibunAddress);
            onDetailAddressChange("");
            setIsOpen(false);
            window.setTimeout(() => detailInputRef.current?.focus(), 0);
          },
          onresize: ({ height }) => {
            host.style.height = `${Math.min(Math.max(height, 360), 520)}px`;
          },
          width: "100%",
          height: "100%",
        });
        postcode.embed(host);
      })
      .catch((loadError) => {
        if (!canceled) {
          setError(loadError instanceof Error ? loadError.message : "주소검색 서비스를 불러오지 못했습니다.");
          setIsOpen(false);
        }
      });

    return () => {
      canceled = true;
    };
  }, [isOpen, onAddressChange, onDetailAddressChange]);

  return (
    <div className="grid gap-3">
      <label className="grid gap-2 text-sm font-bold">
        주소
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <input
            aria-label="검색한 주소"
            placeholder="주소 검색 버튼을 눌러 주세요"
            readOnly
            value={address}
          />
          <button
            className={buttonClass("secondary", "md")}
            onClick={() => {
              setError("");
              setIsOpen(true);
            }}
            type="button"
          >
            주소 검색
          </button>
        </div>
      </label>

      {address ? (
        <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
          <label className="grid gap-2 text-sm font-bold">
            상세주소
            <input
              ref={detailInputRef}
              placeholder="동·호수 등 선택 입력"
              value={detailAddress}
              onChange={(event) => onDetailAddressChange(event.target.value)}
            />
          </label>
          <button
            className={buttonClass("secondary", "sm")}
            onClick={() => {
              onAddressChange("");
              onDetailAddressChange("");
            }}
            type="button"
          >
            주소 지우기
          </button>
        </div>
      ) : null}

      {error ? <p className="text-xs font-bold text-red-600">{error}</p> : null}

      {isOpen ? (
        <div
          aria-label="주소 검색"
          aria-modal="true"
          className="fixed inset-0 z-[100] grid items-end bg-black/45 p-3 sm:place-items-center"
          role="dialog"
        >
          <div className="w-full max-w-xl overflow-hidden rounded-card border border-workroom-ink bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-workroom-line px-4 py-3">
              <div>
                <p className="font-black">주소 검색</p>
                <p className="mt-0.5 text-xs font-medium text-workroom-muted">도로명, 건물명 또는 지번으로 검색해 주세요.</p>
              </div>
              <button className={buttonClass("secondary", "sm")} onClick={() => setIsOpen(false)} type="button">
                닫기
              </button>
            </div>
            <div className="h-[min(62vh,520px)] min-h-[360px] w-full" ref={postcodeHostRef} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
