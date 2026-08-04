import React from 'react';
import TimeAgo from 'timeago-react';
import ProfileAvatar from '../ProfileAvatar';

const RoomItem = ({ room }) => {
  const { createdAt, name, lastMessage } = room;

  return (
    <div className="room-item">
      <div className="room-item__avatar">{name.charAt(0).toUpperCase()}</div>
      <div className="room-item__content">
        <div className="room-item__header">
          <strong className="text-disappear">{name}</strong>
          <TimeAgo
            datetime={
              lastMessage
                ? new Date(lastMessage.createdAt)
                : new Date(createdAt)
            }
            className="room-item__time"
          />
        </div>

        <div className="room-item__preview">
          {lastMessage ? (
            <>
              <ProfileAvatar
                src={lastMessage.author.avatar}
                name={lastMessage.author.name}
                size="xs"
              />
              <span className="text-disappear">
                {lastMessage.author.name}:{' '}
                {lastMessage.text ||
                  (lastMessage.file && lastMessage.file.name) ||
                  'New activity'}
              </span>
            </>
          ) : (
            <span>No messages yet</span>
          )}
        </div>
      </div>
    </div>
  );
};

export default RoomItem;
