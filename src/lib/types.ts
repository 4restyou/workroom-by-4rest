export type ReservationStatus = "pending" | "confirmed" | "canceled" | "completed";

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
