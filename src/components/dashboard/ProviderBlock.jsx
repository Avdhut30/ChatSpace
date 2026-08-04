import React from 'react';
import { Alert, Button, Icon, Tag } from 'rsuite';
import { useProfile } from '../../context/profile.context';
import { supabase } from '../../misc/supabase';

const PROVIDERS = {
  google: { color: 'green', icon: 'google', label: 'Google' },
};

const ProviderBlock = () => {
  const { profile } = useProfile();
  const connectedProviders = profile.providers || [];

  const connect = async provider => {
    const { error } = await supabase.auth.linkIdentity({ provider });
    if (error) Alert.error(error.message, 4000);
  };

  const disconnect = async provider => {
    if (profile.identities.length <= 1) {
      Alert.error('At least one sign-in method must stay connected', 4000);
      return;
    }

    const identity = profile.identities.find(
      item => item.provider === provider
    );
    if (!identity) return;

    const { error } = await supabase.auth.unlinkIdentity(identity);
    if (error) {
      Alert.error(error.message, 4000);
    } else {
      Alert.info(`${PROVIDERS[provider].label} disconnected`, 4000);
    }
  };

  return (
    <div className="provider-settings">
      {connectedProviders.includes('email') && (
        <Tag color="blue">
          <Icon icon="envelope" /> Email & password connected
        </Tag>
      )}

      {Object.entries(PROVIDERS).map(([provider, details]) => {
        const isConnected = connectedProviders.includes(provider);

        return isConnected ? (
          <Tag
            key={provider}
            color={details.color}
            closable
            onClose={() => disconnect(provider)}
          >
            <Icon icon={details.icon} /> {details.label} connected
          </Tag>
        ) : null;
      })}

      <div className="provider-settings__actions">
        {Object.entries(PROVIDERS).map(([provider, details]) =>
          connectedProviders.includes(provider) ? null : (
            <Button
              key={provider}
              block
              color={details.color}
              onClick={() => connect(provider)}
            >
              <Icon icon={details.icon} /> Connect {details.label}
            </Button>
          )
        )}
      </div>
    </div>
  );
};

export default ProviderBlock;
