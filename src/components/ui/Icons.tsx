import React from "react";

interface IconProps {
  size?: number;
  className?: string;
}

export const FireIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
    <path d="M12 22c4.5 0 7-3 7-7 0-4-3-8-7-12-4 4-7 8-7 12 0 4 2.5 7 7 7z" fill="#FF8FA3" stroke="#E07A8E" strokeWidth="1.2"/>
    <path d="M14.5 15.5c0 1.5-1 2.5-2.5 2.5s-2.5-1-2.5-2.5c0-1.5 2.5-5 2.5-5s2.5 3.5 2.5 5z" fill="#FFD166" stroke="#E8B84A" strokeWidth="0.8"/>
  </svg>
);

export const DiamondIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
    <path d="M12 2L3 9l3 11h12l3-11L12 2z" fill="#A8D8EA" stroke="#7EC4D8" strokeWidth="1.2"/>
    <path d="M12 2v20M3 9h18" stroke="#7EC4D8" strokeWidth="1" opacity="0.5"/>
  </svg>
);

export const CrownIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
    <path d="M2 18h20l-2-9-6 3-4-9-6 9-2 9z" fill="#FFD700" stroke="#E8C200" strokeWidth="1.2"/>
    <circle cx="7" cy="14" r="1.5" fill="#E8C200"/>
    <circle cx="12" cy="14" r="1.5" fill="#E8C200"/>
    <circle cx="17" cy="14" r="1.5" fill="#E8C200"/>
  </svg>
);

export const StarIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
    <path d="M12 2l2.5 7.5H22l-6 4.5 2.5 7.5L12 17l-6.5 4.5L8 14l-6-4.5h7.5L12 2z" fill="#FFB4A2" stroke="#E89B87" strokeWidth="1.2"/>
  </svg>
);

export const CameraIcon: React.FC<IconProps> = ({ size = 28, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
    <rect x="2" y="7" width="20" height="14" rx="3" fill="#FF8FA3" stroke="#E07A8E" strokeWidth="1.2"/>
    <circle cx="12" cy="14" r="4" fill="white" stroke="#E07A8E" strokeWidth="1.2"/>
    <path d="M17 7l-2-3H9L7 7" stroke="#E07A8E" strokeWidth="1.2" strokeLinecap="round"/>
    <circle cx="12" cy="14" r="1.5" fill="#E07A8E"/>
  </svg>
);

export const HistoryIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
    <circle cx="12" cy="12" r="9" stroke="#C47A8F" strokeWidth="1.5"/>
    <path d="M12 7v5l3 3" stroke="#C47A8F" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

export const ChartIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
    <path d="M3 20h18" stroke="#C47A8F" strokeWidth="1.5" strokeLinecap="round"/>
    <path d="M7 20V10l3 2 4-5 4 3 3-6v16" stroke="#FF8FA3" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

export const ShareIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
    <circle cx="18" cy="5" r="3" stroke="#C47A8F" strokeWidth="1.5"/>
    <circle cx="6" cy="12" r="3" stroke="#C47A8F" strokeWidth="1.5"/>
    <circle cx="18" cy="19" r="3" stroke="#C47A8F" strokeWidth="1.5"/>
    <path d="M15.5 6.5l-7 4M15.5 17.5l-7-4" stroke="#C47A8F" strokeWidth="1.2"/>
  </svg>
);

export const CloseIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
    <path d="M6 6l12 12M18 6L6 18" stroke="#8A7A7A" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

export const CheckIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
    <circle cx="12" cy="12" r="9" fill="#A8D8EA" stroke="#7EC4D8" strokeWidth="1.2"/>
    <path d="M8 12l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

export const LockIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
    <rect x="5" y="11" width="14" height="10" rx="2" fill="#F5C4B0" stroke="#E89B87" strokeWidth="1.2"/>
    <path d="M8 11V8a4 4 0 118 0v3" stroke="#E89B87" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

export const AvatarIcon: React.FC<IconProps> = ({ size = 48, className }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className}>
    <circle cx="24" cy="24" r="22" fill="#F5D0DC" stroke="#E8A0B4" strokeWidth="2"/>
    <circle cx="24" cy="18" r="6" fill="#E8A0B4"/>
    <path d="M14 34c0-5 4.5-8 10-8s10 3 10 8" fill="#E8A0B4" stroke="#E8A0B4" strokeWidth="2"/>
  </svg>
);

export const StreakIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
    <path d="M12 22c3.5 0 6-2.5 6-6 0-4-2.5-8-6-11-3.5 3-6 7-6 11 0 3.5 2.5 6 6 6z" fill="#FFD166" stroke="#E8B84A" strokeWidth="1.2"/>
    <path d="M12 16c1.5 0 2.5-1 2.5-2.5S12 9 12 9s-2.5 3-2.5 4.5S10.5 16 12 16z" fill="#FF8FA3"/>
  </svg>
);

export const GiftIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
    <rect x="3" y="9" width="18" height="12" rx="2" fill="#FFB4A2" stroke="#E89B87" strokeWidth="1.2"/>
    <path d="M3 13h18" stroke="#E89B87" strokeWidth="1.2"/>
    <path d="M12 9v12" stroke="#E89B87" strokeWidth="1.2"/>
    <path d="M12 9h-2a3 3 0 110-6c3 0 4 3 4 3s1-3 4-3a3 3 0 110 6h-2" stroke="#E89B87" strokeWidth="1.2" strokeLinecap="round"/>
  </svg>
);

export const ArrowRight: React.FC<IconProps> = ({ size = 20, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
    <path d="M5 12h14M13 5l7 7-7 7" stroke="#C47A8F" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

/**
 * 2026-06-27 — Microscope (анализ кожи). The "Доступно N анализов"
 * counter used 💎 (gem) before, which is semantically wrong: users
 * saw "diamonds" with skin-test context.
 *
 * 2026-06-27 (later) — first SVG draft had filled eyepiece body +
 * filled lens that overlapped the focus knob and stage; at 18-22px
 * (Telegram Mini App dashboard counter) the shapes collapsed into a
 * muddy blob. Rewritten as Lucide-microscope stroke-only, brand pink
 * #C47A8F, strokeWidth 1.6, matching the HistoryIcon / ChartIcon /
 * ShareIcon / ArrowRight stroke family. Pure stroke reads cleanly at
 * every size and avoids the multi-fill overlap.
 */
export const MicroscopeIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#C47A8F" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M6 18h8" />
    <path d="M3 22h18" />
    <path d="M14 22a7 7 0 1 0 0-14h-1" />
    <path d="M9 14h2" />
    <path d="M9 12a2 2 0 0 1-2-2V6h6v4a2 2 0 0 1-2 2Z" />
    <path d="M12 6V3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3" />
  </svg>
);
