import LoginForm from '@/components/LoginForm';

export default function AdminLoginPage() {
  return (
    <LoginForm
      title="Admin Portal Login"
      subtitle="Secure access for platform administrators"
      expectedRole="admin"
      theme={{
        gradientFrom: 'from-emerald-600',
        gradientTo: 'to-teal-600',
        buttonHoverFrom: 'from-emerald-500',
        buttonHoverTo: 'to-teal-500',
        shadowColor: 'shadow-emerald-500/25',
        ringColor: 'focus:ring-emerald-500/50 focus:border-emerald-500/50',
        bgColor1: 'bg-emerald-600/10',
        bgColor2: 'bg-teal-500/8',
      }}
    />
  );
}
