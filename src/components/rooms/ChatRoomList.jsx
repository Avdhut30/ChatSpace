import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Icon, Input, InputGroup, Loader, Nav } from 'rsuite';
import RoomItem from './RoomItem';
import { useRooms } from '../../context/rooms.context';

const ChatRoomList = () => {
  const rooms = useRooms();
  const location = useLocation();
  const [search, setSearch] = useState('');
  const [seenVersion, setSeenVersion] = useState(0);
  const searchRef = useRef();

  useEffect(() => {
    const handleRoomSeen = () => setSeenVersion(version => version + 1);
    const handleShortcut = event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };

    window.addEventListener('chatspace:room-seen', handleRoomSeen);
    window.addEventListener('keydown', handleShortcut);
    return () => {
      window.removeEventListener('chatspace:room-seen', handleRoomSeen);
      window.removeEventListener('keydown', handleShortcut);
    };
  }, []);

  const filteredRooms = useMemo(() => {
    if (!rooms) return [];

    const query = search.trim().toLowerCase();
    if (!query) return rooms;

    return rooms.filter(room => {
      const lastMessage = room.lastMessage;
      const searchableText = [
        room.name,
        room.description,
        lastMessage && lastMessage.text,
        lastMessage && lastMessage.author && lastMessage.author.name,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return searchableText.includes(query);
    });
  }, [rooms, search]);

  return (
    <>
      <InputGroup className="room-search">
        <InputGroup.Addon>
          <Icon icon="search" />
        </InputGroup.Addon>
        <Input
          inputRef={searchRef}
          value={search}
          onChange={setSearch}
          placeholder="Search conversations"
          aria-label="Search conversations"
        />
        {search && (
          <InputGroup.Button
            onClick={() => setSearch('')}
            title="Clear conversation search"
          >
            <Icon icon="close" />
          </InputGroup.Button>
        )}
      </InputGroup>

      <Nav
        appearance="subtle"
        vertical
        className="room-list custom-scroll"
        activeKey={location.pathname}
      >
        {!rooms && (
          <Loader center vertical content="Loading" speed="slow" size="md" />
        )}
        {rooms && rooms.length === 0 && (
          <div className="room-list-empty">
            <p>No rooms yet</p>
            <span>Create one to start a conversation.</span>
          </div>
        )}
        {rooms && rooms.length > 0 && filteredRooms.length === 0 && (
          <div className="room-list-empty">
            <p>No conversations found</p>
            <span>Try a different room or message name.</span>
          </div>
        )}
        {filteredRooms.map(room => (
          <Nav.Item
            componentClass={Link}
            to={`/chat/${room.id}`}
            key={room.id}
            eventKey={`/chat/${room.id}`}
          >
            <RoomItem
              room={room}
              hasUnread={
                Boolean(room.lastMessage) &&
                location.pathname !== `/chat/${room.id}` &&
                new Date(room.lastMessage.createdAt).getTime() >
                  new Date(
                    window.localStorage.getItem(
                      `chatspace:last-seen:${room.id}`
                    ) || 0
                  ).getTime() &&
                seenVersion >= 0
              }
            />
          </Nav.Item>
        ))}
      </Nav>
    </>
  );
};

export default ChatRoomList;
