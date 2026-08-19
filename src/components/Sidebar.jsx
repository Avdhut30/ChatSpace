import React from 'react';
import DashboardToggle from './dashboard/DashboardToggle';
import CreateRoomBtnModal from './dashboard/CreateRoomBtnModal';
import CreateDirectMessageModal from './dashboard/CreateDirectMessageModal';
import ChatRoomList from './rooms/ChatRoomList';
import ProfileAvatar from './ProfileAvatar';
import { useProfile } from '../context/profile.context';
import Stories from './stories/Stories';

const Sidebar = () => {
  const { profile } = useProfile();

  return (
    <div className="sidebar-inner">
      <header className="sidebar-header">
        <div className="brand-lockup">
          <span className="brand-mark">
            <span aria-hidden="true">●</span>
          </span>
          <span>ChatSpace</span>
        </div>
        <DashboardToggle />
      </header>

      <div className="sidebar-profile">
        <ProfileAvatar
          src={profile.avatar}
          name={profile.name}
          size="md"
          className="sidebar-profile__avatar"
        />
        <div className="sidebar-profile__copy">
          <small>Good to see you</small>
          <strong>{profile.name}</strong>
          {profile.username && (
            <span className="sidebar-profile__username">
              @{profile.username}
            </span>
          )}
          <span>
            <i className="online-dot" /> Available
          </span>
        </div>
      </div>

      <Stories />

      <section className="sidebar-rooms">
        <div className="sidebar-section-title">
          <span>Conversations</span>
          <span className="sidebar-section-count">Private & secure</span>
        </div>
        <div className="sidebar-create-actions">
          <CreateDirectMessageModal />
          <CreateRoomBtnModal />
        </div>
        <ChatRoomList />
      </section>
    </div>
  );
};

export default Sidebar;
