import { useEffect, useMemo, useState } from "react";
import AdminPage, { AdminEmpty, AdminFeedback } from "../components/AdminPage";
import { kstDateTime } from "../lib/datetime";
import {
  audienceHints,
  audienceLabels,
  canSendAdTo,
  checkBroadcast,
  composeBroadcast,
  smsByteLength,
  smsType,
  type BroadcastAudience,
  type BroadcastKind,
} from "../lib/broadcast";
import { confirmDialog } from "../lib/confirm";
import { useSession } from "../lib/sessionContext";
import { SITE } from "../lib/site";
import { supabase } from "../lib/supabase";
import { useFeedbackToast } from "../lib/useFeedbackToast";
import { buttonClass, card, cardFlat, tintCard } from "../lib/ui";
import { useNavigate } from "react-router-dom";

type Campaign = {
  id: string;
  kind: BroadcastKind;
  audience: string;
  body: string;
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  created_at: string;
};

const audienceOrder: BroadcastAudience[] = ["active", "upcoming", "recent6m", "consented", "all"];

export default function AdminBroadcast() {
  const { status: sessionStatus, isSignedIn, isAdmin } = useSession();
  const navigate = useNavigate();
  const [kind, setKind] = useState<BroadcastKind>("notice");
  const [audience, setAudience] = useState<BroadcastAudience>("active");
  const [body, setBody] = useState("");
  const [recipients, setRecipients] = useState<number | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  useFeedbackToast(success, error);

  useEffect(() => {
    if (sessionStatus !== "ready") return;
    if (!isSignedIn) { navigate("/admin", { replace: true }); return; }
    if (!isAdmin) { navigate("/account", { replace: true }); return; }
    void loadCampaigns();
  }, [sessionStatus, isSignedIn, isAdmin, navigate]);

  async function loadCampaigns() {
    if (!supabase) return;
    const { data } = await supabase
      .from("sms_campaigns")
      .select("id,kind,audience,body,recipient_count,sent_count,failed_count,created_at")
      .order("created_at", { ascending: false })
      .limit(10);
    setCampaigns((data ?? []) as Campaign[]);
  }

  // 대상 수는 서버가 세는 것과 같은 함수로 센다. 화면에서 따로 세면 미리 본
  // 인원과 실제 발송 인원이 달라진다.
  useEffect(() => {
    if (!supabase || sessionStatus !== "ready" || !isAdmin) return;
    let canceled = false;
    setRecipients(null);
    void supabase.rpc("broadcast_audience", { p_audience: audience }).then(({ data, error: rpcError }) => {
      if (canceled) return;
      if (rpcError) {
        setError(
          rpcError.message.includes("function")
            ? "단체 문자는 마이그레이션 0055를 적용해야 동작합니다."
            : rpcError.message,
        );
        setRecipients(0);
        return;
      }
      setRecipients((data ?? []).length);
    });
    return () => { canceled = true; };
  }, [audience, sessionStatus, isAdmin]);

  const preview = useMemo(
    () => composeBroadcast({ kind, body, optOut: SITE.smsOptOutNotice }),
    [body, kind],
  );
  const check = useMemo(
    () => checkBroadcast({ kind, audience, body, recipients: recipients ?? 0, hour: new Date().getHours() }),
    [audience, body, kind, recipients],
  );

  async function send() {
    if (!supabase || !check.ok) return;
    const count = recipients ?? 0;
    const ok = await confirmDialog({
      title: `${audienceLabels[audience]} ${count}명에게 보낼까요?`,
      description: [
        kind === "ad" ? "광고 문자입니다. (광고) 표기와 수신거부 안내가 함께 나갑니다." : "운영 공지로 나갑니다.",
        "",
        preview,
        "",
        `${smsType(preview)} · ${smsByteLength(preview)}바이트 · ${count}건`,
      ].join("\n"),
      confirmLabel: "보내기",
      tone: "danger",
      requireTyped: "발송",
    });
    if (!ok) return;

    setBusy(true);
    setError("");
    const { data, error: fnError } = await supabase.functions.invoke("broadcast-sms", {
      body: { kind, audience, body, optOut: SITE.smsOptOutNotice },
    });
    const result = data as { ok?: boolean; message?: string; sent?: number; failed?: number } | null;
    setBusy(false);
    if (fnError || !result?.ok) {
      setError(result?.message ?? fnError?.message ?? "발송하지 못했습니다.");
      return;
    }
    setSuccess(`${result.sent}건을 보냈습니다${result.failed ? ` · 실패 ${result.failed}건` : ""}.`);
    setBody("");
    await loadCampaigns();
  }

  return (
    <AdminPage description="회원에게 공지나 안내를 한 번에 보냅니다." title="문자 보내기">
      <AdminFeedback error={error} success={success} />

      <section className={`${card} p-5`}>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-bold">
            보내는 내용
            <select value={kind} onChange={(event) => setKind(event.target.value as BroadcastKind)}>
              <option value="notice">운영 공지 (휴무·가격 변경·시설 안내)</option>
              <option value="ad">광고 (할인·이벤트·재방문 권유)</option>
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-bold">
            받는 사람
            <select value={audience} onChange={(event) => setAudience(event.target.value as BroadcastAudience)}>
              {audienceOrder.map((value) => (
                <option key={value} value={value} disabled={kind === "ad" && !canSendAdTo(value)}>
                  {audienceLabels[value]}
                  {kind === "ad" && !canSendAdTo(value) ? " — 광고 불가" : ""}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="mt-1.5 text-xs font-medium leading-5 text-workroom-muted">{audienceHints[audience]}</p>

        {kind === "ad" ? (
          <p className={`${tintCard("yellow")} mt-4 p-3 text-xs font-bold leading-5`}>
            광고성 문자는 정보통신망법 제50조를 따릅니다. (광고) 표기와 무료 수신거부 안내가 자동으로 붙고,
            21시부터 다음 날 8시까지는 보낼 수 없습니다. 최근 6개월 안에 이용한 회원에게는 별도 동의 없이
            보낼 수 있습니다(거래관계 예외).
          </p>
        ) : null}

        <label className="mt-4 grid gap-1.5 text-sm font-bold">
          내용
          <textarea
            placeholder={kind === "ad" ? "예: 9월 한 달 전 이용권 20% 할인 중입니다." : "예: 9월 20일(일)은 휴무입니다."}
            rows={5}
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
        </label>

        <div className={`${cardFlat} mt-4 p-4`}>
          <p className="text-xs font-bold text-workroom-muted">실제로 나가는 문구</p>
          <p className="mt-2 whitespace-pre-line text-sm font-medium leading-6">{preview || "—"}</p>
          <p className="mt-3 border-t border-workroom-line pt-2 text-xs font-medium text-workroom-muted">
            {smsType(preview)} · {smsByteLength(preview)}바이트 ·{" "}
            {recipients === null ? "대상 확인 중…" : `${recipients}명`}
            {recipients !== null && recipients > 0 ? ` · ${smsType(preview)} ${recipients}건` : ""}
          </p>
        </div>

        {check.problems.length ? (
          <ul className={`${tintCard("danger")} mt-4 grid gap-1 p-3 text-sm font-bold`}>
            {check.problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        ) : null}

        <button
          className={buttonClass("primary", "md", "mt-4")}
          disabled={!check.ok || busy}
          onClick={() => void send()}
          type="button"
        >
          {busy ? "보내는 중…" : "보내기"}
        </button>
      </section>

      <section className="mt-6">
        <h2 className="mb-2 text-base font-bold">최근 발송</h2>
        <div className="border-y border-workroom-line bg-white">
          {campaigns.map((campaign) => (
            <div className="admin-row px-4 py-3" key={campaign.id}>
              <p className="text-sm font-semibold">
                {campaign.kind === "ad" ? "광고" : "운영 공지"} · {audienceLabels[campaign.audience as BroadcastAudience] ?? campaign.audience} ·{" "}
                {campaign.sent_count}/{campaign.recipient_count}건
                {campaign.failed_count ? ` · 실패 ${campaign.failed_count}` : ""}
              </p>
              <p className="mt-1 whitespace-pre-line text-xs font-medium leading-5 text-workroom-muted">{campaign.body}</p>
              <p className="mt-1 text-xs font-medium text-workroom-muted">{kstDateTime(campaign.created_at)}</p>
            </div>
          ))}
          {!campaigns.length ? <AdminEmpty>보낸 문자가 없습니다.</AdminEmpty> : null}
        </div>
      </section>
    </AdminPage>
  );
}
