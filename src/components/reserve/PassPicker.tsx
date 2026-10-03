import { activeDiscount, discountLabel } from "../../lib/discount";
import { formatPrice, todayValue } from "../../lib/format";
import type { PassOption } from "../../lib/reserveForm";
import { card } from "../../lib/ui";
import { StepHeading } from "./FormBits";

// 예약 1단계: 이용권 고르기. 할인 중인 이용권은 정가를 긋고 할인가를 보여 준다.
export default function PassPicker({
  groups,
  hidden,
  onSelect,
  selected,
}: {
  groups: { name: string; items: PassOption[] }[];
  hidden: boolean;
  onSelect: (passName: string) => void;
  selected: string;
}) {
  return (
      <fieldset className={`${card} p-5 ${hidden ? "hidden" : ""}`}>
        <StepHeading step="1" title="이용권" />
        <div className="grid gap-3">
          {groups.map((group) => (
            <fieldset className="grid gap-2" key={group.name}>
              <legend className="mb-1 text-xs font-bold text-workroom-muted">{group.name}</legend>
              {group.items.map((pass) => {
                const isSelected = selected === pass.name;
                const passDiscount = activeDiscount(pass, todayValue());
                return (
                  <label
                    className={`flex cursor-pointer items-center justify-between gap-3 rounded-card border px-4 py-3 transition-colors duration-100 ${
                      isSelected
                        ? "border-workroom-ink bg-workroom-yellow"
                        : "border-workroom-line bg-white hover:border-workroom-ink"
                    }`}
                    key={pass.id}
                  >
                    <span className="min-w-0">
                      <span className="block text-base font-bold">{pass.name}</span>
                      <span className="mt-1 block text-xs font-medium text-workroom-muted">
                        {pass.description}
                        {pass.price ? (
                          passDiscount ? (
                            <>
                              {" · 1인 "}
                              <s>{formatPrice(pass.price)}</s> <b className="text-workroom-ink">{formatPrice(passDiscount.price)}</b>
                            </>
                          ) : (
                            ` · 1인 ${formatPrice(pass.price)}`
                          )
                        ) : ""}
                        {(pass.min_people ?? 1) > 1 ? ` · ${pass.min_people}명 이상` : ""}
                      </span>
                      {passDiscount ? (
                        <span className="mt-1 inline-block rounded-pill border border-workroom-ink bg-workroom-yellow px-2 py-0.5 text-[11px] font-bold">
                          {discountLabel(passDiscount)}
                        </span>
                      ) : null}
                    </span>
                    <input
                      checked={isSelected}
                      className="h-5 w-5 shrink-0 accent-black"
                      name="pass_type"
                      onChange={() => onSelect(pass.name)}
                      type="radio"
                      value={pass.name}
                    />
                  </label>
                );
              })}
            </fieldset>
          ))}
        </div>
      </fieldset>
  );
}
