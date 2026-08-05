import React, { memo } from 'react';
import { Button, Icon, Modal } from 'rsuite';
import { useCurrentRoom } from '../../../context/current-room.context';
import { useModalState } from '../../../misc/custom-hooks';

const RoomInfoBtnModal = () => {
  const { isOpen, close, open } = useModalState();
  const description = useCurrentRoom(v => v.description);
  const name = useCurrentRoom(v => v.name);
  const roomType = useCurrentRoom(v => v.roomType);
  const memberCount = useCurrentRoom(v => v.memberCount);
  const directPartner = useCurrentRoom(v => v.directPartner);

  return (
    <>
      <Button
        className="chat-action-button"
        onClick={open}
        title="Room information"
      >
        <Icon icon="info" />
      </Button>
      <Modal show={isOpen} onHide={close} className="app-modal">
        <Modal.Header>
          <Modal.Title>About {name}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="room-info-type">
            <Icon
              icon={
                roomType === 'personal'
                  ? 'lock'
                  : roomType === 'direct'
                    ? 'commenting-o'
                    : 'group'
              }
            />
            <span>
              {roomType === 'personal'
                ? 'Private personal space'
                : roomType === 'direct'
                  ? `Private conversation with ${directPartner?.name || 'another person'}`
                  : `${memberCount || 1} group member${memberCount === 1 ? '' : 's'}`}
            </span>
          </div>
          <h6 className="mb-1">Description</h6>
          <p>{description}</p>
        </Modal.Body>
        <Modal.Footer>
          <Button block onClick={close}>
            Close
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
};

export default memo(RoomInfoBtnModal);
