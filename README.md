# Facely — AI-анализ кожи в Telegram

Facely — это Telegram Mini App для AI-анализа кожи, персональных рекомендаций по уходу и геймифицированного трекинга. Работает на Next.js, tRPC, Prisma и Supabase PostgreSQL.

## Возможности

- **AI-анализ кожи** — загрузите фото, получите анализ через Face++ API (тип кожи, проблемы, рекомендации, ежедневная рутина, подбор продуктов)
- **50 уровней** — зарабатывайте XP за анализы, стрики, рефералов и покупки. Каждый тир открывает новые рамки и бейджи
- **Еженедельный стрик** — окно 7 дней, льготный период 3 дня. Сброс после 10+ дней без активности
- **Реферальная программа** — поделитесь ссылкой: вы получаете +2 анализа и +20 XP, друг +1 анализ и +10 XP
- **Чат с AI-косметологом** — задавайте вопросы по уходу через DeepSeek API (3 бесплатных вопроса, далее платно)
- **Сравнение «до/после»** — сравните два анализа бок о бок
- **Таблица лидеров** — топ рефералов, стриков и уровней
- **Достижения** — 9 достижений с автоматической проверкой
- **Покупки** — 1 анализ (100₽), 5 анализов (400₽), подписка (500₽/мес)
- **Push-уведомления** — напоминания каждые 6 часов (стрик скоро сбросится, пора сделать анализ, подборка продуктов в понедельник)

## Стек

| Слой | Технология |
|------|------------|
| Фреймворк | Next.js 15 (App Router) |
| API | tRPC (сервер/клиент) |
| ORM | Prisma |
| База данных | Supabase PostgreSQL |
| AI-зрение | Face++ Skin Analysis API |
| AI-чат | DeepSeek API |
| Анимации | Framer Motion |
| Сериализация | Superjson |
| Хостинг | Vercel + Supabase |

## Быстрый старт

### Требования

- Node.js 18+
- PostgreSQL (локально или Supabase)
- Ключ Face++ API
- Токен Telegram-бота (от BotFather)
- Ключ DeepSeek API

### Установка

1. Клонируйте репозиторий
2. Установите зависимости:
   ```bash
   npm install
   ```
3. Скопируйте `.env.example` в `.env` и заполните:
   ```
   DATABASE_URL=postgresql://...
   FACE_PLUS_KEY=ваш_ключ
   FACE_PLUS_SECRET=ваш_секрет
   BOT_TOKEN=токен_бота
   DEEPSEEK_API_KEY=ваш_ключ
   ```
4. Примените схему базы данных:
   ```bash
   npx prisma db push
   npx prisma db seed
   ```
5. Запустите dev-сервер:
   ```bash
   npm run dev
   ```

### Настройка Telegram Mini App

1. Создайте бота через [@BotFather](https://t.me/BotFather)
2. Укажите URL Mini App — ссылку на ваш Vercel-деплой
3. Установите webhook бота на `https://ваш-сайт.vercel.app/api/webhook`

## Структура проекта

```
src/
├── app/                    # Страницы Next.js App Router
│   ├── page.tsx            # Главная (дашборд)
│   ├── chat/               # Чат с AI-косметологом
│   ├── compare/            # Сравнение до/после
│   ├── history/            # История анализов
│   ├── leaderboard/        # Таблица лидеров
│   ├── referral/           # Реферальная программа
│   └── report/             # Еженедельный отчёт
├── components/
│   ├── dashboard/          # UserProfile, BalanceCard, StreakCard и др.
│   ├── effects/            # ResultModal, ConfettiEffect
│   ├── history/            # AnalysisCard
│   ├── purchase/           # PurchaseModal
│   ├── referral/           # ReferralStats
│   └── ui/                 # TabBar, Icons, ProgressBar
├── hooks/                  # useUser, useTelegram
├── server/
│   ├── routers/            # tRPC-роутеры (auth, analysis, ritual и др.)
│   ├── services/           # Бизнес-логика (auth, analysis, referral и др.)
│   ├── scheduler/          # Cron push-уведомлений
│   ├── utils/              # Система уровней, хелперы
│   └── trpc.ts             # Настройка tRPC
└── services/               # Клиентская обёртка API (api.ts)
```

## Переменные окружения

| Переменная | Описание |
|------------|----------|
| `DATABASE_URL` | Строка подключения к Supabase PostgreSQL |
| `FACE_PLUS_KEY` | Ключ Face++ API |
| `FACE_PLUS_SECRET` | Секрет Face++ API |
| `BOT_TOKEN` | Токен Telegram-бота |
| `DEEPSEEK_API_KEY` | Ключ DeepSeek API |
| `DEEPSEEK_BASE_URL` | Базовый URL DeepSeek API |

## Деплой

- Фронтенд: Vercel (авто-деплой из ветки `main`)
- База данных: Supabase PostgreSQL (Session Pooler)
- Бот: Telegram Bot API (webhook)

## Лицензия

MIT
