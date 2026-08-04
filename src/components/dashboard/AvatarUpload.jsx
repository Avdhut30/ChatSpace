import React, { useRef, useState } from 'react';
import AvatarEditor from 'react-avatar-editor';
import { Alert, Button, Icon, Modal } from 'rsuite';
import { useProfile } from '../../context/profile.context';
import { supabase } from '../../misc/supabase';
import ProfileAvatar from '../ProfileAvatar';

const MAX_AVATAR_SIZE = 5 * 1024 * 1024;
const SUPPORTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const AVATAR_URL_MARKER = '/storage/v1/object/public/profile-avatars/';

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => {
        if (blob) resolve(blob);
        else reject(new Error('Could not prepare the selected image'));
      },
      'image/webp',
      0.9
    );
  });
}

function getStoredAvatarPath(url) {
  if (!url || !url.includes(AVATAR_URL_MARKER)) return null;
  return decodeURIComponent(url.split(AVATAR_URL_MARKER)[1].split('?')[0]);
}

const AvatarUpload = () => {
  const { profile, updateProfile } = useProfile();
  const fileInputRef = useRef();
  const editorRef = useRef();
  const [selectedFile, setSelectedFile] = useState(null);
  const [scale, setScale] = useState(1.15);
  const [isUploading, setIsUploading] = useState(false);

  const closeEditor = () => {
    if (isUploading) return;
    setSelectedFile(null);
    setScale(1.15);
  };

  const selectFile = event => {
    const [file] = event.target.files;
    event.target.value = '';
    if (!file) return;

    if (!SUPPORTED_TYPES.includes(file.type)) {
      Alert.error('Choose a JPG, PNG, or WebP image', 4000);
      return;
    }

    if (file.size > MAX_AVATAR_SIZE) {
      Alert.error('Profile photos must be smaller than 5 MB', 4000);
      return;
    }

    setSelectedFile(file);
  };

  const uploadAvatar = async () => {
    if (!editorRef.current || isUploading) return;
    setIsUploading(true);

    let uploadedPath;

    try {
      const canvas = editorRef.current.getImageScaledToCanvas();
      const avatarBlob = await canvasToBlob(canvas);
      uploadedPath = `${profile.uid}/avatar-${Date.now()}.webp`;

      const { error: uploadError } = await supabase.storage
        .from('profile-avatars')
        .upload(uploadedPath, avatarBlob, {
          contentType: 'image/webp',
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) {
        if (uploadError.message.toLowerCase().includes('bucket not found')) {
          throw new Error(
            'Avatar storage is not ready. Apply the profile avatar migration in Supabase.'
          );
        }
        throw uploadError;
      }

      const { data } = supabase.storage
        .from('profile-avatars')
        .getPublicUrl(uploadedPath);

      const { error: profileError } = await supabase
        .from('profiles')
        .update({ avatar_url: data.publicUrl })
        .eq('id', profile.uid);

      if (profileError) throw profileError;

      updateProfile({ avatar: data.publicUrl });

      const previousPath = getStoredAvatarPath(profile.avatar);
      if (previousPath && previousPath !== uploadedPath) {
        await supabase.storage.from('profile-avatars').remove([previousPath]);
      }

      Alert.success('Profile photo updated', 4000);
      setSelectedFile(null);
      setScale(1.15);
    } catch (error) {
      if (uploadedPath) {
        await supabase.storage.from('profile-avatars').remove([uploadedPath]);
      }
      Alert.error(error.message, 5000);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="avatar-settings text-center">
      <h6>Profile photo</h6>
      <div className="avatar-settings__photo">
        <ProfileAvatar
          src={profile.avatar}
          name={profile.name}
          className="avatar-settings__preview"
        />
        <Button
          circle
          className="avatar-settings__edit"
          onClick={() => fileInputRef.current?.click()}
          title="Change profile photo"
        >
          <Icon icon="camera" />
        </Button>
      </div>

      <input
        ref={fileInputRef}
        className="visually-hidden"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={selectFile}
      />

      <Button
        appearance="ghost"
        size="sm"
        className="avatar-settings__select"
        onClick={() => fileInputRef.current?.click()}
      >
        Select new photo
      </Button>
      <p className="avatar-settings__hint">
        JPG, PNG, or WebP. Maximum size 5 MB.
      </p>

      <Modal
        show={Boolean(selectedFile)}
        onHide={closeEditor}
        size="xs"
        className="app-modal avatar-editor-modal"
      >
        <Modal.Header>
          <Modal.Title>Adjust profile photo</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {selectedFile && (
            <>
              <div className="avatar-editor-canvas">
                <AvatarEditor
                  ref={editorRef}
                  image={selectedFile}
                  width={240}
                  height={240}
                  border={16}
                  borderRadius={120}
                  color={[11, 18, 32, 0.78]}
                  scale={scale}
                  rotate={0}
                />
              </div>
              <label className="avatar-editor-zoom">
                <span>Zoom</span>
                <input
                  type="range"
                  min="1"
                  max="3"
                  step="0.05"
                  value={scale}
                  onChange={event => setScale(Number(event.target.value))}
                  disabled={isUploading}
                />
              </label>
              <p>Drag the image to reposition it inside the circle.</p>
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button onClick={closeEditor} disabled={isUploading}>
            Cancel
          </Button>
          <Button
            appearance="primary"
            onClick={uploadAvatar}
            loading={isUploading}
            disabled={isUploading}
          >
            Save photo
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default AvatarUpload;
