import React from 'react';
import { Switch, Route, useRouteMatch } from 'react-router';
import Sidebar from '../../components/Sidebar';
import { RoomsProvider } from '../../context/rooms.context';
import Chat from './Chat';
import { useMediaQuery } from '../../misc/custom-hooks';

const Home = () => {
  const isDesktop = useMediaQuery('(min-width: 992px)');
  const { isExact } = useRouteMatch();

  const canRenderSidebar = isDesktop || isExact;

  return (
    <RoomsProvider>
      <div className="app-shell">
        {canRenderSidebar && (
          <aside className="app-sidebar">
            <Sidebar />
          </aside>
        )}

        <Switch>
          <Route exact path="/chat/:chatId">
            <main className="app-content">
              <Chat />
            </main>
          </Route>
          <Route>
            {isDesktop && (
              <main className="app-content app-empty-state">
                <div className="empty-state-card">
                  <span className="empty-state-icon">✦</span>
                  <h2>Your private conversations</h2>
                  <p>
                    Choose one of your chats or start a new conversation.
                  </p>
                </div>
              </main>
            )}
          </Route>
        </Switch>
      </div>
    </RoomsProvider>
  );
};
export default Home;
