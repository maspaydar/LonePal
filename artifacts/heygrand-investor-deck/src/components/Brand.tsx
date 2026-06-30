type ToneProps = { className?: string };

export function Shield({ className }: ToneProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

export function BrandMark({
  variant = "light",
  className = "",
}: {
  variant?: "light" | "dark";
  className?: string;
}) {
  const word = variant === "dark" ? "text-bg" : "text-ink";
  return (
    <div className={`flex items-center gap-[1vw] ${className}`}>
      <div className="flex aspect-square w-[3.4vw] items-center justify-center rounded-[0.8vw] bg-primary">
        <Shield className="w-[1.9vw] text-bg" />
      </div>
      <span
        className={`font-display text-[2.4vw] font-extrabold tracking-tight ${word}`}
      >
        HeyGrand
      </span>
    </div>
  );
}

export function PresenceRings({ className = "" }: ToneProps) {
  return (
    <svg
      viewBox="0 0 200 200"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <circle cx="100" cy="100" r="18" fill="currentColor" opacity="0.9" />
      <circle cx="100" cy="100" r="44" stroke="currentColor" strokeWidth="2" opacity="0.55" />
      <circle cx="100" cy="100" r="72" stroke="currentColor" strokeWidth="2" opacity="0.32" />
      <circle cx="100" cy="100" r="98" stroke="currentColor" strokeWidth="2" opacity="0.16" />
    </svg>
  );
}
