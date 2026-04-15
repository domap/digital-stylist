export type InteractionMode = "associate_led" | "customer_led";
export type ConversationChannel = "associate_console" | "customer_app";
export type ClientMode = "clienteling" | "customer_led";

export interface ApiProduct {
  id: string;
  name: string;
  brand?: "AnnTaylor" | "Loft";
  imageAssetName: string;
  price: number;
  category: string;
  occasion: string[];
  style: string[];
  sizes: string[];
  colors: string[];
  description: string;
  fit: string;
}

export interface ApiCustomer {
  id: string;
  name: string;
  preferredEmail?: string;
  tier: "Silver" | "Gold" | "Platinum";
  preferredSize: string;
  preferredFit: string;
  stylePreferences: string[];
  colorPreferences: string[];
  upcomingEvents: { name: string; date: string }[];
  notes: string;
}

export interface ChatTurn {
  role: "assistant" | "user";
  content: string;
}

export type AppointmentBrand = "AnnTaylor" | "Loft";

export interface AppointmentSlot {
  stylist_id: string;
  name: string;
  brand: AppointmentBrand;
  store_name?: string;
  store_city?: string;
  date: string;
  time_slot: string;
  is_booked: boolean;
}

export interface SuggestionBlock {
  message: string;
  next_3_available_dates: string[];
}

export interface AppointmentPayload {
  mode: "first_available_booked" | "slot_options" | "booking_confirmed" | "no_availability";
  brand: AppointmentBrand;
  customer_id?: string;
  associate_note?: string;
  booked_slot?: AppointmentSlot;
  available_slots?: AppointmentSlot[];
  suggestion_block?: SuggestionBlock;
}

export interface AppointmentContext {
  action: "request_first_available" | "list_available_slots" | "book_appointment";
  brand?: AppointmentBrand;
  stylist_id?: string;
  slot?: {
    date: string;
    time_slot: string;
  };
  date_range?: {
    start: string;
    end: string;
  };
}

export interface ChatRequest {
  message: string;
  channel: ConversationChannel;
  mode?: ClientMode;
  customerId?: string;
  sessionId?: string;
  history?: ChatTurn[];
  appointmentContext?: AppointmentContext;
  context?: {
    source?: "connect_pdp" | "connect_chat" | "clienteling" | string;
    productId?: string;
  };
}

export type RecommendedDisplayMode = "full_outfit" | "default";

export interface ChatResponse {
  reply: string;
  recommendedProductIds: string[];
  /** When full_outfit, clients show every recommended SKU as cards (occasion / head-to-toe). */
  recommendedDisplayMode?: RecommendedDisplayMode;
  agentTrace: string[];
  /** When COMPLETE_THE_LOOK_APP_URL is set, link to external outfit / canvas app. */
  completeTheLookUrl?: string;
  appointment?: AppointmentPayload;
  /** Associate mode: tap-to-send lines for this assistant turn (e.g. answers to a clarification question). */
  quickReplies?: string[];
  /** Associate mode: refreshed chip prompts based on the latest thread (shown above the composer). */
  contextualSuggestions?: string[];
}

export interface InitialSuggestionResponse {
  suggestions: string[];
}

/** POST /api/v1/stylist/thread-suggestions — associate chips from chat history. */
export interface ThreadSuggestionResponse {
  suggestions: string[];
}
