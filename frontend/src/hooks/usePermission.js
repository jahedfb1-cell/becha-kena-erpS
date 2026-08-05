import { useAuth } from '../store/AuthContext';

export const usePermission = () => {
  const { user } = useAuth();

  const can = (permissionName) => {
    if (!user) return false;
    
    // Admins bypass all permission checks
    if (user.role === 'admin') return true;

    return user.permissions ? user.permissions.includes(permissionName) : false;
  };

  return { can };
};
