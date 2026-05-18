/**
 * Database Port (Re-export)
 * Import from here to keep your options open for future changes
 */

export {
  // Overlays
  overlaysByExternalIds,
  
  // Organizations
  companyBySlug,
  companyStats,
  followOrg,
  unfollowOrg,
  isFollowingOrg,
  rateOrg,
  
  // Contributors
  contributorByHandle,
  followContributor,
  unfollowContributor,
  isFollowingContributor,
  rateContributor,
  
  // Assets
  rateAsset,
  getUserRating,
  
  // Profiles
  getProfile,
  getProfileByHandle,
  createProfile,
  updateProfile,
  checkHandleExists,
  completeOnboarding,
  
  // Organizations (Extended)
  createOrganization,
  updateOrganization,
  checkOrgSlugExists,
  getUserOrganizations,
  
  // Notification Preferences
  getNotificationPreferences,
  updateNotificationPreferences,
  
  // Identity Links (Multi-Provider)
  getIdentityLinks,
  addIdentityLink,
  removeIdentityLink,
  
  // User Wallets (Web3)
  getUserWallets,
  addUserWallet,
  setPrimaryWallet,
  removeUserWallet,
  verifyWallet,
  
  // Marketing
  saveContact,
  saveToWaitinglist,
  saveToNewsletter,
  
  // Bookmarks
  bookmarkAsset,
  unbookmarkAsset,
  isBookmarked,
  getUserBookmarks,
} from '@/lib/db';
