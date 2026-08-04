import React, { useCallback } from 'react';
import { Alert, Button, Drawer, Icon } from 'rsuite';
import { useMediaQuery, useModalState } from '../../misc/custom-hooks';
import { supabase } from '../../misc/supabase';
import Dashboard from '.';

const DashboardToggle = () => {
  const { isOpen, close, open } = useModalState();
  const isMobile = useMediaQuery('(max-width:992px)');

  const onSignOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();

    if (error) {
      Alert.error(error.message, 4000);
      return;
    }

    Alert.info('Signed out', 4000);
    close();
  }, [close]);

  return (
    <>
      <Button
        className="sidebar-icon-button"
        onClick={open}
        title="Open profile settings"
      >
        <Icon icon="cog" />
      </Button>
      <Drawer full={isMobile} show={isOpen} onHide={close} placement="left">
        <Dashboard onSignOut={onSignOut} />
      </Drawer>
    </>
  );
};

export default DashboardToggle;
