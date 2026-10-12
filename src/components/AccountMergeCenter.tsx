import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  clearPendingMerge,
  confirmAccountMerge,
  describeAccount,
  loadDuplicateAccounts,
  readPendingMerge,
  savePendingMerge,
  startAccountMerge,
  type DuplicateAccount,
} from "../lib/accountMerge";
import { confirmDialog } from "../lib/confirm";
import { useSession } from "../lib/sessionContext";
import { supabase } from "../lib/supabase";
import { buttonClass, tintCard } from "../lib/ui";

const DISMISS_KEY = "workroom:merge-dismissed";

function wasDismissed(userId: string) {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === userId;
  } catch {
    return false;
  }
}

function rememberDismiss(userId: string) {
  try {
    sessionStorage.setItem(DISMISS_KEY, userId);
  } catch {
    // 무시
  }
}

type Notice = { tone: "yellow" | "danger" | "mint"; text: string; actions?: "switch" };

// 계정 합치기를 앱 어디서든 이어 가게 하는 띠.
//   - 같은 연락처의 다른 계정이 있으면 합칠지 묻는다.
//   - 합치기를 시작하고 다른 계정으로 로그인해 오면 여기서 마무리한다(구글 로그인은
//     홈으로 돌아오므로 특정 화면에 두면 놓친다).
//   - 이미 합쳐진 계정으로 들어오면 어느 계정을 쓰면 되는지 알려 준다.
export default function AccountMergeCenter() {
  const navigate = useNavigate();
  const { status, isSignedIn, isAdmin, userId, profile } = useSession();
  const [duplicates, setDuplicates] = useState<DuplicateAccount[]>([]);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const confirmingRef = useRef(false);

  const pending = readPendingMerge();

  useEffect(() => {
    if (status !== "ready" || !isSignedIn || isAdmin || !userId) {
      setDuplicates([]);
      return;
    }

    const current = readPendingMerge();
    if (current) {
      if (confirmingRef.current) return;
      confirmingRef.current = true;
      void (async () => {
        const result = await confirmAccountMerge(current.code);
        confirmingRef.current = false;
        if (result.ok) {
          clearPendingMerge();
          await supabase?.auth.signOut();
          navigate(`/login?merged=${encodeURIComponent(result.keep_email ?? "")}`, { replace: true });
          return;
        }
        if (result.code === "SAME_ACCOUNT" || result.code === "WRONG_ACCOUNT") {
          setNotice({ tone: "yellow", text: `계정 합치기가 진행 중이에요. 합칠 계정(${current.target})으로 로그인해야 마무리됩니다.`, actions: "switch" });
          return;
        }
        clearPendingMerge();
        setNotice({ tone: "danger", text: result.message ?? "계정을 합치지 못했어요." });
      })();
      return;
    }

    if (profile?.merged_into || wasDismissed(userId)) return;
    let alive = true;
    void loadDuplicateAccounts().then((rows) => {
      if (alive) setDuplicates(rows);
    });
    return () => {
      alive = false;
    };
  }, [status, isSignedIn, isAdmin, userId, profile?.merged_into, navigate]);

  async function begin(account: DuplicateAccount) {
    const target = describeAccount(account);
    const ok = await confirmDialog({
      title: "두 계정을 하나로 합칠까요?",
      description: [
        `${target} 계정의 예약·출근 기록·쿠폰을 지금 로그인한 계정으로 옮깁니다.`,
        "",
        "본인 확인을 위해 그 계정으로 한 번 로그인해야 해요.",
        "① 확인을 누르면 로그아웃됩니다.",
        `② ${target} 계정으로 로그인하면 자동으로 합쳐집니다.`,
        "③ 그 뒤 지금 계정으로 다시 로그인해서 쓰시면 됩니다.",
      ].join("\n"),
      confirmLabel: "합치기 시작",
    });
    if (!ok) return;

    setBusy(true);
    const started = await startAccountMerge(account.id);
    setBusy(false);
    if (!started.ok || !started.code) {
      setNotice({ tone: "danger", text: started.message ?? "합치기를 시작하지 못했어요." });
      return;
    }
    savePendingMerge({ code: started.code, target, createdAt: Date.now() });
    await supabase?.auth.signOut();
    navigate("/login?merge=1", { replace: true });
  }

  async function switchAccount() {
    await supabase?.auth.signOut();
    navigate("/login?merge=1", { replace: true });
  }

  function cancelMerge() {
    clearPendingMerge();
    setNotice(null);
  }

  if (status !== "ready" || !isSignedIn || isAdmin) return null;

  if (profile?.merged_into) {
    return (
      <div className={`${tintCard("yellow")} mx-4 mt-4 p-4 text-sm font-bold sm:mx-auto sm:max-w-3xl`}>
        이 계정은 다른 계정과 합쳐졌어요. 예약과 출근은 합쳐진 계정으로 로그인해서 이용해 주세요.
        <button className={buttonClass("secondary", "sm", "mt-3 block")} onClick={() => void switchAccount()} type="button">
          로그아웃
        </button>
      </div>
    );
  }

  if (notice) {
    return (
      <div className={`${tintCard(notice.tone)} mx-4 mt-4 p-4 text-sm font-bold sm:mx-auto sm:max-w-3xl`}>
        {notice.text}
        {notice.actions === "switch" ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <button className={buttonClass("primary", "sm")} onClick={() => void switchAccount()} type="button">
              로그아웃하고 그 계정으로 로그인
            </button>
            <button className={buttonClass("secondary", "sm")} onClick={cancelMerge} type="button">
              합치기 취소
            </button>
          </div>
        ) : (
          <button className="mt-2 block text-xs underline" onClick={() => setNotice(null)} type="button">
            닫기
          </button>
        )}
      </div>
    );
  }

  if (pending || !duplicates.length || !userId) return null;

  return (
    <div className={`${tintCard("sky")} mx-4 mt-4 p-4 text-sm sm:mx-auto sm:max-w-3xl`}>
      <p className="font-bold">같은 연락처로 가입된 계정이 하나 더 있어요</p>
      <p className="mt-1 font-medium leading-6">
        예약이 다른 계정에 있으면 출근이 안 될 수 있어요. 하나로 합치면 기록이 모두 지금 계정으로 모입니다.
      </p>
      <ul className="mt-3 grid gap-2">
        {duplicates.map((account) => (
          <li className="flex flex-wrap items-center justify-between gap-2 rounded-[6px] border border-workroom-line bg-white px-3 py-2" key={account.id}>
            <span className="font-semibold">
              {describeAccount(account)}
              {account.reservations ? <span className="ml-1 text-xs font-medium text-workroom-muted">예약 {account.reservations}건</span> : null}
            </span>
            <button className={buttonClass("primary", "sm")} disabled={busy} onClick={() => void begin(account)} type="button">
              지금 계정으로 합치기
            </button>
          </li>
        ))}
      </ul>
      <button
        className="mt-2 text-xs font-semibold text-workroom-muted underline"
        onClick={() => {
          rememberDismiss(userId);
          setDuplicates([]);
        }}
        type="button"
      >
        나중에
      </button>
    </div>
  );
}
