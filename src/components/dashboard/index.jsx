import React from 'react';
import { Drawer, Button, Divider, Alert } from 'rsuite';
import { useProfile } from '../../context/profile.context';
import EditableInput from '../EditableInput';
import { supabase } from '../../misc/supabase';
import AvatarUpload from './AvatarUpload';
import ProviderBlock from './ProviderBlock';

const Dashboard = ({ onSignOut }) => {
  const { profile } = useProfile();

  const onSave = async newData => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ name: newData })
        .eq('id', profile.uid);

      if (error) throw error;

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
        <AvatarUpload />
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
