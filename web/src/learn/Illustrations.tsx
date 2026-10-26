import type { ReactNode } from 'react';
import { Art, GIRLS_IN_ROBOTICS } from './lessons';

/**
 * Cutscene artwork: small animated SVG scenes (no video files, works offline).
 * Animations live in learn.css and are switched off for prefers-reduced-motion.
 */

type PipMove = 'idle' | 'wave' | 'nod' | 'reach' | 'copy' | 'dance';

/** Pip, the robot arm. viewBox 0 0 200 200, base at the bottom middle. */
function Pip({ move = 'idle', highlight, x = 0, scale = 1, tint = '#f2a33a' }: { move?: PipMove; highlight?: boolean; x?: number; scale?: number; tint?: string }) {
  return (
    <g transform={`translate(${x} 0) scale(${scale})`} className={`pip ${move} ${highlight ? 'highlight' : ''}`}>
      <ellipse cx="100" cy="190" rx="44" ry="6" fill="#000" opacity="0.18" />
      <rect x="70" y="178" width="60" height="10" rx="3" fill="#3b3850" />
      <g className="j0 base">
        <rect x="82" y="148" width="36" height="32" rx="8" fill={tint} />
        <rect x="86" y="151" width="8" height="26" rx="4" fill="#fff" opacity="0.28" />
        <circle className="joint" cx="100" cy="150" r="7" fill="#2b2a33" />
        <g className="j1 upper">
          <rect x="93" y="92" width="14" height="60" rx="6" fill={tint} />
          <rect x="95" y="96" width="4" height="52" rx="2" fill="#fff" opacity="0.3" />
          <circle className="joint" cx="100" cy="95" r="7" fill="#2b2a33" />
          <g className="j2 fore">
            <rect x="98" y="88" width="56" height="13" rx="6" fill={tint} />
            <rect x="102" y="90" width="48" height="3.5" rx="1.7" fill="#fff" opacity="0.3" />
            <circle className="joint" cx="152" cy="94" r="6" fill="#2b2a33" />
            <g className="j3 wrist">
              <rect x="150" y="88" width="16" height="12" rx="4" fill="#2b2a33" />
              <g className="j5 jaw-top">
                <rect x="164" y="84" width="20" height="5" rx="2" fill="#f4f1fb" />
              </g>
              <g className="j5 jaw-bottom">
                <rect x="164" y="99" width="20" height="5" rx="2" fill="#f4f1fb" />
              </g>
              <circle cx="158" cy="83" r="3.5" fill="#5b3df5" className="cam" />
            </g>
          </g>
        </g>
      </g>
      <g className="face">
        <circle cx="93" cy="162" r="2.6" fill="#1d1b2f" className="eye" />
        <circle cx="107" cy="162" r="2.6" fill="#1d1b2f" className="eye" />
        <path d="M94 169 q6 5 12 0" stroke="#1d1b2f" strokeWidth="2" fill="none" strokeLinecap="round" />
      </g>
    </g>
  );
}

/** Maya. viewBox-local box ~120x170 placed at (x, y). */
function Maya({ x = 0, y = 0, wave = true, scale = 1 }: { x?: number; y?: number; wave?: boolean; scale?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} className="maya">
      <ellipse cx="63" cy="164" rx="34" ry="5" fill="#000" opacity="0.18" />
      {/* hair (curly) */}
      {[
        [40, 26],
        [52, 18],
        [66, 16],
        [80, 20],
        [88, 32],
        [36, 40],
        [90, 46],
      ].map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r="12" fill="#2b1b12" />
      ))}
      <circle cx="58" cy="20" r="5" fill="#5a3a26" opacity="0.6" />
      <circle cx="63" cy="44" r="22" fill="#8d5524" />
      <circle cx="49" cy="51" r="4" fill="#c66f52" opacity="0.45" />
      <circle cx="77" cy="51" r="4" fill="#c66f52" opacity="0.45" />
      <circle cx="55" cy="44" r="2.6" fill="#1d1b2f" className="eye" />
      <circle cx="71" cy="44" r="2.6" fill="#1d1b2f" className="eye" />
      <path d="M55 54 q8 7 16 0" stroke="#1d1b2f" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      {/* goggles on forehead: she builds things */}
      <rect x="47" y="27" width="32" height="8" rx="4" fill="#4c97ff" opacity="0.9" />
      {/* body */}
      <rect x="40" y="68" width="46" height="58" rx="14" fill="#1f9e8f" />
      <rect x="52" y="86" width="22" height="14" rx="3" fill="#ffffff" opacity="0.9" />
      <text x="63" y="97" textAnchor="middle" fontSize="9" fontWeight="900" fill="#1f9e8f">
        GRIP
      </text>
      <rect x="44" y="126" width="16" height="34" rx="6" fill="#33304a" />
      <rect x="66" y="126" width="16" height="34" rx="6" fill="#33304a" />
      <rect x="40" y="156" width="22" height="8" rx="4" fill="#f2a33a" />
      <rect x="64" y="156" width="22" height="8" rx="4" fill="#f2a33a" />
      <rect x="22" y="74" width="14" height="40" rx="7" fill="#8d5524" />
      <g className={wave ? 'maya-wave' : ''}>
        <rect x="84" y="38" width="14" height="42" rx="7" fill="#8d5524" />
      </g>
    </g>
  );
}

