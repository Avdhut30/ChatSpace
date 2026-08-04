import { useState, useCallback, useEffect, useRef } from 'react';
import { useProfile } from '../context/profile.context';
import { supabase } from './supabase';

export function useModalState(defaultValue = false) {
  const [isOpen, setIsOpen] = useState(defaultValue);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  return { isOpen, open, close };
}

export const useMediaQuery = query => {
  const [matches, setMatches] = useState(
    () => window.matchMedia(query).matches
  );

  useEffect(() => {
    const queryList = window.matchMedia(query);

    const listener = evt => setMatches(evt.matches);

    queryList.addListener(listener);
    return () => queryList.removeListener(listener);
  }, [query]);

  return matches;
};

export function usePresence(uid) {
  const { presence } = useProfile();
  return presence[uid] || { state: 'offline' };
}

export function useHover() {
  const [value, setValue] = useState(false);
  const ref = useRef(null);
  const handleMouseOver = () => setValue(true);
  const handleMouseOut = () => setValue(false);
  useEffect(() => {
    const node = ref.current;
    if (node) {
      node.addEventListener('mouseover', handleMouseOver);
      node.addEventListener('mouseout', handleMouseOut);
    }

    return () => {
      if (node) {
        node.removeEventListener('mouseover', handleMouseOver);
        node.removeEventListener('mouseout', handleMouseOut);
      }
    };
  }, []);
  return [ref, value];
}

export function useRoomTyping(chatId) {
  const { profile } = useProfile();
  const [typingUsers, setTypingUsers] = useState([]);
  const channelRef = useRef(null);
  const timeoutsRef = useRef({});

  useEffect(() => {
    const clearUser = uid => {
      window.clearTimeout(timeoutsRef.current[uid]);
      delete timeoutsRef.current[uid];
      setTypingUsers(users => users.filter(user => user.uid !== uid));
    };

    const channel = supabase
      .channel(`typing:${chatId}`)
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (!payload || payload.uid === profile.uid) return;

        if (!payload.isTyping) {
          clearUser(payload.uid);
          return;
        }

        setTypingUsers(users => [
          ...users.filter(user => user.uid !== payload.uid),
          { uid: payload.uid, name: payload.name },
        ]);
        window.clearTimeout(timeoutsRef.current[payload.uid]);
        timeoutsRef.current[payload.uid] = window.setTimeout(
          () => clearUser(payload.uid),
          1800
        );
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      Object.values(timeoutsRef.current).forEach(window.clearTimeout);
      timeoutsRef.current = {};
      channelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [chatId, profile.uid]);

  const sendTyping = useCallback(
    isTyping => {
      channelRef.current?.send({
        type: 'broadcast',
        event: 'typing',
        payload: { uid: profile.uid, name: profile.name, isTyping },
      });
    },
    [profile.name, profile.uid]
  );

  return { sendTyping, typingUsers };
}
