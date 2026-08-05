import React, { useState } from 'react';
import { Button, Modal } from 'rsuite';
import { useModalState } from '../../../misc/custom-hooks';
import { supabase } from '../../../misc/supabase';
import ProfileAvatar from '../../ProfileAvatar';

const ProfileInfoBtnModal = ({ profile, children, ...btnProps }) => {
  const { isOpen, close, open } = useModalState();
  const [identity, setIdentity] = useState(null);

  const { name, avatar, createdAt } = profile;

  const shortName = profile.name.split(' ')[0];

  const memberSince = new Date(createdAt).toLocaleDateString();

  const openProfile = async () => {
    open();
    setIdentity(null);
    const { data } = await supabase.rpc('get_profile_identity', {
      check_profile_id: profile.uid,
    });
    setIdentity(Array.isArray(data) ? data[0] : data);
  };

  return (
    <div>
      <Button {...btnProps} onClick={openProfile}>
        {shortName}
      </Button>

      <Modal show={isOpen} onHide={close} className="app-modal">
        <Modal.Header>
          <Modal.Title>{shortName} profile</Modal.Title>
        </Modal.Header>
        <Modal.Body className="text-center">
          <ProfileAvatar
            src={avatar}
            name={name}
            className="width-200 height-200 img-fullsize font-huge"
          />

          <h4 className="mt-2">{name}</h4>

          {(identity?.username || profile.username) && (
            <p className="profile-identity__username">
              @{identity?.username || profile.username}
            </p>
          )}

          {identity?.phone_number && (
            <a
              className="profile-identity__phone"
              href={`tel:${identity.phone_number}`}
            >
              {identity.phone_number}
            </a>
          )}

          <p>Member since {memberSince}</p>
        </Modal.Body>
        <Modal.Footer>
          {children}
          <Button block onClick={close}>
            Close
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default ProfileInfoBtnModal;
