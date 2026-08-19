import React from 'react';
import { Icon } from 'rsuite';
import TimeAgo from 'timeago-react';
import ProfileAvatar from '../ProfileAvatar';
import PresenceDot from '../PresenceDot';
import { useProfile } from '../../context/profile.context';

const RoomItem = ({ room, hasUnread }) => {
  const { profile } = useProfile();
  const { createdAt, name, lastMessage, type, memberCount } = room;
  const isPersonal = type === 'personal';
  const isDirect = type === 'direct';

  return (
    <div className="room-item">
      {isDirect && room.directPartner ? (
        <div className="room-item__direct-avatar">
          <ProfileAvatar
            src={room.directPartner.avatar}
            name={room.directPartner.name}
            size="sm"
          />
          <PresenceDot uid={room.directPartner.uid} />
        </div>
      ) : (
        <div className={`room-item__avatar ${isPersonal ? 'is-personal' : ''}`}>
          <Icon
            icon={isPersonal ? 'user' : isDirect ? 'commenting-o' : 'group'}
          />
        </div>
      )}
      <div className="room-item__content">
        <div className="room-item__header">
          <strong className="text-disappear">{name}</strong>
          {hasUnread && (
            <span className="room-unread-dot" title="New messages" />
          )}
          <span className={`room-item__type room-item__type--${type}`}>
            {isPersonal ? 'Personal' : isDirect ? 'Direct' : 'Group'}
          </span>
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
              <span className="text-disappear">
                {lastMessage.author.uid === profile.uid && (
                  <span className="room-preview-check">✓</span>
                )}
                {lastMessage.author.uid === profile.uid
                  ? 'You'
                  : lastMessage.author.name}
                :{' '}
                {lastMessage.text ||
                  (lastMessage.file && lastMessage.file.name) ||
                  'New activity'}
              </span>
            </>
          ) : (
            <span>
              {isPersonal
                ? 'Private to you'
                : isDirect
                  ? 'Private conversation'
                  : `${memberCount || 1} member${memberCount === 1 ? '' : 's'}`}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default RoomItem;
