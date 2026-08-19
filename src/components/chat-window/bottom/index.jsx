import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router';
import { Alert, Icon, Input, InputGroup } from 'rsuite';
import { useProfile } from '../../../context/profile.context';
import {
  publishMessageUpdate,
  requestRoomsRefresh,
} from '../../../misc/chat-events';
import { isAdvancedMessageSchemaError, supabase } from '../../../misc/supabase';
import EmojiPicker from './EmojiPicker';

const MAX_MESSAGE_LENGTH = 1000;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const FILE_ACCEPT =
  'image/*,video/*,audio/*,.pdf,.txt,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip';

function getRecordingMimeType() {
  if (window.MediaRecorder?.isTypeSupported('audio/webm;codecs=opus')) {
    return 'audio/webm;codecs=opus';
  }
  if (window.MediaRecorder?.isTypeSupported('audio/ogg;codecs=opus')) {
    return 'audio/ogg;codecs=opus';
  }
  return '';
}

function formatDuration(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

const Bottom = ({
  onTyping,
  replyTo,
  onCancelReply,
  hasAdvancedMessages = true,
  onAdvancedMessagesUnavailable,
}) => {
  const { chatId } = useParams();
  const { profile } = useProfile();
  const draftKey = `chatspace:draft:${chatId}`;
  const [input, setInput] = useState(
    () => window.localStorage.getItem(draftKey) || ''
  );
  const [isSending, setIsSending] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [showEmojis, setShowEmojis] = useState(false);
  const typingTimeoutRef = useRef();
  const fileInputRef = useRef();
  const recorderRef = useRef();
  const recordingChunksRef = useRef([]);
  const recordingStreamRef = useRef();
  const recordingTimerRef = useRef();
  const discardRecordingRef = useRef(false);

  const saveDraft = useCallback(
    value => {
      setInput(value);
      if (value) window.localStorage.setItem(draftKey, value);
      else window.localStorage.removeItem(draftKey);
    },
    [draftKey]
  );

  const createPendingMessage = useCallback(
    data => ({
      id: `pending-${profile.uid}-${Date.now()}`,
      text: data.text || '',
      file: data.file || null,
      replyTo: data.replyTo
        ? {
            id: data.replyTo.id,
            text: data.replyTo.text || '',
            fileName: data.replyTo.file?.name || '',
            authorName: data.replyTo.author?.name || 'Chat member',
            unavailable: false,
          }
        : null,
      createdAt: new Date().toISOString(),
      author: {
        uid: profile.uid,
        name: profile.name,
        avatar: profile.avatar,
        username: profile.username,
        createdAt: profile.createdAt,
      },
      likes: {},
      likeCount: 0,
      isPending: true,
    }),
    [profile]
  );

  const stopRecordingResources = useCallback(() => {
    window.clearInterval(recordingTimerRef.current);
    recordingStreamRef.current?.getTracks().forEach(track => track.stop());
    recordingStreamRef.current = null;
  }, []);

  const insertMessageRecord = useCallback(
    async record => {
      let result = await supabase
        .from('messages')
        .insert(record)
        .select('id, created_at')
        .single();

      if (hasAdvancedMessages && isAdvancedMessageSchemaError(result.error)) {
        onAdvancedMessagesUnavailable();
        const legacyRecord = { ...record };
        delete legacyRecord.reply_to;
        result = await supabase
          .from('messages')
          .insert(legacyRecord)
          .select('id, created_at')
          .single();
      }

      return result;
    },
    [hasAdvancedMessages, onAdvancedMessagesUnavailable]
  );

  useEffect(
    () => () => {
      window.clearTimeout(typingTimeoutRef.current);
      discardRecordingRef.current = true;
      if (recorderRef.current?.state === 'recording') {
        recorderRef.current.stop();
      }
      stopRecordingResources();
      onTyping(false);
    },
    [onTyping, stopRecordingResources]
  );

  const onInputChange = useCallback(
    value => {
      const nextValue = value.slice(0, MAX_MESSAGE_LENGTH);
      saveDraft(nextValue);
      onTyping(Boolean(nextValue.trim()));
      window.clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = window.setTimeout(() => onTyping(false), 1200);
    },
    [onTyping, saveDraft]
  );

  const sendAttachment = useCallback(
    async file => {
      if (!file || file.size === 0) return;
      if (file.size > MAX_FILE_SIZE) {
        Alert.error('Files must be 10 MB or smaller', 4000);
        return;
      }

      const localUrl = URL.createObjectURL(file);
      const activeReply = hasAdvancedMessages ? replyTo : null;
      const pendingMessage = createPendingMessage({
        replyTo: activeReply,
        file: {
          url: localUrl,
          name: file.name,
          contentType: file.type || 'application/octet-stream',
          size: file.size,
        },
      });
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(-120);
      const uniqueId = window.crypto.randomUUID?.() || Date.now().toString();
      const filePath = `${profile.uid}/${chatId}/${uniqueId}-${safeName}`;

      setIsUploading(true);
      publishMessageUpdate({
        type: 'add',
        chatId,
        message: pendingMessage,
      });

      const { error: uploadError } = await supabase.storage
        .from('chat-files')
        .upload(filePath, file, {
          contentType: file.type || 'application/octet-stream',
          upsert: false,
        });

      if (uploadError) {
        URL.revokeObjectURL(localUrl);
        publishMessageUpdate({
          type: 'remove',
          chatId,
          messageId: pendingMessage.id,
        });
        Alert.error(
          uploadError.message.toLowerCase().includes('bucket not found')
            ? 'File storage is not configured. Run the file-messages Supabase migration.'
            : uploadError.message,
          5000
        );
        setIsUploading(false);
        return;
      }

      const attachmentRecord = {
        room_id: chatId,
        author_id: profile.uid,
        text: '',
        file_path: filePath,
        file_name: file.name,
        file_type: file.type || 'application/octet-stream',
        file_size: file.size,
        ...(hasAdvancedMessages ? { reply_to: activeReply?.id || null } : {}),
      };
      const { data, error: messageError } =
        await insertMessageRecord(attachmentRecord);

      if (messageError) {
        await supabase.storage.from('chat-files').remove([filePath]);
        URL.revokeObjectURL(localUrl);
        publishMessageUpdate({
          type: 'remove',
          chatId,
          messageId: pendingMessage.id,
        });
        Alert.error(messageError.message, 4000);
        setIsUploading(false);
        return;
      }

      const { data: signedFile } = await supabase.storage
        .from('chat-files')
        .createSignedUrl(filePath, 60 * 60);
      const secureUrl = signedFile?.signedUrl || localUrl;

      publishMessageUpdate({
        type: 'replace',
        chatId,
        messageId: pendingMessage.id,
        message: {
          ...pendingMessage,
          id: data.id,
          createdAt: data.created_at,
          isPending: false,
          file: {
            path: filePath,
            url: secureUrl,
            name: file.name,
            contentType: file.type || 'application/octet-stream',
            size: file.size,
          },
        },
      });

      if (signedFile?.signedUrl) URL.revokeObjectURL(localUrl);
      requestRoomsRefresh();
      onCancelReply();
      setIsUploading(false);
    },
    [
      chatId,
      createPendingMessage,
      hasAdvancedMessages,
      insertMessageRecord,
      onCancelReply,
      profile.uid,
      replyTo,
    ]
  );

  const onSendClick = async () => {
    const text = input.trim();
    if (!text || isSending || isUploading || isRecording) return;

    const activeReply = hasAdvancedMessages ? replyTo : null;
    const pendingMessage = createPendingMessage({ text, replyTo: activeReply });
    setIsSending(true);
    publishMessageUpdate({ type: 'add', chatId, message: pendingMessage });
    saveDraft('');
    setShowEmojis(false);
    onTyping(false);

    const messageRecord = {
      room_id: chatId,
      author_id: profile.uid,
      text,
      ...(hasAdvancedMessages ? { reply_to: activeReply?.id || null } : {}),
    };
    const { data, error } = await insertMessageRecord(messageRecord);

    if (error) {
      Alert.error(error.message, 4000);
      publishMessageUpdate({
        type: 'remove',
        chatId,
        messageId: pendingMessage.id,
      });
      saveDraft(text);
    } else {
      publishMessageUpdate({
        type: 'replace',
        chatId,
        messageId: pendingMessage.id,
        message: {
          ...pendingMessage,
          id: data.id,
          createdAt: data.created_at,
          isPending: false,
        },
      });
      requestRoomsRefresh();
      onCancelReply();
    }
    setIsSending(false);
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      Alert.error('Audio recording is not supported in this browser', 4000);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getRecordingMimeType();
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined
      );

      recordingStreamRef.current = stream;
      recordingChunksRef.current = [];
      discardRecordingRef.current = false;
      recorderRef.current = recorder;

      recorder.ondataavailable = event => {
        if (event.data.size) recordingChunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        stopRecordingResources();
        setIsRecording(false);
        Alert.error('The audio recording could not be completed', 4000);
      };
      recorder.onstop = async () => {
        const shouldDiscard = discardRecordingRef.current;
        const chunks = recordingChunksRef.current;
        const recordingType = recorder.mimeType || 'audio/webm';
        stopRecordingResources();
        setIsRecording(false);
        setRecordingSeconds(0);

        if (shouldDiscard || !chunks.length) return;

        const extension = recordingType.includes('ogg') ? 'ogg' : 'webm';
        const blob = new Blob(chunks, { type: recordingType });
        const recording = new File(
          [blob],
          `voice-note-${Date.now()}.${extension}`,
          { type: recordingType }
        );
        await sendAttachment(recording);
      };

      recorder.start(250);
      onTyping(false);
      setShowEmojis(false);
      setRecordingSeconds(0);
      setIsRecording(true);
      const startedAt = Date.now();
      recordingTimerRef.current = window.setInterval(() => {
        setRecordingSeconds(Math.floor((Date.now() - startedAt) / 1000));
      }, 1000);
    } catch (error) {
      stopRecordingResources();
      Alert.error(
        error.name === 'NotAllowedError'
          ? 'Microphone permission was denied'
          : error.message,
        4000
      );
    }
  };

  const finishRecording = () => {
    if (recorderRef.current?.state === 'recording') {
      discardRecordingRef.current = false;
      recorderRef.current.stop();
    }
  };

  const discardRecording = () => {
    if (recorderRef.current?.state === 'recording') {
      discardRecordingRef.current = true;
      recorderRef.current.stop();
    }
  };

  const onKeyDown = event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      onSendClick();
    }
  };

  const isBusy = isSending || isUploading;

  return (
    <div className="message-composer">
      <input
        ref={fileInputRef}
        type="file"
        accept={FILE_ACCEPT}
        className="visually-hidden"
        onChange={event => {
          const file = event.target.files?.[0];
          event.target.value = '';
          sendAttachment(file);
        }}
      />

      {showEmojis && (
        <EmojiPicker
          onSelect={emoji =>
            onInputChange(`${input}${emoji}`.slice(0, MAX_MESSAGE_LENGTH))
          }
          onClose={() => setShowEmojis(false)}
        />
      )}

      {hasAdvancedMessages && replyTo && (
        <div className="composer-reply" role="status">
          <span>
            <strong>Replying to {replyTo.author.name}</strong>
            <small>{replyTo.text || replyTo.file?.name || 'Attachment'}</small>
          </span>
          <button
            type="button"
            onClick={onCancelReply}
            aria-label="Cancel reply"
            title="Cancel reply"
          >
            <Icon icon="close" />
          </button>
        </div>
      )}

      <InputGroup className="message-composer__group">
        <InputGroup.Button
          onClick={() => setShowEmojis(value => !value)}
          disabled={isBusy || isRecording}
          title="Add emoji"
          aria-label="Add emoji"
          className={showEmojis ? 'is-active' : ''}
        >
          <Icon icon="smile-o" />
        </InputGroup.Button>
        <InputGroup.Button
          onClick={() => fileInputRef.current?.click()}
          disabled={isBusy || isRecording}
          title="Attach a file"
          aria-label="Attach a file"
        >
          <Icon icon="paperclip" />
        </InputGroup.Button>
        <InputGroup.Button
          onClick={isRecording ? finishRecording : startRecording}
          disabled={isBusy}
          title={isRecording ? 'Stop and send recording' : 'Record audio'}
          aria-label={isRecording ? 'Stop and send recording' : 'Record audio'}
          className={isRecording ? 'is-recording' : ''}
        >
          <Icon icon={isRecording ? 'stop-circle' : 'microphone'} />
        </InputGroup.Button>
        <Input
          placeholder={
            isRecording ? 'Recording voice message…' : 'Write a message…'
          }
          value={input}
          onChange={onInputChange}
          onKeyDown={onKeyDown}
          maxLength={MAX_MESSAGE_LENGTH}
          disabled={isRecording}
        />
        <InputGroup.Button
          color="blue"
          appearance="primary"
          onClick={onSendClick}
          disabled={isBusy || isRecording || input.trim() === ''}
          className="message-send-button"
          title="Send message"
        >
          <Icon icon="send" />
        </InputGroup.Button>
      </InputGroup>

      <div className="message-composer__meta">
        {isRecording ? (
          <span className="recording-status">
            <i /> Recording {formatDuration(recordingSeconds)}
            <button type="button" onClick={discardRecording}>
              Discard
            </button>
          </span>
        ) : (
          <span>
            {isUploading
              ? 'Uploading securely…'
              : 'Files up to 10 MB · Drafts saved locally'}
          </span>
        )}
        <span className={input.length >= MAX_MESSAGE_LENGTH ? 'at-limit' : ''}>
          {input.length}/{MAX_MESSAGE_LENGTH}
        </span>
      </div>
    </div>
  );
};

export default Bottom;
