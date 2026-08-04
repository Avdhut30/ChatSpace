import React from 'react';
import 'rsuite/dist/styles/rsuite-default.min.css';
import './styles/main.scss';
import { Route, Switch } from 'react-router';
import SignIn from './pages/SignIn';
import AuthCallback from './pages/AuthCallback';
import PrivateRoute from './components/PrivateRoute';
import Home from './pages/Home';
import PublicRoute from './components/PublicRoute';
import { ProfileProvider } from './context/profile.context';

function App() {
  return (
    <ProfileProvider>
      <Switch>
        <Route exact path="/auth/callback">
          <AuthCallback />
        </Route>
        <PublicRoute path="/signin">
          <SignIn />
        </PublicRoute>
        <PrivateRoute path="/">
          <Home />
        </PrivateRoute>
      </Switch>
    </ProfileProvider>
  );
}

export default App;
