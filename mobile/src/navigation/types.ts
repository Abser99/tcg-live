export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
};

export type AppStackParamList = {
  AuctionList: undefined;
  AuctionDetail: { auctionId: string };
  SellerProfile: { sellerId: string };
};

export type ProfileStackParamList = {
  ProfileHome: undefined;
  ApplySeller: undefined;
  AdminApplications: undefined;
  SellerDashboard: undefined;
  CreateAuction: undefined;
  ManageAuction: { auctionId: string };
  MyOrders: undefined;
  MyBids: undefined;
  ShippingSettings: undefined;
  AddressSettings: undefined;
  PaymentMethods: undefined;
  AuctionOrders: { auctionId: string; title: string };
};

export type TabParamList = {
  Auctions: undefined;
  Profile: undefined;
};
