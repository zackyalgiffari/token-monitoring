import { useEffect, useRef, useState } from 'react';

interface Props {
  value: number;
  prefix?: string;
  decimals?: number;
  color?: string;
  fontSize?: string;
}

export function DigitOdometer({ value, prefix = '$', decimals = 4, color = 'var(--amber)', fontSize = 'var(--font-size-3xl)' }: Props) {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const from = prevRef.current;
    const to = value;
    if (from === to) return;

    const duration = 300;
    const start = performance.now();

    const animate = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (to - from) * eased);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        setDisplay(to);
        prevRef.current = to;
      }
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value]);

  const formatted = display.toFixed(decimals);

  return (
    <span style={{
      fontFamily: 'var(--font-mono)',
      fontSize,
      fontWeight: 700,
      color,
      fontVariantNumeric: 'tabular-nums',
      letterSpacing: '-0.02em',
    }}>
      {prefix}{formatted}
    </span>
  );
}
