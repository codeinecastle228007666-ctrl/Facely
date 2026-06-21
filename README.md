# Facely — AI Skin Analysis Telegram Mini App

Facely is a Telegram Mini App for AI-powered skin analysis, personalized care routines, and gamified skincare tracking. Built with Next.js, tRPC, Prisma, and Supabase PostgreSQL.

## Features

- **AI Skin Analysis** — Upload a photo, get AI analysis via Face++ API (skin type, problems, recommendations, daily routine, product picks)
- **50-Level Gamification** — Earn XP for analyses, streaks, referrals, and purchases. Unlock frame/badge perks per tier
- **Weekly Streak System** — 7-day window with 3-day grace period. Reset after 10+ days of inactivity
- **Referral Program** — Share your link, both you (+2 analyses, +20 XP) and your friend (+1 analysis, +10 XP) get bonuses
- **AI Cosmetologist Chat** — Ask skincare questions via DeepSeek API (3 free questions, paid after)
- **Before/After Comparison** — Compare two analyses side by side
- **Leaderboard** — Top referrers, streaks, and levels
- **Achievements** — 9 achievements with automatic unlock checks
- **Purchase Modal** — 1 analysis (100₽), 5 analyses (400₽), subscription (500₽/month)
- **Push Reminders** — Telegram Bot API reminders every 6 hours (streak expiring, time for analysis, Monday product picks)

## Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router) |
| API Layer | tRPC (server/client) |
| ORM | Prisma |
| Database | Supabase PostgreSQL |
| AI Vision | Face++ Skin Analysis API |
| AI Chat | DeepSeek API |
| Animations | Framer Motion |
| Serialization | Superjson |
| Deployment | Vercel + Supabase |

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL (local or Supabase)
- Face++ API key
- Telegram Bot token (from BotFather)
- DeepSeek API key

### Setup

1. Clone the repo
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy `.env.example` to `.env` and fill in:
   ```
   DATABASE_URL=postgresql://...
   FACE_PLUS_KEY=your_key
   FACE_PLUS_SECRET=your_secret
   BOT_TOKEN=your_bot_token
   DEEPSEEK_API_KEY=your_key
   ```
4. Apply the database schema:
   ```bash
   npx prisma db push
   npx prisma db seed
   ```
5. Run the dev server:
   ```bash
   npm run dev
   ```

### Telegram Mini App Setup

1. Create a bot via [@BotFather](https://t.me/BotFather)
2. Set the Mini App URL to your Vercel deployment
3. Set the bot webhook to `https://your-app.vercel.app/api/webhook`

## Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── page.tsx            # Dashboard (main)
│   ├── chat/               # AI cosmetologist chat
│   ├── compare/            # Before/after comparison
│   ├── history/            # Analysis history
│   ├── leaderboard/        # Rankings
│   ├── referral/           # Referral program
│   └── report/             # Weekly report
├── components/
│   ├── dashboard/          # UserProfile, BalanceCard, StreakCard, etc.
│   ├── effects/            # ResultModal, ConfettiEffect
│   ├── history/            # AnalysisCard
│   ├── purchase/           # PurchaseModal
│   ├── referral/           # ReferralStats
│   └── ui/                 # TabBar, Icons, ProgressBar
├── hooks/                  # useUser, useTelegram
├── server/
│   ├── routers/            # tRPC routers (auth, analysis, ritual, etc.)
│   ├── services/           # Business logic (auth, analysis, referral, etc.)
│   ├── scheduler/          # Push notification cron
│   ├── utils/              # Level system, helpers
│   └── trpc.ts             # tRPC setup
└── services/               # Client API wrapper (api.ts)
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Supabase PostgreSQL connection string |
| `FACE_PLUS_KEY` | Face++ API key |
| `FACE_PLUS_SECRET` | Face++ API secret |
| `BOT_TOKEN` | Telegram Bot token |
| `DEEPSEEK_API_KEY` | DeepSeek API key |
| `DEEPSEEK_BASE_URL` | DeepSeek API base URL |

## Deployment

- Frontend: Vercel (auto-deploys from `main` branch)
- Database: Supabase PostgreSQL (Session Pooler)
- Bot: Telegram Bot API (webhook)

## License

MIT
