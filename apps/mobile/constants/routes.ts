// apps/mobile/constants/routes.ts
// Typed route constants for expo-router.

export const Routes = {
  // Root
  home: "/" as const,

  // Auth
  authSplash: "/(auth)/splash" as const,
  authIntro: "/(auth)/intro" as const,
  authWelcomeIntro: "/(auth)/welcome-intro" as const,
  authSignin: "/(auth)/signin" as const,
  authSignup: "/(auth)/signup" as const,
  authVerify: "/(auth)/verify" as const,
  authCallback: "/(auth)/callback" as const,
  authTermsCookies: "/(auth)/terms-cookies" as const,
  authResetPassword: "/(auth)/reset-password" as const,
  authResetConfirm: "/(auth)/reset-confirm" as const,

  // Onboarding (personal + business)
  onboardingGetStarted: "/(onboarding-personal)/get-started" as const,
  onboardingGetStartedPersonal: "/(onboarding-personal)/get-started-personal" as const,
  onboardingWelcomePersonal: "/(onboarding-personal)/welcome-personal" as const,
  onboardingProfileCore: "/(onboarding-personal)/profile-core" as const,
  /** Post-auth mode gateway (tabs hub — avoid ambiguous `/mode-selection` legacy path). */
  modeSelection: "/(tabs)/mode-selection" as const,
  onboardingModeSelection: "/(tabs)/mode-selection" as const,
  onboardingWinklyWorld: "/(onboarding-personal)/winkly-world" as const,

  onboardingWelcomeBusiness: "/(onboarding-business)/welcome-business" as const,
  onboardingGetStartedBusiness: "/(onboarding-business)/get-started-business" as const,
  onboardingProfileBusiness: "/(onboarding-business)/profile-business" as const,

  // Shared UI
  sharedSearch: "/(shared-ui)/search" as const,
  sharedNotifications: "/(shared-ui)/notifications" as const,

  // Chats
  chats: "/chats" as const,
  chatsNew: "/chats/new-chat" as const,
  chatsFilters: "/chats/filters" as const,
  chatsStart: "/chats/start" as const,
  chatById: (conversationId: string) => `/chats/${conversationId}` as const,

  // Planner
  planner: "/planner" as const,
  plannerDates: "/planner/dates" as const,
  plannerEvents: "/planner/events" as const,
  plannerBusinessMeetings: "/planner/business-meetings" as const,
  plannerFriendsMeetups: "/planner/friends-meetups" as const,
  plannerInvitations: "/planner/invitations" as const,
  plannerFilters: "/planner/filters" as const,
  plannerSettings: "/planner/settings" as const,

  // Concierge
  concierge: "/concierge" as const,

  // Account
  account: "/account" as const,
  accountLanguage: "/account/language" as const,
  accountPrivacySafety: "/account/privacy-safety" as const,
  accountNotificationsPreferences: "/account/notifications-preferences" as const,
  accountInvite: "/account/invite" as const,
  accountSubscription: "/account/subscription" as const,
  accountPayments: "/account/payments" as const,
  accountPremium: "/account/premium" as const,
  accountAiMemory: "/account/ai-memory" as const,
  accountBlockedUsers: "/account/blocked-users" as const,
  accountPhotoVerification: "/account/photo-verification" as const,
  accountLegal: "/account/legal" as const,
  accountAppInfo: "/account/app-info" as const,
  accountDeleteDeactivate: "/account/delete-deactivate" as const,
  accountAccountIdentity: "/account/account-identity" as const,
  accountProfileSettings: "/account/profile-settings" as const,

  // Profile
  profile: "/profile" as const,
  profilePreview: "/profile/preview" as const,
  profileViewProfile: "/profile/view-profile" as const,
  profileEditCore: "/profile/edit-core" as const,
  profileEditFriends: "/profile/edit-friends" as const,
  profileEditRomance: "/profile/edit-romance" as const,
  profileEditBusiness: "/profile/edit-business" as const,
  profileEditMedia: "/profile/edit-media" as const,
  profileVerification: "/profile/verification" as const,

  // Groups
  groupsCreate: "/groups/create-group" as const,
  groupsInvitations: "/groups/invitations" as const,
  groupsGroupDetails: "/groups/group-details" as const,
  groupsEditGroup: "/groups/edit-group" as const,
  groupsMemberList: "/groups/member-list" as const,
  groupsGroupChat: "/groups/group-chat" as const,

  // Wishlist
  wishlist: "/wishlist" as const,
  wishlistCreate: "/wishlist/create" as const,
  wishlistDetails: "/wishlist/details" as const,
  wishlistEdit: "/wishlist/edit" as const,

  // Modes (entry points)
  modeRomance: "/(modes)/romance" as const,
  modeFriends: "/(modes)/friends" as const,
  modeBusiness: "/(modes)/business" as const,
  modeEvents: "/(modes)/events" as const,

  // Mode subroutes (common)
  modeRomanceDiscover: "/(modes)/romance/discover" as const,
  modeRomanceMatches: "/(modes)/romance/matches" as const,
  modeRomanceLiked: "/(modes)/romance/liked" as const,
  modeRomanceFilters: "/(modes)/romance/filters" as const,
  modeRomanceChats: "/(modes)/romance/chats" as const,
  modeRomancePlanner: "/(modes)/romance/planner" as const,
  modeRomanceProfileView: (id: string) => `/(modes)/romance/profile-view?id=${encodeURIComponent(id)}` as const,

  modeFriendsDiscover: "/(modes)/friends/discover" as const,
  modeFriendsFilters: "/(modes)/friends/filters" as const,
  modeFriendsChats: "/(modes)/friends/chats" as const,
  modeFriendsPlanner: "/(modes)/friends/planner" as const,
  modeFriendsProfileView: (userId: string) => `/(modes)/friends/profile-view?user_id=${encodeURIComponent(userId)}` as const,

  modeBusinessDiscover: "/(modes)/business/discover" as const,
  modeBusinessFilters: "/(modes)/business/filters" as const,
  modeBusinessChats: "/(modes)/business/chats" as const,
  modeBusinessPlanner: "/(modes)/business/planner" as const,
  modeBusinessProfileView: (userId: string) => `/(modes)/business/profile-view?user_id=${encodeURIComponent(userId)}` as const,
} as const;

export type AppRoute = (typeof Routes)[keyof typeof Routes] | ReturnType<(typeof Routes)["chatById"]>;

