import { useRef, useState } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import {
  Eye,
  EyeOff,
  ArrowUpRight,
  ArrowDownLeft,
  Plus,
  ScanLine,
  CreditCard,
  Home,
  PieChart,
  Layers,
  User,
  ChevronRight,
  Bell,
  Flower2,
  Scissors,
  Package,
  Landmark,
  Anvil,
  Sprout,
} from "lucide-react";

/* ---------- decorative sprig svg ---------- */
const Sprig = ({ className, color = "#9DBE85", flip = false }) => (
  <svg
    viewBox="0 0 70 150"
    fill="none"
    className={className}
    style={flip ? { transform: "scaleX(-1)" } : undefined}
  >
    <path d="M35 148 C35 108 33 60 38 6" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
    {[20, 38, 56, 74, 92, 110].map((y, i) => (
      <g key={y}>
        <path
          d={`M36 ${y} C ${22 - i} ${y - 6}, ${16 - i} ${y - 18}, ${24 - i} ${y - 24} C ${34} ${y - 16}, ${37} ${y - 8}, 36 ${y}`}
          fill={color}
          opacity="0.85"
        />
        <path
          d={`M36 ${y + 8} C ${50 + i} ${y + 2}, ${56 + i} ${y - 10}, ${48 + i} ${y - 16} C ${38} ${y - 8}, ${35} ${y}, 36 ${y + 8}`}
          fill={color}
          opacity="0.6"
        />
      </g>
    ))}
    <circle cx="38" cy="8" r="4.5" fill={color} />
  </svg>
);

const Blossom = ({ className, color = "#E8B85F" }) => (
  <svg viewBox="0 0 60 60" fill="none" className={className}>
    {[0, 60, 120, 180, 240, 300].map((r) => (
      <ellipse
        key={r}
        cx="30"
        cy="17"
        rx="7"
        ry="13"
        fill={color}
        opacity="0.8"
        transform={`rotate(${r} 30 30)`}
      />
    ))}
    <circle cx="30" cy="30" r="6" fill="#1C1810" />
    <circle cx="30" cy="30" r="3.5" fill={color} />
  </svg>
);

/* ---------- data ---------- */
const accounts = [
  {
    name: "Everyday Purse",
    sub: "Current · ··4417",
    balance: "£2,847.20",
    change: "+£312 this week",
    accent: "#E8B85F",
    icon: CreditCard,
  },
  {
    name: "Workshop Reserve",
    sub: "Savings · 4.1% AER",
    balance: "£12,460.00",
    change: "+£42.18 interest",
    accent: "#9DBE85",
    icon: Anvil,
  },
  {
    name: "Wool & Linen Fund",
    sub: "Pot · auto-stitch on",
    balance: "£638.75",
    change: "Rounds up every sale",
    accent: "#D99AB8",
    icon: Flower2,
  },
];

const jars = [
  { name: "New Floor Loom", saved: 1840, goal: 2400, accent: "#E8B85F" },
  { name: "Pottery Kiln", saved: 920, goal: 3200, accent: "#D99AB8" },
  { name: "Spring Market Stall", saved: 410, goal: 600, accent: "#9DBE85" },
  { name: "Linen Restock", saved: 265, goal: 450, accent: "#C9A0E8" },
];

const txns = [
  { name: "Meadowsweet Yarns", note: "Merino DK · 12 skeins", amount: -86.4, when: "Today, 14:12", icon: Flower2, tint: "#D99AB8" },
  { name: "Etsy Payout", note: "Weekly settlement", amount: 312.84, when: "Today, 09:00", icon: Landmark, tint: "#9DBE85" },
  { name: "Brambleberry Fabrics", note: "Linen bolt · oat & rust", amount: -124.15, when: "Yesterday", icon: Scissors, tint: "#E8B85F" },
  { name: "The Copper Kettle Pottery", note: "Glazes & slip trailers", amount: -58.2, when: "Yesterday", icon: Package, tint: "#C9A0E8" },
  { name: "Guild Member Dues", note: "Hartfield Makers Guild", amount: 45.0, when: "Mon, 3 Jun", icon: Sprout, tint: "#9DBE85" },
  { name: "Royal Mail · Parcels", note: "Order dispatch x14", amount: -37.9, when: "Mon, 3 Jun", icon: Package, tint: "#E8B85F" },
];

