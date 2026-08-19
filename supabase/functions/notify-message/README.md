# Message notification setup

1. Create an Android app in Firebase with package `com.chatspace.android`.
2. Copy `mobilesdk_app_id`, `current_key`, `project_id`, and `project_number` from Firebase's `google-services.json` into `android/local.properties` as `FIREBASE_APPLICATION_ID`, `FIREBASE_API_KEY`, `FIREBASE_PROJECT_ID`, and `FIREBASE_SENDER_ID`.
3. Apply `supabase/migrations/202608130002_push_notifications.sql`.
4. Create a Firebase service account and set its complete JSON as the Supabase Edge Function secret `FIREBASE_SERVICE_ACCOUNT_JSON`.
5. Set a random `NOTIFICATION_WEBHOOK_SECRET`, deploy this function with JWT verification disabled, and create a Supabase Database Webhook for `INSERT` on `public.messages`. Point it to the deployed `notify-message` function and send the same secret in the `x-webhook-secret` header.

The function excludes the author and sends only to registered devices belonging to other room members.
