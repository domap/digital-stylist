export type ApiProduct = {
  id: string;
  name: string;
  brand?: "AnnTaylor" | "Loft";
  price: number;
  category: string;
  occasion: string[];
  style: string[];
  sizes: string[];
  colors: string[];
  description: string;
  fit: string;
  imageAssetName: string;
};

export type ApiCustomer = {
  id: string;
  name: string;
  preferredEmail?: string;
  tier: string;
  preferredSize: string;
  preferredFit: string;
  stylePreferences: string[];
  colorPreferences: string[];
  upcomingEvents: { name: string; date: string }[];
  notes: string;
};

export type ChatTurn = { role: "assistant" | "user"; content: string };

export type RecommendedDisplayMode = "full_outfit" | "default";

export type ChatResponse = {
  reply: string;
  recommendedProductIds: string[];
  recommendedDisplayMode?: RecommendedDisplayMode;
  completeTheLookUrl?: string;
  quickReplies?: string[];
  agentTrace?: string[];
};

export type InventoryCheckRequest = {
  storeId: string;
  productIds: string[];
};

export type InventoryCheckResponse = {
  storeId: string;
  availability: { productId: string; inStock: boolean }[];
  canStageInStore: boolean;
  unavailableProductIds: string[];
};

export type CheckoutIntentRequest = {
  message: string;
  history: ChatTurn[];
  lastAssistantReply?: string;
};

export type CheckoutIntentResponse = {
  decision: "SHOW_SUMMARY" | "REFINE";
  confidence: number;
  reason: string;
};

export type FittingRoomReserveRequest = {
  storeId: string;
  slotLabel: string;
  customerId?: string;
  productIds: string[];
  source?: "connect" | "clienteling";
};

export type FittingRoomReserveResponse = {
  reservationId: string;
  slotLabel: string;
  storeId: string;
  totalCost: number;
  notificationChannels: ("email" | "sms")[];
  message: string;
};

export type OtpStartRequest = { email: string };
export type OtpStartResponse = { ok: true; channels: ("email" | "sms")[]; expiresInSec: number; code?: string };

export type OtpVerifyRequest = { email: string; code: string };
export type OtpVerifyResponse = { ok: true; customerId: string; name: string };
