export type ReservationStatus = "pending" | "confirmed" | "canceled" | "completed";
export type MemberStatus = "pending" | "approved" | "rejected";

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  address: string | null;
  role: "admin" | "user";
  membership_status: MemberStatus;
  created_at: string;
};

export type Pass = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  is_active?: boolean;
  sort_order?: number;
};

export type Reservation = {
  id: string;
  profile_id: string | null;
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
};

export type ReservationInsert = {
  profile_id?: string | null;
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
