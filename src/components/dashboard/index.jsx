import React from 'react';
import { Drawer, Button, Divider, Alert } from 'rsuite';
import { useProfile } from '../../context/profile.context';
import EditableInput from '../EditableInput';
import ProfileAvatar from '../ProfileAvatar';
import { database } from '../../misc/firebase';
import ProviderBlock from './ProviderBlock';
import { getUserUpdates } from '../../misc/helpers';

const Dashboard = ({ onSignOut }) => {
  const { profile } = useProfile();

  const onSave = async newData => {
    try {
      const updates = await getUserUpdates(
        profile.uid,
        'name',
        newData,
        database
      );
      await database.ref().update(updates);

      Alert.success('Nickname has been updated', 4000);
    } catch (err) {
      Alert.error(err.message, 4000);
    }
  };

  return (
    <>
      <Drawer.Header>
        <Drawer.Title>Profile & settings</Drawer.Title>
      </Drawer.Header>
      <Drawer.Body className="dashboard-body">
        <span className="eyebrow">Your account</span>
        <h3>Hi, {profile.name}</h3>
        <p className="dashboard-intro">
          Manage your public profile and connected sign-in methods.
        </p>

        <div className="settings-section">
          <h6>Connected accounts</h6>
          <ProviderBlock />
        </div>
        <Divider />
        <EditableInput
          name="nickname"
          initialValue={profile.name}
          onSave={onSave}
          label={<h6 className="mb-2">Display name</h6>}
        />
        <div className="avatar-settings text-center">
          <h6>Profile photo</h6>
          <ProfileAvatar
            src={profile.avatar}
            name={profile.name}
            className="avatar-settings__preview img-fullsize"
          />
          <p className="avatar-settings__hint">
            Your photo is synced from your connected Google or Facebook account.
          </p>
        </div>
      </Drawer.Body>
      <Drawer.Footer>
        <Button block className="signout-button" onClick={onSignOut}>
          Sign out
        </Button>
      </Drawer.Footer>
    </>
  );
};

export default Dashboard;
