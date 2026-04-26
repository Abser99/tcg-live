export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
};

export type AppStackParamList = {
  AuctionList: undefined;
  AuctionDetail: { auctionId: string };
};

export type ProfileStackParamList = {
  ProfileHome: undefined;
  ApplySeller: undefined;
  AdminApplications: undefined;
};

export type TabParamList = {
  Auctions: undefined;
  Profile: undefined;
};
