import { useCallback } from 'react';
import { useAppContext } from '../context/AppContext';
import { getRoomFromUrl } from '../utils/helpers';

export function useUserName() {
  const { userName, setUserName, openNameModal, closeNameModal, showNameModal, modalContext, pendingAction } = useAppContext();
  
  // Save name and trigger pending action
  const saveName = useCallback((name) => {
    if (!name.trim()) {
      alert("Please enter a name");
      return false;
    }
    
    setUserName(name.trim());
    
    // Execute pending action if exists
    if (pendingAction) {
      pendingAction(modalContext);
    }
    
    closeNameModal();
    return true;
  }, [setUserName, pendingAction, modalContext, closeNameModal]);
  
  // Check URL for room code
  const checkUrlForRoom = useCallback(() => {
    return getRoomFromUrl();
  }, []);
  
  return {
    userName,
    saveName,
    openNameModal,
    closeNameModal,
    showNameModal,
    modalContext,
    checkUrlForRoom,
  };
}
