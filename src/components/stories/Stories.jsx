import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Alert, Button, Icon, Modal } from 'rsuite';
import TimeAgo from 'timeago-react';
import { useProfile } from '../../context/profile.context';
import { createSignedUrlMap } from '../../misc/attachments';
import { supabase } from '../../misc/supabase';
import ProfileAvatar from '../ProfileAvatar';

const MAX_STORY_SIZE = 20 * 1024 * 1024;
const STORY_COLORS = ['#2563eb', '#7c3aed', '#db2777', '#ea580c', '#059669'];

function isStoriesUnavailable(error) {
  const message = error?.message?.toLowerCase() || '';
  return (
    error?.code === 'PGRST205' ||
    error?.code === '42P01' ||
    (message.includes('schema cache') && message.includes('stories')) ||
    message.includes("could not find the table 'public.stories'")
  );
}

const Stories = () => {
  const { profile } = useProfile();
  const [isAvailable, setIsAvailable] = useState(null);
  const [stories, setStories] = useState([]);
  const [viewer, setViewer] = useState(null);
  const [isCreatorOpen, setIsCreatorOpen] = useState(false);
  const [caption, setCaption] = useState('');
  const [backgroundColor, setBackgroundColor] = useState(STORY_COLORS[0]);
  const [storyFile, setStoryFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const fileInputRef = useRef();

  const loadStories = useCallback(async () => {
    setLoadError('');
    const { data: rows, error } = await supabase
      .from('stories')
      .select(
        'id, author_id, media_path, media_type, caption, background_color, created_at, expires_at'
      )
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: true });

    if (error) {
      if (isStoriesUnavailable(error)) {
        setIsAvailable(false);
        setStories([]);
        return;
      }
      setLoadError(error.message || 'Stories could not be refreshed');
      return;
    }

    setIsAvailable(true);
    // Supabase RLS already returns only stories the signed-in user may see.
    // Filtering room memberships again hid valid stories when that query failed.
    const storyRows = rows || [];
    const authorIds = [...new Set(storyRows.map(story => story.author_id))];
    const storyIds = storyRows.map(story => story.id);
    const mediaPaths = storyRows
      .filter(story => story.media_path)
      .map(story => story.media_path);

    const [{ data: authors }, { data: views }, mediaMap] = await Promise.all([
      authorIds.length
        ? supabase
            .from('profiles')
            .select('id, name, avatar_url')
            .in('id', authorIds)
        : Promise.resolve({ data: [] }),
      storyIds.length
        ? supabase
            .from('story_views')
            .select('story_id, user_id')
            .in('story_id', storyIds)
        : Promise.resolve({ data: [] }),
      createSignedUrlMap(
        supabase.storage.from('story-media'),
        mediaPaths,
        60 * 60
      ),
    ]);

    const authorMap = Object.fromEntries(
      (authors || []).map(author => [author.id, author])
    );
    setStories(
      storyRows.map(story => {
        const author = authorMap[story.author_id] || {};
        return {
          id: story.id,
          authorId: story.author_id,
          authorName: author.name || 'Chat member',
          authorAvatar: author.avatar_url || null,
          mediaPath: story.media_path,
          mediaType: story.media_type,
          mediaUrl: story.media_path ? mediaMap[story.media_path] : null,
          caption: story.caption || '',
          backgroundColor: story.background_color || STORY_COLORS[0],
          createdAt: story.created_at,
          expiresAt: story.expires_at,
          viewed: (views || []).some(
            view => view.story_id === story.id && view.user_id === profile.uid
          ),
        };
      })
    );
  }, [profile.uid]);

  useEffect(() => {
    const initialLoad = window.setTimeout(loadStories, 0);
    return () => window.clearTimeout(initialLoad);
  }, [loadStories]);

  useEffect(() => {
    if (!isAvailable) return undefined;
    const channel = supabase
      .channel('chatspace:stories')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'stories' },
        loadStories
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'story_views' },
        loadStories
      )
      .subscribe();
    const refreshTimer = window.setInterval(loadStories, 60 * 1000);

    return () => {
      window.clearInterval(refreshTimer);
      supabase.removeChannel(channel);
    };
  }, [isAvailable, loadStories]);

  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl]
  );

  const storyGroups = useMemo(() => {
    const groupsByAuthor = stories.reduce((result, story) => {
      if (!result[story.authorId]) {
        result[story.authorId] = {
          authorId: story.authorId,
          authorName: story.authorName,
          authorAvatar: story.authorAvatar,
          stories: [],
        };
      }
      result[story.authorId].stories.push(story);
      return result;
    }, {});

    return Object.values(groupsByAuthor).sort((first, second) => {
      if (first.authorId === profile.uid) return -1;
      if (second.authorId === profile.uid) return 1;
      const firstTime = first.stories.at(-1)?.createdAt;
      const secondTime = second.stories.at(-1)?.createdAt;
      return new Date(secondTime) - new Date(firstTime);
    });
  }, [profile.uid, stories]);

  const closeViewer = useCallback(() => setViewer(null), []);

  const showNextStory = useCallback(() => {
    setViewer(current => {
      if (!current) return null;
      const group = storyGroups[current.groupIndex];
      if (current.storyIndex < group.stories.length - 1) {
        return { ...current, storyIndex: current.storyIndex + 1 };
      }
      if (current.groupIndex < storyGroups.length - 1) {
        return { groupIndex: current.groupIndex + 1, storyIndex: 0 };
      }
      return null;
    });
  }, [storyGroups]);

  const showPreviousStory = () => {
    setViewer(current => {
      if (!current) return null;
      if (current.storyIndex > 0) {
        return { ...current, storyIndex: current.storyIndex - 1 };
      }
      if (current.groupIndex > 0) {
        const previousGroup = storyGroups[current.groupIndex - 1];
        return {
          groupIndex: current.groupIndex - 1,
          storyIndex: previousGroup.stories.length - 1,
        };
      }
      return current;
    });
  };

  const activeGroup = viewer ? storyGroups[viewer.groupIndex] : null;
  const activeStory = activeGroup?.stories[viewer.storyIndex];

  useEffect(() => {
    if (!activeStory) return undefined;

    let viewedTimer;
    if (!activeStory.viewed && activeStory.authorId !== profile.uid) {
      viewedTimer = window.setTimeout(() => {
        setStories(current =>
          current.map(story =>
            story.id === activeStory.id ? { ...story, viewed: true } : story
          )
        );
        supabase
          .from('story_views')
          .upsert(
            { story_id: activeStory.id, user_id: profile.uid },
            { onConflict: 'story_id,user_id' }
          );
      }, 0);
    }

    const advanceTimer =
      activeStory.mediaType === 'video'
        ? null
        : window.setTimeout(showNextStory, 5000);
    return () => {
      window.clearTimeout(viewedTimer);
      window.clearTimeout(advanceTimer);
    };
  }, [activeStory, profile.uid, showNextStory]);

  const chooseStoryFile = file => {
    if (!file) return;
    const isSupported =
      file.type.startsWith('image/') || file.type.startsWith('video/');
    if (!isSupported) {
      Alert.error('Choose an image or video for your story', 4000);
      return;
    }
    if (file.size > MAX_STORY_SIZE) {
      Alert.error('Story media must be 20 MB or smaller', 4000);
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setStoryFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const resetCreator = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setStoryFile(null);
    setCaption('');
    setBackgroundColor(STORY_COLORS[0]);
    setIsCreatorOpen(false);
  };

  const publishStory = async () => {
    const storyCaption = caption.trim();
    if (!storyFile && !storyCaption) {
      Alert.info('Add some text or choose a photo or video', 3500);
      return;
    }

    setIsPublishing(true);
    let mediaPath = null;
    let mediaType = 'text';

    if (storyFile) {
      const safeName = storyFile.name
        .replace(/[^a-zA-Z0-9._-]+/g, '-')
        .slice(-100);
      const uniqueId = window.crypto.randomUUID?.() || Date.now().toString();
      mediaPath = `${profile.uid}/${uniqueId}-${safeName}`;
      mediaType = storyFile.type.startsWith('video/') ? 'video' : 'image';
      const { error: uploadError } = await supabase.storage
        .from('story-media')
        .upload(mediaPath, storyFile, {
          contentType: storyFile.type,
          upsert: false,
        });

      if (uploadError) {
        Alert.error(
          uploadError.message.toLowerCase().includes('bucket not found')
            ? 'Stories need the latest Supabase migration.'
            : uploadError.message,
          5000
        );
        setIsPublishing(false);
        return;
      }
    }

    const { error } = await supabase.from('stories').insert({
      author_id: profile.uid,
      media_path: mediaPath,
      media_type: mediaType,
      caption: storyCaption || null,
      background_color: backgroundColor,
    });

    if (error) {
      if (mediaPath) {
        await supabase.storage.from('story-media').remove([mediaPath]);
      }
      Alert.error(error.message, 5000);
      setIsPublishing(false);
      return;
    }

    Alert.success('Your story is live for 24 hours', 3500);
    setIsPublishing(false);
    resetCreator();
    loadStories();
  };

  const deleteActiveStory = async () => {
    if (!activeStory || activeStory.authorId !== profile.uid) return;
    const { error } = await supabase
      .from('stories')
      .delete()
      .eq('id', activeStory.id);
    if (error) {
      Alert.error(error.message, 4000);
      return;
    }
    if (activeStory.mediaPath) {
      await supabase.storage
        .from('story-media')
        .remove([activeStory.mediaPath]);
    }
    closeViewer();
    loadStories();
  };

  return (
    <section className="stories-section" aria-label="Stories">
      <div className="stories-heading">
        <span>Stories</span>
        <span className="stories-heading__actions">
          <small>24h</small>
          <button
            type="button"
            onClick={loadStories}
            aria-label="Refresh stories"
            title="Refresh stories"
          >
            <Icon icon="refresh" />
          </button>
        </span>
      </div>
      {isAvailable === false && (
        <div className="stories-status" role="status">
          Stories need the latest Supabase migration.
        </div>
      )}
      {loadError && (
        <button type="button" className="stories-status" onClick={loadStories}>
          Stories could not load. Tap to retry.
        </button>
      )}
      <div className="stories-strip custom-scroll">
        <button
          type="button"
          className="story-person story-person--add"
          onClick={() => setIsCreatorOpen(true)}
          disabled={isAvailable === false}
          aria-label="Add your story"
        >
          <span className="story-avatar-shell">
            <ProfileAvatar src={profile.avatar} name={profile.name} size="sm" />
            <i>+</i>
          </span>
          <small>Add story</small>
        </button>

        {storyGroups.map((group, groupIndex) => {
          const hasUnseen = group.stories.some(story => !story.viewed);
          return (
            <button
              type="button"
              className={`story-person ${hasUnseen ? 'has-unseen' : ''}`}
              key={group.authorId}
              onClick={() =>
                setViewer({
                  groupIndex,
                  storyIndex: Math.max(
                    group.stories.findIndex(story => !story.viewed),
                    0
                  ),
                })
              }
            >
              <span className="story-avatar-shell">
                <ProfileAvatar
                  src={group.authorAvatar}
                  name={group.authorName}
                  size="sm"
                />
              </span>
              <small>
                {group.authorId === profile.uid
                  ? 'Your story'
                  : group.authorName}
              </small>
            </button>
          );
        })}
      </div>

      <Modal
        show={isCreatorOpen}
        onHide={resetCreator}
        className="app-modal story-create-modal"
        size="xs"
      >
        <Modal.Header>
          <Modal.Title>Create story</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm"
            className="visually-hidden"
            onChange={event => chooseStoryFile(event.target.files?.[0])}
          />
          <div className="story-create-preview" style={{ backgroundColor }}>
            {storyFile?.type.startsWith('video/') ? (
              <video src={previewUrl} controls muted />
            ) : previewUrl ? (
              <img src={previewUrl} alt="Story preview" />
            ) : (
              <p>{caption || 'Share a moment...'}</p>
            )}
          </div>
          <div className="story-create-tools">
            <Button onClick={() => fileInputRef.current?.click()}>
              <Icon icon="image" /> Photo or video
            </Button>
            <div className="story-color-picker" aria-label="Story background">
              {STORY_COLORS.map(color => (
                <button
                  type="button"
                  key={color}
                  style={{ backgroundColor: color }}
                  className={backgroundColor === color ? 'is-active' : ''}
                  onClick={() => setBackgroundColor(color)}
                  aria-label={`Use ${color} background`}
                />
              ))}
            </div>
          </div>
          <textarea
            value={caption}
            onChange={event => setCaption(event.target.value.slice(0, 500))}
            placeholder="Write a caption..."
            rows="3"
          />
          <div className="story-create-meta">
            <span>Visible for 24 hours</span>
            <span>{caption.length}/500</span>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button
            block
            appearance="primary"
            onClick={publishStory}
            loading={isPublishing}
            disabled={isPublishing || (!storyFile && !caption.trim())}
          >
            Share story
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal
        show={Boolean(activeStory)}
        onHide={closeViewer}
        className="story-viewer-modal"
        size="lg"
      >
        {activeStory && (
          <div
            className="story-viewer"
            style={{ backgroundColor: activeStory.backgroundColor }}
          >
            <div className="story-progress">
              {activeGroup.stories.map((story, index) => (
                <span
                  key={story.id}
                  className={index <= viewer.storyIndex ? 'is-complete' : ''}
                />
              ))}
            </div>
            <header>
              <ProfileAvatar
                src={activeStory.authorAvatar}
                name={activeStory.authorName}
                size="sm"
              />
              <strong>{activeStory.authorName}</strong>
              <TimeAgo datetime={activeStory.createdAt} />
              {activeStory.authorId === profile.uid && (
                <button
                  type="button"
                  onClick={deleteActiveStory}
                  title="Delete story"
                >
                  <Icon icon="trash" />
                </button>
              )}
              <button type="button" onClick={closeViewer} title="Close story">
                <Icon icon="close" />
              </button>
            </header>
            <div className="story-viewer__content">
              {activeStory.mediaType === 'video' && activeStory.mediaUrl ? (
                <video
                  key={activeStory.id}
                  src={activeStory.mediaUrl}
                  autoPlay
                  controls
                  onEnded={showNextStory}
                />
              ) : activeStory.mediaType === 'image' && activeStory.mediaUrl ? (
                <img src={activeStory.mediaUrl} alt={activeStory.caption} />
              ) : (
                <p>{activeStory.caption}</p>
              )}
            </div>
            {activeStory.mediaType !== 'text' && activeStory.caption && (
              <p className="story-viewer__caption">{activeStory.caption}</p>
            )}
            <button
              type="button"
              className="story-nav story-nav--previous"
              onClick={showPreviousStory}
              aria-label="Previous story"
            >
              <Icon icon="angle-left" />
            </button>
            <button
              type="button"
              className="story-nav story-nav--next"
              onClick={showNextStory}
              aria-label="Next story"
            >
              <Icon icon="angle-right" />
            </button>
          </div>
        )}
      </Modal>
    </section>
  );
};

export default Stories;
