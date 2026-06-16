export type ReservationStatus = "pending" | "confirmed" | "canceled" | "completed" | "no_show";
export type PaymentStatus = "unpaid" | "paid" | "refunded";
export type MemberStatus = "pending" | "approved" | "rejected";

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  address: string | null;
  role: "admin" | "user";
  membership_status: MemberStatus;
  consented_at: string | null;
  created_at: string;
};

export type Pass = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  seat_type_id?: string | null;
  is_active?: boolean;
  sort_order?: number;
};

export type SeatType = {
  id: string;
  name: string;
  capacity: number;
  is_active: boolean;
  sort_order: number;
  created_at?: string;
};

export type BusinessHour = {
  id: string;
  weekday: number;
  open_time: string;
  close_time: string;
  is_closed: boolean;
};

export type SpaceSetting = {
  key: string;
  value: string;
  updated_at?: string;
};

export type ReservationInquiry = {
  id: string;
  reservation_id: string | null;
  profile_id: string | null;
  body: string;
  admin_reply: string | null;
  replied_at: string | null;
  edited_at: string | null;
  created_at: string;
};

export type ReservationNotification = {
  id: string;
  profile_id: string | null;
  reservation_id: string | null;
  type: string;
  title: string;
  body: string;
  is_read: boolean;
  created_at: string;
};

export type ReservationAuditLog = {
  id: string;
  reservation_id: string;
  actor_id: string | null;
  action: string;
  before_status: ReservationStatus | null;
  after_status: ReservationStatus | null;
  before_payment_status: PaymentStatus | null;
  after_payment_status: PaymentStatus | null;
  before_admin_note: string | null;
  after_admin_note: string | null;
  created_at: string;
};

export type ReservationPaymentLog = {
  id: string;
  reservation_id: string;
  profile_id: string | null;
  actor_id: string | null;
  action: "confirm" | "refund";
  status: "requested" | "succeeded" | "failed" | "skipped";
  amount: number | null;
  provider: string;
  provider_code: string | null;
  message: string | null;
  created_at: string;
};

export type Reservation = {
  id: string;
  profile_id: string | null;
  pass_id: string | null;
  pass_name_snapshot: string | null;
  price_at_booking: number | null;
  seat_type_id: string | null;
  payment_method: string | null;
  payment_status: PaymentStatus | null;
  payment_key?: string | null;
  name: string;
  phone: string;
  email: string | null;
  pass_type: string;
  date: string;
  start_time: string | null;
  end_time: string | null;
  people: number;
  message: string | null;
  status: ReservationStatus;
  admin_note: string | null;
  created_at: string;
  deleted_at?: string | null;
};

export type ReservationInsert = {
  profile_id?: string | null;
  pass_id?: string | null;
  pass_name_snapshot?: string | null;
  price_at_booking?: number | null;
  seat_type_id?: string | null;
  payment_method?: string | null;
  payment_status?: PaymentStatus | null;
  name: string;
  phone: string;
  email?: string | null;
  pass_type: string;
  date: string;
  start_time: string;
  end_time: string;
  people: number;
  message: string;
  status?: ReservationStatus;
};

export type Attendance = {
  id: string;
  profile_id: string;
  reservation_id: string | null;
  check_in_at: string;
  check_out_at: string | null;
  created_at: string;
};

export type Coupon = {
  id: string;
  profile_id: string;
  code: string;
  label: string;
  status: "issued" | "used";
  issued_at: string;
  used_at: string | null;
};

export type CardAccent = "yellow" | "mint" | "lilac" | "sky" | "coral";

export type MemberCard = {
  id: string;
  profile_id: string;
  display_name: string;
  category: string;
  occupation: string | null;
  company: string | null;
  headline: string | null;
  bio: string | null;
  link_url: string | null;
  instagram: string | null;
  contact: string | null;
  accent: CardAccent;
  is_published: boolean;
  created_at: string;
  updated_at: string;
};

export type BoardPost = {
  id: string;
  profile_id: string | null;
  author_name: string;
  kind: "notice" | "message";
  body: string;
  color: CardAccent;
  is_pinned: boolean;
  is_hidden: boolean;
  created_at: string;
};

export type CheckInResult = {
  ok: boolean;
  code?: string;
  message?: string;
  already?: boolean;
  stamps?: number;
  goal?: number;
  coupon?: boolean;
};
