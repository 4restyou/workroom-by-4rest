type MoneyInputProps = {
  value: number;
  onChange: (value: number) => void;
  placeholder?: string;
};

const formatter = new Intl.NumberFormat("ko-KR");

// Numeric text input that shows thousands separators while typing (e.g.
// "12,000"). Stores the underlying number; non-digits are stripped.
export default function MoneyInput({ value, onChange, placeholder }: MoneyInputProps) {
  return (
    <input
      type="text"
      inputMode="numeric"
      placeholder={placeholder}
      value={value ? formatter.format(value) : ""}
      onChange={(event) => {
        const digits = event.target.value.replace(/[^\d]/g, "");
        onChange(digits ? Number(digits) : 0);
      }}
    />
  );
}
