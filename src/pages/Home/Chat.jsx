import React, { useCallback, useEffect, useState } from 'react';
import { Loader } from 'rsuite';
import { useParams } from 'react-router';
import { useRooms } from '../../context/rooms.context';

import ChatTop from '../../components/chat-window/top';
import Messages from '../../components/chat-window/messages';
import ChatBottom from '../../components/chat-window/bottom';
import { CurrentRoomProvider } from '../../context/current-room.context';
import { useProfile } from '../../context/profile.context';
import { transformToArr } from '../../misc/helpers';
import { useRoomTyping } from '../../misc/custom-hooks';
import { getMessageCapabilities, supabase } from '../../misc/supabase';
import PersonalRoomLockScreen from '../../components/chat-window/PersonalRoomLockScreen';

const Chat = () => {
  const { chatId } = useParams();
  const { profile } = useProfile();
  const [messageSearch, setMessageSearch] = useState({ chatId, value: '' });
  const [replyTo, setReplyTo] = useState(null);
  const [hasAdvancedMessages, setHasAdvancedMessages] = useState(false);
  const [personalAccess, setPersonalAccess] = useState(null);
  const activeMessageSearch =
    messageSearch.chatId === chatId ? messageSearch.value : '';
  const { sendTyping, typingUsers } = useRoomTyping(chatId);

  const rooms = useRooms();
  const currentRoom = rooms?.find(room => room.id === chatId);
  const activeReplyTo = replyTo?.chatId === chatId ? replyTo.message : null;
  const handleAdvancedMessagesUnavailable = useCallback(() => {
    setHasAdvancedMessages(false);
    setReplyTo(null);
  }, []);

  const loadPersonalAccess = useCallback(async () => {
    if (currentRoom?.type !== 'personal') {
      setPersonalAccess({
        chatId,
        supported: false,
        hasPassword: false,
        unlocked: true,
        unlockedUntil: null,
      });
      return;
    }

    const { data, error } = await supabase.rpc('get_personal_room_access', {
      check_room_id: chatId,
    });
    const isMissing =
      error &&
      (error.code === 'PGRST202' ||
        error.message?.includes('get_personal_room_access'));

    if (isMissing) {
      setPersonalAccess({
        chatId,
        supported: false,
        hasPassword: false,
        unlocked: true,
        unlockedUntil: null,
      });
      return;
    }

    setPersonalAccess({
      chatId,
      supported: !error,
      hasPassword: Boolean(data?.hasPassword),
      unlocked: !error && Boolean(data?.unlocked),
      unlockedUntil: data?.unlockedUntil || null,
      error: error?.message || null,
    });
  }, [chatId, currentRoom?.type]);

  useEffect(() => {
    let isActive = true;
    getMessageCapabilities().then(capabilities => {
      if (isActive) setHasAdvancedMessages(capabilities.advanced);
    });
    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    const accessTimer = window.setTimeout(loadPersonalAccess, 0);
    return () => window.clearTimeout(accessTimer);
  }, [loadPersonalAccess]);

  useEffect(() => {
    if (!personalAccess?.unlockedUntil) return undefined;
    const remaining =
      new Date(personalAccess.unlockedUntil).getTime() - Date.now();
    const lockTimer = window.setTimeout(
      loadPersonalAccess,
      Math.max(remaining, 0) + 250
    );
    return () => window.clearTimeout(lockTimer);
  }, [loadPersonalAccess, personalAccess?.unlockedUntil]);

  useEffect(() => {
    if (!currentRoom) return;

    const lastSeen =
      currentRoom.lastMessage?.createdAt || new Date().toISOString();
    window.localStorage.setItem(`chatspace:last-seen:${chatId}`, lastSeen);
    window.dispatchEvent(new CustomEvent('chatspace:room-seen'));
  }, [chatId, currentRoom, currentRoom?.lastMessage?.createdAt]);

  if (!rooms) {
    return <Loader center vertical size="md" content="Loading" speed="slow" />;
  }
  if (!currentRoom) {
    return <h6 className="text-center mt-page">Conversation not found</h6>;
  }

  const { name, description } = currentRoom;

  const admins = transformToArr(currentRoom.admins);
  const isAdmin = admins.includes(profile.uid);

  const currentRoomData = {
    name,
    description,
    admins,
    isAdmin,
    roomType: currentRoom.type,
    memberCount: currentRoom.memberCount,
    directPartner: currentRoom.directPartner,
    personalAccess,
    refreshPersonalAccess: loadPersonalAccess,
  };

  const isPersonalRoom = currentRoom.type === 'personal';
  const isAccessLoading =
    isPersonalRoom && (!personalAccess || personalAccess.chatId !== chatId);
  const isPersonalRoomLocked =
    isPersonalRoom &&
    personalAccess?.supported &&
    personalAccess.hasPassword &&
    !personalAccess.unlocked;

  return (
    <CurrentRoomProvider data={currentRoomData}>
      <div className="chat-view">
        <div className="chat-top">
          <ChatTop
            searchQuery={activeMessageSearch}
            onSearchChange={value => setMessageSearch({ chatId, value })}
            typingUsers={typingUsers}
          />
        </div>
        <div className="chat-middle">
          {isAccessLoading ? (
            <Loader center vertical content="Checking room security" />
          ) : isPersonalRoomLocked ? (
            <PersonalRoomLockScreen
              onUnlocked={unlockedUntil =>
                setPersonalAccess(current => ({
                  ...current,
                  unlocked: true,
                  unlockedUntil,
                }))
              }
            />
          ) : (
            <Messages
              key={chatId}
              searchQuery={activeMessageSearch}
              onReply={message => setReplyTo({ chatId, message })}
              hasAdvancedMessages={hasAdvancedMessages}
              onAdvancedMessagesUnavailable={
                handleAdvancedMessagesUnavailable
              }
            />
          )}
        </div>
        {!isAccessLoading && !isPersonalRoomLocked && (
          <div className="chat-bottom">
            <ChatBottom
              key={chatId}
              onTyping={sendTyping}
              replyTo={activeReplyTo}
              onCancelReply={() => setReplyTo(null)}
              hasAdvancedMessages={hasAdvancedMessages}
              onAdvancedMessagesUnavailable={
                handleAdvancedMessagesUnavailable
              }
            />
          </div>
        )}
      </div>
    </CurrentRoomProvider>
  );
};

export default Chat;
