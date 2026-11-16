/* eslint-disable @next/next/no-img-element -- static SVG brand assets: rendered as-is for crisp output at any size */
import { cx } from "./ui";

/**
 * Official TRADING HQ branding (assets generated from public/logo.svg by scripts/build-brand.mjs).
 * Both theme variants are rendered; CSS shows the one matching [data-theme], so there is no flash
 * and no client JavaScript. Height drives size; width follows the original aspect ratio.
 */
export function BrandLogo({ className }: { className?: string }) {
  return (
    <span className={cx("inline-flex shrink-0", className)}>
      <img src="/brand/logo-light.svg" alt="TRADING HQ" className="h-full w-auto dark:hidden" draggable={false} />
      <img src="/brand/logo-dark.svg" alt="TRADING HQ" className="hidden h-full w-auto dark:block" draggable={false} />
    </span>
  );
}

/** Candlestick symbol only (collapsed sidebar, compact spaces). */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cx("shrink-0", className)}>
      <img src="/brand/mark-light.svg" alt="TRADING HQ" className="h-full w-auto dark:hidden" draggable={false} />
      <img src="/brand/mark.svg" alt="TRADING HQ" className="hidden h-full w-auto dark:block" draggable={false} />
    </span>
  );
}
