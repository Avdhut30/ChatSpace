import React, { useCallback, useState } from 'react';
import { useParams } from 'react-router';
import { Alert, Icon, Input, InputGroup } from 'rsuite';
import firebase from 'firebase/compat/app';
import { useProfile } from '../../../context/profile.context';
import { database } from '../../../misc/firebase';

const MAX_MESSAGE_LENGTH = 1000;
const QUICK_EMOJIS = ['👍', '❤️', '😂', '🎉', '👋', '🙌'];

function assembleMessage(profile, chatId) {
  return {
    roomId: chatId,
    author: {
      name: profile.name,
      uid: profile.uid,
      createdAt: profile.createdAt,
      ...(profile.avatar ? { avatar: profile.avatar } : {}),
    },
    createdAt: firebase.database.ServerValue.TIMESTAMP,
    likeCount: 0,
  };
}

const Bottom = () => {
  const { chatId } = useParams();
  const { profile } = useProfile();
  const draftKey = `chatspace:draft:${chatId}`;
  const [input, setInput] = useState(
    () => window.localStorage.getItem(draftKey) || ''
  );
  const [isLoading, setIsLoading] = useState(false);
  const [showEmojis, setShowEmojis] = useState(false);

  const saveDraft = useCallback(
    value => {
      setInput(value);

      if (value) {
        window.localStorage.setItem(draftKey, value);
      } else {
        window.localStorage.removeItem(draftKey);
      }
    },
    [draftKey]
  );

  const onInputChange = useCallback(
    value => saveDraft(value.slice(0, MAX_MESSAGE_LENGTH)),
    [saveDraft]
  );

  const addEmoji = emoji => {
    saveDraft(`${input}${emoji}`.slice(0, MAX_MESSAGE_LENGTH));
  };

  const onSendClick = async () => {
    if (input.trim() === '' || isLoading) return;

    const msgData = assembleMessage(profile, chatId);
    msgData.text = input.trim();

    const messageId = database.ref('messages').push().key;
    const updates = {
      [`/messages/${messageId}`]: msgData,
      [`/rooms/${chatId}/lastMessage`]: {
        ...msgData,
        msgId: messageId,
      },
    };

    setIsLoading(true);

    try {
      await database.ref().update(updates);
      saveDraft('');
      setShowEmojis(false);
    } catch (error) {
      Alert.error(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const onKeyDown = event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      onSendClick();
    }
  };

  return (
    <div className="message-composer">
      {showEmojis && (
        <div className="emoji-picker" aria-label="Quick emoji picker">
          {QUICK_EMOJIS.map(emoji => (
            <button
              key={emoji}
              type="button"
              onClick={() => addEmoji(emoji)}
              aria-label={`Add ${emoji} emoji`}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      <InputGroup className="message-composer__group">
        <InputGroup.Button
          onClick={() => setShowEmojis(value => !value)}
          title="Add emoji"
          aria-label="Add emoji"
          className={showEmojis ? 'is-active' : ''}
        >
          <Icon icon="smile-o" />
        </InputGroup.Button>
        <Input
          placeholder="Write a message…"
          value={input}
          onChange={onInputChange}
          onKeyDown={onKeyDown}
          maxLength={MAX_MESSAGE_LENGTH}
        />
        <InputGroup.Button
          color="blue"
          appearance="primary"
          onClick={onSendClick}
          disabled={isLoading || input.trim() === ''}
          className="message-send-button"
          title="Send message"
        >
          <Icon icon="send" />
        </InputGroup.Button>
      </InputGroup>

      <div className="message-composer__meta">
        <span>Drafts are saved on this device</span>
        <span className={input.length >= MAX_MESSAGE_LENGTH ? 'at-limit' : ''}>
          {input.length}/{MAX_MESSAGE_LENGTH}
        </span>
      </div>
    </div>
  );
};

export default Bottom;
