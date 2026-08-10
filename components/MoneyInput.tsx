'use client';

// Input de valor monetário com vírgula decimal (padrão BR). O valor exposto
// via onChange continua sendo uma string com ponto (ex: "1234.56"), para que
// o resto do código (parseFloat, payloads do Supabase) não precise mudar.
export default function MoneyInput({
  value,
  onChange,
  className,
  disabled,
  required,
  autoFocus,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
  required?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  const display = value === '' ? '' : value.replace('.', ',');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value.replace(/[^\d,]/g, '');
    const firstComma = raw.indexOf(',');
    if (firstComma !== -1) {
      raw = raw.slice(0, firstComma + 1) + raw.slice(firstComma + 1).replace(/,/g, '');
    }
    onChange(raw.replace(',', '.'));
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      value={display}
      onChange={handleChange}
      className={className}
      disabled={disabled}
      required={required}
      autoFocus={autoFocus}
      placeholder={placeholder}
    />
  );
}
