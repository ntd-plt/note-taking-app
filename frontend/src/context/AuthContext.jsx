/* eslint-disable react-refresh/only-export-components */
import { createContext, useState, useEffect } from 'react';
import { authService } from '../services/authService';
import { isAuthenticated } from '../utils/tokenManager';

export const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAuth, setIsAuth] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      if (isAuthenticated()) {
        try {
          const userData = await authService.getCurrentUser();
          setUser(userData);
          setIsAuth(true);
        } catch {
          authService.logout();
          setIsAuth(false);
        }
      }
      setLoading(false);
    };

    checkAuth();
  }, []);

  const login = async (email, password) => {
    await authService.login(email, password);
    setIsAuth(true);
  };

  const signup = async (name, email, password) => {
    await authService.signup(name, email, password);
    setIsAuth(true);
  };

  const logout = () => {
    authService.logout();
    setUser(null);
    setIsAuth(false);
  };

  return (
    <AuthContext.Provider value={{ user, loading, isAuth, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
};