function Stars() {
  return (
    <g className="sparkles" aria-hidden="true">
      {[
        [30, 30],
        [270, 40],
        [250, 150],
        [50, 160],
      ].map(([x, y], i) => (
        <text key={i} x={x} y={y} fontSize="18" style={{ animationDelay: `${i * 0.4}s` }}>
          ✦
        </text>
      ))}
    </g>
  );
}

/** Single-series bar chart: girls' share at each stage. Direct labels, hover titles, SR table. */
function StatsChart() {
  const W = 300;
  const H = 200;
  const base = 160;
  const max = 60;
  const bw = 58;
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} className="art stats-chart" role="img" aria-labelledby="stats-title">
        <title id="stats-title">
          Girls' share in robotics: elementary school about 50%, middle school about 20%, robotics and AI jobs about 16%.
        </title>
        <line x1="20" y1={base} x2={W - 20} y2={base} className="axis" />
        {GIRLS_IN_ROBOTICS.map((d, i) => {
          const h = ((base - 20) * d.share) / max;
          const x = 34 + i * 88;
          return (
            <g key={d.stage} className="bar-group" style={{ animationDelay: `${0.3 + i * 0.9}s` }} tabIndex={0}>
              <title>{`${d.stage}: about ${d.share}%. ${d.detail}.`}</title>
              <rect x={x - 6} y={10} width={bw + 12} height={base - 10} fill="transparent" />
              <path
                className="bar"
                style={{ animationDelay: `${0.3 + i * 0.9}s` }}
                d={`M${x} ${base} V${base - h + 4} q0 -4 4 -4 H${x + bw - 4} q4 0 4 4 V${base} Z`}
              />
              <text x={x + bw / 2} y={base - h - 8} textAnchor="middle" className="value">
                {d.share}%
              </text>
              <text x={x + bw / 2} y={base + 14} textAnchor="middle" className="label">
                {d.stage.split(' ').reduce<string[]>((lines, w) => {
                  // two short lines so neighbouring labels never touch
                  if (lines.length && (lines[lines.length - 1] + ' ' + w).length <= 10) lines[lines.length - 1] += ' ' + w;
                  else lines.push(w);
                  return lines;
                }, []).map((line, k) => (
                  <tspan key={k} x={x + bw / 2} dy={k ? 12 : 0}>
                    {line}
                  </tspan>
                ))}
              </text>
            </g>
          );
        })}
      </svg>
      <table className="sr-only">
        <caption>Girls' share in robotics at each stage</caption>
        <tbody>
          {GIRLS_IN_ROBOTICS.map((d) => (
            <tr key={d.stage}>
              <th scope="row">{d.stage}</th>
              <td>about {d.share}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

const ROLE_MODELS = [
  { name: 'Ayanna Howard', what: 'robots that help children', color: '#4c97ff' },
  { name: 'Cynthia Breazeal', what: 'friendly social robots', color: '#9966ff' },
  { name: 'Daniela Rus', what: 'leads MIT’s AI lab', color: '#2ab5c9' },
  { name: 'Fei-Fei Li', what: 'helped computers see', color: '#2ead5a' },
];

function RoleModels() {
  return (
    <div className="art role-models">
      {ROLE_MODELS.map((r, i) => (
        <div key={r.name} className="role-card" style={{ animationDelay: `${0.3 + i * 0.5}s` }}>
          <span className="role-avatar" style={{ background: r.color }} aria-hidden="true">
            {r.name
              .split(' ')
              .map((w) => w[0])
              .join('')}
          </span>
          <strong>{r.name}</strong>
          <span>{r.what}</span>
        </div>
      ))}
    </div>
  );
}

function Svg({ children, label }: { children: ReactNode; label: string }) {
  return (
    <svg viewBox="0 0 300 200" className="art" role="img" aria-label={label}>
      {children}
    </svg>
  );
}

export function SceneArt({ art }: { art: Art }) {
  switch (art) {
    case 'maya-hello':
      return (
        <Svg label="Maya waves hello">
          <Stars />
          <Maya x={90} y={20} />
        </Svg>
      );
    case 'delivery':
      return (
        <Svg label="Pip pops out of a box and waves">
          <g className="box">
            <rect x="60" y="130" width="180" height="60" rx="6" fill="#c8a26a" />
            <rect x="60" y="130" width="180" height="14" fill="#b58d55" />
          </g>
          <g className="rise">
            <Pip move="wave" x={20} scale={0.9} />
          </g>
          <Maya x={-10} y={40} scale={0.85} wave={false} />
        </Svg>
      );
    case 'stats':
      return (
        <div className="stats-card">
          <StatsChart />
        </div>
      );
    case 'why':
      return (
        <Svg label="Maya thinking, with question marks">
          <Maya x={40} y={25} wave={false} />
          {['?', '?', '?'].map((q, i) => (
            <text key={i} x={190 + i * 26} y={70 - i * 12} fontSize="34" className="float" style={{ animationDelay: `${i * 0.5}s` }}>
              {q}
            </text>
          ))}
        </Svg>
      );
    case 'role-models':
      return <RoleModels />;
    case 'grip':
      return (
        <Svg label="Maya and Pip together under the GRIP logo">
          <text x="150" y="34" textAnchor="middle" className="title-text">
            GRIP
          </text>
          <Maya x={30} y={34} scale={0.9} />
          <Pip move="wave" x={110} scale={0.85} />
          <Stars />
        </Svg>
      );
    case 'class-map':
      return (
        <Svg label="A path of six classes">
          <path d="M30 160 C 80 60, 130 180, 170 90 S 260 40, 270 120" className="path" />
          {['👋', '🕹️', '🧩', '🪞', '🧠', '🔬'].map((e, i) => {
            const pts = [
              [30, 160],
              [78, 108],
              [128, 140],
              [172, 92],
              [228, 64],
              [270, 120],
            ];
            return (
              <g key={i} className="stop-dot" style={{ animationDelay: `${i * 0.35}s` }}>
                <circle cx={pts[i][0]} cy={pts[i][1]} r="16" fill="#ffffff" stroke="#5b3df5" strokeWidth="3" />
                <text x={pts[i][0]} y={pts[i][1] + 6} textAnchor="middle" fontSize="16">
                  {e}
                </text>
              </g>
            );
          })}
        </Svg>
      );
    case 'joints':
      return (
        <Svg label="Pip with each joint lighting up">
          <Pip move="dance" highlight x={40} />
        </Svg>
      );
    case 'safety':
      return (
        <Svg label="Hands clear, and a big STOP button">
          <Pip move="idle" x={-30} scale={0.9} />
          <g className="pulse">
            <circle cx="215" cy="100" r="44" fill="#d01f3c" />
            <text x="215" y="108" textAnchor="middle" fontSize="22" fontWeight="800" fill="#fff">
              STOP
            </text>
          </g>
          <text x="215" y="172" textAnchor="middle" fontSize="15" className="ink">
            ✋ hands clear
          </text>
        </Svg>
      );
    case 'dial':
      return (
        <Svg label="A dial showing degrees">
          <path d="M60 150 A 90 90 0 0 1 240 150" className="dial-arc" />
          <text x="150" y="172" textAnchor="middle" className="ink" fontSize="16">
            0°
          </text>
          <text x="50" y="172" className="ink" fontSize="14">
            −90°
          </text>
          <text x="226" y="172" className="ink" fontSize="14">
            +90°
          </text>
          <g className="needle">
            <line x1="150" y1="150" x2="150" y2="70" stroke="#f2a33a" strokeWidth="8" strokeLinecap="round" />
          </g>
          <circle cx="150" cy="150" r="9" fill="#2b2a33" />
        </Svg>
      );
    case 'poses':
      return (
        <Svg label="Pip striking poses">
          <Pip move="dance" x={50} />
        </Svg>
      );
    case 'blocks':
    case 'loop':
      return (
        <Svg label={art === 'loop' ? 'A repeat block looping' : 'Code blocks stacking up'}>
          {(art === 'loop'
            ? [
                ['repeat 3 times', '#ffab19'],
                ['  move wrist up', '#4c97ff'],
                ['  move wrist down', '#4c97ff'],
              ]
            : [
                ['when ▶ Go is pressed', '#ffbf00'],
                ['strike a pose: wave', '#2ab5c9'],
                ['open hand ✋', '#9966ff'],
                ['go home 🏠', '#4c97ff'],
              ]
          ).map(([t, c], i) => (
            <g key={i} className="block-drop" style={{ animationDelay: `${i * 0.6}s` }}>
              <rect x={40 + (t.startsWith('  ') ? 16 : 0)} y={30 + i * 36} width="190" height="30" rx="8" fill={c} />
              <text x={52 + (t.startsWith('  ') ? 16 : 0)} y={50 + i * 36} fill="#fff" fontSize="14" fontWeight="700">
                {t.trim()}
              </text>
            </g>
          ))}
          {art === 'loop' && <path d="M250 50 q30 50 0 100" className="loop-arrow" />}
        </Svg>
      );
    case 'leader-follower':
      return (
        <Svg label="The controller arm and Pip moving together like a mirror">
          <Pip move="copy" x={-50} scale={0.85} tint="#4f7cff" />
          <Pip move="copy" x={110} scale={0.85} />
          <text x="150" y="40" textAnchor="middle" fontSize="15" className="ink">
            🎮 → 🤖
          </text>
        </Svg>
      );
    case 'demos':
      return (
        <Svg label="Recording practice examples">
          <Pip move="reach" x={-20} scale={0.85} />
          {[0, 1, 2].map((i) => (
            <g key={i} className="block-drop" style={{ animationDelay: `${i * 0.7}s` }}>
              <rect x="190" y={40 + i * 46} width="80" height="36" rx="8" fill="#ffffff" stroke="#d01f3c" strokeWidth="2" />
              <text x="230" y={63 + i * 46} textAnchor="middle" fontSize="14" fill="#d01f3c" fontWeight="700">
                ⏺ demo {i + 1}
              </text>
            </g>
          ))}
        </Svg>
      );
    case 'brain':
      return (
        <Svg label="A line of mistakes going down as the brain learns">
          <text x="40" y="34" fontSize="30" aria-hidden="true">
            🧠
          </text>
          <line x1="40" y1="170" x2="270" y2="170" className="axis" />
          <line x1="40" y1="50" x2="40" y2="170" className="axis" />
          <path d="M42 60 C 70 140, 100 150, 140 158 S 230 165, 268 166" className="loss-line" />
          <text x="268" y="186" textAnchor="end" fontSize="12" className="ink">
            practice rounds →
          </text>
          <text x="48" y="64" fontSize="12" className="ink">
            mistakes
          </text>
        </Svg>
      );
    case 'trials':
      return (
        <Svg label="Ten tries, most of them checked">
          {Array.from({ length: 10 }, (_, i) => (
            <text
              key={i}
              x={40 + (i % 5) * 52}
              y={i < 5 ? 80 : 140}
              fontSize="30"
              className="block-drop"
              style={{ animationDelay: `${i * 0.35}s` }}
            >
              {[2, 6].includes(i) ? '🔁' : '✅'}
            </text>
          ))}
          <text x="150" y="186" textAnchor="middle" className="ink" fontSize="15" fontWeight="700">
            8 out of 10 = 80% success
          </text>
        </Svg>
      );
    case 'graduation':
      return (
        <Svg label="Maya and Pip celebrate">
          <Stars />
          <Maya x={30} y={30} scale={0.9} />
          <Pip move="dance" x={110} scale={0.85} />
          {['🎉', '⭐', '🎊', '⭐'].map((c, i) => (
            <text key={i} x={40 + i * 70} y={30} fontSize="22" className="float" style={{ animationDelay: `${i * 0.3}s` }}>
              {c}
            </text>
          ))}
        </Svg>
      );
  }
}
