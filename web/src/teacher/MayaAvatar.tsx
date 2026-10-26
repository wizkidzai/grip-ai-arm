/** Maya, the learner in the how-to videos (head and shoulders, video-call style). */
export function MayaAvatar({ mouth = 0, talking = false }: { mouth?: number; talking?: boolean }) {
  const open = mouth > 0.06;
  return (
    <svg viewBox="0 0 320 240" preserveAspectRatio="xMidYMid slice" className={`maya-cam ${talking ? 'talking' : ''}`} role="img" aria-label="Maya">
      <defs>
        <linearGradient id="maya-room" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe3c2" />
          <stop offset="1" stopColor="#f6c99a" />
        </linearGradient>
        <radialGradient id="maya-skin" cx="0.45" cy="0.4" r="0.7">
          <stop offset="0" stopColor="#a86a3c" />
          <stop offset="1" stopColor="#7d4a24" />
        </radialGradient>
      </defs>
      {/* her bedroom workshop */}
      <rect width="320" height="240" fill="url(#maya-room)" />
      <rect x="226" y="28" width="70" height="56" rx="6" fill="#bfe6ff" stroke="#fff6ea" strokeWidth="5" />
      <rect x="22" y="44" width="66" height="8" rx="3" fill="#b5844e" />
      <rect x="28" y="22" width="14" height="22" rx="3" fill="#4c97ff" />
      <circle cx="58" cy="34" r="9" fill="#2ead5a" />
      <rect x="70" y="26" width="12" height="18" rx="2" fill="#f2a33a" />
      <g className="maya-body">
        {/* curly hair back */}
        {[
          [124, 70], [146, 52], [172, 48], [196, 58], [208, 82], [116, 96], [212, 108], [118, 122], [206, 132],
        ].map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r="24" fill="#2b1b12" />
        ))}
        {/* shoulders: teal GRIP hoodie */}
        <path d="M70 240 C 76 190, 116 176, 160 176 S 244 190, 250 240 Z" fill="#1f9e8f" />
        <path d="M134 178 q26 22 52 0" stroke="#17786d" strokeWidth="6" fill="none" />
        <rect x="140" y="206" width="40" height="18" rx="4" fill="#fff" opacity="0.92" />
        <text x="160" y="219" textAnchor="middle" fontSize="11" fontWeight="900" fill="#1f9e8f">
          GRIP
        </text>
        <rect x="150" y="156" width="20" height="24" rx="8" fill="#7d4a24" />
        <g className="maya-head">
          <ellipse cx="160" cy="118" rx="40" ry="44" fill="url(#maya-skin)" />
          {/* curly fringe */}
          {[[130, 82], [148, 74], [168, 74], [186, 82]].map(([cx, cy], i) => (
            <circle key={i} cx={cx} cy={cy} r="14" fill="#2b1b12" />
          ))}
          {/* goggles on her forehead */}
          <rect x="128" y="86" width="64" height="14" rx="7" fill="#4c97ff" />
          <circle cx="144" cy="93" r="5" fill="#bfe6ff" />
          <circle cx="176" cy="93" r="5" fill="#bfe6ff" />
          <g className="maya-eyes" fill="#1d1b2f">
            <ellipse cx="144" cy="118" rx="4" ry="4.6" />
            <ellipse cx="176" cy="118" rx="4" ry="4.6" />
            <circle cx="145.5" cy="116.5" r="1.3" fill="#fff" />
            <circle cx="177.5" cy="116.5" r="1.3" fill="#fff" />
          </g>
          <path d="M136 108 q8 -5 16 0 M168 108 q8 -5 16 0" stroke="#2b1b12" strokeWidth="2.4" fill="none" strokeLinecap="round" />
          <circle cx="132" cy="134" r="6" fill="#d9775a" opacity="0.4" />
          <circle cx="188" cy="134" r="6" fill="#d9775a" opacity="0.4" />
          {open ? (
            <ellipse cx="160" cy="141" rx={6 + mouth * 3} ry={1.5 + mouth * 6} fill="#5a1f1a" />
          ) : (
            <path d="M148 139 q12 9 24 0" stroke="#5a1f1a" strokeWidth="3" fill="none" strokeLinecap="round" />
          )}
        </g>
      </g>
    </svg>
  );
}
