/** Ms. Nova, the AI teacher. `talking` animates her mouth; `listening` makes her nod. */
export function TeacherAvatar({
  talking,
  listening,
  thinking,
  mouth,
}: {
  talking: boolean;
  listening: boolean;
  thinking: boolean;
  /** Lip sync: how open the mouth is right now (0-1), from the voice's loudness. */
  mouth?: number;
}) {
  const sync = mouth !== undefined;
  return (
    <svg
      viewBox="0 0 320 240"
      preserveAspectRatio="xMidYMid slice"
      className={`nova ${talking && !sync ? 'talking' : ''} ${sync ? 'lipsync' : ''} ${listening ? 'listening' : ''} ${thinking ? 'thinking' : ''}`}
      role="img"
      aria-label={`Ms. Nova, the AI teacher${talking ? ', talking' : listening ? ', listening' : thinking ? ', thinking' : ''}`}
    >
      <defs>
        <linearGradient id="nova-room" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2a2550" />
          <stop offset="1" stopColor="#141226" />
        </linearGradient>
        <linearGradient id="nova-blazer" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6d4cff" />
          <stop offset="1" stopColor="#4a2fd1" />
        </linearGradient>
        <radialGradient id="nova-skin" cx="0.45" cy="0.4" r="0.7">
          <stop offset="0" stopColor="#f0c08e" />
          <stop offset="1" stopColor="#d99a62" />
        </radialGradient>
        <linearGradient id="nova-screen" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4c97ff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#2ab5c9" stopOpacity="0.25" />
        </linearGradient>
      </defs>

      {/* the lab behind her */}
      <rect width="320" height="240" fill="url(#nova-room)" />
      <g opacity="0.9">
        <rect x="18" y="26" width="92" height="62" rx="6" fill="url(#nova-screen)" stroke="#6fb4ff" strokeOpacity="0.6" />
        <path className="screen-arm" d="M40 78 v-20 h22 l14 -12" stroke="#bfe0ff" strokeWidth="4" fill="none" strokeLinecap="round" />
        <rect x="214" y="30" width="86" height="54" rx="6" fill="url(#nova-screen)" stroke="#6fb4ff" strokeOpacity="0.6" />
        <polyline className="screen-graph" points="222,74 238,62 252,66 268,46 290,40" stroke="#bfffd9" strokeWidth="3" fill="none" />
      </g>
      <rect y="196" width="320" height="44" fill="#0e0d1c" opacity="0.7" />

      <g className="nova-body">
        {/* hair back + bun */}
        <circle cx="160" cy="70" r="20" fill="#1c1420" />
        <ellipse cx="160" cy="118" rx="52" ry="58" fill="#1c1420" />
        {/* shoulders */}
        <path d="M78 240 C 82 186, 118 170, 160 170 S 238 186, 242 240 Z" fill="url(#nova-blazer)" />
        <path d="M142 172 L160 206 L178 172 Z" fill="#f4f1fb" />
        {/* robot pin */}
        <g transform="translate(206 206)">
          <rect x="-8" y="-6" width="16" height="12" rx="3" fill="#f2a33a" />
          <circle cx="-3" cy="0" r="1.6" fill="#1d1b2f" />
          <circle cx="3" cy="0" r="1.6" fill="#1d1b2f" />
        </g>
        <rect x="149" y="150" width="22" height="26" rx="8" fill="#d99a62" />
        {/* head */}
        <g className="nova-head">
          <ellipse cx="160" cy="118" rx="40" ry="46" fill="url(#nova-skin)" />
          <path d="M120 112 C 122 78, 150 66, 176 72 C 194 76, 202 92, 200 112 C 190 96, 170 88, 150 92 C 136 96, 126 104, 120 112 Z" fill="#1c1420" />
          {/* glasses */}
          <g fill="none" stroke="#2b2a33" strokeWidth="2.6">
            <rect x="130" y="110" width="24" height="17" rx="7" />
            <rect x="166" y="110" width="24" height="17" rx="7" />
            <path d="M154 117 h12" />
          </g>
          <g className="nova-eyes" fill="#1d1b2f">
            <ellipse cx="142" cy="119" rx="3.2" ry="3.6" />
            <ellipse cx="178" cy="119" rx="3.2" ry="3.6" />
          </g>
          <circle cx="132" cy="136" r="5" fill="#e88a7a" opacity="0.35" />
          <circle cx="188" cy="136" r="5" fill="#e88a7a" opacity="0.35" />
          {/* mouth: a smile at rest, opens while talking */}
          {sync && mouth! > 0.06 ? (
            <ellipse cx="160" cy="146" rx={7 + mouth! * 3} ry={1.5 + mouth! * 6.5} fill="#7a2f2a" />
          ) : (
            <>
              <path className="mouth-smile" d="M147 143 q13 10 26 0" stroke="#8a3b34" strokeWidth="3" fill="none" strokeLinecap="round" />
              <ellipse className="mouth-talk" cx="160" cy="146" rx="9" ry="5" fill="#7a2f2a" />
            </>
          )}
          {/* headset */}
          <path d="M118 112 C 118 70, 202 70, 202 112" stroke="#2b2a33" strokeWidth="5" fill="none" />
          <rect x="112" y="106" width="12" height="22" rx="5" fill="#2b2a33" />
          <rect x="196" y="106" width="12" height="22" rx="5" fill="#2b2a33" />
          <path d="M118 126 C 120 146, 132 152, 146 150" stroke="#2b2a33" strokeWidth="3" fill="none" />
          <circle cx="147" cy="150" r="3.5" fill="#d01f3c" className="mic-dot" />
        </g>
      </g>
      {/* thinking dots */}
      <g className="think-dots" fill="#ffffff">
        <circle cx="226" cy="100" r="4" />
        <circle cx="240" cy="100" r="4" />
        <circle cx="254" cy="100" r="4" />
      </g>
    </svg>
  );
}
