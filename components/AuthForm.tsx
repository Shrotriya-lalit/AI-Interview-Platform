'use client';

import { z } from 'zod';
import Link from 'next/link';
import Image from 'next/image';
import { toast } from 'sonner';
import { auth } from '@/firebase/client';
import { useForm } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import { Form } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { signIn, signUp } from '@/lib/actions/auth.action';
import FormField from './FormField';

type FormType = 'sign-in' | 'sign-up';

const authFormSchema = (type: FormType) =>
  z.object({
    name: type === 'sign-up' ? z.string().min(3) : z.string().optional(),
    email: z.string().email(),
    password: z.string().min(3),
  });

export default function AuthForm({ type }: { type: FormType }) {
  const router = useRouter();
  const form = useForm<z.infer<typeof authFormSchema>>( {
    resolver: zodResolver(authFormSchema(type)),
    defaultValues: { name: '', email: '', password: '' },
  });

  const onSubmit = async (data: z.infer<typeof authFormSchema>) => {
    try {
      if (type === 'sign-up') {
        const { name, email, password } = data;

        // 1️⃣ Create in Firebase Auth
        const userCredential = await createUserWithEmailAndPassword(
          auth,
          email,
          password
        );

        // 2️⃣ Save to your DB
        const result = await signUp({
          uid: userCredential.user.uid,
          name: name!,
          email,
          password,
        });

        if (!result.success) {
          toast.error(result.message);
          return;
        }

        // 3️⃣ Success!  
        console.log('[AuthForm] signup succeeded — redirecting…');
        const target = process.env.NEXT_PUBLIC_RESUME_APP_URL!;
        
        // Try router.replace first (supports full URLs), then fallback
        try {
          router.replace(target);
        } catch {
          window.location.assign(target);
        }
        return;
      }

      // ——— sign-in branch unchanged ———
      const { email, password } = data;
      const userCredential = await signInWithEmailAndPassword(
        auth,
        email,
        password
      );
      const idToken = await userCredential.user.getIdToken();
      if (!idToken) {
        toast.error('Sign in failed. Please try again.');
        return;
      }
      await signIn({ email, idToken });
      toast.success('Signed in successfully.');
      router.push('/');
    } catch (err: any) {
      console.error('[AuthForm] error:', err);
      toast.error(err.message || 'There was an error.');
    }
  };

  const isSignIn = type === 'sign-in';

  return (
    <div className="card-border lg:min-w-[566px]">
      <div className="flex flex-col gap-6 card py-14 px-10">
        {/* … rest of your JSX unchanged … */}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="w-full space-y-6 mt-4 form">
            {/* name/email/password fields */}
            <Button type="submit" className="btn">
              {isSignIn ? 'Sign In' : 'Create an Account'}
            </Button>
          </form>
        </Form>
        {/* switch link */}
      </div>
    </div>
  );
}
