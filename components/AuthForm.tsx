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
  const formSchema = authFormSchema(type);
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: '', email: '', password: '' },
  });

  const onSubmit = async (data: z.infer<typeof formSchema>) => {
    try {
      if (type === 'sign-up') {
        // ───── SIGN-UP FLOW ─────
        const { name, email, password } = data;

        // 1️⃣ Create Firebase user
        const userCredential = await createUserWithEmailAndPassword(
          auth,
          email,
          password
        );

        // 2️⃣ Persist to your backend
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

        // 3️⃣ On success, hard-redirect to resume app
        console.log('[AuthForm] signup succeeded, redirecting…');
        const target =
          process.env.NEXT_PUBLIC_RESUME_APP_URL ||
          'http://35.207.218.80/resume_app/';
        if (typeof window !== 'undefined') {
          window.location.assign(target);
        }
        return;
      }

      // ───── SIGN-IN FLOW ─────
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
        <div className="flex flex-row gap-2 justify-center">
          <Image src="/logo.svg" alt="logo" height={32} width={38} />
          <h2 className="text-primary-100">Intellecto</h2>
        </div>

        <h3>
          Your AI-powered interview buddy that preps, grills, and levels you
          up—before the real deal.
        </h3>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="w-full space-y-6 mt-4 form"
          >
            {!isSignIn && (
              <FormField
                control={form.control}
                name="name"
                label="Name"
                placeholder="Your Name"
                type="text"
              />
            )}

            <FormField
              control={form.control}
              name="email"
              label="Email"
              placeholder="Your email address"
              type="email"
            />

            <FormField
              control={form.control}
              name="password"
              label="Password"
              placeholder="Enter your password"
              type="password"
            />

            <Button className="btn" type="submit">
              {isSignIn ? 'Sign In' : 'Create an Account'}
            </Button>
          </form>
        </Form>

        <p className="text-center">
          {isSignIn ? 'No account yet?' : 'Have an account already?'}{' '}
          <Link
            href={isSignIn ? '/sign-up' : '/sign-in'}
            className="font-bold text-user-primary ml-1"
          >
            {isSignIn ? 'Sign Up' : 'Sign In'}
          </Link>
        </p>
      </div>
    </div>
  );
}
