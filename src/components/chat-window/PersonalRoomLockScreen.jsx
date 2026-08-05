import React, { useState } from 'react';
import { Alert, Button, Icon, Input, InputGroup } from 'rsuite';
import { useParams } from 'react-router';
import { supabase } from '../../misc/supabase';

const PersonalRoomLockScreen = ({ onUnlocked }) => {
  const { chatId } = useParams();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);

  const unlockRoom = async event => {
    event?.preventDefault();
    if (!password || isUnlocking) return;
    setIsUnlocking(true);
    const { data: unlockedUntil, error } = await supabase.rpc(
      'unlock_personal_room',
      { check_room_id: chatId, room_password: password }
    );

    if (error) {
      Alert.error('The room could not be unlocked', 4000);
    } else if (!unlockedUntil) {
      Alert.error('Incorrect password or too many recent attempts', 4000);
    } else {
      setPassword('');
      onUnlocked(unlockedUntil);
      Alert.success('Personal room unlocked', 2500);
    }
    setIsUnlocking(false);
  };

  return (
    <div className="personal-room-lock">
      <div className="personal-room-lock__icon">
        <Icon icon="lock" />
      </div>
      <h2>Personal room locked</h2>
      <p>Enter your room password to access its messages and files.</p>
      <form onSubmit={unlockRoom}>
        <InputGroup>
          <Input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={setPassword}
            placeholder="Room password"
            autoComplete="current-password"
            autoFocus
          />
          <InputGroup.Button
            onClick={() => setShowPassword(value => !value)}
            title={showPassword ? 'Hide password' : 'Show password'}
          >
            <Icon icon={showPassword ? 'eye-slash' : 'eye'} />
          </InputGroup.Button>
        </InputGroup>
        <Button
          block
          appearance="primary"
          type="submit"
          loading={isUnlocking}
          disabled={!password || isUnlocking}
        >
          Unlock room
        </Button>
      </form>
      <small>Access automatically locks again after 30 minutes.</small>
    </div>
  );
};

export default PersonalRoomLockScreen;
