'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import axios from 'axios';
import { emailValidationRules } from '@/lib/validation-rules';
import { Button } from '@/components/ui/button';
import { LightRays } from "@/ui/components/light-rays"


export default function NewsletterForm({ title, description }: { title?: string; description?: string }) {
  const { register, handleSubmit, formState: { errors, isValid }, reset } = useForm<{ email: string }>({
    mode: 'onBlur' // Validate on blur for better UX
  });
  const [status, setStatus] = useState('');

  const onSubmit = async (data: { email: string }) => {
    try {
      const response = await axios.post('/api/subscribe', data);
      setStatus(response.data.message);
      reset();
    } catch (error: unknown) {
      const errorMessage = (error as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to subscribe';
      setStatus(errorMessage);
    }
  };

  return (
    <div className="py-16 sm:py-24 bg-black">
      <div className="mx-auto max-w-7xl sm:px-6 lg:px-8">
        <div className="border relative isolate overflow-hidden px-6 py-24 shadow-2xl sm:rounded-3xl sm:px-24 xl:py-32 dark:shadow-none dark:after:pointer-events-none">
          <h2 className="mx-auto max-w-3xl text-center text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            {title || 'Get notified when we’re launching'}
          </h2>
          <p className="mx-auto mt-6 max-w-lg text-center text-lg text-gray-300">
            {description || 'Reprehenderit ad esse et non officia in nulla. Id proident tempor incididunt nostrud nulla et culpa.'}
          </p>
          <form onSubmit={handleSubmit(onSubmit)} className="mx-auto mt-10 flex max-w-md gap-x-4">
            <label htmlFor="email-address" className="sr-only">
              Email address
            </label>
             <div className="flex-1">
               <input
                 id="email-address"
                 {...register('email', emailValidationRules)}
                 type="email"
                 placeholder="Enter your email"
                 autoComplete="email"
                 className={`w-full rounded-md bg-white/5 px-3.5 py-2 text-base text-white outline-1 -outline-offset-1 outline-white/10 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-500 sm:text-sm/6 dark:outline-white/20 transition-colors duration-200 ${
                   errors.email 
                     ? 'border-red-500 focus:outline-red-500' 
                     : isValid && !errors.email 
                       ? 'border-green-500 focus:outline-green-500' 
                       : 'border-transparent'
                 }`}
               />
             </div>
            <Button
              type="submit"
              disabled={!isValid || Object.keys(errors).length > 0}
              variant={isValid && !errors.email ? 'default' : 'secondary'}
              className="flex-shrink-0 bg-green-600 hover:bg-green-700 text-white"
            >
              {isValid && !errors.email ? '✓ Ready' : 'Notify me'}
            </Button>
           </form>
           {errors.email && (
             <p className="mt-2 text-center text-sm text-red-400">
               {errors.email.message}
             </p>
           )}
           {status && <p className="mt-4 text-center text-white">{status}</p>}
          <LightRays />
        </div>
      </div>
    </div>
  );
}
