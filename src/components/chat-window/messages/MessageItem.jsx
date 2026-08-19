import React, { memo, useState } from 'react';
import { Alert, Button, Icon, Input } from 'rsuite';
import TimeAgo from 'timeago-react';
import { useCurrentRoom } from '../../../context/current-room.context';
import { useProfile } from '../../../context/profile.context';
import { formatFileSize, getFileKind } from '../../../misc/attachments';
import { copyText } from '../../../misc/clipboard';
import PresenceDot from '../../PresenceDot';
import ProfileAvatar from '../../ProfileAvatar';
import ProfileInfoBtnModal from './ProfileInfoBtnModal';
import IconBtnControl from './IconBtnControl';
import ImgBtnModal from './ImgBtnModal';

const renderFileMessage = file => {
  const kind = getFileKind(file);
  const size = formatFileSize(file.size);
  const label = file.name || 'Attachment';

  if (kind === 'image' && file.url) {
    return (
      <div className="message-attachment message-attachment--image">
        <ImgBtnModal src={file.url} fileName={file.name} />
        <div className="message-attachment__meta">
          <span>{label}</span>
          {size && <small>{size}</small>}
          <a href={file.url} download={label} title="Download image">
            <Icon icon="download" />
          </a>
        </div>
      </div>
    );
  }

  if (kind === 'video' && file.url) {
    return (
      <div className="message-attachment message-attachment--video">
        <video controls preload="metadata" src={file.url}>
          Your browser does not support video playback.
        </video>
        <div className="message-attachment__meta">
          <span>{label}</span>
          {size && <small>{size}</small>}
          <a href={file.url} download={label} title="Download video">
            <Icon icon="download" />
          </a>
        </div>
      </div>
    );
  }

  if (kind === 'audio' && file.url) {
    return (
      <div className="message-attachment message-attachment--audio">
        <strong>{label}</strong>
        <audio controls preload="metadata">
          <source src={file.url} type={file.contentType} />
          Your browser does not support the audio element.
        </audio>
        {size && <small>{size}</small>}
      </div>
    );
  }

  return (
    <div className={`message-attachment message-attachment--${kind}`}>
      <span className="message-attachment__icon">
        <Icon icon={kind === 'pdf' ? 'file-pdf-o' : 'file-o'} />
      </span>
      <span className="message-attachment__details">
        <strong>{label}</strong>
        <small>
          {kind === 'pdf' ? 'PDF document' : 'Document'}
          {size ? ` · ${size}` : ''}
        </small>
      </span>
      {file.url ? (
        <span className="message-attachment__links">
          <a href={file.url} target="_blank" rel="noreferrer">
            Open
          </a>
          <a href={file.url} download={label} title={`Download ${label}`}>
            <Icon icon="download" />
          </a>
        </span>
      ) : (
        <small className="file-unavailable">Unavailable</small>
      )}
    </div>
  );
};

