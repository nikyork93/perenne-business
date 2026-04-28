'use client';

interface AvatarProps {
  name?: string | null;
  email: string;
  imageUrl?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_MAP = {
  xs: { box: 24, text: 9 },
  sm: { box: 32, text: 11 },
  md: { box: 40, text: 14 },
  lg: { box: 56, text: 18 },
};

// Curated palette — all dark enough for white text, all distinguishable
const PALETTE = [
  { from: '#4a7a8c', to: '#2c5868' }, // teal (brand)
  { from: '#7c5da8', to: '#5a3f87' }, // violet
  { from: '#5a8cc7', to: '#3d6da5' }, // blue
  { from: '#c77c5a', to: '#a35a3d' }, // copper
  { from: '#5fa07a', to: '#3d7d5a' }, // sage
  { from: '#a85d7c', to: '#7d3f5a' }, // rose
  { from: '#7c8c5a', to: '#5a683d' }, // olive
  { from: '#c79c5a', to: '#a3783d' }, // ochre
];

function hashCode(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function initials(name: string | null | undefined, email: string): string {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return parts[0].slice(0, 2).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

export function Avatar({ name, email, imageUrl, size = 'md', className = '' }: AvatarProps) {
  const { box, text } = SIZE_MAP[size];
  const palette = PALETTE[hashCode(email) % PALETTE.length];

  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={name || email}
        className={`rounded-full object-cover ${className}`}
        style={{ width: box, height: box }}
      />
    );
  }

  return (
    <div
      className={`flex items-center justify-center rounded-full text-white font-medium select-none ${className}`}
      style={{
        width: box,
        height: box,
        fontSize: text,
        background: `linear-gradient(135deg, ${palette.from} 0%, ${palette.to} 100%)`,
        letterSpacing: '0.02em',
      }}
    >
      {initials(name, email)}
    </div>
  );
}
