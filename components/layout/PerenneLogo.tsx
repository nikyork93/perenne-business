import Image from 'next/image';

interface PerenneLogoProps {
  variant?: 'symbol' | 'extended';
  /** height in pixels — width auto-scales */
  height?: number;
  className?: string;
}

/**
 * Renders the Perenne Note brand logo.
 * - `symbol` is the stylized P, square-ish (logo-symbol.svg)
 * - `extended` is the full "Perenne Note" wordmark, horizontal (logo-extended.svg)
 *
 * Both SVGs use `currentColor`, so wrapping them in a colored parent
 * (e.g. text-ink, text-accent) controls the fill.
 */
export function PerenneLogo({
  variant = 'extended',
  height = 28,
  className = '',
}: PerenneLogoProps) {
  // logo aspect ratios derived from viewBox:
  //   extended: 656.01 x 77.56  → ratio ≈ 8.46
  //   symbol:    672.11 x 422.99 → ratio ≈ 1.59
  const aspect = variant === 'extended' ? 656.01 / 77.56 : 672.11 / 422.99;
  const width = Math.round(height * aspect);
  const src = variant === 'extended' ? '/logo-extended.svg' : '/logo-symbol.svg';
  const alt = variant === 'extended' ? 'Perenne Note' : 'P';

  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      className={className}
      priority
    />
  );
}
