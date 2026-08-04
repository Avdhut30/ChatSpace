import React, { useEffect, useState } from 'react';
import { Button, Icon } from 'rsuite';
import { useHistory } from 'react-router-dom';
import { supabase } from '../misc/supabase';

const AuthCallback = () => {
  const history = useHistory();
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let isActive = true;

    const finishAuthentication = async () => {
      try {
        const searchParams = new URLSearchParams(window.location.search);
        const hashParams = new URLSearchParams(
          window.location.hash.replace(/^#/, '')
        );
        const callbackError =
          searchParams.get('error_description') ||
          hashParams.get('error_description');

        if (callbackError) throw new Error(callbackError);

        const code = searchParams.get('code');
        const tokenHash = searchParams.get('token_hash');

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else if (tokenHash) {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: searchParams.get('type') || 'email',
          });
          if (error) throw error;
        } else {
          const {
            data: { session },
            error,
          } = await supabase.auth.getSession();
          if (error) throw error;
          if (!session) throw new Error('No login session was returned');
        }

        if (isActive) history.replace('/');
      } catch (error) {
        if (isActive) {
          setErrorMessage(
            error.message || 'Authentication could not be completed'
          );
        }
      }
    };

    finishAuthentication();
    return () => {
      isActive = false;
    };
  }, [history]);

  if (errorMessage) {
    return (
      <main className="auth-callback-page">
        <div className="auth-callback-card">
          <span className="auth-callback-icon auth-callback-icon--error">
            <Icon icon="close" />
          </span>
          <h1>Sign-in could not be completed</h1>
          <p>{errorMessage}</p>
          <Button
            appearance="primary"
            onClick={() => history.replace('/signin')}
          >
            Return to sign in
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="auth-callback-page" role="status" aria-live="polite">
      <div className="auth-callback-card">
        <span className="brand-mark">C</span>
        <span className="app-loading__spinner" aria-hidden="true" />
        <h1>Completing sign-in</h1>
        <p>Please wait while we securely open ChatSpace.</p>
      </div>
    </main>
  );
};

export default AuthCallback;
