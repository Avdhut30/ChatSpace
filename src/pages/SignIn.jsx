import React, { useState } from 'react';
import firebase from 'firebase/compat/app';
import { Button, Icon, Alert } from 'rsuite';
import { auth, database } from '../misc/firebase';

const SignIn = () => {
  const [isSigningIn, setIsSigningIn] = useState(false);

  const signInWithProvider = async provider => {
    setIsSigningIn(true);
    try {
      const { additionalUserInfo, user } = await auth.signInWithPopup(provider);

      if (additionalUserInfo.isNewUser) {
        await database.ref(`/profiles/${user.uid}`).set({
          name: user.displayName,
          avatar: user.photoURL || null,
          createdAt: firebase.database.ServerValue.TIMESTAMP,
        });
      }

      Alert.success('Welcome back', 4000);
    } catch (err) {
      Alert.error(err.message, 4000);
    } finally {
      setIsSigningIn(false);
    }
  };

  const onFacebookSignIn = () => {
    signInWithProvider(new firebase.auth.FacebookAuthProvider());
  };

  const onGoogleSignIn = () => {
    signInWithProvider(new firebase.auth.GoogleAuthProvider());
  };

  return (
    <main className="signin-page">
      <div className="signin-shell">
        <section className="signin-intro">
          <div className="brand-lockup brand-lockup--light">
            <span className="brand-mark">C</span>
            <span>Chatspace</span>
          </div>
          <div className="signin-copy">
            <span className="eyebrow">Your conversations, together</span>
            <h1>A focused space for your team to connect.</h1>
            <p>
              Create rooms, share files, and keep every conversation moving in
              one simple workspace.
            </p>
          </div>
          <p className="signin-footnote">Fast · Private · Real-time</p>
        </section>

        <section className="signin-card-wrap">
          <div className="signin-card">
            <span className="eyebrow">Get started</span>
            <h2>Welcome back</h2>
            <p className="signin-card__subtitle">
              Choose your preferred account to continue.
            </p>

            <div className="signin-actions">
              <Button
                block
                className="provider-button provider-button--google"
                onClick={onGoogleSignIn}
                disabled={isSigningIn}
              >
                <Icon icon="google" /> Continue with Google
              </Button>
              <Button
                block
                className="provider-button provider-button--facebook"
                onClick={onFacebookSignIn}
                disabled={isSigningIn}
              >
                <Icon icon="facebook" /> Continue with Facebook
              </Button>
            </div>

            <p className="signin-terms">
              By continuing, you agree to use Chatspace responsibly.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
};

export default SignIn;
