import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router';
import { Alert, Button, Icon } from 'rsuite';
import { useProfile } from '../../../context/profile.context';
import {
  requestRoomsRefresh,
  subscribeToMessageUpdates,
} from '../../../misc/chat-events';
import { groupBy } from '../../../misc/helpers';
import { isAdvancedMessageSchemaError, supabase } from '../../../misc/supabase';
import MessageItem from './MessageItem';

const PAGE_SIZE = 15;

function shouldScrollToBottom(node, threshold = 30) {
  if (!node) return false;
  const percentage =
    (100 * node.scrollTop) / (node.scrollHeight - node.clientHeight) || 0;
  return percentage > threshold;
}

function formatMessageDate(dateValue) {
  const date = new Date(dateValue);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

const Messages = ({
  searchQuery = '',
  onReply,
  hasAdvancedMessages = true,
  onAdvancedMessagesUnavailable,
}) => {
  const { chatId } = useParams();
  const { profile } = useProfile();
  const [messages, setMessages] = useState(null);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [deletingIds, setDeletingIds] = useState(new Set());
  const [reactingIds, setReactingIds] = useState(new Set());
  const selfRef = useRef();
  const limitRef = useRef(PAGE_SIZE);
  const hasLoadedRef = useRef(false);
  const pendingDeleteIdsRef = useRef(new Set());
  const pendingLikeStateRef = useRef(new Map());

  const isChatEmpty = messages && messages.length === 0;
  const canShowMessages = messages && messages.length > 0;
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const visibleMessages = canShowMessages
    ? messages.filter(message => {
        if (!normalizedSearch) return true;
        return [message.text, message.author?.name]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(normalizedSearch);
      })
    : [];

  const loadMessages = useCallback(
    async (limitToLast = limitRef.current, showErrors = true) => {
      const node = selfRef.current;
      const wasNearBottom = shouldScrollToBottom(node);
      const messageColumns = hasAdvancedMessages
        ? 'id, room_id, author_id, text, created_at, edited_at, reply_to, file_path, file_name, file_type, file_size'
        : 'id, room_id, author_id, text, created_at, file_path, file_name, file_type, file_size';
      let { data: rows, error } = await supabase
        .from('messages')
        .select(messageColumns)
        .eq('room_id', chatId)
        .order('created_at', { ascending: false })
        .limit(limitToLast);

      if (hasAdvancedMessages && isAdvancedMessageSchemaError(error)) {
        onAdvancedMessagesUnavailable();
        const legacyResult = await supabase
          .from('messages')
          .select(
            'id, room_id, author_id, text, created_at, file_path, file_name, file_type, file_size'
          )
          .eq('room_id', chatId)
          .order('created_at', { ascending: false })
          .limit(limitToLast);
        rows = legacyResult.data;
        error = legacyResult.error;
      }

      if (error) {
        if (showErrors) {
          Alert.error(error.message, 4000);
          setMessages([]);
        }
        return;
      }

      rows = rows || [];
      const authorIds = [...new Set(rows.map(message => message.author_id))];
      const messageIds = rows.map(message => message.id);
      const filePaths = rows
        .filter(message => message.file_path)
        .map(message => message.file_path);
      const [{ data: authors }, { data: likes }, { data: signedFiles }] =
        await Promise.all([
          authorIds.length
            ? supabase
                .from('profiles')
                .select('id, name, avatar_url, username, created_at')
                .in('id', authorIds)
            : Promise.resolve({ data: [] }),
          messageIds.length
            ? supabase
                .from('message_likes')
                .select('message_id, user_id')
                .in('message_id', messageIds)
            : Promise.resolve({ data: [] }),
          filePaths.length
            ? supabase.storage
                .from('chat-files')
                .createSignedUrls(filePaths, 60 * 60)
            : Promise.resolve({ data: [] }),
        ]);

      const authorMap = Object.fromEntries(
        (authors || []).map(author => [author.id, author])
      );
      const signedFileMap = Object.fromEntries(
        (signedFiles || []).map(file => [file.path, file.signedUrl])
      );
      const nextMessages = rows
        .filter(message => !pendingDeleteIdsRef.current.has(String(message.id)))
        .map(message => {
          const author = authorMap[message.author_id] || {};
          const messageLikes = (likes || []).filter(
            like => String(like.message_id) === String(message.id)
          );

          const pendingLikeState = pendingLikeStateRef.current.get(
            String(message.id)
          );
          const likesByUser = Object.fromEntries(
            messageLikes.map(like => [like.user_id, true])
          );

          if (pendingLikeState === true) likesByUser[profile.uid] = true;
          if (pendingLikeState === false) delete likesByUser[profile.uid];

          const repliedMessage = rows.find(
            item => String(item.id) === String(message.reply_to)
          );
          const repliedAuthor = repliedMessage
            ? authorMap[repliedMessage.author_id] || {}
            : null;

          return {
            id: message.id,
            text: message.text,
            createdAt: message.created_at,
            editedAt: message.edited_at,
            author: {
              uid: message.author_id,
              name: author.name || 'Chat member',
              avatar: author.avatar_url || null,
              username: author.username || '',
              createdAt: author.created_at,
            },
            likes: likesByUser,
            likeCount: Object.keys(likesByUser).length,
            replyTo: message.reply_to
              ? {
                  id: message.reply_to,
                  text: repliedMessage?.text || '',
                  fileName: repliedMessage?.file_name || '',
                  authorName: repliedMessage
                    ? repliedAuthor?.name || 'Chat member'
                    : 'Original message',
                  unavailable: !repliedMessage,
                }
              : null,
            file: message.file_path
              ? {
                  path: message.file_path,
                  name: message.file_name,
                  contentType: message.file_type || 'application/octet-stream',
                  size: message.file_size,
                  url: signedFileMap[message.file_path],
                }
              : null,
          };
        })
        .reverse();

      setMessages(current => {
        const pendingMessages = (current || []).filter(
          message => message.isPending
        );
        return [...nextMessages, ...pendingMessages].sort(
          (first, second) =>
            new Date(first.createdAt) - new Date(second.createdAt)
        );
      });
      setShowJumpToLatest(!wasNearBottom && hasLoadedRef.current);
      hasLoadedRef.current = true;

      window.setTimeout(() => {
        if (node && (wasNearBottom || limitToLast === PAGE_SIZE)) {
          node.scrollTop = node.scrollHeight;
        }
      }, 0);
    },
    [chatId, hasAdvancedMessages, onAdvancedMessagesUnavailable, profile.uid]
  );

  const onLoadMore = useCallback(async () => {
    const node = selfRef.current;
    const oldHeight = node.scrollHeight;
    const nextLimit = limit + PAGE_SIZE;

    limitRef.current = nextLimit;
    setLimit(nextLimit);
    await loadMessages(nextLimit);

    window.setTimeout(() => {
      node.scrollTop = node.scrollHeight - oldHeight;
    }, 0);
  }, [limit, loadMessages]);

  useEffect(() => {
    limitRef.current = PAGE_SIZE;
    const initialLoadTimer = window.setTimeout(
      () => loadMessages(PAGE_SIZE),
      0
    );

    const channel = supabase
      .channel(`messages:${chatId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `room_id=eq.${chatId}`,
        },
        () => loadMessages()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'message_likes' },
        () => loadMessages()
      )
      .subscribe();

    const unsubscribeLocalMessages = subscribeToMessageUpdates(event => {
      const update = event.detail;
      if (!update || update.chatId !== chatId) return;

      setMessages(current => {
        if (!current) {
          return update.type === 'add' ? [update.message] : current;
        }

        if (update.type === 'remove') {
          return current.filter(message => message.id !== update.messageId);
        }

        if (update.type === 'replace') {
          return [
            ...current.filter(
              message =>
                message.id !== update.messageId &&
                String(message.id) !== String(update.message.id)
            ),
            update.message,
          ].sort(
            (first, second) =>
              new Date(first.createdAt) - new Date(second.createdAt)
          );
        }

        if (update.type === 'add') {
          return [...current, update.message];
        }

        return current;
      });

      window.setTimeout(() => {
        const node = selfRef.current;
        if (node) node.scrollTop = node.scrollHeight;
      }, 0);
    });

    const syncTimer = window.setInterval(() => {
      if (!document.hidden) loadMessages(undefined, false);
    }, 5000);

    return () => {
      window.clearTimeout(initialLoadTimer);
      window.clearInterval(syncTimer);
      unsubscribeLocalMessages();
      supabase.removeChannel(channel);
    };
  }, [chatId, loadMessages]);

  const handleAdmin = useCallback(
    async uid => {
      const isAdmin = messages.some(
        message => message.author.uid === uid && message.author.isAdmin
      );
      const { data: membership } = await supabase
        .from('room_members')
        .select('room_id, user_id, is_admin')
        .eq('room_id', chatId)
        .eq('user_id', uid)
        .maybeSingle();

      const currentlyAdmin = membership?.is_admin || isAdmin;
      const { error } = membership
        ? await supabase
            .from('room_members')
            .update({ is_admin: !currentlyAdmin })
            .eq('room_id', chatId)
            .eq('user_id', uid)
        : await supabase.from('room_members').insert({
            room_id: chatId,
            user_id: uid,
            is_admin: true,
          });

      if (error) {
        Alert.error(error.message, 4000);
      } else {
        Alert.info(
          currentlyAdmin
            ? 'Admin permission removed'
            : 'Admin permission granted',
          4000
        );
      }
    },
    [chatId, messages]
  );

  const handleLike = useCallback(
    async msgId => {
      const pendingKey = String(msgId);
      if (pendingLikeStateRef.current.has(pendingKey)) return;

      const message = messages.find(item => item.id === msgId);
      if (!message) return;

      const isLiked = Boolean(message?.likes?.[profile.uid]);
      const shouldLike = !isLiked;

      pendingLikeStateRef.current.set(pendingKey, shouldLike);
      setReactingIds(current => new Set(current).add(pendingKey));
      setMessages(current =>
        current.map(item => {
          if (item.id !== msgId) return item;

          const likes = { ...(item.likes || {}) };
          if (shouldLike) likes[profile.uid] = true;
          else delete likes[profile.uid];

          return { ...item, likes, likeCount: Object.keys(likes).length };
        })
      );

      try {
        const { error } = isLiked
          ? await supabase
              .from('message_likes')
              .delete()
              .eq('message_id', msgId)
              .eq('user_id', profile.uid)
          : await supabase
              .from('message_likes')
              .insert({ message_id: msgId, user_id: profile.uid });

        if (error) throw error;
        await loadMessages(undefined, false);
      } catch (error) {
        setMessages(current =>
          current.map(item => (item.id === msgId ? message : item))
        );
        Alert.error(error.message, 4000);
      } finally {
        pendingLikeStateRef.current.delete(pendingKey);
        setReactingIds(current => {
          const next = new Set(current);
          next.delete(pendingKey);
          return next;
        });
      }
    },
    [loadMessages, messages, profile.uid]
  );

  const handleDelete = useCallback(
    async msgId => {
      const pendingKey = String(msgId);
      if (pendingDeleteIdsRef.current.has(pendingKey)) return;
      if (!window.confirm('Delete this message?')) return;

      const message = messages.find(item => item.id === msgId);
      if (!message) return;

      pendingDeleteIdsRef.current.add(pendingKey);
      setDeletingIds(current => new Set(current).add(pendingKey));

      await new Promise(resolve => window.setTimeout(resolve, 160));
      setMessages(current => current.filter(item => item.id !== msgId));

      try {
        const { data: deletedMessage, error } = await supabase
          .from('messages')
          .delete()
          .eq('id', msgId)
          .select('id')
          .maybeSingle();

        if (error) throw error;
        if (!deletedMessage) {
          throw new Error('Message could not be deleted. Please try again.');
        }

        if (message.file?.path) {
          const { error: storageError } = await supabase.storage
            .from('chat-files')
            .remove([message.file.path]);
          if (storageError) {
            Alert.warning('Message deleted, but file cleanup will be retried');
          }
        }
        requestRoomsRefresh();
        Alert.info('Message deleted');
      } catch (error) {
        setMessages(current =>
          [...current.filter(item => item.id !== msgId), message].sort(
            (first, second) =>
              new Date(first.createdAt) - new Date(second.createdAt)
          )
        );
        Alert.error(error.message, 4000);
      } finally {
        pendingDeleteIdsRef.current.delete(pendingKey);
        setDeletingIds(current => {
          const next = new Set(current);
          next.delete(pendingKey);
          return next;
        });
      }
    },
    [messages]
  );

  const handleEdit = useCallback(
    async (msgId, nextText) => {
      const message = messages.find(item => item.id === msgId);
      const text = nextText.trim();
      if (!message || !text || text === message.text) return false;

      const editedAt = new Date().toISOString();
      setMessages(current =>
        current.map(item =>
          item.id === msgId ? { ...item, text, editedAt } : item
        )
      );

      const { error } = await supabase
        .from('messages')
        .update({ text, edited_at: editedAt })
        .eq('id', msgId)
        .eq('author_id', profile.uid);

      if (error) {
        if (isAdvancedMessageSchemaError(error)) {
          onAdvancedMessagesUnavailable();
          setMessages(current =>
            current.map(item => (item.id === msgId ? message : item))
          );
          return false;
        }
        setMessages(current =>
          current.map(item => (item.id === msgId ? message : item))
        );
        Alert.error(error.message, 4000);
        return false;
      }

      requestRoomsRefresh();
      return true;
    },
    [messages, onAdvancedMessagesUnavailable, profile.uid]
  );

  const handleScroll = () => {
    const node = selfRef.current;
    if (!node) return;
    const distanceFromBottom =
      node.scrollHeight - node.scrollTop - node.clientHeight;
    setShowJumpToLatest(distanceFromBottom > 180);
  };

  const jumpToLatest = () => {
    selfRef.current?.scrollTo({
      top: selfRef.current.scrollHeight,
      behavior: 'smooth',
    });
    setShowJumpToLatest(false);
  };

  const renderMessages = () => {
    const groups = groupBy(visibleMessages, item =>
      new Date(item.createdAt).toDateString()
    );

    return Object.keys(groups).flatMap(date => [
      <li key={date} className="message-date-divider">
        <span>{formatMessageDate(date)}</span>
      </li>,
      ...groups[date].map(message => (
        <MessageItem
          key={message.id}
          message={{
            ...message,
            isDeleting: deletingIds.has(String(message.id)),
            isReacting: reactingIds.has(String(message.id)),
          }}
          handleAdmin={handleAdmin}
          handleLike={handleLike}
          handleDelete={handleDelete}
          handleEdit={handleEdit}
          onReply={onReply}
          hasAdvancedMessages={hasAdvancedMessages}
        />
      )),
    ]);
  };

  return (
    <div className="message-list-shell">
      <ul
        ref={selfRef}
        className="msg-list custom-scroll"
        onScroll={handleScroll}
      >
        {!messages && (
          <li className="message-skeletons" aria-label="Loading messages">
            {[0, 1, 2, 3].map(item => (
              <span
                key={item}
                className={`message-skeleton ${item % 2 ? 'is-self' : ''}`}
              >
                <i />
                <b />
              </span>
            ))}
          </li>
        )}
        {messages && messages.length >= PAGE_SIZE && (
          <li className="message-load-more">
            <Button onClick={onLoadMore} appearance="ghost" size="sm">
              Load earlier messages
            </Button>
          </li>
        )}
        {isChatEmpty && (
          <li className="chat-empty-message">
            <span className="chat-empty-message__icon">✦</span>
            <h3>Start the conversation</h3>
            <p>Send a message below to say hello.</p>
          </li>
        )}
        {canShowMessages &&
          normalizedSearch &&
          visibleMessages.length === 0 && (
            <li className="chat-empty-message">
              <span className="chat-empty-message__icon">
                <Icon icon="search" />
              </span>
              <h3>No matching messages</h3>
              <p>Try another word or clear the search.</p>
            </li>
          )}
        {canShowMessages && renderMessages()}
      </ul>

      {showJumpToLatest && (
        <Button
          circle
          className="jump-to-latest"
          onClick={jumpToLatest}
          title="Jump to latest message"
        >
          <Icon icon="angle-double-down" />
        </Button>
      )}
    </div>
  );
};

export default Messages;
