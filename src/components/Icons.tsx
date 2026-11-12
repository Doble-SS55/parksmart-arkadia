import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement>;

const base = (props: P) => ({
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  ...props,
});

/** Marca: letrero de parqueadero con barrera levadiza. */
export function BrandMark(props: P) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden {...props}>
      <rect x="1" y="1" width="30" height="30" rx="5" fill="#1565D8" />
      <path d="M10 24V8h6.5a4.5 4.5 0 0 1 0 9H10" fill="none" stroke="#fff" strokeWidth="3" strokeLinejoin="round" />
      <path d="M19 24h8" stroke="#F2B01E" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export const IconHome = (p: P) => (
  <svg {...base(p)}><path d="M3 11 12 4l9 7" /><path d="M5 10v10h14V10" /><path d="M10 20v-6h4v6" /></svg>
);
export const IconTable = (p: P) => (
  <svg {...base(p)}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M3 14h18M9 9v11" /></svg>
);
export const IconQueue = (p: P) => (
  <svg {...base(p)}><rect x="2" y="9" width="5" height="6" rx="1" /><rect x="9" y="9" width="5" height="6" rx="1" /><path d="M17 6v12" /><path d="M17 8h5" /></svg>
);
export const IconDice = (p: P) => (
  <svg {...base(p)}><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8.5" cy="8.5" r="1.2" fill="currentColor" /><circle cx="15.5" cy="15.5" r="1.2" fill="currentColor" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /></svg>
);
export const IconReport = (p: P) => (
  <svg {...base(p)}><path d="M6 2h9l5 5v15H6z" /><path d="M14 2v6h6" /><path d="M9 13h7M9 17h7" /></svg>
);
export const IconInfo = (p: P) => (
  <svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.5" /></svg>
);
export const IconWarn = (p: P) => (
  <svg {...base(p)}><path d="M12 3 2 21h20z" /><path d="M12 10v5M12 18v.5" /></svg>
);
export const IconStop = (p: P) => (
  <svg {...base(p)}><path d="M8 2h8l6 6v8l-6 6H8l-6-6V8z" /><path d="M12 7v6M12 16.5v.5" /></svg>
);
export const IconCheck = (p: P) => (
  <svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></svg>
);
export const IconPlus = (p: P) => (
  <svg {...base(p)}><path d="M12 5v14M5 12h14" /></svg>
);
export const IconUpload = (p: P) => (
  <svg {...base(p)}><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 16v4h16v-4" /></svg>
);
export const IconDownload = (p: P) => (
  <svg {...base(p)}><path d="M12 4v12M7 11l5 5 5-5" /><path d="M4 16v4h16v-4" /></svg>
);
export const IconTrash = (p: P) => (
  <svg {...base(p)}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>
);
export const IconEdit = (p: P) => (
  <svg {...base(p)}><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="m13 7 4 4" /></svg>
);
export const IconPlay = (p: P) => (
  <svg {...base(p)}><path d="M7 4v16l13-8z" fill="currentColor" /></svg>
);
export const IconPause = (p: P) => (
  <svg {...base(p)}><path d="M7 4v16M17 4v16" strokeWidth={4} /></svg>
);
export const IconReset = (p: P) => (
  <svg {...base(p)}><path d="M4 4v6h6" /><path d="M20 12a8 8 0 1 1-2.3-5.7L20 9" transform="scale(-1 1) translate(-24 0)" /></svg>
);
export const IconSave = (p: P) => (
  <svg {...base(p)}><path d="M5 3h11l3 3v15H5z" /><path d="M8 3v5h7V3M8 21v-7h8v7" /></svg>
);
export const IconCompare = (p: P) => (
  <svg {...base(p)}><path d="M5 20V10M12 20V4M19 20v-7" /></svg>
);
export const IconCar = (p: P) => (
  <svg {...base(p)}><path d="M3 16v-4l2-5h14l2 5v4z" /><circle cx="7.5" cy="16.5" r="1.8" /><circle cx="16.5" cy="16.5" r="1.8" /></svg>
);
export const IconClose = (p: P) => (
  <svg {...base(p)}><path d="M6 6l12 12M18 6 6 18" /></svg>
);
export const IconSun = (p: P) => (
  <svg {...base(p)}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
);
export const IconMoon = (p: P) => (
  <svg {...base(p)}><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></svg>
);
