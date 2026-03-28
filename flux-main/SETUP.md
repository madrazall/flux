# Flux — Setup Guide
Get your personal Flux app live in about 15 minutes.

---

## Step 1 — GitHub: create the repo

1. Go to github.com → click **+** → **New repository**
2. Name it `flux`
3. Set to **Private**
4. Click **Create repository**
5. On the next screen, click **uploading an existing file**
6. Upload everything in this folder (all files, keep the `src/` and `public/` folders)
7. Commit changes

---

## Step 2 — Supabase: create your project + database

1. Go to supabase.com → **New project**
2. Name it `flux`, set a database password (save it somewhere), pick a region close to you
3. Wait ~2 minutes for it to spin up
4. In the left sidebar → **SQL Editor** → **New query**
5. Paste the entire contents of `schema.sql` into the editor
6. Click **Run** — you should see "Success"

### Get your Supabase keys
7. Left sidebar → **Project Settings** → **API**
8. Copy these two values — you'll need them in Step 3:
   - **Project URL** (looks like `https://xxxxxxxxxxxx.supabase.co`)
   - **anon public** key (long string starting with `eyJ...`)

### Enable magic link auth
9. Left sidebar → **Authentication** → **Providers**
10. **Email** should already be enabled — confirm it is
11. Left sidebar → **Authentication** → **URL Configuration**
12. Set **Site URL** to your Vercel URL — you'll get this in Step 3, come back and fill it in after deploy

---

## Step 3 — Vercel: deploy

1. Go to vercel.com → **Add New Project**
2. Click **Import Git Repository** → connect to GitHub if not already → select `flux`
3. Framework preset: **Create React App**
4. Open **Environment Variables** and add:
   - `REACT_APP_SUPABASE_URL` → paste your Supabase Project URL
   - `REACT_APP_SUPABASE_ANON_KEY` → paste your Supabase anon key
5. Click **Deploy**
6. Wait ~2 minutes — Vercel will give you a URL like `flux-yourname.vercel.app`

---

## Step 4 — Finish Supabase auth setup

1. Go back to Supabase → **Authentication** → **URL Configuration**
2. Set **Site URL** to your Vercel URL (e.g. `https://flux-yourname.vercel.app`)
3. Under **Redirect URLs** add the same URL
4. Click **Save**

---

## Step 5 — First login

1. Open your Vercel URL in the browser
2. Enter your email → click **Send magic link**
3. Check your email → click the link
4. You're in — data saves to Supabase from here on

---

## Using it daily

- **Today tab** — your schedule blocks, task drawer, upcoming events drawer, journal
- **Calendar tab** — add any future events (appointments, etc), they auto-appear in the upcoming drawer on the right day
- **Save draft** — saves without archiving (auto-saves when you hit Archive)
- **Archive day →** — locks the day, done tasks clear, undone tasks roll to tomorrow
- **Patterns tab** — unlocks after 3 archived days

## Updating the app later

If you make changes to the code:
1. Update the files in your GitHub repo
2. Vercel auto-deploys within ~2 minutes — no action needed

---

## Troubleshooting

**Magic link email not arriving** — check spam. If still nothing, in Supabase → Authentication → Email Templates, confirm the template is active.

**"Invalid URL" error on login** — double-check your Site URL in Supabase matches your Vercel URL exactly (no trailing slash).

**Data not saving** — open browser devtools → Console tab, check for errors. Usually means an env var is wrong — re-check Step 3.

