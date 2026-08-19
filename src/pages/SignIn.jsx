import React, { useState } from 'react';
import { Alert, Button, Icon } from 'rsuite';
import { supabase } from '../misc/supabase';
import {
  isValidPhoneNumber,
  isValidUsername,
  normalizePhoneNumber,
  normalizeUsername,
} from '../misc/identity';
import QrWebLogin from '../components/QrWebLogin';

const SignIn = () => {
  const [mode, setMode] = useState('login');
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [confirmationEmail, setConfirmationEmail] = useState('');
  const [authNotice, setAuthNotice] = useState(null);

  const isRegistering = mode === 'register';
  const isQrLogin = mode === 'qr';
  const isPasswordLogin = mode === 'login';
  const authCallbackUrl = `${window.location.origin}/auth/callback`;

  const changeMode = nextMode => {
    setMode(nextMode);
    setPassword('');
    setConfirmPassword('');
    setAuthNotice(null);
  };

  const showConfirmationNotice = (address, wasResent = false) => {
    setConfirmationEmail(address);
    setAuthNotice({
      type: 'confirmation',
      text: wasResent
        ? `A new confirmation link was sent to ${address}.`
        : `Confirm ${address} from your inbox before logging in.`,
    });
  };

  const resendConfirmation = async () => {
    if (!confirmationEmail || isResending) return;
    setIsResending(true);

    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: confirmationEmail,
        options: { emailRedirectTo: authCallbackUrl },
      });
      if (error) throw error;
      showConfirmationNotice(confirmationEmail, true);
    } catch (error) {
      Alert.error(error.message, 5000);
    } finally {
      setIsResending(false);
    }
  };

  const signInWithGoogle = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setAuthNotice(null);

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: authCallbackUrl },
      });
      if (error) throw error;
    } catch (error) {
      Alert.error(error.message, 4000);
      setIsSubmitting(false);
    }
  };

  const handleEmailAuth = async event => {
    event.preventDefault();
    if (isSubmitting) return;

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedName = displayName.trim();
    const normalizedUsername = normalizeUsername(username);
    const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);

    if (!normalizedEmail || !password) {
      Alert.error('Enter your email and password', 4000);
      return;
    }

    if (isRegistering && normalizedName.length < 2) {
      Alert.error('Enter a display name with at least 2 characters', 4000);
      return;
    }

    if (isRegistering && !isValidUsername(normalizedUsername)) {
      Alert.error(
        'Username must be 3-24 characters using letters, numbers, or underscores.',
        5000
      );
      return;
    }

    if (
      isRegistering &&
      normalizedPhoneNumber &&
      !isValidPhoneNumber(normalizedPhoneNumber)
    ) {
      Alert.error(
        'Use an international mobile number such as +919876543210.',
        5000
      );
      return;
    }

    if (isRegistering && password.length < 8) {
      Alert.error('Password must contain at least 8 characters', 4000);
      return;
    }

    if (isRegistering && password !== confirmPassword) {
      Alert.error('Passwords do not match', 4000);
      return;
    }

    setIsSubmitting(true);

    try {
      if (isRegistering) {
        const availability = await supabase.rpc('is_username_available', {
          candidate: normalizedUsername,
        });
        if (!availability.error && !availability.data) {
          throw new Error('That username is already taken');
        }

        const { data, error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: {
            data: {
              full_name: normalizedName,
              username: normalizedUsername,
              phone_number: normalizedPhoneNumber || null,
            },
            emailRedirectTo: authCallbackUrl,
          },
        });

        if (error) throw error;

        if (!data.session) {
          changeMode('login');
          showConfirmationNotice(normalizedEmail);
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });
        if (error) throw error;
      }
    } catch (error) {
      if (
        error.code === 'email_not_confirmed' ||
        error.message?.toLowerCase().includes('email not confirmed')
      ) {
        showConfirmationNotice(normalizedEmail);
      } else {
        Alert.error(error.message, 5000);
      }
    } finally {
      setIsSubmitting(false);
    }
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
              Create rooms, find messages, and keep every conversation moving in
              one simple workspace.
            </p>
          </div>
          <p className="signin-footnote">Fast / Private / Real-time</p>
        </section>

        <section className="signin-card-wrap">
          <div className="signin-card">
            <span className="eyebrow">Get started</span>
            <h2>
              {isRegistering
                ? 'Create account'
                : isQrLogin
                  ? 'Connect to web'
                  : 'Welcome back'}
            </h2>
            <p className="signin-card__subtitle">
              {isRegistering
                ? 'Create your account to start chatting.'
                : isQrLogin
                  ? 'Scan with your signed-in ChatSpace phone.'
                  : 'Sign in to continue to your conversations.'}
            </p>

            <div
              className="auth-mode-switch"
              role="tablist"
              aria-label="Choose how to access ChatSpace"
            >
              <button
                id="auth-tab-login"
                type="button"
                role="tab"
                aria-selected={isPasswordLogin}
                aria-controls="auth-panel-login"
                tabIndex={isPasswordLogin ? 0 : -1}
                className={isPasswordLogin ? 'is-active' : ''}
                onClick={() => changeMode('login')}
                disabled={isSubmitting}
              >
                Log in
              </button>
              <button
                id="auth-tab-register"
                type="button"
                role="tab"
                aria-selected={isRegistering}
                aria-controls="auth-panel-register"
                tabIndex={isRegistering ? 0 : -1}
                className={isRegistering ? 'is-active' : ''}
                onClick={() => changeMode('register')}
                disabled={isSubmitting}
              >
                Register
              </button>
              <button
                id="auth-tab-qr"
                type="button"
                role="tab"
                aria-selected={isQrLogin}
                aria-controls="auth-panel-qr"
                tabIndex={isQrLogin ? 0 : -1}
                className={isQrLogin ? 'is-active' : ''}
                onClick={() => changeMode('qr')}
                disabled={isSubmitting}
              >
                QR code
              </button>
            </div>

            {isQrLogin ? (
              <div
                id="auth-panel-qr"
                role="tabpanel"
                aria-labelledby="auth-tab-qr"
              >
                <QrWebLogin />
              </div>
            ) : (
              <div
                id={isRegistering ? 'auth-panel-register' : 'auth-panel-login'}
                role="tabpanel"
                aria-labelledby={
                  isRegistering ? 'auth-tab-register' : 'auth-tab-login'
                }
              >
                {authNotice?.type === 'confirmation' && (
                  <div className="auth-notice" role="status">
                    <Icon icon="envelope-o" />
                    <div>
                      <strong>Confirm your email</strong>
                      <span>{authNotice.text}</span>
                      <button
                        type="button"
                        onClick={resendConfirmation}
                        disabled={isResending}
                      >
                        {isResending ? 'Sending…' : 'Resend confirmation email'}
                      </button>
                    </div>
                  </div>
                )}

                <form className="email-auth-form" onSubmit={handleEmailAuth}>
                  {isRegistering && (
                    <>
                      <label>
                        <span>Display name</span>
                        <input
                          type="text"
                          value={displayName}
                          onChange={event => setDisplayName(event.target.value)}
                          placeholder="Your name"
                          autoComplete="name"
                          minLength="2"
                          maxLength="50"
                          disabled={isSubmitting}
                          required
                        />
                      </label>
                      <label>
                        <span>Username</span>
                        <input
                          type="text"
                          value={username}
                          onChange={event => setUsername(event.target.value)}
                          placeholder="your_username"
                          autoComplete="username"
                          minLength="3"
                          maxLength="25"
                          disabled={isSubmitting}
                          required
                        />
                      </label>
                      <label>
                        <span>Mobile number (optional)</span>
                        <input
                          type="tel"
                          value={phoneNumber}
                          onChange={event => setPhoneNumber(event.target.value)}
                          placeholder="+919876543210"
                          autoComplete="tel"
                          maxLength="22"
                          disabled={isSubmitting}
                        />
                      </label>
                    </>
                  )}

                  <label>
                    <span>Email address</span>
                    <input
                      type="email"
                      value={email}
                      onChange={event => setEmail(event.target.value)}
                      placeholder="you@example.com"
                      autoComplete="email"
                      disabled={isSubmitting}
                      required
                    />
                  </label>

                  <label>
                    <span>Password</span>
                    <input
                      type="password"
                      value={password}
                      onChange={event => setPassword(event.target.value)}
                      placeholder={
                        isRegistering
                          ? 'At least 8 characters'
                          : 'Your password'
                      }
                      autoComplete={
                        isRegistering ? 'new-password' : 'current-password'
                      }
                      minLength={isRegistering ? 8 : undefined}
                      disabled={isSubmitting}
                      required
                    />
                  </label>

                  {isRegistering && (
                    <label>
                      <span>Confirm password</span>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={event =>
                          setConfirmPassword(event.target.value)
                        }
                        placeholder="Enter password again"
                        autoComplete="new-password"
                        minLength="8"
                        disabled={isSubmitting}
                        required
                      />
                    </label>
                  )}

                  <Button
                    block
                    appearance="primary"
                    type="submit"
                    className="email-auth-submit"
                    loading={isSubmitting}
                    disabled={isSubmitting}
                  >
                    {isRegistering ? 'Create account' : 'Log in'}
                  </Button>
                </form>

                <div className="signin-divider">
                  <span>or</span>
                </div>

                <Button
                  block
                  className="provider-button provider-button--google"
                  onClick={signInWithGoogle}
                  disabled={isSubmitting}
                >
                  <Icon icon="google" /> Continue with Google
                </Button>

                <div className="signin-trust" role="note">
                  <Icon icon="shield" />
                  <p>
                    <strong>Your account belongs to Chatspace.</strong>
                    Passwords are handled securely by Supabase Auth. We never
                    ask for payment details, software downloads, or browser
                    access.
                  </p>
                </div>

                <p className="signin-terms">
                  Chatspace is an independent open-source project and is not
                  affiliated with Telegram, WhatsApp, or Google.
                  <span>
                    <a href="/about.html">About</a>
                    <a href="/privacy.html">Privacy</a>
                    <a href="/terms.html">Terms</a>
                    <a
                      href="https://github.com/Avdhut30/ChatSpace-Android/releases/latest/download/ChatSpace.apk"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Get Android app
                    </a>
                    <a
                      href="https://github.com/Avdhut30/ChatSpace"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Source code
                    </a>
                  </span>
                </p>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
};

export default SignIn;