const MessageItem = ({
  message,
  handleAdmin,
  handleLike,
  handleDelete,
  handleEdit,
  onReply,
  hasAdvancedMessages,
}) => {
  const {
    author,
    createdAt,
    text,
    file,
    likes,
    likeCount,
    isPending,
    isDeleting,
    isReacting,
    editedAt,
    replyTo,
  } = message;
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(text || '');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const { profile } = useProfile();

  const isAdmin = useCurrentRoom(v => v.isAdmin);
  const admins = useCurrentRoom(v => v.admins);
  const roomType = useCurrentRoom(v => v.roomType);

  const isMsgAuthorAdmin = admins.includes(author.uid);
  const isAuthor = profile.uid === author.uid;
  const canGrantAdmin = roomType === 'group' && isAdmin && !isAuthor;

  const canShowIcons = true;

  const isLiked = likes && Object.keys(likes).includes(profile.uid);

  const handleCopy = async () => {
    const value = text || file?.name;
    try {
      const copied = await copyText(value);
      if (!copied) throw new Error('Copy command was rejected');
      Alert.success('Message copied');
    } catch {
      Alert.error('Could not copy the message');
    }
  };

  const saveEdit = async () => {
    const nextText = editText.trim();
    if (!nextText || nextText.length > 1000) return;
    if (nextText === text) {
      setIsEditing(false);
      return;
    }
    setIsSavingEdit(true);
    const saved = await handleEdit(message.id, nextText);
    setIsSavingEdit(false);
    if (saved) setIsEditing(false);
  };

  return (
    <li
      id={`message-${message.id}`}
      className={`message-row ${isAuthor ? 'message-row--self' : ''} ${isDeleting ? 'message-row--deleting' : ''}`}
    >
      {!isAuthor && (
        <div className="message-avatar-wrap">
          <ProfileAvatar src={author.avatar} name={author.name} size="sm" />
          <PresenceDot uid={author.uid} />
        </div>
      )}

      <div className="message-content">
        <div className="message-meta">
          <ProfileInfoBtnModal
            profile={author}
            appearance="link"
            className="message-author"
          >
            {canGrantAdmin && (
              <Button
                block
                onClick={() => handleAdmin(author.uid)}
                color="blue"
              >
                {isMsgAuthorAdmin
                  ? 'Remove admin permission'
                  : 'Make room admin'}
              </Button>
            )}
          </ProfileInfoBtnModal>
          {isPending ? (
            <span className="message-time message-pending">Sending…</span>
          ) : (
            <span className="message-time">
              <TimeAgo datetime={createdAt} />
              {editedAt && ' · edited'}
              {isAuthor && (
                <span
                  className="message-sent-check"
                  title="Sent to Chatspace"
                  aria-label="Sent"
                >
                  ✓
                </span>
              )}
            </span>
          )}
        </div>

        <div className="message-bubble">
          {replyTo && (
            <button
              type="button"
              className="message-reply-preview"
              onClick={() =>
                document
                  .getElementById(`message-${replyTo.id}`)
                  ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
              }
            >
              <strong>{replyTo.authorName}</strong>
              <span>
                {replyTo.unavailable
                  ? 'Earlier message'
                  : replyTo.text || replyTo.fileName || 'Attachment'}
              </span>
            </button>
          )}
          {isEditing ? (
            <div className="message-edit-form">
              <Input
                value={editText}
                onChange={value => setEditText(value.slice(0, 1000))}
                onKeyDown={event => {
                  if (event.key === 'Enter') saveEdit();
                  if (event.key === 'Escape') setIsEditing(false);
                }}
                autoFocus
              />
              <span>
                <button type="button" onClick={() => setIsEditing(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveEdit}
                  disabled={isSavingEdit || !editText.trim()}
                >
                  Save
                </button>
              </span>
            </div>
          ) : (
            text && <span className="word-break-all">{text}</span>
          )}
          {file && renderFileMessage(file)}
        </div>

        {!isPending && (
          <div
            className={`message-actions ${canShowIcons ? 'is-visible' : ''}`}
          >
            {hasAdvancedMessages && (
              <IconBtnControl
                isVisible={canShowIcons}
                iconName="reply"
                tooltip="Reply to message"
                onClick={() => onReply(message)}
              />
            )}
            {(text || file?.name) && (
              <IconBtnControl
                isVisible={canShowIcons}
                iconName="copy-o"
                tooltip="Copy message"
                onClick={handleCopy}
              />
            )}
            <IconBtnControl
              {...(isLiked ? { color: 'red' } : {})}
              className={`reaction-button ${isLiked ? 'is-liked' : ''} ${isReacting ? 'is-reacting' : ''}`}
              isVisible={canShowIcons}
              iconName="heart"
              tooltip="Like this message"
              onClick={() => handleLike(message.id)}
              badgeContent={likeCount}
              disabled={isReacting}
              aria-label={isLiked ? 'Remove like' : 'Like message'}
              aria-pressed={Boolean(isLiked)}
            />
            {isAuthor && (
              <>
                {hasAdvancedMessages && text && (
                  <IconBtnControl
                    isVisible={canShowIcons}
                    iconName="edit2"
                    tooltip="Edit message"
                    onClick={() => {
                      setEditText(text);
                      setIsEditing(true);
                    }}
                    aria-label="Edit message"
                  />
                )}
                <IconBtnControl
                  isVisible={canShowIcons}
                  iconName="close"
                  tooltip="Delete this message"
                  onClick={() => handleDelete(message.id)}
                  disabled={isDeleting}
                  aria-label="Delete message"
                />
              </>
            )}
          </div>
        )}
        {!isPending && likeCount > 0 && (
          <button
            type="button"
            className={`message-reaction-summary ${isLiked ? 'is-liked' : ''}`}
            onClick={() => handleLike(message.id)}
            disabled={isReacting}
            aria-label={`${likeCount} ${likeCount === 1 ? 'like' : 'likes'}`}
          >
            <Icon icon="heart" /> {likeCount}
          </button>
        )}
      </div>
    </li>
  );
};

export default memo(MessageItem);
