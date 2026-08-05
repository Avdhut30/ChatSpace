<div align="center">

# ChatSpace

### Simple, fast, real-time conversations for everyone.

[![Live App](https://img.shields.io/badge/Live%20App-Open%20ChatSpace-2563EB?style=for-the-badge)](https://chat-space-two.vercel.app)
[![React](https://img.shields.io/badge/React-17-61DAFB?style=flat-square&logo=react&logoColor=white)](https://react.dev/)
[![Supabase](https://img.shields.io/badge/Supabase-Backend-3FCF8E?style=flat-square&logo=supabase&logoColor=white)](https://supabase.com/)
[![Vercel](https://img.shields.io/badge/Vercel-Deployed-000000?style=flat-square&logo=vercel&logoColor=white)](https://vercel.com/)

**[Launch ChatSpace](https://chat-space-two.vercel.app)** · **[View repository](https://github.com/Avdhut30/ChatSpace)**

</div>

## About

ChatSpace is a responsive real-time chat application built with React, Vite,
Supabase, and RSuite. It provides secure authentication, live conversations,
file and voice sharing, reactions, presence, profile customization, and room
management in a clean interface designed for desktop and mobile.

## Highlights

### Authentication and profiles

- Email/password registration and login
- Google authentication using the PKCE callback flow
- Email confirmation and confirmation-email resend support
- Editable display names
- Custom profile photos with cropping, repositioning, and zoom
- Live presence indicators and connected-account management

### Conversations

- Real-time room and message updates
- Optimistic message sending, likes, and deletion
- Typing indicators and unread conversation markers
- Message and conversation search
- Threaded replies and author-only message editing with edited labels
- Date grouping, message pagination, and jump-to-latest navigation
- Persistent per-room message drafts and quick emoji input

### Media and collaboration

- Private file sharing up to 10 MB
- Image previews and document downloads
- In-browser voice-message recording and playback
- Message reactions with live counts
- Room creation, editing, membership, and administrator permissions
- An automatically provisioned private personal space for every account
- Invite-only group chats with member selection and member-only history
- Unique one-to-one direct messages with private history and live presence
- Instagram/WhatsApp-style text, photo, and video stories that expire after 24 hours
- Server-enforced personal-room passwords with hashed storage and 30-minute unlocks
- WhatsApp-style account isolation: users see only their own personal space, DMs, and invited groups
- Unique `@username` discovery and private international-format mobile numbers

### Quality and security

- Responsive desktop and mobile layouts
- Accessible controls and reduced-motion support
- Supabase Row Level Security policies
- User-owned storage paths for chat files and profile photos
- Automated lint, test, production-build, and dependency-audit commands

## Technology

| Layer | Technology |
| --- | --- |
| Frontend | React 17, Vite 8, React Router |
| Interface | RSuite, Sass |
| Authentication | Supabase Auth, Google OAuth, PKCE |
| Database | Supabase Postgres with Row Level Security |
| Live updates | Supabase Realtime and Presence |
| File storage | Supabase Storage |
| Hosting | Vercel |

## Architecture

```text
Browser / React application
        │
        ├── Supabase Auth ───── Email/password and Google OAuth
        ├── Supabase Postgres ─ Profiles, rooms, members, messages, likes
        ├── Supabase Realtime ─ Messages, reactions, typing, presence
        └── Supabase Storage ── Private chat files and public profile avatars
```

## Getting started

### Requirements

- Node.js `20.19+` or `22.12+`
- npm
- A Supabase project

### 1. Clone and install

```bash
git clone https://github.com/Avdhut30/ChatSpace.git
cd ChatSpace
npm install
```

### 2. Configure the environment

Copy `.env.example` to `.env.local` and provide the values from Supabase
**Settings → API Keys**:

```env
VITE_SUPABASE_URL=https://your-project-reference.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

The publishable key is designed for browser clients. Never place a Supabase
secret key, service-role key, or database password in frontend environment
variables.

### 3. Create the database and storage resources

Open the Supabase SQL Editor and apply these files in numerical order:

```text
supabase/migrations/202608050001_initial_chatspace.sql
supabase/migrations/202608050002_file_messages.sql
supabase/migrations/202608050003_profile_avatars.sql
supabase/migrations/202608060001_message_replies_and_edits.sql
supabase/migrations/202608060002_personal_and_group_rooms.sql
supabase/migrations/202608060003_direct_messages.sql
supabase/migrations/202608060004_stories.sql
supabase/migrations/202608060005_personal_room_passwords.sql
supabase/migrations/202608060006_whatsapp_workspace_isolation.sql
supabase/migrations/202608060007_usernames_and_mobile_numbers.sql
```

The migrations create the application tables, realtime publication entries,
storage buckets, views, triggers, indexes, and Row Level Security policies.

### 4. Configure authentication

Email authentication is available through Supabase Auth. To enable Google:

1. Create a Google OAuth web client.
2. Use this authorized redirect URI, replacing the project reference:

   ```text
   https://YOUR_PROJECT_REFERENCE.supabase.co/auth/v1/callback
   ```

3. Add the Google client ID and secret under Supabase **Authentication → Sign
   In / Providers → Google**.
4. Under Supabase **Authentication → URL Configuration**, set the production
   Site URL and allowed redirects:

   ```text
   Site URL: https://your-production-domain.example

   Redirect URLs:
   https://your-production-domain.example/**
   http://localhost:5173/**
   ```

### 5. Start development

```bash
npm run start
```

Open [http://localhost:5173](http://localhost:5173).

## Available commands

| Command | Purpose |
| --- | --- |
| `npm run start` | Start the Vite development server |
| `npm run build` | Create an optimized production build |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Run ESLint across the source code |
| `npm run format` | Format JavaScript, JSX, and Sass with Prettier |
| `npm test` | Run the Vitest test command |
| `npm audit` | Check installed packages for known vulnerabilities |

## Project structure

```text
ChatSpace/
├── public/                 Static browser assets
├── src/
│   ├── components/         Chat, dashboard, room, and shared UI components
│   ├── context/            Profile, room, and current-room state
│   ├── misc/               Supabase client, hooks, helpers, and local events
│   ├── pages/              Sign-in, OAuth callback, and application pages
│   └── styles/             Global Sass styles and responsive design
├── supabase/
│   └── migrations/         Database, storage, realtime, and RLS migrations
├── .env.example            Safe environment-variable template
├── vercel.json             Vercel build and SPA routing configuration
└── vite.config.js          Vite configuration
```

## Deploying

The architecture uses two deployment services:

- **Supabase** hosts authentication, Postgres, realtime services, and storage.
- **Vercel** builds and serves the React application.

To deploy the frontend:

1. Import `Avdhut30/ChatSpace` into Vercel.
2. Select the Vite framework preset.
3. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` to the Vercel
   Production, Preview, and Development environments.
4. Deploy. The included `vercel.json` configures the `build` output directory
   and SPA route fallback.
5. Add the final Vercel URL to the Supabase Site URL and redirect allow list.

Environment-variable changes require a new Vercel deployment before they are
included in the browser bundle.

## Security

- Do not commit `.env.local`.
- Do not expose a Supabase secret/service-role key or database password.
- Keep Row Level Security enabled on application tables.
- Keep storage write policies restricted to user-owned folders.
- Report security concerns privately rather than opening a public issue with
  credentials or access tokens.

## Contributing

Contributions are welcome:

1. Fork the repository.
2. Create a feature branch.
3. Make and validate your changes.
4. Open a pull request with a clear description and screenshots when relevant.

## Author

Created and maintained by **[Avdhut Shinde](https://github.com/Avdhut30)**.

If ChatSpace is useful to you, consider starring the repository.
