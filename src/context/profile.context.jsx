import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { supabase } from '../misc/supabase';

const ProfileContext = createContext();

function toProfile(user, savedProfile) {
  const metadata = user.user_metadata || {};

  return {
    uid: user.id,
    email: user.email,
    name:
      savedProfile?.name ||
      metadata.full_name ||
      metadata.name ||
      user.email?.split('@')[0] ||
      'Chat member',
    avatar:
      savedProfile?.avatar_url ||
      metadata.avatar_url ||
      metadata.picture ||
      null,
    createdAt: savedProfile?.created_at || user.created_at,
    providers: user.app_metadata?.providers || [],
    identities: user.identities || [],
  };
}

export const ProfileProvider = ({ children }) => {
  const [profile, setProfile] = useState(null);
  const [presence, setPresence] = useState({});
  const [isLoading, setIsLoading] = useState(true);

  const updateProfile = useCallback(updates => {
    setProfile(current => (current ? { ...current, ...updates } : current));
  }, []);

  useEffect(() => {
    let isActive = true;
    let profileChannel;
    let presenceChannel;

    const clearChannels = async () => {
      if (profileChannel) {
        await supabase.removeChannel(profileChannel);
        profileChannel = null;
      }

      if (presenceChannel) {
        await supabase.removeChannel(presenceChannel);
        presenceChannel = null;
      }
    };

    const loadSession = async session => {
      await clearChannels();

      if (!isActive) return;

      if (!session?.user) {
        setProfile(null);
        setPresence({});
        setIsLoading(false);
        return;
      }

      const user = session.user;
      const { data: savedProfile } = await supabase
        .from('profiles')
        .select('id, name, avatar_url, created_at')
        .eq('id', user.id)
        .maybeSingle();

      if (!isActive) return;

      setProfile(toProfile(user, savedProfile));
      setIsLoading(false);

      profileChannel = supabase
        .channel(`profile:${user.id}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'profiles',
            filter: `id=eq.${user.id}`,
          },
          payload => {
            setProfile(current => ({
              ...current,
              name: payload.new.name,
              avatar: payload.new.avatar_url || current.avatar,
            }));
          }
        )
        .subscribe();

      presenceChannel = supabase.channel('chatspace:presence', {
        config: { presence: { key: user.id } },
      });

      presenceChannel
        .on('presence', { event: 'sync' }, () => {
          const state = presenceChannel.presenceState();
          const onlineUsers = Object.keys(state).reduce((result, uid) => {
            result[uid] = {
              state: 'online',
              last_changed: state[uid][0]?.online_at,
            };
            return result;
          }, {});
          setPresence(onlineUsers);
        })
        .subscribe(status => {
          if (status === 'SUBSCRIBED') {
            presenceChannel.track({
              user_id: user.id,
              online_at: new Date().toISOString(),
            });
          }
        });
    };

    supabase.auth.getSession().then(({ data }) => loadSession(data.session));

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== 'INITIAL_SESSION') {
        window.setTimeout(() => loadSession(session), 0);
      }
    });

    return () => {
      isActive = false;
      subscription.unsubscribe();
      clearChannels();
    };
  }, []);

  return (
    <ProfileContext.Provider
      value={{ isLoading, presence, profile, updateProfile }}
    >
      {children}
    </ProfileContext.Provider>
  );
};

export const useProfile = () => useContext(ProfileContext);
