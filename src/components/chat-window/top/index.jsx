import React, { memo } from 'react';
import { ButtonToolbar, Icon, Input, InputGroup } from 'rsuite';
import { Link } from 'react-router-dom';
import { useMediaQuery } from '../../../misc/custom-hooks';
import { useCurrentRoom } from '../../../context/current-room.context';
import RoomInfoBtnModal from './RoomInfoBtnModal';
import EditRoomBtnDrawer from './EditRoomBtnDrawer';

const Top = ({ searchQuery, onSearchChange }) => {
  const name = useCurrentRoom(v => v.name);
  const description = useCurrentRoom(v => v.description);
  const isAdmin = useCurrentRoom(v => v.isAdmin);
  const isMobile = useMediaQuery('(max-width : 992px)');

  return (
    <header className="chat-header">
      <div className="chat-header__identity">
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
          <span className="text-disappear">{name}</span>
        </h4>
        <p className="chat-header__description text-disappear">
          {description || 'A shared space for this conversation'}
        </p>
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
        {isAdmin && <EditRoomBtnDrawer />}
      </ButtonToolbar>
    </header>
  );
};

export default memo(Top);
