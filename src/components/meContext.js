// P3 Task 7: who is acting, for components that gate on v2 roles (CloseControl).
// readOnly = "View as" (P3-16): no write controls. nameOf / isActive key on uid
// (directory members); unknown uids fall back to the uid / count as active.
import React from 'react';

export const MeContext = React.createContext({
  uid: null,
  name: null,
  isOwner: false,
  readOnly: false,
  nameOf: (uid) => uid,
  isActive: () => true,
});
