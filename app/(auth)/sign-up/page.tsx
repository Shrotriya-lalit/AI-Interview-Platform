// app/(auth)/sign-up/page.tsx
'use client';

import React from 'react';
import AuthForm from '@/components/AuthForm';

export default function SignUpPage() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <AuthForm type="sign-up" />
    </div>
  );
}
