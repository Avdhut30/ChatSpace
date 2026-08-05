import React, { useState } from 'react';
import { Alert, Button, Icon, Input, Modal } from 'rsuite';
import { useParams } from 'react-router';
import { useCurrentRoom } from '../../../context/current-room.context';
import { useModalState } from '../../../misc/custom-hooks';
import { supabase } from '../../../misc/supabase';

const PersonalRoomSecurityModal = () => {
  const { chatId } = useParams();
  const { isOpen, open, close } = useModalState();
  const access = useCurrentRoom(value => value.personalAccess);
  const refreshAccess = useCurrentRoom(value => value.refreshPersonalAccess);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  const resetFields = () => {
    setNewPassword('');
    setConfirmPassword('');
  };

  const savePassword = async event => {
    event.preventDefault();
    if (newPassword.length < 6) {
      Alert.info('Use at least 6 characters', 3500);
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.error('Passwords do not match', 3500);
      return;
    }

    setIsBusy(true);
    const { error } = await supabase.rpc('set_personal_room_password', {
      check_room_id: chatId,
      new_password: newPassword,
    });
    if (error) {
      Alert.error(error.message, 4000);
    } else {
      resetFields();
      await refreshAccess();
      Alert.success(
        access?.hasPassword ? 'Room password changed' : 'Room password enabled',
        3000
      );
    }
    setIsBusy(false);
  };

  const lockNow = async () => {
    setIsBusy(true);
    const { error } = await supabase.rpc('lock_personal_room', {
      check_room_id: chatId,
    });
    if (error) {
      Alert.error(error.message, 4000);
    } else {
      await refreshAccess();
      close();
      Alert.info('Personal room locked');
    }
    setIsBusy(false);
  };

  const removePassword = async () => {
    if (!window.confirm('Remove password protection from this personal room?')) {
      return;
    }
    setIsBusy(true);
    const { error } = await supabase.rpc('remove_personal_room_password', {
      check_room_id: chatId,
    });
    if (error) {
      Alert.error(error.message, 4000);
    } else {
      resetFields();
      await refreshAccess();
      Alert.info('Room password removed');
    }
    setIsBusy(false);
  };

  return (
    <>
      <Button
        className="chat-action-button"
        onClick={open}
        title="Personal room security"
      >
        <Icon icon={access?.hasPassword ? 'lock' : 'shield'} />
      </Button>
      <Modal show={isOpen} onHide={close} className="app-modal" size="xs">
        <Modal.Header>
          <Modal.Title>Personal room security</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {!access?.supported ? (
            <div className="personal-security-setup">
              <Icon icon="info" />
              <div>
                <strong>Database setup required</strong>
                <p>
                  Apply the personal-room password migration to enable secure
                  password protection.
                </p>
              </div>
            </div>
          ) : access.hasPassword && !access.unlocked ? (
            <div className="personal-security-setup">
              <Icon icon="lock" />
              <div>
                <strong>Unlock this room first</strong>
                <p>
                  Enter the current room password on the lock screen before
                  changing or removing password protection.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="personal-security-status">
                <Icon icon={access.hasPassword ? 'lock' : 'unlock-alt'} />
                <div>
                  <strong>
                    {access.hasPassword
                      ? 'Password protection is on'
                      : 'Password protection is off'}
                  </strong>
                  <span>
                    {access.hasPassword
                      ? 'Unlocked access expires after 30 minutes.'
                      : 'Add a separate password for this personal room.'}
                  </span>
                </div>
              </div>
              <form className="personal-password-form" onSubmit={savePassword}>
                <label>
                  <span>
                    {access.hasPassword ? 'New password' : 'Room password'}
                  </span>
                  <Input
                    type="password"
                    value={newPassword}
                    onChange={setNewPassword}
                    minLength={6}
                    maxLength={128}
                    autoComplete="new-password"
                    placeholder="At least 6 characters"
                  />
                </label>
                <label>
                  <span>Confirm password</span>
                  <Input
                    type="password"
                    value={confirmPassword}
                    onChange={setConfirmPassword}
                    minLength={6}
                    maxLength={128}
                    autoComplete="new-password"
                    placeholder="Enter it again"
                  />
                </label>
                <Button
                  block
                  appearance="primary"
                  type="submit"
                  loading={isBusy}
                  disabled={isBusy || !newPassword || !confirmPassword}
                >
                  {access.hasPassword ? 'Change password' : 'Enable password'}
                </Button>
              </form>
              {access.hasPassword && (
                <div className="personal-security-actions">
                  <Button block onClick={lockNow} disabled={isBusy}>
                    <Icon icon="lock" /> Lock now
                  </Button>
                  <Button
                    block
                    color="red"
                    appearance="ghost"
                    onClick={removePassword}
                    disabled={isBusy}
                  >
                    Remove password
                  </Button>
                </div>
              )}
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button block onClick={close} disabled={isBusy}>
            Close
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
};

export default PersonalRoomSecurityModal;
