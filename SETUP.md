# Flux - Setup Guide
Get your personal Flux app live in about 15 minutes.

---

## Step 1 - GitHub: create the repo

1. Go to github.com and click **+** then **New repository**.
2. Name it `flux`.
3. Set it to **Private**.
4. Click **Create repository**.
5. On the next screen, click **uploading an existing file**.
6. Upload everything in this folder (keep the `src/` and `public/` folders).
7. Commit changes.

---

## Step 2 - Supabase: create your project and database

1. Go to supabase.com and create a **New project**.
2. Name it `flux`, set a database password, and pick a nearby region.
3. Wait for the project to finish provisioning.
4. Open **SQL Editor** and create a **New query**.
5. Paste all of `schema.sql`.
6. Click **Run**.

### Get your Supabase keys
7. Open **Project Settings -> API**.
8. Copy:
   - **Project URL** (`https://xxxxxxxxxxxx.supabase.co`)
   - **anon public** key

### Enable email and password auth
9. Open **Authentication -> Providers**.
10. Confirm **Email** is enabled.
11. Enable **Email + Password** sign-in (the app uses password auth).
12. Open **Authentication -> URL Configuration**.
13. Set **Site URL** to your Vercel URL after deploy.

---

## Step 3 - Vercel: deploy

1. Go to vercel.com and click **Add New Project**.
2. Import your `flux` GitHub repository.
3. Framework preset: **Create React App**.
4. Add environment variables:
   - `REACT_APP_SUPABASE_URL` = your Supabase Project URL
   - `REACT_APP_SUPABASE_ANON_KEY` = your Supabase anon key
5. Click **Deploy**.
6. Wait for your deploy URL (for example `flux-yourname.vercel.app`).

---

## Step 4 - Finish Supabase auth setup

1. Go back to **Authentication -> URL Configuration**.
2. Set **Site URL** to your Vercel URL.
3. Add the same URL to **Redirect URLs**.
4. Click **Save**.

---

## Step 5 - First login

1. Open your deployed app URL.
2. If this is your first visit, click **First time? Create Account**.
3. Enter email and password and create the account.
4. Sign in with the same email and password.
5. You are in. Data now saves to Supabase.

---

## Using it daily

- **Today tab**: schedule blocks, task drawer, upcoming events, and journal fields.
- **Calendar tab**: add future events that surface in Upcoming when relevant.
- **Save draft**: save current state without archiving.
- **Archive day ->**: lock the day, clear done tasks, roll unfinished tasks forward.
- **Patterns tab**: unlocks after 3 archived days.

## Updating the app later

1. Push code changes to GitHub.
2. Vercel auto-deploys.

---

## Troubleshooting

**Cannot sign in after creating an account**: confirm **Email + Password** is enabled in Supabase Authentication Providers.

**Forgot password email not arriving**: check spam, then verify auth email settings and Site URL in Supabase.

**Invalid URL on login or reset**: verify Supabase Site URL and Redirect URLs match your deployed URL exactly.

**Data not saving**: check browser console for env var or auth errors.
