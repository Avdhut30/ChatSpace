import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Icon } from 'rsuite';
import QRCode from 'qrcode';
import { supabase } from '../misc/supabase';

const functionsUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/device-link`;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const requestTimeoutMs = 12_000;

function requestErrorMessage(error) {
  if (error?.name === 'AbortError') return '';
  if (error?.message === 'QR_LINK_UNAVAILABLE') {
    return 'QR linking is not enabled on this server yet.';
  }
  if (error?.message === 'QR_LINK_TIMEOUT') {
    return 'The QR service took too long to respond. Check your connection and try again.';
  }
  if (error instanceof TypeError) {
    return 'The QR service could not be reached. Check your connection and try again.';
  }
  return error?.message || 'Could not create the QR code. Please try again.';
}

async function deviceLinkRequest(body, signal) {
  const requestController = new AbortController();
  const abortRequest = () => requestController.abort();
  const timeout = window.setTimeout(abortRequest, requestTimeoutMs);
  signal?.addEventListener('abort', abortRequest, { once: true });

  try {
    const response = await fetch(functionsUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: publishableKey,
      },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: requestController.signal,
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok && response.status !== 202) {
      if (response.status === 404) throw new Error('QR_LINK_UNAVAILABLE');
      throw new Error(result.error || 'Could not create the QR code');
    }
    return result;
  } catch (error) {
    if (signal?.aborted) throw error;
    if (requestController.signal.aborted) {
      throw new Error('QR_LINK_TIMEOUT');
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
    signal?.removeEventListener('abort', abortRequest);
  }
}

const QrWebLogin = () => {
  const canvasRef = useRef(null);
  const pollTimerRef = useRef();
  const abortRef = useRef();
  const [link, setLink] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [generation, setGeneration] = useState(0);

  const stop = useCallback(() => {
    window.clearTimeout(pollTimerRef.current);
    abortRef.current?.abort();
  }, []);

  const start = useCallback(async () => {
    stop();
    setStatus('loading');
    setError('');
    setLink(null);
    const canvas = canvasRef.current;
    canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const session = await deviceLinkRequest(
        { action: 'start' },
        controller.signal
      );
      const qrValue = `chatspace://link?session=${encodeURIComponent(session.session_id)}&secret=${encodeURIComponent(session.approval_secret)}`;
      setLink(session);
      setStatus('waiting');
      await QRCode.toCanvas(canvasRef.current, qrValue, {
        width: 244,
        margin: 2,
        errorCorrectionLevel: 'M',
        color: { dark: '#111a2e', light: '#ffffff' },
      });

      const poll = async () => {
        try {
          const result = await deviceLinkRequest(
            {
              action: 'poll',
              session_id: session.session_id,
              poll_secret: session.poll_secret,
            },
            controller.signal
          );
          if (result.status === 'approved' && result.token_hash) {
            setStatus('signing-in');
            const { error: verifyError } = await supabase.auth.verifyOtp({
              token_hash: result.token_hash,
              type: 'magiclink',
            });
            if (verifyError) throw verifyError;
            setStatus('complete');
            return;
          }
          pollTimerRef.current = window.setTimeout(poll, 1800);
        } catch (pollError) {
          if (pollError.name === 'AbortError') return;
          if (Date.now() >= new Date(session.expires_at).getTime()) {
            setGeneration(value => value + 1);
          } else {
            setStatus('error');
            setError(pollError.message);
          }
        }
      };
      pollTimerRef.current = window.setTimeout(poll, 900);
    } catch (startError) {
      if (startError.name === 'AbortError') return;
      setStatus('error');
      setError(requestErrorMessage(startError));
    }
  }, [stop]);

  useEffect(() => {
    const initialTimer = window.setTimeout(start, 0);
    return () => {
      window.clearTimeout(initialTimer);
      stop();
    };
  }, [generation, start, stop]);

  return (
    <div className="qr-web-login">
      <div
        className={`qr-web-login__code is-${status}`}
        aria-busy={status === 'loading' || status === 'signing-in'}
      >
        <canvas
          ref={canvasRef}
          role="img"
          aria-label="QR code to link ChatSpace web"
        />
        {(status === 'loading' || status === 'signing-in') && (
          <span className="qr-web-login__overlay">
            <i />
            {status === 'signing-in' ? 'Signing in…' : 'Creating code…'}
          </span>
        )}
        {status === 'complete' && (
          <span className="qr-web-login__overlay is-complete">
            <Icon icon="check-circle" /> Connected
          </span>
        )}
        {status === 'error' && (
          <span className="qr-web-login__overlay is-error" role="alert">
            <Icon icon="exclamation-circle" />
            <strong>QR code unavailable</strong>
            <Button size="sm" appearance="primary" onClick={start}>
              <Icon icon="refresh" /> Try again
            </Button>
          </span>
        )}
      </div>
      <h3>Link with your phone</h3>
      <ol>
        <li>Open ChatSpace on your phone.</li>
        <li>Tap Menu → Link web device.</li>
        <li>Scan this one-time QR code.</li>
      </ol>
      {error && (
        <p className="qr-web-login__error" role="status">
          {error}
        </p>
      )}
      {link && status === 'waiting' && (
        <small>For your security, this code changes automatically.</small>
      )}
    </div>
  );
};

export default QrWebLogin;
