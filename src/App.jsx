import React, { lazy, Suspense } from 'react';
import 'rsuite/dist/styles/rsuite-default.min.css';
import './styles/main.scss';
import './styles/android-parity.scss';
import { Route, Switch } from 'react-router';
import PrivateRoute from './components/PrivateRoute';
import PublicRoute from './components/PublicRoute';
import PageLoader from './components/PageLoader';
import { ProfileProvider } from './context/profile.context';

const SignIn = lazy(() => import('./pages/SignIn'));
const AuthCallback = lazy(() => import('./pages/AuthCallback'));
const Home = lazy(() => import('./pages/Home'));

function App() {
  return (
    <ProfileProvider>
      <Suspense fallback={<PageLoader />}>
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
      </Suspense>
    </ProfileProvider>
  );
}

export default App;
