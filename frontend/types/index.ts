export interface Product {
  id: number;
  name: string;
  description: string | null;
  price: string;
  category: string;
  stock: number;
  image_url: string | null;
  created_at: string;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ProductsResponse {
  products: Product[];
  pagination: Pagination;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface User {
  id: number;
  email: string;
  role: 'customer' | 'admin';
}

export interface OrderItem {
  id: number;
  product_id: number;
  product_name: string;
  quantity: number;
  price_at_purchase: string;
}

export type OrderStatus = 'pending' | 'shipped' | 'completed' | 'cancelled';

export interface Order {
  id: number;
  user_id: number;
  total_amount: string;
  currency: string;
  status: OrderStatus;
  payment_method: string;
  shipping_name: string | null;
  shipping_phone: string | null;
  shipping_address: string | null;
  shipping_city: string | null;
  created_at: string;
  items: OrderItem[];
}

// Admin order list rows include the customer's email via a JOIN.
export interface AdminOrder extends Omit<Order, 'items'> {
  user_email: string;
}

export interface AdminOrdersResponse {
  orders: AdminOrder[];
  pagination: Pagination;
}

export type CurrencyCode = 'USD' | 'PHP' | 'EUR';
