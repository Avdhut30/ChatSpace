import React from 'react';
import DashboardToggle from './dashboard/DashboardToggle';
import CreateRoomBtnModal from './dashboard/CreateRoomBtnModal';
import ChatRoomList from './rooms/ChatRoomList';
import ProfileAvatar from './ProfileAvatar';
import { useProfile } from '../context/profile.context';

const Sidebar = () => {
  const { profile } = useProfile();

  return (
    <div className="sidebar-inner">
      <header className="sidebar-header">
        <div className="brand-lockup">
          <span className="brand-mark">C</span>
          <span>Chatspace</span>
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
          <strong>{profile.name}</strong>
          <span>
            <i className="online-dot" /> Available
          </span>
        </div>
      </div>

      <section className="sidebar-rooms">
        <div className="sidebar-section-title">
          <span>Conversations</span>
          <span className="sidebar-section-count">Live</span>
        </div>
        <CreateRoomBtnModal />
        <ChatRoomList />
      </section>
    </div>
  );
};

export default Sidebar;
