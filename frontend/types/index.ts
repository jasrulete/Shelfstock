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

export interface Order {
  id: number;
  user_id: number;
  total_amount: string;
  currency: string;
  status: string;
  created_at: string;
  items: OrderItem[];
}

export type CurrencyCode = 'USD' | 'PHP' | 'EUR';
