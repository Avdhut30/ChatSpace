import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    'Missing Supabase configuration. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to .env.local.'
  );
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
});

let messageCapabilitiesPromise;

export function isMissingSchemaColumn(error, columnName) {
  const message = error?.message?.toLowerCase() || '';
  return (
    message.includes('schema cache') &&
    message.includes(columnName.toLowerCase())
  );
}

export function isAdvancedMessageSchemaError(error) {
  return (
    isMissingSchemaColumn(error, 'reply_to') ||
    isMissingSchemaColumn(error, 'edited_at')
  );
}

export function getMessageCapabilities() {
  if (!messageCapabilitiesPromise) {
    messageCapabilitiesPromise = (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const accessToken = data.session?.access_token;
        const response = await fetch(`${supabaseUrl}/rest/v1/`, {
          headers: {
            apikey: supabasePublishableKey,
            ...(accessToken
              ? { Authorization: `Bearer ${accessToken}` }
              : {}),
            Accept: 'application/openapi+json',
          },
        });

        if (response.ok) {
          const schema = await response.json();
          const properties =
            schema.definitions?.messages?.properties ||
            schema.components?.schemas?.messages?.properties ||
            {};
          if (properties.reply_to || properties.edited_at) {
            return {
              advanced: Boolean(properties.reply_to && properties.edited_at),
            };
          }
        }
      } catch {
        // A restricted OpenAPI endpoint is normal; use a safe query below.
      }

      const { error } = await supabase
        .from('messages')
        .select('reply_to, edited_at')
        .limit(0);
      return { advanced: !error };
    })().catch(() => ({ advanced: false }));
  }

  return messageCapabilitiesPromise;
}
