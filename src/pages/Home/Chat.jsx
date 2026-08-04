import React, { useState } from 'react';
import { Loader } from 'rsuite';
import { useParams } from 'react-router';
import { useRooms } from '../../context/rooms.context';

import ChatTop from '../../components/chat-window/top';
import Messages from '../../components/chat-window/messages';
import ChatBottom from '../../components/chat-window/bottom';
import { CurrentRoomProvider } from '../../context/current-room.context';
import { transformToArr } from '../../misc/helpers';
import { auth } from '../../misc/firebase';

const Chat = () => {
  const { chatId } = useParams();
  const [messageSearch, setMessageSearch] = useState({ chatId, value: '' });
  const activeMessageSearch =
    messageSearch.chatId === chatId ? messageSearch.value : '';

  const rooms = useRooms();

  if (!rooms) {
    return <Loader center vertical size="md" content="Loading" speed="slow" />;
  }
  const currentRoom = rooms.find(room => room.id === chatId);

  if (!currentRoom) {
    return <h6 className="text-center mt-page">Conversation not found</h6>;
  }

  const { name, description } = currentRoom;

  const admins = transformToArr(currentRoom.admins);
  const isAdmin = admins.includes(auth.currentUser.uid);

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
          />
        </div>
        <div className="chat-middle">
          <Messages searchQuery={activeMessageSearch} />
        </div>
        <div className="chat-bottom">
          <ChatBottom key={chatId} />
        </div>
      </div>
    </CurrentRoomProvider>
  );
};

export default Chat;
