import React, { memo } from 'react';
import { Alert, Button } from 'rsuite';
import TimeAgo from 'timeago-react';
import { useCurrentRoom } from '../../../context/current-room.context';
import { useHover, useMediaQuery } from '../../../misc/custom-hooks';
import { auth } from '../../../misc/firebase';
import PresenceDot from '../../PresenceDot';
import ProfileAvatar from '../../ProfileAvatar';
import ProfileInfoBtnModal from './ProfileInfoBtnModal';
import IconBtnControl from './IconBtnControl';
import ImgBtnModal from './ImgBtnModal';

const renderFileMessage = file => {
  if (file.contentType.includes('image')) {
    return (
      <div className="height-220">
        <ImgBtnModal src={file.url} fileName={file.name} />
      </div>
    );
  }

  if (file.contentType.includes('audio')) {
    return (
      <audio controls>
        <source src={file.url} type={file.contentType} />
        Your browser does not support the audio element.
      </audio>
    );
  }

  return <a href={file.url}>Download {file.name}</a>;
};

const MessageItem = ({ message, handleAdmin, handleLike, handleDelete }) => {
  const { author, createdAt, text, file, likes, likeCount } = message;

  const [selfHover, isHovered] = useHover();
  const isMobile = useMediaQuery('(max-width:992px)');

  const isAdmin = useCurrentRoom(v => v.isAdmin);
  const admins = useCurrentRoom(v => v.admins);

  const isMsgAuthorAdmin = admins.includes(author.uid);
  const isAuthor = auth.currentUser.uid === author.uid;
  const canGrantAdmin = isAdmin && !isAuthor;

  const canShowIcons = isMobile || isHovered;

  const isLiked = likes && Object.keys(likes).includes(auth.currentUser.uid);

  const handleCopy = async () => {
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      Alert.success('Message copied');
    } catch {
      Alert.error('Could not copy the message');
    }
  };

  return (
    <li
      className={`message-row ${isAuthor ? 'message-row--self' : ''}`}
      ref={selfHover}
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
          <TimeAgo datetime={createdAt} className="message-time" />
        </div>

        <div className="message-bubble">
          {text && <span className="word-break-all">{text}</span>}
          {file && renderFileMessage(file)}
        </div>

        <div className={`message-actions ${canShowIcons ? 'is-visible' : ''}`}>
          {text && (
            <IconBtnControl
              isVisible={canShowIcons}
              iconName="copy-o"
              tooltip="Copy message"
              onClick={handleCopy}
            />
          )}
          <IconBtnControl
            {...(isLiked ? { color: 'red' } : {})}
            isVisible={canShowIcons}
            iconName="heart"
            tooltip="Like this message"
            onClick={() => handleLike(message.id)}
            badgeContent={likeCount}
          />
          {isAuthor && (
            <IconBtnControl
              isVisible={canShowIcons}
              iconName="close"
              tooltip="Delete this message"
              onClick={() => handleDelete(message.id)}
            />
          )}
        </div>
      </div>
    </li>
  );
};

export default memo(MessageItem);
