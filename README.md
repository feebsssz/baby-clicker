# baby-clicker 👶

A baby tracking app for logging feedings, diapers, and pumping sessions. Built for family use with real-time sync via Supabase.

## Features

- **Drinking** — log breast milk, formula, or both with separate ml amounts
- **Diapers** — log wet, solid, or both in one entry
- **Pump** — track pumped milk in ml
- **Add past entry** — backfill entries with a custom date and time
- **History** — daily summaries with per-day totals
- Real-time sync across devices (Supabase)
- Mobile-first UI

## Stack

- React + Vite
- Supabase (PostgreSQL) for data storage
- Deployed on Vercel

## Set up your own

### 1. Create a Supabase project

- Go to [supabase.com](https://supabase.com) and create a free project
- In the **SQL editor**, run this to create the logs table:

```sql
create table logs (
  id bigint primary key,
  family_code text not null,
  type text not null,
  drink_type text,
  ts bigint not null,
  amount numeric,
  note text
);
```

### 2. Clone and configure

```bash
git clone https://github.com/feebsssz/baby-clicker.git
cd baby-clicker
npm install
cp .env.example .env
```

Edit `.env` with your own values:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
VITE_FAMILY_CODE=YourFamilyCode
```

Find your Supabase URL and anon key under **Project Settings → API**.

### 3. Run locally

```bash
npm run dev
```

### 4. Deploy to Vercel

- Import the repo on [vercel.com](https://vercel.com)
- Add the three env vars above under **Project Settings → Environment Variables**
- Deploy
