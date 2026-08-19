# QR web linking setup

1. Link the CLI to the app's Supabase project with `supabase link --project-ref <project-ref>`.
2. Apply the migration with `supabase db push`.
3. Deploy with `supabase functions deploy device-link --no-verify-jwt`.

The function performs its own authorization: `start` and `poll` require
high-entropy one-time secrets, while `approve` verifies the signed-in phone's
Supabase JWT. QR codes expire after 75 seconds and cannot be reused.
