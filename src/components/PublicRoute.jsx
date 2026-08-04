import React from 'react';
import { Redirect, Route } from 'react-router';
import { useProfile } from '../context/profile.context';
import PageLoader from './PageLoader';

const PublicRoute = ({ children, ...routeProps }) => {
  const { profile, isLoading } = useProfile();

  if (isLoading && !profile) {
    return <PageLoader />;
  }
  if (profile && !isLoading) {
    return <Redirect to="/" />;
  }

  return <Route {...routeProps}>{children}</Route>;
};

export default PublicRoute;
