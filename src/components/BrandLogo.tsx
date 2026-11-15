interface BrandLogoProps {
  variant?: 'light' | 'dark';
  brandName?: string;
  logoUrl?: string;
}

export function BrandLogo({
  variant = 'light',
  brandName = 'Global Pathways',
  logoUrl = '',
}: BrandLogoProps) {
  const textColor = variant === 'dark' ? 'text-white' : 'text-slate-900';
  const boxBg = variant === 'dark' ? 'bg-blue-600' : 'bg-slate-900';

  return (
    <span className="inline-flex items-center gap-2.5 whitespace-nowrap shrink-0">
      {logoUrl ? (
        <img
          src={logoUrl}
          alt={brandName}
          referrerPolicy="no-referrer"
          className="w-8 h-8 rounded-lg object-cover border border-slate-200 bg-white shrink-0"
        />
      ) : (
        <span
          className={`w-8 h-8 rounded-lg ${boxBg} flex items-center justify-center shrink-0`}
          aria-hidden="true"
        >
          <svg
            viewBox="0 0 24 24"
            className="w-4.5 h-4.5 text-white"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="9" className="opacity-45" />
            <path d="M3.6 14.5c3.5-2.6 8.2-3.4 13.9-2.2" />
            <path d="M13.5 8.5 18 12l-4.5 3.5" />
          </svg>
        </span>
      )}
      <span className={`font-display text-lg font-bold tracking-tight ${textColor}`}>
        {brandName || 'Global Pathways'}
      </span>
    </span>
  );
}
