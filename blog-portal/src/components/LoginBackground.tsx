/** MCP login tarzı açık mor + blog/yazı motifleri */
export function LoginBackground() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Bir tık daha açık mor — mcp.matriks.ai/login benzeri */}
      <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_20%_15%,#6B4BC4_0%,#4A2F9E_38%,#3A2584_68%,#2C1B6A_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_75%_25%,rgba(150,120,255,0.42),transparent_55%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_60%_90%,rgba(90,160,255,0.16),transparent_48%)]" />

      {/* Soft glows */}
      <div className="absolute -left-8 top-[18%] h-72 w-72 rounded-full bg-[#9B7CFF]/25 blur-3xl" />
      <div className="absolute right-8 top-8 h-56 w-56 rounded-full bg-[#7AA2FF]/20 blur-3xl" />
      <div className="absolute bottom-10 left-[40%] h-44 w-80 rounded-full bg-[#00D07B]/10 blur-3xl" />

      <svg
        className="absolute inset-0 h-full w-full opacity-[0.62]"
        viewBox="0 0 1440 900"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid slice"
      >
        {/* Sol üst: belge / blog kartı */}
        <g opacity="0.7" transform="translate(80,140)">
          <rect
            x="0"
            y="0"
            width="120"
            height="150"
            rx="14"
            stroke="rgba(220,225,255,0.65)"
            strokeWidth="1.5"
            fill="rgba(255,255,255,0.05)"
          />
          <rect x="18" y="28" width="84" height="8" rx="4" fill="rgba(210,220,255,0.55)" />
          <rect x="18" y="48" width="68" height="6" rx="3" fill="rgba(190,200,255,0.35)" />
          <rect x="18" y="64" width="76" height="6" rx="3" fill="rgba(190,200,255,0.3)" />
          <rect x="18" y="80" width="52" height="6" rx="3" fill="rgba(190,200,255,0.25)" />
          <rect x="18" y="108" width="40" height="18" rx="6" fill="rgba(0,208,123,0.35)" />
          <text
            x="60"
            y="142"
            textAnchor="middle"
            fill="rgba(220,225,255,0.8)"
            fontSize="11"
            fontFamily="Inter, system-ui, sans-serif"
            fontWeight="600"
          >
            BLOG
          </text>
        </g>

        {/* Kalem ikonu */}
        <g opacity="0.55" transform="translate(250,200) rotate(-25)">
          <rect x="0" y="8" width="86" height="14" rx="4" fill="rgba(210,220,255,0.45)" />
          <path d="M86 8 L108 15 L86 22 Z" fill="rgba(230,235,255,0.7)" />
          <rect x="-8" y="6" width="12" height="18" rx="2" fill="rgba(160,180,255,0.55)" />
        </g>

        {/* Orta-sol: tırnak / alıntı */}
        <g opacity="0.4" transform="translate(320,360)">
          <path
            d="M12 8 C4 18, 2 28, 10 40 L22 40 C16 30, 16 22, 24 12 Z"
            fill="rgba(210,220,255,0.55)"
          />
          <path
            d="M40 8 C32 18, 30 28, 38 40 L50 40 C44 30, 44 22, 52 12 Z"
            fill="rgba(210,220,255,0.4)"
          />
        </g>

        {/* Bağlantı çizgileri — yazı akışı hissi */}
        <g stroke="rgba(195,205,255,0.32)" strokeWidth="1.15" strokeLinecap="round">
          <path d="M220 300 C340 250, 460 290, 580 240" />
          <path d="M260 420 C400 380, 520 450, 700 390" />
          <path d="M580 240 C720 200, 860 270, 1020 230" />
          <path d="M700 390 C860 340, 980 420, 1160 370" />
          <path d="M1020 230 C1140 190, 1260 250, 1380 210" />
          <path d="M480 520 C640 480, 800 560, 980 500" />
        </g>

        {/* Satır / paragraf noktaları */}
        <g fill="rgba(210,220,255,0.7)">
          {[
            [220, 300],
            [340, 270],
            [460, 290],
            [580, 240],
            [700, 390],
            [860, 340],
            [1020, 230],
            [1160, 370],
            [1380, 210],
            [260, 420],
            [480, 520],
            [800, 540],
            [980, 500],
          ].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={i % 3 === 0 ? 4 : 2.8} />
          ))}
        </g>

        {/* Sağ üst: notebook */}
        <g opacity="0.55" transform="translate(1180,150)">
          <rect
            x="0"
            y="0"
            width="130"
            height="100"
            rx="12"
            stroke="rgba(220,225,255,0.55)"
            strokeWidth="1.4"
            fill="rgba(255,255,255,0.04)"
          />
          <line x1="28" y1="8" x2="28" y2="92" stroke="rgba(200,210,255,0.35)" strokeWidth="1.2" />
          <rect x="42" y="28" width="70" height="5" rx="2.5" fill="rgba(210,220,255,0.45)" />
          <rect x="42" y="42" width="58" height="5" rx="2.5" fill="rgba(190,200,255,0.3)" />
          <rect x="42" y="56" width="64" height="5" rx="2.5" fill="rgba(190,200,255,0.28)" />
          <rect x="42" y="70" width="40" height="5" rx="2.5" fill="rgba(190,200,255,0.22)" />
        </g>

        {/* Sağ orta: chat/balon — içerik sohbeti */}
        <g opacity="0.45" transform="translate(1100,420)">
          <rect
            x="0"
            y="0"
            width="96"
            height="58"
            rx="16"
            fill="rgba(255,255,255,0.06)"
            stroke="rgba(210,220,255,0.5)"
            strokeWidth="1.3"
          />
          <path d="M28 58 L40 74 L44 58 Z" fill="rgba(210,220,255,0.35)" />
          <circle cx="30" cy="29" r="3.5" fill="rgba(210,220,255,0.55)" />
          <circle cx="48" cy="29" r="3.5" fill="rgba(210,220,255,0.45)" />
          <circle cx="66" cy="29" r="3.5" fill="rgba(210,220,255,0.35)" />
        </g>

        {/* Alt sol: checklist (kalite raporu hissi) */}
        <g opacity="0.5" transform="translate(140,680)">
          <rect
            x="0"
            y="0"
            width="150"
            height="90"
            rx="12"
            stroke="rgba(210,220,255,0.45)"
            strokeWidth="1.3"
            fill="rgba(255,255,255,0.04)"
          />
          <rect x="16" y="22" width="14" height="14" rx="3" stroke="rgba(0,208,123,0.7)" strokeWidth="1.4" fill="rgba(0,208,123,0.2)" />
          <path d="M19 29 L22 32 L27 25" stroke="rgba(0,208,123,0.9)" strokeWidth="1.5" fill="none" />
          <rect x="40" y="25" width="90" height="6" rx="3" fill="rgba(200,210,255,0.4)" />
          <rect x="16" y="48" width="14" height="14" rx="3" stroke="rgba(200,210,255,0.5)" strokeWidth="1.2" />
          <rect x="40" y="51" width="70" height="6" rx="3" fill="rgba(190,200,255,0.3)" />
        </g>

        {/* Alt orta: hashtag / SEO */}
        <g opacity="0.35" transform="translate(520,720)">
          <text
            x="0"
            y="0"
            fill="rgba(220,225,255,0.7)"
            fontSize="28"
            fontFamily="Inter, system-ui, sans-serif"
            fontWeight="700"
          >
            #
          </text>
          <text
            x="28"
            y="0"
            fill="rgba(200,210,255,0.45)"
            fontSize="16"
            fontFamily="Inter, system-ui, sans-serif"
            fontWeight="600"
          >
            SEO
          </text>
        </g>

        {/* Sağ alt: yayın oku */}
        <g opacity="0.4" transform="translate(1240,680)">
          <circle cx="36" cy="36" r="34" stroke="rgba(210,220,255,0.4)" strokeWidth="1.3" fill="rgba(255,255,255,0.03)" />
          <path
            d="M24 36 L48 36 M40 28 L48 36 L40 44"
            stroke="rgba(0,208,123,0.75)"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      </svg>

      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(20,12,50,0.35)_100%)]" />
    </div>
  )
}
