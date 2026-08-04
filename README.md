# ChatSpace

A professional, responsive realtime chat application built with React, Vite,
Supabase and RSuite.

## Features

- Email/password registration and login, plus Google authentication
- Realtime rooms, messages, reactions and presence
- Private file sharing, image previews and voice messages
- Room and in-chat search
- Room administration and profile settings
- Croppable custom profile photos
- Persistent per-room drafts and quick emoji input
- Responsive desktop and mobile interface
- Row Level Security through Supabase

## Local setup

Install dependencies:

```bash
npm install
```

Create `.env.local`:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

Apply the SQL migration in `supabase/migrations` to your Supabase project. Email
authentication is available by default; enable Google if you also want social
sign-in.

Start the app:

```bash
npm run start
```

Open <http://localhost:5173>.

## Production deployment

Supabase hosts the database, authentication, realtime services, storage, and
database migrations. Deploy the Vite frontend to Vercel:

1. Import the `Avdhut30/ChatSpace` GitHub repository in Vercel.
2. Keep the detected framework preset as Vite.
3. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in the Vercel
   project environment variables.
4. Deploy the project. `vercel.json` supplies the build directory and SPA route
   fallback.
5. In Supabase Authentication URL Configuration, set the Site URL to the final
   Vercel production URL and add both the production URL and localhost as
   allowed redirect URLs.

Database migrations inside `supabase/migrations` can continue deploying through
the Supabase GitHub integration connected to the `main` branch.

## Validation

```bash
npm run lint
npm test
npm run build
npm audit
```

Never commit `.env.local`, a database password, or a Supabase secret/service-role
key.
