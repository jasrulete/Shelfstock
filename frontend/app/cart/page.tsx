import CartDrawer from '@/components/CartDrawer';

export default function CartPage() {
  return (
    <div className="max-w-2xl">
      <h1 className="mb-4 text-2xl font-bold">Your Cart</h1>
      <CartDrawer />
    </div>
  );
}
