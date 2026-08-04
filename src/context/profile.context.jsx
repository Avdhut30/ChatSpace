import React, { createContext, useState, useContext, useEffect } from 'react';
import firebase from 'firebase/compat/app';
import { auth, database } from '../misc/firebase';

export const isOfflineForDatabase = {
  state: 'offline',
  last_changed: firebase.database.ServerValue.TIMESTAMP,
};

const isOnlineForDatabase = {
  state: 'online',
  last_changed: firebase.database.ServerValue.TIMESTAMP,
};

const ProfileContext = createContext();

export const ProfileProvider = ({ children }) => {
  const [profile, setProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let userRef;
    let userStatusRef;
    const authReadyTimeout = window.setTimeout(() => {
      setIsLoading(false);
    }, 6000);

    const authUnsub = auth.onAuthStateChanged(
      authObj => {
        window.clearTimeout(authReadyTimeout);

        if (authObj) {
          userStatusRef = database.ref(`/status/${authObj.uid}`);
          userRef = database.ref(`/profiles/${authObj.uid}`);

          const fallbackToAuthProfile = () => {
            setProfile({
              name:
                authObj.displayName ||
                authObj.email?.split('@')[0] ||
                'Chat member',
              createdAt: authObj.metadata?.creationTime || Date.now(),
              avatar: authObj.photoURL || null,
              uid: authObj.uid,
              email: authObj.email,
            });
            setIsLoading(false);
          };

          userRef.on(
            'value',
            snap => {
              const savedProfile = snap.val();

              if (!savedProfile) {
                fallbackToAuthProfile();
                return;
              }

              setProfile({
                name: savedProfile.name || authObj.displayName || 'Chat member',
                createdAt:
                  savedProfile.createdAt ||
                  authObj.metadata?.creationTime ||
                  Date.now(),
                avatar: authObj.photoURL || null,
                uid: authObj.uid,
                email: authObj.email,
              });
              setIsLoading(false);
            },
            fallbackToAuthProfile
          );

          database.ref('.info/connected').on('value', snapshot => {
            if (!!snapshot.val() === false) {
              return;
            }

            userStatusRef
              .onDisconnect()
              .set(isOfflineForDatabase)
              .then(() => {
                userStatusRef.set(isOnlineForDatabase);
              });
          });
        } else {
          if (userRef) {
            userRef.off();
          }

          if (userStatusRef) {
            userStatusRef.off();
          }

          database.ref('.info/connected').off();

          setProfile(null);
          setIsLoading(false);
        }
      },
      () => {
        setProfile(null);
        setIsLoading(false);
      }
    );

    return () => {
      authUnsub();
      window.clearTimeout(authReadyTimeout);

      database.ref('.info/connected').off();

      if (userRef) {
        userRef.off();
      }

      if (userStatusRef) {
        userStatusRef.off();
      }
    };
  }, []);

  return (
    <ProfileContext.Provider value={{ isLoading, profile }}>
      {children}
    </ProfileContext.Provider>
  );
};

export const useProfile = () => useContext(ProfileContext);
