import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../misc/supabase';
import { subscribeToRoomsRefresh } from '../misc/chat-events';

const RoomsContext = createContext();

export const RoomsProvider = ({ children }) => {
  const [rooms, setRooms] = useState(null);

  useEffect(() => {
    let isActive = true;

    const loadRooms = async () => {
      const [roomResult, { data: members }] = await Promise.all([
        supabase
          .from('room_summaries')
          .select('*')
          .order('created_at', { ascending: false }),
        supabase.from('room_members').select('room_id, user_id, is_admin'),
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

      setRooms(
        roomRows.map(room => ({
          id: room.id,
          name: room.name,
          description: room.description,
          createdAt: room.created_at,
          createdBy: room.created_by,
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
        }))
      );
    };

    loadRooms();

    const channel = supabase
      .channel('chatspace:rooms')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rooms' },
        loadRooms
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'room_members' },
        loadRooms
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages' },
        loadRooms
      )
      .subscribe();
    const unsubscribeRoomsRefresh = subscribeToRoomsRefresh(loadRooms);

    return () => {
      isActive = false;
      unsubscribeRoomsRefresh();
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <RoomsContext.Provider value={rooms}>{children}</RoomsContext.Provider>
  );
};

export const useRooms = () => useContext(RoomsContext);
