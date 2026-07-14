// Brand marks for attachment providers as inline SVG (no icon dependency).
// Rendered on document cards so a pasted link shows its real platform logo.

interface Props {
  provider: string;
  size?: number;
}

/** Real brand logos for known providers; a muted globe for anything else. */
export default function ProviderIcon({ provider, size = 20 }: Props) {
  const box = { width: size, height: size, display: 'block' as const };

  switch (provider) {
    case 'drive':
      return (
        <svg viewBox="0 0 87.3 78" style={box} aria-hidden>
          <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da" />
          <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0-1.2 4.5h27.5z" fill="#00ac47" />
          <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335" />
          <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d" />
          <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc" />
          <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00" />
        </svg>
      );
    case 'notion':
      return (
        <svg viewBox="0 0 24 24" style={box} fill="none" aria-hidden>
          <rect x="2" y="2" width="20" height="20" rx="5" fill="#fff" />
          <path d="M8.2 16.4V8.1l7.6 8.3V7.7" stroke="#0f172a" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'discord':
      return (
        <svg viewBox="0 0 24 24" style={box} aria-hidden>
          <path
            fill="#5865F2"
            d="M20.317 4.369a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.211.375-.444.865-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.009c.12.099.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.891.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.331c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"
          />
        </svg>
      );
    case 'figma':
      return (
        <svg viewBox="0 0 38 57" style={box} aria-hidden>
          <path fill="#1abcfe" d="M19 28.5a9.5 9.5 0 1 1 19 0 9.5 9.5 0 0 1-19 0z" />
          <path fill="#0acf83" d="M0 47.5A9.5 9.5 0 0 1 9.5 38H19v9.5a9.5 9.5 0 1 1-19 0z" />
          <path fill="#ff7262" d="M19 0v19h9.5a9.5 9.5 0 1 0 0-19H19z" />
          <path fill="#f24e1e" d="M0 9.5A9.5 9.5 0 0 0 9.5 19H19V0H9.5A9.5 9.5 0 0 0 0 9.5z" />
          <path fill="#a259ff" d="M0 28.5A9.5 9.5 0 0 0 9.5 38H19V19H9.5A9.5 9.5 0 0 0 0 28.5z" />
        </svg>
      );
    case 'github':
      return (
        <svg viewBox="0 0 24 24" style={box} aria-hidden>
          <path
            fill="#e6edf3"
            fillRule="evenodd"
            clipRule="evenodd"
            d="M12 .5C5.37.5 0 5.78 0 12.29c0 5.21 3.44 9.63 8.2 11.19.6.11.82-.25.82-.56 0-.28-.01-1.02-.02-2-3.34.71-4.04-1.58-4.04-1.58-.55-1.37-1.34-1.74-1.34-1.74-1.09-.73.08-.72.08-.72 1.2.08 1.84 1.21 1.84 1.21 1.07 1.79 2.81 1.27 3.5.97.11-.76.42-1.27.76-1.56-2.67-.3-5.47-1.29-5.47-5.75 0-1.27.46-2.31 1.21-3.12-.12-.29-.53-1.48.11-3.08 0 0 .99-.31 3.24 1.19a11.5 11.5 0 0 1 5.9 0c2.25-1.5 3.24-1.19 3.24-1.19.64 1.6.24 2.79.12 3.08.75.81 1.2 1.85 1.2 3.12 0 4.47-2.81 5.44-5.49 5.73.43.36.81 1.08.81 2.18 0 1.58-.01 2.85-.01 3.24 0 .31.22.68.83.56A12.02 12.02 0 0 0 24 12.29C24 5.78 18.63.5 12 .5z"
          />
        </svg>
      );
    case 'youtube':
      return (
        <svg viewBox="0 0 24 24" style={box} aria-hidden>
          <rect x="1" y="5" width="22" height="14" rx="4" fill="#FF0000" />
          <path d="M10 8.5l6 3.5-6 3.5z" fill="#fff" />
        </svg>
      );
    case 'dropbox':
      return (
        <svg viewBox="0 0 24 24" style={box} aria-hidden>
          <path
            fill="#0061FF"
            d="M6 1.5 0 6l6 4.5L12 6zM18 1.5 12 6l6 4.5L24 6zM0 15l6 4.5L12 15 6 10.5zM18 10.5 12 15l6 4.5L24 15zM6 20.5 12 16.5 18 20.5 12 24.5z"
          />
        </svg>
      );
    case 'onedrive':
      return (
        <svg viewBox="0 0 24 24" style={box} aria-hidden>
          <path fill="#0364B8" d="M13.6 7.2a5 5 0 0 0-9.3 1.4A4 4 0 0 0 5 16.4h12.6a3.5 3.5 0 0 0 .4-7 4.5 4.5 0 0 0-4.4-2.2z" />
        </svg>
      );
    default: // link / website / anything unknown → muted globe
      return (
        <svg viewBox="0 0 24 24" style={box} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3c2.5 2.6 3.8 5.8 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.8-3.8-9S9.5 5.6 12 3z" />
        </svg>
      );
  }
}
