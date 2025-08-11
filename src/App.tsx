import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { AppProvider } from './contexts/AppContext';
import ProtectedRoute from './components/auth/ProtectedRoute';
import Login from './components/auth/Login';
import Signup from './components/auth/Signup';
import CreateAcademy from './components/academy/CreateAcademy';
import DashboardLayout from './components/dashboard/DashboardLayout';
import Dashboard from './components/dashboard/Dashboard';
import Users from './components/users/Users';
import EditUser from './components/users/EditUser';
import UserDetails from './components/users/UserDetails';
import Settings from './components/settings/Settings';
import Finance from './components/finance/Finance';
import PlayerDetails from './components/finance/PlayerDetails';


function App() {
  return (
    <AuthProvider>
      <AppProvider>
        <Router>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route 
              path="/create-academy" 
              element={
                <ProtectedRoute>
                  <CreateAcademy />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/dashboard" 
              element={
                <ProtectedRoute>
                  <DashboardLayout>
                    <Dashboard />
                  </DashboardLayout>
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/users" 
              element={
                <ProtectedRoute requiredResource="users" requiredAction="read">
                  <DashboardLayout>
                    <Users />
                  </DashboardLayout>
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/users/:userId" 
              element={
                <ProtectedRoute requiredResource="users" requiredAction="read">
                  <DashboardLayout>
                    <UserDetails />
                  </DashboardLayout>
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/users/edit/:userId" 
              element={
                <ProtectedRoute requiredResource="users" requiredAction="write">
                  <DashboardLayout>
                    <EditUser />
                  </DashboardLayout>
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/settings" 
              element={
                <ProtectedRoute requiredResource="settings" requiredAction="read">
                  <DashboardLayout>
                    <Settings />
                  </DashboardLayout>
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/finance" 
              element={
                <ProtectedRoute requiredResource="finance" requiredAction="read">
                  <DashboardLayout>
                    <Finance />
                  </DashboardLayout>
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/finance/player/:playerId" 
              element={
                <ProtectedRoute requiredResource="finance" requiredAction="read">
                  <DashboardLayout>
                    <PlayerDetails />
                  </DashboardLayout>
                </ProtectedRoute>
              } 
            />
            <Route path="/" element={<Navigate to="/dashboard" />} />
          </Routes>
        </Router>
      </AppProvider>
    </AuthProvider>
  );
}

export default App;