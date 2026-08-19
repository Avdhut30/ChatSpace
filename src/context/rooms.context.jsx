import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { isMissingSchemaColumn, supabase } from '../misc/supabase';
import { subscribeToRoomsRefresh } from '../misc/chat-events';
import { useProfile } from './profile.context';

const RoomsContext = createContext();

export const RoomsProvider = ({ children }) => {
  const { profile } = useProfile();
  const [rooms, setRooms] = useState(null);
  const isProvisioningPersonalRoomRef = useRef(false);

  useEffect(() => {
    let isActive = true;
    let refreshTimer;
    let isLoadingRooms = false;
    let loadAgain = false;

    const scheduleRoomsLoad = (delay = 120) => {
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(loadRooms, delay);
    };

    const loadRooms = async () => {
      if (isLoadingRooms) {
        loadAgain = true;
        return;
      }
      isLoadingRooms = true;

      try {
        const [roomResult, { data: members }, { data: profiles }] =
          await Promise.all([
            supabase
              .from('room_summaries')
              .select('*')
              .order('created_at', { ascending: false }),
            supabase.from('room_members').select('room_id, user_id, is_admin'),
            supabase.from('profiles').select('id, name, avatar_url, username'),
          ]);

        let roomRows = roomResult.data;
        let roomError = roomResult.error;

        if (roomError) {
          const fallback = await supabase
            .from('rooms')
            .select('id, name, description, created_by, created_at')
            .order('created_at', { ascending: false });
          roomRows = (fallback.data || []).map(room => ({
            ...room,
            last_message_id: null,
          }));
          roomError = fallback.error;
        }

        if (roomError) {
          if (isActive) setRooms([]);
          return;
        }

        if (!isActive) return;

        const currentMembershipRoomIds = new Set(
          (members || [])
            .filter(member => member.user_id === profile.uid)
            .map(member => member.room_id)
        );
        const visibleRoomRows = roomRows.filter(room =>
          currentMembershipRoomIds.has(room.id)
        );
        const hasPersonalRoom = visibleRoomRows.some(
          room =>
            room.room_type === 'personal' ||
            room.description === `chatspace-personal:${profile.uid}`
        );

        if (!hasPersonalRoom && !isProvisioningPersonalRoomRef.current) {
          isProvisioningPersonalRoomRef.current = true;
          let { data: personalRoom, error: personalError } = await supabase
            .from('rooms')
            .insert({
              name: 'My Space',
              description: `chatspace-personal:${profile.uid}`,
              created_by: profile.uid,
              room_type: 'personal',
            })
            .select('id')
            .single();

          if (isMissingSchemaColumn(personalError, 'room_type')) {
            const legacyResult = await supabase
              .from('rooms')
              .insert({
                name: 'My Space',
                description: `chatspace-personal:${profile.uid}`,
                created_by: profile.uid,
              })
              .select('id')
              .single();
            personalRoom = legacyResult.data;
            personalError = legacyResult.error;
          }

          if (!personalError && personalRoom) {
            await supabase.from('room_members').upsert(
              {
                room_id: personalRoom.id,
                user_id: profile.uid,
                is_admin: true,
              },
              { onConflict: 'room_id,user_id' }
            );
            isProvisioningPersonalRoomRef.current = false;
            scheduleRoomsLoad(0);
            return;
          }
          isProvisioningPersonalRoomRef.current = false;
        }

        setRooms(
          visibleRoomRows.flatMap(room => {
            const roomMembers = (members || []).filter(
              member => member.room_id === room.id
            );
            const isCompatibleDirectRoom =
              room.room_type === 'direct' ||
              room.description?.startsWith('chatspace-direct:');
            const isCompatiblePersonalRoom =
              room.room_type === 'personal' ||
              room.description === `chatspace-personal:${profile.uid}`;
            const directPartnerMembership = isCompatibleDirectRoom
              ? roomMembers.find(member => member.user_id !== profile.uid)
              : null;
            const directPartner = directPartnerMembership
              ? (profiles || []).find(
                  person => person.id === directPartnerMembership.user_id
                )
              : null;

            return {
              id: room.id,
              name: directPartner?.name || room.name,
              description: directPartner
                ? `Private conversation with ${directPartner.name}`
                : isCompatiblePersonalRoom
                  ? 'Your private place for notes, ideas, and saved messages.'
                  : room.description,
              createdAt: room.created_at,
              createdBy: room.created_by,
              type: isCompatibleDirectRoom
                ? 'direct'
                : isCompatiblePersonalRoom
                  ? 'personal'
                  : room.room_type || 'group',
              memberCount: roomMembers.length,
              directPartner: directPartner
                ? {
                    uid: directPartner.id,
                    name: directPartner.name,
                    avatar: directPartner.avatar_url || null,
                    username: directPartner.username || '',
                  }
                : null,
              admins: (members || [])
                .filter(member => member.room_id === room.id && member.is_admin)
                .reduce((result, member) => {
                  result[member.user_id] = true;
                  return result;
                }, {}),
              lastMessage: room.last_message_id
                ? {
                    msgId: room.last_message_id,
                    text: room.last_message_text,
                    createdAt: room.last_message_created_at,
                    author: {
                      uid: room.last_author_id,
                      name: room.last_author_name || 'Chat member',
                      avatar: room.last_author_avatar || null,
                    },
                    file: room.last_file_path
                      ? {
                          path: room.last_file_path,
                          name: room.last_file_name,
                          contentType: room.last_file_type,
                          size: room.last_file_size,
                        }
                      : null,
                  }
                : null,
            };
          })
        );
      } finally {
        isLoadingRooms = false;
        if (loadAgain && isActive) {
          loadAgain = false;
          scheduleRoomsLoad(0);
        }
      }
    };

    scheduleRoomsLoad(0);

    const channel = supabase
      .channel('chatspace:rooms')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rooms' },
        scheduleRoomsLoad
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'room_members' },
        scheduleRoomsLoad
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages' },
        scheduleRoomsLoad
      )
      .subscribe();
    const unsubscribeRoomsRefresh = subscribeToRoomsRefresh(() =>
      scheduleRoomsLoad(0)
    );

    return () => {
      isActive = false;
      window.clearTimeout(refreshTimer);
      unsubscribeRoomsRefresh();
      supabase.removeChannel(channel);
    };
  }, [profile.uid]);

  return (
    <RoomsContext.Provider value={rooms}>{children}</RoomsContext.Provider>
  );
};

export const useRooms = () => useContext(RoomsContext);
