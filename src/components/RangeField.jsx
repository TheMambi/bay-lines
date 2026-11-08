import { useId } from 'react';

export function RangeField({ label, valueText, min, max, step = 1, value, onChange, hint, disabled }) {
  const id = useId();
  return (
    <div className="range-field">
      <div className="range-head">
        <label htmlFor={id} className="field-label">
          {label}
        </label>
        <output htmlFor={id} className="range-value">
          {valueText}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-valuetext={valueText}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      {hint && (
        <p id={`${id}-hint`} className="fine">
          {hint}
        </p>
      )}
    </div>
  );
}
