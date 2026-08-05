import React, { memo } from 'react';
import { ButtonToolbar, Icon, Input, InputGroup } from 'rsuite';
import { Link } from 'react-router-dom';
import { useMediaQuery } from '../../../misc/custom-hooks';
import { useCurrentRoom } from '../../../context/current-room.context';
import RoomInfoBtnModal from './RoomInfoBtnModal';
import EditRoomBtnDrawer from './EditRoomBtnDrawer';
import PersonalRoomSecurityModal from './PersonalRoomSecurityModal';
import ProfileAvatar from '../../ProfileAvatar';
import PresenceDot from '../../PresenceDot';
import { useProfile } from '../../../context/profile.context';

const Top = ({ searchQuery, onSearchChange, typingUsers = [] }) => {
  const { presence } = useProfile();
  const name = useCurrentRoom(v => v.name);
  const description = useCurrentRoom(v => v.description);
  const isAdmin = useCurrentRoom(v => v.isAdmin);
  const roomType = useCurrentRoom(v => v.roomType);
  const directPartner = useCurrentRoom(v => v.directPartner);
  const isMobile = useMediaQuery('(max-width : 992px)');
  const typingText =
    typingUsers.length === 1
      ? `${typingUsers[0].name} is typing…`
      : typingUsers.length > 1
        ? `${typingUsers.length} people are typing…`
        : '';

  const isDirectPartnerOnline = Boolean(
    directPartner && presence[directPartner.uid]?.state === 'online'
  );
  const statusText = typingText
    ? typingText
    : roomType === 'direct'
      ? isDirectPartnerOnline
        ? 'online'
        : 'private conversation'
      : description || 'A shared space for this conversation';

  return (
    <header className="chat-header">
      <div className="chat-header__identity">
        {roomType === 'direct' && directPartner && (
          <div className="chat-header__contact-avatar">
            <ProfileAvatar
              src={directPartner.avatar}
              name={directPartner.name}
              size="sm"
            />
            <PresenceDot uid={directPartner.uid} />
          </div>
        )}
        <div className="chat-header__identity-copy">
          <h4 className="text-disappear d-flex align-items-center chat-header__title">
            <Icon
              componentClass={Link}
              to="/"
              icon="arrow-circle-left"
              size="2x"
              className={
                isMobile
                  ? 'd-inline-block p-0 mr-2 chat-back-link link-unstyled'
                  : 'd-none'
              }
            />
            {roomType !== 'direct' && (
              <Icon
                icon={roomType === 'personal' ? 'lock' : 'group'}
                className="chat-header__type-icon"
              />
            )}
            <span className="text-disappear">{name}</span>
          </h4>
          <p
            className={`chat-header__description text-disappear ${
              typingText
                ? 'is-typing'
                : isDirectPartnerOnline
                  ? 'is-online'
                  : ''
            }`}
          >
            {statusText}
          </p>
        </div>
      </div>

      <InputGroup className="message-search">
        <InputGroup.Addon>
          <Icon icon="search" />
        </InputGroup.Addon>
        <Input
          value={searchQuery}
          onChange={onSearchChange}
          placeholder="Search messages"
          aria-label="Search messages in this conversation"
        />
        {searchQuery && (
          <InputGroup.Button
            onClick={() => onSearchChange('')}
            title="Clear message search"
          >
            <Icon icon="close" />
          </InputGroup.Button>
        )}
      </InputGroup>

      <ButtonToolbar className="chat-header__actions ws-nowrap">
        <RoomInfoBtnModal />
        {roomType === 'personal' && <PersonalRoomSecurityModal />}
        {isAdmin && roomType === 'group' && <EditRoomBtnDrawer />}
      </ButtonToolbar>
    </header>
  );
};

export default memo(Top);
