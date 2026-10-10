type P = { className?: string };

const base = {
  width: '1em',
  height: '1em',
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false,
};

export const CheckIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);
export const CrossIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
export const AlertIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M12 7v6M12 17h.01" />
  </svg>
);
export const InfoIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M12 11v6M12 7h.01" />
  </svg>
);
export const DownloadIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M12 4v11M7 11l5 5 5-5M5 20h14" />
  </svg>
);
export const CopyIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V6a2 2 0 012-2h9" />
  </svg>
);
export const PinIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M12 21s7-6.2 7-11.5A7 7 0 005 9.5C5 14.8 12 21 12 21z" />
    <circle cx="12" cy="9.5" r="2.5" />
  </svg>
);
export const SpinnerIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M21 12a9 9 0 11-6.2-8.6" />
  </svg>
);
export const LogoMark = ({ className }: P) => (
  <svg viewBox="0 0 32 32" className={className} aria-hidden focusable={false}>
    <rect width="32" height="32" rx="7" fill="var(--brand)" />
    <path d="M9 16.5l5 5 9-10" fill="none" stroke="var(--brand-fg)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
