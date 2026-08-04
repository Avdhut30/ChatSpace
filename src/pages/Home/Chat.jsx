import React, { useEffect, useState } from 'react';
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

const Chat = () => {
  const { chatId } = useParams();
  const { profile } = useProfile();
  const [messageSearch, setMessageSearch] = useState({ chatId, value: '' });
  const activeMessageSearch =
    messageSearch.chatId === chatId ? messageSearch.value : '';
  const { sendTyping, typingUsers } = useRoomTyping(chatId);

  const rooms = useRooms();
  const currentRoom = rooms?.find(room => room.id === chatId);

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
  };

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
          <Messages key={chatId} searchQuery={activeMessageSearch} />
        </div>
        <div className="chat-bottom">
          <ChatBottom key={chatId} onTyping={sendTyping} />
        </div>
      </div>
    </CurrentRoomProvider>
  );
};

export default Chat;
