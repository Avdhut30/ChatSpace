import React, { useState } from 'react';
import { Alert, Button, Input } from 'rsuite';
import { useProfile } from '../../context/profile.context';
import {
  isValidPhoneNumber,
  isValidUsername,
  normalizePhoneNumber,
  normalizeUsername,
} from '../../misc/identity';
import { supabase } from '../../misc/supabase';

const IdentitySettings = () => {
  const { profile, updateProfile } = useProfile();
  const [username, setUsername] = useState(profile.username || '');
  const [phoneNumber, setPhoneNumber] = useState(profile.phoneNumber || '');
  const [isSaving, setIsSaving] = useState(false);

  const saveIdentity = async () => {
    const nextUsername = normalizeUsername(username);
    const nextPhoneNumber = normalizePhoneNumber(phoneNumber);

    if (!isValidUsername(nextUsername)) {
      Alert.error(
        'Username must be 3-24 characters using letters, numbers, or underscores.',
        5000
      );
      return;
    }
    if (nextPhoneNumber && !isValidPhoneNumber(nextPhoneNumber)) {
      Alert.error(
        'Use an international mobile number such as +919876543210.',
        5000
      );
      return;
    }

    setIsSaving(true);
    const { data, error } = await supabase.rpc('update_my_identity', {
      new_username: nextUsername,
      new_phone_number: nextPhoneNumber || null,
    });
    setIsSaving(false);

    if (error) {
      const migrationMissing =
        error.code === 'PGRST202' ||
        error.message?.includes('update_my_identity');
      Alert.error(
        migrationMissing
          ? 'Identity setup is not installed yet. Apply migration 202608060007 in Supabase.'
          : error.message,
        6000
      );
      return;
    }

    const saved = Array.isArray(data) ? data[0] : data;
    setUsername(saved?.updated_username || nextUsername);
    setPhoneNumber(saved?.updated_phone_number || '');
    updateProfile({
      username: saved?.updated_username || nextUsername,
      phoneNumber: saved?.updated_phone_number || '',
    });
    Alert.success('Username and mobile number updated', 4000);
  };

  return (
    <div className="identity-settings">
      <h6>Chat identity</h6>
      <p>
        Your username helps people find you. Your number is visible only to chat
        contacts.
      </p>
      <label>
        <span>Username</span>
        <div className="identity-input identity-input--username">
          <span>@</span>
          <Input
            value={username}
            onChange={setUsername}
            placeholder="your_username"
            maxLength={25}
            autoComplete="username"
          />
        </div>
      </label>
      <label>
        <span>Mobile number</span>
        <Input
          value={phoneNumber}
          onChange={setPhoneNumber}
          placeholder="+919876543210"
          maxLength={22}
          inputMode="tel"
          autoComplete="tel"
        />
      </label>
      <Button
        block
        appearance="primary"
        onClick={saveIdentity}
        loading={isSaving}
        disabled={isSaving}
      >
        Save identity
      </Button>
    </div>
  );
};

export default IdentitySettings;
