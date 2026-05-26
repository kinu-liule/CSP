import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(localStorage.getItem('token'));

  useEffect(() => {
    if (token && !user) {
      const tenantId = localStorage.getItem('tenantId');
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      if (tenantId) {
        axios.defaults.headers.common['x-tenant-id'] = tenantId;
      }
      fetchUser();
    } else if (!token) {
      setLoading(false);
    }
  }, [token, user]);

  const fetchUser = async () => {
    try {
      const tenantId = localStorage.getItem('tenantId');
      const response = await axios.get(`/iam/users/me`, {
        headers: { 'x-tenant-id': tenantId }
      });
      setUser(response.data.data);
    } catch (error) {
      console.error('Failed to fetch user:', error);
      logout();
    } finally {
      setLoading(false);
    }
  };

  const login = async (username, password, tenantId) => {
    try {
      const response = await axios.post(
        `/iam/auth/login`,
        { username, password },
        { headers: { 'x-tenant-id': tenantId } }
      );
      const { token: newToken, user } = response.data.data;
      localStorage.setItem('token', newToken);
      localStorage.setItem('tenantId', tenantId);
      setToken(newToken);
      setUser(user);
      // Don't rely on useEffect - set headers directly
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error.response?.data?.error?.message || 'Login failed' 
      };
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('tenantId');
    setToken(null);
    setUser(null);
    delete axios.defaults.headers.common['Authorization'];
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, loading, isAuthenticated: !!token }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
