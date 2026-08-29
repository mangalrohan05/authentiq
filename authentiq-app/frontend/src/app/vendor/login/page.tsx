import LoginForm from '@/components/LoginForm';

export default function VendorLoginPage() {
  return (
    <LoginForm
      title="Vendor Portal Login"
      subtitle="Sign in to manage your product batches"
      expectedRole="vendor"
      theme={{
        gradientFrom: 'from-green-500',
        gradientTo: 'to-emerald-600',
        buttonHoverFrom: 'from-green-400',
        buttonHoverTo: 'to-emerald-500',
        shadowColor: 'shadow-green-500/25',
        ringColor: 'focus:ring-green-500/50 focus:border-green-500/50',
        bgColor1: 'bg-green-500/10',
        bgColor2: 'bg-emerald-600/8',
      }}
    />
  );
}
