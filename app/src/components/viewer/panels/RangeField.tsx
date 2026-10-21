/**
 * PaperKnife - The Swiss Army Knife for PDFs
 * Copyright (C) 2026 potatameister
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

export interface RangeFieldProps {
  id: string
  label: string
  value: number
  suffix: string
  min: number
  max: number
  step: number
  disabled: boolean
  onChange: (value: number) => void
}

/** 数値をつまみで選ぶ欄。見出しと今の値を上に出す */
export default function RangeField({
  id, label, value, suffix, min, max, step, disabled, onChange,
}: RangeFieldProps) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs font-bold text-gray-500 dark:text-zinc-300">
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id}>{value}{suffix}</output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-rose-500"
      />
    </div>
  )
}
