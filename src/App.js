// src/App.js (or your main routing component)
import React from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate } from 'react-router-dom';
import LoginPage from './page/LoginPage';
import HomePage from './page/HomePage';
import GenerationPage from './page/GenerationPage';

import { AuthProvider } from './AuthContext';
import ProtectedRoute from './ProtectedRoute';

function App() {
  return (
    <Router>
      <AuthProvider> {/* Wrap your entire app with AuthProvider */}
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<LoginPage />} />

          {/* Protected routes */}
          <Route element={<ProtectedRoute />}> {/* Use ProtectedRoute as a wrapper */}
            <Route path="/home" element={<HomePage />} />
          <Route path="/generationPage" element={<GenerationPage />} />
          </Route>

          {/* Default/Catch-all route */}
          <Route path="*" element={<LoginPage />} />
        </Routes>
      </AuthProvider>
    </Router>
  );
}

export default App;