import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Section from "../components/Section";
import { todayValue } from "../lib/format";
import { useSession } from "../lib/sessionContext";
import { SITE } from "../lib/site";
import { supabase } from "../lib/supabase";
import { buttonClass, card, cardFlat, tintCard } from "../lib/ui";
import { guideCupsFor, visitGuideSections } from "../lib/visitGuide";

// 방문 안내. 문자로 받은 안내는 대화방을 거슬러 올라가야 다시 찾지만, 이 화면은
// 문 앞에서 바로 열 수 있다.
//
// 출입구 비밀번호는 '오늘 들어올 자격이 있는 사람'에게만 보여 준다. 설정 값을
// 그대로 읽지 않고 서버 함수(member_door_code)가 판단해서 값만 돌려준다
// — 화면 코드를 아무리 뜯어봐도 자격이 없으면 비밀번호가 오지 않는다.
export default function Visit() {
  const { status, isSignedIn } = useSession();
  const [doorCode, setDoorCode] = useState<string | null>(null);
  const [passName, setPassName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (status !== "ready") return;

    async function load() {
      if (!supabase || !isSignedIn) {
        setIsLoading(false);
        return;
      }

      const today = todayValue();
      const [codeResult, reservationResult] = await Promise.all([
        supabase.rpc("member_door_code"),
        // 오늘(또는 앞으로) 쓰는 이용권을 알아야 커피 잔 수를 안내할 수 있다.
        supabase
          .from("reservations")
          .select("pass_type,pass_name_snapshot,date,access_start_date,access_end_date")
          .eq("status", "confirmed")
          .is("deleted_at", null)
          .or(`date.gte.${today},access_end_date.gte.${today}`)
          .order("date", { ascending: true })
          .limit(1),
      ]);

      if (!codeResult.error && typeof codeResult.data === "string") setDoorCode(codeResult.data);
      const row = (reservationResult.data ?? [])[0] as { pass_type?: string; pass_name_snapshot?: string | null } | undefined;
      if (row) setPassName(row.pass_name_snapshot || row.pass_type || null);
      setIsLoading(false);
    }

    void load();
  }, [status, isSignedIn]);

  const sections = useMemo(
    () => visitGuideSections({ cups: passName ? guideCupsFor(passName) : null, doorCode }),
    [doorCode, passName],
  );

  return (
    <Section eyebrow="방문 안내" title="처음 오시는 분께">
      <p className="mb-5 text-sm font-medium leading-6 text-workroom-muted">
        들어오셔서 나가실 때까지 순서대로 적어 뒀어요. 문 앞에서 바로 열어 보셔도 됩니다.
      </p>

      {!isLoading && !isSignedIn ? (
        <p className={`${tintCard("yellow")} mb-4 p-4 text-sm font-bold leading-6`}>
          로그인하시면 출입구 비밀번호도 함께 보여 드려요.{" "}
          <Link className="underline" to="/login">
            로그인
          </Link>
        </p>
      ) : null}

      {!isLoading && isSignedIn && !doorCode ? (
        <p className={`${tintCard("yellow")} mb-4 p-4 text-sm font-bold leading-6`}>
          출입구 비밀번호는 <b>이용하시는 날</b>에 이 화면에서 보여 드려요. 예약을 마치신 뒤 다시 열어 주세요.
        </p>
      ) : null}

      <div className={`${card} divide-y divide-workroom-line`}>
        {sections.map((section) => (
          <div className="grid gap-2 p-5 sm:grid-cols-[9rem_1fr] sm:gap-4" key={section.title}>
            <h3 className="text-sm font-bold">{section.title}</h3>
            <div className="grid gap-1">
              {section.lines.map((line) => (
                <p
                  className={`text-sm font-medium leading-6 ${
                    line.startsWith("출입구 비밀번호") ? "font-bold text-workroom-ink" : "text-workroom-muted"
                  }`}
                  key={line}
                >
                  {line}
                </p>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className={`${cardFlat} mt-4 grid gap-1 p-5 text-sm font-medium text-workroom-muted`}>
        <p>
          주차 {SITE.parking.name} ({SITE.parking.address})
        </p>
        <p>문의 {SITE.phone}</p>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <Link className={buttonClass("accent", "md")} to="/reserve">
          예약하기
        </Link>
        <Link className={buttonClass("secondary", "md")} to="/faq">
          예약·결제 안내
        </Link>
      </div>
    </Section>
  );
}