const stories = [
  {
    title: "A Century of Thread",
    sub: "Why we still keep ledgers by hand — and by heart.",
    img: "https://images.unsplash.com/photo-1528396518501-b53b655eb9b3?w=800&h=600&fit=crop",
    tag: "OUR STORY",
  },
  {
    title: "Harvest Bond · 4.6% AER",
    sub: "Lock your autumn earnings until the spring fairs.",
    img: "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800&h=600&fit=crop",
    tag: "TREASURY OFFER",
  },
  {
    title: "The Hands Behind the Hearth",
    sub: "Meet the dyers of Hartfield Vale, paid same-day.",
    img: "https://images.unsplash.com/photo-1456086272160-b28b0645b729?w=800&h=600&fit=crop",
    tag: "MAKER LEDGER",
  },
];

const fmt = (n) =>
  (n < 0 ? "−£" : "+£") + Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

export default function App() {
  const scrollRef = useRef(null);
  const { scrollY } = useScroll({ container: scrollRef });

  const moonY = useTransform(scrollY, [0, 700], [0, -110]);
  const sprigBackY = useTransform(scrollY, [0, 700], [0, -40]);
  const sprigFrontY = useTransform(scrollY, [0, 700], [0, -150]);
  const blossomY = useTransform(scrollY, [0, 900], [0, 70]);
  const heroFade = useTransform(scrollY, [0, 260], [1, 0.15]);

  const [hidden, setHidden] = useState(false);
  const [filter, setFilter] = useState("All");
  const [tab, setTab] = useState("home");

  const visibleTxns = txns.filter((t) =>
    filter === "All" ? true : filter === "In" ? t.amount > 0 : t.amount < 0
  );

  return (
    <div className="min-h-screen w-full bg-[#131009] text-[#F2EAD8] flex items-center justify-center px-4 py-10 relative overflow-hidden">
      <link
        href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,400;9..144,500;9..144,600;9..144,700&family=Hanken+Grotesk:wght@300;400;500;600;700&display=swap"
        rel="stylesheet"
      />
      <style
        dangerouslySetInnerHTML={{
          __html: `
        :root { color-scheme: dark; }
        body { background:#131009; }
        .font-serif-d { font-family: 'Fraunces', serif; }
        .font-sans-d { font-family: 'Hanken Grotesk', sans-serif; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .grain::after {
          content:""; position:absolute; inset:0; pointer-events:none; opacity:.07; mix-blend-mode:overlay;
          background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
        }
        .stitch {
          background-image:
            radial-gradient(circle at 1px 1px, rgba(242,234,216,0.10) 1px, transparent 1.4px);
          background-size: 14px 14px;
        }
        .candle {
          animation: candle 4.5s ease-in-out infinite;
        }
        @keyframes candle {
          0%,100% { opacity:.85; filter: blur(40px); }
          50% { opacity:1; filter: blur(48px); }
        }
        .app-scroll { scrollbar-width: thin; scrollbar-color: #2c261a transparent; }
        .app-scroll::-webkit-scrollbar { width: 4px; }
        .app-scroll::-webkit-scrollbar-thumb { background:#2c261a; border-radius: 99px; }
      `,
        }}
      />

      {/* desktop backdrop ornaments */}
      <Sprig className="hidden lg:block absolute left-[6%] bottom-[-30px] w-40 opacity-[0.14]" color="#9DBE85" />
      <Sprig className="hidden lg:block absolute right-[5%] top-[-40px] w-36 opacity-[0.12]" color="#D99AB8" flip />
      <div className="hidden lg:block absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[680px] h-[680px] rounded-full bg-[#E8B85F] opacity-[0.05] blur-[120px]" />

      <div className="w-full max-w-6xl grid lg:grid-cols-[1fr_auto] items-center gap-16">
        {/* ------- left brand panel (desktop storytelling) ------- */}
        <div className="hidden lg:block font-sans-d">
          <div className="flex items-center gap-3 mb-10">
            <div className="w-11 h-11 rounded-full border border-[#E8B85F]/50 flex items-center justify-center">
              <Blossom className="w-6 h-6" />
            </div>
            <div>
              <p className="font-serif-d text-lg tracking-wide text-[#F2EAD8]">Hearthstone Treasury</p>
              <p className="text-[11px] tracking-[0.28em] text-[#9a8e72]">FOR MAKERS · EST. 1894</p>
            </div>
          </div>
          <h1 className="font-serif-d text-[56px] leading-[1.04] font-medium text-[#F2EAD8] max-w-xl">
            Money, kept like a<br />
            well-tended <span className="italic font-light text-[#E8B85F]">garden.</span>
          </h1>
          <p className="mt-6 text-[#b8ab8d] max-w-md leading-relaxed text-[15px]">
            The banking home of Hartfield Makers — every skein, kiln firing and market
            stall accounted for with the calm authority of a hundred-year ledger.
          </p>
          <div className="mt-10 grid grid-cols-3 gap-px bg-[#2c261a] border border-[#2c261a] max-w-md">
            {[
              ["4.6%", "Harvest Bond AER"],
              ["12,400", "Maker accounts"],
              ["Same-day", "Craft supplier pay"],
            ].map(([a, b]) => (
              <div key={b} className="bg-[#17140c] px-4 py-5">
                <p className="font-serif-d text-xl text-[#E8B85F]">{a}</p>
                <p className="text-[11px] mt-1 text-[#9a8e72] tracking-wide">{b}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ------- phone ------- */}
        <div className="relative mx-auto w-[392px] h-[812px] rounded-[44px] border border-[#3a3120] bg-[#1A1610] shadow-[0_40px_120px_-30px_rgba(0,0,0,0.9),0_0_0_1px_rgba(232,184,95,0.06)] overflow-hidden grain font-sans-d">
          {/* scroll body */}
          <div
            ref={scrollRef}
            className="absolute inset-0 overflow-y-auto app-scroll pb-28"
          >
            {/* ===== HERO ===== */}
            <div className="relative overflow-hidden pb-9">
              {/* parallax layers */}
              <motion.div
                style={{ y: moonY }}
                className="absolute -top-24 -right-16 w-72 h-72 rounded-full bg-[#E8B85F] candle opacity-90 mix-blend-screen"
              />
              <motion.div style={{ y: sprigBackY, opacity: heroFade }} className="absolute top-10 -left-4">
                <Sprig className="w-24 opacity-25" color="#6f8a5c" />
              </motion.div>
              <motion.div style={{ y: sprigFrontY, opacity: heroFade }} className="absolute top-24 right-3">
                <Sprig className="w-20 opacity-50" color="#9DBE85" flip />
              </motion.div>
              <motion.div style={{ y: blossomY }} className="absolute top-44 left-7 opacity-70">
                <Blossom className="w-9 h-9" color="#D99AB8" />
              </motion.div>
              <div className="absolute inset-0 stitch opacity-60" />

              {/* top bar */}
              <div className="relative flex items-center justify-between px-6 pt-7">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-full border border-[#E8B85F]/60 flex items-center justify-center bg-[#1A1610]/60">
                    <Blossom className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-serif-d text-[15px] leading-none">Hearthstone</p>
                    <p className="text-[9px] tracking-[0.3em] text-[#9a8e72] mt-1">TREASURY · EST. 1894</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button className="w-9 h-9 rounded-full bg-[#241e13] border border-[#3a3120] flex items-center justify-center hover:border-[#E8B85F]/60 transition-colors">
                    <Bell size={15} className="text-[#cfc3a4]" />
                  </button>
                  <img
                    src="https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=120&h=120&fit=crop"
                    alt=""
                    className="w-9 h-9 rounded-full object-cover border border-[#E8B85F]/50"
                  />
                </div>
              </div>

              {/* balance */}
              <motion.div style={{ opacity: heroFade }} className="relative px-6 mt-9">
                <p className="text-[11px] tracking-[0.26em] text-[#9a8e72]">GUILD HOLDINGS · MARGARET ASHWORTH</p>
                <div className="flex items-end gap-3 mt-3">
                  <h2 className="font-serif-d text-[46px] leading-none font-medium text-[#F6EFD9] tabular-nums">
                    {hidden ? "£ ••,•••" : "£15,946"}
                    {!hidden && <span className="text-[26px] text-[#cdbf9c]">.95</span>}
                  </h2>
                  <button
                    onClick={() => setHidden((h) => !h)}
                    className="mb-1 w-8 h-8 rounded-full bg-[#241e13] border border-[#3a3120] flex items-center justify-center hover:border-[#E8B85F]/60 transition-colors"
                  >
                    {hidden ? <EyeOff size={14} className="text-[#cfc3a4]" /> : <Eye size={14} className="text-[#cfc3a4]" />}
                  </button>
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <span className="inline-flex items-center gap-1 text-[12px] text-[#9DBE85] bg-[#9DBE85]/10 border border-[#9DBE85]/25 rounded-full px-2.5 py-1">
                    <ArrowUpRight size={12} /> +£487.30 this week
                  </span>
                  <span className="text-[12px] text-[#9a8e72]">Spring fair season</span>
                </div>
              </motion.div>

              {/* quick actions */}
              <div className="relative grid grid-cols-4 gap-2.5 px-6 mt-8">
                {[
                  { icon: ArrowUpRight, label: "Send" },
                  { icon: Plus, label: "Top up" },
                  { icon: ScanLine, label: "Pay" },
                  { icon: CreditCard, label: "Cards" },
                ].map(({ icon: Icon, label }, i) => (
                  <button
                    key={label}
                    className={`group flex flex-col items-center gap-2 rounded-2xl py-3.5 border transition-all duration-300 ${
                      i === 0
                        ? "bg-[#E8B85F] border-[#E8B85F] text-[#1A1610] hover:bg-[#f0c878]"
                        : "bg-[#241e13] border-[#3a3120] text-[#e7dcbe] hover:border-[#E8B85F]/50 hover:-translate-y-0.5"
                    }`}
                  >
                    <Icon size={17} strokeWidth={2.2} />
                    <span className="text-[11px] font-medium tracking-wide">{label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* ===== ACCOUNTS — horizontal ===== */}
            <Section title="Your accounts" action="Manage">
              <div className="flex gap-3 overflow-x-auto no-scrollbar px-6 pb-1 snap-x snap-mandatory">
                {accounts.map((a) => (
                  <div
                    key={a.name}
                    className="snap-start shrink-0 w-[238px] rounded-[22px] border border-[#3a3120] bg-[#211b11] relative overflow-hidden p-5 hover:border-[#E8B85F]/40 transition-colors"
                  >
                    <div className="absolute inset-0 stitch opacity-50" />
                    <div
                      className="absolute -top-10 -right-10 w-28 h-28 rounded-full blur-2xl opacity-25"
                      style={{ background: a.accent }}
                    />
                    <div className="relative">
                      <div className="flex items-center justify-between">
                        <div
                          className="w-9 h-9 rounded-full flex items-center justify-center border"
                          style={{ borderColor: a.accent + "66", color: a.accent, background: a.accent + "14" }}
                        >
                          <a.icon size={16} />
                        </div>
                        <ChevronRight size={15} className="text-[#7d7158]" />
                      </div>
                      <p className="mt-5 text-[13px] font-medium text-[#e7dcbe]">{a.name}</p>
                      <p className="text-[11px] text-[#9a8e72] mt-0.5">{a.sub}</p>
                      <p className="font-serif-d text-[24px] mt-3 tabular-nums" style={{ color: a.accent }}>
                        {hidden ? "£ •••••" : a.balance}
                      </p>
                      <p className="text-[11px] text-[#9a8e72] mt-1">{a.change}</p>
                    </div>
                  </div>
                ))}
                <div className="shrink-0 w-[120px] rounded-[22px] border border-dashed border-[#4a3f28] flex flex-col items-center justify-center gap-2 text-[#9a8e72] hover:text-[#E8B85F] hover:border-[#E8B85F]/50 transition-colors cursor-pointer">
                  <Plus size={18} />
                  <span className="text-[11px]">New pot</span>
                </div>
              </div>
            </Section>

            {/* ===== SAVING JARS — horizontal ===== */}
            <Section title="Pantry jars" action="All jars">
              <div className="flex gap-3 overflow-x-auto no-scrollbar px-6 pb-1">
                {jars.map((j) => {
                  const pct = Math.round((j.saved / j.goal) * 100);
                  return (
                    <div
                      key={j.name}
                      className="shrink-0 w-[158px] rounded-[20px] bg-[#211b11] border border-[#3a3120] p-4 hover:-translate-y-0.5 transition-transform"
                    >
                      <div className="flex items-center justify-between">
                        <Sprout size={15} style={{ color: j.accent }} />
                        <span className="text-[11px] tabular-nums" style={{ color: j.accent }}>
                          {pct}%
                        </span>
                      </div>
                      <p className="mt-3 text-[13px] font-medium leading-snug text-[#e7dcbe]">{j.name}</p>
                      <p className="text-[11px] text-[#9a8e72] mt-1 tabular-nums">
                        £{j.saved.toLocaleString()} of £{j.goal.toLocaleString()}
                      </p>
                      <div className="mt-3 h-[5px] rounded-full bg-[#171208] overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: pct + "%", background: j.accent, boxShadow: `0 0 10px ${j.accent}66` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Section>

            {/* ===== LEDGER ===== */}
            <div className="mt-9 px-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-serif-d text-[19px] text-[#F2EAD8]">The day-book</h3>
                <div className="flex gap-1 bg-[#211b11] border border-[#3a3120] rounded-full p-1">
                  {["All", "In", "Out"].map((f) => (
                    <button
                      key={f}
                      onClick={() => setFilter(f)}
                      className={`px-3 py-1 text-[11px] rounded-full transition-colors ${
                        filter === f ? "bg-[#E8B85F] text-[#1A1610] font-semibold" : "text-[#9a8e72] hover:text-[#e7dcbe]"
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-[22px] border border-[#3a3120] bg-[#1d1810] divide-y divide-[#2c261a] overflow-hidden">
                {visibleTxns.map((t) => (
                  <div key={t.name + t.when} className="flex items-center gap-3.5 px-4 py-3.5 hover:bg-[#241e13] transition-colors">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center border shrink-0"
                      style={{ borderColor: t.tint + "55", background: t.tint + "12", color: t.tint }}
                    >
                      <t.icon size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13.5px] font-medium text-[#ece1c4] truncate">{t.name}</p>
                      <p className="text-[11px] text-[#9a8e72] truncate">{t.note} · {t.when}</p>
                    </div>
                    <p
                      className={`text-[13.5px] tabular-nums font-semibold ${
                        t.amount > 0 ? "text-[#9DBE85]" : "text-[#d8cba8]"
                      }`}
                    >
                      {fmt(t.amount)}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* ===== STORYTELLING — horizontal ===== */}
            <Section title="From the Guild" action="Read all">
              <div className="flex gap-3 overflow-x-auto no-scrollbar px-6 pb-2 snap-x snap-mandatory">
                {stories.map((s) => (
                  <div
                    key={s.title}
                    className="snap-start shrink-0 w-[252px] rounded-[22px] overflow-hidden border border-[#3a3120] bg-[#211b11] group cursor-pointer"
                  >
                    <div className="relative h-[120px] overflow-hidden">
                      <img
                        src={s.img}
                        alt=""
                        className="w-full h-full object-cover opacity-80 group-hover:scale-[1.05] transition-transform duration-700"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#211b11] via-transparent to-transparent" />
                      <span className="absolute top-3 left-3 text-[9px] tracking-[0.22em] bg-[#1A1610]/85 border border-[#E8B85F]/40 text-[#E8B85F] px-2.5 py-1 rounded-full">
                        {s.tag}
                      </span>
                    </div>
                    <div className="p-4">
                      <p className="font-serif-d text-[16px] text-[#F2EAD8] leading-snug">{s.title}</p>
                      <p className="text-[11.5px] text-[#9a8e72] mt-1.5 leading-relaxed">{s.sub}</p>
                      <span className="inline-flex items-center gap-1 mt-3 text-[11px] text-[#E8B85F] group-hover:gap-2 transition-all">
                        Continue <ChevronRight size={12} />
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            {/* footer crest */}
            <div className="mt-10 mb-4 flex flex-col items-center gap-2 opacity-60">
              <Blossom className="w-6 h-6" color="#9a8e72" />
              <p className="text-[9px] tracking-[0.32em] text-[#9a8e72]">KEPT IN GOOD ORDER SINCE 1894</p>
            </div>
          </div>

          {/* ===== bottom nav ===== */}
          <div className="absolute bottom-0 inset-x-0 px-5 pb-5 pt-3 bg-gradient-to-t from-[#15110a] via-[#15110a]/95 to-transparent">
            <div className="flex items-center justify-between bg-[#211b11]/95 backdrop-blur-md border border-[#3a3120] rounded-[22px] px-3 py-2.5">
              {[
                { id: "home", icon: Home, label: "Hearth" },
                { id: "jars", icon: Layers, label: "Jars" },
                { id: "pay", icon: ScanLine, label: "Pay", center: true },
                { id: "insights", icon: PieChart, label: "Almanac" },
                { id: "profile", icon: User, label: "You" },
              ].map((n) =>
                n.center ? (
                  <button
                    key={n.id}
                    onClick={() => setTab(n.id)}
                    className="w-12 h-12 -mt-7 rounded-full bg-[#E8B85F] text-[#1A1610] flex items-center justify-center shadow-[0_8px_24px_-6px_rgba(232,184,95,0.55)] border-4 border-[#15110a] hover:bg-[#f0c878] transition-colors"
                  >
                    <n.icon size={19} strokeWidth={2.4} />
                  </button>
                ) : (
                  <button
                    key={n.id}
                    onClick={() => setTab(n.id)}
                    className={`flex flex-col items-center gap-1 px-3 py-1 rounded-xl transition-colors ${
                      tab === n.id ? "text-[#E8B85F]" : "text-[#8a7e64] hover:text-[#cfc3a4]"
                    }`}
                  >
                    <n.icon size={18} strokeWidth={tab === n.id ? 2.4 : 2} />
                    <span className="text-[9.5px] tracking-wide">{n.label}</span>
                  </button>
                )
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- section wrapper ---------- */
function Section({ title, action, children }) {
  return (
    <div className="mt-9">
      <div className="flex items-center justify-between px-6 mb-4">
        <h3 className="font-serif-d text-[19px] text-[#F2EAD8]">{title}</h3>
        <button className="text-[11px] tracking-wide text-[#E8B85F] hover:text-[#f0c878] inline-flex items-center gap-1 transition-colors">
          {action} <ChevronRight size={12} />
        </button>
      </div>
      {children}
    </div>
  );
}