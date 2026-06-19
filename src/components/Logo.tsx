import React from 'react';

interface LogoProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

export default function Logo({ size = 32, className = '', style }: LogoProps) {
  const iconUrl = (() => {
    try {
      return chrome.runtime.getURL('icons/newmainicon.png');
    } catch {
      return '/icons/newmainicon.png';
    }
  })();

  const borderRadius = Math.round(size * 0.22); // Enforce 22% proportional rounded corners

  return (
    <div
      className={`shrink-0 overflow-hidden ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxSizing: 'border-box',
        background: 'transparent',
        ...style
      }}
    >
      <img
        src={iconUrl}
        alt="NullNote"
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain'
        }}
      />
    </div>
  );
}
